/* ═══════════════════════════════════════════════════════════════════
   NICE — Setup Wizard
   Guided spaceship creation: questionnaire → LLM recommendation →
   auto-creates agents + workflows + spaceship in one flow.
   Works for businesses, personal projects, creative work, research,
   open-source — anything that can be powered by AI agents.
═══════════════════════════════════════════════════════════════════ */

const SetupWizard = (() => {
  let _overlay = null;
  let _step = 0;
  const _data = {
    projectName: '',
    description: '',
    category: '',
    projectType: '',
    goals: [],
    recommendation: null,
    // Editable in review step
    spaceshipName: '',
    classId: 'class-1',
    agents: [],
    workflows: [],
  };

  const CATEGORIES = [
    'Business / Startup',
    'Freelance / Consulting',
    'E-Commerce / Retail',
    'Restaurant / Hospitality',
    'Real Estate',
    'Healthcare',
    'Legal',
    'Marketing / Agency',
    'Software / SaaS',
    'Education / Tutoring',
    'Creative / Design / Art',
    'Music / Audio Production',
    'Video / Film / Animation',
    'Writing / Publishing',
    'Gaming / Game Dev',
    'Research / Academic',
    'Open Source / Community',
    'Nonprofit / Social Impact',
    'Finance / Accounting',
    'Construction / Trades',
    'Logistics / Supply Chain',
    'Personal Productivity',
    'Content Creation',
    'Data Science / AI/ML',
    'Other',
  ];

  const PROJECT_TYPES = [
    { id: 'business',   label: 'Business or Company',     icon: '🏢', hint: 'Run or grow a business with AI agents' },
    { id: 'project',    label: 'Project or Side Hustle',   icon: '🚀', hint: 'Build something new from scratch' },
    { id: 'creative',   label: 'Creative Work',            icon: '🎨', hint: 'Art, music, writing, video, design' },
    { id: 'research',   label: 'Research or Learning',     icon: '🔬', hint: 'Academic research, study, exploration' },
    { id: 'community',  label: 'Community or Open Source',  icon: '🌍', hint: 'Open source, nonprofit, community project' },
    { id: 'personal',   label: 'Personal Productivity',    icon: '⚡', hint: 'Automate your daily life and tasks' },
  ];

  const GOALS = [
    { id: 'content',    label: 'Create content & copy',         icon: '📝' },
    { id: 'research',   label: 'Research & gather intel',       icon: '🔍' },
    { id: 'analytics',  label: 'Analyze data & insights',       icon: '📊' },
    { id: 'code',       label: 'Write or review code',          icon: '💻' },
    { id: 'design',     label: 'Design & creative direction',   icon: '🎨' },
    { id: 'support',    label: 'Handle support & communication', icon: '💬' },
    { id: 'sales',      label: 'Sales & outreach',              icon: '💰' },
    { id: 'ops',        label: 'Automate operations & tasks',   icon: '⚙️' },
    { id: 'legal',      label: 'Legal, compliance & contracts',  icon: '⚖️' },
    { id: 'schedule',   label: 'Plan, schedule & coordinate',   icon: '📅' },
    { id: 'learning',   label: 'Learn & train on new topics',   icon: '📚' },
    { id: 'media',      label: 'Audio, video & media production', icon: '🎬' },
  ];

  /* ── Open the wizard ── */
  function open() {
    if (_overlay) return;
    _step = 0;
    _data.projectName = '';
    _data.description = '';
    _data.category = '';
    _data.projectType = '';
    _data.goals = [];
    _data.recommendation = null;

    _overlay = document.createElement('div');
    _overlay.className = 'wizard-overlay';
    _overlay.innerHTML = `
      <div class="wizard-container">
        <button class="wizard-close" aria-label="Close">&times;</button>
        <div class="wizard-progress"></div>
        <div class="wizard-body"></div>
        <div class="wizard-actions"></div>
      </div>
    `;
    document.body.appendChild(_overlay);
    requestAnimationFrame(() => _overlay.classList.add('open'));

    _overlay.querySelector('.wizard-close').addEventListener('click', close);
    _overlay.addEventListener('click', (e) => { if (e.target === _overlay) close(); });
    document.addEventListener('keydown', _onKey);

    _showStep(0);
  }

  /* ── Close the wizard ── */
  function close() {
    if (!_overlay) return;
    document.removeEventListener('keydown', _onKey);
    _overlay.classList.remove('open');
    setTimeout(() => { _overlay?.remove(); _overlay = null; }, 200);
  }

  function _onKey(e) {
    if (e.key === 'Escape') close();
  }

  /* ── Step rendering ── */
  function _showStep(n) {
    _step = n;
    if (!_overlay) return;
    const body = _overlay.querySelector('.wizard-body');
    const actions = _overlay.querySelector('.wizard-actions');
    const progress = _overlay.querySelector('.wizard-progress');

    // Progress dots
    progress.innerHTML = [0,1,2,3,4].map(i =>
      `<span class="wizard-dot${i === n ? ' active' : ''}${i < n ? ' done' : ''}">${i < n ? '✓' : i + 1}</span>`
    ).join('');

    const renderers = [_renderStep1, _renderStep2, _renderStep3, _renderStep4, _renderStep5];
    renderers[n](body, actions);
  }

  /* ── Step 1: What are you building? ── */
  function _renderStep1(body, actions) {
    body.innerHTML = `
      <h2 class="wizard-title">What are you building?</h2>
      <p class="wizard-subtitle">NICE can power anything — businesses, creative projects, research, personal tools, and more.</p>
      <div class="wizard-goals wizard-project-types">
        ${PROJECT_TYPES.map(t => `
          <label class="wizard-goal wizard-project-type${_data.projectType === t.id ? ' selected' : ''}">
            <input type="radio" name="project-type" value="${t.id}" ${_data.projectType === t.id ? 'checked' : ''}>
            <span class="wizard-goal-icon">${t.icon}</span>
            <span class="wizard-goal-label">${t.label}</span>
            <span class="wizard-goal-hint">${t.hint}</span>
          </label>
        `).join('')}
      </div>
    `;

    body.querySelectorAll('input[name="project-type"]').forEach(radio => {
      radio.addEventListener('change', () => {
        _data.projectType = radio.value;
        body.querySelectorAll('.wizard-project-type').forEach(el => el.classList.remove('selected'));
        radio.closest('.wizard-project-type').classList.add('selected');
      });
    });

    actions.innerHTML = `
      <button class="btn btn-sm" onclick="SetupWizard.close()">Cancel</button>
      <button class="btn btn-sm btn-primary" id="wiz-next-1">Next</button>
    `;
    actions.querySelector('#wiz-next-1').addEventListener('click', () => {
      if (!_data.projectType) {
        body.querySelector('.wizard-project-types').classList.add('wizard-shake');
        setTimeout(() => body.querySelector('.wizard-project-types')?.classList.remove('wizard-shake'), 500);
        return;
      }
      _showStep(1);
    });
  }

  /* ── Step 2: Tell us about your business or project ── */
  function _renderStep2(body, actions) {
    const nameLabel = _data.projectType === 'business' ? 'Business or Company Name'
      : _data.projectType === 'creative' ? 'Project or Studio Name'
      : _data.projectType === 'research' ? 'Research Project Name'
      : _data.projectType === 'community' ? 'Project or Organization Name'
      : _data.projectType === 'personal' ? 'What should we call this?'
      : 'Project Name';

    const namePlaceholder = _data.projectType === 'business' ? 'e.g. Desert Dirt Landscaping'
      : _data.projectType === 'creative' ? 'e.g. Neon Dreams Studio'
      : _data.projectType === 'research' ? 'e.g. Climate Data Analysis'
      : _data.projectType === 'community' ? 'e.g. OpenWidget Project'
      : _data.projectType === 'personal' ? 'e.g. My Productivity Hub'
      : 'e.g. My Awesome Project';

    const descLabel = _data.projectType === 'business' ? 'Describe what your business does'
      : _data.projectType === 'creative' ? 'Describe your creative vision'
      : _data.projectType === 'research' ? 'Describe your research focus'
      : _data.projectType === 'community' ? 'Describe the project and its mission'
      : _data.projectType === 'personal' ? 'What do you want to accomplish?'
      : 'Describe your project';

    const descPlaceholder = _data.projectType === 'business' ? 'e.g. We design and maintain desert-adapted landscapes for residential and commercial properties in the Phoenix metro area.'
      : _data.projectType === 'creative' ? 'e.g. I create synthwave music and retro-futuristic visual art for independent films and game soundtracks.'
      : _data.projectType === 'research' ? 'e.g. Analyzing satellite imagery and climate datasets to predict drought patterns in the American Southwest.'
      : _data.projectType === 'community' ? 'e.g. An open-source toolkit for building accessible web components, maintained by a community of 50+ contributors.'
      : _data.projectType === 'personal' ? 'e.g. I want AI agents to help me manage my schedule, research topics I\'m learning, and draft emails.'
      : 'e.g. Describe what you\'re building and what you want to achieve.';

    body.innerHTML = `
      <h2 class="wizard-title">Tell us about your ${_data.projectType === 'business' ? 'business' : 'project'}</h2>
      <p class="wizard-subtitle">The more detail you provide, the better NICE can customize your AI team.</p>
      <div class="wizard-field">
        <label>${nameLabel}</label>
        <input type="text" id="wiz-proj-name" class="wizard-input" placeholder="${namePlaceholder}" maxlength="60" value="${_esc(_data.projectName)}">
      </div>
      <div class="wizard-field">
        <label>Category</label>
        <select id="wiz-category" class="wizard-input">
          <option value="">Select a category...</option>
          ${CATEGORIES.map(c => `<option value="${c}"${_data.category === c ? ' selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="wizard-field">
        <label>${descLabel}</label>
        <textarea id="wiz-desc" class="wizard-input wizard-textarea" placeholder="${descPlaceholder}" maxlength="500">${_esc(_data.description)}</textarea>
        <span class="wizard-hint">Be specific — mention tools you use, your audience, team size, or anything relevant.</span>
      </div>
    `;
    actions.innerHTML = `
      <button class="btn btn-sm" id="wiz-back-2">Back</button>
      <button class="btn btn-sm btn-primary" id="wiz-next-2">Next</button>
    `;
    actions.querySelector('#wiz-back-2').addEventListener('click', () => _showStep(0));
    actions.querySelector('#wiz-next-2').addEventListener('click', () => {
      _data.projectName = document.getElementById('wiz-proj-name').value.trim();
      _data.category = document.getElementById('wiz-category').value;
      _data.description = document.getElementById('wiz-desc').value.trim();
      if (!_data.projectName) { _flash('wiz-proj-name'); return; }
      if (!_data.description) { _flash('wiz-desc'); return; }
      _showStep(2);
    });
  }

  /* ── Step 3: Goals & Priorities ── */
  function _renderStep3(body, actions) {
    body.innerHTML = `
      <h2 class="wizard-title">What do you need AI to help with?</h2>
      <p class="wizard-subtitle">Select everything that applies — NICE will build a custom agent team around your needs.</p>
      <div class="wizard-goals">
        ${GOALS.map(g => `
          <label class="wizard-goal${_data.goals.includes(g.id) ? ' selected' : ''}">
            <input type="checkbox" value="${g.id}" ${_data.goals.includes(g.id) ? 'checked' : ''}>
            <span class="wizard-goal-icon">${g.icon}</span>
            <span class="wizard-goal-label">${g.label}</span>
          </label>
        `).join('')}
      </div>
    `;

    body.querySelectorAll('.wizard-goal input').forEach(cb => {
      cb.addEventListener('change', () => {
        const val = cb.value;
        if (cb.checked && !_data.goals.includes(val)) _data.goals.push(val);
        else _data.goals = _data.goals.filter(g => g !== val);
        cb.closest('.wizard-goal').classList.toggle('selected', cb.checked);
      });
    });

    actions.innerHTML = `
      <button class="btn btn-sm" id="wiz-back-3">Back</button>
      <button class="btn btn-sm btn-primary" id="wiz-next-3">Generate My Team</button>
    `;
    actions.querySelector('#wiz-back-3').addEventListener('click', () => _showStep(1));
    actions.querySelector('#wiz-next-3').addEventListener('click', () => {
      if (_data.goals.length === 0) {
        body.querySelector('.wizard-goals').classList.add('wizard-shake');
        setTimeout(() => body.querySelector('.wizard-goals')?.classList.remove('wizard-shake'), 500);
        return;
      }
      _showStep(3);
    });
  }

  /* ── Step 4: LLM Recommendation + Review ── */
  function _renderStep4(body, actions) {
    body.innerHTML = `
      <h2 class="wizard-title">Building your custom setup...</h2>
      <p class="wizard-subtitle">NICE is designing the perfect AI team for your ${_data.projectType === 'business' ? 'business' : 'project'}.</p>
      <div class="wizard-loading">
        <div class="wizard-spinner"></div>
        <p id="wiz-loading-text">Analyzing your needs...</p>
      </div>
    `;
    actions.innerHTML = `
      <button class="btn btn-sm" id="wiz-back-4">Cancel</button>
      <span></span>
    `;
    actions.querySelector('#wiz-back-4').addEventListener('click', () => _showStep(2));

    _generateRecommendation().then(rec => {
      if (_step !== 3) return; // user navigated away
      _data.recommendation = rec;
      _data.spaceshipName = rec.spaceship_name || (_data.projectName + ' HQ');
      _data.classId = rec.class_id || 'class-1';
      _data.agents = rec.agents || [];
      _data.workflows = rec.workflows || [];

      // Show recommendation with inline editing
      body.innerHTML = `
        <h2 class="wizard-title">Your Custom Setup</h2>
        <p class="wizard-subtitle">${_esc(rec.rationale || 'Here\'s what NICE recommends based on your needs.')}</p>
        <div class="wizard-field" style="margin-bottom:12px">
          <label>Spaceship Name</label>
          <input type="text" id="wiz-ship-name" class="wizard-input" value="${_esc(_data.spaceshipName)}" maxlength="60">
        </div>
        <div class="wizard-rec-card">
          <div class="wizard-rec-header">
            <span class="wizard-rec-class">${_data.classId === 'class-3' ? 'ELITE' : _data.classId === 'class-2' ? 'PRO' : 'LITE'}</span>
          </div>
          <div class="wizard-rec-section">
            <h4>Agents (${_data.agents.length})</h4>
            ${_data.agents.map((a, i) => `
              <label class="wizard-agent-toggle">
                <input type="checkbox" data-idx="${i}" checked>
                <span><strong>${_esc(a.name)}</strong> — ${_esc(a.role)}</span>
              </label>
            `).join('')}
          </div>
          <div class="wizard-rec-section">
            <h4>Workflows (${_data.workflows.length})</h4>
            ${_data.workflows.map((w, i) => `
              <label class="wizard-agent-toggle">
                <input type="checkbox" data-wf-idx="${i}" checked>
                <span><strong>${_esc(w.name)}</strong> — ${(w.nodes || []).length} steps</span>
              </label>
            `).join('')}
          </div>
        </div>
      `;
      actions.innerHTML = `
        <button class="btn btn-sm" id="wiz-back-4b">Back</button>
        <button class="btn btn-sm btn-primary" id="wiz-launch">Launch Spaceship</button>
      `;
      actions.querySelector('#wiz-back-4b').addEventListener('click', () => _showStep(2));
      actions.querySelector('#wiz-launch').addEventListener('click', async () => {
        _data.spaceshipName = document.getElementById('wiz-ship-name').value.trim() || _data.spaceshipName;

        // Filter unchecked agents
        const agentChecks = body.querySelectorAll('input[data-idx]');
        const enabledAgents = [];
        agentChecks.forEach(cb => { if (cb.checked) enabledAgents.push(_data.agents[+cb.dataset.idx]); });
        _data.agents = enabledAgents;

        // Filter unchecked workflows
        const wfChecks = body.querySelectorAll('input[data-wf-idx]');
        const enabledWfs = [];
        wfChecks.forEach(cb => { if (cb.checked) enabledWfs.push(_data.workflows[+cb.dataset.wfIdx]); });
        _data.workflows = enabledWfs;

        _showStep(4);
      });
    }).catch(err => {
      if (_step !== 3) return;
      console.warn('[SetupWizard] LLM failed, using fallback:', err.message);
      _data.recommendation = _fallbackRecommendation();
      _data.spaceshipName = _data.recommendation.spaceship_name;
      _data.classId = _data.recommendation.class_id;
      _data.agents = _data.recommendation.agents;
      _data.workflows = _data.recommendation.workflows;
      _showStep(3); // re-render with fallback data
    });
  }

  /* ── Step 5: Launch ── */
  function _renderStep5(body, actions) {
    body.innerHTML = `
      <div class="wizard-launching">
        <div class="wizard-spinner"></div>
        <h2 class="wizard-title">Launching ${_esc(_data.spaceshipName)}...</h2>
        <p id="wiz-launch-status">Creating agents...</p>
      </div>
    `;
    actions.innerHTML = '';

    _createSpaceship().then(shipId => {
      body.innerHTML = `
        <div class="wizard-success">
          <div class="wizard-success-icon">🚀</div>
          <h2 class="wizard-title">${_esc(_data.spaceshipName)} is Live!</h2>
          <p class="wizard-subtitle">${_data.agents.length} agents and ${_data.workflows.length} workflows ready to go.</p>
          ${typeof Gamification !== 'undefined' ? '<p class="wizard-xp">+25 XP earned!</p>' : ''}
        </div>
      `;
      actions.innerHTML = `
        <button class="btn btn-sm" onclick="SetupWizard.close()">Close</button>
        <button class="btn btn-sm btn-primary" id="wiz-goto-ship">View Spaceship</button>
      `;
      actions.querySelector('#wiz-goto-ship').addEventListener('click', () => {
        close();
        if (typeof Router !== 'undefined') Router.navigate('#/bridge/spaceships/' + shipId);
        else location.hash = '#/bridge/spaceships/' + shipId;
      });
    }).catch(err => {
      body.innerHTML = `
        <div class="wizard-success">
          <h2 class="wizard-title">Setup Error</h2>
          <p class="wizard-subtitle">${_esc(err.message || 'Something went wrong. Please try again.')}</p>
        </div>
      `;
      actions.innerHTML = `
        <button class="btn btn-sm" id="wiz-retry">Try Again</button>
        <button class="btn btn-sm" onclick="SetupWizard.close()">Close</button>
      `;
      actions.querySelector('#wiz-retry')?.addEventListener('click', () => _showStep(3));
    });
  }

  /* ── LLM-powered recommendation ── */
  async function _generateRecommendation() {
    if (typeof SB === 'undefined' || !SB.isReady()) return _fallbackRecommendation();

    // Build compact agent catalog for the LLM
    const agentCatalog = (typeof BlueprintsView !== 'undefined' && BlueprintsView.SEED)
      ? BlueprintsView.SEED.slice(0, 30).map(a => `${a.id}: ${a.name} (${a.config?.role || a.category})`)
      : [];

    const systemPrompt = `You are NICE, an AI that configures custom setups for any kind of project — businesses, creative work, research, personal productivity, open source, and more. Given a project description and goals, recommend a spaceship configuration.

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "spaceship_name": "Short catchy name for the spaceship",
  "class_id": "class-1 or class-2 or class-3",
  "rationale": "1-2 sentence explanation of why this config was chosen",
  "agents": [
    { "blueprint_id": "bp-agent-XX or null", "name": "Agent Display Name", "role": "Research|Analytics|Content|Engineering|Ops|Sales|Support|Legal|Marketing|Creative|Media|Learning" }
  ],
  "workflows": [
    {
      "name": "Workflow Name",
      "nodes": [
        { "id": "n1", "type": "agent", "label": "Step Label", "config": { "agentRole": "Role", "prompt": "What this step does" } },
        { "id": "nN", "type": "output", "label": "Done", "config": { "format": "text" } }
      ],
      "connections": [{ "from": "n1", "to": "n2" }]
    }
  ]
}

Rules:
- 3-6 agents depending on project complexity
- 1-3 workflows that chain agents for common processes
- class-1 for simple projects, class-2 for medium, class-3 for complex/enterprise
- Use roles from: Research, Analytics, Content, Engineering, Ops, Sales, Support, Legal, Marketing, Creative, Media, Learning
- Each workflow should have 2-4 agent nodes plus one output node
- Make agent names creative and relevant to the project
- This is NOT just for businesses — adapt the tone and recommendations to match the project type (creative, research, personal, community, etc.)`;

    const userPrompt = `Project Type: ${_data.projectType}
Name: ${_data.projectName}
Category: ${_data.category || 'Not specified'}
Description: ${_data.description}
Goals: ${_data.goals.join(', ')}

Available agent blueprints:
${agentCatalog.join('\n')}`;

    const { data, error } = await SB.functions.invoke('nice-ai', {
      body: {
        messages: [{ role: 'user', content: userPrompt }],
        systemPrompt,
        config: { model: 'claude-haiku-4-5-20251001', max_tokens: 2048, temperature: 0.5 },
      },
    });

    if (error) throw new Error(typeof error === 'string' ? error : 'Edge function error');
    if (!data || !data.content) throw new Error('Empty response');

    // Parse JSON from response
    let content = data.content.trim();
    // Strip markdown code fences if present
    if (content.startsWith('```')) {
      content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    const rec = JSON.parse(content);

    // Validate minimum structure
    if (!rec.agents || !Array.isArray(rec.agents) || rec.agents.length === 0) {
      throw new Error('Invalid recommendation structure');
    }

    return rec;
  }

  /* ── Fallback: keyword-based matching ── */
  function _fallbackRecommendation() {
    const text = (_data.projectName + ' ' + _data.description + ' ' + _data.category + ' ' + _data.goals.join(' ')).toLowerCase();

    // Score spaceship seeds by tag/category match
    const seeds = (typeof BlueprintsView !== 'undefined' && BlueprintsView.SPACESHIP_SEED)
      ? BlueprintsView.SPACESHIP_SEED : [];

    let bestBp = seeds[0] || null;
    let bestScore = 0;

    seeds.forEach(bp => {
      let score = 0;
      (bp.tags || []).forEach(tag => { if (text.includes(tag)) score += 10; });
      if (bp.category && text.includes(bp.category.toLowerCase())) score += 15;
      if (score > bestScore) { bestScore = score; bestBp = bp; }
    });

    // Build agents from goals
    const goalToRole = {
      support: 'Support', content: 'Content', analytics: 'Analytics', sales: 'Sales',
      ops: 'Ops', research: 'Research', legal: 'Legal', schedule: 'Ops',
      code: 'Engineering', design: 'Creative', learning: 'Research', media: 'Media',
    };
    const agents = _data.goals.slice(0, 5).map(g => ({
      blueprint_id: null,
      name: _data.projectName + ' ' + (goalToRole[g] || 'Agent'),
      role: goalToRole[g] || 'Ops',
    }));

    // Use blueprint workflows if available
    const workflows = (bestBp && bestBp.config && bestBp.config.workflows)
      ? bestBp.config.workflows
      : [{ name: 'Default Pipeline', nodes: [
          { id: 'n1', type: 'agent', label: 'Process', config: { agentRole: agents[0]?.role || 'Ops', prompt: 'Process the incoming task.' }},
          { id: 'n2', type: 'output', label: 'Done', config: { format: 'text' }}
        ], connections: [{ from: 'n1', to: 'n2' }] }];

    const suffix = _data.projectType === 'business' ? ' HQ'
      : _data.projectType === 'creative' ? ' Studio'
      : _data.projectType === 'research' ? ' Lab'
      : _data.projectType === 'community' ? ' Hub'
      : _data.projectType === 'personal' ? ' Command'
      : ' HQ';

    return {
      spaceship_name: _data.projectName + suffix,
      class_id: agents.length > 4 ? 'class-2' : 'class-1',
      rationale: bestBp ? `Based on your profile, the "${bestBp.name}" template is a great starting point.` : 'Custom configuration based on your goals.',
      agents,
      workflows,
    };
  }

  /* ── Create everything in Supabase (with local fallback) ── */
  async function _createSpaceship() {
    const user = typeof State !== 'undefined' ? State.get('user') : null;
    if (!user) throw new Error('Not signed in');
    const statusEl = document.getElementById('wiz-launch-status');
    const classId = _data.classId || 'class-2';
    const hasSB = typeof SB !== 'undefined' && SB.db;

    // 1. Create agents
    const agentIds = [];
    for (const a of _data.agents) {
      if (statusEl) statusEl.textContent = `Creating agent: ${a.name}...`;
      if (hasSB) {
        try {
          const created = await SB.db('user_agents').create({
            user_id: user.id,
            name: a.name,
            role: a.role,
            type: 'Specialist',
            status: 'active',
            config: { role: a.role, tools: _toolsForRole(a.role), source: 'guided_setup' },
          });
          if (created) agentIds.push(created.id);
        } catch (err) {
          console.warn('[SetupWizard] Agent creation failed:', a.name, err.message);
          agentIds.push('local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6));
        }
      } else {
        agentIds.push('local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6));
      }
    }

    // 2. Create spaceship
    if (statusEl) statusEl.textContent = 'Deploying spaceship...';
    const spaceshipClass = typeof Gamification !== 'undefined' ? Gamification.getSpaceshipClass(classId) : { slots: agentIds.map((_, i) => ({ id: i })) };
    const slotAssignments = {};
    (spaceshipClass.slots || []).forEach((slot, i) => {
      slotAssignments[slot.id] = agentIds[i] || null;
    });

    let ship = null;
    if (hasSB) {
      try {
        ship = await SB.db('user_spaceships').create({
          user_id: user.id,
          name: _data.spaceshipName,
          blueprint_id: classId,
          slots: slotAssignments,
          status: 'deployed',
          config: { workflows: _data.workflows, wizard_category: _data.category, wizard_goals: _data.goals, wizard_type: _data.projectType, source: 'guided_setup' },
        });
      } catch (err) {
        console.warn('[SetupWizard] Spaceship creation failed, using local fallback:', err.message);
      }
    }

    // Local fallback if Supabase failed or unavailable
    if (!ship) {
      ship = {
        id: 'local-ship-' + Date.now(),
        user_id: user.id,
        name: _data.spaceshipName,
        blueprint_id: classId,
        slots: slotAssignments,
        status: 'deployed',
        config: { workflows: _data.workflows, wizard_category: _data.category, wizard_goals: _data.goals, wizard_type: _data.projectType, source: 'guided_setup' },
        created_at: new Date().toISOString(),
      };
    }

    // 3. Create workflow records
    if (statusEl) statusEl.textContent = 'Setting up workflows...';
    for (const wf of _data.workflows) {
      if (hasSB) {
        try {
          await SB.db('user_workflows').create({
            user_id: user.id,
            name: wf.name,
            nodes: JSON.stringify(wf.nodes || []),
            connections: JSON.stringify(wf.connections || []),
            spaceship_id: ship.id,
            tags: [_data.category || 'general'],
          });
        } catch (err) {
          console.warn('[SetupWizard] Workflow creation failed:', wf.name, err.message);
        }
      }
    }

    // 4. Update local state
    if (typeof State !== 'undefined') {
      // Build local agent objects for State
      const localAgents = _data.agents.map((a, i) => ({
        id: agentIds[i],
        user_id: user.id,
        name: a.name,
        role: a.role,
        type: 'Specialist',
        status: 'active',
        source: 'guided_setup',
        config: { role: a.role, tools: _toolsForRole(a.role), source: 'guided_setup' },
        created_at: new Date().toISOString(),
      }));

      const agents = State.get('agents') || [];
      const spaceships = State.get('spaceships') || [];

      if (hasSB) {
        try {
          const freshAgents = await SB.db('user_agents').list({ user_id: user.id });
          State.set('agents', freshAgents);
        } catch { State.set('agents', [...agents, ...localAgents]); }
        try {
          const freshShips = await SB.db('user_spaceships').list({ user_id: user.id });
          State.set('spaceships', freshShips);
        } catch { State.set('spaceships', [...spaceships, ship]); }
      } else {
        State.set('agents', [...agents, ...localAgents]);
        State.set('spaceships', [...spaceships, ship]);
      }
    }

    // 5. Gamification
    if (typeof Gamification !== 'undefined') {
      Gamification.addXP('complete_wizard');
      _data.agents.forEach(() => Gamification.addXP('create_agent'));
    }

    // 6. Audit log
    if (typeof AuditLog !== 'undefined') {
      AuditLog.log('wizard_complete', { spaceship: _data.spaceshipName, agents: _data.agents.length, workflows: _data.workflows.length, type: _data.projectType });
    }

    return ship.id;
  }

  /* ── Assign default tools based on role ── */
  function _toolsForRole(role) {
    const map = {
      Research: ['web-search', 'summarize'],
      Analytics: ['summarize', 'code-gen'],
      Content: ['web-search', 'summarize'],
      Engineering: ['code-gen', 'web-search'],
      Ops: ['summarize', 'web-search'],
      Sales: ['web-search', 'summarize'],
      Support: ['summarize', 'web-search'],
      Legal: ['web-search', 'summarize'],
      Marketing: ['web-search', 'summarize', 'code-gen'],
      Creative: ['summarize', 'code-gen'],
      Media: ['summarize', 'code-gen', 'web-search'],
      Learning: ['web-search', 'summarize'],
    };
    return map[role] || ['summarize'];
  }

  /* ── Helpers ── */
  const _esc = Utils.esc;

  function _flash(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('wizard-shake');
    el.focus();
    setTimeout(() => el.classList.remove('wizard-shake'), 500);
  }

  return { open, close };
})();
