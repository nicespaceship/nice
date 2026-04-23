/* ═══════════════════════════════════════════════════════════════════
   NICE — Ship's Log
   Shared context window for agents within a spaceship.
   Entries persist to Supabase `ship_log` table; realtime subscriptions
   keep all connected clients in sync.
═══════════════════════════════════════════════════════════════════ */

const ShipLog = (() => {
  let _channel = null;
  let _listeners = [];

  /* ── Route synthetic scope ids to the right ship_log column ──
     MissionRunner passes `'mission-<uuid>'` as a scope id when a mission
     has no spaceship. ship_log.spaceship_id is UUID, so those inserts fail
     the type check and the entry drops into the local fallback only — the
     DB reader then shows an empty Execution Log even for successful runs.
     Detect the pattern and route to ship_log.mission_id (added in migration
     20260423190000). Legitimate UUIDs still route to spaceship_id; anything
     else (test ids like "ship-1", legacy non-UUID keys) falls straight to
     the local fallback because SB.db().create will reject it at the DB. */
  const _MISSION_ID_RE = /^mission-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
  function _resolveScope(scopeId) {
    if (!scopeId || typeof scopeId !== 'string') return { spaceship_id: null, mission_id: null };
    const m = _MISSION_ID_RE.exec(scopeId);
    if (m) return { spaceship_id: null, mission_id: m[1] };
    return { spaceship_id: scopeId, mission_id: null };
  }

  // ship_log.agent_id is a UUID column. Catalog blueprint ids
  // ('bp-agent-inbox-captain' etc.) are not UUIDs — passing them
  // through made every insert fail at the DB with 400 / "invalid
  // input syntax for type uuid". Coerce non-UUID ids to null and
  // stash the original on metadata.agent_blueprint_id so the trace
  // still tells you which blueprint produced the row.
  const _UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /* ── Write an entry to the log ── */
  async function append(spaceshipId, { agentId, role, content, metadata }) {
    if (!spaceshipId || !content) return null;

    const scope = _resolveScope(spaceshipId);
    const isUuid = typeof agentId === 'string' && _UUID_RE.test(agentId);
    const safeAgentId = isUuid ? agentId : null;
    const enrichedMetadata = (!isUuid && agentId)
      ? Object.assign({}, metadata || {}, { agent_blueprint_id: agentId })
      : (metadata || {});
    const entry = {
      ...scope,
      agent_id:     safeAgentId,
      role:         role || 'system',
      content:      content,
      metadata:     enrichedMetadata,
    };

    // Persist to Supabase if available
    if (typeof SB !== 'undefined' && SB.isReady()) {
      try {
        return await SB.db('ship_log').create(entry);
      } catch (err) {
        console.warn('[ShipLog] DB write failed, using local fallback:', err.message);
      }
    }

    // Local fallback (session storage). Key off the raw scope id so reads
    // by the same synthetic id hit the same bucket whether DB is on or off.
    entry.id = crypto.randomUUID ? crypto.randomUUID() : 'local-' + Date.now();
    entry.created_at = new Date().toISOString();
    const key = 'nice-ship-log-' + spaceshipId;
    const local = JSON.parse(sessionStorage.getItem(key) || '[]');
    local.push(entry);
    if (local.length > 200) local.splice(0, local.length - 200);
    sessionStorage.setItem(key, JSON.stringify(local));
    _notifyListeners(entry);
    return entry;
  }

  /* ── Read log entries for a spaceship ── */
  async function getEntries(spaceshipId, limit) {
    limit = limit || 50;
    if (!spaceshipId) return [];

    if (typeof SB !== 'undefined' && SB.isReady()) {
      try {
        const scope = _resolveScope(spaceshipId);
        const filters = { orderBy: 'created_at', asc: true, limit };
        if (scope.mission_id)   filters.mission_id   = scope.mission_id;
        if (scope.spaceship_id) filters.spaceship_id = scope.spaceship_id;
        return await SB.db('ship_log').list(filters);
      } catch (err) {
        console.warn('[ShipLog] DB read failed, using local fallback:', err.message);
      }
    }

    // Local fallback
    const key = 'nice-ship-log-' + spaceshipId;
    const local = JSON.parse(sessionStorage.getItem(key) || '[]');
    return local.slice(-limit);
  }

  /* ── Build context window for an agent ── */
  function buildContext(entries, currentAgentId) {
    if (!entries || !entries.length) return [];
    return entries.map(e => ({
      role:    e.role === 'user' ? 'user' : 'assistant',
      content: e.content,
      name:    e.agent_id || 'system',
    }));
  }

  /* ── Subscribe to realtime updates ── */
  function subscribe(spaceshipId, callback) {
    if (!spaceshipId || !callback) return;
    _listeners.push({ spaceshipId, callback });

    // Supabase realtime
    if (typeof SB !== 'undefined' && SB.isReady() && !_channel) {
      _channel = SB.realtime.subscribe('ship_log', payload => {
        if (payload.new && payload.new.spaceship_id === spaceshipId) {
          _notifyListeners(payload.new);
        }
      });
    }
  }

  function unsubscribe() {
    _listeners = [];
    if (_channel && typeof SB !== 'undefined') {
      SB.realtime.unsubscribe(_channel);
      _channel = null;
    }
  }

  function _notifyListeners(entry) {
    _listeners.forEach(l => {
      if (!l.spaceshipId || l.spaceshipId === entry.spaceship_id) {
        try { l.callback(entry); } catch (e) { /* ignore */ }
      }
    });
  }

  /* ── Execute: prompt an agent via Ship's Log context ── */
  /* opts.onChunk(text) — called with each streaming text delta */
  async function execute(spaceshipId, agentBlueprint, prompt, opts) {
    if (!spaceshipId || !prompt) return null;
    opts = opts || {};

    const agentId = agentBlueprint ? agentBlueprint.id : null;
    const agentName = agentBlueprint ? agentBlueprint.name : 'NICE';

    // 1. Log the user message
    await append(spaceshipId, {
      agentId: null,
      role:    'user',
      content: prompt,
    });

    // 2. Get prior context
    const entries = await getEntries(spaceshipId, 20);
    const context = buildContext(entries, agentId);

    // 3. Compute LLM config
    let llmConfig = {};
    if (typeof LLMConfig !== 'undefined' && agentBlueprint) {
      llmConfig = LLMConfig.forBlueprint(agentBlueprint);
    }

    // 3b. Rate limit check — block if too many LLM calls
    if (typeof RateLimiter !== 'undefined' && !RateLimiter.check('llm')) {
      return {
        agent: agentName, agentId,
        content: 'Rate limit exceeded. Please wait a moment before sending another message.',
        metadata: { source: 'system', model: 'none', tokens_used: 0 },
      };
    }

    // 3c. LLM availability check — NICE provides free models to all users
    const enabledModels = typeof State !== 'undefined' ? State.get('enabled_models') || {} : {};
    const hasEnabledModel = Object.values(enabledModels).some(Boolean);
    if (!hasEnabledModel) {
      // Free models are always available even if nothing is explicitly enabled
      // This check is a soft gate — proceed anyway since NICE provides Gemini free
    }

    // 4. Try real LLM via Edge Function, fall back to mock
    let response;
    let metadata = {};
    const startMs = Date.now();

    try {
      if (opts.onChunk && typeof SB !== 'undefined' && SB.functions && SB.functions.invokeStream) {
        response = await _callLLMStream(agentBlueprint, prompt, context, llmConfig, opts.onChunk);
      } else {
        response = await _callLLM(agentBlueprint, prompt, context, llmConfig);
      }
      // Normalize content: Gemini returns string, Anthropic returns [{type:"text",text:"..."}]
      const rawContent = response.content;
      const textContent = typeof rawContent === 'string'
        ? rawContent
        : (Array.isArray(rawContent) && rawContent[0]?.text) || String(rawContent || '');
      response.content = textContent;

      // Prefer API-reported token counts; fall back to length estimate only as last resort
      let tokensUsed = 0;
      if (response.usage && (response.usage.input_tokens || response.usage.output_tokens)) {
        tokensUsed = (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0);
      } else if (response.usage && response.usage.total_tokens) {
        tokensUsed = response.usage.total_tokens;
      } else {
        tokensUsed = Math.floor(textContent.length / 4);
      }
      metadata = {
        model:       response.model || llmConfig.model || 'gemini-2.5-flash',
        tokens_used: tokensUsed,
        duration_ms: Date.now() - startMs,
        context_len: context.length,
        source:      'llm',
      };
      response = response.content;

    } catch (e) {
      console.error('[ShipLog] LLM call failed:', e.message || e);
      let msg = e?.message;
      if (!msg) {
        if (typeof e === 'string') msg = e;
        else { try { msg = JSON.stringify(e); } catch {} }
      }
      throw new Error('AI call failed: ' + (msg || 'Unknown error. Check your connection and try again.'));
    }

    // 5. Log agent response
    const logEntry = await append(spaceshipId, {
      agentId:  agentId,
      role:     'agent',
      content:  response,
      metadata: metadata,
    });

    // 6. Record agent progression stats
    if (typeof Gamification !== 'undefined' && agentId) {
      Gamification.recordAgentMission(agentId, {
        success: true,
        tokens: metadata.tokens_used || 0,
        tools: agentBlueprint?.config?.tools || [],
      });
    }

    return {
      agent:    agentName,
      agentId:  agentId,
      content:  response,
      metadata: logEntry ? logEntry.metadata : metadata,
    };
  }

  /* ── Build LLM request params (shared between stream/non-stream) ── */
  function _buildLLMParams(blueprint, prompt, context, config) {
    const role = (blueprint && blueprint.config && blueprint.config.role) || 'General';
    const systemPrompt = typeof PromptBuilder !== 'undefined'
      ? PromptBuilder.build(blueprint)
      : `You are ${blueprint ? blueprint.name : 'NICE AI'}, a ${role} agent. ${blueprint && blueprint.flavor ? blueprint.flavor : 'Provide helpful, concise responses.'}`;

    // System prompt goes as top-level param (nice-ai handles per-provider)
    const messages = [];
    if (context && context.length) {
      context.forEach(entry => {
        messages.push({
          role: entry.role === 'agent' ? 'assistant' : 'user',
          content: entry.content,
        });
      });
    }
    messages.push({ role: 'user', content: prompt });

    return {
      model:       config.model || 'gemini-2.5-flash',
      system:      systemPrompt,
      messages,
      temperature: config.temperature || 0.7,
      max_tokens:  config.max_tokens || 1024,
    };
  }

  /* ── Real LLM call via nice-ai Edge Function ──
     On HTTP 402 the body carries `{ error, code, ... }` identifying a
     billing gap (subscription_required | addon_required |
     insufficient_tokens | past_due). Subscription.handleBillingError
     shows the right CTA toast; we still throw so the caller knows the
     call failed. */
  async function _callLLM(blueprint, prompt, context, config) {
    if (typeof SB === 'undefined' || !SB.functions) throw new Error('SB.functions not available');

    const params = _buildLLMParams(blueprint, prompt, context, config);
    const { data, error } = await SB.functions.invoke('nice-ai', { body: params });

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
    if (!data || data.error) throw new Error(data?.error || 'Empty response from edge function');

    return data;
  }

  /* ── Streaming LLM call via nice-ai Edge Function ── */
  async function _callLLMStream(blueprint, prompt, context, config, onChunk) {
    if (typeof SB === 'undefined' || !SB.functions) throw new Error('SB.functions not available');

    const params = _buildLLMParams(blueprint, prompt, context, config);
    params.stream = true;

    // Use fetch directly for streaming (SB.functions.invoke doesn't support streams)
    const supabaseUrl = SB.client?.supabaseUrl || SB._url || '';
    const supabaseKey = SB.client?.supabaseKey || SB._key || '';
    const session = SB.auth?.session?.();
    const accessToken = session?.access_token || supabaseKey;

    const res = await fetch(`${supabaseUrl}/functions/v1/nice-ai`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'apikey': supabaseKey,
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      let body = null;
      try { body = await res.clone().json(); } catch { /* not JSON */ }
      if (res.status === 402 && body && body.code && typeof Subscription !== 'undefined' && Subscription.handleBillingError) {
        Subscription.handleBillingError(body);
        throw new Error(body.error || `Payment required`);
      }
      const err = body?.error || (await res.text());
      throw new Error(`Streaming error (${res.status}): ${err}`);
    }

    // Read the stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let model = config.model || 'gemini-2.5-flash';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      // Parse SSE lines: "data: {...}\n\n"
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed.choices?.[0]?.delta?.content || parsed.content || '';
          if (delta) {
            fullContent += delta;
            if (onChunk) onChunk(delta);
          }
          if (parsed.model) model = parsed.model;
        } catch { /* skip unparseable lines */ }
      }
    }

    return { content: fullContent, model, usage: { input_tokens: 0, output_tokens: Math.floor(fullContent.length / 4) } };
  }

  /**
   * Relay: send a message from one agent to another via the shared Ship's Log.
   * The receiving agent sees all prior context and responds.
   */
  async function relay(spaceshipId, fromAgent, toAgent, message) {
    if (!spaceshipId || !message) return null;
    const fromName = fromAgent ? fromAgent.name : 'System';

    // Log the relay message
    await append(spaceshipId, {
      agentId: fromAgent ? fromAgent.id : null,
      role: 'agent',
      content: `[→ ${toAgent ? toAgent.name : 'All'}] ${message}`,
      metadata: { type: 'relay', from: fromName, to: toAgent ? toAgent.name : 'all' },
    });

    // If a specific receiving agent is specified, have them respond
    if (toAgent) {
      return await execute(spaceshipId, toAgent, message);
    }

    return null;
  }

  /**
   * Chain: run a sequence of agents on the same prompt, each building on the prior.
   * Returns the final agent's response.
   */
  async function chain(spaceshipId, agents, initialPrompt, opts) {
    if (!spaceshipId || !agents || !agents.length || !initialPrompt) return null;
    opts = opts || {};

    let lastResult = null;
    for (const agent of agents) {
      const prompt = lastResult
        ? `${initialPrompt}\n\nPrevious agent (${lastResult.agent}) said:\n${lastResult.content}`
        : initialPrompt;
      lastResult = await execute(spaceshipId, agent, prompt, opts);
      if (!lastResult) break;
    }
    return lastResult;
  }

  return { append, getEntries, buildContext, subscribe, unsubscribe, execute, relay, chain };
})();
