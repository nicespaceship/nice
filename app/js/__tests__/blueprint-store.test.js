import { describe, it, expect, beforeEach } from 'vitest';

// BlueprintStore depends on BlueprintsView for seeds — stub it
globalThis.BlueprintsView = {
  SEED: [
    { id: 'sa1', name: 'Web Researcher', config: { role: 'Research' }, category: 'Research', rarity: 'Common', tags: ['web', 'search'] },
    { id: 'sa2', name: 'Code Reviewer', config: { role: 'Code' }, category: 'Code', rarity: 'Rare', tags: ['code', 'review'] },
    { id: 'sa3', name: 'Data Analyst', config: { role: 'Data' }, category: 'Data', rarity: 'Epic', tags: ['data', 'analytics'] },
    { id: 'sa4', name: 'Content Writer', config: { role: 'Content' }, category: 'Content', rarity: 'Legendary', tags: ['content', 'writing'] },
    { id: 'sa5', name: 'DevOps Bot', config: { role: 'Ops' }, category: 'Ops', rarity: 'Common', description: 'Handles CI/CD pipelines' },
  ],
  SPACESHIP_SEED: [
    { id: 'ship-01', name: 'Scout Mk I', class_id: 'class-1' },
    { id: 'ship-02', name: 'Cruiser Alpha', class_id: 'class-2' },
  ],
};

// Load BlueprintStore
const { readFileSync } = await import('fs');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
const __dir = dirname(fileURLToPath(import.meta.url));
let code = readFileSync(resolve(__dir, '../lib/blueprint-store.js'), 'utf-8');
code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
eval(code);

