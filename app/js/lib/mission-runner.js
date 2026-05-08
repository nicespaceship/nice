/* ═══════════════════════════════════════════════════════════════════
   NICE — Mission Runner
   Executes missions by routing them through the Ship's Log LLM pipeline.
   MissionRunner.run(missionId) → queued → running → completed/failed
═══════════════════════════════════════════════════════════════════ */

const MissionRunner = (() => {

  /* ── Run a mission ── */
  async function run(missionId, opts) {
    if (!missionId) return null;
    const user = State.get('user');
    if (!user) return null;

    // 1. Load the mission
    let mission;
    try {
      mission = await SB.db('mission_runs').get(missionId);
    } catch (err) {
      console.error('[MissionRunner] Failed to load mission:', err.message);
      return null;
    }
    if (!mission) return null;

    // Respect a cancelled row — Run All / Retry / scheduled fires could
    // all land here for a mission the user already cancelled.
    if (mission.status === 'cancelled') return null;

    // 1b. DAG-shape missions (Inbox Captain and future multi-node
    // templates) dispatch through WorkflowEngine. `plan_snapshot` is
    // frozen at enqueue time (mission-composer.js activateMission), so
    // replays stay deterministic even if the template changes later.
    if (_isDagMission(mission)) {
      return await _runDag(mission, user);
    }

    // 2. Find the assigned agent
    let agent = null;
    let agentId = mission.agent_id;
    const agents = State.get('agents') || [];

    // Strategy: agent_id → State lookup → Supabase lookup → spaceship crew → name match
    if (agentId) {
      agent = agents.find(a => a.id === agentId);
      if (!agent && agentId.startsWith('bp-') && typeof Blueprints !== 'undefined') {
        const uuid = Blueprints.getAgentUuid(agentId);
        if (uuid) {
          try { agent = await SB.db('user_agents').get(uuid); } catch {}
        }
        if (!agent) agent = agents.find(a => a.supabase_id === uuid) || agents.find(a => a.id === agentId);
      }
      if (!agent) {
        try { agent = await SB.db('user_agents').get(agentId); } catch {}
      }
    }

    // If no agent_id but has agent_name, find from spaceship crew slots or State
    if (!agent && mission.agent_name) {
      // Check spaceship crew slots first
      const spaceshipName = mission.metadata?.spaceship;
      if (spaceshipName) {
        const stateShips = State.get('spaceships') || [];
        const ship = stateShips.find(s => s.name === spaceshipName);
        if (ship?.slot_assignments) {
          const crewIds = Object.values(ship.slot_assignments);
          const crewAgent = agents.find(a => crewIds.includes(a.id) && a.name === mission.agent_name);
          if (crewAgent) agent = crewAgent;
        }
      }
      // Fallback: find by name in State agents
      if (!agent) agent = agents.find(a => a.name === mission.agent_name);
      // Fallback: search Supabase by name
      if (!agent && typeof SB !== 'undefined') {
        try {
          const results = await SB.db('user_agents').list({ user_id: user.id, name: mission.agent_name, limit: 1 });
          if (results?.[0]) agent = results[0];
        } catch {}
      }
    }

    // Build an agent blueprint-like object for ShipLog.
    // Resolution priority: catalog lookup (always current) → agent's own config.
    // captain_blueprint_id in metadata is set by _runShipChat so captain agents
    // that live only in localStorage (no user_agents row) still get their
    // up-to-date catalog config (model, tools, system_prompt).
    let agentBp = null;
    if (agent) {
      const catalogId = agent.blueprint_id || mission.metadata?.captain_blueprint_id;
      if (catalogId && typeof Blueprints !== 'undefined' && Blueprints.isReady()) {
        const candidate = Blueprints.getAgent(catalogId);
        // Blueprints.getAgent falls through to State/localStorage copies when the ID is
        // a UUID — those are stale activated copies that may have an outdated llm_engine.
        // Only accept if it's a proper catalog slug (not a UUID), so we always get the
        // catalog's current model/tools config.
        const isUUID = candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(candidate.id);
        if (candidate && !isUUID) agentBp = candidate;
      }
      // Name-based catalog fallback: catches wizard-created agents whose IDs are UUIDs.
      // getAgent() returns the stale State copy for those — search catalog by name instead.
      if (!agentBp && agent.name && typeof Blueprints !== 'undefined' && Blueprints.isReady()) {
        const needle = agent.name.toLowerCase();
        agentBp = Blueprints.listAgents().find(a => a.name.toLowerCase() === needle) || null;
      }
      if (!agentBp) {
        const cfg = agent.config || {};
        agentBp = {
          id: agent.id,
          name: agent.name,
          config: {
            role: cfg.role || agent.role || 'General',
            type: cfg.type || agent.type || 'Specialist',
            tools: cfg.tools || [],
            temperature: cfg.temperature || 0.3,
            llm_engine: cfg.llm_engine || agent.llm_engine || 'gemini-2.5-flash',
          },
          description: cfg.description || agent.description || '',
          flavor: '',
        };
      }
    }

    // Fail fast — every Mission Run is on a Ship with a known crew
    // (mission_runs.spaceship_id is NOT NULL post-ontology migration).
    // The three resolution paths above (agent_id → State → Supabase, and
    // agent_name fallback within those) cover every legitimate case. If
    // we still have nothing, the template references an agent that no
    // longer exists — surface that to the user instead of silently
    // running an "ephemeral" agent built from name keywords (which used
    // to mask renamed/deleted blueprints and produce surprising results).
    if (!agentBp) {
      const detail =
        'agent_id=' + (agentId || 'none') +
        ', agent_name=' + (mission.agent_name || 'none');
      const msg =
        'Could not resolve an agent for this mission (' + detail + '). ' +
        'Reassign the mission to an agent on the ship\'s crew, or rebuild ' +
        'the mission template in Mission Composer.';
      const now = new Date().toISOString();
      await SB.db('mission_runs').update(missionId, {
        status: 'failed', result: 'Error: ' + msg, updated_at: now,
      }).catch(() => {});
      _updateLocalMission(missionId, { status: 'failed', result: 'Error: ' + msg });
      _notify(user.id, 'error', 'Mission Failed', mission.title + ' — ' + msg);
      return null;
    }

    // 2b. Resolve model — support NICE Auto
    const blueprintId = agent?.blueprint_id || agentBp?.id || null;
    let modelUsed = agentBp?.config?.llm_engine || agent?.llm_engine || 'gemini-2.5-flash';
    if (modelUsed === 'nice-auto' && blueprintId && typeof ModelIntel !== 'undefined') {
      const enabled = State.get('enabled_models') || {};
      const connected = Object.keys(enabled).filter(k => enabled[k]);
      modelUsed = ModelIntel.bestModel(blueprintId, connected) || 'gemini-2.5-flash';
    }

    // 3. Find a spaceship for context — prefer the mission's explicit spaceship_id
    let spaceshipId = null;
    let _ship = null;
    try {
      if (mission.spaceship_id) {
        _ship = await SB.db('user_spaceships').get(mission.spaceship_id);
        if (_ship) spaceshipId = _ship.id;
      }
      if (!_ship) {
        const ships = await SB.db('user_spaceships').list({ userId: user.id });
        if (ships && ships.length) { _ship = ships[0]; spaceshipId = _ship.id; }
      }
    } catch { /* proceed without spaceship */ }

    // If no spaceship, create a temporary context ID
    if (!spaceshipId) spaceshipId = 'mission-' + missionId;

    // 3b. Enforce maxConcurrent (if configured for this spaceship)
    if (spaceshipId && typeof ShipBehaviors !== 'undefined') {
      const behaviors = ShipBehaviors.getBehaviors(spaceshipId);
      if (behaviors.maxConcurrent > 0) {
        const missions = State.get('missions') || [];
        const runningCount = missions.filter(m => m.status === 'running').length;
        if (runningCount >= behaviors.maxConcurrent) {
          const msg = 'Max concurrent missions reached (' + runningCount + '/' + behaviors.maxConcurrent + '). Mission queued — will run when a slot opens.';
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Mission Queued', message: msg, type: 'info' });
          return null; // stays in queued status
        }
      }
    }

    // 3c. Enforce daily token budget (if configured for this spaceship)
    if (spaceshipId && typeof ShipBehaviors !== 'undefined') {
      const estimatedTokens = 2048; // conservative estimate for a single mission
      if (!ShipBehaviors.checkBudget(spaceshipId, estimatedTokens)) {
        const behaviors = ShipBehaviors.getBehaviors(spaceshipId);
        const failMsg = 'Daily token budget exceeded (' + behaviors.budgetUsedToday + '/' + behaviors.dailyBudget + '). Mission deferred until budget resets.';
        await SB.db('mission_runs').update(missionId, { status: 'failed', result: failMsg, updated_at: new Date().toISOString() }).catch(() => {});
        _updateLocalMission(missionId, { status: 'failed', result: failMsg });
        _notify(user.id, 'warning', 'Budget Exceeded', failMsg);
        return null;
      }
    }

    // 4. Transition to running
    try {
      await SB.db('mission_runs').update(missionId, { status: 'running', progress: 10, updated_at: new Date().toISOString() });
      _updateLocalMission(missionId, { status: 'running', progress: 10 });
    } catch (err) {
      console.warn('[MissionRunner] Status update failed:', err.message);
    }

    // 5. Check if this is a direct video/image generation task — bypass LLM entirely
    const hasVideoTool = agentBp?.config?.tools?.some(t => t.includes('generate-video'));
    const taskMentionsVideo = /\b(video|reel|clip|footage)\b/i.test(mission.title);

    if (hasVideoTool && taskMentionsVideo && typeof MediaTools !== 'undefined') {
      // Direct video generation — don't trust LLM to pick the right tool
      _updateLocalMission(missionId, { status: 'running', progress: 20 });
      try {
        const videoResult = await MediaTools.generate(mission.title, { type: 'video', aspect_ratio: '9:16', duration: 5 });
        if (videoResult && videoResult.url) {
          const resultText = 'Here is your generated video:\n\n[▶ Watch Video](' + videoResult.url + ')\n\n' +
            '**Model:** ' + (videoResult.model || 'veo-2') + '\n' +
            '**Duration:** ' + (videoResult.duration || 5) + 's\n' +
            '**Aspect Ratio:** ' + (videoResult.size || '9:16');
          _updateLocalMission(missionId, { status: 'review', progress: 100, result: resultText, completed_at: new Date().toISOString(), approval_status: 'draft' });
          SB.db('mission_runs').update(missionId, { status: 'review', progress: 100, result: resultText, completed_at: new Date().toISOString(), approval_status: 'draft' }).catch(() => {});
          if (typeof Gamification !== 'undefined') Gamification.addXP('complete_mission');
          return;
        }
      } catch (videoErr) {
        console.warn('[MissionRunner] Direct video generation failed:', videoErr.message, '— falling back to LLM');
      }
    }

    // 5b. Build a directive prompt from the mission title
    const hasMediaTools = agentBp?.config?.tools?.some(t => t.includes('generate-image') || t.includes('generate-video') || t.includes('generate-social'));
    const mediaInstruction = hasMediaTools
      ? '\n\nIMPORTANT: You MUST use your tools to create the actual media. Do NOT just describe what to create — actually call the tools. Create the deliverable, don\'t plan it.'
      : '';
    // Use full input text when available (title is truncated to 60 chars for display)
    const taskText = mission.metadata?.input || mission.title;
    const missionPrompt = 'Complete the following task thoroughly and provide the deliverable directly.\n\n' +
      'Task: ' + taskText + '\n' +
      (mission.priority ? 'Priority: ' + mission.priority + '\n' : '') +
      mediaInstruction +
      '\nProvide a detailed, actionable response. Do not ask clarifying questions — use your best judgment. Execute, don\'t advise.';

    // 6. Execute via Ship's Log
    let progressTimer = null;
    try {
      // Progress ticks
      progressTimer = setInterval(() => {
        const missions = State.get('missions') || [];
        const m = missions.find(t => t.id === missionId);
        if (m && m.status === 'running' && m.progress < 80) {
          const next = Math.min(m.progress + 15, 80);
          _updateLocalMission(missionId, { progress: next });
          SB.db('mission_runs').update(missionId, { progress: next }).catch(() => {});
        }
      }, 2000);

      // Check if agent has tools configured → use AgentExecutor
      // Also pull tools from mission metadata if agent config doesn't have them
      if (agentBp && (!agentBp.config?.tools?.length) && mission.metadata?.tools) {
        if (!agentBp.config) agentBp.config = {};
        agentBp.config.tools = mission.metadata.tools;
      }
      const _hasExplicitTools = agentBp && agentBp.config && agentBp.config.tools && agentBp.config.tools.length > 0;
      const _hasMcpTools = typeof McpBridge !== 'undefined' && ((State.get('mcp_connections') || []).some(c => c.status === 'connected'));
      const _hasTools = _hasExplicitTools || _hasMcpTools;
      let result;

      // Resolve approval mode from ShipBehaviors
      let _approvalMode = null;
      if (spaceshipId && typeof ShipBehaviors !== 'undefined') {
        _approvalMode = ShipBehaviors.getBehaviors(spaceshipId).approvalMode;
      }

      const _stepCallback = (step) => {
        const stepProgress = Math.min(10 + (step.index / (agentBp.config.maxSteps || 5)) * 70, 80);
        _updateLocalMission(missionId, { progress: Math.round(stepProgress) });
        SB.db('mission_runs').update(missionId, { progress: Math.round(stepProgress) }).catch(() => {});
      };

      // Captain with crew → dispatch orchestration loop
      const _crewSlots = _ship && Object.keys(
        _ship.config?.slot_assignments || _ship.slots?.slot_assignments || _ship.slot_assignments || {}
      ).length;
      if (_isCaptainAgent(agentBp) && _crewSlots && typeof AgentExecutor !== 'undefined') {
        // Log a routing-style ship_log entry so the chat UI surfaces the captain's name
        if (typeof ShipLog !== 'undefined') {
          ShipLog.append(spaceshipId, {
            agentId: agentBp.id || null,
            role: 'system',
            content: 'Captain ' + agentBp.name + ' is coordinating your request.',
            metadata: { type: 'routing', chosen_agent_id: agentBp.id, chosen_agent_name: agentBp.name, reasoning: 'Captain dispatch' },
          }).catch(() => {});
        }
        const execResult = await runWithDispatch(agentBp, missionPrompt, _ship, {
          spaceshipId,
          approvalMode: _approvalMode,
          maxSteps: agentBp.config.maxSteps,
          onStep: _stepCallback,
          onDispatchProgress: opts && opts.onDispatchProgress,
        });
        result = {
          content: execResult.finalAnswer,
          agent: agentBp.name,
          agentId: agentBp.id,
          metadata: Object.assign({}, execResult.metadata, { steps: execResult.steps, dispatch_used: true }),
        };
      } else if (_hasTools && typeof AgentExecutor !== 'undefined') {
        const execResult = await AgentExecutor.execute(agentBp, missionPrompt, {
          tools: agentBp.config.tools,
          spaceshipId,
          approvalMode: _approvalMode,
          maxSteps: agentBp.config.maxSteps,
          onStep: _stepCallback,
        });
        result = {
          content: execResult.finalAnswer,
          agent: agentBp.name,
          agentId: agentBp.id,
          metadata: Object.assign({}, execResult.metadata, { steps: execResult.steps }),
        };
      } else {
        result = await ShipLog.execute(spaceshipId, agentBp, missionPrompt);
      }

      clearInterval(progressTimer);

      if (!result || !result.content) throw new Error('Empty response from agent');

      // 6. Transition to completed — log model performance
      const now = new Date().toISOString();
      if (blueprintId && typeof ModelIntel !== 'undefined') {
        ModelIntel.log(blueprintId, modelUsed, { success: true, speedMs: _simSpeed(modelUsed), costTokens: _simCost(modelUsed) });
      }
      const isChatRun = mission.metadata?.source === 'prompt_panel';
      const finalStatus = isChatRun ? 'completed' : 'review';
      const metadata = Object.assign({}, mission.metadata || {}, result.metadata || {}, { completed_at: now, model_used: modelUsed });
      const outcome = _deriveOutcome(mission, result.content);
      const update = {
        status: finalStatus,
        progress: 100,
        result: result.content,
        metadata,
        updated_at: now,
      };
      if (!isChatRun) update.approval_status = 'draft';
      if (isChatRun) update.completed_at = now;
      if (outcome) update.outcome = outcome;
      await SB.db('mission_runs').update(missionId, update);
      _updateLocalMission(missionId, {
        status: finalStatus, progress: 100, result: result.content, metadata,
        ...(isChatRun ? {} : { approval_status: 'draft' }),
        ...(outcome ? { outcome } : {}),
      });

      // Post-execution quality scoring using blueprint eval_criteria
      let qualityReview = null;
      if (typeof QualityGate !== 'undefined' && result.content) {
        const evalCriteria = agentBp?.config?.eval_criteria || agentBp?.eval_criteria;
        const criteria = Array.isArray(evalCriteria) && evalCriteria.length
          ? evalCriteria
          : ['relevance', 'quality', 'completeness'];
        try {
          qualityReview = await QualityGate.review(mission.title, result.content, { criteria });
          metadata.quality_score = qualityReview.score;
          metadata.quality_pass = qualityReview.pass;
          metadata.quality_feedback = qualityReview.feedback;
        } catch { /* non-critical */ }
      }

      // Deduct tokens from spaceship daily budget
      if (spaceshipId && typeof ShipBehaviors !== 'undefined') {
        const tokensUsed = result.metadata?.totalTokens || result.metadata?.tokens_used || 500;
        ShipBehaviors.deductBudget(spaceshipId, tokensUsed);
      }

      // Auto-learn from completed mission (memory updated on approval/rejection)
      if (typeof AgentMemory !== 'undefined' && agentBp && agentBp.id) {
        AgentMemory.learn(agentBp.id, { task: mission.title, content: result.content, metadata: result.metadata }, 'approved');
      }

      // XP awarded on approval, not on generation
      // (Gamification.addXP('complete_mission') moved to approve action)

      if (!isChatRun) {
        _notify(user.id, 'mission', 'Ready for Review', mission.title + ' — review and approve the results.');
      }

      return result;

    } catch (err) {
      if (progressTimer) clearInterval(progressTimer);
      console.error('[MissionRunner] Execution failed:', err.message);

      // Log failure to Model Intelligence
      if (blueprintId && typeof ModelIntel !== 'undefined') {
        ModelIntel.log(blueprintId, modelUsed, { success: false, speedMs: 0, costTokens: 0 });
      }

      // Transition to failed
      const now = new Date().toISOString();
      await SB.db('mission_runs').update(missionId, {
        status: 'failed',
        result: 'Error: ' + (err.message || 'Unknown failure'),
        updated_at: now,
      }).catch(() => {});
      _updateLocalMission(missionId, { status: 'failed', result: 'Error: ' + (err.message || 'Unknown failure') });

      _notify(user.id, 'error', 'Mission Failed', mission.title + ': ' + (err.message || 'Unknown error'));

      return null;
    }
  }

  /* ── DAG detection + dispatch ── */
  // Soft cancel helper: re-reads mission_runs.status between
  // WorkflowEngine nodes. A 'cancelled' result short-circuits the DAG
  // loop. Failures (e.g. DB offline) return false so a flaky read never
  // silently kills a running mission — better to keep going than to
  // abort spuriously. State fallback catches the tests-and-dev-mode
  // case where SB isn't wired.
  async function _isCancelled(missionId) {
    try {
      const row = await SB.db('mission_runs').get(missionId);
      if (row && row.status === 'cancelled') return true;
    } catch { /* ignore */ }
    const missions = State.get('missions') || [];
    const local = missions.find(m => m.id === missionId);
    return !!(local && local.status === 'cancelled');
  }

  function _progressFromNodeResults(nodes, nodeResults) {
    const nonGate = nodes.filter(n => n.type !== 'approval_gate').length || 1;
    const done = Object.keys(nodeResults).filter(id => {
      const n = nodes.find(x => x.id === id);
      return n && n.type !== 'approval_gate';
    }).length;
    return 10 + Math.round((done / nonGate) * 70);
  }

  function _isDagMission(mission) {
    const snap = mission?.plan_snapshot;
    if (!snap || typeof snap !== 'object') return false;
    if (snap.shape === 'dag') return true;
    const nodes = Array.isArray(snap.nodes) ? snap.nodes : [];
    if (nodes.length <= 1) return false;
    // Any gate or persona_dispatch node means DAG regardless of shape hint.
    return nodes.some(n => n && (n.type === 'approval_gate' || n.type === 'persona_dispatch'));
  }

  async function _runDag(mission, user) {
    const missionId = mission.id;
    const snap = mission.plan_snapshot || {};
    const nodes = Array.isArray(snap.nodes) ? snap.nodes : [];
    const edges = Array.isArray(snap.edges) ? snap.edges : [];

    if (!nodes.length) {
      const msg = 'Plan snapshot missing nodes.';
      await SB.db('mission_runs').update(missionId, { status: 'failed', result: 'Error: ' + msg, updated_at: new Date().toISOString() }).catch(() => {});
      _updateLocalMission(missionId, { status: 'failed', result: 'Error: ' + msg });
      _notify(user.id, 'error', 'Mission Failed', mission.title + ': ' + msg);
      return null;
    }

    try {
      await SB.db('mission_runs').update(missionId, { status: 'running', progress: 10, updated_at: new Date().toISOString() });
      _updateLocalMission(missionId, { status: 'running', progress: 10 });
    } catch (err) {
      console.warn('[MissionRunner] DAG status update failed:', err.message);
    }

    // WorkflowEngine expects `connections` — our schema uses `edges`.
    const workflow = { id: missionId, name: mission.title, nodes, connections: edges };
    const nodeResults = {};

    let result;
    try {
      result = await WorkflowEngine.execute(workflow, {
        skipSave: true,
        isCancelled: () => _isCancelled(missionId),
        onNodeComplete: (node, output) => {
          nodeResults[node.id] = output;
          // Rough progress: share the 10→80 band across non-gate nodes.
          const nonGate = nodes.filter(n => n.type !== 'approval_gate').length || 1;
          const done = Object.keys(nodeResults).filter(id => {
            const n = nodes.find(x => x.id === id);
            return n && n.type !== 'approval_gate';
          }).length;
          const pct = Math.min(10 + Math.round((done / nonGate) * 70), 80);
          _updateLocalMission(missionId, { progress: pct });
          SB.db('mission_runs').update(missionId, { progress: pct }).catch(() => {});
        },
      });
    } catch (err) {
      console.error('[MissionRunner] DAG execution failed:', err.message);
      const now = new Date().toISOString();
      await SB.db('mission_runs').update(missionId, { status: 'failed', result: 'Error: ' + (err.message || 'Unknown failure'), updated_at: now }).catch(() => {});
      _updateLocalMission(missionId, { status: 'failed', result: 'Error: ' + (err.message || 'Unknown failure') });
      _notify(user.id, 'error', 'Mission Failed', mission.title + ': ' + (err.message || 'Unknown error'));
      return null;
    }

    const now = new Date().toISOString();
    if (result.status === 'cancelled') {
      // The UI already flipped status to 'cancelled' when the user clicked
      // Cancel. WorkflowEngine broke out of its loop on the next
      // isCancelled() check. Persist whatever nodes finished and stop —
      // don't overwrite the cancelled status or notify (the toast fired
      // at click time).
      await SB.db('mission_runs').update(missionId, {
        progress: Math.min(100, _progressFromNodeResults(nodes, nodeResults)),
        result: result.finalOutput || 'Cancelled.',
        node_results: nodeResults,
        metadata: Object.assign({}, mission.metadata || {}, { dag_status: 'cancelled', completed_at: now }),
        updated_at: now,
      }).catch(() => {});
      return result;
    }

    if (result.status === 'paused') {
      // Gate fired: pause at status='review' so the existing Missions
      // review UI takes over. Approval semantics (approve → resume
      // remaining nodes, reject → terminate) land alongside the S5
      // node-type pass when we have more than one gate per plan to
      // worry about. For S3 the gate is the final node, so approve =
      // complete and reject = cancel.
      await SB.db('mission_runs').update(missionId, {
        status: 'review',
        progress: 100,
        result: result.finalOutput || 'Awaiting captain approval.',
        approval_status: 'draft',
        node_results: nodeResults,
        metadata: Object.assign({}, mission.metadata || {}, { dag_status: 'paused', paused_at: result.pausedAt, completed_at: now }),
        updated_at: now,
      }).catch(() => {});
      _updateLocalMission(missionId, {
        status: 'review',
        progress: 100,
        result: result.finalOutput || 'Awaiting captain approval.',
        approval_status: 'draft',
      });
      _notify(user.id, 'mission', 'Ready for Review', mission.title + ' — review and approve the results.');
      return result;
    }

    if (result.status === 'failed') {
      await SB.db('mission_runs').update(missionId, {
        status: 'failed',
        result: result.finalOutput || 'Error: DAG node failed.',
        node_results: nodeResults,
        updated_at: now,
      }).catch(() => {});
      _updateLocalMission(missionId, { status: 'failed', result: result.finalOutput || 'Error: DAG node failed.' });
      _notify(user.id, 'error', 'Mission Failed', mission.title + ': one or more steps failed');
      return result;
    }

    // Fully completed DAG with no gate. Two terminal states:
    //   - 'completed' for chat-sourced ephemeral runs (user already
    //     saw the answer in the chat monitor — review approval would be
    //     redundant and noisy in the Missions view).
    //   - 'review' for everything else, so the user still signs off on
    //     templated mission output before it's marked complete.
    const isChatRun = mission.metadata?.source === 'prompt_panel';
    const finalStatus = isChatRun ? 'completed' : 'review';
    const dagOutcome = _deriveOutcome(mission, result.finalOutput || '');
    const dagUpdate = {
      status: finalStatus,
      progress: 100,
      result: result.finalOutput || '',
      node_results: nodeResults,
      metadata: Object.assign({}, mission.metadata || {}, { dag_status: 'completed', completed_at: now }),
      updated_at: now,
    };
    if (!isChatRun) dagUpdate.approval_status = 'draft';
    if (isChatRun) dagUpdate.completed_at = now;
    if (dagOutcome) dagUpdate.outcome = dagOutcome;
    await SB.db('mission_runs').update(missionId, dagUpdate).catch(() => {});
    _updateLocalMission(missionId, Object.assign({
      status: finalStatus,
      progress: 100,
      result: result.finalOutput || '',
    }, isChatRun ? {} : { approval_status: 'draft' }, dagOutcome ? { outcome: dagOutcome } : {}));
    if (!isChatRun) {
      _notify(user.id, 'mission', 'Ready for Review', mission.title + ' — review and approve the results.');
    }
    return result;
  }

  /* ── Update local State for immediate UI refresh ── */
  function _updateLocalMission(missionId, updates) {
    const missions = State.get('missions') || [];
    const idx = missions.findIndex(t => t.id === missionId);
    if (idx !== -1) {
      Object.assign(missions[idx], updates);
      State.set('missions', [...missions]);
    }
  }

  /* ── Create a notification entry ── */
  async function _notify(userId, type, title, body) {
    try {
      await SB.db('notifications').create({ user_id: userId, type, title, body });
    } catch { /* non-critical */ }

    if (typeof Notify !== 'undefined') {
      Notify.send({ title, message: body, type: type === 'error' ? 'error' : 'success' });
    }
  }

  /* ── Derive a structured outcome from the mission's final output ──
     Every mission should log what it actually produced ("2 drafts landed"),
     not just "completed: true". The mission's plan_snapshot.outcome_spec
     declares what kind of outcome is expected; this helper parses the
     resultText against that spec and returns the structured outcome row
     we persist into `tasks.outcome`. Returns null when nothing usable —
     e.g. non-DAG missions without an outcome_spec, or result text that
     doesn't match the expected shape. That's fine; outcome is an
     additive column and the UI handles null gracefully. */
  function _deriveOutcome(mission, resultText) {
    if (!mission || !resultText) return null;
    const snap = mission.plan_snapshot;
    const kind = snap && snap.outcome_spec && snap.outcome_spec.kind;
    if (!kind) return null;

    // Parse resultText as JSON (tolerant of markdown fences the agent
    // sometimes wraps the output in)
    let raw = String(resultText).trim();
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    let parsed;
    try { parsed = JSON.parse(match[0]); } catch { return null; }

    if (kind === 'drafts_reviewed') {
      const drafted = Array.isArray(parsed.drafted) ? parsed.drafted : [];
      const skipped = Array.isArray(parsed.skipped) ? parsed.skipped : [];
      const scanned = typeof parsed.threads_scanned === 'number'
        ? parsed.threads_scanned
        : drafted.length + skipped.length;
      if (!drafted.length && !skipped.length && !scanned) return null;
      return {
        kind,
        count: drafted.length,
        scanned,
        items: drafted.map(d => ({
          type: 'gmail_draft',
          id: d.draft_id || d.thread_id || null,
          thread_id: d.thread_id || null,
          subject: d.subject || null,
          from: d.from || null,
        })),
        summary: drafted.length === 0
          ? `Scanned ${scanned} threads — no drafts needed.`
          : `Drafted ${drafted.length} repl${drafted.length === 1 ? 'y' : 'ies'} from ${scanned} threads.`,
      };
    }

    // Unknown kind — stash the parsed JSON in items so no signal is lost
    return { kind, items: [parsed], summary: null };
  }

  /* ── Estimated performance metrics (cost/speed approximation per model) ── */
  function _simSpeed(modelId) {
    const tiers = { 'claude-4-opus': 4500, 'gpt-4o': 3500, 'gemini-2': 3000, 'grok-3': 3800, 'claude-4-sonnet': 2500, 'gpt-4o-mini': 1800, 'gemini-2-flash': 1500, 'grok-3-mini': 2000 };
    const base = tiers[modelId] || 2500;
    return base + Math.round(Math.random() * 2000 - 1000);
  }

  function _simCost(modelId) {
    const tiers = { 'claude-4-opus': 0.15, 'gpt-4o': 0.12, 'gemini-2': 0.08, 'grok-3': 0.10, 'claude-4-sonnet': 0.06, 'gpt-4o-mini': 0.02, 'gemini-2-flash': 0.01, 'grok-3-mini': 0.03 };
    const base = tiers[modelId] || 0.05;
    return +(base + Math.random() * 0.05).toFixed(4);
  }

  /* ═══════════════════════════════════════════════════════════════════
     CAPTAIN DISPATCH PROTOCOL
     Captain LLM response may contain:
       [DISPATCH: <role>] <sub-prompt for that crew member>
     MissionRunner intercepts, runs the slot agent, feeds back:
       [CREW REPORT: <role>]
       <crew agent's answer>
     Captain then synthesizes. Up to MAX_DISPATCH_ROUNDS iterations.
  ═══════════════════════════════════════════════════════════════════ */

  const MAX_DISPATCH_ROUNDS = 3;

  /* Parse all [DISPATCH: slot] sub-prompt pairs from a captain response. */
  function _extractDispatches(text) {
    const results = [];
    // Each dispatch runs until the next [DISPATCH: or end-of-string.
    const re = /\[DISPATCH:\s*([^\]]+)\]\s*([\s\S]*?)(?=\[DISPATCH:|$)/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      const slot = m[1].trim().toLowerCase();
      const subPrompt = m[2].trim();
      if (slot && subPrompt) results.push({ slot, subPrompt });
    }
    return results;
  }

  /* Find the crew agent filling a given slot name/role on a ship.
     Resolution order:
       1. role_type match within slotted agents
       2. name substring match within slotted agents
       3. direct slot-key lookup
       4. capability-based fallback: any activated agent whose tools match
          the role — lets captains dispatch to wired umbrella agents even when
          they're not explicitly in the ship's slot_assignments. */
  function _resolveSlotAgent(ship, slotName, agents) {
    if (!ship || !slotName || !agents) return null;
    const name = slotName.toLowerCase();
    const assignments = ship.config?.slot_assignments || ship.slots?.slot_assignments || ship.slot_assignments || {};

    for (const agentId of Object.values(assignments)) {
      const agent = agents.find(a => a.id === agentId);
      if (!agent) continue;
      const role = (agent.config?.role_type || agent.config?.role || agent.config?.agentRole || '').toLowerCase();
      if (role === name) return agent;
    }

    for (const agentId of Object.values(assignments)) {
      const agent = agents.find(a => a.id === agentId);
      if (!agent) continue;
      if ((agent.name || '').toLowerCase().includes(name)) return agent;
    }

    const directId = assignments[slotName] || assignments[name];
    if (directId) return agents.find(a => a.id === directId) || null;

    return _resolveByCapability(name, agents);
  }

  // Role → required capability_tags. Dispatch resolves a role to a wired
  // agent by intersecting these required tags with the agent's
  // capability_tags (set on the catalog blueprint, see migration
  // 20260507053945_blueprints_capability_tags.sql). An agent matches if
  // any of its tags appears in the required list.
  //
  // Vocabulary is documented in the migration. Keep this map small and
  // role-named — narrative aliases (e.g. "pilot") fall through to the
  // legacy substring matcher below.
  const _ROLE_REQUIRED_CAPS = {
    captain:        [],
    communications: ['email', 'messaging', 'calendar', 'communications'],
    sales:          ['crm', 'sales'],
    engineering:    ['code', 'issues', 'engineering'],
    product:        ['pm', 'issues', 'product', 'docs'],
    operations:     ['pm', 'automation', 'database', 'ops'],
    marketing:      ['marketing', 'messaging', 'media-gen', 'email'],
    analytics:      ['analytics'],
    finance:        ['payments', 'finance'],
    design:         ['design', 'media-gen'],
    research:       ['research', 'web', 'docs'],
    people:         ['messaging'],
    legal:          ['docs'],
    security:       ['observability', 'infrastructure'],
    documentation: ['docs'],
    support:        ['messaging', 'crm'],
  };

  // Legacy fallback. Used when an activated agent's catalog blueprint
  // can't be resolved (custom builds, missing blueprint_id, or the
  // blueprint exists but predates the capability_tags migration).
  // Removed once the soak confirms tag coverage is sufficient.
  const _ROLE_TOOL_HINTS = {
    communications: ['gmail', 'calendar', 'drive', 'outlook', 'sharepoint', 'microsoft', 'slack', 'email'],
    sales:          ['hubspot', 'salesforce', 'crm', 'deal'],
    engineering:    ['github', 'linear', 'jira', 'code', 'deploy'],
    analytics:      ['amplitude', 'bigquery', 'analytics'],
    marketing:      ['hubspot', 'mailchimp', 'klaviyo', 'campaign'],
    finance:        ['stripe', 'billing', 'invoice'],
    product:        ['notion', 'roadmap', 'feature'],
    research:       ['browser', 'web-search', 'search'],
    people:         ['slack', 'hr', 'recruit'],
  };

  // Resolve the capability_tags for an agent at dispatch time. Reads
  // (in order): top-level `capability_tags`, `config.capability_tags`,
  // catalog blueprint via `blueprint_id` or `id`. Returns an empty
  // array when nothing matches — caller falls back to substring
  // matching.
  function _getAgentCapabilityTags(agent) {
    if (!agent) return [];
    if (Array.isArray(agent.capability_tags) && agent.capability_tags.length) {
      return agent.capability_tags;
    }
    const cfgTags = agent.config?.capability_tags;
    if (Array.isArray(cfgTags) && cfgTags.length) return cfgTags;
    if (typeof Blueprints !== 'undefined' && Blueprints.isReady?.()) {
      const ids = [agent.blueprint_id, agent.id].filter(Boolean);
      for (const id of ids) {
        const bp = Blueprints.getAgent(id);
        if (bp && Array.isArray(bp.capability_tags) && bp.capability_tags.length) {
          return bp.capability_tags;
        }
      }
    }
    return [];
  }

  // Find an activated agent whose capability_tags match a role.
  // Falls back to substring-matching tool IDs against _ROLE_TOOL_HINTS
  // when no tagged agent is found (e.g. custom builds without a
  // catalog blueprint). Skips captains and tool-less stubs.
  //
  // Within a tag match, prefers kind='capability' (umbrella) over
  // kind='character' (persona overlay). When both are activated, the
  // umbrella is the canonical dispatch target — characters are only
  // surfaced as crew when they're explicitly slotted on the ship.
  function _resolveByCapability(roleName, agents) {
    if (!agents || !agents.length) return null;
    const requiredTags = _ROLE_REQUIRED_CAPS[roleName];
    if (Array.isArray(requiredTags) && requiredTags.length) {
      const tagMatches = [];
      for (const agent of agents) {
        if (_isCaptainAgent(agent)) continue;
        const tools = agent.config?.tools;
        if (!Array.isArray(tools) || !tools.length) continue;
        const tags = _getAgentCapabilityTags(agent);
        if (!tags.length) continue;
        if (tags.some(t => requiredTags.includes(t))) tagMatches.push(agent);
      }
      if (tagMatches.length) {
        const capability = tagMatches.find(a => _agentKind(a) === 'capability');
        return capability || tagMatches[0];
      }
    }
    const hints = _ROLE_TOOL_HINTS[roleName];
    if (!hints) return null;
    for (const agent of agents) {
      if (_isCaptainAgent(agent)) continue;
      const tools = agent.config?.tools;
      if (!Array.isArray(tools) || !tools.length) continue;
      const toolStr = tools.join(' ').toLowerCase();
      if (hints.some(h => toolStr.includes(h))) return agent;
    }
    return null;
  }

  // Resolve the kind discriminator for an agent at dispatch time.
  // Reads (in order): top-level `kind`, `config.kind`, catalog
  // blueprint via `blueprint_id` or `id`. Returns null when nothing
  // matches — caller treats unknown-kind as character for ranking.
  function _agentKind(agent) {
    if (!agent) return null;
    if (agent.kind) return agent.kind;
    if (agent.config?.kind) return agent.config.kind;
    if (typeof Blueprints !== 'undefined' && Blueprints.isReady?.()) {
      const ids = [agent.blueprint_id, agent.id].filter(Boolean);
      for (const id of ids) {
        const bp = Blueprints.getAgent(id);
        if (bp?.kind) return bp.kind;
      }
    }
    return null;
  }

  /* True when an agent blueprint is the captain/orchestrator of its ship. */
  function _isCaptainAgent(agentBp) {
    if (!agentBp) return false;
    const cfg = agentBp.config || {};
    if (cfg.is_captain) return true;
    const role = (cfg.role_type || cfg.role || cfg.agentRole || '').toLowerCase();
    return role === 'captain' || role === 'commander' || role === 'admiral';
  }

  /* Build the crew manifest block injected into the captain's context. */
  function _buildCrewManifest(ship, crewAgents) {
    if (!crewAgents || !crewAgents.length) return '';
    const lines = [
      'Your crew (dispatch using the role name in lowercase):',
    ];
    for (const agent of crewAgents) {
      const rawRole = agent.config?.role_type || agent.config?.role || agent.config?.agentRole || 'Specialist';
      const role = rawRole.toLowerCase();
      // Default cap to the role itself, not the literal word "Specialist".
      // When every crew line ended in "— Specialist", the LLM treated
      // "specialist" as the canonical dispatch role and emitted
      // [DISPATCH: specialist] regardless of the bracket prefix —
      // _resolveSlotAgent then rejected it as "No agent assigned to slot
      // 'specialist'." Mirroring the role keeps the bracket prefix as
      // the dominant dispatch signal in the prompt.
      const cap = agent.config?.system_prompt
        ? agent.config.system_prompt.substring(0, 100).replace(/\n/g, ' ') + '…'
        : (agent.description || rawRole);
      lines.push('  [' + role + '] ' + agent.name + ' — ' + cap);
    }
    return lines.join('\n');
  }

  /* Categorize a thrown dispatch error so the [CREW REPORT] can carry an
     actionable label the captain knows how to surface. Pre-fix the catch
     block surfaced the raw thrown message verbatim ("Error: AI call
     failed: 503 - Service Unavailable") and the captain's prompt had no
     guidance — Han Solo synthesized provider 503s as "R2 was silent" on
     the 2026-05-07 Falcon dispatch session. Mirrors the categories
     already detected in agent-executor's _isOverloadError, expanded for
     the auth + bad-request bands the user surfaces benefit from naming
     distinctly. */
  function _categorizeDispatchError(err) {
    const msg = String((err && err.message) || err || '');
    if (/\b(503|429)\b|overload|unavailable|high.?demand|rate.?limit|capacity/i.test(msg)) {
      return {
        category: 'PROVIDER_OVERLOADED',
        hint: 'The LLM provider was at capacity. This is transient — retry in 30 seconds.',
      };
    }
    if (/\b(401|403|402)\b|unauthorized|forbidden|invalid.?api.?key|billing|payment.?required|insufficient.?credit/i.test(msg)) {
      return {
        category: 'PROVIDER_AUTH_FAILED',
        hint: 'The LLM provider rejected credentials or billing. The user should check Settings → Wallet or model access.',
      };
    }
    if (/\b400\b|invalid.?request|invalid.?argument|function.?declarations|TYPE_STRING|only.?allowed.?for/i.test(msg)) {
      return {
        category: 'PROVIDER_BAD_REQUEST',
        hint: 'The LLM rejected the schema or prompt. This is a NICE-side bug — surface the underlying message verbatim.',
      };
    }
    return {
      category: 'INTERNAL_ERROR',
      hint: 'Something went wrong inside NICE. Surface the underlying message verbatim.',
    };
  }

  /* Prepend dispatch protocol + crew manifest to the captain's system_prompt. */
  function _injectCaptainContext(captainBp, ship, crewAgents) {
    const manifest = _buildCrewManifest(ship, crewAgents);
    if (!manifest) return captainBp;

    const protocol =
      'DISPATCH PROTOCOL\n' +
      'When a user request requires specialist knowledge, dispatch to a crew member:\n' +
      '  [DISPATCH: <role>] <sub-prompt for that crew member>\n' +
      'You may dispatch to multiple crew members in a single response.\n' +
      'Wait for crew reports, then synthesize them into one clear final answer.\n' +
      'Never include [DISPATCH:] tokens in your synthesized final answer.\n\n' +
      'CREW ERROR REPORTS\n' +
      'If a [CREW REPORT] starts with [ERROR_CATEGORY: <name>], the crew member could NOT complete the dispatch.\n' +
      'Never claim a crew member was "silent", "didn\'t respond", or "had no data" when an ERROR_CATEGORY is present — name the actual category.\n' +
      '  PROVIDER_OVERLOADED — tell the user the LLM provider is overloaded right now and to retry shortly. Do not invent an answer.\n' +
      '  PROVIDER_AUTH_FAILED — tell the user the provider rejected credentials/billing; suggest checking Settings → Wallet.\n' +
      '  PROVIDER_BAD_REQUEST — apologize and surface the underlying error message verbatim; flag it as a NICE-side issue.\n' +
      '  INTERNAL_ERROR — surface the underlying message verbatim.\n' +
      'If EVERY crew report you received is an ERROR_CATEGORY, do not synthesize a fake answer — surface the errors to the user directly.\n\n' +
      manifest;

    const existing = captainBp.config?.system_prompt || '';
    return {
      ...captainBp,
      config: {
        ...captainBp.config,
        system_prompt: protocol + (existing ? '\n\n---\n\n' + existing : ''),
      },
    };
  }

  /* ── Captain dispatch orchestration loop ──
     Runs the captain, intercepts dispatch tokens, runs crew agents in
     parallel, injects [CREW REPORT] blocks, then re-runs the captain
     for synthesis. Repeats up to MAX_DISPATCH_ROUNDS times.

     Returns the same shape as AgentExecutor.execute(). */
  async function runWithDispatch(captainBp, userPrompt, ship, opts) {
    opts = opts || {};
    // Merge user-created agents (State.agents) with activated catalog agents
    // (State.activated-agents). Slot assignments may point to catalog IDs like
    // 'bp-agent-google-workspace' which only exist in the activated-agents list.
    const userAgents = State.get('agents') || [];
    const catalogAgents = State.get('activated-agents') || [];
    const agentMap = new Map();
    userAgents.forEach(a => agentMap.set(a.id, a));
    catalogAgents.forEach(a => { if (!agentMap.has(a.id)) agentMap.set(a.id, a); });
    const agents = [...agentMap.values()];
    const assignments = ship?.config?.slot_assignments || ship?.slots?.slot_assignments || ship?.slot_assignments || {};

    const slottedIds = new Set(Object.values(assignments));
    const crewAgents = Object.values(assignments)
      .map(id => agents.find(a => a.id === id))
      .filter(Boolean)
      .filter(a => !_isCaptainAgent(a));

    // Augment with any activated wired agents that aren't explicitly slotted.
    // When a ship's crew_overrides only has character stubs (tools: []), the
    // captain's manifest would otherwise list no wired agents and would never
    // know to issue [DISPATCH: communications] etc.
    for (const role of Object.keys(_ROLE_REQUIRED_CAPS)) {
      const capable = _resolveByCapability(role, agents);
      if (capable && !slottedIds.has(capable.id) && !crewAgents.find(a => a.id === capable.id)) {
        crewAgents.push(capable);
      }
    }

    const captainWithCtx = _injectCaptainContext(captainBp, ship, crewAgents);

    let crewContext = '';
    let lastResult = null;

    const _progress = opts.onDispatchProgress;

    for (let round = 0; round < MAX_DISPATCH_ROUNDS; round++) {
      const isSynthesis = round > 0;
      if (_progress) {
        _progress({ phase: isSynthesis ? 'synthesizing' : 'coordinating',
                    label: isSynthesis ? 'Synthesizing…' : captainBp.name + ' is coordinating…' });
      }

      const prompt = round === 0
        ? userPrompt
        : userPrompt +
          '\n\n---\nCrew reports received:\n' + crewContext +
          '\n\nSynthesize the crew reports above into a single final answer for the user. ' +
          'Do not include [DISPATCH:] tokens.';

      const execResult = await AgentExecutor.execute(captainWithCtx, prompt, {
        tools: captainBp.config?.tools || [],
        spaceshipId: opts.spaceshipId,
        approvalMode: opts.approvalMode,
        maxSteps: opts.maxSteps || captainBp.config?.maxSteps || 5,
        onStep: opts.onStep,
      });
      lastResult = execResult;

      const dispatches = _extractDispatches(execResult.finalAnswer || '');
      if (!dispatches.length) break;

      // Signal which crew slots are about to be queried (may be multiple)
      if (_progress) {
        const slotNames = dispatches.map(d => {
          const a = _resolveSlotAgent(ship, d.slot, agents);
          return a ? a.name : d.slot;
        });
        _progress({ phase: 'querying', label: 'Querying ' + slotNames.join(', ') + '…' });
      }

      const reports = await Promise.all(dispatches.map(async ({ slot, subPrompt }) => {
        const crewAgent = _resolveSlotAgent(ship, slot, agents);
        if (!crewAgent) {
          return '[CREW REPORT: ' + slot + ']\nNo agent assigned to slot "' + slot + '".';
        }

        // Resolve crew agent → catalog blueprint with the same id-then-name
        // fallback ladder used at the outer-agent layer (mission-runner.run
        // around line 88-103). Slot characters created by ship-setup-wizard
        // carry synthetic blueprint_ids ('n1'..'n12' from the catalog ship
        // crew defs) that don't resolve via Blueprints.getAgent. Without the
        // name fallback the resolver returns the State stub, which has no
        // llm_engine and inherits the global default 'gemini-2.5-flash' —
        // every Gemini 503 surfaces as "R2 silent" because the wired catalog
        // R2-D2 (claude-sonnet-4-6 + 23 GitHub tools) was never picked up.
        let crewBp = null;
        if (typeof Blueprints !== 'undefined' && Blueprints.isReady()) {
          if (crewAgent.blueprint_id) {
            crewBp = Blueprints.getAgent(crewAgent.blueprint_id) || null;
          }
          if (!crewBp && crewAgent.name) {
            const needle = crewAgent.name.toLowerCase();
            crewBp = Blueprints.listAgents().find(a => a.name && a.name.toLowerCase() === needle) || null;
          }
        }
        if (!crewBp) crewBp = crewAgent;

        try {
          const crewResult = await AgentExecutor.execute(crewBp, subPrompt, {
            tools: crewBp.config?.tools,
            spaceshipId: opts.spaceshipId,
            approvalMode: opts.approvalMode,
            maxSteps: (crewBp.config?.maxSteps || 5),
          });
          // Defensive stringify — finalAnswer SHOULD always be a string per
          // AgentExecutor contract, but if anything upstream regresses, the
          // implicit string-coercion of an object produces '[object Object]'
          // verbatim in the captain's context (seen 2026-05-08, M365 path).
          let answer = crewResult.finalAnswer;
          if (answer != null && typeof answer !== 'string') {
            console.warn('[MissionRunner] crewResult.finalAnswer is not a string for slot "' + slot + '" — coercing instead of letting it surface as [object Object]. Type:', typeof answer);
            try { answer = JSON.stringify(answer, null, 2); }
            catch { answer = String(answer); }
          }
          return '[CREW REPORT: ' + slot + ']\n' + (answer || 'No response.');
        } catch (err) {
          // Categorize so the captain's prompt-side guidance can surface
          // the right user-visible message (transient overload vs. auth
          // failure vs. NICE-side bug) instead of synthesizing around a
          // bare "Error:" string. See _categorizeDispatchError for the
          // category vocabulary and DISPATCH PROTOCOL prompt for the
          // captain's response template.
          const { category, hint } = _categorizeDispatchError(err);
          const detail = (err && err.message) || (typeof err === 'string' ? err : 'Unknown error');
          const lines = ['[CREW REPORT: ' + slot + ']', '[ERROR_CATEGORY: ' + category + ']'];
          if (hint) lines.push(hint);
          lines.push('Underlying error: ' + detail);
          return lines.join('\n');
        }
      }));

      crewContext += (crewContext ? '\n\n' : '') + reports.join('\n\n');
    }

    return lastResult;
  }

  /* ── Per-agent XP tracking ── */
  function awardAgentXP(agentId, xp) {
    if (!agentId) return;
    try {
      const stats = JSON.parse(localStorage.getItem(Utils.KEYS.agentStats) || '{}');
      if (!stats[agentId]) stats[agentId] = { xp: 0, missions: 0, approved: 0, rejected: 0 };
      stats[agentId].xp = (stats[agentId].xp || 0) + xp;
      stats[agentId].missions = (stats[agentId].missions || 0) + 1;
      localStorage.setItem(Utils.KEYS.agentStats, JSON.stringify(stats));

      // Check for rarity evolution
      const totalXP = stats[agentId].xp;
      let newRarity = 'Common';
      if (totalXP >= 5000) newRarity = 'Mythic';
      else if (totalXP >= 2000) newRarity = 'Legendary';
      else if (totalXP >= 800) newRarity = 'Epic';
      else if (totalXP >= 200) newRarity = 'Rare';

      // Update agent rarity in State
      const agents = (typeof State !== 'undefined' ? State.get('agents') : null) || [];
      const agent = agents.find(a => a.id === agentId);
      if (agent && agent.rarity !== newRarity) {
        const oldRarity = agent.rarity || 'Common';
        agent.rarity = newRarity;
        State.set('agents', [...agents]);
        // Persist rarity evolution to Supabase
        if (typeof SB !== 'undefined' && SB.isReady() && agent.supabase_id) {
          SB.db('user_agents').update(agent.supabase_id, { rarity: newRarity }).catch(() => {});
        }
        if (typeof Notify !== 'undefined' && oldRarity !== newRarity) {
          Notify.send({ title: 'Agent Evolved!', message: `${agent.name} evolved to ${newRarity}!`, type: 'success' });
        }
      }
    } catch {}
  }

  function getAgentStats(agentId) {
    try {
      const stats = JSON.parse(localStorage.getItem(Utils.KEYS.agentStats) || '{}');
      return stats[agentId] || { xp: 0, missions: 0, approved: 0, rejected: 0 };
    } catch { return { xp: 0, missions: 0, approved: 0, rejected: 0 }; }
  }

  return {
    run,
    runWithDispatch,
    awardAgentXP,
    getAgentStats,
    _isDagMission,
    // Exported for unit tests
    _extractDispatches,
    _resolveSlotAgent,
    _resolveByCapability,
    _getAgentCapabilityTags,
    _agentKind,
    _isCaptainAgent,
    _buildCrewManifest,
    _injectCaptainContext,
    _categorizeDispatchError,
    _ROLE_REQUIRED_CAPS,
  };
})();
