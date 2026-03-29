/* ═══════════════════════════════════════════════════════════════════
   NICE — Missions View  (Mission Control redesign)
   Unified card grid with gauge strip, pipeline visualizer,
   animated progress, transition flashes, and batch operations.
═══════════════════════════════════════════════════════════════════ */

const MissionsView = (() => {
  const title = 'Missions';

  const STATUSES   = ['queued','running','completed','failed'];
  const PRIORITIES = ['low','medium','high','critical'];
  const STATUS_META = {
    queued:    { label: 'Queued',    color: '#f59e0b', icon: '◷' },
    running:   { label: 'Running',   color: '#6366f1', icon: 'zap' },
    review:    { label: 'Review',    color: '#a855f7', icon: '◎' },
    completed: { label: 'Completed', color: '#22c55e', icon: 'check' },
    failed:    { label: 'Failed',    color: '#ef4444', icon: 'x' },
  };

  /* ── State ── */
  let _el = null;
  let _channel = null;
  let _filterStatus = '';
  let _prevStatuses = {};   // for transition animations
  let _selected = new Set(); // batch selection

  const _esc = Utils.esc;
  const _timeAgo = Utils.timeAgo;

  function _skeletonRows(n) {
    const r = `<div class="skeleton-list-row"><div class="skeleton-line sk-badge"></div><div style="flex:1"><div class="skeleton-line sk-title"></div></div></div>`;
    return `<div class="skeleton-list">${r.repeat(n || 5)}</div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════════ */
  function render(el) {
    _el = el;
    const user = State.get('user');
    if (!user) return _authPrompt(el, 'missions');

    el.innerHTML = `
      <div class="mc-missions">
        <!-- Toolbar -->
        <div class="view-topbar">
          <div class="view-topbar-l">
            <div class="search-box">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-search"/></svg>
              <input type="text" id="task-search" class="search-input" placeholder="Search missions..." />
            </div>
          </div>
          <button class="btn btn-primary btn-sm" id="btn-new-task">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-plus"/></svg>
            New Mission
          </button>
        </div>

        <!-- Gauge Strip -->
        <div class="mc-gauge-strip" id="mc-gauge-strip"></div>

        <!-- Pipeline -->
        <div class="mc-pipeline" id="mc-pipeline"></div>

        <!-- Mission Feed -->
        <div class="mc-feed" id="mc-feed">${_skeletonRows(6)}</div>

        <!-- Batch Bar -->
        <div class="mc-batch-bar" id="mc-batch-bar" style="display:none"></div>
      </div>

      <!-- New Task Modal -->
      <div class="modal-overlay" id="modal-new-task">
        <div class="modal-box">
          <div class="modal-hdr">
            <h3 class="modal-title">Create Mission</h3>
            <button class="modal-close" id="close-task-modal" aria-label="Close">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-x"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <form id="task-form" class="auth-form">
              <div class="auth-field">
                <label for="t-title">Mission Title</label>
                <input type="text" id="t-title" required placeholder="e.g. Analyze Q4 sales data" />
              </div>
              <div class="auth-field">
                <label for="t-agent">Assign to Agent</label>
                <select id="t-agent" class="filter-select builder-select"><option value="">Unassigned</option></select>
              </div>
              <div class="auth-field">
                <label for="t-priority">Priority</label>
                <select id="t-priority" class="filter-select builder-select">
                  ${PRIORITIES.map(p => `<option value="${p}" ${p === 'medium' ? 'selected' : ''}>${p.charAt(0).toUpperCase() + p.slice(1)}</option>`).join('')}
                </select>
              </div>
              <div class="auth-error" id="task-error"></div>
              <button type="submit" class="auth-submit" id="task-submit-btn">Create Mission</button>
            </form>
          </div>
        </div>
      </div>
    `;

    _loadMissions();
    _bindEvents();
    _subscribeRealtime();
    State.onScoped('missions', _onMissionsChanged);
  }

  /* ═══════════════════════════════════════════════════════════════════
     GAUGE STRIP (SVG ring gauges)
  ═══════════════════════════════════════════════════════════════════ */
  function _renderGauges(missions) {
    const strip = document.getElementById('mc-gauge-strip');
    if (!strip) return;
    const total = missions.length || 1;
    const counts = { queued: 0, running: 0, completed: 0, failed: 0 };
    missions.forEach(m => { if (counts[m.status] !== undefined) counts[m.status]++; });

    const R = 28, C = Math.PI * 2 * R;
    function gauge(status, count) {
      const meta = STATUS_META[status];
      const pct = count / total;
      const offset = C - (C * pct);
      const isRunning = status === 'running' && count > 0;
      return `
        <div class="mc-gauge ${isRunning ? 'mc-gauge-live' : ''}" data-status="${status}">
          <svg viewBox="0 0 70 70" class="mc-gauge-svg">
            <circle cx="35" cy="35" r="${R}" fill="none" stroke="var(--border)" stroke-width="4"/>
            <circle cx="35" cy="35" r="${R}" fill="none" stroke="${meta.color}" stroke-width="4"
              stroke-dasharray="${C}" stroke-dashoffset="${offset}" stroke-linecap="round"
              transform="rotate(-90 35 35)" style="transition:stroke-dashoffset .6s ease"/>
          </svg>
          <div class="mc-gauge-inner">
            <span class="mc-gauge-num" style="color:${meta.color}">${count}</span>
          </div>
          <span class="mc-gauge-label">${meta.label}</span>
        </div>`;
    }

    const liveHTML = counts.running > 0
      ? '<div class="mc-live-badge"><span class="mc-live-dot"></span> LIVE</div>'
      : '';

    strip.innerHTML = `
      <div class="mc-gauges">${STATUSES.map(s => gauge(s, counts[s])).join('')}</div>
      ${liveHTML}
    `;
  }

  /* ═══════════════════════════════════════════════════════════════════
     PIPELINE VISUALIZER
  ═══════════════════════════════════════════════════════════════════ */
  function _renderPipeline(missions) {
    const pipe = document.getElementById('mc-pipeline');
    if (!pipe) return;
    const counts = { queued: 0, running: 0, completed: 0, failed: 0 };
    missions.forEach(m => { if (counts[m.status] !== undefined) counts[m.status]++; });

    const nodes = ['queued', 'running', 'completed', 'failed'];
    const nodesHTML = nodes.map((s, i) => {
      const meta = STATUS_META[s];
      const active = _filterStatus === s ? 'mc-pipe-active' : '';
      const isRunning = s === 'running' && counts.running > 0;
      return `
        ${i > 0 ? '<div class="mc-pipe-line"><div class="mc-pipe-flow"></div></div>' : ''}
        <button class="mc-pipe-node ${active} ${isRunning ? 'mc-pipe-running' : ''}" data-status="${s}" style="--pipe-color:${meta.color}">
          <span class="mc-pipe-icon">${meta.icon}</span>
          <span class="mc-pipe-count">${counts[s]}</span>
          <span class="mc-pipe-label">${meta.label}</span>
        </button>`;
    }).join('');

    pipe.innerHTML = `<div class="mc-pipe-row">${nodesHTML}</div>`;

    // Pipeline filter clicks
    pipe.querySelectorAll('.mc-pipe-node').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = btn.dataset.status;
        _filterStatus = (_filterStatus === s) ? '' : s;
        _applyFilters();
        _renderPipeline(State.get('missions') || []);
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     MISSION FEED (unified card grid)
  ═══════════════════════════════════════════════════════════════════ */
  function _renderFeed(missions) {
    const feed = document.getElementById('mc-feed');
    if (!feed) return;

    if (!missions || !missions.length) {
      feed.innerHTML = `
        <div class="app-empty">
          <svg class="app-empty-icon" fill="none" stroke="currentColor" stroke-width="1.2"><use href="#icon-task"/></svg>
          <h2>No Missions Yet</h2>
          <p>Create a mission and assign it to an agent.</p>
          <div class="app-empty-acts">
            <button class="btn btn-primary btn-sm" onclick="document.getElementById('modal-new-task').classList.add('open')">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-plus"/></svg> Create Mission
            </button>
          </div>
        </div>`;
      return;
    }

    const agentMap = _buildAgentMap();

    // Sort: running first, then queued, then completed/failed by date
    const order = { running: 0, queued: 1, failed: 2, completed: 3 };
    const sorted = [...missions].sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4) || new Date(b.created_at) - new Date(a.created_at));

    // Run All button for queued missions
    const queuedCount = missions.filter(m => m.status === 'queued' && m.agent_id).length;
    const runAllHTML = queuedCount > 1 ? `<button class="btn btn-primary btn-sm" id="run-all-btn" style="margin-bottom:12px">⚡ Run All (${queuedCount})</button>` : '';

    feed.innerHTML = `${runAllHTML}<div class="mc-card-grid">${sorted.map(m => _renderCard(m, agentMap)).join('')}</div>`;

    // Detect transitions and animate
    _detectTransitions(missions);

    // Card clicks
    feed.querySelectorAll('.mc-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.mc-card-check') || e.target.closest('.task-run-btn') || e.target.closest('.task-retry-btn')) return;
        Router.navigate('#/missions/' + card.dataset.id);
      });
    });

    // Run/Retry
    feed.addEventListener('click', async (e) => {
      const runBtn = e.target.closest('.task-run-btn');
      const retryBtn = e.target.closest('.task-retry-btn');
      const btn = runBtn || retryBtn;
      if (!btn || typeof MissionRunner === 'undefined') return;
      const missionId = btn.dataset.id;
      btn.disabled = true; btn.textContent = '...';
      if (retryBtn) { try { await SB.db('tasks').update(missionId, { status: 'queued', progress: 0, result: null }); } catch {} }
      await MissionRunner.run(missionId);
      _loadMissions();
    });

    // Run All button
    const runAllBtn = document.getElementById('run-all-btn');
    if (runAllBtn) {
      runAllBtn.addEventListener('click', async () => {
        runAllBtn.disabled = true; runAllBtn.textContent = 'Running...';
        const queued = missions.filter(m => m.status === 'queued' && m.agent_id);
        for (const m of queued) {
          try { await MissionRunner.run(m.id); } catch (err) { console.error('[Missions] Run All failed for', m.id, err); }
        }
        _loadMissions();
      });
    }

    // Batch checkboxes
    feed.querySelectorAll('.mc-card-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.id;
        cb.checked ? _selected.add(id) : _selected.delete(id);
        _renderBatchBar();
      });
    });
  }

  function _renderCard(m, agentMap) {
    const agent = agentMap[m.agent_id];
    const agentName = agent?.name || m.agent_name || 'Unassigned';
    const initials = agentName.slice(0, 2).toUpperCase();
    const meta = STATUS_META[m.status] || STATUS_META.queued;
    const progress = m.progress || 0;
    const isRunning = m.status === 'running';
    const ageClass = _missionAgeClass(m.created_at);
    const checked = _selected.has(m.id) ? 'checked' : '';
    const eta = isRunning ? _estimateETA(m) : '';

    let actionsHTML = '';
    if (m.status === 'queued' && (m.agent_id || m.agent_name)) {
      actionsHTML = `<button class="btn btn-primary btn-xs task-run-btn" data-id="${m.id}">⚡ Run</button>`;
    } else if (m.status === 'failed' && (m.agent_id || m.agent_name)) {
      actionsHTML = `<button class="btn btn-xs task-retry-btn" data-id="${m.id}">↻ Retry</button>`;
    }

    return `
      <div class="mc-card ${ageClass} ${isRunning ? 'mc-card-running' : ''} mc-card-${m.status}" data-id="${m.id}" data-status="${m.status}">
        <div class="mc-card-top">
          <input type="checkbox" class="mc-card-check" data-id="${m.id}" ${checked} />
          <span class="mc-card-status" style="color:${meta.color}">${meta.icon}</span>
          <span class="mc-card-pri priority-${m.priority}">${m.priority}</span>
        </div>
        <div class="mc-card-title">${_esc(m.title)}</div>
        <div class="mc-card-agent">
          <span class="mc-card-avatar" style="background:${_agentColor(agent?.role)}">${initials}</span>
          <span>${_esc(agentName)}</span>
        </div>
        ${isRunning ? `
          <div class="mc-progress">
            <div class="mc-progress-track">
              <div class="mc-progress-bar" style="width:${progress}%">
                <div class="mc-progress-shimmer"></div>
              </div>
            </div>
            <span class="mc-progress-pct">${progress}%</span>
          </div>
          ${eta ? `<div class="mc-eta">${eta}</div>` : ''}
        ` : ''}
        <div class="mc-card-footer">
          <span class="mc-card-time">${_timeAgo(m.created_at)}</span>
          ${m.status === 'completed' && m.metadata?.model ? `<span class="mc-model-badge">${_esc(_shortModel(m.metadata.model))}</span>` : ''}
          ${actionsHTML}
        </div>
      </div>`;
  }

  /* Build a combined agent map from user_agents + blueprints */
  function _buildAgentMap() {
    const map = {};
    const agents = State.get('agents') || [];
    agents.forEach(a => { map[a.id] = a; });
    // Also index blueprints by ID so mission agent_id (which is a blueprint ID) resolves
    const blueprints = State.get('blueprints') || [];
    blueprints.forEach(bp => {
      if (!map[bp.id]) map[bp.id] = { id: bp.id, name: bp.name, role: bp.role || bp.category, llm_engine: bp.llm_engine || 'gemini-2.5-flash' };
    });
    return map;
  }

  function _agentColor(role) {
    const colors = { Research:'#6366f1', Code:'#06b6d4', Data:'#f59e0b', Content:'#ec4899', Ops:'#22c55e', Custom:'#8b5cf6',
                     Analytics:'#f59e0b', Engineering:'#06b6d4', Sales:'#22c55e', Support:'#a855f7', Legal:'#64748b', Communications:'#3b82f6' };
    return colors[role] || 'var(--accent)';
  }

  function _shortModel(modelId) {
    const shorts = {
      'gemini-2.5-flash': 'Gemini Flash', 'gemini-2.0-lite': 'Gemini Lite', 'gemini-2.5-pro': 'Gemini Pro',
      'claude-sonnet-4-6': 'Claude Sonnet', 'claude-opus-4': 'Claude Opus',
      'gpt-5.2': 'GPT-5.2', 'gpt-5-mini': 'GPT-5 Mini',
      'mistral-large-3': 'Mistral Large', 'deepseek-v3': 'DeepSeek V3', 'grok-4': 'Grok 4',
    };
    return shorts[modelId] || modelId;
  }

  function _missionAgeClass(createdAt) {
    if (!createdAt) return 'mc-age-fresh';
    const days = (Date.now() - new Date(createdAt).getTime()) / 86400000;
    if (days < 1) return 'mc-age-fresh';
    if (days < 3) return 'mc-age-stale';
    return 'mc-age-overdue';
  }

  function _estimateETA(m) {
    if (!m.created_at || !m.progress || m.progress <= 0) return '';
    const elapsed = Date.now() - new Date(m.created_at).getTime();
    const rate = m.progress / elapsed; // %/ms
    if (rate <= 0) return '';
    const remaining = (100 - m.progress) / rate;
    if (remaining < 60000) return '~' + Math.round(remaining / 1000) + 's remaining';
    if (remaining < 3600000) return '~' + Math.round(remaining / 60000) + 'm remaining';
    return '~' + Math.round(remaining / 3600000) + 'h remaining';
  }

  /* ═══════════════════════════════════════════════════════════════════
     TRANSITION ANIMATIONS
  ═══════════════════════════════════════════════════════════════════ */
  function _detectTransitions(missions) {
    missions.forEach(m => {
      const prev = _prevStatuses[m.id];
      if (prev && prev !== m.status) {
        const card = document.querySelector(`.mc-card[data-id="${m.id}"]`);
        if (!card) return;
        if (m.status === 'completed') {
          card.classList.add('mc-flash-complete');
          setTimeout(() => card.classList.remove('mc-flash-complete'), 3000);
        } else if (m.status === 'failed') {
          card.classList.add('mc-flash-fail');
          setTimeout(() => card.classList.remove('mc-flash-fail'), 1500);
        }
      }
      _prevStatuses[m.id] = m.status;
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     BATCH OPERATIONS
  ═══════════════════════════════════════════════════════════════════ */
  function _renderBatchBar() {
    const bar = document.getElementById('mc-batch-bar');
    if (!bar) return;
    if (_selected.size === 0) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    bar.innerHTML = `
      <span class="mc-batch-count">${_selected.size} selected</span>
      <button class="btn btn-xs mc-batch-act" data-action="completed">✓ Complete</button>
      <button class="btn btn-xs mc-batch-act" data-action="failed">✕ Fail</button>
      <button class="btn btn-xs mc-batch-act" data-action="queued">↩ Re-queue</button>
      <button class="btn btn-xs mc-batch-clear">Clear</button>
    `;
    bar.querySelectorAll('.mc-batch-act').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        _selected.forEach(id => _updateMissionStatus(id, action));
        _selected.clear();
        _renderBatchBar();
      });
    });
    bar.querySelector('.mc-batch-clear')?.addEventListener('click', () => {
      _selected.clear();
      _renderBatchBar();
      _applyFilters();
    });
  }

  function _updateMissionStatus(missionId, newStatus) {
    const missions = State.get('missions') || [];
    const mission = missions.find(m => m.id === missionId);
    if (!mission || mission.status === newStatus) return;
    const oldStatus = mission.status;
    mission.status = newStatus;
    if (newStatus === 'completed') {
      mission.completed_at = new Date().toISOString();
      if (typeof Gamification !== 'undefined') Gamification.addMissionXP(mission);
    }
    State.set('missions', missions);
    if (typeof AuditLog !== 'undefined') {
      AuditLog.log('mission', { description: `Mission "${mission.title}" ${oldStatus} → ${newStatus}`, missionId, oldStatus, newStatus });
    }
    if (typeof SB !== 'undefined') SB.db('tasks').update(missionId, { status: newStatus }).catch(() => {});
  }

  /* ═══════════════════════════════════════════════════════════════════
     DATA LOADING / EVENTS
  ═══════════════════════════════════════════════════════════════════ */
  function _onMissionsChanged(missions) {
    _renderGauges(missions);
    _renderPipeline(missions);
    _applyFilters();
  }

  async function _loadMissions() {
    let missions = [];
    const user = State.get('user');
    let dbError = false;
    if (user) {
      try { missions = await SB.db('tasks').list({ userId: user.id, orderBy: 'created_at' }); }
      catch (err) { dbError = true; console.warn('Supabase tasks unavailable:', err.message); }
    }
    if (!user || (dbError && !missions.length)) missions = _seedMissions();
    // Snapshot statuses for transition detection
    missions.forEach(m => { if (!_prevStatuses[m.id]) _prevStatuses[m.id] = m.status; });
    // State.set triggers _onMissionsChanged which renders gauges/pipeline/feed
    State.set('missions', missions);
  }

  function _seedMissions() {
    const now = Date.now();
    return [
      { id:'st1', title:'Scrape competitor pricing', agent_id:'sa1', agent_name:'ResearchBot', status:'completed', priority:'high', progress:100, created_at:new Date(now - 86400000).toISOString(), completed_at:new Date(now - 82800000).toISOString() },
      { id:'st2', title:'Review PR #142', agent_id:'sa2', agent_name:'CodePilot', status:'running', priority:'medium', progress:45, created_at:new Date(now - 7200000).toISOString() },
      { id:'st3', title:'Generate weekly report', agent_id:'sa3', agent_name:'DataCrunch', status:'queued', priority:'low', progress:0, created_at:new Date(now - 3600000).toISOString() },
      { id:'st4', title:'Write blog post draft', agent_id:'sa4', agent_name:'ContentWriter', status:'completed', priority:'medium', progress:100, created_at:new Date(now - 172800000).toISOString(), completed_at:new Date(now - 162000000).toISOString() },
      { id:'st5', title:'Deploy staging environment', agent_id:'sa5', agent_name:'OpsMonitor', status:'failed', priority:'high', progress:60, created_at:new Date(now - 43200000).toISOString() },
      { id:'st6', title:'Analyze user feedback', agent_id:'sa1', agent_name:'ResearchBot', status:'running', priority:'medium', progress:72, created_at:new Date(now - 1800000).toISOString() },
      { id:'st7', title:'Fix auth redirect bug', agent_id:'sa6', agent_name:'BugHunter', status:'failed', priority:'high', progress:30, created_at:new Date(now - 259200000).toISOString() },
      { id:'st8', title:'Update API documentation', agent_id:'sa4', agent_name:'ContentWriter', status:'completed', priority:'low', progress:100, created_at:new Date(now - 345600000).toISOString(), completed_at:new Date(now - 340000000).toISOString() },
    ];
  }

  function _applyFilters() {
    const q = (document.getElementById('task-search')?.value || '').toLowerCase();
    let missions = State.get('missions') || [];
    if (q) missions = missions.filter(t => t.title.toLowerCase().includes(q));
    if (_filterStatus) missions = missions.filter(t => t.status === _filterStatus);
    _renderFeed(missions);
  }

  function _bindEvents() {
    document.getElementById('btn-new-task')?.addEventListener('click', _openNewMission);
    document.getElementById('close-task-modal')?.addEventListener('click', () => {
      document.getElementById('modal-new-task')?.classList.remove('open');
    });
    document.getElementById('modal-new-task')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-new-task') e.target.classList.remove('open');
    });
    document.getElementById('task-form')?.addEventListener('submit', _createMission);
    document.getElementById('task-search')?.addEventListener('input', _applyFilters);
  }

  async function _openNewMission() {
    const select = document.getElementById('t-agent');
    if (select) {
      let agents = State.get('agents') || [];
      if (!agents.length && typeof BlueprintStore !== 'undefined' && BlueprintStore.getActivatedAgents) {
        agents = BlueprintStore.getActivatedAgents().map(a => ({ id: a.id, name: a.name, status: 'active' }));
      }
      if (!agents.length && typeof BlueprintStore !== 'undefined') {
        await BlueprintStore.ensureCatalogLoaded();
        agents = BlueprintStore.listAgents().map(a => ({ id: a.id, name: a.name, status: a.rarity || 'available' }));
      }
      select.innerHTML = '<option value="">Unassigned</option>' +
        agents.map(a => `<option value="${a.id}">${_esc(a.name)}${a.status ? ' (' + a.status + ')' : ''}</option>`).join('');
    }
    document.getElementById('modal-new-task')?.classList.add('open');
  }

  async function _createMission(e) {
    e.preventDefault();
    const errEl = document.getElementById('task-error');
    const btn = document.getElementById('task-submit-btn');
    errEl.textContent = ''; btn.disabled = true; btn.textContent = 'Creating...';

    const user = State.get('user');
    const mTitle = document.getElementById('t-title').value.trim();
    const agentVal = document.getElementById('t-agent').value || null;
    const priority = document.getElementById('t-priority').value;

    if (!mTitle) { errEl.textContent = 'Mission title is required.'; btn.disabled = false; btn.textContent = 'Create Mission'; return; }

    const isUUID = agentVal && /^[0-9a-f]{8}-/i.test(agentVal);
    const agentId = isUUID ? agentVal : null;
    const agentSelect = document.getElementById('t-agent');
    const agentName = agentSelect?.selectedOptions[0]?.textContent?.replace(/\s*\(.*\)$/, '') || null;

    try {
      const isReal = user?.id && /^[0-9a-f]{8}-/i.test(user.id);
      let created = null;
      if (isReal) {
        created = await SB.db('tasks').create({ user_id: user.id, agent_id: agentId, agent_name: agentName, title: mTitle, status: 'queued', priority, progress: 0, result: null });
      }
      const local = created || { id: 'mission-' + Date.now(), title: mTitle, agent_id: agentId, agent_name: agentName, status: 'queued', priority, progress: 0, created_at: new Date().toISOString() };
      const missions = State.get('missions') || [];
      missions.unshift(local);
      State.set('missions', missions);
      document.getElementById('modal-new-task')?.classList.remove('open');
      document.getElementById('task-form')?.reset();
      if (agentVal && created?.id && typeof MissionRunner !== 'undefined') MissionRunner.run(created.id);
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Mission Created', message: mTitle, type: 'system' });
    } catch (err) { errEl.textContent = err.message || 'Failed to create mission.'; }
    finally { btn.disabled = false; btn.textContent = 'Create Mission'; }
  }

  function _subscribeRealtime() { _channel = SB.realtime.subscribe('tasks', () => _loadMissions()); }

  function destroy() {
    if (_channel) { SB.realtime.unsubscribe(_channel); _channel = null; }
    // State.onScoped subscriptions are auto-cleaned by Router
    _selected.clear();
    _prevStatuses = {};
  }

  return { title, render, destroy };
})();

/* ── Mission Detail View ── */
const MissionDetailView = (() => {
  const title = 'Mission Detail';
  const _esc = typeof Utils !== 'undefined' ? Utils.esc : (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let _detailChannel = null;

  function render(el, params) {
    const user = State.get('user');
    if (!user) return _authPrompt(el, 'mission details');
    el.innerHTML = `<div class="loading-state"><p>Loading mission...</p></div>`;
    _loadMission(el, params.id);
  }

  async function _loadMission(el, id) {
    try {
      let mission;
      try {
        mission = await SB.db('tasks').get(id);
      } catch(e) {
        mission = (State.get('missions') || []).find(m => m.id === id);
      }
      if (!mission) throw new Error('Mission not found');

      // Resolve agent
      // Look up agent from user_agents, then blueprints, then use stored name
      const agents = State.get('agents') || [];
      const blueprints = State.get('blueprints') || [];
      let agent = agents.find(a => a.id === mission.agent_id);
      if (!agent) agent = blueprints.find(bp => bp.id === mission.agent_id);
      if (!agent && mission.agent_name) agent = { name: mission.agent_name, role: _inferRole(mission.agent_name) };
      const agentName = agent ? agent.name : (mission.agent_name || 'Unassigned');
      const agentInitials = agentName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

      // Status styling
      const dotClass = mission.status === 'completed' ? 'dot-g' : mission.status === 'review' ? 'dot-p' : mission.status === 'running' ? 'dot-g dot-pulse' : mission.status === 'failed' ? 'dot-r' : 'dot-a';
      const progress = mission.progress || 0;
      const metadata = mission.metadata || {};

      // Duration calc
      let duration = '';
      if (mission.completed_at || metadata.completed_at) {
        const start = new Date(mission.created_at).getTime();
        const end = new Date(mission.completed_at || metadata.completed_at).getTime();
        const diffMs = end - start;
        if (diffMs < 60000) duration = Math.round(diffMs / 1000) + 's';
        else if (diffMs < 3600000) duration = Math.round(diffMs / 60000) + 'm';
        else duration = Math.round(diffMs / 3600000) + 'h ' + Math.round((diffMs % 3600000) / 60000) + 'm';
      }

      // Load ship log entries for this mission
      let logEntries = [];
      try {
        const shipId = 'mission-' + id;
        logEntries = await SB.db('ship_log').list({ spaceshipId: shipId, orderBy: 'created_at', limit: 20 });
      } catch { /* ignore */ }

      el.innerHTML = `
        <div class="detail-wrap">
          <div class="detail-back">
            <a href="#/missions" class="btn btn-sm">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-arrow-left"/></svg>
              Back to Missions
            </a>
            ${mission.status === 'queued' && (mission.agent_id || mission.agent_name) ? `
              <button class="btn btn-sm btn-primary" id="md-run" data-id="${id}">Run Mission</button>
            ` : ''}
            ${mission.status === 'review' ? `
              <button class="btn btn-sm btn-primary" id="md-approve" data-id="${id}" style="background:#22c55e;border-color:#22c55e">✓ Approve</button>
              <button class="btn btn-sm" id="md-reject" data-id="${id}" style="color:#f87171">✕ Reject</button>
            ` : ''}
            ${mission.status === 'failed' && (mission.agent_id || mission.agent_name) ? `
              <button class="btn btn-sm btn-primary" id="md-retry" data-id="${id}">Retry Mission</button>
            ` : ''}
            ${mission.status === 'completed' ? `
              <button class="btn btn-sm" id="md-share-report" data-id="${id}">Share Report</button>
            ` : ''}
          </div>

          <div class="detail-header">
            <svg class="detail-header-icon-lg" fill="none" stroke="currentColor" stroke-width="1.2"><use href="#icon-task"/></svg>
            <div class="detail-header-info">
              <h2 class="detail-name">${_esc(mission.title)}</h2>
              <div class="detail-meta-row">
                <span class="status-dot ${dotClass}"></span>
                <span class="detail-status">${_esc(mission.status)}</span>
                <span class="task-priority-tag priority-${mission.priority}">${_esc(mission.priority)}</span>
                ${duration ? `<span class="agent-tag">Duration: ${duration}</span>` : ''}
              </div>
            </div>
          </div>

          ${mission.status === 'running' ? `
            <div class="detail-section">
              <h3 class="detail-section-title">Progress</h3>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <span class="mission-running-pulse"></span>
                <span style="font-size:.78rem;color:#6366f1;font-weight:500">Mission in progress...</span>
              </div>
              <div class="task-progress" style="height:8px;border-radius:4px">
                <div class="task-progress-bar" style="width:${progress}%;transition:width .3s"></div>
              </div>
              <div style="text-align:right;font-size:.68rem;color:var(--text-muted);margin-top:4px">${progress}%</div>
            </div>
          ` : ''}

          <div class="detail-grid">
            <div class="detail-section">
              <h3 class="detail-section-title">Details</h3>
              <div class="detail-kv">
                <div class="detail-kv-row"><span class="kv-label">Status</span><span class="kv-val"><span class="task-status-badge badge-${mission.status}">${mission.status}</span></span></div>
                <div class="detail-kv-row"><span class="kv-label">Priority</span><span class="kv-val">${_esc(mission.priority)}</span></div>
                <div class="detail-kv-row"><span class="kv-label">Created</span><span class="kv-val">${new Date(mission.created_at).toLocaleString()}</span></div>
                ${mission.completed_at || metadata.completed_at ? `<div class="detail-kv-row"><span class="kv-label">Completed</span><span class="kv-val">${new Date(mission.completed_at || metadata.completed_at).toLocaleString()}</span></div>` : ''}
                ${duration ? `<div class="detail-kv-row"><span class="kv-label">Duration</span><span class="kv-val">${duration}</span></div>` : ''}
              </div>
            </div>

            <div class="detail-section">
              <h3 class="detail-section-title">Assigned Agent</h3>
              ${agent ? `
                <div style="display:flex;align-items:center;gap:10px;cursor:pointer" onclick="Router.navigate('#/bridge/agents/${_esc(agent.id)}')">
                  <div class="agent-avatar" style="background:${_agentColor(agent.role)}">${_esc(agentInitials)}</div>
                  <div>
                    <div style="font-weight:600;font-size:.82rem">${_esc(agent.name)}</div>
                    <div style="font-size:.68rem;color:var(--text-muted)">${_esc(agent.role || 'Agent')} &middot; ${_esc(agent.llm_engine || 'claude-4')}</div>
                  </div>
                </div>
              ` : '<p class="text-muted" style="font-size:.78rem">No agent assigned</p>'}
            </div>
          </div>

          ${mission.result ? `
            <div class="detail-section">
              <h3 class="detail-section-title">Result</h3>
              <div class="mission-result-content mission-md" id="mission-result-body">
                ${_renderMarkdown(mission.edited_content || mission.result)}
              </div>
              <div class="outbox-card-actions" style="padding:12px 0 0; border-top:1px solid var(--border,#333); margin-top:12px;" data-id="${_esc(mission.id)}">
                ${mission.approval_status === 'approved' ? '<span class="outbox-status-badge approved" style="margin-right:8px">✓ Approved</span>' : ''}
                ${mission.approval_status === 'rejected' ? '<span class="outbox-status-badge rejected" style="margin-right:8px">✕ Rejected</span>' : ''}
                ${!mission.approval_status || mission.approval_status === 'draft' ? `<button class="btn outbox-approve-btn" data-action="approve" data-mid="${_esc(mission.id)}">✓ Approve</button>` : ''}
                <button class="btn outbox-edit-btn" data-action="edit" data-mid="${_esc(mission.id)}">✎ Edit</button>
                ${!mission.approval_status || mission.approval_status === 'draft' ? `<button class="btn outbox-reject-btn" data-action="reject" data-mid="${_esc(mission.id)}">✕ Reject</button>` : ''}
                <button class="btn outbox-copy-btn" data-action="copy" data-mid="${_esc(mission.id)}">📋 Copy</button>
              </div>
            </div>
          ` : ''}

          ${metadata.tokens_used || metadata.model ? `
            <div class="detail-section">
              <h3 class="detail-section-title">Execution Metadata</h3>
              <div class="detail-kv">
                ${metadata.model ? `<div class="detail-kv-row"><span class="kv-label">Model</span><span class="kv-val mono">${_esc(metadata.model)}</span></div>` : ''}
                ${metadata.tokens_used ? `<div class="detail-kv-row"><span class="kv-label">Tokens Used</span><span class="kv-val">${metadata.tokens_used.toLocaleString()}</span></div>` : ''}
                ${metadata.fuel_cost ? `<div class="detail-kv-row"><span class="kv-label">Fuel Cost</span><span class="kv-val">${metadata.fuel_cost}</span></div>` : ''}
                ${metadata.temperature ? `<div class="detail-kv-row"><span class="kv-label">Temperature</span><span class="kv-val">${metadata.temperature}</span></div>` : ''}
              </div>
            </div>
          ` : ''}

          ${logEntries.length ? `
            <div class="detail-section">
              <h3 class="detail-section-title">Execution Log</h3>
              <div class="task-mini-list">
                ${logEntries.map(entry => `
                  <div class="task-mini-row">
                    <span class="task-status-badge badge-${entry.role === 'assistant' ? 'completed' : 'queued'}">${entry.role}</span>
                    <span class="task-mini-title">${_esc((entry.content || '').slice(0, 100))}</span>
                    <span class="task-mini-time">${_timeAgo(entry.created_at)}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      `;

      _bindDetailEvents(el, id, mission);

      _detailChannel = SB.realtime.subscribe('tasks', (payload) => {
        if (payload.new?.id === id || payload.old?.id === id) _loadMission(el, id);
      });
    } catch (err) {
      el.innerHTML = `
        <div class="app-empty">
          <h2>Mission Not Found</h2>
          <p>${_esc(err.message)}</p>
          <div class="app-empty-acts"><a href="#/missions" class="btn btn-sm">Back to Missions</a></div>
        </div>
      `;
    }
  }

  function _bindDetailEvents(el, id, mission) {
    // Run button
    document.getElementById('md-run')?.addEventListener('click', async () => {
      const btn = document.getElementById('md-run');
      if (btn) { btn.disabled = true; btn.textContent = 'Running...'; }
      if (typeof MissionRunner !== 'undefined') await MissionRunner.run(id);
      _loadMission(el, id);
    });

    // Retry button
    document.getElementById('md-retry')?.addEventListener('click', async () => {
      const btn = document.getElementById('md-retry');
      if (btn) { btn.disabled = true; btn.textContent = 'Retrying...'; }
      try { await SB.db('tasks').update(id, { status: 'queued', progress: 0, result: null }); } catch {}
      if (typeof MissionRunner !== 'undefined') await MissionRunner.run(id);
      _loadMission(el, id);
    });

    // Share Report button
    document.getElementById('md-share-report')?.addEventListener('click', () => {
      const shareHash = '#/share/report-' + id;
      const url = window.location.origin + '/app/' + shareHash;
      navigator.clipboard.writeText(url).then(() => {
        if (typeof Notify !== 'undefined') {
          Notify.send({ title: 'Report Link Copied', message: 'Shareable mission report URL copied to clipboard.', type: 'system' });
        }
      }).catch(() => {});
    });

    // Approve mission (review → completed)
    document.getElementById('md-approve')?.addEventListener('click', async () => {
      const now = new Date().toISOString();
      try {
        if (typeof SB !== 'undefined' && SB.client) {
          await SB.client.from('tasks').update({ status: 'completed', approval_status: 'approved', reviewed_at: now }).eq('id', id);
        }
      } catch {}
      // Award user XP on approval
      if (typeof Gamification !== 'undefined') {
        Gamification.addXP('complete_mission');
        Gamification.addXP('approve_content');
      }
      // Award per-agent XP (agent levels up)
      if (typeof MissionRunner !== 'undefined' && MissionRunner.awardAgentXP) {
        const agentId = mission.agent_id;
        const agentName = mission.agent_name;
        // Find agent ID from name if not set
        let resolvedId = agentId;
        if (!resolvedId && agentName) {
          const agents = (typeof State !== 'undefined' ? State.get('agents') : null) || [];
          const found = agents.find(a => a.name === agentName);
          if (found) resolvedId = found.id;
        }
        if (resolvedId) MissionRunner.awardAgentXP(resolvedId, 50);
      }
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Mission Approved', message: 'Content approved and mission completed!', type: 'success' });
      _loadMission(el, id);
    });

    // Reject mission (review → failed)
    document.getElementById('md-reject')?.addEventListener('click', async () => {
      const now = new Date().toISOString();
      try {
        if (typeof SB !== 'undefined' && SB.client) {
          await SB.client.from('tasks').update({ status: 'failed', approval_status: 'rejected', reviewed_at: now }).eq('id', id);
        }
      } catch {}
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Mission Rejected', message: 'Content rejected. You can retry the mission.', type: 'system' });
      _loadMission(el, id);
    });

    // Content actions (approve/edit/reject/copy)
    el.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        const mid = btn.dataset.mid;
        if (!mid) return;

        if (action === 'approve' && typeof ContentQueue !== 'undefined') {
          await ContentQueue.approve(mid);
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Approved', message: 'Content approved', type: 'success' });
          _loadMission(el, id);
        }
        if (action === 'reject' && typeof ContentQueue !== 'undefined') {
          await ContentQueue.reject(mid);
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Rejected', message: 'Content rejected', type: 'system' });
          _loadMission(el, id);
        }
        if (action === 'copy') {
          const content = mission.edited_content || mission.result || '';
          try {
            await navigator.clipboard.writeText(content);
            if (typeof Notify !== 'undefined') Notify.send({ title: 'Copied', message: 'Content copied to clipboard', type: 'success' });
          } catch {
            const ta = document.createElement('textarea');
            ta.value = content; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
          }
        }
        if (action === 'edit') {
          const body = document.getElementById('mission-result-body');
          if (!body) return;
          const content = mission.edited_content || mission.result || '';
          body.innerHTML = `
            <textarea class="outbox-edit-area" id="mission-edit-ta" style="min-height:200px">${_esc(content)}</textarea>
            <div class="outbox-edit-actions" style="margin-top:8px">
              <button class="btn outbox-save-btn" id="mission-edit-save">Save</button>
              <button class="btn" id="mission-edit-cancel">Cancel</button>
            </div>
          `;
          document.getElementById('mission-edit-save')?.addEventListener('click', async () => {
            const newContent = document.getElementById('mission-edit-ta')?.value;
            if (newContent != null) {
              if (typeof ContentQueue !== 'undefined') await ContentQueue.edit(mid, newContent);
              else if (typeof SB !== 'undefined' && SB.client) {
                await SB.client.from('tasks').update({ edited_content: newContent }).eq('id', mid);
              }
              mission.edited_content = newContent;
              if (typeof Notify !== 'undefined') Notify.send({ title: 'Saved', message: 'Content updated', type: 'success' });
            }
            _loadMission(el, id);
          });
          document.getElementById('mission-edit-cancel')?.addEventListener('click', () => _loadMission(el, id));
        }
      });
    });
  }

  function _agentColor(role) {
    const colors = { Research:'#6366f1', Code:'#06b6d4', Data:'#f59e0b', Content:'#ec4899', Ops:'#22c55e', Custom:'#8b5cf6',
                     Analytics:'#f59e0b', Engineering:'#06b6d4', Sales:'#22c55e', Support:'#a855f7', Legal:'#64748b', Communications:'#3b82f6' };
    return colors[role] || 'var(--accent)';
  }

  function _inferRole(name) {
    const n = (name || '').toLowerCase();
    if (n.includes('research') || n.includes('data') || n.includes('intel')) return 'Research';
    if (n.includes('code') || n.includes('tech') || n.includes('engineer') || n.includes('cto')) return 'Engineering';
    if (n.includes('content') || n.includes('write') || n.includes('counselor') || n.includes('comms')) return 'Content';
    if (n.includes('ops') || n.includes('security')) return 'Ops';
    if (n.includes('sales') || n.includes('revenue')) return 'Sales';
    return 'Custom';
  }

  /* Simple markdown → HTML renderer (no external deps) */
  function _renderMarkdown(text) {
    if (!text) return '';
    // Extract images and video links BEFORE escaping (URLs contain special chars)
    const images = [];
    const videos = [];
    let processed = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
      const idx = images.length;
      images.push({ alt, url });
      return `%%IMG_${idx}%%`;
    });
    // Video links: [▶ Watch Video](url) or [Watch](url.mp4)
    processed = processed.replace(/\[([^\]]*(?:Watch|Video|▶)[^\]]*)\]\(([^)]+)\)/gi, (_, label, url) => {
      const idx = videos.length;
      videos.push({ label, url });
      return `%%VID_${idx}%%`;
    });
    // Regular links: [text](url) — extract before escaping
    const links = [];
    processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
      const idx = links.length;
      links.push({ label, url });
      return `%%LINK_${idx}%%`;
    });

    processed = _esc(processed)
      // Headers
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      // Bold / italic
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Bullet lists
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
      // Code blocks
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      // Tables (basic)
      .replace(/\|(.+)\|/g, (match) => {
        if (match.includes('---')) return '';
        const cells = match.split('|').filter(c => c.trim());
        return '<tr>' + cells.map(c => `<td style="padding:4px 8px;border:1px solid var(--border,#333)">${c.trim()}</td>`).join('') + '</tr>';
      })
      // Horizontal rules
      .replace(/^---$/gm, '<hr/>')
      // Paragraphs (double newline)
      .replace(/\n\n/g, '</p><p>')
      // Single newlines → <br>
      .replace(/\n/g, '<br/>')
      // Wrap in paragraph
      .replace(/^/, '<p>').replace(/$/, '</p>')
      // Fix nested list items
      .replace(/<\/li><br\/><li>/g, '</li><li>')
      // Clean up empty paragraphs
      .replace(/<p><\/p>/g, '');

    // Restore images
    images.forEach((img, i) => {
      processed = processed.replace(`%%IMG_${i}%%`,
        `<div class="mission-image-wrap"><img src="${img.url}" alt="${_esc(img.alt)}" class="mission-generated-image" loading="lazy"/><a href="${img.url}" target="_blank" rel="noopener" class="mission-image-download" title="Open full size">⬇ Download</a></div>`
      );
    });

    // Restore videos
    videos.forEach((vid, i) => {
      processed = processed.replace(`%%VID_${i}%%`,
        `<div class="mission-image-wrap"><video src="${vid.url}" controls class="mission-generated-image" style="max-height:400px"></video><a href="${vid.url}" target="_blank" rel="noopener" class="mission-image-download" title="Download video">⬇ Download Video</a></div>`
      );
    });

    // Restore links
    links.forEach((link, i) => {
      processed = processed.replace(`%%LINK_${i}%%`,
        `<a href="${link.url}" target="_blank" rel="noopener">${_esc(link.label)}</a>`
      );
    });

    return processed;
  }

  function destroy() {
    if (_detailChannel) { SB.realtime.unsubscribe(_detailChannel); _detailChannel = null; }
  }

  return { title, render, destroy };
})();

/* ── Shared Mission Report View ── */
const SharedReportView = (() => {
  const title = 'Mission Report';
  const _esc = typeof Utils !== 'undefined' ? Utils.esc : (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function render(el, params) {
    const missionId = (params.id || '').replace('report-', '');
    el.innerHTML = '<div class="loading-state"><p>Loading mission report...</p></div>';
    _loadReport(el, missionId);
  }

  async function _loadReport(el, id) {
    let mission;
    try {
      mission = await SB.db('tasks').get(id);
    } catch(e) {
      mission = (State.get('missions') || []).find(m => m.id === id);
    }

    if (!mission) {
      el.innerHTML = '<div class="app-empty"><h2>Report Not Found</h2><p>This mission report could not be found.</p><div class="app-empty-acts"><a href="#/" class="btn btn-sm">Home</a></div></div>';
      return;
    }

    const agents = State.get('agents') || [];
    const agent = agents.find(a => a.id === mission.agent_id);
    const agentName = agent ? agent.name : (mission.agent_name || 'Unassigned');

    let duration = '';
    if (mission.completed_at) {
      const diffMs = new Date(mission.completed_at).getTime() - new Date(mission.created_at).getTime();
      if (diffMs < 60000) duration = Math.round(diffMs / 1000) + 's';
      else if (diffMs < 3600000) duration = Math.round(diffMs / 60000) + 'm';
      else duration = Math.round(diffMs / 3600000) + 'h';
    }

    el.innerHTML = `
      <div class="detail-wrap">
        <div class="detail-header">
          <svg class="detail-header-icon-lg" fill="none" stroke="currentColor" stroke-width="1.2"><use href="#icon-task"/></svg>
          <div class="detail-header-info">
            <h2 class="detail-name">${_esc(mission.title)}</h2>
            <div class="detail-meta-row">
              <span class="task-status-badge badge-${mission.status}">${_esc(mission.status)}</span>
              <span class="task-priority-tag priority-${mission.priority}">${_esc(mission.priority)}</span>
            </div>
          </div>
        </div>
        <div class="detail-grid">
          <div class="detail-section">
            <h3 class="detail-section-title">Report Summary</h3>
            <div class="detail-kv">
              <div class="detail-kv-row"><span class="kv-label">Agent</span><span class="kv-val">${_esc(agentName)}</span></div>
              <div class="detail-kv-row"><span class="kv-label">Created</span><span class="kv-val">${new Date(mission.created_at).toLocaleString()}</span></div>
              ${mission.completed_at ? `<div class="detail-kv-row"><span class="kv-label">Completed</span><span class="kv-val">${new Date(mission.completed_at).toLocaleString()}</span></div>` : ''}
              ${duration ? `<div class="detail-kv-row"><span class="kv-label">Duration</span><span class="kv-val">${duration}</span></div>` : ''}
            </div>
          </div>
        </div>
        ${mission.result ? `
          <div class="detail-section">
            <h3 class="detail-section-title">Result</h3>
            <div class="mission-result-content"><pre>${_esc(mission.result)}</pre></div>
          </div>
        ` : ''}
      </div>
    `;
  }

  return { title, render };
})();
