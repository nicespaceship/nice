import { describe, it, expect, beforeEach, vi } from 'vitest';

// Load the module the same way the harness loads ship-setup-wizard.test.js:
// rewrite top-level `const X =` so the IIFE binds to globalThis.
const { readFileSync } = await import('fs');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
const __dir = dirname(fileURLToPath(import.meta.url));
let code = readFileSync(resolve(__dir, '../lib/blueprint-backfill.js'), 'utf-8');
code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
eval(code);

describe('BlueprintBackfill.runOnLoad', () => {
  // 3b backfill: detect activated ships whose `slot_assignments` carry
  // non-UUID synthetic ids (pre-#442 data, or post-localStorage-wipe),
  // mint user_agents rows from either the `nice-custom-agents` cache
  // or the persona snapshot in `slots.crew[idx]`, and rewrite the
  // assignments in place. Idempotent — every login re-runs it.

  const VALID_UUID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const VALID_UUID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const VALID_UUID_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  let _origSB;
  let _origNotify;
  let _state; // mock per-table store
  let _createCounter;
  let _createBehavior; // 'success' | 'error' | 'errorOnFirst'
  let _updates; // capture user_spaceships UPDATE calls

  function makeFalcon({ withConfigAssignments = true, withSlotsAssignments = true } = {}) {
    const slotAssignments = {
      0: 'agent-1778179922739-0',
      1: 'agent-1778179922739-1',
      2: 'agent-1778179922740-2',
    };
    const crew = [
      { id: 'n1', type: 'agent', label: 'Han Solo',     config: { agentRole: 'Captain' },     rarity: 'Legendary' },
      { id: 'n2', type: 'agent', label: 'Chewbacca',    config: { agentRole: 'Co-Pilot' },    rarity: 'Legendary' },
      { id: 'n3', type: 'agent', label: 'Lando',        config: { agentRole: 'Diplomacy' },   rarity: 'Epic' },
    ];
    return {
      id: 'ship-falcon-uuid',
      user_id: 'user-han',
      name: 'Millennium Falcon',
      blueprint_id: 'ship-60',
      status: 'deployed',
      rarity: 'Legendary',
      slots: {
        crew,
        ...(withSlotsAssignments ? { slot_assignments: { ...slotAssignments } } : {}),
      },
      config: withConfigAssignments ? { slot_assignments: { ...slotAssignments } } : {},
    };
  }

  beforeEach(() => {
    _state = { user_spaceships: [], user_agents: [] };
    _createCounter = 0;
    _createBehavior = 'success';
    _updates = [];

    _origSB = globalThis.SB;
    _origNotify = globalThis.Notify;
    globalThis.SB = {
      isReady: () => true,
      isOnline: () => true,
      db: (table) => ({
        list: async () => _state[table] || [],
        create: async (row) => {
          if (_createBehavior === 'error') throw new Error('create failed');
          if (_createBehavior === 'errorOnFirst' && _createCounter === 0) {
            _createCounter++;
            throw new Error('create failed once');
          }
          const uuids = [VALID_UUID_A, VALID_UUID_B, VALID_UUID_C];
          const id = uuids[_createCounter] || ('uuid-extra-' + _createCounter);
          _createCounter++;
          const inserted = { id, ...row };
          _state[table] = (_state[table] || []).concat([inserted]);
          return inserted;
        },
        update: async (id, changes) => {
          if (table === 'user_spaceships') _updates.push({ id, changes });
          const rows = _state[table] || [];
          const idx = rows.findIndex((r) => r.id === id);
          if (idx >= 0) rows[idx] = { ...rows[idx], ...changes };
          return rows[idx];
        },
      }),
    };
    globalThis.Notify = { send: vi.fn() };

    // setup.js runs `globalThis.State._reset()` in its own beforeEach but
    // this file imports the module directly, so reset explicitly here too.
    globalThis.State._reset();
  });

  it('returns 0 fixed when no user is signed in (guest)', async () => {
    const result = await BlueprintBackfill.runOnLoad();
    expect(result).toEqual({ fixedSlots: 0, ships: 0, createdAgents: 0 });
    expect(_updates.length).toBe(0);
  });

  it('returns 0 fixed when SB is not ready', async () => {
    globalThis.State.set('user', { id: 'user-han' });
    globalThis.SB.isReady = () => false;
    const result = await BlueprintBackfill.runOnLoad();
    expect(result).toEqual({ fixedSlots: 0, ships: 0, createdAgents: 0 });
  });

  it('returns 0 fixed when offline', async () => {
    globalThis.State.set('user', { id: 'user-han' });
    globalThis.SB.isOnline = () => false;
    const result = await BlueprintBackfill.runOnLoad();
    expect(result).toEqual({ fixedSlots: 0, ships: 0, createdAgents: 0 });
  });

  it('returns 0 fixed when the user has no spaceships', async () => {
    globalThis.State.set('user', { id: 'user-han' });
    const result = await BlueprintBackfill.runOnLoad();
    expect(result).toEqual({ fixedSlots: 0, ships: 0, createdAgents: 0 });
  });

  it('is idempotent — no-op when every assignment is already a UUID', async () => {
    globalThis.State.set('user', { id: 'user-han' });
    _state.user_spaceships = [
      {
        id: 'ship-1',
        user_id: 'user-han',
        name: 'Already Migrated',
        config: { slot_assignments: { 0: VALID_UUID_A, 1: VALID_UUID_B } },
        slots: { crew: [{ label: 'A' }, { label: 'B' }] },
      },
    ];
    const result = await BlueprintBackfill.runOnLoad();
    expect(result).toEqual({ fixedSlots: 0, ships: 0, createdAgents: 0 });
    expect(_updates.length).toBe(0);
    expect(_state.user_agents.length).toBe(0);
  });

  it('falcon-style: creates user_agents rows from slots.crew snapshot when localStorage is empty', async () => {
    // Post-wipe scenario: nice-custom-agents was cleared, so the synthetic
    // ids no longer resolve in localStorage. Backfill must reconstruct
    // each slot character from the persona snapshot in slots.crew[idx].
    globalThis.State.set('user', { id: 'user-han' });
    _state.user_spaceships = [makeFalcon()];

    const result = await BlueprintBackfill.runOnLoad();

    expect(result.fixedSlots).toBe(3);
    expect(result.ships).toBe(1);
    expect(result.createdAgents).toBe(3);
    expect(_state.user_agents.length).toBe(3);

    // Persona, role, and rarity all sourced from slots.crew[idx].
    // user_agents has no `category` column — role lives in config.agentRole.
    const han = _state.user_agents.find((a) => a.name === 'Han Solo');
    expect(han).toBeDefined();
    expect(han.rarity).toBe('Legendary');
    expect(han).not.toHaveProperty('category');
    expect(han.config.agentRole).toBe('Captain');
    expect(han.config.role).toBe('Captain');
    expect(han.config.type).toBe('Agent');

    const lando = _state.user_agents.find((a) => a.name === 'Lando');
    expect(lando.rarity).toBe('Epic');
    expect(lando.config.agentRole).toBe('Diplomacy');

    // Ship row updated with new UUIDs in BOTH config.slot_assignments
    // and slots.slot_assignments (so legacy readers stay coherent).
    expect(_updates.length).toBe(1);
    const updatedShip = _updates[0].changes;
    expect(updatedShip.config.slot_assignments[0]).toBe(VALID_UUID_A);
    expect(updatedShip.config.slot_assignments[1]).toBe(VALID_UUID_B);
    expect(updatedShip.config.slot_assignments[2]).toBe(VALID_UUID_C);
    expect(updatedShip.slots.slot_assignments[0]).toBe(VALID_UUID_A);
    expect(updatedShip.slots.slot_assignments[1]).toBe(VALID_UUID_B);
    expect(updatedShip.slots.slot_assignments[2]).toBe(VALID_UUID_C);
  });

  it('prefers nice-custom-agents data when the synthetic id is still cached', async () => {
    // Pre-wipe scenario: localStorage still holds the agent. Backfill
    // should preserve user customizations (custom llm_engine, tools)
    // rather than reverting to the catalog-snapshot defaults.
    globalThis.State.set('user', { id: 'user-han' });
    localStorage.setItem(
      Utils.KEYS.customAgents,
      JSON.stringify([
        {
          id: 'agent-1778179922739-0',
          name: 'Han Solo',
          rarity: 'Legendary',
          config: {
            agentRole: 'Captain',
            llm_engine: 'claude-sonnet-4-6',
            tools: ['hubspot_search'],
            customField: 'persisted',
          },
        },
      ])
    );
    _state.user_spaceships = [makeFalcon()];

    await BlueprintBackfill.runOnLoad();

    const han = _state.user_agents.find((a) => a.name === 'Han Solo');
    expect(han.config.llm_engine).toBe('claude-sonnet-4-6');
    expect(han.config.tools).toEqual(['hubspot_search']);
    expect(han.config.customField).toBe('persisted');
    expect(han.config.agentRole).toBe('Captain');
  });

  it('skips UUID slots and only rewrites synthetic ones', async () => {
    const PREEXISTING = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    globalThis.State.set('user', { id: 'user-han' });
    _state.user_spaceships = [
      {
        id: 'ship-mixed',
        user_id: 'user-han',
        name: 'Half-Migrated',
        config: {
          slot_assignments: {
            0: PREEXISTING,        // already migrated — leave alone
            1: 'agent-stranded-1', // needs backfill
          },
        },
        slots: {
          crew: [
            { label: 'Already Real', config: { agentRole: 'Captain' }, rarity: 'Legendary' },
            { label: 'Stranded', config: { agentRole: 'Engineering' }, rarity: 'Epic' },
          ],
        },
      },
    ];

    const result = await BlueprintBackfill.runOnLoad();

    expect(result.fixedSlots).toBe(1);
    expect(result.createdAgents).toBe(1);
    expect(_state.user_agents.length).toBe(1);
    expect(_state.user_agents[0].name).toBe('Stranded');

    const updated = _updates[0].changes.config.slot_assignments;
    expect(updated[0]).toBe(PREEXISTING); // untouched
    expect(updated[1]).toBe(VALID_UUID_A); // first create() call returns UUID_A
  });

  it('skips slots whose crew snapshot is missing AND not in localStorage (no source data)', async () => {
    // Synthetic id at slot 5, but slots.crew only has 3 entries and no
    // localStorage row for the id. Nothing to reconstruct from — leave
    // the slot untouched rather than fabricate placeholder data.
    globalThis.State.set('user', { id: 'user-han' });
    _state.user_spaceships = [
      {
        id: 'ship-gap',
        user_id: 'user-han',
        name: 'Crew Gap',
        config: {
          slot_assignments: {
            0: 'agent-fixable-0',
            5: 'agent-orphaned-5',
          },
        },
        slots: {
          crew: [{ label: 'Slot Zero', config: { agentRole: 'Captain' }, rarity: 'Common' }],
        },
      },
    ];

    const result = await BlueprintBackfill.runOnLoad();

    // Slot 0 fixable (crew[0] exists), slot 5 has no source — leave it.
    expect(result.fixedSlots).toBe(1);
    expect(result.createdAgents).toBe(1);
    const updated = _updates[0].changes.config.slot_assignments;
    expect(updated[0]).toBe(VALID_UUID_A);
    expect(updated[5]).toBe('agent-orphaned-5');
  });

  it('falls back to slots.slot_assignments when config.slot_assignments is empty', async () => {
    // Legacy row shape — pre-#288 ships only have slots.slot_assignments.
    globalThis.State.set('user', { id: 'user-han' });
    _state.user_spaceships = [makeFalcon({ withConfigAssignments: false })];

    const result = await BlueprintBackfill.runOnLoad();

    expect(result.fixedSlots).toBe(3);
    expect(_updates[0].changes.slots.slot_assignments[0]).toBe(VALID_UUID_A);
  });

  it('does not crash when user_spaceships UPDATE fails — moves on to next ship', async () => {
    globalThis.State.set('user', { id: 'user-han' });
    _state.user_spaceships = [makeFalcon()];
    // Mock SB.db('user_spaceships').update to throw
    const origDb = globalThis.SB.db;
    globalThis.SB.db = (table) => {
      const handle = origDb(table);
      if (table === 'user_spaceships') {
        return { ...handle, update: async () => { throw new Error('RLS denied'); } };
      }
      return handle;
    };

    const result = await BlueprintBackfill.runOnLoad();

    // user_agents rows still got created (the side-effect can't be
    // rolled back without a transaction, which we don't have); but
    // the function reports 0 ships touched because the row update
    // failed.
    expect(result.ships).toBe(0);
    expect(_state.user_agents.length).toBe(3);
  });

  it('refreshes State.agents and State.spaceships after a successful backfill', async () => {
    globalThis.State.set('user', { id: 'user-han' });
    globalThis.State.set('agents', []);
    globalThis.State.set('spaceships', [
      { id: 'ship-falcon-uuid', name: 'Millennium Falcon', config: {} },
    ]);
    _state.user_spaceships = [makeFalcon()];

    await BlueprintBackfill.runOnLoad();

    const stateAgents = globalThis.State.get('agents');
    expect(stateAgents.length).toBe(3);
    expect(stateAgents.map((a) => a.name).sort()).toEqual(['Chewbacca', 'Han Solo', 'Lando']);

    const stateShips = globalThis.State.get('spaceships');
    const falcon = stateShips.find((s) => s.id === 'ship-falcon-uuid');
    expect(falcon.config.slot_assignments[0]).toBe(VALID_UUID_A);
    expect(falcon.config.slot_assignments[1]).toBe(VALID_UUID_B);
  });

  it('emits a Notify message summarizing the recovery', async () => {
    globalThis.State.set('user', { id: 'user-han' });
    _state.user_spaceships = [makeFalcon()];

    await BlueprintBackfill.runOnLoad();

    expect(globalThis.Notify.send).toHaveBeenCalledTimes(1);
    const arg = globalThis.Notify.send.mock.calls[0][0];
    expect(arg.title).toBe('Crew restored');
    expect(arg.message).toContain('3 slots');
    expect(arg.message).toContain('1 ship');
    expect(arg.type).toBe('system');
  });

  it.afterEach?.(() => {
    globalThis.SB = _origSB;
    globalThis.Notify = _origNotify;
  });
});

