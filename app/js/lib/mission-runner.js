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

    // 2. Find the assigned agent
    let agent = null;
    let agentId = mission.agent_id;
    const agents = State.get('agents') || [];

    // Strategy: agent_id → State lookup → Supabase lookup → spaceship crew → name match
    if (agentId) {
      agent = agents.find(a => a.id === agentId);
      if (!agent && agentId.startsWith('bp-') && typeof BlueprintStore !== 'undefined') {
        const uuid = BlueprintStore.getAgentUuid(agentId);
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
      if (!agent && typeof SB !== 'undefined' && SB.client) {
        try {
          const { data } = await SB.client.from('user_agents').select('*').eq('user_id', user.id).eq('name', mission.agent_name).limit(1);
          if (data?.[0]) agent = data[0];
        } catch {}
      }
    }

    // Build an agent blueprint-like object for ShipLog
    let agentBp = null;
    if (agent) {
      if (agent.blueprint_id && typeof BlueprintStore !== 'undefined' && BlueprintStore.isReady()) {
        agentBp = BlueprintStore.getAgent(agent.blueprint_id);
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
    } else if (mission.agent_name) {
      // Last resort: create a minimal agent config from name alone
      agentBp = {
        id: 'ephemeral-' + Date.now(),
        name: mission.agent_name,
        config: { role: _inferRoleFromName(mission.agent_name), tools: [], llm_engine: 'gemini-2.5-flash', temperature: 0.4 },
        description: '',
        flavor: '',
      };
    }

    // 2b. Resolve model — support NICE Auto
    const blueprintId = agent?.blueprint_id || agentBp?.id || null;
    let modelUsed = agentBp?.config?.llm_engine || agent?.llm_engine || 'gemini-2.5-flash';
    if (modelUsed === 'nice-auto' && blueprintId && typeof ModelIntel !== 'undefined') {
      const enabled = State.get('enabled_models') || {};
      const connected = Object.keys(enabled).filter(k => enabled[k]);
      modelUsed = ModelIntel.bestModel(blueprintId, connected) || 'gemini-2.5-flash';
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
    const hasMediaTools = agentBp?.config?.tools?.some(t => t.includes('generate-image') || t.includes('generate-video') || t.includes('generate-social'));
    const hasVideoTool = agentBp?.config?.tools?.some(t => t.includes('generate-video'));
    const taskMentionsVideo = /\b(video|reel|clip|footage)\b/i.test(mission.title);
    const mediaInstruction = hasMediaTools
      ? '\n\nIMPORTANT: You MUST use your tools to create the actual media. Do NOT just describe what to create — actually call the tools.' +
        (hasVideoTool && taskMentionsVideo ? ' The task asks for VIDEO content — you MUST use the generate-video tool (not generate-image). Call generate-video with the prompt.' : ' Create the deliverable, don\'t plan it.')
      : '';
    const missionPrompt = 'Complete the following task thoroughly and provide the deliverable directly.\n\n' +
      'Task: ' + mission.title + '\n' +
      (mission.priority ? 'Priority: ' + mission.priority + '\n' : '') +
      mediaInstruction +
      '\nProvide a detailed, actionable response. Do not ask clarifying questions — use your best judgment. Execute, don\'t advise.';

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
      // Also pull tools from mission metadata if agent config doesn't have them
      if (agentBp && (!agentBp.config?.tools?.length) && mission.metadata?.tools) {
        if (!agentBp.config) agentBp.config = {};
        agentBp.config.tools = mission.metadata.tools;
      }
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
      // Transition to review (user must approve before it's "completed")
      await SB.db('tasks').update(missionId, {
        status: 'review',
        progress: 100,
        result: result.content,
        approval_status: 'draft',
        metadata,
        updated_at: now,
      });
      _updateLocalMission(missionId, { status: 'review', progress: 100, result: result.content, approval_status: 'draft', metadata });

      // XP awarded on approval, not on generation
      // (Gamification.addXP('complete_mission') moved to approve action)

      // Create notification
      _notify(user.id, 'mission', 'Ready for Review', mission.title + ' — review and approve the results.');

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
      Notify.send({ title, message: body, type: type === 'error' ? 'error' : 'success' });
    }
  }

  /* ── Estimated performance metrics (cost/speed approximation per model) ── */
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

  /* ── Infer agent role from name ── */
  function _inferRoleFromName(name) {
    const n = (name || '').toLowerCase();
    if (n.includes('research') || n.includes('scout') || n.includes('watcher')) return 'Research';
    if (n.includes('code') || n.includes('engineer') || n.includes('tech')) return 'Engineering';
    if (n.includes('content') || n.includes('writer') || n.includes('chef') || n.includes('copy')) return 'Content';
    if (n.includes('market') || n.includes('campaign') || n.includes('social')) return 'Marketing';
    if (n.includes('data') || n.includes('analyst') || n.includes('cost') || n.includes('controller')) return 'Analytics';
    if (n.includes('support') || n.includes('customer')) return 'Support';
    if (n.includes('sales') || n.includes('biz')) return 'Sales';
    if (n.includes('captain') || n.includes('ops') || n.includes('manager') || n.includes('floor')) return 'Ops';
    return 'General';
  }

  /* ── Per-agent XP tracking ── */
  function awardAgentXP(agentId, xp) {
    if (!agentId) return;
    try {
      const stats = JSON.parse(localStorage.getItem('nice-agent-stats') || '{}');
      if (!stats[agentId]) stats[agentId] = { xp: 0, missions: 0, approved: 0, rejected: 0 };
      stats[agentId].xp = (stats[agentId].xp || 0) + xp;
      stats[agentId].missions = (stats[agentId].missions || 0) + 1;
      localStorage.setItem('nice-agent-stats', JSON.stringify(stats));

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
        if (typeof Notify !== 'undefined' && oldRarity !== newRarity) {
          Notify.send({ title: 'Agent Evolved!', message: `${agent.name} evolved to ${newRarity}!`, type: 'success' });
        }
      }
    } catch {}
  }

  function getAgentStats(agentId) {
    try {
      const stats = JSON.parse(localStorage.getItem('nice-agent-stats') || '{}');
      return stats[agentId] || { xp: 0, missions: 0, approved: 0, rejected: 0 };
    } catch { return { xp: 0, missions: 0, approved: 0, rejected: 0 }; }
  }

  return { run, awardAgentXP, getAgentStats };
})();
