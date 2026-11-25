/* ═══════════════════════════════════════════════════════════════════
   NICE — Code
   Route: #/code (the Code side of the NICE / Code switch)

   One agent working on one folder on the user's computer. It runs in the
   desktop app, whose host (desktop/code-host.js) reaches the folder and a
   shell through window.NiceDesktop.code. On the website this page says so.

   Layout, after Claude Code's: the conversation on the left with the
   prompt bar under it; a closable panel on the right with Files and
   Terminal tabs.
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

  // Files tab
  const _dirCache = new Map();   // dir path → { entries, truncated }
  const _expanded = new Set(['.']);
  let _openFile = null;          // { path, content, totalLines, endLine } | { path, error }
  let _treeSeq = 0;              // the latest tree paint wins
  let _readSeq = 0;              // the latest file click wins

  // Terminal tab
  let _termText = '';
  let _termRun = null;           // { tag, id } while a command runs
  let _runSeq = 0;
  // Commands left behind by a folder change before their id arrived; they
  // are killed as soon as it does.
  const _strayTags = new Set();
  let _termHistory = [];
  let _termHistoryAt = -1;

  const _host = () => (typeof window !== 'undefined' && window.NiceDesktop && window.NiceDesktop.code) || null;
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
        <p class="code-empty-text">Code opens a folder on your computer and puts its files and a terminal next to a chat. You browse the files and run the commands; the agent answers in the chat but can't open or change files yet. A web page can't reach your files or a terminal, so Code lives in the desktop app.</p>
        <a class="btn btn-sm" href="#/">Back to NICE</a>
      </div>`;
  }

  function _renderOpenFolder(el) {
    el.innerHTML = `
      <div class="code-empty">
        <svg class="code-empty-icon" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><use href="#icon-folder"/></svg>
        <h1 class="code-empty-title">Open a folder</h1>
        <p class="code-empty-text">Code works in one folder: you browse its files and run commands from it. The agent can't open or change files yet, so paste what it needs to see.</p>
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
    _dirCache.clear();
    _expanded.clear();
    _expanded.add('.');
    _openFile = null;
    _termText = '';
    // A command still running in the old folder would go on unseen.
    if (_termRun) {
      if (_termRun.id != null) _kill(_termRun.id);
      else _strayTags.add(_termRun.tag);
      _termRun = null;
    }
  }

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
              <button type="button" class="code-icon-btn" data-panel="files" aria-label="Files" title="Files"><svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><use href="#icon-folder"/></svg></button>
              <button type="button" class="code-icon-btn" data-panel="terminal" aria-label="Terminal" title="Terminal"><svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><use href="#icon-terminal"/></svg></button>
            </div>
          </header>
          <div class="code-thread" id="code-thread" role="log" aria-live="polite" aria-label="Messages"></div>
          <form class="code-prompt" id="code-prompt">
            <textarea id="code-input" rows="1" placeholder="${_attr('Ask Code to do something in ' + _ws.name)}" aria-label="Message Code"></textarea>
            <div class="code-prompt-bar">
              <select id="code-model" class="code-model" aria-label="Model">${_modelOptions()}</select>
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
          <div class="code-panel-body" id="code-panel-body" role="tabpanel"></div>
        </aside>
      </div>`;
    _bind(el);
    _paintPanelState();
    _paintSend();
    _renderThread();
    _renderPanel();
  }

  function _bind(el) {
    el.querySelector('#code-change-folder').addEventListener('click', _openFolder);
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
    el.querySelector('#code-model').addEventListener('change', (e) => {
      try { localStorage.setItem(MODEL_KEY, e.target.value); } catch {}
      if (_convoBlueprint) _convoBlueprint.config.llm_engine = e.target.value;
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

  function _modelOptions() {
    const models = _models();
    let saved = null;
    try { saved = localStorage.getItem(MODEL_KEY); } catch {}
    const pick = models.find(m => m.id === saved) ? saved : models[0].id;
    return models.map(m => `<option value="${_attr(m.id)}"${m.id === pick ? ' selected' : ''}>${_esc(m.label || m.id)}</option>`).join('');
  }

  /* ── Conversation ───────────────────────────────────────────────── */

  function _systemPrompt() {
    return [
      `You are Code, the coding agent in NICE, working in the folder "${_ws.name}" on the user's computer.`,
      'In this version you cannot read or change files or run commands yourself yet. When you need to see code, ask the user to paste it or open it in the Files panel; when a command should run, give it to them to run in the Terminal panel.',
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

    const user = typeof State !== 'undefined' ? State.get('user') : null;
    if (!user) {
      _addMsg({ role: 'note', text: 'Sign in to use NICE\'s models. Using your own API keys comes in a later version.' });
      return;
    }
    if (typeof AgentExecutor === 'undefined') {
      _addMsg({ role: 'note', text: 'The agent is not loaded. Reload the app and try again.' });
      return;
    }

    if (!_convo) {
      const model = (_el.querySelector('#code-model') || {}).value || 'gemini-2-5-flash';
      const gen = _gen;
      _convoBlueprint = { id: null, name: 'Code', config: { llm_engine: model, system_prompt: _systemPrompt() } };
      _convo = AgentExecutor.converse(_convoBlueprint, {
        tools: [], maxSteps: 1,
        shouldStop: () => gen !== _gen || !!(_turn && _turn.gen === gen && _turn.stopAsked),
      });
    }

    const turnState = { gen: _gen, stopAsked: false };
    _turn = turnState;
    _paintSend();
    _paintWorking();
    let turn = null, failure = null;
    try { turn = await _convo.send(text); }
    catch (e) { failure = e; }
    if (_turn === turnState) _turn = null;
    // The folder changed while this reply was on its way: it belongs to
    // a conversation that is gone.
    if (turnState.gen !== _gen) return;
    // The model call can't be cut off mid-flight, so a reply that comes
    // back after Stop is dropped here.
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
    _paintSend();
    _paintWorking();
  }

  function _paintSend() {
    const btn = _el && _el.querySelector('#code-send');
    if (!btn) return;
    const busy = _busyNow();
    const stopping = busy && _turn.stopAsked;
    btn.classList.toggle('is-busy', busy);
    btn.classList.toggle('is-stopping', stopping);
    btn.setAttribute('aria-label', stopping ? 'Stopping' : busy ? 'Stop' : 'Send');
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
      : `<div class="code-thread-empty">Ask about the code in <strong>${_esc(_ws.name)}</strong>. Browse it in Files and run commands in Terminal.</div>`;
    _paintWorking();
  }

  function _addMsg(m) {
    _thread.push(m);
    const box = _threadBox();
    if (!box) return;
    const empty = box.querySelector('.code-thread-empty');
    if (empty) empty.remove();
    const working = box.querySelector('.code-msg-working');
    if (working) working.insertAdjacentHTML('beforebegin', _msgHTML(m));
    else box.insertAdjacentHTML('beforeend', _msgHTML(m));
    box.scrollTop = box.scrollHeight;
  }

  function _paintWorking() {
    const box = _threadBox();
    if (!box) return;
    let line = box.querySelector('.code-msg-working');
    if (!_busyNow()) { if (line) line.remove(); return; }
    const text = _turn.stopAsked ? 'Stopping…' : 'Working…';
    if (!line) {
      box.insertAdjacentHTML('beforeend', '<div class="code-msg code-msg-working"><span class="status-dot dot-a" aria-hidden="true"></span><span class="code-working-text"></span></div>');
      line = box.lastElementChild;
    }
    const label = line.querySelector('.code-working-text');
    if (label.textContent !== text) label.textContent = text;
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

  async function _treeHTML(dir, depth) {
    let listing;
    try { listing = await _list(dir); }
    catch (e) { return `<div class="code-tree-err" style="--depth:${depth}">${_esc(e.message || 'Could not list this folder')}</div>`; }
    const rows = [];
    for (const e of listing.entries) {
      const p = _join(dir, e.name);
      const isLink = e.type === 'link';
      // A link is a folder once it has listed like one.
      const isDir = e.type === 'dir' || (isLink && _dirCache.has(p));
      const open = isDir && _expanded.has(p);
      const icon = isLink ? 'external' : isDir ? (open ? 'chevron-down' : 'chevron-right') : 'file';
      rows.push(`<button type="button" class="code-tree-row${_openFile && _openFile.path === p ? ' active' : ''}" style="--depth:${depth}" data-path="${_attr(p)}" data-type="${isLink ? 'link' : isDir ? 'dir' : 'file'}"${isDir ? ` aria-expanded="${open}"` : ''}>
        <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><use href="#icon-${icon}"/></svg>
        <span class="code-tree-name">${_esc(e.name)}</span>${isLink ? '<span class="sr-only"> (link)</span>' : ''}</button>`);
      if (open) rows.push(await _treeHTML(p, depth + 1));
    }
    if (listing.truncated) {
      rows.push(`<div class="code-tree-more" style="--depth:${depth}">Only the first ${listing.entries.length} items are shown.</div>`);
    }
    return rows.join('');
  }

  async function _renderFiles() {
    const body = _el && _el.querySelector('#code-panel-body');
    if (!body || _panelState().tab !== 'files') return;
    const seq = ++_treeSeq;
    if (_openFile) {
      const f = _openFile;
      body.innerHTML = `
        <div class="code-file-hdr">
          <button type="button" class="code-icon-btn" id="code-file-back" aria-label="Back to files" title="Back to files"><svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><use href="#icon-arrow-left"/></svg></button>
          <span class="code-file-path">${_esc(f.path)}</span>
        </div>
        ${f.error
          ? `<div class="code-tree-err">${_esc(f.error)}</div>`
          : `<pre class="code-file-body"><code>${_esc(f.content)}</code></pre>${f.endLine < f.totalLines ? `<div class="code-file-more">Showing lines 1 to ${f.endLine} of ${f.totalLines}.</div>` : ''}`}`;
      body.querySelector('#code-file-back').addEventListener('click', () => { _openFile = null; _readSeq++; _renderFiles(); });
      return;
    }
    const gen = _gen;
    const html = await _treeHTML('.', 0);
    if (!_el || seq !== _treeSeq || gen !== _gen || _panelState().tab !== 'files' || _openFile) return;
    const target = _el.querySelector('#code-panel-body');
    if (!target) return;
    target.innerHTML = `<div class="code-tree">${html || '<div class="code-tree-err">This folder is empty.</div>'}
      </div><div class="code-tree-foot"><button type="button" class="btn btn-sm" id="code-refresh-files">Refresh</button></div>`;
    target.querySelectorAll('.code-tree-row').forEach(row => row.addEventListener('click', () => _onTreeClick(row)));
    target.querySelector('#code-refresh-files').addEventListener('click', () => { _dirCache.clear(); _renderFiles(); });
  }

  async function _onTreeClick(row) {
    const p = row.dataset.path;
    const type = row.dataset.type;
    if (row.getAttribute('aria-expanded') === 'true') {
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
      if (listed) { _expanded.add(p); _renderFiles(); return; }
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

  function _paintTerm() {
    const out = _el && _el.querySelector('#code-term-out');
    if (!out) return;
    out.textContent = _termText;
    out.scrollTop = out.scrollHeight;
    const stop = _el.querySelector('#code-term-stop');
    if (stop) stop.hidden = !_termRun;
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
    const run = { tag, id: null };
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
      _strayTags.delete(tag);
      if (_termRun === run) { _termRun = null; _paintTerm(); }
    }
  }

  function _kill(id) {
    const host = _host();
    if (host) host.kill(id).catch(() => {});
  }

  function _stopTerminal() {
    if (_termRun && _termRun.id != null) _kill(_termRun.id);
  }

  function _onRunData(d) {
    if (!d) return;
    if (d.stream === 'start' && _strayTags.delete(d.tag)) { _kill(d.id); return; }
    if (!_termRun || d.tag !== _termRun.tag) return;
    if (d.stream === 'start') { _termRun.id = d.id; return; }
    _termAppend(d.data);
  }

  function destroy() {
    // The conversation and the terminal keep running while the user is on
    // another page; only the DOM goes.
    _el = null;
  }

  function _resetAll() {
    _resetForFolder(null);
    _el = null;
    _turn = null;
    _strayTags.clear();
    _termHistory = [];
    _termHistoryAt = -1;
    _treeSeq = 0;
    _readSeq = 0;
    try { localStorage.removeItem(PANEL_KEY); localStorage.removeItem(MODEL_KEY); } catch {}
    if (_offRunData) { _offRunData(); _offRunData = null; }
  }

  return { title, render, destroy, _test: { reset: _resetAll } };
})();
