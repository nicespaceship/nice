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
  it('defines the three expected pools', () => {
    expect(TokenConfig.POOLS.standard).toBeDefined();
    expect(TokenConfig.POOLS.claude).toBeDefined();
    expect(TokenConfig.POOLS.premium).toBeDefined();
    expect(Object.keys(TokenConfig.POOLS).length).toBe(3);
  });

  it('Pro plan grants 1000 standard tokens/month', () => {
    expect(TokenConfig.monthlyAllowance('standard')).toBe(1000);
  });

  it('Claude add-on grants 500 claude tokens/month', () => {
    expect(TokenConfig.monthlyAllowance('claude')).toBe(500);
  });

  it('Premium add-on grants 500 premium tokens/month', () => {
    expect(TokenConfig.monthlyAllowance('premium')).toBe(500);
  });

  it('standard pool requires no add-on (included in Pro)', () => {
    expect(TokenConfig.requiredAddon('standard')).toBeNull();
  });

  it('claude pool requires the claude add-on', () => {
    expect(TokenConfig.requiredAddon('claude')).toBe('claude');
  });

  it('premium pool requires the premium add-on', () => {
    expect(TokenConfig.requiredAddon('premium')).toBe('premium');
  });
});

describe('TokenConfig — model → pool mapping', () => {
  it('Gemini 2.5 Flash is free (no pool, no weight)', () => {
    expect(TokenConfig.poolFor('gemini-2-5-flash')).toBeNull();
    expect(TokenConfig.weightFor('gemini-2-5-flash')).toBe(0);
    expect(TokenConfig.isFreeModel('gemini-2-5-flash')).toBe(true);
  });

  it('GPT-5 Mini consumes 1 standard token', () => {
    expect(TokenConfig.poolFor('gpt-5-mini')).toBe('standard');
    expect(TokenConfig.weightFor('gpt-5-mini')).toBe(1);
  });

  it('Llama 4 Scout is standard pool weight 1', () => {
    expect(TokenConfig.poolFor('llama-4-scout')).toBe('standard');
    expect(TokenConfig.weightFor('llama-4-scout')).toBe(1);
  });

  it('Mistral Large 3, Command R+, DeepSeek R1, Kimi K2.5, and GLM-5 are not in the catalog (removed for cost/provider-unreachable)', () => {
    for (const id of ['mistral-large-3', 'command-r-plus', 'deepseek-r1', 'kimi-k2-5', 'glm-5']) {
      expect(TokenConfig.poolFor(id)).toBeNull();
      expect(TokenConfig.isFreeModel(id)).toBe(true);
    }
  });

  it('Grok 4.1 Fast consumes 2 standard tokens (heavier weight, 2M context)', () => {
    expect(TokenConfig.poolFor('grok-4-1-fast')).toBe('standard');
    expect(TokenConfig.weightFor('grok-4-1-fast')).toBe(2);
  });

  it('Claude 4.6 Sonnet consumes 3 claude tokens', () => {
    expect(TokenConfig.poolFor('claude-4-6-sonnet')).toBe('claude');
    expect(TokenConfig.weightFor('claude-4-6-sonnet')).toBe(3);
  });

  it('Claude 4.6 Opus consumes 10 claude tokens (premium flagship)', () => {
    expect(TokenConfig.poolFor('claude-4-6-opus')).toBe('claude');
    expect(TokenConfig.weightFor('claude-4-6-opus')).toBe(10);
  });

  it('GPT-5.4 Pro and GPT-5.3 Codex are premium pool weight 5', () => {
    expect(TokenConfig.poolFor('gpt-5-4-pro')).toBe('premium');
    expect(TokenConfig.weightFor('gpt-5-4-pro')).toBe(5);
    expect(TokenConfig.poolFor('gpt-5-3-codex')).toBe('premium');
    expect(TokenConfig.weightFor('gpt-5-3-codex')).toBe(5);
  });

  it('OpenAI o3 consumes 15 premium tokens (most expensive reasoning)', () => {
    expect(TokenConfig.poolFor('openai-o3')).toBe('premium');
    expect(TokenConfig.weightFor('openai-o3')).toBe(15);
  });

  it('Gemini 3.1 Pro consumes 3 premium tokens', () => {
    expect(TokenConfig.poolFor('gemini-3-1-pro')).toBe('premium');
    expect(TokenConfig.weightFor('gemini-3-1-pro')).toBe(3);
  });

  it('unknown models default to free (conservative behavior)', () => {
    expect(TokenConfig.poolFor('some-new-model-not-yet-mapped')).toBeNull();
    expect(TokenConfig.isFreeModel('some-new-model-not-yet-mapped')).toBe(true);
  });

  it('modelsInPool returns every model bound to a pool', () => {
    const standard = TokenConfig.modelsInPool('standard');
    expect(standard).toContain('gpt-5-mini');
    expect(standard).toContain('grok-4-1-fast');
    expect(standard).toContain('llama-4-scout');
    expect(standard).not.toContain('claude-4-6-sonnet');

    const claude = TokenConfig.modelsInPool('claude');
    expect(claude).toEqual(expect.arrayContaining(['claude-4-6-sonnet', 'claude-4-6-opus']));
    expect(claude).not.toContain('gpt-5-mini');

    const premium = TokenConfig.modelsInPool('premium');
    expect(premium).toEqual(expect.arrayContaining(['gpt-5-4-pro', 'gpt-5-3-codex', 'openai-o3', 'gemini-3-1-pro']));
    expect(premium).not.toContain('claude-4-6-sonnet');
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
    expect(TokenConfig.messagesRemainingFor(pools, 'claude-4-6-sonnet')).toBe(166);
    // Same budget on Opus (10/msg) = 50 messages
    expect(TokenConfig.messagesRemainingFor(pools, 'claude-4-6-opus')).toBe(50);
  });

  it('messagesRemainingFor on premium pool divides by weight', () => {
    // 500 premium tokens / 15 per o3 message = 33
    const pools = { premium: { allowance: 500, used: 0, purchased: 0 } };
    expect(TokenConfig.messagesRemainingFor(pools, 'openai-o3')).toBe(33);
    // GPT-5.4 Pro at weight 5 = 100 messages
    expect(TokenConfig.messagesRemainingFor(pools, 'gpt-5-4-pro')).toBe(100);
  });

  it('messagesRemainingFor reports Infinity for free models', () => {
    expect(TokenConfig.messagesRemainingFor(fullPools, 'gemini-2-5-flash')).toBe(Infinity);
  });

  it('canRunModel returns false when the pool is dry', () => {
    const pools = { standard: { allowance: 0, used: 0, purchased: 0 } };
    expect(TokenConfig.canRunModel(pools, 'gpt-5-mini', [])).toBe(false);
  });

  it('canRunModel returns false when the claude add-on is missing, even with tokens', () => {
    const pools = { claude: { allowance: 500, used: 0, purchased: 0 } };
    expect(TokenConfig.canRunModel(pools, 'claude-4-6-sonnet', [])).toBe(false);
  });

  it('canRunModel returns false when the premium add-on is missing', () => {
    const pools = { premium: { allowance: 500, used: 0, purchased: 0 } };
    expect(TokenConfig.canRunModel(pools, 'openai-o3', [])).toBe(false);
  });

  it('canRunModel returns true when add-on present and pool has room', () => {
    const pools = { claude: { allowance: 500, used: 0, purchased: 0 } };
    expect(TokenConfig.canRunModel(pools, 'claude-4-6-sonnet', ['claude'])).toBe(true);
  });

  it('canRunModel for premium models requires the premium add-on', () => {
    const pools = { premium: { allowance: 500, used: 0, purchased: 0 } };
    expect(TokenConfig.canRunModel(pools, 'gpt-5-4-pro', ['premium'])).toBe(true);
    expect(TokenConfig.canRunModel(pools, 'gpt-5-4-pro', ['claude'])).toBe(false);
  });

  it('canRunModel is always true for free models regardless of add-ons', () => {
    expect(TokenConfig.canRunModel({}, 'gemini-2-5-flash', [])).toBe(true);
  });
});

