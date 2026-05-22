import { describe, it, expect } from 'vitest';

describe('BlueprintUtils.contrastText', () => {
  const ct = BlueprintUtils.contrastText;
  const RC = BlueprintUtils.RARITY_COLORS;

  it('returns dark text on the light rarity fills', () => {
    expect(ct(RC.Common)).toBe('#0a0a0a');    // #94a3b8 slate
    expect(ct(RC.Rare)).toBe('#0a0a0a');       // #b6dff9 pale blue
    expect(ct(RC.Legendary)).toBe('#0a0a0a');  // #f59e0b amber
  });

  it('keeps white text on the dark rarity fills', () => {
    expect(ct(RC.Epic)).toBe('#fff');          // #a855f7 purple
    expect(ct(RC.Mythic)).toBe('#fff');        // #ff2d55 pink
  });

  it('handles the extremes', () => {
    expect(ct('#000000')).toBe('#fff');
    expect(ct('#ffffff')).toBe('#0a0a0a');
  });

  it('falls back to white for malformed input', () => {
    expect(ct(null)).toBe('#fff');
    expect(ct('')).toBe('#fff');
    expect(ct('#fff')).toBe('#fff');       // shorthand hex unsupported
    expect(ct('rgb(0,0,0)')).toBe('#fff');
  });
});
