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

describe('WorkflowEngine — cooperative cancel', () => {
  it('breaks out of the node loop when isCancelled returns true', async () => {
    const workflow = {
      id: 'wf-cancel',
      nodes: [
        { id: 'a', type: 'agent', config: { prompt: 'first' } },
        { id: 'b', type: 'agent', config: { prompt: 'second' } },
        { id: 'c', type: 'agent', config: { prompt: 'third' } },
      ],
      connections: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
    };

    let calls = 0;
    const completed = [];
    const res = await WorkflowEngine.execute(workflow, {
      skipSave: true,
      // Cancel-after-first: pass through on call 1, trip on call 2.
      isCancelled: () => { calls += 1; return calls > 1; },
      onNodeComplete: (node) => completed.push(node.id),
    });

    expect(res.status).toBe('cancelled');
    expect(completed).toContain('a');
    expect(completed).not.toContain('b');
    expect(completed).not.toContain('c');
  });

  it('runs to completion when isCancelled stays false', async () => {
    const workflow = {
      id: 'wf-no-cancel',
      nodes: [{ id: 'only', type: 'agent', config: { prompt: 'solo' } }],
      connections: [],
    };
    const res = await WorkflowEngine.execute(workflow, {
      skipSave: true,
      isCancelled: () => false,
    });
    expect(res.status).toBe('completed');
  });

  it('treats isCancelled errors as "keep going" (flaky read must not abort)', async () => {
    const workflow = {
      id: 'wf-cancel-error',
      nodes: [{ id: 'only', type: 'agent', config: { prompt: 'solo' } }],
      connections: [],
    };
    const res = await WorkflowEngine.execute(workflow, {
      skipSave: true,
      isCancelled: () => { throw new Error('DB offline'); },
    });
    expect(res.status).toBe('completed');
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

describe('WorkflowEngine — triage', () => {
  // Triage picks one agent from candidates via either an intent shortcut
  // or an LLM routing call, then runs that agent with the prompt.
  let _shipLogAppends;

  beforeEach(() => {
    _shipLogAppends = [];
    globalThis.ShipLog = {
      execute: async (shipId, agent, prompt) => ({ content: `ran:${agent?.name || 'noop'}:${(prompt || '').slice(0, 40)}` }),
      append: async (shipId, entry) => { _shipLogAppends.push(Object.assign({ shipId }, entry)); },
    };
    globalThis.State.set('agents', [
      { id: 'researcher', name: 'Researcher', config: { role: 'Research analyst' } },
      { id: 'coder',      name: 'Coder',      config: { role: 'Code writer' } },
      { id: 'analyst',    name: 'Analyst',    config: { role: 'Data crunching' } },
    ]);
  });

  it('with a single candidate, skips routing and runs that agent', async () => {
    const node = { id: 'n', type: 'triage', config: { candidates: ['researcher'], prompt: 'find papers' } };
    const out = await WorkflowEngine._executeTriage(node, '', {});
    expect(out).toMatch(/ran:Researcher:find papers/);
    // Routing entry logged with reasoning="Only candidate"
    expect(_shipLogAppends.find(e => e.metadata?.type === 'routing')?.metadata?.reasoning).toBe('Only candidate');
  });

  it('intent=research matches the agent whose role contains "research"', async () => {
    const node = { id: 'n', type: 'triage', config: {
      candidates: ['researcher', 'coder', 'analyst'], intent: 'research', prompt: 'survey the literature',
    } };
    // No SB so routing LLM would default to first; intent shortcut should
    // pick Researcher before falling through.
    const out = await WorkflowEngine._executeTriage(node, '', {});
    expect(out).toMatch(/ran:Researcher/);
    const routingEntry = _shipLogAppends.find(e => e.metadata?.type === 'routing');
    expect(routingEntry?.metadata?.chosen_agent_id).toBe('researcher');
    expect(routingEntry?.content).toMatch(/Matched research intent/);
  });

  it('intent=analyze matches "data" role (analyst)', async () => {
    const node = { id: 'n', type: 'triage', config: {
      candidates: ['researcher', 'coder', 'analyst'], intent: 'analyze', prompt: 'crunch numbers',
    } };
    const out = await WorkflowEngine._executeTriage(node, '', {});
    expect(out).toMatch(/ran:Analyst/);
  });

  it('routes via LLM when no intent hint and multiple candidates', async () => {
    const llmCalls = [];
    globalThis.SB = {
      isReady: () => true,
      functions: {
        invoke: async (name, opts) => {
          llmCalls.push({ name, body: opts?.body });
          return { data: { content: '{"agent_id":"coder","reasoning":"task is code-flavored"}' }, error: null };
        },
      },
    };
    const node = { id: 'n', type: 'triage', config: { candidates: ['researcher', 'coder', 'analyst'], prompt: 'write a parser' } };
    const out = await WorkflowEngine._executeTriage(node, '', {});
    expect(out).toMatch(/ran:Coder/);
    expect(llmCalls.length).toBe(1);
    expect(llmCalls[0].name).toBe('nice-ai');
    const routingEntry = _shipLogAppends.find(e => e.metadata?.type === 'routing');
    expect(routingEntry?.metadata?.reasoning).toBe('task is code-flavored');
  });

  it('falls back to first candidate when routing LLM errors', async () => {
    globalThis.SB = {
      isReady: () => true,
      functions: { invoke: async () => ({ data: null, error: { message: 'boom' } }) },
    };
    const node = { id: 'n', type: 'triage', config: { candidates: ['researcher', 'coder'], prompt: 'do thing' } };
    const out = await WorkflowEngine._executeTriage(node, '', {});
    expect(out).toMatch(/ran:Researcher/);
  });

  it('falls back to first candidate when routing LLM picks an unknown agent_id', async () => {
    globalThis.SB = {
      isReady: () => true,
      functions: { invoke: async () => ({ data: { content: '{"agent_id":"nonexistent","reasoning":"???"}' }, error: null }) },
    };
    const node = { id: 'n', type: 'triage', config: { candidates: ['researcher', 'coder'], prompt: 'do thing' } };
    const out = await WorkflowEngine._executeTriage(node, '', {});
    expect(out).toMatch(/ran:Researcher/);
  });

  it('omitted candidates defaults to all activated agents', async () => {
    globalThis.SB = {
      isReady: () => true,
      functions: { invoke: async () => ({ data: { content: '{"agent_id":"analyst","reasoning":"data"}' }, error: null }) },
    };
    const node = { id: 'n', type: 'triage', config: { prompt: 'numbers' } };
    const out = await WorkflowEngine._executeTriage(node, '', {});
    expect(out).toMatch(/ran:Analyst/);
  });

  it('errors cleanly when there are no candidates and no activated agents', async () => {
    globalThis.State.set('agents', []);
    const node = { id: 'n', type: 'triage', config: { prompt: 'nobody home' } };
    const out = await WorkflowEngine._executeTriage(node, '', {});
    expect(out).toMatch(/No candidate agents/);
  });

  it('triage runs through full execute() pipeline when used as a DAG node', async () => {
    const node = { id: 't', type: 'triage', config: { candidates: ['researcher'], prompt: 'survey' } };
    const wf = { id: 'wf-tri', nodes: [node], connections: [] };
    const res = await WorkflowEngine.execute(wf, { skipSave: true });
    expect(res.status).toBe('completed');
    expect(String(res.nodeResults.get('t'))).toMatch(/ran:Researcher/);
  });
});

describe('WorkflowEngine — pipeline', () => {
  beforeEach(() => {
    globalThis.ShipLog = {
      execute: async (shipId, agent, prompt) => ({ content: `${agent?.name}: ${(prompt || '').slice(0, 60)}` }),
      append: async () => {},
    };
    globalThis.State.set('agents', [
      { id: 'a1', name: 'Drafter',  config: {} },
      { id: 'a2', name: 'Reviewer', config: {} },
      { id: 'a3', name: 'Polisher', config: {} },
    ]);
  });

  it('passes each step output as input to the next', async () => {
    const seen = [];
    globalThis.ShipLog.execute = async (s, agent, prompt) => {
      seen.push({ agent: agent?.name, prompt });
      return { content: `${agent?.name}-out` };
    };
    const node = { id: 'p', type: 'pipeline', config: {
      steps: [
        { agentId: 'a1' },
        { agentId: 'a2' },
        { agentId: 'a3' },
      ],
    } };
    const out = await WorkflowEngine._executePipeline(node, 'seed', {});
    expect(out).toBe('Polisher-out');
    expect(seen[0].agent).toBe('Drafter');
    expect(seen[0].prompt).toBe('seed');
    // Reviewer's prompt embeds Drafter's output
    expect(seen[1].agent).toBe('Reviewer');
    expect(seen[1].prompt).toMatch(/Drafter-out/);
    // Polisher's prompt embeds Reviewer's output
    expect(seen[2].agent).toBe('Polisher');
    expect(seen[2].prompt).toMatch(/Reviewer-out/);
  });

  it('respects {input} placeholder in promptTemplate', async () => {
    const seen = [];
    globalThis.ShipLog.execute = async (s, agent, prompt) => {
      seen.push({ agent: agent?.name, prompt });
      return { content: 'ok-' + agent?.name };
    };
    const node = { id: 'p', type: 'pipeline', config: {
      steps: [
        { agentId: 'a1', promptTemplate: 'kickoff' },
        { agentId: 'a2', promptTemplate: 'received: {input}' },
      ],
    } };
    await WorkflowEngine._executePipeline(node, 'INITIAL', {});
    expect(seen[0].prompt).toBe('kickoff');
    expect(seen[1].prompt).toBe('received: ok-Drafter');
  });

  it('keeps going when one step references a missing agent', async () => {
    const node = { id: 'p', type: 'pipeline', config: {
      steps: [
        { agentId: 'a1' },
        { agentId: 'ghost' }, // not resolvable
        { agentId: 'a3' },
      ],
    } };
    const out = await WorkflowEngine._executePipeline(node, 'start', {});
    // Final step still runs and produces output (the prior step's
    // 'Error: Agent not found' becomes its input, but it doesn't crash).
    expect(out).toMatch(/Polisher:/);
  });

  it('empty steps returns input unchanged', async () => {
    const out = await WorkflowEngine._executePipeline({ id: 'p', type: 'pipeline', config: { steps: [] } }, 'untouched', {});
    expect(out).toBe('untouched');
  });
});

describe('WorkflowEngine — parallel', () => {
  beforeEach(() => {
    globalThis.ShipLog = {
      execute: async (shipId, agent, prompt) => ({ content: `[${agent?.name}] ${(prompt || '').slice(0, 30)}` }),
      append: async () => {},
    };
    globalThis.State.set('agents', [
      { id: 'a1', name: 'Alice', config: {} },
      { id: 'a2', name: 'Bob',   config: {} },
      { id: 'a3', name: 'Cara',  config: {} },
    ]);
  });

  it('fans out to N agents and concatenates by default', async () => {
    const node = { id: 'p', type: 'parallel', config: { agents: ['a1', 'a2', 'a3'], prompt: 'GO' } };
    const out = await WorkflowEngine._executeParallel(node, '', {});
    expect(out).toMatch(/## Alice/);
    expect(out).toMatch(/## Bob/);
    expect(out).toMatch(/## Cara/);
    expect(out).toMatch(/---/);
  });

  it('summarize merge dispatches the concatenated result to a synthesis agent', async () => {
    const seen = [];
    globalThis.ShipLog.execute = async (s, agent, prompt) => {
      seen.push({ agent: agent?.name, prompt });
      return { content: 'synthesized' };
    };
    const node = { id: 'p', type: 'parallel', config: {
      agents: ['a1', 'a2'],
      merge: 'summarize',
      synthesisAgent: 'a3',
      prompt: 'investigate X',
    } };
    const out = await WorkflowEngine._executeParallel(node, '', {});
    expect(out).toBe('synthesized');
    // Last call is the synthesis call to Cara with the concatenated output
    const synth = seen[seen.length - 1];
    expect(synth.agent).toBe('Cara');
    expect(synth.prompt).toMatch(/## Alice/);
    expect(synth.prompt).toMatch(/## Bob/);
  });

  it('summarize without synthesisAgent silently falls back to concat', async () => {
    const node = { id: 'p', type: 'parallel', config: { agents: ['a1', 'a2'], merge: 'summarize', prompt: 'go' } };
    const out = await WorkflowEngine._executeParallel(node, '', {});
    expect(out).toMatch(/## Alice[\s\S]*## Bob/);
  });

  it('one agent failure does not abort the others', async () => {
    globalThis.ShipLog.execute = async (s, agent) => {
      if (agent.name === 'Bob') throw new Error('Bob crashed');
      return { content: 'ok-' + agent.name };
    };
    const node = { id: 'p', type: 'parallel', config: { agents: ['a1', 'a2', 'a3'], prompt: 'go' } };
    const out = await WorkflowEngine._executeParallel(node, '', {});
    expect(out).toMatch(/ok-Alice/);
    expect(out).toMatch(/Error:/); // Bob's section
    expect(out).toMatch(/ok-Cara/);
  });

  it('empty agents list returns input unchanged', async () => {
    const out = await WorkflowEngine._executeParallel({ id: 'p', type: 'parallel', config: { agents: [] } }, 'pass-through', {});
    expect(out).toBe('pass-through');
  });
});

describe('WorkflowEngine — quality_loop', () => {
  // Worker drafts, reviewer scores, retry until threshold or maxIterations.
  let _scoresQueue;
  beforeEach(() => {
    _scoresQueue = [];
    globalThis.ShipLog = {
      execute: async (shipId, agent, prompt) => {
        // Reviewer is identifiable by name 'Reviewer' — pop a score off
        // the queue so tests can simulate quality progression.
        if (agent?.name === 'Reviewer') {
          const next = _scoresQueue.shift();
          const score = (next && typeof next.score === 'number') ? next.score : 0.5;
          const fb = (next && next.feedback) || 'be better';
          return { content: `{"score":${score},"feedback":"${fb}"}` };
        }
        return { content: `draft-${prompt.slice(0, 20)}` };
      },
      append: async () => {},
    };
    globalThis.State.set('agents', [
      { id: 'worker',   name: 'Worker',   config: {} },
      { id: 'reviewer', name: 'Reviewer', config: {} },
    ]);
  });

  it('stops after the first iteration when score >= threshold', async () => {
    _scoresQueue = [{ score: 0.9, feedback: 'great' }];
    const node = { id: 'q', type: 'quality_loop', config: {
      worker: 'worker', reviewer: 'reviewer', threshold: 0.8, maxIterations: 3, prompt: 'do',
    } };
    const out = await WorkflowEngine._executeQualityLoop(node, '', {});
    expect(out).toMatch(/^draft-/);
    expect(_scoresQueue.length).toBe(0); // exactly one review consumed
  });

  it('retries with feedback until threshold is met', async () => {
    _scoresQueue = [{ score: 0.4, feedback: 'too short' }, { score: 0.9, feedback: 'good now' }];
    const node = { id: 'q', type: 'quality_loop', config: {
      worker: 'worker', reviewer: 'reviewer', threshold: 0.8, maxIterations: 3, prompt: 'do',
    } };
    const out = await WorkflowEngine._executeQualityLoop(node, '', {});
    expect(out).toMatch(/^draft-/);
    expect(_scoresQueue.length).toBe(0); // both reviews consumed
  });

  it('stops after maxIterations even when never reaching threshold', async () => {
    _scoresQueue = [
      { score: 0.1, feedback: 'bad' },
      { score: 0.2, feedback: 'still bad' },
      { score: 0.3, feedback: 'somehow worse' },
    ];
    const node = { id: 'q', type: 'quality_loop', config: {
      worker: 'worker', reviewer: 'reviewer', threshold: 0.95, maxIterations: 3, prompt: 'do',
    } };
    const out = await WorkflowEngine._executeQualityLoop(node, '', {});
    expect(out).toMatch(/^draft-/);
    expect(_scoresQueue.length).toBe(0); // all three reviews consumed
  });

  it('errors clearly when worker agent missing', async () => {
    // Override the default Blueprints stub so 'ghost' is truly unresolvable.
    globalThis.Blueprints = { getAgent: () => null };
    const node = { id: 'q', type: 'quality_loop', config: { worker: 'ghost', reviewer: 'reviewer' } };
    const out = await WorkflowEngine._executeQualityLoop(node, '', {});
    expect(out).toMatch(/Worker agent not found/);
  });

  it('errors clearly when reviewer agent missing', async () => {
    globalThis.Blueprints = { getAgent: () => null };
    const node = { id: 'q', type: 'quality_loop', config: { worker: 'worker', reviewer: 'ghost' } };
    const out = await WorkflowEngine._executeQualityLoop(node, '', {});
    expect(out).toMatch(/Reviewer agent not found/);
  });
});

describe('WorkflowEngine — composition (triage + parallel + agent)', () => {
  // Validates the doc claim that the old "hierarchical" pattern composes
  // out of triage + parallel + agent without needing its own node type.
  beforeEach(() => {
    globalThis.ShipLog = {
      execute: async (shipId, agent, prompt) => ({ content: `${agent?.name || 'noop'}: ${(prompt || '').slice(0, 30)}` }),
      append: async () => {},
    };
    globalThis.State.set('agents', [
      { id: 'captain',   name: 'Captain',   config: { role: 'leadership' } },
      { id: 'worker-a',  name: 'WorkerA',   config: {} },
      { id: 'worker-b',  name: 'WorkerB',   config: {} },
      { id: 'synth',     name: 'Synth',     config: {} },
    ]);
  });

  it('captain triage → parallel crew → synthesis chain runs end to end', async () => {
    const wf = {
      id: 'wf-comp',
      nodes: [
        { id: 'plan', type: 'triage', config: { candidates: ['captain'], prompt: 'plan the work' } },
        { id: 'crew', type: 'parallel', config: { agents: ['worker-a', 'worker-b'] } },
        { id: 'syn',  type: 'agent', config: { agentId: 'synth', prompt: 'synthesize' } },
      ],
      connections: [
        { from: 'plan', to: 'crew' },
        { from: 'crew', to: 'syn' },
      ],
    };
    const res = await WorkflowEngine.execute(wf, { skipSave: true });
    expect(res.status).toBe('completed');
    expect(String(res.nodeResults.get('plan'))).toMatch(/Captain:/);
    expect(String(res.nodeResults.get('crew'))).toMatch(/## WorkerA[\s\S]*## WorkerB/);
    expect(String(res.nodeResults.get('syn'))).toMatch(/Synth:/);
    // Synth received the parallel concatenation as its context
    expect(String(res.nodeResults.get('syn'))).toMatch(/synthesize/);
  });

  it('pipeline + quality_loop in same DAG', async () => {
    const reviewQueue = [{ score: 0.9, feedback: 'good' }];
    globalThis.ShipLog.execute = async (s, agent, prompt) => {
      if (agent?.name === 'Reviewer') {
        const next = reviewQueue.shift();
        return { content: `{"score":${next?.score ?? 0.5},"feedback":"${next?.feedback || ''}"}` };
      }
      return { content: `${agent?.name}: ${(prompt || '').slice(0, 20)}` };
    };
    globalThis.State.set('agents', [
      { id: 'a1',       name: 'First',    config: {} },
      { id: 'a2',       name: 'Second',   config: {} },
      { id: 'worker',   name: 'Worker',   config: {} },
      { id: 'reviewer', name: 'Reviewer', config: {} },
    ]);
    const wf = {
      id: 'wf-mix',
      nodes: [
        { id: 'pipe', type: 'pipeline', config: { steps: [{ agentId: 'a1' }, { agentId: 'a2' }] } },
        { id: 'qloop', type: 'quality_loop', config: { worker: 'worker', reviewer: 'reviewer', threshold: 0.8, maxIterations: 2 } },
      ],
      connections: [{ from: 'pipe', to: 'qloop' }],
    };
    const res = await WorkflowEngine.execute(wf, { skipSave: true });
    expect(res.status).toBe('completed');
    expect(String(res.nodeResults.get('pipe'))).toMatch(/Second:/);
    expect(String(res.nodeResults.get('qloop'))).toMatch(/^Worker:/);
  });
});

describe('WorkflowEngine — JSON parsing helpers', () => {
  it('_parseJSON parses clean JSON', () => {
    const r = WorkflowEngine._parseJSON('{"agent_id":"x","reasoning":"y"}', 'agent_id');
    expect(r.agent_id).toBe('x');
  });
  it('_parseJSON extracts JSON from mixed text', () => {
    const r = WorkflowEngine._parseJSON('here you go: {"agent_id":"x","reasoning":"y"} done', 'agent_id');
    expect(r.agent_id).toBe('x');
  });
  it('_parseJSON returns null on garbage', () => {
    expect(WorkflowEngine._parseJSON('not json at all', 'agent_id')).toBeNull();
    expect(WorkflowEngine._parseJSON('', 'agent_id')).toBeNull();
  });
  it('_parseReviewJSON falls back to regex when JSON invalid', () => {
    const r = WorkflowEngine._parseReviewJSON('preamble "score": 0.7, "feedback": "ok" trailing');
    expect(r.score).toBeCloseTo(0.7);
    expect(r.feedback).toBe('ok');
  });
  it('_parseReviewJSON returns score=0 on garbage', () => {
    expect(WorkflowEngine._parseReviewJSON('').score).toBe(0);
  });
});

describe('WorkflowEngine — _resolveAgent', () => {
  it('matches a State.agents row by id', () => {
    globalThis.State.set('agents', [{ id: 'live-1', name: 'LiveAgent', config: {} }]);
    expect(WorkflowEngine._resolveAgent('live-1').name).toBe('LiveAgent');
  });
  it('matches a State.agents row by blueprint_id', () => {
    globalThis.State.set('agents', [{ id: 'u1', name: 'Live', blueprint_id: 'bp-x', config: {} }]);
    expect(WorkflowEngine._resolveAgent('bp-x').name).toBe('Live');
  });
  it('falls back to Blueprints.getAgent', () => {
    globalThis.State.set('agents', []);
    globalThis.Blueprints = { getAgent: (id) => id === 'bp-y' ? { id, name: 'BPYagent', config: {} } : null };
    const a = WorkflowEngine._resolveAgent('bp-y');
    expect(a.name).toBe('BPYagent');
    expect(a.blueprint_id).toBe('bp-y');
  });
  it('returns null for missing id', () => {
    globalThis.State.set('agents', []);
    globalThis.Blueprints = { getAgent: () => null };
    expect(WorkflowEngine._resolveAgent('nope')).toBeNull();
    expect(WorkflowEngine._resolveAgent(null)).toBeNull();
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
