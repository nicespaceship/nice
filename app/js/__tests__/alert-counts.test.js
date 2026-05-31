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
    expect(AlertCounts.GROUPS.settings).toEqual(['integrations', 'moderation', 'wallet', 'security']);
  });

  it('reports zero counts with empty state', () => {
    expect(AlertCounts.get()).toEqual({
      schematic: 0, missions: 0, outbox: 0,
      integrations: 0, moderation: 0, wallet: 0, security: 0,
    });
    expect(AlertCounts.sum('bridge')).toBe(0);
    expect(AlertCounts.sum('settings')).toBe(0);
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

  describe('integrations', () => {
    it('counts only error connections, not disconnected or connected', () => {
      State.set('mcp_connections', [
        { id: 'm1', status: 'error' },
        { id: 'm2', status: 'disconnected' },
        { id: 'm3', status: 'connected' },
        { id: 'm4', status: 'error' },
      ]);
      expect(AlertCounts.count('integrations')).toBe(2);
    });
  });

  describe('moderation', () => {
    it('projects the stashed pending count, defaults to 0', () => {
      expect(AlertCounts.count('moderation')).toBe(0);
      State.set('moderation_pending', 3);
      expect(AlertCounts.count('moderation')).toBe(3);
    });
  });

  describe('security', () => {
    it('projects the stashed open-checklist count, defaults to 0', () => {
      expect(AlertCounts.count('security')).toBe(0);
      State.set('compliance_open', 4);
      expect(AlertCounts.count('security')).toBe(4);
    });
  });

  describe('wallet', () => {
    it('is 0 with no pools (free tier)', () => {
      expect(AlertCounts.count('wallet')).toBe(0);
      State.set('token_balance', { pools: {} });
      expect(AlertCounts.count('wallet')).toBe(0);
    });

    it('ignores a full pool and flags a depleted one', () => {
      State.set('token_balance', { pools: {
        standard: { allowance: 1000, used: 0,   purchased: 0 },  // full → ok
        claude:   { allowance: 500,  used: 480, purchased: 0 },  // 20 left (<10%) → low
      } });
      expect(AlertCounts.count('wallet')).toBe(1);
    });

    it('counts purchased top-ups toward remaining', () => {
      State.set('token_balance', { pools: {
        standard: { allowance: 1000, used: 1000, purchased: 500 },  // 500 left → ok
        premium:  { allowance: 500,  used: 500,  purchased: 10 },   // 10 left → low
      } });
      expect(AlertCounts.count('wallet')).toBe(1);
    });

    it('ignores a pool with no monthly allowance', () => {
      State.set('token_balance', { pools: {
        legacy: { allowance: 0, used: 0, purchased: 0 },
      } });
      expect(AlertCounts.count('wallet')).toBe(0);
    });
  });

  describe('sum', () => {
    it('aggregates the bridge group', () => {
      State.set('agents', [{ id: 'a1', status: 'error' }]);
      State.set('missions', [{ status: 'failed' }, { status: 'review' }]);
      // schematic 1 + missions 2 + outbox 0
      expect(AlertCounts.sum('bridge')).toBe(3);
    });

    it('aggregates the settings group', () => {
      State.set('mcp_connections', [{ status: 'error' }]);
      State.set('moderation_pending', 2);
      State.set('compliance_open', 5);
      // integrations 1 + moderation 2 + wallet 0 + security 5
      expect(AlertCounts.sum('settings')).toBe(8);
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
