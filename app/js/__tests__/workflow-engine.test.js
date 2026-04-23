import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));

function loadLibGlobal(relativePath) {
  const absPath = resolve(__dirname_local, '..', relativePath);
  let code = readFileSync(absPath, 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

loadLibGlobal('lib/workflow-engine.js');

// WorkflowEngine.execute() calls ShipLog.execute for agent nodes. Stub
// it to return a predictable payload without hitting the real pipeline.
beforeEach(() => {
  globalThis.ShipLog = {
    execute: async (shipId, agent, prompt) => ({ content: `ran:${agent?.name || 'noop'}:${(prompt || '').slice(0, 20)}` }),
  };
  globalThis.Blueprints = {
    getAgent: (id) => ({ id, name: id, config: {} }),
  };
  globalThis.State.set('agents', []);
  globalThis.State.set('spaceships', []);
});

describe('WorkflowEngine — approval_gate', () => {
  it('produces a pause sentinel without touching downstream nodes', async () => {
    const workflow = {
      id: 'wf-1',
      name: 'test',
      nodes: [
        { id: 'a', type: 'agent', config: { prompt: 'do thing' } },
        { id: 'gate', type: 'approval_gate', config: { reason: 'Review please' } },
        { id: 'b', type: 'agent', config: { prompt: 'after gate' } },
      ],
      connections: [
        { from: 'a', to: 'gate' },
        { from: 'gate', to: 'b' },
      ],
    };

    const completed = [];
    let gated = null;

    const res = await WorkflowEngine.execute(workflow, {
      skipSave: true,
      onNodeComplete: (node) => completed.push(node.id),
      onGatePause: (node, payload) => { gated = { id: node.id, payload }; },
    });

    expect(res.status).toBe('paused');
    expect(res.pausedAt).toBe('gate');
    expect(gated?.id).toBe('gate');
    expect(gated?.payload?.__nice_workflow_pause).toBe(true);
    // Gate node is in completed (we do call onNodeComplete once the
    // sentinel is stored), but the downstream `b` is not.
    expect(completed).toContain('gate');
    expect(completed).not.toContain('b');
    expect(res.nodeResults.has('b')).toBe(false);
    // Gate uses upstream output as its review summary.
    expect(String(res.nodeResults.get('gate'))).toMatch(/ran:/);
  });

  it('when gate is terminal, finalOutput is the review summary', async () => {
    const workflow = {
      id: 'wf-2',
      nodes: [
        { id: 'draft', type: 'agent', config: { prompt: 'draft replies' } },
        { id: 'review', type: 'approval_gate', config: { reason: 'Approve drafts' } },
      ],
      connections: [{ from: 'draft', to: 'review' }],
    };
    const res = await WorkflowEngine.execute(workflow, { skipSave: true });
    expect(res.status).toBe('paused');
    expect(res.finalOutput).toMatch(/ran:/);
  });

  it('_executeApprovalGate falls back to reason when there is no upstream', () => {
    const out = WorkflowEngine._executeApprovalGate({ config: { reason: 'Awaiting captain.' } }, '');
    expect(out.__nice_workflow_pause).toBe(true);
    expect(out.summary).toBe('Awaiting captain.');
  });

  it('_isGatePause only matches sentinel-shaped objects', () => {
    expect(WorkflowEngine._isGatePause({ __nice_workflow_pause: true })).toBe(true);
    expect(WorkflowEngine._isGatePause({})).toBe(false);
    expect(WorkflowEngine._isGatePause('paused')).toBe(false);
    expect(WorkflowEngine._isGatePause(null)).toBe(false);
  });
});

describe('WorkflowEngine — persona_dispatch', () => {
  beforeEach(() => {
    // Fresh ShipLog stub that echoes the prompt back so we can assert
    // voice injection.
    globalThis.ShipLog = {
      execute: async (shipId, agent, prompt) => ({ content: prompt }),
    };
    try { localStorage.removeItem('nice-voice-sample'); } catch {}
  });

  it('runs as a plain agent when no voice sample is set', async () => {
    const workflow = {
      id: 'wf-p-empty',
      nodes: [{ id: 'n', type: 'persona_dispatch', config: { blueprintId: 'bp-x', prompt: 'draft replies', personaHint: 'user_voice' } }],
      connections: [],
    };
    const res = await WorkflowEngine.execute(workflow, { skipSave: true });
    expect(res.status).toBe('completed');
    expect(String(res.nodeResults.get('n'))).not.toMatch(/VOICE REFERENCE/);
    expect(String(res.nodeResults.get('n'))).toMatch(/draft replies/);
  });

  it('prepends VOICE REFERENCE when user_voice and sample is set', async () => {
    localStorage.setItem('nice-voice-sample', 'short and direct. lowercase sometimes. no corporate filler.');
    const workflow = {
      id: 'wf-p-voice',
      nodes: [{ id: 'n', type: 'persona_dispatch', config: { prompt: 'draft replies', personaHint: 'user_voice' } }],
      connections: [],
    };
    const res = await WorkflowEngine.execute(workflow, { skipSave: true });
    const out = String(res.nodeResults.get('n'));
    expect(out).toMatch(/VOICE REFERENCE/);
    expect(out).toMatch(/short and direct/);
    expect(out).toMatch(/draft replies/);
  });

  it('_resolvePersonaContext handles theme_persona hint without crashing', () => {
    const out = WorkflowEngine._resolvePersonaContext('theme_persona', {});
    expect(out).toMatch(/theme_id=/);
  });

  it('_resolvePersonaContext treats long inline hints as PERSONA BRIEF', () => {
    const hint = 'Write like the CEO — blunt, fewer than 30 words, no exclamation marks, and always close with a single concrete next step.';
    const out = WorkflowEngine._resolvePersonaContext(hint, {});
    expect(out).toMatch(/PERSONA BRIEF:/);
    expect(out).toMatch(/Write like the CEO/);
  });

  it('_resolvePersonaContext returns empty when no hint is provided', () => {
    expect(WorkflowEngine._resolvePersonaContext('', {})).toBe('');
    expect(WorkflowEngine._resolvePersonaContext(null, {})).toBe('');
  });

  it('does not mutate the node config when injecting voice context', async () => {
    localStorage.setItem('nice-voice-sample', 'quick and direct');
    const node = { id: 'n', type: 'persona_dispatch', config: { prompt: 'draft', personaHint: 'user_voice' } };
    await WorkflowEngine._executePersonaDispatch(node, '');
    expect(node.config.prompt).toBe('draft');
    expect(node.config.personaHint).toBe('user_voice');
  });
});

describe('WorkflowEngine — notify', () => {
  beforeEach(() => {
    globalThis.Notify = { send: (opts) => { globalThis.__lastNotify = opts; } };
    globalThis.__lastNotify = null;
    globalThis.State.set('user', { id: 'u-1' });
    globalThis.__createdNotifications = [];
    globalThis.SB = {
      isReady: () => true,
      db: (table) => ({
        create: async (row) => {
          if (table === 'notifications') globalThis.__createdNotifications.push(row);
          return Object.assign({ id: 'n-1' }, row);
        },
      }),
    };
  });

  it('emits a Notify toast with the configured title + message', async () => {
    const node = { id: 'n', type: 'notify', config: { title: 'Done', message: 'All good', kind: 'success' } };
    const out = await WorkflowEngine._executeNotify(node, '');
    expect(globalThis.__lastNotify.title).toBe('Done');
    expect(globalThis.__lastNotify.message).toBe('All good');
    expect(globalThis.__lastNotify.type).toBe('success');
    expect(out).toMatch(/Notified/);
  });

  it('falls back to upstream input when message is omitted', async () => {
    const node = { id: 'n', type: 'notify', config: { title: 'Handoff' } };
    await WorkflowEngine._executeNotify(node, 'Triage complete — 12 threads.');
    expect(globalThis.__lastNotify.message).toBe('Triage complete — 12 threads.');
  });

  it('persists to the notifications table when a user is signed in', async () => {
    const node = { id: 'n', type: 'notify', config: { title: 'Ping' } };
    await WorkflowEngine._executeNotify(node, 'hello');
    expect(globalThis.__createdNotifications.length).toBe(1);
    expect(globalThis.__createdNotifications[0].user_id).toBe('u-1');
    expect(globalThis.__createdNotifications[0].title).toBe('Ping');
  });

  it('truncates very long messages', async () => {
    const big = 'x'.repeat(500);
    const node = { id: 'n', type: 'notify', config: { title: 'Big' } };
    await WorkflowEngine._executeNotify(node, big);
    expect(globalThis.__lastNotify.message.length).toBeLessThanOrEqual(241);
    expect(globalThis.__lastNotify.message.endsWith('…')).toBe(true);
  });
});

describe('WorkflowEngine — agent blueprintId resolution', () => {
  it('falls back to State.agents matching blueprint_id', async () => {
    globalThis.State.set('agents', [{ id: 'u-1', name: 'live-agent', blueprint_id: 'bp-agent-xyz', config: {} }]);
    const workflow = {
      id: 'wf-b',
      nodes: [{ id: 'n', type: 'agent', config: { blueprintId: 'bp-agent-xyz', prompt: 'go' } }],
      connections: [],
    };
    const res = await WorkflowEngine.execute(workflow, { skipSave: true });
    expect(String(res.nodeResults.get('n'))).toMatch(/ran:live-agent/);
  });

  it('falls back to Blueprints.getAgent when no live agent is present', async () => {
    globalThis.State.set('agents', []);
    const workflow = {
      id: 'wf-b2',
      nodes: [{ id: 'n', type: 'agent', config: { blueprintId: 'bp-agent-inbox-drafter', prompt: 'go' } }],
      connections: [],
    };
    const res = await WorkflowEngine.execute(workflow, { skipSave: true });
    expect(String(res.nodeResults.get('n'))).toMatch(/ran:bp-agent-inbox-drafter/);
  });
});

describe('WorkflowEngine — tool dispatch via AgentExecutor', () => {
  // When an agent has config.tools (or any MCP connection is active),
  // the engine must route through AgentExecutor — otherwise ShipLog
  // single-shot calls the LLM, which sees tool names in the system
  // prompt and role-plays the interaction instead of invoking them.
  let _execSpy;

  beforeEach(() => {
    _execSpy = { calls: [] };
    globalThis.AgentExecutor = {
      execute: async (agent, prompt, opts) => {
        _execSpy.calls.push({ agent, prompt, opts });
        return { finalAnswer: `executor:${agent?.name || 'anon'}`, steps: [], metadata: {} };
      },
    };
  });

  it('routes through AgentExecutor when agent.config.tools is non-empty', async () => {
    globalThis.State.set('agents', [{ id: 'u1', name: 'Inbox Captain', blueprint_id: 'bp-agent-inbox-captain', config: { tools: ['gmail_create_draft'] } }]);
    const workflow = {
      id: 'wf-tools',
      nodes: [{ id: 'n', type: 'agent', config: { blueprintId: 'bp-agent-inbox-captain', prompt: 'triage + draft' } }],
      connections: [],
    };
    const res = await WorkflowEngine.execute(workflow, { skipSave: true });
    expect(res.status).toBe('completed');
    expect(_execSpy.calls.length).toBe(1);
    expect(_execSpy.calls[0].opts.tools).toEqual(['gmail_create_draft']);
    expect(String(res.nodeResults.get('n'))).toBe('executor:Inbox Captain');
  });

  it('routes through AgentExecutor when any MCP connection is active, even with no explicit tool list', async () => {
    globalThis.State.set('agents', [{ id: 'u1', name: 'Bare', blueprint_id: 'bp-x', config: {} }]);
    globalThis.State.set('mcp_connections', [{ id: 'mc1', name: 'Gmail', status: 'connected' }]);
    const workflow = {
      id: 'wf-mcp',
      nodes: [{ id: 'n', type: 'agent', config: { blueprintId: 'bp-x', prompt: 'go' } }],
      connections: [],
    };
    const res = await WorkflowEngine.execute(workflow, { skipSave: true });
    expect(res.status).toBe('completed');
    expect(_execSpy.calls.length).toBe(1);
    expect(String(res.nodeResults.get('n'))).toBe('executor:Bare');
  });

  it('falls back to ShipLog when the agent has no tools and no MCP connection', async () => {
    globalThis.State.set('agents', [{ id: 'u1', name: 'NoTools', blueprint_id: 'bp-y', config: {} }]);
    globalThis.State.set('mcp_connections', []);
    const workflow = {
      id: 'wf-notools',
      nodes: [{ id: 'n', type: 'agent', config: { blueprintId: 'bp-y', prompt: 'just chat' } }],
      connections: [],
    };
    const res = await WorkflowEngine.execute(workflow, { skipSave: true });
    expect(_execSpy.calls.length).toBe(0);
    expect(String(res.nodeResults.get('n'))).toMatch(/^ran:NoTools/);
  });

  it('_agentHasTools true for explicit tool list', () => {
    expect(WorkflowEngine._agentHasTools({ config: { tools: ['gmail_create_draft'] } })).toBe(true);
  });
  it('_agentHasTools true when any mcp_connections row is connected', () => {
    globalThis.State.set('mcp_connections', [{ status: 'connected' }]);
    expect(WorkflowEngine._agentHasTools({ config: {} })).toBe(true);
  });
  it('_agentHasTools false with no tools and no connected MCPs', () => {
    globalThis.State.set('mcp_connections', [{ status: 'disconnected' }]);
    expect(WorkflowEngine._agentHasTools({ config: {} })).toBe(false);
    expect(WorkflowEngine._agentHasTools(null)).toBe(false);
  });

  it('surfaces an Error: result when AgentExecutor throws', async () => {
    globalThis.AgentExecutor.execute = async () => { throw new Error('boom'); };
    globalThis.State.set('agents', [{ id: 'u1', name: 'F', blueprint_id: 'bp-f', config: { tools: ['x'] } }]);
    const workflow = {
      id: 'wf-throw',
      nodes: [{ id: 'n', type: 'agent', config: { blueprintId: 'bp-f', prompt: 'p' } }],
      connections: [],
    };
    const res = await WorkflowEngine.execute(workflow, { skipSave: true });
    expect(String(res.nodeResults.get('n'))).toMatch(/^Error:/);
  });
});

describe('WorkflowEngine — mission scope routing', () => {
  // PR #246 added ship_log.mission_id; this guards the AgentExecutor
  // hand-off so log entries from a DAG mission run actually land under
  // the mission instead of a random spaceship's log.
  const UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  it('_resolveSpaceshipId mints mission-<uuid> when workflow.id is a UUID', () => {
    expect(WorkflowEngine._resolveSpaceshipId({ id: UUID })).toBe('mission-' + UUID);
  });

  it('_resolveSpaceshipId rejects non-UUID workflow ids and falls back to first ship', () => {
    globalThis.State.set('spaceships', [{ id: 'ship-1' }]);
    expect(WorkflowEngine._resolveSpaceshipId({ id: 'wf-editor' })).toBe('ship-1');
    expect(WorkflowEngine._resolveSpaceshipId(null)).toBe('ship-1');
  });

  it('_resolveSpaceshipId falls through to workflow-exec sentinel when no ships exist', () => {
    globalThis.State.set('spaceships', []);
    expect(WorkflowEngine._resolveSpaceshipId({ id: 'wf-editor' })).toBe('workflow-exec');
  });

  it('passes mission-<uuid> as opts.spaceshipId when an agent node runs in a UUID-id workflow', async () => {
    const calls = [];
    globalThis.AgentExecutor = {
      execute: async (agent, prompt, opts) => {
        calls.push({ spaceshipId: opts?.spaceshipId });
        return { finalAnswer: 'done', steps: [], metadata: {} };
      },
    };
    globalThis.State.set('agents', [{ id: 'u1', name: 'C', blueprint_id: 'bp-x', config: { tools: ['gmail_create_draft'] } }]);
    const workflow = {
      id: UUID,
      nodes: [{ id: 'n', type: 'agent', config: { blueprintId: 'bp-x', prompt: 'go' } }],
      connections: [],
    };
    const res = await WorkflowEngine.execute(workflow, { skipSave: true });
    expect(res.status).toBe('completed');
    expect(calls.length).toBe(1);
    expect(calls[0].spaceshipId).toBe('mission-' + UUID);
  });

  it('passes blueprint config.maxSteps through to AgentExecutor opts', async () => {
    const calls = [];
    globalThis.AgentExecutor = {
      execute: async (agent, prompt, opts) => {
        calls.push({ maxSteps: opts?.maxSteps });
        return { finalAnswer: 'done', steps: [], metadata: {} };
      },
    };
    globalThis.State.set('agents', [{ id: 'u1', name: 'Cap', blueprint_id: 'bp-cap', config: { tools: ['t'], maxSteps: 30 } }]);
    const workflow = {
      id: UUID,
      nodes: [{ id: 'n', type: 'agent', config: { blueprintId: 'bp-cap', prompt: 'go' } }],
      connections: [],
    };
    await WorkflowEngine.execute(workflow, { skipSave: true });
    expect(calls[0].maxSteps).toBe(30);
  });

  it('omits maxSteps from opts when blueprint does not configure it', async () => {
    const calls = [];
    globalThis.AgentExecutor = {
      execute: async (agent, prompt, opts) => {
        calls.push({ maxSteps: opts?.maxSteps });
        return { finalAnswer: 'done', steps: [], metadata: {} };
      },
    };
    globalThis.State.set('agents', [{ id: 'u1', name: 'NoCap', blueprint_id: 'bp-x', config: { tools: ['t'] } }]);
    const workflow = {
      id: UUID,
      nodes: [{ id: 'n', type: 'agent', config: { blueprintId: 'bp-x', prompt: 'go' } }],
      connections: [],
    };
    await WorkflowEngine.execute(workflow, { skipSave: true });
    expect(calls[0].maxSteps).toBeUndefined();
  });

  it('persona_dispatch threads workflow scope through to AgentExecutor', async () => {
    const calls = [];
    globalThis.AgentExecutor = {
      execute: async (agent, prompt, opts) => {
        calls.push({ spaceshipId: opts?.spaceshipId });
        return { finalAnswer: 'done', steps: [], metadata: {} };
      },
    };
    globalThis.State.set('agents', [{ id: 'u1', name: 'D', blueprint_id: 'bp-d', config: { tools: ['x'] } }]);
    const workflow = {
      id: UUID,
      nodes: [{ id: 'n', type: 'persona_dispatch', config: { blueprintId: 'bp-d', prompt: 'reply', personaHint: 'theme_persona' } }],
      connections: [],
    };
    await WorkflowEngine.execute(workflow, { skipSave: true });
    expect(calls.length).toBe(1);
    expect(calls[0].spaceshipId).toBe('mission-' + UUID);
  });
});

describe('WorkflowEngine — baseline regressions', () => {
  it('completes a linear agent → agent workflow', async () => {
    const workflow = {
      id: 'wf-lin',
      nodes: [
        { id: 'a', type: 'agent', config: { prompt: 'step1' } },
        { id: 'b', type: 'agent', config: { prompt: 'step2' } },
      ],
      connections: [{ from: 'a', to: 'b' }],
    };
    const res = await WorkflowEngine.execute(workflow, { skipSave: true });
    expect(res.status).toBe('completed');
    expect(res.nodeResults.size).toBe(2);
  });

  it('output node aggregates into finalOutput when present', async () => {
    const workflow = {
      id: 'wf-out',
      nodes: [
        { id: 'a', type: 'agent', config: { prompt: 'one' } },
        { id: 'out', type: 'output', config: { format: 'text' } },
      ],
      connections: [{ from: 'a', to: 'out' }],
    };
    const res = await WorkflowEngine.execute(workflow, { skipSave: true });
    expect(res.status).toBe('completed');
    expect(res.finalOutput).toMatch(/ran:/);
  });
});
