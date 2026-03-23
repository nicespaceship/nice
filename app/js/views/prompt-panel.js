/* ═══════════════════════════════════════════════════════════════════
   NICE AI — Prompt Interface with Monitor
   Floating prompt bar at bottom. AI responses render on the full-screen
   "monitor" overlay — not in small chat bubbles.
   The main content area = the monitor/screen.
   The prompt bar = the control interface.
═══════════════════════════════════════════════════════════════════ */

const PromptPanel = (() => {

  const STORAGE_KEY = 'nice-ai-messages';

  let _panel = null;
  let _monitor = null;
  let _monitorContent = null;
  let _appMain = null;
  let _messages = [];
  let _sending = false;
  let _mentionPopup = null;
  let _mentionItems = [];
  let _mentionIdx = -1;
  let _routeAgent = null; // agent context from current route (e.g. #/agents/:id)
  let _recognition = null;
  let _audioCtx = null;
  let _analyser = null;
  let _micStream = null;
  let _waveAnimId = null;
  let _ttsEnabled = localStorage.getItem('nice-tts') === 'true';

  /* ── Conversation Flow Engine ── */
  let _activeFlow = null; // { steps, currentStep, answers, onComplete, onCancel }

  /* ── Randomized empty-state prompts ── */
  const _EMPTY_PROMPTS = [
    'Your agents are standing by…',
    'What\'s the mission?',
    'Brief your agents…',
    'Awaiting orders, Commander.',
    'All systems nominal. What\'s next?',
    '@ an agent or type a command…',
    'Standing by for your signal…',
    'Mission briefing…',
  ];

  /* ── Generic NICE responses (no blueprint selected) ── */
  const _NS_RESPONSES = [
    'I\'ve analyzed the data. Your fleet efficiency is trending upward — 12% improvement this quarter.',
    'Based on current agent utilization, I recommend scaling your Web Researcher agent to handle the increased workload.',
    'Mission "Scrape competitor pricing" is 87% complete. Estimated finish: 14 minutes.',
    'I\'ve detected a potential cost optimization: consolidating two idle agents could save approximately $23/month.',
    'Your top-performing agent this week is Alpha Strike with 142 tasks completed and a 98.2% success rate.',
    'Fleet status: 6 agents online, 2 in standby, 0 errors. All systems nominal, Commander.',
    'I recommend scheduling a maintenance window for your Data Pipeline agent — it\'s been running continuously for 72 hours.',
    'Analysis complete: Your most cost-effective agent is the Content Writer at $0.003 per task.',
  ];

  /* ── Agent-specific response pools ── */
  const _AGENT_RESPONSES = {
    Research: [
      'I\'ve compiled a comprehensive analysis from 47 sources. Key findings suggest a 23% market shift toward AI-first solutions.',
      'Research complete. I found 12 relevant papers and 3 industry reports that match your query.',
      'Scanning databases now… Found 156 entries matching your criteria. Filtering for relevance.',
    ],
    Code: [
      'I\'ve reviewed the codebase and identified 3 optimization opportunities. Shall I implement them?',
      'Code analysis complete. 2 potential bugs found in the authentication module.',
      'I\'ve generated the boilerplate code and added comprehensive tests. Ready for review.',
    ],
    Data: [
      'Dataset processed: 1.2M rows analyzed. 3 anomalies detected in the Q3 revenue data.',
      'I\'ve built the ETL pipeline. Processing throughput: ~50K records/minute.',
      'Data visualization ready. The trend line shows a clear correlation between deployment frequency and revenue.',
    ],
    Content: [
      'Draft complete. I\'ve written 1,200 words optimized for SEO with 3 suggested header variations.',
      'Content analysis: readability score 72 (good), sentiment: positive, keyword density: optimal.',
      'I\'ve generated 5 variations of the marketing copy. Option 3 tests highest for engagement.',
    ],
    Ops: [
      'Infrastructure scan complete. All services healthy. CPU utilization across the fleet: 34%.',
      'Deployment pipeline executed successfully. Zero-downtime deploy confirmed.',
      'Alert: Memory usage on the staging server hit 87%. I\'ve auto-scaled to prevent issues.',
    ],
    Analytics: [
      'Dashboard updated with latest metrics. Revenue up 8%, user retention steady at 94%.',
      'I\'ve identified a funnel drop-off at step 3. Conversion could improve 15% with UX changes.',
      'Predictive model suggests next month\'s growth rate will be 12% based on current trends.',
    ],
    Security: [
      'Security scan complete. No critical vulnerabilities detected. 2 minor advisories to review.',
      'Compliance check passed. All endpoints meet security standards.',
      'Threat assessment complete. Risk level: Low.',
    ],
    Custom: [
      'Task received. Processing your request now.',
      'Working on it — should have results shortly.',
      'Done. Let me know if you need anything else.',
      'I\'ve completed the analysis. Here\'s what I found...',
      'Understood. I\'ll get right on that.',
      'Request processed. Everything looks good on my end.',
    ],
  };

  const _SHIP_RESPONSES = [
    'All agents online and standing by. What\'s the mission?',
    'Ship systems nominal. Agents are coordinated and ready for tasking.',
    'I\'ve briefed the agents on your request. Assigning tasks now.',
    'Fleet-wide status: all agents operational. Awaiting your orders, Captain.',
    'Running diagnostics across all assigned agents. Everything checks out.',
    'Agent coordination complete. All agents are synced and ready.',
  ];

  const _esc = Utils.esc;

  /* ── Markdown → HTML (runs on raw text, escapes non-code content) ── */
  function _md(text) {
    // Extract fenced code blocks BEFORE escaping (preserve raw content)
    const codeBlocks = [];
    let s = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push(
        '<pre class="monitor-code-block"' + (lang ? ' data-lang="' + _esc(lang) + '"' : '') + '>' +
        '<code>' + _esc(code.replace(/\n$/, '')) + '</code></pre>'
      );
      return '\x00CODE' + idx + '\x00';
    });

    // Escape remaining text
    s = _esc(s);

    // Inline code: `text`
    s = s.replace(/`([^`]+?)`/g, '<code class="monitor-inline-code">$1</code>');
    // Bold: **text** or __text__
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
    // Italic: *text* or _text_ (but not inside words)
    s = s.replace(/(?<!\w)\*([^*]+?)\*(?!\w)/g, '<em>$1</em>');
    // URLs → clickable links (after escaping so &amp; etc. are already in place)
    s = s.replace(/(?<![="'])(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener" class="monitor-link">$1</a>');
    // Headers: ### text, ## text, # text
    s = s.replace(/^###\s+(.+)$/gm, '<h4 class="monitor-h">$1</h4>');
    s = s.replace(/^##\s+(.+)$/gm, '<h3 class="monitor-h">$1</h3>');
    s = s.replace(/^#\s+(.+)$/gm, '<h3 class="monitor-h">$1</h3>');
    // Numbered lists: 1. text, 2. text, etc.
    s = s.replace(/^\d+\.\s+(.+)$/gm, '<li class="monitor-ol-item">$1</li>');
    s = s.replace(/(<li class="monitor-ol-item">.*<\/li>\n?)+/g, (m) => '<ol>' + m + '</ol>');
    // Bullet lists: lines starting with - or •
    s = s.replace(/^[\-•]\s+(.+)$/gm, '<li>$1</li>');
    s = s.replace(/(<li>(?:(?!class=).)*<\/li>\n?)+/g, (m) => '<ul>' + m + '</ul>');
    // Paragraphs: double newlines
    s = s.replace(/\n{2,}/g, '</p><p>');
    // Single newlines → <br>
    s = s.replace(/\n/g, '<br>');
    // Wrap in paragraph
    s = '<p>' + s + '</p>';
    // Clean empty paragraphs
    s = s.replace(/<p>\s*<\/p>/g, '');
    // Restore code blocks
    codeBlocks.forEach((block, i) => {
      s = s.replace('\x00CODE' + i + '\x00', block);
    });
    return s;
  }

  /* ── Fallback AI connectors ── */
  const _AI_CONNECTORS_FALLBACK = [
    { id: 'int-anthropic', name: 'Anthropic', status: 'connected' },
    { id: 'int-openai',    name: 'OpenAI',    status: 'available' },
    { id: 'int-gemini',    name: 'Google Gemini', status: 'available' },
    { id: 'int-mistral',   name: 'Mistral',   status: 'available' },
    { id: 'int-cohere',    name: 'Cohere',    status: 'available' },
    { id: 'int-huggingface', name: 'Hugging Face', status: 'available' },
  ];

  function _getAIConnectors() {
    const list = (typeof State !== 'undefined' && State.get('connectors')) || [];
    const aiList = list.filter(i => i.category === 'AI & ML');
    return aiList.length ? aiList : _AI_CONNECTORS_FALLBACK;
  }

  function _getSlottedAgents() {
    try {
      const shipId = localStorage.getItem('nice-mc-ship') || 'default-ship';
      const raw = localStorage.getItem('nice-mc-slots');
      if (!raw) return [];
      const all = JSON.parse(raw);
      const slotMap = all[shipId] || {};
      const agents = [];
      for (const [slotIdx, bpId] of Object.entries(slotMap)) {
        if (!bpId) continue;
        const bp = (typeof BlueprintStore !== 'undefined') ? BlueprintStore.getAgent(bpId)
          : (typeof BlueprintsView !== 'undefined' && BlueprintsView.SEED) ? BlueprintsView.SEED.find(b => b.id === bpId) : null;
        if (bp) agents.push({ id: bp.id, name: bp.name, role: bp.config?.role || 'Custom', slot: slotIdx });
      }
      return agents;
    } catch { return []; }
  }

  /* ── Load/save messages (localStorage for persistence across refreshes) ── */
  function _loadMessages() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      _messages = raw ? JSON.parse(raw) : [];
    } catch { _messages = []; }
  }

  function _saveMessages() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_messages)); } catch {}
  }

  /* ════════════════════════════════════════════════════════════
     MONITOR — Full-screen response rendering
  ════════════════════════════════════════════════════════════ */

  function _showMonitor() {
    if (!_appMain) return;
    _appMain.classList.add('monitor-active');
    _updateResumeBtn();
  }

  function _hideMonitor() {
    if (!_appMain) return;
    _appMain.classList.remove('monitor-active');
    _updateResumeBtn();
  }

  function _updateResumeBtn() {}

  function _isMonitorActive() {
    return _appMain?.classList.contains('monitor-active') || false;
  }

  /* ── Theme name → Theme.set() key mapping ── */
  // Maps user-friendly names (lowercase) to the key Theme.set() expects
  const _THEME_MAP = {
    'spaceship': 'spaceship', 'robotech': 'robotech', 'navigator': 'navigator',
    'solar': 'solar', 'matrix': 'matrix', 'retro': 'retro', 'lcars': 'lcars',
    'pixel': 'pixel', '16-bit pixel': 'pixel', '16-bit': 'pixel',
    'cyberpunk neon': 'theme-cyberpunk', 'cyberpunk': 'theme-cyberpunk', 'neon': 'theme-cyberpunk',
    'ocean depths': 'theme-ocean', 'ocean': 'theme-ocean',
    'sunset gradient': 'theme-sunset', 'sunset': 'theme-sunset',
    'holo chrome': 'theme-holo', 'holo': 'theme-holo', 'holographic': 'theme-holo',
    'synthwave': 'theme-synthwave',
    'arctic': 'theme-arctic',
    'volcanic': 'theme-volcanic', 'molten': 'theme-volcanic', 'lava': 'theme-volcanic',
    'steampunk': 'theme-steampunk',
    'forest': 'theme-forest', 'jungle': 'theme-forest',
    'ultraviolet': 'theme-ultraviolet', 'uv': 'theme-ultraviolet',
  };
  const _THEME_NAMES = Object.keys(_THEME_MAP);

  function _resolveTheme(input) {
    const lower = input.toLowerCase().trim();
    if (_THEME_MAP[lower]) return _THEME_MAP[lower];
    // Partial match fallback
    const match = _THEME_NAMES.find(n => n.includes(lower) || lower.includes(n));
    return match ? _THEME_MAP[match] : null;
  }

  /* ── Parse [ACTION: label | route], [THEME: name], and [EXEC: action | params] from response text ── */
  function _parseActions(text) {
    const actions = [];
    const regex = /\[ACTION:\s*(.+?)\s*\|\s*(.+?)\s*\]/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      actions.push({ label: match[1], route: match[2] });
    }
    // Parse EXEC markers for tool use
    const execs = [];
    const execRegex = /\[EXEC:\s*(\w+)\s*(?:\|\s*(.*?))?\s*\]/g;
    let execMatch;
    while ((execMatch = execRegex.exec(text)) !== null) {
      const params = execMatch[2] ? execMatch[2].split('|').map(p => p.trim()) : [];
      execs.push({ action: execMatch[1], params });
    }
    // Parse and apply theme commands from LLM responses
    const themeRegex = /\[THEME:\s*(.+?)\s*\]/gi;
    let themeMatch;
    while ((themeMatch = themeRegex.exec(text)) !== null) {
      const key = _resolveTheme(themeMatch[1]);
      if (key && typeof Theme !== 'undefined') Theme.set(key);
    }
    const clean = text
      .replace(/\[ACTION:\s*.+?\s*\|\s*.+?\s*\]/g, '')
      .replace(/\[EXEC:\s*\w+\s*(?:\|.*?)?\s*\]/g, '')
      .replace(/\[THEME:\s*.+?\s*\]/gi, '')
      .trim();
    return { clean, actions, execs };
  }

  /* ── Execute EXEC actions from LLM responses ── */
  async function _executeExec(action, params) {
    const user = State.get('user');
    if (!user) return { ok: false, msg: 'Not signed in' };

    switch (action) {
      case 'create_mission': {
        const [title, agentHint, priority] = params;
        // Find best agent if a hint was given
        let agentId = null;
        if (agentHint) {
          const agents = State.get('agents') || [];
          const a = agents.find(a => a.name.toLowerCase().includes(agentHint.toLowerCase()));
          if (a) agentId = a.supabase_id || a.id;
          // Don't use bp- IDs for Supabase — resolve to UUID
          if (agentId && agentId.startsWith('bp-') && typeof BlueprintStore !== 'undefined') {
            agentId = BlueprintStore.getAgentUuid(agentId) || null;
          }
        }
        try {
          const created = await SB.db('tasks').create({
            user_id: user.id, title: title || 'Untitled Mission',
            agent_id: agentId, status: 'queued',
            priority: priority || 'medium', progress: 0,
          });
          // Update local State
          const missions = State.get('missions') || [];
          missions.push(created);
          State.set('missions', [...missions]);
          // Auto-run if agent assigned
          if (agentId && created && created.id && typeof MissionRunner !== 'undefined') {
            MissionRunner.run(created.id);
          }
          return { ok: true, msg: `Mission "${title}" created${agentId ? ' and running' : ''}.`, data: created };
        } catch (e) {
          return { ok: false, msg: e.message || 'Failed to create mission' };
        }
      }
      case 'activate_blueprint': {
        const [bpId] = params;
        if (typeof BlueprintStore !== 'undefined' && typeof BlueprintsView !== 'undefined') {
          if (!BlueprintStore.isAgentActivated(bpId)) {
            BlueprintStore.activateAgent(bpId);
            if (typeof Gamification !== 'undefined') Gamification.addXP('activate_blueprint');
            // Add to local State
            const bp = BlueprintStore.getAgent(bpId);
            if (bp) {
              const agents = State.get('agents') || [];
              if (!agents.find(a => a.id === 'bp-' + bpId)) {
                agents.push({ id: 'bp-' + bpId, name: bp.name, role: bp.config?.role || 'General', status: 'idle', blueprint_id: bpId });
                State.set('agents', agents);
              }
            }
          }
          return { ok: true, msg: `Blueprint ${bpId} added.` };
        }
        return { ok: false, msg: 'BlueprintStore not available' };
      }
      case 'run_mission': {
        const [missionId] = params;
        if (typeof MissionRunner !== 'undefined' && missionId) {
          MissionRunner.run(missionId);
          return { ok: true, msg: 'Mission execution started.' };
        }
        return { ok: false, msg: 'MissionRunner not available' };
      }
      default:
        return { ok: false, msg: `Unknown action: ${action}` };
    }
  }

  /* ── Pick the best agent for a task based on keyword matching ── */
  function _pickBestAgent(title, agents) {
    if (!agents || !agents.length) return null;
    const lower = title.toLowerCase();
    const roleKeywords = {
      Content: ['write', 'draft', 'blog', 'copy', 'tagline', 'content', 'article', 'description', 'story'],
      Marketing: ['marketing', 'social', 'brand', 'seo', 'campaign', 'advertis'],
      Code: ['code', 'build', 'fix', 'debug', 'implement', 'develop', 'program', 'engineer'],
      Research: ['research', 'analyze', 'find', 'investigate', 'study', 'report', 'segment', 'customer'],
      Data: ['data', 'analytics', 'dashboard', 'metrics', 'chart', 'track'],
      Ops: ['deploy', 'monitor', 'infrastructure', 'devops', 'server', 'incident'],
      Support: ['support', 'ticket', 'customer', 'help', 'respond'],
      Finance: ['invoice', 'budget', 'cost', 'financ', 'revenue', 'payment'],
      Planning: ['plan', 'schedule', 'roadmap', 'strategy', 'mission', 'project'],
    };
    for (const [role, keywords] of Object.entries(roleKeywords)) {
      if (keywords.some(kw => lower.includes(kw))) {
        const match = agents.find(a => {
          const r = (a.role || a.category || '').toLowerCase();
          const n = (a.name || '').toLowerCase();
          return r.includes(role.toLowerCase()) || n.includes(role.toLowerCase());
        });
        if (match) return match;
      }
    }
    return agents[0]; // fallback to first available
  }

  /* ── Auto-mission: create mission, assign agent, run, stream result ── */
  async function _executeAutoMission(title, sendBtn) {
    const user = State.get('user');
    const agents = State.get('agents') || [];
    const agent = _pickBestAgent(title, agents);
    const agentName = agent ? agent.name : 'NICE';

    // Show creation message
    _removeMonitorThinking();
    _messages.push({
      role: 'assistant',
      text: `**Mission Created:** "${title}"\n**Assigned to:** ${agentName}\n**Status:** Executing now...`,
      agent: 'NICE', ts: Date.now(),
    });
    _saveMessages();
    _renderMonitor();

    // Resolve agent ID for Supabase
    let agentId = null;
    if (agent) {
      agentId = agent.supabase_id || null;
      if (!agentId && agent.id?.startsWith('bp-') && typeof BlueprintStore !== 'undefined') {
        agentId = BlueprintStore.getAgentUuid(agent.id);
      }
    }

    // Create mission in Supabase
    let mission = null;
    try {
      mission = await SB.db('tasks').create({
        user_id: user.id, title, agent_id: agentId,
        status: 'queued', priority: 'medium', progress: 0,
      });
      const missions = State.get('missions') || [];
      missions.push(mission);
      State.set('missions', [...missions]);
    } catch (e) {
      // Update message with error
      _messages[_messages.length - 1].text += `\n\n**Error creating mission:** ${e.message}`;
      _saveMessages();
      _renderMonitor();
      _sending = false;
      if (sendBtn) sendBtn.disabled = false;
      return;
    }

    // Run MissionRunner
    if (mission && mission.id && typeof MissionRunner !== 'undefined') {
      try {
        const result = await MissionRunner.run(mission.id);
        if (result && result.content) {
          _messages.push({
            role: 'assistant',
            text: result.content,
            agent: agentName,
            ts: Date.now(),
          });
        } else {
          _messages.push({
            role: 'assistant',
            text: 'Mission completed but no output was returned. Check Missions for details.\n[ACTION: Missions | #/missions]',
            agent: 'NICE', ts: Date.now(),
          });
        }
      } catch (e) {
        _messages.push({
          role: 'assistant',
          text: `**Mission failed:** ${e.message}\n[ACTION: View Missions | #/missions]`,
          agent: 'NICE', ts: Date.now(), error: true,
        });
      }
    } else {
      _messages.push({
        role: 'assistant',
        text: 'Mission queued. Assign an agent or visit Bridge to run it.\n[ACTION: Bridge | #/missions]',
        agent: 'NICE', ts: Date.now(),
      });
    }

    _saveMessages();
    _renderMonitor();
    _sending = false;
    if (sendBtn) sendBtn.disabled = false;
  }

  function _renderMonitor() {
    if (!_monitorContent) return;

    if (_messages.length === 0) {
      _hideMonitor();
      return;
    }

    // Render all messages as a conversation on the monitor
    let html = '';
    for (const m of _messages) {
      if (m.role === 'user') {
        html += `<div class="monitor-user-msg"><div class="monitor-user-bubble">${_esc(m.text)}</div></div>`;
      } else if (m.role === 'system') {
        html += `<div class="monitor-system-msg">${_esc(m.text)}</div>`;
      } else {
        const agentLabel = m.agent
          ? `<div class="monitor-card-agent">${_esc(m.agent)}</div>`
          : `<div class="monitor-card-agent">NICE</div>`;

        let stepsHtml = '';
        if (m.steps && m.steps.length) {
          stepsHtml = '<div class="monitor-steps">' + m.steps.map(s => {
            const inputStr = s.actionInput ? JSON.stringify(s.actionInput) : '';
            const obsStr = s.observation || '';
            return `<details class="monitor-step">` +
              `<summary>Step ${s.index}: ${s.action ? _esc(s.action) : 'Final Answer'}</summary>` +
              (s.thought ? `<div class="monitor-step-detail"><strong>Thought:</strong> ${_esc(s.thought)}</div>` : '') +
              (s.action ? `<div class="monitor-step-detail"><strong>Action:</strong> ${_esc(s.action)}</div>` : '') +
              (inputStr ? `<div class="monitor-step-detail"><strong>Input:</strong> ${_esc(inputStr.length > 200 ? inputStr.slice(0, 200) + '…' : inputStr)}</div>` : '') +
              (obsStr ? `<div class="monitor-step-detail"><strong>Output:</strong> ${_esc(obsStr.length > 300 ? obsStr.slice(0, 300) + '…' : obsStr)}</div>` : '') +
            `</details>`;
          }).join('') + '</div>';
        }

        // Parse actions from text
        const { clean, actions } = _parseActions(m.text);
        let actionsHtml = '';
        if (actions.length) {
          actionsHtml = '<div class="monitor-actions">' + actions.map(a =>
            `<button class="monitor-action-btn" data-route="${_esc(a.route)}">${_esc(a.label)}</button>`
          ).join('') + '</div>';
        }

        const time = m.ts ? new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const modelBadge = m.model ? `<span class="monitor-model-badge">${_esc(m.model.toUpperCase())}</span>` : '';

        // Error message with retry button
        let retryHtml = '';
        if (m.error && m.retryText) {
          retryHtml = `<button class="monitor-retry-btn" data-retry="${_esc(m.retryText)}">Retry</button>`;
        }

        const cardClass = m.error ? 'monitor-card monitor-card-error' : 'monitor-card';

        html += `<div class="${cardClass}">${agentLabel}<div class="monitor-card-text">${_md(clean)}</div>${actionsHtml}${retryHtml}${stepsHtml}` +
          `<div class="monitor-card-meta">${modelBadge}${time ? (modelBadge ? ' · ' : '') + time : ''}</div>` +
        `</div>`;
      }
    }

    _monitorContent.innerHTML = html;
    _showMonitor();

    // Bind action buttons directly (safety net for delegated handler)
    _monitorContent.querySelectorAll('.monitor-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        let route = btn.dataset.route?.trim();
        if (!route) return;
        if (route.startsWith('/')) route = '#' + route;
        else if (!route.startsWith('#')) route = '#/' + route;
        _hideMonitor();
        if (typeof Router !== 'undefined') Router.navigate(route);
        else location.hash = route;
      });
    });

    // Scroll to bottom of monitor
    const monitorEl = document.getElementById('nice-monitor');
    if (monitorEl) monitorEl.scrollTop = monitorEl.scrollHeight;

    // TTS: speak the latest assistant message (without action tags)
    const last = _messages[_messages.length - 1];
    if (last && last.role === 'assistant' && last.text) {
      const { clean: ttsText } = _parseActions(last.text);
      _speak(ttsText);
    }
  }

  function _addMonitorThinking() {
    if (!_monitorContent) return;
    const div = document.createElement('div');
    div.className = 'monitor-thinking';
    div.id = 'monitor-thinking';
    div.innerHTML = '<div class="monitor-thinking-dots"><span></span><span></span><span></span></div><span class="monitor-thinking-label">Thinking…</span>';
    _monitorContent.appendChild(div);
    const monitorEl = document.getElementById('nice-monitor');
    if (monitorEl) monitorEl.scrollTop = monitorEl.scrollHeight;
  }

  function _removeMonitorThinking() {
    document.getElementById('monitor-thinking')?.remove();
  }

  function _renderNavOnMonitor(label) {
    if (!_monitorContent) return;
    // Show a brief navigation card, then fade out
    const card = document.createElement('div');
    card.className = 'monitor-nav-card';
    card.innerHTML = `
      <div class="monitor-nav-icon">→</div>
      <div>
        <div class="monitor-nav-text">Navigating to ${_esc(label)}</div>
        <div class="monitor-nav-sub">Loading view…</div>
      </div>
    `;
    _monitorContent.appendChild(card);
    _showMonitor();
    // Auto-hide after navigation completes
    setTimeout(() => _hideMonitor(), 1200);
  }

  /* ── Parse @mentions ── */
  function _parseMention(text) {
    const match = text.match(/@([\w\s]+?)(?:\s|$)/);
    if (!match) return null;
    const query = match[1].trim().toLowerCase();
    const agents = _getSlottedAgents();
    return agents.find(a => a.name.toLowerCase().includes(query)) || null;
  }

  /* ── Navigation & action intent map ── */
  // Order matters — more specific keywords must come before generic ones
  const _NAV_INTENTS = [
    // Blueprint tabs (specific before generic)
    { keywords: ['spaceship blueprint', 'ship blueprint', 'browse spaceship', 'saas blueprint'], route: '#/blueprints?tab=spaceship', label: 'Spaceship Blueprints' },
    { keywords: ['agent blueprint', 'browse agent'], route: '#/blueprints?tab=agent', label: 'Agent Blueprints' },
    { keywords: ['blueprint', 'terminal', 'catalog', 'browse blueprint', 'add agent'], route: '#/blueprints', label: 'Blueprints' },
    // Home
    { keywords: ['bridge', 'home', 'dashboard', 'main', 'go home'], route: '#/', label: 'Bridge' },
    // Agents (specific before generic)
    { keywords: ['create agent', 'new agent', 'build agent', 'add agent'], route: '#/blueprints/agents/new', label: 'Agent Builder' },
    { keywords: ['agent', 'my agent', 'view agent', 'manage agent', 'show agent'], route: '#/blueprints/agents', label: 'Agents' },
    // Spaceships & Fleets
    { keywords: ['shipyard', 'spaceship', 'my ship', 'show ship', 'view ship'], route: '#/blueprints/spaceships', label: 'Shipyard' },
    // Missions
    { keywords: ['mission board', 'board'], route: '#/missions', label: 'Missions' },
    { keywords: ['new mission', 'create mission', 'start mission'], route: '#/missions', label: 'Missions' },
    { keywords: ['mission', 'my mission', 'task', 'show mission'], route: '#/missions', label: 'Missions' },
    // Operations
    { keywords: ['operations', 'analytics', 'performance', 'stats', 'metrics', 'report'], route: '#/analytics', label: 'Operations' },
    { keywords: ['cost', 'spending', 'budget', 'token cost', 'token tracker'], route: '#/cost', label: 'Cost Tracker' },
    // Workflows
    { keywords: ['workflow', 'automation', 'automate'], route: '#/workflows', label: 'Workflows' },
    // MCP Connectors (blueprints with mcp config)
    { keywords: ['connector', 'mcp', 'connect', 'api key', 'tool', 'service'], route: '#/blueprints', label: 'Blueprints' },
    // Comms
    { keywords: ['comms', 'communication', 'message', 'notification', 'broadcast'], route: '#/comms', label: 'Comms Hub' },
    // Wallet & Tokens
    { keywords: ['wallet', 'balance', 'tokens', 'credits', 'payment', 'purchase tokens'], route: '#/wallet', label: 'Wallet' },
    // Vault & Security
    { keywords: ['vault', 'secret', 'credential', 'password'], route: '#/vault', label: 'Vault' },
    { keywords: ['security', 'audit', 'access control'], route: '#/security', label: 'Security' },
    // Log
    { keywords: ['ship log', 'ship\'s log', 'captain\'s log', 'log', 'activity log'], route: '#/log', label: 'Log' },
    // Theme Creator
    { keywords: ['theme editor', 'theme creator', 'create theme', 'custom theme', 'build theme'], route: '#/theme-editor', label: 'Theme Editor' },
    // Settings & Profile
    { keywords: ['setting', 'preferences', 'config', 'options'], route: '#/settings', label: 'Settings' },
    { keywords: ['profile', 'account', 'my profile', 'my account'], route: '#/profile', label: 'Profile' },
  ];

  /* ── Status query handlers ── */
  function _detectStatusQuery(text) {
    const lower = text.toLowerCase();

    if (/how many (agent|crew)/i.test(lower) || /agent count/i.test(lower)) {
      const agents = (typeof State !== 'undefined' && State.get('agents')) || [];
      const slotted = _getSlottedAgents();
      return { text: `You have ${agents.length || slotted.length || 0} agent${agents.length !== 1 ? 's' : ''} in your fleet.${slotted.length ? ' ' + slotted.length + ' currently assigned to ship slots.' : ''}` };
    }

    if (/mission.*(running|active|progress|status)/i.test(lower) || /running mission/i.test(lower) || /how many mission/i.test(lower)) {
      const missions = (typeof State !== 'undefined' && State.get('missions')) || [];
      const running = missions.filter(m => m.status === 'running' || m.status === 'in_progress');
      const completed = missions.filter(m => m.status === 'completed' || m.status === 'done');
      return { text: `${running.length} mission${running.length !== 1 ? 's' : ''} running, ${completed.length} completed, ${missions.length} total.` };
    }

    if (/how many (spaceship|ship)/i.test(lower) || /ship count/i.test(lower)) {
      const ships = (typeof State !== 'undefined' && State.get('spaceships')) || [];
      return { text: `You have ${ships.length || 0} spaceship${ships.length !== 1 ? 's' : ''} in your fleet.` };
    }

    if (/token|balance|credit/i.test(lower) && /(how much|what|check|my|remaining)/i.test(lower)) {
      const tokens = (typeof State !== 'undefined' && State.get('tokens')) || localStorage.getItem('nice-tokens') || 'unknown';
      return { text: tokens !== 'unknown' ? `Your current token balance is ${tokens} credits.` : 'Token balance unavailable — check Operations for details.' };
    }

    if (/\b(rank|xp|level|experience)\b/i.test(lower) && /(what|my|current|check|show)/i.test(lower)) {
      const xp = parseInt(localStorage.getItem('nice-xp') || '0', 10);
      const ranks = [
        { name: 'Ensign', min: 0 }, { name: 'Lieutenant JG', min: 10000 },
        { name: 'Lieutenant', min: 25000 }, { name: 'Lt Commander', min: 50000 },
        { name: 'Commander', min: 100000 }, { name: 'Captain', min: 200000 },
        { name: 'Fleet Captain', min: 350000 }, { name: 'Commodore', min: 500000 },
        { name: 'Rear Admiral', min: 750000 }, { name: 'Vice Admiral', min: 1000000 },
        { name: 'Admiral', min: 1500000 }, { name: 'Fleet Admiral', min: 2500000 },
      ];
      let rank = ranks[0].name;
      let nextRank = ranks[1];
      for (let i = ranks.length - 1; i >= 0; i--) {
        if (xp >= ranks[i].min) { rank = ranks[i].name; nextRank = ranks[i + 1] || null; break; }
      }
      const nextStr = nextRank ? ` Next rank: ${nextRank.name} at ${nextRank.min} XP.` : ' Max rank achieved!';
      return { text: `You are a ${rank} with ${xp} XP.${nextStr}` };
    }

    if (/how many workflow/i.test(lower) || /workflow count/i.test(lower)) {
      const wf = JSON.parse(localStorage.getItem('nice-workflows') || '[]');
      return { text: `You have ${wf.length} workflow${wf.length !== 1 ? 's' : ''} saved.` };
    }

    if (/achievement|badge/i.test(lower) && /(how many|my|list|show|check)/i.test(lower)) {
      const achs = JSON.parse(localStorage.getItem('nice-achievements') || '[]');
      return { text: achs.length ? `You've unlocked ${achs.length} achievement${achs.length !== 1 ? 's' : ''}: ${achs.join(', ')}.` : 'No achievements unlocked yet. Keep exploring NICE!' };
    }

    return null;
  }

  /* ── Slash command handlers ── */
  function _handleSlashCommand(text) {
    const lower = text.toLowerCase().trim();

    if (lower === '/clear') {
      _messages = [];
      _saveMessages();
      _hideMonitor();
      if (_monitorContent) _monitorContent.innerHTML = '';
      return { text: 'Conversation cleared.', handled: true, silent: true };
    }

    if (lower.startsWith('/theme')) {
      const arg = lower.replace('/theme', '').trim();
      if (!arg) {
        const current = localStorage.getItem('ns-theme') || 'spaceship';
        return { text: `Current theme: ${current}. Available: ${_THEME_NAMES.join(', ')}.`, handled: true };
      }
      const key = _resolveTheme(arg);
      if (key) {
        if (typeof Theme !== 'undefined') Theme.set(key);
        else { document.documentElement.setAttribute('data-theme', key); localStorage.setItem('ns-theme', key); }
        return { text: `Theme switched to ${arg}.`, handled: true };
      }
      return { text: `Unknown theme "${arg}". Available: ${_THEME_NAMES.join(', ')}.`, handled: true };
    }

    if (lower === '/rank') {
      const xp = parseInt(localStorage.getItem('nice-xp') || '0', 10);
      const ranks = [
        { name: 'Ensign', min: 0 }, { name: 'Lieutenant JG', min: 10000 },
        { name: 'Lieutenant', min: 25000 }, { name: 'Lt Commander', min: 50000 },
        { name: 'Commander', min: 100000 }, { name: 'Captain', min: 200000 },
        { name: 'Fleet Captain', min: 350000 }, { name: 'Commodore', min: 500000 },
        { name: 'Rear Admiral', min: 750000 }, { name: 'Vice Admiral', min: 1000000 },
        { name: 'Admiral', min: 1500000 }, { name: 'Fleet Admiral', min: 2500000 },
      ];
      let rank = ranks[0].name;
      for (let i = ranks.length - 1; i >= 0; i--) { if (xp >= ranks[i].min) { rank = ranks[i].name; break; } }
      return { text: `${rank} — ${xp} XP`, handled: true };
    }

    if (lower === '/tokens') {
      const tokens = (typeof State !== 'undefined' && State.get('tokens')) || localStorage.getItem('nice-tokens') || 'N/A';
      return { text: `Token balance: ${tokens}`, handled: true };
    }

    if (lower === '/shortcuts' || lower === '/keys') {
      return {
        text: 'Keyboard shortcuts:\n• Cmd/Ctrl+K — Command Palette\n• Cmd/Ctrl+/ — Focus prompt bar\n• Escape — Close monitor\n• Enter — Send message\n• Shift+Enter — New line\n• @ — Mention an agent',
        handled: true,
      };
    }

    if (lower.startsWith('/callsign')) {
      const val = text.replace(/^\/callsign\s*/i, '').trim();
      if (!val) {
        const current = localStorage.getItem('nice-callsign') || 'Commander';
        return { text: `You're currently addressed as "${current}". Use /callsign [name] to change it.`, handled: true };
      }
      localStorage.setItem('nice-callsign', val);
      return { text: `Got it — I'll call you "${val}" from now on.`, handled: true };
    }

    if (lower === '/help' || lower === '/commands') {
      return {
        text: 'Slash commands:\n• /clear — Clear conversation\n• /theme [name] — View or switch theme\n• /rank — Show your rank & XP\n• /tokens — Check token balance\n• /callsign [name] — Change how NICE addresses you\n• /shortcuts — Keyboard shortcuts\n• /search [query] — Search agents & blueprints\n• /apikey [key] — Connect to Claude API for live AI',
        handled: true,
      };
    }

    if (lower.startsWith('/apikey')) {
      const key = text.replace(/^\/apikey\s*/i, '').trim();
      if (!key) {
        const has = localStorage.getItem('nice-api-key');
        return { text: has ? 'API key is set. Use /apikey clear to remove, or /apikey sk-ant-... to update.' : 'No API key set. Use /apikey sk-ant-... to enable live AI.', handled: true };
      }
      if (key === 'clear' || key === 'remove') {
        localStorage.removeItem('nice-api-key');
        return { text: 'API key cleared. NICE will use mock responses.', handled: true };
      }
      localStorage.setItem('nice-api-key', key);
      return { text: 'API key saved. NICE is now connected to Claude. 🚀', handled: true };
    }

    if (lower.startsWith('/preview')) {
      const url = text.replace(/^\/preview\s*/i, '').trim();
      if (!url) {
        if (typeof PreviewPanel !== 'undefined') { PreviewPanel.toggle(); }
        return { text: PreviewPanel?.isOpen() ? 'Preview panel opened.' : 'Preview panel closed.', handled: true };
      }
      if (typeof PreviewPanel !== 'undefined') { PreviewPanel.open(url); }
      return { text: `Opening preview: ${url}`, handled: true };
    }

    if (lower.startsWith('/search')) {
      const q = text.replace(/^\/search\s*/i, '').trim();
      if (!q) return { text: 'Usage: /search [query] — Search agents, blueprints, workflows.', handled: true };
      return _handleSearch(q);
    }

    return null;
  }

  /* ── Search handler ── */
  function _handleSearch(query) {
    const q = query.toLowerCase();
    const results = [];

    const agents = (typeof State !== 'undefined' && State.get('agents')) || [];
    const matchAgents = agents.filter(a => (a.name || '').toLowerCase().includes(q) || (a.role || '').toLowerCase().includes(q));
    if (matchAgents.length) {
      results.push(`Agents (${matchAgents.length}): ${matchAgents.slice(0, 5).map(a => a.name).join(', ')}${matchAgents.length > 5 ? '...' : ''}`);
    }

    const bpSeed = (typeof BlueprintsView !== 'undefined' && BlueprintsView.SEED) ? BlueprintsView.SEED : [];
    const matchBp = bpSeed.filter(b => (b.name || '').toLowerCase().includes(q) || (b.desc || '').toLowerCase().includes(q) || (b.tags || []).some(t => t.toLowerCase().includes(q)));
    if (matchBp.length) {
      results.push(`Blueprints (${matchBp.length}): ${matchBp.slice(0, 5).map(b => b.name).join(', ')}${matchBp.length > 5 ? '...' : ''}`);
    }

    const workflows = JSON.parse(localStorage.getItem('nice-workflows') || '[]');
    const matchWf = workflows.filter(w => (w.name || '').toLowerCase().includes(q));
    if (matchWf.length) {
      results.push(`Workflows (${matchWf.length}): ${matchWf.slice(0, 5).map(w => w.name).join(', ')}${matchWf.length > 5 ? '...' : ''}`);
    }

    const shipSeed = (typeof BlueprintsView !== 'undefined' && BlueprintsView.SPACESHIP_SEED) ? BlueprintsView.SPACESHIP_SEED : [];
    const matchShips = shipSeed.filter(s => (s.name || '').toLowerCase().includes(q) || (s.desc || '').toLowerCase().includes(q));
    if (matchShips.length) {
      results.push(`Spaceships (${matchShips.length}): ${matchShips.slice(0, 5).map(s => s.name).join(', ')}${matchShips.length > 5 ? '...' : ''}`);
    }

    if (!results.length) return { text: `No results found for "${query}".`, handled: true };
    return { text: `Search results for "${query}":\n${results.map(r => '• ' + r).join('\n')}`, handled: true };
  }

  /* ── Detect intent from user text ── */
  function _detectIntent(text) {
    const lower = text.toLowerCase();

    const statusResult = _detectStatusQuery(text);
    if (statusResult) return { type: 'status', response: statusResult };

    const searchMatch = lower.match(/(?:find|search|look for|locate)\s+(?:agent|blueprint|workflow|spaceship|ship)s?\s+(?:named?\s+|for\s+|called?\s+)?(.+)/i);
    if (searchMatch) {
      const result = _handleSearch(searchMatch[1].trim());
      return { type: 'search', response: result };
    }
    const genericSearch = lower.match(/^(?:find|search|search for|look for|look up)\s+(.+)/i);
    if (genericSearch && !lower.match(/^find\s+(me\s+)?a\s/)) {
      const result = _handleSearch(genericSearch[1].trim());
      return { type: 'search', response: result };
    }

    const navPrefixes = ['go to', 'take me to', 'open', 'show', 'show me', 'navigate to', 'switch to', 'view'];
    const isNavRequest = navPrefixes.some(p => lower.startsWith(p) || lower.includes(p));

    if (isNavRequest) {
      for (const intent of _NAV_INTENTS) {
        if (intent.keywords.some(kw => lower.includes(kw))) {
          return { type: 'navigate', route: intent.route, label: intent.label };
        }
      }
    }

    for (const intent of _NAV_INTENTS) {
      if (intent.keywords.some(kw => lower === kw || lower === kw + 's')) {
        return { type: 'navigate', route: intent.route, label: intent.label };
      }
    }

    if (/^(create|new|add|build|make)\s+(a\s+)?mission/i.test(lower)) return { type: 'action', action: 'create-mission' };
    if (/^(create|new|add|build|make)\s+(a\s+)?agent/i.test(lower)) return { type: 'navigate', route: '#/blueprints/agents/new', label: 'Agent Builder' };
    if (/^(create|new|add|build|make)\s+(a\s+)?workflow/i.test(lower)) return { type: 'navigate', route: '#/workflows', label: 'Workflows' };
    if (/^(create|new|add|build|make)\s+(a\s+)?(spaceship|ship)/i.test(lower)) return { type: 'navigate', route: '#/blueprints/spaceships', label: 'Shipyard' };
    if (/^(setup|guided setup|wizard)/i.test(lower)) return { type: 'action', action: 'setup-wizard' };
    if (/^(export|download)\s+(data|backup)/i.test(lower)) return { type: 'action', action: 'export-data' };

    if (/^(pause|stop|disable)\s+(spaceship|ship)\s*/i.test(lower)) return { type: 'agent-op', op: 'pause-ship', text: 'Spaceship paused. All agents on standby.' };
    if (/^(resume|start|enable|activate)\s+(spaceship|ship)\s*/i.test(lower)) return { type: 'agent-op', op: 'resume-ship', text: 'Spaceship resumed. Agents resuming operations.' };
    if (/^(run|execute|start|launch)\s+(mission|task)\s*/i.test(lower)) {
      setTimeout(() => { window.location.hash = '#/missions'; }, 300);
      return { type: 'agent-op', op: 'run-mission', text: 'Opening Missions to start a new run.' };
    }
    if (/^(deploy|launch)\s+agent\s*/i.test(lower)) {
      setTimeout(() => { window.location.hash = '#/blueprints/agents'; }, 300);
      return { type: 'agent-op', op: 'deploy-agent', text: 'Opening Agents view. Select an agent to deploy.' };
    }

    // Theme switching: "change theme to matrix", "switch to cyberpunk neon", "use ocean depths theme"
    const themeMatch = lower.match(/(?:change|switch|set|use|try|activate|enable|apply)\s+(?:the\s+)?(?:theme\s+(?:to\s+)?|to\s+(?:the\s+)?)?(.+?)(?:\s+theme)?$/i)
      || lower.match(/(?:theme)\s+(.+)/i)
      || lower.match(/(?:go|switch)\s+(?:to\s+)?(.+?)\s+theme/i);
    if (themeMatch) {
      const key = _resolveTheme(themeMatch[1]);
      if (key) return { type: 'theme', theme: key };
    }

    if (/^(help|what can you do|commands|how do i)/i.test(lower)) return { type: 'help' };

    // Detect imperative task requests — "write me a tagline", "draft a description", etc.
    // Only auto-mission for short, direct tasks (under 80 chars) without API key context.
    // Longer prompts are conversational and should go to the LLM (which can use EXEC markers).
    const taskVerbs = /^(write|draft|generate|analyze|summarize|research|list|outline|compose|review|evaluate|audit|produce)\s+(me\s+|a\s+|an\s+|the\s+|my\s+|\d+\s+)/i;
    const hasApiKey = !!localStorage.getItem('nice-api-key');
    if (taskVerbs.test(lower) && !isNavRequest && (!hasApiKey || text.length < 80)) {
      return { type: 'auto-mission', title: text };
    }

    return null;
  }

  /* ── Execute detected intent ── */
  function _executeIntent(intent) {
    if (intent.type === 'status') return { text: intent.response.text, agent: null };
    if (intent.type === 'search') return { text: intent.response.text, agent: null };
    if (intent.type === 'navigate') {
      setTimeout(() => { window.location.hash = intent.route; _hideMonitor(); }, 800);
      return { text: 'Navigating to ' + intent.label + '.', agent: null, isNav: true, navLabel: intent.label };
    }
    if (intent.type === 'theme') {
      if (typeof Theme !== 'undefined') Theme.set(intent.theme);
      else { document.documentElement.setAttribute('data-theme', intent.theme); localStorage.setItem('ns-theme', intent.theme); }
      // Find display name from the map
      const displayName = Object.entries(_THEME_MAP).find(([, v]) => v === intent.theme)?.[0] || intent.theme;
      return { text: `Theme switched to ${displayName}. Looking good, Commander.`, agent: null };
    }
    if (intent.type === 'agent-op') return { text: intent.text, agent: null };
    if (intent.type === 'action') {
      if (intent.action === 'create-mission') {
        setTimeout(() => { window.location.hash = '#/missions'; _hideMonitor(); }, 800);
        return { text: 'Opening Missions so you can create a new one.', agent: null, isNav: true, navLabel: 'Missions' };
      }
      if (intent.action === 'setup-wizard') {
        setTimeout(() => {
          _hideMonitor();
          if (typeof SetupWizard !== 'undefined') SetupWizard.open();
          else window.location.hash = '#/blueprints/spaceships';
        }, 800);
        return { text: 'Launching the Guided Setup Wizard.', agent: null };
      }
      if (intent.action === 'export-data') {
        setTimeout(() => { if (typeof DataIO !== 'undefined') DataIO.exportData(); }, 300);
        return { text: 'Exporting your data now.', agent: null };
      }
    }
    if (intent.type === 'auto-mission') {
      return { text: null, autoMission: true, title: intent.title };
    }
    if (intent.type === 'help') {
      return {
        text: 'I can help you navigate NICE, manage agents, run missions, and more. Try:\n' +
          '• "Take me to Blueprints" — navigate anywhere\n' +
          '• "Write me a tagline" — auto-creates & runs a mission\n' +
          '• "How many agents do I have?" — status queries\n' +
          '• "Find agent named Scout" — search\n' +
          '• /theme matrix — slash commands (/help for all)\n' +
          '• @AgentName — message a specific agent',
        agent: null,
      };
    }
    return null;
  }

  /* ── Get response based on context ── */
  function _getResponse(userText) {
    const intent = _detectIntent(userText);
    if (intent) {
      const result = _executeIntent(intent);
      if (result) return result;
    }

    const mentioned = _parseMention(userText);
    const contextAgent = mentioned || (_routeAgent ? { id: _routeAgent.id, name: _routeAgent.name, role: _routeAgent.role || _routeAgent.category || 'Custom' } : null);
    if (contextAgent) {
      const pool = _AGENT_RESPONSES[contextAgent.role] || _AGENT_RESPONSES.Custom;
      const text = pool[Math.floor(Math.random() * pool.length)];
      return { text, agent: contextAgent.name };
    }

    const text = _NS_RESPONSES[Math.floor(Math.random() * _NS_RESPONSES.length)];
    // Inject live context into generic mock responses
    const agents = (typeof State !== 'undefined' && State.get('agents')) || [];
    const ships = (typeof State !== 'undefined' && State.get('spaceships')) || [];
    const xp = parseInt(localStorage.getItem('nice-xp') || '0', 10);
    let contextual = text;
    if (agents.length > 0) {
      const randomAgent = agents[Math.floor(Math.random() * agents.length)];
      contextual = contextual
        .replace(/Alpha Strike/g, randomAgent.name || 'your lead agent')
        .replace(/Web Researcher/g, randomAgent.name || 'your agent')
        .replace(/Data Pipeline/g, randomAgent.name || 'your agent')
        .replace(/Content Writer/g, randomAgent.name || 'your agent')
        .replace(/6 agents online/g, `${agents.length} agent${agents.length !== 1 ? 's' : ''} online`);
    }
    if (ships.length > 0) {
      contextual = contextual.replace(/\$23\/month/g, `$${Math.round(ships.length * 8)}/month`);
    }
    return { text: contextual, agent: null };
  }

  /* ── Contextual suggestion chips ── */
  const _ROUTE_SUGGESTIONS = {
    '#/':           ['How many agents do I have?', 'Show missions', 'What\'s my rank?', 'Switch to cyberpunk'],
    '#/blueprints/agents':     ['Create a new agent', 'Find agent named', 'How many agents?', '/search researcher'],
    '#/blueprints/agents/new': ['Show blueprints', 'What roles are available?', 'Open shipyard'],
    '#/missions':   ['Run a mission', 'How many missions running?', 'Create a new mission', 'Show analytics'],
    '#/blueprints/spaceships': ['Guided setup', 'Deploy a ship', 'How many ships?', 'Browse blueprints'],
    '#/blueprints': ['Search blueprints for', 'Find agent named', 'Deploy a ship', 'What\'s popular?'],
    '#/workflows':  ['Create a new workflow', 'How many workflows?', 'Open missions'],
    '#/analytics':  ['What\'s my token balance?', 'Show cost tracker', '/tokens', 'Export data'],
    '#/cost':       ['/tokens', 'What\'s my balance?', 'Show analytics', 'Open settings'],
    '#/vault':      ['Open blueprints', 'Show security', 'Export data'],
    '#/settings':   ['/theme', '/shortcuts', 'Switch to synthwave', 'Show profile'],
    '#/profile':    ['What\'s my rank?', '/rank', 'Show achievements', 'Open settings'],
    '#/agents':     ['What can you do?', 'Run a mission', 'Show recent tasks', 'What\'s your status?'],
    '#/dock':       ['Show fleet status', 'Deploy a ship', 'Switch ship', 'Browse blueprints'],
    '#/log':        ['Show active missions', 'How many completed today?', 'Export log'],
  };

  function _updateSuggestionChips() {
    const chipContainer = _panel?.querySelector('.nice-ai-chips');
    if (!chipContainer) return;
    const raw = location.hash || '#/';
    const base = raw.replace(/\/[^/]+$/, '') || '#/';
    const hash = _ROUTE_SUGGESTIONS[raw] ? raw : (_ROUTE_SUGGESTIONS[base] ? base : '#/');
    const chips = _ROUTE_SUGGESTIONS[hash];
    chipContainer.innerHTML = chips.map(c =>
      `<button class="nice-ai-chip">${_esc(c)}</button>`
    ).join('');
  }

  /* ── Direct LLM call (no Supabase needed) ── */
  function _buildSystemPrompt() {
    // Gather live app context
    const xp = parseInt(localStorage.getItem('nice-xp') || '0', 10);
    const ranks = ['Ensign','Lieutenant JG','Lieutenant','Lt Commander','Commander','Captain','Fleet Captain','Commodore','Rear Admiral','Vice Admiral','Admiral','Fleet Admiral'];
    const rankThresholds = [0,10000,25000,50000,100000,200000,350000,500000,750000,1000000,1500000,2500000];
    let rank = ranks[0];
    for (let i = ranks.length - 1; i >= 0; i--) { if (xp >= rankThresholds[i]) { rank = ranks[i]; break; } }

    const agents = (typeof State !== 'undefined' && State.get('agents')) || [];
    const spaceships = (typeof State !== 'undefined' && State.get('spaceships')) || [];
    const agentCount = agents.length;
    const shipCount = spaceships.length;
    const currentView = location.hash || '#/';

    // Dynamic blueprint catalog — auto-updates as new blueprints are added
    const agentSeed = (typeof BlueprintsView !== 'undefined' && BlueprintsView.SEED) ? BlueprintsView.SEED : [];
    const shipSeed = (typeof BlueprintsView !== 'undefined' && BlueprintsView.SPACESHIP_SEED) ? BlueprintsView.SPACESHIP_SEED : [];
    // Show rarity/classification for experienced users (Commander+ = 100000 XP)
    const showRarity = xp >= 300;

    // Group agents by role for the prompt
    const roleMap = {};
    agentSeed.forEach(bp => {
      const role = (bp.config && bp.config.role) || 'General';
      if (!roleMap[role]) roleMap[role] = [];
      roleMap[role].push(showRarity ? bp.name + ' (' + (bp.rarity || 'Common') + ')' : bp.name);
    });
    const catalogLines = Object.entries(roleMap).map(([role, names]) =>
      '  ' + role + ': ' + names.slice(0, 8).join(', ') + (names.length > 8 ? ' +' + (names.length - 8) + ' more' : '')
    ).join('\n');

    const shipLines = shipSeed.map(s => {
      const desc = s.flavor || s.description || '';
      const descPart = desc ? ' — "' + desc + '"' : '';
      return showRarity
        ? '  ' + s.name + ' (Class ' + (s.class || '1') + ', ' + (s.slots || 2) + ' slots, ' + (s.tier || 'lite').toUpperCase() + ')' + descPart
        : '  ' + s.name + ' (' + (s.slots || 2) + ' agent slots)' + descPart;
    }).join('\n');

    return `You are NICE, the AI mission control assistant for Nice Spaceship — an Agentic Intelligence platform that helps businesses automate their operations with AI agent fleets.

PERSONALITY: Friendly, knowledgeable, consultative. Speak with a subtle space/sci-fi flair (mission, fleet, deploy). Keep responses concise (2-4 sentences max) for voice conversation flow.
ADDRESS THE USER AS: "${localStorage.getItem('nice-callsign') || 'Commander'}" — always use this name when addressing them directly.

YOUR GOAL: Understand the user's business needs, then guide them to build their ideal AI agent fleet inside NICE. You are a product expert AND a business consultant. Always connect their pain points to specific NICE features. Recommend agents BY NAME from the catalog below.

NICE PRODUCT KNOWLEDGE:
- Blueprints: ${agentSeed.length} pre-built agent blueprints${showRarity ? ' across 4 rarities (Common/Rare/Epic/Legendary)' : ''}. Users browse and add them in the Blueprint Catalog.
- Spaceships (Orchestrators): A Spaceship is the main AI orchestrator — the MCP. It coordinates a team of agents. Ships start with 5 agent slots, unlocking up to 12 via XP rank progression. Pro ($29/mo) and Team ($99/mo) plans unlock all 12 slots immediately.
- Agents work together on a Spaceship via the Ship's Log — a shared context window so agents can collaborate automatically.
- Missions: Tasks you assign to your agent fleet. Agents execute missions using their specialized skills.
- Fleets: Groups of spaceships for enterprise-scale operations.
- Tokens: In-app currency that powers AI agent calls. Each plan includes tokens. More can be purchased.
- The AI Setup wizard (on Home page) guides new users through configuring their first spaceship.

AGENT BLUEPRINT CATALOG (by role):
${catalogLines || '  No blueprints loaded yet.'}

SPACESHIP BLUEPRINTS:
${shipLines || '  No spaceship blueprints loaded yet.'}

CONVERSATION APPROACH:
When the user tells you about their business:
1. ACKNOWLEDGE their specific business warmly ("A sushi restaurant — love it!")
2. Pick the ONE spaceship blueprint that best matches their industry — never list multiple ships. If no exact match, pick the closest and explain why.
3. Recommend 3-4 SPECIFIC agents by name that would help THEIR business. Explain what each agent would do FOR THEM specifically (e.g., "Social Media Manager would handle your Instagram food photography posts and keep your feed active").
4. Ask a follow-up question about their biggest pain point to narrow down further ("What takes up most of your time — managing reservations, marketing, or staff coordination?")
5. Only after the conversation develops, guide them to action: "Want me to start the AI Setup wizard and configure this for you?"

RESPONSE STYLE:
- Be a consultant, not a catalog. Never dump a list of options.
- Pick ONE best recommendation and explain WHY it fits their business.
- Use their business context in every sentence — show you understood what they do.
- Keep responses to 2-4 sentences. End with a question to keep the conversation going.
- Make it personal and exciting — they're building an agent team tailored to their business.
${showRarity
? '- When recommending agents, mention their classification (Common, Rare, Epic, Legendary) — experienced users value knowing the tier and power level.'
: '- Never mention rarity or classification tags — this user is new, keep it simple and just use agent names directly.'}

CURRENT USER CONTEXT:
- Rank: ${rank} (${xp} XP)
- Active Agents: ${agentCount}
- Spaceships: ${shipCount}
- Current View: ${currentView}
${agentCount === 0 ? '- NEW USER — They have no agents yet. Guide them to add blueprints and build their first spaceship.' : ''}
${shipCount === 0 ? '- No spaceships deployed yet. Suggest activating a spaceship blueprint to get started.' : ''}

ACTIONS: You may RARELY include 1 action button ONLY when the user explicitly asks to go somewhere or says they're ready to start. Use this exact format on a separate line:
[ACTION: Label | route]

EXECUTABLE ACTIONS: When the user explicitly asks you to CREATE something (a mission, add a blueprint), include an EXEC marker. The system will execute it automatically:
[EXEC: create_mission | Mission Title | agent-name-hint | priority]
[EXEC: activate_blueprint | bp-agent-01]
[EXEC: run_mission | mission-uuid]
- Only use EXEC when the user clearly states what they want done
- Always confirm the action in your response text alongside the EXEC marker
- For create_mission, the agent-name-hint is a partial name match (e.g., "Marketing" or "Content Broadcaster")
- Priority is optional: low, medium, high, critical (defaults to medium)

STRICT RULES FOR ACTIONS:
- Do NOT include actions during conversation — no buttons while discussing their business, recommending agents, or asking questions.
- Do NOT include "Browse Blueprints" or "Start AI Setup" as a default. These are premature during consultation.
- ONLY include an action when the user says something like "let's do it", "set it up", "show me the blueprints", or "I'm ready".
- When in doubt, do NOT include an action. 90% of responses should have ZERO actions.
- EXEC markers are different from ACTION buttons — use EXEC when the user wants you to DO something, use ACTION when they want to GO somewhere.

Available routes:
- #/ — Bridge (home dashboard)
- #/blueprints — Blueprint Catalog (all blueprints, embedded in Bridge)
- #/blueprints?tab=agent — Agent Blueprints tab
- #/blueprints?tab=spaceship — Spaceship Blueprints tab
- Add &search=TERM to any blueprint route to pre-fill the search box (e.g. #/blueprints?tab=spaceship&search=SaaS)
- #/blueprints/agents — View added agents
- #/blueprints/agents/new — Build a custom agent
- #/blueprints/spaceships — Shipyard (view/deploy spaceships)
- #/missions — Missions
- #/analytics — Operations dashboard
- #/cost — Cost & token tracker
- #/workflows — Workflow automation
- #/blueprints — Browse and activate agent & spaceship blueprints (includes MCP connectors)
- #/comms — Comms Hub (notifications & broadcasts)
- #/wallet — Wallet (token balance & purchases)
- #/vault — Security vault
- #/security — Security & audit
- #/log — Log (activity history)
- #/theme-editor — Theme Editor (custom themes)
- #/settings — Settings
- #/profile — Profile & account

THEME SWITCHING: Users can ask you to change the visual theme. When they ask to change theme, respond with:
[THEME: themename]
This triggers an automatic theme switch. Available themes:
Built-in: spaceship, robotech, navigator, solar, matrix, retro, lcars, pixel
Extended: cyberpunk, ocean, sunset, holo, synthwave, arctic, volcanic, steampunk, forest, ultraviolet

NEVER DO THIS:
- Never list multiple spaceships — pick ONE and commit to it
- Never give generic advice that could apply to any business
- Never say "here are some options" or "you could choose from"
- Never skip the follow-up question
- Never respond with more than 6 sentences before asking a question
- Never recommend agents without explaining what they'd do for THIS specific business

EXAMPLE RESPONSES:

User: "I run a sushi restaurant called Takumi Izakaya"
Good response: "Welcome aboard, Commander! Takumi Izakaya sounds amazing — the Culinary Command Ship is built exactly for restaurants like yours. I'd crew it with the Social Media Manager to showcase your omakase specials on Instagram, the Scheduling Coordinator to handle reservation flow during peak hours, the Review Sentinel to monitor and respond to Yelp and Google reviews, and the Inventory Tracker to keep your fish supply fresh and waste-free. What's eating up most of your time right now — marketing, operations, or managing your team?"
(NO action buttons — we're still in conversation)

User: "I own a landscaping company"
Good response: "A landscaping business — great match for a spaceship, Commander! I'd recommend the Scheduling Coordinator to manage your routes and client appointments, the Invoice Ninja to handle billing after each job, the Social Media Manager to post before-and-after photos of your work, and the Customer Success Agent to follow up with clients for repeat bookings. What's your biggest headache — scheduling jobs, chasing payments, or finding new clients?"
(NO action buttons — still consulting)

User: "Hello"
Good response: "Welcome to the bridge, Commander! I'm NICE, your AI mission control. I help businesses build custom AI agent teams to automate their operations. Tell me about your business and I'll design the perfect fleet for you — what do you do?"
(NO action buttons — greeting only)

User: "Let's set it up!" (after several exchanges)
Good response: "Let's get Takumi Izakaya's agents deployed, Commander! I'll launch the AI Setup wizard — it'll walk you through adding your agents and configuring the Culinary Command Ship in about 2 minutes."
[ACTION: Start AI Setup | #/]
(Action button ONLY here — user explicitly asked to proceed)

IMPORTANT: Never break character. You ARE the ship's computer. When they describe a business need, translate it into NICE terms and recommend specific named blueprints from the catalog.`;
  }

  function _getSelectedModel() {
    const modelSelect = _panel?.querySelector('#nice-ai-model');
    const modelMap = {
      'nice-4':      'claude-sonnet-4-20250514',
      'nice-4-mini': 'claude-haiku-4-5-20251001',
      'nice-3':      'claude-3-5-haiku-20241022',
    };
    return {
      id: modelMap[modelSelect?.value] || 'claude-haiku-4-5-20251001',
      label: modelSelect?.value || 'nice-4-mini',
    };
  }

  /**
   * Call Claude via Supabase Edge Function (authenticated users).
   * Falls back to null if not authenticated or SB unavailable.
   */
  async function _callEdgeLLM(userText, opts = {}) {
    if (typeof SB === 'undefined' || !SB.auth) return null;
    const session = await SB.auth.getSession();
    if (!session?.access_token) return null;

    const history = _messages.slice(-20).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.text,
    }));
    history.push({ role: 'user', content: userText });

    const { id: model, label: modelLabel } = _getSelectedModel();

    const res = await fetch(`${SB.client?.supabaseUrl || ''}/functions/v1/nice-ai`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        stream: true,
        temperature: 0.4,
        system: _buildSystemPrompt(),
        messages: history,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.warn('[NICE] Edge function error:', errBody);
      let detail = '';
      try { detail = JSON.parse(errBody)?.error?.message || errBody; } catch { detail = errBody; }
      throw new Error(detail);
    }

    return _parseSSEStream(res, opts, modelLabel);
  }

  /**
   * Parse an SSE stream from either direct or edge function call.
   */
  async function _parseSSEStream(res, opts, modelLabel) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;
        try {
          const evt = JSON.parse(payload);
          if (evt.type === 'content_block_delta' && evt.delta?.text) {
            full += evt.delta.text;
            if (opts.onChunk) opts.onChunk(evt.delta.text);
          }
        } catch { /* skip malformed SSE */ }
      }
    }

    return { text: full, model: modelLabel };
  }

  /**
   * Stream a response from the Claude API.
   * Priority: 1) Edge function (auth'd) → 2) Direct browser (API key) → 3) null (mock)
   * @param {string} userText
   * @param {object} opts  { onChunk: (text) => void }
   * @returns {Promise<{text: string, model: string}|null>}
   */
  async function _callDirectLLM(userText, opts = {}) {
    // Try edge function first (authenticated users)
    try {
      const edgeResult = await _callEdgeLLM(userText, opts);
      if (edgeResult) return edgeResult;
    } catch (e) {
      console.warn('[NICE] Edge function failed, trying direct:', e.message);
    }

    // Fall back to direct browser call
    const apiKey = localStorage.getItem('nice-api-key');
    if (!apiKey) return null; // no key → fall back to mock

    // Build conversation history (last 20 messages)
    const history = _messages.slice(-20).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.text,
    }));
    history.push({ role: 'user', content: userText });

    const { id: model, label: modelLabel } = _getSelectedModel();

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        stream: true,
        temperature: 0.4,
        system: _buildSystemPrompt(),
        messages: history,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.warn('[NICE] LLM error:', errBody);
      let detail = '';
      try { detail = JSON.parse(errBody)?.error?.message || errBody; } catch { detail = errBody; }
      throw new Error(detail);
    }

    return _parseSSEStream(res, opts, modelLabel);
  }

  /* ── Send message ── */
  function _send() {
    const input = _panel?.querySelector('#nice-ai-input');
    if (!input || _sending) return;
    const text = input.value.trim();
    if (!text) return;

    _hideMentionPopup();

    // ── Flow intercept: capture answer during active questionnaire ──
    if (_activeFlow) {
      input.value = '';
      input.style.height = '36px';
      const _fc = _panel?.querySelector('.nice-ai-input-container');
      if (_fc) _fc.classList.remove('has-text');
      const step = _activeFlow.steps[_activeFlow.currentStep];
      _messages.push({ role: 'user', text, ts: Date.now() });

      // Handle cancel
      if (/^(cancel|quit|exit|nevermind)/i.test(text)) {
        _messages.push({ role: 'assistant', text: 'Configuration cancelled. Standing by.', agent: 'NICE', ts: Date.now() });
        const onCancel = _activeFlow.onCancel;
        _activeFlow = null;
        _saveMessages();
        _renderMonitor();
        if (onCancel) onCancel();
        return;
      }

      // Store answer
      _activeFlow.answers[step.key] = text;
      _activeFlow.currentStep++;

      // More steps?
      if (_activeFlow.currentStep < _activeFlow.steps.length) {
        const next = _activeFlow.steps[_activeFlow.currentStep];
        _messages.push({ role: 'assistant', text: next.question, agent: 'NICE', ts: Date.now(), chips: next.chips });
        _saveMessages();
        _renderMonitor();
        _showFlowChips(next.chips);
      } else {
        // Flow complete
        const answers = _activeFlow.answers;
        const onComplete = _activeFlow.onComplete;
        _activeFlow = null;
        _messages.push({ role: 'assistant', text: '⚡ Processing your configuration...', agent: 'NICE', ts: Date.now() });
        _saveMessages();
        _renderMonitor();
        // Clear flow chips and reset placeholder
        _showFlowChips(null);
        const input = document.getElementById('nice-ai-input');
        if (input) input.placeholder = 'Ask NICE\u2026';
        if (onComplete) onComplete(answers);
      }
      return;
    }

    // Slash commands
    if (text.startsWith('/')) {
      const slashResult = _handleSlashCommand(text);
      if (slashResult && slashResult.handled) {
        input.value = '';
        input.style.height = '36px';
        const _sc = _panel?.querySelector('.nice-ai-input-container');
        if (_sc) _sc.classList.remove('has-text');
        if (slashResult.silent) return;
        // Show slash command result on monitor
        _messages.push({ role: 'user', text, ts: Date.now() });
        _messages.push({ role: 'assistant', text: slashResult.text, agent: null, ts: Date.now() });
        _saveMessages();
        _renderMonitor();
        return;
      }
    }

    // Add user message and show on monitor
    _messages.push({ role: 'user', text, ts: Date.now() });
    _saveMessages();
    _renderMonitor();
    input.value = '';
    input.style.height = '36px';
    const _inputContainer = _panel?.querySelector('.nice-ai-input-container');
    if (_inputContainer) _inputContainer.classList.remove('has-text');
    _sending = true;

    const sendBtn = _panel?.querySelector('#nice-ai-send');
    if (sendBtn) sendBtn.disabled = true;

    // Show thinking on monitor
    _addMonitorThinking();

    // Agent context — @mention takes priority, then route-scoped agent
    const bpSelect = _panel?.querySelector('#nice-ai-bp-select');
    const bpId = bpSelect?.value;
    const mentioned = _parseMention(text);

    let agentBp = null;
    if (mentioned) {
      agentBp = (typeof BlueprintStore !== 'undefined') ? BlueprintStore.getAgent(mentioned.id)
        : (typeof BlueprintsView !== 'undefined' && BlueprintsView.SEED) ? BlueprintsView.SEED.find(b => b.id === mentioned.id) : null;
    } else if (_routeAgent) {
      agentBp = _routeAgent;
    }

    const _agentHasTools = agentBp && agentBp.config && agentBp.config.tools && agentBp.config.tools.length > 0;

    if (_agentHasTools && typeof AgentExecutor !== 'undefined') {
      const spaceshipId = bpId || 'default-ship';
      const agentLabel = mentioned ? mentioned.name : (agentBp ? agentBp.name : null);

      let _stepEl = null;
      const onStep = (step) => {
        if (!_stepEl) {
          _removeMonitorThinking();
          _stepEl = document.createElement('div');
          _stepEl.className = 'monitor-thinking';
          _stepEl.id = 'monitor-step-indicator';
          _stepEl.innerHTML = '<div class="monitor-thinking-dots"><span></span><span></span><span></span></div><span class="monitor-thinking-label">Thinking…</span>';
          _monitorContent?.appendChild(_stepEl);
        }
        const label = _stepEl.querySelector('.monitor-thinking-label');
        if (label) {
          label.textContent = step.action
            ? 'Step ' + step.index + ': Using ' + step.action + '…'
            : 'Step ' + step.index + ': Finalizing…';
        }
        const monitorEl = document.getElementById('nice-monitor');
        if (monitorEl) monitorEl.scrollTop = monitorEl.scrollHeight;
      };

      AgentExecutor.execute(agentBp, text, {
        tools: agentBp.config.tools,
        spaceshipId,
        onStep,
      }).then(result => {
        _removeMonitorThinking();
        document.getElementById('monitor-step-indicator')?.remove();
        _messages.push({
          role: 'assistant', text: result.finalAnswer,
          agent: agentLabel, steps: result.steps, ts: Date.now(),
        });
        _saveMessages();
        _renderMonitor();
        _sending = false;
        if (sendBtn) sendBtn.disabled = false;
      }).catch(() => {
        _removeMonitorThinking();
        document.getElementById('monitor-step-indicator')?.remove();
        const { text: responseText, agent } = _getResponse(text);
        _messages.push({ role: 'assistant', text: responseText, agent, ts: Date.now() });
        _saveMessages();
        _renderMonitor();
        _sending = false;
        if (sendBtn) sendBtn.disabled = false;
      });
    } else if (typeof MissionRouter !== 'undefined' && bpId && !agentBp) {
      // Spaceship selected, no specific agent → route via MissionRouter
      const spaceshipId = bpId;

      const onRouting = (routing) => {
        _removeMonitorThinking();
        _messages.push({
          role: 'system', text: 'Routing to ' + routing.agentName + ': ' + routing.reasoning,
          agent: null, ts: Date.now(),
        });
        _renderMonitor();
        _addMonitorThinking('Executing with ' + routing.agentName + '…');
      };

      let _streamText = '';
      let _streamEl = null;
      const onChunk = (chunk) => {
        if (!_streamEl) {
          _removeMonitorThinking();
          _streamEl = document.createElement('div');
          _streamEl.className = 'monitor-card';
          _streamEl.id = 'monitor-stream';
          _streamEl.innerHTML = '<div class="monitor-card-agent">NICE</div><div class="monitor-card-text" id="monitor-stream-text"></div>';
          _monitorContent?.appendChild(_streamEl);
        }
        _streamText += chunk;
        const span = document.getElementById('monitor-stream-text');
        if (span) span.innerHTML = _md(_parseActions(_streamText).clean);
        const monitorEl = document.getElementById('nice-monitor');
        if (monitorEl) monitorEl.scrollTop = monitorEl.scrollHeight;
      };

      MissionRouter.route(spaceshipId, text, { onRouting, onChunk }).then(({ routing, result }) => {
        _removeMonitorThinking();
        document.getElementById('monitor-stream')?.remove();
        const agentName = routing ? routing.agentName : 'NICE';
        const content = result.finalAnswer || result.content || 'No response.';
        _messages.push({ role: 'assistant', text: content, agent: agentName, ts: Date.now() });
        _saveMessages();
        _renderMonitor();
        _sending = false;
        if (sendBtn) sendBtn.disabled = false;
      }).catch(() => {
        _removeMonitorThinking();
        document.getElementById('monitor-stream')?.remove();
        const { text: responseText, agent } = _getResponse(text);
        _messages.push({ role: 'assistant', text: responseText, agent, ts: Date.now() });
        _saveMessages();
        _renderMonitor();
        _sending = false;
        if (sendBtn) sendBtn.disabled = false;
      });

    } else if (typeof ShipLog !== 'undefined' && (agentBp || bpId)) {
      const spaceshipId = bpId || 'default-ship';
      let _streamText = '';
      let _streamEl = null;
      const onChunk = (chunk) => {
        if (!_streamEl) {
          _removeMonitorThinking();
          _streamEl = document.createElement('div');
          _streamEl.className = 'monitor-card';
          _streamEl.id = 'monitor-stream';
          const agentLabel = mentioned ? mentioned.name : (agentBp ? agentBp.name : null);
          const agentHtml = agentLabel
            ? `<div class="monitor-card-agent">${_esc(agentLabel)}</div>`
            : `<div class="monitor-card-agent">NICE</div>`;
          _streamEl.innerHTML = agentHtml + '<div class="monitor-card-text" id="monitor-stream-text"></div>';
          _monitorContent?.appendChild(_streamEl);
        }
        _streamText += chunk;
        const span = document.getElementById('monitor-stream-text');
        if (span) span.innerHTML = _md(_parseActions(_streamText).clean);
        const monitorEl = document.getElementById('nice-monitor');
        if (monitorEl) monitorEl.scrollTop = monitorEl.scrollHeight;
      };

      ShipLog.execute(spaceshipId, agentBp, text, { onChunk }).then(result => {
        _removeMonitorThinking();
        document.getElementById('monitor-stream')?.remove();
        const agentName = result.agent || (mentioned ? mentioned.name : null);
        _messages.push({ role: 'assistant', text: result.content, agent: agentName, ts: Date.now() });
        _saveMessages();
        _renderMonitor();
        _sending = false;
        if (sendBtn) sendBtn.disabled = false;
      }).catch(() => {
        _removeMonitorThinking();
        document.getElementById('monitor-stream')?.remove();
        const { text: responseText, agent } = _getResponse(text);
        _messages.push({ role: 'assistant', text: responseText, agent, ts: Date.now() });
        _saveMessages();
        _renderMonitor();
        _sending = false;
        if (sendBtn) sendBtn.disabled = false;
      });
    } else {
      // Try direct LLM with streaming, fall back to local mock
      const _finishMock = () => {
        const delay = 800 + Math.random() * 1200;
        setTimeout(() => {
          _removeMonitorThinking();
          const { text: responseText, agent } = _getResponse(text);
          _messages.push({ role: 'assistant', text: responseText, agent, ts: Date.now() });
          _saveMessages();
          _renderMonitor();
          _sending = false;
          if (sendBtn) sendBtn.disabled = false;
        }, delay);
      };

      // Check for auto-mission intent (imperative tasks like "write me a tagline")
      const preCheck = _getResponse(text);
      if (preCheck.autoMission) {
        _executeAutoMission(preCheck.title, sendBtn);
        return;
      }
      if (preCheck.isNav) {
        const delay = 400 + Math.random() * 400;
        setTimeout(() => {
          _removeMonitorThinking();
          _messages.push({ role: 'assistant', text: preCheck.text, agent: preCheck.agent, ts: Date.now() });
          _saveMessages();
          _renderMonitor();
          _sending = false;
          if (sendBtn) sendBtn.disabled = false;
        }, delay);
      } else {
        // Streaming LLM call
        let _streamEl = null;
        let _streamText = '';

        const onChunk = (chunk) => {
          if (!_streamEl) {
            _removeMonitorThinking();
            _streamEl = document.createElement('div');
            _streamEl.className = 'monitor-card';
            _streamEl.id = 'monitor-stream';
            _streamEl.innerHTML =
              '<div class="monitor-card-agent">NICE</div>' +
              '<div class="monitor-card-text" id="monitor-stream-text"></div>';
            _monitorContent?.appendChild(_streamEl);
            _showMonitor();
          }
          _streamText += chunk;
          const span = document.getElementById('monitor-stream-text');
          if (span) span.innerHTML = _md(_parseActions(_streamText).clean);
          const monitorEl = document.getElementById('nice-monitor');
          if (monitorEl) monitorEl.scrollTop = monitorEl.scrollHeight;
        };

        _callDirectLLM(text, { onChunk }).then(async (result) => {
          if (result) {
            _removeMonitorThinking();
            document.getElementById('monitor-stream')?.remove();
            _messages.push({ role: 'assistant', text: result.text, agent: 'NICE', model: result.model, ts: Date.now() });
            _saveMessages();
            _renderMonitor();

            // Auto-open preview panel if response contains URLs or HTML
            if (typeof PreviewPanel !== 'undefined') PreviewPanel.detectAndOpen(result.text);

            // Execute any EXEC markers from the LLM response
            const { execs } = _parseActions(result.text);
            if (execs && execs.length) {
              for (const ex of execs) {
                const res = await _executeExec(ex.action, ex.params);
                _messages.push({
                  role: 'assistant',
                  text: res.ok ? `**Done:** ${res.msg}` : `**Failed:** ${res.msg}`,
                  agent: 'NICE', ts: Date.now(),
                });
              }
              _saveMessages();
              _renderMonitor();
            }

            _sending = false;
            if (sendBtn) sendBtn.disabled = false;
          } else {
            _finishMock();
          }
        }).catch(err => {
          _removeMonitorThinking();
          document.getElementById('monitor-stream')?.remove();
          // Show error on monitor with retry
          const errMsg = err.message || 'Unknown error';
          _messages.push({
            role: 'assistant',
            text: `**Connection Error:** ${errMsg}`,
            agent: 'NICE',
            ts: Date.now(),
            error: true,
            retryText: text,
          });
          _saveMessages();
          _renderMonitor();
          _sending = false;
          if (sendBtn) sendBtn.disabled = false;
        });
      }
    }
  }

  /* ── Populate dropdowns ── */
  function _populateBlueprintDropdown() {
    const select = _panel?.querySelector('#nice-ai-bp-select');
    if (!select) return;
    select.innerHTML = '<option value="">Blueprint</option>';
    const ships = (typeof BlueprintStore !== 'undefined') ? BlueprintStore.listSpaceships()
      : (typeof BlueprintsView !== 'undefined' && BlueprintsView.SPACESHIP_SEED) ? BlueprintsView.SPACESHIP_SEED : [];
    if (ships.length) {
      const grp1 = document.createElement('optgroup');
      grp1.label = 'Spaceships';
      ships.forEach(bp => { const opt = document.createElement('option'); opt.value = bp.id; opt.textContent = bp.name; grp1.appendChild(opt); });
      select.appendChild(grp1);
    }
  }

  function _populateLLMDropdown() {
    const select = _panel?.querySelector('#nice-ai-llm-select');
    if (!select) return;
    select.innerHTML = '<option value="">LLM</option>';
    const connectors = _getAIConnectors();
    connectors.forEach(i => {
      const opt = document.createElement('option');
      opt.value = i.id;
      opt.textContent = i.name + (i.status === 'connected' ? '' : ' (not connected)');
      if (i.status === 'connected') opt.setAttribute('data-connected', 'true');
      select.appendChild(opt);
    });
    const connected = connectors.find(i => i.status === 'connected');
    if (connected) select.value = connected.id;
  }

  /* ═══ @Mention Autocomplete ═══ */

  function _showMentionPopup(query) {
    if (!_mentionPopup) return;
    const agents = _getSlottedAgents();
    const q = query.toLowerCase();
    const filtered = q ? agents.filter(a => a.name.toLowerCase().includes(q)) : agents;
    if (!filtered.length) { _hideMentionPopup(); return; }
    _mentionItems = filtered;
    _mentionIdx = 0;
    _mentionPopup.innerHTML = filtered.map((a, i) =>
      `<div class="nice-ai-mention-item${i === 0 ? ' active' : ''}" data-idx="${i}">` +
        `<span class="mention-name">@${_esc(a.name)}</span>` +
        `<span class="mention-role">${_esc(a.role)}</span>` +
      `</div>`
    ).join('');
    _mentionPopup.classList.add('visible');
  }

  function _hideMentionPopup() {
    if (_mentionPopup) _mentionPopup.classList.remove('visible');
    _mentionItems = [];
    _mentionIdx = -1;
  }

  function _selectMention(idx) {
    const agent = _mentionItems[idx];
    if (!agent) return;
    const input = _panel?.querySelector('#nice-ai-input');
    if (!input) return;
    const val = input.value;
    const atPos = val.lastIndexOf('@');
    if (atPos !== -1) input.value = val.substring(0, atPos) + '@' + agent.name + ' ';
    _hideMentionPopup();
    input.focus();
  }

  function _handleMentionInput(textarea) {
    const val = textarea.value;
    const cursor = textarea.selectionStart;
    const before = val.substring(0, cursor);
    const atPos = before.lastIndexOf('@');
    if (atPos !== -1) {
      const between = before.substring(atPos + 1);
      if (between.length <= 30 && !/\n/.test(between)) {
        _showMentionPopup(between);
        return;
      }
    }
    _hideMentionPopup();
  }

  /* ── Build DOM ── */
  function _buildDOM() {
    // Floating prompt bar — no messages area, responses go to monitor
    _panel = document.createElement('div');
    _panel.className = 'nice-ai';
    _panel.id = 'nice-ai';
    _panel.innerHTML = `
      <button class="nice-ai-close" id="nice-ai-close" aria-label="Close prompt" title="Close">&times;</button>
      <div class="nice-ai-input-area">
        <div class="nice-ai-mention-popup" id="nice-ai-mention-popup"></div>
        <div class="nice-ai-input-container">
          <div class="nice-ai-input-row">
            <textarea class="nice-ai-input" id="nice-ai-input" placeholder="Ask NICE…" rows="1"></textarea>
          </div>
          <canvas class="nice-ai-waveform" id="nice-ai-waveform" height="40"></canvas>
          <div class="nice-ai-toolbar">
            <button class="nice-ai-tool-btn" id="nice-ai-attach" title="More options">+</button>
            <div class="nice-ai-toolbar-right">
              <button class="nice-ai-tts-btn ${_ttsEnabled ? 'active' : ''}" id="nice-ai-tts" title="Toggle voice responses">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              </button>
              <select class="nice-ai-voice-select" id="nice-ai-voice-select" title="Select voice" style="display:none">
                <option value="">Loading voices…</option>
              </select>
              <select class="nice-ai-model-select" id="nice-ai-model" title="Select model">
                <option value="nice-4" selected>NICE-4</option>
                <option value="nice-4-mini">NICE-4 Mini</option>
                <option value="nice-3">NICE-3</option>
              </select>
              <button class="nice-ai-voice-btn" id="nice-ai-voice" aria-label="Voice mode" title="Voice mode">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              </button>
              <button class="nice-ai-send-btn" id="nice-ai-send" aria-label="Send" title="Send message">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </div>
        </div>
        <div class="nice-ai-chips"></div>
        <div class="nice-ai-disclaimer">NICE uses AI agents that consume tokens. Responses may vary.</div>
      </div>
    `;

    document.body.appendChild(_panel);
    _mentionPopup = _panel.querySelector('#nice-ai-mention-popup');

    // Cache monitor elements
    _appMain = document.querySelector('.app-main');
    _monitor = document.getElementById('nice-monitor');
    _monitorContent = document.getElementById('nice-monitor-content');

    // Event delegation for action buttons + retry (survives re-renders)
    if (_monitorContent) {
      _monitorContent.addEventListener('click', (e) => {
        // Action buttons → navigate
        const actionBtn = e.target.closest('.monitor-action-btn');
        if (actionBtn && actionBtn.dataset.route) {
          let route = actionBtn.dataset.route.trim();
          if (route.startsWith('/')) route = '#' + route;
          else if (!route.startsWith('#')) route = '#/' + route;
          _hideMonitor();
          if (typeof Router !== 'undefined') Router.navigate(route);
          else location.hash = route;
          return;
        }
        // Retry button → re-send failed message
        const retryBtn = e.target.closest('.monitor-retry-btn');
        if (retryBtn && retryBtn.dataset.retry && !_sending) {
          // Remove the error message
          const errIdx = _messages.findLastIndex(m => m.error);
          if (errIdx !== -1) _messages.splice(errIdx, 1);
          _saveMessages();
          // Re-send by putting text in input and firing send
          const input = _panel?.querySelector('#nice-ai-input');
          if (input) {
            input.value = retryBtn.dataset.retry;
            input.dispatchEvent(new Event('input'));
            _send();
          }
        }
      });
    }
  }

  /* ── Bind events ── */
  function _bindEvents() {
    // Close button
    _panel.querySelector('#nice-ai-close')?.addEventListener('click', hide);

    // Send button (NS logo)
    _panel.querySelector('#nice-ai-send')?.addEventListener('click', _send);

    // Voice mode — tap-to-talk (like Claude Code)
    // Tap 1: start listening. Tap 2: stop & send.
    const _micIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
    const _stopIcon = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="16" height="16"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

    _panel.querySelector('#nice-ai-voice')?.addEventListener('click', () => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        if (typeof Notify !== 'undefined') Notify.send({ title: 'Not Supported', message: 'Voice input is not supported in this browser.', type: 'system' });
        return;
      }

      const voiceBtn = _panel.querySelector('#nice-ai-voice');
      const input = _panel.querySelector('#nice-ai-input');
      const waveCanvas = _panel.querySelector('#nice-ai-waveform');
      if (!input) return;

      // Tap 2: already listening → stop, send
      if (_recognition) {
        _recognition.stop();
        return; // onend handler will fire and send
      }

      // Tap 1: start listening
      _recognition = new SpeechRecognition();
      _recognition.lang = 'en-US';
      _recognition.interimResults = true;
      _recognition.continuous = true; // keep listening until user taps stop

      const existing = input.value;
      if (voiceBtn) {
        voiceBtn.classList.add('listening');
        voiceBtn.title = 'Stop & send';
        voiceBtn.innerHTML = _stopIcon;
      }
      if (waveCanvas) waveCanvas.classList.add('active');
      _startWaveform(waveCanvas);

      // Enable TTS so NICE talks back when using voice
      if (!_ttsEnabled) {
        _ttsEnabled = true;
        localStorage.setItem('nice-tts', 'true');
        const ttsBtn = _panel.querySelector('#nice-ai-tts');
        if (ttsBtn) ttsBtn.classList.add('active');
        const voiceSel = _panel.querySelector('#nice-ai-voice-select');
        if (voiceSel) voiceSel.style.display = '';
      }

      _recognition.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        input.value = existing + (existing ? ' ' : '') + transcript;
        input.dispatchEvent(new Event('input'));
      };

      _recognition.onend = () => {
        // Reset button to mic
        if (voiceBtn) {
          voiceBtn.classList.remove('listening');
          voiceBtn.title = 'Voice mode';
          voiceBtn.innerHTML = _micIcon;
        }
        _stopWaveform();
        _recognition = null;

        // Auto-send if there's content
        if (input.value.trim() && input.value !== existing) {
          input.dispatchEvent(new Event('input'));
          _send();
        }
      };

      _recognition.onerror = (e) => {
        if (voiceBtn) {
          voiceBtn.classList.remove('listening');
          voiceBtn.title = 'Voice mode';
          voiceBtn.innerHTML = _micIcon;
        }
        _stopWaveform();
        _recognition = null;
        if (e.error === 'not-allowed') {
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Mic Blocked', message: 'Allow microphone access to use voice mode.', type: 'system' });
        }
      };

      _recognition.start();
    });

    // TTS toggle
    _panel.querySelector('#nice-ai-tts')?.addEventListener('click', () => {
      _ttsEnabled = !_ttsEnabled;
      localStorage.setItem('nice-tts', _ttsEnabled);
      const btn = _panel.querySelector('#nice-ai-tts');
      if (btn) btn.classList.toggle('active', _ttsEnabled);
      const voiceSel = _panel.querySelector('#nice-ai-voice-select');
      if (voiceSel) voiceSel.style.display = _ttsEnabled ? '' : 'none';
      if (_ttsEnabled) {
        if (typeof Notify !== 'undefined') Notify.send({ title: 'Voice On', message: 'NICE will speak responses.', type: 'system' });
      } else {
        speechSynthesis.cancel();
        if (typeof Notify !== 'undefined') Notify.send({ title: 'Voice Off', message: 'NICE responses are text only.', type: 'system' });
      }
    });

    // Voice selector
    const _voiceSelect = _panel.querySelector('#nice-ai-voice-select');
    function _populateVoices() {
      if (!_voiceSelect || !window.speechSynthesis) return;
      const allVoices = speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
      if (!allVoices.length) return;
      const seen = new Set();
      const voices = allVoices.filter(v => {
        const label = v.name.replace(/\s*\(.*\)/, '');
        if (seen.has(label)) return false;
        seen.add(label);
        return true;
      });
      const saved = localStorage.getItem('nice-tts-voice') || '';
      _voiceSelect.innerHTML = voices.map(v => {
        const label = v.name.replace(/\s*\(.*\)/, '');
        const sel = (saved ? v.name === saved : v.name.includes('Samantha')) ? ' selected' : '';
        return `<option value="${v.name}"${sel}>${label}</option>`;
      }).join('');
    }
    _populateVoices();
    if (window.speechSynthesis) speechSynthesis.onvoiceschanged = _populateVoices;
    _voiceSelect?.addEventListener('change', (e) => {
      localStorage.setItem('nice-tts-voice', e.target.value);
    });

    // Attach — coming soon
    _panel.querySelector('#nice-ai-attach')?.addEventListener('click', () => {
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Coming Soon', message: 'File & media attachments are coming in a future update.', type: 'system' });
      }
    });

    // Textarea auto-resize + keyboard + @mention
    const textarea = _panel.querySelector('#nice-ai-input');
    if (textarea) {
      textarea.addEventListener('keydown', (e) => {
        if (_mentionPopup?.classList.contains('visible')) {
          if (e.key === 'ArrowDown') { e.preventDefault(); _mentionIdx = Math.min(_mentionIdx + 1, _mentionItems.length - 1); _updateMentionHighlight(); return; }
          if (e.key === 'ArrowUp') { e.preventDefault(); _mentionIdx = Math.max(_mentionIdx - 1, 0); _updateMentionHighlight(); return; }
          if (e.key === 'Tab' || (e.key === 'Enter' && _mentionIdx >= 0)) { e.preventDefault(); _selectMention(_mentionIdx); return; }
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); _hideMentionPopup(); return; }
        }
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _send(); }
        if (e.key === 'Escape') { _hideMonitor(); }
      });

      textarea.addEventListener('input', () => {
        textarea.style.height = '36px';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
        _handleMentionInput(textarea);
        // Toggle voice/send button swap
        const container = _panel.querySelector('.nice-ai-input-container');
        if (container) container.classList.toggle('has-text', textarea.value.trim().length > 0);
      });
    }

    // @mention popup click
    _mentionPopup?.addEventListener('click', (e) => {
      const item = e.target.closest('.nice-ai-mention-item');
      if (item) _selectMention(parseInt(item.dataset.idx, 10));
    });

    // Suggestion chip clicks
    _panel.querySelector('.nice-ai-chips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('.nice-ai-chip');
      if (!chip) return;
      const input = _panel?.querySelector('#nice-ai-input');
      if (!input) return;
      const chipText = chip.textContent;
      if (chipText.endsWith(' for') || chipText.endsWith(' named')) {
        input.value = chipText + ' ';
        input.focus();
      } else {
        input.value = chipText;
        _send();
      }
    });

    // Update chips on route change + hide monitor on navigation
    window.addEventListener('hashchange', () => {
      _updateRouteContext();
      _updateSuggestionChips();
      // Auto-hide monitor when user navigates via sidebar
      if (_isMonitorActive()) _hideMonitor();
    });

    // Monitor back button
    document.getElementById('nice-monitor-back')?.addEventListener('click', () => {
      _hideMonitor();
    });

    // Resume conversation button
    _panel.querySelector('#nice-ai-resume')?.addEventListener('click', () => {
      _showMonitor();
      const monitorEl = document.getElementById('nice-monitor');
      if (monitorEl) monitorEl.scrollTop = monitorEl.scrollHeight;
    });

    // Global Escape to close monitor
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && _isMonitorActive() && !_mentionPopup?.classList.contains('visible')) {
        _hideMonitor();
      }
    });
  }

  function _updateMentionHighlight() {
    if (!_mentionPopup) return;
    _mentionPopup.querySelectorAll('.nice-ai-mention-item').forEach((el, i) => {
      el.classList.toggle('active', i === _mentionIdx);
    });
  }

  /* ── Waveform visualization — organic flowing wave ── */
  function _startWaveform(canvas) {
    if (!canvas) return;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      _micStream = stream;
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      _analyser = _audioCtx.createAnalyser();
      _analyser.fftSize = 256;
      _analyser.smoothingTimeConstant = 0.8;
      const source = _audioCtx.createMediaStreamSource(stream);
      source.connect(_analyser);
      const bufLen = _analyser.frequencyBinCount;
      const freqData = new Uint8Array(bufLen);
      const ctx = canvas.getContext('2d');
      let phase = 0;
      let smoothAmplitude = 0;

      function draw() {
        if (!_analyser) { _waveAnimId = null; return; }
        _waveAnimId = requestAnimationFrame(draw);
        _analyser.getByteFrequencyData(freqData);

        // Calculate average amplitude from low-mid frequencies (voice range)
        let sum = 0;
        const voiceBins = Math.min(bufLen, 48);
        for (let i = 0; i < voiceBins; i++) sum += freqData[i];
        const rawAmp = sum / (voiceBins * 255);
        // Smooth the amplitude for fluid motion
        smoothAmplitude += (rawAmp - smoothAmplitude) * 0.15;

        const dpr = window.devicePixelRatio || 1;
        const w = canvas.width = canvas.offsetWidth * dpr;
        const h = canvas.height = 40 * dpr;
        ctx.clearRect(0, 0, w, h);

        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ffffff';
        const midY = h / 2;
        phase += 0.06;

        // Draw 3 layered sine waves with decreasing opacity
        const layers = [
          { waves: 2.5, speed: 1.0, amp: 1.0,  alpha: 0.9, width: 2.2 },
          { waves: 3.5, speed: 1.4, amp: 0.7,  alpha: 0.4, width: 1.5 },
          { waves: 5.0, speed: 2.0, amp: 0.45, alpha: 0.2, width: 1.0 },
        ];

        for (const layer of layers) {
          const maxAmp = (h * 0.42) * smoothAmplitude * layer.amp;
          // Idle minimum amplitude for subtle breathing
          const ampVal = Math.max(maxAmp, h * 0.04 * layer.amp);

          ctx.beginPath();
          ctx.strokeStyle = accent;
          ctx.globalAlpha = layer.alpha;
          ctx.lineWidth = layer.width * dpr;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          for (let x = 0; x <= w; x++) {
            const t = x / w;
            // Taper amplitude at edges for a smooth capsule shape
            const envelope = Math.sin(t * Math.PI);
            const y = midY + Math.sin(t * Math.PI * 2 * layer.waves + phase * layer.speed) * ampVal * envelope;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }

        // Glow effect on the primary wave
        if (smoothAmplitude > 0.05) {
          ctx.globalAlpha = smoothAmplitude * 0.35;
          ctx.shadowColor = accent;
          ctx.shadowBlur = 12 * dpr;
          ctx.beginPath();
          const mainLayer = layers[0];
          const mainAmp = Math.max((h * 0.42) * smoothAmplitude * mainLayer.amp, h * 0.04);
          for (let x = 0; x <= w; x++) {
            const t = x / w;
            const envelope = Math.sin(t * Math.PI);
            const y = midY + Math.sin(t * Math.PI * 2 * mainLayer.waves + phase * mainLayer.speed) * mainAmp * envelope;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2.5 * dpr;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        ctx.globalAlpha = 1;
      }
      draw();
    }).catch(() => {});
  }

  function _stopWaveform() {
    if (_waveAnimId) { cancelAnimationFrame(_waveAnimId); _waveAnimId = null; }
    if (_micStream) { _micStream.getTracks().forEach(t => t.stop()); _micStream = null; }
    if (_audioCtx) { _audioCtx.close().catch(() => {}); _audioCtx = null; }
    _analyser = null;
    const canvas = _panel?.querySelector('#nice-ai-waveform');
    if (canvas) { canvas.classList.remove('active'); const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); }
  }

  /* ── Text-to-Speech ── */
  function _speak(text) {
    if (!_ttsEnabled || !window.speechSynthesis) return;
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.05;
    utter.pitch = 0.95;
    const voices = speechSynthesis.getVoices();
    const savedVoice = localStorage.getItem('nice-tts-voice');
    const preferred = (savedVoice && voices.find(v => v.name === savedVoice)) ||
                      voices.find(v => v.name.includes('Samantha')) ||
                      voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) ||
                      voices.find(v => v.lang.startsWith('en'));
    if (preferred) utter.voice = preferred;
    speechSynthesis.speak(utter);
  }

  /* ── Init / Destroy ── */
  function init() {
    _loadMessages();
    _buildDOM();
    _bindEvents();
    _populateBlueprintDropdown();
    _populateLLMDropdown();
    _updateSuggestionChips();
    // Restore voice controls visibility from saved TTS state
    if (_ttsEnabled) {
      const voiceSel = _panel?.querySelector('#nice-ai-voice-select');
      if (voiceSel) voiceSel.style.display = '';
    }
    // Restore resume button if there's a prior conversation
    _updateResumeBtn();
    // Start hidden — shown when user clicks a card or triggers prompt
    hide();
  }

  function destroy() {
    _hideMonitor();
    _panel?.remove();
    _panel = null;
    _monitor = null;
    _monitorContent = null;
    _appMain = null;
    _mentionPopup = null;
    _messages = [];
  }

  function toggle() {
    if (_isMonitorActive()) _hideMonitor();
    else if (_messages.length) _renderMonitor();
  }

  function prefill(text) {
    const input = _panel?.querySelector('#nice-ai-input');
    if (!input) return;
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
  }

  function setSuggestions(chips) {
    const chipContainer = _panel?.querySelector('.nice-ai-chips');
    if (!chipContainer || !chips?.length) return;
    chipContainer.innerHTML = chips.map(c =>
      `<button class="nice-ai-chip">${_esc(c)}</button>`
    ).join('');
  }

  /* ── Conversation Flow API ── */
  function startFlow(flowDef) {
    // flowDef: { steps: [{ key, question, chips }], onComplete(answers), onCancel() }
    _activeFlow = { steps: flowDef.steps, currentStep: 0, answers: {}, onComplete: flowDef.onComplete, onCancel: flowDef.onCancel };
    // Clear previous messages and show first question
    _messages = [];
    const first = flowDef.steps[0];
    _messages.push({ role: 'assistant', text: first.question, agent: 'NICE', ts: Date.now(), chips: first.chips });
    _saveMessages();
    _showMonitor();
    _renderMonitor();
    _showFlowChips(first.chips);
    // Focus the input
    const input = _panel?.querySelector('#nice-ai-input');
    if (input) { input.placeholder = 'Type your answer...'; input.focus(); }
  }

  function cancelFlow() {
    if (!_activeFlow) return;
    const onCancel = _activeFlow.onCancel;
    _activeFlow = null;
    _messages.push({ role: 'assistant', text: 'Configuration cancelled.', agent: 'NICE', ts: Date.now() });
    _saveMessages();
    _renderMonitor();
    if (onCancel) onCancel();
  }

  function _showFlowChips(chips) {
    const chipContainer = _panel?.querySelector('.nice-ai-chips');
    if (!chipContainer) return;
    if (!chips || !chips.length) { chipContainer.innerHTML = ''; return; }
    chipContainer.innerHTML = chips.map(c =>
      `<button class="nice-ai-chip nice-flow-chip">${_esc(c)}</button>`
    ).join('');
  }

  function isFlowActive() { return !!_activeFlow; }

  function pushMessage(text, role = 'assistant') {
    _messages.push({ role, text, agent: role === 'assistant' ? 'NICE' : undefined, ts: Date.now() });
    _saveMessages();
    _renderMonitor();
  }

  /* ── Route-based visibility + context ── */
  // Prompt panel is visible on ALL routes (unified chat).
  // When viewing an agent detail page, auto-scope to that agent.

  function _updateRouteContext() {
    const path = (location.hash || '#/').replace('#', '') || '/';
    const input = _panel?.querySelector('#nice-ai-input');
    if (!input) return;

    // Detect agent detail route: /agents/:id
    const agentMatch = path.match(/^\/agents\/([^/]+)$/);
    if (agentMatch && agentMatch[1] !== 'new') {
      const agentId = agentMatch[1];
      // Try to resolve agent name
      let agent = null;
      if (typeof BlueprintStore !== 'undefined') agent = BlueprintStore.getAgent(agentId);
      if (!agent) {
        const agents = (typeof State !== 'undefined' && State.get('agents')) || [];
        agent = agents.find(a => a.id === agentId);
      }
      if (agent) {
        _routeAgent = agent;
        input.placeholder = `Message ${agent.name}…`;
        return;
      }
    }

    // Default: talking to NICE
    _routeAgent = null;
    input.placeholder = 'Ask NICE…';
  }

  function show() { if (_panel) _panel.style.display = ''; }
  function hide() { if (_panel) { _panel.style.display = 'none'; _hideMonitor(); } }

  function syncRoute() {
    _updateRouteContext();
  }

  return { init, destroy, toggle, prefill, setSuggestions, startFlow, cancelFlow, isFlowActive, pushMessage, show, hide, syncRoute };
})();
