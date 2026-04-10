/* ═══════════════════════════════════════════════════════════════════
   NICE — LLM Config
   Maps blueprint stats to functional LLM parameters.
═══════════════════════════════════════════════════════════════════ */

const LLMConfig = (() => {
  /**
   * Convert numeric stats (0-100) to LLM request parameters.
   * @param {Object} stats  - { spd, acc, cap, pwr } each 0-100
   * @returns {Object} { stream, temperature, max_tokens, rate_limit }
   */
  function fromStats(stats) {
    const spd = _num(stats.spd);
    const acc = _num(stats.acc);
    const pwr = _num(stats.pwr);
    const cap = _num(stats.cap);

    return {
      stream:      spd >= 60,
      temperature: Math.max(0.1, Math.min(0.9, +(1 - acc / 100).toFixed(2))),
      max_tokens:  Math.round(512 + (pwr / 100) * 7680),
      rate_limit:  Math.round((cap / 100) * 60),
    };
  }

  /**
   * Full config from a blueprint object.
   *
   * Resolution order for model + params:
   *   1. blueprint.config.model_profile (preferred — explicit declaration)
   *   2. blueprint.config.llm_engine    (legacy — single field)
   *   3. blueprint.stats                (cosmetic — derived envelope)
   *
   * @param {Object} bp - Blueprint with stats & config
   * @returns {Object} { model, fallback?, temperature, max_tokens, stream, rate_limit, tier? }
   */
  function forBlueprint(bp) {
    const params = fromStats((bp && bp.stats) || {});
    const cfg = (bp && bp.config) || {};
    const profile = cfg.model_profile || null;

    // Model selection — model_profile.preferred wins, then llm_engine
    let model = (profile && profile.preferred) || cfg.llm_engine || 'claude-haiku-4-5-20251001';
    if (model === 'nice-auto' && typeof ModelIntel !== 'undefined') {
      const enabled = (typeof State !== 'undefined' && State.get('enabled_models')) || {};
      const connected = Object.keys(enabled).filter(k => enabled[k]);
      model = ModelIntel.bestModel(bp && bp.id, connected) || 'claude-haiku-4-5-20251001';
    }
    params.model = model;

    // model_profile overrides — explicit values trump stat-derived envelope
    if (profile) {
      if (profile.fallback) params.fallback = profile.fallback;
      if (typeof profile.temperature === 'number') {
        params.temperature = Math.max(0, Math.min(2, profile.temperature));
      }
      if (typeof profile.max_output_tokens === 'number' && profile.max_output_tokens > 0) {
        params.max_tokens = Math.round(profile.max_output_tokens);
      }
      if (profile.tier) params.tier = profile.tier;
    }

    return params;
  }

  /**
   * Parse stat strings (e.g. "4.2s", "94%", "2K", "82") to 0-100 numeric.
   * Blueprint stats come as display strings — normalize them.
   */
  function _num(val) {
    if (typeof val === 'number') return Math.max(0, Math.min(100, val));
    if (!val) return 50;
    const s = String(val).replace(/[%s]/g, '');
    if (s === '∞' || s === '&#8734;') return 100;
    // Handle K/M suffixes
    if (/\d+K$/i.test(s)) return Math.min(100, parseFloat(s) * 1000 / 100);
    if (/\d+M$/i.test(s)) return 100;
    // Handle "50/mo" style
    if (/\/mo/i.test(s)) return Math.min(100, parseFloat(s));
    const n = parseFloat(s);
    return isNaN(n) ? 50 : Math.max(0, Math.min(100, n));
  }

  return { fromStats, forBlueprint };
})();
