/* ═══════════════════════════════════════════════════════════════════
   NICE — Missions View  (Mission Control redesign)
   Unified card grid with gauge strip, pipeline visualizer,
   animated progress, transition flashes, and batch operations.
═══════════════════════════════════════════════════════════════════ */

const MissionsView = (() => {
  // Noun helpers — theme-aware. `Terminology` is SSOT; `{plural}` /
  // `{lowercase}` select the rendered form. Called inside render() so
  // Router.refresh() picks up the new theme's vocabulary.
  const _N   = () => Terminology.label('mission');
  const _Np  = () => Terminology.label('mission', { plural: true });
  const _Nl  = () => Terminology.label('mission', { lowercase: true });
  const _Nlp = () => Terminology.label('mission', { plural: true, lowercase: true });

  const STATUSES   = ['queued','running','completed','failed','cancelled'];
  const PRIORITIES = ['low','medium','high','critical'];
  const STATUS_META = {
    queued:    { label: 'Queued',    color: '#f59e0b', icon: 'clock' },
    running:   { label: 'Running',   color: '#6366f1', icon: 'zap' },
    review:    { label: 'Review',    color: '#a855f7', icon: 'target' },
    completed: { label: 'Completed', color: '#22c55e', icon: 'check' },
    failed:    { label: 'Failed',    color: '#ef4444', icon: 'x' },
    cancelled: { label: 'Cancelled', color: '#94a3b8', icon: 'x' },
  };
  const _statusIcon = (name) =>
    `<svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-${name}"/></svg>`;

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

    el.innerHTML = `
      <div class="mc-missions">
        <!-- Toolbar -->
        <div class="view-topbar">
          <div class="view-topbar-l">
            <div class="search-box">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-search"/></svg>
              <input type="text" id="task-search" class="search-input" placeholder="Search ${_Nlp()}..." />
            </div>
          </div>
          <div class="mc-toolbar-actions">
            <button class="btn btn-primary btn-sm" id="btn-new-task" aria-label="New ${_N()}" title="New ${_N()}">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-plus"/></svg>
              <span class="mc-toolbar-label">New ${_N()}</span>
            </button>
          </div>
        </div>

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
            <h3 class="modal-title">Create ${_N()}</h3>
            <button class="modal-close" id="close-task-modal" aria-label="Close">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-x"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <form id="task-form" class="auth-form">
              <div class="auth-field">
                <label for="t-title">${_N()} Title</label>
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
              <button type="submit" class="auth-submit" id="task-submit-btn">Create ${_N()}</button>
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
     PIPELINE VISUALIZER — clickable status filter
     (Replaces the old ring-gauge strip; pipeline shows the same counts
     but is also the mission filter control, so a single row suffices.)
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
          <span class="mc-pipe-icon">${_statusIcon(meta.icon)}</span>
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
          <h2>No ${_Np()} Yet</h2>
          <p>Create ${Terminology.article('mission', { lowercase: true })} ${_Nl()} and assign it to an agent.</p>
          <div class="app-empty-acts">
            <button class="btn btn-primary btn-sm" onclick="document.getElementById('modal-new-task').classList.add('open')">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-plus"/></svg> Create ${_N()}
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
        if (e.target.closest('.mc-card-check') || e.target.closest('.task-run-btn') || e.target.closest('.task-retry-btn') || e.target.closest('.mc-card-cancel') || e.target.closest('.mc-card-delete')) return;
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
      if (retryBtn) { try { await SB.db('mission_runs').update(missionId, { status: 'queued', progress: 0, result: null }); } catch {} }
      await MissionRunner.run(missionId);
      _loadMissions();
    });

    // Per-row Cancel (queued/running only; soft — running loops re-check status)
    feed.addEventListener('click', async (e) => {
      const cancelBtn = e.target.closest('.mc-card-cancel');
      if (!cancelBtn) return;
      const missionId = cancelBtn.dataset.id;
      cancelBtn.disabled = true;
      await _cancelMission(missionId);
      _loadMissions();
    });

    // Per-row Delete (confirm-gated, cascades ship_log via FK)
    feed.addEventListener('click', async (e) => {
      const delBtn = e.target.closest('.mc-card-delete');
      if (!delBtn) return;
      const missionId = delBtn.dataset.id;
      if (!confirm(`Delete this ${_Nl()}? This also removes all associated ship-log entries and cannot be undone.`)) return;
      delBtn.disabled = true;
      _selected.delete(missionId);
      _renderBatchBar();
      await _deleteMission(missionId);
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
    } else if ((m.status === 'failed' || m.status === 'completed' || m.status === 'cancelled') && (m.agent_id || m.agent_name)) {
      actionsHTML = `<button class="btn btn-xs task-retry-btn" data-id="${m.id}">↻ Retry</button>`;
    }
    // Cancel shows only for in-flight states. Soft cancel: flips status to
    // 'cancelled' in the DB; running WorkflowEngine loops re-check status
    // between nodes and bail out. Queued runs stop before they start.
    if (m.status === 'queued' || m.status === 'running') {
      actionsHTML += `<button class="btn btn-xs mc-card-cancel" data-id="${m.id}" aria-label="Cancel ${_Nl()}" title="Cancel ${_Nl()}">✕</button>`;
    }
    // Delete is available for every status. Destructive, confirm-gated.
    actionsHTML += `<button class="btn btn-xs mc-card-delete" data-id="${m.id}" aria-label="Delete ${_Nl()}" title="Delete ${_Nl()}">🗑</button>`;

    return `
      <div class="mc-card ${ageClass} ${isRunning ? 'mc-card-running' : ''} mc-card-${m.status}" data-id="${m.id}" data-status="${m.status}">
        <div class="mc-card-top">
          <input type="checkbox" class="mc-card-check" data-id="${m.id}" ${checked} />
          <span class="mc-card-status" style="color:${meta.color}">${_statusIcon(meta.icon)}</span>
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

  // Delegates to BlueprintUtils.humanizeModelShort — the SSOT for model
  // display names. See blueprint-utils.js:_MODEL_SHORT_NAMES.
  function _shortModel(modelId) {
    return (typeof BlueprintUtils !== 'undefined' && BlueprintUtils.humanizeModelShort)
      ? BlueprintUtils.humanizeModelShort(modelId)
      : (modelId || '');
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
      <span class="mc-batch-count">${_selected.size} selected
        <button class="mc-batch-clear" aria-label="Clear selection" title="Clear selection">×</button>
      </span>
      <button class="btn btn-xs mc-batch-delete">🗑 Delete</button>
    `;
    bar.querySelector('.mc-batch-delete')?.addEventListener('click', async () => {
      const n = _selected.size;
      if (!confirm(`Delete ${n} ${_Nl()}${n === 1 ? '' : 's'}? This also removes all associated ship-log entries and cannot be undone.`)) return;
      const ids = Array.from(_selected);
      _selected.clear();
      _renderBatchBar();
      await Promise.all(ids.map(id => _deleteMission(id)));
    });
    bar.querySelector('.mc-batch-clear')?.addEventListener('click', () => {
      _selected.clear();
      _renderBatchBar();
      _applyFilters();
    });
  }

  async function _deleteMission(missionId) {
    const missions = State.get('missions') || [];
    const mission = missions.find(m => m.id === missionId);
    const next = missions.filter(m => m.id !== missionId);
    State.set('missions', next);
    if (typeof AuditLog !== 'undefined' && mission) {
      AuditLog.log('mission', { description: `Mission "${mission.title}" deleted`, missionId, status: mission.status });
    }
    if (typeof SB !== 'undefined') {
      try { await SB.db('mission_runs').remove(missionId); } catch (err) { console.error('[Missions] Delete failed', err); }
    }
  }

  // Soft cancel: flip status in the DB + State. The runner's node loop
  // re-reads status between WorkflowEngine nodes (see MissionRunner._isCancelled)
  // and bails on 'cancelled'. Queued runs never start — Run/RunAll skip them.
  async function _cancelMission(missionId) {
    const missions = State.get('missions') || [];
    const mission = missions.find(m => m.id === missionId);
    const now = new Date().toISOString();

    // Update State optimistically so the UI reflects the cancel immediately.
    const next = missions.map(m =>
      m.id === missionId ? Object.assign({}, m, { status: 'cancelled', updated_at: now }) : m,
    );
    State.set('missions', next);

    if (typeof AuditLog !== 'undefined' && mission) {
      AuditLog.log('mission', { description: `Mission "${mission.title}" cancelled`, missionId, previousStatus: mission.status });
    }
    if (typeof SB !== 'undefined') {
      try {
        await SB.db('mission_runs').update(missionId, { status: 'cancelled', updated_at: now });
      } catch (err) {
        console.error('[Missions] Cancel failed', err);
      }
    }
    if (typeof Notify !== 'undefined' && mission) {
      Notify.send({ title: `${_N()} Cancelled`, message: mission.title, type: 'system' });
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     DATA LOADING / EVENTS
  ═══════════════════════════════════════════════════════════════════ */
  function _onMissionsChanged(missions) {
    _renderPipeline(missions);
    _applyFilters();
  }

  async function _loadMissions() {
    let missions = [];
    const user = State.get('user');
    let dbError = false;
    if (user) {
      try { missions = await SB.db('mission_runs').list({ userId: user.id, orderBy: 'created_at' }); }
      catch (err) { dbError = true; console.warn('Supabase mission_runs unavailable:', err.message); }
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
    // "New Mission" now routes to the prompt-driven Mission Composer.
    // The legacy modal form (below) still mounts for any direct call into
    // _openNewMission, but the toolbar entry point leads with the Composer.
    document.getElementById('btn-new-task')?.addEventListener('click', (e) => {
      e.preventDefault();
      location.hash = '#/missions/new';
    });
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
      if (!agents.length && typeof Blueprints !== 'undefined' && Blueprints.getActivatedAgents) {
        agents = Blueprints.getActivatedAgents().map(a => ({ id: a.id, name: a.name, status: 'active' }));
      }
      if (!agents.length && typeof Blueprints !== 'undefined') {
        await Blueprints.ensureCatalogLoaded();
        agents = Blueprints.listAgents().map(a => ({ id: a.id, name: a.name, status: a.rarity || 'available' }));
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

    if (!mTitle) { errEl.textContent = `${_N()} title is required.`; btn.disabled = false; btn.textContent = `Create ${_N()}`; return; }

    const isUUID = agentVal && /^[0-9a-f]{8}-/i.test(agentVal);
    const agentId = isUUID ? agentVal : null;
    const agentSelect = document.getElementById('t-agent');
    const agentName = agentSelect?.selectedOptions[0]?.textContent?.replace(/\s*\(.*\)$/, '') || null;

    try {
      const isReal = user?.id && /^[0-9a-f]{8}-/i.test(user.id);
      const spaceships = State.get('spaceships') || [];
      const spaceshipId = spaceships[0]?.id;
      if (isReal && !spaceshipId) {
        errEl.textContent = 'Activate a Spaceship first — Missions always run on a Ship.';
        btn.disabled = false; btn.textContent = `Create ${_N()}`;
        return;
      }
      let created = null;
      if (isReal) {
        created = await SB.db('mission_runs').create({ user_id: user.id, spaceship_id: spaceshipId, agent_id: agentId, agent_name: agentName, title: mTitle, status: 'queued', priority, progress: 0, result: null });
      }
      const local = created || { id: 'mission-' + Date.now(), title: mTitle, agent_id: agentId, agent_name: agentName, status: 'queued', priority, progress: 0, created_at: new Date().toISOString() };
      const missions = State.get('missions') || [];
      missions.unshift(local);
      State.set('missions', missions);
      document.getElementById('modal-new-task')?.classList.remove('open');
      document.getElementById('task-form')?.reset();
      if (agentVal && created?.id && typeof MissionRunner !== 'undefined') MissionRunner.run(created.id);
      if (typeof Notify !== 'undefined') Notify.send({ title: `${_N()} Created`, message: mTitle, type: 'system' });
    } catch (err) { errEl.textContent = err.message || `Failed to create ${_Nl()}.`; }
    finally { btn.disabled = false; btn.textContent = `Create ${_N()}`; }
  }

  function _subscribeRealtime() {
    // Theme.set() → Router.refresh() re-runs render() without first calling
    // destroy(), so an existing subscription must be torn down before a new
    // channel is created. Otherwise Supabase throws "cannot add
    // postgres_changes callbacks after subscribe()" on the duplicate.
    if (_channel) { try { SB.realtime.unsubscribe(_channel); } catch {} _channel = null; }
    _channel = SB.realtime.subscribe('mission_runs', (payload) => {
      if (!payload || !payload.new) { _loadMissions(); return; }
      // Incremental update: merge the changed row into State instead of full reload
      const updated = payload.new;
      const missions = State.get('missions') || [];
      const idx = missions.findIndex(m => m.id === updated.id);
      if (idx !== -1) {
        // Check for status transition → trigger notification
        const old = missions[idx];
        if (old.status !== updated.status) {
          if (updated.status === 'review' && typeof Notify !== 'undefined') {
            Notify.send({ title: `${_N()} Ready`, message: updated.title, type: 'success' });
          }
          if (updated.status === 'failed' && typeof Notify !== 'undefined') {
            Notify.send({ title: `${_N()} Failed`, message: updated.title, type: 'error' });
          }
        }
        missions[idx] = { ...missions[idx], ...updated };
        State.set('missions', [...missions]);
      } else if (payload.eventType === 'INSERT') {
        missions.unshift(updated);
        State.set('missions', [...missions]);
      } else {
        // Unknown row — full reload
        _loadMissions();
      }
    });
  }

  function destroy() {
    if (_channel) { SB.realtime.unsubscribe(_channel); _channel = null; }
    // State.onScoped subscriptions are auto-cleaned by Router
    _selected.clear();
    _prevStatuses = {};
  }

  return { get title() { return _Np(); }, render, destroy };
})();

/* ── Mission Detail View ── */
const MissionDetailView = (() => {
  const _N   = () => Terminology.label('mission');
  const _Np  = () => Terminology.label('mission', { plural: true });
  const _Nl  = () => Terminology.label('mission', { lowercase: true });
  const _esc = Utils.esc;
  let _detailChannel = null;

  function render(el, params) {
    const user = State.get('user');
    el.innerHTML = `<div class="loading-state"><p>Loading ${_Nl()}...</p></div>`;
    _loadMission(el, params.id);
  }

  async function _loadMission(el, id) {
    // Clean up any prior realtime channel FIRST. Router calls destroy()
    // on cross-view navigation but NOT on within-view re-navigation
    // (going from one mission detail to another) — the route pattern
    // matches the same view function. Without this guard, each mission
    // visit leaks a subscription to the 'mission_runs' channel, and
    // Supabase's realtime client throws on the second attempt:
    //   "cannot add postgres_changes callbacks for realtime:mission_runs
    //    after subscribe()"
    // which breaks the fetch that follows. User-visible symptom:
    // "Mission Not Found" on legitimate missions from the second visit
    // onward in a session. Unsubscribe before doing anything else.
    if (_detailChannel) {
      try { SB.realtime.unsubscribe(_detailChannel); } catch { /* ignore */ }
      _detailChannel = null;
    }
    try {
      let mission;
      try {
        mission = await SB.db('mission_runs').get(id);
      } catch(e) {
        mission = (State.get('missions') || []).find(m => m.id === id);
      }
      if (!mission) throw new Error(`${_N()} not found`);

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

      // Load ship log entries for this mission. Route through
      // ShipLog.getEntries so the 'mission-<uuid>' synthetic id is
      // translated to the ship_log.mission_id column (PR #246). Direct
      // SB.db().list() on the raw synthetic id filters on spaceship_id
      // which is UUID — an empty result for ship-less runs.
      let logEntries = [];
      try {
        if (typeof ShipLog !== 'undefined' && typeof ShipLog.getEntries === 'function') {
          logEntries = await ShipLog.getEntries('mission-' + id, 20);
        } else {
          logEntries = await SB.db('ship_log').list({ mission_id: id, orderBy: 'created_at', limit: 20 });
        }
      } catch { /* ignore */ }

      el.innerHTML = `
        <div class="detail-wrap">
          <div class="detail-back">
            <a href="#/missions" class="btn btn-sm">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-arrow-left"/></svg>
              Back to ${_Np()}
            </a>
            ${mission.status === 'queued' && (mission.agent_id || mission.agent_name) ? `
              <button class="btn btn-sm btn-primary" id="md-run" data-id="${id}">Run ${_N()}</button>
            ` : ''}
            ${mission.status === 'review' ? `
              <button class="btn btn-sm btn-primary" id="md-approve" data-id="${id}" style="background:#22c55e;border-color:#22c55e">✓ Approve</button>
              <button class="btn btn-sm" id="md-reject" data-id="${id}" style="color:#f87171">✕ Reject</button>
            ` : ''}
            ${mission.status === 'failed' && (mission.agent_id || mission.agent_name) ? `
              <button class="btn btn-sm btn-primary" id="md-retry" data-id="${id}">Retry ${_N()}</button>
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
                <span class="detail-status">${_esc(Utils.titleCase(mission.status))}</span>
                <span class="task-priority-tag priority-${mission.priority}">${_esc(Utils.titleCase(mission.priority))}</span>
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

          ${_renderDagPanel(mission, id)}

          ${mission.result ? `
            <div class="detail-section">
              <h3 class="detail-section-title">Result</h3>
              ${_renderInboxCaptainSummary(mission, agent)}
              <div class="mission-result-content mission-md" id="mission-result-body">
                ${_renderMarkdown(mission.edited_content || mission.result)}
              </div>
              <div class="outbox-card-actions" style="padding:12px 0 0; border-top:1px solid var(--border,#333); margin-top:12px;" data-id="${_esc(mission.id)}">
                ${mission.approval_status === 'approved' ? '<span class="outbox-status-badge approved" style="margin-right:8px">✓ Approved</span>' : ''}
                ${mission.approval_status === 'rejected' ? '<span class="outbox-status-badge rejected" style="margin-right:8px">✕ Rejected</span>' : ''}
                ${!mission.approval_status || mission.approval_status === 'draft' ? `<button class="btn outbox-approve-btn" data-action="approve" data-mid="${_esc(mission.id)}">✓ Approve</button>` : ''}
                <button class="btn outbox-edit-btn" data-action="edit" data-mid="${_esc(mission.id)}">✎ Edit</button>
                ${!mission.approval_status || mission.approval_status === 'draft' ? `<button class="btn outbox-reject-btn" data-action="reject" data-mid="${_esc(mission.id)}">✕ Reject</button>` : ''}
                <button class="btn outbox-copy-btn" data-action="copy" data-mid="${_esc(mission.id)}">\u{1F4CB} Copy</button>
                ${_isInboxMission(mission, agent) ? `<a class="btn" href="${_gmailDraftsUrl()}" target="_blank" rel="noopener noreferrer" style="margin-left:auto">\u2709\uFE0F Open Gmail Drafts</a>` : ''}
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
                ${metadata.quality_score !== undefined ? `<div class="detail-kv-row"><span class="kv-label">Quality Score</span><span class="kv-val"><span class="mission-quality-badge ${metadata.quality_pass ? 'quality-pass' : 'quality-fail'}">${metadata.quality_score}/10</span></span></div>` : ''}
                ${metadata.quality_feedback ? `<div class="detail-kv-row"><span class="kv-label">Quality Review</span><span class="kv-val" style="font-size:.78rem">${_esc(metadata.quality_feedback)}</span></div>` : ''}
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

      _detailChannel = SB.realtime.subscribe('mission_runs', (payload) => {
        if (payload.new?.id === id || payload.old?.id === id) _loadMission(el, id);
      });
    } catch (err) {
      el.innerHTML = `
        <div class="app-empty">
          <h2>${_N()} Not Found</h2>
          <p>${_esc(err.message)}</p>
          <div class="app-empty-acts"><a href="#/missions" class="btn btn-sm">Back to ${_Np()}</a></div>
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
      try { await SB.db('mission_runs').update(id, { status: 'queued', progress: 0, result: null }); } catch {}
      if (typeof MissionRunner !== 'undefined') await MissionRunner.run(id);
      _loadMission(el, id);
    });

    // Share Report button
    document.getElementById('md-share-report')?.addEventListener('click', () => {
      const shareHash = '#/share/report-' + id;
      const url = window.location.origin + '/app/' + shareHash;
      navigator.clipboard.writeText(url).then(() => {
        if (typeof Notify !== 'undefined') {
          Notify.send({ title: 'Report Link Copied', message: `Shareable ${_Nl()} report URL copied to clipboard.`, type: 'system' });
        }
      }).catch(() => {});
    });

    // Approve mission (review → completed)
    document.getElementById('md-approve')?.addEventListener('click', async () => {
      const now = new Date().toISOString();
      try {
        if (typeof SB !== 'undefined' && SB.client) {
          await SB.client.from('mission_runs').update({ status: 'completed', approval_status: 'approved', reviewed_at: now }).eq('id', id);
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
      // Feedback loop — agent learns from approval
      if (typeof AgentMemory !== 'undefined') {
        const agentKey = mission.agent_id || mission.agent_name || 'unknown';
        AgentMemory.learn(agentKey, mission.result, 'approved');
        AgentMemory.addSuccess(agentKey, { task: mission.title, approach: (mission.result || '').substring(0, 200) });
      }
      if (typeof Notify !== 'undefined') Notify.send({ title: `${_N()} Approved`, message: `Content approved and ${_Nl()} completed!`, type: 'success' });
      _loadMission(el, id);
    });

    // Reject mission (review → failed)
    document.getElementById('md-reject')?.addEventListener('click', async () => {
      const now = new Date().toISOString();
      try {
        if (typeof SB !== 'undefined' && SB.client) {
          await SB.client.from('mission_runs').update({ status: 'failed', approval_status: 'rejected', reviewed_at: now }).eq('id', id);
        }
      } catch {}
      // Feedback loop — agent learns from rejection
      if (typeof AgentMemory !== 'undefined') {
        const agentKey = mission.agent_id || mission.agent_name || 'unknown';
        AgentMemory.learn(agentKey, mission.result, 'rejected');
        AgentMemory.addFailure(agentKey, { task: mission.title, approach: (mission.result || '').substring(0, 200), reason: 'Rejected by user' });
      }
      if (typeof Notify !== 'undefined') Notify.send({ title: `${_N()} Rejected`, message: `Content rejected. You can retry the ${_Nl()}.`, type: 'system' });
      _loadMission(el, id);
    });

    // DAG gate inline Approve/Reject — proxies to the top-level buttons
    // so all approval side-effects (XP, AgentMemory, realtime re-render)
    // stay in one place. If the top bar isn't rendered (shouldn't happen
    // at status='review' but guarded anyway), fall back to a direct DB
    // write matching the md-approve/md-reject contract.
    el.querySelectorAll('.dag-gate-approve').forEach(btn => {
      btn.addEventListener('click', () => {
        const top = document.getElementById('md-approve');
        if (top) { top.click(); return; }
      });
    });
    el.querySelectorAll('.dag-gate-reject').forEach(btn => {
      btn.addEventListener('click', () => {
        const top = document.getElementById('md-reject');
        if (top) { top.click(); return; }
      });
    });

    // "Show full output" toggle on each DAG node card.
    el.querySelectorAll('.dag-node-output-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.dag-node');
        const body = card?.querySelector('.dag-node-output-body');
        if (!body) return;
        const expanded = body.getAttribute('data-expanded') === 'true';
        const nodeId = card.getAttribute('data-node-id');
        const raw = (mission.node_results || {})[nodeId];
        const full = raw == null ? '' : (typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2));
        if (expanded) {
          body.textContent = full.length > 280 ? full.slice(0, 280) + '…' : full;
          body.setAttribute('data-expanded', 'false');
          btn.textContent = 'Show full output';
        } else {
          body.textContent = full;
          body.setAttribute('data-expanded', 'true');
          btn.textContent = 'Hide';
        }
      });
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
                await SB.client.from('mission_runs').update({ edited_content: newContent }).eq('id', mid);
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

  /* ── Inbox Captain helpers ──
     When the mission ran the Inbox Captain (or any agent whose result
     looks like the Captain's JSON schema), surface a quick stats row
     and a one-click link to the Gmail drafts folder. The demo payoff of
     "drafted by 9:02" is the drafts showing up in Gmail — this closes
     the loop from mission summary to the drafts themselves. */
  function _isInboxMission(mission, agent) {
    if (!mission) return false;
    if (mission.agent_id === 'bp-agent-inbox-captain') return true;
    if (agent && agent.id === 'bp-agent-inbox-captain') return true;
    if (mission.agent_name === 'Inbox Captain') return true;
    if (agent && agent.name === 'Inbox Captain') return true;
    return false;
  }

  function _parseInboxCaptainResult(resultText) {
    if (!resultText || typeof resultText !== 'string') return null;
    let raw = resultText.trim();
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const obj = JSON.parse(match[0]);
      const drafted = Array.isArray(obj.drafted) ? obj.drafted : [];
      const skipped = Array.isArray(obj.skipped) ? obj.skipped : [];
      const scanned = typeof obj.threads_scanned === 'number'
        ? obj.threads_scanned
        : drafted.length + skipped.length;
      if (!drafted.length && !skipped.length && !scanned) return null;
      return { scanned, drafted, skipped };
    } catch { return null; }
  }

  /* Gmail drafts URL targets the user's signed-in account when we can
     identify it. `authuser=<email>` wins over `/u/<index>` because the
     index depends on which order Chrome loaded the user's Google
     accounts — unstable across sessions. Falls back to `/u/0` for
     guest / unknown-email flows. */
  function _gmailDraftsUrl() {
    const email = (typeof State !== 'undefined' ? (State.get('user')?.email || '') : '') + '';
    if (email && /@/.test(email)) {
      return 'https://mail.google.com/mail/?authuser=' + encodeURIComponent(email) + '#drafts';
    }
    return 'https://mail.google.com/mail/u/0/#drafts';
  }

  function _renderInboxCaptainSummary(mission, agent) {
    if (!_isInboxMission(mission, agent)) return '';
    // Prefer the structured outcome column — it's authoritative, populated
    // at completion by MissionRunner._deriveOutcome. Fall back to parsing
    // mission.result for missions that ran before the outcome write-path
    // landed.
    let scanned, drafted, skipped;
    if (mission.outcome && mission.outcome.kind === 'drafts_reviewed') {
      scanned = mission.outcome.scanned ?? 0;
      drafted = Array.isArray(mission.outcome.items) ? mission.outcome.items : [];
      skipped = []; // not stored in outcome today; the count below is drafted-only
    } else {
      const parsed = _parseInboxCaptainResult(mission.result);
      if (!parsed) return '';
      scanned = parsed.scanned;
      drafted = parsed.drafted;
      skipped = parsed.skipped;
    }
    return `
      <div class="inbox-triage-stats" style="display:flex;gap:16px;padding:12px 0;border-bottom:1px solid var(--border,#333);margin-bottom:12px;font-size:.82rem">
        <div><strong style="font-size:1.1rem">${scanned}</strong> <span style="color:var(--text-muted)">scanned</span></div>
        <div><strong style="font-size:1.1rem;color:#22c55e">${drafted.length}</strong> <span style="color:var(--text-muted)">drafted</span></div>
        <div><strong style="font-size:1.1rem;color:var(--text-muted)">${skipped.length}</strong> <span style="color:var(--text-muted)">skipped</span></div>
      </div>
    `;
  }

  /* ── Sprint 4 — DAG inspector ───────────────────────────────────────
     Read-only rendering of a mission's workflow plan alongside the
     per-node outputs captured in mission_runs.node_results. Appears only for
     multi-node DAGs (plan_snapshot.nodes.length > 1 or shape='dag').
     Status is derived — plan_snapshot is the frozen blueprint;
     node_results is the actual execution record; the mission's top-level
     status pins the gate semantics (status='review' ⇒ gate is firing).
  ─────────────────────────────────────────────────────────────────── */

  function _isDagPlan(plan) {
    if (!plan || typeof plan !== 'object') return false;
    if (plan.shape === 'dag') return true;
    const nodes = Array.isArray(plan.nodes) ? plan.nodes : [];
    if (nodes.length > 1) return true;
    return nodes.some(n => n && (n.type === 'approval_gate' || n.type === 'persona_dispatch'));
  }

  function _nodeStatus(node, nodeResults, missionStatus) {
    if (!node) return 'pending';
    const key = node.id;
    const hasResult = nodeResults && Object.prototype.hasOwnProperty.call(nodeResults, key);
    if (!hasResult) return 'pending';
    const value = nodeResults[key];
    const str = typeof value === 'string' ? value : (value == null ? '' : JSON.stringify(value));
    if (str.startsWith('Error:')) return 'failed';
    if (node.type === 'approval_gate' && missionStatus === 'review') return 'gated';
    return 'completed';
  }

  function _statusPill(status) {
    const labels = {
      pending:   { label: 'Pending',   cls: 'dag-status-pending' },
      running:   { label: 'Running',   cls: 'dag-status-running' },
      completed: { label: 'Completed', cls: 'dag-status-completed' },
      failed:    { label: 'Failed',    cls: 'dag-status-failed' },
      gated:     { label: 'Awaiting review', cls: 'dag-status-gated' },
    };
    const { label, cls } = labels[status] || labels.pending;
    return `<span class="dag-status-pill ${cls}">${label}</span>`;
  }

  function _nodeTypeBadge(type) {
    if (!type || type === 'agent') return '';
    const pretty = String(type).replace(/_/g, ' ');
    return `<span class="dag-node-type-badge" data-node-type="${_esc(type)}">${_esc(pretty)}</span>`;
  }

  function _renderDagPanel(mission, missionId) {
    const plan = mission.plan_snapshot;
    if (!_isDagPlan(plan)) return '';

    const nodes = Array.isArray(plan.nodes) ? plan.nodes : [];
    const nodeResults = mission.node_results || {};
    const missionStatus = mission.status;

    const cards = nodes.map((node, i) =>
      _renderDagNodeCard(node, i, nodeResults, missionStatus, missionId, mission)
    ).join('');

    return `
      <div class="detail-section">
        <h3 class="detail-section-title">Workflow</h3>
        <div class="mission-dag-list" data-mission-id="${_esc(missionId)}">
          ${cards}
        </div>
      </div>
    `;
  }

  function _renderDagNodeCard(node, index, nodeResults, missionStatus, missionId, mission) {
    const label = node.label || node.config?.prompt || node.config?.label || node.id || `Step ${index + 1}`;
    const status = _nodeStatus(node, nodeResults, missionStatus);
    const rawOutput = nodeResults?.[node.id];
    const hasOutput = rawOutput != null && rawOutput !== '';
    const outputStr = hasOutput ? (typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput, null, 2)) : '';
    const outputTrimmed = outputStr.length > 280 ? outputStr.slice(0, 280) + '…' : outputStr;
    const outputIsLong = outputStr.length > 280;

    // Gate inline actions — only when this specific node is currently
    // pausing the mission. Match on node type AND mission status so
    // stale gates from completed/rejected missions don't re-surface.
    const gateIsLive = node.type === 'approval_gate'
      && missionStatus === 'review'
      && (!mission.approval_status || mission.approval_status === 'draft');

    const gateActions = gateIsLive
      ? `<div class="dag-gate-actions">
           <button class="btn btn-sm btn-primary dag-gate-approve" data-id="${_esc(missionId)}" style="background:#22c55e;border-color:#22c55e">✓ ${_esc(node.config?.approveLabel || 'Approve')}</button>
           <button class="btn btn-sm dag-gate-reject" data-id="${_esc(missionId)}" style="color:#f87171">✕ ${_esc(node.config?.rejectLabel || 'Reject')}</button>
         </div>`
      : '';

    return `
      <div class="dag-node" data-node-id="${_esc(node.id)}" data-node-status="${status}" data-node-type="${_esc(node.type || 'agent')}">
        <div class="dag-node-head">
          <span class="dag-node-index">${index + 1}</span>
          <div class="dag-node-heading">
            <div class="dag-node-title">${_esc(label)}</div>
            <div class="dag-node-meta">
              ${_nodeTypeBadge(node.type)}
              ${_statusPill(status)}
            </div>
          </div>
        </div>
        ${hasOutput ? `
          <div class="dag-node-output">
            <pre class="dag-node-output-body" data-expanded="false">${_esc(outputTrimmed)}</pre>
            ${outputIsLong ? `
              <button type="button" class="dag-node-output-toggle" data-full-output>Show full output</button>
            ` : ''}
          </div>
        ` : ''}
        ${node.type === 'approval_gate' && node.config?.reason ? `
          <div class="dag-node-gate-reason">${_esc(node.config.reason)}</div>
        ` : ''}
        ${gateActions}
      </div>
    `;
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

    // Restore videos (check if URL is actually an image)
    videos.forEach((vid, i) => {
      const isImage = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(vid.url);
      const mediaHtml = isImage
        ? `<img src="${vid.url}" alt="Generated content" class="mission-generated-image" loading="lazy"/>`
        : `<video src="${vid.url}" controls class="mission-generated-image" style="max-height:400px"></video>`;
      const dlLabel = isImage ? '⬇ Download Image' : '⬇ Download Video';
      processed = processed.replace(`%%VID_${i}%%`,
        `<div class="mission-image-wrap">${mediaHtml}<a href="${vid.url}" target="_blank" rel="noopener" class="mission-image-download" title="${dlLabel}">${dlLabel}</a></div>`
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

  return {
    get title() { return `${_N()} Detail`; },
    render,
    destroy,
    // Exposed for unit tests only — DAG inspector pure functions.
    _isDagPlan,
    _nodeStatus,
    _renderDagPanel,
  };
})();

/* ── Shared Mission Report View ── */
const SharedReportView = (() => {
  const _N  = () => Terminology.label('mission');
  const _Nl = () => Terminology.label('mission', { lowercase: true });
  const _esc = Utils.esc;

  function render(el, params) {
    const id = (params.id || '').replace('report-', '');
    // Short codes (8 chars, no dashes) = blueprint share links
    if (id.length <= 12 && !id.includes('-')) {
      el.innerHTML = '<div class="loading-state"><p>Loading shared blueprint...</p></div>';
      _loadSharedBlueprint(el, id);
      return;
    }
    el.innerHTML = `<div class="loading-state"><p>Loading ${_Nl()} report...</p></div>`;
    _loadReport(el, id);
  }

  async function _loadSharedBlueprint(el, code) {
    try {
      const shared = await Blueprints.importSharedBlueprint(code);
      const bp = shared.data;
      el.innerHTML = `
        <div class="detail-wrap">
          <div class="detail-header">
            <div class="detail-header-info">
              <h2 class="detail-name">${_esc(bp.name || 'Shared Blueprint')}</h2>
              <div class="detail-meta-row">
                <span class="badge-rarity badge-${(bp.rarity || 'common').toLowerCase()}">${_esc(bp.rarity || 'Common')}</span>
                <span style="color:var(--text-muted);font-size:.8rem">${_esc(shared.type)} blueprint</span>
              </div>
            </div>
          </div>
          <div class="detail-section">
            <h3 class="detail-section-title">Description</h3>
            <p style="color:var(--text-muted);font-size:.85rem">${_esc(bp.description || 'No description.')}</p>
          </div>
          ${bp.config && bp.config.tools && bp.config.tools.length ? `
            <div class="detail-section">
              <h3 class="detail-section-title">Tools</h3>
              <div style="display:flex;flex-wrap:wrap;gap:6px">${bp.config.tools.map(t => `<span class="agent-tool-tag">${_esc(t)}</span>`).join('')}</div>
            </div>
          ` : ''}
          <div class="detail-section" style="margin-top:1.5rem">
            <button class="btn btn-primary" id="import-shared-bp">Import This Blueprint</button>
          </div>
        </div>
      `;
      el.querySelector('#import-shared-bp')?.addEventListener('click', async () => {
        const btn = el.querySelector('#import-shared-bp');
        if (btn) btn.textContent = 'Importing...';
        try {
          if (shared.type === 'agent') {
            await Blueprints.activateAgent(bp.id || 'shared-' + code);
          } else {
            await Blueprints.activateShip(bp.id || 'shared-' + code);
          }
          if (typeof Gamification !== 'undefined') Gamification.addXP('install_blueprint');
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Imported!', message: bp.name + ' added to your collection.', type: 'system' });
          location.hash = '#/bridge';
        } catch (err) {
          if (btn) btn.textContent = 'Import Failed';
        }
      });
    } catch (err) {
      el.innerHTML = `<div class="app-empty"><h2>Blueprint Not Found</h2><p>${_esc(err.message || 'This share link may have expired.')}</p><div class="app-empty-acts"><a href="#/" class="btn btn-sm">Home</a></div></div>`;
    }
  }

  async function _loadReport(el, id) {
    let mission;
    try {
      mission = await SB.db('mission_runs').get(id);
    } catch(e) {
      mission = (State.get('missions') || []).find(m => m.id === id);
    }

    if (!mission) {
      el.innerHTML = `<div class="app-empty"><h2>Report Not Found</h2><p>This ${_Nl()} report could not be found.</p><div class="app-empty-acts"><a href="#/" class="btn btn-sm">Home</a></div></div>`;
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
              <span class="task-status-badge badge-${mission.status}">${_esc(Utils.titleCase(mission.status))}</span>
              <span class="task-priority-tag priority-${mission.priority}">${_esc(Utils.titleCase(mission.priority))}</span>
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

  return { get title() { return `${_N()} Report`; }, render };
})();
