/* ═══════════════════════════════════════════════════════════════════
   NICE — Activity Feed
   Live event stream from Supabase realtime + local actions.
═══════════════════════════════════════════════════════════════════ */

const ActivityFeed = (() => {
  const MAX_EVENTS = 50;
  let _events = [];
  let _subscriptions = [];
  let _initialized = false;

  function init() {
    if (_initialized) return;
    _initialized = true;

    // Subscribe to Supabase realtime if available
    if (typeof SB !== 'undefined' && SB.client) {
      try {
        _subscribeTable('agents', 'agent');
        _subscribeTable('tasks', 'mission');
      } catch (e) {
        console.warn('[ActivityFeed] Realtime subscription failed:', e);
      }
    }
  }

  function _subscribeTable(table, type) {
    try {
      const channel = SB.client
        .channel('activity-' + table)
        .on('postgres_changes', { event: '*', schema: 'public', table: table }, (payload) => {
          const evt = _payloadToEvent(payload, type);
          if (evt) addEvent(evt);
        })
        .subscribe();
      _subscriptions.push(channel);
    } catch (e) {
      // Silently fail — Supabase may not be configured
    }
  }

  function _payloadToEvent(payload, type) {
    const eventType = payload.eventType; // INSERT, UPDATE, DELETE
    const record = payload.new || payload.old || {};
    let description = '';
    let icon = '📡';

    if (type === 'agent') {
      icon = '🤖';
      if (eventType === 'INSERT') description = `New agent created: ${record.name || 'Unnamed'}`;
      else if (eventType === 'UPDATE') description = `Agent updated: ${record.name || 'Unnamed'}`;
      else if (eventType === 'DELETE') description = `Agent removed: ${record.name || 'Unnamed'}`;
    } else if (type === 'mission') {
      icon = '🎯';
      if (eventType === 'INSERT') description = `New mission: ${record.title || 'Untitled'}`;
      else if (eventType === 'UPDATE') description = `Mission status: ${record.status || 'updated'}`;
      else if (eventType === 'DELETE') description = `Mission removed: ${record.title || 'Untitled'}`;
    } else if (type === 'spaceship') {
      icon = '🚀';
      if (eventType === 'INSERT') description = `New ship launched: ${record.name || 'Unnamed'}`;
      else if (eventType === 'UPDATE') description = `Ship updated: ${record.name || 'Unnamed'}`;
      else if (eventType === 'DELETE') description = `Ship decommissioned: ${record.name || 'Unnamed'}`;
    }

    return {
      type,
      description,
      icon,
      actor: record.user_id || 'system',
      timestamp: new Date().toISOString(),
    };
  }

  function addEvent(event) {
    _events.unshift(event);
    if (_events.length > MAX_EVENTS) _events.length = MAX_EVENTS;

    // Notify any rendered feed widgets
    _refreshWidgets();
  }

  /** Push a local event (called by other modules) */
  function push(icon, description, type) {
    addEvent({
      type: type || 'system',
      description,
      icon: icon || '📡',
      actor: 'local',
      timestamp: new Date().toISOString(),
    });
  }

  function getEvents(limit) {
    return _events.slice(0, limit || MAX_EVENTS);
  }

  function _refreshWidgets() {
    document.querySelectorAll('.activity-feed').forEach(el => {
      _renderInto(el);
    });
  }

  function renderFeed(el) {
    el.innerHTML = `
      <div class="activity-feed-wrap">
        <div class="activity-feed-header">
          <span class="activity-feed-title">Live Activity</span>
          <button class="btn btn-xs activity-feed-toggle" id="af-toggle">—</button>
        </div>
        <div class="activity-feed" id="activity-feed-list"></div>
      </div>
    `;

    const list = document.getElementById('activity-feed-list');
    if (list) _renderInto(list);

    const toggleBtn = document.getElementById('af-toggle');
    toggleBtn?.addEventListener('click', () => {
      const feed = document.getElementById('activity-feed-list');
      if (!feed) return;
      const collapsed = feed.style.display === 'none';
      feed.style.display = collapsed ? '' : 'none';
      if (toggleBtn) toggleBtn.textContent = collapsed ? '—' : '+';
    });
  }

  function _renderInto(el) {
    const events = getEvents(15);
    if (!events.length) {
      el.innerHTML = '<div class="af-empty">No activity yet. Actions will appear here in real-time.</div>';
      return;
    }

    el.innerHTML = events.map(evt => {
      const time = typeof Gamification !== 'undefined'
        ? Gamification._toStardate(evt.timestamp)
        : _timeAgo(evt.timestamp);
      return `
        <div class="af-item">
          <span class="af-icon">${evt.icon}</span>
          <span class="af-desc">${_esc(evt.description)}</span>
          <span class="af-time">${time}</span>
        </div>`;
    }).join('');

    // Auto-scroll to top (newest)
    el.scrollTop = 0;
  }

  const _timeAgo = Utils.timeAgo;
  const _esc = Utils.esc;

  function destroy() {
    _subscriptions.forEach(ch => {
      try { ch.unsubscribe(); } catch(e) {}
    });
    _subscriptions = [];
    _initialized = false;
  }

  return { init, addEvent, push, getEvents, renderFeed, destroy };
})();
