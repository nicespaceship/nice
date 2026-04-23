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

describe('WorkflowEngine — persona_dispatch stub', () => {
  it('executes as an agent node', async () => {
    const workflow = {
      id: 'wf-p',
      nodes: [
        { id: 'n', type: 'persona_dispatch', config: { blueprintId: 'bp-agent-drafter', prompt: 'speak in voice', personaHint: 'user_voice' } },
      ],
      connections: [],
    };
    const res = await WorkflowEngine.execute(workflow, { skipSave: true });
    expect(res.status).toBe('completed');
    // _executeAgent runs and returns a stubbed ShipLog result.
    expect(String(res.nodeResults.get('n'))).toMatch(/ran:/);
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