describe('TokenConfig — previewDebit', () => {
  it('returns the pool + weight for a paid model', () => {
    expect(TokenConfig.previewDebit('claude-4-6-opus')).toEqual({ pool: 'claude', amount: 10 });
    expect(TokenConfig.previewDebit('gpt-5-mini')).toEqual({ pool: 'standard', amount: 1 });
    expect(TokenConfig.previewDebit('openai-o3')).toEqual({ pool: 'premium', amount: 15 });
  });

  it('returns null for free models', () => {
    expect(TokenConfig.previewDebit('gemini-2-5-flash')).toBeNull();
  });
});

describe('TokenConfig — initialPools', () => {
  it('free user gets zero allowance in every pool', () => {
    const p = TokenConfig.initialPools({ pro: false, addons: [] });
    expect(p.standard.allowance).toBe(0);
    expect(p.claude.allowance).toBe(0);
    expect(p.premium.allowance).toBe(0);
  });

  it('Pro user without add-ons gets Standard allowance only', () => {
    const p = TokenConfig.initialPools({ pro: true, addons: [] });
    expect(p.standard.allowance).toBe(1000);
    expect(p.claude.allowance).toBe(0);
    expect(p.premium.allowance).toBe(0);
  });

  it('Pro + Claude gets standard + claude pools filled', () => {
    const p = TokenConfig.initialPools({ pro: true, addons: ['claude'] });
    expect(p.standard.allowance).toBe(1000);
    expect(p.claude.allowance).toBe(500);
    expect(p.premium.allowance).toBe(0);
  });

  it('Pro + Premium gets standard + premium pools filled', () => {
    const p = TokenConfig.initialPools({ pro: true, addons: ['premium'] });
    expect(p.standard.allowance).toBe(1000);
    expect(p.claude.allowance).toBe(0);
    expect(p.premium.allowance).toBe(500);
  });

  it('Pro + both add-ons gets every pool filled', () => {
    const p = TokenConfig.initialPools({ pro: true, addons: ['claude', 'premium'] });
    expect(p.standard.allowance).toBe(1000);
    expect(p.claude.allowance).toBe(500);
    expect(p.premium.allowance).toBe(500);
  });

  it('used and purchased start at zero on every fresh pool', () => {
    const p = TokenConfig.initialPools({ pro: true, addons: ['claude', 'premium'] });
    for (const poolId of Object.keys(p)) {
      expect(p[poolId].used).toBe(0);
      expect(p[poolId].purchased).toBe(0);
    }
  });
});
