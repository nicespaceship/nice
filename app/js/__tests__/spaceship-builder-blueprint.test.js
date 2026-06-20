/**
 * SpaceshipBuilderView serialization tests — the load-bearing path that turns
 * the ship authoring form into a `spaceship_blueprints` row on INSERT / UPDATE /
 * FORK. Parallel to the agent-builder serialization, with two ship-specific
 * wrinkles worth pinning: the _kebab fallback is "spaceship", and caps
 * precedence is INVERTED vs agents — existing themed catalog caps win over the
 * form's auto-generated caps (the catalog copy is the real content).
 *
 * Exercises the pure helpers via the test seam (`_buildShipBlueprintRow` /
 * `_kebab`). Utils + BlueprintUtils (needed at load for SLOT_COLORS) + State
 * all come from setup.js — no extra globals required.
 */

import { describe, it, expect } from 'vitest';

const { readFileSync } = await import('fs');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
const __dir = dirname(fileURLToPath(import.meta.url));

const code = readFileSync(resolve(__dir, '../views/spaceship-builder.js'), 'utf-8')
  .replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
eval(code);
const { _buildShipBlueprintRow, _kebab } = SpaceshipBuilderView;

const USER = { id: 'user-123' };
const baseForm = () => ({
  name: 'Acme Ops Cruiser',
  description: 'Runs the back office',
  flavor: 'A tidy little ship',
  category: 'Ops',
  rarity: 'rare',
  stats: { power: 5 },
  caps: ['3 agent slots'], // form auto-generates these
  tags: ['internal'],
});

describe('SpaceshipBuilderView._kebab', () => {
  it('slugifies a ship name', () => {
    expect(_kebab('Acme Ops Cruiser')).toBe('acme-ops-cruiser');
  });
  it('falls back to "spaceship" (not "agent") for empty / garbage input', () => {
    expect(_kebab('')).toBe('spaceship');
    expect(_kebab(null)).toBe('spaceship');
    expect(_kebab('!!!')).toBe('spaceship');
  });
  it('caps the slug at 40 characters', () => {
    expect(_kebab('z'.repeat(60))).toBe('z'.repeat(40));
  });
});

describe('SpaceshipBuilderView._buildShipBlueprintRow — new ship (INSERT)', () => {
  it('stamps community scope, private visibility, and the current user as creator', () => {
    const row = _buildShipBlueprintRow(baseForm(), USER, null);
    expect(row.scope).toBe('community');
    expect(row.visibility).toBe('private');
    expect(row.creator_id).toBe('user-123');
  });

  it('maps the form fields onto the row', () => {
    const row = _buildShipBlueprintRow(baseForm(), USER, null);
    expect(row.name).toBe('Acme Ops Cruiser');
    expect(row.description).toBe('Runs the back office');
    expect(row.flavor).toBe('A tidy little ship');
    expect(row.category).toBe('Ops');
    expect(row.rarity).toBe('rare');
    expect(row.config.stats).toEqual({ power: 5 });
    expect(row.tags).toEqual(['internal']);
  });

  it('generates a fresh slug from the name and a USER- serial key', () => {
    const row = _buildShipBlueprintRow(baseForm(), USER, null);
    expect(row.slug).toMatch(/^acme-ops-cruiser-[a-z0-9]+$/);
    expect(row.serial_key).toMatch(/^USER-[A-Z0-9]+$/);
  });

  it('uses the form caps for config + card when there is no existing blueprint', () => {
    const row = _buildShipBlueprintRow(baseForm(), USER, null);
    expect(row.config.caps).toEqual(['3 agent slots']);
    expect(row.card.caps).toEqual(['3 agent slots']);
  });
});

describe('SpaceshipBuilderView._buildShipBlueprintRow — editing an owned blueprint (UPDATE)', () => {
  const owned = () => ({
    creator_id: 'user-123', // same as USER → not a fork
    slug: 'existing-ship',
    serial_key: 'USER-SHIP01',
    category: 'Old Category',
    config: { ship_system_prompt: 'KEEP ME', workflow_patterns: ['x'], caps: ['ship product end-to-end'] },
    card: { subtitle: 'themed sub', caps: ['themed card cap'] },
    tags: ['old-tag'],
  });

  it('keeps the existing identity (slug + serial_key)', () => {
    const row = _buildShipBlueprintRow(baseForm(), USER, owned());
    expect(row.slug).toBe('existing-ship');
    expect(row.serial_key).toBe('USER-SHIP01');
  });

  it('overlays form stats on top of the existing config, keeping fields the form cannot express', () => {
    const row = _buildShipBlueprintRow(baseForm(), USER, owned());
    expect(row.config.ship_system_prompt).toBe('KEEP ME');
    expect(row.config.workflow_patterns).toEqual(['x']);
    expect(row.config.stats).toEqual({ power: 5 });
  });

  it('prefers the existing themed caps over the form caps (config + card)', () => {
    const row = _buildShipBlueprintRow(baseForm(), USER, owned());
    expect(row.config.caps).toEqual(['ship product end-to-end']); // existing wins
    expect(row.card.caps).toEqual(['themed card cap']);            // existing wins
    expect(row.card.subtitle).toBe('themed sub');                  // existing card preserved
  });

  it('inherits tags when the form leaves them empty', () => {
    const row = _buildShipBlueprintRow({ ...baseForm(), tags: [] }, USER, owned());
    expect(row.tags).toEqual(['old-tag']);
  });
});

describe('SpaceshipBuilderView._buildShipBlueprintRow — forking another user\'s blueprint', () => {
  const foreign = () => ({
    creator_id: 'someone-else', // different from USER → fork
    slug: 'catalog-ship',
    serial_key: 'CAT-001',
    config: { ship_system_prompt: 'CATALOG PROMPT', caps: ['themed cap'] },
    card: { caps: ['themed card cap'] },
  });

  it('generates a fresh slug + serial to avoid colliding with the source', () => {
    const row = _buildShipBlueprintRow(baseForm(), USER, foreign());
    expect(row.slug).not.toBe('catalog-ship');
    expect(row.slug).toMatch(/^acme-ops-cruiser-/);
    expect(row.serial_key).not.toBe('CAT-001');
    expect(row.serial_key).toMatch(/^USER-/);
  });

  it('reassigns the creator but carries the source config + themed caps forward', () => {
    const row = _buildShipBlueprintRow(baseForm(), USER, foreign());
    expect(row.creator_id).toBe('user-123');
    expect(row.config.ship_system_prompt).toBe('CATALOG PROMPT');
    expect(row.config.caps).toEqual(['themed cap']); // existing themed caps still win on fork
  });
});

describe('SpaceshipBuilderView._buildShipBlueprintRow — caps precedence', () => {
  it('falls back to the form caps when the existing caps are an empty array', () => {
    const existing = { creator_id: 'user-123', config: { caps: [] }, card: { caps: [] } };
    const row = _buildShipBlueprintRow(baseForm(), USER, existing);
    expect(row.config.caps).toEqual(['3 agent slots']);
    expect(row.card.caps).toEqual(['3 agent slots']);
  });

  it('uses the existing caps when they are non-empty, ignoring the form caps', () => {
    const existing = { creator_id: 'user-123', config: { caps: ['real cap'] }, card: { caps: ['real card cap'] } };
    const row = _buildShipBlueprintRow(baseForm(), USER, existing);
    expect(row.config.caps).toEqual(['real cap']);
    expect(row.card.caps).toEqual(['real card cap']);
  });
});
