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

    // If intent hint provided, try direct category match first
    if (opts.intent) {
      var intentMap = { research: 'Research', code: 'Code', analyze: 'Data', build: 'Ops' };
      var intentCat = intentMap[opts.intent];
      if (intentCat) {
        var intentMatch = crew.find(function(c) {
          var r = (c.role || c.capabilities || '').toLowerCase();
          return r.includes(intentCat.toLowerCase());
        });
        if (intentMatch) {
          var intentBp = typeof BlueprintStore !== 'undefined' ? BlueprintStore.getAgent(intentMatch.agent_id) : null;
          if (opts.onRouting) opts.onRouting({ agentId: intentMatch.agent_id, agentName: intentMatch.name, reasoning: 'Matched ' + opts.intent + ' intent' });
          var intentResult = await _executeAgent(spaceshipId, intentBp, prompt, opts);
          return {
            routing: { agentId: intentMatch.agent_id, agentName: intentMatch.name, reasoning: 'Matched ' + opts.intent + ' intent → ' + intentMatch.name },
            result: intentResult,
          };
        }
      }
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
        model: 'gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 256,
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

  /**
   * Execute a sequential pipeline — each agent's output feeds into the next.
   * @param {string} spaceshipId
   * @param {Array<string>} agentIds — ordered list of agent IDs to execute
   * @param {string} initialPrompt — the starting task
   * @param {Object} [opts] — { onStep: fn({ step, agentName, input, output }) }
   * @returns {{ steps: Array<{ agentId, agentName, input, output }>, finalResult: string }}
   */
  async function pipeline(spaceshipId, agentIds, initialPrompt, opts) {
    opts = opts || {};
    var steps = [];
    var currentInput = initialPrompt;

    for (var i = 0; i < agentIds.length; i++) {
      var agentId = agentIds[i];
      var bp = typeof BlueprintStore !== 'undefined' ? BlueprintStore.getAgent(agentId) : null;

      // Check custom agents in localStorage
      if (!bp) {
        try {
          var custom = JSON.parse(localStorage.getItem('nice-custom-agents') || '[]');
          bp = custom.find(function(a) { return a.id === agentId; });
        } catch (e) {}
      }

      var agentName = bp ? bp.name : 'Agent ' + (i + 1);

      // Build context-aware prompt for agents after the first
      var agentPrompt = i === 0 ? currentInput :
        'You are step ' + (i + 1) + ' in a pipeline. The previous agent (' +
        steps[i - 1].agentName + ') produced the following output:\n\n' +
        '---\n' + currentInput + '\n---\n\n' +
        'Your task: Review, refine, and enhance this based on your expertise. ' +
        'Build on what was done — don\'t start over.';

      // Notify UI
      if (opts.onStep) {
        opts.onStep({ step: i + 1, total: agentIds.length, agentName: agentName, status: 'running', input: currentInput.substring(0, 200) });
      }

      // Execute this agent
      var result;
      try {
        result = await _executeAgent(spaceshipId, bp, agentPrompt, {});
      } catch (err) {
        result = { content: 'Agent error: ' + (err.message || err), agent: agentName };
      }

      var outputText = typeof result === 'string' ? result :
        (result && result.content) ? (typeof result.content === 'string' ? result.content : JSON.stringify(result.content)) :
        JSON.stringify(result);

      steps.push({
        agentId: agentId,
        agentName: agentName,
        input: currentInput.substring(0, 500),
        output: outputText,
      });

      // Log to Ship's Log
      if (typeof ShipLog !== 'undefined') {
        await ShipLog.append(spaceshipId, {
          agentId: agentId,
          role: 'assistant',
          content: '[Pipeline Step ' + (i + 1) + '/' + agentIds.length + '] ' + outputText.substring(0, 1000),
          metadata: { type: 'pipeline', step: i + 1, total: agentIds.length },
        });
      }

      // Feed output as input to next agent
      currentInput = outputText;

      // Notify UI of completion
      if (opts.onStep) {
        opts.onStep({ step: i + 1, total: agentIds.length, agentName: agentName, status: 'done', output: outputText.substring(0, 200) });
      }
    }

    return {
      steps: steps,
      finalResult: currentInput,
    };
  }

  /**
   * Execute agents in parallel — all receive the same prompt, results collected.
   * @param {string} spaceshipId
   * @param {Array<string>} agentIds
   * @param {string} prompt
   * @param {Object} [opts] — { onResult: fn({ agentName, output }) }
   * @returns {{ results: Array<{ agentId, agentName, output }>, combined: string }}
   */
  async function parallel(spaceshipId, agentIds, prompt, opts) {
    opts = opts || {};

    var promises = agentIds.map(function(agentId) {
      var bp = typeof BlueprintStore !== 'undefined' ? BlueprintStore.getAgent(agentId) : null;
      if (!bp) {
        try {
          var custom = JSON.parse(localStorage.getItem('nice-custom-agents') || '[]');
          bp = custom.find(function(a) { return a.id === agentId; });
        } catch (e) {}
      }
      var agentName = bp ? bp.name : agentId;
      return _executeAgent(spaceshipId, bp, prompt, {})
        .then(function(result) {
          var output = typeof result === 'string' ? result :
            (result && result.content ? (typeof result.content === 'string' ? result.content : JSON.stringify(result.content)) : JSON.stringify(result));
          if (opts.onResult) opts.onResult({ agentName: agentName, output: output.substring(0, 200) });
          if (typeof ShipLog !== 'undefined') {
            ShipLog.append(spaceshipId, { agentId: agentId, role: 'assistant', content: '[Parallel] ' + output.substring(0, 1000), metadata: { type: 'parallel' } });
          }
          return { agentId: agentId, agentName: agentName, output: output };
        })
        .catch(function(err) {
          return { agentId: agentId, agentName: agentName, output: 'Error: ' + (err.message || err) };
        });
    });

    var results = await Promise.all(promises);
    var combined = results.map(function(r) {
      return '### ' + r.agentName + '\n\n' + r.output;
    }).join('\n\n---\n\n');

    return { results: results, combined: combined };
  }

  /**
   * Execute a single agent in a loop until a stop condition or max iterations.
   * Each iteration receives its own output as additional context.
   * @param {string} spaceshipId
   * @param {string} agentId
   * @param {string} prompt
   * @param {Object} [opts]
   *   - maxIterations: number (default 3)
   *   - stopCondition: function(output) → boolean (stop if true)
   *   - onIteration: fn({ iteration, output })
   * @returns {{ iterations: Array<{ iteration, output }>, finalResult: string }}
   */
  async function loop(spaceshipId, agentId, prompt, opts) {
    opts = opts || {};
    var maxIter = opts.maxIterations || 3;
    var bp = typeof BlueprintStore !== 'undefined' ? BlueprintStore.getAgent(agentId) : null;
    if (!bp) {
      try {
        var custom = JSON.parse(localStorage.getItem('nice-custom-agents') || '[]');
        bp = custom.find(function(a) { return a.id === agentId; });
      } catch (e) {}
    }
    var agentName = bp ? bp.name : agentId;

    var iterations = [];
    var currentPrompt = prompt;

    for (var i = 0; i < maxIter; i++) {
      var iterPrompt = i === 0 ? currentPrompt :
        'Iteration ' + (i + 1) + '. Your previous output:\n\n' + iterations[i - 1].output.substring(0, 1000) +
        '\n\nRefine and improve. Be specific about what you changed and why.';

      var result;
      try {
        result = await _executeAgent(spaceshipId, bp, iterPrompt, {});
      } catch (err) {
        result = { content: 'Error: ' + (err.message || err) };
      }

      var output = typeof result === 'string' ? result :
        (result && result.content ? (typeof result.content === 'string' ? result.content : JSON.stringify(result.content)) : JSON.stringify(result));

      iterations.push({ iteration: i + 1, output: output });

      if (typeof ShipLog !== 'undefined') {
        ShipLog.append(spaceshipId, { agentId: agentId, role: 'assistant', content: '[Loop ' + (i + 1) + '/' + maxIter + '] ' + output.substring(0, 800), metadata: { type: 'loop', iteration: i + 1 } });
      }

      if (opts.onIteration) opts.onIteration({ iteration: i + 1, total: maxIter, agentName: agentName, output: output.substring(0, 200) });

      if (opts.stopCondition && opts.stopCondition(output)) break;
    }

    return { iterations: iterations, finalResult: iterations[iterations.length - 1].output };
  }

  /**
   * Hierarchical execution — a "director" agent plans tasks, then specialist agents execute.
   * @param {string} spaceshipId
   * @param {string} directorId — agent that creates the plan
   * @param {Array<string>} specialistIds — agents that execute plan steps
   * @param {string} goal — the high-level goal
   * @param {Object} [opts] — { onStep: fn({ step, agentName, output }) }
   * @returns {{ plan: string, steps: Array<{ agentName, task, output }>, summary: string }}
   */
  async function hierarchical(spaceshipId, directorId, specialistIds, goal, opts) {
    opts = opts || {};

    // 1. Director creates the plan
    var directorBp = typeof BlueprintStore !== 'undefined' ? BlueprintStore.getAgent(directorId) : null;
    if (!directorBp) {
      try {
        var customAgents = JSON.parse(localStorage.getItem('nice-custom-agents') || '[]');
        directorBp = customAgents.find(function(a) { return a.id === directorId; });
      } catch (e) {}
    }

    var planPrompt = 'You are coordinating a team of ' + specialistIds.length + ' agents.\n' +
      'Goal: ' + goal + '\n\n' +
      'Create a numbered task list — one specific task per agent.\n' +
      'Format: "1. [task]\\n2. [task]\\n..." — one line per task, no extra text.';

    var planResult;
    try {
      planResult = await _executeAgent(spaceshipId, directorBp, planPrompt, {});
    } catch (err) {
      planResult = { content: 'Plan: Complete the goal: ' + goal };
    }
    var plan = typeof planResult === 'string' ? planResult :
      (planResult && planResult.content ? (typeof planResult.content === 'string' ? planResult.content : JSON.stringify(planResult.content)) : goal);

    if (typeof ShipLog !== 'undefined') {
      ShipLog.append(spaceshipId, { agentId: directorId, role: 'assistant', content: '[Director Plan] ' + plan.substring(0, 1000), metadata: { type: 'hierarchical', role: 'director' } });
    }

    // 2. Parse tasks from plan
    var taskLines = plan.split('\n').filter(function(l) { return /^\d+\./.test(l.trim()); });
    if (!taskLines.length) taskLines = [goal];

    // 3. Execute each specialist on their task
    var steps = [];
    for (var s = 0; s < specialistIds.length; s++) {
      var specId = specialistIds[s];
      var specBp = typeof BlueprintStore !== 'undefined' ? BlueprintStore.getAgent(specId) : null;
      if (!specBp) {
        try {
          var customAll = JSON.parse(localStorage.getItem('nice-custom-agents') || '[]');
          specBp = customAll.find(function(a) { return a.id === specId; });
        } catch (e) {}
      }
      var specName = specBp ? specBp.name : 'Agent ' + (s + 1);
      var task = taskLines[s] ? taskLines[s].replace(/^\d+\.\s*/, '') : goal;

      if (opts.onStep) opts.onStep({ step: s + 1, total: specialistIds.length, agentName: specName, status: 'running', task: task });

      var specResult;
      try {
        specResult = await _executeAgent(spaceshipId, specBp, 'Your assigned task: ' + task + '\n\nOverall goal: ' + goal, {});
      } catch (err) {
        specResult = { content: 'Error: ' + (err.message || err) };
      }

      var specOutput = typeof specResult === 'string' ? specResult :
        (specResult && specResult.content ? (typeof specResult.content === 'string' ? specResult.content : JSON.stringify(specResult.content)) : JSON.stringify(specResult));

      steps.push({ agentId: specId, agentName: specName, task: task, output: specOutput });

      if (typeof ShipLog !== 'undefined') {
        ShipLog.append(spaceshipId, { agentId: specId, role: 'assistant', content: '[Task: ' + task.substring(0, 60) + '] ' + specOutput.substring(0, 800), metadata: { type: 'hierarchical', role: 'specialist', step: s + 1 } });
      }

      if (opts.onStep) opts.onStep({ step: s + 1, total: specialistIds.length, agentName: specName, status: 'done', output: specOutput.substring(0, 200) });
    }

    // 4. Summary — combine all outputs
    var summary = steps.map(function(step) {
      return '**' + step.agentName + '** — ' + step.task + '\n\n' + step.output;
    }).join('\n\n---\n\n');

    return { plan: plan, steps: steps, summary: summary };
  }

  return { route, pipeline, parallel, loop, hierarchical, buildCrewManifest };
})();
