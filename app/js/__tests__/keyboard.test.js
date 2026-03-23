import { describe, it, expect, beforeEach, vi } from 'vitest';

// Keyboard is a mock in setup.js, but we can test the chord logic directly

describe('Keyboard shortcuts logic', () => {
  // Replicating the chord matching algorithm for unit testing
  const SHORTCUTS = [
    { chord: ['g', 'h'], label: 'Go Home' },
    { chord: ['g', 'a'], label: 'Go Agents' },
    { chord: ['g', 's'], label: 'Go Shipyard' },
    { chord: ['g', 'm'], label: 'Go Missions' },
    { chord: ['n', 'a'], label: 'New Agent' },
    { chord: ['?'],      label: 'Show Shortcuts' },
  ];

  function matchShortcut(keys) {
    if (keys.length === 1) {
      return SHORTCUTS.find(s => s.chord.length === 1 && s.chord[0] === keys[0]) || null;
    }
    if (keys.length === 2) {
      return SHORTCUTS.find(s =>
        s.chord.length === 2 && s.chord[0] === keys[0] && s.chord[1] === keys[1]
      ) || null;
    }
    return null;
  }

  function isChordStarter(key) {
    return SHORTCUTS.some(s => s.chord.length === 2 && s.chord[0] === key);
  }

  it('should match single-key shortcuts', () => {
    const match = matchShortcut(['?']);
    expect(match).not.toBeNull();
    expect(match.label).toBe('Show Shortcuts');
  });

  it('should match two-key chords', () => {
    const match = matchShortcut(['g', 'h']);
    expect(match).not.toBeNull();
    expect(match.label).toBe('Go Home');
  });

  it('should match g+a chord', () => {
    expect(matchShortcut(['g', 'a']).label).toBe('Go Agents');
  });

  it('should match g+m chord', () => {
    expect(matchShortcut(['g', 'm']).label).toBe('Go Missions');
  });

  it('should match n+a chord', () => {
    expect(matchShortcut(['n', 'a']).label).toBe('New Agent');
  });

  it('should return null for unknown chords', () => {
    expect(matchShortcut(['g', 'z'])).toBeNull();
    expect(matchShortcut(['x', 'y'])).toBeNull();
  });

  it('should return null for unknown single keys', () => {
    expect(matchShortcut(['z'])).toBeNull();
  });

  it('should identify chord starters', () => {
    expect(isChordStarter('g')).toBe(true);
    expect(isChordStarter('n')).toBe(true);
    expect(isChordStarter('z')).toBe(false);
    expect(isChordStarter('?')).toBe(false);
  });

  it('should not match partial chords as single keys', () => {
    // 'g' alone is a chord starter, not a single-key shortcut
    const match = matchShortcut(['g']);
    expect(match).toBeNull();
  });
});

describe('Keyboard input filtering', () => {
  // Test the logic for ignoring keys when focused on inputs
  function shouldIgnore(tagName, isContentEditable, modifiers) {
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || isContentEditable) return true;
    if (modifiers.meta || modifiers.ctrl || modifiers.alt) return true;
    return false;
  }

  it('should ignore keys in INPUT fields', () => {
    expect(shouldIgnore('INPUT', false, {})).toBe(true);
  });

  it('should ignore keys in TEXTAREA fields', () => {
    expect(shouldIgnore('TEXTAREA', false, {})).toBe(true);
  });

  it('should ignore keys in SELECT fields', () => {
    expect(shouldIgnore('SELECT', false, {})).toBe(true);
  });

  it('should ignore contentEditable elements', () => {
    expect(shouldIgnore('DIV', true, {})).toBe(true);
  });

  it('should ignore when meta key is held', () => {
    expect(shouldIgnore('DIV', false, { meta: true })).toBe(true);
  });

  it('should ignore when ctrl key is held', () => {
    expect(shouldIgnore('DIV', false, { ctrl: true })).toBe(true);
  });

  it('should not ignore regular key on body', () => {
    expect(shouldIgnore('DIV', false, {})).toBe(false);
  });

  it('should ignore when alt key is held', () => {
    expect(shouldIgnore('DIV', false, { alt: true })).toBe(true);
  });
});

describe('Keyboard chord timeout simulation', () => {
  // Simulates the chord buffer behavior: keys pressed within a timeout window
  // form a chord, keys pressed after timeout reset the buffer

  function createChordBuffer(timeoutMs) {
    let buffer = [];
    let lastKeyTime = 0;

    return {
      press(key, timestamp) {
        if (timestamp - lastKeyTime > timeoutMs) {
          buffer = [];
        }
        buffer.push(key);
        lastKeyTime = timestamp;
        return [...buffer];
      },
      reset() {
        buffer = [];
        lastKeyTime = 0;
      },
      getBuffer() {
        return [...buffer];
      },
    };
  }

  it('should accumulate keys within timeout window', () => {
    const chord = createChordBuffer(500);
    chord.press('g', 1000);
    const keys = chord.press('h', 1200);
    expect(keys).toEqual(['g', 'h']);
  });

  it('should reset buffer after timeout expires', () => {
    const chord = createChordBuffer(500);
    chord.press('g', 1000);
    const keys = chord.press('a', 2000); // 1000ms later, exceeds 500ms timeout
    expect(keys).toEqual(['a']); // buffer was reset
  });

  it('should handle rapid three-key sequence', () => {
    const chord = createChordBuffer(500);
    chord.press('a', 100);
    chord.press('b', 200);
    const keys = chord.press('c', 300);
    expect(keys).toEqual(['a', 'b', 'c']);
  });

  it('should reset on explicit reset call', () => {
    const chord = createChordBuffer(500);
    chord.press('g', 1000);
    chord.reset();
    expect(chord.getBuffer()).toEqual([]);
  });
});
