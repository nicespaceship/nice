/* ═══════════════════════════════════════════════════════════════════
   NICE — Alert Counts (SSOT for "needs attention" indicators)

   One source of truth for the contextual alert dots. Every surface
   projects from here instead of re-deriving counts:
     - Bridge tabs (schematic / missions / outbox) each show a dot, and the
       Bridge sidebar link aggregates them (visible even off the Bridge).
     - Settings popover items (integrations / moderation / wallet / security)
       each show a dot, and the gear CTA aggregates them when the popover is
       closed.

   The rule is uniform: an item shows a dot when its count > 0; a collapsed
   parent shows the sum of its children. Keep the count logic here so the
   sidebar, the Bridge tab row, and the gear all agree.

   Buckets read State (and localStorage for the security checklist) directly
   and synchronously. The two counts that need a fetch — moderation (admin
   RPC) and wallet/security (derived) — are computed by their owning module
   and stashed in State; this layer only projects. See nice.js for the
   moderation fetch and security.js for the compliance count.
═══════════════════════════════════════════════════════════════════ */

const AlertCounts = (() => {

  // A pool is "low" once its remaining balance drops below this fraction of
  // its monthly allowance — early enough to top up before it bites mid-task.
  const WALLET_LOW_FRACTION = 0.1;

  function _state(key) {
    return (typeof State !== 'undefined' && State.get(key)) || [];
  }
  function _num(key) {
    const v = (typeof State !== 'undefined') ? State.get(key) : 0;
    return typeof v === 'number' ? v : 0;
  }

  /* ── Bridge buckets ── */

  // Schematic: crew/ship trouble — any agent in error/offline, or a deployed
  // ship whose crew has one.
  function schematic() {
    const agents = _state('agents');
    const broken = agents.filter(a => a.status === 'error' || a.status === 'offline').length;
    const ships = _state('spaceships').filter(s => {
      if (s.status !== 'deployed') return false;
      const crew = Array.isArray(s.agents) ? s.agents : (Array.isArray(s.agent_ids) ? s.agent_ids : []);
      return crew.some(id => {
        const a = agents.find(x => x.id === id);
        return a && (a.status === 'error' || a.status === 'offline');
      });
    }).length;
    return broken + ships;
  }

  // Missions: runs that need a human — failed or awaiting review.
  function missions() {
    return _state('missions').filter(m => m.status === 'failed' || m.status === 'review').length;
  }

  // Outbox: content drafts waiting for review.
  function outbox() {
    return (typeof ContentQueue !== 'undefined' && ContentQueue.getCounts)
      ? (ContentQueue.getCounts().draft || 0)
      : 0;
  }

  /* ── Settings buckets ── */

  // Integrations: connections whose OAuth token the provider rejected and
  // that need a Reconnect. A never-configured integration sits at
  // 'disconnected' and is not an alert — only a broken 'error' connection
  // is something to act on. Matches the red Reconnect affordance in the view.
  function integrations() {
    return _state('mcp_connections').filter(m => m.status === 'error').length;
  }

  // Moderation: pending community submissions. Admin-only — nice.js fetches
  // the admin RPC after confirming the flag and stashes the count; non-admins
  // never fetch, so this stays 0 and the dot never shows.
  function moderation() {
    return _num('moderation_pending');
  }

  // Wallet: token pools running low. Free tier (Gemini Flash, no pool) never
  // qualifies — only a pool with a monthly allowance can run low. A pool is
  // counted when its remaining (allowance left + purchased) drops below the
  // low-water mark. Reads token_balance.pools directly, so untouched /
  // non-entitled pools (remaining == full allowance) never trip it.
  function wallet() {
    const pools = ((typeof State !== 'undefined' && State.get('token_balance')) || {}).pools || {};
    return Object.keys(pools).filter(id => {
      const p = pools[id] || {};
      const allowance = p.allowance || 0;
      if (allowance <= 0) return false;
      const remaining = Math.max(0, allowance - (p.used || 0)) + (p.purchased || 0);
      return remaining < allowance * WALLET_LOW_FRACTION;
    }).length;
  }

  // Security: open compliance-checklist items. security.js owns the item list
  // and publishes the open count to State on load + on every toggle; this
  // layer only projects it.
  function security() {
    return _num('compliance_open');
  }

  // Keys grouped by their aggregating parent, so a surface can ask for "all
  // the Bridge dots" or "all the Settings dots" without hardcoding the list.
  const GROUPS = {
    bridge: ['schematic', 'missions', 'outbox'],
    settings: ['integrations', 'moderation', 'wallet', 'security'],
  };

  const _BUCKETS = { schematic, missions, outbox, integrations, moderation, wallet, security };

  // Count for a single key (0 if unknown).
  function count(key) {
    return _BUCKETS[key] ? _BUCKETS[key]() : 0;
  }

  // All current counts as a map.
  function get() {
    const out = {};
    Object.keys(_BUCKETS).forEach(k => { out[k] = _BUCKETS[k](); });
    return out;
  }

  // Sum of a key list, or of a named group ('bridge' / 'settings').
  function sum(keysOrGroup) {
    const keys = Array.isArray(keysOrGroup)
      ? keysOrGroup
      : (GROUPS[keysOrGroup] || Object.keys(_BUCKETS));
    return keys.reduce((n, k) => n + count(k), 0);
  }

  return { get, count, sum, GROUPS };
})();
