/* ═══════════════════════════════════════════════════════════════════
   NICE — Mission Router
   Routes tasks from Spaceships (MCP orchestrators) to the optimal
   crew agent using Claude Haiku for intelligent delegation.
═══════════════════════════════════════════════════════════════════ */

const MissionRouter = (() => {

  /**
   * Route a task to the optimal crew agent on a spaceship.
   * @param {string} spaceshipId - Spaceship blueprint ID
   * @param {string} prompt - User's task/message
   * @param {Object} [opts]
   *   - onRouting: function({ agentName, reasoning }) callback when routing decision is made
   *   - onChunk: function(chunk) streaming callback for agent response
   * @returns {{ routing: { agentId, agentName, reasoning }, result: Object }}
   */
  async function route(spaceshipId, prompt, opts) {
    opts = opts || {};

    // Build crew manifest
    var crew = buildCrewManifest(spaceshipId);
    var shipBp = typeof BlueprintStore !== 'undefined' ? BlueprintStore.getSpaceship(spaceshipId) : null;
    if (!shipBp) shipBp = typeof BlueprintStore !== 'undefined' ? BlueprintStore.getSpaceship(spaceshipId.replace(/^bp-/, '')) : null;
    var shipName = shipBp ? shipBp.name : 'Ship';

    // Skip routing if 0 or 1 crew — execute directly
    if (crew.length === 0) {
      var directResult = typeof ShipLog !== 'undefined'
        ? await ShipLog.execute(spaceshipId, null, prompt, { onChunk: opts.onChunk })
        : { content: 'No crew assigned to this spaceship.', agent: 'NICE' };
      return { routing: null, result: directResult };
    }

    if (crew.length === 1) {
      var soloBp = typeof BlueprintStore !== 'undefined' ? BlueprintStore.getAgent(crew[0].agent_id) : null;
      var soloResult = await _executeAgent(spaceshipId, soloBp, prompt, opts);
      return {
        routing: { agentId: crew[0].agent_id, agentName: crew[0].name, reasoning: 'Only crew member' },
        result: soloResult,
      };
    }

    // Call Claude Haiku to decide which crew member handles the task
    var routingDecision;
    var startMs = Date.now();
    try {
      routingDecision = await _callRouter(shipName, crew, prompt);
    } catch (err) {
      console.warn('[MissionRouter] Routing failed, defaulting to slot 0:', err.message || err);
      routingDecision = { agent_id: crew[0].agent_id, reasoning: 'Routing unavailable — defaulting to ' + crew[0].name };
    }

    // Resolve the chosen agent
    var chosenId = routingDecision.agent_id;
    var chosenCrew = crew.find(function(c) { return c.agent_id === chosenId; });
    if (!chosenCrew) {
      chosenCrew = crew[0];
      chosenId = crew[0].agent_id;
      routingDecision.reasoning = 'Agent not found — defaulting to ' + crew[0].name;
    }

    var routingMeta = {
      agentId: chosenId,
      agentName: chosenCrew.name,
      reasoning: routingDecision.reasoning,
    };

    // Notify UI of routing decision
    if (opts.onRouting) opts.onRouting(routingMeta);

    // Log routing decision to Ship's Log
    if (typeof ShipLog !== 'undefined') {
      await ShipLog.append(spaceshipId, {
        agentId: null,
        role: 'system',
        content: 'Routing to ' + chosenCrew.name + ': ' + routingDecision.reasoning,
        metadata: {
          type: 'routing',
          chosen_agent_id: chosenId,
          chosen_agent_name: chosenCrew.name,
          reasoning: routingDecision.reasoning,
          duration_ms: Date.now() - startMs,
        },
      });
    }

    // Execute with the chosen agent
    var chosenBp = typeof BlueprintStore !== 'undefined' ? BlueprintStore.getAgent(chosenId) : null;
    var result = await _executeAgent(spaceshipId, chosenBp, prompt, opts);

    return { routing: routingMeta, result: result };
  }

  /**
   * Build crew manifest from spaceship slot assignments.
   * @param {string} spaceshipId
   * @returns {Array<{ agent_id, name, slot_label, role, capabilities, tools, description }>}
   */
  function buildCrewManifest(spaceshipId) {
    if (typeof BlueprintStore === 'undefined') return [];

    var state = BlueprintStore.getShipState(spaceshipId);
    if (!state || !state.slot_assignments) return [];

    var shipBp = BlueprintStore.getSpaceship(spaceshipId) || BlueprintStore.getSpaceship(spaceshipId.replace(/^bp-/, ''));
    var crewNodes = (shipBp && shipBp.metadata && shipBp.metadata.crew) || (shipBp && shipBp.crew) || [];

    var manifest = [];
    var assignments = state.slot_assignments;

    Object.keys(assignments).forEach(function(slotIdx) {
      var agentId = assignments[slotIdx];
      if (!agentId) return;

      var bp = BlueprintStore.getAgent(agentId);
      if (!bp) return;

      var slotLabel = crewNodes[parseInt(slotIdx)] ? crewNodes[parseInt(slotIdx)].label : 'Crew ' + slotIdx;
      var caps = (bp.metadata && bp.metadata.caps) || bp.caps || [];
      var tools = (bp.config && bp.config.tools) || [];

      manifest.push({
        agent_id: agentId,
        name: bp.name,
        slot_label: slotLabel,
        role: (bp.config && bp.config.role) || bp.category || 'General',
        capabilities: caps,
        tools: tools,
        description: bp.description || '',
      });
    });

    return manifest;
  }

  /* ── Call Claude Haiku for routing decision ── */
  async function _callRouter(shipName, crew, prompt) {
    if (typeof SB === 'undefined' || !SB.functions) {
      throw new Error('SB.functions not available');
    }

    var crewLines = crew.map(function(c) {
      var toolsStr = c.tools.length ? c.tools.join(', ') : 'none';
      var capsStr = c.capabilities.length ? c.capabilities.join('; ') : 'general';
      return '- ' + c.name + ' (ID: ' + c.agent_id + ') — ' + c.role + '. Capabilities: ' + capsStr + '. Tools: ' + toolsStr + '.';
    }).join('\n');

    var systemPrompt = 'You are the AI orchestrator for the spaceship "' + shipName + '".\n' +
      'Analyze the task and route to the best crew member.\n\n' +
      '## Crew\n' + crewLines + '\n\n' +
      'Respond ONLY with JSON: {"agent_id":"...","reasoning":"one sentence why"}';

    var { data, error } = await SB.functions.invoke('nice-ai', {
      body: {
        messages: [{ role: 'user', content: prompt }],
        systemPrompt: systemPrompt,
        config: {
          model: 'claude-haiku-4-5-20251001',
          temperature: 0.2,
          max_tokens: 256,
        },
      },
    });

    if (error) throw new Error(typeof error === 'string' ? error : error.message || 'Routing LLM error');
    if (!data || !data.content) throw new Error('Empty routing response');

    return _parseRoutingResponse(data.content);
  }

  /* ── Parse routing JSON from LLM response ── */
  function _parseRoutingResponse(text) {
    // Try direct JSON parse
    try {
      var parsed = JSON.parse(text.trim());
      if (parsed.agent_id) return parsed;
    } catch (e) { /* fall through */ }

    // Try extracting JSON from markdown code blocks or mixed text
    var jsonMatch = text.match(/\{[\s\S]*?"agent_id"[\s\S]*?\}/);
    if (jsonMatch) {
      try {
        var extracted = JSON.parse(jsonMatch[0]);
        if (extracted.agent_id) return extracted;
      } catch (e) { /* fall through */ }
    }

    // Last resort: regex extract
    var idMatch = text.match(/"agent_id"\s*:\s*"([^"]+)"/);
    var reasonMatch = text.match(/"reasoning"\s*:\s*"([^"]+)"/);
    if (idMatch) {
      return { agent_id: idMatch[1], reasoning: reasonMatch ? reasonMatch[1] : 'Selected by orchestrator' };
    }

    throw new Error('Could not parse routing response: ' + text.substring(0, 100));
  }

  /* ── Execute task with chosen agent ── */
  async function _executeAgent(spaceshipId, agentBp, prompt, opts) {
    var hasTools = agentBp && agentBp.config && agentBp.config.tools && agentBp.config.tools.length > 0;

    if (hasTools && typeof AgentExecutor !== 'undefined') {
      return AgentExecutor.execute(agentBp, prompt, {
        tools: agentBp.config.tools,
        spaceshipId: spaceshipId,
        onStep: opts.onStep,
      });
    }

    if (typeof ShipLog !== 'undefined') {
      return ShipLog.execute(spaceshipId, agentBp, prompt, { onChunk: opts.onChunk });
    }

    return { content: 'No execution engine available.', agent: 'NICE' };
  }

  return { route, buildCrewManifest };
})();
