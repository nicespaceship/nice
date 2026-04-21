/* ═══════════════════════════════════════════════════════════════════
   NICE — Home View (Bridge)
   Greeting + unified PromptPanel at bottom.
═══════════════════════════════════════════════════════════════════ */

const HomeView = (() => {
  const title = 'NICE SPACESHIP';
  const _esc = Utils.esc;

  /* ── Time-of-day greeting ── */
  function _greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function _userName() {
    const user = State.get('user');
    if (user?.user_metadata?.display_name) return user.user_metadata.display_name;
    if (user?.email) return user.email.split('@')[0];
    return 'Commander';
  }

  /* ── Render ── */
  function render(el) {
    const hasMessages = _hasMessages();

    el.innerHTML = `
      <div class="chat-home" id="chat-home">
        ${hasMessages ? _renderConversation() : _renderEmptyGreeting()}
      </div>
    `;

    // Home is a chat surface — reactor is the centerpiece behind the
    // greeting and prompt panel.
    if (typeof CoreReactor !== 'undefined') CoreReactor.setVisible(true);

    // Lock scroll on greeting view (no conversation)
    el.classList.toggle('view-no-scroll', !hasMessages);

    // Bind new chat button
    el.querySelector('#chat-home-new')?.addEventListener('click', () => {
      try { localStorage.removeItem(Utils.KEYS.aiMessages); } catch {}
      render(el);
    });

    // Dismiss checklist
    el.querySelector('#home-cl-dismiss')?.addEventListener('click', () => {
      localStorage.setItem(Utils.KEYS.checklistDismissed, '1');
      document.getElementById('home-checklist')?.remove();
    });

    // Checklist: "Run first mission" item opens prompt panel
    el.querySelectorAll('.home-cl-item:not(.done):not([href])').forEach(item => {
      item.addEventListener('click', () => {
        if (typeof PromptPanel !== 'undefined') PromptPanel.show();
      });
    });

    // Scroll conversation to bottom
    const feed = el.querySelector('#chat-home-feed');
    if (feed) feed.scrollTop = feed.scrollHeight;
  }

  function _renderEmptyGreeting() {
    const ships = State.get('user_spaceships') || [];
    const hasTeam = ships.length > 0;

    if (hasTeam) {
      // Returning user: show dashboard with stats
      const ship = ships[0];
      const agents = State.get('user_agents') || [];
      const allAgents = State.get('agents') || [];
      const crewCount = agents.filter(a => a.spaceship_id === ship.id).length;

      // Mission stats
      const missions = State.get('missions') || [];
      const running = missions.filter(m => m.status === 'running').length;
      const queued = missions.filter(m => m.status === 'queued').length;
      const completed = missions.filter(m => m.status === 'review' || m.status === 'completed').length;
      const failed = missions.filter(m => m.status === 'failed').length;

      // Token balance
      let tokenBalance = '';
      try {
        const bal = JSON.parse(localStorage.getItem(Utils.KEYS.tokenBalance) || '0');
        const formatted = typeof bal === 'number' ? (bal >= 1000000 ? (bal / 1000000).toFixed(1) + 'M' : bal >= 1000 ? (bal / 1000).toFixed(0) + 'K' : bal.toString()) : '—';
        tokenBalance = formatted;
      } catch { tokenBalance = '—'; }

      // XP + Rank
      const xp = parseInt(localStorage.getItem(Utils.KEYS.xp) || '0', 10);
      const rank = typeof Gamification !== 'undefined' ? Gamification.getRank(xp) : 'Ensign';

      // Recent activity (last 5 audit log entries)
      let recentActivity = '';
      if (typeof AuditLog !== 'undefined' && typeof AuditLog.getEntries === 'function') {
        const logs = AuditLog.getEntries().slice(-5).reverse();
        if (logs.length) {
          recentActivity = logs.map(l => {
            const ago = _timeAgo(l.timestamp || l.ts);
            const action = _esc(l.action || l.type || 'activity');
            return '<div class="home-activity-item"><span class="home-activity-action">' + action.replace(/_/g, ' ') + '</span><span class="home-activity-time">' + ago + '</span></div>';
          }).join('');
        }
      }

      return `
        <div class="chat-home-empty">
          <div class="chat-home-greeting">${_greeting()}, ${_esc(_userName())}</div>

          <div class="home-stats-grid">
            <div class="home-stat-card">
              <div class="home-stat-value">${allAgents.length}</div>
              <div class="home-stat-label">Agents</div>
            </div>
            <div class="home-stat-card">
              <div class="home-stat-value">${ships.length}</div>
              <div class="home-stat-label">Ships</div>
            </div>
            <div class="home-stat-card ${running > 0 ? 'home-stat-active' : ''}">
              <div class="home-stat-value">${running}${queued > 0 ? '<small>+' + queued + '</small>' : ''}</div>
              <div class="home-stat-label">${running > 0 ? 'Running' : 'Active'}</div>
            </div>
            <div class="home-stat-card">
              <div class="home-stat-value">${completed}</div>
              <div class="home-stat-label">Completed</div>
            </div>
            <div class="home-stat-card">
              <div class="home-stat-value">${tokenBalance}</div>
              <div class="home-stat-label">Tokens</div>
            </div>
            <div class="home-stat-card">
              <div class="home-stat-value">${_esc(rank)}</div>
              <div class="home-stat-label">${xp.toLocaleString()} XP</div>
            </div>
          </div>

          ${_renderChecklist(agents, missions, completed)}

          ${recentActivity ? '<div class="home-activity"><div class="home-activity-title">Recent Activity</div>' + recentActivity + '</div>' : ''}

          <div class="home-active-ship">
            <div class="home-ship-name">${_esc(ship.name || 'Your Spaceship')}</div>
            <div class="home-ship-meta">${crewCount} agent${crewCount !== 1 ? 's' : ''} deployed${failed > 0 ? ' · ' + failed + ' failed' : ''}</div>
          </div>
          <div class="home-quick-actions">
            <a href="#/bridge?tab=schematic" class="home-action">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-grid"/></svg>
              Schematic
            </a>
            <a href="#/bridge?tab=missions" class="home-action">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-task"/></svg>
              Missions
            </a>
            <a href="#/bridge" class="home-action">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-monitor"/></svg>
              Bridge
            </a>
            <a href="#/security" class="home-action">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-shield"/></svg>
              Security
            </a>
          </div>
          <p class="home-hint">Type a message below to run a mission</p>
        </div>
      `;
    }

    // New user / guest: show greeting + sign-in hint
    const isGuest = !State.get('user');
    return `
      <div class="chat-home-empty">
        <div class="chat-home-greeting">${_greeting()}, ${_esc(_userName())}</div>
        ${isGuest ? '<p class="home-guest-hint">Sign in to deploy agents and run missions</p>' : ''}
      </div>
    `;
  }

  /* ── Onboarding Checklist ── */
  function _renderChecklist(agents, missions, completedCount) {
    // Don't show if user dismissed it
    if (localStorage.getItem(Utils.KEYS.checklistDismissed)) return '';

    const steps = [
      {
        id: 'team',
        label: 'Deploy a spaceship',
        desc: 'Create your AI team',
        done: (State.get('user_spaceships') || []).length > 0,
        action: '#/bridge?tab=spaceship',
      },
      {
        id: 'agent',
        label: 'Activate an agent',
        desc: 'Add a crew member to your fleet',
        done: agents.length > 0,
        action: '#/bridge',
      },
      {
        id: 'mission',
        label: 'Run your first mission',
        desc: 'Send a task to any agent',
        done: completedCount > 0,
        action: null, // prompt panel
      },
      {
        id: 'integration',
        label: 'Connect an integration',
        desc: 'Link Gmail, Calendar, or Drive',
        done: _hasIntegration(),
        action: '#/security?tab=integrations',
      },
      {
        id: 'model',
        label: 'Enable a premium model',
        desc: 'Try Claude, GPT, or Gemini Pro',
        done: _hasPremiumModel(),
        action: '#/security?tab=integrations',
      },
    ];

    const doneCount = steps.filter(s => s.done).length;

    // Hide checklist if all steps complete
    if (doneCount >= steps.length) return '';

    const pct = Math.round((doneCount / steps.length) * 100);

    const items = steps.map(s => `
      <a ${s.action ? 'href="' + s.action + '"' : ''} class="home-cl-item${s.done ? ' done' : ''}" ${!s.action ? 'role="button" tabindex="0"' : ''}>
        <span class="home-cl-check">${s.done ? '✓' : ''}</span>
        <span class="home-cl-text">
          <span class="home-cl-label">${s.label}</span>
          <span class="home-cl-desc">${s.desc}</span>
        </span>
        ${!s.done ? '<span class="home-cl-arrow">→</span>' : ''}
      </a>
    `).join('');

    return `
      <div class="home-checklist" id="home-checklist">
        <div class="home-cl-header">
          <div>
            <div class="home-cl-title">Getting Started</div>
            <div class="home-cl-progress-text">${doneCount} of ${steps.length} complete</div>
          </div>
          <button class="home-cl-dismiss" id="home-cl-dismiss" title="Dismiss">&times;</button>
        </div>
        <div class="home-cl-bar"><div class="home-cl-bar-fill" style="width:${pct}%"></div></div>
        <div class="home-cl-items">${items}</div>
      </div>
    `;
  }

  function _hasIntegration() {
    try {
      const conns = JSON.parse(localStorage.getItem(Utils.KEYS.mcpConnections) || '[]');
      if (conns.length > 0) return true;
    } catch {}
    const mcpState = State.get('mcp_connections');
    return Array.isArray(mcpState) && mcpState.length > 0;
  }

  function _hasPremiumModel() {
    try {
      const models = JSON.parse(localStorage.getItem(Utils.KEYS.enabledModels) || '{}');
      // Any non-free model enabled
      return Object.entries(models).some(([id, enabled]) => {
        if (!enabled) return false;
        return !id.includes('flash') && !id.includes('lite');
      });
    } catch { return false; }
  }

  function _renderConversation() {
    let messages = [];
    try {
      const raw = localStorage.getItem(Utils.KEYS.aiMessages);
      messages = raw ? JSON.parse(raw) : [];
    } catch { messages = []; }

    const _md = typeof PromptPanel !== 'undefined' && PromptPanel._md ? PromptPanel._md : (t) => `<p>${_esc(t)}</p>`;

    let html = messages.map(m => {
      if (m.role === 'user') {
        return `<div class="monitor-user-msg"><div class="monitor-user-bubble">${_esc(m.text)}</div></div>`;
      } else if (m.role === 'system') {
        return `<div class="monitor-system-msg">${_esc(m.text)}</div>`;
      } else {
        const agentLabel = `<div class="monitor-card-agent">${_esc(m.agent || 'NICE')}</div>`;
        let text = m.text || '';
        text = text.replace(/\[ACTION:\s*.+?\s*\|\s*.+?\s*\]/g, '').replace(/\[THEME:\s*.+?\s*\]/gi, '').replace(/\[EXEC:\s*\w+\s*(?:\|.*?)?\s*\]/g, '').trim();
        const time = m.ts ? new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        return `<div class="monitor-card">${agentLabel}<div class="monitor-card-text">${_md(text)}</div><div class="monitor-card-meta">${time}</div></div>`;
      }
    }).join('');

    return `
      <div class="chat-home-conv">
        <button class="chat-home-new-btn" id="chat-home-new" title="New conversation">
          <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-plus"/></svg>
          New Chat
        </button>
        <div class="chat-home-feed" id="chat-home-feed">${html}</div>
      </div>
    `;
  }

  function _hasMessages() {
    try {
      const raw = localStorage.getItem(Utils.KEYS.aiMessages);
      const msgs = raw ? JSON.parse(raw) : [];
      return msgs.length > 0;
    } catch { return false; }
  }

  function _timeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    return days + 'd ago';
  }

  function destroy() {
    // No cleanup needed — PromptPanel is always floating
  }

  return { title, render, destroy };
})();
