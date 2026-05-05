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
   * @param {Object} opts - { onNodeStart(node), onNodeComplete(node, result), onError(node, err), onGatePause(node, payload), isCancelled(), skipSave }
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

      // Cooperative cancel check between nodes. MissionRunner passes
      // isCancelled() that re-reads the DB status; a click on the UI
      // Cancel button flips it to 'cancelled' and the next iteration
      // here stops the loop. In-flight node work still completes —
      // AgentExecutor has no abort hook yet — but no further nodes run.
      if (typeof opts.isCancelled === 'function') {
        let cancelled = false;
        try { cancelled = await opts.isCancelled(); } catch (e) { /* ignore */ }
        if (cancelled) {
          status = 'cancelled';
          break;
        }
      }

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
        return await _executeAgent(node, input, workflow);

      case 'persona_dispatch':
        // S5: resolves personaHint → prepends voice context to the
        // agent prompt. Drafter uses this to write replies in the
        // user's voice rather than a generic assistant tone.
        return await _executePersonaDispatch(node, input, workflow);

      case 'triage':
        return await _executeTriage(node, input, workflow);

      case 'pipeline':
        return await _executePipeline(node, input, workflow);

      case 'parallel':
        return await _executeParallel(node, input, workflow);

      case 'quality_loop':
        return await _executeQualityLoop(node, input, workflow);

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

  async function _executeAgent(node, input, workflow) {
    const agentId = node.config?.agentId;
    const blueprintId = node.config?.blueprintId;
    const prompt = node.config?.prompt || input || node.label;
    const finalPrompt = input ? `${prompt}\n\nContext:\n${input}` : prompt;

    const agent = _resolveAgent(agentId || blueprintId);

    // Legacy contract: an agent node with no resolvable agent still
    // falls through to ShipLog (which one-shot calls the LLM with no
    // persona). Removed-agent nodes in saved workflows shouldn't fail
    // hard. The new sub-dispatch nodes (triage/pipeline/parallel/
    // quality_loop) treat missing agents as real config errors via
    // _runAgent's guard.
    if (!agent) {
      if (typeof ShipLog !== 'undefined') {
        const r = await ShipLog.execute(_resolveSpaceshipId(workflow), null, finalPrompt);
        return r ? r.content : 'No response';
      }
      return 'ShipLog not available';
    }

    return _runAgent(agent, finalPrompt, workflow);
  }

  /**
   * Resolve an id (either a `user_agents.id` or a `blueprints.id`) to
   * an executable agent object. Tries State.agents first (live activated
   * agents carry user-specific tool/persona config), then falls back to
   * the blueprint catalog (ephemeral agent for unactivated crew). Same
   * resolution chain used by triage / pipeline / parallel / quality_loop.
   */
  function _resolveAgent(id) {
    if (!id) return null;
    const stateAgents = typeof State !== 'undefined' ? (State.get('agents') || []) : [];
    let agent = stateAgents.find(a => a.id === id);
    if (agent) return agent;
    agent = stateAgents.find(a => a.blueprint_id === id);
    if (agent) return agent;
    if (typeof Blueprints !== 'undefined') {
      const bp = Blueprints.getAgent?.(id);
      if (bp) return { id: bp.id, name: bp.name, blueprint_id: bp.id, config: bp.config || {} };
    }
    return null;
  }

  /**
   * Run a single agent with a prompt. The primitive shared by the agent
   * node and the higher-order node types (triage, pipeline, parallel,
   * quality_loop). Routes through AgentExecutor when the agent has tools
   * (explicit list or any active MCP connection); otherwise falls back to
   * a one-shot ShipLog.execute call.
   */
  async function _runAgent(agent, prompt, workflow) {
    if (!agent) return 'Error: Agent not found';
    if (_agentHasTools(agent) && typeof AgentExecutor !== 'undefined') {
      try {
        const r = await AgentExecutor.execute(agent, prompt, {
          // Pass through directly so AgentExecutor can tell "no tools
          // field" (fall back to all MCPs) from "explicitly empty"
          // (no tools available). The `|| []` collapse erased that
          // distinction — see agent-executor._buildExecContext.
          tools: agent?.config?.tools,
          spaceshipId: _resolveSpaceshipId(workflow),
          maxSteps: agent?.config?.maxSteps,
        });
        return r?.finalAnswer || 'No response';
      } catch (err) {
        return 'Error: ' + (err?.message || 'Agent execution failed');
      }
    }
    if (typeof ShipLog !== 'undefined') {
      const r = await ShipLog.execute(_resolveSpaceshipId(workflow), agent, prompt);
      return r ? r.content : 'No response';
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

  // Mission DAG runs pass the mission UUID as workflow.id (see
  // MissionRunner._runDag). Mint a synthetic 'mission-<uuid>' scope so
  // ShipLog routes log entries to ship_log.mission_id (column added in
  // migration 20260423190000). Without this, every Inbox-Captain-style
  // run would leak into a random spaceship's log or drop into the local
  // sessionStorage fallback — and the Execution Log would render empty.
  // Falls back to first active ship for editor-driven workflow runs that
  // don't carry a UUID id.
  const _UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function _resolveSpaceshipId(workflow) {
    if (workflow && typeof workflow.id === 'string' && _UUID_RE.test(workflow.id)) {
      return 'mission-' + workflow.id;
    }
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
  async function _executePersonaDispatch(node, input, workflow) {
    const hint = node?.config?.personaHint;
    const voiceContext = _resolvePersonaContext(hint, node);
    if (!voiceContext) return await _executeAgent(node, input, workflow);

    // Clone the node so we don't mutate the workflow graph.
    const mergedPrompt = [voiceContext, node.config?.prompt || node.label || ''].filter(Boolean).join('\n\n');
    const injected = Object.assign({}, node, {
      config: Object.assign({}, node.config, { prompt: mergedPrompt }),
    });
    return await _executeAgent(injected, input, workflow);
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
   * Triage node — picks the best agent from `candidates` for the prompt
   * and runs it. Routing decision is logged to ship_log so the UI /
   * Missions view can surface it.
   *
   * Config:
   *   - candidates: string[]  // agent or blueprint ids; defaults to all
   *                              activated agents in State if omitted
   *   - intent?:    'research' | 'code' | 'analyze' | 'build'  (hint)
   *   - prompt?:    string    // fallback when no upstream input
   *   - routingModel?: string // override for the router LLM call
   */
  async function _executeTriage(node, input, workflow) {
    const cfg = node?.config || {};
    let candidates = Array.isArray(cfg.candidates) ? cfg.candidates.slice() : [];

    if (candidates.length === 0) {
      const stateAgents = typeof State !== 'undefined' ? (State.get('agents') || []) : [];
      candidates = stateAgents.map(a => a.id).filter(Boolean);
    }
    if (candidates.length === 0) return 'Error: No candidate agents for triage';

    const prompt = cfg.prompt || input || node.label || '';

    if (candidates.length === 1) {
      const solo = _resolveAgent(candidates[0]);
      await _logRouting(workflow, solo, 'Only candidate');
      return _runAgent(solo, prompt, workflow);
    }

    // Intent shortcut — direct category match before paying for the LLM
    if (cfg.intent) {
      const intentMap = { research: 'research', code: 'code', analyze: 'data', build: 'ops' };
      const target = intentMap[cfg.intent];
      if (target) {
        const matches = candidates.map(_resolveAgent).filter(a => {
          const role = String((a?.config?.role) || a?.role || a?.category || '').toLowerCase();
          return a && role.includes(target);
        });
        if (matches.length) {
          await _logRouting(workflow, matches[0], 'Matched ' + cfg.intent + ' intent');
          return _runAgent(matches[0], prompt, workflow);
        }
      }
    }

    const decision = await _callRoutingLLM(candidates, prompt, cfg.routingModel);
    const chosen = _resolveAgent(decision.agentId) || _resolveAgent(candidates[0]);
    await _logRouting(workflow, chosen, decision.reasoning);
    return _runAgent(chosen, prompt, workflow);
  }

  /**
   * Pipeline node — executes an ordered sequence of agents. Each step's
   * output flows into the next via the `{input}` placeholder in
   * promptTemplate (or as a plain context block when omitted).
   *
   * Config:
   *   - steps: Array<{ agentId, promptTemplate? }>
   */
  async function _executePipeline(node, input, workflow) {
    const cfg = node?.config || {};
    const steps = Array.isArray(cfg.steps) ? cfg.steps : [];
    if (steps.length === 0) return input || '';

    let current = input || cfg.initialInput || '';

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i] || {};
      const agent = _resolveAgent(step.agentId);
      if (!agent) {
        current = 'Error: Agent not found: ' + step.agentId;
        continue;
      }

      let prompt;
      if (step.promptTemplate) {
        prompt = step.promptTemplate.replace(/\{input\}/g, current);
      } else if (i === 0) {
        prompt = current;
      } else {
        prompt = `Step ${i + 1} in a ${steps.length}-step pipeline. Previous step produced:\n\n${current}\n\nReview, refine, and build on this — don't restart.`;
      }

      try {
        current = await _runAgent(agent, prompt, workflow);
      } catch (err) {
        current = 'Error: ' + (err?.message || err);
      }

      if (typeof ShipLog !== 'undefined') {
        try {
          await ShipLog.append(_resolveSpaceshipId(workflow), {
            agentId: agent.id,
            role: 'assistant',
            content: '[Pipeline ' + (i + 1) + '/' + steps.length + '] ' + String(current).slice(0, 1000),
            metadata: { type: 'pipeline_step', step: i + 1, total: steps.length, agent_id: agent.id, agent_name: agent.name },
          });
        } catch { /* non-critical */ }
      }
    }

    return current;
  }

  /**
   * Parallel node — fans out the same prompt to N agents, then either
   * concatenates their outputs or hands them to a synthesis agent.
   *
   * Config:
   *   - agents:           string[]
   *   - merge:            'concat' | 'summarize'  (default 'concat')
   *   - synthesisAgent?:  string  // required when merge='summarize'
   *   - prompt?:          string
   */
  async function _executeParallel(node, input, workflow) {
    const cfg = node?.config || {};
    const agentIds = Array.isArray(cfg.agents) ? cfg.agents : [];
    if (agentIds.length === 0) return input || '';

    const merge = cfg.merge === 'summarize' ? 'summarize' : 'concat';
    const prompt = cfg.prompt || input || node.label || '';

    const results = await Promise.all(agentIds.map(async (id) => {
      const agent = _resolveAgent(id);
      if (!agent) return { name: id, output: 'Error: Agent not found' };
      try {
        const out = await _runAgent(agent, prompt, workflow);
        return { name: agent.name, output: out };
      } catch (err) {
        return { name: agent.name || id, output: 'Error: ' + (err?.message || err) };
      }
    }));

    const concatenated = results
      .map(r => '## ' + r.name + '\n\n' + r.output)
      .join('\n\n---\n\n');

    if (typeof ShipLog !== 'undefined') {
      try {
        await ShipLog.append(_resolveSpaceshipId(workflow), {
          agentId: null,
          role: 'system',
          content: '[Parallel] ' + results.length + ' agents completed',
          metadata: { type: 'parallel', agent_ids: agentIds, merge },
        });
      } catch { /* non-critical */ }
    }

    if (merge === 'summarize' && cfg.synthesisAgent) {
      const synth = _resolveAgent(cfg.synthesisAgent);
      if (synth) {
        const synthPrompt =
          'You have results from ' + results.length + ' agents working in parallel.\n\n' +
          'Original task:\n' + prompt + '\n\n' +
          concatenated + '\n\n' +
          'Produce a single, unified, polished output that combines the best of each.';
        return _runAgent(synth, synthPrompt, workflow);
      }
    }

    return concatenated;
  }

  /**
   * Quality-loop node — worker drafts, reviewer scores, retry with
   * feedback until threshold or maxIterations.
   *
   * Config:
   *   - worker:        string  // agent id
   *   - reviewer:      string  // agent id
   *   - threshold:     number  // 0.0–1.0 (default 0.8)
   *   - maxIterations: number  // default 3
   *   - prompt?:       string
   */
  async function _executeQualityLoop(node, input, workflow) {
    const cfg = node?.config || {};
    const worker = _resolveAgent(cfg.worker);
    const reviewer = _resolveAgent(cfg.reviewer);
    if (!worker) return 'Error: Worker agent not found';
    if (!reviewer) return 'Error: Reviewer agent not found';

    const threshold = typeof cfg.threshold === 'number' ? cfg.threshold : 0.8;
    const maxIterations = Math.max(1, cfg.maxIterations || 3);
    const originalPrompt = cfg.prompt || input || node.label || '';

    let workerPrompt = originalPrompt;
    let lastOutput = '';
    let lastScore = 0;

    for (let i = 1; i <= maxIterations; i++) {
      try {
        lastOutput = await _runAgent(worker, workerPrompt, workflow);
      } catch (err) {
        lastOutput = 'Error: ' + (err?.message || err);
      }

      const reviewPrompt =
        'You are a quality reviewer. Rate this output on a 0.0–1.0 scale.\n\n' +
        'Original task:\n' + originalPrompt + '\n\n' +
        'Output to review:\n' + String(lastOutput).slice(0, 3000) + '\n\n' +
        'Respond ONLY with JSON: {"score":<0.0-1.0>,"feedback":"specific improvements"}';

      let reviewText = '';
      try {
        reviewText = await _runAgent(reviewer, reviewPrompt, workflow);
      } catch (err) {
        // Reviewer crashed — accept current output rather than retry forever.
        lastScore = threshold;
        break;
      }

      const review = _parseReviewJSON(reviewText);
      lastScore = typeof review.score === 'number' ? review.score : 0;

      if (typeof ShipLog !== 'undefined') {
        try {
          await ShipLog.append(_resolveSpaceshipId(workflow), {
            agentId: worker.id,
            role: 'system',
            content: '[Quality Loop ' + i + '/' + maxIterations + '] score=' + lastScore.toFixed(2) +
              (review.feedback ? ' — ' + String(review.feedback).slice(0, 200) : ''),
            metadata: { type: 'quality_loop', iteration: i, score: lastScore, threshold, worker_id: worker.id, reviewer_id: reviewer.id },
          });
        } catch { /* non-critical */ }
      }

      if (lastScore >= threshold) break;

      if (i < maxIterations) {
        workerPrompt =
          'Your previous attempt scored ' + lastScore.toFixed(2) + ' (target: ' + threshold + ').\n' +
          'Reviewer feedback: ' + (review.feedback || 'No specific feedback.') + '\n\n' +
          'Original task:\n' + originalPrompt + '\n\n' +
          'Your previous output:\n' + String(lastOutput).slice(0, 2000) + '\n\n' +
          'Please improve based on the feedback.';
      }
    }

    return lastOutput;
  }

  /* ── Routing helpers (used by triage) ── */

  async function _callRoutingLLM(candidateIds, prompt, model) {
    if (typeof SB === 'undefined' || !SB.functions) {
      return { agentId: candidateIds[0], reasoning: 'Routing unavailable — defaulting to first candidate' };
    }

    const lines = candidateIds.map(id => {
      const a = _resolveAgent(id);
      const role = (a?.config?.role) || a?.category || 'General';
      const desc = a?.description || '';
      return '- ' + (a?.name || id) + ' (ID: ' + id + ') — ' + role + (desc ? '. ' + desc : '');
    }).join('\n');

    const sys =
      'You are a routing agent. Pick the single best agent for the task.\n\n' +
      '## Candidates\n' + lines + '\n\n' +
      'Respond ONLY with JSON: {"agent_id":"<id>","reasoning":"one sentence"}';

    try {
      const { data, error } = await SB.functions.invoke('nice-ai', {
        body: {
          model: model || 'gemini-2.5-flash',
          messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 256,
        },
      });
      if (error) throw new Error(error?.message || String(error));
      const parsed = _parseJSON(data?.content || '', 'agent_id');
      if (parsed && parsed.agent_id) {
        const matched = candidateIds.indexOf(parsed.agent_id) !== -1 ? parsed.agent_id : candidateIds[0];
        return { agentId: matched, reasoning: parsed.reasoning || 'Selected by router' };
      }
    } catch { /* fall through */ }

    return { agentId: candidateIds[0], reasoning: 'Routing failed — defaulting to first candidate' };
  }

  function _parseJSON(text, requiredKey) {
    if (!text) return null;
    try {
      const parsed = JSON.parse(String(text).trim());
      if (!requiredKey || parsed[requiredKey] != null) return parsed;
    } catch { /* fall through */ }
    if (requiredKey) {
      const re = new RegExp('\\{[\\s\\S]*?"' + requiredKey + '"[\\s\\S]*?\\}');
      const m = String(text).match(re);
      if (m) {
        try { return JSON.parse(m[0]); } catch { /* fall through */ }
      }
    }
    return null;
  }

  function _parseReviewJSON(text) {
    const parsed = _parseJSON(text, 'score');
    if (parsed && typeof parsed.score === 'number') {
      return { score: parsed.score, feedback: parsed.feedback || '' };
    }
    const scoreMatch = String(text || '').match(/"score"\s*:\s*([\d.]+)/);
    const fbMatch = String(text || '').match(/"feedback"\s*:\s*"([^"]+)"/);
    return {
      score: scoreMatch ? parseFloat(scoreMatch[1]) : 0,
      feedback: fbMatch ? fbMatch[1] : '',
    };
  }

  async function _logRouting(workflow, agent, reasoning) {
    if (typeof ShipLog === 'undefined' || !agent) return;
    try {
      await ShipLog.append(_resolveSpaceshipId(workflow), {
        agentId: null,
        role: 'system',
        content: 'Routing to ' + agent.name + ': ' + reasoning,
        metadata: { type: 'routing', chosen_agent_id: agent.id, chosen_agent_name: agent.name, reasoning },
      });
    } catch { /* non-critical */ }
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
   * workflow_runs was retired in the mission ontology migration. Run
   * state now lives entirely on mission_runs (plan_snapshot + node_results
   * columns). MissionRunner owns the write path; this is a no-op kept
   * only for signature compatibility with the existing call site.
   */
  async function _saveRun() { /* no-op — see mission_runs.node_results */ }

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
    _resolveSpaceshipId,
    _executeTriage,
    _executePipeline,
    _executeParallel,
    _executeQualityLoop,
    _resolveAgent,
    _runAgent,
    _parseJSON,
    _parseReviewJSON,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = WorkflowEngine;
