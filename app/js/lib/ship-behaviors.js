/* ═══════════════════════════════════════════════════════════════════
   NICE — Ship Behaviors
   Per-spaceship behavior configuration (approval mode, budgets,
   concurrency, notifications). Persisted to localStorage.
═══════════════════════════════════════════════════════════════════ */

const ShipBehaviors = (() => {
  const _STORAGE_KEY = 'nice-ship-behaviors';

  const _DEFAULTS = {
    approvalMode:     'review',   // 'review' | 'autonomous' | 'draft'
    autoRun:          false,      // auto-trigger missions on events
    dailyBudget:      0,          // max tokens per day (0 = unlimited)
    budgetUsedToday:  0,          // tokens consumed today
    budgetResetAt:    null,       // ISO timestamp — when to reset daily budget
    maxConcurrent:    3,          // max simultaneous missions
    notifyOnComplete: true,       // push notification when mission done
    notifyOnFail:     true,       // push notification on failure
  };

  /* ── Persistence helpers ── */

  function _loadAll() {
    try { return JSON.parse(localStorage.getItem(_STORAGE_KEY) || '{}'); } catch (e) { return {}; }
  }

  function _saveAll(map) {
    try { localStorage.setItem(_STORAGE_KEY, JSON.stringify(map)); } catch (e) { /* quota */ }
  }

  /* ── Public API ── */

  /**
   * Return the full behavior config for a ship, merged with defaults.
   * @param {string} shipId
   * @returns {object}
   */
  function getBehaviors(shipId) {
    const all = _loadAll();
    return Object.assign({}, _DEFAULTS, all[shipId] || {});
  }

  /**
   * Set a single behavior key for a ship.
   * @param {string} shipId
   * @param {string} key
   * @param {*} value
   */
  function setBehavior(shipId, key, value) {
    const all = _loadAll();
    if (!all[shipId]) all[shipId] = {};
    all[shipId][key] = value;
    _saveAll(all);
  }

  /**
   * Check whether a ship is under its daily token budget.
   * Returns true if no budget is set (0 = unlimited) or usage is within limit.
   * @param {string} shipId
   * @param {number} estimatedTokens — tokens the next operation will consume
   * @returns {boolean}
   */
  function checkBudget(shipId, estimatedTokens) {
    const b = getBehaviors(shipId);
    _maybeResetBudget(shipId, b);
    if (!b.dailyBudget || b.dailyBudget <= 0) return true; // unlimited
    return (b.budgetUsedToday + (estimatedTokens || 0)) <= b.dailyBudget;
  }

  /**
   * Record token usage against the ship's daily budget.
   * @param {string} shipId
   * @param {number} tokens
   */
  function deductBudget(shipId, tokens) {
    if (!tokens || tokens <= 0) return;
    const all = _loadAll();
    if (!all[shipId]) all[shipId] = {};
    const b = Object.assign({}, _DEFAULTS, all[shipId]);
    _maybeResetBudgetInPlace(all, shipId, b);
    all[shipId].budgetUsedToday = (b.budgetUsedToday || 0) + tokens;
    // Ensure resetAt is set when budget tracking begins
    if (!all[shipId].budgetResetAt) {
      all[shipId].budgetResetAt = _nextMidnight().toISOString();
    }
    _saveAll(all);
  }

  /**
   * Reset daily budgets for ALL ships. Intended to be called at midnight
   * (e.g. from a scheduler or on app init when the day has changed).
   */
  function resetDailyBudgets() {
    const all = _loadAll();
    const now = new Date();
    for (const shipId of Object.keys(all)) {
      all[shipId].budgetUsedToday = 0;
      all[shipId].budgetResetAt = _nextMidnight(now).toISOString();
    }
    _saveAll(all);
  }

  /* ── Internal helpers ── */

  /** If the reset timestamp has passed, zero-out usage for this ship. */
  function _maybeResetBudget(shipId, behaviors) {
    if (!behaviors.budgetResetAt) return;
    if (new Date() >= new Date(behaviors.budgetResetAt)) {
      const all = _loadAll();
      if (!all[shipId]) all[shipId] = {};
      all[shipId].budgetUsedToday = 0;
      all[shipId].budgetResetAt = _nextMidnight().toISOString();
      _saveAll(all);
      behaviors.budgetUsedToday = 0;
      behaviors.budgetResetAt = all[shipId].budgetResetAt;
    }
  }

  /** Same as _maybeResetBudget but operates on an already-loaded map (avoids double read). */
  function _maybeResetBudgetInPlace(all, shipId, behaviors) {
    if (!behaviors.budgetResetAt) return;
    if (new Date() >= new Date(behaviors.budgetResetAt)) {
      if (!all[shipId]) all[shipId] = {};
      all[shipId].budgetUsedToday = 0;
      all[shipId].budgetResetAt = _nextMidnight().toISOString();
      behaviors.budgetUsedToday = 0;
    }
  }

  /** Returns a Date for the next midnight (local time). */
  function _nextMidnight(from) {
    const d = from ? new Date(from) : new Date();
    d.setHours(24, 0, 0, 0);
    return d;
  }

  return {
    getBehaviors,
    setBehavior,
    checkBudget,
    deductBudget,
    resetDailyBudgets,
    DEFAULTS: Object.freeze({ ..._DEFAULTS }),
  };
})();
