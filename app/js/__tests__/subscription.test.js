import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// Stub globals that subscription.js's IIFE accesses at definition time.
// Everything is optional (the module guards with `typeof X !== 'undefined'`),
// but providing them gets us predictable behavior in tests.
globalThis.window = globalThis;
globalThis.localStorage = {
  _s: {},
  getItem(k) { return this._s[k] ?? null; },
  setItem(k, v) { this._s[k] = v; },
  removeItem(k) { delete this._s[k]; },
};
globalThis.Utils = { KEYS: { plan: 'nice-plan' } };

// Load subscription.js as an IIFE.
let code = readFileSync(resolve(__dir, '../lib/subscription.js'), 'utf-8');
code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
eval(code);

describe('Subscription.handleBillingError', () => {
  beforeEach(() => {
    globalThis.Notify = { send: vi.fn() };
  });

  it('returns false and does not toast when code is missing', () => {
    const handled = Subscription.handleBillingError({ error: 'no code here' });
    expect(handled).toBe(false);
    expect(Notify.send).not.toHaveBeenCalled();
  });

  it('returns false for null/undefined bodies', () => {
    expect(Subscription.handleBillingError(null)).toBe(false);
    expect(Subscription.handleBillingError(undefined)).toBe(false);
    expect(Notify.send).not.toHaveBeenCalled();
  });

  it('renders an upgrade CTA for subscription_required', () => {
    Subscription.handleBillingError({ code: 'subscription_required', error: 'Pro required' });
    expect(Notify.send).toHaveBeenCalledTimes(1);
    const arg = Notify.send.mock.calls[0][0];
    expect(arg.title).toMatch(/Pro/i);
    expect(arg.message).toContain('Pro');
  });

  it('renders the add-on name for addon_required', () => {
    Subscription.handleBillingError({
      code: 'addon_required',
      error: 'Needs claude add-on',
      required_addon: 'claude',
    });
    expect(Notify.send).toHaveBeenCalledTimes(1);
    const arg = Notify.send.mock.calls[0][0];
    expect(arg.title).toMatch(/Claude/i);
  });

  it('surfaces the pool name for insufficient_tokens', () => {
    Subscription.handleBillingError({
      code: 'insufficient_tokens',
      error: 'Out of tokens',
      pool: 'premium',
      weight: 15,
      remaining: 3,
    });
    expect(Notify.send).toHaveBeenCalledTimes(1);
    const arg = Notify.send.mock.calls[0][0];
    expect(arg.title).toMatch(/premium/);
  });

  it('renders an update-card CTA for past_due', () => {
    Subscription.handleBillingError({ code: 'past_due' });
    expect(Notify.send).toHaveBeenCalledTimes(1);
    const arg = Notify.send.mock.calls[0][0];
    expect(arg.title).toMatch(/Payment/i);
  });

  it('passes an explicit error message through as the toast body when provided', () => {
    Subscription.handleBillingError({
      code: 'insufficient_tokens',
      error: 'Bespoke server message.',
      pool: 'claude',
    });
    const arg = Notify.send.mock.calls[0][0];
    expect(arg.message).toBe('Bespoke server message.');
  });

  it('does not throw when Notify is missing entirely', () => {
    delete globalThis.Notify;
    expect(() => Subscription.handleBillingError({ code: 'past_due' })).not.toThrow();
    // The function still returns true (body had a code) so the caller can
    // stop treating this as an unexpected error.
    expect(Subscription.handleBillingError({ code: 'past_due' })).toBe(true);
    // Restore for later tests
    globalThis.Notify = { send: vi.fn() };
  });

  it('returns true once it has decided to handle the body', () => {
    expect(Subscription.handleBillingError({ code: 'subscription_required' })).toBe(true);
    expect(Subscription.handleBillingError({ code: 'addon_required' })).toBe(true);
    expect(Subscription.handleBillingError({ code: 'insufficient_tokens' })).toBe(true);
    expect(Subscription.handleBillingError({ code: 'past_due' })).toBe(true);
  });
});

describe('Subscription paywall-disabled bypass (self-hosters)', () => {
  beforeEach(() => {
    globalThis.Notify = { send: vi.fn() };
  });

  it('reports Pro + all add-ons when paywall is disabled via window.NICE_CONFIG', async () => {
    window.NICE_CONFIG = { paywallEnabled: false };
    // getSubscription caches, so we call it then inspect shape.
    const sub = await Subscription.getSubscription();
    expect(sub.plan).toBe('pro');
    expect(sub.status).toBe('active');
    expect(sub.addons).toEqual(expect.arrayContaining(['claude', 'premium']));
    expect(Subscription.isPro()).toBe(true);
    expect(Subscription.hasAddon('claude')).toBe(true);
    expect(Subscription.hasAddon('premium')).toBe(true);
    // Clean up the global so unrelated tests aren't affected.
    delete window.NICE_CONFIG;
  });

  it('respects paywallEnabled:true as the default when no config is set', () => {
    delete window.NICE_CONFIG;
    expect(Subscription.paywallEnabled()).toBe(true);
  });

  it('respects an explicit paywallEnabled:true setting', () => {
    window.NICE_CONFIG = { paywallEnabled: true };
    expect(Subscription.paywallEnabled()).toBe(true);
    delete window.NICE_CONFIG;
  });
});
