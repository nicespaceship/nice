import { describe, it, expect } from 'vitest';

// SafeExpr is loaded globally by setup.js.

describe('SafeExpr.arithmetic', () => {
  it('evaluates arithmetic with precedence, power and parentheses', () => {
    expect(SafeExpr.arithmetic('2 + 3 * 4')).toBe(14);
    expect(SafeExpr.arithmetic('(2 + 3) * 4')).toBe(20);
    expect(SafeExpr.arithmetic('2^3^2')).toBe(512);
    expect(SafeExpr.arithmetic('2 ** 10')).toBe(1024);
    expect(SafeExpr.arithmetic('-2^2')).toBe(-4);
    expect(SafeExpr.arithmetic('-3 * 2')).toBe(-6);
    expect(SafeExpr.arithmetic('10 % 3')).toBe(1);
  });

  it('reads numbers, constants and functions', () => {
    expect(SafeExpr.arithmetic('5e3')).toBe(5000);
    expect(SafeExpr.arithmetic('.5 + 1.5e-1')).toBeCloseTo(0.65);
    expect(SafeExpr.arithmetic('PI * 5^2')).toBeCloseTo(Math.PI * 25);
    expect(SafeExpr.arithmetic('2 * e')).toBeCloseTo(2 * Math.E);
    expect(SafeExpr.arithmetic('sqrt(144) + max(1, 7, 3) + LOG10(1000)')).toBe(22);
    expect(SafeExpr.arithmetic('pow(2, 8)')).toBe(256);
  });

  it('refuses anything but numbers and the listed names', () => {
    for (const bad of [
      'Math.max.constructor(String.fromCharCode(97))()',
      'constructor', 'this', 'globalThis', 'alert(1)', '"a"', 'x = 1', '2 > 1', 'sqrt.call(1)', '2 +', '',
    ]) {
      expect(() => SafeExpr.arithmetic(bad), bad).toThrow();
    }
  });

  it('refuses results that are not finite', () => {
    expect(() => SafeExpr.arithmetic('1 / 0')).toThrow(/finite/);
  });

  it('refuses very long or deeply nested input', () => {
    expect(() => SafeExpr.arithmetic('1+'.repeat(600) + '1')).toThrow(/too long/);
    expect(() => SafeExpr.arithmetic('('.repeat(100) + '1' + ')'.repeat(100))).toThrow(/nested/);
  });
});

describe('SafeExpr.condition', () => {
  const result = { text: 'Hello APPROVED world', length: 20, success: true };

  it('reads the scope, string members and comparisons', () => {
    expect(SafeExpr.condition('result.length > 10', { result })).toBe(true);
    expect(SafeExpr.condition('result.text.includes("APPROVED") && result.success', { result })).toBe(true);
    expect(SafeExpr.condition("result.text.toLowerCase().startsWith('hello')", { result })).toBe(true);
    expect(SafeExpr.condition('!result.success || result.text.length === 0', { result })).toBe(false);
    expect(SafeExpr.condition('result.text.indexOf("world") >= 0', { result })).toBe(true);
    expect(SafeExpr.condition('true', {})).toBe(true);
    expect(SafeExpr.condition('null == null', {})).toBe(true);
  });

  it('cannot reach constructors, prototypes, functions or globals', () => {
    for (const bad of [
      'result.constructor', 'result.text.constructor', 'result.__proto__', 'result.text.includes.call',
      'result.toString()', 'window', 'globalThis.x', 'alert(1)', 'result.text.replace("a", "b")',
      'result.missing', 'result.text.at(0)',
    ]) {
      expect(() => SafeExpr.condition(bad, { result }), bad).toThrow();
    }
  });
});
