/* ═══════════════════════════════════════════════════════════════════
   NICE — Agent Executor
   ReAct-style execution loop for agents with tool access.
   Iteratively: Think → Act → Observe until Final Answer or maxSteps.
═══════════════════════════════════════════════════════════════════ */

const AgentExecutor = (() => {

  /**
   * Execute an agent with tools using a ReAct loop.
   *
   * @param {Object} agentBlueprint - Blueprint with id, name, config, flavor
   * @param {string} prompt - User prompt
   * @param {Object} opts
   *   - tools: string[] of tool IDs to make available
   *   - maxSteps: number (default 5)
   *   - spaceshipId: string
   *   - onStep: function(step) callback per step
   * @returns {{ steps: Array, finalAnswer: string, metadata: Object }}
   */
  async function execute(agentBlueprint, prompt, opts) {
    opts = opts || {};
    const maxSteps   = opts.maxSteps || 5;
    const toolIds    = opts.tools || [];
    const spaceshipId = opts.spaceshipId || 'default-ship';
    const onStep     = opts.onStep || null;
    const startMs    = Date.now();

    // Load MCP tools into ToolRegistry (account-level, all agents get them)
    let mcpToolIds = [];
    if (typeof McpBridge !== 'undefined') {
      mcpToolIds = McpBridge.loadTools();
    }

    // Resolve available tools (explicit + MCP)
    const allToolIds = [...toolIds, ...mcpToolIds];
    const availableTools = [];
    if (typeof ToolRegistry !== 'undefined') {
      allToolIds.forEach(id => {
        const tool = ToolRegistry.get(id);
        if (tool) availableTools.push(tool);
      });
    }

    // If no tools available, fall back to single-shot
    if (!availableTools.length) {
      return _singleShot(agentBlueprint, prompt, spaceshipId, startMs);
    }

    // Build tool descriptions for system prompt
    const toolDescriptions = availableTools.map(t =>
      t.name + ' (id: ' + t.id + '): ' + t.description +
      (t.schema && t.schema.properties ? '\n  Input: ' + JSON.stringify(t.schema.properties) : '')
    ).join('\n\n');

    const systemPrompt = _buildSystemPrompt(agentBlueprint, toolDescriptions);

    const steps = [];
    let conversationMessages = [{ role: 'user', content: prompt }];
    let totalTokens = 0;

    for (let i = 0; i < maxSteps; i++) {
      // Call LLM with ReAct instructions
      let llmResponse;
      try {
        llmResponse = await _callLLM(agentBlueprint, systemPrompt, conversationMessages, spaceshipId);
      } catch (err) {
        console.warn('[AgentExecutor] LLM call failed, falling back to single-shot:', err.message);
        return _singleShot(agentBlueprint, prompt, spaceshipId, startMs);
      }

      totalTokens += llmResponse.tokensUsed || 0;
      const text = llmResponse.content || '';

      // Parse the response for ReAct structure
      const parsed = _parseReActResponse(text);

      if (parsed.finalAnswer) {
        // Agent has reached a final answer
        const step = {
          index:       i + 1,
          thought:     parsed.thought || '',
          action:      null,
          actionInput: null,
          observation: null,
          finalAnswer: parsed.finalAnswer,
        };
        steps.push(step);
        if (onStep) onStep(step);

        return {
          steps,
          finalAnswer: parsed.finalAnswer,
          metadata: {
            totalTokens,
            duration: Date.now() - startMs,
            stepsUsed: i + 1,
            maxSteps,
            toolsAvailable: toolIds,
          },
        };
      }

      if (parsed.action) {
        // Execute the tool
        let observation;
        try {
          const result = await ToolRegistry.execute(parsed.action, parsed.actionInput || {});
          observation = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        } catch (err) {
          observation = 'Error: ' + (err.message || 'Tool execution failed');
        }

        const step = {
          index:       i + 1,
          thought:     parsed.thought || '',
          action:      parsed.action,
          actionInput: parsed.actionInput,
          observation: observation,
          finalAnswer: null,
        };
        steps.push(step);
        if (onStep) onStep(step);

        // Add the exchange to conversation for next iteration
        conversationMessages.push({ role: 'assistant', content: text });
        conversationMessages.push({
          role: 'user',
          content: 'Observation: ' + observation,
        });
      } else {
        // Could not parse action or final answer — treat response as final answer
        const step = {
          index:       i + 1,
          thought:     parsed.thought || text,
          action:      null,
          actionInput: null,
          observation: null,
          finalAnswer: text,
        };
        steps.push(step);
        if (onStep) onStep(step);

        return {
          steps,
          finalAnswer: text,
          metadata: {
            totalTokens,
            duration: Date.now() - startMs,
            stepsUsed: i + 1,
            maxSteps,
            toolsAvailable: toolIds,
          },
        };
      }
    }

    // Max steps reached — return last observation or a notice
    const lastStep = steps[steps.length - 1];
    const finalAnswer = lastStep
      ? (lastStep.observation || lastStep.thought || 'Reached maximum steps without a final answer.')
      : 'No steps executed.';

    return {
      steps,
      finalAnswer,
      metadata: {
        totalTokens,
        duration: Date.now() - startMs,
        stepsUsed: maxSteps,
        maxSteps,
        toolsAvailable: toolIds,
        maxStepsReached: true,
      },
    };
  }

  /* ── Build system prompt with ReAct instructions and tool list ── */
  function _buildSystemPrompt(blueprint, toolDescriptions) {
    var identity = typeof PromptBuilder !== 'undefined'
      ? PromptBuilder.build(blueprint)
      : 'You are ' + (blueprint ? blueprint.name : 'NICE AI') + ', a ' +
        ((blueprint && blueprint.config && blueprint.config.role) || 'General') + ' agent. ' +
        ((blueprint && blueprint.flavor) || '');

    return identity + '\n\n' +
      'You have access to the following tools:\n\n' + toolDescriptions + '\n\n' +
      'To use a tool, respond with EXACTLY this format:\n' +
      'Thought: [your reasoning about what to do next]\n' +
      'Action: [tool id]\n' +
      'Action Input: [JSON object matching the tool schema]\n\n' +
      'After receiving an Observation, continue reasoning.\n' +
      'When you have enough information to answer, respond with:\n' +
      'Thought: [final reasoning]\n' +
      'Final Answer: [your complete answer to the user]\n\n' +
      'Always start with a Thought. Use tools when needed. Be concise.';
  }

  /* ── Parse a ReAct-formatted response ── */
  function _parseReActResponse(text) {
    const result = { thought: null, action: null, actionInput: null, finalAnswer: null };

    // Extract Thought
    const thoughtMatch = text.match(/Thought:\s*([\s\S]*?)(?=\n(?:Action:|Final Answer:)|$)/i);
    if (thoughtMatch) result.thought = thoughtMatch[1].trim();

    // Check for Final Answer first
    const finalMatch = text.match(/Final Answer:\s*([\s\S]*)/i);
    if (finalMatch) {
      result.finalAnswer = finalMatch[1].trim();
      return result;
    }

    // Extract Action
    const actionMatch = text.match(/Action:\s*(.+)/i);
    if (actionMatch) {
      result.action = actionMatch[1].trim();
    }

    // Extract Action Input
    const inputMatch = text.match(/Action Input:\s*([\s\S]*?)(?=\n(?:Thought:|Action:|Final Answer:)|$)/i);
    if (inputMatch) {
      const raw = inputMatch[1].trim();
      try {
        result.actionInput = JSON.parse(raw);
      } catch {
        // Try to extract JSON from the text
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            result.actionInput = JSON.parse(jsonMatch[0]);
          } catch {
            result.actionInput = { input: raw };
          }
        } else {
          result.actionInput = { input: raw };
        }
      }
    }

    return result;
  }

  /* ── Call LLM via ShipLog's edge function ── */
  async function _callLLM(blueprint, systemPrompt, messages, spaceshipId) {
    if (typeof SB === 'undefined' || !SB.functions) {
      throw new Error('SB.functions not available');
    }

    let llmConfig = {};
    if (typeof LLMConfig !== 'undefined' && blueprint) {
      llmConfig = LLMConfig.forBlueprint(blueprint);
    }

    const apiMessages = [{ role: 'system', content: systemPrompt }, ...messages];
    const { data, error } = await SB.functions.invoke('llm-proxy', {
      body: {
        model:       llmConfig.model || 'claude-4-sonnet',
        messages:    apiMessages,
        temperature: llmConfig.temperature || 0.3,
        max_tokens:  llmConfig.max_tokens || 2048,
      },
    });

    if (error) throw new Error(typeof error === 'string' ? error : error.message || 'Edge function error');
    if (!data || data.error) throw new Error(data?.error || 'Empty response');

    const tokensUsed = data.usage
      ? (data.usage.input_tokens + data.usage.output_tokens)
      : Math.floor((data.content || '').length / 4);

    return {
      content:    data.content || '',
      model:      data.model || llmConfig.model,
      tokensUsed: tokensUsed,
    };
  }

  /* ── Single-shot fallback (no tools, just call ShipLog directly) ── */
  async function _singleShot(blueprint, prompt, spaceshipId, startMs) {
    if (typeof ShipLog !== 'undefined') {
      const result = await ShipLog.execute(spaceshipId, blueprint, prompt);
      return {
        steps: [],
        finalAnswer: result ? result.content : 'No response from agent.',
        metadata: {
          totalTokens: result && result.metadata ? result.metadata.tokens_used : 0,
          duration:    Date.now() - startMs,
          stepsUsed:   0,
          maxSteps:    0,
          toolsAvailable: [],
          singleShot:  true,
        },
      };
    }
    throw new Error('ShipLog not available for single-shot execution');
  }

  return { execute };
})();
