import { describe, it, expect } from 'vitest';

// setup.js loads lib/utils.js as a global against the real jsdom document,
// so Utils.esc()/escAttr() serialize for real.
describe('Utils.escAttr', () => {
  it('escapes double quotes so a value cannot break out of a "..." attribute', () => {
    expect(Utils.escAttr('x" onmouseover="alert(1)')).toBe('x&quot; onmouseover=&quot;alert(1)');
  });

  it('escapes single quotes', () => {
    expect(Utils.escAttr("a'b")).toBe('a&#39;b');
  });

  it('still escapes the <, >, & that esc() handles', () => {
    expect(Utils.escAttr('<b>&"')).toBe('&lt;b&gt;&amp;&quot;');
  });

  it('returns empty string for null/undefined', () => {
    expect(Utils.escAttr(null)).toBe('');
    expect(Utils.escAttr(undefined)).toBe('');
  });

  it('neutralizes a tag-list attribute-breakout payload', () => {
    const tags = ['ops', 'x" onmouseover="alert(document.cookie)'];
    const attr = `data-tags="${Utils.escAttr(tags.join(','))}"`;
    // The injected handler can no longer escape the attribute.
    expect(attr).not.toMatch(/onmouseover="/);
    expect(attr).toContain('&quot;');
  });
});
