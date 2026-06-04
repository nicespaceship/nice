import { describe, it, expect } from 'vitest';

// setup.js loads lib/utils.js as a global against the real jsdom document, so
// Utils.safeUrl() runs the real scheme gate used by the markdown renderers.
describe('Utils.safeUrl', () => {
  it('passes through http(s) URLs unchanged', () => {
    expect(Utils.safeUrl('http://example.com/a?b=1')).toBe('http://example.com/a?b=1');
    expect(Utils.safeUrl('https://example.com')).toBe('https://example.com');
  });

  it('preserves the URL casing and only lowercases the scheme for the test', () => {
    expect(Utils.safeUrl('HTTPS://Example.com/Path')).toBe('HTTPS://Example.com/Path');
  });

  it('allows mailto: and tel:', () => {
    expect(Utils.safeUrl('mailto:a@b.com')).toBe('mailto:a@b.com');
    expect(Utils.safeUrl('tel:+15551234567')).toBe('tel:+15551234567');
  });

  it('treats schemeless URLs as relative and passes them through', () => {
    expect(Utils.safeUrl('/bridge?tab=log')).toBe('/bridge?tab=log');
    expect(Utils.safeUrl('#anchor')).toBe('#anchor');
    expect(Utils.safeUrl('page.html')).toBe('page.html');
  });

  it('blocks javascript: URLs', () => {
    expect(Utils.safeUrl('javascript:alert(1)')).toBe('');
    expect(Utils.safeUrl('JaVaScRiPt:alert(1)')).toBe('');
  });

  it('blocks javascript: hidden behind control chars and leading space', () => {
    expect(Utils.safeUrl('java\tscript:alert(1)')).toBe('');
    expect(Utils.safeUrl('java\nscript:alert(1)')).toBe('');
    expect(Utils.safeUrl('  javascript:alert(1)')).toBe('');
  });

  it('blocks vbscript: and other unknown schemes', () => {
    expect(Utils.safeUrl('vbscript:msgbox(1)')).toBe('');
    expect(Utils.safeUrl('file:///etc/passwd')).toBe('');
  });

  it('blocks data: URLs by default', () => {
    expect(Utils.safeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(Utils.safeUrl('data:image/png;base64,iVBOR')).toBe('');
  });

  it('allows data:image only when allowData is set, never data:text/html', () => {
    expect(Utils.safeUrl('data:image/png;base64,iVBOR', true)).toBe('data:image/png;base64,iVBOR');
    expect(Utils.safeUrl('data:text/html,<script>alert(1)</script>', true)).toBe('');
  });

  it('returns empty string for null/undefined/blank', () => {
    expect(Utils.safeUrl(null)).toBe('');
    expect(Utils.safeUrl(undefined)).toBe('');
    expect(Utils.safeUrl('   ')).toBe('');
  });

  it('gates the scheme but does NOT escape quotes — pair with escAttr for attributes', () => {
    // A valid http URL carrying a breakout payload survives safeUrl (scheme is
    // http), so the caller must escAttr it before placing it in an attribute.
    const evil = 'http://x/" onerror="alert(1)';
    expect(Utils.safeUrl(evil)).toBe(evil);
    const attr = `<img src="${Utils.escAttr(Utils.safeUrl(evil, true))}">`;
    expect(attr).not.toMatch(/onerror="/);
    expect(attr).toContain('&quot;');
  });

  it('neutralizes a javascript: markdown link sink (esc\'d url, quote-escape path)', () => {
    // Mirrors content-queue.js: url is already esc()'d, then quote-escaped.
    const url = 'javascript:alert(1)';
    const href = Utils.safeUrl(url).replace(/"/g, '&quot;');
    expect(`<a href="${href}">`).toBe('<a href="">');
  });
});
