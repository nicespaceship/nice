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
        // S5: resolves personaHint → prepends voice context to the
        // agent prompt. Drafter uses this to write replies in the
        // user's voice rather than a generic assistant tone.
        return await _executePersonaDispatch(node, input);

      case 'approval_gate':
        return _executeApprovalGate(node, input);

      case 'notify':
        return await _executeNotify(node, input);

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
    const finalPrompt = input ? `${prompt}\n\nContext:\n${input}` : prompt;

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

    // If the agent has tools configured (either explicit tool ids or
    // an MCP connection the user owns), route through AgentExecutor so
    // the ReAct loop actually invokes the tools. Without this branch,
    // ShipLog.execute is a one-shot LLM call — the model sees the tool
    // names in the system prompt and role-plays the interaction as
    // inline text instead of actually calling anything.
    //
    // Mirrors the simple-mission dispatch in MissionRunner.run.
    if (_agentHasTools(agent) && typeof AgentExecutor !== 'undefined') {
      try {
        const execResult = await AgentExecutor.execute(agent, finalPrompt, {
          tools: agent?.config?.tools || [],
          spaceshipId: _resolveSpaceshipId(),
        });
        return execResult?.finalAnswer || 'No response';
      } catch (err) {
        return 'Error: ' + (err?.message || 'Agent execution failed');
      }
    }

    if (typeof ShipLog !== 'undefined') {
      const shipId = _resolveSpaceshipId();
      const result = await ShipLog.execute(shipId, agent, finalPrompt);
      return result ? result.content : 'No response';
    }

    return 'ShipLog not available';
  }

  function _agentHasTools(agent) {
    const explicit = Array.isArray(agent?.config?.tools) && agent.config.tools.length > 0;
    if (explicit) return true;
    // Any active MCP connection means tools will be available via
    // ToolRegistry after McpBridge.loadTools — AgentExecutor calls
    // that internally at the top of .execute().
    if (typeof State === 'undefined') return false;
    const conns = State.get('mcp_connections') || [];
    return conns.some(c => c && c.status === 'connected');
  }

  function _resolveSpaceshipId() {
    const spaceships = typeof State !== 'undefined' ? (State.get('spaceships') || []) : [];
    return spaceships.length ? spaceships[0].id : 'workflow-exec';
  }

  /**
   * Persona dispatch — a specialization of the agent node that prepends
   * a voice / persona context block to the prompt before invoking the
   * agent. personaHint values we honor today:
   *   'user_voice'   → pulls the user's writing sample from the
   *                    `voiceSample` localStorage key (set via Profile).
   *   'theme_persona'→ stub for Persona Engine integration; emits a
   *                    hint referencing the active theme's persona.
   * Unknown hints fall through to a plain agent run. Missing voice
   * sample also falls through — we don't want to block the DAG because
   * the user hasn't filled out their profile yet.
   */
  async function _executePersonaDispatch(node, input) {
    const hint = node?.config?.personaHint;
    const voiceContext = _resolvePersonaContext(hint, node);
    if (!voiceContext) return await _executeAgent(node, input);

    // Clone the node so we don't mutate the workflow graph.
    const mergedPrompt = [voiceContext, node.config?.prompt || node.label || ''].filter(Boolean).join('\n\n');
    const injected = Object.assign({}, node, {
      config: Object.assign({}, node.config, { prompt: mergedPrompt }),
    });
    return await _executeAgent(injected, input);
  }

  function _resolvePersonaContext(hint, node) {
    if (!hint) return '';
    if (hint === 'user_voice') {
      // localStorage key is the SSOT on Utils.KEYS.voiceSample. Read
      // defensively — the engine is agnostic to whether the user has
      // configured anything yet.
      let sample = '';
      try {
        const key = (typeof Utils !== 'undefined' && Utils.KEYS?.voiceSample) || 'nice-voice-sample';
        sample = (typeof localStorage !== 'undefined') ? (localStorage.getItem(key) || '') : '';
      } catch { /* localStorage may be unavailable in tests */ }
      if (!sample || !sample.trim()) return '';
      return [
        'VOICE REFERENCE — write in the following voice. Match tone, phrasing, and length patterns. Do NOT copy the content; apply the style:',
        '---',
        sample.trim(),
        '---',
      ].join('\n');
    }
    if (hint === 'theme_persona') {
      // Stub: full compiler integration lives in the nice-ai edge fn.
      // For now we surface an intent line so the agent at least knows
      // a persona is expected. Callers wiring this via the Composer
      // should set personaHint explicitly on the node config.
      const themeId = (typeof State !== 'undefined' && State.get?.('theme')) || 'nice';
      return `Stay in the active NICE theme persona (theme_id=${themeId}). Match the voice already established in this run's conversation.`;
    }
    if (typeof hint === 'string' && hint.length > 40) {
      // Inline persona hints — treat the hint itself as the voice brief.
      // Caps the length to avoid a runaway prompt suffix.
      return `PERSONA BRIEF: ${hint.slice(0, 2000)}`;
    }
    return '';
  }

  /**
   * Notify node — fires a Notify toast and persists a row to the
   * notifications table so the badge updates and the entry is visible
   * in the inbox. Useful at the end of a DAG ("Mission complete, 12
   * drafts queued") or inline as a status signal between steps.
   *
   * Config:
   *   - title     (default: 'Mission update')
   *   - message   (default: upstream input)
   *   - kind      (default: 'system'; maps to Notify.send `type`)
   *
   * Returns a short confirmation string so the node has an output the
   * inspector can render.
   */
  async function _executeNotify(node, input) {
    const cfg = node?.config || {};
    const title = cfg.title || 'Mission update';
    const kind = cfg.kind || 'system';
    let message = cfg.message;
    if (!message) {
      const inputStr = typeof input === 'string' ? input : (input == null ? '' : JSON.stringify(input));
      message = inputStr.length > 240 ? inputStr.slice(0, 240) + '…' : inputStr;
    }

    // Toast (fire-and-forget — missing Notify module shouldn't fail the
    // node, just the user-visible side effect).
    if (typeof Notify !== 'undefined' && typeof Notify.send === 'function') {
      try { Notify.send({ title, message, type: kind }); } catch { /* ignore */ }
    }

    // Persist to notifications table for badge + inbox.
    if (typeof SB !== 'undefined' && typeof SB.db === 'function') {
      try {
        const user = typeof State !== 'undefined' ? State.get?.('user') : null;
        if (user?.id) {
          await SB.db('notifications').create({
            user_id: user.id,
            type: kind === 'error' ? 'error' : 'mission',
            title,
            message,
          });
        }
      } catch { /* non-critical */ }
    }

    return `Notified: ${title}`;
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
    _resolvePersonaContext,
    _executePersonaDispatch,
    _executeNotify,
    _executeAgent,
    _agentHasTools,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = WorkflowEngine;
