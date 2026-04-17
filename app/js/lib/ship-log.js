/* ═══════════════════════════════════════════════════════════════════
   NICE — Ship's Log
   Shared context window for agents within a spaceship.
   Entries persist to Supabase `ship_log` table; realtime subscriptions
   keep all connected clients in sync.
═══════════════════════════════════════════════════════════════════ */

const ShipLog = (() => {
  let _channel = null;
  let _listeners = [];

  /* ── Write an entry to the log ── */
  async function append(spaceshipId, { agentId, role, content, metadata }) {
    if (!spaceshipId || !content) return null;

    const entry = {
      spaceship_id: spaceshipId,
      agent_id:     agentId || null,
      role:         role || 'system',
      content:      content,
      metadata:     metadata || {},
    };

    // Persist to Supabase if available
    if (typeof SB !== 'undefined' && SB.isReady()) {
      try {
        return await SB.db('ship_log').create(entry);
      } catch (err) {
        console.warn('[ShipLog] DB write failed, using local fallback:', err.message);
      }
    }

    // Local fallback (session storage)
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
        return await SB.db('ship_log').list({
          spaceship_id: spaceshipId,
          orderBy: 'created_at',
          asc: true,
          limit: limit,
        });
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
      if (typeof LLMConfig !== 'undefined' && LLMConfig.reportFallback) {
        LLMConfig.reportFallback(llmConfig.model, response.model);
      }
      response = response.content;

    } catch (e) {
      console.error('[ShipLog] LLM call failed:', e.message || e);
      // Surface the real error instead of hiding behind mock data
      throw new Error('AI call failed: ' + (e.message || 'Unknown error. Check your connection and try again.'));
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

  /* ── Real LLM call via nice-ai Edge Function ── */
  async function _callLLM(blueprint, prompt, context, config) {
    if (typeof SB === 'undefined' || !SB.functions) throw new Error('SB.functions not available');

    const params = _buildLLMParams(blueprint, prompt, context, config);
    const { data, error } = await SB.functions.invoke('nice-ai', { body: params });

    if (error) throw new Error(typeof error === 'string' ? error : error.message || 'Edge function error');
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
      const err = await res.text();
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
