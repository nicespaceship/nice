import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('MissionRouter', () => {

  beforeEach(() => {
    // Mock Blueprints
    globalThis.Blueprints = {
      getShipState: vi.fn(),
      getSpaceship: vi.fn(),
      getAgent: vi.fn(),
    };
    // Mock ShipLog
    globalThis.ShipLog = {
      append: vi.fn().mockResolvedValue(null),
      execute: vi.fn().mockResolvedValue({ content: 'Mock response', agent: 'TestAgent' }),
    };
  });

  describe('buildCrewManifest', () => {

    it('returns empty array when no ship state', () => {
      Blueprints.getShipState.mockReturnValue(null);
      expect(MissionRouter.buildCrewManifest('ship-1')).toEqual([]);
    });

    it('returns empty array when no slot assignments', () => {
      Blueprints.getShipState.mockReturnValue({ slot_assignments: {} });
      expect(MissionRouter.buildCrewManifest('ship-1')).toEqual([]);
    });

    it('builds manifest from slot assignments', () => {
      Blueprints.getShipState.mockReturnValue({
        slot_assignments: { '0': 'bp-agent-01', '1': 'bp-agent-02' },
      });
      Blueprints.getSpaceship.mockReturnValue({
        name: 'Test Ship',
        metadata: { crew: [{ label: 'Commander' }, { label: 'Engineer' }] },
      });
      Blueprints.getAgent.mockImplementation((id) => {
        if (id === 'bp-agent-01') return {
          id: 'bp-agent-01', name: 'Alpha', description: 'Research agent',
          config: { role: 'Research', tools: ['web-search'] },
          metadata: { caps: ['Deep research'] },
        };
        if (id === 'bp-agent-02') return {
          id: 'bp-agent-02', name: 'Beta', description: 'Ops agent',
          config: { role: 'Ops', tools: [] },
          metadata: { caps: ['Task management'] },
        };
        return null;
      });

      const manifest = MissionRouter.buildCrewManifest('ship-1');
      expect(manifest).toHaveLength(2);
      expect(manifest[0].name).toBe('Alpha');
      expect(manifest[0].slot_label).toBe('Commander');
      expect(manifest[0].tools).toEqual(['web-search']);
      expect(manifest[1].name).toBe('Beta');
      expect(manifest[1].slot_label).toBe('Engineer');
    });

    it('skips empty slots', () => {
      Blueprints.getShipState.mockReturnValue({
        slot_assignments: { '0': 'bp-agent-01', '1': null, '2': 'bp-agent-03' },
      });
      Blueprints.getSpaceship.mockReturnValue({ name: 'Ship', metadata: {} });
      Blueprints.getAgent.mockImplementation((id) => {
        if (id === 'bp-agent-01') return { id: 'bp-agent-01', name: 'A', config: {}, metadata: {} };
        if (id === 'bp-agent-03') return { id: 'bp-agent-03', name: 'C', config: {}, metadata: {} };
        return null;
      });

      const manifest = MissionRouter.buildCrewManifest('ship-1');
      expect(manifest).toHaveLength(2);
    });
  });

  describe('route', () => {

    it('returns direct result when no crew', async () => {
      Blueprints.getShipState.mockReturnValue({ slot_assignments: {} });
      Blueprints.getSpaceship.mockReturnValue({ name: 'Empty Ship' });

      const { routing, result } = await MissionRouter.route('ship-1', 'Hello');
      expect(routing).toBeNull();
      expect(result.content).toBe('Mock response');
    });

    it('skips LLM routing with single crew member', async () => {
      Blueprints.getShipState.mockReturnValue({
        slot_assignments: { '0': 'bp-agent-01' },
      });
      Blueprints.getSpaceship.mockReturnValue({ name: 'Solo Ship', metadata: {} });
      Blueprints.getAgent.mockReturnValue({
        id: 'bp-agent-01', name: 'Solo', config: {}, metadata: {},
      });

      const { routing, result } = await MissionRouter.route('ship-1', 'Do something');
      expect(routing.agentName).toBe('Solo');
      expect(routing.reasoning).toBe('Only crew member');
      expect(result.content).toBe('Mock response');
    });
  });
});
