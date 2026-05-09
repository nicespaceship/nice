/* ═══════════════════════════════════════════════════════════════════
   NICE — Blueprint Backfill
   Boot-time recovery for activated ships whose `slot_assignments` point
   at synthetic agent ids that have no matching `user_agents` row.

   Why this exists: prior to PR #442 (3a), `ship-setup-wizard.js` only
   wrote slot characters to localStorage's `nice-custom-agents`. A wipe
   of that key — or simply opening the app on a different device —
   stranded `slot_assignments` referencing dangling `agent-<ts>-<idx>`
   ids. Schematic rendered every slot as "Empty / Assign agent" and
   Captain dispatch failed because the crew manifest was empty.

   3a fixed the forward path. 3b (this module) backfills existing data:
   for each ship row whose assignments contain non-UUID ids, create
   `user_agents` rows from either the localStorage cache (if still
   present) or the canonical persona snapshot in `slots.crew[idx]`,
   then rewrite the assignments. Idempotent — runs every login, no-ops
   for users whose ships are already on UUIDs.
═══════════════════════════════════════════════════════════════════ */

const BlueprintBackfill = (() => {
  const _UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const _isUuid = (s) => typeof s === 'string' && _UUID_RE.test(s);

  /**
   * Pick the canonical slot_assignments map from a user_spaceships row.
   * `config.slot_assignments` is the SSOT (verified against Smoke Test
   * Ship and used by every reader since #288); `slots.slot_assignments`
   * is a legacy fallback for rows written before the schema parity
   * migration.
   */
  function _readAssignments(ship) {
    const cfg = (ship && ship.config) || {};
    const slots = (ship && ship.slots) || {};
    if (cfg.slot_assignments && Object.keys(cfg.slot_assignments).length) {
      return cfg.slot_assignments;
    }
    if (slots.slot_assignments && Object.keys(slots.slot_assignments).length) {
      return slots.slot_assignments;
    }
    return {};
  }

  function _readCrew(ship) {
    const slots = (ship && ship.slots) || {};
    const cfg = (ship && ship.config) || {};
    return slots.crew || cfg.crew || [];
  }

  function _shipNeedsBackfill(ship) {
    const a = _readAssignments(ship);
    return Object.values(a).some((id) => id && !_isUuid(id));
  }

  function _findInLocalStorage(syntheticId) {
    if (!syntheticId || typeof Utils === 'undefined' || !Utils.KEYS) return null;
    try {
      const stored = JSON.parse(localStorage.getItem(Utils.KEYS.customAgents) || '[]');
      return stored.find((a) => a && a.id === syntheticId) || null;
    } catch {
      return null;
    }
  }

  /**
   * Rebuild a user_agents row from whichever source has data. localStorage
   * wins when present (preserves user-edited llm_engine, tools, etc.);
   * `slots.crew[idx]` is the catalog-snapshot fallback when the cache was
   * wiped. Returns the inserted row, or null on failure.
   */
  async function _createAgentRow(user, slotIdx, syntheticId, crewMember) {
    const local = _findInLocalStorage(syntheticId);
    if (!local && !crewMember) return null;

    const name = (local && local.name) || (crewMember && crewMember.label) || ('Slot ' + slotIdx);
    const baseConfig = (local && local.config) || (crewMember && crewMember.config) || {};
    const role =
      baseConfig.agentRole ||
      (crewMember && crewMember.config && crewMember.config.agentRole) ||
      'Ops';
    const rarity = (local && local.rarity) || (crewMember && crewMember.rarity) || 'Common';
    const status = (local && local.status) || 'idle';

    // Row shape mirrors ship-setup-wizard.js _persistSlotAgent verbatim:
    // (user_id, name, rarity, status, config). user_agents has no
    // `category` column — role lives in config.agentRole, surfaced to
    // Schematic via the same config path the wizard writes.
    const row = {
      user_id: user.id,
      name,
      rarity,
      status,
      config: Object.assign(
        {
          role,
          type: 'Agent',
          llm_engine: 'claude-4',
          tools: [],
        },
        baseConfig,
        { agentRole: role }
      ),
    };

    try {
      return await SB.db('user_agents').create(row);
    } catch (err) {
      console.warn('[BlueprintBackfill] user_agents create failed for slot', slotIdx, err.message);
      return null;
    }
  }

  /**
   * Walk one ship row's slot_assignments, replace every non-UUID with a
   * freshly minted user_agents UUID, and write the updated row back.
   * Returns { fixed, createdRows, newAssignments } or null if nothing
   * changed.
   */
  async function _backfillShip(ship, user) {
    const oldAssignments = _readAssignments(ship);
    if (!Object.keys(oldAssignments).length) return null;

    const crew = _readCrew(ship);
    const newAssignments = Object.assign({}, oldAssignments);
    let fixed = 0;
    let createdRows = 0;

    for (const [slotIdx, agentId] of Object.entries(oldAssignments)) {
      if (!agentId || _isUuid(agentId)) continue;
      const idx = parseInt(slotIdx, 10);
      const member = crew[idx];

      const created = await _createAgentRow(user, slotIdx, agentId, member);
      if (!created || !created.id) continue;

      newAssignments[slotIdx] = created.id;
      fixed++;
      createdRows++;
    }

    if (!fixed) return null;

    const newConfig = Object.assign({}, ship.config || {}, { slot_assignments: newAssignments });
    const newSlots = Object.assign({}, ship.slots || {});
    if (newSlots.slot_assignments) newSlots.slot_assignments = newAssignments;

    try {
      await SB.db('user_spaceships').update(ship.id, {
        config: newConfig,
        slots: newSlots,
      });
    } catch (err) {
      console.warn('[BlueprintBackfill] user_spaceships update failed for', ship.id, err.message);
      return null;
    }

    return { fixed, createdRows, newAssignments };
  }

  /**
   * Re-fetch user_spaceships + user_agents and patch State so live views
   * (Schematic, Spaceship Detail) re-render with the new ids without a
   * page reload. Best-effort — failures here don't undo the DB writes.
   */
  async function _refreshState(user) {
    if (typeof State === 'undefined') return;
    let ships = [];
    let agents = [];
    try {
      [ships, agents] = await Promise.all([
        SB.db('user_spaceships').list({ userId: user.id }),
        SB.db('user_agents').list({ userId: user.id }),
      ]);
    } catch (err) {
      console.warn('[BlueprintBackfill] state refresh fetch failed:', err.message);
      return;
    }

    const stateAgents = State.get('agents') || [];
    const seen = new Set(stateAgents.map((a) => a && a.id).filter(Boolean));
    const mergedAgents = stateAgents.slice();
    for (const a of agents || []) {
      if (!a || !a.id || seen.has(a.id)) continue;
      mergedAgents.push({
        id: a.id,
        name: a.name,
        rarity: a.rarity || 'Common',
        category: a.category || (a.config && a.config.agentRole) || 'Ops',
        status: a.status || 'idle',
        config: a.config || {},
        activated: true,
      });
      seen.add(a.id);
    }
    State.set('agents', mergedAgents);

    const shipById = new Map((ships || []).map((s) => [s.id, s]));
    const stateShips = State.get('spaceships') || [];
    const nextShips = stateShips.map((s) => {
      const fresh = shipById.get(s.id);
      if (!fresh) return s;
      const assignments = _readAssignments(fresh);
      return Object.assign({}, s, {
        config: Object.assign({}, s.config || {}, { slot_assignments: assignments }),
      });
    });
    State.set('spaceships', nextShips);
  }

  /**
   * Boot-time entry point. Idempotent. No-op for guests, offline users,
   * and users whose ships already have UUID-only assignments.
   *
   * @returns {Promise<{fixedSlots: number, ships: number, createdAgents: number}>}
   */
  async function runOnLoad() {
    const empty = { fixedSlots: 0, ships: 0, createdAgents: 0 };
    const user = (typeof State !== 'undefined') ? State.get('user') : null;
    if (!user || !user.id) return empty;
    if (typeof SB === 'undefined' || typeof SB.isReady !== 'function' || !SB.isReady()) {
      return empty;
    }
    if (typeof SB.isOnline === 'function' && !SB.isOnline()) return empty;

    let ships;
    try {
      ships = await SB.db('user_spaceships').list({ userId: user.id });
    } catch (err) {
      console.warn('[BlueprintBackfill] user_spaceships fetch failed:', err.message);
      return empty;
    }
    if (!Array.isArray(ships) || !ships.length) return empty;

    const needsWork = ships.filter(_shipNeedsBackfill);
    if (!needsWork.length) return empty;

    let fixedSlots = 0;
    let shipsTouched = 0;
    let createdAgents = 0;

    for (const ship of needsWork) {
      const result = await _backfillShip(ship, user);
      if (!result) continue;
      shipsTouched++;
      fixedSlots += result.fixed;
      createdAgents += result.createdRows;
    }

    if (shipsTouched > 0) {
      await _refreshState(user);
      if (typeof Notify !== 'undefined' && Notify.send) {
        const shipWord = shipsTouched === 1 ? 'ship' : 'ships';
        const slotWord = fixedSlots === 1 ? 'slot' : 'slots';
        Notify.send({
          title: 'Crew restored',
          message: 'Backfilled ' + fixedSlots + ' ' + slotWord + ' across ' + shipsTouched + ' ' + shipWord + '.',
          type: 'system',
        });
      }
    }

    return { fixedSlots, ships: shipsTouched, createdAgents };
  }

  return {
    runOnLoad,
    // Exposed for tests — keep the surface narrow.
    _isUuid,
    _readAssignments,
    _shipNeedsBackfill,
    _backfillShip,
  };
})();
