/* ═══════════════════════════════════════════════════════════════════
   NICE — Setup Wizard (First-Run Onboarding)
   4-step flow: Describe → Pick needs → AI crew preview → Deploy.
   Shows on first visit (localStorage 'nice-onboarded'), skippable.
   Uses CrewDesigner-style AI generation + deploy.
═══════════════════════════════════════════════════════════════════ */

const SetupWizard = (() => {
  let _overlay = null;
  let _step = 0;
  const _esc = Utils.esc;

  const _data = {
    businessDesc: '',
    needs: [],
    proposal: null,
    shipName: '',
    shipId: null,
    agentCount: 0,
  };

  const NEEDS = [
    { id: 'social',   label: 'Social Media',       icon: '#icon-share-2' },
    { id: 'email',    label: 'Email Marketing',     icon: '#icon-mail' },
    { id: 'support',  label: 'Customer Support',    icon: '#icon-message-circle' },
    { id: 'analytics',label: 'Analytics',           icon: '#icon-bar-chart' },
    { id: 'content',  label: 'Content Creation',    icon: '#icon-file-text' },
    { id: 'ops',      label: 'Operations',          icon: '#icon-cog' },
  ];

  const TOTAL_STEPS = 4;

  /* ── Should the wizard auto-open? ── */
  function shouldShow() {
    return !localStorage.getItem(Utils.KEYS.onboarded);
  }

  /* ── Mark onboarding complete ── */
  function _markDone() {
    localStorage.setItem(Utils.KEYS.onboarded, '1');
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  OPEN / CLOSE                                                 */
  /* ══════════════════════════════════════════════════════════════ */

  function open() {
    if (_overlay) return;
    _step = 0;
    _data.businessDesc = '';
    _data.needs = [];
    _data.proposal = null;
    _data.shipName = '';
    _data.shipId = null;
    _data.agentCount = 0;

    _overlay = document.createElement('div');
    _overlay.className = 'wizard-overlay';
    _overlay.setAttribute('role', 'dialog');
    _overlay.setAttribute('aria-label', 'Welcome to NICE');
    _overlay.innerHTML = `
      <div class="wizard-container">
        <div class="wizard-progress" id="wiz-progress"></div>
        <div class="wizard-body" id="wiz-body"></div>
        <div class="wizard-actions" id="wiz-actions"></div>
      </div>
    `;
    document.body.appendChild(_overlay);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', _onKey);
    requestAnimationFrame(() => _overlay?.classList.add('open'));
    _showStep(0);
  }

  function close() {
    if (!_overlay) return;
    document.removeEventListener('keydown', _onKey);
    document.body.style.overflow = '';
    _overlay.classList.remove('open');
    setTimeout(() => { _overlay?.remove(); _overlay = null; }, 200);
  }

  function skip() {
    _markDone();
    close();
    if (typeof AuditLog !== 'undefined') {
      AuditLog.log('wizard_skipped', { step: _step });
    }
  }

  function _onKey(e) {
    if (e.key === 'Escape') skip();
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  STEP RENDERING                                                */
  /* ══════════════════════════════════════════════════════════════ */

  function _showStep(n) {
    _step = n;
    if (!_overlay) return;
    const body = _overlay.querySelector('#wiz-body');
    const actions = _overlay.querySelector('#wiz-actions');
    const progress = _overlay.querySelector('#wiz-progress');

    // Track funnel
    const stepNames = ['describe', 'needs', 'generate', 'deploy'];
    if (typeof AuditLog !== 'undefined') AuditLog.log('wizard_step', { step: n, name: stepNames[n] || n });

    // Progress dots
    progress.innerHTML = Array.from({ length: TOTAL_STEPS }, (_, i) =>
      `<span class="wizard-dot${i === n ? ' active' : ''}${i < n ? ' done' : ''}">${i < n ? '&#10003;' : i + 1}</span>`
    ).join('');

    const renderers = [_renderStep1, _renderStep2, _renderStep3, _renderStep4];
    renderers[n](body, actions);
  }

  /* ── Step 1: What does your business do? ── */
  function _renderStep1(body, actions) {
    body.innerHTML = `
      <h2 class="wizard-title">Welcome to NICE</h2>
      <p class="wizard-subtitle">Tell us about your business and we'll build you a custom AI team in seconds.</p>
      <div class="wizard-field">
        <label for="wiz-biz-desc">What does your business do?</label>
        <input type="text" id="wiz-biz-desc" class="wizard-input" placeholder="e.g., I run a restaurant called Moonwalk" maxlength="200" value="${_esc(_data.businessDesc)}">
        <span class="wizard-hint">A short description is all we need — be as specific as you like.</span>
      </div>
    `;
    actions.innerHTML = `
      <button class="btn btn-sm" id="wiz-skip-1">Skip</button>
      <button class="btn btn-sm btn-primary" id="wiz-next-1">Next</button>
    `;

    const input = body.querySelector('#wiz-biz-desc');
    requestAnimationFrame(() => input.focus());

    actions.querySelector('#wiz-skip-1').addEventListener('click', skip);
    actions.querySelector('#wiz-next-1').addEventListener('click', () => {
      _data.businessDesc = input.value.trim();
      if (!_data.businessDesc) {
        _flash('wiz-biz-desc');
        return;
      }
      _showStep(1);
    });

    // Allow Enter to advance
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        actions.querySelector('#wiz-next-1').click();
      }
    });
  }

  /* ── Step 2: What do you need help with? (checkboxes) ── */
  function _renderStep2(body, actions) {
    body.innerHTML = `
      <h2 class="wizard-title">What do you need help with?</h2>
      <p class="wizard-subtitle">Select everything that applies — we'll tailor your AI crew to match.</p>
      <div class="wizard-goals" id="wiz-needs-grid">
        ${NEEDS.map(n => `
          <label class="wizard-goal${_data.needs.includes(n.id) ? ' selected' : ''}">
            <input type="checkbox" value="${n.id}" ${_data.needs.includes(n.id) ? 'checked' : ''}>
            <span class="wizard-goal-icon"><svg class="icon icon-sm"><use href="${n.icon}"></use></svg></span>
            <span class="wizard-goal-label">${n.label}</span>
          </label>
        `).join('')}
      </div>
    `;

    body.querySelectorAll('.wizard-goal input').forEach(cb => {
      cb.addEventListener('change', () => {
        const val = cb.value;
        if (cb.checked && !_data.needs.includes(val)) _data.needs.push(val);
        else _data.needs = _data.needs.filter(g => g !== val);
        cb.closest('.wizard-goal').classList.toggle('selected', cb.checked);
      });
    });

    actions.innerHTML = `
      <button class="btn btn-sm" id="wiz-back-2">Back</button>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm" id="wiz-skip-2">Skip</button>
        <button class="btn btn-sm btn-primary" id="wiz-next-2">Generate My Team</button>
      </div>
    `;
    actions.querySelector('#wiz-back-2').addEventListener('click', () => _showStep(0));
    actions.querySelector('#wiz-skip-2').addEventListener('click', skip);
    actions.querySelector('#wiz-next-2').addEventListener('click', () => {
      if (_data.needs.length === 0) {
        body.querySelector('#wiz-needs-grid').classList.add('wizard-shake');
        setTimeout(() => body.querySelector('#wiz-needs-grid')?.classList.remove('wizard-shake'), 500);
        return;
      }
      _showStep(2);
    });
  }

  /* ── Step 3: AI generates recommendation + preview ── */
  function _renderStep3(body, actions) {
    body.innerHTML = `
      <h2 class="wizard-title">Building your AI team...</h2>
      <p class="wizard-subtitle">NICE is designing the perfect crew for your business.</p>
      <div class="wizard-loading">
        <div class="wizard-spinner"></div>
        <p id="wiz-loading-text">Analyzing your needs...</p>
      </div>
    `;
    actions.innerHTML = `
      <button class="btn btn-sm" id="wiz-back-3">Cancel</button>
      <span></span>
    `;
    actions.querySelector('#wiz-back-3').addEventListener('click', () => _showStep(1));

    _generateCrew().then(proposal => {
      if (_step !== 2) return; // user navigated away
      _data.proposal = proposal;
      _data.shipName = proposal.spaceship?.name || _data.businessDesc.split(' ').slice(0, 3).join(' ') + ' HQ';
      _renderPreview(body, actions, proposal);
    }).catch(err => {
      if (_step !== 2) return;
      console.warn('[SetupWizard] AI failed, using fallback:', err.message);
      const fallback = _fallbackCrew();
      _data.proposal = fallback;
      _data.shipName = fallback.spaceship?.name || _data.businessDesc.split(' ').slice(0, 3).join(' ') + ' HQ';
      _renderPreview(body, actions, fallback);
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Offline Mode', message: 'Used templates (AI unavailable)', type: 'warning' });
      }
    });
  }

  function _renderPreview(body, actions, proposal) {
    const agents = proposal.agents || [];
    const flowLabel = { sequential: 'Sequential', parallel: 'Parallel', router: 'Router', hierarchical: 'Hierarchical' }[proposal.spaceship?.flow_pattern] || 'Sequential';

    body.innerHTML = `
      <h2 class="wizard-title">Your AI Team</h2>
      <p class="wizard-subtitle">${_esc(proposal.spaceship?.rationale || 'Here is your custom crew, ready to deploy.')}</p>
      <div class="wizard-rec-card">
        <div class="wizard-rec-header">
          <span class="wizard-rec-class">${_esc(_data.shipName)}</span>
          <span class="wizard-rec-flow">${_esc(flowLabel)} Flow</span>
        </div>
        <div class="wizard-rec-section">
          <h4>Crew (${agents.length} agent${agents.length !== 1 ? 's' : ''})</h4>
          ${agents.map(a => `
            <div class="wizard-agent-row">
              <strong>${_esc(a.name)}</strong>
              <span class="wizard-agent-role">${_esc(a.role)}</span>
              ${a.description ? `<span class="wizard-agent-desc">${_esc(a.description)}</span>` : ''}
            </div>
          `).join('')}
        </div>
        ${proposal.integrations_needed?.length ? `
          <div class="wizard-rec-section">
            <h4>Integrations</h4>
            <div class="wizard-integrations">
              ${proposal.integrations_needed.map(i => `<span class="wizard-integration-badge">${_esc(i)}</span>`).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    actions.innerHTML = `
      <button class="btn btn-sm" id="wiz-back-3b">Back</button>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm" id="wiz-skip-3">Skip</button>
        <button class="btn btn-sm btn-primary" id="wiz-deploy">Deploy Team</button>
      </div>
    `;
    actions.querySelector('#wiz-back-3b').addEventListener('click', () => _showStep(1));
    actions.querySelector('#wiz-skip-3').addEventListener('click', skip);
    actions.querySelector('#wiz-deploy').addEventListener('click', () => _showStep(3));
  }

  /* ── Step 4: Deploy + success ── */
  function _renderStep4(body, actions) {
    body.innerHTML = `
      <div class="wizard-launching">
        <div class="wizard-spinner"></div>
        <h2 class="wizard-title">Deploying ${_esc(_data.shipName)}...</h2>
        <p id="wiz-deploy-status">Creating agents...</p>
      </div>
    `;
    actions.innerHTML = '';

    _deployCrew().then(({ shipId, agentCount }) => {
      if (_step !== 3) return;
      _data.shipId = shipId;
      _data.agentCount = agentCount;
      _markDone();
      if (typeof Gamification !== 'undefined') Gamification.unlockAchievement('first-deployment');

      // Build a suggested first mission based on crew
      const crewRoles = ((_data.agents || []).map(a => a.role || a.name)).slice(0, 3).join(', ');
      const firstMissionPrompt = _data.businessDescription
        ? `Give me a brief analysis of ${_data.businessDescription.split(' ').slice(0, 5).join(' ')} trends`
        : 'Introduce yourself and describe what you can help me with';

      body.innerHTML = `
        <div class="wizard-success">
          <div class="wizard-success-icon">
            <svg class="icon" style="width:48px;height:48px"><use href="#icon-check-circle"></use></svg>
          </div>
          <h2 class="wizard-title">Your team is ready!</h2>
          <p class="wizard-subtitle"><strong>${_esc(_data.shipName)}</strong> is live with ${agentCount} agent${agentCount !== 1 ? 's' : ''}.</p>
          ${typeof Gamification !== 'undefined' ? '<p class="wizard-xp">+25 XP earned</p>' : ''}
          <div class="wizard-first-mission" style="margin-top:1.5rem;padding:1rem;background:var(--bg-alt);border:1px solid var(--border);border-radius:8px;text-align:left">
            <p style="font-size:.8rem;color:var(--accent);font-weight:600;margin-bottom:0.5rem">Try your first mission</p>
            <p style="font-size:.78rem;color:var(--text-muted);margin-bottom:0.75rem">Send a message to test your crew${crewRoles ? ' (' + _esc(crewRoles) + ')' : ''}:</p>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="text" id="wiz-first-mission" value="${_esc(firstMissionPrompt)}" style="flex:1;padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:.78rem;font-family:var(--font-b)" />
              <button class="btn btn-sm btn-primary" id="wiz-run-mission" style="white-space:nowrap">Run</button>
            </div>
          </div>
        </div>
      `;
      actions.innerHTML = `
        <button class="btn btn-sm" id="wiz-close-done">Close</button>
        <button class="btn btn-sm btn-primary" id="wiz-view-ship">View Spaceship</button>
      `;
      actions.querySelector('#wiz-close-done').addEventListener('click', close);
      actions.querySelector('#wiz-view-ship').addEventListener('click', () => {
        close();
        location.hash = '#/bridge?tab=schematic';
      });
      document.getElementById('wiz-run-mission')?.addEventListener('click', () => {
        const prompt = document.getElementById('wiz-first-mission')?.value?.trim();
        close();
        // Open prompt panel with the mission text
        if (prompt && typeof PromptPanel !== 'undefined') {
          PromptPanel.show();
          setTimeout(() => {
            const input = document.getElementById('nice-ai-input');
            if (input) { input.value = prompt; input.focus(); input.dispatchEvent(new Event('input', { bubbles: true })); }
          }, 300);
        }
      });
    }).catch(err => {
      if (_step !== 3) return;
      _markDone(); // don't re-show wizard even on error
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
      actions.querySelector('#wiz-retry')?.addEventListener('click', () => _showStep(2));
    });
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  AI GENERATION (via CrewDesigner pattern)                      */
  /* ══════════════════════════════════════════════════════════════ */

  async function _generateCrew() {
    if (typeof SB === 'undefined' || !SB.isReady()) return _fallbackCrew();

    const needLabels = _data.needs.map(id => {
      const n = NEEDS.find(x => x.id === id);
      return n ? n.label : id;
    });

    const systemPrompt = `You are NICE, an AI crew designer. Given what the user's business does and what they need help with, design an optimal spaceship crew.

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
- 2-5 agents based on needs
- flow_pattern: "sequential" when tasks chain; "parallel" when independent; "router" when one triages; "hierarchical" when captain delegates
- Default model: "gemini-2.5-flash" (free)
- Tools from: web-search, code-gen, summarize, gmail, google-drive, google-calendar, calculator, data-transform
- Creative, role-specific agent names relevant to the business
- Test mission should be immediately runnable`;

    const userPrompt = `Business: ${_data.businessDesc}
Needs help with: ${needLabels.join(', ')}`;

    const { data, error } = await SB.functions.invoke('nice-ai', {
      body: {
        messages: [{ role: 'user', content: userPrompt }],
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
      throw new Error('Invalid recommendation structure');
    }
    return rec;
  }

  /* ── Fallback: keyword-based crew ── */
  function _fallbackCrew() {
    const text = (_data.businessDesc + ' ' + _data.needs.join(' ')).toLowerCase();
    const agents = [];

    // Map needs to agents
    if (_data.needs.includes('social')) {
      agents.push({ name: 'Social Strategist', role: 'Marketing', description: 'Creates and schedules social media content', tools: ['web-search', 'summarize'], model: 'gemini-2.5-flash', temperature: 0.6 });
    }
    if (_data.needs.includes('email')) {
      agents.push({ name: 'Email Campaigner', role: 'Marketing', description: 'Drafts email campaigns and newsletters', tools: ['gmail', 'summarize'], model: 'gemini-2.5-flash', temperature: 0.5 });
    }
    if (_data.needs.includes('support')) {
      agents.push({ name: 'Support Agent', role: 'Support', description: 'Handles customer inquiries and drafts responses', tools: ['gmail', 'summarize'], model: 'gemini-2.5-flash', temperature: 0.3 });
    }
    if (_data.needs.includes('analytics')) {
      agents.push({ name: 'Data Analyst', role: 'Analytics', description: 'Tracks metrics and generates insight reports', tools: ['calculator', 'data-transform'], model: 'gemini-2.5-flash', temperature: 0.2 });
    }
    if (_data.needs.includes('content')) {
      agents.push({ name: 'Content Writer', role: 'Content', description: 'Writes blog posts, copy, and marketing materials', tools: ['web-search', 'summarize'], model: 'gemini-2.5-flash', temperature: 0.6 });
    }
    if (_data.needs.includes('ops')) {
      agents.push({ name: 'Ops Manager', role: 'Ops', description: 'Automates scheduling, tasks, and coordination', tools: ['google-calendar', 'summarize'], model: 'gemini-2.5-flash', temperature: 0.2 });
    }

    // Ensure at least one agent
    if (agents.length === 0) {
      agents.push({ name: 'General Assistant', role: 'Ops', description: 'Handles general tasks and coordination', tools: ['web-search', 'summarize'], model: 'gemini-2.5-flash', temperature: 0.3 });
    }

    // Derive integrations
    const integrations = [];
    if (_data.needs.includes('email') || _data.needs.includes('support')) integrations.push('gmail');
    if (_data.needs.includes('ops')) integrations.push('google-calendar');

    // Derive ship name from business description
    const words = _data.businessDesc.split(/\s+/).filter(w => w.length > 2);
    const shipName = words.length >= 2
      ? words.slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') + ' HQ'
      : _data.businessDesc + ' HQ';

    return {
      spaceship: {
        name: shipName,
        description: `AI team for: ${_data.businessDesc}`,
        category: 'Operations',
        flow_pattern: agents.length > 3 ? 'router' : 'sequential',
        rationale: `Custom crew built around your ${_data.needs.length} selected focus areas.`,
      },
      agents,
      integrations_needed: integrations,
      suggested_test_mission: 'Introduce yourself and summarize what each team member can help with',
    };
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  DEPLOY (CrewDesigner-style logic)                             */
  /* ══════════════════════════════════════════════════════════════ */

  async function _deployCrew() {
    const proposal = _data.proposal;
    if (!proposal?.agents?.length) throw new Error('No crew to deploy');

    const agents = proposal.agents;
    const userId = typeof State !== 'undefined' ? State.get('user')?.id : null;
    const hasSB = typeof SB !== 'undefined' && SB.isReady();
    const statusEl = document.getElementById('wiz-deploy-status');
    const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };

    // 1. Create agents
    const createdAgentIds = [];
    for (const a of agents) {
      setStatus(`Creating agent: ${a.name}...`);
      let agentId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      if (userId && hasSB) {
        try {
          const { data: created } = await SB.db('user_agents').create({
            user_id: userId,
            name: a.name,
            role: a.role,
            type: 'Specialist',
            status: 'active',
            config: { role: a.role, tools: a.tools || ['summarize'], description: a.description, model: a.model, temperature: a.temperature, source: 'setup_wizard' },
          });
          if (created?.id) agentId = created.id;
        } catch (err) {
          console.warn('[SetupWizard] Agent create fallback:', a.name, err.message);
        }
      }
      createdAgentIds.push(agentId);
    }

    // 2. Create spaceship
    setStatus('Deploying spaceship...');
    const slotAssignments = {};
    createdAgentIds.forEach((id, i) => { slotAssignments[`slot-${i}`] = id; });

    const shipData = {
      name: _data.shipName,
      category: proposal.spaceship?.category || 'Operations',
      description: proposal.spaceship?.description || '',
      status: 'deployed',
      stats: { crew: String(createdAgentIds.length), slots: String(createdAgentIds.length) },
      config: {
        flow_pattern: proposal.spaceship?.flow_pattern || 'sequential',
        source: 'setup_wizard',
        rationale: proposal.spaceship?.rationale || '',
        integrations_needed: proposal.integrations_needed || [],
        suggested_test_mission: proposal.suggested_test_mission || '',
      },
      slot_assignments: slotAssignments,
      caps: agents.map(a => a.role).filter((v, i, arr) => arr.indexOf(v) === i),
    };

    let shipId = `ship-${Date.now()}`;
    if (userId && hasSB) {
      try {
        const { data: created } = await SB.db('user_spaceships').create({
          user_id: userId,
          name: shipData.name,
          status: 'deployed',
          slots: {
            slot_assignments: slotAssignments,
            agent_ids: createdAgentIds,
            flow_pattern: proposal.spaceship?.flow_pattern || 'sequential',
            category: proposal.spaceship?.category || 'Operations',
            description: proposal.spaceship?.description || '',
            rationale: proposal.spaceship?.rationale || '',
            integrations_needed: proposal.integrations_needed || [],
            suggested_test_mission: proposal.suggested_test_mission || '',
            caps: shipData.caps,
            stats: shipData.stats,
          },
        });
        if (created?.id) shipId = created.id;
      } catch (e) { console.warn('[SetupWizard] Ship create fallback to local:', e); }
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
      } catch (e) { console.warn('[SetupWizard] BlueprintStore activation error:', e); }
    }

    // 4. Update State
    if (typeof State !== 'undefined') {
      const newAgentObjects = agents.map((a, i) => ({
        id: createdAgentIds[i],
        name: a.name, role: a.role, type: 'Specialist', description: a.description,
        llm_engine: a.model, status: 'idle',
        config: { tools: a.tools, temperature: a.temperature, memory: true, source: 'setup_wizard' },
      }));
      const existingAgents = State.get('agents') || [];
      State.set('agents', [...existingAgents, ...newAgentObjects]);

      // Persist custom agents to localStorage
      try {
        const storedAgents = JSON.parse(localStorage.getItem(Utils.KEYS.customAgents) || '[]');
        storedAgents.push(...newAgentObjects);
        localStorage.setItem(Utils.KEYS.customAgents, JSON.stringify(storedAgents));
      } catch {}

      const newShip = { id: shipId, ...shipData };
      const existingShips = State.get('spaceships') || [];
      State.set('spaceships', [...existingShips, newShip]);

      // Persist custom ship to localStorage
      try {
        const stored = JSON.parse(localStorage.getItem(Utils.KEYS.customShips) || '[]');
        stored.push(newShip);
        localStorage.setItem(Utils.KEYS.customShips, JSON.stringify(stored));
      } catch {}
    }

    // 5. XP + Audit
    if (typeof Gamification !== 'undefined') {
      Gamification.addXP('complete_wizard');
      agents.forEach(() => Gamification.addXP('create_agent'));
    }
    if (typeof AuditLog !== 'undefined') {
      AuditLog.log('wizard_complete', {
        shipId,
        shipName: _data.shipName,
        agentCount: createdAgentIds.length,
        needs: _data.needs,
        businessDesc: _data.businessDesc,
      });
    }
    if (typeof Notify !== 'undefined') {
      Notify.send({ title: 'Team Deployed', message: `${_data.shipName} with ${createdAgentIds.length} agents`, type: 'success' });
    }

    return { shipId, agentCount: createdAgentIds.length };
  }

  /* ── Helpers ── */
  function _flash(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('wizard-shake');
    el.focus();
    setTimeout(() => el.classList.remove('wizard-shake'), 500);
  }

  return { open, close, skip, shouldShow };
})();
