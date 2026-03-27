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

      const tokensUsed = response.usage ? (response.usage.input_tokens + response.usage.output_tokens) : Math.floor(textContent.length / 4);
      metadata = {
        model:       response.model || llmConfig.model || 'gemini-2.5-flash',
        tokens_used: tokensUsed,
        duration_ms: Date.now() - startMs,
        context_len: context.length,
        source:      'llm',
      };
      response = response.content;

    } catch (e) {
      console.warn('[ShipLog] LLM call failed, using mock:', e.message || e);
      response = _mockResponse(agentBlueprint, prompt);
      metadata = {
        model:       llmConfig.model || 'mock',
        tokens_used: Math.floor(response.length / 4),
        duration_ms: Date.now() - startMs,
        context_len: context.length,
        source:      'mock',
      };
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

  /* ── Mock response pool (Phase 1) ── */
  const _ROLE_RESPONSES = {
    Research: [
      'I found 3 relevant sources on this topic. The key findings suggest a significant shift in market dynamics, with emerging players disrupting traditional approaches. I\'ll compile the full briefing.',
      'Cross-referencing databases now. Initial analysis shows strong correlation between the variables you mentioned. Generating executive summary.',
      'Research scan complete. 12 sources analyzed across academic papers, industry reports, and news. The consensus points toward a bullish outlook.',
    ],
    Analytics: [
      'Dataset processed. Key insight: there\'s a 23% variance between Q3 and Q4 metrics that warrants investigation. Chart attached.',
      'Running regression analysis on the provided data. Preliminary results show a strong positive correlation (r=0.87). Full report generating.',
      'Anomaly detected in row 847 — outlier exceeds 3 standard deviations. Flagged for review. Summary dashboard updated.',
    ],
    Content: [
      'Draft generated. 800 words, SEO-optimized with your target keywords. Tone matches brand guidelines. Ready for review.',
      'Created 3 content variants for A/B testing. Each targets a different audience segment. Scheduling for optimal posting times.',
      'Newsletter copy complete. Subject line options: 3 high-CTR variants based on historical performance data.',
    ],
    Engineering: [
      'Code review complete. 2 critical issues flagged: potential SQL injection on line 47 and an unhandled promise rejection. PR comments added.',
      'Infrastructure audit done. Current setup handles 10K RPM — recommend adding a CDN layer and connection pooling to reach 50K target.',
      'Test suite generated: 15 unit tests, 4 integration tests. Coverage increased from 62% to 89%. All passing.',
    ],
    Ops: [
      'Workflow optimized. Removed 3 redundant approval steps — estimated time savings: 4 hours per sprint cycle.',
      'Sprint planning complete. 12 tasks assigned across the team based on capacity and skill match. Blockers flagged.',
      'SLA report generated. 99.7% uptime this quarter. Two incidents tracked: both resolved under 15 minutes.',
    ],
    Sales: [
      'Lead scoring complete. 47 leads qualified this week — 12 marked hot with decision-maker engagement signals detected.',
      'Proposal drafted for the enterprise deal. Customized ROI section based on their public financials. Ready for your review.',
      'Pipeline analysis: $2.3M in active opportunities. Recommend prioritizing 3 deals closing this month.',
    ],
    Support: [
      'Ticket triage complete. 23 new tickets: 5 critical (SLA < 2h), 12 standard, 6 low-priority. Auto-responses sent for FAQs.',
      'Customer satisfaction report: 94.2% CSAT this week. Trending up from 91.8%. Top issue: onboarding confusion — knowledge base article drafted.',
      'Escalation handled. Root cause identified as a config mismatch. Fix deployed. Customer notified with resolution summary.',
    ],
    Legal: [
      'Contract review complete. 3 non-standard clauses flagged: indemnification scope, IP assignment timing, and termination notice period.',
      'Compliance checklist generated for GDPR and SOC 2 requirements. 2 gaps identified with remediation recommendations.',
      'NDA template updated with the latest regulatory requirements. Track-changes version attached for your review.',
    ],
    Marketing: [
      'Campaign brief generated. Target audience segmented into 3 cohorts based on engagement data. Creative recommendations included.',
      'Ad copy variants ready: 5 headlines, 3 descriptions. Predicted CTR improvement: 18% based on historical benchmarks.',
      'Competitive positioning analysis complete. We have clear differentiation in 3 areas. Messaging framework updated.',
    ],
    default: [
      'Task acknowledged. Processing your request now. I\'ll have results shortly.',
      'Analyzing the situation. Based on available data, here are my initial recommendations.',
      'Request received. Running the workflow now. Stand by for results.',
    ],
  };

  function _mockResponse(blueprint, prompt) {
    const role = (blueprint && blueprint.config && blueprint.config.role) || 'default';
    const pool = _ROLE_RESPONSES[role] || _ROLE_RESPONSES.default;
    return pool[Math.floor(Math.random() * pool.length)];
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
