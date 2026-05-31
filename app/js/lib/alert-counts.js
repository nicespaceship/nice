/* ═══════════════════════════════════════════════════════════════════
   NICE — Alert Counts (SSOT for "needs attention" indicators)

   One source of truth for the contextual alert dots. Every surface
   projects from here instead of re-deriving counts:
     - Bridge tabs (schematic / missions / outbox) each show a dot, and the
       Bridge sidebar link aggregates them (visible even off the Bridge).
     - Settings popover items (integrations / moderation / wallet / security)
       each show a dot, and the gear CTA aggregates them when the popover is
       closed.  [settings keys land in slice 2]

   The rule is uniform: an item shows a dot when its count > 0; a collapsed
   parent shows the sum of its children. Keep the count logic here so the
   sidebar, the Bridge tab row, and the gear all agree.
═══════════════════════════════════════════════════════════════════ */

const AlertCounts = (() => {

  function _state(key) {
    return (typeof State !== 'undefined' && State.get(key)) || [];
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

  // Keys grouped by their aggregating parent, so a surface can ask for "all
  // the Bridge dots" without hardcoding the list.
  const GROUPS = {
    bridge: ['schematic', 'missions', 'outbox'],
  };

  const _BUCKETS = { schematic, missions, outbox };

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

  // Sum of a key list, or of a named group ('bridge').
  function sum(keysOrGroup) {
    const keys = Array.isArray(keysOrGroup)
      ? keysOrGroup
      : (GROUPS[keysOrGroup] || Object.keys(_BUCKETS));
    return keys.reduce((n, k) => n + count(k), 0);
  }

  return { get, count, sum, GROUPS };
})();
