import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Blueprints depends on BlueprintsView for seeds — stub it
globalThis.BlueprintsView = {
  SEED: [
    { id: 'sa1', name: 'Web Researcher', config: { role: 'Research' }, category: 'Research', rarity: 'Common', tags: ['web', 'search'], kind: 'character' },
    { id: 'sa2', name: 'Code Reviewer', config: { role: 'Code' }, category: 'Code', rarity: 'Rare', tags: ['code', 'review'], kind: 'capability', capability_tags: ['code', 'engineering'] },
    { id: 'sa3', name: 'Data Analyst', config: { role: 'Data' }, category: 'Data', rarity: 'Epic', tags: ['data', 'analytics'], kind: 'character' },
    { id: 'sa4', name: 'Content Writer', config: { role: 'Content' }, category: 'Content', rarity: 'Legendary', tags: ['content', 'writing'], kind: 'character' },
    // sa5 intentionally has no `kind` field — exercises the legacy
    // capability_tags-based fallback in listCapabilities.
    { id: 'sa5', name: 'DevOps Bot', config: { role: 'Ops' }, category: 'Ops', rarity: 'Common', description: 'Handles CI/CD pipelines', capability_tags: ['infrastructure'] },
  ],
  SPACESHIP_SEED: [
    { id: 'ship-01', name: 'Scout Mk I', class_id: 'class-1' },
    { id: 'ship-02', name: 'Cruiser Alpha', class_id: 'class-2' },
  ],
};

// Load Blueprints
const { readFileSync } = await import('fs');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
const __dir = dirname(fileURLToPath(import.meta.url));
let code = readFileSync(resolve(__dir, '../lib/blueprints.js'), 'utf-8');
code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
eval(code);

