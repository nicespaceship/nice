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

  it('forwards blueprint_id to the INSERT when a worker slot carries the umbrella UUID', async () => {
    // Post-2026-05-25 fix: worker (specialist) slots also receive a real
    // agent_blueprints UUID from ship_slots.default_agent_id — the wired
    // umbrella's id (google-workspace, hubspot, etc.). _persistSlotAgent
    // forwards it the same way it forwards the captain UUID; the FK
    // resolves to the shared umbrella row and the runtime inherits its
    // tools / system_prompt via blueprint_id + the agent-executor
    // capability_id fallback.
    globalThis.State.set('user', { id: 'user-worker-fixed' });
    const agent = {
      id: 'agent-worker-fixed-1',
      name: 'Front Desk Coordinator',
      rarity: 'Common',
      blueprint_id: '78e51819-e9dc-4109-9d50-24fd2c1ac6e8', // google-workspace
      config: {
        role: 'Front Desk Coordinator',
        type: 'Agent',
        capability_id: '78e51819-e9dc-4109-9d50-24fd2c1ac6e8',
      },
    };
    await ShipSetupWizard._persistSlotAgent(agent);
    expect(_capturedRows[0].row.blueprint_id).toBe('78e51819-e9dc-4109-9d50-24fd2c1ac6e8');
    expect(_capturedRows[0].row.config.capability_id).toBe('78e51819-e9dc-4109-9d50-24fd2c1ac6e8');
  });

  it('omits blueprint_id from the INSERT when it is a synthetic non-UUID id (legacy fallback)', async () => {
    // Defensive gate for the path where umbrella resolution fails — the
    // wizard then falls back to a synthetic `<ship>-crew-N` string so the
    // legacy config.blueprint_id readers still resolve back to the right
    // crew node. The FK column rejects non-UUID strings, so the persist
    // path must drop them and let the column stay NULL.
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

describe('ShipSetupWizard._getAgentCatalog ship-exclusive filter', () => {
  // Mythic ships seed bespoke crew tagged `<ship-slug>-exclusive`. Those
  // crew must never appear in another ship's slot dropdown — Agent Smith
  // does not belong on The Salon. The filter inside _getAgentCatalog
  // strips any agent whose `<x>-exclusive` tag does not match the current
  // blueprint's slug.
  let _origBlueprints;

  beforeEach(() => {
    _origBlueprints = globalThis.Blueprints;
    const pool = [
      { id: 'a1', name: 'Generic HubSpot Agent', tags: ['sales','hubspot'] },
      { id: 'a2', name: 'Morpheus',     tags: ['the-matrix-exclusive','captain','the-matrix'] },
      { id: 'a3', name: 'Neo',          tags: ['the-matrix-exclusive','product','the-matrix'] },
      { id: 'a4', name: 'Generic Notion Agent', tags: ['documentation','notion'] },
      { id: 'a5', name: 'Founder Slot', tags: ['the-founders-office-exclusive','captain'] },
    ];
    globalThis.Blueprints = { listAgents: () => pool };
  });

  it.afterEach?.(() => {
    globalThis.Blueprints = _origBlueprints;
  });

  it('hides matrix-exclusive agents when activating a non-Matrix ship', () => {
    ShipSetupWizard._setBlueprintForTest({ slug: 'the-galley', name: 'The Galley' });
    const pool = ShipSetupWizard._getAgentCatalog();
    const names = pool.map(a => a.name);
    expect(names).toContain('Generic HubSpot Agent');
    expect(names).toContain('Generic Notion Agent');
    expect(names).not.toContain('Morpheus');
    expect(names).not.toContain('Neo');
    expect(names).not.toContain('Founder Slot');
  });

  it('shows matrix-exclusive agents when activating The Matrix itself', () => {
    ShipSetupWizard._setBlueprintForTest({ slug: 'the-matrix', name: 'The Matrix' });
    const pool = ShipSetupWizard._getAgentCatalog();
    const names = pool.map(a => a.name);
    expect(names).toContain('Morpheus');
    expect(names).toContain('Neo');
    expect(names).toContain('Generic HubSpot Agent'); // generic umbrellas still visible
    expect(names).not.toContain('Founder Slot');      // foreign exclusive still hidden
  });

  it('treats agents with no tags as universal (not exclusive)', () => {
    globalThis.Blueprints = { listAgents: () => [
      { id: 'a1', name: 'Untagged Agent' },
      { id: 'a2', name: 'Empty Tags', tags: [] },
    ] };
    ShipSetupWizard._setBlueprintForTest({ slug: 'the-galley' });
    const pool = ShipSetupWizard._getAgentCatalog();
    expect(pool.map(a => a.name)).toEqual(['Untagged Agent', 'Empty Tags']);
  });
});

describe('ShipSetupWizard._buildSlotConfig', () => {
  // The slot's role_type (from ship_slots.role_type, mapped to crewMember.role
  // in _translateSpaceshipBlueprintRow) drives captain dispatch routing.
  // Without explicit handling, the umbrella's role_type spreads in first and
  // overwrites the slot's intent — e.g., a FOH Lead slot defined as
  // `communications` would inherit `marketing` from the Slack umbrella.

  it('stamps the slot role_type explicitly so it wins over the umbrella spread', () => {
    // Slack umbrella declares role_type='marketing'; FOH Lead slot declares
    // role_type='communications'. Slot wins — dispatch routing needs it.
    const cfg = ShipSetupWizard._buildSlotConfig({
      umbrellaCfg: { role_type: 'marketing', tools: ['slack_post'], system_prompt: 'Slack umbrella prompt' },
      crewMemberCfg: null,
      agentName: 'FOH Lead',
      defaultUmbrellaId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      slotRoleType: 'communications',
    });
    expect(cfg.role_type).toBe('communications');
    expect(cfg.tools).toEqual(['slack_post']);
    expect(cfg.system_prompt).toBe('Slack umbrella prompt');
  });

  it('falls back to the umbrella role_type when the slot does not define one', () => {
    // Pre-three-layer ships seeded without per-slot role_type still get the
    // umbrella's role_type so triage continues to resolve them.
    const cfg = ShipSetupWizard._buildSlotConfig({
      umbrellaCfg: { role_type: 'sales', tools: ['hubspot_search'] },
      crewMemberCfg: null,
      agentName: 'Sales Rep',
      defaultUmbrellaId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      slotRoleType: null,
    });
    expect(cfg.role_type).toBe('sales');
  });

  it('captain slot role_type=captain propagates so mission-runner._isCaptainAgent matches', () => {
    // Captain dispatch detection in mission-runner relies on config.role_type
    // === 'captain'. The captain slot's ship_slots row carries that value and
    // it must reach the user_agents.config column unchanged.
    const cfg = ShipSetupWizard._buildSlotConfig({
      umbrellaCfg: { role_type: 'specialist', system_prompt: 'You are the captain.' },
      crewMemberCfg: null,
      agentName: 'Captain Janeway',
      defaultUmbrellaId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      slotRoleType: 'captain',
    });
    expect(cfg.role_type).toBe('captain');
    expect(cfg.system_prompt).toBe('You are the captain.');
  });

  it('crew member config role_type is used when neither slot nor umbrella defines one', () => {
    // Pre-Phase-C.2 catalog ships still ship the legacy per-slot config object
    // via crew_overrides. Honor it as the middle-of-three fallback.
    const cfg = ShipSetupWizard._buildSlotConfig({
      umbrellaCfg: { tools: ['x'] },
      crewMemberCfg: { role_type: 'engineering' },
      agentName: 'Geordi',
      defaultUmbrellaId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      slotRoleType: null,
    });
    expect(cfg.role_type).toBe('engineering');
  });

  it('sparse fallback path (no umbrella, no crewMemberCfg) still stamps the slot role_type', () => {
    // Guest / early-boot path before Blueprints finishes loading. The function
    // returns a minimal stub config; the slot's role_type should still ride
    // along so a later umbrella resolve doesn't erase routing info.
    const cfg = ShipSetupWizard._buildSlotConfig({
      umbrellaCfg: null,
      crewMemberCfg: null,
      agentName: 'Anon Slot',
      defaultUmbrellaId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      slotRoleType: 'operations',
    });
    expect(cfg.role_type).toBe('operations');
    expect(cfg.capability_id).toBe('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
  });

  it('sparse fallback with no slotRoleType returns a config without role_type', () => {
    // Defensive: when no source has a role_type, don't fabricate one — leave
    // role_type absent so downstream resolvers can match by other signals
    // (capability_tags, agentRole, etc.) without a spurious null entry.
    const cfg = ShipSetupWizard._buildSlotConfig({
      umbrellaCfg: null,
      crewMemberCfg: null,
      agentName: 'Anon Slot',
      defaultUmbrellaId: null,
      slotRoleType: null,
    });
    expect('role_type' in cfg).toBe(false);
  });
});
