import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadModule(rel) {
  let code = readFileSync(resolve(__dir, '..', rel), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

loadModule('lib/llm-config.js');

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

    it('should default model to claude-haiku-4-5-20251001 when no profile or llm_engine', () => {
      const cfg = LLMConfig.forBlueprint({ stats: {} });
      expect(cfg.model).toBe('claude-haiku-4-5-20251001');
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

    it('exposes fallback model and tier when present', () => {
      const bp = {
        config: {
          model_profile: {
            preferred: 'claude-sonnet-4-6',
            fallback:  'gemini-2.5-flash',
            tier:      'premium',
          },
        },
      };
      const cfg = LLMConfig.forBlueprint(bp);
      expect(cfg.model).toBe('claude-sonnet-4-6');
      expect(cfg.fallback).toBe('gemini-2.5-flash');
      expect(cfg.tier).toBe('premium');
    });

    it('uses model_profile.fallback when nice-auto cannot resolve', () => {
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
      expect(LLMConfig.forBlueprint(bp).model).toBe('gemini-2.5-flash');
    });

    it('falls back to gemini-2.5-flash (free tier) when nice-auto has no profile fallback', () => {
      const bp = { config: { llm_engine: 'nice-auto' } };
      expect(LLMConfig.forBlueprint(bp).model).toBe('gemini-2.5-flash');
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
});
