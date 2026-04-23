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

    // Resolve available tools (explicit + MCP).
    // Blueprint tools may use display names ("Web Search") — ToolRegistry.resolve
    // handles id, alias, and normalized-name lookup so the executor binds real tools.
    const allToolIds = [...toolIds, ...mcpToolIds];
    const availableTools = [];
    const seen = new Set();
    if (typeof ToolRegistry !== 'undefined') {
      allToolIds.forEach(nameOrId => {
        const tool = (typeof ToolRegistry.resolve === 'function')
          ? ToolRegistry.resolve(nameOrId)
          : ToolRegistry.get(nameOrId);
        if (tool && !seen.has(tool.id)) {
          seen.add(tool.id);
          availableTools.push(tool);
        }
      });
    }

    // If no tools available, fall back to single-shot
    if (!availableTools.length) {
      return _singleShot(agentBlueprint, prompt, spaceshipId, startMs);
    }

    // Build provider-agnostic tools schema for nice-ai. LLM sees the bare
    // tool name (the same one ToolRegistry auto-aliases), not the mcp:prefix.
    const toolsSchema = availableTools.map(t => ({
      name: t.name,
      description: t.description || '',
      parameters: _normalizeSchema(t.schema),
    }));

    // Legacy ReAct suffix still included for providers that haven't wired
    // native tool-use yet. On modern Claude / Gemini / OpenAI it's dead code
    // on the happy path — the API pins stop_reason='tool_use' and the model
    // can't skip the call. Slated for removal once native tool-use is proven.
    const toolDescriptions = availableTools.map(t =>
      t.name + ': ' + (t.description || '')
    ).join('\n');
    const systemPrompt = _buildSystemPrompt(agentBlueprint, toolDescriptions);

    // Inject agent memory context into conversation if available
    let memoryContext = '';
    if (typeof AgentMemory !== 'undefined' && agentBlueprint && agentBlueprint.id) {
      memoryContext = AgentMemory.buildPromptContext(agentBlueprint.id);
    }

    const steps = [];
    let conversationMessages = [];
    const initialText = memoryContext ? memoryContext + '\n\n---\n\n' + prompt : prompt;
    conversationMessages.push({ role: 'user', content: initialText });
    let totalTokens = 0;
    let stepIdx = 0;

    while (stepIdx < maxSteps) {
      let llmResponse;
      try {
        llmResponse = await _callLLM(agentBlueprint, systemPrompt, conversationMessages, spaceshipId, toolsSchema);
      } catch (err) {
        console.warn('[AgentExecutor] LLM call failed, falling back to single-shot:', err.message);
        return _singleShot(agentBlueprint, prompt, spaceshipId, startMs);
      }

      totalTokens += llmResponse.tokensUsed || 0;

      // Canonical content is an array of {type:"text"|"tool_use"} blocks.
      // Fall back to string shape for providers that return plain text.
      const contentParts = _normalizeContentParts(llmResponse.content);
      const toolUseBlocks = contentParts.filter(p => p.type === 'tool_use');
      const textBlocks = contentParts.filter(p => p.type === 'text');
      const combinedText = textBlocks.map(p => p.text || '').join('\n').trim();

      // ── Native tool-use path ─────────────────────────────────────────
      if (toolUseBlocks.length > 0 && llmResponse.stopReason === 'tool_use') {
        // Approval gate: side-effect tools in review mode require per-call OK
        const declined = new Set();
        if (opts.approvalMode === 'review' && typeof opts.onApprovalNeeded === 'function') {
          for (const block of toolUseBlocks) {
            if (!_isSideEffectTool(block.name)) continue;
            const approved = await opts.onApprovalNeeded({
              tool: block.name,
              input: block.input,
              thought: combinedText,
              stepIndex: stepIdx + 1,
            });
            if (!approved) declined.add(block.id);
          }
        }

        const toolResultParts = [];
        for (const block of toolUseBlocks) {
          let observation;
          let isError = false;
          if (declined.has(block.id)) {
            observation = 'Action blocked — user declined approval.';
            isError = true;
          } else {
            try {
              const result = await ToolRegistry.execute(block.name, block.input || {});
              observation = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
            } catch (err) {
              observation = 'Error: ' + (err.message || 'Tool execution failed');
              isError = true;
            }
          }

          toolResultParts.push({
            type: 'tool_result',
            tool_use_id: block.id,
            name: block.name,   // Gemini needs the function name on the echo
            content: observation,
            ...(isError ? { is_error: true } : {}),
          });

          stepIdx++;
          const step = {
            index: stepIdx,
            thought: combinedText,
            action: block.name,
            actionInput: block.input || {},
            observation,
            finalAnswer: null,
          };
          steps.push(step);
          if (onStep) onStep(step);

          if (stepIdx >= maxSteps) break;
        }

        // Echo assistant turn + tool_result turn for the next iteration
        conversationMessages.push({ role: 'assistant', content: contentParts });
        conversationMessages.push({ role: 'user', content: toolResultParts });
        continue;
      }

      // ── No native tool_use — plain text response ─────────────────────
      // Model either gave a final answer or (on providers without native
      // tool-use) responded in legacy ReAct text format. Parse once, act.
      const parsed = _parseReActResponse(combinedText || '');

      if (parsed.action && !parsed.finalAnswer) {
        if (opts.approvalMode === 'review' && _isSideEffectTool(parsed.action) && typeof opts.onApprovalNeeded === 'function') {
          const approved = await opts.onApprovalNeeded({
            tool: parsed.action, input: parsed.actionInput,
            thought: parsed.thought, stepIndex: stepIdx + 1,
          });
          if (!approved) {
            stepIdx++;
            const step = {
              index: stepIdx, thought: parsed.thought, action: parsed.action,
              actionInput: parsed.actionInput, observation: 'Action blocked — user declined approval.',
              finalAnswer: null,
            };
            steps.push(step);
            if (onStep) onStep(step);
            conversationMessages.push({ role: 'assistant', content: combinedText });
            conversationMessages.push({ role: 'user', content: 'Observation: Action was declined by the user. Try a different approach or provide a Final Answer.' });
            continue;
          }
        }

        let observation;
        try {
          const result = await ToolRegistry.execute(parsed.action, parsed.actionInput || {});
          observation = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        } catch (err) {
          observation = 'Error: ' + (err.message || 'Tool execution failed');
        }
        stepIdx++;
        const step = {
          index: stepIdx,
          thought: parsed.thought || '',
          action: parsed.action,
          actionInput: parsed.actionInput,
          observation,
          finalAnswer: null,
        };
        steps.push(step);
        if (onStep) onStep(step);
        conversationMessages.push({ role: 'assistant', content: combinedText });
        conversationMessages.push({ role: 'user', content: 'Observation: ' + observation });
        continue;
      }

      // Final answer
      const finalAnswer = parsed.finalAnswer || combinedText || '';
      stepIdx++;
      const step = {
        index: stepIdx,
        thought: parsed.thought || '',
        action: null,
        actionInput: null,
        observation: null,
        finalAnswer,
      };
      steps.push(step);
      if (onStep) onStep(step);

      return {
        steps,
        finalAnswer,
        metadata: {
          totalTokens,
          duration: Date.now() - startMs,
          stepsUsed: stepIdx,
          maxSteps,
          toolsAvailable: toolIds,
        },
      };
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

  /* ── Normalize LLM response content to canonical parts array ──
     nice-ai returns either a string (legacy) or an array of
     {type:"text",text} / {type:"tool_use",id,name,input} blocks. */
  function _normalizeContentParts(content) {
    if (!content) return [];
    if (typeof content === 'string') {
      return content.trim() ? [{ type: 'text', text: content }] : [];
    }
    if (!Array.isArray(content)) return [];
    const out = [];
    for (const p of content) {
      if (!p) continue;
      if (typeof p === 'string') {
        if (p.trim()) out.push({ type: 'text', text: p });
      } else if (p.type === 'text' && typeof p.text === 'string') {
        out.push({ type: 'text', text: p.text });
      } else if (p.type === 'tool_use' && p.id && p.name) {
        out.push({ type: 'tool_use', id: p.id, name: p.name, input: p.input || {} });
      }
    }
    return out;
  }

  /* ── Coerce tool.schema to a JSONSchema object for the tools param ── */
  function _normalizeSchema(schema) {
    if (!schema || typeof schema !== 'object') {
      return { type: 'object', properties: {} };
    }
    if (schema.type === 'object') return schema;
    return { type: 'object', properties: { input: schema } };
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

    // Try structured JSON tool call format first (native LLM tool use)
    // Models may return: {"tool_call": {"name": "...", "arguments": {...}}, "thought": "..."}
    // Or: {"action": "...", "action_input": {...}, "thought": "..."}
    const jsonResult = _tryParseStructuredCall(text);
    if (jsonResult) return jsonResult;

    // Fall back to text-based ReAct parsing

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

  /* ── Try to parse structured JSON tool calls from LLM output ── */
  function _tryParseStructuredCall(text) {
    if (!text || typeof text !== 'string') return null;
    // Look for a JSON object in the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      const obj = JSON.parse(jsonMatch[0]);
      // Format 1: { tool_call: { name, arguments }, thought }
      if (obj.tool_call && obj.tool_call.name) {
        return {
          thought: obj.thought || null,
          action: obj.tool_call.name,
          actionInput: obj.tool_call.arguments || {},
          finalAnswer: null,
        };
      }
      // Format 2: { action, action_input, thought }
      if (obj.action && typeof obj.action === 'string' && !obj.final_answer) {
        return {
          thought: obj.thought || null,
          action: obj.action,
          actionInput: obj.action_input || obj.actionInput || {},
          finalAnswer: null,
        };
      }
      // Format 3: { final_answer, thought }
      if (obj.final_answer) {
        return {
          thought: obj.thought || null,
          action: null,
          actionInput: null,
          finalAnswer: obj.final_answer,
        };
      }
    } catch { /* not valid JSON — fall through to text parsing */ }
    return null;
  }

  /* ── Call LLM via nice-ai edge function ──
     Passes `tools` when the executor has a tools schema so nice-ai can
     translate to each provider's native tool-use API (Anthropic tool_use,
     Gemini function_declarations, OpenAI tools). Returns the raw content
     (string or canonical parts array) + stop_reason for the executor to
     decide whether to loop. */
  async function _callLLM(blueprint, systemPrompt, messages, spaceshipId, toolsSchema) {
    if (typeof SB === 'undefined' || !SB.functions) {
      throw new Error('SB.functions not available');
    }

    let llmConfig = {};
    if (typeof LLMConfig !== 'undefined' && blueprint) {
      llmConfig = LLMConfig.forBlueprint(blueprint);
    }

    const apiMessages = [{ role: 'system', content: systemPrompt }, ...messages];
    const requestBody = {
      model:       llmConfig.model || 'gemini-2.5-flash',
      messages:    apiMessages,
      temperature: llmConfig.temperature || 0.3,
      max_tokens:  llmConfig.max_tokens || 2048,
    };
    if (Array.isArray(toolsSchema) && toolsSchema.length > 0) {
      requestBody.tools = toolsSchema;
    }
    const { data, error } = await SB.functions.invoke('nice-ai', { body: requestBody });

    if (error) {
      let body = null;
      if (error.context && typeof error.context.json === 'function') {
        try { body = await error.context.json(); } catch { /* not JSON */ }
      }
      if (body && body.code && typeof Subscription !== 'undefined' && Subscription.handleBillingError) {
        Subscription.handleBillingError(body);
      }
      throw new Error((body && body.error) || (typeof error === 'string' ? error : error.message) || 'Edge function error');
    }
    if (!data || data.error) throw new Error(data?.error || 'Empty response');

    const rawContent = data.content ?? '';
    const tokensUsed = data.usage
      ? ((data.usage.input_tokens || 0) + (data.usage.output_tokens || 0))
      : Math.floor(JSON.stringify(rawContent).length / 4);

    return {
      content:    rawContent,
      stopReason: data.stop_reason || 'end_turn',
      model:      data.model || llmConfig.model,
      tokensUsed,
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

  /* ── Detect tools with external side effects ──
     The list below catches anything that mutates state on a remote
     system — mail sends, calendar writes, file uploads, social posts,
     payments, etc. Keep it intentionally broad: a false positive just
     means one extra approval click when `approvalMode === 'review'`;
     a false negative means a destructive action slips through silently.

     Every pattern here is tested against the full tool catalog in
     agent-executor.test.js. When you add a new MCP write tool, either
     pick a name that contains one of these substrings or add a new
     pattern to the list. */
  const SIDE_EFFECT_PATTERNS = [
    // Generic mutation verbs
    'send', 'publish', 'post', 'create', 'delete', 'update', 'write',
    'upload', 'reply', 'archive', 'move', 'rename', 'remove', 'drop',
    'put', 'patch', 'insert', 'destroy', 'revoke', 'cancel', 'schedule',
    // Tool-prefix fast paths for common destructive surfaces
    'gmail_send', 'gmail_reply', 'gmail_draft',
    'calendar_create', 'calendar_update', 'calendar_delete',
    'drive_create', 'drive_update', 'drive_upload',
    'social_create', 'social_publish', 'social_schedule',
    'slack_send', 'slack_post', 'stripe_charge', 'stripe_refund',
  ];

  function _isSideEffectTool(toolId) {
    if (!toolId || typeof toolId !== 'string') return false;
    const normalized = toolId.toLowerCase();
    return SIDE_EFFECT_PATTERNS.some(p => normalized.includes(p));
  }

  /**
   * Classify a tool as read-only vs write/destructive. Used by the
   * Integrations view to badge each tool pill so users can see at a
   * glance what a connection is capable of. Returns 'write' for any
   * side-effect tool, 'read' otherwise.
   */
  function classifyTool(toolId) {
    return _isSideEffectTool(toolId) ? 'write' : 'read';
  }

  /**
   * Multi-turn conversation mode. Maintains message history across turns.
   * The agent can signal "need more info" by returning a question, or
   * provide a "Final Answer" to end the conversation.
   *
   * @param {Object} agentBlueprint - Blueprint with id, name, config, flavor
   * @param {Object} opts
   *   - tools: string[] of tool IDs
   *   - maxSteps: number per turn (default 5)
   *   - spaceshipId: string
   *   - onStep: function(step) callback per step
   *   - onTurn: function(turnResult) callback per turn
   * @returns {Object} Conversation controller with send(), history(), reset()
   */
  function converse(agentBlueprint, opts) {
    opts = opts || {};
    const history = [];
    const toolIds = opts.tools || [];
    const spaceshipId = opts.spaceshipId || 'default-ship';
    let totalTokens = 0;

    // Build memory context once at conversation start
    let memoryContext = '';
    if (typeof AgentMemory !== 'undefined' && agentBlueprint && agentBlueprint.id) {
      memoryContext = AgentMemory.buildPromptContext(agentBlueprint.id);
    }

    // Load tool descriptions once
    let mcpToolIds = [];
    if (typeof McpBridge !== 'undefined') mcpToolIds = McpBridge.loadTools();
    const allToolIds = [...toolIds, ...mcpToolIds];
    const availableTools = [];
    const seen = new Set();
    if (typeof ToolRegistry !== 'undefined') {
      allToolIds.forEach(nameOrId => {
        const tool = (typeof ToolRegistry.resolve === 'function')
          ? ToolRegistry.resolve(nameOrId)
          : ToolRegistry.get(nameOrId);
        if (tool && !seen.has(tool.id)) {
          seen.add(tool.id);
          availableTools.push(tool);
        }
      });
    }
    const toolDescriptions = availableTools.map(t =>
      t.name + ' (id: ' + t.id + '): ' + t.description +
      (t.schema && t.schema.properties ? '\n  Input: ' + JSON.stringify(t.schema.properties) : '')
    ).join('\n\n');

    const systemPrompt = _buildSystemPrompt(agentBlueprint, toolDescriptions);

    /**
     * Send a user message and get the agent's response.
     * Returns the agent's text (final answer or clarifying question).
     */
    async function send(userMessage) {
      history.push({ role: 'user', content: userMessage });
      const startMs = Date.now();

      // Build messages: system + memory + full history
      const messages = [];
      if (memoryContext && history.length === 1) {
        // Inject memory only on first turn
        messages.push({ role: 'user', content: memoryContext + '\n\n---\n\n' + userMessage });
      } else {
        messages.push(...history);
      }

      // Run ReAct loop for this turn
      const maxSteps = opts.maxSteps || 5;
      let conversationMessages = [...messages];
      const steps = [];

      for (let i = 0; i < maxSteps; i++) {
        let llmResponse;
        try {
          llmResponse = await _callLLM(agentBlueprint, systemPrompt, conversationMessages, spaceshipId);
        } catch (err) {
          const errorMsg = 'Error: ' + (err.message || 'LLM call failed');
          history.push({ role: 'assistant', content: errorMsg });
          return { text: errorMsg, steps, done: false, error: true };
        }
        totalTokens += llmResponse.tokensUsed || 0;
        let text = llmResponse.content || '';
        if (Array.isArray(text)) text = text.map(c => c.text || c).join('');
        if (typeof text !== 'string') text = String(text);

        const parsed = _parseReActResponse(text);

        if (parsed.finalAnswer) {
          steps.push({ index: i + 1, thought: parsed.thought, finalAnswer: parsed.finalAnswer });
          if (opts.onStep) opts.onStep(steps[steps.length - 1]);
          history.push({ role: 'assistant', content: parsed.finalAnswer });
          const turnResult = { text: parsed.finalAnswer, steps, done: true, totalTokens, duration: Date.now() - startMs };
          if (opts.onTurn) opts.onTurn(turnResult);
          return turnResult;
        }

        if (parsed.action) {
          let observation;
          try {
            const result = await ToolRegistry.execute(parsed.action, parsed.actionInput || {});
            observation = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          } catch (err) {
            observation = 'Error: ' + (err.message || 'Tool execution failed');
          }
          steps.push({ index: i + 1, thought: parsed.thought, action: parsed.action, actionInput: parsed.actionInput, observation });
          if (opts.onStep) opts.onStep(steps[steps.length - 1]);
          conversationMessages.push({ role: 'assistant', content: text });
          conversationMessages.push({ role: 'user', content: 'Observation: ' + observation });
        } else {
          // No action, no final answer — treat as a clarifying question
          steps.push({ index: i + 1, thought: parsed.thought || text, finalAnswer: text });
          if (opts.onStep) opts.onStep(steps[steps.length - 1]);
          history.push({ role: 'assistant', content: text });
          const turnResult = { text, steps, done: false, totalTokens, duration: Date.now() - startMs };
          if (opts.onTurn) opts.onTurn(turnResult);
          return turnResult;
        }
      }

      // Max steps reached
      const lastStep = steps[steps.length - 1];
      const fallback = lastStep ? (lastStep.observation || lastStep.thought || 'Reached maximum steps.') : 'No response.';
      history.push({ role: 'assistant', content: fallback });
      const turnResult = { text: fallback, steps, done: false, totalTokens, duration: Date.now() - startMs, maxStepsReached: true };
      if (opts.onTurn) opts.onTurn(turnResult);
      return turnResult;
    }

    function getHistory() { return [...history]; }
    function reset() { history.length = 0; totalTokens = 0; }
    function getTokensUsed() { return totalTokens; }

    return { send, history: getHistory, reset, getTokensUsed };
  }

  return { execute, converse, classifyTool, _isSideEffectTool };
})();
