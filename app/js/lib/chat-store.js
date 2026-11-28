/* ═══════════════════════════════════════════════════════════════════
   NICE — ChatStore
   The NICE chat app's data: projects, the chats in them (or loose ones,
   outside any project) and each chat's messages. One record per account
   on this device (Utils.KEYS.chats(userId)), so a shared computer never
   shows one person's chats to another. Every change fires EVENT; a change
   made in another tab arrives through the storage event and fires it too.
═══════════════════════════════════════════════════════════════════ */

const ChatStore = (() => {
  const EVENT = 'nice:chats';
  const VERSION = 1;
  const TITLE_MAX = 60;
  const NAME_MAX = 80;

  let _cache = null;
  let _cacheKey = null;

  function _userId() {
    const user = typeof State !== 'undefined' ? State.get('user') : null;
    return (user && user.id) || null;
  }

  function _key() { return Utils.KEYS.chats(_userId()); }

  function _empty() { return { v: VERSION, projects: [], chats: [], messages: {} }; }

  function _read() {
    const key = _key();
    if (_cache && _cacheKey === key) return _cache;
    let data = null;
    try { data = JSON.parse(localStorage.getItem(key) || 'null'); } catch { data = null; }
    if (!data || data.v !== VERSION || !Array.isArray(data.projects) || !Array.isArray(data.chats) || typeof data.messages !== 'object' || !data.messages) {
      data = _empty();
    }
    _cache = data;
    _cacheKey = key;
    return data;
  }

  function _write(data, change) {
    try {
      localStorage.setItem(_key(), JSON.stringify(data));
    } catch (e) {
      // Storage full: the change stays in memory for this visit, and the
      // user hears that it will not survive a reload.
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Chats not saved', message: 'This browser is out of storage, so recent chats will be gone after a reload.', type: 'error' });
      }
    }
    _cache = data;
    _cacheKey = _key();
    _emit(change);
  }

  function _emit(change) {
    if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent(EVENT, { detail: change || {} }));
  }

  function _id() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  const _now = () => new Date().toISOString();
  const _clean = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);
  const _byRecent = (a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at));

  /* ── Projects ── */
  function projects() {
    return _read().projects.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  }

  function project(id) { return _read().projects.find(p => p.id === id) || null; }

  function createProject(name) {
    const data = _read();
    const p = { id: _id(), name: _clean(name, NAME_MAX) || 'New project', created_at: _now() };
    data.projects.push(p);
    _write(data, { type: 'project', id: p.id });
    return p;
  }

  function renameProject(id, name) {
    const data = _read();
    const p = data.projects.find(x => x.id === id);
    const clean = _clean(name, NAME_MAX);
    if (!p || !clean || clean === p.name) return p || null;
    p.name = clean;
    _write(data, { type: 'project', id });
    return p;
  }

  // A project goes with its chats and their messages.
  function deleteProject(id) {
    const data = _read();
    if (!data.projects.some(p => p.id === id)) return false;
    data.projects = data.projects.filter(p => p.id !== id);
    data.chats.filter(c => c.project_id === id).forEach(c => { delete data.messages[c.id]; });
    data.chats = data.chats.filter(c => c.project_id !== id);
    _write(data, { type: 'project', id, deleted: true });
    return true;
  }

  /* ── Chats ── */
  // projectId null lists the loose chats; undefined lists every chat.
  function chats(projectId) {
    const all = _read().chats;
    const list = projectId === undefined ? all : all.filter(c => (c.project_id || null) === (projectId || null));
    return list.slice().sort(_byRecent);
  }

  function chat(id) { return _read().chats.find(c => c.id === id) || null; }

  function createChat({ projectId = null, model = null, title = '' } = {}) {
    const data = _read();
    const pid = projectId && data.projects.some(p => p.id === projectId) ? projectId : null;
    const now = _now();
    const c = { id: _id(), project_id: pid, title: _clean(title, TITLE_MAX), model: model || null, created_at: now, updated_at: now };
    data.chats.push(c);
    data.messages[c.id] = [];
    _write(data, { type: 'chat', id: c.id });
    return c;
  }

  function renameChat(id, title) {
    const data = _read();
    const c = data.chats.find(x => x.id === id);
    const clean = _clean(title, TITLE_MAX);
    if (!c || !clean || clean === c.title) return c || null;
    c.title = clean;
    _write(data, { type: 'chat', id });
    return c;
  }

  function setChatModel(id, model) {
    const data = _read();
    const c = data.chats.find(x => x.id === id);
    if (!c || !model || c.model === model) return c || null;
    c.model = model;
    _write(data, { type: 'chat', id });
    return c;
  }

  function deleteChat(id) {
    const data = _read();
    if (!data.chats.some(c => c.id === id)) return false;
    data.chats = data.chats.filter(c => c.id !== id);
    delete data.messages[id];
    _write(data, { type: 'chat', id, deleted: true });
    return true;
  }

  /* ── Messages ── */
  function messages(chatId) { return (_read().messages[chatId] || []).slice(); }

  // A chat with no title takes its first prompt as one.
  function addMessage(chatId, msg) {
    const data = _read();
    const c = data.chats.find(x => x.id === chatId);
    if (!c) return null;
    const m = {
      id: _id(),
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      text: String(msg.text == null ? '' : msg.text),
      model: msg.model || null,
      created_at: _now(),
      ...(msg.status ? { status: msg.status } : {}),
    };
    (data.messages[chatId] = data.messages[chatId] || []).push(m);
    if (m.role === 'user' && !c.title) c.title = _clean(m.text, TITLE_MAX);
    c.updated_at = m.created_at;
    _write(data, { type: 'message', chatId, id: m.id });
    return m;
  }

  // Only a reply's text, status and model change after it is written.
  function updateMessage(chatId, id, patch) {
    const data = _read();
    const m = (data.messages[chatId] || []).find(x => x.id === id);
    if (!m) return null;
    if ('text' in patch) m.text = String(patch.text == null ? '' : patch.text);
    if ('model' in patch) m.model = patch.model || null;
    if ('status' in patch) { if (patch.status) m.status = patch.status; else delete m.status; }
    _write(data, { type: 'message', chatId, id });
    return m;
  }

  function removeMessage(chatId, id) {
    const data = _read();
    const list = data.messages[chatId];
    if (!list || !list.some(m => m.id === id)) return false;
    data.messages[chatId] = list.filter(m => m.id !== id);
    _write(data, { type: 'message', chatId, id, deleted: true });
    return true;
  }

  // A reply still on its way when the page went away never comes back:
  // it reads as stopped next time instead of waiting forever.
  function _settleStale(data) {
    let changed = false;
    Object.values(data.messages).forEach(list => (list || []).forEach(m => {
      if (m.status === 'pending') { m.status = 'stopped'; changed = true; }
    }));
    return changed;
  }

  function init() {
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key !== _key()) return;
        _cache = null;
        _emit({ type: 'external' });
      });
    }
    if (typeof State !== 'undefined') {
      State.on('user', () => {
        if (_cacheKey === _key()) return;
        _cache = null;
        const data = _read();
        if (_settleStale(data)) _write(data, { type: 'external' });
        else _emit({ type: 'account' });
      });
    }
    const data = _read();
    if (_settleStale(data)) _write(data, { type: 'external' });
  }

  function _reset() { _cache = null; _cacheKey = null; }

  return {
    EVENT, TITLE_MAX, NAME_MAX,
    init, projects, project, createProject, renameProject, deleteProject,
    chats, chat, createChat, renameChat, setChatModel, deleteChat,
    messages, addMessage, updateMessage, removeMessage,
    _reset,
  };
})();
