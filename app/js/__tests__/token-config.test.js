import { describe, it, expect } from 'vitest';

// Load TokenConfig as a global IIFE (same pattern as other blueprint-store test)
const { readFileSync } = await import('fs');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
const __dir = dirname(fileURLToPath(import.meta.url));
let code = readFileSync(resolve(__dir, '../lib/token-config.js'), 'utf-8');
code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
eval(code);

describe('TokenConfig — pool + model catalog', () => {
  it('defines the two expected pools', () => {
    expect(TokenConfig.POOLS.standard).toBeDefined();
    expect(TokenConfig.POOLS.claude).toBeDefined();
    expect(Object.keys(TokenConfig.POOLS).length).toBe(2);
  });

  it('Pro plan grants 1000 standard tokens/month', () => {
    expect(TokenConfig.monthlyAllowance('standard')).toBe(1000);
  });

  it('Claude add-on grants 500 claude tokens/month', () => {
    expect(TokenConfig.monthlyAllowance('claude')).toBe(500);
  });

  it('standard pool requires no add-on (included in Pro)', () => {
    expect(TokenConfig.requiredAddon('standard')).toBeNull();
  });

  it('claude pool requires the claude add-on', () => {
    expect(TokenConfig.requiredAddon('claude')).toBe('claude');
  });
});

describe('TokenConfig — model → pool mapping', () => {
  it('Gemini Flash is free (no pool, no weight)', () => {
    expect(TokenConfig.poolFor('gemini-2.5-flash')).toBeNull();
    expect(TokenConfig.weightFor('gemini-2.5-flash')).toBe(0);
    expect(TokenConfig.isFreeModel('gemini-2.5-flash')).toBe(true);
  });

  it('Gemini 2.5 Pro consumes 1 standard token', () => {
    expect(TokenConfig.poolFor('gemini-2.5-pro')).toBe('standard');
    expect(TokenConfig.weightFor('gemini-2.5-pro')).toBe(1);
    expect(TokenConfig.isFreeModel('gemini-2.5-pro')).toBe(false);
  });

  it('Grok 4 consumes 2 standard tokens (heavier weight)', () => {
    expect(TokenConfig.poolFor('grok-4')).toBe('standard');
    expect(TokenConfig.weightFor('grok-4')).toBe(2);
  });

  it('Claude Sonnet 4 consumes 3 claude tokens', () => {
    expect(TokenConfig.poolFor('claude-sonnet-4')).toBe('claude');
    expect(TokenConfig.weightFor('claude-sonnet-4')).toBe(3);
  });

  it('Claude Opus 4 consumes 10 claude tokens (expensive flagship)', () => {
    expect(TokenConfig.poolFor('claude-opus-4')).toBe('claude');
    expect(TokenConfig.weightFor('claude-opus-4')).toBe(10);
  });

  it('unknown models default to free (conservative behavior)', () => {
    expect(TokenConfig.poolFor('some-new-model-not-yet-mapped')).toBeNull();
    expect(TokenConfig.isFreeModel('some-new-model-not-yet-mapped')).toBe(true);
  });

  it('modelsInPool returns every model bound to a pool', () => {
    const standard = TokenConfig.modelsInPool('standard');
    expect(standard).toContain('gemini-2.5-pro');
    expect(standard).toContain('grok-4');
    expect(standard).not.toContain('claude-sonnet-4');

    const claude = TokenConfig.modelsInPool('claude');
    expect(claude).toEqual(expect.arrayContaining(['claude-haiku-4', 'claude-sonnet-4', 'claude-opus-4']));
    expect(claude).not.toContain('gemini-2.5-pro');
  });
});

