/**
 * PromptPanel app-context tests — second consumer of the view-harness.
 *
 * Covers the two public AI-grounding helpers in the 3,689-LOC prompt-panel
 * god-file (the rest of its logic is private and UI-coupled):
 *   - _getSlottedAgents() — resolves the active ship's crew from three sources
 *     in priority order (State.spaceships → nice-ship-state → legacy nice-mc-slots),
 *     each id resolved State.agents → Blueprints catalog → BlueprintsView.SEED.
 *     A 2026-04-24 prod smoke session showed custom-ship rosters going invisible
 *     to the orchestrator when a source/priority branch was missing, so this is
 *     load-bearing.
 *   - _buildAppContext() — the fleet snapshot handed to the NICE chat system
 *     prompt: rank from XP, counts, current view, the 300-XP rarity gate, active
 *     crew, and the role-grouped catalog.
 *
 * Both are exposed on PromptPanel's public API; loaded whole via the harness.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { installViewMocks, loadModule } from './helpers/view-harness.js';

installViewMocks();
loadModule('views/prompt-panel.js');

const SEED = [
  { id: 'bp-agent-web',  name: 'Web Researcher', config: { role: 'Research' }, rarity: 'Common' },
  { id: 'bp-agent-code', name: 'Code Reviewer',  config: { role: 'Code' },     rarity: 'Rare' },
  { id: 'bp-agent-data', name: 'Data Analyst',   config: { role: 'Research' }, rarity: 'Epic' },
];
const SPACESHIP_SEED = [
  { id: 'ship-01', name: 'Scout Mk I', slots: 2, class: '1', tier: 'lite', flavor: 'Starter ship' },
];

beforeEach(() => {
  globalThis.Blueprints = { getAgent: (id) => SEED.find(b => b.id === id) || null };
  globalThis.BlueprintsView = { SEED, SPACESHIP_SEED };
  window.location.hash = '';
});

describe('PromptPanel._getSlottedAgents', () => {
  it('returns [] when no ship state exists anywhere', () => {
    expect(PromptPanel._getSlottedAgents()).toEqual([]);
  });

  it('resolves crew from State.spaceships (source 1) via config.slot_assignments', () => {
    localStorage.setItem(Utils.KEYS.mcShip, 'ship-01');
    State.set('agents', []);
    State.set('spaceships', [{ id: 'ship-01', config: { slot_assignments: { 0: 'bp-agent-web', 1: 'bp-agent-code' } } }]);
    const crew = PromptPanel._getSlottedAgents();
    expect(crew.map(a => a.name)).toEqual(['Web Researcher', 'Code Reviewer']);
    expect(crew[0].slot).toBe('0');
    expect(crew[0].role).toBe('Research');
  });

  it('prefers a matching State.agents row over the catalog when resolving an id', () => {
    localStorage.setItem(Utils.KEYS.mcShip, 'ship-01');
    State.set('agents', [{ id: 'bp-agent-web', name: 'My Custom Web', config: { role: 'CustomRole' } }]);
    State.set('spaceships', [{ id: 'ship-01', config: { slot_assignments: { 0: 'bp-agent-web' } } }]);
    const crew = PromptPanel._getSlottedAgents();
    expect(crew[0].name).toBe('My Custom Web');
    expect(crew[0].role).toBe('CustomRole');
  });

  it('matches the active ship by bp-prefixed id and by blueprint_id', () => {
    localStorage.setItem(Utils.KEYS.mcShip, 'ship-01');
    State.set('agents', []);
    State.set('spaceships', [{ id: 'bp-ship-01', config: { slot_assignments: { 0: 'bp-agent-web' } } }]);
    expect(PromptPanel._getSlottedAgents().map(a => a.name)).toEqual(['Web Researcher']);
    State.set('spaceships', [{ id: 'other', blueprint_id: 'ship-01', config: { slot_assignments: { 0: 'bp-agent-code' } } }]);
    expect(PromptPanel._getSlottedAgents().map(a => a.name)).toEqual(['Code Reviewer']);
  });

  it('falls back to nice-ship-state localStorage (source 2) when State has no match', () => {
    localStorage.setItem(Utils.KEYS.mcShip, 'ship-01');
    State.set('spaceships', []);
    localStorage.setItem(Utils.KEYS.shipState, JSON.stringify({ 'ship-01': { slot_assignments: { 0: 'bp-agent-data' } } }));
    expect(PromptPanel._getSlottedAgents().map(a => a.name)).toEqual(['Data Analyst']);
  });

  it('falls back to legacy nice-mc-slots (source 3) last', () => {
    localStorage.setItem(Utils.KEYS.mcShip, 'ship-01');
    State.set('spaceships', []);
    localStorage.setItem(Utils.KEYS.mcSlots, JSON.stringify({ 'ship-01': { 0: 'bp-agent-web' } }));
    expect(PromptPanel._getSlottedAgents().map(a => a.name)).toEqual(['Web Researcher']);
  });

  it('prefers State.spaceships (source 1) over the localStorage sources', () => {
    localStorage.setItem(Utils.KEYS.mcShip, 'ship-01');
    State.set('agents', []);
    State.set('spaceships', [{ id: 'ship-01', config: { slot_assignments: { 0: 'bp-agent-web' } } }]);
    localStorage.setItem(Utils.KEYS.mcSlots, JSON.stringify({ 'ship-01': { 0: 'bp-agent-code' } }));
    expect(PromptPanel._getSlottedAgents().map(a => a.name)).toEqual(['Web Researcher']);
  });

  it('resolves via BlueprintsView.SEED when the Blueprints lib is absent', () => {
    localStorage.setItem(Utils.KEYS.mcShip, 'ship-01');
    State.set('spaceships', [{ id: 'ship-01', config: { slot_assignments: { 0: 'bp-agent-data' } } }]);
    // With the lib present, the catalog branch wins and returns its name…
    globalThis.Blueprints = { getAgent: () => ({ id: 'bp-agent-data', name: 'FROM LIB', config: { role: 'X' } }) };
    expect(PromptPanel._getSlottedAgents()[0].name).toBe('FROM LIB');
    // …remove it and the same id must fall through to the SEED row instead.
    delete globalThis.Blueprints;
    expect(PromptPanel._getSlottedAgents().map(a => a.name)).toEqual(['Data Analyst']);
  });

  it('skips unresolvable agent ids', () => {
    localStorage.setItem(Utils.KEYS.mcShip, 'ship-01');
    State.set('agents', []);
    State.set('spaceships', [{ id: 'ship-01', config: { slot_assignments: { 0: 'bp-agent-web', 1: 'ghost-id' } } }]);
    expect(PromptPanel._getSlottedAgents().map(a => a.name)).toEqual(['Web Researcher']);
  });

  it('returns [] gracefully on corrupt localStorage JSON', () => {
    localStorage.setItem(Utils.KEYS.mcShip, 'ship-01');
    State.set('spaceships', []);
    localStorage.setItem(Utils.KEYS.shipState, '{not valid json');
    expect(PromptPanel._getSlottedAgents()).toEqual([]);
  });
});

describe('PromptPanel._buildAppContext', () => {
  it('derives rank from the XP thresholds', () => {
    const rankAt = (xp) => { localStorage.setItem(Utils.KEYS.xp, String(xp)); return PromptPanel._buildAppContext().rank; };
    expect(rankAt(0)).toBe('Ensign');
    expect(rankAt(25000)).toBe('Lieutenant');
    expect(rankAt(99999)).toBe('Lt Commander'); // 50k..100k band
    expect(rankAt(200000)).toBe('Captain');
    expect(rankAt(2500000)).toBe('Fleet Admiral');
  });

  it('gates show_rarity at 300 XP', () => {
    localStorage.setItem(Utils.KEYS.xp, '299');
    expect(PromptPanel._buildAppContext().show_rarity).toBe(false);
    localStorage.setItem(Utils.KEYS.xp, '300');
    expect(PromptPanel._buildAppContext().show_rarity).toBe(true);
  });

  it('reports agent and ship counts from State', () => {
    State.set('agents', [{ id: 'a' }, { id: 'b' }]);
    State.set('spaceships', [{ id: 's' }]);
    const ctx = PromptPanel._buildAppContext();
    expect(ctx.agent_count).toBe(2);
    expect(ctx.ship_count).toBe(1);
  });

  it('captures the current view from the location hash', () => {
    window.location.hash = '#/bridge';
    expect(PromptPanel._buildAppContext().current_view).toBe('#/bridge');
  });

  it('includes active crew (name + role) sourced from _getSlottedAgents', () => {
    localStorage.setItem(Utils.KEYS.mcShip, 'ship-01');
    State.set('agents', []);
    State.set('spaceships', [{ id: 'ship-01', config: { slot_assignments: { 0: 'bp-agent-web' } } }]);
    expect(PromptPanel._buildAppContext().active_crew).toEqual([{ name: 'Web Researcher', role: 'Research' }]);
  });

  it('groups the catalog by role, hiding rarity below the 300-XP gate', () => {
    localStorage.setItem(Utils.KEYS.xp, '0');
    let ctx = PromptPanel._buildAppContext();
    expect(ctx.catalog_lines).toContain('Research: Web Researcher, Data Analyst');
    expect(ctx.catalog_lines).toContain('Code: Code Reviewer');
    expect(ctx.catalog_lines).not.toContain('(Common)');
    localStorage.setItem(Utils.KEYS.xp, '500');
    ctx = PromptPanel._buildAppContext();
    expect(ctx.catalog_lines).toContain('(Common)');
  });

  it('lists the seed ships', () => {
    expect(PromptPanel._buildAppContext().ship_lines).toContain('Scout Mk I');
  });
});
