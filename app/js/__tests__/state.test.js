import { describe, it, expect, vi } from 'vitest';

describe('State', () => {
  it('should get and set values', () => {
    State.set('foo', 'bar');
    expect(State.get('foo')).toBe('bar');
  });

  it('should return undefined for unset keys', () => {
    expect(State.get('nonexistent')).toBeUndefined();
  });

  it('should overwrite existing values', () => {
    State.set('key', 'first');
    State.set('key', 'second');
    expect(State.get('key')).toBe('second');
  });

  it('should handle objects and arrays', () => {
    State.set('agents', [{ id: 1, name: 'Nova' }]);
    expect(State.get('agents')).toHaveLength(1);
    expect(State.get('agents')[0].name).toBe('Nova');
  });

  it('should notify listeners on set', () => {
    const fn = vi.fn();
    State.on('count', fn);
    State.set('count', 42);
    expect(fn).toHaveBeenCalledWith(42);
  });

  it('should support multiple listeners', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    State.on('x', fn1);
    State.on('x', fn2);
    State.set('x', 'hello');
    expect(fn1).toHaveBeenCalledOnce();
    expect(fn2).toHaveBeenCalledOnce();
  });

  it('should remove listeners with off', () => {
    const fn = vi.fn();
    State.on('y', fn);
    State.off('y', fn);
    State.set('y', 'test');
    expect(fn).not.toHaveBeenCalled();
  });

  it('should batch set multiple values', () => {
    State.setBatched({ a: 1, b: 2, c: 3 });
    expect(State.get('a')).toBe(1);
    expect(State.get('b')).toBe(2);
    expect(State.get('c')).toBe(3);
  });

  it('should handle null and false values', () => {
    State.set('nil', null);
    State.set('zero', 0);
    State.set('empty', '');
    State.set('bool', false);
    expect(State.get('nil')).toBeNull();
    expect(State.get('zero')).toBe(0);
    expect(State.get('empty')).toBe('');
    expect(State.get('bool')).toBe(false);
  });
});
