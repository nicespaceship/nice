/* ═══════════════════════════════════════════════════════════════════
   NICE — Model Intelligence
   Tracks per-blueprint LLM model performance and auto-selects the
   optimal model based on mission history.
═══════════════════════════════════════════════════════════════════ */

const ModelIntel = (() => {
  const STORAGE_KEY = Utils.KEYS.modelIntel;
  const MIN_RUNS = 3; // minimum runs before a model gets a real score
  const EXPLORE_SCORE = 0.5; // score for under-explored models

  let _data = {};

  /* ── Init: hydrate from localStorage ── */
  function init() {
    try { _data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { _data = {}; }
  }

  function _save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_data)); } catch { /* quota */ }
  }

  function _ensure(bpId) {
    if (!_data[bpId]) _data[bpId] = { models: {}, preferredModel: null };
    return _data[bpId];
  }

  /* ── Log a mission outcome ── */
  function log(bpId, modelId, { success = true, speedMs = 0, costTokens = 0 } = {}) {
    if (!bpId || !modelId) return;
    const profile = _ensure(bpId);
    if (!profile.models[modelId]) {
      profile.models[modelId] = { runs: 0, successes: 0, totalSpeed: 0, totalCost: 0, lastUsed: null };
    }
    const m = profile.models[modelId];
    m.runs++;
    if (success) m.successes++;
    m.totalSpeed += (speedMs / 1000); // store as seconds
    m.totalCost += costTokens;
    m.lastUsed = new Date().toISOString();
    _save();

    // Check milestones
    const totalRuns = Object.values(profile.models).reduce((sum, d) => sum + d.runs, 0);
    if (totalRuns === 10 && typeof Gamification !== 'undefined') {
      Gamification.addXP('model_intel_milestone');
    }
  }

  /* ── Auto-select best model ── */
  function bestModel(bpId, connectedProviderIds) {
    if (!bpId) return null;
    const profile = _data[bpId];
    const providers = connectedProviderIds || [];

    // Get available models (from connected providers)
    const available = (typeof LLM_MODELS !== 'undefined' ? LLM_MODELS : [])
      .filter(m => providers.includes(m.provider));

    if (!available.length) return null;

    // If user pinned a model and it's available, use it
    if (profile?.preferredModel) {
      const pinned = available.find(m => m.id === profile.preferredModel);
      if (pinned) return pinned.id;
    }

    // Score each available model
    if (!profile || !Object.keys(profile.models).length) {
      return available[0].id; // no data yet, use first available
    }

    // Gather stats for normalization
    const entries = available.map(m => {
      const data = profile.models[m.id];
      if (!data || data.runs < MIN_RUNS) return { id: m.id, score: EXPLORE_SCORE, runs: data?.runs || 0 };

      const successRate = data.successes / data.runs;
      const avgSpeed = data.totalSpeed / data.runs;
      const avgCost = data.totalCost / data.runs;
      return { id: m.id, successRate, avgSpeed, avgCost, runs: data.runs };
    });

    // Find max speed/cost for normalization (among models with enough data)
    const scored = entries.filter(e => e.runs >= MIN_RUNS);
    if (!scored.length) {
      // No model has enough runs — pick the one with most runs, or first available
      const best = entries.sort((a, b) => b.runs - a.runs)[0];
      return best.id;
    }

    const maxSpeed = Math.max(...scored.map(e => e.avgSpeed), 0.001);
    const maxCost = Math.max(...scored.map(e => e.avgCost), 0.001);

    // Compute final score
    const results = entries.map(e => {
      if (e.runs < MIN_RUNS) return { id: e.id, score: EXPLORE_SCORE };
      const speedScore = 1 - (e.avgSpeed / maxSpeed);
      const costScore = 1 - (e.avgCost / maxCost);
      const score = (e.successRate * 0.6) + (speedScore * 0.2) + (costScore * 0.2);
      return { id: e.id, score };
    });

    results.sort((a, b) => b.score - a.score);
    return results[0].id;
  }

  /* ── Get profile for UI display ── */
  function getProfile(bpId) {
    return _data[bpId] || null;
  }

  /* ── Pin/unpin a model ── */
  function setPreference(bpId, modelId) {
    const profile = _ensure(bpId);
    profile.preferredModel = modelId || null;
    _save();
  }

  function getPreference(bpId) {
    return _data[bpId]?.preferredModel || null;
  }

  /* ── Reset intel for a blueprint ── */
  function reset(bpId) {
    delete _data[bpId];
    _save();
  }

  // Auto-init
  init();

  return { log, bestModel, getProfile, setPreference, getPreference, reset, init };
})();
