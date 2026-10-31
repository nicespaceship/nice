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
  let _said = [];                // screen-reader lines waiting for the next frame
  const _drawn = new Map();      // card id → the markup it shows now ('bar' too)
  let _status = null;            // the screen-reader status line (on <body>)

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

  // "notes.txt", "notes.txt and plan.pdf", "a, b and c"
  function _names(list) {
    return list.length > 1 ? list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1] : (list[0] || '');
  }

  function _time(ts) {
    return ts ? new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  }

  /* ── Markup ── */
  function _replyHTML(id, r, canRetry, lostFiles) {
    const from = r.model && r.model !== id ? `<span class="space-from">${_esc(SpaceCards.label(r.model))}</span>` : '';
    if (r.error) {
      // Billing needs the Wallet, a file the model can't read needs another
      // model; anything else may go through on a second try. A reloaded chat
      // keeps only file names, so a prompt that had files asks for them
      // rather than retry without them.
      const next = r.billing ? ' <a href="#/wallet">Open Wallet</a>'
        : (canRetry && !r.capability && lostFiles.length) ? ` <span class="space-retry-note">Attach ${_esc(_names(lostFiles))} again, then send to retry.</span>`
        : (canRetry && !r.capability) ? ' <button type="button" class="space-retry" data-act="retry">Retry</button>'
        : '';
      return `<p class="space-err">${from}${_esc(r.error)}${next}</p>`;
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

  function _exchangeHTML(id, ex, live, latest) {
    // Retry sends again, so it needs a signed-in user (PromptPanel checks too).
    const canRetry = latest && !live && !!ex.ask && !!State.get('user');
    const lost = SpaceCards.lostFiles(ex.ask);
    let replies = ex.replies.map(r => _replyHTML(id, r, canRetry && r.model === id && !!r.msg, lost)).join('');
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
          <button type="button" class="space-approve" data-act="approve" data-token="${Utils.escAttr(String(action.token))}">Approve</button>
          <button type="button" class="space-deny" data-act="deny" data-token="${Utils.escAttr(String(action.token))}">Deny</button>
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
      body = thread.map((ex, i) => _exchangeHTML(id, ex, i === thread.length - 1 ? live : null, i === thread.length - 1)).join('');
    } else {
      body = _exchangeHTML(id, thread[thread.length - 1], live, true);
    }

    const last = thread[thread.length - 1];
    const lastTs = last ? ((last.replies[last.replies.length - 1] || {}).ts || (last.ask && last.ask.ts)) : 0;
    const more = thread.length
      ? `<button type="button" class="space-more" data-act="expand" aria-expanded="${expanded}" aria-controls="${Utils.escAttr('space-body-' + id)}">${expanded ? 'Show less' : 'Show all'}</button>`
      : '';

    return `
      <article class="space-card${isSelected ? ' is-selected' : ''}${expanded ? ' is-expanded' : ''}${pending ? ' has-approval' : ''}" data-model="${Utils.escAttr(id)}" data-state="${state}"${live ? ' aria-busy="true"' : ''}>
        <button type="button" class="space-card-head" data-act="toggle" aria-pressed="${isSelected}">
          <span class="space-card-names">
            <span class="space-card-name">${_esc(SpaceCards.label(id))}</span>
            <span class="space-card-sub">${_esc(sub)}</span>
          </span>
          <span class="space-dot" data-dot="${state}" aria-hidden="true"></span>
          ${_STATUS[state] ? `<span class="sr-only">${pending ? 'Waiting for your approval' : _STATUS[state]}</span>` : ''}
        </button>
        <div class="space-card-body" id="${Utils.escAttr('space-body-' + id)}">${body}</div>
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
    const space = _el && _el.querySelector('.space');
    if (!space) return;
    const ctx = _context();
    const focus = _focusKey();
    _drawn.clear();
    const draw = (key, html) => { _drawn.set(key, html); return html; };
    const grid = ctx.cards.length
      ? `<div class="space-grid">${ctx.cards.map(id => draw(id, _cardHTML(id, ctx))).join('')}</div>`
      : '<p class="space-none">Turn on a model in <a href="#/security?tab=models">Manage models</a> to start.</p>';
    space.innerHTML = `
      ${draw('bar', _barHTML(ctx))}
      ${_reactorShows() ? '<div class="space-reactor" aria-hidden="true"></div>' : ''}
      ${grid}`;
    _restoreFocus(focus);
    _anchorReactor();
  }

  // Redraw only the cards whose markup changed (a reply landed, a note
  // joined, the selection moved), so text selected in another card stays
  // selected. A different set of cards means a full paint.
  function _paintChanged(ctx) {
    const shown = _el ? [..._el.querySelectorAll('.space-card')].map(c => c.dataset.model) : [];
    if (shown.join('|') !== ctx.cards.join('|')) { _paint(); return; }
    ctx.cards.forEach(id => _paintCard(id, ctx));
  }

  function _cardEl(id) {
    return _el ? [..._el.querySelectorAll('.space-card')].find(c => c.dataset.model === id) || null : null;
  }

  // Redraw one card (live text, a reply landing) without touching the rest
  // of the page, so focus and text selection elsewhere survive.
  function _paintCard(id, ctx = _context()) {
    const old = _cardEl(id);
    if (!old) return _paint();
    const html = _cardHTML(id, ctx);
    if (_drawn.get(id) === html) return;
    _drawn.set(id, html);
    const focus = _focusKey();
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    old.replaceWith(tmp.firstElementChild);
    _restoreFocus(focus);
  }

  function _paintBar(ctx = _context()) {
    const bar = _el && _el.querySelector('.space-bar');
    if (!bar) return;
    const html = _barHTML(ctx);
    if (_drawn.get('bar') === html) return;
    _drawn.set('bar', html);
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    bar.replaceWith(tmp.firstElementChild);
  }

  function _focusKey() {
    const a = document.activeElement;
    const card = a && a.closest ? a.closest('.space-card') : null;
    return card && a.dataset.act ? { model: card.dataset.model, act: a.dataset.act, token: a.dataset.token } : null;
  }
  function _restoreFocus(key) {
    const card = key && _cardEl(key.model);
    if (!card) return;
    // Focus goes back to the same control. Approve and Deny only count if
    // they belong to the same request: focus never lands on the next
    // command's Approve, so one keypress can't approve two things. A control
    // that went away (an answered approval) hands focus to the card.
    const same = key.token
      ? card.querySelector(`[data-act="${key.act}"][data-token="${key.token}"]`)
      : card.querySelector(`[data-act="${key.act}"]`);
    (same || card.querySelector('[data-act="toggle"]'))?.focus();
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
      if (ids.has('*')) _paint();
      else {
        const ctx = _context();
        if (ids.has('cards')) _paintChanged(ctx);
        else ids.forEach(id => _paintCard(id, ctx));
        _paintBar(ctx);
      }
      _speak();
    });
  }

  /* Screen readers: #app-view is a polite live region, and redrawing a
     streaming card every frame would read it out over and over. The cards
     sit in an aria-live="off" wrapper instead, and one status line says
     once what happened: a card answered, failed, or needs an approval. The
     line lives on <body>, outside #app-view, so no outer live region
     announces it a second time. */
  function _speak() {
    if (!_status || !_said.length) return;
    // Each announcement is a line of its own: a live region reads added
    // lines, so one identical to the last ("Gemini 2.5 Flash answered."
    // twice) still counts as news, and two that land close together are
    // both read instead of one replacing the other. Only the last few stay;
    // removing a line is not announced.
    const line = document.createElement('p');
    line.textContent = _said.join(' ');
    _said = [];
    _status.appendChild(line);
    while (_status.childNodes.length > 3) _status.firstChild.remove();
  }

  function _onScroll() {
    if (_anchorFrame || !_anchored) return;
    _anchorFrame = requestAnimationFrame(() => { _anchorFrame = 0; _anchorReactor(); });
  }

  function _onCards(e) {
    const d = (e && e.detail) || {};
    const name = d.model ? SpaceCards.label(d.model) : '';
    if (d.kind === 'live' && d.outcome) _said.push(d.outcome === 'failed' ? `${name} could not answer.` : `${name} answered.`);
    if (d.kind === 'approval' && SpaceCards.approval(d.model)) _said.push(`${name} needs your approval to run ${SpaceCards.approval(d.model).tool}.`);
    _queue(d.kind === 'selection' ? 'cards' : d.model);
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
    // The token ties the click to the request these buttons were drawn for.
    if (act === 'approve' || act === 'deny') { SpaceCards.answer(id, act === 'approve', Number(actEl.dataset.token)); return; }
    if (act === 'retry') {
      if (typeof PromptPanel !== 'undefined' && PromptPanel.retryCard) PromptPanel.retryCard(id);
      return;
    }
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
    const onState = () => { if (ready) _queue('cards'); };
    State.on('enabled_models', onState);
    State.on('user', onState);
    ready = true;
    _cleanup.push(() => { State.off('enabled_models', onState); State.off('user', onState); });
    _listen(_el, 'click', _onClick);
    _listen(document, SpaceCards.EVENT, _onCards);
    _listen(document, 'nice:theme-change', () => _queue('*'));
    // Any message saved (a NICE reply too) can change the bar and some cards.
    _listen(document, 'nice:chat-saved', () => _queue('cards'));
    // The monitor hides the reactor while it is open; a paint made under it
    // left the reactor slot out.
    _listen(document, 'nice:monitor-closed', () => _queue('*'));
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
    _said = [];
    el.innerHTML = '<div class="space" aria-live="off"></div>';
    // A div of line paragraphs, read line by line as each is added
    // (aria-atomic false). Lines from the conversation before go: what they
    // said is not news in this one.
    if (!_status || !_status.isConnected) {
      _status = document.createElement('div');
      _status.id = 'space-status';
      _status.className = 'sr-only';
      _status.setAttribute('role', 'status');
      _status.setAttribute('aria-atomic', 'false');
      document.body.appendChild(_status);
    }
    _status.replaceChildren();
    _paint();
    _bind();
  }

  function destroy() {
    _unbind();
    _releaseReactor();
    if (_status) { _status.remove(); _status = null; }
    _expanded.clear();
    _el = null;
  }

  return { title, render, destroy };
})();
