/* ═══════════════════════════════════════════════════════════════════
   NICE — Command Palette (Cmd+K)
   Global fuzzy-search overlay for quick navigation and actions.
═══════════════════════════════════════════════════════════════════ */

const CommandPalette = (() => {
  let _isOpen = false;
  let _results = [];
  let _selectedIdx = 0;
  let _el = null;

  // Static commands (nav + UI actions) are defined once on the command bus
  // via NavCommands (command bus Phase 2); the palette projects them and
  // dispatches by id through ToolRegistry.execute() in _execute(). Theme-aware
  // labels re-resolve on every open because NavCommands.list() re-resolves
  // Terminology + Skin per call.
  function _staticCommands() {
    return (typeof NavCommands !== 'undefined') ? NavCommands.list() : [];
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

    _staticCommands().forEach(c => {
      const score = _fuzzyScore(q, c.label + ' ' + c.keywords);
      if (score > 0 || !q) items.push({ id: c.id, label: c.label, icon: c.icon, score, type: c.kind });
    });

    // Live data search — only when there's a query
    if (q && typeof State !== 'undefined') {
      (State.get('agents') || []).forEach(agent => {
        const score = _fuzzyScore(q, (agent.name || '') + ' ' + (agent.role || ''));
        if (score > 0) items.push({
          label: agent.name || 'Unnamed Agent', path: '/bridge/agents/' + agent.id,
          icon: '#icon-agent', score: score - 1, type: 'data', meta: agent.role || 'Agent'
        });
      });
      (State.get('missions') || []).forEach(m => {
        const score = _fuzzyScore(q, m.title || '');
        if (score > 0) items.push({
          label: m.title || 'Untitled', path: '/missions',
          icon: '#icon-task', score: score - 1, type: 'data', meta: m.status || Terminology.label('mission')
        });
      });
      (State.get('spaceships') || []).forEach(s => {
        const score = _fuzzyScore(q, s.name || '');
        if (score > 0) items.push({
          label: s.name || 'Unnamed Ship', path: '/bridge/spaceships/' + s.id,
          icon: '#icon-spaceship', score: score - 1, type: 'data', meta: 'Spaceship'
        });
      });
    }

    items.sort((a, b) => b.score - a.score);
    _results = items.slice(0, 12);
    _selectedIdx = 0;
    _renderResults();
    return _results;
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
    if (!container) return;
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
    // Bus commands (nav + action) dispatch by id through the registry — one
    // definition, shared with chat and the LLM. Live data results still
    // navigate by their path.
    if (item.id && typeof ToolRegistry !== 'undefined') {
      Promise.resolve(ToolRegistry.execute(item.id)).catch(err =>
        console.warn('[CommandPalette] command "' + item.id + '" failed:', err));
    } else if (item.path) {
      Router.navigate('#' + item.path);
    }
  }

  return { init, open, close, _search };
})();
