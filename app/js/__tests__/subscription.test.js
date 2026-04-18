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
globalThis.Utils = { KEYS: { plan: 'nice-plan', enabledModels: 'nice-enabled-models' } };

// Do NOT redefine localStorage or State — the global setup.js already
// provides mocks for both (with State._reset for beforeEach cleanup).
// Patch localStorage._s onto the global mock so our existing tests'
// reset semantics still work the way they used to.
if (!globalThis.localStorage._s) globalThis.localStorage._s = {};
const _realGet = globalThis.localStorage.getItem.bind(globalThis.localStorage);
const _realSet = globalThis.localStorage.setItem.bind(globalThis.localStorage);
// Bridge the _s proxy for tests that poke it directly.
globalThis.localStorage._s = new Proxy({}, {
  get: (_, k) => _realGet(k),
  set: (_, k, v) => { _realSet(k, v); return true; },
  deleteProperty: (_, k) => { globalThis.localStorage.removeItem(k); return true; },
});

// TokenConfig is needed by _autoEnableEntitled but isn't in setup.
{
  let tcCode = readFileSync(resolve(__dir, '../lib/token-config.js'), 'utf-8');
  tcCode = tcCode.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(tcCode);
}

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

describe('Subscription auto-enable hydrates State on repeat init', () => {
  beforeEach(() => {
    globalThis.Notify = { send: vi.fn() };
    localStorage._s = {};
    State.set('enabled_models', undefined);
  });

  it('populates State.enabled_models from localStorage when fingerprint already matches', async () => {
    // Simulates the production bug: a returning user lands on the app
    // with localStorage carrying an entitlement fingerprint from a prior
    // session. State is fresh (undefined). Without the hydration fix,
    // the fingerprint-matches early-return would leave State empty and
    // the prompt-panel dropdown would show only the default Gemini.

    window.NICE_CONFIG = { paywallEnabled: false }; // forces pro+both add-ons
    localStorage._s['nice-enabled-models'] = JSON.stringify({
      'gemini-2-5-flash': true,
      'gpt-5-mini': true,
      'llama-4-scout': true,
      'claude-4-6-sonnet': false,
    });
    localStorage._s['nice-subscription-last-entitlement'] = 'pro|claude,premium';
    State.set('enabled_models', undefined);

    await Subscription.init();

    const afterInit = State.get('enabled_models');
    expect(afterInit).toBeDefined();
    expect(typeof afterInit).toBe('object');
    expect(afterInit['gemini-2-5-flash']).toBe(true);
    expect(afterInit['gpt-5-mini']).toBe(true);
    expect(afterInit['llama-4-scout']).toBe(true);

    delete window.NICE_CONFIG;
  });

  it('widens the entitlement set when fingerprint changes (free → pro)', async () => {
    // Represents an upgrade: last session was free, this session is pro.
    // The function should expand the set to include newly-entitled
    // models and update the fingerprint.

    window.NICE_CONFIG = { paywallEnabled: false };
    localStorage._s['nice-subscription-last-entitlement'] = 'free|';
    localStorage._s['nice-enabled-models'] = JSON.stringify({
      'gemini-2-5-flash': true,
    });

    await Subscription.init();

    const afterInit = State.get('enabled_models');
    expect(afterInit['gpt-5-mini']).toBe(true);
    expect(afterInit['claude-4-6-sonnet']).toBe(true);
    expect(localStorage._s['nice-subscription-last-entitlement']).toBe('pro|claude,premium');

    delete window.NICE_CONFIG;
  });

  it('is a no-op when fingerprint matches and State already has the data', async () => {
    window.NICE_CONFIG = { paywallEnabled: false };
    const pristine = { 'gemini-2-5-flash': true, 'gpt-5-mini': true };
    State.set('enabled_models', pristine);
    localStorage._s['nice-subscription-last-entitlement'] = 'pro|claude,premium';
    localStorage._s['nice-enabled-models'] = JSON.stringify(pristine);

    await Subscription.init();

    // State is resynced from current state — the same object shape.
    const afterInit = State.get('enabled_models');
    expect(afterInit['gemini-2-5-flash']).toBe(true);
    expect(afterInit['gpt-5-mini']).toBe(true);

    delete window.NICE_CONFIG;
  });
});
