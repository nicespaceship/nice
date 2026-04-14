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

    it('keeps agents that are also assigned to another active ship', async () => {
      BlueprintStore.activateShip('ship-01');
      BlueprintStore.activateShip('ship-02');
      BlueprintStore.activateAgent('shared-agent');
      BlueprintStore.activateAgent('solo-agent');
      BlueprintStore.saveShipState('bp-ship-01', {
        slot_assignments: { 0: 'shared-agent', 1: 'solo-agent' },
        agent_ids: ['shared-agent', 'solo-agent'],
      });
      BlueprintStore.saveShipState('bp-ship-02', {
        slot_assignments: { 0: 'shared-agent' },
        agent_ids: ['shared-agent'],
      });

      await BlueprintStore.deactivateShip('ship-01');

      expect(BlueprintStore.isAgentActivated('solo-agent')).toBe(false);
      expect(BlueprintStore.isAgentActivated('shared-agent')).toBe(true);
      expect(BlueprintStore.isShipActivated('ship-02')).toBe(true);
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
  });
});
