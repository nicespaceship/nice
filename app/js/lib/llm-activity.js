/* ═══════════════════════════════════════════════════════════════════
   NICE — LLM Activity Tracker
   In-memory pub/sub for "an LLM call is in flight" signals.
   Drives the elapsed-seconds chip above the prompt panel and any
   future surface that wants to reflect raw LLM liveness.

   Handle-pairing only — never a polled flag. The previous loading
   flag (`ships-loading`) could get stuck `true` when an end-event
   was missed. Here the start() returns the only object that can
   clear its own entry, so a leaked handle is the only failure
   mode (and shows up immediately as a chip that won't go away).

   Events:
     - 'start' — { id, model, agent, startedAt }
     - 'chunk' — { id, model, agent, startedAt, deltaTokens }   (optional, streaming)
     - 'end'   — { id, model, agent, startedAt, duration, totalTokens }
═══════════════════════════════════════════════════════════════════ */

const LLMActivity = (() => {
  const _active = new Map();
  const _subs = new Set();
  let _nextId = 1;

  function _emit(event, payload) {
    _subs.forEach((fn) => {
      try { fn(event, payload); } catch (_) { /* subscriber error — non-critical */ }
    });
  }

  function start(model, agent) {
    const id = _nextId++;
    const entry = { model: model || 'unknown', agent: agent || null, startedAt: Date.now() };
    _active.set(id, entry);
    _emit('start', { id, ...entry });

    return {
      id,
      chunk(deltaTokens) {
        const e = _active.get(id);
        if (!e) return;
        _emit('chunk', { id, ...e, deltaTokens: Number(deltaTokens) || 0 });
      },
      end({ totalTokens = 0 } = {}) {
        const e = _active.get(id);
        if (!e) return;
        _active.delete(id);
        _emit('end', { id, ...e, duration: Date.now() - e.startedAt, totalTokens: Number(totalTokens) || 0 });
      },
    };
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    _subs.add(fn);
    return () => { _subs.delete(fn); };
  }

  function isActive() {
    return _active.size > 0;
  }

  function activeCount() {
    return _active.size;
  }

  function _reset() {
    _active.clear();
    _subs.clear();
    _nextId = 1;
  }

  return { start, subscribe, isActive, activeCount, _reset };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LLMActivity;
}
