import { describe, it, expect, beforeEach } from 'vitest';

// ShipSetupWizard reaches for `document` at module init via `_onKey`,
// but jsdom (the vitest environment) supplies a real document — so we
// can load the module as-is.
const { readFileSync } = await import('fs');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
const __dir = dirname(fileURLToPath(import.meta.url));
let code = readFileSync(resolve(__dir, '../lib/ship-setup-wizard.js'), 'utf-8');
code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
eval(code);

describe('ShipSetupWizard._persistSlotAgent', () => {
  // Forward-fix for the 2026-05-07 Falcon failure mode: slot characters
  // created by ship-setup-wizard.js used to live ONLY in localStorage's
  // `nice-custom-agents`. A localStorage wipe stranded `slot_assignments`
  // referencing dangling synthetic ids and broke every activated ship's
  // dispatch chain. _persistSlotAgent mirrors the row to user_agents so
  // signed-in users get a durable Supabase store from activation onward.

  let _origSB;
  let _capturedRows;
  let _createdId;
  let _createBehavior; // 'success' | 'error'

  beforeEach(() => {
    _capturedRows = [];
    _createdId = 'uuid-from-supabase-aaaaaaaaaaaa';
    _createBehavior = 'success';

    _origSB = globalThis.SB;
    globalThis.SB = {
      isReady: () => true,
      db: (table) => ({
        create: async (row) => {
          _capturedRows.push({ table, row });
          if (_createBehavior === 'error') throw new Error('Supabase create failed');
          return { id: _createdId, ...row };
        },
      }),
    };

    globalThis.State._reset();
  });

  it('returns the input agent unchanged when no user is signed in (guest)', async () => {
    // No State.user set — caller is a guest. Don't write to user_agents;
    // the synthetic id will travel with the agent into localStorage and
    // get migrated on first sign-in via Blueprints.migrateGuestState.
    const agent = {
      id: 'agent-1735000000000-0',
      name: 'R2-D2',
      rarity: 'Legendary',
      config: { role: 'Engineering', capability_id: 'bp-agent-github' },
    };
    const result = await ShipSetupWizard._persistSlotAgent(agent);
    expect(result).toEqual(agent);
    expect(_capturedRows.length).toBe(0);
  });

  it('returns the input agent unchanged when SB is not ready', async () => {
    globalThis.SB.isReady = () => false;
    globalThis.State.set('user', { id: 'user-abc' });
    const agent = { id: 'agent-x', name: 'Stub', rarity: 'Common', config: {} };
    const result = await ShipSetupWizard._persistSlotAgent(agent);
    expect(result).toEqual(agent);
    expect(_capturedRows.length).toBe(0);
  });

  it('inserts a user_agents row when signed in and replaces the synthetic id with the Supabase UUID', async () => {
    globalThis.State.set('user', { id: 'user-falcon-han' });
    const agent = {
      id: 'agent-1735000000000-0',
      name: 'R2-D2',
      rarity: 'Legendary',
      config: { role: 'Engineering', capability_id: 'bp-agent-github', llm_engine: 'claude-sonnet-4-6' },
      flavor: 'Astromech.',
    };
    const result = await ShipSetupWizard._persistSlotAgent(agent);

    // Row written with the canonical shape consumed by
    // _loadUserCreations in blueprints.js: (user_id, name, rarity,
    // status, config) — everything else folded into config JSONB.
    expect(_capturedRows.length).toBe(1);
    expect(_capturedRows[0].table).toBe('user_agents');
    expect(_capturedRows[0].row).toEqual({
      user_id: 'user-falcon-han',
      name: 'R2-D2',
      rarity: 'Legendary',
      status: 'idle',
      config: { role: 'Engineering', capability_id: 'bp-agent-github', llm_engine: 'claude-sonnet-4-6' },
    });

    // Returned agent carries the Supabase id and a supabase_id mirror;
    // the rest of the agent shape (flavor, config) is preserved so the
    // wizard's State.agents push and localStorage write don't lose
    // data added beyond the persisted columns.
    expect(result.id).toBe(_createdId);
    expect(result.supabase_id).toBe(_createdId);
    expect(result.name).toBe('R2-D2');
    expect(result.flavor).toBe('Astromech.');
    expect(result.config.capability_id).toBe('bp-agent-github');
  });

  it('falls back to the input agent when the Supabase create throws', async () => {
    // Network blip / RLS denial / schema drift — the wizard must still
    // complete locally so the user gets a working ship; the agent will
    // ride the localStorage path until the next sign-in migration.
    globalThis.State.set('user', { id: 'user-network-flap' });
    _createBehavior = 'error';
    const agent = {
      id: 'agent-fallback-1',
      name: 'Geordi',
      rarity: 'Epic',
      config: { role: 'Engineering' },
    };
    const result = await ShipSetupWizard._persistSlotAgent(agent);
    expect(result).toEqual(agent);
    expect(_capturedRows.length).toBe(1); // attempted once, then swallowed
  });

  it('defaults missing rarity and status to Common / idle on the persisted row', async () => {
    // Wizard auto-create paths sometimes hand off agents without
    // explicit rarity/status. The persistence shape needs both so the
    // boot hydration in blueprints.js doesn't drop them as null.
    globalThis.State.set('user', { id: 'user-defaults' });
    const agent = { id: 'agent-thin', name: 'Auto Slot', config: {} };
    await ShipSetupWizard._persistSlotAgent(agent);
    expect(_capturedRows[0].row.rarity).toBe('Common');
    expect(_capturedRows[0].row.status).toBe('idle');
  });

  it('forwards blueprint_id to the INSERT when it is a UUID (captain slot)', async () => {
    // Captain slots receive the the-<ship>-specialist UUID via
    // ship_slots.default_agent_id. Persisting it as the top-level FK
    // lets the runtime resolve the specialist blueprint for tools +
    // prompt without falling through to the legacy config-only path.
    globalThis.State.set('user', { id: 'user-captain' });
    const agent = {
      id: 'agent-captain-1',
      name: 'Founder',
      rarity: 'Rare',
      blueprint_id: '8a8e3ffc-47e0-4ce9-8e2d-b6b3b3ff5d9a', // the-loft-specialist
      config: { role: 'Founder', type: 'Agent' },
    };
    await ShipSetupWizard._persistSlotAgent(agent);
    expect(_capturedRows[0].row.blueprint_id).toBe('8a8e3ffc-47e0-4ce9-8e2d-b6b3b3ff5d9a');
  });

  it('omits blueprint_id from the INSERT when it is a synthetic non-UUID id (worker slot)', async () => {
    // Worker slots carry a synthetic id like `the-loft-crew-9` so the
    // legacy config.blueprint_id readers still resolve back to the right
    // crew node. The user_agents.blueprint_id FK column rejects non-UUID
    // strings, so the persist path must drop them on the floor and let
    // the column stay NULL.
    globalThis.State.set('user', { id: 'user-worker' });
    const agent = {
      id: 'agent-worker-1',
      name: 'Data Lead',
      rarity: 'Common',
      blueprint_id: 'the-loft-crew-9',
      config: { role: 'Data Lead', capability_id: '61dbc5ec-a4ef-4821-90c8-a1a629d6df89', blueprint_id: 'the-loft-crew-9' },
    };
    await ShipSetupWizard._persistSlotAgent(agent);
    expect('blueprint_id' in _capturedRows[0].row).toBe(false);
    // config.blueprint_id (the synthetic) still rides along in JSONB.
    expect(_capturedRows[0].row.config.blueprint_id).toBe('the-loft-crew-9');
  });

  it.afterEach?.(() => {
    globalThis.SB = _origSB;
  });
});

