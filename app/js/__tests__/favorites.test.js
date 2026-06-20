/**
 * Favorites tests — the sidebar bookmark store (localStorage-backed). The data
 * methods carry the load-bearing rules: dedup by path, the 8-favorite cap, and
 * the toggle. render() safely no-ops without the sidebar DOM (favorites.js:74),
 * so add/remove are testable headlessly.
 *
 * Utils (KEYS), State, Router (path() → '/'), and Gamification all come from
 * setup.js, which also clears localStorage before each test for isolation.
 */

import { describe, it, expect } from 'vitest';

const { readFileSync } = await import('fs');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
const __dir = dirname(fileURLToPath(import.meta.url));

const code = readFileSync(resolve(__dir, '../lib/favorites.js'), 'utf-8')
  .replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
eval(code);

const KEY = Utils.KEYS.favorites;
const BP_KEY = Utils.KEYS.bpFavorites;
const stored = () => JSON.parse(localStorage.getItem(KEY) || '[]');

describe('Favorites.getAll', () => {
  it('returns an empty array when nothing is stored', () => {
    expect(Favorites.getAll()).toEqual([]);
  });

  it('returns the stored favorites', () => {
    localStorage.setItem(KEY, JSON.stringify([{ path: '/missions', label: 'Missions' }]));
    expect(Favorites.getAll()).toEqual([{ path: '/missions', label: 'Missions' }]);
  });

  it('falls back to an empty array on corrupt JSON', () => {
    localStorage.setItem(KEY, '{not valid');
    expect(Favorites.getAll()).toEqual([]);
  });

  it('falls back to an empty array when the stored value parses to null', () => {
    localStorage.setItem(KEY, 'null');
    expect(Favorites.getAll()).toEqual([]);
  });
});

describe('Favorites.add', () => {
  it('adds a new favorite and returns true', () => {
    expect(Favorites.add('/missions', 'Missions')).toBe(true);
    expect(Favorites.getAll()).toHaveLength(1);
  });

  it('persists the path, label, and an added timestamp', () => {
    Favorites.add('/missions', 'Missions');
    const fav = stored()[0];
    expect(fav.path).toBe('/missions');
    expect(fav.label).toBe('Missions');
    expect(typeof fav.added).toBe('number');
  });

  it('dedupes by path: re-adding an existing path returns false and does not duplicate', () => {
    Favorites.add('/missions', 'Missions');
    expect(Favorites.add('/missions', 'Missions again')).toBe(false);
    expect(Favorites.getAll()).toHaveLength(1);
    expect(stored()[0].label).toBe('Missions'); // original label kept
  });

  it('caps at 8 favorites: the 9th add returns false and is not stored', () => {
    for (let i = 0; i < 8; i++) expect(Favorites.add('/p' + i, 'P' + i)).toBe(true);
    expect(Favorites.add('/p8', 'P8')).toBe(false);
    expect(Favorites.getAll()).toHaveLength(8);
  });
});

describe('Favorites.remove', () => {
  it('removes a favorite by path, leaving the others intact', () => {
    Favorites.add('/a', 'A');
    Favorites.add('/b', 'B');
    Favorites.remove('/a');
    const all = Favorites.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].path).toBe('/b');
  });

  it('is a no-op for an unknown path', () => {
    Favorites.add('/a', 'A');
    Favorites.remove('/never-added');
    expect(Favorites.getAll()).toHaveLength(1);
  });
});

describe('Favorites.isFavorite', () => {
  it('reflects whether a path is stored', () => {
    Favorites.add('/a', 'A');
    expect(Favorites.isFavorite('/a')).toBe(true);
    expect(Favorites.isFavorite('/b')).toBe(false);
  });
});

describe('Favorites.toggleCurrent', () => {
  it('adds the current route when it is not yet favorited', () => {
    // Router.path() is mocked to '/'; no #app-page-title element → label "Page".
    expect(Favorites.isFavorite('/')).toBe(false);
    Favorites.toggleCurrent();
    expect(Favorites.isFavorite('/')).toBe(true);
    expect(Favorites.getAll().find(f => f.path === '/').label).toBe('Page');
  });

  it('removes the current route when it is already favorited', () => {
    Favorites.toggleCurrent(); // add
    Favorites.toggleCurrent(); // remove
    expect(Favorites.isFavorite('/')).toBe(false);
  });
});

describe('Favorites blueprint bookmarks', () => {
  const bpStored = () => JSON.parse(localStorage.getItem(BP_KEY) || '[]');

  it('adds a blueprint id and returns true', () => {
    expect(Favorites.addBlueprint('bp-1')).toBe(true);
    expect(Favorites.getBlueprintFavorites()).toEqual(['bp-1']);
    expect(bpStored()).toEqual(['bp-1']);
  });

  it('dedupes: re-adding an existing id returns false and does not duplicate', () => {
    Favorites.addBlueprint('bp-1');
    expect(Favorites.addBlueprint('bp-1')).toBe(false);
    expect(Favorites.getBlueprintFavorites()).toEqual(['bp-1']);
  });

  it('does not impose the sidebar 8-cap (blueprint bookmarks are uncapped)', () => {
    for (let i = 0; i < 10; i++) expect(Favorites.addBlueprint('bp-' + i)).toBe(true);
    expect(Favorites.getBlueprintFavorites()).toHaveLength(10);
  });

  it('removes a blueprint id, leaving the others intact', () => {
    Favorites.addBlueprint('bp-1');
    Favorites.addBlueprint('bp-2');
    Favorites.removeBlueprint('bp-1');
    expect(Favorites.getBlueprintFavorites()).toEqual(['bp-2']);
  });

  it('reflects membership via isBlueprintFavorite', () => {
    Favorites.addBlueprint('bp-1');
    expect(Favorites.isBlueprintFavorite('bp-1')).toBe(true);
    expect(Favorites.isBlueprintFavorite('bp-2')).toBe(false);
  });

  it('keeps blueprint bookmarks in a separate store from sidebar favorites', () => {
    Favorites.addBlueprint('bp-1');
    expect(Favorites.getAll()).toEqual([]);          // sidebar store untouched
    Favorites.add('/missions', 'Missions');
    expect(Favorites.getBlueprintFavorites()).toEqual(['bp-1']); // bp store untouched
  });
});
