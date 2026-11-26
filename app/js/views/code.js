/* ═══════════════════════════════════════════════════════════════════
   NICE — Code
   Route: #/code (the Code side of the NICE / Code switch)

   One agent working on one folder on the user's computer. It runs in the
   desktop app, whose host (desktop/code-host.js) reaches the folder and a
   shell through window.NiceDesktop.code. On the website this page says so.

   Layout, after Claude Code's: the conversation on the left with the
   prompt bar under it; a closable panel on the right with Files and
   Terminal tabs.

   Models: NICE's hosted ones (a NICE account) or the user's own API keys,
   which the desktop app keeps and calls with (NiceDesktop.llm, see
   desktop/llm-host.js); the page only learns which providers have a key.

   The agent reads, lists and searches the folder on its own, and asks
   before it edits or writes a file or runs a command (CodeTools). The
   permission mode in the prompt bar and "Always allow" answers last for
   the session and are cleared when the folder changes.
═══════════════════════════════════════════════════════════════════ */

const CodeView = (() => {
  const title = 'Code';
  const _esc = Utils.esc;
  const _attr = Utils.escAttr;
  const PANEL_KEY = Utils.KEYS.codePanel;   // { open, tab }
  const MODEL_KEY = Utils.KEYS.codeModel;
  const TABS = ['files', 'terminal'];
  const TERM_MAX_CHARS = 200000;
  const SEND_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';
  const STOP_ICON = '<span class="code-stop-square" aria-hidden="true"></span>';
  const STOPPING_TEXT = 'Stopping. Code drops the reply when it arrives, and then you can send a new message.';
  const MAX_STEPS = 30;
  const STEP_DETAIL_MAX = 4000;     // characters of a tool result shown in its step line
  const LIVE_OUT_MAX = 20000;       // characters of a running command's output kept for the working line
  const LIVE_OUT_LINES = 12;
  const PREVIEW_LINES = 40;         // lines of a new file shown in its permission prompt
  const MODES = [
    { id: 'ask', label: 'Ask before edits' },
    { id: 'edits', label: 'Edit automatically' },
    { id: 'bypass', label: 'Bypass permissions' },
  ];

  let _el = null;
  let _ws = null;            // { root, name } of the open folder
  let _offRunData = null;
  // Bumped whenever the folder changes. Replies, file reads and command
  // output that come back for an older generation are dropped.
  let _gen = 0;

  // Conversation, kept across visits until the folder changes.
  let _thread = [];          // { role: 'user'|'assistant'|'note', text }
  let _convo = null;
  let _convoBlueprint = null;
  let _turn = null;          // { gen, stopAsked } while a reply is on its way
  let _lastThought = '';     // the agent's text shown before its last tool call

  // Permissions, for this session
  let _mode = 'ask';
  let _allowEdits = false;            // "Always allow" on an edit or write
  const _allowCmds = new Set();       // command prefixes allowed for the session
  let _pending = null;                // { gen, d, input, resolve } while a prompt waits
  // The command the agent is running: its tag and id from the host's
  // 'start' event, and its output so far for the working line.
  let _agentRun = null;               // { tag, id, out }

  // Files tab
  const _dirCache = new Map();   // dir path → { entries, truncated }
  const _expanded = new Set(['.']);
  // Links that listed as folders. Refresh clears _dirCache but not this, so
  // an open linked folder stays open.
  const _linkDirs = new Set();
  // Each drawn tree row → { path, type, open }. Clicks and focus read a
  // row's path from here, never from an attribute: HTML parsing turns a \r
  // in one into \n, and macOS puts a file named "Icon\r" in some folders.
  const _rowInfo = new WeakMap();
  let _openFile = null;          // { path, content, totalLines, endLine } | { path, error }
  let _treeSeq = 0;              // the latest tree paint wins
  let _readSeq = 0;              // the latest file click wins

  // Models on the user's own keys: provider id → { label, models: [{ id, label }] }
  let _ownModels = new Map();
  let _ownLoad = null;           // the load in flight
  let _keysReturn = null;        // what gets focus back when API keys closes

  // Terminal tab
  let _termText = '';
  // While a command runs: its tag, the id the host's 'start' event gives
  // it, and whether Stop was asked for before that id came.
  let _termRun = null;           // { tag, id, stopAsked }
  let _runSeq = 0;
  let _termHistory = [];
  let _termHistoryAt = -1;

  const _host = () => (typeof window !== 'undefined' && window.NiceDesktop && window.NiceDesktop.code) || null;
  const _llm = () => (typeof window !== 'undefined' && window.NiceDesktop && window.NiceDesktop.llm) || null;
  const _isOwnKey = (id) => typeof id === 'string' && id.startsWith('byo:');
  const _busyNow = () => !!_turn && _turn.gen === _gen;

  function _panelState() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(PANEL_KEY) || '{}') || {}; } catch { s = {}; }
    return { open: s.open !== false, tab: TABS.includes(s.tab) ? s.tab : 'files' };
  }
  function _savePanel(s) { try { localStorage.setItem(PANEL_KEY, JSON.stringify(s)); } catch {} }

  /* ── Render ─────────────────────────────────────────────────────── */

  async function render(el) {
    _el = el;
    const host = _host();
    if (!host) { _renderWebNotice(el); return; }

    if (!_offRunData) _offRunData = host.onRunData(_onRunData);
    let ws = null;
    try { ws = await host.workspace(); } catch { ws = null; }
    if (_el !== el) return;
    if (!ws) { _renderOpenFolder(el); return; }
    if (!_ws || _ws.root !== ws.root) _resetForFolder(ws);
    _renderWorkspace(el);
  }

  function _renderWebNotice(el) {
    el.innerHTML = `
      <div class="code-empty">
        <svg class="code-empty-icon" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><use href="#icon-terminal"/></svg>
        <h1 class="code-empty-title">Code runs in the NICE desktop app</h1>
        <p class="code-empty-text">Code opens a folder on your computer and puts its files and a terminal next to a chat. The agent reads the code, edits files and runs commands there, asking you first before it changes anything. A web page can't reach your files or a terminal, so Code lives in the desktop app.</p>
        <a class="btn btn-sm" href="#/">Back to NICE</a>
      </div>`;
  }

  function _renderOpenFolder(el) {
    el.innerHTML = `
      <div class="code-empty">
        <svg class="code-empty-icon" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><use href="#icon-folder"/></svg>
        <h1 class="code-empty-title">Open a folder</h1>
        <p class="code-empty-text">Code works in one folder. The agent reads its files on its own and asks before it edits one or runs a command; you can browse the files and run commands too.</p>
        <button type="button" class="btn btn-primary btn-sm" id="code-open-folder">Open folder</button>
      </div>`;
    el.querySelector('#code-open-folder').addEventListener('click', _openFolder);
  }

  async function _openFolder() {
    const host = _host();
    if (!host) return;
    try {
      const ws = await host.openFolder();
      if (!ws) return;
      _resetForFolder(ws);
      if (_el) _renderWorkspace(_el);
    } catch (e) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Could not open the folder', message: e.message || String(e), type: 'error' });
    }
  }

  function _resetForFolder(ws) {
    _gen++;
    _ws = ws;
    _thread = [];
    _convo = null;
    _convoBlueprint = null;
    _lastThought = '';
    _answer(false);
    _mode = 'ask';
    _allowEdits = false;
    _allowCmds.clear();
    _agentRun = null;
    _dirCache.clear();
    _expanded.clear();
    _expanded.add('.');
    _openFile = null;
    _linkDirs.clear();
    _termText = '';
    _keysReturn = null;
    // No kill from here: by now host.openFolder() has swapped the workspace,
    // so a kill would reach the new folder and find nothing. The
    // code:open-folder handler in desktop/main.js stops the old folder's
    // commands when it retires that workspace.
    _termRun = null;
  }

  // #app-view is a polite live region. The panel body repaints whole trees,
  // files and terminal output, so it opts out; the thread is its own log.
  function _renderWorkspace(el) {
    el.innerHTML = `
      <div class="code-view">
        <section class="code-chat" aria-label="Conversation">
          <header class="code-chat-hdr">
            <button type="button" class="code-folder" id="code-change-folder" title="${_attr(_ws.root)}">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><use href="#icon-folder"/></svg>
              <span>${_esc(_ws.name)}</span>
            </button>
            <div class="code-chat-tools">
              <button type="button" class="code-icon-btn" id="code-keys" aria-label="API keys" title="API keys"><svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><use href="#icon-key"/></svg></button>
              <button type="button" class="code-icon-btn" data-panel="files" aria-label="Files" title="Files"><svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><use href="#icon-folder"/></svg></button>
              <button type="button" class="code-icon-btn" data-panel="terminal" aria-label="Terminal" title="Terminal"><svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><use href="#icon-terminal"/></svg></button>
            </div>
          </header>
          <div class="code-thread" id="code-thread" role="log" aria-live="polite" aria-label="Messages"></div>
          <form class="code-prompt" id="code-prompt">
            <textarea id="code-input" rows="1" placeholder="${_attr('Ask Code to do something in ' + _ws.name)}" aria-label="Message Code"></textarea>
            <div class="code-prompt-bar">
              <div class="code-prompt-opts">
                <select id="code-mode" class="code-model" aria-label="Permissions">${MODES.map(m => `<option value="${m.id}"${m.id === _mode ? ' selected' : ''}>${_esc(m.label)}</option>`).join('')}</select>
                <select id="code-model" class="code-model" aria-label="Model">${_modelOptions()}</select>
              </div>
              <button type="submit" class="code-send" id="code-send" aria-label="Send"></button>
            </div>
          </form>
        </section>
        <aside class="code-panel" aria-label="Files and terminal">
          <div class="code-panel-hdr">
            <div class="code-panel-tabs" role="tablist" aria-label="Panel">
              <button type="button" role="tab" class="code-panel-tab" id="code-tab-files" data-tab="files" aria-controls="code-panel-body">Files</button>
              <button type="button" role="tab" class="code-panel-tab" id="code-tab-terminal" data-tab="terminal" aria-controls="code-panel-body">Terminal</button>
            </div>
            <button type="button" class="code-icon-btn code-panel-close" id="code-panel-close" aria-label="Close panel" title="Close panel">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><use href="#icon-x"/></svg>
            </button>
          </div>
          <div class="code-panel-body" id="code-panel-body" role="tabpanel" aria-live="off"></div>
        </aside>
      </div>`;
    _bind(el);
    _paintPanelState();
    _paintSend();
    _renderThread();
    _renderPanel();
    _loadOwnModels();
  }

  function _bind(el) {
    el.querySelector('#code-change-folder').addEventListener('click', _openFolder);
    el.querySelector('#code-keys').addEventListener('click', (e) => _openKeys(e.currentTarget));
    el.querySelectorAll('[data-panel]').forEach(b => b.addEventListener('click', () => _showPanel(b.dataset.panel, true)));
    const tabs = [...el.querySelectorAll('.code-panel-tab')];
    tabs.forEach((b, i) => {
      b.addEventListener('click', () => _showPanel(b.dataset.tab));
      b.addEventListener('keydown', (e) => {
        const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        const next = tabs[(to + tabs.length) % tabs.length];
        _showPanel(next.dataset.tab);
        next.focus();
      });
    });
    el.querySelector('#code-panel-close').addEventListener('click', () => {
      const s = _panelState();
      _savePanel({ ...s, open: false });
      _paintPanelState();
      const toggle = el.querySelector(`[data-panel="${s.tab}"]`);
      if (toggle) toggle.focus();
    });
    const form = el.querySelector('#code-prompt');
    const input = el.querySelector('#code-input');
    form.addEventListener('submit', (e) => { e.preventDefault(); _busyNow() ? _stop() : _send(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!_busyNow()) _send(); }
    });
    input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 240) + 'px'; });
    el.querySelector('#code-mode').addEventListener('change', (e) => {
      _mode = MODES.some(m => m.id === e.target.value) ? e.target.value : 'ask';
      // A prompt waiting now is answered by the new mode if it covers it.
      if (_pending && _preapproved(_pending.d)) _answer(true);
    });
    el.querySelector('#code-model').addEventListener('change', (e) => {
      try { localStorage.setItem(MODEL_KEY, e.target.value); } catch {}
    });
  }

  function _showPanel(tab, toggle) {
    const s = _panelState();
    if (!_el || !_el.querySelector('.code-view')) return;
    if (toggle && s.open && s.tab === tab) {
      _savePanel({ ...s, open: false });
      _paintPanelState();
      return;
    }
    _savePanel({ open: true, tab });
    _paintPanelState();
    _renderPanel();
  }

  // Open / closed, the selected tab, and the header toggles, all from the
  // saved panel state.
  function _paintPanelState() {
    const view = _el && _el.querySelector('.code-view');
    if (!view) return;
    const s = _panelState();
    view.classList.toggle('code-panel-closed', !s.open);
    _el.querySelectorAll('.code-panel-tab').forEach(t => {
      const on = t.dataset.tab === s.tab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    });
    const body = _el.querySelector('#code-panel-body');
    if (body) body.setAttribute('aria-labelledby', 'code-tab-' + s.tab);
    _el.querySelectorAll('[data-panel]').forEach(b => {
      b.setAttribute('aria-pressed', s.open && s.tab === b.dataset.panel ? 'true' : 'false');
    });
  }

  /* ── Models ─────────────────────────────────────────────────────── */

  function _models() {
    const enabled = (typeof State !== 'undefined' && State.get('enabled_models')) || {};
    const all = (typeof LLM_MODELS !== 'undefined' && Array.isArray(LLM_MODELS)) ? LLM_MODELS : [];
    const list = all.filter(m => enabled[m.id]);
    return list.length ? list : [{ id: 'gemini-2-5-flash', label: 'Gemini 2.5 Flash' }];
  }

  const _ownId = (provider, model) => 'byo:' + provider + ':' + model;

  // NICE's models first, then one group per provider the user has a key for.
  function _modelOptions() {
    const hosted = _models();
    const own = [..._ownModels].flatMap(([p, g]) => g.models.map(m => _ownId(p, m.id)));
    let saved = null;
    try { saved = localStorage.getItem(MODEL_KEY); } catch {}
    const pick = hosted.some(m => m.id === saved) || own.includes(saved) ? saved : hosted[0].id;
    const opt = (id, label) => `<option value="${_attr(id)}"${id === pick ? ' selected' : ''}>${_esc(label)}</option>`;
    return `<optgroup label="NICE">${hosted.map(m => opt(m.id, m.label || m.id)).join('')}</optgroup>`
      + [..._ownModels].map(([p, g]) => g.models.length
        ? `<optgroup label="${_attr(g.label + ' (your key)')}">${g.models.map(m => opt(_ownId(p, m.id), m.label)).join('')}</optgroup>`
        : '').join('');
  }

  // A repaint never changes the model of a conversation: the pick is read
  // when the next message goes (_send), never in the middle of a turn.
  function _paintModels() {
    const select = _el && _el.querySelector('#code-model');
    if (!select) return;
    const was = select.value;
    select.innerHTML = _modelOptions();
    if (_busyNow() && [...select.options].some(o => o.value === was)) select.value = was;
  }

  // The models of every provider the user has a key for. A provider whose
  // list does not load keeps no group (its key may have been revoked; API
  // keys shows the error).
  function _loadOwnModels(force) {
    const llm = _llm();
    if (!llm) return Promise.resolve();
    if (_ownLoad && !force) return _ownLoad;
    const load = (async () => {
      let providers = [];
      try { providers = await llm.providers(); }
      catch { if (_ownLoad === load) _ownLoad = null; return; }   // tried again on the next paint
      const next = new Map();
      await Promise.all(providers.filter(p => p.hasKey).map(async (p) => {
        try { next.set(p.id, { label: p.label, models: await llm.models(p.id), error: null }); }
        catch (e) { next.set(p.id, { label: p.label, models: [], error: (e && e.message) || 'Could not list models.' }); }
      }));
      if (_ownLoad !== load) return;
      _ownModels = next;
      _paintModels();
      _paintKeys();
    })();
    _ownLoad = load;
    return load;
  }

  /* ── API keys ───────────────────────────────────────────────────── */

  async function _openKeys(returnTo) {
    const llm = _llm();
    if (!llm || !_el || document.getElementById('code-keys-dialog')) return;
    _keysReturn = returnTo || null;
    // On <body>, like the app's other dialogs: inside the view's grid the
    // overlay would not cover the page.
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-overlay open code-keys-overlay" id="code-keys-dialog">
        <div class="modal-box code-keys-box" role="dialog" aria-modal="true" aria-labelledby="code-keys-title" tabindex="-1">
          <div class="modal-hdr">
            <h2 class="modal-title" id="code-keys-title">API keys</h2>
            <button type="button" class="modal-close" id="code-keys-close" aria-label="Close"><svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><use href="#icon-x"/></svg></button>
          </div>
          <div class="modal-body">
            <p class="code-keys-intro">Use your own key with a model provider instead of a NICE account. NICE keeps each key encrypted on this computer and sends it only to that provider; the provider bills you.</p>
            <div class="code-keys-list" id="code-keys-list"></div>
          </div>
        </div>
      </div>`);
    const dlg = document.getElementById('code-keys-dialog');
    dlg.addEventListener('click', (e) => { if (e.target === dlg) _closeKeys(); });
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); _closeKeys(); return; }
      if (e.key !== 'Tab') return;
      // Focus stays in the dialog.
      const f = [...dlg.querySelectorAll('button, input')].filter(x => !x.disabled);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    dlg.querySelector('#code-keys-close').addEventListener('click', _closeKeys);
    dlg.querySelector('#code-keys-list').addEventListener('submit', _onKeySubmit);
    dlg.querySelector('#code-keys-list').addEventListener('click', _onKeyRemove);
    await _paintKeys(true);
  }

  function _closeKeys() {
    const dlg = document.getElementById('code-keys-dialog');
    if (!dlg) return;
    dlg.remove();
    const back = _keysReturn && _keysReturn.isConnected ? _keysReturn : (_el && _el.querySelector('#code-keys'));
    if (back) back.focus();
    _keysReturn = null;
  }

  let _keysSeq = 0;
  async function _paintKeys(focusFirst) {
    const list = document.getElementById('code-keys-list');
    const llm = _llm();
    if (!list || !llm) return;
    const seq = ++_keysSeq;
    let providers;
    try { providers = await llm.providers(); }
    catch (e) { list.innerHTML = `<p class="code-keys-err">${_esc((e && e.message) || 'Could not read the saved keys.')}</p>`; return; }
    if (seq !== _keysSeq || !list.isConnected) return;
    list.innerHTML = providers.map(p => {
      const g = _ownModels.get(p.id);
      const status = p.hasKey
        ? (g && g.error ? `<span class="status-dot dot-r" aria-hidden="true"></span>${_esc(g.error)}` : `<span class="status-dot dot-g" aria-hidden="true"></span>Key saved${g ? ', ' + g.models.length + ' models' : ''}`)
        : 'No key';
      return `<form class="code-key-row" data-provider="${_attr(p.id)}">
          <div class="code-key-hd"><span class="code-key-name" id="code-key-${_attr(p.id)}">${_esc(p.label)}</span><span class="code-key-status">${status}</span></div>
          ${p.hasKey
            ? `<div class="code-key-line"><button type="button" class="btn btn-sm" data-remove="${_attr(p.id)}" aria-describedby="code-key-${_attr(p.id)}">Remove key</button></div>`
            : `<div class="code-key-line">
                <input type="password" name="key" autocomplete="off" spellcheck="false" placeholder="Paste a ${_attr(p.label)} key" aria-labelledby="code-key-${_attr(p.id)}">
                <button type="submit" class="btn btn-sm">Save</button>
              </div>`}
          <p class="code-keys-err" role="alert"></p>
        </form>`;
    }).join('');
    if (focusFirst) { const first = list.querySelector('input, button'); if (first) first.focus(); }
  }

  // While the list repaints, focus waits on the dialog itself, so Escape
  // and Tab still work there.
  function _holdFocus() {
    const box = document.querySelector('#code-keys-dialog .code-keys-box');
    if (box) box.focus();
  }

  async function _onKeySubmit(e) {
    e.preventDefault();
    const form = e.target.closest('.code-key-row');
    const llm = _llm();
    if (!form || !llm) return;
    const input = form.querySelector('input[name="key"]');
    const btn = form.querySelector('button[type="submit"]');
    const err = form.querySelector('.code-keys-err');
    const key = input.value.trim();
    if (!key) { err.textContent = 'Paste a key first.'; input.focus(); return; }
    input.disabled = true; btn.disabled = true; btn.textContent = 'Checking…'; err.textContent = '';
    _holdFocus();
    try {
      await llm.setKey(form.dataset.provider, key);
      input.value = '';
      await _loadOwnModels(true);
      await _paintKeys();
      const row = document.querySelector(`.code-key-row[data-provider="${form.dataset.provider}"] button`);
      if (row) row.focus();
    } catch (ex) {
      input.disabled = false; btn.disabled = false; btn.textContent = 'Save';
      err.textContent = (ex && ex.message) || 'The key could not be saved.';
      input.focus();
    }
  }

  async function _onKeyRemove(e) {
    const b = e.target.closest('[data-remove]');
    const llm = _llm();
    if (!b || !llm) return;
    _holdFocus();
    b.disabled = true;
    try { await llm.clearKey(b.dataset.remove); } catch { /* the repaint shows what is saved */ }
    await _loadOwnModels(true);
    await _paintKeys();
    const input = document.querySelector(`.code-key-row[data-provider="${b.dataset.remove}"] input`);
    if (input) input.focus();
  }

  /* ── Conversation ───────────────────────────────────────────────── */

  function _systemPrompt() {
    return [
      `You are Code, the coding agent in NICE, working in the folder "${_ws.name}" on the user's computer. Paths are relative to that folder.`,
      'Use your tools to do the work rather than describing it: list_files, search_files and read_file to find and read code; edit_file to change a file, write_file to create one; run_command for tests, builds and git.',
      'Read a file before you edit it, and copy old_text exactly from what you read, including its indentation. Keep changes small and focused on what was asked.',
      'The user approves edits and commands before they happen and may decline one. If they do, do not retry it; take a different approach or ask.',
      'After a change, run the project\'s tests or build when there is one, and say what you changed and what you checked.',
      'Be direct and concise. Use fenced code blocks for code and commands.',
    ].join('\n');
  }

  async function _send() {
    const input = _el && _el.querySelector('#code-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text || _busyNow()) return;
    input.value = '';
    input.style.height = 'auto';
    _addMsg({ role: 'user', text });

    const model = (_el.querySelector('#code-model') || {}).value || 'gemini-2-5-flash';
    const user = typeof State !== 'undefined' ? State.get('user') : null;
    if (!user && !_isOwnKey(model)) {
      _addMsg({ role: 'note', text: 'NICE\'s hosted models need a NICE account. Sign in, or add your own API key (the key button above) and pick one of its models.' });
      return;
    }
    if (typeof AgentExecutor === 'undefined') {
      _addMsg({ role: 'note', text: 'The agent is not loaded. Reload the app and try again.' });
      return;
    }

    if (!_convo) {
      const gen = _gen;
      _convoBlueprint = { id: null, name: 'Code', config: { llm_engine: model, system_prompt: _systemPrompt() } };
      const tools = typeof CodeTools !== 'undefined' && CodeTools.register() ? CodeTools.IDS : [];
      _convo = AgentExecutor.converse(_convoBlueprint, {
        tools, maxSteps: MAX_STEPS, keepToolTurns: true,
        approvalMode: 'review',
        onApprovalNeeded: (req) => _ask(req, gen),
        onStep: (step) => _onStep(step, gen),
        shouldStop: () => gen !== _gen || !!(_turn && _turn.gen === gen && _turn.stopAsked),
      });
    }

    _convoBlueprint.config.llm_engine = model;
    const turnState = { gen: _gen, stopAsked: false };
    _turn = turnState;
    _lastThought = '';
    _paintSend();
    _paintWorking();
    let turn = null, failure = null;
    try { turn = await _convo.send(text); }
    catch (e) { failure = e; }
    if (_turn === turnState) { _turn = null; _agentRun = null; }
    // The folder changed while this reply was on its way: it belongs to
    // a conversation that is gone.
    if (turnState.gen !== _gen) return;
    // The model call can't be cut off mid-flight, so a reply that comes
    // back after Stop is dropped here. Until then the prompt can't send:
    // converse keeps one history and one shouldStop, so a second turn
    // started now would read this one's prompt as its own and could let
    // the late answer into the history.
    if (turnState.stopAsked || (turn && turn.stopped)) _addMsg({ role: 'note', text: 'Stopped.' });
    else if (failure) _addMsg({ role: 'note', text: 'Something went wrong: ' + (failure.message || String(failure)) });
    else if (turn && turn.error) _addMsg({ role: 'note', text: String(turn.text || '').replace(/^Error:\s*/, 'Something went wrong: ') });
    else _addMsg({ role: 'assistant', text: (turn && turn.text) || '' });
    _paintSend();
    _paintWorking();
  }

  function _stop() {
    if (!_busyNow() || _turn.stopAsked) return;
    _turn.stopAsked = true;
    // A prompt waiting is answered no; the agent loop sees the stop and
    // ends the turn. A command it is running is stopped; one about to
    // start is stopped when its 'start' event comes.
    _answer(false);
    if (_agentRun && _agentRun.id != null) _kill(_agentRun.id);
    _paintSend();
    _paintWorking();
  }

  /* ── Permissions ────────────────────────────────────────────────── */

  // Whether the mode or an "Always allow" answer covers a call already.
  function _preapproved(d) {
    if (_mode === 'bypass') return true;
    if (d.kind === 'edit' || d.kind === 'write') return _mode === 'edits' || _allowEdits;
    if (d.kind === 'run') return [..._allowCmds].some(p => CodeTools.prefixCovers(p, d.command));
    return false;
  }

  // ToolRegistry's approval gate: resolves true to run the call.
  function _ask(req, gen) {
    if (gen !== _gen || typeof CodeTools === 'undefined') return Promise.resolve(false);
    const d = CodeTools.describe(req.tool, req.input);
    if (d.kind === 'other') return Promise.resolve(false);
    if (_preapproved(d)) return Promise.resolve(true);
    _answer(false);
    return new Promise(resolve => {
      _pending = { gen, d, input: req.input || {}, resolve };
      _paintAsk(true);
    });
  }

  function _answer(ok, always) {
    const p = _pending;
    if (!p) return;
    _pending = null;
    if (ok && always) {
      if (p.d.kind !== 'run') _allowEdits = true;
      else if (CodeTools.canRemember(p.d.command)) _allowCmds.add(CodeTools.commandPrefix(p.d.command));
    }
    p.resolve(!!ok);
    _paintAsk();
  }

  function _alwaysLabel(d) {
    if (d.kind === 'run') {
      return CodeTools.canRemember(d.command) ? 'Always allow ' + CodeTools.commandPrefix(d.command) : null;
    }
    return 'Allow all edits this session';
  }

  const _lines = (t) => String(t == null ? '' : t).split('\n');

  function _askBodyHTML(d, input) {
    if (d.kind === 'run') return `<pre class="code-ask-pre"><code>$ ${_esc(d.command || '')}</code></pre>`;
    if (d.kind === 'edit') {
      const diff = [
        ..._lines(input.old_text).map(l => `<span class="code-diff-del">- ${_esc(l)}</span>`),
        ..._lines(input.new_text).map(l => `<span class="code-diff-add">+ ${_esc(l)}</span>`),
      ].join('\n');
      return `<pre class="code-ask-pre code-diff"><code>${diff}</code></pre>${input.replace_all ? '<p class="code-ask-note">Every occurrence in the file.</p>' : ''}`;
    }
    const all = _lines(input.content);
    const shown = all.slice(0, PREVIEW_LINES).map(l => `<span class="code-diff-add">+ ${_esc(l)}</span>`).join('\n');
    const more = all.length > PREVIEW_LINES ? `<p class="code-ask-note">${all.length - PREVIEW_LINES} more lines.</p>` : '';
    return `<pre class="code-ask-pre code-diff"><code>${shown}</code></pre>${more}`;
  }

  // The prompt sits at the end of the thread, above the working line. It is
  // drawn again when the view comes back while it waits.
  function _paintAsk(focus) {
    const box = _threadBox();
    if (!box) return;
    const old = box.querySelector('.code-ask');
    const p = _pending && _pending.gen === _gen ? _pending : null;
    if (!p) {
      if (old) {
        const hadFocus = old.contains(document.activeElement);
        old.remove();
        if (hadFocus) { const input = _el.querySelector('#code-input'); if (input) input.focus(); }
      }
      _paintWorking();
      return;
    }
    if (old) old.remove();
    const q = { edit: 'Allow Code to edit ', write: 'Allow Code to write ', run: 'Allow Code to run this command?' }[p.d.kind];
    const always = _alwaysLabel(p.d);
    const html = `<div class="code-ask" role="group" aria-label="Permission">
        <div class="code-ask-q"><span class="status-dot dot-a" aria-hidden="true"></span><span>${_esc(q)}${p.d.kind === 'run' ? '' : `<code>${_esc(p.d.path || '')}</code>?`}</span></div>
        ${_askBodyHTML(p.d, p.input)}
        <div class="code-ask-btns">
          <button type="button" class="btn btn-primary btn-sm" data-answer="once">Allow</button>
          ${always ? `<button type="button" class="btn btn-sm" data-answer="always">${_esc(always)}</button>` : ''}
          <button type="button" class="btn btn-sm" data-answer="deny">Deny</button>
        </div>
      </div>`;
    const working = box.querySelector('.code-msg-working');
    if (working) working.insertAdjacentHTML('beforebegin', html); else box.insertAdjacentHTML('beforeend', html);
    const card = box.querySelector('.code-ask');
    card.addEventListener('click', (e) => {
      const b = e.target.closest('[data-answer]');
      if (!b || _pending !== p) return;
      _answer(b.dataset.answer !== 'deny', b.dataset.answer === 'always');
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && _pending === p) { e.preventDefault(); _answer(false); }
    });
    _paintWorking();
    if (focus) card.querySelector('[data-answer="once"]').focus();
    box.scrollTop = box.scrollHeight;
  }

  /* ── Tool steps ─────────────────────────────────────────────────── */

  function _onStep(step, gen) {
    if (gen !== _gen || !step || !step.action) return;
    const thought = String(step.thought || '').trim();
    if (thought && thought !== _lastThought) _addMsg({ role: 'assistant', text: thought });
    _lastThought = thought;
    const d = typeof CodeTools !== 'undefined' ? CodeTools.describe(step.action, step.actionInput) : { kind: 'other', title: String(step.action) };
    const obs = String(step.observation == null ? '' : step.observation);
    let status = /^Action blocked/.test(obs) ? 'denied' : /^Stopped:/.test(obs) ? 'stopped' : /^Error:/.test(obs) ? 'error' : 'ok';
    let detail = obs;
    try {
      const r = JSON.parse(obs);
      if (r && typeof r === 'object') {
        if (d.kind === 'run') {
          const failed = (r.exitCode !== 0 && r.exitCode != null) || r.timedOut || r.error;
          detail = [r.stdout, r.stderr, r.error].filter(Boolean).join('\n').trim() + (r.exitCode !== 0 && r.exitCode != null ? '\nExit code ' + r.exitCode : '');
          if (failed && status === 'ok') status = 'error';
        }
        else if (d.kind === 'read') detail = r.content || '';
      }
    } catch { /* not JSON: an error or a plain result, shown as it is */ }
    if (detail.length > STEP_DETAIL_MAX) detail = detail.slice(0, STEP_DETAIL_MAX) + '\n…';
    _addMsg({ role: 'tool', title: d.title, status, detail });
    if (d.kind === 'run') _agentRun = null;
    if (status === 'ok' && (d.kind === 'edit' || d.kind === 'write')) _filesChanged(d.path);
    _paintWorking();
  }

  // An edit or write landed: the Files tab lists and shows it again.
  function _filesChanged(path) {
    _dirCache.clear();
    if (!_el) return;
    if (_openFile && _openFile.path === path) _onTreeClick({ path, type: 'file', open: false });
    else if (!_openFile) _renderFiles();
  }

  function _paintSend() {
    const btn = _el && _el.querySelector('#code-send');
    if (!btn) return;
    const busy = _busyNow();
    const stopping = busy && _turn.stopAsked;
    btn.classList.toggle('is-busy', busy);
    btn.classList.toggle('is-stopping', stopping);
    btn.setAttribute('aria-label', stopping ? 'Stopping' : busy ? 'Stop' : 'Send');
    if (stopping) btn.setAttribute('aria-disabled', 'true'); else btn.removeAttribute('aria-disabled');
    btn.innerHTML = busy ? STOP_ICON : SEND_ICON;
  }

  function _md(text) {
    return (typeof PromptPanel !== 'undefined' && typeof PromptPanel._md === 'function')
      ? PromptPanel._md(text)
      : _esc(text).replace(/\n/g, '<br>');
  }

  function _msgHTML(m) {
    if (m.role === 'user') return `<div class="code-msg code-msg-user">${_esc(m.text)}</div>`;
    if (m.role === 'note') return `<div class="code-msg code-msg-note">${_esc(m.text)}</div>`;
    if (m.role === 'tool') {
      const dot = { ok: 'dot-g', error: 'dot-r', denied: 'dot-r', stopped: 'dot-r' }[m.status] || 'dot-i';
      const label = m.status === 'denied' ? 'Denied: ' + m.title : m.status === 'stopped' ? 'Not run: ' + m.title : m.title;
      const sr = m.status === 'error' ? '<span class="sr-only"> (failed)</span>' : '';
      return `<details class="code-msg code-step"><summary><span class="status-dot ${dot}" aria-hidden="true"></span><span class="code-step-title">${_esc(label)}</span>${sr}</summary>${m.detail ? `<pre class="code-step-out">${_esc(m.detail)}</pre>` : ''}</details>`;
    }
    return `<div class="code-msg code-msg-assistant">${_md(m.text)}</div>`;
  }

  const _threadBox = () => _el && _el.querySelector('#code-thread');

  // The whole thread, once per paint of the view. After that messages are
  // appended, so the live region announces only what is new.
  function _renderThread() {
    const box = _threadBox();
    if (!box) return;
    box.innerHTML = _thread.length
      ? _thread.map(_msgHTML).join('')
      : `<div class="code-thread-empty">Ask Code to do something in <strong>${_esc(_ws.name)}</strong>. It asks before it changes a file or runs a command.</div>`;
    _paintAsk();
  }

  function _addMsg(m) {
    _thread.push(m);
    const box = _threadBox();
    if (!box) return;
    const empty = box.querySelector('.code-thread-empty');
    if (empty) empty.remove();
    const working = box.querySelector('.code-ask, .code-msg-working');
    if (working) working.insertAdjacentHTML('beforebegin', _msgHTML(m));
    else box.insertAdjacentHTML('beforeend', _msgHTML(m));
    box.scrollTop = box.scrollHeight;
  }

  function _paintWorking() {
    const box = _threadBox();
    if (!box) return;
    let line = box.querySelector('.code-msg-working');
    if (!_busyNow()) { if (line) line.remove(); return; }
    const waiting = !!(_pending && _pending.gen === _gen);
    const text = _turn.stopAsked ? STOPPING_TEXT : waiting ? 'Waiting for your answer…' : 'Working…';
    if (!line) {
      box.insertAdjacentHTML('beforeend', '<div class="code-msg code-msg-working"><div class="code-working-line"><span class="status-dot dot-a" aria-hidden="true"></span><span class="code-working-text"></span></div><pre class="code-working-out" hidden></pre></div>');
      line = box.lastElementChild;
    }
    const label = line.querySelector('.code-working-text');
    if (label.textContent !== text) label.textContent = text;
    const out = line.querySelector('.code-working-out');
    const tail = _agentRun && _agentRun.out ? _agentRun.out.replace(/\n$/, '').split('\n').slice(-LIVE_OUT_LINES).join('\n') : '';
    if (out.textContent !== tail) out.textContent = tail;
    out.hidden = !tail;
    box.scrollTop = box.scrollHeight;
  }

  /* ── Panel ──────────────────────────────────────────────────────── */

  function _renderPanel() {
    if (!_el) return;
    if (_panelState().tab === 'terminal') _renderTerminal(); else _renderFiles();
  }

  // Files

  async function _list(dir) {
    if (_dirCache.has(dir)) return _dirCache.get(dir);
    const gen = _gen;
    const r = await _host().list(dir);
    const listing = { entries: (r && r.entries) || [], truncated: !!(r && r.truncated) };
    if (gen === _gen) _dirCache.set(dir, listing);
    return listing;
  }

  const _join = (dir, name) => dir === '.' ? name : dir + '/' + name;

  // A link is a folder once it has listed like one. An open one is listed
  // again before it is drawn, so a link that stopped pointing at a folder
  // goes back to a plain row.
  async function _isLinkDir(p) {
    if (!_linkDirs.has(p)) return false;
    if (!_expanded.has(p) || _dirCache.has(p)) return true;
    try { await _list(p); return true; }
    catch { _linkDirs.delete(p); _expanded.delete(p); return false; }
  }

  // `rows` collects { path, type, open } for each row, at its data-row, for
  // the paint to put in _rowInfo.
  async function _treeHTML(dir, depth, rows) {
    let listing;
    try { listing = await _list(dir); }
    catch (e) { return `<div class="code-tree-err" style="--depth:${depth}">${_esc(e.message || 'Could not list this folder')}</div>`; }
    const html = [];
    for (const e of listing.entries) {
      const p = _join(dir, e.name);
      const isLink = e.type === 'link';
      const isDir = e.type === 'dir' || (isLink && await _isLinkDir(p));
      const open = isDir && _expanded.has(p);
      const type = isLink ? 'link' : isDir ? 'dir' : 'file';
      const icon = isLink ? 'external' : isDir ? (open ? 'chevron-down' : 'chevron-right') : 'file';
      const idx = rows.push({ path: p, type, open }) - 1;
      html.push(`<button type="button" class="code-tree-row${_openFile && _openFile.path === p ? ' active' : ''}" style="--depth:${depth}" data-row="${idx}" data-type="${type}"${isDir ? ` aria-expanded="${open}"` : ''}>
        <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><use href="#icon-${icon}"/></svg>
        <span class="code-tree-name">${_esc(e.name)}</span>${isLink ? '<span class="sr-only"> (link)</span>' : ''}</button>`);
      if (open) html.push(await _treeHTML(p, depth + 1, rows));
    }
    if (listing.truncated) {
      html.push(`<div class="code-tree-more" style="--depth:${depth}">Only the first ${listing.entries.length} items are shown.</div>`);
    }
    return html.join('');
  }

  // Where focus is in the panel body, for a repaint to put it back: the
  // path of a focused row, '' for anything else in there, null when it is
  // elsewhere (a repaint then leaves it alone).
  function _focusIn(body) {
    const a = document.activeElement;
    if (!a || !body.contains(a)) return null;
    const info = _rowInfo.get(a);
    return info ? info.path : '';
  }

  // When focus was in the panel, a repaint puts it back: on the same row, or
  // on the row `focusPath` names (Back names the file it closes), or else
  // on Refresh.
  async function _renderFiles(focusPath) {
    const body = _el && _el.querySelector('#code-panel-body');
    if (!body || _panelState().tab !== 'files') return;
    const seq = ++_treeSeq;
    if (_openFile) {
      const f = _openFile;
      const refocus = _focusIn(body) !== null;
      body.innerHTML = `
        <div class="code-file-hdr">
          <button type="button" class="code-icon-btn" id="code-file-back" aria-label="Back to files" title="Back to files"><svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><use href="#icon-arrow-left"/></svg></button>
          <span class="code-file-path">${_esc(f.path)}</span>
        </div>
        ${f.error
          ? `<div class="code-tree-err">${_esc(f.error)}</div>`
          : `<pre class="code-file-body"><code>${_esc(f.content)}</code></pre>${f.endLine < f.totalLines ? `<div class="code-file-more">Showing lines 1 to ${f.endLine} of ${f.totalLines}.</div>` : ''}`}`;
      const back = body.querySelector('#code-file-back');
      back.addEventListener('click', () => { _openFile = null; _readSeq++; _renderFiles(f.path); });
      if (refocus) back.focus();
      return;
    }
    const gen = _gen;
    const rows = [];
    const html = await _treeHTML('.', 0, rows);
    if (!_el || seq !== _treeSeq || gen !== _gen || _panelState().tab !== 'files' || _openFile) return;
    const target = _el.querySelector('#code-panel-body');
    if (!target) return;
    const focused = _focusIn(target);
    target.innerHTML = `<div class="code-tree">${html || '<div class="code-tree-err">This folder is empty.</div>'}
      </div><div class="code-tree-foot"><button type="button" class="btn btn-sm" id="code-refresh-files">Refresh</button></div>`;
    const rowEls = [...target.querySelectorAll('.code-tree-row')];
    rowEls.forEach(row => _rowInfo.set(row, rows[Number(row.dataset.row)]));
    target.querySelector('.code-tree').addEventListener('click', (e) => {
      const info = _rowInfo.get(e.target.closest('.code-tree-row'));
      if (info) _onTreeClick(info);
    });
    const refresh = target.querySelector('#code-refresh-files');
    refresh.addEventListener('click', () => { _dirCache.clear(); _renderFiles(); });
    if (focused !== null) {
      const want = focusPath !== undefined ? focusPath : focused;
      (rowEls.find(r => _rowInfo.get(r).path === want) || refresh).focus();
    }
  }

  async function _onTreeClick({ path: p, type, open }) {
    if (open) {
      _expanded.delete(p);
      _renderFiles();
      return;
    }
    if (type === 'dir') {
      _expanded.add(p);
      _renderFiles();
      return;
    }
    const gen = _gen;
    const req = ++_readSeq;
    if (type === 'link') {
      // It may point at a folder or at a file: list it first, read it if
      // that fails.
      let listed = false;
      try { await _list(p); listed = true; } catch { listed = false; }
      if (gen !== _gen || req !== _readSeq) return;
      if (listed) { _linkDirs.add(p); _expanded.add(p); _renderFiles(); return; }
      _linkDirs.delete(p);
    }
    let file;
    try {
      const r = await _host().read(p, { limit: 2000 });
      file = { path: p, content: r.content, totalLines: r.totalLines, endLine: r.endLine };
    } catch (e) {
      file = { path: p, error: e.code === 'EBINARY' ? 'This is a binary file.' : (e.message || 'Could not open this file.') };
    }
    if (gen !== _gen || req !== _readSeq) return;
    _openFile = file;
    _renderFiles();
  }

  // Terminal

  function _renderTerminal() {
    const body = _el && _el.querySelector('#code-panel-body');
    if (!body) return;
    body.innerHTML = `
      <div class="code-term">
        <pre class="code-term-out" id="code-term-out"></pre>
        <form class="code-term-line" id="code-term-form">
          <span class="code-term-prompt" aria-hidden="true">$</span>
          <input id="code-term-input" type="text" autocomplete="off" spellcheck="false" aria-label="Command" placeholder="${_attr('Run a command in ' + _ws.name)}">
          <button type="button" class="btn btn-sm" id="code-term-stop"${_termRun ? '' : ' hidden'}>Stop</button>
        </form>
      </div>`;
    _paintTerm();
    const input = body.querySelector('#code-term-input');
    body.querySelector('#code-term-form').addEventListener('submit', (e) => { e.preventDefault(); _runTerminal(input.value); });
    body.querySelector('#code-term-stop').addEventListener('click', _stopTerminal);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'c' && e.ctrlKey && _termRun) { e.preventDefault(); _stopTerminal(); }
      else if (e.key === 'ArrowUp' && _termHistory.length) {
        e.preventDefault();
        _termHistoryAt = _termHistoryAt < 0 ? _termHistory.length - 1 : Math.max(0, _termHistoryAt - 1);
        input.value = _termHistory[_termHistoryAt];
      } else if (e.key === 'ArrowDown' && _termHistoryAt >= 0) {
        e.preventDefault();
        _termHistoryAt = _termHistoryAt + 1;
        if (_termHistoryAt >= _termHistory.length) { _termHistoryAt = -1; input.value = ''; }
        else input.value = _termHistory[_termHistoryAt];
      }
    });
    input.focus();
  }

  function _termAppend(s) {
    _termText += s;
    if (_termText.length > TERM_MAX_CHARS) _termText = _termText.slice(-TERM_MAX_CHARS);
    _paintTerm();
  }

  // The output follows new lines only while the user is at the bottom, so
  // scrolling up to read earlier output isn't undone by the next chunk.
  function _paintTerm() {
    const out = _el && _el.querySelector('#code-term-out');
    if (!out) return;
    const atBottom = out.scrollHeight - out.scrollTop - out.clientHeight <= 4;
    out.textContent = _termText;
    if (atBottom) out.scrollTop = out.scrollHeight;
    const stop = _el.querySelector('#code-term-stop');
    if (!stop) return;
    const stopping = !!(_termRun && _termRun.stopAsked);
    // Only touch the button when its state changes: this runs on every chunk.
    const label = stopping ? 'Stopping…' : 'Stop';
    if (stop.textContent !== label) stop.textContent = label;
    if (stopping !== (stop.getAttribute('aria-disabled') === 'true')) {
      if (stopping) stop.setAttribute('aria-disabled', 'true'); else stop.removeAttribute('aria-disabled');
    }
    // Hiding the focused Stop would drop focus to the page.
    if (!_termRun && !stop.hidden && document.activeElement === stop) _el.querySelector('#code-term-input').focus();
    stop.hidden = !_termRun;
  }

  async function _runTerminal(raw) {
    const cmd = String(raw || '').trim();
    const host = _host();
    if (!cmd || !host) return;
    if (_termRun) { _termAppend('A command is still running. Stop it first.\n'); return; }
    const input = _el && _el.querySelector('#code-term-input');
    if (input) input.value = '';
    _termHistory.push(cmd);
    if (_termHistory.length > 100) _termHistory.shift();
    _termHistoryAt = -1;
    if (cmd === 'clear') { _termText = ''; _paintTerm(); return; }
    const tag = 'term-' + Date.now() + '-' + (++_runSeq);
    const run = { tag, id: null, stopAsked: false };
    const gen = _gen;
    _termRun = run;
    _termAppend('$ ' + cmd + '\n');
    try {
      const r = await host.run(cmd, { tag });
      if (gen === _gen) {
        const trunc = r.stdoutTruncated || r.stderrTruncated ? ' (output cut short)' : '';
        if (r.timedOut) _termAppend(`\nStopped after the time limit.${trunc}\n`);
        else if (r.killed) _termAppend(`\nStopped.\n`);
        else if (r.error) _termAppend(`\n${r.error}\n`);
        else if (r.exitCode !== 0) _termAppend(`\nExit code ${r.exitCode}${trunc}\n`);
        else if (trunc) _termAppend(`\n${trunc.trim()}\n`);
      }
    } catch (e) {
      if (gen === _gen) _termAppend((e.message || String(e)) + '\n');
    } finally {
      if (_termRun === run) { _termRun = null; _paintTerm(); }
    }
  }

  function _kill(id) {
    const host = _host();
    if (host) host.kill(id).catch(() => {});
  }

  // Until the host's 'start' event the command has no id to kill (finding
  // the login shell's PATH can take seconds), so the kill waits for it.
  // Stop says Stopping… from the press; one kill is enough, as the host
  // follows SIGTERM with SIGKILL.
  function _stopTerminal() {
    if (!_termRun || _termRun.stopAsked) return;
    _termRun.stopAsked = true;
    if (_termRun.id != null) _kill(_termRun.id);
    // No id yet (the host may still be looking up the shell's PATH): call the
    // run off by its tag so it never spawns; the kill on 'start' covers a race.
    else if (_host() && typeof _host().cancel === 'function') _host().cancel(_termRun.tag).catch(() => {});
    _paintTerm();
  }

  function _onRunData(d) {
    if (!d) return;
    if (typeof CodeTools !== 'undefined' && typeof d.tag === 'string' && d.tag.startsWith(CodeTools.AGENT_TAG)) {
      _onAgentRunData(d);
      return;
    }
    if (!_termRun || d.tag !== _termRun.tag) return;
    if (d.stream === 'start') {
      _termRun.id = d.id;
      if (_termRun.stopAsked) _kill(d.id);
      return;
    }
    _termAppend(d.data);
  }

  // Output of a command the agent runs, for the working line. One that
  // starts after Stop (or with no turn waiting on it) is stopped at once.
  function _onAgentRunData(d) {
    if (d.stream === 'start') {
      if (!_busyNow() || _turn.stopAsked) { _kill(d.id); return; }
      _agentRun = { tag: d.tag, id: d.id, out: '' };
      return;
    }
    if (!_agentRun || _agentRun.tag !== d.tag) return;
    _agentRun.out += d.data || '';
    if (_agentRun.out.length > LIVE_OUT_MAX) _agentRun.out = _agentRun.out.slice(-LIVE_OUT_MAX);
    _paintWorking();
  }

  function destroy() {
    // The conversation and the terminal keep running while the user is on
    // another page; only the DOM goes.
    const dlg = document.getElementById('code-keys-dialog');
    if (dlg) dlg.remove();
    _keysReturn = null;
    _el = null;
  }

  function _resetAll() {
    _resetForFolder(null);
    const dlg = document.getElementById('code-keys-dialog');
    if (dlg) dlg.remove();
    _el = null;
    _turn = null;
    _mode = 'ask';
    _ownModels = new Map();
    _ownLoad = null;
    _keysSeq = 0;
    _termHistory = [];
    _termHistoryAt = -1;
    _treeSeq = 0;
    _readSeq = 0;
    try { localStorage.removeItem(PANEL_KEY); localStorage.removeItem(MODEL_KEY); } catch {}
    if (_offRunData) { _offRunData(); _offRunData = null; }
  }

  return {
    title, render, destroy,
    _test: { reset: _resetAll, pathOf: (row) => (_rowInfo.get(row) || {}).path },
  };
})();
