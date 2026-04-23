/* ═══════════════════════════════════════════════════════════════════
   NICE — Workflow Execution Engine
   DAG executor for Mission workflows with topological ordering,
   branching, looping, pause/resume at approval gates, and persona-aware
   agent dispatch.

   Returned `status` values:
     'completed' — all nodes ran, no errors
     'failed'    — at least one node threw
     'paused'    — an approval_gate suspended the run. The caller is
                   responsible for persisting the `nodeResults` so far
                   and re-invoking execute() with the remaining nodes
                   after the user approves/rejects.
═══════════════════════════════════════════════════════════════════ */

const WorkflowEngine = (() => {

  // Sentinel returned by approval_gate nodes. Caller-visible so tests
  // can assert the pause contract directly.
  const GATE_PAUSE = Object.freeze({ __nice_workflow_pause: true });

  /**
   * Execute a workflow DAG.
   * @param {Object} workflow - { id, name, nodes, connections }
   * @param {Object} opts - { onNodeStart(node), onNodeComplete(node, result), onError(node, err), onGatePause(node, payload), skipSave }
   * @returns {Promise<{ nodeResults: Map, finalOutput: string, duration: number, status: string, pausedAt?: string }>}
   */
  async function execute(workflow, opts) {
    opts = opts || {};
    const startTime = Date.now();
    const nodeResults = new Map();
    let status = 'completed';
    let pausedAt = null;

    const order = _topoSort(workflow.nodes, workflow.connections);

    // Track pruned nodes from branch decisions + gate pauses.
    workflow._prunedNodes = new Set();

    for (const nodeId of order) {
      const node = workflow.nodes.find(n => n.id === nodeId);
      if (!node) continue;
      if (workflow._prunedNodes.has(nodeId)) continue;

      if (typeof opts.onNodeStart === 'function') {
        try { opts.onNodeStart(node); } catch (e) { /* ignore */ }
      }

      // Gather input from parent nodes
      const parentIds = workflow.connections
        .filter(c => c.to === nodeId)
        .map(c => c.from);
      const input = parentIds
        .map(pid => nodeResults.get(pid) || '')
        .filter(Boolean)
        .join('\n\n');

      try {
        const result = await _executeNode(node, input, nodeResults, workflow);

        // Gate pause: stop iteration, mark downstream pruned, return
        // status='paused'. The caller persists state and resumes later.
        if (_isGatePause(result)) {
          pausedAt = nodeId;
          status = 'paused';
          nodeResults.set(nodeId, result.summary || 'Awaiting approval.');
          // Prune everything downstream so a later resume can pick up.
          const descendants = _collectDescendants([nodeId], workflow.connections, null);
          descendants.forEach(id => { if (id !== nodeId) workflow._prunedNodes.add(id); });

          if (typeof opts.onGatePause === 'function') {
            try { opts.onGatePause(node, result); } catch (e) { /* ignore */ }
          }
          if (typeof opts.onNodeComplete === 'function') {
            try { opts.onNodeComplete(node, nodeResults.get(nodeId)); } catch (e) { /* ignore */ }
          }
          break;
        }

        nodeResults.set(nodeId, result);

        if (typeof opts.onNodeComplete === 'function') {
          try { opts.onNodeComplete(node, result); } catch (e) { /* ignore */ }
        }
      } catch (err) {
        const errorMsg = 'Error: ' + (err.message || 'Unknown');
        nodeResults.set(nodeId, errorMsg);
        status = 'failed';

        if (typeof opts.onError === 'function') {
          try { opts.onError(node, err); } catch (e) { /* ignore */ }
        }
      }
    }

    // Collect final output — when paused, the gate node's summary is
    // the final output so the UI has something to show in review.
    let finalOutput;
    if (status === 'paused' && pausedAt) {
      finalOutput = nodeResults.get(pausedAt) || '';
    } else {
      const outputNodes = workflow.nodes.filter(n => n.type === 'output');
      if (outputNodes.length) {
        finalOutput = outputNodes
          .map(n => nodeResults.get(n.id) || '')
          .filter(Boolean)
          .join('\n---\n');
      } else {
        // No explicit output node — fall back to the last-executed node.
        // This is what simple DAGs (Inbox Captain etc.) will produce.
        const executed = order.filter(id => nodeResults.has(id));
        finalOutput = executed.length ? (nodeResults.get(executed[executed.length - 1]) || '') : '';
      }
    }

    const duration = Date.now() - startTime;

    if (!opts.skipSave) _saveRun(workflow, status, startTime, duration, nodeResults);

    return { nodeResults, finalOutput, duration, status, pausedAt };
  }

  function _isGatePause(result) {
    return !!(result && typeof result === 'object' && result.__nice_workflow_pause === true);
  }

  /**
   * Execute a single node based on its type.
   */
  async function _executeNode(node, input, nodeResults, workflow) {
    switch (node.type) {
      case 'agent':
        return await _executeAgent(node, input);

      case 'persona_dispatch':
        // S3 stub: behaves like an agent node. The persona override
        // contract (personaHint → system prompt rewrite) lands in S5
        // alongside the other advanced node types. For now we just run
        // the referenced agent so the Inbox Captain DAG completes.
        return await _executeAgent(node, input);

      case 'approval_gate':
        return _executeApprovalGate(node, input);

      case 'condition':
        return _executeCondition(node, input);

      case 'delay':
        return await _executeDelay(node, input);

      case 'output':
        return _executeOutput(node, input);

      case 'loop':
        return await _executeLoop(node, input, nodeResults, workflow);

      case 'branch':
        return _executeBranch(node, input, nodeResults, workflow);

      case 'webhook':
        return await _executeWebhook(node, input);

      default:
        return input;
    }
  }

  async function _executeAgent(node, input) {
    const agentId = node.config?.agentId;
    const blueprintId = node.config?.blueprintId;
    const prompt = node.config?.prompt || input || node.label;

    let agent = null;
    const stateAgents = typeof State !== 'undefined' ? (State.get('agents') || []) : [];

    if (agentId) {
      agent = stateAgents.find(a => a.id === agentId);
    }
    if (!agent && blueprintId) {
      agent = stateAgents.find(a => a.blueprint_id === blueprintId);
    }

    // Fall back to a blueprint-derived ephemeral agent if the user
    // hasn't activated this crew yet. Keeps demos working before a
    // full install lands; real runs should pre-install via the Composer.
    if (!agent && blueprintId && typeof Blueprints !== 'undefined') {
      const bp = Blueprints.getAgent?.(blueprintId);
      if (bp) {
        agent = {
          id: bp.id,
          name: bp.name,
          blueprint_id: bp.id,
          config: bp.config || {},
        };
      }
    }

    if (typeof ShipLog !== 'undefined') {
      const spaceships = typeof State !== 'undefined' ? (State.get('spaceships') || []) : [];
      const shipId = spaceships.length ? spaceships[0].id : 'workflow-exec';
      const result = await ShipLog.execute(shipId, agent, input ? `${prompt}\n\nContext:\n${input}` : prompt);
      return result ? result.content : 'No response';
    }

    return 'ShipLog not available';
  }

  /**
   * Produce the gate pause sentinel. The parent runner (MissionRunner
   * for mission DAGs) is responsible for persisting the partial
   * nodeResults and flipping task.status to 'review'.
   */
  function _executeApprovalGate(node, input) {
    const cfg = node.config || {};
    return {
      __nice_workflow_pause: true,
      reason: cfg.reason || 'Awaiting captain approval.',
      approveLabel: cfg.approveLabel || 'Approve',
      rejectLabel: cfg.rejectLabel || 'Reject',
      // Summary shown in the review UI. Upstream node output flows in
      // as `input` — typically a JSON payload from the Drafter agent.
      summary: (typeof input === 'string' && input.trim()) ? input : cfg.reason || '',
    };
  }

  function _executeCondition(node, input) {
    const expr = node.config.expression || 'true';
    try {
      const result = { text: input, length: input.length, success: input.length > 0 };
      const pass = new Function('result', `return !!(${expr})`)(result);
      return pass ? input : '';
    } catch {
      return input; // pass through on eval error
    }
  }

  async function _executeDelay(node, input) {
    await new Promise(r => setTimeout(r, node.config.ms || 500));
    return input;
  }

  function _executeOutput(node, input) {
    const format = node.config.format || 'text';
    if (format === 'json') {
      try { return JSON.stringify({ output: input }, null, 2); }
      catch { return input; }
    } else if (format === 'csv') {
      return input.split('\n').join(',');
    }
    return input;
  }

  async function _executeLoop(node, input, nodeResults, workflow) {
    const iterateOver = node.config.iterateOver || 'lines';
    const maxIterations = node.config.maxIterations || 10;

    let items = [];
    if (iterateOver === 'json_array') {
      try { items = JSON.parse(input); } catch { items = [input]; }
      if (!Array.isArray(items)) items = [items];
    } else {
      items = input.split('\n').filter(Boolean);
    }

    items = items.slice(0, maxIterations);

    const downstreamIds = workflow.connections
      .filter(c => c.from === node.id)
      .map(c => c.to);

    if (!workflow._prunedNodes) workflow._prunedNodes = new Set();
    downstreamIds.forEach(id => workflow._prunedNodes.add(id));

    const results = [];
    for (const item of items) {
      const itemStr = typeof item === 'string' ? item : JSON.stringify(item);
      for (const downId of downstreamIds) {
        const downNode = workflow.nodes.find(n => n.id === downId);
        if (downNode) {
          try {
            const r = await _executeNode(downNode, itemStr, nodeResults, workflow);
            results.push(r);
          } catch (e) {
            results.push('Error: ' + (e.message || 'Unknown'));
          }
        }
      }
    }

    return results.join('\n');
  }

  function _executeBranch(node, input, nodeResults, workflow) {
    const conditions = node.config.conditions || [];
    let chosenTarget = null;

    for (const cond of conditions) {
      try {
        const result = { text: input, length: input.length, success: input.length > 0 };
        const pass = new Function('result', `return !!(${cond.expression})`)(result);
        if (pass && cond.targetNodeId) {
          chosenTarget = cond.targetNodeId;
          break;
        }
      } catch { /* skip invalid expressions */ }
    }

    const downstreamIds = workflow.connections
      .filter(c => c.from === node.id)
      .map(c => c.to);

    if (chosenTarget && downstreamIds.length > 1) {
      const prunedRoots = downstreamIds.filter(id => id !== chosenTarget);
      const prunedSet = _collectDescendants(prunedRoots, workflow.connections, chosenTarget);
      if (!workflow._prunedNodes) workflow._prunedNodes = new Set();
      prunedSet.forEach(id => workflow._prunedNodes.add(id));
    }

    return input;
  }

  /** Collect all descendants of rootIds via connections, excluding protectedId subtree. */
  function _collectDescendants(rootIds, connections, protectedId) {
    const pruned = new Set();
    const queue = [...rootIds];
    const adj = {};
    connections.forEach(c => {
      if (!adj[c.from]) adj[c.from] = [];
      adj[c.from].push(c.to);
    });
    while (queue.length) {
      const id = queue.shift();
      if (id === protectedId || pruned.has(id)) continue;
      pruned.add(id);
      (adj[id] || []).forEach(child => {
        if (!pruned.has(child) && child !== protectedId) queue.push(child);
      });
    }
    return pruned;
  }

  async function _executeWebhook(node, input) {
    const url = node.config.url;
    const method = node.config.method || 'POST';
    const body = node.config.body || input;

    if (typeof SB !== 'undefined' && SB.functions) {
      try {
        const { data, error } = await SB.functions.invoke('workflow-trigger', {
          url, method, body,
        });
        if (error) return 'Webhook error: ' + (error.message || error);
        return typeof data === 'string' ? data : JSON.stringify(data);
      } catch (err) {
        return 'Webhook failed: ' + (err.message || 'Unknown');
      }
    }

    return 'SB.functions not available for webhook';
  }

  /**
   * Topological sort of workflow nodes.
   */
  function _topoSort(nodes, connections) {
    const visited = new Set();
    const order = [];
    const adj = {};
    nodes.forEach(n => { adj[n.id] = []; });
    connections.forEach(c => { if (adj[c.from]) adj[c.from].push(c.to); });

    function dfs(id) {
      if (visited.has(id)) return;
      visited.add(id);
      (adj[id] || []).forEach(next => dfs(next));
      order.unshift(id);
    }
    nodes.forEach(n => dfs(n.id));
    return order;
  }

  /**
   * Save workflow run to Supabase. Skipped when status='paused' because
   * the parent MissionRunner writes the run state to `tasks` instead —
   * workflow_runs is legacy and will be retired in S6.
   */
  async function _saveRun(workflow, status, startTime, duration, nodeResults) {
    if (typeof SB === 'undefined' || !SB.isReady()) return;
    if (status === 'paused') return;

    const user = typeof State !== 'undefined' ? State.get('user') : null;
    if (!user) return;

    const resultsObj = {};
    nodeResults.forEach((val, key) => { resultsObj[key] = val; });

    try {
      await SB.db('workflow_runs').create({
        user_id: user.id,
        workflow_id: workflow.id,
        status: status,
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
        node_results: JSON.stringify(resultsObj),
        duration_ms: duration,
      });
    } catch (err) {
      console.warn('[WorkflowEngine] Failed to save run:', err.message);
    }
  }

  return {
    execute,
    GATE_PAUSE,
    // Exposed for tests.
    _executeApprovalGate,
    _isGatePause,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = WorkflowEngine;
