/* ═══════════════════════════════════════════════════════════════════
   NICE — Crew Designer
   "Describe → Design → Deploy" — AI-powered spaceship creation.
   User describes their goal → AI designs optimal crew → one-click deploy.
═══════════════════════════════════════════════════════════════════ */

const CrewDesigner = (() => {
  let _overlay = null;
  let _step = 0;
  const _esc = typeof Utils !== 'undefined' ? Utils.esc : (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const _data = {
    userPrompt: '',
    proposal: null,
    editedAgents: [],
    shipName: '',
    shipDescription: '',
    shipCategory: '',
    flowPattern: '',
    rationale: '',
    integrationsNeeded: [],
    testMission: '',
  };

  const SUGGESTIONS = [
    { icon: '📧', text: 'Monitor my inbox and draft customer support replies' },
    { icon: '🔍', text: 'Research competitors and write weekly intel reports' },
    { icon: '📱', text: 'Generate social media content across platforms' },
    { icon: '💻', text: 'Build and deploy web apps from descriptions' },
    { icon: '📊', text: 'Analyze data and create visual dashboards' },
    { icon: '📅', text: 'Manage my calendar and automate scheduling' },
  ];

  const ROLES = ['Research', 'Analytics', 'Content', 'Engineering', 'Ops', 'Support', 'Sales', 'Marketing', 'Creative', 'Media', 'Learning', 'Legal'];
  const TOOLS = ['web-search', 'code-gen', 'summarize', 'gmail', 'google-drive', 'google-calendar', 'calculator', 'data-transform'];
  const TOOL_LABELS = {
    'web-search': '🔍 Web Search', 'code-gen': '💻 Code Gen', 'summarize': '📝 Summarize',
    'gmail': '📧 Gmail', 'google-drive': '📁 Drive', 'google-calendar': '📅 Calendar',
    'calculator': '🧮 Calculator', 'data-transform': '🔄 Data Transform',
  };
  const FLOW_LABELS = { sequential: 'Sequential', parallel: 'Parallel', router: 'Router', hierarchical: 'Hierarchical' };
  const FLOW_ICONS = { sequential: '→', parallel: '⇉', router: '⤳', hierarchical: '⬡' };

  const MODELS = [
    { id: 'gemini-2.5-flash', label: 'Gemini Flash', tier: 'free' },
    { id: 'gemini-2.0-lite', label: 'Gemini Lite', tier: 'free' },
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet', tier: 'premium' },
    { id: 'claude-opus-4-20250514', label: 'Claude Opus', tier: 'premium' },
    { id: 'gpt-5.2', label: 'GPT-5.2', tier: 'premium' },
    { id: 'gemini-2.5-pro', label: 'Gemini Pro', tier: 'premium' },
  ];

  /* ══════════════════════════════════════════════════════════════ */
  /*  OPEN / CLOSE                                                 */
  /* ══════════════════════════════════════════════════════════════ */

  function open(opts = {}) {
    if (_overlay) { close(); }
    _step = 0;
    Object.assign(_data, {
      userPrompt: opts.prompt || '',
      proposal: null, editedAgents: [], shipName: '', shipDescription: '',
      shipCategory: '', flowPattern: '', rationale: '', integrationsNeeded: [],
      testMission: '',
    });
    _overlay = document.createElement('div');
    _overlay.className = 'wizard-overlay cd-overlay';
    _overlay.setAttribute('role', 'dialog');
    _overlay.setAttribute('aria-label', 'Crew Designer');
    document.body.appendChild(_overlay);
    document.body.style.overflow = 'hidden';
    _render();
    requestAnimationFrame(() => _overlay?.classList.add('open'));
  }

  function close() {
    if (!_overlay) return;
    _overlay.remove();
    _overlay = null;
    document.body.style.overflow = '';
  }

  function isOpen() { return !!_overlay; }

  /* ══════════════════════════════════════════════════════════════ */
  /*  RENDER DISPATCH                                               */
  /* ══════════════════════════════════════════════════════════════ */

  function _render() {
    if (!_overlay) return;
    const steps = [_renderDescribe, _renderDesign, _renderDeploy];
    _overlay.innerHTML = `
      <div class="wizard-container cd-container">
        <button class="wizard-close cd-close" aria-label="Close">&times;</button>
        <div class="cd-progress">
          ${['Describe', 'Design', 'Deploy'].map((s, i) => `
            <div class="cd-progress-step ${i === _step ? 'active' : ''} ${i < _step ? 'done' : ''}">
              <span class="cd-progress-dot">${i < _step ? '✓' : i + 1}</span>
              <span class="cd-progress-label">${s}</span>
            </div>
          `).join('<div class="cd-progress-line"></div>')}
        </div>
        <div class="cd-body" id="cd-body"></div>
      </div>
    `;
    _overlay.querySelector('.cd-close').addEventListener('click', close);
    _overlay.addEventListener('click', (e) => { if (e.target === _overlay) close(); });
    steps[_step](document.getElementById('cd-body'));
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  STEP 1: DESCRIBE                                              */
  /* ══════════════════════════════════════════════════════════════ */

  function _renderDescribe(el) {
    el.innerHTML = `
      <div class="cd-describe">
        <h2 class="cd-heading">What do you want your AI team to do?</h2>
        <p class="cd-subheading">Describe your goal in plain English. NICE will design the perfect crew.</p>
        <textarea class="cd-textarea" id="cd-prompt" placeholder="e.g., Monitor my Gmail for customer complaints, draft responses, and track patterns in a weekly report..." rows="4">${_esc(_data.userPrompt)}</textarea>
        <div class="cd-suggestions" id="cd-suggestions">
          ${SUGGESTIONS.map(s => `<button class="cd-chip" data-text="${_esc(s.text)}"><span class="cd-chip-icon">${s.icon}</span> ${_esc(s.text)}</button>`).join('')}
        </div>
        <div class="cd-actions">
          <button class="btn cd-btn-primary" id="cd-design-btn" ${_data.userPrompt.length < 10 ? 'disabled' : ''}>Design My Crew →</button>
        </div>
      </div>
    `;

    const textarea = el.querySelector('#cd-prompt');
    const btn = el.querySelector('#cd-design-btn');

    textarea.addEventListener('input', () => {
      _data.userPrompt = textarea.value;
      btn.disabled = textarea.value.trim().length < 10;
    });
    textarea.focus();

    el.querySelectorAll('.cd-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        textarea.value = chip.dataset.text;
        textarea.dispatchEvent(new Event('input'));
      });
    });

    btn.addEventListener('click', () => _generateCrew());
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  AI GENERATION                                                 */
  /* ══════════════════════════════════════════════════════════════ */

  async function _generateCrew() {
    const body = document.getElementById('cd-body');
    if (!body) return;

    body.innerHTML = `
      <div class="cd-loading">
        <div class="wizard-spinner"></div>
        <p class="cd-loading-text">Designing your crew...</p>
        <p class="cd-loading-sub">NICE is analyzing your goal and building the optimal team.</p>
      </div>
    `;

    try {
      const proposal = await _callAI(_data.userPrompt);
      _data.proposal = proposal;
      _data.shipName = proposal.spaceship?.name || 'Custom Spaceship';
      _data.shipDescription = proposal.spaceship?.description || '';
      _data.shipCategory = proposal.spaceship?.category || 'Custom';
      _data.flowPattern = proposal.spaceship?.flow_pattern || 'sequential';
      _data.rationale = proposal.spaceship?.rationale || '';
      _data.editedAgents = (proposal.agents || []).map((a, i) => ({ ...a, _id: `cd-${i}` }));
      _data.integrationsNeeded = proposal.integrations_needed || [];
      _data.testMission = proposal.suggested_test_mission || '';
      _step = 1;
      _render();
    } catch (err) {
      console.error('[CrewDesigner] AI error:', err);
      // Use fallback
      const fallback = _fallbackCrew(_data.userPrompt);
      _data.proposal = fallback;
      _data.shipName = fallback.spaceship.name;
      _data.shipDescription = fallback.spaceship.description;
      _data.shipCategory = fallback.spaceship.category;
      _data.flowPattern = fallback.spaceship.flow_pattern;
      _data.rationale = fallback.spaceship.rationale;
      _data.editedAgents = fallback.agents.map((a, i) => ({ ...a, _id: `cd-${i}` }));
      _data.integrationsNeeded = fallback.integrations_needed || [];
      _data.testMission = fallback.suggested_test_mission || '';
      _step = 1;
      _render();
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Offline Mode', message: 'Used crew templates (AI unavailable)', type: 'warning' });
    }
  }

  async function _callAI(prompt) {
    if (typeof SB === 'undefined' || !SB.isReady()) throw new Error('Supabase not ready');

    const systemPrompt = `You are NICE, an AI crew designer. Given what the user wants their AI team to do, design an optimal spaceship crew.

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "spaceship": {
    "name": "Short Name",
    "description": "1-2 sentence description of this team",
    "category": "Operations|Research|Content|Engineering|Marketing|Creative|Support|Custom",
    "flow_pattern": "sequential|parallel|router|hierarchical",
    "rationale": "Why this crew design works"
  },
  "agents": [
    {
      "name": "Agent Name",
      "role": "Research|Analytics|Content|Engineering|Ops|Support|Sales|Marketing|Creative|Media|Learning|Legal",
      "description": "What this agent does in 1 sentence",
      "tools": ["web-search","gmail"],
      "model": "gemini-2.5-flash",
      "temperature": 0.3
    }
  ],
  "integrations_needed": ["gmail","google-drive"],
  "suggested_test_mission": "A concrete first task to test the crew"
}

Rules:
- 2-6 agents based on complexity
- flow_pattern: "sequential" when tasks chain A→B→C; "parallel" when independent; "router" when one triages to specialists; "hierarchical" when captain delegates
- Default model: "gemini-2.5-flash" (free). Use "claude-sonnet-4-20250514" only for complex reasoning roles
- Tools from: web-search, code-gen, summarize, gmail, google-drive, google-calendar, calculator, data-transform
- integrations_needed: only external services agents need (gmail, google-drive, google-calendar)
- Creative, role-specific agent names
- Test mission should be immediately runnable`;

    const { data, error } = await SB.functions.invoke('nice-ai', {
      body: {
        messages: [{ role: 'user', content: `Design an AI crew for this goal:\n${prompt}` }],
        systemPrompt,
        config: { model: 'claude-haiku-4-5-20251001', max_tokens: 2048, temperature: 0.5 },
      },
    });

    if (error) throw new Error(typeof error === 'string' ? error : 'AI service error');
    if (!data?.content) throw new Error('Empty response');

    let content = data.content.trim();
    if (content.startsWith('```')) {
      content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    const rec = JSON.parse(content);
    if (!rec.agents || !Array.isArray(rec.agents) || rec.agents.length === 0) {
      throw new Error('Invalid crew structure');
    }
    return rec;
  }

  function _fallbackCrew(prompt) {
    const text = prompt.toLowerCase();

    // Restaurant / food / hospitality
    if (text.includes('restaurant') || text.includes('food') || text.includes('chef') || text.includes('menu') || text.includes('reservation') || text.includes('hospitality') || text.includes('dining')) {
      return {
        spaceship: { name: 'Restaurant Command', description: 'Full-stack restaurant operations and marketing', category: 'Operations', flow_pattern: 'router', rationale: 'Router: operations captain delegates to specialists for scheduling, costs, marketing, and reviews' },
        agents: [
          { name: 'Floor Captain', role: 'Ops', description: 'Routes tasks to the right specialist and manages daily operations', tools: ['summarize', 'google-calendar'], model: 'gemini-2.5-flash', temperature: 0.2 },
          { name: 'Reservation Manager', role: 'Ops', description: 'Handles booking requests, table assignments, and waitlist management', tools: ['google-calendar', 'gmail'], model: 'gemini-2.5-flash', temperature: 0.2 },
          { name: 'Cost Controller', role: 'Analytics', description: 'Tracks food costs, inventory levels, and supplier pricing', tools: ['calculator', 'data-transform'], model: 'gemini-2.5-flash', temperature: 0.2 },
          { name: 'Social Chef', role: 'Marketing', description: 'Creates mouth-watering social media posts and food photography captions', tools: ['summarize', 'web-search'], model: 'gemini-2.5-flash', temperature: 0.7 },
          { name: 'Review Watcher', role: 'Research', description: 'Monitors Yelp, Google, and social mentions for reviews and feedback', tools: ['web-search', 'summarize'], model: 'gemini-2.5-flash', temperature: 0.3 },
          { name: 'Campaign Manager', role: 'Marketing', description: 'Runs email campaigns to regulars and promotes local events', tools: ['gmail', 'summarize'], model: 'gemini-2.5-flash', temperature: 0.5 },
        ],
        integrations_needed: ['gmail', 'google-calendar'],
        suggested_test_mission: 'Search for the latest reviews of our restaurant and summarize the top 3 themes from customer feedback',
      };
    }

    // Marketing / social media / content
    if (text.includes('marketing') || text.includes('social media') || text.includes('brand') || text.includes('campaign') || text.includes('content creation')) {
      return {
        spaceship: { name: 'Marketing Engine', description: 'Content creation and campaign management', category: 'Marketing', flow_pattern: 'parallel', rationale: 'Parallel: each channel specialist works independently on their platform' },
        agents: [
          { name: 'Content Strategist', role: 'Marketing', description: 'Plans content calendar and messaging themes', tools: ['summarize', 'web-search'], model: 'gemini-2.5-flash', temperature: 0.5 },
          { name: 'Copywriter', role: 'Content', description: 'Writes engaging copy for posts, ads, and emails', tools: ['summarize'], model: 'gemini-2.5-flash', temperature: 0.7 },
          { name: 'SEO Analyst', role: 'Research', description: 'Researches keywords and optimizes content for search', tools: ['web-search', 'data-transform'], model: 'gemini-2.5-flash', temperature: 0.3 },
          { name: 'Campaign Tracker', role: 'Analytics', description: 'Monitors campaign performance and ROI metrics', tools: ['calculator', 'data-transform'], model: 'gemini-2.5-flash', temperature: 0.2 },
        ],
        integrations_needed: ['gmail'],
        suggested_test_mission: 'Research trending topics in our industry and draft 3 social media post ideas',
      };
    }

    // Email / inbox / support
    if (text.includes('email') || text.includes('inbox') || text.includes('support') || text.includes('customer service')) {
      return {
        spaceship: { name: 'Support Ops', description: 'Customer support automation team', category: 'Support', flow_pattern: 'sequential', rationale: 'Sequential pipeline: monitor → respond → report' },
        agents: [
          { name: 'Inbox Monitor', role: 'Ops', description: 'Watches email for customer issues and prioritizes them', tools: ['gmail'], model: 'gemini-2.5-flash', temperature: 0.2 },
          { name: 'Response Drafter', role: 'Content', description: 'Drafts helpful, empathetic replies to customers', tools: ['gmail', 'summarize'], model: 'gemini-2.5-flash', temperature: 0.4 },
          { name: 'Trend Analyst', role: 'Analytics', description: 'Tracks patterns and recurring issues in customer feedback', tools: ['data-transform', 'summarize'], model: 'gemini-2.5-flash', temperature: 0.3 },
        ],
        integrations_needed: ['gmail'],
        suggested_test_mission: 'Check my inbox for the 3 most recent messages and summarize them',
      };
    }

    // Research / competitor / analysis
    if (text.includes('research') || text.includes('competitor') || text.includes('report') || text.includes('analysis')) {
      return {
        spaceship: { name: 'Research Lab', description: 'Research and intelligence team', category: 'Research', flow_pattern: 'sequential', rationale: 'Sequential: gather → analyze → report' },
        agents: [
          { name: 'Web Scout', role: 'Research', description: 'Searches the web for relevant information', tools: ['web-search'], model: 'gemini-2.5-flash', temperature: 0.3 },
          { name: 'Data Analyst', role: 'Analytics', description: 'Analyzes and synthesizes findings', tools: ['data-transform', 'calculator'], model: 'gemini-2.5-flash', temperature: 0.3 },
          { name: 'Report Writer', role: 'Content', description: 'Writes clear, actionable reports', tools: ['summarize'], model: 'gemini-2.5-flash', temperature: 0.5 },
        ],
        integrations_needed: [],
        suggested_test_mission: 'Research the top 3 trends in AI agents and write a brief summary',
      };
    }

    // E-commerce / sales / store
    if (text.includes('ecommerce') || text.includes('e-commerce') || text.includes('store') || text.includes('sell') || text.includes('product') || text.includes('shop')) {
      return {
        spaceship: { name: 'Commerce Hub', description: 'E-commerce operations and growth', category: 'Operations', flow_pattern: 'router', rationale: 'Router: operations captain delegates orders, inventory, and marketing tasks' },
        agents: [
          { name: 'Order Manager', role: 'Ops', description: 'Tracks orders, shipping, and fulfillment status', tools: ['gmail', 'data-transform'], model: 'gemini-2.5-flash', temperature: 0.2 },
          { name: 'Product Writer', role: 'Content', description: 'Writes compelling product descriptions and listings', tools: ['summarize', 'web-search'], model: 'gemini-2.5-flash', temperature: 0.6 },
          { name: 'Price Watcher', role: 'Research', description: 'Monitors competitor pricing and market trends', tools: ['web-search', 'calculator'], model: 'gemini-2.5-flash', temperature: 0.3 },
          { name: 'Review Responder', role: 'Support', description: 'Responds to customer reviews and questions', tools: ['gmail', 'summarize'], model: 'gemini-2.5-flash', temperature: 0.4 },
        ],
        integrations_needed: ['gmail'],
        suggested_test_mission: 'Research competitor pricing for our top product category and summarize findings',
      };
    }

    // Default: general business ops
    return {
      spaceship: { name: 'Business Ops', description: 'General business operations team', category: 'Operations', flow_pattern: 'router', rationale: 'Router: captain triages tasks to specialists' },
      agents: [
        { name: 'Task Captain', role: 'Ops', description: 'Routes incoming requests to the right specialist', tools: ['summarize'], model: 'gemini-2.5-flash', temperature: 0.2 },
        { name: 'Research Agent', role: 'Research', description: 'Handles research and information gathering', tools: ['web-search', 'summarize'], model: 'gemini-2.5-flash', temperature: 0.3 },
        { name: 'Content Creator', role: 'Content', description: 'Writes documents, emails, and reports', tools: ['summarize', 'code-gen'], model: 'gemini-2.5-flash', temperature: 0.5 },
        { name: 'Scheduler', role: 'Ops', description: 'Manages calendar, appointments, and reminders', tools: ['google-calendar', 'gmail'], model: 'gemini-2.5-flash', temperature: 0.2 },
      ],
      integrations_needed: ['gmail', 'google-calendar'],
      suggested_test_mission: 'Help me draft a professional email introducing our company to a potential client',
    };
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  STEP 2: DESIGN                                                */
  /* ══════════════════════════════════════════════════════════════ */

  function _renderDesign(el) {
    const maxSlots = typeof Gamification !== 'undefined' ? Gamification.getMaxSlots() : 12;
    const overLimit = _data.editedAgents.length > maxSlots;

    el.innerHTML = `
      <div class="cd-design">
        <!-- Ship Header -->
        <div class="cd-ship-header">
          <div class="cd-ship-name-row">
            <input type="text" class="cd-ship-name-input" id="cd-ship-name" value="${_esc(_data.shipName)}" placeholder="Spaceship name">
            <span class="cd-flow-badge" title="${_esc(FLOW_LABELS[_data.flowPattern] || 'Sequential')} flow">
              ${FLOW_ICONS[_data.flowPattern] || '→'} ${_esc(FLOW_LABELS[_data.flowPattern] || 'Sequential')}
            </span>
          </div>
          <p class="cd-rationale">${_esc(_data.rationale)}</p>
          <button class="btn cd-btn-secondary cd-regenerate" id="cd-regenerate">↻ Regenerate</button>
        </div>

        ${overLimit ? `<div class="cd-warning">⚠ Your rank allows ${maxSlots} agents. Remove ${_data.editedAgents.length - maxSlots} to deploy.</div>` : ''}

        <!-- Crew Grid -->
        <div class="cd-section-label">Crew <span class="cd-count">${_data.editedAgents.length} agents</span></div>
        <div class="cd-crew-grid" id="cd-crew-grid">
          ${_data.editedAgents.map((a, i) => _renderAgentCard(a, i)).join('')}
          <button class="cd-agent-add" id="cd-add-agent">+ Add Agent</button>
        </div>

        <!-- Integrations -->
        ${_data.integrationsNeeded.length > 0 ? `
          <div class="cd-section-label">Integrations Needed</div>
          <div class="cd-integrations">
            ${_data.integrationsNeeded.map(int => {
              const connected = _isIntegrationConnected(int);
              return `<div class="cd-integration-row">
                <span class="cd-integration-icon">${TOOL_LABELS[int]?.charAt(0) || '🔌'}</span>
                <span class="cd-integration-name">${_esc(int)}</span>
                <span class="cd-integration-status ${connected ? 'connected' : 'disconnected'}">${connected ? '✓ Connected' : '⚠ Not connected'}</span>
              </div>`;
            }).join('')}
          </div>
        ` : ''}

        <!-- Test Mission -->
        <div class="cd-section-label">Test Mission</div>
        <input type="text" class="cd-test-mission" id="cd-test-mission" value="${_esc(_data.testMission)}" placeholder="First mission to test your crew...">

        <!-- Actions -->
        <div class="cd-actions cd-actions-split">
          <button class="btn cd-btn-secondary" id="cd-back">← Back</button>
          <button class="btn cd-btn-primary" id="cd-deploy-btn" ${overLimit ? 'disabled' : ''}>Deploy →</button>
        </div>
      </div>
    `;

    // Bind events
    el.querySelector('#cd-ship-name').addEventListener('input', (e) => { _data.shipName = e.target.value; });
    el.querySelector('#cd-test-mission').addEventListener('input', (e) => { _data.testMission = e.target.value; });
    el.querySelector('#cd-regenerate').addEventListener('click', () => { _step = 0; _generateCrew(); });
    el.querySelector('#cd-back').addEventListener('click', () => { _step = 0; _render(); });
    el.querySelector('#cd-deploy-btn').addEventListener('click', () => { _step = 2; _render(); });
    el.querySelector('#cd-add-agent').addEventListener('click', () => _addAgent());

    // Agent card events
    el.querySelectorAll('.cd-agent-expand').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.cd-agent-card');
        card.classList.toggle('expanded');
      });
    });
    el.querySelectorAll('.cd-agent-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        _data.editedAgents.splice(idx, 1);
        _renderDesign(el);
      });
    });
    // Bind inline edit fields
    el.querySelectorAll('.cd-edit-name').forEach(input => {
      input.addEventListener('input', (e) => { _data.editedAgents[parseInt(e.target.dataset.idx)].name = e.target.value; });
    });
    el.querySelectorAll('.cd-edit-role').forEach(sel => {
      sel.addEventListener('change', (e) => { _data.editedAgents[parseInt(e.target.dataset.idx)].role = e.target.value; });
    });
    el.querySelectorAll('.cd-edit-desc').forEach(ta => {
      ta.addEventListener('input', (e) => { _data.editedAgents[parseInt(e.target.dataset.idx)].description = e.target.value; });
    });
    el.querySelectorAll('.cd-edit-model').forEach(sel => {
      sel.addEventListener('change', (e) => { _data.editedAgents[parseInt(e.target.dataset.idx)].model = e.target.value; });
    });
    el.querySelectorAll('.cd-edit-temp').forEach(range => {
      range.addEventListener('input', (e) => {
        _data.editedAgents[parseInt(e.target.dataset.idx)].temperature = parseFloat(e.target.value);
        const label = e.target.parentElement.querySelector('.cd-temp-val');
        if (label) label.textContent = e.target.value;
      });
    });
    el.querySelectorAll('.cd-edit-tool').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx);
        const tool = e.target.dataset.tool;
        const agent = _data.editedAgents[idx];
        if (!agent.tools) agent.tools = [];
        if (e.target.checked) { if (!agent.tools.includes(tool)) agent.tools.push(tool); }
        else { agent.tools = agent.tools.filter(t => t !== tool); }
      });
    });
  }

  function _renderAgentCard(agent, idx) {
    const roleColor = _roleColor(agent.role);
    const modelInfo = MODELS.find(m => m.id === agent.model) || MODELS[0];
    return `
      <div class="cd-agent-card" data-idx="${idx}">
        <div class="cd-agent-header">
          <div class="cd-agent-info">
            <span class="cd-agent-name">${_esc(agent.name)}</span>
            <span class="cd-agent-role" style="color:${roleColor}">${_esc(agent.role)}</span>
          </div>
          <div class="cd-agent-badges">
            <span class="cd-model-badge ${modelInfo.tier}">${_esc(modelInfo.label)}</span>
            <button class="cd-agent-expand" title="Edit">✎</button>
            <button class="cd-agent-remove" data-idx="${idx}" title="Remove">✕</button>
          </div>
        </div>
        <p class="cd-agent-desc">${_esc(agent.description)}</p>
        <div class="cd-agent-tools">
          ${(agent.tools || []).map(t => `<span class="cd-tool-tag">${_esc(TOOL_LABELS[t] || t)}</span>`).join('')}
        </div>
        <!-- Expanded edit form (hidden by default) -->
        <div class="cd-agent-edit">
          <label>Name</label>
          <input type="text" class="cd-edit-name" data-idx="${idx}" value="${_esc(agent.name)}">
          <label>Role</label>
          <select class="cd-edit-role" data-idx="${idx}">
            ${ROLES.map(r => `<option value="${r}" ${agent.role === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
          <label>Description</label>
          <textarea class="cd-edit-desc" data-idx="${idx}" rows="2">${_esc(agent.description)}</textarea>
          <label>Model</label>
          <select class="cd-edit-model" data-idx="${idx}">
            ${MODELS.map(m => `<option value="${m.id}" ${agent.model === m.id ? 'selected' : ''}>${m.label} (${m.tier})</option>`).join('')}
          </select>
          <label>Temperature <span class="cd-temp-val">${agent.temperature || 0.3}</span></label>
          <input type="range" class="cd-edit-temp" data-idx="${idx}" min="0" max="1" step="0.1" value="${agent.temperature || 0.3}">
          <label>Tools</label>
          <div class="cd-tool-checks">
            ${TOOLS.map(t => `<label class="cd-tool-check"><input type="checkbox" class="cd-edit-tool" data-idx="${idx}" data-tool="${t}" ${(agent.tools || []).includes(t) ? 'checked' : ''}> ${_esc(TOOL_LABELS[t] || t)}</label>`).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function _addAgent() {
    const newId = `cd-${Date.now()}`;
    _data.editedAgents.push({
      _id: newId, name: 'New Agent', role: 'Ops', description: 'Describe what this agent does',
      tools: [], model: 'gemini-2.5-flash', temperature: 0.3,
    });
    const el = document.getElementById('cd-body');
    if (el) _renderDesign(el);
  }

  function _roleColor(role) {
    const colors = {
      Research: '#60a5fa', Analytics: '#a78bfa', Content: '#34d399', Engineering: '#f472b6',
      Ops: '#fbbf24', Support: '#fb923c', Sales: '#f87171', Marketing: '#c084fc',
      Creative: '#e879f9', Media: '#38bdf8', Learning: '#4ade80', Legal: '#94a3b8',
    };
    return colors[role] || '#94a3b8';
  }

  function _isIntegrationConnected(name) {
    try {
      const conns = State.get('mcp_connections') || JSON.parse(localStorage.getItem('nice-mcp-connections') || '[]');
      return conns.some(c => c.name?.toLowerCase().includes(name) || c.type?.toLowerCase().includes(name));
    } catch { return false; }
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  STEP 3: DEPLOY                                                */
  /* ══════════════════════════════════════════════════════════════ */

  function _renderDeploy(el) {
    el.innerHTML = `
      <div class="cd-deploy">
        <div class="cd-loading">
          <div class="wizard-spinner"></div>
          <p class="cd-loading-text" id="cd-deploy-status">Creating agents...</p>
        </div>
      </div>
    `;
    _executeDeploy(el);
  }

  async function _executeDeploy(el) {
    const statusEl = document.getElementById('cd-deploy-status');
    const setStatus = (text) => { if (statusEl) statusEl.textContent = text; };

    try {
      const user = typeof State !== 'undefined' ? State.get('user') : null;
      const userId = user?.id;
      const createdAgentIds = [];

      // 1. Create agents
      for (let i = 0; i < _data.editedAgents.length; i++) {
        const agent = _data.editedAgents[i];
        setStatus(`Creating agent ${i + 1}/${_data.editedAgents.length}: ${agent.name}...`);

        const agentData = {
          name: agent.name,
          status: 'idle',
          config: {
            role: agent.role || 'Ops',
            type: 'Specialist',
            description: agent.description || '',
            llm_engine: agent.model || 'gemini-2.5-flash',
            tools: agent.tools || [],
            temperature: agent.temperature || 0.3,
            memory: true,
            source: 'crew_designer',
          },
        };

        if (userId && typeof SB !== 'undefined' && SB.isReady()) {
          try {
            const { data: created } = await SB.db('user_agents').create({ ...agentData, user_id: userId });
            if (created?.id) {
              createdAgentIds.push(created.id);
            } else {
              createdAgentIds.push(`local-${Date.now()}-${i}`);
            }
          } catch {
            createdAgentIds.push(`local-${Date.now()}-${i}`);
          }
        } else {
          createdAgentIds.push(`local-${Date.now()}-${i}`);
        }

        if (typeof Gamification !== 'undefined') Gamification.addXP('create_agent');
      }

      // 2. Create spaceship
      setStatus('Building spaceship...');
      const slotAssignments = {};
      createdAgentIds.forEach((id, i) => { slotAssignments[i] = id; });

      // shipData for local State/localStorage (full details)
      const shipData = {
        name: _data.shipName || 'Custom Spaceship',
        category: _data.shipCategory || 'Custom',
        description: _data.shipDescription || '',
        status: 'deployed',
        stats: { crew: String(createdAgentIds.length), slots: String(createdAgentIds.length) },
        config: {
          flow_pattern: _data.flowPattern || 'sequential',
          source: 'crew_designer',
          rationale: _data.rationale,
          integrations_needed: _data.integrationsNeeded,
          suggested_test_mission: _data.testMission,
        },
        slot_assignments: slotAssignments,
        caps: _data.editedAgents.map(a => a.role).filter((v, i, arr) => arr.indexOf(v) === i),
      };

      // Supabase insert uses only valid columns: name, status, slots (jsonb)
      let shipId = `ship-${Date.now()}`;
      if (userId && typeof SB !== 'undefined' && SB.isReady()) {
        try {
          const { data: created } = await SB.db('user_spaceships').create({
            user_id: userId,
            name: shipData.name,
            status: 'deployed',
            slots: {
              slot_assignments: slotAssignments,
              agent_ids: createdAgentIds,
              flow_pattern: _data.flowPattern || 'sequential',
              category: _data.shipCategory || 'Custom',
              description: _data.shipDescription || '',
              rationale: _data.rationale,
              integrations_needed: _data.integrationsNeeded,
              suggested_test_mission: _data.testMission,
              caps: shipData.caps,
              stats: shipData.stats,
            },
          });
          if (created?.id) shipId = created.id;
        } catch (e) { console.warn('[CrewDesigner] Ship create fallback to local:', e); }
      }

      // 3. Activate in BlueprintStore
      setStatus('Activating crew...');
      if (typeof BlueprintStore !== 'undefined') {
        try {
          BlueprintStore.activateShip(shipId);
          BlueprintStore.saveShipState(shipId, {
            slot_assignments: slotAssignments,
            status: 'deployed',
            agent_ids: createdAgentIds,
          });
          createdAgentIds.forEach(id => BlueprintStore.activateAgent(id));
        } catch (e) { console.warn('[CrewDesigner] BlueprintStore activation error:', e); }
      }

      // 4. Update State
      if (typeof State !== 'undefined') {
        const existingAgents = State.get('agents') || [];
        const newAgentObjects = _data.editedAgents.map((a, i) => ({
          id: createdAgentIds[i],
          name: a.name, role: a.role, type: 'Specialist', description: a.description,
          llm_engine: a.model, status: 'idle',
          config: { tools: a.tools, temperature: a.temperature, memory: true, source: 'crew_designer' },
        }));
        State.set('agents', [...existingAgents, ...newAgentObjects]);

        // Persist custom agents to localStorage
        try {
          const storedAgents = JSON.parse(localStorage.getItem('nice-custom-agents') || '[]');
          storedAgents.push(...newAgentObjects);
          localStorage.setItem('nice-custom-agents', JSON.stringify(storedAgents));
        } catch {}

        const newShip = { id: shipId, ...shipData };
        const existingShips = State.get('spaceships') || [];
        State.set('spaceships', [...existingShips, newShip]);

        // Persist custom ship to localStorage so it survives reloads
        try {
          const stored = JSON.parse(localStorage.getItem('nice-custom-ships') || '[]');
          stored.push(newShip);
          localStorage.setItem('nice-custom-ships', JSON.stringify(stored));
        } catch {}
      }

      // 5. XP + Audit
      if (typeof Gamification !== 'undefined') Gamification.addXP('launch_spaceship');
      if (typeof AuditLog !== 'undefined') {
        AuditLog.log('crew_designer_deploy', {
          shipId, shipName: _data.shipName,
          agentCount: createdAgentIds.length,
          flowPattern: _data.flowPattern,
        });
      }

      // 6. Show success
      _renderSuccess(el, shipId, createdAgentIds.length);

    } catch (err) {
      console.error('[CrewDesigner] Deploy failed:', err);
      el.innerHTML = `
        <div class="cd-deploy">
          <div class="cd-success">
            <div class="cd-success-icon">✕</div>
            <h2 class="cd-heading">Deployment Failed</h2>
            <p class="cd-subheading">${_esc(err.message || 'Something went wrong. Please try again.')}</p>
            <div class="cd-actions">
              <button class="btn cd-btn-secondary" id="cd-retry">← Try Again</button>
              <button class="btn cd-btn-secondary" id="cd-close-err">Close</button>
            </div>
          </div>
        </div>
      `;
      el.querySelector('#cd-retry')?.addEventListener('click', () => { _step = 1; _render(); });
      el.querySelector('#cd-close-err')?.addEventListener('click', close);
    }
  }

  function _renderSuccess(el, shipId, agentCount) {
    el.innerHTML = `
      <div class="cd-deploy">
        <div class="cd-success">
          <div class="cd-success-icon">✓</div>
          <h2 class="cd-heading">${_esc(_data.shipName)}</h2>
          <p class="cd-subheading">${agentCount} agents deployed and ready for action.</p>
          <p class="cd-rationale">${_esc(_data.rationale)}</p>
          <div class="cd-actions cd-actions-stack">
            <button class="btn cd-btn-primary" id="cd-view-schematic">View Schematic</button>
            ${_data.testMission ? `<button class="btn cd-btn-secondary" id="cd-test-mission-btn">Run Test Mission</button>` : ''}
            <button class="btn cd-btn-secondary" id="cd-close-success">Close</button>
          </div>
        </div>
      </div>
    `;

    el.querySelector('#cd-view-schematic')?.addEventListener('click', () => {
      close();
      if (typeof Router !== 'undefined') location.hash = '#/bridge?tab=schematic';
    });
    el.querySelector('#cd-test-mission-btn')?.addEventListener('click', () => {
      close();
      if (typeof PromptPanel !== 'undefined') {
        PromptPanel.show();
        const input = document.getElementById('nice-ai-input');
        if (input) { input.value = _data.testMission; input.focus(); }
      }
    });
    el.querySelector('#cd-close-success')?.addEventListener('click', close);

    if (typeof Notify !== 'undefined') {
      Notify.send({ title: 'Crew Deployed', message: `${_data.shipName} with ${agentCount} agents`, type: 'success' });
    }
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  BOOT: Restore custom ships/agents into State on page load    */
  /* ══════════════════════════════════════════════════════════════ */

  function _restoreCustomData() {
    try {
      const ships = JSON.parse(localStorage.getItem('nice-custom-ships') || '[]');
      const agents = JSON.parse(localStorage.getItem('nice-custom-agents') || '[]');
      if (ships.length && typeof State !== 'undefined') {
        const existing = State.get('spaceships') || [];
        const merged = [...existing];
        ships.forEach(s => { if (!merged.find(e => e.id === s.id)) merged.push(s); });
        if (merged.length > existing.length) State.set('spaceships', merged);
      }
      if (agents.length && typeof State !== 'undefined') {
        const existing = State.get('agents') || [];
        const merged = [...existing];
        agents.forEach(a => { if (!merged.find(e => e.id === a.id)) merged.push(a); });
        if (merged.length > existing.length) State.set('agents', merged);
      }
      // Ensure BlueprintStore knows about custom ships
      if (ships.length && typeof BlueprintStore !== 'undefined') {
        ships.forEach(s => {
          if (!BlueprintStore.isShipActivated(s.id)) {
            BlueprintStore.activateShip(s.id);
          }
          if (s.slot_assignments && !BlueprintStore.getShipState(s.id)?.slot_assignments) {
            BlueprintStore.saveShipState(s.id, {
              slot_assignments: s.slot_assignments,
              status: s.status || 'deployed',
              agent_ids: Object.values(s.slot_assignments),
            });
          }
        });
      }
    } catch (e) { console.warn('[CrewDesigner] restore error:', e); }
  }

  // Run on load after a short delay to ensure State/BlueprintStore are ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(_restoreCustomData, 500));
    } else {
      setTimeout(_restoreCustomData, 500);
    }
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  PUBLIC API                                                    */
  /* ══════════════════════════════════════════════════════════════ */

  return { open, close, isOpen };
})();
