/* ═══════════════════════════════════════════════════════════════════
   NICE — Missions View
   Live mission queue with status, progress, and agent assignment.
═══════════════════════════════════════════════════════════════════ */

const MissionsView = (() => {
  const title = 'Missions';
  let _channel = null;
  let _viewMode = 'list'; // 'list' or 'board'
  let _boardCompact = false;

  const STATUSES   = ['queued','running','completed','failed'];
  const PRIORITIES = ['low','medium','high','critical'];
  const BOARD_COLUMNS = [
    { status: 'queued',    label: 'Queued',    color: 'var(--text-muted)' },
    { status: 'running',   label: 'Running',   color: '#6366f1' },
    { status: 'completed', label: 'Completed', color: '#22c55e' },
    { status: 'failed',    label: 'Failed',    color: '#ef4444' },
  ];

  function _skeletonRows(count) {
    const row = `<div class="skeleton-list-row">
      <div class="skeleton-line sk-badge"></div>
      <div style="flex:1"><div class="skeleton-line sk-title"></div></div>
      <div class="skeleton-line sk-sub" style="width:80px"></div>
    </div>`;
    return `<div class="skeleton-list">${row.repeat(count || 5)}</div>`;
  }

  const _esc = Utils.esc;
  const _timeAgo = Utils.timeAgo;

  let _el = null;
  let _filterAgent = '';

  function render(el) {
    _el = el;
    const user = State.get('user');
    if (!user) return _authPrompt(el, 'missions');
    const agents = State.get('agents') || [];

    el.innerHTML = `
      <div class="tasks-wrap">
        <div class="log-header">
          <div>
            <h1 class="log-title">Missions</h1>
            <p class="log-sub">Live mission queue with status, progress, and agent assignment.</p>
          </div>
        </div>
        <div class="view-topbar">
          <div class="view-topbar-l">
            <div class="search-box">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-search"/></svg>
              <input type="text" id="task-search" class="search-input" placeholder="Search missions..." />
            </div>
            <select id="task-filter" class="filter-select">
              <option value="">All Status</option>
              <option value="queued">Queued</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
            ${_viewMode === 'board' ? `
              <select id="mb-filter-agent" class="filter-select">
                <option value="">All Agents</option>
                ${agents.map(r => `<option value="${r.id}" ${_filterAgent === r.id ? 'selected' : ''}>${_esc(r.name)}</option>`).join('')}
              </select>
            ` : ''}
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <div class="btn-group" style="display:flex;gap:0">
              <button class="btn btn-xs ${_viewMode === 'list' ? 'btn-primary' : ''}" id="btn-view-list" title="List view">
                <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-task"/></svg>
              </button>
              <button class="btn btn-xs ${_viewMode === 'board' ? 'btn-primary' : ''}" id="btn-view-board" title="Board view">
                <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-dashboard"/></svg>
              </button>
            </div>
            ${_viewMode === 'board' ? `<button class="btn btn-xs" id="mb-toggle-compact">${_boardCompact ? 'Expand' : 'Compact'}</button>` : ''}
            <button class="btn btn-primary btn-sm" id="btn-new-task">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-plus"/></svg>
              New Mission
            </button>
          </div>
        </div>

        <!-- Task Stats Bar -->
        <div class="task-stats-bar" id="task-stats">
          <div class="task-stat"><span class="task-stat-num" id="ts-total">0</span><span class="task-stat-label">Total</span></div>
          <div class="task-stat"><span class="task-stat-num hl" id="ts-running">0</span><span class="task-stat-label">Running</span></div>
          <div class="task-stat"><span class="task-stat-num" id="ts-queued">0</span><span class="task-stat-label">Queued</span></div>
          <div class="task-stat"><span class="task-stat-num" id="ts-completed">0</span><span class="task-stat-label">Done</span></div>
          <div class="task-stat"><span class="task-stat-num" id="ts-failed">0</span><span class="task-stat-label">Failed</span></div>
        </div>

        <div id="tasks-list" class="tasks-list">
          ${_skeletonRows(6)}
        </div>
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
                <select id="t-agent" class="filter-select builder-select">
                  <option value="">Unassigned</option>
                </select>
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

    // Auto-refresh when MissionRunner updates missions in State
    State.on('missions', _onMissionsChanged);
  }

  function _onMissionsChanged(missions) {
    _updateStats(missions);
    _applyFilters();
  }

  async function _loadMissions() {
    let missions = [];
    const user = State.get('user');
    let dbError = false;
    if (user) {
      try {
        missions = await SB.db('tasks').list({ userId: user.id, orderBy: 'created_at' });
      } catch (err) {
        dbError = true;
        console.warn('Supabase tasks unavailable, using seed data:', err.message);
      }
    }
    if (!user || (dbError && !missions.length)) missions = _seedMissions();
    State.set('missions', missions);
    _renderMissions(missions);
    _updateStats(missions);
  }

  function _seedMissions() {
    const now = Date.now();
    return [
      { id:'st1', title:'Scrape competitor pricing', agent_id:'sa1', agent_name:'ResearchBot', status:'completed', priority:'high', created_at:new Date(now - 86400000).toISOString(), completed_at:new Date(now - 82800000).toISOString() },
      { id:'st2', title:'Review PR #142', agent_id:'sa2', agent_name:'CodePilot', status:'running', priority:'medium', created_at:new Date(now - 7200000).toISOString() },
      { id:'st3', title:'Generate weekly report', agent_id:'sa3', agent_name:'DataCrunch', status:'queued', priority:'low', created_at:new Date(now - 3600000).toISOString() },
      { id:'st4', title:'Write blog post draft', agent_id:'sa4', agent_name:'ContentWriter', status:'completed', priority:'medium', created_at:new Date(now - 172800000).toISOString(), completed_at:new Date(now - 162000000).toISOString() },
      { id:'st5', title:'Deploy staging environment', agent_id:'sa5', agent_name:'OpsMonitor', status:'failed', priority:'high', created_at:new Date(now - 43200000).toISOString() },
      { id:'st6', title:'Analyze user feedback', agent_id:'sa1', agent_name:'ResearchBot', status:'running', priority:'medium', created_at:new Date(now - 1800000).toISOString() },
      { id:'st7', title:'Fix auth redirect bug', agent_id:'sa6', agent_name:'BugHunter', status:'failed', priority:'high', created_at:new Date(now - 259200000).toISOString() },
      { id:'st8', title:'Update API documentation', agent_id:'sa4', agent_name:'ContentWriter', status:'completed', priority:'low', created_at:new Date(now - 345600000).toISOString(), completed_at:new Date(now - 340000000).toISOString() },
    ];
  }

  function _renderMissions(missions) {
    const list = document.getElementById('tasks-list');
    if (!list) return;

    if (!missions || missions.length === 0) {
      list.innerHTML = `
        <div class="app-empty">
          <svg class="app-empty-icon" fill="none" stroke="currentColor" stroke-width="1.2"><use href="#icon-task"/></svg>
          <h2>No Missions Yet</h2>
          <p>Create a mission and assign it to an agent.</p>
          <div class="app-empty-acts">
            <button class="btn btn-primary btn-sm" onclick="document.getElementById('modal-new-task').classList.add('open')">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-plus"/></svg>
              Create Mission
            </button>
          </div>
        </div>
      `;
      return;
    }

    // Get agents for name lookup
    const agents = State.get('agents') || [];
    const agentMap = {};
    agents.forEach(a => { agentMap[a.id] = a; });

    list.innerHTML = missions.map(t => {
      const agent = agentMap[t.agent_id];
      const agentName = agent ? agent.name : 'Unassigned';
      const progress = t.progress || 0;

      return `
        <div class="task-row task-row-clickable" data-id="${t.id}">
          <div class="task-row-main">
            <span class="task-status-badge badge-${t.status}">${t.status}</span>
            <div class="task-row-info">
              <span class="task-row-title">${_esc(t.title)}</span>
              <span class="task-row-agent">${_esc(agentName)}</span>
            </div>
            <span class="task-priority-tag priority-${t.priority}">${t.priority}</span>
            <span class="task-row-time">${_timeAgo(t.created_at)}</span>
          </div>
          ${t.status === 'running' ? `
            <div class="task-progress">
              <div class="task-progress-bar" style="width:${progress}%"></div>
            </div>
          ` : ''}
          ${t.status === 'queued' && t.agent_id ? `
            <div class="task-actions">
              <button class="btn btn-primary btn-xs task-run-btn" data-id="${t.id}">
                <svg class="icon icon-xs" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-zap"/></svg> Run
              </button>
            </div>
          ` : ''}
          ${t.status === 'failed' && t.agent_id ? `
            <div class="task-actions">
              <button class="btn btn-primary btn-xs task-retry-btn" data-id="${t.id}">
                <svg class="icon icon-xs" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-refresh"/></svg> Retry
              </button>
            </div>
          ` : ''}
          ${t.result ? `<div class="task-result"><pre>${_esc(t.result).slice(0, 500)}</pre></div>` : ''}
        </div>
      `;
    }).join('');
  }

  /* ── Board (Kanban) Rendering ── */

  function _renderBoard(missions) {
    const list = document.getElementById('tasks-list');
    if (!list) return;
    if (!missions) missions = [];
    const agents = State.get('agents') || [];
    list.innerHTML = `
      <div class="mb-board" id="mb-board">
        ${BOARD_COLUMNS.map(col => {
          const colMissions = _getBoardFiltered(missions, col.status);
          return `
            <div class="mb-col" data-status="${col.status}">
              <div class="mb-col-header" style="border-color:${col.color}">
                <span class="mb-col-title">${col.label}</span>
                <span class="mb-col-count">${colMissions.length}</span>
              </div>
              <div class="mb-col-body" data-status="${col.status}">
                ${colMissions.length === 0 ? '<div class="mb-empty">No missions</div>' :
                  colMissions.map(m => _renderBoardCard(m, agents)).join('')}
              </div>
            </div>`;
        }).join('')}
      </div>`;

    _initDnD();
    _initCardClick();
  }

  function _getBoardFiltered(missions, status) {
    let filtered = missions.filter(m => m.status === status);
    if (_filterAgent) filtered = filtered.filter(m => m.agent_id === _filterAgent);
    return filtered;
  }

  function _renderBoardCard(mission, agents) {
    const agent = agents.find(r => r.id === mission.agent_id);
    const agentName = agent ? agent.name : 'Unassigned';
    const priority = mission.priority || 'normal';
    const priorityClass = priority === 'high' ? 'pri-high' : priority === 'low' ? 'pri-low' : 'pri-normal';
    const ageClass = _missionAgeClass(mission.created_at);

    if (_boardCompact) {
      return `
        <div class="mb-card mb-card-compact ${ageClass}" draggable="true" data-id="${mission.id}" data-status="${mission.status}">
          <span class="mb-card-title">${_esc(mission.title)}</span>
          <span class="mb-card-pri ${priorityClass}">${priority}</span>
        </div>`;
    }

    return `
      <div class="mb-card ${ageClass}" draggable="true" data-id="${mission.id}" data-status="${mission.status}">
        <div class="mb-card-top">
          <span class="mb-card-title">${_esc(mission.title)}</span>
          <span class="mb-card-pri ${priorityClass}">${priority}</span>
        </div>
        <div class="mb-card-meta">
          <span class="mb-card-agent">${_esc(agentName)}</span>
          <span class="mb-card-date">${_timeAgo(mission.created_at)}</span>
        </div>
      </div>`;
  }

  function _missionAgeClass(createdAt) {
    if (!createdAt) return 'mission-fresh';
    const ageMs = Date.now() - new Date(createdAt).getTime();
    const ageDays = ageMs / 86400000;
    if (ageDays < 1) return 'mission-fresh';
    if (ageDays < 3) return 'mission-stale';
    return 'mission-overdue';
  }

  function _initDnD() {
    const board = document.getElementById('mb-board');
    if (!board) return;

    board.querySelectorAll('.mb-card').forEach(card => {
      card.addEventListener('dragstart', (e) => {
        card.classList.add('mb-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.dataset.id);
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('mb-dragging');
        board.querySelectorAll('.mb-col-body').forEach(b => b.classList.remove('mb-drop-target'));
      });
    });

    board.querySelectorAll('.mb-col-body').forEach(colBody => {
      colBody.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        colBody.classList.add('mb-drop-target');
      });
      colBody.addEventListener('dragleave', () => {
        colBody.classList.remove('mb-drop-target');
      });
      colBody.addEventListener('drop', (e) => {
        e.preventDefault();
        colBody.classList.remove('mb-drop-target');
        const missionId = e.dataTransfer.getData('text/plain');
        const newStatus = colBody.dataset.status;
        _updateMissionStatus(missionId, newStatus);
      });
    });
  }

  function _updateMissionStatus(missionId, newStatus) {
    const missions = State.get('missions') || [];
    const mission = missions.find(m => m.id === missionId);
    if (!mission || mission.status === newStatus) return;

    const oldStatus = mission.status;
    mission.status = newStatus;
    State.set('missions', missions);

    if (newStatus === 'completed' && typeof Gamification !== 'undefined') {
      Gamification.addMissionXP(mission);
    }
    if (typeof AuditLog !== 'undefined') {
      AuditLog.log('mission', {
        description: `Mission "${mission.title}" moved from ${oldStatus} to ${newStatus}`,
        missionId, oldStatus, newStatus,
      });
    }
    if (typeof SB !== 'undefined') {
      SB.db('tasks').update(missionId, { status: newStatus }).catch(() => {});
    }
  }

  function _initCardClick() {
    const board = document.getElementById('mb-board');
    if (!board) return;
    board.addEventListener('click', (e) => {
      const card = e.target.closest('.mb-card');
      if (!card || card.classList.contains('mb-dragging')) return;
      Router.navigate('#/missions/' + card.dataset.id);
    });
  }

  function _updateStats(missions) {
    if (!missions) return;
    const total     = missions.length;
    const running   = missions.filter(t => t.status === 'running').length;
    const queued    = missions.filter(t => t.status === 'queued').length;
    const completed = missions.filter(t => t.status === 'completed').length;
    const failed    = missions.filter(t => t.status === 'failed').length;

    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('ts-total', total);
    el('ts-running', running);
    el('ts-queued', queued);
    el('ts-completed', completed);
    el('ts-failed', failed);
  }

  function _bindEvents() {
    // View mode toggle
    document.getElementById('btn-view-list')?.addEventListener('click', () => {
      if (_viewMode === 'list') return;
      _viewMode = 'list';
      if (_el) render(_el);
    });
    document.getElementById('btn-view-board')?.addEventListener('click', () => {
      if (_viewMode === 'board') return;
      _viewMode = 'board';
      if (_el) render(_el);
    });

    // Board-specific controls
    document.getElementById('mb-toggle-compact')?.addEventListener('click', () => {
      _boardCompact = !_boardCompact;
      if (_el) render(_el);
    });
    document.getElementById('mb-filter-agent')?.addEventListener('change', (e) => {
      _filterAgent = e.target.value;
      const missions = State.get('missions') || [];
      _renderBoard(missions);
      _updateStats(missions);
    });

    // New mission button
    document.getElementById('btn-new-task')?.addEventListener('click', _openNewMission);
    document.getElementById('close-task-modal')?.addEventListener('click', () => {
      document.getElementById('modal-new-task')?.classList.remove('open');
    });

    // Close modal on overlay click
    document.getElementById('modal-new-task')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-new-task') e.target.classList.remove('open');
    });

    // Task form submit
    document.getElementById('task-form')?.addEventListener('submit', _createMission);

    // Search & filter
    document.getElementById('task-search')?.addEventListener('input', _applyFilters);
    document.getElementById('task-filter')?.addEventListener('change', _applyFilters);

    // Row click → detail view (delegated, list mode only)
    document.getElementById('tasks-list')?.addEventListener('click', (e) => {
      if (_viewMode === 'board') return;
      if (e.target.closest('.task-run-btn') || e.target.closest('.task-retry-btn')) return;
      const row = e.target.closest('.task-row');
      if (row) Router.navigate('#/missions/' + row.dataset.id);
    });

    // Run / Retry buttons (delegated)
    document.getElementById('tasks-list')?.addEventListener('click', async (e) => {
      const runBtn = e.target.closest('.task-run-btn');
      const retryBtn = e.target.closest('.task-retry-btn');
      const btn = runBtn || retryBtn;
      if (!btn || typeof MissionRunner === 'undefined') return;

      const missionId = btn.dataset.id;
      btn.disabled = true;
      btn.textContent = 'Running...';

      if (retryBtn) {
        try { await SB.db('tasks').update(missionId, { status: 'queued', progress: 0, result: null }); } catch {}
      }

      await MissionRunner.run(missionId);
      _loadMissions();
    });
  }

  async function _openNewMission() {
    // Populate agent dropdown
    const select = document.getElementById('t-agent');
    if (select) {
      const agents = State.get('agents') || [];
      if (agents.length === 0) {
        try {
          const user = State.get('user');
          const fresh = await SB.db('user_agents').list({ userId: user.id });
          State.set('agents', fresh);
          _populateAgentSelect(select, fresh);
        } catch(e) { /* ignore */ }
      } else {
        _populateAgentSelect(select, agents);
      }
    }
    document.getElementById('modal-new-task')?.classList.add('open');
  }

  function _populateAgentSelect(select, agents) {
    select.innerHTML = '<option value="">Unassigned</option>' +
      agents.map(a => `<option value="${a.id}">${_esc(a.name)} (${a.status})</option>`).join('');
  }

  async function _createMission(e) {
    e.preventDefault();
    const errEl = document.getElementById('task-error');
    const btn   = document.getElementById('task-submit-btn');
    errEl.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Creating...';

    const user     = State.get('user');
    const title    = document.getElementById('t-title').value.trim();
    const agentId  = document.getElementById('t-agent').value || null;
    const priority = document.getElementById('t-priority').value;

    if (!title) {
      errEl.textContent = 'Mission title is required.';
      btn.disabled = false;
      btn.textContent = 'Create Mission';
      return;
    }

    try {
      const created = await SB.db('tasks').create({
        user_id:  user.id,
        agent_id: agentId,
        title,
        status:   'queued',
        priority,
        progress: 0,
        result:   null,
      });
      document.getElementById('modal-new-task')?.classList.remove('open');
      document.getElementById('task-form')?.reset();
      _loadMissions();

      // Auto-run if an agent is assigned
      if (agentId && created && created.id && typeof MissionRunner !== 'undefined') {
        MissionRunner.run(created.id);
      }
    } catch (err) {
      errEl.textContent = err.message || 'Failed to create mission.';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Mission';
    }
  }

  function _applyFilters() {
    const q = (document.getElementById('task-search')?.value || '').toLowerCase();
    const f = document.getElementById('task-filter')?.value || '';
    let missions = State.get('missions') || [];
    if (q) missions = missions.filter(t => t.title.toLowerCase().includes(q));
    if (f) missions = missions.filter(t => t.status === f);
    if (_viewMode === 'board') {
      _renderBoard(missions);
    } else {
      _renderMissions(missions);
    }
  }

  function _subscribeRealtime() {
    _channel = SB.realtime.subscribe('tasks', () => { _loadMissions(); });
  }

  function destroy() {
    if (_channel) { SB.realtime.unsubscribe(_channel); _channel = null; }
    State.off('missions', _onMissionsChanged);
  }

  return { title, render, destroy };
})();

/* ── Mission Detail View ── */
const MissionDetailView = (() => {
  const title = 'Mission Detail';
  let _channel = null;

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
      const agents = State.get('agents') || [];
      const agentMap = {};
      agents.forEach(a => { agentMap[a.id] = a; });
      const agent = agentMap[mission.agent_id];
      const agentName = agent ? agent.name : (mission.agent_name || 'Unassigned');
      const agentInitials = agentName.slice(0, 2).toUpperCase();

      // Status styling
      const dotClass = mission.status === 'completed' ? 'dot-g' : mission.status === 'running' ? 'dot-g dot-pulse' : mission.status === 'failed' ? 'dot-r' : 'dot-a';
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
            ${mission.status === 'queued' && mission.agent_id ? `
              <button class="btn btn-sm btn-primary" id="md-run" data-id="${id}">Run Mission</button>
            ` : ''}
            ${mission.status === 'failed' && mission.agent_id ? `
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
                <div style="display:flex;align-items:center;gap:10px;cursor:pointer" onclick="Router.navigate('#/blueprints/agents/${agent.id}')">
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
              <div class="mission-result-content">
                <pre>${_esc(mission.result)}</pre>
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

      _channel = SB.realtime.subscribe('tasks', (payload) => {
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
  }

  function _agentColor(role) {
    const colors = { Research:'#6366f1', Code:'#06b6d4', Data:'#f59e0b', Content:'#ec4899', Ops:'#22c55e', Custom:'#8b5cf6' };
    return colors[role] || 'var(--accent)';
  }

  function destroy() {
    if (_channel) { SB.realtime.unsubscribe(_channel); _channel = null; }
  }

  return { title, render, destroy };
})();

/* ── Shared Mission Report View ── */
const SharedReportView = (() => {
  const title = 'Mission Report';

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
