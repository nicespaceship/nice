/* ═══════════════════════════════════════════════════════════════════
   NICE — Chat (#/, #/project/:id, #/chat/:id)
   The NICE app: a plain chat with a model. #/ starts a chat on its own,
   #/project/:id starts one inside a project and lists the project's chats,
   #/chat/:id is the conversation. ChatStore keeps everything; a reply on
   its way belongs to this module, not to the page on screen, so leaving a
   chat and coming back finds the reply where it landed.
═══════════════════════════════════════════════════════════════════ */

const NiceChatView = (() => {
  const title = 'Chat';
  const _esc = Utils.esc;
  const _attr = Utils.escAttr;
  const DEFAULT_MODEL = 'gemini-2-5-flash';
  const HISTORY_TURNS = 40;

  // Quick starts under the prompt: each fills the box with a beginning.
  const STARTS = [
    { label: 'Research',   icon: 'search',    text: 'Research ' },
    { label: 'Write',      icon: 'edit',      text: 'Write ' },
    { label: 'Code',       icon: 'file-code',      text: 'Write code that ' },
    { label: 'Analyze',    icon: 'analytics', text: 'Analyze ' },
    { label: 'Brainstorm', icon: 'zap',       text: 'Brainstorm ideas for ' },
    { label: 'Plan',       icon: 'task',      text: 'Make a plan to ' },
  ];

  let _el = null;
  let _route = null;        // { kind: 'home' | 'project' | 'chat', id }
  let _onStore = null;
  let _onModels = null;
  let _draft = {};          // per-place text not sent yet, so a redraw keeps it

  // Replies on their way, by chat: { gen, stop }. A newer send or Stop
  // bumps nothing here; Stop marks the turn so its reply is dropped.
  const _turns = new Map();

  /* ── Models ── */
  function _models() {
    const list = (typeof SpaceCards !== 'undefined' && SpaceCards.available) ? SpaceCards.available() : [];
    return list.length ? list : [DEFAULT_MODEL];
  }

  function _label(id) {
    if (typeof SpaceCards !== 'undefined' && SpaceCards.label) return SpaceCards.label(id);
    const m = typeof ModelCatalog !== 'undefined' && ModelCatalog.MODEL_CATALOG ? ModelCatalog.MODEL_CATALOG.find(x => x.id === id) : null;
    return (m && m.name) || id;
  }

  function _canon(id) {
    return (typeof LLMConfig !== 'undefined' && LLMConfig.canonicalize) ? LLMConfig.canonicalize(id) : id;
  }

  // The model for a new chat: the one picked last, while it can still run.
  function _defaultModel() {
    const models = _models();
    let saved = null;
    try { saved = localStorage.getItem(Utils.KEYS.chatModel); } catch {}
    if (saved && models.includes(_canon(saved))) return _canon(saved);
    return models.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : models[0];
  }

  function _chatModel(chat) {
    return (chat && chat.model) ? _canon(chat.model) : _defaultModel();
  }

  function _rememberModel(id) {
    try { localStorage.setItem(Utils.KEYS.chatModel, id); } catch {}
  }

  /* ── Greeting ── */
  function _greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function _name() {
    const user = State.get('user');
    if (user?.user_metadata?.display_name) return user.user_metadata.display_name;
    if (user?.email) return user.email.split('@')[0];
    return '';
  }

  /* ── Render ── */
  function render(el, params) {
    _el = el;
    const p = Router.path();
    if (p.startsWith('/chat/')) _route = { kind: 'chat', id: params && params.id };
    else if (p.startsWith('/project/')) _route = { kind: 'project', id: params && params.id };
    else _route = { kind: 'home', id: null };

    el.classList.add('view-no-scroll');
    el.addEventListener('click', _onClick);
    _onStore = (e) => _storeChanged(e.detail || {});
    document.addEventListener(ChatStore.EVENT, _onStore);
    _show();

    _onModels = () => _paintModel();
    State.onScoped('enabled_models', _onModels);
    // A reload signed in draws before the session lands: the chat is in the
    // account's record, not the guest's, so the page draws again once it does.
    State.onScoped('user', () => { if (_shown !== 'page') _show(); else _onModels(); });
    if (typeof OwnKeys !== 'undefined' && OwnKeys.EVENT) document.addEventListener(OwnKeys.EVENT, _onModels);
  }

  let _shown = null; // 'page' | 'missing' | 'waiting'

  function _exists() {
    if (_route.kind === 'chat') return !!ChatStore.chat(_route.id);
    if (_route.kind === 'project') return !!ChatStore.project(_route.id);
    return true;
  }

  function _show() {
    if (!_el) return;
    if (_exists()) { _shown = 'page'; _paint(); return; }
    // A saved session whose user has not loaded yet: wait for it instead of
    // saying the chat is gone.
    if (!State.get('user') && Utils.hasAuthSession && Utils.hasAuthSession()) {
      _shown = 'waiting';
      _el.innerHTML = '<div class="nc"></div>';
      return;
    }
    _shown = 'missing';
    if (_route.kind === 'chat') _missing('This chat is gone', 'It was deleted, or it was made on another computer.');
    else _missing('This project is gone', 'It was deleted, or it was made on another computer.');
  }

  function _missing(heading, body) {
    _el.innerHTML = `<div class="app-empty"><h2>${_esc(heading)}</h2><p>${_esc(body)}</p><div class="app-empty-acts"><a href="#/" class="btn btn-sm">New chat</a></div></div>`;
  }

  function _place() { return _route.kind + ':' + (_route.id || ''); }

  function _paint() {
    if (!_el) return;
    const chat = _route.kind === 'chat' ? ChatStore.chat(_route.id) : null;
    const project = _route.kind === 'project' ? ChatStore.project(_route.id)
      : (chat && chat.project_id ? ChatStore.project(chat.project_id) : null);
    const body = _route.kind === 'chat' ? _chatHTML(chat, project)
      : _route.kind === 'project' ? _projectHTML(project)
      : _homeHTML();
    _el.innerHTML = `<div class="nc nc-${_route.kind}">${body}${_promptHTML(chat)}</div>`;
    _wire();
    if (_route.kind === 'chat') _scrollToEnd();
  }

  function _homeHTML() {
    const name = _name();
    return `<div class="nc-hero">
      <h1 class="nc-greeting">${_esc(_greeting())}${name ? ', ' + _esc(name) : ''}</h1>
      <button type="button" class="nc-cta" data-act="new-project">New project</button>
    </div>`;
  }

  function _projectHTML(project) {
    const list = ChatStore.chats(project.id);
    const rows = list.length ? `<ul class="nc-chat-list" aria-label="Chats in ${_attr(project.name)}">
      ${list.map(c => `<li><a href="#/chat/${encodeURIComponent(c.id)}" class="nc-chat-link"><span>${_esc(c.title || 'New chat')}</span><time>${_esc(Utils.timeAgo(c.updated_at))}</time></a></li>`).join('')}
    </ul>` : `<p class="nc-muted">No chats yet. Ask something below to start one.</p>`;
    return `<div class="nc-hero nc-hero-project">
      <p class="nc-overline">Project</p>
      <h1 class="nc-greeting">${_esc(project.name)}</h1>
      ${rows}
    </div>`;
  }

  function _chatHTML(chat, project) {
    const msgs = ChatStore.messages(chat.id);
    return `<header class="nc-head">
        <h1 class="nc-title">${_esc(chat.title || 'New chat')}</h1>
        ${project ? `<a class="nc-head-project" href="#/project/${encodeURIComponent(project.id)}">${_esc(project.name)}</a>` : ''}
      </header>
      <div class="nc-thread" id="nc-thread" role="log" aria-live="polite" aria-label="Conversation">
        <div class="nc-thread-inner">${msgs.map(m => _msgHTML(chat, m)).join('')}</div>
      </div>`;
  }

  function _md(text) {
    return (typeof PromptPanel !== 'undefined' && typeof PromptPanel._md === 'function')
      ? PromptPanel._md(text)
      : `<p>${_esc(text).replace(/\n/g, '<br>')}</p>`;
  }

  function _msgHTML(chat, m) {
    if (m.role === 'user') return `<div class="nc-msg nc-msg-user" data-id="${_attr(m.id)}"><div class="nc-bubble">${_esc(m.text)}</div></div>`;
    const who = `<div class="nc-who">${_esc(_label(m.model || _chatModel(chat)))}</div>`;
    let body;
    if (m.status === 'pending') body = `<p class="nc-working"><span class="status-dot dot-a" aria-hidden="true"></span>Thinking…</p>`;
    else if (m.status === 'stopped') body = `<p class="nc-note">Stopped.</p>`;
    else if (m.status === 'error') body = `<p class="nc-note"><span class="status-dot dot-r" aria-hidden="true"></span>${_esc(m.text || 'Something went wrong.')}</p><button type="button" class="nc-retry" data-act="retry" data-id="${_attr(m.id)}">Retry</button>`;
    else body = `<div class="nc-md">${_md(m.text)}</div>`;
    return `<div class="nc-msg nc-msg-assistant" data-id="${_attr(m.id)}">${who}${body}</div>`;
  }

  function _modelPickHTML(chat) {
    const current = _chatModel(chat);
    const ids = _models();
    const list = ids.includes(current) ? ids : [current, ...ids];
    const options = list.map(id => ({ value: id, label: _label(id) }));
    if (typeof CSelect === 'undefined') return `<span class="nc-model-name">${_esc(_label(current))}</span>`;
    return CSelect.html('nc-model', 'Model', options, current);
  }

  function _promptHTML(chat) {
    const busy = chat && _turns.has(chat.id);
    const empty = !chat || !ChatStore.messages(chat.id).length;
    const where = _route.kind === 'project' ? 'Start a chat in this project…' : chat ? 'Reply…' : 'Ask NICE…';
    return `<div class="nc-dock">
      <form class="nc-prompt" id="nc-prompt" autocomplete="off">
        <label class="sr-only" for="nc-input">Message</label>
        <textarea class="nc-input" id="nc-input" rows="1" placeholder="${_attr(where)}">${_esc(_draft[_place()] || '')}</textarea>
        <div class="nc-toolbar">
          <span class="nc-toolbar-gap"></span>
          <span class="nc-model" id="nc-model-wrap">${_modelPickHTML(chat)}</span>
          ${busy
            ? `<button type="button" class="nc-btn nc-stop" id="nc-stop" aria-label="Stop">${Utils.icon('x', 'icon-sm')}</button>`
            : `<button type="submit" class="nc-btn nc-send" id="nc-send" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg></button>`}
        </div>
      </form>
      ${empty ? `<div class="nc-starts" role="group" aria-label="Quick starts">
        ${STARTS.map((s, i) => `<button type="button" class="nc-start" data-start="${i}">${Utils.icon(s.icon, 'icon-sm')}<span>${_esc(s.label)}</span></button>`).join('')}
      </div>` : ''}
    </div>`;
  }

  /* ── Wiring ── */
  function _wire() {
    const form = _el.querySelector('#nc-prompt');
    const input = _el.querySelector('#nc-input');
    if (!form || !input) return;
    _grow(input);
    form.addEventListener('submit', (e) => { e.preventDefault(); _submit(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); _submit(); }
    });
    input.addEventListener('input', () => { _draft[_place()] = input.value; _grow(input); });
    _el.querySelector('#nc-stop')?.addEventListener('click', () => _stop(_route.id));
    _el.querySelectorAll('.nc-start').forEach(b => b.addEventListener('click', () => {
      const s = STARTS[Number(b.dataset.start)];
      if (!s) return;
      input.value = s.text;
      _draft[_place()] = input.value;
      _grow(input);
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }));
    _mountModel();
    // Never pull focus out of a box the user is typing in elsewhere (a
    // sidebar rename that started before this page drew).
    const typing = document.activeElement && document.activeElement !== document.body && document.activeElement.matches('input, textarea, [contenteditable="true"]');
    if (!typing && (_route.kind !== 'chat' || !ChatStore.messages(_route.id).length)) input.focus({ preventScroll: true });
  }

  function _mountModel() {
    if (typeof CSelect === 'undefined' || !_el.querySelector('#nc-model')) return;
    CSelect.mount('nc-model', (value) => {
      _rememberModel(value);
      if (_route.kind === 'chat') ChatStore.setChatModel(_route.id, value);
    });
  }

  function _onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn || !_el.contains(btn)) return;
    if (btn.dataset.act === 'new-project') newProject();
    else if (btn.dataset.act === 'retry') _retry(_route.id, btn.dataset.id);
  }

  function _grow(input) {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 200) + 'px';
  }

  function _scrollToEnd() {
    const t = _el && _el.querySelector('#nc-thread');
    if (t) t.scrollTop = t.scrollHeight;
  }

  /* ── Store changes: redraw only what moved ── */
  function _storeChanged(change) {
    if (!_el) return;
    if (_shown !== 'page') { if (_exists()) _show(); return; }
    if (!_exists()) {
      // Deleted here or in another tab goes back to NICE; another account's
      // record (a sign-out) shows its own state.
      if (change.deleted) Router.navigate('#/');
      else _show();
      return;
    }
    if (_route.kind === 'chat') {
      if (change.type === 'message' && change.chatId === _route.id) { _paintThread(); return; }
      // Its own rename or model pick changes only its title; nothing about
      // other chats shows here. A store reloaded from another tab redraws.
      if (change.type === 'chat' && change.id === _route.id) {
        const t = _el.querySelector('.nc-title');
        const chat = ChatStore.chat(_route.id);
        if (t && chat) t.textContent = chat.title || 'New chat';
        return;
      }
      if (change.type !== 'external' && change.type !== 'account' && change.type !== 'project') return;
    } else if (change.type === 'message') {
      return;
    }
    const focused = document.activeElement && document.activeElement.id === 'nc-input';
    _paint();
    if (focused) _el.querySelector('#nc-input')?.focus({ preventScroll: true });
  }

  function _paintThread() {
    const chat = ChatStore.chat(_route.id);
    const inner = _el.querySelector('.nc-thread-inner');
    const thread = _el.querySelector('#nc-thread');
    if (!chat || !inner || !thread) { _paint(); return; }
    const atEnd = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80;
    inner.innerHTML = ChatStore.messages(chat.id).map(m => _msgHTML(chat, m)).join('');
    const title = _el.querySelector('.nc-title');
    if (title) title.textContent = chat.title || 'New chat';
    _paintSend(chat);
    if (atEnd) _scrollToEnd();
  }

  function _paintSend(chat) {
    const toolbar = _el && _el.querySelector('.nc-toolbar');
    if (!toolbar) return;
    const busy = _turns.has(chat.id);
    const has = toolbar.querySelector(busy ? '#nc-stop' : '#nc-send');
    if (has) return;
    toolbar.querySelector('#nc-stop, #nc-send')?.remove();
    toolbar.insertAdjacentHTML('beforeend', busy
      ? `<button type="button" class="nc-btn nc-stop" id="nc-stop" aria-label="Stop">${Utils.icon('x', 'icon-sm')}</button>`
      : `<button type="submit" class="nc-btn nc-send" id="nc-send" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg></button>`);
    toolbar.querySelector('#nc-stop')?.addEventListener('click', () => _stop(chat.id));
    _el.querySelector('.nc-starts')?.remove();
  }

  function _paintModel() {
    const wrap = _el && _el.querySelector('#nc-model-wrap');
    if (!wrap) return;
    const chat = _route.kind === 'chat' ? ChatStore.chat(_route.id) : null;
    wrap.innerHTML = _modelPickHTML(chat);
    _mountModel();
  }

  /* ── Sending ── */
  function _signedIn() { return !!State.get('user'); }
  function _ownKey(id) { return typeof OwnKeys !== 'undefined' && OwnKeys.isOwnKey(id); }

  function _pickedModel() {
    const root = _el && _el.querySelector('#nc-model');
    return (root && root.dataset.value) || _defaultModel();
  }

  function _submit() {
    const input = _el && _el.querySelector('#nc-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    const model = _pickedModel();
    // NICE's own models need a sign-in; the text stays in the box for after.
    if (!_ownKey(model) && !_signedIn()) {
      if (typeof AuthModal !== 'undefined' && AuthModal.open) AuthModal.open('Sign in to chat with ' + _label(model));
      return;
    }
    if (_route.kind === 'chat' && _turns.has(_route.id)) return;
    let chatId = _route.kind === 'chat' ? _route.id : null;
    delete _draft[_place()];
    input.value = '';
    if (!chatId) {
      const chat = ChatStore.createChat({ projectId: _route.kind === 'project' ? _route.id : null, model });
      chatId = chat.id;
    }
    ChatStore.addMessage(chatId, { role: 'user', text });
    _reply(chatId, model);
    if (_route.kind !== 'chat') Router.navigate('#/chat/' + encodeURIComponent(chatId));
  }

  // The conversation so far, as the model reads it: finished turns only.
  function _history(chatId, uptoId) {
    const out = [];
    for (const m of ChatStore.messages(chatId)) {
      if (m.id === uptoId) break;
      if (m.role === 'assistant' && m.status) continue;
      out.push({ role: m.role, content: m.text });
    }
    // A user turn whose reply failed or stopped leaves two user turns in a
    // row; providers want them to alternate, so the earlier ones merge.
    const merged = [];
    out.forEach(m => {
      const last = merged[merged.length - 1];
      if (last && last.role === m.role) last.content += '\n\n' + m.content;
      else merged.push({ ...m });
    });
    // The last turns only, opening on a user turn as providers require.
    const kept = merged.slice(-HISTORY_TURNS);
    while (kept.length && kept[0].role !== 'user') kept.shift();
    return kept;
  }

  function _systemPrompt() {
    return 'You are a helpful assistant in NICE, an app where people chat with AI models. '
      + 'Answer clearly and directly. Use Markdown for structure when it helps.';
  }

  async function _reply(chatId, model, replyId) {
    const pending = replyId
      ? ChatStore.updateMessage(chatId, replyId, { status: 'pending', text: '', model })
      : ChatStore.addMessage(chatId, { role: 'assistant', text: '', model, status: 'pending' });
    if (!pending) return;
    const turn = { stop: false };
    _turns.set(chatId, turn);
    if (_el && _route && _route.kind === 'chat' && _route.id === chatId) _paintSend(ChatStore.chat(chatId));

    const history = _history(chatId, pending.id);
    const prompt = history.length && history[history.length - 1].role === 'user' ? history.pop().content : '';
    let result = null, failure = null;
    try {
      const convo = AgentExecutor.converse(
        { id: null, name: 'NICE', config: { llm_engine: model, system_prompt: _systemPrompt() } },
        { tools: [], maxSteps: 1, history, shouldStop: () => turn.stop },
      );
      result = await convo.send(prompt);
    } catch (e) { failure = e; }

    if (_turns.get(chatId) === turn) _turns.delete(chatId);
    if (!ChatStore.chat(chatId)) return;
    if (turn.stop || (result && result.stopped)) {
      ChatStore.updateMessage(chatId, pending.id, { status: 'stopped', text: '' });
    } else if (failure || !result || result.error || !String(result.text || '').trim()) {
      const why = failure ? (failure.message || String(failure))
        : result && result.error ? String(result.text || '').replace(/^Error:\s*/, '')
        : 'The model sent back an empty reply.';
      ChatStore.updateMessage(chatId, pending.id, { status: 'error', text: why });
    } else {
      ChatStore.updateMessage(chatId, pending.id, { status: null, text: result.text });
    }
    if (_el && _route && _route.kind === 'chat' && _route.id === chatId) _paintSend(ChatStore.chat(chatId));
  }

  function _stop(chatId) {
    const turn = _turns.get(chatId);
    if (!turn) return;
    turn.stop = true;
    // The call already sent can't be cut off; its reply is dropped when it
    // lands. Each send reads the chat afresh, so the next one needn't wait.
    _turns.delete(chatId);
    const last = ChatStore.messages(chatId).filter(m => m.status === 'pending').pop();
    if (last) ChatStore.updateMessage(chatId, last.id, { status: 'stopped', text: '' });
    if (_el && _route && _route.kind === 'chat' && _route.id === chatId) _paintSend(ChatStore.chat(chatId));
  }

  function _retry(chatId, replyId) {
    if (!chatId || _turns.has(chatId)) return;
    const model = _pickedModel();
    if (!_ownKey(model) && !_signedIn()) {
      if (typeof AuthModal !== 'undefined' && AuthModal.open) AuthModal.open('Sign in to chat with ' + _label(model));
      return;
    }
    _reply(chatId, model, replyId);
  }

  /* ── Projects ── */
  function newProject() {
    const p = ChatStore.createProject('New project');
    Router.navigate('#/project/' + encodeURIComponent(p.id));
    document.dispatchEvent(new CustomEvent('nice:chat-rename', { detail: { kind: 'project', id: p.id } }));
  }

  function newChat(projectId) {
    Router.navigate(projectId ? '#/project/' + encodeURIComponent(projectId) : '#/');
    setTimeout(() => _el && _el.querySelector('#nc-input')?.focus(), 0);
  }

  function destroy() {
    if (_onStore) document.removeEventListener(ChatStore.EVENT, _onStore);
    if (_onModels && typeof OwnKeys !== 'undefined' && OwnKeys.EVENT) document.removeEventListener(OwnKeys.EVENT, _onModels);
    if (_el) { _el.removeEventListener('click', _onClick); _el.classList.remove('view-no-scroll'); }
    _onStore = null;
    _onModels = null;
    _shown = null;
    _el = null;
    _route = null;
  }

  function _resetForTest() { _turns.clear(); _draft = {}; }

  return { title, render, destroy, newProject, newChat, _resetForTest };
})();
