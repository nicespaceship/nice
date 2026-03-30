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
    var crewNodes = (typeof BlueprintUtils !== 'undefined') ? BlueprintUtils.getCrewDefs(shipBp) : ((shipBp && shipBp.metadata && shipBp.metadata.crew) || (shipBp && shipBp.crew) || []);

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

  /* ── Helper: resolve agent blueprint by ID (BlueprintStore + localStorage custom agents) ── */
  function _resolveAgent(agentId) {
    var bp = typeof BlueprintStore !== 'undefined' ? BlueprintStore.getAgent(agentId) : null;
    if (!bp) {
      try {
        var custom = JSON.parse(localStorage.getItem('nice-custom-agents') || '[]');
        bp = custom.find(function(a) { return a.id === agentId; }) || null;
      } catch (e) {}
    }
    return bp;
  }

  /* ── Helper: extract text content from an execution result ── */
  function _extractText(result) {
    if (typeof result === 'string') return result;
    if (result && result.content) {
      return typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
    }
    return JSON.stringify(result);
  }

  /* ── Helper: parse JSON from LLM text (handles markdown fences, mixed text) ── */
  function _parseJSON(text, requiredKey) {
    try {
      var parsed = JSON.parse(text.trim());
      if (!requiredKey || parsed[requiredKey]) return parsed;
    } catch (e) { /* fall through */ }

    var pattern = new RegExp('\\{[\\s\\S]*?"' + (requiredKey || '') + '"[\\s\\S]*?\\}');
    var match = text.match(pattern);
    if (match) {
      try { return JSON.parse(match[0]); } catch (e) { /* fall through */ }
    }
    return null;
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
      var bp = _resolveAgent(agentId);
      var agentName = bp ? bp.name : 'Agent ' + (i + 1);

      // Build context-aware prompt for agents after the first
      var agentPrompt = i === 0 ? currentInput :
        'You are step ' + (i + 1) + ' in a pipeline. The previous agent (' +
        steps[i - 1].agentName + ') produced the following output:\n\n' +
        '---\n' + currentInput + '\n---\n\n' +
        'Your task: Review, refine, and enhance this based on your expertise. ' +
        'Build on what was done — don\'t start over.';

      if (opts.onStep) {
        opts.onStep({ step: i + 1, total: agentIds.length, agentName: agentName, status: 'running', input: currentInput.substring(0, 200) });
      }

      var result;
      try {
        result = await _executeAgent(spaceshipId, bp, agentPrompt, {});
      } catch (err) {
        result = { content: 'Agent error: ' + (err.message || err), agent: agentName };
      }

      var outputText = _extractText(result);

      steps.push({
        agentId: agentId,
        agentName: agentName,
        input: currentInput.substring(0, 500),
        output: outputText,
      });

      if (typeof ShipLog !== 'undefined') {
        await ShipLog.append(spaceshipId, {
          agentId: agentId,
          role: 'assistant',
          content: '[Pipeline Step ' + (i + 1) + '/' + agentIds.length + '] ' + outputText.substring(0, 1000),
          metadata: { type: 'pipeline', step: i + 1, total: agentIds.length },
        });
      }

      currentInput = outputText;

      if (opts.onStep) {
        opts.onStep({ step: i + 1, total: agentIds.length, agentName: agentName, status: 'done', output: outputText.substring(0, 200) });
      }
    }

    return { steps: steps, finalResult: currentInput };
  }

  /**
   * Run all agents simultaneously on the same prompt and merge results.
   * @param {string} spaceshipId
   * @param {Array<string>} agentIds — agents to run in parallel
   * @param {string} prompt
   * @param {Object} [opts] — { onStep: fn({ agentName, status }) }
   * @returns {{ results: Array<{ agentId, agentName, output }>, mergedResult: string }}
   */
  async function parallel(spaceshipId, agentIds, prompt, opts) {
    opts = opts || {};

    var promises = agentIds.map(function(agentId) {
      var bp = _resolveAgent(agentId);
      var agentName = bp ? bp.name : agentId;

      if (opts.onStep) opts.onStep({ agentId: agentId, agentName: agentName, status: 'running' });

      return _executeAgent(spaceshipId, bp, prompt, {})
        .then(function(result) {
          if (opts.onStep) opts.onStep({ agentId: agentId, agentName: agentName, status: 'done' });
          return { agentId: agentId, agentName: agentName, output: _extractText(result) };
        })
        .catch(function(err) {
          if (opts.onStep) opts.onStep({ agentId: agentId, agentName: agentName, status: 'error' });
          return { agentId: agentId, agentName: agentName, output: 'Error: ' + (err.message || err) };
        });
    });

    var results = await Promise.all(promises);

    var mergedResult = results.map(function(r) {
      return '## ' + r.agentName + '\n\n' + r.output;
    }).join('\n\n---\n\n');

    if (typeof ShipLog !== 'undefined') {
      await ShipLog.append(spaceshipId, {
        agentId: null,
        role: 'system',
        content: '[Parallel] ' + results.length + ' agents completed. Merged output (' + mergedResult.length + ' chars).',
        metadata: { type: 'parallel', agent_count: results.length, agent_ids: agentIds },
      });
    }

    return { results: results, mergedResult: mergedResult };
  }

  /**
   * Triage agent analyzes the prompt and dispatches to one or more specialists.
   * @param {string} spaceshipId
   * @param {string} triageAgentId — the agent that decides who handles the task
   * @param {Array<string>} specialistIds — available specialist agent IDs
   * @param {string} prompt
   * @param {Object} [opts] — { onRouting, onStep }
   * @returns {{ triage: { selectedIds, reasoning }, results: Array<{ agentId, agentName, output }>, mergedResult: string }}
   */
  async function routerPattern(spaceshipId, triageAgentId, specialistIds, prompt, opts) {
    opts = opts || {};

    // Build specialist descriptions for triage prompt
    var specialists = specialistIds.map(function(id) {
      var bp = _resolveAgent(id);
      var name = bp ? bp.name : id;
      var role = (bp && bp.config && bp.config.role) || (bp && bp.category) || 'General';
      var desc = (bp && bp.description) || '';
      return { id: id, name: name, role: role, description: desc };
    });

    var specLines = specialists.map(function(s) {
      return '- ' + s.name + ' (ID: ' + s.id + ') — ' + s.role + '. ' + s.description;
    }).join('\n');

    var triageSystemPrompt = 'You are a triage agent. Analyze this task and decide which specialist(s) should handle it.\n\n' +
      '## Available Specialists\n' + specLines + '\n\n' +
      'You may select one or more specialists. ' +
      'Respond ONLY with JSON: {"agent_ids":["id1","id2"],"reasoning":"why these specialists"}';

    var triageResult;
    try {
      if (typeof SB === 'undefined' || !SB.functions) throw new Error('SB.functions not available');

      var resp = await SB.functions.invoke('nice-ai', {
        body: {
          model: 'gemini-2.5-flash',
          messages: [
            { role: 'system', content: triageSystemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: 0.2,
          max_tokens: 256,
        },
      });

      if (resp.error) throw new Error(typeof resp.error === 'string' ? resp.error : resp.error.message || 'Triage LLM error');
      if (!resp.data || !resp.data.content) throw new Error('Empty triage response');

      var parsed = _parseJSON(resp.data.content, 'agent_ids');
      if (!parsed) throw new Error('Could not parse triage response');

      var selectedIds = (parsed.agent_ids || []).filter(function(id) {
        return specialistIds.indexOf(id) !== -1;
      });
      if (selectedIds.length === 0) selectedIds = [specialistIds[0]];

      triageResult = { selectedIds: selectedIds, reasoning: parsed.reasoning || 'Selected by triage' };
    } catch (err) {
      console.warn('[MissionRouter] Triage failed, defaulting to first specialist:', err.message || err);
      triageResult = { selectedIds: [specialistIds[0]], reasoning: 'Triage unavailable — defaulting to first specialist' };
    }

    if (opts.onRouting) opts.onRouting(triageResult);

    // Execute selected specialists in parallel
    var execPromises = triageResult.selectedIds.map(function(agentId) {
      var bp = _resolveAgent(agentId);
      var agentName = bp ? bp.name : agentId;

      if (opts.onStep) opts.onStep({ agentId: agentId, agentName: agentName, status: 'running' });

      return _executeAgent(spaceshipId, bp, prompt, {})
        .then(function(result) {
          if (opts.onStep) opts.onStep({ agentId: agentId, agentName: agentName, status: 'done' });
          return { agentId: agentId, agentName: agentName, output: _extractText(result) };
        })
        .catch(function(err) {
          if (opts.onStep) opts.onStep({ agentId: agentId, agentName: agentName, status: 'error' });
          return { agentId: agentId, agentName: agentName, output: 'Error: ' + (err.message || err) };
        });
    });

    var results = await Promise.all(execPromises);

    var mergedResult = results.map(function(r) {
      return '## ' + r.agentName + '\n\n' + r.output;
    }).join('\n\n---\n\n');

    if (typeof ShipLog !== 'undefined') {
      await ShipLog.append(spaceshipId, {
        agentId: null,
        role: 'system',
        content: '[RouterPattern] Triage selected ' + triageResult.selectedIds.length + ' specialist(s): ' + triageResult.reasoning,
        metadata: { type: 'router_pattern', triage_agent: triageAgentId, selected_ids: triageResult.selectedIds, reasoning: triageResult.reasoning },
      });
    }

    return { triage: triageResult, results: results, mergedResult: mergedResult };
  }

  /**
   * Run an agent in a quality-checked loop with reviewer feedback.
   * Agent runs, reviewer scores output, if below threshold agent retries with feedback.
   * @param {string} spaceshipId
   * @param {string} agentId — the agent to run
   * @param {string} prompt
   * @param {Object} [opts] — { threshold: number (default 7), maxIterations: number (default 3), onStep }
   * @returns {{ iterations: number, finalResult: string, qualityScore: number }}
   */
  async function loop(spaceshipId, agentId, prompt, opts) {
    opts = opts || {};
    var threshold = opts.threshold || 7;
    var maxIterations = opts.maxIterations || 3;
    var bp = _resolveAgent(agentId);
    var agentName = bp ? bp.name : agentId;

    var currentPrompt = prompt;
    var lastOutput = '';
    var qualityScore = 0;
    var iterations = 0;

    for (var i = 1; i <= maxIterations; i++) {
      iterations = i;

      if (opts.onStep) opts.onStep({ iteration: i, maxIterations: maxIterations, agentName: agentName, status: 'executing' });

      // Execute agent
      var result;
      try {
        result = await _executeAgent(spaceshipId, bp, currentPrompt, {});
      } catch (err) {
        result = { content: 'Agent error: ' + (err.message || err), agent: agentName };
      }
      lastOutput = _extractText(result);

      if (opts.onStep) opts.onStep({ iteration: i, maxIterations: maxIterations, agentName: agentName, status: 'reviewing' });

      // Quality review via Gemini Flash
      var reviewSystemPrompt = 'You are a quality reviewer. Rate the following output on a scale of 1-10.\n\n' +
        '## Original Task\n' + prompt + '\n\n' +
        '## Agent Output\n' + lastOutput.substring(0, 3000) + '\n\n' +
        'Respond ONLY with JSON: {"score":N,"feedback":"specific improvements needed"}';

      try {
        if (typeof SB === 'undefined' || !SB.functions) throw new Error('SB.functions not available');

        var reviewResp = await SB.functions.invoke('nice-ai', {
          body: {
            model: 'gemini-2.5-flash',
            messages: [
              { role: 'system', content: reviewSystemPrompt },
              { role: 'user', content: 'Rate the output quality.' },
            ],
            temperature: 0.3,
            max_tokens: 256,
          },
        });

        if (reviewResp.error) throw new Error(typeof reviewResp.error === 'string' ? reviewResp.error : reviewResp.error.message || 'Review LLM error');
        if (!reviewResp.data || !reviewResp.data.content) throw new Error('Empty review response');

        var review = _parseJSON(reviewResp.data.content, 'score');
        if (!review) review = { score: 5, feedback: 'Could not parse review' };

        qualityScore = typeof review.score === 'number' ? review.score : 5;
        var feedback = review.feedback || '';

        if (opts.onStep) opts.onStep({ iteration: i, maxIterations: maxIterations, agentName: agentName, status: 'reviewed', score: qualityScore });

        // If quality meets threshold, stop
        if (qualityScore >= threshold) break;

        // If iterations remain, build retry prompt with feedback
        if (i < maxIterations) {
          currentPrompt = 'Your previous attempt scored ' + qualityScore + '/10. Feedback: ' + feedback + '\n\n' +
            'Original task: ' + prompt + '\n\n' +
            'Your previous output:\n' + lastOutput.substring(0, 2000) + '\n\n' +
            'Please improve your response based on the feedback.';
        }
      } catch (reviewErr) {
        console.warn('[MissionRouter] Review failed, accepting output:', reviewErr.message || reviewErr);
        qualityScore = threshold; // Accept on review failure
        break;
      }
    }

    if (typeof ShipLog !== 'undefined') {
      await ShipLog.append(spaceshipId, {
        agentId: agentId,
        role: 'system',
        content: '[Loop] ' + agentName + ' completed after ' + iterations + ' iteration(s). Quality: ' + qualityScore + '/10.',
        metadata: { type: 'loop', iterations: iterations, quality_score: qualityScore, agent_id: agentId },
      });
    }

    return { iterations: iterations, finalResult: lastOutput, qualityScore: qualityScore };
  }

  /**
   * Captain decomposes task into subtasks, assigns to crew, collects results, synthesizes final output.
   * @param {string} spaceshipId
   * @param {string} captainId — the captain/lead agent who plans and synthesizes
   * @param {Array<string>} crewIds — available crew agent IDs
   * @param {string} prompt
   * @param {Object} [opts] — { onStep }
   * @returns {{ plan: Array<{ agentId, agentName, subtask }>, results: Array<{ agentId, agentName, subtask, output }>, synthesis: string }}
   */
  async function hierarchical(spaceshipId, captainId, crewIds, prompt, opts) {
    opts = opts || {};

    // Build crew descriptions for the captain
    var crewDescs = crewIds.map(function(id) {
      var bp = _resolveAgent(id);
      var name = bp ? bp.name : id;
      var role = (bp && bp.config && bp.config.role) || (bp && bp.category) || 'General';
      var desc = (bp && bp.description) || '';
      return { id: id, name: name, role: role, description: desc };
    });

    var crewLines = crewDescs.map(function(c) {
      return '- ' + c.name + ' (ID: ' + c.id + ') — ' + c.role + '. ' + c.description;
    }).join('\n');

    if (opts.onStep) opts.onStep({ phase: 'planning', status: 'running' });

    // Captain creates task plan via LLM
    var planSystemPrompt = 'You are a team captain. Decompose this task into subtasks and assign each to the best crew member.\n\n' +
      '## Available Crew\n' + crewLines + '\n\n' +
      'Respond ONLY with JSON: {"subtasks":[{"agent_id":"...","subtask":"what this agent should do"}]}';

    var plan;
    try {
      if (typeof SB === 'undefined' || !SB.functions) throw new Error('SB.functions not available');

      var planResp = await SB.functions.invoke('nice-ai', {
        body: {
          model: 'gemini-2.5-flash',
          messages: [
            { role: 'system', content: planSystemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 512,
        },
      });

      if (planResp.error) throw new Error(typeof planResp.error === 'string' ? planResp.error : planResp.error.message || 'Planning LLM error');
      if (!planResp.data || !planResp.data.content) throw new Error('Empty planning response');

      var parsed = _parseJSON(planResp.data.content, 'subtasks');
      if (!parsed || !parsed.subtasks || parsed.subtasks.length === 0) throw new Error('Empty plan');

      plan = parsed.subtasks.map(function(st) {
        var assignedId = crewIds.indexOf(st.agent_id) !== -1 ? st.agent_id : crewIds[0];
        var bp = _resolveAgent(assignedId);
        return { agentId: assignedId, agentName: bp ? bp.name : assignedId, subtask: st.subtask || prompt };
      });
    } catch (err) {
      console.warn('[MissionRouter] Planning failed, assigning full task to each crew member:', err.message || err);
      plan = crewIds.map(function(id) {
        var bp = _resolveAgent(id);
        return { agentId: id, agentName: bp ? bp.name : id, subtask: prompt };
      });
    }

    if (opts.onStep) opts.onStep({ phase: 'planning', status: 'done', plan: plan });

    // Execute subtasks in parallel
    var execPromises = plan.map(function(task, idx) {
      var bp = _resolveAgent(task.agentId);

      if (opts.onStep) opts.onStep({ phase: 'executing', agentName: task.agentName, subtask: task.subtask, index: idx, status: 'running' });

      return _executeAgent(spaceshipId, bp, task.subtask, {})
        .then(function(result) {
          if (opts.onStep) opts.onStep({ phase: 'executing', agentName: task.agentName, index: idx, status: 'done' });
          return { agentId: task.agentId, agentName: task.agentName, subtask: task.subtask, output: _extractText(result) };
        })
        .catch(function(err) {
          if (opts.onStep) opts.onStep({ phase: 'executing', agentName: task.agentName, index: idx, status: 'error' });
          return { agentId: task.agentId, agentName: task.agentName, subtask: task.subtask, output: 'Error: ' + (err.message || err) };
        });
    });

    var results = await Promise.all(execPromises);

    if (opts.onStep) opts.onStep({ phase: 'synthesizing', status: 'running' });

    // Captain synthesizes final output
    var resultsSummary = results.map(function(r) {
      return '## ' + r.agentName + ' — ' + r.subtask + '\n\n' + r.output;
    }).join('\n\n---\n\n');

    var synthesisPrompt = 'You are the team captain. Your crew has completed their subtasks. ' +
      'Synthesize their outputs into a single coherent final deliverable.\n\n' +
      '## Original Task\n' + prompt + '\n\n' +
      '## Crew Results\n' + resultsSummary.substring(0, 6000) + '\n\n' +
      'Produce a unified, polished final output that combines the best of each crew member\'s work.';

    var synthesis;
    try {
      if (typeof SB === 'undefined' || !SB.functions) throw new Error('SB.functions not available');

      var synthResp = await SB.functions.invoke('nice-ai', {
        body: {
          model: 'gemini-2.5-flash',
          messages: [
            { role: 'system', content: synthesisPrompt },
            { role: 'user', content: 'Synthesize the crew results.' },
          ],
          temperature: 0.4,
          max_tokens: 2048,
        },
      });

      if (synthResp.error) throw new Error(typeof synthResp.error === 'string' ? synthResp.error : synthResp.error.message || 'Synthesis LLM error');
      synthesis = (synthResp.data && synthResp.data.content) || resultsSummary;
    } catch (err) {
      console.warn('[MissionRouter] Synthesis failed, returning raw results:', err.message || err);
      synthesis = resultsSummary;
    }

    if (opts.onStep) opts.onStep({ phase: 'synthesizing', status: 'done' });

    if (typeof ShipLog !== 'undefined') {
      await ShipLog.append(spaceshipId, {
        agentId: captainId,
        role: 'system',
        content: '[Hierarchical] Captain decomposed into ' + plan.length + ' subtask(s). Synthesis complete.',
        metadata: { type: 'hierarchical', subtask_count: plan.length, captain_id: captainId, crew_ids: crewIds },
      });
    }

    return { plan: plan, results: results, synthesis: synthesis };
  }

  return { route, pipeline, parallel, routerPattern, loop, hierarchical, buildCrewManifest };
})();
