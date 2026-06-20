/**
 * AgentBuilderView serialization tests — the load-bearing path that turns the
 * authoring form into an `agent_blueprints` row on INSERT / UPDATE / FORK. The
 * branching here is subtle and silent when wrong (fork-vs-update identity, role
 * slug validation against the Roles SSOT, config/card overlay), so it's worth
 * pinning even though the view itself is a god-file.
 *
 * Exercises the pure helpers via the test seam on AgentBuilderView's public API
 * (`_buildBlueprintRow` / `_kebab` / `_resolveRoleSlug` / `_roleLabel`) plus the
 * file-scope LLM_PROVIDERS / LLM_MODELS derivation, which runs at load time from
 * VaultView.MODEL_CATALOG — so a fake catalog is stood up before the view loads.
 *
 * Utils + State come from setup.js; Roles is loaded here (SEED hydrates its
 * vocabulary synchronously, so role validation works without init()).
 */

import { describe, it, expect } from 'vitest';

const { readFileSync } = await import('fs');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
const __dir = dirname(fileURLToPath(import.meta.url));

function evalAsGlobals(rel) {
  const code = readFileSync(resolve(__dir, rel), 'utf-8')
    .replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

// Real role vocabulary — _buildBlueprintRow validates form.role against it.
evalAsGlobals('../lib/roles.js');

// LLM_PROVIDERS / LLM_MODELS derive from VaultView.MODEL_CATALOG at load time;
// stand up a small deterministic catalog before loading the view. m2 omits
// audio/video on purpose to exercise the strict `=== true` flag coercion.
const FAKE_CATALOG = [
  { id: 'm1', name: 'Model One',   provider: 'Acme',        icon: 'star', vision: true,  pdf: false, audio: false, video: false },
  { id: 'm2', name: 'Model Two',   provider: 'Acme',        icon: 'bolt', vision: false, pdf: true },
  { id: 'm3', name: 'Model Three', provider: 'Globex Corp', icon: 'moon', vision: true,  pdf: true,  audio: true,  video: true  },
];
globalThis.VaultView = { MODEL_CATALOG: FAKE_CATALOG };

evalAsGlobals('../views/agent-builder.js');
const { _buildBlueprintRow, _kebab, _resolveRoleSlug, _roleLabel } = AgentBuilderView;

const USER = { id: 'user-123' };
// Canonical form shape (a known role slug, all the common config fields).
const baseForm = () => ({
  name: 'Sales Hunter',
  description: 'Closes deals',
  instructions: 'Be persuasive',
  type: 'Specialist',
  tools: ['email'],
  memory: true,
  temperature: 0.7,
  llm_engine: 'gpt-5-mini',
  role: 'sales',
  rarity: 'rare',
  skills: ['negotiation'],
  tags: ['outbound'],
});

describe('AgentBuilderView._kebab', () => {
  it('slugifies a display name', () => {
    expect(_kebab('Sales Hunter')).toBe('sales-hunter');
  });
  it('collapses runs of non-alphanumerics and trims the edges', () => {
    expect(_kebab('  Front/Desk  Coordinator!! ')).toBe('front-desk-coordinator');
  });
  it('caps the slug at 40 characters', () => {
    expect(_kebab('a'.repeat(60))).toBe('a'.repeat(40));
  });
  it('falls back to "agent" for empty, null, or punctuation-only input', () => {
    expect(_kebab('')).toBe('agent');
    expect(_kebab(null)).toBe('agent');
    expect(_kebab('!!!')).toBe('agent');
  });
});

describe('AgentBuilderView._roleLabel', () => {
  it('returns the catalog label for a known slug', () => {
    expect(_roleLabel('sales')).toBe('Sales');
    expect(_roleLabel('engineering')).toBe('Engineering');
  });
  it('returns the raw input for an unknown slug (legacy preservation)', () => {
    expect(_roleLabel('legacy-role')).toBe('legacy-role');
  });
  it('returns empty string for empty input', () => {
    expect(_roleLabel('')).toBe('');
  });
});

describe('AgentBuilderView._resolveRoleSlug', () => {
  it('passes a known slug straight through', () => {
    expect(_resolveRoleSlug('engineering')).toBe('engineering');
  });
  it('maps a display label to its slug (case-insensitive)', () => {
    expect(_resolveRoleSlug('Engineering')).toBe('engineering');
    expect(_resolveRoleSlug('customer success')).toBe('customer_success');
  });
  it('returns null for an unknown value and for empty input', () => {
    expect(_resolveRoleSlug('not-a-role')).toBeNull();
    expect(_resolveRoleSlug('')).toBeNull();
  });
});

describe('AgentBuilderView._buildBlueprintRow — new agent (INSERT)', () => {
  it('stamps community scope, private visibility, and the current user as creator', () => {
    const row = _buildBlueprintRow(baseForm(), USER, null);
    expect(row.scope).toBe('community');
    expect(row.visibility).toBe('private');
    expect(row.creator_id).toBe('user-123');
  });

  it('maps the form fields onto the row + config + card', () => {
    const row = _buildBlueprintRow(baseForm(), USER, null);
    expect(row.name).toBe('Sales Hunter');
    expect(row.description).toBe('Closes deals');
    expect(row.flavor).toBe('Be persuasive');     // instructions → flavor
    expect(row.rarity).toBe('rare');
    expect(row.config.type).toBe('Specialist');
    expect(row.config.tools).toEqual(['email']);
    expect(row.config.temperature).toBe(0.7);
    expect(row.config.llm_engine).toBe('gpt-5-mini');
    expect(row.card.caps).toEqual(['negotiation']); // skills → card.caps
    expect(row.tags).toEqual(['outbound']);
  });

  it('validates a known role into role_type + category', () => {
    const row = _buildBlueprintRow(baseForm(), USER, null);
    expect(row.role_type).toBe('sales');
    expect(row.category).toBe('Sales');
  });

  it('generates a fresh slug from the name and a USER- serial key', () => {
    const row = _buildBlueprintRow(baseForm(), USER, null);
    expect(row.slug).toMatch(/^sales-hunter-[a-z0-9]+$/);
    expect(row.serial_key).toMatch(/^USER-[A-Z0-9]+$/);
  });

  it('leaves capability_id null and omits optional config keys when absent', () => {
    const row = _buildBlueprintRow(baseForm(), USER, null);
    expect(row.capability_id).toBeNull();
    expect(row.config.persona).toBeUndefined();
    expect(row.config.model_profile).toBeUndefined();
    expect(row.config.output_schema).toBeUndefined();
    expect(row.config.example_io).toBeUndefined();
    expect(row.config.eval_criteria).toBeUndefined();
  });
});

describe('AgentBuilderView._buildBlueprintRow — editing an owned blueprint (UPDATE)', () => {
  const owned = () => ({
    creator_id: 'user-123', // same as USER → not a fork
    slug: 'existing-slug',
    serial_key: 'USER-OLDKEY1',
    role_type: 'engineering',
    capability_id: 'cap-42',
    category: 'Old Category',
    config: { system_prompt: 'KEEP ME', maxSteps: 5, role: 'engineering' },
    card: { art: 'art://x', caps: ['old-cap'], card_num: 7 },
    tags: ['old-tag'],
  });

  it('keeps the existing identity (slug + serial_key + capability_id)', () => {
    const row = _buildBlueprintRow(baseForm(), USER, owned());
    expect(row.slug).toBe('existing-slug');
    expect(row.serial_key).toBe('USER-OLDKEY1');
    expect(row.capability_id).toBe('cap-42');
  });

  it('overlays form config on top of the existing config, keeping fields the form cannot express', () => {
    const row = _buildBlueprintRow(baseForm(), USER, owned());
    expect(row.config.system_prompt).toBe('KEEP ME'); // preserved
    expect(row.config.maxSteps).toBe(5);              // preserved
    expect(row.config.type).toBe('Specialist');       // form overlay wins
    expect(row.config.temperature).toBe(0.7);
  });

  it('overlays form skills on the existing card, preserving art + card_num', () => {
    const row = _buildBlueprintRow(baseForm(), USER, owned());
    expect(row.card.art).toBe('art://x');
    expect(row.card.card_num).toBe(7);
    expect(row.card.caps).toEqual(['negotiation']); // form.skills override
  });

  it('inherits caps + tags when the form leaves them empty', () => {
    const form = { ...baseForm(), skills: [], tags: [] };
    const row = _buildBlueprintRow(form, USER, owned());
    expect(row.card.caps).toEqual(['old-cap']);
    expect(row.tags).toEqual(['old-tag']);
  });
});

describe('AgentBuilderView._buildBlueprintRow — forking another user\'s blueprint', () => {
  const foreign = () => ({
    creator_id: 'someone-else', // different from USER → fork
    slug: 'catalog-slug',
    serial_key: 'CAT-XYZ',
    role_type: 'engineering',
    config: { system_prompt: 'CATALOG PROMPT' },
    card: { caps: ['cat-cap'] },
  });

  it('generates a fresh slug + serial to avoid colliding with the source', () => {
    const row = _buildBlueprintRow(baseForm(), USER, foreign());
    expect(row.slug).not.toBe('catalog-slug');
    expect(row.slug).toMatch(/^sales-hunter-/);
    expect(row.serial_key).not.toBe('CAT-XYZ');
    expect(row.serial_key).toMatch(/^USER-/);
  });

  it('reassigns the creator to the current user but still carries the source config forward', () => {
    const row = _buildBlueprintRow(baseForm(), USER, foreign());
    expect(row.creator_id).toBe('user-123');
    expect(row.config.system_prompt).toBe('CATALOG PROMPT'); // overlay keeps it
  });
});

describe('AgentBuilderView._buildBlueprintRow — role fallback', () => {
  it('defaults role_type to "operations" for an unknown role on a new agent', () => {
    const row = _buildBlueprintRow({ ...baseForm(), role: 'totally-made-up' }, USER, null);
    expect(row.role_type).toBe('operations');
  });

  it('keeps the existing role_type for an unknown role when editing', () => {
    const existing = { creator_id: 'user-123', role_type: 'engineering' };
    const row = _buildBlueprintRow({ ...baseForm(), role: 'totally-made-up' }, USER, existing);
    expect(row.role_type).toBe('engineering');
  });

  it('preserves an unknown role string as the category (current behavior)', () => {
    const row = _buildBlueprintRow({ ...baseForm(), role: 'Growth Hacker' }, USER, null);
    expect(row.category).toBe('Growth Hacker');
  });
});

describe('AgentBuilderView._buildBlueprintRow — optional config keys', () => {
  it('includes persona / model_profile / output_schema when present', () => {
    const form = {
      ...baseForm(),
      persona: 'pirate',
      model_profile: { reasoning: 'high' },
      output_schema: { type: 'object' },
    };
    const row = _buildBlueprintRow(form, USER, null);
    expect(row.config.persona).toBe('pirate');
    expect(row.config.model_profile).toEqual({ reasoning: 'high' });
    expect(row.config.output_schema).toEqual({ type: 'object' });
  });

  it('includes example_io / eval_criteria only when non-empty', () => {
    const withRows = _buildBlueprintRow(
      { ...baseForm(), example_io: [{ input: 'a', output: 'b' }], eval_criteria: ['accurate'] },
      USER, null,
    );
    expect(withRows.config.example_io).toHaveLength(1);
    expect(withRows.config.eval_criteria).toEqual(['accurate']);

    const empty = _buildBlueprintRow({ ...baseForm(), example_io: [], eval_criteria: [] }, USER, null);
    expect(empty.config.example_io).toBeUndefined();
    expect(empty.config.eval_criteria).toBeUndefined();
  });
});

describe('LLM registry derivation from MODEL_CATALOG', () => {
  it('derives one provider per unique provider, id lowercased + despaced, icon from its first model', () => {
    expect(LLM_PROVIDERS).toHaveLength(2);
    const acme = LLM_PROVIDERS.find(p => p.name === 'Acme');
    expect(acme.id).toBe('acme');
    expect(acme.icon).toBe('star'); // first Acme model
    const globex = LLM_PROVIDERS.find(p => p.name === 'Globex Corp');
    expect(globex.id).toBe('globexcorp');
  });

  it('derives one model per catalog entry with mapped label/provider', () => {
    expect(LLM_MODELS).toHaveLength(3);
    const m2 = LLM_MODELS.find(m => m.id === 'm2');
    expect(m2.label).toBe('Model Two');
    expect(m2.provider).toBe('acme');
  });

  it('coerces capability flags with strict === true (omitted flags become false)', () => {
    const m2 = LLM_MODELS.find(m => m.id === 'm2');
    expect(m2.vision).toBe(false);
    expect(m2.pdf).toBe(true);
    expect(m2.audio).toBe(false); // omitted in the catalog → false, not undefined
    expect(m2.video).toBe(false);
    const m3 = LLM_MODELS.find(m => m.id === 'm3');
    expect(m3.vision && m3.pdf && m3.audio && m3.video).toBe(true);
  });
});
