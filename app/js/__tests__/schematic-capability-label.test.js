import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadModule(rel) {
  let code = readFileSync(resolve(__dir, '..', rel), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

// Minimal globals so schematic.js's IIFE doesn't throw on load. The view's
// render/destroy paths need a whole DOM environment to test, but
// _capabilityLabel is pure — only Blueprints (optional) is consulted.
globalThis.Utils = { esc: (s) => String(s ?? '') };
globalThis.Blueprints = {
  getCapability: () => null,    // strict; character-kind umbrellas return null
  getAgent: () => null,
};
globalThis.CoreReactor = { setVisible: () => {} };

loadModule('views/schematic.js');

const fn = SchematicView._capabilityLabel;

describe('schematic _capabilityLabel', () => {
  beforeEach(() => {
    // Reset to safe defaults; each test that needs umbrella resolution
    // overrides getAgent / getCapability inline.
    Blueprints.getCapability = () => null;
    Blueprints.getAgent = () => null;
  });

  describe('explicit config.tools (legacy path)', () => {
    it('matches a recognised prefix and returns the brand', () => {
      expect(fn({ config: { tools: ['hubspot_search_companies'] } })).toBe('HubSpot');
      expect(fn({ config: { tools: ['linear_create_issue'] } })).toBe('Linear');
      expect(fn({ config: { tools: ['gmail_send'] } })).toBe('Google Workspace');
    });

    it('returns null for a blueprint with no tools and no capability_id', () => {
      expect(fn({ config: { tools: [] } })).toBe(null);
      expect(fn({ config: {} })).toBe(null);
      expect(fn(null)).toBe(null);
    });

    it('falls back to config.type or config.role when prefix-matching misses', () => {
      expect(fn({ config: { tools: ['mystery_tool'], type: 'Researcher' } })).toBe('Researcher');
      expect(fn({ config: { tools: ['mystery_tool'], role: 'Strategist' } })).toBe('Strategist');
    });
  });

  // 2026-05-15: slot agents auto-created by ship-setup-wizard (per #512)
  // carry config.capability_id instead of an explicit config.tools array.
  // Before this fix the schematic always rendered them as "No live tools"
  // even though the chat had full tool access via the umbrella's tools.
  describe('capability_id resolution (#512 slot agents)', () => {
    it('resolves tools from the umbrella when config.tools is empty', () => {
      // GitHub Agent umbrella's tools have no provider prefix
      // (search_code, search_issues, ...) — falls through to umbrella name.
      Blueprints.getAgent = (id) => id === 'cap-github' ? {
        name: 'GitHub Agent',
        config: { tools: ['search_code', 'search_issues', 'search_pull_requests'] },
      } : null;
      const slotAgent = { config: { capability_id: 'cap-github' } };
      expect(fn(slotAgent)).toBe('GitHub');
    });

    it('strips the trailing " Agent" suffix from the umbrella name', () => {
      Blueprints.getAgent = () => ({ name: 'Notion Agent', config: { tools: ['unknown_tool'] } });
      expect(fn({ config: { capability_id: 'cap-x' } })).toBe('Notion');
    });

    it('prefers a matched tool prefix when the umbrella tools have one', () => {
      // HubSpot Agent's tools are namespaced (hubspot_*) — prefix wins
      // over the umbrella-name fallback.
      Blueprints.getAgent = () => ({ name: 'HubSpot Agent', config: { tools: ['hubspot_search_companies'] } });
      expect(fn({ config: { capability_id: 'cap-hub' } })).toBe('HubSpot');
    });

    it('tries getCapability first, falls through to getAgent (strict-then-loose)', () => {
      let capCalls = 0, agentCalls = 0;
      Blueprints.getCapability = (id) => { capCalls++; return null; };
      Blueprints.getAgent = (id) => { agentCalls++; return { name: 'Slack Agent', config: { tools: ['slack_post_message'] } }; };
      const result = fn({ config: { capability_id: 'cap-slack' } });
      expect(result).toBe('Slack');
      expect(capCalls).toBe(1);
      expect(agentCalls).toBe(1);
    });

    it('returns null when capability_id points at nothing resolvable', () => {
      Blueprints.getCapability = () => null;
      Blueprints.getAgent = () => null;
      expect(fn({ config: { capability_id: 'cap-missing' } })).toBe(null);
    });

    it('explicit config.tools still wins over capability_id resolution', () => {
      // A blueprint with both should use its own tools rather than the
      // umbrella's — preserves intentional overrides.
      Blueprints.getAgent = () => ({ name: 'GitHub Agent', config: { tools: ['search_code'] } });
      const bp = { config: { capability_id: 'cap-github', tools: ['hubspot_search_companies'] } };
      expect(fn(bp)).toBe('HubSpot');
    });
  });
});
