/* ═══════════════════════════════════════════════════════════════════
   NICE — Mission Runner
   Executes missions by routing them through the Ship's Log LLM pipeline.
   MissionRunner.run(missionId) → queued → running → completed/failed
═══════════════════════════════════════════════════════════════════ */

const MissionRunner = (() => {

  /* ── Run a mission ── */
  async function run(missionId) {
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
        agentBp = Blueprints.getAgent(catalogId);
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
     Resolution order: role_type match → name substring → slot key. */
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
      const role = (agent.config?.role_type || agent.config?.role || 'specialist').toLowerCase();
      const cap = agent.config?.system_prompt
        ? agent.config.system_prompt.substring(0, 100).replace(/\n/g, ' ') + '…'
        : (agent.description || 'Specialist');
      lines.push('  [' + role + '] ' + agent.name + ' — ' + cap);
    }
    return lines.join('\n');
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
    const agents = State.get('agents') || [];
    const assignments = ship?.config?.slot_assignments || ship?.slots?.slot_assignments || ship?.slot_assignments || {};

    const crewAgents = Object.values(assignments)
      .map(id => agents.find(a => a.id === id))
      .filter(Boolean)
      .filter(a => !_isCaptainAgent(a));

    const captainWithCtx = _injectCaptainContext(captainBp, ship, crewAgents);

    let crewContext = '';
    let lastResult = null;

    for (let round = 0; round < MAX_DISPATCH_ROUNDS; round++) {
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

      const reports = await Promise.all(dispatches.map(async ({ slot, subPrompt }) => {
        const crewAgent = _resolveSlotAgent(ship, slot, agents);
        if (!crewAgent) {
          return '[CREW REPORT: ' + slot + ']\nNo agent assigned to slot "' + slot + '".';
        }

        let crewBp = crewAgent;
        if (crewAgent.blueprint_id && typeof Blueprints !== 'undefined' && Blueprints.isReady()) {
          crewBp = Blueprints.getAgent(crewAgent.blueprint_id) || crewAgent;
        }

        try {
          const crewResult = await AgentExecutor.execute(crewBp, subPrompt, {
            tools: crewBp.config?.tools,
            spaceshipId: opts.spaceshipId,
            approvalMode: opts.approvalMode,
            maxSteps: (crewBp.config?.maxSteps || 5),
          });
          return '[CREW REPORT: ' + slot + ']\n' + (crewResult.finalAnswer || 'No response.');
        } catch (err) {
          return '[CREW REPORT: ' + slot + ']\nError: ' + (err.message || 'Unknown error');
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
    _isCaptainAgent,
    _buildCrewManifest,
    _injectCaptainContext,
  };
})();
