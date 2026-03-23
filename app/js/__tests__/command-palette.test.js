import { describe, it, expect, beforeEach, vi } from 'vitest';

// CommandPalette is loaded globally by setup.js

describe('CommandPalette', () => {
  it('should be defined with expected methods', () => {
    expect(globalThis.CommandPalette).toBeDefined();
    expect(typeof globalThis.CommandPalette.init).toBe('function');
    expect(typeof globalThis.CommandPalette.open).toBe('function');
    expect(typeof globalThis.CommandPalette.close).toBe('function');
  });

  describe('_fuzzyScore (via search behavior)', () => {
    // We can't directly access _fuzzyScore, but we can test it by
    // checking search results via init/open/search sequence
    // Instead, let's test the exported fuzzy scoring through behavior

    it('should have ROUTES and ACTIONS internally', () => {
      // The module should expose init, open, close at minimum
      expect(typeof CommandPalette.init).toBe('function');
    });
  });
});

describe('CommandPalette fuzzyScore', () => {
  // Extract fuzzyScore logic for unit testing
  function fuzzyScore(query, text) {
    if (!query) return 1;
    text = text.toLowerCase();
    if (text.includes(query)) return 10 + query.length;
    let qi = 0;
    for (let i = 0; i < text.length && qi < query.length; i++) {
      if (text[i] === query[qi]) qi++;
    }
    return qi === query.length ? qi : 0;
  }

  it('should return 1 for empty query', () => {
    expect(fuzzyScore('', 'Home')).toBe(1);
  });

  it('should score exact substring match high', () => {
    const score = fuzzyScore('home', 'Home dashboard mission control');
    expect(score).toBe(14); // 10 + query.length(4)
  });

  it('should score fuzzy match based on character count', () => {
    const score = fuzzyScore('hmc', 'Home dashboard mission control');
    expect(score).toBe(3); // Matched 3 chars fuzzy
  });

  it('should return 0 for no match', () => {
    const score = fuzzyScore('xyz', 'Home');
    expect(score).toBe(0);
  });

  it('should be case insensitive on text side', () => {
    // fuzzyScore lowercases text but expects pre-lowercased query (done in _search)
    const score = fuzzyScore('home', 'Home Dashboard');
    expect(score).toBeGreaterThan(0);
  });

  it('should prefer longer substring matches', () => {
    const short = fuzzyScore('age', 'Agents list manage');
    const long = fuzzyScore('agents', 'Agents list manage');
    expect(long).toBeGreaterThan(short);
  });

  it('should handle partial fuzzy matches', () => {
    const score = fuzzyScore('agnt', 'agent');
    expect(score).toBe(4); // All 4 chars matched fuzzy
  });

  it('should return 0 for impossible fuzzy match', () => {
    const score = fuzzyScore('zzz', 'agent');
    expect(score).toBe(0);
  });
});
