import { describe, it, expect, beforeEach } from 'vitest';

// Stacks depends on TokenConfig (loaded once into globalThis) and Utils
const { readFileSync } = await import('fs');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
const __dir = dirname(fileURLToPath(import.meta.url));

function loadGlobal(rel) {
  let code = readFileSync(resolve(__dir, '..', rel), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

loadGlobal('lib/utils.js');
loadGlobal('lib/token-config.js');
loadGlobal('lib/stacks.js');

describe('Stacks — catalog shape', () => {
  it('defines the seven curated stacks', () => {
    const all = Stacks.listStacks();
    expect(all.map(s => s.id)).toEqual(['free', 'pro', 'builder', 'researcher', 'writer', 'operator', 'analyst']);
  });

  it('every stack has a name, tagline, icon, model list, and requires', () => {
    for (const s of Stacks.listStacks()) {
      expect(typeof s.name).toBe('string');
      expect(typeof s.tagline).toBe('string');
      expect(typeof s.icon).toBe('string');
      expect(Array.isArray(s.models)).toBe(true);
      expect(s.models.length).toBeGreaterThan(0);
      expect(s.requires).toBeDefined();
    }
  });

  it('every model in every stack exists in TokenConfig.MODELS', () => {
    const validIds = new Set(Object.keys(TokenConfig.MODELS));
    for (const s of Stacks.listStacks()) {
      for (const m of s.models) {
        expect(validIds.has(m)).toBe(true);
      }
    }
  });

  it('every stack except Free requires Pro', () => {
    expect(Stacks.getStack('free').requires.pro).toBe(false);
    for (const id of ['pro', 'builder', 'researcher', 'writer', 'operator', 'analyst']) {
      expect(Stacks.getStack(id).requires.pro).toBe(true);
    }
  });

  it('every stack includes Gemini 2.5 Flash as the free fallback', () => {
    for (const s of Stacks.listStacks()) {
      expect(s.models).toContain('gemini-2-5-flash');
    }
  });

  it('add-on requirements match the design spec', () => {
    expect(Stacks.getStack('pro').requires.addons).toEqual([]);
    expect(Stacks.getStack('builder').requires.addons).toEqual(['premium']);
    expect(Stacks.getStack('researcher').requires.addons).toEqual(['premium']);
    expect(Stacks.getStack('writer').requires.addons).toEqual(['claude']);
    expect(Stacks.getStack('operator').requires.addons).toEqual(['claude']);
    expect(Stacks.getStack('analyst').requires.addons).toEqual(['claude', 'premium']);
  });

  it('allStackModels returns a deduped union', () => {
    const all = Stacks.allStackModels();
    expect(all).toContain('gemini-2-5-flash');
    expect(all).toContain('claude-4-7-opus');
    expect(all).toContain('openai-o3');
    // No duplicates
    expect(all.length).toBe(new Set(all).size);
  });
});

describe('Stacks — entitlement', () => {
  it('Free user can only unlock Free Tier', () => {
    const ctx = { pro: false, addons: [] };
    expect(Stacks.isStackUnlocked('free', ctx)).toBe(true);
    expect(Stacks.isStackUnlocked('pro', ctx)).toBe(false);
    expect(Stacks.isStackUnlocked('writer', ctx)).toBe(false);
    expect(Stacks.isStackUnlocked('analyst', ctx)).toBe(false);
  });

  it('Pro-only user unlocks Free Tier and Pro Stack', () => {
    const ctx = { pro: true, addons: [] };
    expect(Stacks.isStackUnlocked('free', ctx)).toBe(true);
    expect(Stacks.isStackUnlocked('pro', ctx)).toBe(true);
    expect(Stacks.isStackUnlocked('builder', ctx)).toBe(false);  // needs premium
    expect(Stacks.isStackUnlocked('writer', ctx)).toBe(false);   // needs claude
    expect(Stacks.isStackUnlocked('analyst', ctx)).toBe(false);  // needs both
  });

  it('Pro + Claude unlocks Writer and Operator (no Premium-only stacks)', () => {
    const ctx = { pro: true, addons: ['claude'] };
    expect(Stacks.isStackUnlocked('writer', ctx)).toBe(true);
    expect(Stacks.isStackUnlocked('operator', ctx)).toBe(true);
    expect(Stacks.isStackUnlocked('builder', ctx)).toBe(false);
    expect(Stacks.isStackUnlocked('researcher', ctx)).toBe(false);
    expect(Stacks.isStackUnlocked('analyst', ctx)).toBe(false);  // also needs premium
  });

  it('Pro + Premium unlocks Builder and Researcher (no Claude-only stacks)', () => {
    const ctx = { pro: true, addons: ['premium'] };
    expect(Stacks.isStackUnlocked('builder', ctx)).toBe(true);
    expect(Stacks.isStackUnlocked('researcher', ctx)).toBe(true);
    expect(Stacks.isStackUnlocked('writer', ctx)).toBe(false);
    expect(Stacks.isStackUnlocked('operator', ctx)).toBe(false);
    expect(Stacks.isStackUnlocked('analyst', ctx)).toBe(false);
  });

  it('Pro + both add-ons unlocks every stack', () => {
    const ctx = { pro: true, addons: ['claude', 'premium'] };
    for (const s of Stacks.listStacks()) {
      expect(Stacks.isStackUnlocked(s.id, ctx)).toBe(true);
    }
  });
});

describe('Stacks — lockReason', () => {
  it('returns null for unlocked stacks', () => {
    expect(Stacks.lockReason('free', { pro: false, addons: [] })).toBeNull();
    expect(Stacks.lockReason('analyst', { pro: true, addons: ['claude', 'premium'] })).toBeNull();
  });

  it('reports Pro requirement first', () => {
    expect(Stacks.lockReason('pro', { pro: false, addons: [] })).toBe('Requires Pro');
    expect(Stacks.lockReason('builder', { pro: false, addons: ['premium'] })).toBe('Requires Pro');
  });

  it('reports a single missing add-on', () => {
    expect(Stacks.lockReason('writer', { pro: true, addons: [] })).toBe('Requires claude add-on');
    expect(Stacks.lockReason('builder', { pro: true, addons: [] })).toBe('Requires premium add-on');
  });

  it('reports multiple missing add-ons', () => {
    expect(Stacks.lockReason('analyst', { pro: true, addons: [] })).toBe('Requires claude + premium add-ons');
  });

  it('reports a single still-missing add-on when the user already has the other one', () => {
    expect(Stacks.lockReason('analyst', { pro: true, addons: ['claude'] })).toBe('Requires premium add-on');
  });
});

describe('Stacks — defaultStackForUser', () => {
  it('Free user defaults to Free Tier', () => {
    expect(Stacks.defaultStackForUser({ pro: false, addons: [] })).toBe('free');
  });

  it('Pro-only user defaults to Pro Stack', () => {
    expect(Stacks.defaultStackForUser({ pro: true, addons: [] })).toBe('pro');
  });

  it('Pro + Claude defaults to Writer (most specialized Claude stack)', () => {
    expect(Stacks.defaultStackForUser({ pro: true, addons: ['claude'] })).toBe('writer');
  });

  it('Pro + Premium defaults to Builder', () => {
    expect(Stacks.defaultStackForUser({ pro: true, addons: ['premium'] })).toBe('builder');
  });

  it('Pro + both add-ons defaults to Analyst', () => {
    expect(Stacks.defaultStackForUser({ pro: true, addons: ['claude', 'premium'] })).toBe('analyst');
  });
});

describe('Stacks — applyStack', () => {
  beforeEach(() => {
    localStorage.clear();
    if (typeof globalThis.State !== 'undefined') globalThis.State._reset?.();
  });

  it('persists active stack id', () => {
    Stacks.applyStack('writer');
    expect(Stacks.activeStack()).toBe('writer');
  });

  it('refuses unknown stack ids', () => {
    expect(Stacks.applyStack('imaginary-stack')).toBe(false);
    expect(Stacks.activeStack()).toBeNull();
  });

  it('writes enabled_models with exactly the stack\'s models on (plus free models)', () => {
    Stacks.applyStack('writer');
    const enabled = JSON.parse(localStorage.getItem('nice-enabled-models'));
    expect(enabled['claude-4-7-opus']).toBe(true);
    expect(enabled['claude-4-6-sonnet']).toBe(true);
    expect(enabled['gpt-5-mini']).toBe(true);
    expect(enabled['gemini-2-5-flash']).toBe(true);
    // Models not in the Writer stack should be off
    expect(enabled['openai-o3']).toBe(false);
    expect(enabled['grok-4-1-fast']).toBe(false);
  });

  it('switching stacks is a clean swap, not an additive merge', () => {
    Stacks.applyStack('writer');
    Stacks.applyStack('builder');
    const enabled = JSON.parse(localStorage.getItem('nice-enabled-models'));
    expect(enabled['gpt-5-3-codex']).toBe(true);
    expect(enabled['claude-4-7-opus']).toBe(false);  // writer-specific, should be off now
    expect(enabled['claude-4-6-sonnet']).toBe(false);
  });
});

describe('Stacks — routeFor', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('routes Builder code tasks to GPT-5.3 Codex', () => {
    Stacks.applyStack('builder');
    expect(Stacks.routeFor('code')).toBe('gpt-5-3-codex');
  });

  it('routes Writer polish tasks to Claude Opus', () => {
    Stacks.applyStack('writer');
    expect(Stacks.routeFor('polish')).toBe('claude-4-7-opus');
  });

  it('routes Researcher long-context tasks to Grok 4.1 Fast', () => {
    Stacks.applyStack('researcher');
    expect(Stacks.routeFor('longcontext')).toBe('grok-4-1-fast');
  });

  it('routes Analyst reasoning to OpenAI o3', () => {
    Stacks.applyStack('analyst');
    expect(Stacks.routeFor('reasoning')).toBe('openai-o3');
  });

  it('falls back to default routing when category is unknown', () => {
    Stacks.applyStack('writer');
    // 'unknown_category' isn't in writer's routing map → falls back to first model
    expect(Stacks.routeFor('unknown_category')).toBe('claude-4-7-opus');
  });

  it('falls back to gemini-2-5-flash when no stack is active', () => {
    expect(Stacks.routeFor('anything')).toBe('gemini-2-5-flash');
  });
});
