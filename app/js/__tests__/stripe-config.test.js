import { describe, it, expect, afterEach } from 'vitest';

// Load StripeConfig as a global
const { readFileSync } = await import('fs');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
const __dir = dirname(fileURLToPath(import.meta.url));
let code = readFileSync(resolve(__dir, '../lib/stripe-config.js'), 'utf-8');
code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
eval(code);

describe('StripeConfig — subscriptions', () => {
  it('defines Pro, Claude, and Premium', () => {
    expect(StripeConfig.SUBSCRIPTIONS.pro).toBeDefined();
    expect(StripeConfig.SUBSCRIPTIONS.claude).toBeDefined();
    expect(StripeConfig.SUBSCRIPTIONS.premium).toBeDefined();
    expect(Object.keys(StripeConfig.SUBSCRIPTIONS).length).toBe(3);
  });

  it('each subscription is $9.99/mo', () => {
    for (const s of Object.values(StripeConfig.SUBSCRIPTIONS)) {
      expect(s.price).toBe(9.99);
    }
  });

  it('each subscription has a live-mode product, price, and payment link', () => {
    for (const s of Object.values(StripeConfig.SUBSCRIPTIONS)) {
      expect(s.productId).toMatch(/^prod_/);
      expect(s.priceId).toMatch(/^price_/);
      expect(s.paymentLinkUrl).toMatch(/^https:\/\/buy\.stripe\.com\//);
    }
  });

  it('each subscription declares the pool it credits', () => {
    expect(StripeConfig.SUBSCRIPTIONS.pro.pool).toBe('standard');
    expect(StripeConfig.SUBSCRIPTIONS.claude.pool).toBe('claude');
    expect(StripeConfig.SUBSCRIPTIONS.premium.pool).toBe('premium');
  });
});

describe('StripeConfig — top-ups', () => {
  it('defines six top-up packs (two per pool)', () => {
    expect(Object.keys(StripeConfig.TOP_UPS).length).toBe(6);
    const pools = StripeConfig.listTopUps().map(t => t.pool);
    expect(pools.filter(p => p === 'standard').length).toBe(2);
    expect(pools.filter(p => p === 'claude').length).toBe(2);
    expect(pools.filter(p => p === 'premium').length).toBe(2);
  });

  it('Boost tier is $29.99, Max tier is $49.99', () => {
    for (const t of StripeConfig.listTopUps()) {
      if (t.id.endsWith('-boost')) expect(t.price).toBe(29.99);
      if (t.id.endsWith('-max'))   expect(t.price).toBe(49.99);
    }
  });

  it('Standard pool: Boost = 1000 tokens, Max = 2500', () => {
    expect(StripeConfig.getTopUp('standard-boost').tokens).toBe(1000);
    expect(StripeConfig.getTopUp('standard-max').tokens).toBe(2500);
  });

  it('Claude pool: Boost = 500 tokens, Max = 1250', () => {
    expect(StripeConfig.getTopUp('claude-boost').tokens).toBe(500);
    expect(StripeConfig.getTopUp('claude-max').tokens).toBe(1250);
  });

  it('Premium pool: Boost = 500 tokens, Max = 1250', () => {
    expect(StripeConfig.getTopUp('premium-boost').tokens).toBe(500);
    expect(StripeConfig.getTopUp('premium-max').tokens).toBe(1250);
  });

  it('Max tier is ~33% cheaper per token than Boost (all pools)', () => {
    // Standard: 29.99/1000 = 2.999c/token vs 49.99/2500 = 1.9996c/token
    // Claude/Premium: 29.99/500 = 5.998c vs 49.99/1250 = 3.999c
    // Both work out to ~33% off per token. The desc copy used to claim 17%.
    const pct = (boostRate, maxRate) => (boostRate - maxRate) / boostRate;
    expect(pct(29.99 / 1000, 49.99 / 2500)).toBeCloseTo(0.333, 2);
    expect(pct(29.99 / 500, 49.99 / 1250)).toBeCloseTo(0.333, 2);
  });

  it('each top-up has a live-mode product, price, and payment link', () => {
    for (const t of StripeConfig.listTopUps()) {
      expect(t.productId).toMatch(/^prod_/);
      expect(t.priceId).toMatch(/^price_/);
      expect(t.paymentLinkUrl).toMatch(/^https:\/\/buy\.stripe\.com\//);
    }
  });

  it('topUpsForPool filters by pool id', () => {
    expect(StripeConfig.topUpsForPool('standard').map(t => t.id)).toEqual(['standard-boost', 'standard-max']);
    expect(StripeConfig.topUpsForPool('claude').map(t => t.id)).toEqual(['claude-boost', 'claude-max']);
    expect(StripeConfig.topUpsForPool('premium').map(t => t.id)).toEqual(['premium-boost', 'premium-max']);
  });
});

describe('StripeConfig — findByPriceId (reverse lookup for webhook)', () => {
  it('resolves a subscription price id to its subscription config', () => {
    const p = StripeConfig.findByPriceId(StripeConfig.SUBSCRIPTIONS.pro.priceId);
    expect(p.kind).toBe('subscription');
    expect(p.id).toBe('pro');
    expect(p.price).toBe(9.99);
    expect(p.pool).toBe('standard');
  });

  it('resolves a top-up price id to its top-up config', () => {
    const p = StripeConfig.findByPriceId(StripeConfig.TOP_UPS['claude-max'].priceId);
    expect(p.kind).toBe('topup');
    expect(p.id).toBe('claude-max');
    expect(p.pool).toBe('claude');
    expect(p.tokens).toBe(1250);
  });

  it('returns null for unknown price ids', () => {
    expect(StripeConfig.findByPriceId('price_nothing')).toBeNull();
  });
});

describe('StripeConfig — mode switching', () => {
  const PRO_TEST_PRICE = 'price_1TgaAmBTNqh90rCubWKRiQAA';

  // setup.js's global beforeEach resets State + clears localStorage; only
  // window.NICE_CONFIG needs explicit cleanup (it is not reset there).
  afterEach(() => {
    if (typeof window !== 'undefined') delete window.NICE_CONFIG;
  });

  it('defaults to live mode', () => {
    expect(StripeConfig.activeMode()).toBe('live');
    expect(StripeConfig.SUBSCRIPTIONS.pro.paymentLinkUrl).toMatch(/^https:\/\/buy\.stripe\.com\//);
  });

  it('window.NICE_CONFIG.stripeMode = "test" flips the catalog to test ids', () => {
    window.NICE_CONFIG = { stripeMode: 'test' };
    expect(StripeConfig.activeMode()).toBe('test');
    expect(StripeConfig.SUBSCRIPTIONS.pro.priceId).toBe(PRO_TEST_PRICE);
    expect(StripeConfig.SUBSCRIPTIONS.pro.paymentLinkUrl).toMatch(/^https:\/\/billing\.nicespaceship\.ai\/b\/test_/);
    expect(StripeConfig.getTopUp('claude-max').paymentLinkUrl).toMatch(/billing\.nicespaceship\.ai/);
  });

  it('keeps copy/price/pool identical across modes (only ids differ)', () => {
    const live = StripeConfig.SUBSCRIPTIONS.pro;
    window.NICE_CONFIG = { stripeMode: 'test' };
    const test = StripeConfig.SUBSCRIPTIONS.pro;
    expect(test.price).toBe(live.price);
    expect(test.pool).toBe(live.pool);
    expect(test.label).toBe(live.label);
    expect(test.priceId).not.toBe(live.priceId);
  });

  it('admin localStorage override enables test mode; non-admins are ignored', () => {
    localStorage.setItem('nice-stripe-mode', 'test');
    State.set('user', { is_admin: false });
    expect(StripeConfig.activeMode()).toBe('live');
    State.set('user', { is_admin: true });
    expect(StripeConfig.activeMode()).toBe('test');
  });

  it('findByPriceId resolves a test-mode price id regardless of active mode', () => {
    expect(StripeConfig.activeMode()).toBe('live');
    const p = StripeConfig.findByPriceId(PRO_TEST_PRICE);
    expect(p.kind).toBe('subscription');
    expect(p.id).toBe('pro');
    expect(p.pool).toBe('standard');
  });
});
