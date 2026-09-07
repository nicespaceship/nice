/* ═══════════════════════════════════════════════════════════════════
   NICE — Captain's Log View  (Mission Control treatment)
   Visual timeline with category gauges, animated entries, pipeline.
═══════════════════════════════════════════════════════════════════ */

const AuditLogView = (() => {
  const title = "Log";
  const _esc = Utils.esc;
  let _activeCat = 'all';

  const CATEGORIES = [
    { value: 'all',        label: 'All',        icon: '◈', color: 'var(--accent)' },
    { value: 'navigation', label: 'Navigation', icon: '⌖', color: 'var(--text-muted)' },
    { value: 'agent',      label: 'Agent',      icon: '⚙', color: 'var(--accent)' },
    { value: 'mission',    label: 'Mission',    icon: '⚡', color: '#22c55e' },
    { value: 'spaceship',  label: 'Ship',       icon: '◇', color: '#6366f1' },
    { value: 'system',     label: 'System',     icon: '⊚', color: '#f59e0b' },
    { value: 'auth',       label: 'Auth',       icon: '⊕', color: '#06b6d4' },
  ];

  const ICONS = {
    navigation: '#icon-home',
    agent:      '#icon-agent',
    mission:    '#icon-task',
    spaceship:  '#icon-spaceship',
    system:     '#icon-settings',
    auth:       '#icon-profile',
  };

  function _getCatMeta(action) {
    return CATEGORIES.find(c => c.value === action) || CATEGORIES[0];
  }

  // Notifications share this timeline now that the bell is gone. Map each
  // notification type onto a Log category so it shows under "All" and its
  // bucket, then normalize to the audit-entry shape.
  const NOTIF_CAT = {
    mission_complete: 'mission', mission_failed: 'mission',
    task_complete: 'mission',    task_failed: 'mission',
    agent_ready: 'agent',        agent_error: 'agent',
    fleet_deployed: 'spaceship',
    budget_alert: 'system',      system: 'system', broadcast: 'system',
  };

  function _notifEntries() {
    const notifs = (typeof State !== 'undefined' && State.get('notifications')) || [];
    return notifs.map(n => ({
      id: 'notif-' + (n.id || n.created_at || ''),
      action: NOTIF_CAT[n.type] || 'system',
      timestamp: n.created_at || 0,
      details: { description: n.title ? (n.message ? `${n.title}: ${n.message}` : n.title) : (n.message || '') },
    }));
  }

  // Audit events + notification history, most-recent first. Both sources share
  // the entry shape; re-sort the union so they interleave by time.
  function _allEntries() {
    const audit = (typeof AuditLog !== 'undefined')
      ? AuditLog.getEntries({ action: 'all', search: '', limit: 500 })
      : [];
    return audit.concat(_notifEntries())
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  function _filter(entries, { action, search, limit }) {
    let out = entries;
    if (action && action !== 'all') out = out.filter(e => e.action === action);
    if (search) {
      const q = search.toLowerCase();
      out = out.filter(e => {
        const desc = (e.details?.description || e.details?.name || e.details?.path || '').toLowerCase();
        return desc.includes(q) || e.action.includes(q);
      });
    }
    return limit ? out.slice(0, limit) : out;
  }

  function _countsByCategory() {
    const all = _allEntries();
    const counts = { all: all.length };
    CATEGORIES.forEach(c => { if (c.value !== 'all') counts[c.value] = 0; });
    all.forEach(e => { if (counts[e.action] !== undefined) counts[e.action]++; });
    return counts;
  }

  // Category filter pills + search + count + Clear for the shared
  // #bridge-subnav. Pills follow the Outbox status-filter pattern (26px,
  // count chip, solid-fill active in the category color). Events bind in
  // render() via global ids, so living outside the view body works.
  function getToolbarActions() {
    const counts = _countsByCategory();

    const pills = CATEGORIES.map(c => {
      const active = _activeCat === c.value ? ' active' : '';
      const styleAttr = c.value === 'all' ? '' : ` style="--log-cat-color:${c.color}"`;
      return `<button class="log-filter-pill${active}" data-cat="${c.value}"${styleAttr}>${_esc(c.label)} <span class="log-pill-count">${counts[c.value] || 0}</span></button>`;
    }).join('');

    return `
      <div class="log-filters">${pills}</div>
      <div class="search-box">
        <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-search"/></svg>
        <input type="text" id="log-filter-search" class="search-input" placeholder="Search events..." />
      </div>
      <button class="btn btn-sm" id="log-clear" title="Clear log">Clear</button>`;
  }

  function render(el) {
    const user = State.get('user');
    if (!user) return _authPrompt(el, "the captain's log");
    if (typeof Gamification !== 'undefined') Gamification.addXP('view_log');

    el.innerHTML = `
      <div class="log-wrap">
        <!-- Category pills, search, count + Clear render in the shared
             #bridge-subnav (see getToolbarActions). -->

        <!-- Timeline -->
        <div class="log-timeline" id="log-timeline">
          <div class="loading-state"><p>Loading...</p></div>
        </div>
      </div>
    `;

    _loadEntries();

    // Category pill clicks (delegated off #bridge-subnav so they survive any
    // pill re-render and don't fight with the central subnav teardown hook).
    const subnav = document.getElementById('bridge-subnav');
    const onSubnavClick = (e) => {
      const pill = e.target.closest('.log-filter-pill');
      if (!pill) return;
      const cat = pill.dataset.cat;
      _activeCat = (_activeCat === cat && cat !== 'all') ? 'all' : cat;
      subnav.querySelectorAll('.log-filter-pill').forEach(b => b.classList.toggle('active', b.dataset.cat === _activeCat));
      _loadEntries();
    };
    subnav?.addEventListener('click', onSubnavClick);

    // Scroll affordance — toggle .scroll-start / .scroll-end on .log-filters
    // so the fade mask + chevron pseudo-elements update with scroll position.
    const filters = subnav?.querySelector('.log-filters');
    const updateScrollEdges = () => {
      if (!filters) return;
      const atStart = filters.scrollLeft <= 1;
      const atEnd = filters.scrollLeft + filters.clientWidth >= filters.scrollWidth - 1;
      filters.classList.toggle('scroll-start', !atStart);
      filters.classList.toggle('scroll-end', atEnd);
    };
    filters?.addEventListener('scroll', updateScrollEdges, { passive: true });
    updateScrollEdges();

    // Hook into the central subnav cleanup so we don't leak across tab swaps.
    if (subnav) subnav._subnavCleanup = () => {
      subnav.removeEventListener('click', onSubnavClick);
      filters?.removeEventListener('scroll', updateScrollEdges);
    };

    document.getElementById('log-filter-search')?.addEventListener('input', _debounce(_loadEntries, 200));
    document.getElementById('log-clear')?.addEventListener('click', () => {
      if (!confirm('Clear the entire Captain\'s Log? This cannot be undone.')) return;
      AuditLog.clearEntries();
      _activeCat = 'all';
      // Recompute pill counts inline (the pills live outside this view's
      // render output). Notification history isn't cleared by this — it's
      // server-backed — so counts come from the merged source, not zero.
      const counts = _countsByCategory();
      subnav?.querySelectorAll('.log-filter-pill').forEach(b => {
        b.classList.toggle('active', b.dataset.cat === 'all');
        const c = b.querySelector('.log-pill-count');
        if (c) c.textContent = counts[b.dataset.cat] || 0;
      });
      _loadEntries();
    });
  }

  function _loadEntries() {
    const search = document.getElementById('log-filter-search')?.value || '';

    // Apply filters over the merged audit + notification timeline
    const cat = _activeCat;
    const entries = _filter(_allEntries(), { action: cat, search, limit: 200 });

    const timeline = document.getElementById('log-timeline');
    if (!timeline) return;

    if (!entries.length) {
      timeline.innerHTML = '<div class="log-empty"><p>No log entries found.</p></div>';
      return;
    }

    // Group by date
    const groups = {};
    entries.forEach(entry => {
      const date = new Date(entry.timestamp).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      if (!groups[date]) groups[date] = [];
      groups[date].push(entry);
    });

    let html = '';
    for (const [date, dateEntries] of Object.entries(groups)) {
      html += `<div class="log-date-group">
        <div class="log-date-label">${date}</div>
        <div class="log-date-entries">
          ${dateEntries.map((entry, i) => _renderEntry(entry, i)).join('')}
        </div>
      </div>`;
    }
    timeline.innerHTML = html;
  }

  function _renderEntry(entry, index) {
    const icon = ICONS[entry.action] || '#icon-settings';
    const meta = _getCatMeta(entry.action);
    const color = meta.color;
    const stardate = typeof Gamification !== 'undefined'
      ? Gamification._toStardate(entry.timestamp)
      : new Date(entry.timestamp).toLocaleTimeString();
    const desc = _esc(entry.details?.description || entry.details?.name || entry.details?.path || '—');

    return `
      <div class="log-entry log-entry-anim" style="animation-delay:${Math.min(index * 30, 300)}ms">
        <div class="log-entry-line" style="background:${color}"></div>
        <div class="log-entry-dot" style="border-color:${color}"></div>
        <div class="log-entry-icon" style="color:${color}">
          <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="${icon}"/></svg>
        </div>
        <div class="log-entry-body">
          <div class="log-entry-top">
            <span class="log-entry-badge" style="color:${color}">${meta.icon} ${entry.action}</span>
            <span class="log-entry-time">${stardate}</span>
          </div>
          <span class="log-entry-desc">${desc}</span>
        </div>
      </div>`;
  }

  function _debounce(fn, ms) {
    let t;
    return () => { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  return { title, render, getToolbarActions };
})();
