import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadModule(rel) {
  let code = readFileSync(resolve(__dir, '..', rel), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

/**
 * Faithful in-memory fake of `public.user_ship_slots` with a chainable query
 * builder matching the subset of supabase-js that ShipSlots actually drives:
 *   .from(t).select(c).in(col, vals)   → { data, error }
 *   .from(t).delete().eq(col, val)     → { error }
 *   .from(t).insert(rows)              → { error }
 *   .from(t).upsert(row, { onConflict })→ { error }
 *
 * The fake enforces the table's UNIQUE (user_spaceship_id, slot_position)
 * constraint so replace-all and upsert-on-conflict behave like the real DB.
 * `_failOnce` injects a Postgres-style `{ error }` return; `_throwOnce`
 * simulates a network/builder exception so the module's try/catch is exercised.
 */
function makeFakeClient() {
  let rows = [];
  const calls = [];
  let failOn = null;   // { op, error } — resolves to { error }, consumed once
  let throwOn = null;  // op string — throws synchronously, consumed once

  function _gate(op) {
    if (throwOn === op) { throwOn = null; throw new Error(op + ' network failure'); }
    if (failOn && failOn.op === op) { const f = failOn; failOn = null; return f.error; }
    return null;
  }

  function from(table) {
    return {
      select(cols) {
        return {
          in(col, vals) {
            calls.push({ op: 'select', table, cols, col, vals: [...vals] });
            const err = _gate('select');
            if (err) return Promise.resolve({ data: null, error: err });
            const data = rows
              .filter(r => vals.includes(r[col]))
              .map(r => ({ ...r }));
            return Promise.resolve({ data, error: null });
          },
        };
      },
      delete() {
        return {
          eq(col, val) {
            calls.push({ op: 'delete', table, col, val });
            const err = _gate('delete');
            if (err) return Promise.resolve({ error: err });
            rows = rows.filter(r => r[col] !== val);
            return Promise.resolve({ error: null });
          },
        };
      },
      insert(newRows) {
        calls.push({ op: 'insert', table, rows: newRows.map(r => ({ ...r })) });
        const err = _gate('insert');
        if (err) return Promise.resolve({ error: err });
        for (const nr of newRows) {
          const dup = rows.find(r =>
            r.user_spaceship_id === nr.user_spaceship_id &&
            r.slot_position === nr.slot_position);
          if (dup) {
            return Promise.resolve({
              error: { message: 'duplicate key value violates unique constraint' },
            });
          }
        }
        rows.push(...newRows.map(r => ({ ...r })));
        return Promise.resolve({ error: null });
      },
      upsert(row, opts) {
        calls.push({ op: 'upsert', table, row: { ...row }, opts });
        const err = _gate('upsert');
        if (err) return Promise.resolve({ error: err });
        const hit = rows.find(r =>
          r.user_spaceship_id === row.user_spaceship_id &&
          r.slot_position === row.slot_position);
        if (hit) Object.assign(hit, row);
        else rows.push({ ...row });
        return Promise.resolve({ error: null });
      },
    };
  }

  return {
    from,
    _rows: () => rows,
    _rowsFor: (ship) => rows.filter(r => r.user_spaceship_id === ship),
    _calls: () => calls,
    _opCount: (op) => calls.filter(c => c.op === op).length,
    _seed: (...r) => { rows.push(...r); },
    _failOnce: (op, error) => { failOn = { op, error: error || { message: op + ' failed' } }; },
    _throwOnce: (op) => { throwOn = op; },
  };
}

loadModule('lib/ship-slots.js');

const SHIP_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const SHIP_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const AG = (n) => `agent-${n}`;

let fake;
beforeEach(() => {
  fake = makeFakeClient();
  globalThis.SB = { isReady: () => true, isOnline: () => true, client: fake };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('ShipSlots', () => {
  describe('_canSync gate (offline / not-ready / no-client)', () => {
    it('fetchForShips returns {} when SB is not ready', async () => {
      SB.isReady = () => false;
      expect(await ShipSlots.fetchForShips([SHIP_A])).toEqual({});
      expect(fake._calls().length).toBe(0);
    });

    it('fetchForShips returns {} when offline', async () => {
      SB.isOnline = () => false;
      expect(await ShipSlots.fetchForShips([SHIP_A])).toEqual({});
      expect(fake._calls().length).toBe(0);
    });

    it('fetchForShips returns {} when there is no client', async () => {
      SB.client = null;
      expect(await ShipSlots.fetchForShips([SHIP_A])).toEqual({});
      expect(fake._calls().length).toBe(0);
    });

    it('write methods return false when offline (no DB call attempted)', async () => {
      SB.isOnline = () => false;
      expect(await ShipSlots.setForShip(SHIP_A, { 0: AG(1) })).toBe(false);
      expect(await ShipSlots.setSlot(SHIP_A, 0, AG(1))).toBe(false);
      expect(await ShipSlots.deleteForShip(SHIP_A)).toBe(false);
      expect(fake._calls().length).toBe(0);
    });

    it('tolerates SB.isReady / SB.isOnline missing entirely', async () => {
      globalThis.SB = { client: fake }; // no isReady/isOnline functions
      expect(await ShipSlots.fetchForShips([SHIP_A])).toEqual({});
      expect(await ShipSlots.setForShip(SHIP_A, { 0: AG(1) })).toBe(false);
    });
  });

  describe('fetchForShips', () => {
    it('returns {} for non-array or empty input without hitting the DB', async () => {
      expect(await ShipSlots.fetchForShips(null)).toEqual({});
      expect(await ShipSlots.fetchForShips(undefined)).toEqual({});
      expect(await ShipSlots.fetchForShips('not-an-array')).toEqual({});
      expect(await ShipSlots.fetchForShips([])).toEqual({});
      expect(fake._calls().length).toBe(0);
    });

    it('translates 1-indexed slot_position to 0-indexed JS keys', async () => {
      // DB slot_position 1 == UI "Slot 1" == JS key 0. This -1 at the read
      // boundary is the load-bearing translation; an off-by-one here would
      // misassign every crew member by one slot.
      fake._seed(
        { user_spaceship_id: SHIP_A, slot_position: 1, user_agent_id: AG(1) },
        { user_spaceship_id: SHIP_A, slot_position: 2, user_agent_id: AG(2) },
        { user_spaceship_id: SHIP_A, slot_position: 3, user_agent_id: AG(3) },
      );
      const out = await ShipSlots.fetchForShips([SHIP_A]);
      expect(out[SHIP_A]).toEqual({ 0: AG(1), 1: AG(2), 2: AG(3) });
    });

    it('groups rows by ship across a single bulk query', async () => {
      fake._seed(
        { user_spaceship_id: SHIP_A, slot_position: 1, user_agent_id: AG(1) },
        { user_spaceship_id: SHIP_B, slot_position: 1, user_agent_id: AG(9) },
        { user_spaceship_id: SHIP_B, slot_position: 2, user_agent_id: AG(8) },
      );
      const out = await ShipSlots.fetchForShips([SHIP_A, SHIP_B]);
      expect(out).toEqual({
        [SHIP_A]: { 0: AG(1) },
        [SHIP_B]: { 0: AG(9), 1: AG(8) },
      });
      // One round-trip, one .in() filter carrying both ids.
      expect(fake._opCount('select')).toBe(1);
      expect(fake._calls()[0].vals).toEqual([SHIP_A, SHIP_B]);
    });

    it('maps a null user_agent_id to null (empty slot kept dense)', async () => {
      fake._seed(
        { user_spaceship_id: SHIP_A, slot_position: 1, user_agent_id: null },
        { user_spaceship_id: SHIP_A, slot_position: 2, user_agent_id: AG(2) },
      );
      const out = await ShipSlots.fetchForShips([SHIP_A]);
      expect(out[SHIP_A]).toEqual({ 0: null, 1: AG(2) });
    });

    it('defends against a null slot_position by treating it as index 0', async () => {
      fake._seed({ user_spaceship_id: SHIP_A, slot_position: null, user_agent_id: AG(5) });
      const out = await ShipSlots.fetchForShips([SHIP_A]);
      expect(out[SHIP_A]).toEqual({ 0: AG(5) });
    });

    it('omits ships that have no rows', async () => {
      fake._seed({ user_spaceship_id: SHIP_A, slot_position: 1, user_agent_id: AG(1) });
      const out = await ShipSlots.fetchForShips([SHIP_A, SHIP_B]);
      expect(out[SHIP_B]).toBeUndefined();
    });

    it('returns {} and warns when the query errors', async () => {
      fake._failOnce('select', { message: 'permission denied' });
      const out = await ShipSlots.fetchForShips([SHIP_A]);
      expect(out).toEqual({});
      expect(console.warn).toHaveBeenCalled();
    });

    it('returns {} when the query builder throws (network exception)', async () => {
      fake._throwOnce('select');
      const out = await ShipSlots.fetchForShips([SHIP_A]);
      expect(out).toEqual({});
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('getForShip', () => {
    it('returns {} for a falsy id without hitting the DB', async () => {
      expect(await ShipSlots.getForShip(null)).toEqual({});
      expect(await ShipSlots.getForShip('')).toEqual({});
      expect(fake._calls().length).toBe(0);
    });

    it('returns the 0-indexed slot map for one ship', async () => {
      fake._seed(
        { user_spaceship_id: SHIP_A, slot_position: 1, user_agent_id: AG(1) },
        { user_spaceship_id: SHIP_B, slot_position: 1, user_agent_id: AG(9) },
      );
      expect(await ShipSlots.getForShip(SHIP_A)).toEqual({ 0: AG(1) });
    });

    it('returns {} when the ship has no slot rows', async () => {
      expect(await ShipSlots.getForShip(SHIP_A)).toEqual({});
    });
  });

  describe('setForShip (replace-all + index translation)', () => {
    it('persists 0-indexed assignments as 1-indexed slot_position rows', async () => {
      const ok = await ShipSlots.setForShip(SHIP_A, { 0: AG(1), 1: AG(2) });
      expect(ok).toBe(true);
      const positions = fake._rowsFor(SHIP_A)
        .map(r => ({ pos: r.slot_position, agent: r.user_agent_id }))
        .sort((a, b) => a.pos - b.pos);
      expect(positions).toEqual([
        { pos: 1, agent: AG(1) },
        { pos: 2, agent: AG(2) },
      ]);
    });

    it('round-trips: what setForShip writes, getForShip reads back identically', async () => {
      const assignments = { 0: AG(1), 1: null, 2: AG(3) };
      await ShipSlots.setForShip(SHIP_A, assignments);
      expect(await ShipSlots.getForShip(SHIP_A)).toEqual(assignments);
    });

    it('replaces all prior rows (no stale slots survive a shrink)', async () => {
      await ShipSlots.setForShip(SHIP_A, { 0: AG(1), 1: AG(2), 2: AG(3) });
      // Re-assign with a smaller crew — slot 2 must disappear entirely.
      await ShipSlots.setForShip(SHIP_A, { 0: AG(9) });
      expect(await ShipSlots.getForShip(SHIP_A)).toEqual({ 0: AG(9) });
      expect(fake._rowsFor(SHIP_A).length).toBe(1);
    });

    it('overwrites pre-existing rows at the same slot positions (delete precedes insert)', async () => {
      // The module does delete-then-insert precisely to dodge the table's
      // UNIQUE (user_spaceship_id, slot_position). Seed rows on the very
      // positions the new map reuses: if a refactor ever drops the
      // replace-all delete, the insert would hit the dup-key error and this
      // assertion (true + new agents win) would fail. That makes the
      // constraint guard load-bearing rather than decorative.
      fake._seed(
        { user_spaceship_id: SHIP_A, slot_position: 1, user_agent_id: AG(1) },
        { user_spaceship_id: SHIP_A, slot_position: 2, user_agent_id: AG(2) },
      );
      const ok = await ShipSlots.setForShip(SHIP_A, { 0: AG(9), 1: AG(8) });
      expect(ok).toBe(true);
      expect(await ShipSlots.getForShip(SHIP_A)).toEqual({ 0: AG(9), 1: AG(8) });
      expect(fake._rowsFor(SHIP_A).length).toBe(2);
    });

    it('an empty map clears all slots and issues no insert', async () => {
      await ShipSlots.setForShip(SHIP_A, { 0: AG(1), 1: AG(2) });
      const callsBefore = fake._opCount('insert');
      const ok = await ShipSlots.setForShip(SHIP_A, {});
      expect(ok).toBe(true);
      expect(fake._rowsFor(SHIP_A).length).toBe(0);
      // Replace-all deletes, but with nothing to write it must not insert.
      expect(fake._opCount('insert')).toBe(callsBefore);
    });

    it('does not touch other ships when replacing one ship', async () => {
      await ShipSlots.setForShip(SHIP_B, { 0: AG(9) });
      await ShipSlots.setForShip(SHIP_A, { 0: AG(1) });
      expect(await ShipSlots.getForShip(SHIP_B)).toEqual({ 0: AG(9) });
    });

    it('skips assignment keys that are not numeric', async () => {
      const ok = await ShipSlots.setForShip(SHIP_A, { 0: AG(1), foo: AG(2) });
      expect(ok).toBe(true);
      expect(await ShipSlots.getForShip(SHIP_A)).toEqual({ 0: AG(1) });
    });

    it('applies a numeric-keyed roleMap to the written rows', async () => {
      await ShipSlots.setForShip(SHIP_A, { 0: AG(1) }, { roleMap: { 0: 'captain' } });
      expect(fake._rowsFor(SHIP_A)[0].role_type).toBe('captain');
    });

    it('applies a string-keyed roleMap (callers may key by string index)', async () => {
      await ShipSlots.setForShip(SHIP_A, { 0: AG(1) }, { roleMap: { '0': 'comms' } });
      expect(fake._rowsFor(SHIP_A)[0].role_type).toBe('comms');
    });

    it('writes role_type null when no roleMap entry exists for a slot', async () => {
      await ShipSlots.setForShip(SHIP_A, { 0: AG(1) });
      expect(fake._rowsFor(SHIP_A)[0].role_type).toBeNull();
    });

    it('returns false for a falsy ship id', async () => {
      expect(await ShipSlots.setForShip(null, { 0: AG(1) })).toBe(false);
      expect(await ShipSlots.setForShip('', { 0: AG(1) })).toBe(false);
    });

    it('returns false and skips the insert when the delete errors', async () => {
      fake._failOnce('delete', { message: 'delete blocked' });
      const ok = await ShipSlots.setForShip(SHIP_A, { 0: AG(1) });
      expect(ok).toBe(false);
      expect(fake._opCount('insert')).toBe(0);
    });

    it('returns false when the insert errors', async () => {
      fake._failOnce('insert', { message: 'insert blocked' });
      const ok = await ShipSlots.setForShip(SHIP_A, { 0: AG(1) });
      expect(ok).toBe(false);
    });

    it('returns false when the delete throws', async () => {
      fake._throwOnce('delete');
      expect(await ShipSlots.setForShip(SHIP_A, { 0: AG(1) })).toBe(false);
    });

    it('returns false when the insert throws', async () => {
      fake._throwOnce('insert');
      expect(await ShipSlots.setForShip(SHIP_A, { 0: AG(1) })).toBe(false);
    });
  });

  describe('setSlot (single upsert)', () => {
    it('upserts one row, translating the 0-indexed key to slot_position', async () => {
      const ok = await ShipSlots.setSlot(SHIP_A, 2, AG(7));
      expect(ok).toBe(true);
      const row = fake._rowsFor(SHIP_A)[0];
      expect(row.slot_position).toBe(3);
      expect(row.user_agent_id).toBe(AG(7));
    });

    it('accepts slot index 0 (must not be treated as missing)', async () => {
      // slotIndex == null guards null/undefined only; 0 is a valid slot (UI Slot 1).
      const ok = await ShipSlots.setSlot(SHIP_A, 0, AG(1));
      expect(ok).toBe(true);
      expect(fake._rowsFor(SHIP_A)[0].slot_position).toBe(1);
    });

    it('updates in place on conflict rather than duplicating the slot', async () => {
      await ShipSlots.setSlot(SHIP_A, 0, AG(1));
      await ShipSlots.setSlot(SHIP_A, 0, AG(2));
      const rows = fake._rowsFor(SHIP_A);
      expect(rows.length).toBe(1);
      expect(rows[0].user_agent_id).toBe(AG(2));
    });

    it('targets the composite unique index in onConflict', async () => {
      await ShipSlots.setSlot(SHIP_A, 0, AG(1));
      const call = fake._calls().find(c => c.op === 'upsert');
      expect(call.opts).toEqual({ onConflict: 'user_spaceship_id,slot_position' });
    });

    it('applies opts.roleType', async () => {
      await ShipSlots.setSlot(SHIP_A, 1, AG(3), { roleType: 'analytics' });
      expect(fake._rowsFor(SHIP_A)[0].role_type).toBe('analytics');
    });

    it('returns false for a falsy ship id', async () => {
      expect(await ShipSlots.setSlot(null, 0, AG(1))).toBe(false);
      expect(fake._calls().length).toBe(0);
    });

    it('returns false when slotIndex is null or undefined', async () => {
      expect(await ShipSlots.setSlot(SHIP_A, null, AG(1))).toBe(false);
      expect(await ShipSlots.setSlot(SHIP_A, undefined, AG(1))).toBe(false);
      expect(fake._calls().length).toBe(0);
    });

    it('returns false when the upsert errors', async () => {
      fake._failOnce('upsert', { message: 'upsert blocked' });
      expect(await ShipSlots.setSlot(SHIP_A, 0, AG(1))).toBe(false);
    });

    it('returns false when the upsert throws', async () => {
      fake._throwOnce('upsert');
      expect(await ShipSlots.setSlot(SHIP_A, 0, AG(1))).toBe(false);
    });
  });

  describe('clearSlot', () => {
    it('nulls the agent id but keeps the slot row dense', async () => {
      await ShipSlots.setSlot(SHIP_A, 0, AG(1));
      const ok = await ShipSlots.clearSlot(SHIP_A, 0);
      expect(ok).toBe(true);
      const rows = fake._rowsFor(SHIP_A);
      expect(rows.length).toBe(1);
      expect(rows[0].user_agent_id).toBeNull();
      expect(rows[0].slot_position).toBe(1);
    });

    it('propagates a false result from the underlying setSlot', async () => {
      fake._failOnce('upsert', { message: 'blocked' });
      expect(await ShipSlots.clearSlot(SHIP_A, 0)).toBe(false);
    });
  });

  describe('deleteForShip', () => {
    it('removes every slot row for the ship and returns true', async () => {
      await ShipSlots.setForShip(SHIP_A, { 0: AG(1), 1: AG(2) });
      const ok = await ShipSlots.deleteForShip(SHIP_A);
      expect(ok).toBe(true);
      expect(fake._rowsFor(SHIP_A).length).toBe(0);
    });

    it('is idempotent on a ship with no rows', async () => {
      expect(await ShipSlots.deleteForShip(SHIP_A)).toBe(true);
      expect(await ShipSlots.deleteForShip(SHIP_A)).toBe(true);
    });

    it('leaves other ships intact', async () => {
      await ShipSlots.setForShip(SHIP_A, { 0: AG(1) });
      await ShipSlots.setForShip(SHIP_B, { 0: AG(9) });
      await ShipSlots.deleteForShip(SHIP_A);
      expect(await ShipSlots.getForShip(SHIP_B)).toEqual({ 0: AG(9) });
    });

    it('returns false for a falsy id without hitting the DB', async () => {
      expect(await ShipSlots.deleteForShip(null)).toBe(false);
      expect(await ShipSlots.deleteForShip('')).toBe(false);
      expect(fake._calls().length).toBe(0);
    });

    it('returns false when the delete errors', async () => {
      fake._failOnce('delete', { message: 'delete blocked' });
      expect(await ShipSlots.deleteForShip(SHIP_A)).toBe(false);
    });

    it('returns false when the delete throws', async () => {
      fake._throwOnce('delete');
      expect(await ShipSlots.deleteForShip(SHIP_A)).toBe(false);
    });
  });
});
