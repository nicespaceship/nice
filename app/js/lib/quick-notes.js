/* ═══════════════════════════════════════════════════════════════════
   NICE — Quick Notes
   Persistent notepad accessible from anywhere via sidebar or shortcut.
   Notes stored in localStorage with auto-save.
═══════════════════════════════════════════════════════════════════ */

const QuickNotes = (() => {
  const STORAGE_KEY = Utils.KEYS.quickNotes;
  let _open = false;
  let _panelEl = null;
  let _saveTimer = null;

  function init() {
    _createPanel();
    _bindToggle();
  }

  function _createPanel() {
    _panelEl = document.createElement('div');
    _panelEl.className = 'qn-panel';
    _panelEl.id = 'quick-notes-panel';
    _panelEl.innerHTML = `
      <div class="qn-header">
        <span class="qn-title">Quick Notes</span>
        <div class="qn-header-actions">
          <button class="qn-btn" id="qn-clear" title="Clear all notes">Clear</button>
          <button class="qn-btn qn-close" id="qn-close" title="Close" aria-label="Close notes">&times;</button>
        </div>
      </div>
      <textarea class="qn-editor" id="qn-editor" placeholder="Jot down quick notes, ideas, reminders..."
        spellcheck="true" aria-label="Quick notes editor"></textarea>
      <div class="qn-footer">
        <span class="qn-status" id="qn-status">Ready</span>
        <span class="qn-count" id="qn-count">0 chars</span>
      </div>
    `;
    document.body.appendChild(_panelEl);

    // Load saved notes
    const editor = _panelEl.querySelector('#qn-editor');
    const saved = localStorage.getItem(STORAGE_KEY) || '';
    editor.value = saved;
    _updateCount(saved.length);

    // Auto-save on input with debounce
    editor.addEventListener('input', () => {
      _updateCount(editor.value.length);
      _updateStatus('Typing...');
      if (_saveTimer) clearTimeout(_saveTimer);
      _saveTimer = setTimeout(() => {
        localStorage.setItem(STORAGE_KEY, editor.value);
        _updateStatus('Saved');
      }, 600);
    });

    // Close button
    _panelEl.querySelector('#qn-close').addEventListener('click', toggle);

    // Clear button
    _panelEl.querySelector('#qn-clear').addEventListener('click', () => {
      if (editor.value.length === 0) return;
      editor.value = '';
      localStorage.setItem(STORAGE_KEY, '');
      _updateCount(0);
      _updateStatus('Cleared');
    });
  }

  function _bindToggle() {
    const btn = document.getElementById('btn-quick-notes');
    if (btn) btn.addEventListener('click', toggle);
  }

  function toggle() {
    _open = !_open;
    if (_panelEl) {
      _panelEl.classList.toggle('open', _open);
      if (_open) {
        const editor = _panelEl.querySelector('#qn-editor');
        if (editor) setTimeout(() => editor.focus(), 100);
      }
    }
    // Award XP for using notes
    if (_open && typeof Gamification !== 'undefined') {
      Gamification.addXP('use_notes', 2);
    }
  }

  function isOpen() { return _open; }

  function _updateStatus(text) {
    const el = _panelEl?.querySelector('#qn-status');
    if (el) el.textContent = text;
  }

  function _updateCount(len) {
    const el = _panelEl?.querySelector('#qn-count');
    if (el) el.textContent = len + ' chars';
  }

  return { init, toggle, isOpen };
})();
