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
  const PANEL_KEY = 'nice-code-panel';      // { open, tab }
  const MODEL_KEY = 'nice-code-model';
  const TERM_MAX_CHARS = 200000;
  const SEND_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';

  let _el = null;
  let _ws = null;            // { root, name } of the open folder
  let _offRunData = null;

  // Conversation, kept across visits until the folder changes.
  let _thread = [];          // { role: 'user'|'assistant'|'note', text }
  let _convo = null;
  let _convoBlueprint = null;
  let _busy = false;
  let _stopAsked = false;

  // Files tab
  const _dirCache = new Map();   // dir path → entries
  const _expanded = new Set(['.']);
  let _openFile = null;          // { path, content, totalLines, endLine } | { path, error }

  // Terminal tab
  let _termText = '';
  let _termRun = null;           // { tag, id } while a command runs
  let _termHistory = [];
  let _termHistoryAt = -1;

  const _host = () => (typeof window !== 'undefined' && window.NiceDesktop && window.NiceDesktop.code) || null;

  function _panelState() {
    try { return { open: true, tab: 'files', ...JSON.parse(localStorage.getItem(PANEL_KEY) || '{}') }; }
    catch { return { open: true, tab: 'files' }; }
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
        <p class="code-empty-text">Code is one agent that works on a folder on your computer: it reads and edits files and runs commands. A web page can't reach your files or a terminal, so Code lives in the desktop app.</p>
        <a class="btn btn-sm" href="#/">Back to NICE</a>
      </div>`;
  }

  function _renderOpenFolder(el) {
    el.innerHTML = `
      <div class="code-empty">
        <svg class="code-empty-icon" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><use href="#icon-folder"/></svg>
        <h1 class="code-empty-title">Open a folder</h1>
        <p class="code-empty-text">Code works inside one folder. It can read and change files there and run commands in it, and nothing outside it.</p>
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
    _ws = ws;
    _thread = [];
    _convo = null;
    _convoBlueprint = null;
    _dirCache.clear();
    _expanded.clear();
    _expanded.add('.');
    _openFile = null;
    _termText = '';
  }

  function _renderWorkspace(el) {
    const panel = _panelState();
    el.innerHTML = `
      <div class="code-view${panel.open ? '' : ' code-panel-closed'}">
        <section class="code-chat" aria-label="Conversation">
          <header class="code-chat-hdr">
            <button type="button" class="code-folder" id="code-change-folder" title="${_esc(_ws.root)}">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><use href="#icon-folder"/></svg>
              <span>${_esc(_ws.name)}</span>
            </button>
            <div class="code-chat-tools">
              <button type="button" class="code-icon-btn" data-panel="files" aria-label="Files" title="Files"><svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-folder"/></svg></button>
              <button type="button" class="code-icon-btn" data-panel="terminal" aria-label="Terminal" title="Terminal"><svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-terminal"/></svg></button>
            </div>
          </header>
          <div class="code-thread" id="code-thread" aria-live="polite"></div>
          <form class="code-prompt" id="code-prompt">
            <textarea id="code-input" rows="1" placeholder="Ask Code to do something in ${_esc(_ws.name)}" aria-label="Message Code"></textarea>
            <div class="code-prompt-bar">
              <select id="code-model" aria-label="Model">${_modelOptions()}</select>
              <button type="submit" class="code-send" id="code-send" aria-label="Send">
                ${SEND_ICON}
              </button>
            </div>
          </form>
        </section>
        <aside class="code-panel" aria-label="Files and terminal">
          <div class="code-panel-tabs" role="tablist">
            <button type="button" role="tab" class="code-panel-tab" data-tab="files">Files</button>
            <button type="button" role="tab" class="code-panel-tab" data-tab="terminal">Terminal</button>
            <button type="button" class="code-icon-btn code-panel-close" id="code-panel-close" aria-label="Close panel" title="Close panel">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-x"/></svg>
            </button>
          </div>
          <div class="code-panel-body" id="code-panel-body"></div>
        </aside>
      </div>`;
    _bind(el);
    _renderThread();
    _renderPanel();
  }

  function _bind(el) {
    el.querySelector('#code-change-folder').addEventListener('click', _openFolder);
    el.querySelectorAll('[data-panel]').forEach(b => b.addEventListener('click', () => _showPanel(b.dataset.panel, true)));
    el.querySelectorAll('.code-panel-tab').forEach(b => b.addEventListener('click', () => _showPanel(b.dataset.tab)));
    el.querySelector('#code-panel-close').addEventListener('click', () => {
      _savePanel({ ..._panelState(), open: false });
      el.querySelector('.code-view').classList.add('code-panel-closed');
    });
    const form = el.querySelector('#code-prompt');
    const input = el.querySelector('#code-input');
    form.addEventListener('submit', (e) => { e.preventDefault(); _busy ? _stop() : _send(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!_busy) _send(); }
    });
    input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 240) + 'px'; });
    el.querySelector('#code-model').addEventListener('change', (e) => {
      try { localStorage.setItem(MODEL_KEY, e.target.value); } catch {}
      if (_convoBlueprint) _convoBlueprint.config.llm_engine = e.target.value;
    });
  }

  function _showPanel(tab, toggle) {
    const s = _panelState();
    const view = _el && _el.querySelector('.code-view');
    if (!view) return;
    if (toggle && s.open && s.tab === tab) {
      _savePanel({ ...s, open: false });
      view.classList.add('code-panel-closed');
      return;
    }
    _savePanel({ open: true, tab });
    view.classList.remove('code-panel-closed');
    _renderPanel();
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
    return models.map(m => `<option value="${_esc(m.id)}"${m.id === pick ? ' selected' : ''}>${_esc(m.label || m.id)}</option>`).join('');
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
    if (!text || _busy) return;
    input.value = '';
    input.style.height = 'auto';
    _thread.push({ role: 'user', text });

    const user = typeof State !== 'undefined' ? State.get('user') : null;
    if (!user) {
      _thread.push({ role: 'note', text: 'Sign in to use NICE\'s models. Using your own API keys comes in a later version.' });
      _renderThread();
      return;
    }
    if (typeof AgentExecutor === 'undefined') {
      _thread.push({ role: 'note', text: 'The agent is not loaded. Reload the app and try again.' });
      _renderThread();
      return;
    }

    if (!_convo) {
      const model = (_el.querySelector('#code-model') || {}).value || 'gemini-2-5-flash';
      _convoBlueprint = { id: null, name: 'Code', config: { llm_engine: model, system_prompt: _systemPrompt() } };
      _convo = AgentExecutor.converse(_convoBlueprint, { tools: [], maxSteps: 1, shouldStop: () => _stopAsked });
    }

    _setBusy(true);
    _renderThread();
    try {
      const turn = await _convo.send(text);
      if (turn.stopped) _thread.push({ role: 'note', text: 'Stopped.' });
      else if (turn.error) _thread.push({ role: 'note', text: turn.text.replace(/^Error:\s*/, 'Something went wrong: ') });
      else _thread.push({ role: 'assistant', text: turn.text || '' });
    } catch (e) {
      _thread.push({ role: 'note', text: 'Something went wrong: ' + (e.message || String(e)) });
    } finally {
      _setBusy(false);
      _renderThread();
    }
  }

  function _stop() { _stopAsked = true; }

  function _setBusy(on) {
    _busy = on;
    _stopAsked = false;
    const btn = _el && _el.querySelector('#code-send');
    if (!btn) return;
    btn.classList.toggle('is-busy', on);
    btn.setAttribute('aria-label', on ? 'Stop' : 'Send');
    btn.innerHTML = on
      ? '<span class="code-stop-square" aria-hidden="true"></span>'
      : SEND_ICON;
  }

  function _md(text) {
    return (typeof PromptPanel !== 'undefined' && typeof PromptPanel._md === 'function')
      ? PromptPanel._md(text)
      : _esc(text).replace(/\n/g, '<br>');
  }

  function _renderThread() {
    const box = _el && _el.querySelector('#code-thread');
    if (!box) return;
    if (!_thread.length && !_busy) {
      box.innerHTML = `<div class="code-thread-empty">Ask about the code in <strong>${_esc(_ws.name)}</strong>. Files and Terminal are on the right.</div>`;
      return;
    }
    box.innerHTML = _thread.map(m => {
      if (m.role === 'user') return `<div class="code-msg code-msg-user">${_esc(m.text)}</div>`;
      if (m.role === 'note') return `<div class="code-msg code-msg-note">${_esc(m.text)}</div>`;
      return `<div class="code-msg code-msg-assistant">${_md(m.text)}</div>`;
    }).join('') + (_busy ? '<div class="code-msg code-msg-working"><span class="status-dot dot-a" aria-hidden="true"></span>Working…</div>' : '');
    box.scrollTop = box.scrollHeight;
  }

  /* ── Panel ──────────────────────────────────────────────────────── */

  function _renderPanel() {
    const s = _panelState();
    if (!_el) return;
    _el.querySelectorAll('.code-panel-tab').forEach(t => {
      const on = t.dataset.tab === s.tab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (s.tab === 'terminal') _renderTerminal(); else _renderFiles();
  }

  // Files

  async function _entries(dir) {
    if (_dirCache.has(dir)) return _dirCache.get(dir);
    const r = await _host().list(dir);
    _dirCache.set(dir, r.entries);
    return r.entries;
  }

  const _join = (dir, name) => dir === '.' ? name : dir + '/' + name;

  async function _treeHTML(dir, depth) {
    let entries;
    try { entries = await _entries(dir); }
    catch (e) { return `<div class="code-tree-err" style="--depth:${depth}">${_esc(e.message || 'Could not list this folder')}</div>`; }
    const rows = [];
    for (const e of entries) {
      const p = _join(dir, e.name);
      const isDir = e.type === 'dir';
      const open = isDir && _expanded.has(p);
      rows.push(`<button type="button" class="code-tree-row${_openFile && _openFile.path === p ? ' active' : ''}" style="--depth:${depth}" data-path="${_esc(p)}" data-type="${isDir ? 'dir' : 'file'}"${isDir ? ` aria-expanded="${open}"` : ''}>
        <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><use href="#icon-${isDir ? (open ? 'chevron-down' : 'chevron-right') : 'file'}"/></svg>
        <span>${_esc(e.name)}</span></button>`);
      if (open) rows.push(await _treeHTML(p, depth + 1));
    }
    return rows.join('');
  }

  async function _renderFiles() {
    const body = _el && _el.querySelector('#code-panel-body');
    if (!body) return;
    if (_openFile) {
      const f = _openFile;
      body.innerHTML = `
        <div class="code-file-hdr">
          <button type="button" class="code-icon-btn" id="code-file-back" aria-label="Back to files" title="Back to files"><svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-arrow-left"/></svg></button>
          <span class="code-file-path">${_esc(f.path)}</span>
        </div>
        ${f.error
          ? `<div class="code-tree-err">${_esc(f.error)}</div>`
          : `<pre class="code-file-body"><code>${_esc(f.content)}</code></pre>${f.endLine < f.totalLines ? `<div class="code-file-more">Showing lines 1 to ${f.endLine} of ${f.totalLines}.</div>` : ''}`}`;
      body.querySelector('#code-file-back').addEventListener('click', () => { _openFile = null; _renderFiles(); });
      return;
    }
    const html = await _treeHTML('.', 0);
    if (!_el || _panelState().tab !== 'files' || _openFile) return;
    body.innerHTML = `<div class="code-tree">${html || '<div class="code-tree-err">This folder is empty.</div>'}
      </div><div class="code-tree-foot"><button type="button" class="btn btn-sm" id="code-refresh-files">Refresh</button></div>`;
    body.querySelectorAll('.code-tree-row').forEach(row => row.addEventListener('click', () => _onTreeClick(row)));
    body.querySelector('#code-refresh-files').addEventListener('click', () => { _dirCache.clear(); _renderFiles(); });
  }

  async function _onTreeClick(row) {
    const p = row.dataset.path;
    if (row.dataset.type === 'dir') {
      if (_expanded.has(p)) _expanded.delete(p); else _expanded.add(p);
      _renderFiles();
      return;
    }
    try {
      const r = await _host().read(p, { limit: 2000 });
      _openFile = { path: p, content: r.content, totalLines: r.totalLines, endLine: r.endLine };
    } catch (e) {
      _openFile = { path: p, error: e.code === 'EBINARY' ? 'This is a binary file.' : (e.message || 'Could not open this file.') };
    }
    _renderFiles();
  }

  // Terminal

  function _renderTerminal() {
    const body = _el && _el.querySelector('#code-panel-body');
    if (!body) return;
    body.innerHTML = `
      <div class="code-term">
        <pre class="code-term-out" id="code-term-out" aria-live="polite"></pre>
        <form class="code-term-line" id="code-term-form">
          <span class="code-term-prompt" aria-hidden="true">$</span>
          <input id="code-term-input" type="text" autocomplete="off" spellcheck="false" aria-label="Command" placeholder="Run a command in ${_esc(_ws.name)}">
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
    const tag = 'term-' + Date.now();
    _termRun = { tag, id: null };
    _termAppend('$ ' + cmd + '\n');
    try {
      const r = await host.run(cmd, { tag });
      const trunc = r.stdoutTruncated || r.stderrTruncated ? ' (output cut short)' : '';
      if (r.timedOut) _termAppend(`\nStopped after the time limit.${trunc}\n`);
      else if (r.killed) _termAppend(`\nStopped.\n`);
      else if (r.error) _termAppend(`\n${r.error}\n`);
      else if (r.exitCode !== 0) _termAppend(`\nExit code ${r.exitCode}${trunc}\n`);
      else if (trunc) _termAppend(`\n${trunc.trim()}\n`);
    } catch (e) {
      _termAppend((e.message || String(e)) + '\n');
    } finally {
      _termRun = null;
      _paintTerm();
    }
  }

  function _stopTerminal() {
    const host = _host();
    if (_termRun && _termRun.id != null && host) host.kill(_termRun.id).catch(() => {});
  }

  function _onRunData(d) {
    if (!d || !_termRun || d.tag !== _termRun.tag) return;
    if (d.stream === 'start') { _termRun.id = d.id; return; }
    _termAppend(d.data);
  }

  function destroy() {
    // The conversation and the terminal keep running while the user is on
    // another page; only the DOM goes.
    _el = null;
  }

  return { title, render, destroy, _test: { reset: () => { _ws = null; _thread = []; _convo = null; _termText = ''; _termRun = null; _openFile = null; _dirCache.clear(); if (_offRunData) { _offRunData(); _offRunData = null; } } } };
})();