describe('BlueprintBackfill helpers', () => {
  it('_isUuid recognises canonical UUID v4 strings', () => {
    expect(BlueprintBackfill._isUuid('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(true);
    expect(BlueprintBackfill._isUuid('agent-1778179922739-0')).toBe(false);
    expect(BlueprintBackfill._isUuid('bp-agent-github')).toBe(false);
    expect(BlueprintBackfill._isUuid('')).toBe(false);
    expect(BlueprintBackfill._isUuid(null)).toBe(false);
  });

  it('_readAssignments prefers config.slot_assignments over slots.slot_assignments', () => {
    const ship = {
      config: { slot_assignments: { 0: 'fresh' } },
      slots: { slot_assignments: { 0: 'stale' } },
    };
    expect(BlueprintBackfill._readAssignments(ship)).toEqual({ 0: 'fresh' });
  });

  it('_readAssignments falls back to slots.slot_assignments when config side is empty', () => {
    const ship = {
      config: {},
      slots: { slot_assignments: { 0: 'only-here' } },
    };
    expect(BlueprintBackfill._readAssignments(ship)).toEqual({ 0: 'only-here' });
  });

  it('_shipNeedsBackfill returns true if ANY assignment is non-UUID', () => {
    const valid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    expect(
      BlueprintBackfill._shipNeedsBackfill({ config: { slot_assignments: { 0: valid } } })
    ).toBe(false);
    expect(
      BlueprintBackfill._shipNeedsBackfill({ config: { slot_assignments: { 0: 'agent-x' } } })
    ).toBe(true);
    expect(
      BlueprintBackfill._shipNeedsBackfill({
        config: { slot_assignments: { 0: valid, 1: 'agent-x' } },
      })
    ).toBe(true);
  });
});
