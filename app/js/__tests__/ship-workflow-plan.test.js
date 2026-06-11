/**
 * SpaceshipDetailView.buildPlanFromShipWorkflow — translate a branded ship
 * workflow ({ title, steps:[{ step, agent_slot }] }) into an executable
 * mission plan ({ shape:'dag', nodes, edges }). Pure: only its args matter.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// The view only touches Utils at module-load; everything else is inside
// functions we never call here. Stub Utils and eval the file (same trick as
// cost-by-mission.test.js).
globalThis.Utils = { esc: (s) => String(s == null ? '' : s), KEYS: { shipProfiles: 'ns-ship-profiles' } };

(function loadModule() {
  let code = readFileSync(resolve(__dir, '..', 'views', 'spaceships.js'), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
})();

const build = SpaceshipDetailView.buildPlanFromShipWorkflow;

describe('SpaceshipDetailView.buildPlanFromShipWorkflow', () => {
  it('maps steps to a linear DAG of agent nodes, resolving 1-indexed slots', () => {
    const wf = { title: 'Quote to booking', steps: [
      { step: 'Capture the lead', agent_slot: 1 },
      { step: 'Price the scope', agent_slot: 3 },
    ] };
    const slots = { 0: 'agent-cap', 1: 'agent-x', 2: 'agent-y' };

    const plan = build(wf, slots);

    expect(plan.shape).toBe('dag');
    expect(plan.nodes).toEqual([
      { id: 'step-0', type: 'agent', label: 'Capture the lead', config: { agentId: 'agent-cap', prompt: 'Capture the lead' } },
      { id: 'step-1', type: 'agent', label: 'Price the scope', config: { agentId: 'agent-y', prompt: 'Price the scope' } },
    ]);
    // agent_slot 1 → slots[0]; agent_slot 3 → slots[2]
    expect(plan.edges).toEqual([{ from: 'step-0', to: 'step-1' }]);
  });

  it('falls back to the captain (lowest filled slot) when a slot is empty/locked', () => {
    const wf = { title: 'T', steps: [{ step: 'Do it', agent_slot: 5 }] };
    const slots = { 0: 'agent-cap', 1: 'agent-x' }; // slot 4 (agent_slot 5) empty

    const plan = build(wf, slots);

    expect(plan.nodes[0].config.agentId).toBe('agent-cap');
  });

  it('treats bare-string steps as captain-run with the string as the prompt', () => {
    const wf = { title: 'T', steps: ['Sweep the web'] };
    const slots = { 2: 'agent-z' }; // only slot 2 filled → captain

    const plan = build(wf, slots);

    expect(plan.nodes[0]).toEqual({
      id: 'step-0', type: 'agent', label: 'Sweep the web',
      config: { agentId: 'agent-z', prompt: 'Sweep the web' },
    });
  });

  it('chains edges linearly (n-1 edges for n steps)', () => {
    const wf = { title: 'T', steps: [{ step: 'a', agent_slot: 1 }, { step: 'b', agent_slot: 1 }, { step: 'c', agent_slot: 1 }] };
    const plan = build(wf, { 0: 'cap' });
    expect(plan.edges).toEqual([
      { from: 'step-0', to: 'step-1' },
      { from: 'step-1', to: 'step-2' },
    ]);
  });

  it('returns an empty DAG for a workflow with no steps', () => {
    expect(build({ title: 'T', steps: [] }, { 0: 'cap' })).toEqual({ shape: 'dag', nodes: [], edges: [] });
    expect(build({}, {})).toEqual({ shape: 'dag', nodes: [], edges: [] });
  });

  it('leaves agentId null when the ship has no crew at all (handler guards the run)', () => {
    const plan = build({ title: 'T', steps: [{ step: 'a', agent_slot: 1 }] }, {});
    expect(plan.nodes[0].config.agentId).toBeNull();
  });
});
