/* ═══════════════════════════════════════════════════════════════════
   NICE — Agent Activity Tracker
   In-memory pub/sub for "is this agent currently working?" signals.
   Drives the schematic status node (idle/recent/active) and any future
   surface that wants to reflect agent liveness.

   States:
     - 'active'   currently executing (mission_start / turn_start emitted,
                  no terminal event yet)
     - 'recent'   finished within the last RECENT_WINDOW_MS
     - 'idle'     no activity, or never seen
═══════════════════════════════════════════════════════════════════ */

const AgentActivity = (() => {
  const RECENT_WINDOW_MS = 60_000;
  const DECAY_INTERVAL_MS = 5_000;

  const _entries = new Map();
  const _subs = new Set();
  let _decayTimer = null;

  function _stateFor(agentId) {
    const e = _entries.get(agentId);
    if (!e) return 'idle';
    if (e.state === 'active') return 'active';
    return (Date.now() - e.endedAt) < RECENT_WINDOW_MS ? 'recent' : 'idle';
  }

  function _emit(agentId) {
    const state = _stateFor(agentId);
    _subs.forEach((fn) => {
      try { fn(agentId, state); } catch (_) { /* subscriber error — non-critical */ }
    });
  }

  function _scheduleDecay() {
    if (_decayTimer) return;
    _decayTimer = setInterval(() => {
      const now = Date.now();
      const toEmit = [];
      for (const [id, e] of _entries.entries()) {
        if (e.state === 'recent' && (now - e.endedAt) >= RECENT_WINDOW_MS) {
          _entries.delete(id);
          toEmit.push(id);
        }
      }
      toEmit.forEach(_emit);
      if (_entries.size === 0) {
        clearInterval(_decayTimer);
        _decayTimer = null;
      }
    }, DECAY_INTERVAL_MS);
  }

  function markActive(agentId) {
    if (!agentId) return;
    _entries.set(agentId, { state: 'active', startedAt: Date.now(), endedAt: null });
    _emit(agentId);
    _scheduleDecay();
  }

  function markIdle(agentId) {
    if (!agentId) return;
    const cur = _entries.get(agentId);
    if (!cur) return;
    _entries.set(agentId, { state: 'recent', startedAt: cur.startedAt, endedAt: Date.now() });
    _emit(agentId);
    _scheduleDecay();
  }

  function getState(agentId) {
    if (!agentId) return 'idle';
    return _stateFor(agentId);
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    _subs.add(fn);
    return () => { _subs.delete(fn); };
  }

  function _reset() {
    _entries.clear();
    _subs.clear();
    if (_decayTimer) {
      clearInterval(_decayTimer);
      _decayTimer = null;
    }
  }

  return { markActive, markIdle, getState, subscribe, _reset, RECENT_WINDOW_MS };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AgentActivity;
}
