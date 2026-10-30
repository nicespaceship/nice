/* ═══════════════════════════════════════════════════════════════════
   NICE — Outbox (#/outbox, #/outbox?tab=approved&item=<id>&view=week)
   Everything the crew made, and anything waiting for the user's OK.
   Wide screens show the list beside the open item; on phones and tablets
   the list and the item take turns. The week view lays the same items
   out by day, and dragging one to another day saves its new date.

   Data is ContentQueue: mission runs with an approval state, plus local
   drafts. Approving goes through ContentQueue.approve, which hands runs in
   review to MissionRunner, so every surface approves the same way.
═══════════════════════════════════════════════════════════════════ */

const OutboxView = (() => {
  const title = 'Outbox';
  const _esc = Utils.esc;
  // Titles and ids can come from model output: anything inside a quoted
  // attribute goes through escAttr, which also escapes quotes.
  const _attr = Utils.escAttr;
  const _WATCH = ['content-queue', 'user', 'spaceships'];
  const _TABS = [
    { id: 'needs',    label: 'Needs you', statuses: ['draft'] },
    { id: 'approved', label: 'Approved',  statuses: ['approved', 'scheduled', 'published'] },
    { id: 'rejected', label: 'Rejected',  statuses: ['rejected'] },
  ];
  const _STATUS = { draft: 'Waiting for you', approved: 'Approved', scheduled: 'Scheduled', published: 'Published', rejected: 'Rejected' };
  const _TYPES = [
    { id: 'social',  label: 'Social posts', icon: 'icon-share' },
    { id: 'email',   label: 'Emails',       icon: 'icon-mail' },
    { id: 'report',  label: 'Reports',      icon: 'icon-bar-chart' },
    { id: 'general', label: 'Other',        icon: 'icon-file-text' },
  ];
  const _STALE_MS = 60 * 1000;
  const _DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const _ICON_ATTRS = 'class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

  let _el = null;
  let _tab = 'needs';
  let _sel = null;
  let _mode = 'list';
  let _type = 'all';
  let _weekOffset = 0;
  let _editing = false;
  let _loading = false;
  let _loadedFor = null;
  let _loadedAt = 0;
  let _deciding = false;
  let _gen = 0;
  let _pushed = false;
  let _bound = false;
  let _binding = false;

  /* ── Data ── */

  function _items() { return State.get('content-queue') || []; }
  function _status(item) { return item.approval_status || 'draft'; }
  function _tabOf(item) {
    const s = _status(item);
    return (_TABS.find(t => t.statuses.includes(s)) || _TABS[0]).id;
  }
  function _typeOf(item) { return _TYPES.some(t => t.id === item.content_type) ? item.content_type : 'general'; }
  function _inTab(tabId) {
    return _items().filter(i => _tabOf(i) === tabId && (_type === 'all' || _typeOf(i) === _type));
  }
  function _tabLabel(tabId) { return (_TABS.find(t => t.id === tabId) || _TABS[0]).label; }

  function _titleOf(item) {
    if (item.title && item.title !== 'Untitled Draft') return item.title;
    const plain = String(ContentQueue.getContent(item)).replace(/[#*_`>[\]]/g, '').replace(/\s+/g, ' ').trim();
    return plain.slice(0, 80) || ContentQueue.getTypeMeta(item.content_type).label;
  }

  function _shipName(item) {
    if (!item.spaceship_id || typeof Blueprints === 'undefined' || !Blueprints.getUserShips) return '';
    const ship = Blueprints.getUserShips().find(s => String(s.id) === String(item.spaceship_id));
    return ship ? ship.name : '';
  }

  function _byline(item) {
    return [ContentQueue.getTypeMeta(item.content_type).label, item.agent_name, _shipName(item)].filter(Boolean).join(' · ');
  }

  // Local drafts carry a draft- id; everything else is a mission_runs row.
  function _isRun(item) { return !String(item.id).startsWith('draft-'); }
  function _isGate(item) {
    return item.status === 'review' && typeof MissionRunner !== 'undefined' &&
      !!MissionRunner.isResumableGate && MissionRunner.isResumableGate(item);
  }

  function _wide() {
    return typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 1024px)').matches;
  }

  async function _refresh() {
    const user = State.get('user');
    if (!user || typeof ContentQueue === 'undefined') return;
    _loading = true;
    _loadedFor = user.id;
    _loadedAt = Date.now();
    _draw();
    try { await ContentQueue.load(); } catch { /* the list shows what State already has */ }
    _loading = false;
    // Through the same guards as a live update, so text being edited survives.
    _rerender();
  }

  /* ── URL state ── */

  function _fromHash() {
    _tab = 'needs'; _sel = null; _mode = 'list'; _type = 'all'; _editing = false; _weekOffset = 0; _pushed = false;
    const qs = new URLSearchParams((location.hash || '').split('?')[1] || '');
    if (_TABS.some(t => t.id === qs.get('tab'))) _tab = qs.get('tab');
    if (qs.get('view') === 'week') _mode = 'week';
    if (qs.get('item')) _sel = qs.get('item');
  }

  function _hashFor() {
    const qs = new URLSearchParams();
    if (_tab !== 'needs') qs.set('tab', _tab);
    if (_mode === 'week') qs.set('view', 'week');
    if (_sel && _mode === 'list') qs.set('item', _sel);
    const q = qs.toString();
    return '#/outbox' + (q ? '?' + q : '');
  }

  function _syncHash() {
    history.replaceState(null, '', _hashFor());
  }

  /* ── Render ── */

  function render(el) {
    _el = el;
    _gen++;
    _fromHash();
    _bind();
    el.removeEventListener('click', _onClick);
    el.addEventListener('click', _onClick);
    el.removeEventListener('change', _onChange);
    el.addEventListener('change', _onChange);
    ['dragstart', 'dragover', 'dragleave', 'drop'].forEach(t => {
      el.removeEventListener(t, _onDrag);
      el.addEventListener(t, _onDrag);
    });
    _draw();
  }

  function _draw() {
    if (!_el) return;
    const user = State.get('user');
    // undefined: sign-in hasn't resolved yet (app start); null: signed out.
    if (!user) _loadedFor = null;
    if (user === undefined) { _el.innerHTML = '<div class="ob-wrap"><p class="ob-empty">Loading…</p></div>'; return; }
    if (!user) { _el.innerHTML = _signedOutHTML(); return; }
    // The queue is kept live from sign-in (ContentQueue.watch); refetch on
    // a new user or a stale copy, not on every render (Back re-renders).
    if (_loadedFor !== user.id || (!_loading && !_editing && Date.now() - _loadedAt > _STALE_MS)) { _refresh(); return; }

    const all = _items();
    const types = new Set(all.map(_typeOf));
    if (_type !== 'all' && !types.has(_type)) _type = 'all';
    let item = _sel ? all.find(i => i.id === _sel) : null;
    if (item) _tab = _tabOf(item);
    // A linked item that hasn't loaded yet stays requested until it does.
    else if (_sel && !_loading) { _sel = null; _syncHash(); }
    const list = _inTab(_tab);
    if (!item && !_sel && _mode === 'list' && _wide()) item = list[0] || null;
    if (item) _sel = item.id;
    if (!item) _editing = false;

    const counts = {};
    _TABS.forEach(t => { counts[t.id] = all.filter(i => _tabOf(i) === t.id).length; });
    const typeChips = types.size > 1 ? `
      <div class="ob-types" role="group" aria-label="Type">
        <button type="button" class="ob-type" data-ob="type" data-type="all" aria-pressed="${_type === 'all'}">All</button>
        ${_TYPES.filter(t => types.has(t.id)).map(t => `<button type="button" class="ob-type" data-ob="type" data-type="${t.id}" aria-pressed="${_type === t.id}">${_esc(t.label)}</button>`).join('')}
      </div>` : '';

    _el.innerHTML = `
      <div class="ob-wrap">
        <header class="ob-head">
          <div class="ob-head-text">
            <h1>Outbox</h1>
            <p>Everything your ${_esc(Terminology.label('crew', { lowercase: true }))} made, and anything waiting for your OK.</p>
          </div>
          <div class="ob-head-acts">
            <div class="ob-seg" role="group" aria-label="Layout">
              <button type="button" data-ob="mode" data-mode="list" aria-pressed="${_mode === 'list'}">List</button>
              <button type="button" data-ob="mode" data-mode="week" aria-pressed="${_mode === 'week'}">Week</button>
            </div>
            ${counts.approved ? '<button type="button" class="btn btn-sm" data-ob="export">Export approved</button>' : ''}
          </div>
        </header>
        <div class="ob-tabs" role="tablist" aria-label="Outbox">
          ${_TABS.map(t => `<button type="button" role="tab" class="ob-tab" data-ob="tab" data-tab="${t.id}" aria-selected="${t.id === _tab}">${_esc(t.label)}${counts[t.id] ? `<span class="ob-count">${counts[t.id]}</span>` : ''}</button>`).join('')}
        </div>
        ${typeChips}
        ${_mode === 'week' ? _weekHTML(list) : _listHTML(list, item)}
      </div>`;

    if (_editing) _el.querySelector('#ob-edit')?.focus();
  }

  function _signedOutHTML() {
    return `
      <div class="ob-wrap">
        <div class="widget-card ob-signin">
          <h1>Outbox</h1>
          <p>When your ${_esc(Terminology.label('crew', { lowercase: true }))} finishes something that needs your OK, it waits here. Sign in to see yours.</p>
          <button type="button" class="btn btn-primary btn-sm" data-ob="signin">Sign in</button>
        </div>
      </div>`;
  }

  function _emptyHTML() {
    if (_loading) return '<p class="ob-empty">Loading…</p>';
    if (_tab === 'approved') return '<div class="ob-empty"><b>Nothing approved yet</b><p>Approve a result and it lands here, ready to copy or export.</p></div>';
    if (_tab === 'rejected') return '<div class="ob-empty"><b>Nothing rejected</b><p>Results you turn down are kept here.</p></div>';
    const hasShip = typeof Blueprints !== 'undefined' && Blueprints.getUserShips && Blueprints.getUserShips().length > 0;
    return `
      <div class="ob-empty">
        <b>Nothing needs you right now</b>
        <p>When your ${_esc(Terminology.label('crew', { lowercase: true }))} finishes something that needs your OK, it shows up here and on Home.</p>
        ${hasShip ? '' : '<a class="btn btn-sm btn-primary" href="#/library?tab=spaceship">Find a spaceship</a>'}
      </div>`;
  }

  function _listHTML(list, item) {
    if (!list.length) {
      return `<section class="widget-card ob-list ob-list-empty" aria-label="${_attr(_tabLabel(_tab))}">${_emptyHTML()}</section>`;
    }
    return `
      <div class="ob-layout${_sel ? ' has-sel' : ''}">
        <section class="widget-card ob-list" aria-label="${_attr(_tabLabel(_tab))}">
          <ul>${list.map(_rowHTML).join('')}</ul>
        </section>
        <div class="ob-detail-wrap">${item ? _detailHTML(item) : ''}</div>
      </div>`;
  }

  function _rowHTML(item) {
    const st = _status(item);
    const type = _TYPES.find(t => t.id === _typeOf(item));
    const chip = (st === 'scheduled' || st === 'published') ? `<span class="ob-chip">${_esc(_STATUS[st])}</span>` : '';
    return `
      <li>
        <button type="button" class="ob-row" data-ob="open" data-id="${_attr(item.id)}" aria-current="${item.id === _sel}">
          <span class="ob-row-ico"><svg ${_ICON_ATTRS}><use href="#${type.icon}"/></svg></span>
          <span class="ob-row-main"><b>${_esc(_titleOf(item))}</b><span>${_esc(_byline(item))}</span></span>
          <span class="ob-row-side">${chip}<time>${_esc(ContentQueue.timeAgo(item.created_at))}</time></span>
        </button>
      </li>`;
  }

  function _detailHTML(item) {
    const st = _status(item);
    const gate = st === 'draft' && _isGate(item);
    const content = ContentQueue.getContent(item);
    const when = ContentQueue.timeAgo(st === 'draft' ? item.created_at : (item.reviewed_at || item.created_at));
    const meta = [_STATUS[st] || st, when, item.edited_content ? 'Edited by you' : ''].filter(Boolean).join(' · ');
    const social = item.content_type === 'social';
    let acts;
    if (st === 'draft') {
      acts = `
        <button type="button" class="btn btn-primary btn-sm" data-ob="approve">${gate ? 'Approve and continue' : 'Approve'}</button>
        ${gate ? '' : '<button type="button" class="btn btn-sm" data-ob="edit">Edit</button>'}
        <button type="button" class="btn btn-sm" data-ob="reject">Reject</button>
        <button type="button" class="btn btn-sm" data-ob="copy">Copy</button>`;
    } else if (st === 'approved') {
      acts = `
        <button type="button" class="btn btn-primary btn-sm" data-ob="copy">Copy</button>
        <button type="button" class="btn btn-sm" data-ob="edit">Edit</button>
        ${social && ContentQueue.canPublish() ? `
          <button type="button" class="btn btn-sm" data-ob="publish">Publish</button>
          <button type="button" class="btn btn-sm" data-ob="schedule">Schedule</button>` : ''}`;
    } else {
      acts = '<button type="button" class="btn btn-sm" data-ob="copy">Copy</button>';
    }
    const body = _editing ? `
        <label class="sr-only" for="ob-edit">Edit ${_esc(_titleOf(item))}</label>
        <textarea id="ob-edit" class="ob-edit">${_esc(content)}</textarea>
        <div class="ob-acts">
          <button type="button" class="btn btn-primary btn-sm" data-ob="save">Save</button>
          <button type="button" class="btn btn-sm" data-ob="cancel">Cancel</button>
        </div>` : `
        <div class="ob-doc">${content ? ContentQueue.renderMarkdown(content) : '<p>This result has no text.</p>'}</div>
        <div class="ob-acts">${acts}</div>
        ${st === 'approved' && social && !ContentQueue.canPublish() ? '<p class="ob-hint">Copy it or export it for now. Posting straight to your channels arrives with the social integrations.</p>' : ''}`;
    return `
      <article class="widget-card ob-detail" data-id="${_attr(item.id)}" aria-label="${_attr(_titleOf(item))}">
        <button type="button" class="ob-back" data-ob="back"><svg ${_ICON_ATTRS}><use href="#icon-arrow-left"/></svg>${_esc(_tabLabel(_tab))}</button>
        <p class="ob-byline">${_esc(_byline(item))}</p>
        <h2>${_esc(_titleOf(item))}</h2>
        <p class="ob-meta">${_esc(meta)}</p>
        <label class="ob-day-field">Date on the week view
          <input type="date" id="ob-day" value="${_attr(_itemDay(item))}">
        </label>
        ${gate ? `<p class="ob-note">The ${_esc(Terminology.label('crew', { lowercase: true }))} paused here for your OK. Approving lets them finish the rest; to change this text, reject it and run it again.</p>` : ''}
        ${body}
        ${_isRun(item) ? `<a class="ob-run-link" href="#/missions/${encodeURIComponent(item.id)}">Open the ${_esc(Terminology.label('mission', { lowercase: true }))} run</a>` : ''}
      </article>`;
  }

  /* ── Week ── */

  function _dayKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function _weekDays() {
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + _weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
  }

  function _itemDay(item) {
    const iso = (item.metadata && item.metadata.scheduled_for) || item.created_at;
    return iso ? _dayKey(new Date(iso)) : '';
  }

  // "Nov 2 – 8, 2026", "Oct 26 – Nov 1, 2026", "Dec 28, 2026 – Jan 3, 2027"
  function _weekLabel(first, last) {
    const md = { month: 'short', day: 'numeric' };
    const mdy = { month: 'short', day: 'numeric', year: 'numeric' };
    if (first.getFullYear() !== last.getFullYear()) return first.toLocaleDateString('en', mdy) + ' – ' + last.toLocaleDateString('en', mdy);
    if (first.getMonth() === last.getMonth()) return first.toLocaleDateString('en', md) + ' – ' + last.getDate() + ', ' + last.getFullYear();
    return first.toLocaleDateString('en', md) + ' – ' + last.toLocaleDateString('en', mdy);
  }

  function _weekHTML(list) {
    const days = _weekDays();
    const today = _dayKey(new Date());
    const label = _weekLabel(days[0], days[6]);
    return `
      <section class="ob-week" aria-label="Week of ${_attr(label)}">
        <div class="ob-week-nav">
          <button type="button" class="btn btn-sm ob-week-step" data-ob="week" data-step="-1" aria-label="Previous week"><svg ${_ICON_ATTRS}><use href="#icon-arrow-left"/></svg></button>
          <h2>${_esc(label)}</h2>
          <button type="button" class="btn btn-sm ob-week-step" data-ob="week" data-step="1" aria-label="Next week"><svg ${_ICON_ATTRS.replace('icon icon-sm', 'icon icon-sm ob-flip')}><use href="#icon-arrow-left"/></svg></button>
          ${_weekOffset ? '<button type="button" class="btn btn-sm" data-ob="week" data-step="0">This week</button>' : ''}
        </div>
        <ol class="ob-days">
          ${days.map((d, i) => {
            const key = _dayKey(d);
            const its = list.filter(it => _itemDay(it) === key);
            return `
              <li class="ob-day${key === today ? ' is-today' : ''}" data-day="${key}">
                <h3><span>${_DAY_NAMES[i]}</span> ${d.getDate()}</h3>
                ${its.length ? its.map(it => `
                  <button type="button" class="ob-pill" draggable="true" data-ob="open" data-id="${_attr(it.id)}" data-s="${_attr(_status(it))}">
                    <span class="ob-dot" aria-hidden="true"></span><span class="ob-pill-text">${_esc(_titleOf(it))}</span>
                  </button>`).join('') : '<p class="ob-day-empty">Nothing</p>'}
              </li>`;
          }).join('')}
        </ol>
        ${list.length ? '<p class="ob-hint ob-drag-hint">Drag an item to another day to move it, or change its date when you open it.</p>' : ''}
      </section>`;
  }

  /* ── Events ── */

  function _onClick(e) {
    const b = e.target.closest('[data-ob]');
    if (!b || !_el || !_el.contains(b)) return;
    const act = b.dataset.ob;
    const item = _sel ? _items().find(i => i.id === _sel) : null;
    switch (act) {
      case 'signin':
        if (typeof NICE !== 'undefined' && NICE.openModal) NICE.openModal('modal-auth');
        return;
      case 'tab':
        _tab = b.dataset.tab; _sel = null; _editing = false; break;
      case 'type':
        _type = b.dataset.type; _sel = null; _editing = false; break;
      case 'mode':
        _mode = b.dataset.mode; _editing = false; break;
      case 'week': {
        const step = Number(b.dataset.step);
        _weekOffset = step === 0 ? 0 : _weekOffset + step;
        break;
      }
      case 'open': {
        const it = _items().find(i => i.id === b.dataset.id);
        if (!it) return;
        _sel = it.id; _tab = _tabOf(it); _mode = 'list'; _editing = false;
        // On narrow screens the item replaces the list, so it gets a history
        // entry and the browser's Back returns to the list (the Router
        // re-renders on that hashchange).
        if (!_wide() && !_pushed) { _pushed = true; history.pushState(null, '', _hashFor()); }
        else _syncHash();
        _draw();
        const detail = _el.querySelector('.ob-detail');
        if (detail && detail.getBoundingClientRect().top < 0) detail.scrollIntoView?.({ block: 'start' });
        return;
      }
      case 'back':
        if (_pushed) { history.back(); return; }
        _sel = null; _editing = false; break;
      case 'export':
        ContentQueue.exportApproved();
        return;
      case 'copy':
        if (item) ContentQueue.copy(item.id);
        return;
      case 'edit':
        _editing = true; _draw();
        return;
      case 'cancel':
        _editing = false; _draw();
        return;
      case 'save':
        if (item) _save(item);
        return;
      case 'approve':
      case 'reject':
        if (item) _decide(act, item, b);
        return;
      case 'publish':
      case 'schedule':
        if (item) _showPlatformPicker(item.id, act);
        return;
      default:
        return;
    }
    _syncHash();
    _draw();
  }

  async function _save(item) {
    const text = _el.querySelector('#ob-edit')?.value ?? '';
    _editing = false;
    await ContentQueue.edit(item.id, text);
    _draw();
    if (typeof Notify !== 'undefined') Notify.send({ title: 'Saved', message: 'Your edit replaces the original text.', type: 'success' });
  }

  // Approve or reject, then open the next item waiting so a run of
  // reviews flows without going back to the list.
  async function _decide(act, item, btn) {
    const queue = _inTab('needs');
    const at = queue.findIndex(i => i.id === item.id);
    const next = queue[at + 1] || queue[at - 1] || null;
    const gen = _gen;
    const title = _titleOf(item);
    const crew = Terminology.label('crew', { lowercase: true });
    const notify = (msg) => { if (typeof Notify !== 'undefined') Notify.send(msg); };
    let moved = false;
    const moveOn = (msg) => {
      if (moved) return;
      moved = true;
      notify(msg);
      if (gen !== _gen) return;
      _deciding = false;
      // Nothing left to open on a phone: return to the list the way Back would.
      if (!next && _pushed) { history.back(); return; }
      _sel = next ? next.id : null;
      _tab = 'needs';
      _syncHash();
      _draw();
    };
    btn.closest('.ob-acts')?.querySelectorAll('button').forEach(b => { b.disabled = true; });
    _deciding = true;
    try {
      if (act === 'approve') {
        await ContentQueue.approve(item.id, {
          // A paused crew runs the rest of its plan, which can take
          // minutes; move on as soon as it starts.
          onResume: () => moveOn({ title: `${Terminology.label('mission')} continues`, message: `The ${crew} picked up after your approval.`, type: 'success' }),
        });
        moveOn({ title: 'Approved', message: title, type: 'success' });
      } else {
        await ContentQueue.reject(item.id);
        moveOn({ title: 'Rejected', message: title, type: 'system' });
      }
    } catch (err) {
      // Toasts are app-wide, so the user hears about it even after leaving.
      notify({ title: 'Could not save', message: err?.message || 'Try again.', type: 'error' });
      if (moved || gen !== _gen) return;
      _deciding = false;
      _draw();
    }
  }

  function _onChange(e) {
    if (e.target.id !== 'ob-day' || !_sel || !e.target.value) return;
    const [y, m, d] = e.target.value.split('-').map(Number);
    ContentQueue.reschedule(_sel, new Date(y, m - 1, d, 9).toISOString());
  }

  function _onDrag(e) {
    const day = e.target.closest && e.target.closest('.ob-day');
    if (e.type === 'dragstart') {
      const pill = e.target.closest && e.target.closest('.ob-pill');
      if (pill && e.dataTransfer) e.dataTransfer.setData('text/plain', pill.dataset.id);
      return;
    }
    if (!day) return;
    if (e.type === 'dragover') { e.preventDefault(); day.classList.add('is-over'); return; }
    if (e.type === 'dragleave') { day.classList.remove('is-over'); return; }
    if (e.type === 'drop') {
      e.preventDefault();
      day.classList.remove('is-over');
      const id = e.dataTransfer && e.dataTransfer.getData('text/plain');
      const [y, m, d] = String(day.dataset.day).split('-').map(Number);
      if (id && y) ContentQueue.reschedule(id, new Date(y, m - 1, d, 9).toISOString());
    }
  }

  /* ── Publish / schedule picker ──
     Only offered once ContentQueue.canPublish() (social-mcp) is on. Each
     picked platform gets its own publish call; per-platform results show
     in the dialog. */
  function _showPlatformPicker(itemId, mode) {
    const platforms = ContentQueue.getPlatforms();
    const isSchedule = mode === 'schedule';
    const heading = isSchedule ? 'Schedule post' : 'Publish post';
    const submitLabel = isSchedule ? 'Schedule' : 'Publish now';
    const defaultWhen = (() => {
      const d = new Date(Date.now() + 60 * 60 * 1000);
      return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    })();

    const overlay = document.createElement('div');
    overlay.className = 'outbox-picker-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', heading);
    overlay.innerHTML = `
      <div class="outbox-picker-panel">
        <div class="outbox-picker-head">
          <h3 class="outbox-picker-title">${_esc(heading)}</h3>
          <button type="button" class="btn btn-xs outbox-picker-close" aria-label="Close">&times;</button>
        </div>
        <div class="outbox-picker-body">
          <p class="outbox-picker-intro">Pick one or more places to post it.</p>
          <div class="outbox-picker-list">
            ${platforms.map(p => `
              <label class="outbox-picker-row">
                <input type="checkbox" class="outbox-picker-check" value="${_attr(p.id)}" />
                <span class="outbox-picker-icon">${_esc(p.icon)}</span>
                <span class="outbox-picker-info">
                  <span class="outbox-picker-name">${_esc(p.label)}</span>
                  <span class="outbox-picker-desc">${_esc(p.desc)}</span>
                </span>
              </label>`).join('')}
          </div>
          ${isSchedule ? `
            <label class="outbox-picker-label">
              Schedule for
              <input type="datetime-local" class="outbox-picker-when" value="${_attr(defaultWhen)}" />
            </label>` : ''}
          <div class="outbox-picker-status"></div>
        </div>
        <div class="outbox-picker-actions">
          <button type="button" class="btn btn-sm outbox-picker-cancel">Cancel</button>
          <button type="button" class="btn btn-sm btn-primary outbox-picker-submit" disabled>${_esc(submitLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    document.addEventListener('keydown', onKey);
    const submit = overlay.querySelector('.outbox-picker-submit');
    const statusEl = overlay.querySelector('.outbox-picker-status');
    overlay.addEventListener('change', () => {
      submit.disabled = !overlay.querySelector('.outbox-picker-check:checked');
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('.outbox-picker-close, .outbox-picker-cancel')) close();
    });
    submit.addEventListener('click', async () => {
      const picked = [...overlay.querySelectorAll('.outbox-picker-check:checked')].map(c => c.value);
      if (!picked.length) return;
      submit.disabled = true;
      let results;
      try {
        if (isSchedule) {
          const when = overlay.querySelector('.outbox-picker-when')?.value;
          if (!when) { statusEl.innerHTML = '<span class="outbox-picker-err">Pick a time.</span>'; submit.disabled = false; return; }
          results = await ContentQueue.scheduleTo(itemId, picked, new Date(when).toISOString());
        } else {
          results = await ContentQueue.publishTo(itemId, picked);
        }
      } catch (err) {
        results = picked.map(p => ({ platform: p, success: false, error: err?.message || 'unknown error' }));
      }
      const failed = results.filter(r => !r.success);
      if (!failed.length) { close(); _draw(); return; }
      const ok = results.filter(r => r.success).map(r => r.platform);
      statusEl.innerHTML = `
        ${ok.length ? `<div class="outbox-picker-ok">Posted to ${ok.map(_esc).join(', ')}</div>` : ''}
        <div class="outbox-picker-err">Could not post to ${failed.map(f => _esc(f.platform) + ' (' + _esc(f.error || 'error') + ')').join('; ')}</div>`;
      submit.disabled = false;
      _draw();
    });
  }

  /* ── Lifecycle ── */

  // State.on fires immediately for keys that already hold data; _binding
  // swallows those calls so the first render isn't repeated per key.
  function _bind() {
    if (_bound) return;
    _bound = true;
    _binding = true;
    _WATCH.forEach(k => State.on(k, _rerender));
    _binding = false;
  }

  function _rerender() {
    if (_binding || _editing || _deciding) return;
    if (_el && _el.isConnected && _el.querySelector('.ob-wrap')) _draw();
  }

  function destroy() {
    _WATCH.forEach(k => State.off(k, _rerender));
    if (_el) {
      _el.removeEventListener('click', _onClick);
      _el.removeEventListener('change', _onChange);
      ['dragstart', 'dragover', 'dragleave', 'drop'].forEach(t => _el.removeEventListener(t, _onDrag));
    }
    _gen++;
    _bound = false;
    _editing = false;
    _deciding = false;
    _el = null;
  }

  return { title, render, destroy };
})();
