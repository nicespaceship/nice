/* ═══════════════════════════════════════════════════════════════════
   NICE — Crew Matcher
   Resolves a spaceship blueprint's crew_roles + crew_overrides spec
   into a slot_assignments map at activation time.

   Spec (lives on `blueprint.config`):
     crew_roles:     ["Captain", "Engineer", "Medical", ...]   // role per slot
     crew_overrides: { "0": "bp-agent-123", "3": "bp-agent-456" }  // hard pin

   Resolution order, per slot:
     1. crew_overrides[i] — pinned agent, no matching
     2. role match against agent.config.role / agent.category / agent.name
        (highest-rarity wins among matches)
     3. unmatched slots filled by highest-rarity unused agent that fits

   Behavior-preserving: if a blueprint has neither crew_roles nor
   crew_overrides, the wizard's legacy `_fallbackAssign` runs unchanged.
═══════════════════════════════════════════════════════════════════ */

const CrewMatcher = (() => {

  const RARITY_RANK = { Mythic: 5, Legendary: 4, Epic: 3, Rare: 2, Common: 1 };

  function _rarityRank(r) { return RARITY_RANK[r] || 0; }

  function _agentRarity(a) {
    return (a && (a.rarity || a.config?.rarity)) || 'Common';
  }

  /** Score how well an agent fits a role string. Higher is better; 0 = no match. */
  function scoreMatch(role, agent) {
    if (!role || !agent) return 0;
    const r = String(role).toLowerCase().trim();
    if (!r) return 0;
    const aRole = (agent.config?.role || '').toLowerCase();
    const cat   = (agent.category || '').toLowerCase();
    const name  = (agent.name || '').toLowerCase();
    if (aRole && aRole === r) return 100;
    if (cat   && cat   === r) return 90;
    if (aRole && (aRole.includes(r) || r.includes(aRole))) return 60;
    if (cat   && (cat.includes(r)   || r.includes(cat)))   return 50;
    if (name.includes(r)) return 20;
    return 0;
  }

  /**
   * Pick the best agent for a role from the available pool.
   * @param {string} role
   * @param {Array} agents
   * @param {Object} opts { used:Set, shipMaxRarity:string, canSlot:fn, minScore:number }
   * @returns {Object|null} agent or null if no candidate clears minScore
   */
  function pickAgentForRole(role, agents, opts) {
    opts = opts || {};
    const used = opts.used || new Set();
    const shipMaxRarity = opts.shipMaxRarity || 'Legendary';
    const canSlot = typeof opts.canSlot === 'function' ? opts.canSlot : null;
    const minScore = opts.minScore != null ? opts.minScore : 1;

    let best = null, bestScore = -1, bestRarity = -1, bestName = '';
    for (const a of (agents || [])) {
      if (!a || !a.id) continue;
      if (used.has(a.id)) continue;
      if (canSlot && !canSlot(shipMaxRarity, _agentRarity(a))) continue;
      const score = scoreMatch(role, a);
      if (score < minScore) continue;
      const rr = _rarityRank(_agentRarity(a));
      const better = score > bestScore
        || (score === bestScore && rr > bestRarity)
        || (score === bestScore && rr === bestRarity && (a.name || '') < bestName);
      if (best === null || better) {
        best = a; bestScore = score; bestRarity = rr; bestName = a.name || '';
      }
    }
    return best;
  }

  /**
   * Pick the highest-rarity unused agent that fits. Used to fill slots that
   * had no role spec (or no role match). Tie-break alphabetically by name
   * for determinism.
   */
  function pickBestUnused(agents, opts) {
    opts = opts || {};
    const used = opts.used || new Set();
    const shipMaxRarity = opts.shipMaxRarity || 'Legendary';
    const canSlot = typeof opts.canSlot === 'function' ? opts.canSlot : null;

    let best = null, bestRarity = -1, bestName = '';
    for (const a of (agents || [])) {
      if (!a || !a.id) continue;
      if (used.has(a.id)) continue;
      if (canSlot && !canSlot(shipMaxRarity, _agentRarity(a))) continue;
      const rr = _rarityRank(_agentRarity(a));
      const better = rr > bestRarity
        || (rr === bestRarity && (a.name || '') < bestName);
      if (best === null || better) {
        best = a; bestRarity = rr; bestName = a.name || '';
      }
    }
    return best;
  }

  /**
   * Resolve a {crew_roles, crew_overrides} spec into a slot_assignments map.
   * @param {Object} spec  { roles?:string[], overrides?:Object<int,id> }
   * @param {Object} opts  { agents:Array, slotCount:number, shipMaxRarity:string,
   *                         canSlot:fn, preassigned?:Object<int,id> }
   * @returns {Object<int, agentId>} assignments map, slot index → agent id
   */
  function assignCrew(spec, opts) {
    spec = spec || {};
    opts = opts || {};
    const roles = Array.isArray(spec.roles) ? spec.roles : [];
    const overrides = (spec.overrides && typeof spec.overrides === 'object') ? spec.overrides : {};
    const agents = opts.agents || [];
    const slotCount = opts.slotCount != null ? opts.slotCount : Math.max(roles.length, Object.keys(overrides).length);
    const shipMaxRarity = opts.shipMaxRarity || 'Legendary';
    const canSlot = typeof opts.canSlot === 'function' ? opts.canSlot : null;
    const preassigned = opts.preassigned || {};

    const assignments = {};
    const used = new Set();

    // Carry over any pre-assigned slots (e.g. from blueprint legacy crew defs)
    for (let i = 0; i < slotCount; i++) {
      const pre = preassigned[i] ?? preassigned[String(i)];
      if (pre) {
        assignments[i] = pre;
        used.add(pre);
      }
    }

    // 1. Apply overrides
    for (let i = 0; i < slotCount; i++) {
      if (assignments[i]) continue;
      const ov = overrides[i] ?? overrides[String(i)];
      if (ov) {
        assignments[i] = ov;
        used.add(ov);
      }
    }

    // 2. Match roles for remaining empty slots
    for (let i = 0; i < slotCount; i++) {
      if (assignments[i]) continue;
      const role = roles[i];
      if (!role) continue;
      const pick = pickAgentForRole(role, agents, { used, shipMaxRarity, canSlot });
      if (pick) {
        assignments[i] = pick.id;
        used.add(pick.id);
      }
    }

    // 3. Fill any leftover empty slots with highest-rarity unused agent
    for (let i = 0; i < slotCount; i++) {
      if (assignments[i]) continue;
      const pick = pickBestUnused(agents, { used, shipMaxRarity, canSlot });
      if (pick) {
        assignments[i] = pick.id;
        used.add(pick.id);
      }
    }

    return assignments;
  }

  return { scoreMatch, pickAgentForRole, pickBestUnused, assignCrew, _rarityRank };
})();
