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

    // Tool resolution chain (most specific wins):
    //   1. Explicit `toolIds` array (even empty) → use as-is. Empty means
    //      "no tools available." The previous check used `length > 0`
    //      which silently turned `tools: []` into "use everything" —
    //      Adama on the Battlestar got M365's `calendar_ms_list_events`
    //      that way and answered calendar questions he should have refused.
    //   2. No `toolIds`, blueprint has `config.capability_id` → resolve
    //      that capability blueprint and use ITS tools. Slot characters
    //      (Apollo, Geordi, R2-D2) are persona stubs that wrap an
    //      umbrella capability via capability_id. Without this resolution
    //      they leak the union of every connected MCP into the LLM schema
    //      (Falcon's R2 saw ~314 tools instead of GitHub's 23 on the
    //      2026-05-07 dispatch session) — blowing past Gemini's
    //      function_declarations limits and surfacing schema bugs
    //      (Klaviyo's deeply-nested enum) that capability-scoped agents
    //      never encounter.
    //   3. Otherwise → fall back to all connected MCPs. The legacy
    //      "generic agent" path; broad by design.
    let allToolIds;
    if (Array.isArray(toolIds)) {
      allToolIds = toolIds.filter(Boolean);
    } else {
      let capabilityTools = null;
      const capId = agentBlueprint && agentBlueprint.config && agentBlueprint.config.capability_id;
      if (capId && typeof Blueprints !== 'undefined' && Blueprints.isReady()) {
        // Try strict capability first (kind='capability'); fall through to
        // getAgent which also returns character-kind umbrellas (HubSpot/
        // GitHub/Slack agents). Slot defaults wired via ship_slots.
        // default_agent_id point at characters, so the strict-only resolver
        // returned null and dropped the auto-created agent into the
        // all-MCPs fallback (Path 3) — exactly what Path 2 was meant to
        // prevent.
        let cap = null;
        if (typeof Blueprints.getCapability === 'function') {
          cap = Blueprints.getCapability(capId);
        }
        if (!cap && typeof Blueprints.getAgent === 'function') {
          cap = Blueprints.getAgent(capId);
        }
        const capTools = cap && cap.config && cap.config.tools;
        if (Array.isArray(capTools)) capabilityTools = capTools.filter(Boolean);
      }
      allToolIds = capabilityTools != null ? capabilityTools : mcpToolIds;
    }
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
    //
    // Dedup by name: Gemini's function_declarations API rejects duplicate
    // names with `Duplicate function declaration found: <name>` and the
    // whole call fails. Multiple MCPs can expose tools with the same bare
    // name (Replicate.search + Atlassian.search, etc.). ToolRegistry's
    // alias map is first-registration-wins, so the second tool was already
    // unreachable via name resolution — dropping it from the schema just
    // tells the LLM the truth instead of hiding an unusable declaration.
    const seenNames = new Set();
    const toolsSchema = [];
    const dedupedTools = [];
    for (const t of availableTools) {
      if (seenNames.has(t.name)) {
        console.warn('[AgentExecutor] Duplicate tool name dropped from LLM schema:', t.name, '(kept earlier registration; this one was', t.id + ')');
        continue;
      }
      seenNames.add(t.name);
      dedupedTools.push(t);
      toolsSchema.push({
        name: t.name,
        description: t.description || '',
        parameters: _normalizeSchema(t.schema),
      });
    }

    // Legacy ReAct text fallback for providers that haven't wired native
    // tool-use yet. On modern Claude / Gemini / OpenAI the API pins
    // stop_reason='tool_use' and the model can't skip the call.
    const toolDescriptions = dedupedTools.map(t =>
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
        // The approval gate lives in ToolRegistry.execute (the shared dispatch
        // point) — we pass the review-mode context per call and treat a thrown
        // `declined` error as the user rejecting that tool. `declined` tracks
        // which blocks were rejected so the all-declined nudge below still fires.
        const declined = new Set();
        const toolResultParts = [];
        for (const block of toolUseBlocks) {
          let observation;
          let isError = false;
          try {
            const result = await ToolRegistry.execute(block.name, block.input || {}, {
              approvalMode:     opts && opts.approvalMode,
              onApprovalNeeded: opts && opts.onApprovalNeeded,
              toolLabel:        block.name,
              thought:          combinedText,
              stepIndex:        stepIdx + 1,
            });
            observation = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          } catch (err) {
            if (err && err.declined) {
              declined.add(block.id);
              observation = 'Action blocked — user declined approval.';
            } else {
              observation = 'Error: ' + (err.message || 'Tool execution failed');
            }
            isError = true;
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
        // Same shared gate as the native path: route through ToolRegistry.execute
        // with review-mode context. A declined action throws `declined`, which we
        // surface with the dedicated "try a different approach" nudge so the model
        // doesn't just re-emit the rejected call.
        let observation;
        let toolFailed = false;
        let wasDeclined = false;
        try {
          const result = await ToolRegistry.execute(parsed.action, parsed.actionInput || {}, {
            approvalMode:     opts && opts.approvalMode,
            onApprovalNeeded: opts && opts.onApprovalNeeded,
            toolLabel:        parsed.action,
            thought:          parsed.thought,
            stepIndex:        stepIdx + 1,
          });
          observation = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        } catch (err) {
          if (err && err.declined) {
            wasDeclined = true;
            observation = 'Action blocked — user declined approval.';
          } else {
            observation = 'Error: ' + (err.message || 'Tool execution failed');
          }
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
        conversationMessages.push({
          role: 'user',
          content: wasDeclined
            ? 'Observation: Action was declined by the user. Try a different approach or provide a Final Answer.'
            : 'Observation: ' + observation,
        });
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

  /* ── JSON Schema fields Gemini's function_declarations API rejects.
     Gemini accepts an OpenAPI-3.0 subset; these produce INVALID_ARGUMENT
     400s and AgentExecutor falls back to single-shot (no tool use). MCP
     servers ship raw JSON Schema — strip the unsupported fields before
     handing the schema off to the provider. Safe for Anthropic + OpenAI
     too: they accept the subset.

     Audited against the live Gemini failure on 2026-05-08 (Falcon
     captain dispatch via Gemini 2.5 Flash). ── */
  const _GEMINI_DROP_FIELDS = new Set([
    '$schema', '$ref', '$defs', '$id', 'definitions',
    'additionalProperties', 'unevaluatedProperties',
    'propertyNames', 'patternProperties',
    'dependentSchemas', 'dependentRequired',
    'if', 'then', 'else', 'not', 'contains',
    'exclusiveMinimum', 'exclusiveMaximum',
  ]);

  /* Coerce an enum value to a Gemini-compatible string. Gemini's `enum`
     is TYPE_STRING — booleans, numbers, null all get rejected with
     `Invalid value at ...enum[0] (TYPE_STRING)`. JSON-stringify objects
     so a sliced view stays readable; everything else gets String(). */
  function _stringifyEnumValue(v) {
    if (typeof v === 'string') return v;
    if (v === null || v === undefined) return String(v);
    if (typeof v === 'object') {
      try { return JSON.stringify(v); } catch { return String(v); }
    }
    return String(v);
  }

  function _sanitizeForGemini(node) {
    if (Array.isArray(node)) return node.map(_sanitizeForGemini);
    if (!node || typeof node !== 'object') return node;
    const out = {};
    let enumSet = false;
    for (const key of Object.keys(node)) {
      if (_GEMINI_DROP_FIELDS.has(key)) continue;
      const value = node[key];
      if (key === 'const') {
        // Gemini doesn't support `const` — express as a single-value enum.
        // Gemini's enum is TYPE_STRING-only, so coerce non-string consts
        // (boolean discriminators, numeric literals) to their string form
        // rather than producing `enum: [true]` which Gemini rejects.
        out.enum = [_stringifyEnumValue(value)];
        enumSet = true;
        continue;
      }
      if (key === 'enum' && Array.isArray(value)) {
        // Same TYPE_STRING constraint applies to `enum` directly. Source
        // schemas with `enum: [true, false]` or `enum: [1, 2, 3]` would
        // otherwise fail with `Invalid value at ...enum[0] (TYPE_STRING)`.
        out.enum = value.map(_stringifyEnumValue);
        enumSet = true;
        continue;
      }
      if (key === 'type' && Array.isArray(value)) {
        // type: ["string", "null"] is JSON Schema 2020 syntax; Gemini
        // wants type as a scalar plus nullable: true for the null case.
        const nonNull = value.filter(t => t !== 'null');
        out.type = nonNull[0] || 'string';
        if (value.includes('null')) out.nullable = true;
        continue;
      }
      out[key] = _sanitizeForGemini(value);
    }
    // Gemini rejects `enum` on a node without `type: "string"` with
    // `only allowed for STRING type`. Source schemas (Klaviyo's MCP for
    // one) put plain `{ enum: [...] }` leaves inside any_of/oneOf
    // branches with no type declared — JSON Schema infers string from
    // the literals, Gemini doesn't. Default the type when an enum was
    // set without one. Existing `type: "boolean"` / `"integer"` / etc.
    // are preserved per #433 (Gemini parses string-encoded enums back
    // to the parent type at function-call time).
    if (enumSet && !out.type) out.type = 'string';
    return out;
  }

  /* ── Coerce tool.schema to a JSONSchema object for the tools param ── */
  function _normalizeSchema(schema) {
    let normalized;
    if (!schema || typeof schema !== 'object') {
      normalized = { type: 'object', properties: {} };
    } else if (schema.type === 'object') {
      normalized = schema;
    } else {
      normalized = { type: 'object', properties: { input: schema } };
    }
    return _sanitizeForGemini(normalized);
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
        const fa = obj.final_answer;
        return {
          thought: obj.thought || null,
          action: null,
          actionInput: null,
          finalAnswer: typeof fa === 'string' ? fa : JSON.stringify(fa, null, 2),
        };
      }
    } catch { /* not valid JSON — fall through to text parsing */ }
    return null;
  }

  /* ── Per-provider hard caps on the `tools` array ──
     OpenAI rejects requests with more than 128 function declarations:
       400 Invalid 'tools': array too long. Expected an array with maximum
       length 128, but got an array with length 284 instead.
     Anthropic and Gemini have no comparable count-based cap in current
     documentation, so we leave their bodies untouched. Grok/Llama drop
     tools entirely via the noTools fallback branch and never reach here.

     When a generic agent (no capability_id, falls through to all-MCP
     tools) lands on an OpenAI model — either as its declared primary or
     via the runtime fallback chain — sending 200+ tools is a guaranteed
     400. The cap is deterministic (first N from the dedup order in
     _buildExecContext), so the same tools win across retries. */
  const PROVIDER_TOOL_LIMITS = {
    openai: 128,
  };

  function _providerForModel(modelId) {
    if (!modelId || typeof modelId !== 'string') return null;
    if (modelId.startsWith('gpt-') || modelId === 'o3' || modelId === 'codex') return 'openai';
    if (modelId.startsWith('claude-')) return 'anthropic';
    if (modelId.startsWith('gemini-')) return 'google';
    if (modelId.startsWith('grok-')) return 'xai';
    if (modelId.startsWith('llama-')) return 'meta';
    return null;
  }

  function _capToolsForModel(modelId, tools) {
    if (!Array.isArray(tools) || tools.length === 0) return tools;
    const provider = _providerForModel(modelId);
    const limit = provider && PROVIDER_TOOL_LIMITS[provider];
    if (!limit || tools.length <= limit) return tools;
    console.warn('[AgentExecutor] Truncating tools for', modelId, '(' + provider + '): ' + tools.length + ' → ' + limit + '. Generic-agent / capability_id-missing path is sending more tools than the provider accepts. First ' + limit + ' kept in dedup order.');
    return tools.slice(0, limit);
  }

  /* ── Call LLM via nice-ai edge function ──
     Passes `tools` when the executor has a tools schema so nice-ai can
     translate to each provider's native tool-use API (Anthropic tool_use,
     Gemini function_declarations, OpenAI tools). Returns the raw content
     (string or canonical parts array) + stop_reason for the executor to
     decide whether to loop.

     Auto-fallback: on transient/availability errors (503/429/404) walks
     LLMConfig.fallbackChain in capability order, capped at MAX_FALLBACKS.
     Tool count is capped per-provider on every call (primary + each
     fallback) since the fallback chain can cross provider families. */
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
      model:          llmConfig.model || 'gemini-2-5-flash',
      messages:       apiMessages,
      temperature:    llmConfig.temperature || 0.3,
      max_tokens:     llmConfig.max_tokens || 2048,
      // Blueprint-assigned model: if the user can't pay for it, fall back to
      // Gemini Flash inside nice-ai and surface a toast. Without this, the
      // catalog's llm_engine would 402 every dispatch for non-subscribers.
      auto_downgrade: true,
    };
    if (Array.isArray(toolsSchema) && toolsSchema.length > 0) {
      requestBody.tools = _capToolsForModel(requestBody.model, toolsSchema);
    }

    const _activity = (typeof LLMActivity !== 'undefined')
      ? LLMActivity.start(requestBody.model, blueprint?.id || blueprint?.name || null)
      : null;
    let _activityTokens = 0;

    try {
      let { data, error } = await _invokeWithBackoff(requestBody);

      // Walk LLMConfig.fallbackChain on retryable errors (503/429/404 — see
      // _isRetryableError). Stops on success, non-retryable error, or cap.
      const fallbackChain = llmConfig.fallbackChain || [];
      const MAX_FALLBACKS = 3;
      let tried = 0;
      let prevModel = requestBody.model;
      for (const fb of fallbackChain) {
        if (tried >= MAX_FALLBACKS) break;
        if (!((error || data?.error) && _isRetryableError(error, data))) break;
        if (typeof Notify !== 'undefined') {
          Notify.send({ title: 'Switching model', message: prevModel + ' unavailable — retrying with ' + fb.id, type: 'info' });
        }
        const fbBody = fb.noTools
          ? { ...requestBody, model: fb.id, tools: undefined }
          : { ...requestBody, model: fb.id, tools: _capToolsForModel(fb.id, toolsSchema) };
        const fbRes = await _invokeWithBackoff(fbBody);
        data  = fbRes.data;
        error = fbRes.error;
        prevModel = fb.id;
        tried++;
      }

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

      // v85 auto_downgrade: nice-ai fell back to Gemini Flash because the
      // user can't pay for the catalog-assigned model. Surface a one-shot
      // toast (deduped per from-model in Subscription.handleDowngrade).
      if (data.downgraded && typeof Subscription !== 'undefined' && Subscription.handleDowngrade) {
        Subscription.handleDowngrade(data.downgraded);
      }

      const rawContent = data.content ?? '';
      const tokensUsed = data.usage
        ? ((data.usage.input_tokens || 0) + (data.usage.output_tokens || 0))
        : Math.floor(JSON.stringify(rawContent).length / 4);
      _activityTokens = tokensUsed;

      return {
        content:    rawContent,
        stopReason: data.stop_reason || 'end_turn',
        model:      data.model || llmConfig.model,
        tokensUsed,
      };
    } finally {
      if (_activity) _activity.end({ totalTokens: _activityTokens });
    }
  }

  /* Returns true for errors that warrant a model swap.
     YES — 404 (model not found, e.g. stale id like 'claude-4' before #515 alias),
           429 (rate limit), 503 (overload).
     NO  — 402 (billing — handled by Subscription.handleBillingError, never auto-upgrade
           a paying user to a model on a different pool),
           400/401/403 (validation/auth — same problem on every model). */
  function _isRetryableError(error, data) {
    const httpStatus = error?.context?.status;
    if (httpStatus === 402 || httpStatus === 400 || httpStatus === 401 || httpStatus === 403) return false;
    if (httpStatus === 404 || httpStatus === 429 || httpStatus === 503) return true;
    const msg = String(
      _coerceErrorMessage(data?.error) ||
      _coerceErrorMessage(error?.message) ||
      ''
    );
    return /\b(404|429|503)\b|overload|unavailable|high.?demand|rate.?limit|capacity|not.?found|unknown.?model/i.test(msg);
  }

  /* Backoff base (ms) for same-model retries. Zeroed under Vitest so retry
     tests stay fast; real browsers (where `process` is undefined) get the
     full backoff. */
  const _RETRY_BASE_MS = (typeof process !== 'undefined' && process.env && process.env.VITEST) ? 0 : 600;

  /* True only for TRANSIENT overload (503/429) — the SAME model usually
     succeeds on a short retry, so back off and retry in place before walking
     the fallbackChain (useless when the user has only one model enabled, e.g.
     free-tier Gemini Flash). 404/unknown-model is not transient (needs a model
     swap) so it skips straight to fallback. Keep in sync with ship-log.js. */
  function _isTransientOverload(error, data) {
    const httpStatus = error?.context?.status;
    if (httpStatus === 503 || httpStatus === 429) return true;
    if (httpStatus === 404) return false;
    const msg = String(_coerceErrorMessage(data?.error) || _coerceErrorMessage(error?.message) || '');
    if (/\b404\b|not.?found|unknown.?model/i.test(msg)) return false;
    return /\b(429|503)\b|overload|unavailable|high.?demand|rate.?limit|capacity/i.test(msg);
  }

  /* Invoke nice-ai with bounded same-model exponential backoff on transient
     overload (up to 3 attempts: immediate, +600ms, +1200ms). */
  async function _invokeWithBackoff(body) {
    let res = await SB.functions.invoke('nice-ai', { body });
    for (let i = 1; i <= 2; i++) {
      if (!((res.error || res.data?.error) && _isTransientOverload(res.error, res.data))) break;
      await new Promise(r => setTimeout(r, _RETRY_BASE_MS * Math.pow(2, i - 1)));
      res = await SB.functions.invoke('nice-ai', { body });
    }
    return res;
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
     The heuristic (SIDE_EFFECT_PATTERNS) is the registry's SSOT now — the
     shared dispatch point that enforces the approval gate. This delegates so
     the agent loop, the Integrations pill labels, and the bus all agree on
     what counts as a write. ToolRegistry loads before AgentExecutor (script
     order + hard dependency), so it is always present at call time. */
  function _isSideEffectTool(toolId) {
    return typeof ToolRegistry !== 'undefined' && typeof ToolRegistry.isSideEffect === 'function'
      ? ToolRegistry.isSideEffect(toolId)
      : false;
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

  return { execute, converse, classifyTool, _isSideEffectTool, _logToShipLog, _normalizeSchema, _sanitizeForGemini };
})();