describe('Blueprints', () => {
  beforeEach(async () => {
    // Re-init seeds before each test
    await Blueprints.init();
  });

  it('should load seeds on init and report ready', () => {
    expect(Blueprints.isReady()).toBe(true);
  });

  it('should get agent by ID', () => {
    const agent = Blueprints.getAgent('sa1');
    expect(agent).not.toBeNull();
    expect(agent.name).toBe('Web Researcher');
  });

  it('should return null for unknown agent ID', () => {
    expect(Blueprints.getAgent('nonexistent')).toBeNull();
  });

  it('getAgent: guest sessions fall through to nice-custom-agents localStorage', () => {
    globalThis.State.set('user', null);
    globalThis.localStorage.setItem(
      globalThis.Utils.KEYS.customAgents,
      JSON.stringify([{ id: 'guest-only-agent', name: 'Guest', config: {} }]),
    );
    const a = Blueprints.getAgent('guest-only-agent');
    expect(a).not.toBeNull();
    expect(a.name).toBe('Guest');
  });

  it('getAgent: signed-in sessions skip localStorage (State.agents is SSOT)', () => {
    globalThis.State.set('user', { id: 'user-1' });
    globalThis.localStorage.setItem(
      globalThis.Utils.KEYS.customAgents,
      JSON.stringify([{ id: 'stale-cache-agent', name: 'Stale', config: {} }]),
    );
    expect(Blueprints.getAgent('stale-cache-agent')).toBeNull();
  });

  it('should list all agents', () => {
    const agents = Blueprints.listAgents();
    expect(agents.length).toBe(5);
  });

  it('should filter agents by rarity', () => {
    const common = Blueprints.listAgents({ rarity: 'Common' });
    expect(common.length).toBe(2);
    expect(common.every(a => a.rarity === 'Common')).toBe(true);
  });

  it('should filter agents by category (role)', () => {
    const code = Blueprints.listAgents({ category: 'Code' });
    expect(code.length).toBe(1);
    expect(code[0].id).toBe('sa2');
  });

  it('should filter agents by search term in name', () => {
    const results = Blueprints.listAgents({ search: 'researcher' });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('sa1');
  });

  it('should filter agents by search term in description', () => {
    const results = Blueprints.listAgents({ search: 'CI/CD' });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('sa5');
  });

  it('should filter agents by search term in tags', () => {
    const results = Blueprints.listAgents({ search: 'analytics' });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('sa3');
  });

  it('should get spaceship by ID', () => {
    const ship = Blueprints.getSpaceship('ship-01');
    expect(ship).not.toBeNull();
    expect(ship.name).toBe('Scout Mk I');
  });

  it('should return null for unknown spaceship ID', () => {
    expect(Blueprints.getSpaceship('nonexistent')).toBeNull();
  });

  it('should list all spaceships', () => {
    expect(Blueprints.listSpaceships().length).toBe(2);
  });

  it('should find any blueprint type via get()', () => {
    expect(Blueprints.get('sa1').name).toBe('Web Researcher');
    expect(Blueprints.get('ship-01').name).toBe('Scout Mk I');
  });

  it('should return null from get() for unknown ID', () => {
    expect(Blueprints.get('nonexistent')).toBeNull();
  });

  it('should return copies from list methods (not mutable references)', () => {
    const agents1 = Blueprints.listAgents();
    const agents2 = Blueprints.listAgents();
    expect(agents1).not.toBe(agents2);
  });

  describe('listCapabilities / listCharacters / getCapability', () => {
    it('listCapabilities returns kind=capability blueprints', () => {
      const caps = Blueprints.listCapabilities();
      const ids = caps.map(c => c.id);
      expect(ids).toContain('sa2');
    });

    it('listCapabilities also returns legacy entries with capability_tags but no kind', () => {
      const caps = Blueprints.listCapabilities();
      const ids = caps.map(c => c.id);
      // sa5 has capability_tags=['infrastructure'] but no kind field.
      expect(ids).toContain('sa5');
    });

    it('listCapabilities excludes characters', () => {
      const caps = Blueprints.listCapabilities();
      const ids = caps.map(c => c.id);
      expect(ids).not.toContain('sa1');
      expect(ids).not.toContain('sa3');
      expect(ids).not.toContain('sa4');
    });

    it('listCharacters returns kind=character blueprints only', () => {
      const chars = Blueprints.listCharacters();
      const ids = chars.map(c => c.id).sort();
      expect(ids).toEqual(['sa1', 'sa3', 'sa4']);
    });

    it('getCapability returns capability blueprint by id', () => {
      const cap = Blueprints.getCapability('sa2');
      expect(cap).not.toBeNull();
      expect(cap.name).toBe('Code Reviewer');
    });

    it('getCapability returns null for character id', () => {
      expect(Blueprints.getCapability('sa1')).toBeNull();
    });

    it('getCapability returns null for unknown id', () => {
      expect(Blueprints.getCapability('nonexistent')).toBeNull();
    });

    it('getCapability returns legacy entries (capability_tags, no kind)', () => {
      const cap = Blueprints.getCapability('sa5');
      expect(cap).not.toBeNull();
      expect(cap.id).toBe('sa5');
    });
  });

  describe('deactivateShip cascade', () => {
    beforeEach(() => {
      // Pretend the user is offline so SB calls are skipped (DB cleanup is gated on _canSync)
      globalThis.SB = undefined;
    });

    it('removes agents assigned to a deactivated ship (catalog wizard, bp- prefixed key)', async () => {
      // Catalog activation flow: activateShip pushes id, ship-setup-wizard saves state under 'bp-<id>'
      Blueprints.activateShip('ship-01');
      Blueprints.activateAgent('crew-a');
      Blueprints.activateAgent('crew-b');
      Blueprints.saveShipState('bp-ship-01', {
        slot_assignments: { 0: 'crew-a', 1: 'crew-b' },
        agent_ids: ['crew-a', 'crew-b'],
        status: 'deployed',
      });

      expect(Blueprints.isShipActivated('ship-01')).toBe(true);
      expect(Blueprints.isAgentActivated('crew-a')).toBe(true);
      expect(Blueprints.isAgentActivated('crew-b')).toBe(true);

      await Blueprints.deactivateShip('ship-01');

      expect(Blueprints.isShipActivated('ship-01')).toBe(false);
      expect(Blueprints.isAgentActivated('crew-a')).toBe(false);
      expect(Blueprints.isAgentActivated('crew-b')).toBe(false);
      expect(Blueprints.getShipState('bp-ship-01')).toBeNull();
    });

    it('removes agents assigned to a custom DB-loaded ship (raw uuid key)', async () => {
      // DB-loaded path stores _shipState under the raw ship id (no bp- prefix)
      const shipUuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
      Blueprints.activateShip(shipUuid);
      Blueprints.activateAgent('agent-x');
      Blueprints.activateAgent('agent-y');
      Blueprints.saveShipState(shipUuid, {
        slot_assignments: { 0: 'agent-x', 1: 'agent-y' },
        agent_ids: ['agent-x', 'agent-y'],
        status: 'deployed',
      });

      await Blueprints.deactivateShip(shipUuid);

      expect(Blueprints.isShipActivated(shipUuid)).toBe(false);
      expect(Blueprints.isAgentActivated('agent-x')).toBe(false);
      expect(Blueprints.isAgentActivated('agent-y')).toBe(false);
      expect(Blueprints.getShipState(shipUuid)).toBeNull();
    });

    it('enforces one-ship-per-agent invariant on saveShipState (agent detached from prior ship)', () => {
      Blueprints.activateShip('ship-01');
      Blueprints.activateShip('ship-02');
      Blueprints.activateAgent('crew-pilot');

      // Assign pilot to ship-01 first
      Blueprints.saveShipState('bp-ship-01', {
        slot_assignments: { 0: 'crew-pilot' },
        agent_ids: ['crew-pilot'],
      });
      expect(Blueprints.getShipState('bp-ship-01').slot_assignments[0]).toBe('crew-pilot');

      // Now assign same pilot to ship-02 — should be removed from ship-01 automatically
      Blueprints.saveShipState('bp-ship-02', {
        slot_assignments: { 0: 'crew-pilot' },
        agent_ids: ['crew-pilot'],
      });

      const ship1 = Blueprints.getShipState('bp-ship-01');
      const ship2 = Blueprints.getShipState('bp-ship-02');
      expect(ship2.slot_assignments[0]).toBe('crew-pilot');
      expect(ship2.agent_ids).toContain('crew-pilot');
      expect(ship1.slot_assignments[0]).toBeNull();
      expect(ship1.agent_ids).not.toContain('crew-pilot');
    });

    it('falls back to State.spaceships for agent ids when _shipState is empty', async () => {
      const shipUuid = 'ffffffff-1111-4222-8333-444444444444';
      Blueprints.activateShip(shipUuid);
      Blueprints.activateAgent('fallback-agent');

      // Simulate a ship loaded from DB whose state lives only in State.spaceships
      globalThis.State.set('spaceships', [{
        id: shipUuid,
        name: 'Ghost Ship',
        config: { slot_assignments: { 0: 'fallback-agent' } },
        agent_ids: ['fallback-agent'],
      }]);

      await Blueprints.deactivateShip(shipUuid);

      expect(Blueprints.isAgentActivated('fallback-agent')).toBe(false);
      expect((globalThis.State.get('spaceships') || []).find(s => s.id === shipUuid)).toBeUndefined();
    });

    it('cleans orphaned agents when deactivated ship had no persisted state (the real bug)', async () => {
      // Reproduces the leak: a user activated a ship in a prior session, its
      // _shipState row was never populated, and the ship entry in State.spaceships
      // also lacks slot_assignments. deactivateShip's main cleanup finds nothing
      // to remove, so the safety-net cleanupOrphans call has to do the work.
      const shipUuid = '11111111-2222-4333-8444-555555555555';
      Blueprints.activateShip(shipUuid);
      Blueprints.activateAgent('orphan-alpha');
      Blueprints.activateAgent('orphan-beta');

      // Ship has an entry in State but no slot data anywhere
      globalThis.State.set('spaceships', [{ id: shipUuid, name: 'Mystery Ship' }]);
      globalThis.State.set('agents', [
        { id: 'orphan-alpha', name: 'Alpha' },
        { id: 'orphan-beta', name: 'Beta' },
      ]);

      await Blueprints.deactivateShip(shipUuid);

      expect(Blueprints.isShipActivated(shipUuid)).toBe(false);
      expect(Blueprints.isAgentActivated('orphan-alpha')).toBe(false);
      expect(Blueprints.isAgentActivated('orphan-beta')).toBe(false);
      expect(globalThis.State.get('agents')).toEqual([]);
    });
  });

  describe('isShipActivated — blueprint_id indirection', () => {
    beforeEach(() => { globalThis.SB = undefined; });

    it('returns true for a catalog id when the ship is activated under a DB UUID (user_spaceships load path)', () => {
      // Simulate what _loadUserCreations does: push the DB row UUID into
      // _activatedShipIds and add a corresponding entry to State.spaceships
      // whose blueprint_id links back to the catalog ship.
      const shipUuid = 'aaaa1111-bbbb-4ccc-8ddd-eeeeeeeeeeee';
      Blueprints.activateShip(shipUuid);
      globalThis.State.set('spaceships', [{
        id: shipUuid,
        name: 'My Legendary Fleet',
        rarity: 'Legendary',
        blueprint_id: 'ship-01', // catalog id
      }]);

      expect(Blueprints.isShipActivated(shipUuid)).toBe(true);
      expect(Blueprints.isShipActivated('ship-01')).toBe(true);
      expect(Blueprints.isShipActivated('bp-ship-01')).toBe(true);
    });

    it('returns false when no activated ship links to the queried catalog id', () => {
      const shipUuid = 'bbbb2222-cccc-4ddd-8eee-ffffffffffff';
      Blueprints.activateShip(shipUuid);
      globalThis.State.set('spaceships', [{
        id: shipUuid,
        blueprint_id: 'ship-02',
      }]);

      expect(Blueprints.isShipActivated('ship-99')).toBe(false);
    });

    it('deactivateShip resolves a catalog id to its UUID and removes the right ship', async () => {
      const shipUuid = 'cccc3333-dddd-4eee-8fff-aaaaaaaaaaaa';
      Blueprints.activateShip(shipUuid);
      Blueprints.saveShipState(shipUuid, {
        slot_assignments: { 0: 'crew-legendary' },
        agent_ids: ['crew-legendary'],
      });
      Blueprints.activateAgent('crew-legendary');
      globalThis.State.set('spaceships', [{
        id: shipUuid,
        name: 'Legendary Destroyer',
        rarity: 'Legendary',
        blueprint_id: 'ship-01',
      }]);

      // Caller passes the CATALOG id (as the catalog card does), not the UUID
      await Blueprints.deactivateShip('ship-01');

      expect(Blueprints.isShipActivated('ship-01')).toBe(false);
      expect(Blueprints.isShipActivated(shipUuid)).toBe(false);
      expect(Blueprints.isAgentActivated('crew-legendary')).toBe(false);
      expect(Blueprints.getShipState(shipUuid)).toBeNull();
    });
  });

  describe('cleanupOrphans', () => {
    beforeEach(() => {
      // DB gated out so we only test local cleanup
      globalThis.SB = undefined;
    });

    it('returns empty array when no orphans exist', async () => {
      Blueprints.activateShip('ship-01');
      Blueprints.activateAgent('crew-a');
      Blueprints.saveShipState('ship-01', {
        slot_assignments: { 0: 'crew-a' },
        agent_ids: ['crew-a'],
      });

      const removed = await Blueprints.cleanupOrphans();

      expect(removed).toEqual([]);
      expect(Blueprints.isAgentActivated('crew-a')).toBe(true);
    });

    it('preserves catalog blueprint agents (bp-agent-*) not on any ship', async () => {
      Blueprints.activateAgent('bp-agent-05');

      const removed = await Blueprints.cleanupOrphans();

      expect(removed).toEqual([]);
      expect(Blueprints.isAgentActivated('bp-agent-05')).toBe(true);
    });

    it('preserves __new__ placeholder agents awaiting resolution', async () => {
      Blueprints.activateAgent('__new__Pilot');

      const removed = await Blueprints.cleanupOrphans();

      expect(removed).toEqual([]);
      expect(Blueprints.isAgentActivated('__new__Pilot')).toBe(true);
    });

    it('removes orphans from _activatedAgentIds, State.agents, and custom agents localStorage', async () => {
      Blueprints.activateAgent('orphan-1');
      Blueprints.activateAgent('orphan-2');
      globalThis.State.set('agents', [
        { id: 'orphan-1', name: 'First' },
        { id: 'orphan-2', name: 'Second' },
      ]);
      globalThis.localStorage.setItem(
        globalThis.Utils.KEYS.customAgents,
        JSON.stringify([{ id: 'orphan-1', name: 'First' }]),
      );

      const removed = await Blueprints.cleanupOrphans();

      expect(removed.sort()).toEqual(['orphan-1', 'orphan-2']);
      expect(Blueprints.isAgentActivated('orphan-1')).toBe(false);
      expect(Blueprints.isAgentActivated('orphan-2')).toBe(false);
      expect(globalThis.State.get('agents')).toEqual([]);
      const custom = JSON.parse(globalThis.localStorage.getItem(globalThis.Utils.KEYS.customAgents) || '[]');
      expect(custom).toEqual([]);
    });

    it('honors slot assignments on State.spaceships even when _shipState is empty', async () => {
      const shipUuid = '22222222-3333-4444-8555-666666666666';
      Blueprints.activateShip(shipUuid);
      Blueprints.activateAgent('guarded-agent');
      // _shipState is empty but State.spaceships has the slot mapping
      globalThis.State.set('spaceships', [{
        id: shipUuid,
        config: { slot_assignments: { 0: 'guarded-agent' } },
      }]);
      globalThis.State.set('agents', [{ id: 'guarded-agent', name: 'Guarded' }]);

      const removed = await Blueprints.cleanupOrphans();

      expect(removed).toEqual([]);
      expect(Blueprints.isAgentActivated('guarded-agent')).toBe(true);
    });

    it('is idempotent — a second call is a no-op', async () => {
      Blueprints.activateAgent('orphan-x');
      globalThis.State.set('agents', [{ id: 'orphan-x', name: 'X' }]);

      const first = await Blueprints.cleanupOrphans();
      const second = await Blueprints.cleanupOrphans();

      expect(first).toEqual(['orphan-x']);
      expect(second).toEqual([]);
    });
  });

  // ── Supabase delete gating ──────────────────────────────────────────
  // Regression guards for the 2026-04-24 smoke incident where
  // cleanupOrphans ran on init before State.spaceships had hydrated
  // and hard-deleted real user_agents rows from Supabase. Two layers
  // of protection: scope='local' never touches the DB, and scope='full'
  // skips rows whose created_at is inside a grace window.
  describe('cleanupOrphans — Supabase delete gating', () => {
    let removeCalls;
    let _origSB;

    beforeEach(async () => {
      removeCalls = [];
      _origSB = globalThis.SB;
      // Stand up a signed-in Supabase mock so _canSync() returns true
      // and the orphan-delete branch can actually attempt a remove.
      globalThis.SB = {
        isReady: () => true,
        isOnline: () => true,
        auth: () => ({ user: () => ({ id: 'user-1' }) }),
        db: (table) => ({
          remove: async (id) => { removeCalls.push({ table, id }); return { id }; },
          list: async () => [],
          create: async () => ({}),
          update: async () => ({}),
        }),
      };
      // _canSync() also checks State.user — install a signed-in user
      globalThis.State.set('user', { id: 'user-1' });
      // Reset module state so the new SB is picked up
      await Blueprints.init();
    });

    afterEach(() => {
      globalThis.SB = _origSB;
    });

    it('scope: "local" NEVER calls SB.db.remove, even for UUID orphans', async () => {
      const orphanUuid = '11111111-2222-4333-8444-555555555555';
      Blueprints.activateAgent(orphanUuid);
      globalThis.State.set('agents', [{ id: orphanUuid, name: 'Lonely' }]);

      const removed = await Blueprints.cleanupOrphans({ scope: 'local' });

      expect(removed).toEqual([orphanUuid]); // still cleans local caches
      expect(removeCalls).toEqual([]);       // but skips the DB entirely
      expect(Blueprints.isAgentActivated(orphanUuid)).toBe(false);
    });

    it('scope: "full" (default) removes UUID orphans from Supabase', async () => {
      const orphanUuid = '22222222-3333-4444-8555-666666666666';
      Blueprints.activateAgent(orphanUuid);
      globalThis.State.set('agents', [{ id: orphanUuid, name: 'Stale' }]);

      await Blueprints.cleanupOrphans();

      expect(removeCalls.length).toBe(1);
      expect(removeCalls[0]).toEqual({ table: 'user_agents', id: orphanUuid });
    });

    it('skips Supabase delete for orphans younger than the grace window', async () => {
      const orphanUuid = '33333333-4444-4666-8777-888888888888';
      const freshCreatedAt = new Date(Date.now() - 30 * 1000).toISOString(); // 30s old
      Blueprints.activateAgent(orphanUuid);
      globalThis.State.set('agents', [{ id: orphanUuid, name: 'Fresh', created_at: freshCreatedAt }]);

      await Blueprints.cleanupOrphans();

      expect(removeCalls).toEqual([]);
      // Local caches still cleared — the DB delete just defers to the next sweep
      expect(Blueprints.isAgentActivated(orphanUuid)).toBe(false);
    });

    it('still deletes rows older than the grace window', async () => {
      const orphanUuid = '44444444-5555-4888-9aaa-bbbbbbbbbbbb';
      const oldCreatedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min old
      Blueprints.activateAgent(orphanUuid);
      globalThis.State.set('agents', [{ id: orphanUuid, name: 'Ancient', created_at: oldCreatedAt }]);

      await Blueprints.cleanupOrphans();

      expect(removeCalls.length).toBe(1);
      expect(removeCalls[0].id).toBe(orphanUuid);
    });

    it('graceMs: 0 opts out of the grace window entirely', async () => {
      const orphanUuid = '55555555-6666-4999-abbb-cccccccccccc';
      const freshCreatedAt = new Date().toISOString();
      Blueprints.activateAgent(orphanUuid);
      globalThis.State.set('agents', [{ id: orphanUuid, name: 'Fresh', created_at: freshCreatedAt }]);

      await Blueprints.cleanupOrphans({ graceMs: 0 });

      expect(removeCalls.length).toBe(1);
    });
  });

  describe('resolveLiveAgent — catalog-driven capability merge', () => {
    beforeEach(() => { globalThis.SB = undefined; });

    it('returns the agent unchanged when no blueprint_id matches catalog', () => {
      const agent = { id: 'unknown-uuid', name: 'Stray', config: { role: 'X', tools: ['a'] } };
      const live = Blueprints.resolveLiveAgent(agent);
      expect(live).toEqual(agent);
    });

    it('returns null/undefined unchanged', () => {
      expect(Blueprints.resolveLiveAgent(null)).toBe(null);
      expect(Blueprints.resolveLiveAgent(undefined)).toBe(undefined);
    });

    it('refreshes catalog-driven config fields on a slug-keyed activation', () => {
      // sa1 catalog config is { role: 'Research' } — pretend the catalog
      // grew a system_prompt and tools list after the user activated.
      const catalog = Blueprints.getAgent('sa1');
      catalog.config.system_prompt = 'You are a research umbrella.';
      catalog.config.tools = ['web-search', 'browser'];
      catalog.config.llm_engine = 'gemini-2.5-pro';
      catalog.config.is_captain = false;

      const stored = {
        id: 'sa1', name: 'Web Researcher',
        config: { role: 'Research', tools: [], system_prompt: 'old', temperature: 0.5 },
      };
      const live = Blueprints.resolveLiveAgent(stored);
      expect(live.config.system_prompt).toBe('You are a research umbrella.');
      expect(live.config.tools).toEqual(['web-search', 'browser']);
      expect(live.config.llm_engine).toBe('gemini-2.5-pro');
      expect(live.config.is_captain).toBe(false);
      // User-tunable fields preserved
      expect(live.config.temperature).toBe(0.5);
      expect(live.config.role).toBe('Research');
    });

    it('preserves stored agent identity (id, name)', () => {
      const stored = { id: 'sa2', name: 'My Custom Reviewer', config: { role: 'Code' } };
      const live = Blueprints.resolveLiveAgent(stored);
      expect(live.id).toBe('sa2');
      expect(live.name).toBe('My Custom Reviewer');
    });

    it('resolves catalog by agent.blueprint_id when id is a UUID', () => {
      const catalog = Blueprints.getAgent('sa3');
      catalog.config.system_prompt = 'You are an analyst.';
      catalog.config.tools = ['bigquery'];

      const stored = {
        id: '11111111-2222-4333-8444-555555555555',
        name: 'Wizard-created agent',
        blueprint_id: 'sa3',
        config: { role: 'Data', tools: [] },
      };
      const live = Blueprints.resolveLiveAgent(stored);
      expect(live.config.system_prompt).toBe('You are an analyst.');
      expect(live.config.tools).toEqual(['bigquery']);
    });

    it('resolves catalog by config.blueprint_id (legacy storage location)', () => {
      const catalog = Blueprints.getAgent('sa3');
      catalog.config.system_prompt = 'You are an analyst.';

      const stored = {
        id: 'uuid-2',
        config: { role: 'Data', blueprint_id: 'sa3' },
      };
      const live = Blueprints.resolveLiveAgent(stored);
      expect(live.config.system_prompt).toBe('You are an analyst.');
      // blueprint_id must survive on the merged config so downstream callers
      // can re-resolve later without losing the catalog link.
      expect(live.config.blueprint_id).toBe('sa3');
    });

    it('resolves bp-prefixed and bare ids interchangeably', () => {
      const catalog = Blueprints.getAgent('sa1');
      catalog.config.system_prompt = 'Umbrella prompt.';

      const withPrefix = { id: 'uuid-3', blueprint_id: 'bp-sa1', config: {} };
      const withoutPrefix = { id: 'uuid-4', blueprint_id: 'sa1', config: {} };
      expect(Blueprints.resolveLiveAgent(withPrefix).config.system_prompt).toBe('Umbrella prompt.');
      expect(Blueprints.resolveLiveAgent(withoutPrefix).config.system_prompt).toBe('Umbrella prompt.');
    });

    it('does not clobber stored config fields outside the catalog allowlist', () => {
      const catalog = Blueprints.getAgent('sa1');
      catalog.config.system_prompt = 'Catalog-driven.';

      const stored = {
        id: 'sa1', name: 'X',
        config: {
          role: 'Research',
          tools: [],
          temperature: 0.9,
          memory: true,
          custom_user_field: 'keep me',
        },
      };
      const live = Blueprints.resolveLiveAgent(stored);
      expect(live.config.temperature).toBe(0.9);
      expect(live.config.memory).toBe(true);
      expect(live.config.custom_user_field).toBe('keep me');
    });

    it('resolves synthetic crew ids ("<shipId>-crew-<n>") to the ship blueprint node', () => {
      const ship = Blueprints.getSpaceship('ship-01');
      ship.metadata = {
        crew: [
          { label: 'Captain', config: { agentRole: 'Captain', is_captain: true, system_prompt: 'You command.', tools: [] } },
          { label: 'Comms', config: { agentRole: 'Communications', system_prompt: 'You handle comms.', tools: ['gmail-search', 'gmail-send'] } },
        ],
      };

      const captainStored = { id: 'uuid-cap', blueprint_id: 'ship-01-crew-0', config: { role: 'Captain', tools: [] } };
      const captainLive = Blueprints.resolveLiveAgent(captainStored);
      expect(captainLive.config.system_prompt).toBe('You command.');
      expect(captainLive.config.is_captain).toBe(true);

      const commsStored = { id: 'uuid-comms', blueprint_id: 'ship-01-crew-1', config: { role: 'Communications', tools: [] } };
      const commsLive = Blueprints.resolveLiveAgent(commsStored);
      expect(commsLive.config.system_prompt).toBe('You handle comms.');
      expect(commsLive.config.tools).toEqual(['gmail-search', 'gmail-send']);
    });

    it('handles synthetic crew ids with bp- prefix on the ship id', () => {
      const ship = Blueprints.getSpaceship('ship-01');
      ship.metadata = { crew: [{ label: 'Captain', config: { system_prompt: 'Hello.', tools: [] } }] };

      const stored = { id: 'uuid-x', blueprint_id: 'bp-ship-01-crew-0', config: { tools: [] } };
      const live = Blueprints.resolveLiveAgent(stored);
      expect(live.config.system_prompt).toBe('Hello.');
    });

    it('returns the agent unchanged when synthetic crew id points past the crew array', () => {
      const ship = Blueprints.getSpaceship('ship-01');
      ship.metadata = { crew: [{ label: 'Captain', config: { tools: [] } }] };

      const stored = { id: 'uuid-x', blueprint_id: 'ship-01-crew-9', config: { tools: ['a'] } };
      const live = Blueprints.resolveLiveAgent(stored);
      expect(live).toEqual(stored);
    });

    it('returns the agent unchanged when synthetic crew id refers to an unknown ship', () => {
      const stored = { id: 'uuid-x', blueprint_id: 'ship-nope-crew-0', config: { tools: ['a'] } };
      const live = Blueprints.resolveLiveAgent(stored);
      expect(live).toEqual(stored);
    });
  });

  describe('refreshActivatedAgentsFromCatalog — heal stale persistent rows', () => {
    let updateCalls;
    let _origSB;

    beforeEach(async () => {
      updateCalls = [];
      _origSB = globalThis.SB;
      globalThis.SB = {
        isReady: () => true,
        isOnline: () => true,
        auth: () => ({ user: () => ({ id: 'user-1' }) }),
        db: (table) => ({
          update: async (id, payload) => { updateCalls.push({ table, id, payload }); return { id }; },
          list: async () => [],
          create: async () => ({}),
          remove: async () => ({}),
        }),
      };
      globalThis.State.set('user', { id: 'user-1' });
      try { globalThis.localStorage.removeItem(globalThis.Utils.KEYS.customAgents); } catch {}
      await Blueprints.init();
      // Earlier resolver tests mutate seed configs (sa1/sa3) by reference.
      // Reset to a known shape so the diff is deterministic per-test.
      const sa1 = Blueprints.getAgent('sa1');
      if (sa1) sa1.config = { role: 'Research' };
    });

    afterEach(() => { globalThis.SB = _origSB; });

    it('rewrites a stale State.agents entry whose system_prompt drifted from catalog', async () => {
      const catalog = Blueprints.getAgent('sa1');
      catalog.config.system_prompt = 'Catalog v2.';

      const uuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
      globalThis.State.set('agents', [{
        id: uuid, name: 'Old copy', blueprint_id: 'sa1',
        config: { role: 'Research', system_prompt: 'Catalog v1 stale.', temperature: 0.7 },
      }]);

      const result = await Blueprints.refreshActivatedAgentsFromCatalog();

      expect(result.refreshed).toBe(1);
      const agents = globalThis.State.get('agents');
      expect(agents[0].config.system_prompt).toBe('Catalog v2.');
      // User-tunable field preserved
      expect(agents[0].config.temperature).toBe(0.7);
    });

    it('writes back to user_agents Supabase rows for UUID-keyed agents', async () => {
      const catalog = Blueprints.getAgent('sa1');
      catalog.config.system_prompt = 'Catalog v2.';
      catalog.config.tools = ['web-search'];

      const uuid = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
      globalThis.State.set('agents', [{
        id: uuid, name: 'Old copy', blueprint_id: 'sa1',
        config: { role: 'Research', system_prompt: 'stale', tools: [] },
      }]);

      const result = await Blueprints.refreshActivatedAgentsFromCatalog();

      expect(result.dbUpdated).toBe(1);
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0].table).toBe('user_agents');
      expect(updateCalls[0].id).toBe(uuid);
      expect(updateCalls[0].payload.config.system_prompt).toBe('Catalog v2.');
      expect(updateCalls[0].payload.config.tools).toEqual(['web-search']);
    });

    it('skips Supabase write for non-UUID local-only ids', async () => {
      const catalog = Blueprints.getAgent('sa1');
      catalog.config.system_prompt = 'Catalog v2.';

      globalThis.State.set('agents', [{
        id: 'agent-1234567890-abc', name: 'Local', blueprint_id: 'sa1',
        config: { system_prompt: 'stale' },
      }]);

      const result = await Blueprints.refreshActivatedAgentsFromCatalog();

      expect(result.refreshed).toBe(1);
      expect(result.dbUpdated).toBe(0);
      expect(updateCalls).toHaveLength(0);
    });

    it('is a no-op when stored agents already match the catalog', async () => {
      const catalog = Blueprints.getAgent('sa1');
      catalog.config.system_prompt = 'Catalog v2.';

      globalThis.State.set('agents', [{
        id: 'sa1', name: 'Web Researcher', blueprint_id: 'sa1',
        config: { role: 'Research', system_prompt: 'Catalog v2.' },
      }]);

      const result = await Blueprints.refreshActivatedAgentsFromCatalog();

      expect(result.refreshed).toBe(0);
      expect(updateCalls).toHaveLength(0);
    });

    it('is idempotent — second call after a refresh writes nothing', async () => {
      const catalog = Blueprints.getAgent('sa1');
      catalog.config.system_prompt = 'Catalog v2.';

      const uuid = 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa';
      globalThis.State.set('agents', [{
        id: uuid, name: 'X', blueprint_id: 'sa1',
        config: { system_prompt: 'stale' },
      }]);

      const first = await Blueprints.refreshActivatedAgentsFromCatalog();
      const second = await Blueprints.refreshActivatedAgentsFromCatalog();

      expect(first.refreshed).toBe(1);
      expect(second.refreshed).toBe(0);
      expect(updateCalls).toHaveLength(1); // only the first call wrote
    });

    it('does NOT refresh customAgents localStorage for signed-in sessions', async () => {
      // Signed-in users have State.agents (mirrored from user_agents) as
      // the SSOT. Refreshing the legacy localStorage cache would be
      // wasted work and would defeat the localStorage-wipe-safety
      // guarantee that 3a/3b/3c collectively establish.
      const catalog = Blueprints.getAgent('sa1');
      catalog.config.system_prompt = 'Catalog v2.';

      const stored = [{
        id: 'agent-local-1', name: 'X', blueprint_id: 'sa1',
        config: { role: 'Research', system_prompt: 'stale' },
      }];
      globalThis.localStorage.setItem(globalThis.Utils.KEYS.customAgents, JSON.stringify(stored));

      await Blueprints.refreshActivatedAgentsFromCatalog();

      const after = JSON.parse(globalThis.localStorage.getItem(globalThis.Utils.KEYS.customAgents));
      expect(after[0].config.system_prompt).toBe('stale');
    });

    it('refreshes customAgents localStorage entries for guest sessions', async () => {
      // Guest sessions have no user_agents row; localStorage IS the SSOT
      // for custom agent data. The catalog-diff walk must run.
      globalThis.State.set('user', null);

      const catalog = Blueprints.getAgent('sa1');
      catalog.config.system_prompt = 'Catalog v2.';

      const stored = [{
        id: 'agent-local-1', name: 'X', blueprint_id: 'sa1',
        config: { role: 'Research', system_prompt: 'stale' },
      }];
      globalThis.localStorage.setItem(globalThis.Utils.KEYS.customAgents, JSON.stringify(stored));

      await Blueprints.refreshActivatedAgentsFromCatalog();

      const after = JSON.parse(globalThis.localStorage.getItem(globalThis.Utils.KEYS.customAgents));
      expect(after[0].config.system_prompt).toBe('Catalog v2.');
    });

    it('leaves agents with no catalog match untouched', async () => {
      const orig = {
        id: 'no-match-uuid', name: 'Custom', blueprint_id: 'nonexistent-bp',
        config: { system_prompt: 'mine', tools: ['a'] },
      };
      globalThis.State.set('agents', [orig]);

      const result = await Blueprints.refreshActivatedAgentsFromCatalog();

      expect(result.refreshed).toBe(0);
      expect(globalThis.State.get('agents')[0]).toEqual(orig);
    });
  });

  // 8 spaceship-activation entry points historically each created a fresh
  // user_spaceships row regardless of whether the user already had one for
  // the same blueprint. findOrCreateActiveShip centralises the find-or-create
  // logic so duplicate rows can no longer accumulate. Backed by a unique
  // partial index on (user_id, blueprint_id) WHERE status != 'archived'.
  describe('findOrCreateActiveShip', () => {
    let createCalls;
    let findScript;
    let _origSB;

    beforeEach(async () => {
      createCalls = [];
      findScript = { data: null }; // default: no existing row

      _origSB = globalThis.SB;
      // Fluent client mock: every chained method returns the same builder;
      // maybeSingle() resolves to whatever findScript currently holds.
      const builder = {};
      builder.from = () => builder;
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.neq = () => builder;
      builder.order = () => builder;
      builder.limit = () => builder;
      builder.maybeSingle = async () => findScript;

      globalThis.SB = {
        get client() { return builder; },
        isReady: () => true,
        isOnline: () => true,
        auth: () => ({ user: () => ({ id: 'user-1' }) }),
        db: (table) => ({
          create: async (row) => {
            createCalls.push({ table, row });
            return { id: 'new-ship-uuid', ...row };
          },
          list: async () => [],
          update: async () => ({}),
          remove: async () => ({}),
        }),
      };
      globalThis.State.set('user', { id: 'user-1' });
      await Blueprints.init();
    });

    afterEach(() => { globalThis.SB = _origSB; });

    it('creates a new row when no existing active ship matches the blueprint', async () => {
      findScript = { data: null };

      const result = await Blueprints.findOrCreateActiveShip('ship-falcon', () => ({
        name: 'Millennium Falcon',
        status: 'deployed',
      }));

      expect(result.created).toBe(true);
      expect(result.ship.id).toBe('new-ship-uuid');
      expect(createCalls).toHaveLength(1);
      expect(createCalls[0].row.user_id).toBe('user-1');
      expect(createCalls[0].row.blueprint_id).toBe('ship-falcon');
      expect(createCalls[0].row.name).toBe('Millennium Falcon');
    });

    it('returns the existing row when one already exists for the blueprint', async () => {
      findScript = {
        data: {
          id: 'existing-uuid',
          user_id: 'user-1',
          blueprint_id: 'ship-falcon',
          name: 'Falcon (already activated)',
          status: 'deployed',
        },
      };

      const result = await Blueprints.findOrCreateActiveShip('ship-falcon', () => ({
        name: 'Should not be inserted',
      }));

      expect(result.created).toBe(false);
      expect(result.ship.id).toBe('existing-uuid');
      expect(createCalls).toHaveLength(0); // factory never invoked
    });

    it('skips the find phase for custom builds (blueprint_id=null) and always creates', async () => {
      // Even if find WOULD return a hit, custom builds shouldn't dedupe —
      // they're unique-per-instance by definition.
      findScript = { data: { id: 'should-not-be-returned' } };

      const result = await Blueprints.findOrCreateActiveShip(null, () => ({
        name: 'Custom Workshop Ship',
        status: 'standby',
      }));

      expect(result.created).toBe(true);
      expect(result.ship.id).toBe('new-ship-uuid');
      expect(createCalls).toHaveLength(1);
      // Helper does NOT auto-fill blueprint_id when null is passed
      expect(createCalls[0].row.blueprint_id).toBeUndefined();
    });

    it('returns {ship: null, created: false} in guest mode (no signed-in user)', async () => {
      globalThis.State.set('user', null);

      const result = await Blueprints.findOrCreateActiveShip('ship-falcon', () => ({
        name: 'Should never be created',
      }));

      expect(result).toEqual({ ship: null, created: false });
      expect(createCalls).toHaveLength(0);
    });

    it('preserves caller-supplied user_id and blueprint_id when present in the row', async () => {
      findScript = { data: null };

      await Blueprints.findOrCreateActiveShip('ship-falcon', () => ({
        user_id: 'user-1',
        blueprint_id: 'ship-falcon',
        name: 'Pre-stamped',
      }));

      expect(createCalls).toHaveLength(1);
      expect(createCalls[0].row.user_id).toBe('user-1');
      expect(createCalls[0].row.blueprint_id).toBe('ship-falcon');
    });
  });

  // _loadUserCreations writes ship rows with `stats: catalogBp.stats || ... ||
  // { crew: <count>, slots: '6' }`. When init runs in parallel with the catalog
  // load (the common case on hard reload), catalogBp is null and slots gets
  // locked to "6" regardless of the ship's true crew size. The Schematic then
  // reads slots="6" and renders 6 cards even when the user has 12 slot
  // assignments. _healStaleShipStats walks State.spaceships once the catalog
  // is queryable and rewrites stats from the matching catalog row.
  describe('healStaleShipStats — catalog-load timing race', () => {
    let _origSeed;

    beforeEach(async () => {
      _origSeed = globalThis.BlueprintsView.SPACESHIP_SEED;
      globalThis.BlueprintsView.SPACESHIP_SEED = [
        { id: 'ship-falcon', name: 'Falcon', class_id: 'class-4',
          stats: { crew: '12', slots: '12', tier: 'LEGENDARY' },
          metadata: { crew: [
            { id: 'n1', label: 'Han Solo' },
            { id: 'n2', label: 'Chewbacca' },
          ] } },
        { id: 'ship-noslots', name: 'No Stats Ship' },
      ];
      await Blueprints.init();
    });

    afterEach(() => {
      globalThis.BlueprintsView.SPACESHIP_SEED = _origSeed;
    });

    it('rewrites stale slots from the catalog and reports dirty', () => {
      globalThis.State.set('spaceships', [{
        id: 'falcon-uuid-1',
        name: 'Falcon',
        blueprint_id: 'ship-falcon',
        stats: { crew: '12', slots: '6' }, // pre-catalog fallback
        metadata: { caps: [] },
      }]);

      const dirty = Blueprints.healStaleShipStats();

      expect(dirty).toBe(true);
      const ship = globalThis.State.get('spaceships').find(s => s.id === 'falcon-uuid-1');
      expect(ship.stats.slots).toBe('12');
      expect(ship.stats.tier).toBe('LEGENDARY');
      // Metadata also restored — getCrewDefs reads metadata.crew for slot labels.
      expect(ship.metadata.crew).toHaveLength(2);
      expect(ship.metadata.crew[0].label).toBe('Han Solo');
    });

    it('is idempotent when stats already match the catalog', () => {
      globalThis.State.set('spaceships', [{
        id: 'falcon-uuid-1',
        blueprint_id: 'ship-falcon',
        stats: { crew: '12', slots: '12', tier: 'LEGENDARY' },
        metadata: { crew: [{ id: 'n1', label: 'Han Solo' }] },
      }]);

      const dirty = Blueprints.healStaleShipStats();

      expect(dirty).toBe(false);
    });

    it('skips entries without a blueprint_id (custom Crew Designer ships)', () => {
      globalThis.State.set('spaceships', [{
        id: 'custom-uuid',
        name: 'My Custom Ship',
        stats: { crew: '5', slots: '6' },
      }]);

      const dirty = Blueprints.healStaleShipStats();

      expect(dirty).toBe(false);
      const ship = globalThis.State.get('spaceships').find(s => s.id === 'custom-uuid');
      expect(ship.stats.slots).toBe('6'); // untouched
    });

    it('skips entries whose blueprint_id is not in the catalog', () => {
      globalThis.State.set('spaceships', [{
        id: 'orphan-uuid',
        blueprint_id: 'ship-deleted-from-catalog',
        stats: { slots: '6' },
      }]);

      const dirty = Blueprints.healStaleShipStats();

      expect(dirty).toBe(false);
    });

    it('skips when the catalog row has no usable stats.slots', () => {
      globalThis.State.set('spaceships', [{
        id: 'noslots-uuid',
        blueprint_id: 'ship-noslots',
        stats: { slots: '6' },
      }]);

      const dirty = Blueprints.healStaleShipStats();

      expect(dirty).toBe(false);
    });

    it('returns false for empty / missing State.spaceships', () => {
      globalThis.State.set('spaceships', []);
      expect(Blueprints.healStaleShipStats()).toBe(false);

      globalThis.State.set('spaceships', null);
      expect(Blueprints.healStaleShipStats()).toBe(false);
    });

    it('preserves user-modified state.spaceships entries when only stats are stale', () => {
      // The heal must not clobber unrelated fields (status, slot_assignments, etc.)
      globalThis.State.set('spaceships', [{
        id: 'falcon-uuid-1',
        blueprint_id: 'ship-falcon',
        name: 'My Renamed Falcon',
        status: 'deployed',
        config: { slot_assignments: { 0: 'agent-a', 1: 'agent-b' } },
        stats: { slots: '6' },
      }]);

      Blueprints.healStaleShipStats();

      const ship = globalThis.State.get('spaceships').find(s => s.id === 'falcon-uuid-1');
      expect(ship.name).toBe('My Renamed Falcon');
      expect(ship.status).toBe('deployed');
      expect(ship.config.slot_assignments).toEqual({ 0: 'agent-a', 1: 'agent-b' });
      expect(ship.stats.slots).toBe('12');
    });

  });
});
