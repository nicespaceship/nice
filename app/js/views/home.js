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

    // Lock scroll on greeting view (no conversation)
    el.classList.toggle('view-no-scroll', !hasMessages);

    // Bind new chat button
    el.querySelector('#chat-home-new')?.addEventListener('click', () => {
      try { localStorage.removeItem(Utils.KEYS.aiMessages); } catch {}
      render(el);
    });

    // Bind "Build an AI Team" CTA
    el.querySelector('#home-build-team')?.addEventListener('click', () => {
      if (typeof CrewDesigner !== 'undefined') CrewDesigner.open();
      else if (typeof SetupWizard !== 'undefined') SetupWizard.open();
    });

    // Scroll conversation to bottom
    const feed = el.querySelector('#chat-home-feed');
    if (feed) feed.scrollTop = feed.scrollHeight;
  }

  function _renderEmptyGreeting() {
    const hudRings = '<div class="jv-sch-hud" aria-hidden="true"><div class="jv-hud-r jv-hud-r1"></div><div class="jv-hud-r jv-hud-r2"></div><div class="jv-hud-r jv-hud-r3"></div><div class="jv-hud-r jv-hud-r4"></div><div class="jv-hud-r jv-hud-r5"></div><div class="jv-hud-r jv-hud-r6"></div><div class="jv-hud-ticks"></div></div>';
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
      if (typeof AuditLog !== 'undefined') {
        const logs = AuditLog.list().slice(-5).reverse();
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
          ${hudRings}
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

    // New user: show build CTA
    return `
      <div class="chat-home-empty">
        ${hudRings}
        <div class="chat-home-greeting">${_greeting()}, ${_esc(_userName())}</div>
        <button class="btn cd-btn-primary cd-home-cta" id="home-build-team" style="margin-top:24px;padding:12px 28px;font-size:.9rem;">Build an AI Team</button>
      </div>
    `;
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
