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

    return params;
  }

  /* ── Fallback detection ──
     Compares the requested model id against the one the server actually
     used. When they belong to different families (e.g. claude-opus →
     gemini-flash) we treat it as a downgrade and report it once per
     session. Same family with a revision bump (claude-opus-4-6 vs
     claude-opus-4-6-20251022) is NOT a fallback — we strip trailing
     version/date tokens before comparing. `nice-auto` is never a
     fallback: resolving the best available model is the whole point. */

  function _familyKey(id) {
    if (!id) return '';
    const s = String(id).toLowerCase()
      .replace(/\./g, '-')
      .replace(/-latest$/, '')
      .replace(/-\d{8}$/, '');
    return s.split('-').filter(function(p) {
      return p && !/^\d+(\-\d+)*$/.test(p);
    }).join('-');
  }

  function detectFallback(requested, actual) {
    const reqKey = _familyKey(requested);
    const actKey = _familyKey(actual);
    const humanize = (typeof BlueprintUtils !== 'undefined' && BlueprintUtils.humanizeModel)
      ? BlueprintUtils.humanizeModel
      : function(id) { return id || ''; };
    const downgraded = !!(
      reqKey && actKey &&
      reqKey !== 'nice-auto' &&
      reqKey !== actKey
    );
    return {
      downgraded: downgraded,
      requested: requested || '',
      actual: actual || '',
      requestedKey: reqKey,
      actualKey: actKey,
      requestedLabel: humanize(requested),
      actualLabel: humanize(actual),
    };
  }

  const _reported = new Set();
  function reportFallback(requested, actual) {
    const result = detectFallback(requested, actual);
    if (!result.downgraded) return result;
    const key = result.requestedKey + '>' + result.actualKey;
    if (_reported.has(key)) return result;
    _reported.add(key);
    if (typeof Notify !== 'undefined' && typeof Notify.send === 'function') {
      Notify.send({
        type:    'system',
        title:   'Model fallback',
        message: 'Using ' + result.actualLabel + ' instead of ' + result.requestedLabel + '.',
      });
    }
    return result;
  }

  /* Test hook — reset dedup cache. Not part of the public runtime API. */
  function _resetFallbackCache() { _reported.clear(); }

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

  return { fromStats, forBlueprint, detectFallback, reportFallback, _resetFallbackCache };
})();
