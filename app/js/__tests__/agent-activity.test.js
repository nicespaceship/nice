import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('AgentActivity', () => {
  beforeEach(() => {
    AgentActivity._reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports idle for unknown agents', () => {
    expect(AgentActivity.getState('bp-unknown')).toBe('idle');
  });

  it('returns idle for null/empty agent ids', () => {
    expect(AgentActivity.getState(null)).toBe('idle');
    expect(AgentActivity.getState('')).toBe('idle');
    expect(AgentActivity.getState(undefined)).toBe('idle');
  });

  it('marks an agent active', () => {
    AgentActivity.markActive('bp-1');
    expect(AgentActivity.getState('bp-1')).toBe('active');
  });

  it('transitions active → recent on markIdle', () => {
    AgentActivity.markActive('bp-1');
    AgentActivity.markIdle('bp-1');
    expect(AgentActivity.getState('bp-1')).toBe('recent');
  });

  it('decays recent → idle after RECENT_WINDOW_MS', () => {
    AgentActivity.markActive('bp-1');
    AgentActivity.markIdle('bp-1');
    expect(AgentActivity.getState('bp-1')).toBe('recent');

    vi.advanceTimersByTime(AgentActivity.RECENT_WINDOW_MS - 100);
    expect(AgentActivity.getState('bp-1')).toBe('recent');

    vi.advanceTimersByTime(200);
    expect(AgentActivity.getState('bp-1')).toBe('idle');
  });

  it('markIdle on an unknown agent is a no-op', () => {
    AgentActivity.markIdle('bp-never-active');
    expect(AgentActivity.getState('bp-never-active')).toBe('idle');
  });

  it('markActive ignores null/empty ids', () => {
    AgentActivity.markActive(null);
    AgentActivity.markActive('');
    expect(AgentActivity.getState(null)).toBe('idle');
  });

  it('emits to subscribers on markActive', () => {
    const fn = vi.fn();
    AgentActivity.subscribe(fn);
    AgentActivity.markActive('bp-1');
    expect(fn).toHaveBeenCalledWith('bp-1', 'active');
  });

  it('emits to subscribers on markIdle', () => {
    const fn = vi.fn();
    AgentActivity.subscribe(fn);
    AgentActivity.markActive('bp-1');
    fn.mockClear();
    AgentActivity.markIdle('bp-1');
    expect(fn).toHaveBeenCalledWith('bp-1', 'recent');
  });

  it('emits idle when recent window elapses', () => {
    const fn = vi.fn();
    AgentActivity.subscribe(fn);
    AgentActivity.markActive('bp-1');
    AgentActivity.markIdle('bp-1');
    fn.mockClear();

    vi.advanceTimersByTime(AgentActivity.RECENT_WINDOW_MS + 5_500);
    expect(fn).toHaveBeenCalledWith('bp-1', 'idle');
  });

  it('subscribe returns an unsubscribe function', () => {
    const fn = vi.fn();
    const unsub = AgentActivity.subscribe(fn);
    unsub();
    AgentActivity.markActive('bp-1');
    expect(fn).not.toHaveBeenCalled();
  });

  it('multiple agents track independently', () => {
    AgentActivity.markActive('bp-1');
    AgentActivity.markActive('bp-2');
    AgentActivity.markIdle('bp-1');
    expect(AgentActivity.getState('bp-1')).toBe('recent');
    expect(AgentActivity.getState('bp-2')).toBe('active');
  });

  it('tolerates a throwing subscriber without breaking other subscribers', () => {
    const ok = vi.fn();
    AgentActivity.subscribe(() => { throw new Error('boom'); });
    AgentActivity.subscribe(ok);
    AgentActivity.markActive('bp-1');
    expect(ok).toHaveBeenCalledWith('bp-1', 'active');
  });

  it('subscribe ignores non-function args', () => {
    expect(() => AgentActivity.subscribe(null)).not.toThrow();
    expect(() => AgentActivity.subscribe('not a fn')).not.toThrow();
    AgentActivity.markActive('bp-1');
    // No assertion needed — test passes if subscribe didn't throw and
    // markActive didn't blow up trying to call non-function entries.
  });

  it('AgentExecutor._logToShipLog emits active on mission_start', () => {
    expect(AgentActivity.getState('bp-test')).toBe('idle');
    AgentExecutor._logToShipLog(null, 'bp-test', 'user', 'hello', { event: 'mission_start' });
    expect(AgentActivity.getState('bp-test')).toBe('active');
  });

  it('AgentExecutor._logToShipLog emits idle on final_answer', () => {
    AgentExecutor._logToShipLog(null, 'bp-test', 'user', 'hello', { event: 'mission_start' });
    AgentExecutor._logToShipLog(null, 'bp-test', 'agent', 'reply', { event: 'final_answer' });
    expect(AgentActivity.getState('bp-test')).toBe('recent');
  });

  it('AgentExecutor._logToShipLog ignores intermediate steps', () => {
    AgentExecutor._logToShipLog(null, 'bp-test', 'user', 'hello', { event: 'mission_start' });
    AgentExecutor._logToShipLog(null, 'bp-test', 'agent', 'thinking', { event: 'tool_call' });
    expect(AgentActivity.getState('bp-test')).toBe('active');
  });

  it('AgentExecutor._logToShipLog with no agentId is a no-op for activity', () => {
    AgentExecutor._logToShipLog('ship-1', null, 'user', 'hello', { event: 'mission_start' });
    expect(AgentActivity.getState(null)).toBe('idle');
  });
});
