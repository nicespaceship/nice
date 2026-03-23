/* ═══════════════════════════════════════════════════════════════════
   NICE — Rate Limiter (Client-Side)
   Sliding-window rate limiting for LLM calls, DB writes, and auth.
═══════════════════════════════════════════════════════════════════ */

const RateLimiter = (() => {
  const _windows = new Map();
  const _limits = {
    'llm':      60,   // 60 per minute
    'db-write': 120,  // 120 per minute
    'auth':     10,   // 10 per minute
  };

  const WINDOW_MS = 60000; // 1 minute sliding window

  /**
   * Check if an action is allowed under the rate limit.
   * @param {string} key — rate limit category (e.g. 'llm', 'db-write', 'auth')
   * @param {number} [maxPerMinute] — override limit for this call
   * @returns {boolean} true if allowed, false if rate limited
   */
  function check(key, maxPerMinute) {
    const limit = maxPerMinute || _limits[key] || 60;
    const now = Date.now();

    if (!_windows.has(key)) _windows.set(key, []);
    const timestamps = _windows.get(key);

    // Prune timestamps outside the sliding window
    const cutoff = now - WINDOW_MS;
    while (timestamps.length && timestamps[0] < cutoff) {
      timestamps.shift();
    }

    if (timestamps.length >= limit) {
      return false;
    }

    timestamps.push(now);
    return true;
  }

  /**
   * Reset rate limit window for a key.
   * @param {string} key
   */
  function reset(key) {
    _windows.delete(key);
  }

  /**
   * Configure the default limit for a key.
   * @param {string} key
   * @param {number} limit — max requests per minute
   */
  function configure(key, limit) {
    _limits[key] = limit;
  }

  return { check, reset, configure };
})();