describe('ShipSetupWizard._isSlotLocked / _unlockRankName', () => {
  // Slot lock state is driven by `slot.min_class` vs the user's current
  // class. The wizard uses these helpers to skip dropdown rendering,
  // auto-assignment, and on-deploy agent creation for rank-gated slots.
  beforeEach(() => {
    globalThis.localStorage.clear();
    globalThis.State._reset();
  });

  it('slots without min_class are never locked', () => {
    expect(ShipSetupWizard._isSlotLocked({ id: 0, label: 'Captain' })).toBe(false);
    expect(ShipSetupWizard._isSlotLocked(null)).toBe(false);
  });

  it('class-1 slots are open to every user', () => {
    expect(ShipSetupWizard._isSlotLocked({ min_class: 'class-1' })).toBe(false);
  });

  it('class-2+ slots are locked for an Ensign (0 XP)', () => {
    expect(ShipSetupWizard._isSlotLocked({ min_class: 'class-2' })).toBe(true);
    expect(ShipSetupWizard._isSlotLocked({ min_class: 'class-3' })).toBe(true);
    expect(ShipSetupWizard._isSlotLocked({ min_class: 'class-4' })).toBe(true);
  });

  it('Lieutenant rank (25K XP) unlocks class-2 but not class-3', () => {
    globalThis.localStorage.setItem('nice-xp', '25000');
    expect(ShipSetupWizard._isSlotLocked({ min_class: 'class-2' })).toBe(false);
    expect(ShipSetupWizard._isSlotLocked({ min_class: 'class-3' })).toBe(true);
  });

  it('_unlockRankName resolves the gating rank name for user-facing copy', () => {
    expect(ShipSetupWizard._unlockRankName('class-2')).toBe('Lieutenant');
    expect(ShipSetupWizard._unlockRankName('class-3')).toBe('Commander');
    expect(ShipSetupWizard._unlockRankName('class-4')).toBe('Captain');
    // class-5 is subscription-only — surface the product name.
    expect(ShipSetupWizard._unlockRankName('class-5')).toBe('NICE Pro');
  });
});
