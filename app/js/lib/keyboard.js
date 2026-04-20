/* ═══════════════════════════════════════════════════════════════════
   NICE — Keyboard Shortcuts
   Chord-style keyboard shortcuts for power users.
═══════════════════════════════════════════════════════════════════ */

const Keyboard = (() => {
  let _firstKey = null;
  let _timer = null;
  const CHORD_TIMEOUT = 500;

  const SHORTCUTS = [
    // Navigation chords: G + letter
    { chord: ['g', 'h'], label: 'Go Bridge', action: () => Router.navigate('#/') },
    { chord: ['g', 'a'], label: 'Go Agents',       action: () => Router.navigate('#/bridge/agents') },
    { chord: ['g', 's'], label: 'Go Shipyard',     action: () => Router.navigate('#/bridge/spaceships') },
    { chord: ['g', 'm'], label: 'Go Missions',     action: () => Router.navigate('#/missions') },
    { chord: ['g', 'b'], label: 'Go Blueprints',   action: () => Router.navigate('#/bridge') },
    { chord: ['g', 'n'], label: 'Go Analytics',    action: () => Router.navigate('#/analytics') },
    { chord: ['g', 'c'], label: 'Go Comms',        action: () => Router.navigate('#/comms') },
    { chord: ['g', 'v'], label: 'Go Vault',        action: () => Router.navigate('#/vault') },
    { chord: ['g', 'p'], label: 'Go Profile',      action: () => Router.navigate('#/profile') },
    { chord: ['g', 't'], label: 'Go Settings',     action: () => Router.navigate('#/settings') },
    { chord: ['g', 'w'], label: 'Go Workflows',    action: () => Router.navigate('#/workflows') },
    { chord: ['g', 'r'], label: 'Go Missions', action: () => Router.navigate('#/missions') },
    { chord: ['g', 'l'], label: 'Go Captain\'s Log', action: () => Router.navigate('#/log') },
    // Creation chords: N + letter
    { chord: ['n', 'a'], label: 'New Agent',        action: () => Router.navigate('#/bridge/agents/new') },
    // Single key
    { chord: ['?'],      label: 'Show Shortcuts',   action: () => Keyboard.showHelp() },
    // Modifier shortcuts (handled separately in _handleKey, listed here for help overlay)
    { chord: ['⌘','⇧','P'], label: 'Toggle Preview',  action: () => {} },
    { chord: ['⌘','⇧','O'], label: 'New Chat',        action: () => {} },
  ];

  function init() {
    document.addEventListener('keydown', _handleKey);
    _createHelpOverlay();
  }

  function _handleKey(e) {
    // Cmd/Ctrl+Shift+P → toggle preview panel
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      if (typeof PreviewPanel !== 'undefined') PreviewPanel.toggle();
      return;
    }

    // Cmd/Ctrl+Shift+O → new chat (Claude/ChatGPT convention)
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      const btn = document.getElementById('side-chat-new');
      if (btn) btn.click();
      return;
    }

    // Ignore when typing in inputs
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
    // Ignore if modifier held
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const key = e.key.toLowerCase();

    if (_firstKey) {
      clearTimeout(_timer);
      const match = SHORTCUTS.find(s => s.chord.length === 2 && s.chord[0] === _firstKey && s.chord[1] === key);
      _firstKey = null;
      if (match) {
        e.preventDefault();
        match.action();
        return;
      }
    }

    // Check single-key shortcuts
    const single = SHORTCUTS.find(s => s.chord.length === 1 && s.chord[0] === key);
    if (single) {
      e.preventDefault();
      single.action();
      return;
    }

    // Start chord
    const isChordStarter = SHORTCUTS.some(s => s.chord.length === 2 && s.chord[0] === key);
    if (isChordStarter) {
      _firstKey = key;
      _timer = setTimeout(() => { _firstKey = null; }, CHORD_TIMEOUT);
    }
  }

  function _createHelpOverlay() {
    const el = document.createElement('div');
    el.id = 'shortcut-help';
    el.className = 'modal-overlay';

    const navRows = SHORTCUTS.filter(s => s.chord[0] === 'g').map(s => _shortcutRow(s)).join('');
    const actionRows = SHORTCUTS.filter(s => s.chord[0] === 'n').map(s => _shortcutRow(s)).join('');
    const globalRows = '<div class="kb-row"><kbd>Cmd</kbd>+<kbd>K</kbd><span>Command Palette</span></div>' +
      SHORTCUTS.filter(s => s.chord[0] === '?').map(s => _shortcutRow(s)).join('');

    el.innerHTML = `
      <div class="modal-box" style="max-width:520px">
        <div class="modal-hdr">
          <h3 class="modal-title">Keyboard Shortcuts</h3>
          <button class="modal-close kb-close" aria-label="Close">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-x"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="kb-shortcut-grid">
            <div class="kb-section-title">Navigation</div>
            ${navRows}
            <div class="kb-section-title">Actions</div>
            ${actionRows}
            <div class="kb-section-title">Global</div>
            ${globalRows}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    el.querySelector('.kb-close').addEventListener('click', () => el.classList.remove('open'));
    el.addEventListener('click', (e) => { if (e.target === el) el.classList.remove('open'); });
  }

  function _shortcutRow(s) {
    const keys = s.chord.map(k => '<kbd>' + k.toUpperCase() + '</kbd>').join(' then ');
    return '<div class="kb-row">' + keys + '<span>' + s.label + '</span></div>';
  }

  function showHelp() {
    document.getElementById('shortcut-help')?.classList.add('open');
  }

  return { init, showHelp, SHORTCUTS };
})();
