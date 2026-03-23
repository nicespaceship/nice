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
   * @param {Object} bp - Blueprint with stats & config
   * @returns {Object} LLM params + model
   */
  function forBlueprint(bp) {
    const params = fromStats(bp.stats || {});
    params.model = (bp.config && bp.config.llm_engine) || 'claude-haiku-4-5-20251001';
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
