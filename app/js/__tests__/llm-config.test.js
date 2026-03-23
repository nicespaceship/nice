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

    it('should default model to claude-haiku-4-5-20251001', () => {
      const cfg = LLMConfig.forBlueprint({ stats: {} });
      expect(cfg.model).toBe('claude-haiku-4-5-20251001');
    });

    it('should handle blueprint with no stats', () => {
      const cfg = LLMConfig.forBlueprint({});
      expect(cfg).toHaveProperty('temperature');
      expect(cfg).toHaveProperty('model');
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
