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
});
