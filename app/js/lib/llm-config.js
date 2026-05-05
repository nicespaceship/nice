/* ═══════════════════════════════════════════════════════════════════
   NICE — LLM Config
   Maps blueprint stats to functional LLM parameters.
═══════════════════════════════════════════════════════════════════ */

const LLMConfig = (() => {

  // Ordered capability ladder — most to least capable.
  // Used to build per-call fallback chains: if the primary model is overloaded,
  // we walk down to the next model the user has enabled.
  // noTools: true — provider tool-use schema not compatible; strip tools on fallback.
  const CAPABILITY_CHAIN = [
    { id: 'claude-opus-4-7',   tier: 'premium',  noTools: false },
    { id: 'gpt-5-4-pro',       tier: 'premium',  noTools: false },
    { id: 'gemini-2-5-pro',    tier: 'premium',  noTools: false },
    { id: 'claude-sonnet-4-6', tier: 'standard', noTools: false },
    { id: 'gpt-5-mini',        tier: 'standard', noTools: false },
    { id: 'grok',              tier: 'standard', noTools: true  },
    { id: 'llama-4-scout',     tier: 'standard', noTools: true  },
    { id: 'gemini-2-5-flash',  tier: 'free',     noTools: false },
  ];

  // Returns ordered fallback entries for a given primary model.
  // Only includes models the user has enabled; gemini-2-5-flash always included last.
  function buildFallbackChain(primaryModel, enabledModels) {
    const enabled = enabledModels && typeof enabledModels === 'object'
      ? Object.keys(enabledModels).filter(k => enabledModels[k])
      : [];
    const idx = CAPABILITY_CHAIN.findIndex(m => m.id === primaryModel);
    return CAPABILITY_CHAIN
      .slice(idx >= 0 ? idx + 1 : 0)
      .filter(m => m.id === 'gemini-2-5-flash' || enabled.includes(m.id));
  }

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

    // Model selection — model_profile.preferred wins, then llm_engine.
    // For nice-auto, ask ModelIntel; if it returns nothing, fall back to
    // model_profile.fallback (NOT a hardcoded premium default — that would
    // silently upgrade free-tier agents to premium models).
    // Default model is the always-free Gemini 2.5 Flash so an agent
    // without an explicit profile can never accidentally drain a paid
    // pool. Premium models must be set explicitly via model_profile.
    let model = (profile && profile.preferred) || cfg.llm_engine || 'gemini-2-5-flash';
    if (model === 'nice-auto') {
      let learned = null;
      if (typeof ModelIntel !== 'undefined') {
        const enabled = (typeof State !== 'undefined' && State.get('enabled_models')) || {};
        const connected = Object.keys(enabled).filter(k => enabled[k]);
        learned = ModelIntel.bestModel(bp && bp.id, connected);
      }
      model = learned || (profile && profile.fallback) || 'gemini-2-5-flash';
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

    // Overload fallback chain — ordered list of models to retry if the primary
    // is unavailable (503/429). Filtered to the user's enabled models so we
    // never silently charge a pool the user hasn't subscribed to.
    const enabledModels = (typeof State !== 'undefined' && State.get('enabled_models')) || {};
    params.fallbackChain = buildFallbackChain(model, enabledModels);

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

  return { fromStats, forBlueprint, buildFallbackChain, CAPABILITY_CHAIN };
})();
