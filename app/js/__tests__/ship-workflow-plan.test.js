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
const eff = SpaceshipDetailView.effectiveWorkflows;
const isCustom = SpaceshipDetailView.isWorkflowsCustomized;
const buildCron = SpaceshipDetailView.buildCron;
const describeSchedule = SpaceshipDetailView.describeSchedule;

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

describe('SpaceshipDetailView.effectiveWorkflows', () => {
  const bp = { workflows: [{ title: 'Catalog A', steps: [] }] };

  it('returns the catalog blueprint workflows when no override exists', () => {
    expect(eff({ config: {} }, bp)).toBe(bp.workflows);
    expect(eff({}, bp)).toBe(bp.workflows);
    expect(eff(null, bp)).toBe(bp.workflows);
  });

  it('prefers a persisted override array on the user ship', () => {
    const override = [{ title: 'Mine', steps: [] }];
    expect(eff({ config: { workflows: override } }, bp)).toBe(override);
  });

  it('treats an empty override array as authoritative (user deleted all)', () => {
    expect(eff({ config: { workflows: [] } }, bp)).toEqual([]);
  });

  it('returns [] when neither override nor catalog has a workflows array', () => {
    expect(eff({ config: {} }, null)).toEqual([]);
    expect(eff({ config: {} }, { workflows: 'nope' })).toEqual([]);
    expect(eff({ config: { workflows: 'nope' } }, bp)).toBe(bp.workflows);
  });
});

describe('SpaceshipDetailView.isWorkflowsCustomized', () => {
  it('is true only when an override array is present', () => {
    expect(isCustom({ config: { workflows: [] } })).toBe(true);
    expect(isCustom({ config: { workflows: [{ title: 'x' }] } })).toBe(true);
  });

  it('is false without an override array', () => {
    expect(isCustom({ config: {} })).toBe(false);
    expect(isCustom({})).toBe(false);
    expect(isCustom(null)).toBe(false);
    expect(isCustom({ config: { workflows: 'x' } })).toBe(false);
  });
});

describe('SpaceshipDetailView.buildCron', () => {
  it('builds an hourly cron at a given minute (hour/dom/dow ignored)', () => {
    expect(buildCron({ freq: 'hourly', minute: 15 })).toBe('15 * * * *');
  });

  it('builds a daily cron at hour:minute', () => {
    expect(buildCron({ freq: 'daily', minute: 30, hour: 9 })).toBe('30 9 * * *');
  });

  it('builds a weekly cron on a day-of-week', () => {
    expect(buildCron({ freq: 'weekly', minute: 0, hour: 8, dow: 1 })).toBe('0 8 * * 1');
  });

  it('builds a monthly cron on a day-of-month', () => {
    expect(buildCron({ freq: 'monthly', minute: 0, hour: 6, dom: 15 })).toBe('0 6 15 * *');
  });

  it('passes a trimmed custom cron through verbatim', () => {
    expect(buildCron({ freq: 'custom', cron: '  0 9 * * 1-5 ' })).toBe('0 9 * * 1-5');
  });

  it('defaults to daily and clamps out-of-range fields', () => {
    expect(buildCron({})).toBe('0 9 * * *');
    expect(buildCron({ freq: 'daily', minute: 99, hour: 99 })).toBe('59 23 * * *');
    expect(buildCron({ freq: 'weekly', minute: -5, hour: -1, dow: 9 })).toBe('0 0 * * 6');
    expect(buildCron({ freq: 'monthly', dom: 99 })).toBe('0 9 28 * *');
  });
});

describe('SpaceshipDetailView.describeSchedule', () => {
  it('labels each frequency with the time and timezone', () => {
    expect(describeSchedule({ freq: 'hourly', minute: 5 })).toBe('Hourly at :05');
    expect(describeSchedule({ freq: 'daily', minute: 0, hour: 9 }, 'America/Los_Angeles'))
      .toBe('Daily at 09:00 America/Los_Angeles');
    expect(describeSchedule({ freq: 'weekly', minute: 0, hour: 8, dow: 1 }, 'UTC'))
      .toBe('Weekly on Monday at 08:00 UTC');
    expect(describeSchedule({ freq: 'monthly', minute: 0, hour: 6, dom: 15 }))
      .toBe('Monthly on day 15 at 06:00');
    expect(describeSchedule({ freq: 'custom', cron: '0 9 * * 1-5' }))
      .toBe('Custom (0 9 * * 1-5)');
  });
});
