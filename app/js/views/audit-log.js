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

  function render(el) {
    const user = State.get('user');
    if (!user) return _authPrompt(el, "the captain's log");
    if (typeof Gamification !== 'undefined') Gamification.addXP('view_log');

    el.innerHTML = `
      <div class="log-wrap">
        <!-- Category Gauge Strip -->
        <div class="log-gauge-strip" id="log-gauges"></div>

        <!-- Toolbar -->
        <div class="log-toolbar">
          <div class="search-box">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-search"/></svg>
            <input type="text" id="log-filter-search" class="search-input" placeholder="Search events..." />
          </div>
          <span class="log-count" id="log-count"></span>
          <button class="btn btn-sm" id="log-clear" title="Clear log">Clear</button>
        </div>

        <!-- Timeline -->
        <div class="log-timeline" id="log-timeline">
          <div class="loading-state"><p>Loading...</p></div>
        </div>
      </div>
    `;

    _loadEntries();

    // Category gauge clicks
    document.getElementById('log-gauges')?.addEventListener('click', (e) => {
      const gauge = e.target.closest('.log-gauge');
      if (!gauge) return;
      const cat = gauge.dataset.cat;
      _activeCat = (_activeCat === cat && cat !== 'all') ? 'all' : cat;
      _loadEntries();
    });

    document.getElementById('log-filter-search')?.addEventListener('input', _debounce(_loadEntries, 200));
    document.getElementById('log-clear')?.addEventListener('click', () => {
      if (!confirm('Clear the entire Captain\'s Log? This cannot be undone.')) return;
      AuditLog.clearEntries();
      _loadEntries();
    });
  }

  function _renderGauges(allEntries) {
    const strip = document.getElementById('log-gauges');
    if (!strip) return;

    // Count per category
    const counts = {};
    CATEGORIES.forEach(c => { counts[c.value] = 0; });
    counts.all = allEntries.length;
    allEntries.forEach(e => { if (counts[e.action] !== undefined) counts[e.action]++; });

    strip.innerHTML = CATEGORIES.filter(c => c.value !== 'all').map(c => {
      const count = counts[c.value] || 0;
      const active = _activeCat === c.value ? 'log-gauge-active' : '';
      const pct = allEntries.length ? Math.round((count / allEntries.length) * 100) : 0;
      return `
        <button class="log-gauge ${active}" data-cat="${c.value}" style="--log-cat-color:${c.color}">
          <span class="log-gauge-icon">${c.icon}</span>
          <span class="log-gauge-num">${count}</span>
          <span class="log-gauge-label">${c.label}</span>
          <div class="log-gauge-bar"><div class="log-gauge-fill" style="width:${pct}%"></div></div>
        </button>`;
    }).join('');
  }

  function _loadEntries() {
    const search = document.getElementById('log-filter-search')?.value || '';
    const allEntries = AuditLog.getEntries({ action: 'all', search: '', limit: 500 });

    // Render gauges from unfiltered data
    _renderGauges(allEntries);

    // Apply filters
    const cat = _activeCat;
    const entries = AuditLog.getEntries({ action: cat, search, limit: 200 });

    const countEl = document.getElementById('log-count');
    if (countEl) countEl.textContent = entries.length + ' entries';

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

  return { title, render };
})();
