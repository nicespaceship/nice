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
    // Preserve the undefined-vs-[] distinction so _buildExecContext can tell
    // "no tools field" (fall back to all MCPs) from "explicitly empty"
    // (no tools available). Collapsing both to [] re-introduced the
    // hallucination path on stub agents — see _buildExecContext for detail.
    const toolIds    = opts.tools;
    // Don't fabricate a sentinel like 'default-ship' — ship_log.spaceship_id
    // is a UUID column and any non-UUID string produces 400s on every step
    // write. Callers that don't have a real ship should pass nothing;
    // _logToShipLog no-ops cleanly on null.
    const spaceshipId = opts.spaceshipId || null;
    const onStep     = opts.onStep || null;
    const startMs    = Date.now();
    const agentId    = (agentBlueprint && agentBlueprint.id) || null;

    // Log the user prompt at the start of the run so the Execution Log
    // has the seed entry. Without this, an empty inbox-captain mission
    // produces zero ship_log rows and the detail view shows "no log yet"
    // even though the agent did complete a multi-turn tool-use session.
    _logToShipLog(spaceshipId, agentId, 'user', prompt, { event: 'mission_start' });

    const ctx = _buildExecContext(agentBlueprint, toolIds);

    // If no tools available, fall back to single-shot
    if (!ctx.availableTools.length) {
      return _singleShot(agentBlueprint, prompt, spaceshipId, startMs);
    }

    // Inject agent memory context into conversation if available
    const initialText = ctx.memoryContext
      ? ctx.memoryContext + '\n\n---\n\n' + prompt
      : prompt;

    const conversationMessages = [{ role: 'user', content: initialText }];
    const steps = [];
    const tokensRef = { value: 0 };

    const loop = await _runReactLoop({
      agentBlueprint,
      systemPrompt: ctx.systemPrompt,
      toolsSchema: ctx.toolsSchema,
      conversationMessages,
      spaceshipId,
      agentId,
      maxSteps,
      steps,
      tokensRef,
      opts,
      onStep,
      startMs,
    });

    if (loop.error) {
      // LLM call failed mid-loop — fall back to single-shot like the
      // original execute() did, so callers always get a finalAnswer.
      console.warn('[AgentExecutor] LLM call failed, falling back to single-shot:', loop.error);
      return _singleShot(agentBlueprint, prompt, spaceshipId, startMs);
    }

    if (loop.finalAnswer != null) {
      _logToShipLog(spaceshipId, agentId, 'agent', loop.finalAnswer, {
        event: 'final_answer',
        duration_ms: Date.now() - startMs,
        steps_used: loop.stepsUsed,
        total_tokens: tokensRef.value,
      });

      return {
        steps,
        finalAnswer: loop.finalAnswer,
        metadata: {
          totalTokens: tokensRef.value,
          duration: Date.now() - startMs,
          stepsUsed: loop.stepsUsed,
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
    _logToShipLog(spaceshipId, agentId, 'agent', finalAnswer, {
      event: 'max_steps_reached',
      duration_ms: Date.now() - startMs,
      steps_used: maxSteps,
      total_tokens: tokensRef.value,
    });

    return {
      steps,
      finalAnswer,
      metadata: {
        totalTokens: tokensRef.value,
        duration: Date.now() - startMs,
        stepsUsed: maxSteps,
        maxSteps,
        toolsAvailable: toolIds,
        maxStepsReached: true,
      },
    };
  }

  /* ── Build the per-run context shared by execute() and converse() ──
     Resolves MCP tools into ToolRegistry, computes the tool schema for
     native tool-use, builds the system prompt, and snapshots the agent
     memory context. Pure function over current State + ToolRegistry — no
     side effects beyond the McpBridge.loadTools registration. */
  function _buildExecContext(agentBlueprint, toolIds) {
    // Always call McpBridge.loadTools — it registers connected MCP tools
    // into the ToolRegistry so blueprint-declared names like
    // 'gmail_search_messages' resolve to the live MCP tool. We don't
    // automatically merge those IDs into the available list anymore;
    // narrowly-scoped umbrella agents (HubSpot/Workspace/M365) declare
    // their tool set explicitly and were leaking other providers' tools
    // into the LLM schema (Workspace agent picked Microsoft's
    // `calendar_ms_list_events` on 2026-05-04 because both MCPs were
    // connected and every tool was offered).
    let mcpToolIds = [];
    if (typeof McpBridge !== 'undefined') {
      mcpToolIds = McpBridge.loadTools();
    }

    // If the blueprint declares an explicit tool list, scope to that —
    // including an explicit empty array, which means "no tools available."
    // Only fall back to all-MCPs when toolIds is undefined (generic agent
    // with no `tools` config field). The previous check used
    // `declared.length > 0` which silently turned `tools: []` into
    // "use everything" — Adama on the Battlestar got M365's
    // `calendar_ms_list_events` that way and answered calendar questions
    // he should have refused.
    const allToolIds = Array.isArray(toolIds) ? toolIds.filter(Boolean) : mcpToolIds;
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

    // Provider-agnostic tools schema for nice-ai. LLM sees the bare tool
    // name (the same one ToolRegistry auto-aliases), not the mcp:prefix.
    const toolsSchema = availableTools.map(t => ({
      name: t.name,
      description: t.description || '',
      parameters: _normalizeSchema(t.schema),
    }));

    // Legacy ReAct text fallback for providers that haven't wired native
    // tool-use yet. On modern Claude / Gemini / OpenAI the API pins
    // stop_reason='tool_use' and the model can't skip the call.
    const toolDescriptions = availableTools.map(t =>
      t.name + ': ' + (t.description || '')
    ).join('\n');
    const systemPrompt = _buildSystemPrompt(agentBlueprint, toolDescriptions);

    let memoryContext = '';
    if (typeof AgentMemory !== 'undefined' && agentBlueprint && agentBlueprint.id) {
      memoryContext = AgentMemory.buildPromptContext(agentBlueprint.id);
    }

    return { availableTools, toolsSchema, systemPrompt, memoryContext };
  }

  /* ── Shared ReAct loop body ──
     Iterates LLM call → tool execution → tool_result, mutating
     `conversationMessages` and `steps` in place. Both execute() and
     converse().send() use this — keeps the native tool-use protocol in
     one place instead of two divergent copies.

     Returns { finalAnswer, stepsUsed, error, maxStepsReached }.
     `finalAnswer === null` + `maxStepsReached` lets the caller decide
     how to render the timeout (single-shot fallback vs. last observation). */
  async function _runReactLoop(params) {
    const {
      agentBlueprint, systemPrompt, toolsSchema, conversationMessages,
      spaceshipId, agentId, maxSteps, steps, tokensRef, opts, onStep,
    } = params;

    let stepIdx = 0;

    while (stepIdx < maxSteps) {
      let llmResponse;
      try {
        llmResponse = await _callLLM(
          agentBlueprint, systemPrompt, conversationMessages, spaceshipId, toolsSchema
        );
      } catch (err) {
        return { finalAnswer: null, stepsUsed: stepIdx, error: err.message || String(err) };
      }

      tokensRef.value += llmResponse.tokensUsed || 0;

      // Canonical content is an array of {type:"text"|"tool_use"} blocks.
      // Fall back to string shape for providers that return plain text.
      const contentParts = _normalizeContentParts(llmResponse.content);
      const toolUseBlocks = contentParts.filter(p => p.type === 'tool_use');
      const textBlocks = contentParts.filter(p => p.type === 'text');
      const combinedText = textBlocks.map(p => p.text || '').join('\n').trim();

      // ── Native tool-use path ─────────────────────────────────────────
      // Trust the content shape over `stop_reason`: if the provider emitted
      // structured tool_use blocks, execute them even if the edge function
      // mislabels the stop reason. nice-ai sets stop_reason='tool_use' for
      // all three provider families, but relying on block presence is the
      // robust invariant.
      if (toolUseBlocks.length > 0) {
        // Approval gate: side-effect tools in review mode require per-call OK
        const declined = new Set();
        if (opts && opts.approvalMode === 'review' && typeof opts.onApprovalNeeded === 'function') {
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

          // Persist the tool-use turn so the Execution Log can replay
          // the trace later. Two entries per step: the assistant's
          // intent (thought + which tool with what input), and the
          // observation (tool output, error or success).
          _logToShipLog(spaceshipId, agentId, 'agent', combinedText || `(tool call: ${block.name})`, {
            event: 'tool_use',
            tool_name: block.name,
            tool_use_id: block.id,
            input: block.input || {},
            step: stepIdx,
          });
          _logToShipLog(spaceshipId, agentId, 'system', observation, {
            event: 'tool_result',
            tool_name: block.name,
            tool_use_id: block.id,
            is_error: !!isError,
            step: stepIdx,
          });

          if (stepIdx >= maxSteps) break;
        }

        // Echo assistant turn + tool_result turn for the next iteration.
        // If EVERY tool call in this turn was declined, append an explicit
        // nudge so the model knows to change approach instead of re-emitting
        // the same rejected tool calls and burning through maxSteps.
        conversationMessages.push({ role: 'assistant', content: contentParts });
        const allDeclined = toolUseBlocks.length > 0 && toolUseBlocks.every(b => declined.has(b.id));
        if (allDeclined) {
          toolResultParts.push({
            type: 'text',
            text: 'The user declined every tool call above. Do not retry the same tools — try a different approach or stop and produce a Final Answer explaining what could not be done.',
          });
        }
        conversationMessages.push({ role: 'user', content: toolResultParts });
        continue;
      }

      // ── No native tool_use — plain text response ─────────────────────
      // Model either gave a final answer or (on providers without native
      // tool-use) responded in legacy ReAct text format. Parse once, act.
      const parsed = _parseReActResponse(combinedText || '');

      if (parsed.action && !parsed.finalAnswer) {
        if (opts && opts.approvalMode === 'review' && _isSideEffectTool(parsed.action) && typeof opts.onApprovalNeeded === 'function') {
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
            _logToShipLog(spaceshipId, agentId, 'agent', parsed.thought || `(tool call: ${parsed.action})`, {
              event: 'tool_use', tool_name: parsed.action, input: parsed.actionInput || {}, step: stepIdx,
            });
            _logToShipLog(spaceshipId, agentId, 'system', 'Action blocked — user declined approval.', {
              event: 'tool_result', tool_name: parsed.action, is_error: true, step: stepIdx,
            });
            conversationMessages.push({ role: 'assistant', content: combinedText });
            conversationMessages.push({ role: 'user', content: 'Observation: Action was declined by the user. Try a different approach or provide a Final Answer.' });
            continue;
          }
        }

        let observation;
        let toolFailed = false;
        try {
          const result = await ToolRegistry.execute(parsed.action, parsed.actionInput || {});
          observation = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        } catch (err) {
          observation = 'Error: ' + (err.message || 'Tool execution failed');
          toolFailed = true;
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
        _logToShipLog(spaceshipId, agentId, 'agent', parsed.thought || `(tool call: ${parsed.action})`, {
          event: 'tool_use', tool_name: parsed.action, input: parsed.actionInput || {}, step: stepIdx,
        });
        _logToShipLog(spaceshipId, agentId, 'system', observation, {
          event: 'tool_result', tool_name: parsed.action, is_error: toolFailed, step: stepIdx,
        });
        conversationMessages.push({ role: 'assistant', content: combinedText });
        conversationMessages.push({ role: 'user', content: 'Observation: ' + observation });
        continue;
      }

      // Final answer — record the step and return.
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

      return { finalAnswer, stepsUsed: stepIdx };
    }

    return { finalAnswer: null, stepsUsed: maxSteps, maxStepsReached: true };
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

  /* ── Build system prompt ──
     Native tool-use (Anthropic tool_use blocks / Gemini functionCall /
     OpenAI tool_calls) is the happy path: the provider API forces the
     call and we never see it as text. The ReAct text protocol below is
     a narrow fallback for providers that don't support native tool-use
     — verified on live 2026-04-23 that Claude 4.6 + Gemini 2.5 Flash
     ignore it when tools are available via the native API. */
  function _buildSystemPrompt(blueprint, toolDescriptions) {
    var identity = typeof PromptBuilder !== 'undefined'
      ? PromptBuilder.build(blueprint)
      : 'You are ' + (blueprint ? blueprint.name : 'NICE AI') + ', a ' +
        ((blueprint && blueprint.config && blueprint.config.role) || 'General') + ' agent. ' +
        ((blueprint && blueprint.flavor) || '');

    return identity + '\n\n' +
      'You have access to the following tools:\n\n' + toolDescriptions + '\n\n' +
      'Call tools via the provider\u2019s native tool-use API. If your API ' +
      'does not support tool-use, fall back to emitting:\n' +
      '  Action: [tool name]\n' +
      '  Action Input: [JSON input]\n' +
      'followed by a Final Answer once you have enough information.';
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
      // body.error can be a nested object ({message, code, details}) when an
      // upstream provider error gets forwarded as-is. `new Error(obj)` would
      // coerce that to literal '[object Object]' — flatten it first.
      throw new Error(_coerceErrorMessage(body && body.error)
        || (typeof error === 'string' ? error : null)
        || _coerceErrorMessage(error && error.message)
        || 'Edge function error');
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

  /* ── Coerce an unknown error value into a useful string ──
     `body.error` from nice-ai may be a string, an object with `.message`,
     or a fully nested provider error. Returning '[object Object]' from
     `new Error(obj)` was visible to users on the M365 Agent on 2026-05-04.
     Returns null when nothing useful can be extracted, so callers can
     fall through to their own default. */
  function _coerceErrorMessage(val) {
    if (val == null) return null;
    if (typeof val === 'string') return val.trim() || null;
    if (typeof val === 'object') {
      if (typeof val.message === 'string' && val.message.trim()) return val.message.trim();
      if (typeof val.error === 'string' && val.error.trim()) return val.error.trim();
      try {
        const json = JSON.stringify(val);
        if (json && json !== '{}' && json !== '[]') return json;
      } catch { /* circular or non-serializable — fall through */ }
      return null;
    }
    return String(val);
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
   * Multi-turn conversation mode. Maintains message history across turns
   * AND uses native tool-use (Anthropic tool_use / Gemini functionCall /
   * OpenAI tool_calls) within each turn — same protocol as execute(),
   * just looped over multiple sends with persistent history.
   *
   * Each send() runs the full ReAct loop for that turn: LLM → tool_use
   * → tool_result → ... → final answer. The user message and the
   * assistant's final text get appended to `history`; intermediate
   * tool_use / tool_result pairs do NOT (the next turn doesn't need
   * them — the assistant's summary is the canonical record).
   *
   * @param {Object} agentBlueprint - Blueprint with id, name, config, flavor
   * @param {Object} opts
   *   - tools: string[] of tool IDs
   *   - maxSteps: number per turn (default 5)
   *   - spaceshipId: string
   *   - onStep: function(step) callback per step
   *   - onTurn: function(turnResult) callback per turn
   *   - approvalMode: 'review' | 'autonomous' (gates side-effect tools)
   *   - onApprovalNeeded: ({tool, input, thought, stepIndex}) => Promise<bool>
   * @returns {Object} Conversation controller with send(), history(), reset()
   */
  function converse(agentBlueprint, opts) {
    opts = opts || {};
    const history = [];
    // See execute() — preserve undefined-vs-[] so _buildExecContext can
    // tell "generic agent" from "explicitly tool-less".
    const toolIds = opts.tools;
    // See execute(): null is the correct "no ship" signal — the sentinel
    // 'default-ship' is not a valid UUID and explodes every ship_log write.
    const spaceshipId = opts.spaceshipId || null;
    const agentId = (agentBlueprint && agentBlueprint.id) || null;
    const onStep = opts.onStep || null;
    let totalTokens = 0;

    const ctx = _buildExecContext(agentBlueprint, toolIds);

    /**
     * Send a user message and get the agent's response.
     * Returns the agent's text (final answer or — if max steps reached —
     * the last observation as a best-effort fallback).
     */
    async function send(userMessage) {
      const startMs = Date.now();
      const isFirstTurn = history.length === 0;

      // Log the user prompt at turn start so the Execution Log captures
      // multi-turn conversations the same way it captures one-shot
      // mission runs.
      _logToShipLog(spaceshipId, agentId, 'user', userMessage, {
        event: isFirstTurn ? 'mission_start' : 'turn_start',
      });

      // Inject memory context only on the very first turn — subsequent
      // turns rely on the accumulated `history` for continuity.
      const userText = (isFirstTurn && ctx.memoryContext)
        ? ctx.memoryContext + '\n\n---\n\n' + userMessage
        : userMessage;
      history.push({ role: 'user', content: userText });

      const maxSteps = opts.maxSteps || 5;
      const conversationMessages = [...history];
      const steps = [];
      const tokensRef = { value: 0 };

      const loop = await _runReactLoop({
        agentBlueprint,
        systemPrompt: ctx.systemPrompt,
        toolsSchema: ctx.toolsSchema,
        conversationMessages,
        spaceshipId,
        agentId,
        maxSteps,
        steps,
        tokensRef,
        opts,
        onStep,
        startMs,
      });

      totalTokens += tokensRef.value;

      if (loop.error) {
        const errorMsg = 'Error: ' + loop.error;
        history.push({ role: 'assistant', content: errorMsg });
        _logToShipLog(spaceshipId, agentId, 'agent', errorMsg, {
          event: 'turn_error',
          duration_ms: Date.now() - startMs,
          steps_used: loop.stepsUsed,
          total_tokens: tokensRef.value,
        });
        const turnResult = { text: errorMsg, steps, done: false, error: true, totalTokens, duration: Date.now() - startMs };
        if (opts.onTurn) opts.onTurn(turnResult);
        return turnResult;
      }

      if (loop.finalAnswer != null) {
        history.push({ role: 'assistant', content: loop.finalAnswer });
        _logToShipLog(spaceshipId, agentId, 'agent', loop.finalAnswer, {
          event: 'final_answer',
          duration_ms: Date.now() - startMs,
          steps_used: loop.stepsUsed,
          total_tokens: tokensRef.value,
        });
        const turnResult = { text: loop.finalAnswer, steps, done: true, totalTokens, duration: Date.now() - startMs };
        if (opts.onTurn) opts.onTurn(turnResult);
        return turnResult;
      }

      // Max steps reached — return last observation/thought as a best-effort
      // continuation; conversation stays open (`done: false`) so the user
      // can prompt for a finish.
      const lastStep = steps[steps.length - 1];
      const fallback = lastStep
        ? (lastStep.observation || lastStep.thought || 'Reached maximum steps without a final answer.')
        : 'No steps executed.';
      history.push({ role: 'assistant', content: fallback });
      _logToShipLog(spaceshipId, agentId, 'agent', fallback, {
        event: 'max_steps_reached',
        duration_ms: Date.now() - startMs,
        steps_used: maxSteps,
        total_tokens: tokensRef.value,
      });
      const turnResult = {
        text: fallback, steps, done: false, totalTokens,
        duration: Date.now() - startMs, maxStepsReached: true,
      };
      if (opts.onTurn) opts.onTurn(turnResult);
      return turnResult;
    }

    function getHistory() { return [...history]; }
    function reset() { history.length = 0; totalTokens = 0; }
    function getTokensUsed() { return totalTokens; }

    return { send, history: getHistory, reset, getTokensUsed };
  }

  /* ── Persist a single step boundary to ship_log (fire-and-forget) ──
     Caps content length so a 50-thread gmail_search dump or pathological
     tool result doesn't blow the row. ShipLog handles routing of the
     synthetic 'mission-<uuid>' scope id to the mission_id column —
     see ship-log.js _resolveScope. We swallow any error: persistence is
     observability, never the critical path of a mission run. */
  const _SHIP_LOG_CONTENT_CAP = 8000;
  function _logToShipLog(spaceshipId, agentId, role, content, metadata) {
    // Activity signal fires regardless of ShipLog persistence — surfaces
    // like the schematic status node need it for ephemeral runs that
    // never bind to a real spaceship UUID (top-level chat, no-ship execute).
    _emitActivity(agentId, metadata);

    if (typeof ShipLog === 'undefined' || typeof ShipLog.append !== 'function') return;
    if (!spaceshipId) return;
    let safe;
    if (typeof content === 'string') {
      safe = content.length > _SHIP_LOG_CONTENT_CAP
        ? content.slice(0, _SHIP_LOG_CONTENT_CAP) + '… [truncated]'
        : content;
    } else {
      try { safe = JSON.stringify(content); } catch { safe = String(content); }
      if (safe.length > _SHIP_LOG_CONTENT_CAP) safe = safe.slice(0, _SHIP_LOG_CONTENT_CAP) + '… [truncated]';
    }
    try {
      const p = ShipLog.append(spaceshipId, { agentId, role, content: safe, metadata: metadata || {} });
      if (p && typeof p.then === 'function') p.catch(() => { /* non-critical */ });
    } catch { /* non-critical */ }
  }

  const _ACTIVE_EVENTS = new Set(['mission_start', 'turn_start']);
  const _IDLE_EVENTS = new Set(['final_answer', 'turn_error', 'max_steps_reached']);
  function _emitActivity(agentId, metadata) {
    if (!agentId || typeof AgentActivity === 'undefined') return;
    const ev = (metadata || {}).event;
    if (_ACTIVE_EVENTS.has(ev)) AgentActivity.markActive(agentId);
    else if (_IDLE_EVENTS.has(ev)) AgentActivity.markIdle(agentId);
  }

  return { execute, converse, classifyTool, _isSideEffectTool, _logToShipLog };
})();
