import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadModule(rel) {
  let code = readFileSync(resolve(__dir, '..', rel), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

loadModule('lib/blueprint-utils.js');
loadModule('lib/llm-config.js');
loadModule('lib/stacks.js');
// Snapshot the real module: the routeAuto tests install throwaway Stacks
// mocks and delete the global in finally.
const REAL_STACKS = globalThis.Stacks;
// model-catalog.js is UMD; take the CommonJS branch (same shim as
// model-catalog.test.js) and promote it for the reachability test.
{
  const code = readFileSync(resolve(__dir, '..', 'lib/model-catalog.js'), 'utf-8');
  const mod = { exports: {} };
  new Function('module', 'exports', code)(mod, mod.exports);
  globalThis.ModelCatalog = mod.exports;
}

describe('LLMConfig', () => {
  describe('fromStats', () => {
    it('should return default-ish config for mid-range stats', () => {
      const cfg = LLMConfig.fromStats({ spd: 50, acc: 50, pwr: 50, cap: 50 });
      expect(cfg.stream).toBe(false);
      expect(cfg.temperature).toBeCloseTo(0.5, 1);
      expect(cfg.max_tokens).toBeGreaterThan(3000);
      expect(cfg.rate_limit).toBe(30);
    });

    it('should enable streaming when spd >= 60', () => {
      expect(LLMConfig.fromStats({ spd: 60 }).stream).toBe(true);
      expect(LLMConfig.fromStats({ spd: 59 }).stream).toBe(false);
    });

    it('should clamp temperature between 0.1 and 0.9', () => {
      expect(LLMConfig.fromStats({ acc: 100 }).temperature).toBe(0.1);
      expect(LLMConfig.fromStats({ acc: 0 }).temperature).toBe(0.9);
    });

    it('should scale max_tokens with pwr (512 to 8192)', () => {
      const low = LLMConfig.fromStats({ pwr: 0 });
      const high = LLMConfig.fromStats({ pwr: 100 });
      expect(low.max_tokens).toBe(512);
      expect(high.max_tokens).toBe(8192);
    });

    it('should scale rate_limit with cap (0 to 60)', () => {
      expect(LLMConfig.fromStats({ cap: 0 }).rate_limit).toBe(0);
      expect(LLMConfig.fromStats({ cap: 100 }).rate_limit).toBe(60);
    });

    it('should handle empty/missing stats with defaults', () => {
      const cfg = LLMConfig.fromStats({});
      expect(cfg).toHaveProperty('stream');
      expect(cfg).toHaveProperty('temperature');
      expect(cfg).toHaveProperty('max_tokens');
    });
  });

  describe('forBlueprint', () => {
    it('should combine fromStats with model from config', () => {
      const bp = { stats: { spd: 80, acc: 90, pwr: 70, cap: 50 }, config: { llm_engine: 'gpt-4o' } };
      const cfg = LLMConfig.forBlueprint(bp);
      expect(cfg.model).toBe('gpt-4o');
      expect(cfg.stream).toBe(true);
    });

    it('should default model to gemini-2-5-flash (free) when no profile or llm_engine', () => {
      // Free Gemini is the safe default — agents without an explicit
      // profile can never accidentally drain a paid pool.
      const cfg = LLMConfig.forBlueprint({ stats: {} });
      expect(cfg.model).toBe('gemini-2-5-flash');
    });

    it('should handle blueprint with no stats', () => {
      const cfg = LLMConfig.forBlueprint({});
      expect(cfg).toHaveProperty('temperature');
      expect(cfg).toHaveProperty('model');
    });
  });

  describe('forBlueprint with model_profile', () => {
    it('uses model_profile.preferred over llm_engine', () => {
      const bp = {
        config: {
          llm_engine: 'gpt-4o',
          model_profile: { preferred: 'claude-opus-4-6' },
        },
      };
      expect(LLMConfig.forBlueprint(bp).model).toBe('claude-opus-4-6');
    });

    it('falls back to llm_engine when model_profile is absent', () => {
      const bp = { config: { llm_engine: 'gpt-4o' } };
      expect(LLMConfig.forBlueprint(bp).model).toBe('gpt-4o');
    });

    it('overrides stat-derived temperature with model_profile.temperature', () => {
      const bp = {
        stats: { acc: 100 }, // would otherwise produce temperature: 0.1
        config: { model_profile: { preferred: 'gemini-2.5-flash', temperature: 0.85 } },
      };
      expect(LLMConfig.forBlueprint(bp).temperature).toBe(0.85);
    });

    it('clamps temperature to [0, 2]', () => {
      const high = LLMConfig.forBlueprint({ config: { model_profile: { temperature: 5 } } });
      const low  = LLMConfig.forBlueprint({ config: { model_profile: { temperature: -1 } } });
      expect(high.temperature).toBe(2);
      expect(low.temperature).toBe(0);
    });

    it('overrides max_tokens with model_profile.max_output_tokens', () => {
      const bp = {
        stats: { pwr: 50 }, // would otherwise produce ~4352
        config: { model_profile: { max_output_tokens: 1024 } },
      };
      expect(LLMConfig.forBlueprint(bp).max_tokens).toBe(1024);
    });

    it('exposes fallback model and tier when present (canonicalized to catalog ids)', () => {
      const bp = {
        config: {
          model_profile: {
            preferred: 'claude-sonnet-4-6', // legacy id form
            fallback:  'gemini-2.5-flash',  // dot form
            tier:      'premium',
          },
        },
      };
      const cfg = LLMConfig.forBlueprint(bp);
      expect(cfg.model).toBe('claude-4-6-sonnet');
      expect(cfg.fallback).toBe('gemini-2-5-flash');
      expect(cfg.tier).toBe('premium');
    });

    it('uses model_profile.fallback when nice-auto cannot resolve (canonicalized)', () => {
      // ModelIntel is undefined in test env so nice-auto cannot learn
      const bp = {
        config: {
          model_profile: {
            preferred: 'nice-auto',
            fallback:  'gemini-2.5-flash',
            tier:      'free',
          },
        },
      };
      expect(LLMConfig.forBlueprint(bp).model).toBe('gemini-2-5-flash');
    });

    it('falls back to gemini-2-5-flash (free tier) when nice-auto has no profile fallback', () => {
      const bp = { config: { llm_engine: 'nice-auto' } };
      expect(LLMConfig.forBlueprint(bp).model).toBe('gemini-2-5-flash');
    });

    it('does not silently upgrade free-tier nice-auto agents to premium models', () => {
      const bp = {
        config: {
          model_profile: {
            preferred: 'nice-auto',
            fallback:  'gemini-2.5-flash',
            tier:      'free',
          },
        },
      };
      const cfg = LLMConfig.forBlueprint(bp);
      expect(cfg.model).not.toMatch(/claude/);
      expect(cfg.tier).toBe('free');
    });

    const withState = (enabledModels, fn) => {
      const prev = globalThis.State;
      globalThis.State = { get: () => enabledModels };
      try { fn(); } finally {
        if (prev === undefined) delete globalThis.State; else globalThis.State = prev;
      }
    };

    it('demotes inaccessible model to free Flash when user has no other access', () => {
      // Captain blueprints ship with `claude-sonnet-4-6` but a free-tier
      // user only has Gemini Flash enabled — without demotion, nice-ai
      // rejects with "subscription is inactive".
      withState({ 'gemini-2-5-flash': true }, () => {
        const bp = { config: { llm_engine: 'claude-sonnet-4-6' } };
        expect(LLMConfig.forBlueprint(bp).model).toBe('gemini-2-5-flash');
      });
    });

    it('demotes to the highest-capability enabled model below the primary', () => {
      // User has GPT-5 Mini + Llama enabled; primary is Claude Opus (above both).
      // Should walk DOWN the chain and pick GPT-5 Mini (higher than Llama).
      withState({ 'gpt-5-mini': true, 'llama-4-scout': true, 'gemini-2-5-flash': true }, () => {
        const bp = { config: { llm_engine: 'claude-4-7-opus' } };
        expect(LLMConfig.forBlueprint(bp).model).toBe('gpt-5-mini');
      });
    });

    it('grants access when enabled_models still carries a retired id', () => {
      // A returning user whose saved toggles predate the 2026 swap: the
      // legacy key must unlock its replacement.
      withState({ 'grok-4-1-fast': true, 'gemini-2-5-flash': true }, () => {
        const bp = { config: { llm_engine: 'grok-4-3' } };
        expect(LLMConfig.forBlueprint(bp).model).toBe('grok-4-3');
      });
    });

    it('keeps the resolved model when the user has it enabled', () => {
      withState({ 'claude-4-6-sonnet': true, 'gemini-2-5-flash': true }, () => {
        const bp = { config: { llm_engine: 'claude-sonnet-4-6' } };
        expect(LLMConfig.forBlueprint(bp).model).toBe('claude-4-6-sonnet');
      });
    });

    it('ignores invalid max_output_tokens (non-number, zero, negative)', () => {
      const bp1 = { stats: { pwr: 50 }, config: { model_profile: { max_output_tokens: 0 } } };
      const bp2 = { stats: { pwr: 50 }, config: { model_profile: { max_output_tokens: -100 } } };
      const bp3 = { stats: { pwr: 50 }, config: { model_profile: { max_output_tokens: '1024' } } };
      // All three should fall back to stat-derived max_tokens (~4352 for pwr 50)
      expect(LLMConfig.forBlueprint(bp1).max_tokens).toBeGreaterThan(1000);
      expect(LLMConfig.forBlueprint(bp2).max_tokens).toBeGreaterThan(1000);
      expect(LLMConfig.forBlueprint(bp3).max_tokens).toBeGreaterThan(1000);
    });
  });

  describe('buildFallbackChain', () => {
    it('returns models below the primary in the chain', () => {
      // Enabled key uses the retired llama id on purpose: the alias must
      // still unlock its replacement's chain entry.
      const chain = LLMConfig.buildFallbackChain('claude-sonnet-4-6', { 'llama-4-scout': true, 'gemini-2-5-flash': true });
      const ids = chain.map(m => m.id);
      expect(ids).toContain('gpt-oss-120b');
      expect(ids).toContain('gemini-2-5-flash');
      expect(ids).not.toContain('claude-sonnet-4-6');
      expect(ids).not.toContain('claude-opus-4-7'); // above primary
    });

    it('always includes gemini-2-5-flash even when not in enabledModels', () => {
      const chain = LLMConfig.buildFallbackChain('claude-sonnet-4-6', {});
      expect(chain.map(m => m.id)).toContain('gemini-2-5-flash');
    });

    it('excludes models not enabled by the user (except free Flash)', () => {
      const chain = LLMConfig.buildFallbackChain('claude-sonnet-4-6', { 'gemini-2-5-flash': true });
      const ids = chain.map(m => m.id);
      expect(ids).not.toContain('gpt-oss-120b');
      expect(ids).not.toContain('gpt-5-mini');
      expect(ids).toContain('gemini-2-5-flash');
    });

    it('marks noTools correctly for GPT-OSS and Grok', () => {
      // Retired ids as enabled keys: aliases must resolve to the replacements.
      const chain = LLMConfig.buildFallbackChain('claude-4-6-sonnet', { 'llama-4-scout': true, 'grok-4-1-fast': true });
      const oss  = chain.find(m => m.id === 'gpt-oss-120b');
      const grok = chain.find(m => m.id === 'grok-4-3');
      expect(oss?.noTools).toBe(true);
      expect(grok?.noTools).toBe(true);
    });

    it('returns empty chain when primary is gemini-2-5-flash (bottom of ladder)', () => {
      const chain = LLMConfig.buildFallbackChain('gemini-2-5-flash', {});
      expect(chain).toHaveLength(0);
    });

    it('returns full chain from unknown primary model', () => {
      const chain = LLMConfig.buildFallbackChain('unknown-model', { 'llama-4-scout': true });
      expect(chain.length).toBeGreaterThan(0);
      expect(chain.map(m => m.id)).toContain('gemini-2-5-flash');
    });
  });

  describe('forBlueprint fallbackChain', () => {
    it('includes fallbackChain in forBlueprint result', () => {
      const bp = { config: { llm_engine: 'claude-sonnet-4-6' } };
      const cfg = LLMConfig.forBlueprint(bp);
      expect(cfg).toHaveProperty('fallbackChain');
      expect(Array.isArray(cfg.fallbackChain)).toBe(true);
    });

    it('fallbackChain always ends with gemini-2-5-flash', () => {
      const bp = { config: { llm_engine: 'claude-sonnet-4-6' } };
      const cfg = LLMConfig.forBlueprint(bp);
      const ids = cfg.fallbackChain.map(m => m.id);
      expect(ids[ids.length - 1]).toBe('gemini-2-5-flash');
    });

    it('fallbackChain is empty when primary is already gemini-2-5-flash', () => {
      const bp = { config: { llm_engine: 'gemini-2-5-flash' } };
      const cfg = LLMConfig.forBlueprint(bp);
      expect(cfg.fallbackChain).toHaveLength(0);
    });
  });

  // Discovered 2026-05-15: ship-setup-wizard auto-created slot agents with
  // llm_engine='claude-4' (default in many UI defaults), which nice-ai 404s
  // because no Anthropic model has that id. Pin the canonical-id resolution
  // so the bug can't return when new aliases drift into seed data.
  describe('canonicalize / MODEL_ALIASES', () => {
    it('resolves the stale "claude-4" alias to the current sonnet catalog id', () => {
      expect(LLMConfig.canonicalize('claude-4')).toBe('claude-4-6-sonnet');
    });

    it('resolves "claude-4-opus" to the catalog opus id', () => {
      expect(LLMConfig.canonicalize('claude-4-opus')).toBe('claude-4-7-opus');
    });

    it('resolves bare "grok" to "grok-4-3" (catalog id)', () => {
      expect(LLMConfig.canonicalize('grok')).toBe('grok-4-3');
    });

    it('resolves the retired 2026 ids to their replacements', () => {
      expect(LLMConfig.canonicalize('grok-4-1-fast')).toBe('grok-4-3');
      expect(LLMConfig.canonicalize('llama-4-scout')).toBe('gpt-oss-120b');
    });

    it('normalizes legacy claude id form to the catalog form', () => {
      expect(LLMConfig.canonicalize('claude-sonnet-4-6')).toBe('claude-4-6-sonnet');
      expect(LLMConfig.canonicalize('claude-opus-4-7')).toBe('claude-4-7-opus');
    });

    it('normalizes dot-form gemini ids to dash-form catalog ids', () => {
      expect(LLMConfig.canonicalize('gemini-2.5-flash')).toBe('gemini-2-5-flash');
      expect(LLMConfig.canonicalize('gemini-2.5-pro')).toBe('gemini-2-5-pro');
    });

    it('leaves canonical catalog ids unchanged', () => {
      expect(LLMConfig.canonicalize('claude-4-6-sonnet')).toBe('claude-4-6-sonnet');
      expect(LLMConfig.canonicalize('gpt-5-mini')).toBe('gpt-5-mini');
      expect(LLMConfig.canonicalize('gemini-2-5-flash')).toBe('gemini-2-5-flash');
    });

    it('passes unknown ids through unchanged (nice-ai gets the original id)', () => {
      expect(LLMConfig.canonicalize('nice-auto')).toBe('nice-auto');
      expect(LLMConfig.canonicalize('mystery-model')).toBe('mystery-model');
    });

    it('returns the input unchanged for null / non-string', () => {
      expect(LLMConfig.canonicalize(null)).toBe(null);
      expect(LLMConfig.canonicalize(undefined)).toBe(undefined);
      expect(LLMConfig.canonicalize(123)).toBe(123);
    });

    it('forBlueprint resolves a stale llm_engine alias before returning', () => {
      // Reproduces the live bug: Engineering Lead auto-created with
      // llm_engine='claude-4' produced a 404 from nice-ai post-#514.
      const bp = { config: { llm_engine: 'claude-4' } };
      expect(LLMConfig.forBlueprint(bp).model).toBe('claude-4-6-sonnet');
    });

    it('buildFallbackChain canonicalizes the primary and the enabledModels keys', () => {
      // User toggles the catalog id, but a blueprint passes the legacy
      // primary form — chain must still recognize the user's enabled set.
      const chain = LLMConfig.buildFallbackChain('claude-opus-4-7', {
        'claude-4-6-sonnet': true,
        'gemini-2-5-flash': true,
      });
      const ids = chain.map(m => m.id);
      expect(ids).toContain('claude-4-6-sonnet'); // below opus, enabled
      expect(ids).toContain('gemini-2-5-flash');
      expect(ids).not.toContain('claude-4-7-opus'); // the primary
    });

    it('CAPABILITY_CHAIN uses canonical catalog ids (no legacy drift)', () => {
      const ids = LLMConfig.CAPABILITY_CHAIN.map(m => m.id);
      // Spot-check the entries that previously drifted from MODEL_CATALOG
      expect(ids).toContain('claude-4-6-sonnet');
      expect(ids).toContain('claude-4-7-opus');
      expect(ids).toContain('grok-4-3');
      expect(ids).not.toContain('claude-sonnet-4-6');
      expect(ids).not.toContain('claude-opus-4-7');
      expect(ids).not.toContain('grok');
      expect(ids).not.toContain('grok-4-1-fast');
      expect(ids).not.toContain('llama-4-scout');
    });

    it('CAPABILITY_CHAIN covers every model in the TokenConfig cost SSOT', () => {
      // A model absent from the chain has findIndex === -1, so an overload
      // slices from index 0 and "falls back" UP to the most expensive model
      // instead of degrading. Keep the chain in parity with TokenConfig.MODELS.
      const chainIds = LLMConfig.CAPABILITY_CHAIN.map(m => m.id);
      const catalogIds = Object.keys(TokenConfig.MODELS);
      const missing = catalogIds.filter(id => !chainIds.includes(id));
      expect(missing).toEqual([]);
      // openai-o3 was the one that had been missing.
      expect(chainIds).toContain('openai-o3');
      // No duplicates.
      expect(new Set(chainIds).size).toBe(chainIds.length);
    });
  });

  describe('_num (via fromStats)', () => {
    it('should handle string percentages', () => {
      // acc of "94%" → 94 numeric → temperature ≈ 0.06 → clamped to 0.1
      const cfg = LLMConfig.fromStats({ acc: '94%' });
      expect(cfg.temperature).toBe(0.1);
    });

    it('should handle K suffix', () => {
      const cfg = LLMConfig.fromStats({ cap: '2K' });
      expect(cfg.rate_limit).toBeGreaterThan(0);
    });

    it('should handle infinity symbol', () => {
      const cfg = LLMConfig.fromStats({ cap: '∞' });
      expect(cfg.rate_limit).toBe(60);
    });

    it('should default NaN to 50', () => {
      const cfg = LLMConfig.fromStats({ spd: 'fast' });
      expect(cfg.stream).toBe(false); // 50 < 60
    });
  });

  describe('NICE Auto routing (classifyPrompt + routeAuto)', () => {
    const ALL_ON = {
      'gemini-2-5-flash': true, 'gpt-5-mini': true, 'gpt-oss-120b': true,
      'grok-4-3': true, 'deepseek-v4-flash': true, 'kimi-k2-6': true,
      'nemotron-3-super': true, 'claude-4-6-sonnet': true, 'claude-4-7-opus': true,
      'gpt-5-4-pro': true, 'openai-o3': true, 'gemini-2-5-pro': true,
    };

    it('classifies code prompts on strong signals or paired weak signals', () => {
      expect(LLMConfig.classifyPrompt('Can you refactor this function?')).toBe('code');
      expect(LLMConfig.classifyPrompt('here is a ```js\nblock\n```')).toBe('code');
      expect(LLMConfig.classifyPrompt('the python script throws an exception')).toBe('code');
    });

    it('keeps ordinary prose with tech-adjacent words casual', () => {
      expect(LLMConfig.classifyPrompt('Please select a date from the calendar')).toBe('casual');
      expect(LLMConfig.classifyPrompt('Should I debug my sleep schedule?')).toBe('casual');
      expect(LLMConfig.classifyPrompt('thanks => appreciated')).toBe('casual');
      expect(LLMConfig.classifyPrompt('Can you check my email and tell me if the landlord replied?')).toBe('casual');
      expect(LLMConfig.classifyPrompt('What is our strategy for dinner tonight?')).toBe('casual');
    });

    it('never counts repeated or soft-only tokens as code', () => {
      expect(LLMConfig.classifyPrompt('I have a bug in my garden and a bug in my kitchen')).toBe('casual');
      expect(LLMConfig.classifyPrompt('Write the script for my class presentation')).toBe('writing');
      expect(LLMConfig.classifyPrompt('I compiled a list of my yoga class attendees')).toBe('casual');
      expect(LLMConfig.classifyPrompt('Can you write a query letter to a literary agent about my class?')).toBe('writing');
    });

    it('does not escalate mere length into paid reasoning', () => {
      expect(LLMConfig.classifyPrompt('word '.repeat(1200))).toBe('casual');
    });

    it('classifies very long prompts as longcontext', () => {
      expect(LLMConfig.classifyPrompt('x'.repeat(250000))).toBe('longcontext');
      expect(LLMConfig.classifyPrompt('x'.repeat(50000))).toBe('casual');
    });

    it('classifies reasoning and writing prompts', () => {
      expect(LLMConfig.classifyPrompt('Walk me through the trade-offs of this system design')).toBe('reasoning');
      expect(LLMConfig.classifyPrompt('Please draft an email to the landlord')).toBe('writing');
    });

    it('keeps everyday reasoning-phrase prose casual (needs a domain word)', () => {
      expect(LLMConfig.classifyPrompt('How do I derive the most value from my gym membership?')).toBe('casual');
      expect(LLMConfig.classifyPrompt("What's the root cause of the squeak in my dryer?")).toBe('casual');
      expect(LLMConfig.classifyPrompt('Prove to me that this diet actually works')).toBe('casual');
      expect(LLMConfig.classifyPrompt('Explain step by step how to make sourdough starter')).toBe('casual');
      expect(LLMConfig.classifyPrompt('Write down the milk, eggs, bread')).toBe('casual');
    });

    it('routes each kind to the top enabled ladder preference', () => {
      expect(LLMConfig.routeAuto('refactor this function please', ALL_ON).id).toBe('deepseek-v4-flash');
      expect(LLMConfig.routeAuto('x'.repeat(250000), ALL_ON).id).toBe('grok-4-3');
      expect(LLMConfig.routeAuto('draft an email to the team', ALL_ON).id).toBe('gpt-5-mini');
      expect(LLMConfig.routeAuto('hello there', ALL_ON).id).toBe('gemini-2-5-flash');
    });

    it('caps ladders at the standard pool; paid pools need a stack route', () => {
      const paidPools = new Set(['claude', 'premium']);
      for (const id of Object.values(LLMConfig.AUTO_PREFS).flat()) {
        const pool = TokenConfig.poolFor(id);
        expect(paidPools.has(pool), `${id} (${pool} pool) must not sit in a ladder`).toBe(false);
      }
    });

    it('makes every catalog model reachable via ladders or stack routes', () => {
      const reachable = new Set(Object.values(LLMConfig.AUTO_PREFS).flat());
      for (const stack of Object.values(REAL_STACKS.STACKS)) {
        for (const id of Object.values(stack.niceAutoRouting || {})) reachable.add(id);
      }
      for (const m of ModelCatalog.MODEL_CATALOG) {
        expect(reachable.has(m.id), `${m.id} unreachable by NICE Auto`).toBe(true);
      }
    });

    it('skips disabled models and walks down the ladder', () => {
      const noDeepseek = { ...ALL_ON, 'deepseek-v4-flash': false };
      expect(LLMConfig.routeAuto('debug this stack trace', noDeepseek).id).toBe('gpt-5-mini');
    });

    it('falls back to the free default when nothing preferred is enabled', () => {
      expect(LLMConfig.routeAuto('refactor this code', {}).id).toBe('gemini-2-5-flash');
    });

    it('prefers a stack-DECLARED category route over the ladder', () => {
      globalThis.Stacks = {
        activeStackObject: () => ({ niceAutoRouting: { code: 'gpt-5-4-pro', cheap: 'gemini-2-5-flash' } }),
      };
      try {
        const r = LLMConfig.routeAuto('refactor this function', ALL_ON);
        expect(r.id).toBe('gpt-5-4-pro');
        expect(r.via).toBe('stack');
      } finally {
        delete globalThis.Stacks;
      }
    });

    it('sends UNDECLARED stack categories to the ladder, never models[0]', () => {
      globalThis.Stacks = {
        // Builder-like stack: declares code, not draft. routeFor's models[0]
        // fallthrough must not be consulted for writing prompts.
        activeStackObject: () => ({ niceAutoRouting: { code: 'gpt-5-4-pro', cheap: 'gemini-2-5-flash' }, models: ['gpt-5-4-pro'] }),
        routeFor: () => { throw new Error('routeFor must not be called'); },
      };
      try {
        const r = LLMConfig.routeAuto('draft an email to the landlord', ALL_ON);
        expect(r.id).toBe('gpt-5-mini');
        expect(r.via).toBe('ladder');
      } finally {
        delete globalThis.Stacks;
      }
    });

    it('canonicalizes legacy dotted ids in the enabled map', () => {
      expect(LLMConfig.routeAuto('hello there', { 'gemini-2.5-flash': true }).id).toBe('gemini-2-5-flash');
    });

    it('falls past a stack pick the user disabled', () => {
      globalThis.Stacks = {
        activeStackObject: () => ({ niceAutoRouting: { code: 'gpt-5-4-pro' } }),
      };
      try {
        const r = LLMConfig.routeAuto('refactor this function', { ...ALL_ON, 'gpt-5-4-pro': false });
        expect(r.id).toBe('deepseek-v4-flash');
        expect(r.via).toBe('ladder');
      } finally {
        delete globalThis.Stacks;
      }
    });

    it('ignores stacks when none is active', () => {
      globalThis.Stacks = { activeStackObject: () => null };
      try {
        expect(LLMConfig.routeAuto('hello', ALL_ON).id).toBe('gemini-2-5-flash');
      } finally {
        delete globalThis.Stacks;
      }
    });

    it('exposes AUTO_ID for the panel dropdown', () => {
      expect(LLMConfig.AUTO_ID).toBe('nice-auto');
    });
  });

});
