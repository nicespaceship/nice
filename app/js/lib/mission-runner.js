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
      mission = await SB.db('tasks').get(missionId);
    } catch (err) {
      console.error('[MissionRunner] Failed to load mission:', err.message);
      return null;
    }
    if (!mission) return null;

    // 2. Find the assigned agent (resolve bp- IDs to Supabase UUIDs)
    let agent = null;
    let agentId = mission.agent_id;
    if (agentId) {
      const agents = State.get('agents') || [];
      agent = agents.find(a => a.id === agentId);
      // If agent_id is a local bp- ID, try resolving to Supabase UUID
      if (!agent && agentId.startsWith('bp-') && typeof BlueprintStore !== 'undefined') {
        const uuid = BlueprintStore.getAgentUuid(agentId);
        if (uuid) {
          try { agent = await SB.db('user_agents').get(uuid); } catch { /* proceed without */ }
        }
        // Also check State by supabase_id
        if (!agent) agent = agents.find(a => a.supabase_id === uuid) || agents.find(a => a.id === agentId);
      }
      if (!agent) {
        try {
          agent = await SB.db('user_agents').get(agentId);
        } catch { /* proceed without agent */ }
      }
    }

    // Build an agent blueprint-like object for ShipLog
    let agentBp = null;
    if (agent) {
      // If agent has a blueprint_id, resolve the full blueprint
      if (agent.blueprint_id && typeof BlueprintStore !== 'undefined' && BlueprintStore.isReady()) {
        agentBp = BlueprintStore.getAgent(agent.blueprint_id);
      }
      if (!agentBp) {
        agentBp = { id: agent.id, name: agent.name, config: agent.config || { role: agent.role || 'General' }, flavor: '' };
      }
    }

    // 2b. Resolve model — support NICE Auto
    const blueprintId = agent?.blueprint_id || agentBp?.id || null;
    let modelUsed = agentBp?.config?.llm_engine || agent?.llm_engine || 'claude-4-opus';
    if (modelUsed === 'nice-auto' && blueprintId && typeof ModelIntel !== 'undefined') {
      const enabled = State.get('enabled_models') || {};
      const connected = Object.keys(enabled).filter(k => enabled[k]);
      modelUsed = ModelIntel.bestModel(blueprintId, connected) || 'claude-4-opus';
    }

    // 3. Find a spaceship for context (use first active ship, or null)
    let spaceshipId = null;
    try {
      const ships = await SB.db('user_spaceships').list({ userId: user.id });
      if (ships && ships.length) spaceshipId = ships[0].id;
    } catch { /* proceed without spaceship */ }

    // If no spaceship, create a temporary context ID
    if (!spaceshipId) spaceshipId = 'mission-' + missionId;

    // 4. Transition to running
    try {
      await SB.db('tasks').update(missionId, { status: 'running', progress: 10, updated_at: new Date().toISOString() });
      _updateLocalMission(missionId, { status: 'running', progress: 10 });
    } catch (err) {
      console.warn('[MissionRunner] Status update failed:', err.message);
    }

    // 5. Build a directive prompt from the mission title
    const missionPrompt = 'Complete the following task thoroughly and provide the deliverable directly.\n\n' +
      'Task: ' + mission.title + '\n' +
      (mission.priority ? 'Priority: ' + mission.priority + '\n' : '') +
      '\nProvide a detailed, actionable response. Do not ask clarifying questions — use your best judgment.';

    // 6. Execute via Ship's Log
    try {
      // Progress ticks
      const progressTimer = setInterval(() => {
        const missions = State.get('missions') || [];
        const m = missions.find(t => t.id === missionId);
        if (m && m.status === 'running' && m.progress < 80) {
          const next = Math.min(m.progress + 15, 80);
          _updateLocalMission(missionId, { progress: next });
          SB.db('tasks').update(missionId, { progress: next }).catch(() => {});
        }
      }, 2000);

      // Check if agent has tools configured → use AgentExecutor
      const _hasTools = agentBp && agentBp.config && agentBp.config.tools && agentBp.config.tools.length > 0;
      let result;

      if (_hasTools && typeof AgentExecutor !== 'undefined') {
        const execResult = await AgentExecutor.execute(agentBp, missionPrompt, {
          tools: agentBp.config.tools,
          spaceshipId,
          onStep: (step) => {
            // Update progress based on steps
            const stepProgress = Math.min(10 + (step.index / (agentBp.config.maxSteps || 5)) * 70, 80);
            _updateLocalMission(missionId, { progress: Math.round(stepProgress) });
            SB.db('tasks').update(missionId, { progress: Math.round(stepProgress) }).catch(() => {});
          },
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
      const metadata = Object.assign({}, mission.metadata || {}, result.metadata || {}, { completed_at: now, model_used: modelUsed });
      await SB.db('tasks').update(missionId, {
        status: 'completed',
        progress: 100,
        result: result.content,
        metadata,
        updated_at: now,
      });
      _updateLocalMission(missionId, { status: 'completed', progress: 100, result: result.content, metadata });

      // Award XP
      if (typeof Gamification !== 'undefined') Gamification.addXP('complete_mission');

      // Create notification
      _notify(user.id, 'mission', 'Mission Complete', mission.title + ' finished successfully.');

      return result;

    } catch (err) {
      console.error('[MissionRunner] Execution failed:', err.message);

      // Log failure to Model Intelligence
      if (blueprintId && typeof ModelIntel !== 'undefined') {
        ModelIntel.log(blueprintId, modelUsed, { success: false, speedMs: 0, costTokens: 0 });
      }

      // Transition to failed
      const now = new Date().toISOString();
      await SB.db('tasks').update(missionId, {
        status: 'failed',
        result: 'Error: ' + (err.message || 'Unknown failure'),
        updated_at: now,
      }).catch(() => {});
      _updateLocalMission(missionId, { status: 'failed', result: 'Error: ' + (err.message || 'Unknown failure') });

      _notify(user.id, 'error', 'Mission Failed', mission.title + ': ' + (err.message || 'Unknown error'));

      return null;
    }
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
      Notify.send(title, type === 'error' ? 'error' : 'success');
    }
  }

  /* ── Simulated performance metrics (placeholder until real LLM calls) ── */
  function _simSpeed(modelId) {
    const tiers = { 'claude-4-opus': 4500, 'gpt-4o': 3500, 'gemini-2': 3000, 'mistral-large': 3200, 'grok-3': 3800, 'claude-4-sonnet': 2500, 'gpt-4o-mini': 1800, 'gemini-2-flash': 1500, 'codestral': 2200, 'grok-3-mini': 2000, 'sonar-pro': 3000, 'sonar': 1800, 'deepseek-chat': 2000, 'deepseek-reasoner': 5000 };
    const base = tiers[modelId] || 2500;
    return base + Math.round(Math.random() * 2000 - 1000);
  }

  function _simCost(modelId) {
    const tiers = { 'claude-4-opus': 0.15, 'gpt-4o': 0.12, 'gemini-2': 0.08, 'mistral-large': 0.08, 'grok-3': 0.10, 'claude-4-sonnet': 0.06, 'gpt-4o-mini': 0.02, 'gemini-2-flash': 0.01, 'codestral': 0.04, 'grok-3-mini': 0.03, 'sonar-pro': 0.05, 'sonar': 0.01, 'deepseek-chat': 0.01, 'deepseek-reasoner': 0.06 };
    const base = tiers[modelId] || 0.05;
    return +(base + Math.random() * 0.05).toFixed(4);
  }

  return { run };
})();
