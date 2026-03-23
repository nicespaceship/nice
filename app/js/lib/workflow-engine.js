/* ═══════════════════════════════════════════════════════════════════
   NICE — Workflow Execution Engine
   DAG executor for workflow pipelines with topological ordering,
   branching, looping, and execution logging.
═══════════════════════════════════════════════════════════════════ */

const WorkflowEngine = (() => {

  /**
   * Execute a workflow DAG.
   * @param {Object} workflow - { id, name, nodes, connections }
   * @param {Object} opts - { onNodeStart(node), onNodeComplete(node, result), onError(node, err) }
   * @returns {Promise<{ nodeResults: Map, finalOutput: string, duration: number, status: string }>}
   */
  async function execute(workflow, opts) {
    opts = opts || {};
    const startTime = Date.now();
    const nodeResults = new Map();
    let status = 'completed';

    const order = _topoSort(workflow.nodes, workflow.connections);

    for (const nodeId of order) {
      const node = workflow.nodes.find(n => n.id === nodeId);
      if (!node) continue;

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

    // Collect final output from output nodes
    const outputNodes = workflow.nodes.filter(n => n.type === 'output');
    const finalOutput = outputNodes
      .map(n => nodeResults.get(n.id) || '')
      .filter(Boolean)
      .join('\n---\n');

    const duration = Date.now() - startTime;

    // Save run to DB
    _saveRun(workflow, status, startTime, duration, nodeResults);

    return { nodeResults, finalOutput, duration, status };
  }

  /**
   * Execute a single node based on its type.
   */
  async function _executeNode(node, input, nodeResults, workflow) {
    switch (node.type) {
      case 'agent':
        return await _executeAgent(node, input);

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
    const agentId = node.config.agentId;
    const prompt = node.config.prompt || input || node.label;

    let agent = null;
    if (agentId && typeof State !== 'undefined') {
      agent = (State.get('agents') || []).find(a => a.id === agentId);
    }

    // Try AgentExecutor first if tools configured, then ShipLog
    if (typeof ShipLog !== 'undefined') {
      const spaceships = typeof State !== 'undefined' ? (State.get('spaceships') || []) : [];
      const shipId = spaceships.length ? spaceships[0].id : 'workflow-exec';
      const result = await ShipLog.execute(shipId, agent, input ? `${prompt}\n\nContext:\n${input}` : prompt);
      return result ? result.content : 'No response';
    }

    return 'ShipLog not available';
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
      // lines
      items = input.split('\n').filter(Boolean);
    }

    items = items.slice(0, maxIterations);

    // Find downstream nodes connected from this loop node
    const downstreamIds = workflow.connections
      .filter(c => c.from === node.id)
      .map(c => c.to);

    const results = [];
    for (const item of items) {
      const itemStr = typeof item === 'string' ? item : JSON.stringify(item);
      // Execute downstream nodes for each item
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

    for (const cond of conditions) {
      try {
        const result = { text: input, length: input.length, success: input.length > 0 };
        const pass = new Function('result', `return !!(${cond.expression})`)(result);
        if (pass && cond.targetNodeId) {
          // Mark this branch as the chosen path — return input to pass through
          return input;
        }
      } catch { /* skip invalid expressions */ }
    }

    // No condition matched — pass input through
    return input;
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
   * Save workflow run to Supabase.
   */
  async function _saveRun(workflow, status, startTime, duration, nodeResults) {
    if (typeof SB === 'undefined' || !SB.isReady()) return;

    const user = typeof State !== 'undefined' ? State.get('user') : null;
    if (!user) return;

    // Convert Map to serializable object
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

  return { execute };
})();
