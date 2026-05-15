/* ═══════════════════════════════════════════════════════════════════
   NICE — Ship Slots
   Read/write API over `public.user_ship_slots`. This is the SSOT for
   slot assignments after the Phase C.1 schema cut — `config.slot_assignments`
   and the legacy `user_spaceships.slots` column are both retired.

   Row shape:
     id, user_spaceship_id, slot_index, user_agent_id, role_type, created_at

   Authorization: RLS on the table cross-checks the parent `user_spaceships`
   via EXISTS, so an unscoped SELECT only returns the caller's slots.
═══════════════════════════════════════════════════════════════════ */

const ShipSlots = (() => {
  function _canSync() {
    return typeof SB !== 'undefined'
      && typeof SB.isReady === 'function' && SB.isReady()
      && typeof SB.isOnline === 'function' && SB.isOnline()
      && !!SB.client;
  }

  /**
   * Fetch slot rows for many ships in one round-trip.
   * @param {string[]} userSpaceshipIds
   * @returns {Promise<Record<string, Record<number, string|null>>>}
   *   keyed by `user_spaceship_id`, value is `{ slotIndex: userAgentId|null }`
   */
  async function fetchForShips(userSpaceshipIds) {
    if (!_canSync()) return {};
    if (!Array.isArray(userSpaceshipIds) || !userSpaceshipIds.length) return {};
    try {
      const { data, error } = await SB.client
        .from('user_ship_slots')
        .select('user_spaceship_id, slot_index, user_agent_id')
        .in('user_spaceship_id', userSpaceshipIds);
      if (error) {
        console.warn('[ShipSlots] fetchForShips failed:', error.message);
        return {};
      }
      const out = {};
      for (const row of data || []) {
        if (!out[row.user_spaceship_id]) out[row.user_spaceship_id] = {};
        out[row.user_spaceship_id][row.slot_index] = row.user_agent_id || null;
      }
      return out;
    } catch (err) {
      console.warn('[ShipSlots] fetchForShips exception:', err.message);
      return {};
    }
  }

  /**
   * Fetch slot rows for one ship.
   * @returns {Promise<Record<number, string|null>>}
   */
  async function getForShip(userSpaceshipId) {
    if (!userSpaceshipId) return {};
    const all = await fetchForShips([userSpaceshipId]);
    return all[userSpaceshipId] || {};
  }

  /**
   * Replace ALL slot rows for one ship with the given assignments. Empty
   * slots (null `user_agent_id`) keep their row so the slot index space
   * stays dense — readers can count rows to derive slot count for custom
   * ships. Pass an empty map to clear all slots.
   *
   * Roles default to `null` unless `opts.roleMap` provides them. The
   * column stays loose-typed today (see C.1 migration notes); future
   * builder UIs will populate it via the same opts.
   *
   * @param {string} userSpaceshipId
   * @param {Record<number, string|null>} assignments
   * @param {Object} [opts]
   * @param {Record<number, string|null>} [opts.roleMap]
   * @returns {Promise<boolean>}
   */
  async function setForShip(userSpaceshipId, assignments, opts) {
    if (!_canSync() || !userSpaceshipId) return false;
    const roleMap = (opts && opts.roleMap) || {};
    const c = SB.client;

    // Replace-all semantics. UNIQUE (user_spaceship_id, slot_index) makes
    // delete-then-insert the safest cut — partial upserts on a sparse map
    // would leave stale rows for slot indices the new map doesn't mention.
    try {
      const { error: delErr } = await c
        .from('user_ship_slots')
        .delete()
        .eq('user_spaceship_id', userSpaceshipId);
      if (delErr) {
        console.warn('[ShipSlots] setForShip delete failed:', delErr.message);
        return false;
      }
    } catch (err) {
      console.warn('[ShipSlots] setForShip delete exception:', err.message);
      return false;
    }

    const rows = [];
    for (const [slotIdxStr, agentId] of Object.entries(assignments || {})) {
      const slotIdx = parseInt(slotIdxStr, 10);
      if (Number.isNaN(slotIdx)) continue;
      rows.push({
        user_spaceship_id: userSpaceshipId,
        slot_index: slotIdx,
        user_agent_id: agentId || null,
        role_type: roleMap[slotIdx] || roleMap[slotIdxStr] || null,
      });
    }

    if (!rows.length) return true;

    try {
      const { error: insErr } = await c.from('user_ship_slots').insert(rows);
      if (insErr) {
        console.warn('[ShipSlots] setForShip insert failed:', insErr.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('[ShipSlots] setForShip insert exception:', err.message);
      return false;
    }
  }

  /**
   * Upsert one slot row.
   * @param {string} userSpaceshipId
   * @param {number} slotIndex
   * @param {string|null} userAgentId
   * @param {Object} [opts]
   * @param {string|null} [opts.roleType]
   * @returns {Promise<boolean>}
   */
  async function setSlot(userSpaceshipId, slotIndex, userAgentId, opts) {
    if (!_canSync() || !userSpaceshipId || slotIndex == null) return false;
    const role = (opts && opts.roleType) || null;
    try {
      const { error } = await SB.client.from('user_ship_slots').upsert({
        user_spaceship_id: userSpaceshipId,
        slot_index: parseInt(slotIndex, 10),
        user_agent_id: userAgentId || null,
        role_type: role,
      }, { onConflict: 'user_spaceship_id,slot_index' });
      if (error) {
        console.warn('[ShipSlots] setSlot failed:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('[ShipSlots] setSlot exception:', err.message);
      return false;
    }
  }

  /** Clear one slot — keeps the row, nulls the user_agent_id. */
  async function clearSlot(userSpaceshipId, slotIndex) {
    return setSlot(userSpaceshipId, slotIndex, null);
  }

  /**
   * Delete all slot rows for a ship (used when the ship is archived
   * or hard-deactivated). Idempotent.
   * @returns {Promise<boolean>}
   */
  async function deleteForShip(userSpaceshipId) {
    if (!_canSync() || !userSpaceshipId) return false;
    try {
      const { error } = await SB.client
        .from('user_ship_slots')
        .delete()
        .eq('user_spaceship_id', userSpaceshipId);
      if (error) {
        console.warn('[ShipSlots] deleteForShip failed:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('[ShipSlots] deleteForShip exception:', err.message);
      return false;
    }
  }

  return {
    fetchForShips,
    getForShip,
    setForShip,
    setSlot,
    clearSlot,
    deleteForShip,
  };
})();

if (typeof window !== 'undefined') window.ShipSlots = ShipSlots;
if (typeof module !== 'undefined' && module.exports) module.exports = ShipSlots;
