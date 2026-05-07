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

  it.afterEach?.(() => {
    globalThis.SB = _origSB;
  });
});