describe('TokenConfig — balance math', () => {
  const fullPools = {
    standard: { allowance: 1000, used: 0, purchased: 0 },
    claude:   { allowance: 500,  used: 0, purchased: 0 },
  };

  it('remainingInPool counts allowance left + purchased', () => {
    const pools = {
      standard: { allowance: 1000, used: 300, purchased: 500 },
    };
    // 700 left in allowance + 500 purchased = 1200 total
    expect(TokenConfig.remainingInPool(pools, 'standard')).toBe(1200);
  });

  it('purchased tokens are still spendable when allowance is fully used', () => {
    const pools = {
      standard: { allowance: 1000, used: 1000, purchased: 200 },
    };
    expect(TokenConfig.remainingInPool(pools, 'standard')).toBe(200);
  });

  it('remainingInPool returns 0 for unknown pool', () => {
    expect(TokenConfig.remainingInPool({}, 'standard')).toBe(0);
  });

  it('messagesRemainingFor divides remaining tokens by model weight', () => {
    // 500 claude tokens / 3 per sonnet message = 166
    const pools = { claude: { allowance: 500, used: 0, purchased: 0 } };
    expect(TokenConfig.messagesRemainingFor(pools, 'claude-sonnet-4')).toBe(166);
    // Same budget on Opus (10/msg) = 50 messages
    expect(TokenConfig.messagesRemainingFor(pools, 'claude-opus-4')).toBe(50);
    // Same budget on Haiku (1/msg) = 500 messages
    expect(TokenConfig.messagesRemainingFor(pools, 'claude-haiku-4')).toBe(500);
  });

  it('messagesRemainingFor reports Infinity for free models', () => {
    expect(TokenConfig.messagesRemainingFor(fullPools, 'gemini-2.5-flash')).toBe(Infinity);
  });

  it('canRunModel returns false when the pool is dry', () => {
    const pools = { standard: { allowance: 0, used: 0, purchased: 0 } };
    expect(TokenConfig.canRunModel(pools, 'gemini-2.5-pro', [])).toBe(false);
  });

  it('canRunModel returns false when the add-on is missing, even with tokens', () => {
    const pools = { claude: { allowance: 500, used: 0, purchased: 0 } };
    expect(TokenConfig.canRunModel(pools, 'claude-sonnet-4', [])).toBe(false);
  });

  it('canRunModel returns true when add-on present and pool has room', () => {
    const pools = { claude: { allowance: 500, used: 0, purchased: 0 } };
    expect(TokenConfig.canRunModel(pools, 'claude-sonnet-4', ['claude'])).toBe(true);
  });

  it('canRunModel is always true for free models regardless of add-ons', () => {
    expect(TokenConfig.canRunModel({}, 'gemini-2.5-flash', [])).toBe(true);
  });
});

describe('TokenConfig — previewDebit', () => {
  it('returns the pool + weight for a paid model', () => {
    expect(TokenConfig.previewDebit('claude-opus-4')).toEqual({ pool: 'claude', amount: 10 });
    expect(TokenConfig.previewDebit('gemini-2.5-pro')).toEqual({ pool: 'standard', amount: 1 });
  });

  it('returns null for free models', () => {
    expect(TokenConfig.previewDebit('gemini-2.5-flash')).toBeNull();
  });
});

describe('TokenConfig — initialPools', () => {
  it('free user gets zero allowance in every pool', () => {
    const p = TokenConfig.initialPools({ pro: false, addons: [] });
    expect(p.standard.allowance).toBe(0);
    expect(p.claude.allowance).toBe(0);
  });

  it('Pro user without Claude add-on gets Standard allowance only', () => {
    const p = TokenConfig.initialPools({ pro: true, addons: [] });
    expect(p.standard.allowance).toBe(1000);
    expect(p.claude.allowance).toBe(0);
  });

  it('Pro + Claude add-on gets both pools filled', () => {
    const p = TokenConfig.initialPools({ pro: true, addons: ['claude'] });
    expect(p.standard.allowance).toBe(1000);
    expect(p.claude.allowance).toBe(500);
  });

  it('used and purchased start at zero on every fresh pool', () => {
    const p = TokenConfig.initialPools({ pro: true, addons: ['claude'] });
    expect(p.standard.used).toBe(0);
    expect(p.standard.purchased).toBe(0);
    expect(p.claude.used).toBe(0);
    expect(p.claude.purchased).toBe(0);
  });
});
