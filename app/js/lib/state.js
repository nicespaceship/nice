/* ═══════════════════════════════════════════════════════════════════
   NICE — State Store
   Simple pub/sub reactive state for the app.
═══════════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} StateStore
 * @property {function(string): *} get — Retrieve a value by key
 * @property {function(string, *): void} set — Set a value and notify subscribers synchronously
 * @property {function(string, *): void} setBatched — Set a value and batch notifications per animation frame
 * @property {function(string, function(*): void): void} on — Subscribe to changes for a key; fires immediately if data exists
 * @property {function(string, function(*): void): void} off — Unsubscribe a listener from a key
 */

const State = (() => {
  const _data = {};
  const _subs = {};
  let _pendingFlush = null;
  const _pendingKeys = new Set();

  /* Scoped subscriptions — auto-cleaned when destroyScoped() is called */
  let _scopedSubs = [];

  function get(key) { return _data[key]; }

  function set(key, val) {
    _data[key] = val;
    (_subs[key] || []).forEach(fn => fn(val));
  }

  /* Batch multiple rapid sets and fire listeners once per frame */
  function setBatched(key, val) {
    _data[key] = val;
    _pendingKeys.add(key);
    if (!_pendingFlush) {
      _pendingFlush = requestAnimationFrame(() => {
        _pendingKeys.forEach(k => {
          (_subs[k] || []).forEach(fn => fn(_data[k]));
        });
        _pendingKeys.clear();
        _pendingFlush = null;
      });
    }
  }

  function on(key, fn) {
    if (!_subs[key]) _subs[key] = [];
    _subs[key].push(fn);
    // Fire immediately if data exists
    if (_data[key] !== undefined) fn(_data[key]);
  }

  function off(key, fn) {
    if (!_subs[key]) return;
    _subs[key] = _subs[key].filter(f => f !== fn);
  }

  /**
   * Subscribe with automatic cleanup on view teardown.
   * Views should use this instead of on() for subscriptions that should
   * die when the view navigates away.
   * Router calls State.destroyScoped() before rendering a new view.
   */
  function onScoped(key, fn) {
    on(key, fn);
    _scopedSubs.push({ key, fn });
  }

  /** Unsubscribe all scoped listeners — called by Router on view teardown */
  function destroyScoped() {
    _scopedSubs.forEach(({ key, fn }) => off(key, fn));
    _scopedSubs = [];
  }

  /** State key registry — prevents magic strings and enables grep */
  const KEYS = {
    user: 'user',
    agents: 'agents',
    missions: 'missions',
    spaceships: 'spaceships',
    enabledModels: 'enabled_models',
    notifications: 'notifications',
    blueprints: 'blueprints',
    activeSkin: 'active_skin',
    mcpConnections: 'mcp_connections',
    tokenBalance: 'token_balance',
  };

  return { get, set, setBatched, on, off, onScoped, destroyScoped, KEYS };
})();
