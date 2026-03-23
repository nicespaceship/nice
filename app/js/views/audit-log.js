/* ═══════════════════════════════════════════════════════════════════
   NICE — Captain's Log View
   Filterable timeline of all user actions.
═══════════════════════════════════════════════════════════════════ */

const AuditLogView = (() => {
  const title = "Log";
  const _esc = Utils.esc;

  const CATEGORIES = [
    { value: 'all',        label: 'All Events' },
    { value: 'navigation', label: 'Navigation' },
    { value: 'agent',      label: 'Agent' },
    { value: 'mission',    label: 'Mission' },
    { value: 'spaceship',  label: 'Spaceship' },
    { value: 'system',     label: 'System' },
    { value: 'auth',       label: 'Auth' },
  ];

  const ICONS = {
    navigation: '#icon-home',
    agent:      '#icon-agent',
    mission:    '#icon-task',
    spaceship:  '#icon-spaceship',
    system:     '#icon-settings',
    auth:       '#icon-profile',
  };

  const COLORS = {
    navigation: 'var(--text-muted)',
    agent:      'var(--accent)',
    mission:    '#22c55e',
    spaceship:  '#6366f1',
    system:     '#f59e0b',
    auth:       '#06b6d4',
  };

  function render(el) {
    const user = State.get('user');
    if (!user) return _authPrompt(el, "the captain's log");

    // Award XP for viewing the log
    if (typeof Gamification !== 'undefined') Gamification.addXP('view_log');

    el.innerHTML = `
      <div class="log-wrap">
        <div class="log-header">
          <div>
            <h1 class="log-title">Log</h1>
            <p class="log-sub">Complete record of all actions and events.</p>
          </div>
          <span class="log-count" id="log-count"></span>
        </div>

        <div class="log-filter-bar">
          <select id="log-filter-cat" class="filter-select">
            ${CATEGORIES.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
          </select>
          <input type="text" id="log-filter-search" class="filter-input" placeholder="Search events..." />
          <button class="btn btn-sm btn-danger" id="log-clear">Clear Log</button>
        </div>

        <div class="log-timeline" id="log-timeline">
          <div class="loading-state"><p>Loading...</p></div>
        </div>
      </div>
    `;

    _loadEntries();

    document.getElementById('log-filter-cat')?.addEventListener('change', _loadEntries);
    document.getElementById('log-filter-search')?.addEventListener('input', _debounce(_loadEntries, 200));
    document.getElementById('log-clear')?.addEventListener('click', () => {
      if (!confirm('Clear the entire Captain\'s Log? This cannot be undone.')) return;
      AuditLog.clearEntries();
      _loadEntries();
    });
  }

  function _loadEntries() {
    const cat = document.getElementById('log-filter-cat')?.value || 'all';
    const search = document.getElementById('log-filter-search')?.value || '';
    const entries = AuditLog.getEntries({ action: cat, search: search, limit: 200 });

    const countEl = document.getElementById('log-count');
    if (countEl) countEl.textContent = entries.length + ' entries';

    const timeline = document.getElementById('log-timeline');
    if (!timeline) return;

    if (!entries.length) {
      timeline.innerHTML = '<div class="log-empty"><p>No log entries found.</p></div>';
      return;
    }

    timeline.innerHTML = entries.map(entry => {
      const icon = ICONS[entry.action] || '#icon-settings';
      const color = COLORS[entry.action] || 'var(--text-muted)';
      const stardate = typeof Gamification !== 'undefined'
        ? Gamification._toStardate(entry.timestamp)
        : new Date(entry.timestamp).toLocaleString();
      const desc = _esc(entry.details.description || entry.details.name || entry.details.path || '—');
      const badge = entry.action;

      return `
        <div class="log-entry">
          <div class="log-entry-icon" style="color:${color}">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="${icon}"/></svg>
          </div>
          <div class="log-entry-body">
            <div class="log-entry-top">
              <span class="log-entry-badge" style="color:${color}">${badge}</span>
              <span class="log-entry-time">${stardate}</span>
            </div>
            <span class="log-entry-desc">${desc}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  function _debounce(fn, ms) {
    let t;
    return () => { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  return { title, render };
})();
