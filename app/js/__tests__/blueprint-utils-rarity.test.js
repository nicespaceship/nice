import { describe, it, expect } from 'vitest';

// BlueprintUtils + LLMConfig are loaded globally by setup.js.

describe('BlueprintUtils.calcAgentRarity', () => {
  const calc = (a) => BlueprintUtils.calcAgentRarity(a);

  it('scores a basic agent as Common', () => {
    const r = calc({ llm_engine: 'gpt-4o-mini', type: 'Specialist', config: { tools: [], memory: false, temperature: 0.7 } });
    expect(r.name).toBe('Common');
    expect(r.score).toBeLessThanOrEqual(3);
  });

  it('scores a mid-range agent as Rare', () => {
    expect(calc({ llm_engine: 'claude-3.5', type: 'Specialist', config: { tools: ['A', 'B', 'C'], memory: false, temperature: 0.7 } }).name).toBe('Rare');
  });

  it('scores an advanced agent as Epic', () => {
    expect(calc({ llm_engine: 'claude-4', type: 'Hybrid', config: { tools: ['A', 'B', 'C', 'D'], memory: true, temperature: 0.7 } }).name).toBe('Epic');
  });

  it('scores a fully-loaded agent as Legendary with the SSOT color', () => {
    const r = calc({ llm_engine: 'claude-4', type: 'General', config: { tools: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], memory: true, temperature: 0.5 } });
    expect(r.name).toBe('Legendary');
    expect(r.color).toBe(BlueprintUtils.RARITY_COLORS.Legendary);
  });

  it('never computes Mythic (max score is 13, threshold is 14)', () => {
    const r = calc({ llm_engine: 'claude-4', type: 'General', config: { tools: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], memory: true, temperature: 0.3 } });
    expect(r.name).not.toBe('Mythic');
    expect(r.score).toBeLessThan(14);
  });

  it('handles null, undefined and a missing config', () => {
    expect(calc(null).name).toBe('Common');
    expect(calc(undefined).name).toBe('Common');
    expect(calc({ llm_engine: 'claude-4', type: 'Specialist' }).name).toBeDefined();
  });

  it('scores retired model ids identically to their replacements', () => {
    const mk = (llm) => calc({ type: 'General', config: { llm_engine: llm, tools: ['a', 'b', 'c', 'd'], memory: false } });
    expect(mk('grok-4-1-fast').score).toBe(mk('grok-4-3').score);
    expect(mk('llama-4-scout').score).toBe(mk('gpt-oss-120b').score);
    expect(mk('grok-4-3').score).toBeGreaterThan(mk('gemini-2-5-flash').score);
    expect(mk('gpt-oss-120b').score).toBeGreaterThan(mk('gemini-2-5-flash').score);
  });

  it('canonicalizes legacy and dotted ids before the tier lookup', () => {
    const base = { type: 'Specialist', config: { tools: [], memory: false, temperature: 0.7 } };
    expect(calc({ ...base, llm_engine: 'claude-4' }).score).toBe(calc({ ...base, llm_engine: 'claude-4-6-sonnet' }).score);
    expect(calc({ ...base, llm_engine: 'gemini-2.5-flash' }).score).toBe(calc({ ...base, llm_engine: 'gemini-2-5-flash' }).score);
  });

  it('stale ids fall through to the default tier', () => {
    const base = { type: 'Specialist', config: { tools: [], memory: false, temperature: 0.7 } };
    expect(calc({ ...base, llm_engine: 'gpt-4o' }).score).toBe(calc({ ...base, llm_engine: '' }).score);
  });

  it('keeps nice-auto at its mid tier, above gpt-5-mini', () => {
    const base = { type: 'Specialist', config: { tools: [], memory: false, temperature: 0.7 } };
    expect(calc({ ...base, llm_engine: 'nice-auto' }).score).toBeGreaterThan(calc({ ...base, llm_engine: 'gpt-5-mini' }).score);
  });
});

describe('BlueprintUtils.getRarity', () => {
  it('prefers a stored rarity, title-cased', () => {
    expect(BlueprintUtils.getRarity({ rarity: 'epic' })).toBe('Epic');
  });

  it('falls back to the computed rarity', () => {
    expect(BlueprintUtils.getRarity({ llm_engine: 'claude-4', type: 'Hybrid', config: { tools: ['A', 'B', 'C', 'D'], memory: true } })).toBe('Epic');
  });
});
