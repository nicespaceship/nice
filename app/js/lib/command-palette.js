/* ═══════════════════════════════════════════════════════════════════
   NICE — Command Palette (Cmd+K)
   Global fuzzy-search overlay for quick navigation and actions.
═══════════════════════════════════════════════════════════════════ */

const CommandPalette = (() => {
  let _isOpen = false;
  let _results = [];
  let _selectedIdx = 0;
  let _el = null;

  const _BASE_ROUTES = [
    { label: 'Bridge', skinKey: 'titles.home', path: '/',             keywords: 'home dashboard bridge',     icon: '#icon-home' },
    { label: 'Agents',       skinKey: 'nav.agents', path: '/blueprints/agents',       keywords: 'agents list manage',          icon: '#icon-agent' },
    { label: 'New Agent',    skinKey: 'newAgent', path: '/blueprints/agents/new',   keywords: 'create new agent builder',           icon: '#icon-plus' },
    { label: 'Shipyard',     skinKey: 'nav.spaceships', path: '/blueprints/spaceships',   keywords: 'spaceships shipyard fleet ships',    icon: '#icon-spaceship' },
    { label: 'Missions',     skinKey: 'nav.missions', path: '/missions',     keywords: 'missions tasks queue jobs',          icon: '#icon-task' },
    { label: 'Blueprint Catalog', skinKey: 'nav.blueprints', path: '/blueprints', keywords: 'blueprints catalog agents orchestrator templates', icon: '#icon-blueprint' },
    { label: 'Operations',   skinKey: 'nav.analytics', path: '/analytics',    keywords: 'operations analytics charts stats performance', icon: '#icon-analytics' },
    { label: 'Cost Tracker', skinKey: 'nav.cost', path: '/cost',         keywords: 'cost budget spending money',         icon: '#icon-dollar' },
    { label: 'Vault',        skinKey: 'nav.vault', path: '/vault',        keywords: 'vault secrets keys api tokens',      icon: '#icon-key' },
    { label: 'Security',     path: '/security',     keywords: 'security agent permissions threat audit compliance access policies', icon: '#icon-lock' },
    { label: "Log", skinKey: 'nav.log', path: '/log',          keywords: 'log audit captain history events missions operations',  icon: '#icon-monitor' },
    { label: 'Dock', skinKey: 'nav.dock', path: '/dock',        keywords: 'dock fleet ships schematic agents progression', icon: '#icon-spaceship' },
    { label: 'Profile',      skinKey: 'nav.profile', path: '/profile',      keywords: 'profile account user avatar',        icon: '#icon-profile' },
    { label: 'Settings',     skinKey: 'nav.settings', path: '/settings',     keywords: 'settings preferences config',        icon: '#icon-settings' },
    { label: 'Theme Editor', skinKey: 'nav.theme-creator', path: '/theme-editor', keywords: 'theme editor creator custom colors builder', icon: '#icon-settings' },
    { label: 'Workflows',     skinKey: 'nav.workflows', path: '/workflows',      keywords: 'workflows pipelines automation nodes', icon: '#icon-build' },
  ];

  function _getRoutes() {
    if (typeof Skin === 'undefined' || !Skin.isActive()) return _BASE_ROUTES;
    return _BASE_ROUTES.map(r => r.skinKey ? { ...r, label: Skin.text(r.skinKey, r.label) } : r);
  }

  const ACTIONS = [
    { label: 'Create Agent',    action: () => Router.navigate('#/bridge/agents/new'),  keywords: 'new create agent build',         icon: '#icon-plus' },
    { label: 'New Spaceship',   action: () => Router.navigate('#/bridge/spaceships'),  keywords: 'new create spaceship fleet',     icon: '#icon-spaceship' },
    { label: 'Toggle Theme',    action: _cycleTheme,                            keywords: 'theme dark light switch hud',    icon: '#icon-settings' },
    { label: 'Keyboard Shortcuts', action: () => { if (typeof Keyboard !== 'undefined') Keyboard.showHelp(); }, keywords: 'keyboard shortcuts help keys', icon: '#icon-build' },
    { label: 'Setup Wizard',       action: () => { if (typeof SetupWizard !== 'undefined') SetupWizard.open(); }, keywords: 'setup wizard guided questionnaire new spaceship', icon: '#icon-zap' },
  ];

  function _cycleTheme() {
    const themes = ['nice','hal-9000','grid','solar','matrix','retro','lcars','pixel'];
    const current = document.documentElement.getAttribute('data-theme');
    const idx = themes.indexOf(current);
    Theme.set(themes[(idx + 1) % themes.length]);
  }

  const _esc = Utils.esc;

  function init() {
    if (_el) return; // Prevent duplicate initialization
    _el = document.createElement('div');
    _el.id = 'cmd-palette';
    _el.className = 'cmd-palette';
    _el.innerHTML = `
      <div class="cmd-palette-backdrop"></div>
      <div class="cmd-palette-box">
        <div class="cmd-palette-input-wrap">
          <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-search"/></svg>
          <input type="text" class="cmd-palette-input" id="cmd-input" placeholder="Search views, actions..." autocomplete="off" />
          <kbd class="cmd-palette-kbd">ESC</kbd>
        </div>
        <div class="cmd-palette-results" id="cmd-results"></div>
      </div>
    `;
    document.body.appendChild(_el);

    // Keyboard shortcut: Cmd+K / Ctrl+K
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        _isOpen ? close() : open();
      }
      if (e.key === 'Escape' && _isOpen) close();
    });

    // Backdrop click
    _el.querySelector('.cmd-palette-backdrop')?.addEventListener('click', close);

    // Input
    const input = document.getElementById('cmd-input');
    if (input) {
      input.addEventListener('input', () => _search(input.value));
      input.addEventListener('keydown', _handleKeys);
    }

    // Delegated click handler for results (avoids listener accumulation)
    const results = document.getElementById('cmd-results');
    if (results) {
      results.addEventListener('click', (e) => {
        const el = e.target.closest('.cmd-result');
        if (el && el.dataset.idx != null) _execute(parseInt(el.dataset.idx));
      });
    }
  }

  function open() {
    _isOpen = true;
    _el.classList.add('open');
    _selectedIdx = 0;
    const input = document.getElementById('cmd-input');
    input.value = '';
    input.focus();
    _search('');
  }

  function close() {
    _isOpen = false;
    _el.classList.remove('open');
  }

  function _search(query) {
    const q = query.toLowerCase().trim();
    let items = [];

    _getRoutes().forEach(r => {
      const score = _fuzzyScore(q, r.label + ' ' + r.keywords);
      if (score > 0 || !q) items.push({ ...r, score, type: 'nav' });
    });

    ACTIONS.forEach(a => {
      const score = _fuzzyScore(q, a.label + ' ' + a.keywords);
      if (score > 0 || !q) items.push({ ...a, score, type: 'action' });
    });

    // Live data search — only when there's a query
    if (q && typeof State !== 'undefined') {
      (State.get('agents') || []).forEach(agent => {
        const score = _fuzzyScore(q, (agent.name || '') + ' ' + (agent.role || ''));
        if (score > 0) items.push({
          label: agent.name || 'Unnamed Agent', path: '/blueprints/agents/' + agent.id,
          icon: '#icon-agent', score: score - 1, type: 'data', meta: agent.role || 'Agent'
        });
      });
      (State.get('missions') || []).forEach(m => {
        const score = _fuzzyScore(q, m.title || '');
        if (score > 0) items.push({
          label: m.title || 'Untitled', path: '/missions',
          icon: '#icon-task', score: score - 1, type: 'data', meta: m.status || 'Mission'
        });
      });
      (State.get('spaceships') || []).forEach(s => {
        const score = _fuzzyScore(q, s.name || '');
        if (score > 0) items.push({
          label: s.name || 'Unnamed Ship', path: '/blueprints/spaceships/' + s.id,
          icon: '#icon-spaceship', score: score - 1, type: 'data', meta: 'Spaceship'
        });
      });
    }

    items.sort((a, b) => b.score - a.score);
    _results = items.slice(0, 12);
    _selectedIdx = 0;
    _renderResults();
  }

  function _fuzzyScore(query, text) {
    if (!query) return 1;
    text = text.toLowerCase();
    if (text.includes(query)) return 10 + query.length;
    let qi = 0;
    for (let i = 0; i < text.length && qi < query.length; i++) {
      if (text[i] === query[qi]) qi++;
    }
    return qi === query.length ? qi : 0;
  }

  function _renderResults() {
    const container = document.getElementById('cmd-results');
    if (!_results.length) {
      container.innerHTML = '<div class="cmd-no-results">No results found</div>';
      return;
    }
    // Insert separator before data results
    let hasData = false;
    const html = _results.map((r, i) => {
      let sep = '';
      if (r.type === 'data' && !hasData) {
        hasData = true;
        sep = '<div class="cmd-result-sep">Data</div>';
      }
      const typeLabel = r.type === 'nav' ? 'Navigate' : r.type === 'action' ? 'Action' : (r.meta || 'Data');
      return sep + `
        <div class="cmd-result ${i === _selectedIdx ? 'selected' : ''}" data-idx="${i}">
          <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="${r.icon}"/></svg>
          <span class="cmd-result-label">${_esc(r.label)}</span>
          <span class="cmd-result-type">${typeLabel}</span>
        </div>`;
    }).join('');
    container.innerHTML = html;
  }

  function _handleKeys(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _selectedIdx = (_selectedIdx + 1) % _results.length;
      _renderResults();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _selectedIdx = (_selectedIdx - 1 + _results.length) % _results.length;
      _renderResults();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      _execute(_selectedIdx);
    }
  }

  function _execute(idx) {
    const item = _results[idx];
    if (!item) return;
    close();
    if (item.type === 'nav' || item.type === 'data') {
      Router.navigate('#' + item.path);
    } else if (item.action) {
      item.action();
    }
  }

  return { init, open, close };
})();
