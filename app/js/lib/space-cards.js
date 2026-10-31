/* ═══════════════════════════════════════════════════════════════════
   NICE — Space cards (SSOT)
   The model cards on Space (#/space): which models get a card, which
   cards the prompt goes to, what each card is doing right now, and each
   card's thread inside the current conversation. ChatView draws the
   cards; PromptPanel sends to them.

   A conversation stays one flat message list (Utils.KEYS.aiMessages and
   the sidebar Chats list). Tags tie messages to cards:
     prompt   { role:'user', to:['gemini-2-5-flash', 'grok-4-3'] }
     reply    { role:'assistant', modelId:'grok-4-3', model:'Grok 4.3' }
   Untagged messages are NICE's own replies (slash commands, navigation,
   agent chats, missions) and sit on no card: the prompt panel's monitor
   shows them (offCard). `v: 2` marks a message written in
   this shape; tagLegacy() upgrades older single-thread conversations as
   they load, putting each reply in the card of the model that answered
   it, or the default card.
═══════════════════════════════════════════════════════════════════ */

const SpaceCards = (() => {
  const DEFAULT_MODEL = 'gemini-2-5-flash';
  const EVENT = 'nice:space-cards';
  const VERSION = 2;

  function _canon(id) {
    return (typeof LLMConfig !== 'undefined' && LLMConfig.canonicalize) ? LLMConfig.canonicalize(id) : id;
  }
  function _autoId() {
    return (typeof LLMConfig !== 'undefined' && LLMConfig.AUTO_ID) || 'nice-auto';
  }
  function _catalog() {
    return (typeof ModelCatalog !== 'undefined' && ModelCatalog.MODEL_CATALOG) || [];
  }
  function _entry(id) {
    return (typeof ModelCatalog !== 'undefined' && ModelCatalog.getById) ? ModelCatalog.getById(id) : null;
  }

  function label(id) { return _entry(id)?.name || id; }
  function provider(id) { return _entry(id)?.provider || ''; }
  function poolLabel(id) {
    if (typeof TokenConfig === 'undefined' || TokenConfig.isFreeModel(id)) return 'Free';
    const pool = TokenConfig.poolFor(id);
    return (pool && TokenConfig.POOLS[pool] && TokenConfig.POOLS[pool].label) || 'Paid';
  }

  /* The plan can run the model: free models always, paid ones with Pro plus
     the pool's add-on. The token balance is left out on purpose: an empty
     pool keeps its card, and the server's 402 says so on that card. */
  function planAllows(id) {
    if (typeof TokenConfig === 'undefined' || TokenConfig.isFreeModel(id)) return true;
    if (typeof Subscription === 'undefined' || !Subscription.isPro || !Subscription.isPro()) return false;
    const addon = TokenConfig.requiredAddon(TokenConfig.poolFor(id));
    const addons = Subscription.getAddons ? Subscription.getAddons() : [];
    return !addon || addons.includes(addon);
  }

  /* Cards, in catalog order: the models switched on in Settings that the
     plan can run. NICE Auto routes between models and gets no card. */
  function available() {
    let enabled = typeof State !== 'undefined' ? State.get('enabled_models') : null;
    if (!enabled && typeof TokenConfig !== 'undefined' && TokenConfig.defaultEnabledModels) enabled = TokenConfig.defaultEnabledModels();
    enabled = enabled || {};
    const on = new Set(Object.keys(enabled).filter(id => enabled[id]).map(_canon));
    return _catalog().map(m => m.id).filter(id => id !== _autoId() && on.has(id) && planAllows(id));
  }

  /* ── Selection: the cards the next prompt goes to ── */
  function _readSelection() {
    try {
      const saved = JSON.parse(localStorage.getItem(Utils.KEYS.spaceCards) || 'null');
      return Array.isArray(saved) ? saved.map(_canon) : null;
    } catch { return null; }
  }

  function defaultSelection(cards = available()) {
    return cards.includes(DEFAULT_MODEL) ? [DEFAULT_MODEL] : cards.slice(0, 1);
  }

  function selected(cards = available()) {
    const saved = _readSelection();
    const kept = saved ? cards.filter(id => saved.includes(id)) : [];
    return kept.length ? kept : defaultSelection(cards);
  }

  // The last selected card stays selected: the prompt always has somewhere
  // to go. Saved picks for models without a card right now (a plan still
  // loading) are kept so they come back with their card.
  function toggle(id, cards = available()) {
    const current = selected(cards);
    if (!cards.includes(id)) return current;
    const next = current.includes(id)
      ? current.filter(x => x !== id)
      : cards.filter(x => x === id || current.includes(x));
    if (!next.length) return current;
    const parked = (_readSelection() || []).filter(x => !cards.includes(x));
    try { localStorage.setItem(Utils.KEYS.spaceCards, JSON.stringify([...next, ...parked])); } catch { /* storage blocked */ }
    _emit({ kind: 'selection' });
    return next;
  }

  /* ── Live state: cards waiting on or streaming a reply (memory only) ── */
  const _live = new Map();
  function live(id) { return _live.get(id) || null; }
  function setLive(id, patch) {
    _live.set(id, { ...(_live.get(id) || {}), ...patch });
    _emit({ kind: 'live', model: id });
  }
  // outcome ('answered' | 'failed') is how the call ended, for announcing.
  function endLive(id, outcome) {
    if (_live.delete(id)) _emit({ kind: 'live', model: id, outcome });
  }
  function endAll() {
    const ids = [..._live.keys()];
    _live.clear();
    ids.forEach(id => _emit({ kind: 'live', model: id }));
    // The conversation changed: nothing left on screen to approve against.
    [..._approvals.entries()].forEach(([id, a]) => answer(id, false, a.token));
  }
  function busy() { return _live.size > 0; }

  /* ── Approvals: a card waiting for the user's OK before NICE runs a
     command its reply asked for ([EXEC] in review mode). The card shows
     Approve / Deny; the answer resolves the promise the command waits on.
     Each request carries a token the buttons echo back, so an answer only
     settles the request it was shown for: the second click of a double
     click can't approve the next command in the queue. */
  const _approvals = new Map(); // id → { action, resolve, token }
  let _approvalSeq = 0;
  function requestApproval(id, action) {
    return new Promise(resolve => {
      // A newer request replaces an older one: the older command was skipped,
      // never turned down.
      const earlier = _approvals.get(id);
      if (earlier) earlier.resolve('skipped');
      _approvals.set(id, { action, resolve, token: ++_approvalSeq });
      _emit({ kind: 'approval', model: id });
    });
  }
  // The pending request: { tool, input, token }, or null.
  function approval(id) {
    const a = _approvals.get(id);
    return a ? { ...a.action, token: a.token } : null;
  }
  // ok: true (approve), false (deny), or 'skipped' (a new prompt went to the
  // card first: the command neither ran nor was turned down).
  function answer(id, ok, token) {
    const a = _approvals.get(id);
    if (!a || a.token !== token) return false;
    _approvals.delete(id);
    a.resolve(ok === 'skipped' ? 'skipped' : !!ok);
    _emit({ kind: 'approval', model: id });
    return true;
  }
  // A card's thread changed outside a live reply (a note joined it).
  function changed(id) { _emit({ kind: 'thread', model: id }); }

  function _emit(detail) {
    if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent(EVENT, { detail }));
  }

  /* ── Threads ──
     Each card's thread is a list of exchanges: { ask, replies[] }, where
     ask is the user message (null when a reply has no prompt before it)
     and each reply is { model, text, error, billing, capability, note, ts,
     msg } (msg: the stored message, absent for old comparison answers). A thread
     whose model has no card shows on the default card, so nothing in the
     conversation disappears when a model is switched off. */
  function _home(cards) {
    return cards.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : cards[0];
  }

  function threads(messages, cards = available()) {
    const out = {};
    cards.forEach(id => { out[id] = []; });
    const home = _home(cards);
    if (!home) return out;
    const place = (id) => (out[_canon(id)] ? _canon(id) : home);
    const addReply = (cardId, reply) => {
      const thread = out[cardId];
      if (!thread.length) thread.push({ ask: null, replies: [] });
      thread[thread.length - 1].replies.push(reply);
    };
    for (const m of messages || []) {
      if (!m) continue;
      if (m.role === 'user' && Array.isArray(m.to)) {
        [...new Set(m.to.map(place))].forEach(cardId => out[cardId].push({ ask: m, replies: [] }));
      } else if (m.role === 'assistant' && m.type === 'compare' && Array.isArray(m.answers)) {
        // A comparison from before cards: each answer joins its model's card.
        for (const a of m.answers) {
          if (!a || !a.model) continue;
          const error = a.error || (a.pending ? 'Interrupted before it finished.' : '');
          addReply(place(a.model), { model: _canon(a.model), text: a.text || '', error: error || null, ts: m.ts });
        }
      } else if (m.role === 'assistant' && m.modelId) {
        addReply(place(m.modelId), {
          model: _canon(m.modelId), text: m.text || '', ts: m.ts,
          error: m.error ? (m.text || 'This model could not answer.') : null,
          billing: !!m.billing, capability: !!m.cap, note: !!m.note, msg: m,
        });
      }
    }
    return out;
  }

  /* History a card sends with its next prompt: its own successful
     exchanges, as plain { role, text, attachments } turns. Failed and
     unanswered prompts are left out so a model never sees two user turns
     in a row. */
  function historyFor(messages, id, cards = available()) {
    const thread = threads(messages, cards)[id] || [];
    const out = [];
    for (const ex of thread) {
      if (!ex.ask) continue;
      const ok = ex.replies.filter(r => !r.error && !r.note && r.text);
      if (!ok.length) continue;
      const own = ok.find(r => r.model === id) || ok[0];
      const ask = { role: 'user', text: ex.ask.text };
      if (ex.ask.attachments) ask.attachments = ex.ask.attachments;
      out.push(ask, { role: 'assistant', text: own.text });
    }
    return out;
  }

  // Names of files a stored prompt had attached but no longer carries: a
  // saved chat keeps only their names, so such a prompt can't go out again
  // as it was.
  function lostFiles(ask) {
    if (!ask || (ask.attachments || []).length) return [];
    return (ask.attachmentPlaceholders || []).map(a => (a && a.name) || 'the file');
  }

  /* ── Conversations from before cards ── */
  function idFromLabel(text) {
    if (!text) return null;
    const raw = String(text).split('→').pop().trim();
    const lower = raw.toLowerCase();
    const canon = _canon(raw);
    const hit = _catalog().find(m => m.id === canon || m.name.toLowerCase() === lower);
    if (hit) return hit.id;
    if (typeof LLM_MODELS !== 'undefined') {
      const e = LLM_MODELS.find(m => String(m.label || '').toLowerCase() === lower);
      if (e) return _canon(e.id);
    }
    return null;
  }

  // A model's answer from the old top-level chat: NICE answered on a named
  // model. Agent chats, slash commands, mission results and NICE's own
  // error notes ("**Connection Error:**", "**Mission failed:**") stay with
  // the monitor.
  function _wasModelReply(m) {
    return m.role === 'assistant' && m.type !== 'compare' && m.agent === 'NICE' && !!m.model && !m.error;
  }

  function tagLegacy(messages) {
    const list = Array.isArray(messages) ? messages : [];
    for (const m of list) {
      if (m && !m.v && !m.modelId && _wasModelReply(m)) m.modelId = idFromLabel(m.model) || DEFAULT_MODEL;
    }
    list.forEach((m, i) => {
      if (!m || m.v || m.role !== 'user' || Array.isArray(m.to)) return;
      const answered = [];
      let replies = 0;
      for (let j = i + 1; j < list.length && list[j] && list[j].role !== 'user'; j++) {
        const r = list[j];
        if (r.role !== 'assistant') continue;
        replies++;
        if (r.type === 'compare') (r.answers || []).forEach(a => { if (a && a.model) answered.push(_canon(a.model)); });
        else if (r.modelId) answered.push(_canon(r.modelId));
      }
      if (answered.length) m.to = [...new Set(answered)];
      else if (!replies) m.to = [DEFAULT_MODEL];
    });
    for (const m of list) if (m && !m.v) m.v = VERSION;
    return list;
  }

  // NICE's own replies in a conversation: the ones no card shows.
  function offCard(messages) {
    return (messages || []).filter(m => m && (m.role === 'assistant' || m.role === 'system')
      && !m.modelId && m.type !== 'compare');
  }

  return {
    DEFAULT_MODEL, EVENT, VERSION,
    label, provider, poolLabel, planAllows, available,
    defaultSelection, selected, toggle,
    live, setLive, endLive, endAll, busy, changed, requestApproval, approval, answer,
    threads, historyFor, offCard, lostFiles, idFromLabel, tagLegacy,
  };
})();
