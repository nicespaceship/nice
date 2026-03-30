/* ═══════════════════════════════════════════════════════════════════
   NICE — Audit Log (Captain's Log)
   Persistent event logging for tracking user actions.
═══════════════════════════════════════════════════════════════════ */

const AuditLog = (() => {
  const STORAGE_KEY = Utils.KEYS.auditLog;
  const MAX_ENTRIES = 500;

  /**
   * Log an event.
   * @param {string} action — category: navigation|agent|mission|spaceship|system|auth
   * @param {object} details — { description, name, path, etc. }
   */
  function log(action, details) {
    const entries = _getAll();
    const entry = {
      id: _uid(),
      action: action,
      details: details || {},
      timestamp: new Date().toISOString(),
    };
    entries.push(entry);

    // FIFO: keep only most recent MAX_ENTRIES
    while (entries.length > MAX_ENTRIES) entries.shift();

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
      // localStorage full — trim harder
      entries.splice(0, 100);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    }

    // Persist to Supabase audit_log table (non-blocking, best-effort).
    // Note: audit_log entries older than 90 days should be pruned server-side.
    try {
      if (typeof SB !== 'undefined' && SB.isReady()) {
        const user = typeof State !== 'undefined' ? State.get('user') : null;
        SB.db('audit_log').create({
          user_id:     user ? user.id : null,
          type:        action,
          description: (details && details.description) || '',
          metadata:    details || {},
          created_at:  entry.timestamp,
        }).catch(() => { /* don't block on DB failures */ });
      }
    } catch { /* non-critical — localStorage is primary */ }
  }

  /**
   * Get filtered entries.
   * @param {object} filter — { action?: string, search?: string, limit?: number }
   */
  function getEntries(filter) {
    let entries = _getAll();

    if (filter) {
      if (filter.action && filter.action !== 'all') {
        entries = entries.filter(e => e.action === filter.action);
      }
      if (filter.search) {
        const q = filter.search.toLowerCase();
        entries = entries.filter(e => {
          const desc = (e.details.description || e.details.name || e.details.path || '').toLowerCase();
          return desc.includes(q) || e.action.includes(q);
        });
      }
    }

    // Most recent first
    entries.reverse();

    if (filter && filter.limit) {
      entries = entries.slice(0, filter.limit);
    }

    return entries;
  }

  /**
   * Clear all log entries.
   */
  function clearEntries() {
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * Get count of entries.
   */
  function count() {
    return _getAll().length;
  }

  /* ── Internals ── */

  function _getAll() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
  }

  function _uid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  return { log, getEntries, clearEntries, count };
})();
