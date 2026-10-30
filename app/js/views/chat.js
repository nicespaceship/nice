/* ═══════════════════════════════════════════════════════════════════
   NICE — Space (#/space)
   The main workspace: a grid of model cards, one per model the user
   switched on that their plan can run, with the global prompt panel
   docked below. Clicking a card adds it to the next prompt or takes it
   out; each card shows its model's thread in the current conversation.
   SpaceCards (lib/space-cards.js) owns the card set, the selection, the
   live state and the threads; PromptPanel sends the prompt to the cards.
   Spaceship chat lives on the crew view (#/crew).
═══════════════════════════════════════════════════════════════════ */

const ChatView = (() => {
  const title = 'Space';
  const _esc = Utils.esc;

  let _el = null;
  const _expanded = new Set();   // cards showing their whole thread
  let _cleanup = [];             // listener removers for this mount
  let _queued = new Set();       // cards waiting for a redraw this frame
  let _frame = 0;
  let _anchorFrame = 0;
  let _anchored = false;         // this view set --reactor-x/y on <html>

  /* ── Data ── */
  function _messages() {
    // Same gate as PromptPanel's store: a signed-out visit on a shared
    // browser never shows the previous account's chats.
    if (!Utils.hasAuthSession()) return [];
    return (typeof PromptPanel !== 'undefined' && PromptPanel.messages) ? (PromptPanel.messages() || []) : [];
  }

  function _signedIn() {
    return Utils.hasAuthSession() || !!State.get('user');
  }

  function _isPro() {
    return typeof Subscription !== 'undefined' && Subscription.isPro ? Subscription.isPro() : false;
  }

  function _md(text) {
    const md = (typeof PromptPanel !== 'undefined' && PromptPanel._md) ? PromptPanel._md : null;
    return md ? md(text) : `<p>${_esc(text)}</p>`;
  }

  // NICE's [ACTION]/[EXEC]/[THEME] markers are commands, not prose. Parse
  // the ACTION buttons here without PromptPanel's side effects (it applies
  // THEME markers as it parses).
  function _actions(text) {
    const out = [];
    const re = /\[ACTION:\s*(.+?)\s*\|\s*(.+?)\s*\]/g;
    let m;
    while ((m = re.exec(text)) !== null) out.push({ label: m[1], route: m[2] });
    return out;
  }
  function _clean(text) {
    return String(text || '')
      .replace(/\[ACTION:\s*.+?\s*\|\s*.+?\s*\]/g, '')
      .replace(/\[EXEC:\s*\w+\s*(?:\|.*?)?\s*\]/g, '')
      .replace(/\[THEME:\s*.+?\s*\]/gi, '')
      .trim();
  }

  function _time(ts) {
    return ts ? new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  }

  /* ── Markup ── */
  function _replyHTML(id, r) {
    const from = r.model && r.model !== id ? `<span class="space-from">${_esc(SpaceCards.label(r.model))}</span>` : '';
    if (r.error) {
      const wallet = r.billing ? ' <a href="#/wallet">Open Wallet</a>' : '';
      return `<p class="space-err">${from}${_esc(r.error)}${wallet}</p>`;
    }
    const actions = _actions(r.text);
    const buttons = actions.length
      ? `<div class="space-actions">${actions.map(a => `<button type="button" class="space-action" data-act="route" data-route="${Utils.escAttr(a.route)}">${_esc(a.label)}</button>`).join('')}</div>`
      : '';
    return `<div class="space-reply${r.note ? ' is-note' : ''}">${from}${_md(_clean(r.text))}${buttons}</div>`;
  }

  function _askHTML(ask) {
    const files = ask.attachments || ask.attachmentPlaceholders || [];
    const fileLine = files.length
      ? `<p class="space-files">Attached ${files.map(f => _esc(f.name || 'a file')).join(', ')}</p>`
      : '';
    const text = ask.text ? `<p class="space-ask"><span class="sr-only">You asked: </span>${_esc(ask.text)}</p>` : '';
    return text + fileLine;
  }

  function _exchangeHTML(id, ex, live) {
    let replies = ex.replies.map(r => _replyHTML(id, r)).join('');
    if (live) {
      replies += live.text
        ? `<div class="space-reply">${_md(_clean(live.text))}</div>`
        : '<p class="space-wait">Thinking…</p>';
    }
    return `<div class="space-ex">${ex.ask ? _askHTML(ex.ask) : ''}${replies}</div>`;
  }

  function _state(id, thread, live, isSelected) {
    if (live || SpaceCards.approval(id)) return 'busy';
    const last = thread[thread.length - 1];
    const lastReply = last && [...last.replies].reverse().find(r => !r.note);
    if (lastReply && lastReply.error) return 'stop';
    return isSelected ? 'go' : 'off';
  }

  const _STATUS = { busy: 'Thinking', stop: 'Last reply failed', go: 'Ready', off: '' };

  // A command this card's reply asked for, waiting on the user's OK.
  function _approvalHTML(id, action) {
    const detail = Object.values(action.input || {})
      .filter(v => v !== undefined && v !== null && v !== '')
      .map(v => (typeof v === 'string' ? v : JSON.stringify(v)))
      .join(' · ');
    const titleId = `space-approval-${id}`;
    return `
      <div class="space-approval" role="group" aria-labelledby="${Utils.escAttr(titleId)}">
        <p class="space-approval-title" id="${Utils.escAttr(titleId)}">${_esc(action.tool || 'This action')} needs your approval.</p>
        ${detail ? `<p class="space-approval-detail">${_esc(detail.length > 160 ? detail.slice(0, 157) + '…' : detail)}</p>` : ''}
        <div class="space-approval-acts">
          <button type="button" class="space-approve" data-act="approve">Approve</button>
          <button type="button" class="space-deny" data-act="deny">Deny</button>
        </div>
      </div>`;
  }

  function _cardHTML(id, ctx) {
    const thread = ctx.threads[id] || [];
    const live = SpaceCards.live(id);
    const isSelected = ctx.selected.includes(id);
    const expanded = _expanded.has(id) && thread.length > 0;
    const state = _state(id, thread, live, isSelected);
    const pending = SpaceCards.approval(id);
    const sub = [SpaceCards.provider(id), SpaceCards.poolLabel(id)].filter(Boolean).join(' · ');

    let body;
    if (!thread.length) {
      const hint = !ctx.signedIn ? 'Sign in to chat with this model.'
        : isSelected ? 'Your next prompt comes here.'
        : 'Select this card to add the model to your prompt.';
      body = `<p class="space-empty">${hint}</p>`;
    } else if (expanded) {
      body = thread.map((ex, i) => _exchangeHTML(id, ex, i === thread.length - 1 ? live : null)).join('');
    } else {
      body = _exchangeHTML(id, thread[thread.length - 1], live);
    }

    const last = thread[thread.length - 1];
    const lastTs = last ? ((last.replies[last.replies.length - 1] || {}).ts || (last.ask && last.ask.ts)) : 0;
    const more = thread.length
      ? `<button type="button" class="space-more" data-act="expand" aria-expanded="${expanded}" aria-controls="space-body-${_esc(id)}">${expanded ? 'Show less' : 'Show all'}</button>`
      : '';

    return `
      <article class="space-card${isSelected ? ' is-selected' : ''}${expanded ? ' is-expanded' : ''}" data-model="${_esc(id)}" data-state="${state}">
        <button type="button" class="space-card-head" data-act="toggle" aria-pressed="${isSelected}">
          <span class="space-card-names">
            <span class="space-card-name">${_esc(SpaceCards.label(id))}</span>
            <span class="space-card-sub">${_esc(sub)}</span>
          </span>
          <span class="space-dot" data-dot="${state}" aria-hidden="true"></span>
          ${_STATUS[state] ? `<span class="sr-only">${pending ? 'Waiting for your approval' : _STATUS[state]}</span>` : ''}
        </button>
        <div class="space-card-body" id="space-body-${_esc(id)}">${body}</div>
        ${pending ? _approvalHTML(id, pending) : ''}
        <div class="space-card-foot">
          <span>${live ? (live.text ? 'Writing…' : '') : _esc(_time(lastTs))}</span>
          ${more}
        </div>
      </article>`;
  }

  function _context() {
    const cards = SpaceCards.available();
    return {
      cards,
      selected: SpaceCards.selected(cards),
      threads: SpaceCards.threads(_messages(), cards),
      signedIn: _signedIn(),
    };
  }

  function _barHTML(ctx) {
    let note = '';
    if (!ctx.signedIn) note = '<a href="#/profile">Sign in</a> to start chatting.';
    else if (!_isPro()) note = 'More models come with a plan. <a href="#/wallet">See plans</a>';
    else if (ctx.cards.length > 1) note = 'Select cards to choose which models answer.';
    const msgs = _messages();
    const hasChat = msgs.some(m => m && m.role === 'user');
    // NICE's own replies (agents, commands, missions) live on the monitor.
    const hasNice = SpaceCards.offCard(msgs).length > 0;
    return `
      <div class="space-bar">
        <p class="space-note">${note}</p>
        <div class="space-bar-acts">
          ${hasNice ? '<button type="button" class="space-link" data-act="full">Show full chat</button>' : ''}
          ${hasChat ? '<button type="button" class="space-link" data-act="new">New chat</button>' : ''}
          <a class="space-link" href="#/security?tab=models">Manage models</a>
        </div>
      </div>`;
  }

  function _paint() {
    if (!_el) return;
    const ctx = _context();
    const focus = _focusKey();
    const grid = ctx.cards.length
      ? `<div class="space-grid">${ctx.cards.map(id => _cardHTML(id, ctx)).join('')}</div>`
      : '<p class="space-none">Turn on a model in <a href="#/security?tab=models">Manage models</a> to start.</p>';
    _el.innerHTML = `
      <div class="space">
        ${_barHTML(ctx)}
        ${_reactorShows() ? '<div class="space-reactor" aria-hidden="true"></div>' : ''}
        ${grid}
      </div>`;
    _restoreFocus(focus);
    _anchorReactor();
  }

  function _cardEl(id) {
    return _el ? [..._el.querySelectorAll('.space-card')].find(c => c.dataset.model === id) || null : null;
  }

  // Redraw one card (live text, a reply landing) without touching the rest
  // of the page, so focus and text selection elsewhere survive.
  function _paintCard(id, ctx = _context()) {
    const old = _cardEl(id);
    if (!old) return _paint();
    const focus = _focusKey();
    const tmp = document.createElement('div');
    tmp.innerHTML = _cardHTML(id, ctx);
    old.replaceWith(tmp.firstElementChild);
    _restoreFocus(focus);
  }

  function _paintBar(ctx = _context()) {
    const bar = _el && _el.querySelector('.space-bar');
    if (!bar) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = _barHTML(ctx);
    bar.replaceWith(tmp.firstElementChild);
  }

  function _focusKey() {
    const a = document.activeElement;
    const card = a && a.closest ? a.closest('.space-card') : null;
    return card && a.dataset.act ? { model: card.dataset.model, act: a.dataset.act } : null;
  }
  function _restoreFocus(key) {
    const card = key && _cardEl(key.model);
    // A control that went away (an answered approval) hands focus to the card.
    if (card) (card.querySelector(`[data-act="${key.act}"]`) || card.querySelector('[data-act="toggle"]'))?.focus();
  }

  /* ── Reactor ──
     Themes with a centerpiece reactor keep it on Space, in a slot above
     the cards. The reactor is position:fixed (CoreReactor owns the mount),
     so the slot drives --reactor-x/--reactor-y, the same hook the
     Schematic uses, and clips whatever scrolls above the view's top edge.
     Themes without one (or with it switched off) get no slot. */
  function _reactorShows() {
    if (typeof CoreReactor === 'undefined') return false;
    CoreReactor.setVisible(true);
    const r = document.getElementById('jv-pp-reactor');
    const shows = !!r && r.childElementCount > 0 && getComputedStyle(r).display !== 'none';
    if (!shows) CoreReactor.setVisible(false);
    return shows;
  }

  function _anchorReactor() {
    const slot = _el && _el.querySelector('.space-reactor');
    const root = document.documentElement;
    if (!slot) { _releaseReactor(); return; }
    _anchored = true;
    const r = slot.getBoundingClientRect();
    const top = _el.getBoundingClientRect().top;
    root.style.setProperty('--reactor-x', Math.round(r.left + r.width / 2) + 'px');
    root.style.setProperty('--reactor-y', Math.round(r.top + r.height / 2) + 'px');
    // Negative while the slot is fully in view: rings may spill upward until
    // they reach the view's top edge.
    root.style.setProperty('--space-reactor-clip', Math.round(top - r.top) + 'px');
  }

  function _releaseReactor() {
    if (!_anchored) return;
    _anchored = false;
    const root = document.documentElement;
    root.style.removeProperty('--reactor-x');
    root.style.removeProperty('--reactor-y');
    root.style.removeProperty('--space-reactor-clip');
  }

  /* ── Events ── */
  function _queue(id) {
    _queued.add(id || '*');
    if (_frame) return;
    _frame = requestAnimationFrame(() => {
      _frame = 0;
      const ids = _queued;
      _queued = new Set();
      if (ids.has('*')) { _paint(); return; }
      const ctx = _context();
      ids.forEach(id => _paintCard(id, ctx));
      _paintBar(ctx);
    });
  }

  function _onScroll() {
    if (_anchorFrame || !_anchored) return;
    _anchorFrame = requestAnimationFrame(() => { _anchorFrame = 0; _anchorReactor(); });
  }

  function _onCards(e) {
    const d = (e && e.detail) || {};
    _queue(d.kind === 'selection' ? '*' : d.model);
  }

  function _onClick(e) {
    const actEl = e.target.closest('[data-act]');
    const act = actEl ? actEl.dataset.act : null;
    if (act === 'new') {
      // The sidebar's new chat is the one that files the current chat in
      // the Chats list first (the Cmd+Shift+O shortcut uses it too).
      document.getElementById('side-chat-new')?.click();
      return;
    }
    if (act === 'full') {
      if (typeof PromptPanel !== 'undefined' && PromptPanel.toggle) PromptPanel.toggle();
      return;
    }
    const card = e.target.closest('.space-card');
    if (!card) return;
    const id = card.dataset.model;
    if (act === 'expand') {
      if (_expanded.has(id)) _expanded.delete(id); else _expanded.add(id);
      _paintCard(id);
      const shown = _cardEl(id);
      if (shown && shown.scrollIntoView) shown.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (act === 'route') {
      let route = (actEl.dataset.route || '').trim();
      if (!route) return;
      if (route.startsWith('/')) route = '#' + route;
      else if (!route.startsWith('#')) route = '#/' + route;
      if (typeof Router !== 'undefined' && Router.navigate) Router.navigate(route); else location.hash = route;
      return;
    }
    if (act === 'toggle') { SpaceCards.toggle(id); return; }
    if (act === 'approve' || act === 'deny') { SpaceCards.answer(id, act === 'approve'); return; }
    // The rest of a collapsed card toggles it too, except links, buttons
    // and a click that ends a text selection.
    if (card.classList.contains('is-expanded')) return;
    if (e.target.closest('a, button, pre, code')) return;
    if (String(window.getSelection ? window.getSelection() : '').length) return;
    SpaceCards.toggle(id);
  }

  function _listen(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    _cleanup.push(() => target.removeEventListener(type, fn, opts));
  }

  function _bind() {
    // State.on calls back at once with the current value; that one is
    // already painted.
    let ready = false;
    const onState = () => { if (ready) _queue('*'); };
    State.on('enabled_models', onState);
    State.on('user', onState);
    ready = true;
    _cleanup.push(() => { State.off('enabled_models', onState); State.off('user', onState); });
    _listen(_el, 'click', _onClick);
    _listen(document, SpaceCards.EVENT, _onCards);
    _listen(document, 'nice:theme-change', () => _queue('*'));
    // Any message saved (a NICE reply too) can change the bar and the cards.
    _listen(document, 'nice:chat-saved', () => _queue('*'));
    _listen(_el, 'scroll', _onScroll, { passive: true });
    _listen(window, 'resize', _anchorReactor);
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(_anchorReactor);
      ro.observe(_el);
      _cleanup.push(() => ro.disconnect());
    }
  }

  function _unbind() {
    _cleanup.forEach(fn => fn());
    _cleanup = [];
    if (_frame) { cancelAnimationFrame(_frame); _frame = 0; }
    if (_anchorFrame) { cancelAnimationFrame(_anchorFrame); _anchorFrame = 0; }
    _queued = new Set();
  }

  /* ── Lifecycle ── */
  // Safe to call again while mounted: PromptPanel re-renders Space when the
  // sidebar opens or starts another conversation.
  function render(el) {
    _unbind();
    if (_el !== el) _expanded.clear();
    _el = el;
    _paint();
    _bind();
  }

  function destroy() {
    _unbind();
    _releaseReactor();
    _expanded.clear();
    _el = null;
  }

  return { title, render, destroy };
})();
