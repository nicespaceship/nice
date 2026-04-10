/* ═══════════════════════════════════════════════════════════════════
   NICE — Ship's Log View
   Browse past command history across all spaceships.
   Entries grouped by spaceship, with role badges and timestamps.
═══════════════════════════════════════════════════════════════════ */

const ShipLogView = (() => {
  const title = "Log";
  const _esc = Utils.esc;
  let _channel = null;

  function render(el) {
    const user = State.get('user');
    if (!user) return _authPrompt(el, "the Log");

    el.innerHTML = `
      <div class="log-view-wrap">
        <div class="view-topbar">
          <div class="view-topbar-l">
            <div class="search-box">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-search"/></svg>
              <input type="text" id="slog-search" class="search-input" placeholder="Search log entries..." />
            </div>
            <select id="slog-filter" class="filter-select">
              <option value="">All Roles</option>
              <option value="user">User</option>
              <option value="agent">Agent</option>
              <option value="system">System</option>
            </select>
            <select id="slog-scope" class="filter-select" aria-label="Log scope">
              <option value="mine">My Agents</option>
              <option value="station">Station Members</option>
            </select>
          </div>
          <button class="btn btn-sm" id="slog-refresh">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-settings"/></svg>
            Refresh
          </button>
        </div>

        <div class="task-stats-bar" id="slog-stats"></div>

        <div id="slog-entries" class="slog-entries">
          <div class="loading-state"><p>Loading log entries...</p></div>
        </div>
      </div>
    `;

    _renderStats();
    _loadEntries();
    _bindEvents(el);
    _subscribeRealtime();
  }

  function _renderStats() {
    const el = document.getElementById('slog-stats');
    if (!el) return;

    const xp = parseInt(localStorage.getItem(Utils.KEYS.xp) || '0', 10);
    const ranks = ['Ensign','Lieutenant JG','Lieutenant','Lt Commander','Commander','Captain','Fleet Captain','Commodore','Rear Admiral','Vice Admiral','Admiral','Fleet Admiral'];
    const thresholds = [0, 10000, 25000, 50000, 100000, 200000, 350000, 500000, 750000, 1000000, 1500000, 2500000];
    let rankIdx = 0;
    for (let i = ranks.length - 1; i >= 0; i--) { if (xp >= thresholds[i]) { rankIdx = i; break; } }
    const rank = ranks[rankIdx];

    const agents = (State.get('agents') || []).length;
    const ships = (State.get('spaceships') || []).length;
    const enabledMdls = State.get('enabled_models') || {};
    const connections = Object.keys(enabledMdls).filter(k => enabledMdls[k]).length;

    el.innerHTML = `
      <div class="task-stat"><span class="task-stat-num">${rank}</span><span class="task-stat-label">Rank</span></div>
      <div class="task-stat"><span class="task-stat-num hl">${xp.toLocaleString()}</span><span class="task-stat-label">XP</span></div>
      <div class="task-stat"><span class="task-stat-num">${agents}</span><span class="task-stat-label">Agents</span></div>
      <div class="task-stat"><span class="task-stat-num">${ships}</span><span class="task-stat-label">Ships</span></div>
      <div class="task-stat"><span class="task-stat-num">${connections}</span><span class="task-stat-label">LLMs</span></div>
    `;
  }

  async function _loadEntries() {
    let entries = [];
    try {
      if (typeof ShipLog !== 'undefined') {
        entries = await ShipLog.getEntries(null, 100);
      }
    } catch (e) {
      console.warn("[ShipLogView] Failed to load entries:", e.message);
    }

    // Also check sessionStorage for local entries
    if (!entries.length) {
      try {
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && key.startsWith('nice-ship-log-')) {
            const local = JSON.parse(sessionStorage.getItem(key) || '[]');
            entries = entries.concat(local);
          }
        }
      } catch { /* ignore */ }
    }

    // Sort by created_at descending
    entries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    State.set('shipLogEntries', entries);
    _renderEntries(entries);
    return entries;
  }

  function _renderEntries(entries) {
    const container = document.getElementById('slog-entries');
    if (!container) return;

    if (!entries || !entries.length) {
      container.innerHTML = `
        <div class="app-empty">
          <svg class="app-empty-icon" fill="none" stroke="currentColor" stroke-width="1.2"><use href="#icon-comms"/></svg>
          <h2>No Log Entries</h2>
          <p>Send a command via NICE AI to start building your Log.</p>
          <div class="app-empty-acts">
            <button class="btn btn-primary btn-sm" onclick="if(typeof PromptPanel!=='undefined')PromptPanel.toggle()">
              Open NICE AI
            </button>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = entries.map(e => {
      const isUser = e.role === 'user';
      const isAgent = e.role === 'agent';
      const roleClass = isUser ? 'slog-role-user' : isAgent ? 'slog-role-agent' : 'slog-role-system';
      const roleLabel = isUser ? 'USER' : isAgent ? 'AGENT' : 'SYSTEM';
      const agentName = e.agent_id ? _lookupAgentName(e.agent_id) : null;
      const time = _formatTime(e.created_at);
      const meta = e.metadata || {};
      const modelBadge = meta.model && meta.model !== 'mock' ? `<span class="slog-model">${_esc(meta.model)}</span>` : '';
      const sourceBadge = meta.source === 'llm' ? '<span class="slog-source slog-source-live">LIVE</span>' : meta.source === 'mock' ? '<span class="slog-source slog-source-mock">MOCK</span>' : '';
      const tokenInfo = meta.tokens_used ? `<span class="slog-tokens">${meta.tokens_used} tok</span>` : '';
      const durationInfo = meta.duration_ms ? `<span class="slog-duration">${meta.duration_ms}ms</span>` : '';

      return `
        <div class="slog-entry ${roleClass}">
          <div class="slog-entry-header">
            <span class="slog-role-badge ${roleClass}">${roleLabel}</span>
            ${agentName ? `<span class="slog-agent-name">${_esc(agentName)}</span>` : ''}
            <span class="slog-time">${time}</span>
            <div class="slog-meta-badges">${sourceBadge}${modelBadge}${tokenInfo}${durationInfo}</div>
          </div>
          <div class="slog-entry-content">${_esc(e.content)}</div>
        </div>
      `;
    }).join('');
  }

  function _lookupAgentName(agentId) {
    if (typeof BlueprintStore !== 'undefined') {
      const bp = BlueprintStore.getAgent(agentId);
      if (bp) return bp.name;
    }
    return agentId;
  }

  function _formatTime(iso) {
    if (!iso) return '';
    return (typeof Utils !== 'undefined' && Utils.timeAgo) ? Utils.timeAgo(iso) : new Date(iso).toLocaleString();
  }

  function _bindEvents(el) {
    document.getElementById('slog-search')?.addEventListener('input', _applyFilters);
    document.getElementById('slog-filter')?.addEventListener('change', _applyFilters);
    document.getElementById('slog-scope')?.addEventListener('change', _handleScopeChange);
    document.getElementById('slog-refresh')?.addEventListener('click', _loadEntries);
  }

  async function _handleScopeChange() {
    const scope = document.getElementById('slog-scope')?.value || 'mine';
    if (scope === 'station') {
      await _loadStationEntries();
    } else {
      _loadEntries();
    }
  }

  async function _loadStationEntries() {
    let entries = [];
    try {
      // Get station agent IDs: agents from all station members
      const stations = State.get('stations') || [];
      const agentIds = [];
      for (const station of stations) {
        if (station.docked && station.docked.length) {
          // Collect agent IDs from docked ships (these are cross-org)
          for (const dock of station.docked) {
            if (dock.agent_ids) agentIds.push(...dock.agent_ids);
          }
        }
      }

      // Also include own agents
      const agents = State.get('agents') || [];
      agents.forEach(r => agentIds.push(r.id));

      // Query ship_log for all station-scoped agents
      if (agentIds.length && typeof SB !== 'undefined') {
        entries = await SB.db('ship_log').list({ orderBy: 'created_at', limit: 100 });
        // Filter by known agent IDs if data is available
        if (agentIds.length) {
          const idSet = new Set(agentIds);
          // Only filter if entries have agent_id; otherwise show all
          const filtered = entries.filter(e => !e.agent_id || idSet.has(e.agent_id));
          if (filtered.length) entries = filtered;
        }
      }
    } catch (err) {
      console.warn('[ShipLogView] Station entries failed:', err.message);
    }

    entries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    State.set('shipLogEntries', entries);
    _renderEntries(entries);
  }

  function _applyFilters() {
    const q = (document.getElementById('slog-search')?.value || '').toLowerCase();
    const role = document.getElementById('slog-filter')?.value || '';
    let entries = State.get('shipLogEntries') || [];
    if (q) entries = entries.filter(e => (e.content || '').toLowerCase().includes(q));
    if (role) entries = entries.filter(e => e.role === role);
    _renderEntries(entries);
  }

  function _subscribeRealtime() {
    if (typeof ShipLog !== 'undefined') {
      ShipLog.subscribe(null, () => {
        _loadEntries().then(() => {
          _autoScrollToBottom();
        });
      });
    }
  }

  function _autoScrollToBottom() {
    const container = document.getElementById('slog-entries');
    if (!container) return;
    // Only auto-scroll if user is already near the top (since entries are descending)
    // or if the container just loaded new entries
    container.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function destroy() {
    if (typeof ShipLog !== 'undefined') ShipLog.unsubscribe();
  }

  return { title, render, destroy };
})();
