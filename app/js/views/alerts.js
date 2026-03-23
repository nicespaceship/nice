/* ═══════════════════════════════════════════════════════════════════
   NICE — Alerts View
   Full-page notification list with mark-read and filtering.
═══════════════════════════════════════════════════════════════════ */

const AlertsView = (() => {
  const title = 'Alerts';

  const TYPES = {
    'mission_complete': { icon: '#icon-check',     color: '#22c55e', label: 'Mission' },
    'mission_failed':   { icon: '#icon-alert',     color: '#ef4444', label: 'Mission' },
    'agent_ready':      { icon: '#icon-agent',     color: '#3b82f6', label: 'Agent' },
    'fleet_deployed':   { icon: '#icon-spaceship', color: '#6366f1', label: 'Fleet' },
    'budget_alert':     { icon: '#icon-alert',     color: '#f59e0b', label: 'Budget' },
    'system':           { icon: '#icon-settings',  color: 'var(--accent)', label: 'System' },
    'broadcast':        { icon: '#icon-comms',     color: '#06b6d4', label: 'Broadcast' },
  };

  function render(el) {
    const notifs = State.get('notifications') || [];

    el.innerHTML = `
      <div class="alerts-view">
        <div class="alerts-header">
          <h2 class="alerts-title">Alerts</h2>
          ${notifs.some(n => !n.read) ? '<button class="btn btn-sm" id="alerts-mark-all">Mark all read</button>' : ''}
        </div>
        <div class="alerts-list" id="alerts-list">
          ${notifs.length ? notifs.map(n => _renderItem(n)).join('') : '<div class="alerts-empty"><p>No alerts yet.</p><p class="text-muted">Notifications from missions, agents, and system events will appear here.</p></div>'}
        </div>
      </div>
    `;

    // Mark all read
    document.getElementById('alerts-mark-all')?.addEventListener('click', () => {
      notifs.forEach(n => n.read = true);
      State.set('notifications', notifs);
      render(el);
    });

    // Mark individual read
    el.querySelectorAll('.alerts-item.unread').forEach(item => {
      item.addEventListener('click', () => {
        const n = notifs.find(x => x.id === item.dataset.id);
        if (n) { n.read = true; State.set('notifications', notifs); render(el); }
      });
    });
  }

  function _renderItem(n) {
    const t = TYPES[n.type] || TYPES.system;
    const time = _timeAgo(n.created_at);
    return `
      <div class="alerts-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
        <div class="alerts-item-icon" style="color:${t.color}">
          <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="${t.icon}"/></svg>
        </div>
        <div class="alerts-item-body">
          <div class="alerts-item-top">
            <span class="alerts-item-title">${n.title || ''}</span>
            <span class="alerts-item-time">${time}</span>
          </div>
          <p class="alerts-item-msg">${n.message || ''}</p>
        </div>
      </div>
    `;
  }

  const _timeAgo = Utils.timeAgo;

  return { title, render };
})();
