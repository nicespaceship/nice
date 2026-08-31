import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Terminology is loaded globally by setup.js

/**
 * The tests fake the active theme by injecting a `Theme.current()` stub on
 * globalThis before calling `Terminology.label`. The module reads
 * `Theme.current()` at call-time, so the override applies immediately.
 */
function stubTheme(id) {
  globalThis.Theme = { current: () => id };
}

describe('Terminology', () => {
  beforeEach(() => {
    delete globalThis.Theme;
  });

  afterEach(() => {
    delete globalThis.Theme;
    document.body.innerHTML = '';
  });

  describe('label()', () => {
    it('returns the default noun when no theme is active', () => {
      expect(Terminology.label('mission')).toBe('Process');
    });

    it('pluralizes with { plural: true }', () => {
      expect(Terminology.label('mission', { plural: true })).toBe('Processes');
    });

    it('lowercases with { lowercase: true }', () => {
      expect(Terminology.label('mission', { lowercase: true })).toBe('process');
    });

    it('combines { plural, lowercase }', () => {
      expect(Terminology.label('mission', { plural: true, lowercase: true })).toBe('processes');
    });

    it('overrides the singular for Office theme', () => {
      stubTheme('office');
      expect(Terminology.label('mission')).toBe('Assignment');
    });

    it('overrides the plural for Office theme', () => {
      stubTheme('office');
      expect(Terminology.label('mission', { plural: true })).toBe('Assignments');
    });

    it('overrides for Office dark theme too', () => {
      stubTheme('office-dark');
      expect(Terminology.label('mission')).toBe('Assignment');
    });

    it('falls back to default when theme has no override for a noun', () => {
      stubTheme('office');
      // Office only overrides `mission` today; agent/spaceship fall through.
      expect(Terminology.label('agent')).toBe('Agent');
      expect(Terminology.label('spaceship')).toBe('Workspace');
    });

    it('accepts an explicit theme override via opts.theme', () => {
      expect(Terminology.label('mission', { theme: 'office' })).toBe('Assignment');
      expect(Terminology.label('mission', { theme: 'nice' })).toBe('Process');
    });

    it('gives sci-fi themes the spaceship vocabulary', () => {
      for (const t of ['hal-9000', 'matrix', 'lcars', 'jarvis', 'cyberpunk', 'grid', 'rx-78-2', '16bit']) {
        expect(Terminology.label('spaceship', { theme: t })).toBe('Spaceship');
        expect(Terminology.label('mission',   { theme: t })).toBe('Mission');
        expect(Terminology.label('crew',      { theme: t })).toBe('Crew');
        expect(Terminology.label('captain',   { theme: t })).toBe('Captain');
      }
    });

    it('falls back to business vocabulary for unknown/custom themes', () => {
      expect(Terminology.label('spaceship', { theme: 'my-custom-theme' })).toBe('Workspace');
      expect(Terminology.label('crew',      { theme: 'my-custom-theme' })).toBe('Team');
    });

    it('returns a capitalized fallback for unknown nouns', () => {
      expect(Terminology.label('quest')).toBe('Quest');
    });
  });

  describe('article()', () => {
    it('returns "a" for consonant-initial nouns', () => {
      expect(Terminology.article('mission')).toBe('a');
    });

    it('returns "an" for vowel-initial nouns', () => {
      stubTheme('office');
      expect(Terminology.article('mission')).toBe('an'); // assignment
    });

    it('respects opts.lowercase for the vowel check', () => {
      stubTheme('office');
      expect(Terminology.article('mission', { lowercase: true })).toBe('an');
    });
  });

  describe('applyDOM()', () => {
    it('populates [data-term] elements with the resolved label', () => {
      document.body.innerHTML = `
        <span data-term="mission"></span>
        <span data-term="mission.plural"></span>
      `;
      Terminology.applyDOM();
      const singular = document.body.querySelector('[data-term="mission"]');
      const plural   = document.body.querySelector('[data-term="mission.plural"]');
      expect(singular.textContent).toBe('Process');
      expect(plural.textContent).toBe('Processes');
    });

    it('applies per-theme overrides on every call', () => {
      document.body.innerHTML = '<span id="t" data-term="mission.plural"></span>';
      Terminology.applyDOM();
      expect(document.getElementById('t').textContent).toBe('Processes');
      stubTheme('office');
      Terminology.applyDOM();
      expect(document.getElementById('t').textContent).toBe('Assignments');
    });

    it('ignores elements without data-term', () => {
      document.body.innerHTML = '<span id="bare">untouched</span>';
      Terminology.applyDOM();
      expect(document.getElementById('bare').textContent).toBe('untouched');
    });

    it('scopes to a subtree when passed a root', () => {
      document.body.innerHTML = `
        <div id="outside"><span data-term="mission"></span></div>
        <div id="inside"><span data-term="mission.plural"></span></div>
      `;
      Terminology.applyDOM(document.getElementById('inside'));
      // inside: populated
      expect(document.querySelector('#inside [data-term]').textContent).toBe('Processes');
      // outside: untouched because it was not in the scoped subtree
      expect(document.querySelector('#outside [data-term]').textContent).toBe('');
    });
  });
});
