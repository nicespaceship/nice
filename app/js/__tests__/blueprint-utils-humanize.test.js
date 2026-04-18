import { describe, it, expect } from 'vitest';

describe('BlueprintUtils.humanizeModel', () => {
  const h = BlueprintUtils.humanizeModel;

  describe('known model ids', () => {
    it('humanizes Claude family ids', () => {
      expect(h('claude-opus-4-7')).toBe('Claude Opus 4.7');
      expect(h('claude-sonnet-4-6')).toBe('Claude Sonnet 4.6');
      expect(h('claude-haiku-4-5-20251001')).toBe('Claude Haiku 4.5');
      expect(h('claude-haiku-4-5')).toBe('Claude Haiku 4.5');
    });

    it('humanizes Gemini family ids', () => {
      expect(h('gemini-2.5-flash')).toBe('Gemini 2.5 Flash');
      expect(h('gemini-2.5-pro')).toBe('Gemini 2.5 Pro');
      expect(h('gemini-2.0-flash-lite')).toBe('Gemini 2.0 Lite');
    });

    it('humanizes GPT family ids', () => {
      expect(h('gpt-5.2')).toBe('GPT-5.2');
      expect(h('gpt-5-mini')).toBe('GPT-5 Mini');
      expect(h('gpt-4o')).toBe('GPT-4o');
    });

    it('humanizes other provider ids', () => {
      expect(h('grok-4')).toBe('Grok 4');
      expect(h('grok-4-1-fast')).toBe('Grok 4.1 Fast');
      expect(h('llama-4-scout')).toBe('Llama 4 Scout');
    });

    it('humanizes the full 10-model catalog ids', () => {
      expect(h('gemini-2-5-flash')).toBe('Gemini 2.5 Flash');
      expect(h('claude-4-6-sonnet')).toBe('Claude Sonnet 4.6');
      expect(h('claude-4-7-opus')).toBe('Claude Opus 4.7');
      expect(h('gpt-5-4-pro')).toBe('GPT-5.4 Pro');
      expect(h('gpt-5-3-codex')).toBe('GPT-5.3 Codex');
      expect(h('openai-o3')).toBe('OpenAI o3');
      expect(h('gemini-2-5-pro')).toBe('Gemini 2.5 Pro');
    });

    it('humanizes the nice-auto magic id', () => {
      expect(h('nice-auto')).toBe('NICE Auto');
    });
  });

  describe('humanizeModelShort — compact pill-friendly variant', () => {
    const s = BlueprintUtils.humanizeModelShort;

    it('returns the short form for known ids', () => {
      expect(s('gemini-2-5-flash')).toBe('Gemini Flash');
      expect(s('claude-4-6-sonnet')).toBe('Claude Sonnet');
      expect(s('claude-4-7-opus')).toBe('Claude Opus');
      expect(s('gpt-5-mini')).toBe('GPT-5 Mini');
      expect(s('openai-o3')).toBe('o3');
      expect(s('grok-4-1-fast')).toBe('Grok Fast');
      expect(s('llama-4-scout')).toBe('Llama Scout');
    });

    it('falls back to humanizeModel when no short variant exists', () => {
      expect(s('some-future-model')).toBe('Some Future Model');
    });

    it('returns empty string for null / undefined', () => {
      expect(s(null)).toBe('');
      expect(s(undefined)).toBe('');
    });
  });

  describe('unknown ids — generic fallback', () => {
    it('Title-Cases unknown kebab-case ids', () => {
      expect(h('some-future-model')).toBe('Some Future Model');
    });

    it('keeps version segments intact', () => {
      expect(h('foo-bar-1.5-turbo')).toBe('Foo Bar 1.5 Turbo');
    });

    it('handles single-word ids', () => {
      expect(h('grok')).toBe('Grok');
    });
  });

  describe('edge cases', () => {
    it('returns empty string for null or undefined', () => {
      expect(h(null)).toBe('');
      expect(h(undefined)).toBe('');
    });

    it('returns empty string for non-string input', () => {
      expect(h(42)).toBe('');
      expect(h({})).toBe('');
    });

    it('returns empty string for empty string', () => {
      expect(h('')).toBe('');
    });
  });
});
