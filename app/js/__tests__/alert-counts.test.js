import { describe, it, expect, beforeEach } from 'vitest';

// AlertCounts + State loaded globally by setup.js.

describe('AlertCounts', () => {
  beforeEach(() => {
    State._reset();
  });

  it('exposes get, count, sum, GROUPS', () => {
    expect(typeof AlertCounts.get).toBe('function');
    expect(typeof AlertCounts.count).toBe('function');
    expect(typeof AlertCounts.sum).toBe('function');
    expect(AlertCounts.GROUPS.bridge).toEqual(['schematic', 'missions', 'outbox']);
  });

  it('reports zero counts with empty state', () => {
    expect(AlertCounts.get()).toEqual({ schematic: 0, missions: 0, outbox: 0 });
    expect(AlertCounts.sum('bridge')).toBe(0);
  });

  describe('schematic', () => {
    it('counts agents in error or offline', () => {
      State.set('agents', [
        { id: 'a1', status: 'error' },
        { id: 'a2', status: 'offline' },
        { id: 'a3', status: 'idle' },
      ]);
      expect(AlertCounts.count('schematic')).toBe(2);
    });

    it('counts a deployed ship whose crew has a broken agent', () => {
      State.set('agents', [{ id: 'a1', status: 'error' }]);
      State.set('spaceships', [
        { id: 's1', status: 'deployed', agent_ids: ['a1'] },
        { id: 's2', status: 'deployed', agent_ids: [] },
      ]);
      // 1 broken agent + 1 ship carrying it
      expect(AlertCounts.count('schematic')).toBe(2);
    });
  });

  describe('missions', () => {
    it('counts failed and review missions, ignores others', () => {
      State.set('missions', [
        { status: 'failed' },
        { status: 'review' },
        { status: 'completed' },
        { status: 'running' },
      ]);
      expect(AlertCounts.count('missions')).toBe(2);
    });
  });

  describe('sum', () => {
    it('aggregates the bridge group', () => {
      State.set('agents', [{ id: 'a1', status: 'error' }]);
      State.set('missions', [{ status: 'failed' }, { status: 'review' }]);
      // schematic 1 + missions 2 + outbox 0
      expect(AlertCounts.sum('bridge')).toBe(3);
    });

    it('accepts an explicit key list', () => {
      State.set('missions', [{ status: 'failed' }]);
      expect(AlertCounts.sum(['missions'])).toBe(1);
      expect(AlertCounts.sum(['schematic'])).toBe(0);
    });
  });

  it('count() returns 0 for an unknown key', () => {
    expect(AlertCounts.count('nope')).toBe(0);
  });
});
