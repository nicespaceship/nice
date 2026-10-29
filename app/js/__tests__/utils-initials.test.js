import { describe, it, expect } from 'vitest';

// Utils is loaded globally by setup.js.

describe('Utils.initials', () => {
  it('takes the first letters of the first two words', () => {
    expect(Utils.initials('Sunrise Bakery')).toBe('SB');
    expect(Utils.initials('battlestar galactica crew')).toBe('BG');
  });

  it('skips words that start with a symbol', () => {
    expect(Utils.initials('Orders & Payments')).toBe('OP');
    expect(Utils.initials('R&D Lab')).toBe('RL');
    expect(Utils.initials('— Draft')).toBe('D');
  });

  it('uses one letter for a one-word name', () => {
    expect(Utils.initials('Galley')).toBe('G');
  });

  it('skips a leading "The"', () => {
    expect(Utils.initials('The Matrix')).toBe('M');
    expect(Utils.initials('the Heart of Gold')).toBe('HO');
  });

  it('falls back to "?" for an empty name', () => {
    expect(Utils.initials('')).toBe('?');
    expect(Utils.initials(null)).toBe('?');
    expect(Utils.initials('   ')).toBe('?');
  });
});
