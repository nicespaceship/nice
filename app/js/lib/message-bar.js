/* ═══════════════════════════════════════════════════════════════════
   NICE — Message Bar (AI Communications Feed)
   Scrolling ticker under the app header with expandable multi-line feed.
   Sources: welcome message, notifications, audit log, activity feed.
═══════════════════════════════════════════════════════════════════ */

const MessageBar = (() => {
  let _expanded = false;
  let _messages = [];
  let _refreshInterval = null;

  const _esc = Utils.esc;
  const _timeAgo = Utils.timeAgo;

  /* ── Message icons per type ── */
  const TYPE_ICONS = {
    system:         '#icon-settings',
    welcome:        '#icon-home',
    agent_error:    '#icon-alert',
    task_complete:  '#icon-check',
    task_failed:    '#icon-x',
    fleet_deployed: '#icon-spaceship',
    budget_alert:   '#icon-dollar',
    broadcast:      '#icon-comms',
    navigation:     '#icon-home',
    agent:          '#icon-agent',
    mission:        '#icon-task',
    spaceship:      '#icon-spaceship',
    auth:           '#icon-profile',
  };

  /* ── Collect messages from all sources ── */
  function _collectMessages() {
    const msgs = [];
    const user = typeof State !== 'undefined' ? State.get('user') : null;
    const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Pilot';

    // Welcome
    msgs.push({
      text: `Welcome back, ${displayName}. All systems operational.`,
      icon: '#icon-home',
      route: '#/',
      type: 'welcome',
      priority: 0,
    });

    // Recent notifications
    const notifs = (typeof State !== 'undefined' ? State.get('notifications') : null) || [];
    notifs.slice(0, 6).forEach(n => {
      msgs.push({
        text: n.title ? `${n.title} — ${n.message || ''}` : (n.message || 'Notification'),
        icon: TYPE_ICONS[n.type] || '#icon-bell',
        route: '#/comms',
        type: n.type || 'system',
        priority: 1,
        timestamp: n.created_at,
      });
    });

    // Audit log entries
    if (typeof AuditLog !== 'undefined') {
      AuditLog.getEntries({ limit: 5 }).forEach(entry => {
        const desc = entry.details?.description || entry.details?.name || `${entry.action} event`;
        msgs.push({
          text: desc,
          icon: TYPE_ICONS[entry.action] || '#icon-log',
          route: '#/log',
          type: entry.action,
          priority: 2,
          timestamp: entry.timestamp,
        });
      });
    }

    // Activity feed events
    if (typeof ActivityFeed !== 'undefined') {
      ActivityFeed.getEvents(5).forEach(evt => {
        msgs.push({
          text: evt.description,
          icon: TYPE_ICONS[evt.type] || '#icon-comms',
          route: '#/comms',
          type: evt.type,
          priority: 1,
          timestamp: evt.timestamp,
        });
      });
    }

    // System status
    msgs.push({
      text: 'NICE v3.5 — All subsystems nominal.',
      icon: '#icon-settings',
      route: '#/settings',
      type: 'system',
      priority: 3,
    });

    msgs.push({
      text: 'Agent fleet standing by for mission assignments.',
      icon: '#icon-agent',
      route: '#/blueprints/agents',
      type: 'system',
      priority: 3,
    });

    _messages = msgs;
    return msgs;
  }

  /* ── Render scrolling ticker (collapsed state) ── */
  function _renderTicker() {
    const bar = document.getElementById('nice-msg-bar');
    if (!bar) return;
    const track = bar.querySelector('.msg-bar-track');
    if (!track) return;

    const items = _messages.map(m => `
      <a href="${_esc(m.route)}" class="msg-bar-item" data-type="${_esc(m.type)}">
        <span class="msg-bar-dot"></span>
        <svg class="icon icon-xs" fill="none" stroke="currentColor" stroke-width="1.5"><use href="${m.icon}"/></svg>
        <span class="msg-bar-text">${_esc(m.text)}</span>
      </a>
    `).join('');

    // Duplicate content for seamless infinite scroll
    track.innerHTML = items + items;

    // Scale animation duration based on message count
    const dur = Math.max(30, _messages.length * 8);
    track.style.animationDuration = `${dur}s`;
  }

  /* ── Render expanded feed ── */
  function _renderExpanded() {
    const bar = document.getElementById('nice-msg-bar');
    if (!bar) return;
    const feed = bar.querySelector('.msg-bar-feed');
    if (!feed) return;

    feed.innerHTML = _messages.slice(0, 12).map(m => `
      <a href="${_esc(m.route)}" class="msg-bar-feed-item" data-type="${_esc(m.type)}">
        <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="${m.icon}"/></svg>
        <span class="msg-bar-feed-text">${_esc(m.text)}</span>
        ${m.timestamp ? `<span class="msg-bar-feed-time">${_timeAgo(m.timestamp)}</span>` : ''}
      </a>
    `).join('');
  }

  /* ── Toggle expand/collapse ── */
  function _toggle() {
    _expanded = !_expanded;
    const bar = document.getElementById('nice-msg-bar');
    if (!bar) return;
    bar.classList.toggle('expanded', _expanded);

    const btn = document.getElementById('msg-bar-toggle');
    if (btn) btn.setAttribute('aria-expanded', String(_expanded));

    if (_expanded) {
      _renderExpanded();
    }
  }

  /* ── Public: push a single message ── */
  function push(msg) {
    if (!msg || !msg.text) return;
    _messages.unshift({
      text: msg.text,
      icon: msg.icon || '#icon-comms',
      route: msg.route || '#/comms',
      type: msg.type || 'system',
      priority: msg.priority || 0,
      timestamp: msg.timestamp || new Date().toISOString(),
    });
    if (_messages.length > 20) _messages.length = 20;

    if (!_expanded) _renderTicker();
    else _renderExpanded();
  }

  /* ── Init ── */
  function init() {
    const bar = document.getElementById('nice-msg-bar');
    if (!bar) return;

    _collectMessages();
    _renderTicker();

    // Toggle button
    document.getElementById('msg-bar-toggle')?.addEventListener('click', _toggle);

    // Close expanded when clicking a feed item link
    bar.addEventListener('click', (e) => {
      const item = e.target.closest('.msg-bar-feed-item');
      if (item && _expanded) {
        _expanded = false;
        bar.classList.remove('expanded');
        const btn = document.getElementById('msg-bar-toggle');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
    });

    // Refresh every 30s
    _refreshInterval = setInterval(() => {
      _collectMessages();
      if (!_expanded) _renderTicker();
      else _renderExpanded();
    }, 30000);

    // Listen for state changes
    if (typeof State !== 'undefined') {
      State.on('notifications', () => {
        _collectMessages();
        if (!_expanded) _renderTicker();
        else _renderExpanded();
      });
    }
  }

  /* ── Destroy ── */
  function destroy() {
    if (_refreshInterval) {
      clearInterval(_refreshInterval);
      _refreshInterval = null;
    }
  }

  return { init, push, destroy };
})();
