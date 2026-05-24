import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('LLMActivity', () => {
  beforeEach(() => {
    LLMActivity._reset();
  });

  it('starts idle', () => {
    expect(LLMActivity.isActive()).toBe(false);
    expect(LLMActivity.activeCount()).toBe(0);
  });

  it('marks active when a handle is open', () => {
    const h = LLMActivity.start('gemini-2.5-flash');
    expect(LLMActivity.isActive()).toBe(true);
    expect(LLMActivity.activeCount()).toBe(1);
    h.end({ totalTokens: 100 });
    expect(LLMActivity.isActive()).toBe(false);
  });

  it('emits start + end events to subscribers', () => {
    const events = [];
    const unsub = LLMActivity.subscribe((event, payload) => events.push({ event, payload }));

    const h = LLMActivity.start('claude-4.6-sonnet', 'bp-test');
    h.end({ totalTokens: 850 });

    expect(events).toHaveLength(2);
    expect(events[0].event).toBe('start');
    expect(events[0].payload.model).toBe('claude-4.6-sonnet');
    expect(events[0].payload.agent).toBe('bp-test');
    expect(events[1].event).toBe('end');
    expect(events[1].payload.totalTokens).toBe(850);
    expect(events[1].payload.duration).toBeGreaterThanOrEqual(0);

    unsub();
  });

  it('handles concurrent calls — count tracks both', () => {
    const a = LLMActivity.start('model-a');
    const b = LLMActivity.start('model-b');
    expect(LLMActivity.activeCount()).toBe(2);
    expect(LLMActivity.isActive()).toBe(true);

    a.end({ totalTokens: 50 });
    expect(LLMActivity.activeCount()).toBe(1);
    expect(LLMActivity.isActive()).toBe(true);

    b.end({ totalTokens: 75 });
    expect(LLMActivity.activeCount()).toBe(0);
    expect(LLMActivity.isActive()).toBe(false);
  });

  it('ignores double-end on the same handle', () => {
    const events = [];
    LLMActivity.subscribe((event) => events.push(event));

    const h = LLMActivity.start('model');
    h.end({ totalTokens: 10 });
    h.end({ totalTokens: 999 }); // second end is a no-op

    expect(events.filter(e => e === 'end')).toHaveLength(1);
    expect(LLMActivity.isActive()).toBe(false);
  });

  it('end({}) defaults totalTokens to 0', () => {
    let endPayload = null;
    LLMActivity.subscribe((event, payload) => { if (event === 'end') endPayload = payload; });

    const h = LLMActivity.start('model');
    h.end();

    expect(endPayload.totalTokens).toBe(0);
  });

  it('unsubscribe removes the listener', () => {
    const fn = vi.fn();
    const unsub = LLMActivity.subscribe(fn);
    LLMActivity.start('m').end();
    expect(fn).toHaveBeenCalledTimes(2); // start + end
    unsub();
    LLMActivity.start('m').end();
    expect(fn).toHaveBeenCalledTimes(2); // no further calls
  });

  it('survives a throwing subscriber', () => {
    LLMActivity.subscribe(() => { throw new Error('boom'); });
    const fine = vi.fn();
    LLMActivity.subscribe(fine);
    LLMActivity.start('m').end({ totalTokens: 5 });
    expect(fine).toHaveBeenCalledTimes(2);
  });

  it('chunk() emits a chunk event mid-call', () => {
    const events = [];
    LLMActivity.subscribe((event, payload) => events.push({ event, payload }));
    const h = LLMActivity.start('m');
    h.chunk(15);
    h.end({ totalTokens: 30 });

    expect(events.map(e => e.event)).toEqual(['start', 'chunk', 'end']);
    expect(events[1].payload.deltaTokens).toBe(15);
  });

  it('chunk() after end() is a no-op', () => {
    const events = [];
    LLMActivity.subscribe((event) => events.push(event));
    const h = LLMActivity.start('m');
    h.end();
    h.chunk(100);
    expect(events.filter(e => e === 'chunk')).toHaveLength(0);
  });
});