describe('BlueprintStore', () => {
  beforeEach(async () => {
    // Re-init seeds before each test
    await BlueprintStore.init();
  });

  it('should load seeds on init and report ready', () => {
    expect(BlueprintStore.isReady()).toBe(true);
  });

  it('should get agent by ID', () => {
    const agent = BlueprintStore.getAgent('sa1');
    expect(agent).not.toBeNull();
    expect(agent.name).toBe('Web Researcher');
  });

  it('should return null for unknown agent ID', () => {
    expect(BlueprintStore.getAgent('nonexistent')).toBeNull();
  });

  it('should list all agents', () => {
    const agents = BlueprintStore.listAgents();
    expect(agents.length).toBe(5);
  });

  it('should filter agents by rarity', () => {
    const common = BlueprintStore.listAgents({ rarity: 'Common' });
    expect(common.length).toBe(2);
    expect(common.every(a => a.rarity === 'Common')).toBe(true);
  });

  it('should filter agents by category (role)', () => {
    const code = BlueprintStore.listAgents({ category: 'Code' });
    expect(code.length).toBe(1);
    expect(code[0].id).toBe('sa2');
  });

  it('should filter agents by search term in name', () => {
    const results = BlueprintStore.listAgents({ search: 'researcher' });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('sa1');
  });

  it('should filter agents by search term in description', () => {
    const results = BlueprintStore.listAgents({ search: 'CI/CD' });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('sa5');
  });

  it('should filter agents by search term in tags', () => {
    const results = BlueprintStore.listAgents({ search: 'analytics' });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('sa3');
  });

  it('should get spaceship by ID', () => {
    const ship = BlueprintStore.getSpaceship('ship-01');
    expect(ship).not.toBeNull();
    expect(ship.name).toBe('Scout Mk I');
  });

  it('should return null for unknown spaceship ID', () => {
    expect(BlueprintStore.getSpaceship('nonexistent')).toBeNull();
  });

  it('should list all spaceships', () => {
    expect(BlueprintStore.listSpaceships().length).toBe(2);
  });

  it('should find any blueprint type via get()', () => {
    expect(BlueprintStore.get('sa1').name).toBe('Web Researcher');
    expect(BlueprintStore.get('ship-01').name).toBe('Scout Mk I');
  });

  it('should return null from get() for unknown ID', () => {
    expect(BlueprintStore.get('nonexistent')).toBeNull();
  });

  it('should return copies from list methods (not mutable references)', () => {
    const agents1 = BlueprintStore.listAgents();
    const agents2 = BlueprintStore.listAgents();
    expect(agents1).not.toBe(agents2);
  });

  describe('deactivateShip cascade', () => {
    beforeEach(() => {
      // Pretend the user is offline so SB calls are skipped (DB cleanup is gated on _canSync)
      globalThis.SB = undefined;
    });

    it('removes agents assigned to a deactivated ship (catalog wizard, bp- prefixed key)', async () => {
      // Catalog activation flow: activateShip pushes id, ship-setup-wizard saves state under 'bp-<id>'
      BlueprintStore.activateShip('ship-01');
      BlueprintStore.activateAgent('crew-a');
      BlueprintStore.activateAgent('crew-b');
      BlueprintStore.saveShipState('bp-ship-01', {
        slot_assignments: { 0: 'crew-a', 1: 'crew-b' },
        agent_ids: ['crew-a', 'crew-b'],
        status: 'deployed',
      });

      expect(BlueprintStore.isShipActivated('ship-01')).toBe(true);
      expect(BlueprintStore.isAgentActivated('crew-a')).toBe(true);
      expect(BlueprintStore.isAgentActivated('crew-b')).toBe(true);

      await BlueprintStore.deactivateShip('ship-01');

      expect(BlueprintStore.isShipActivated('ship-01')).toBe(false);
      expect(BlueprintStore.isAgentActivated('crew-a')).toBe(false);
      expect(BlueprintStore.isAgentActivated('crew-b')).toBe(false);
      expect(BlueprintStore.getShipState('bp-ship-01')).toBeNull();
    });

    it('removes agents assigned to a custom DB-loaded ship (raw uuid key)', async () => {
      // DB-loaded path stores _shipState under the raw ship id (no bp- prefix)
      const shipUuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
      BlueprintStore.activateShip(shipUuid);
      BlueprintStore.activateAgent('agent-x');
      BlueprintStore.activateAgent('agent-y');
      BlueprintStore.saveShipState(shipUuid, {
        slot_assignments: { 0: 'agent-x', 1: 'agent-y' },
        agent_ids: ['agent-x', 'agent-y'],
        status: 'deployed',
      });

      await BlueprintStore.deactivateShip(shipUuid);

      expect(BlueprintStore.isShipActivated(shipUuid)).toBe(false);
      expect(BlueprintStore.isAgentActivated('agent-x')).toBe(false);
      expect(BlueprintStore.isAgentActivated('agent-y')).toBe(false);
      expect(BlueprintStore.getShipState(shipUuid)).toBeNull();
    });

    it('enforces one-ship-per-agent invariant on saveShipState (agent detached from prior ship)', () => {
      BlueprintStore.activateShip('ship-01');
      BlueprintStore.activateShip('ship-02');
      BlueprintStore.activateAgent('crew-pilot');

      // Assign pilot to ship-01 first
      BlueprintStore.saveShipState('bp-ship-01', {
        slot_assignments: { 0: 'crew-pilot' },
        agent_ids: ['crew-pilot'],
      });
      expect(BlueprintStore.getShipState('bp-ship-01').slot_assignments[0]).toBe('crew-pilot');

      // Now assign same pilot to ship-02 — should be removed from ship-01 automatically
      BlueprintStore.saveShipState('bp-ship-02', {
        slot_assignments: { 0: 'crew-pilot' },
        agent_ids: ['crew-pilot'],
      });

      const ship1 = BlueprintStore.getShipState('bp-ship-01');
      const ship2 = BlueprintStore.getShipState('bp-ship-02');
      expect(ship2.slot_assignments[0]).toBe('crew-pilot');
      expect(ship2.agent_ids).toContain('crew-pilot');
      expect(ship1.slot_assignments[0]).toBeNull();
      expect(ship1.agent_ids).not.toContain('crew-pilot');
    });

    it('falls back to State.spaceships for agent ids when _shipState is empty', async () => {
      const shipUuid = 'ffffffff-1111-4222-8333-444444444444';
      BlueprintStore.activateShip(shipUuid);
      BlueprintStore.activateAgent('fallback-agent');

      // Simulate a ship loaded from DB whose state lives only in State.spaceships
      globalThis.State.set('spaceships', [{
        id: shipUuid,
        name: 'Ghost Ship',
        config: { slot_assignments: { 0: 'fallback-agent' } },
        agent_ids: ['fallback-agent'],
      }]);

      await BlueprintStore.deactivateShip(shipUuid);

      expect(BlueprintStore.isAgentActivated('fallback-agent')).toBe(false);
      expect((globalThis.State.get('spaceships') || []).find(s => s.id === shipUuid)).toBeUndefined();
    });

    it('cleans orphaned agents when deactivated ship had no persisted state (the real bug)', async () => {
      // Reproduces the leak: a user activated a ship in a prior session, its
      // _shipState row was never populated, and the ship entry in State.spaceships
      // also lacks slot_assignments. deactivateShip's main cleanup finds nothing
      // to remove, so the safety-net cleanupOrphans call has to do the work.
      const shipUuid = '11111111-2222-4333-8444-555555555555';
      BlueprintStore.activateShip(shipUuid);
      BlueprintStore.activateAgent('orphan-alpha');
      BlueprintStore.activateAgent('orphan-beta');

      // Ship has an entry in State but no slot data anywhere
      globalThis.State.set('spaceships', [{ id: shipUuid, name: 'Mystery Ship' }]);
      globalThis.State.set('agents', [
        { id: 'orphan-alpha', name: 'Alpha' },
        { id: 'orphan-beta', name: 'Beta' },
      ]);

      await BlueprintStore.deactivateShip(shipUuid);

      expect(BlueprintStore.isShipActivated(shipUuid)).toBe(false);
      expect(BlueprintStore.isAgentActivated('orphan-alpha')).toBe(false);
      expect(BlueprintStore.isAgentActivated('orphan-beta')).toBe(false);
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
      BlueprintStore.activateShip(shipUuid);
      globalThis.State.set('spaceships', [{
        id: shipUuid,
        name: 'My Legendary Fleet',
        rarity: 'Legendary',
        blueprint_id: 'ship-01', // catalog id
      }]);

      expect(BlueprintStore.isShipActivated(shipUuid)).toBe(true);
      expect(BlueprintStore.isShipActivated('ship-01')).toBe(true);
      expect(BlueprintStore.isShipActivated('bp-ship-01')).toBe(true);
    });

    it('returns false when no activated ship links to the queried catalog id', () => {
      const shipUuid = 'bbbb2222-cccc-4ddd-8eee-ffffffffffff';
      BlueprintStore.activateShip(shipUuid);
      globalThis.State.set('spaceships', [{
        id: shipUuid,
        blueprint_id: 'ship-02',
      }]);

      expect(BlueprintStore.isShipActivated('ship-99')).toBe(false);
    });

    it('deactivateShip resolves a catalog id to its UUID and removes the right ship', async () => {
      const shipUuid = 'cccc3333-dddd-4eee-8fff-aaaaaaaaaaaa';
      BlueprintStore.activateShip(shipUuid);
      BlueprintStore.saveShipState(shipUuid, {
        slot_assignments: { 0: 'crew-legendary' },
        agent_ids: ['crew-legendary'],
      });
      BlueprintStore.activateAgent('crew-legendary');
      globalThis.State.set('spaceships', [{
        id: shipUuid,
        name: 'Legendary Destroyer',
        rarity: 'Legendary',
        blueprint_id: 'ship-01',
      }]);

      // Caller passes the CATALOG id (as the catalog card does), not the UUID
      await BlueprintStore.deactivateShip('ship-01');

      expect(BlueprintStore.isShipActivated('ship-01')).toBe(false);
      expect(BlueprintStore.isShipActivated(shipUuid)).toBe(false);
      expect(BlueprintStore.isAgentActivated('crew-legendary')).toBe(false);
      expect(BlueprintStore.getShipState(shipUuid)).toBeNull();
    });
  });

  describe('cleanupOrphans', () => {
    beforeEach(() => {
      // DB gated out so we only test local cleanup
      globalThis.SB = undefined;
    });

    it('returns empty array when no orphans exist', async () => {
      BlueprintStore.activateShip('ship-01');
      BlueprintStore.activateAgent('crew-a');
      BlueprintStore.saveShipState('ship-01', {
        slot_assignments: { 0: 'crew-a' },
        agent_ids: ['crew-a'],
      });

      const removed = await BlueprintStore.cleanupOrphans();

      expect(removed).toEqual([]);
      expect(BlueprintStore.isAgentActivated('crew-a')).toBe(true);
    });

    it('preserves catalog blueprint agents (bp-agent-*) not on any ship', async () => {
      BlueprintStore.activateAgent('bp-agent-05');

      const removed = await BlueprintStore.cleanupOrphans();

      expect(removed).toEqual([]);
      expect(BlueprintStore.isAgentActivated('bp-agent-05')).toBe(true);
    });

    it('preserves __new__ placeholder agents awaiting resolution', async () => {
      BlueprintStore.activateAgent('__new__Pilot');

      const removed = await BlueprintStore.cleanupOrphans();

      expect(removed).toEqual([]);
      expect(BlueprintStore.isAgentActivated('__new__Pilot')).toBe(true);
    });

    it('removes orphans from _activatedAgentIds, State.agents, and custom agents localStorage', async () => {
      BlueprintStore.activateAgent('orphan-1');
      BlueprintStore.activateAgent('orphan-2');
      globalThis.State.set('agents', [
        { id: 'orphan-1', name: 'First' },
        { id: 'orphan-2', name: 'Second' },
      ]);
      globalThis.localStorage.setItem(
        globalThis.Utils.KEYS.customAgents,
        JSON.stringify([{ id: 'orphan-1', name: 'First' }]),
      );

      const removed = await BlueprintStore.cleanupOrphans();

      expect(removed.sort()).toEqual(['orphan-1', 'orphan-2']);
      expect(BlueprintStore.isAgentActivated('orphan-1')).toBe(false);
      expect(BlueprintStore.isAgentActivated('orphan-2')).toBe(false);
      expect(globalThis.State.get('agents')).toEqual([]);
      const custom = JSON.parse(globalThis.localStorage.getItem(globalThis.Utils.KEYS.customAgents) || '[]');
      expect(custom).toEqual([]);
    });

    it('honors slot assignments on State.spaceships even when _shipState is empty', async () => {
      const shipUuid = '22222222-3333-4444-8555-666666666666';
      BlueprintStore.activateShip(shipUuid);
      BlueprintStore.activateAgent('guarded-agent');
      // _shipState is empty but State.spaceships has the slot mapping
      globalThis.State.set('spaceships', [{
        id: shipUuid,
        config: { slot_assignments: { 0: 'guarded-agent' } },
      }]);
      globalThis.State.set('agents', [{ id: 'guarded-agent', name: 'Guarded' }]);

      const removed = await BlueprintStore.cleanupOrphans();

      expect(removed).toEqual([]);
      expect(BlueprintStore.isAgentActivated('guarded-agent')).toBe(true);
    });

    it('is idempotent — a second call is a no-op', async () => {
      BlueprintStore.activateAgent('orphan-x');
      globalThis.State.set('agents', [{ id: 'orphan-x', name: 'X' }]);

      const first = await BlueprintStore.cleanupOrphans();
      const second = await BlueprintStore.cleanupOrphans();

      expect(first).toEqual(['orphan-x']);
      expect(second).toEqual([]);
    });
  });
});
