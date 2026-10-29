/**
 * Crew resolution shared by the crew view and the Schematic:
 * Blueprints.getCurrentShipId, getShipSlotMap, resolveCrewAgent, getShipCrew.
 */
import { describe, it, expect, beforeEach } from 'vitest';

globalThis.BlueprintsView = { SEED: [], SPACESHIP_SEED: [] };
globalThis.SB = {
  isReady: () => true,
  isOnline: () => true,
  client: { from: () => ({ select: async () => ({ data: [] }) }) },
  db: () => ({ list: async () => [], get: async () => null, create: async () => ({}), update: async () => ({}), delete: async () => ({}) }),
  realtime: { subscribe: () => ({}) },
};
globalThis.ShipSlots = { fetchForShips: async () => ({}), setForShip: async () => true, setSlot: async () => true, clearSlot: async () => true, deleteForShip: async () => true };

const { readFileSync } = await import('fs');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
const __dir = dirname(fileURLToPath(import.meta.url));
let code = readFileSync(resolve(__dir, '../lib/blueprints.js'), 'utf-8');
code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
eval(code);

const SHIP = {
  id: 'ship-x', name: 'Sunrise Bakery',
  crew: [{ label: 'Head Baker', role: 'captain' }, { label: 'Orders & Payments', role: 'operations' }, { label: 'Agent 3' }],
  slot_assignments: { 0: 'agent-1', 2: 'agent-3' },
};

beforeEach(() => {
  localStorage.clear();
  State._reset();
  State.set('spaceships', [SHIP]);
  State.set('agents', [
    { id: 'agent-1', name: 'Baker Bot', role: 'Captain' },
    { id: 'agent-3', name: 'Marketer', role: 'Marketing' },
  ]);
});

describe('Blueprints.getCurrentShipId', () => {
  it('keeps a stored choice that is still one of the user ships', () => {
    localStorage.setItem(Utils.KEYS.mcShip, 'ship-x');
    expect(Blueprints.getCurrentShipId()).toBe('ship-x');
  });

  it('falls back to the first ship and saves it when the choice is stale', () => {
    localStorage.setItem(Utils.KEYS.mcShip, 'gone');
    expect(Blueprints.getCurrentShipId()).toBe('ship-x');
    expect(localStorage.getItem(Utils.KEYS.mcShip)).toBe('ship-x');
  });

  it('returns null when the user runs no spaceship', () => {
    State.set('spaceships', []);
    expect(Blueprints.getCurrentShipId()).toBeNull();
  });
});

describe('Blueprints.getShipCrew', () => {
  it('lists the crew in slot order with each slot and its agent', () => {
    const crew = Blueprints.getShipCrew('ship-x');
    expect(crew.length).toBeGreaterThanOrEqual(3);
    expect(crew[0]).toMatchObject({ index: 0, agentId: 'agent-1' });
    expect(crew[0].slot.label).toBe('Head Baker');
    expect(crew[0].agent.name).toBe('Baker Bot');
    expect(crew[1]).toMatchObject({ index: 1, agentId: null, agent: null });
    expect(crew[1].slot.label).toBe('Orders & Payments');
    expect(crew[2].agent.name).toBe('Marketer');
  });

  it('returns an empty crew for an unknown ship', () => {
    expect(Blueprints.getShipCrew('nope')).toEqual([]);
  });
});

describe('Blueprints.resolveCrewAgent', () => {
  it('turns a __new__ placeholder into a named stub', () => {
    expect(Blueprints.resolveCrewAgent('__new__Head Baker', 'ship-x')).toMatchObject({ id: '__new__Head Baker', name: 'Head Baker' });
  });

  it('finds user agents in State', () => {
    expect(Blueprints.resolveCrewAgent('agent-3', 'ship-x')).toMatchObject({ id: 'agent-3', name: 'Marketer' });
  });

  it('returns null for an empty id', () => {
    expect(Blueprints.resolveCrewAgent(null, 'ship-x')).toBeNull();
  });
});
