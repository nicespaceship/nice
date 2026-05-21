/* ═══════════════════════════════════════════════════════════════════
   NICE — Schematic View
   Ship crew schematic with animated SVG curves connecting agent slots
   to a central reactor core. Extracted from the original Bridge view.
   Rendered as a tab inside the Blueprints view.
═══════════════════════════════════════════════════════════════════ */

const SchematicView = (() => {
  const _esc = Utils.esc;

  let _resizeTimer = null;
  let _wiredRO = null;
  // Module ref to the view container so resize-driven re-renders (e.g.
  // crossing the mobile breakpoint) can rebuild the right markup without
  // a full Router refresh.
  let _el = null;
  let _lastMobile = null;
  let _unsubActivity = null;
  let _unsubShips = null;
  let _rerendering = false;
  let _radarRaf = 0;
  let _radarRo = null;

  function _stopRadar() {
    cancelAnimationFrame(_radarRaf);
    _radarRaf = 0;
    if (_radarRo) { _radarRo.disconnect(); _radarRo = null; }
  }

  function _initRadar(cvs) {
    if (!cvs) return;
    _stopRadar();

    const ctx = cvs.getContext('2d');
    const body = cvs.parentElement;
    let W = 0, H = 0;

    function resize() {
      const r = body.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      W = cvs.width  = Math.round(r.width);
      H = cvs.height = Math.round(r.height);
    }
    requestAnimationFrame(() => { resize(); });

    function hexToRgb(h) {
      h = h.replace('#', '');
      if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      const n = parseInt(h, 16);
      return isNaN(n) ? [126, 184, 255] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    let ar = 126, ag = 184, ab = 255;
    let _lastAccent = '';
    function refreshAccent() {
      const raw = (getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#7eb8ff').trim();
      if (raw !== _lastAccent) { _lastAccent = raw; [ar, ag, ab] = hexToRgb(raw); }
    }
    refreshAccent();

    const STAR_N = 40;
    let stars = [];
    function makeStars() {
      stars = [];
      for (let i = 0; i < STAR_N; i++) {
        stars.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: Math.random() * 1.2 + 0.3,
          a: Math.random() * 0.5 + 0.1,
          speed: Math.random() * 0.12 + 0.02,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
    makeStars();

    const cx = () => W / 2;
    const cy = () => H / 2;

    let pings = [];
    let nextPing = 0;

    let _accentFrame = 0;
    function draw(t) {
      if (W < 1 || H < 1) { resize(); _radarRaf = requestAnimationFrame(draw); return; }
      if (++_accentFrame % 60 === 0) refreshAccent();
      ctx.clearRect(0, 0, W, H);
      const CX = cx(), CY = cy();
      const maxR = Math.max(W, H) * 0.6;

      ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.04)`;
      ctx.lineWidth = 0.5;
      const gridSize = 20;
      for (let x = gridSize; x < W; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = gridSize; y < H; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      const ringCount = 5;
      for (let i = 1; i <= ringCount; i++) {
        const r = (maxR / ringCount) * i;
        const pulse = 0.03 + 0.02 * Math.sin(t * 0.001 + i * 1.2);
        ctx.beginPath();
        ctx.arc(CX, CY, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${ar},${ag},${ab},${pulse})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      if (t > nextPing) {
        pings.push({
          x: CX + (Math.random() - 0.5) * W * 0.6,
          y: CY + (Math.random() - 0.5) * H * 0.6,
          r: 0, maxR: 30 + Math.random() * 25,
          life: 1,
        });
        nextPing = t + 2000 + Math.random() * 3000;
      }
      for (let i = pings.length - 1; i >= 0; i--) {
        const p = pings[i];
        p.r += 0.3;
        p.life = 1 - p.r / p.maxR;
        if (p.life <= 0) { pings.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${ar},${ag},${ab},${p.life * 0.15})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        if (p.life > 0.8) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${ar},${ag},${ab},${p.life * 0.5})`;
          ctx.fill();
        }
      }

      for (const s of stars) {
        s.phase += 0.015;
        const twinkle = 0.5 + 0.5 * Math.sin(s.phase);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${ar},${ag},${ab},${s.a * twinkle})`;
        ctx.fill();
        s.y += s.speed;
        if (s.y > H + 2) { s.y = -2; s.x = Math.random() * W; }
      }

      const chLen = 8;
      ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.08)`;
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(CX - chLen, CY); ctx.lineTo(CX + chLen, CY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(CX, CY - chLen); ctx.lineTo(CX, CY + chLen); ctx.stroke();

      _radarRaf = requestAnimationFrame(draw);
    }

    _radarRaf = requestAnimationFrame(draw);

    _radarRo = new ResizeObserver(() => { resize(); makeStars(); });
    _radarRo.observe(body);
  }

  function _isMobile() {
    try { return window.matchMedia('(max-width:600px)').matches; }
    catch (e) { return false; }
  }
  function render(el) {
    _el = el;
    const shipId = _getShipId();
    let activatedShips = (typeof Blueprints !== 'undefined') ? Blueprints.getActivatedShips() : [];
    // Include custom ships from State (created by Crew Designer)
    const customShips = (typeof State !== 'undefined' ? State.get('spaceships') : null) || [];
    customShips.forEach(cs => { if (!activatedShips.find(s => s.id === cs.id)) activatedShips.push(cs); });
    const activeShip = activatedShips.find(s => s.id === shipId) || activatedShips[0];
    const isAuthed = typeof Utils !== 'undefined' && Utils.hasAuthSession();

    // Schematic centerpiece is the core reactor — opt in only when there
    // is something to schematize. Skeleton state still shows the reactor
    // (slots line up around it while Supabase hydrates). The unauthed
    // empty state hides it so the CTAs sit on a clean background instead
    // of overlapping the visualization.
    if (typeof CoreReactor !== 'undefined') CoreReactor.setVisible(!!activeShip || isAuthed);

    if (!activeShip) {
      // If the user is authenticated, Supabase may not have finished syncing
      // yet — show a skeleton of the schematic structure instead of the
      // empty-state CTAs, so users don't see "No spaceships deployed" for a
      // ship they just reset (and the 5-10s hydration window reads as
      // "loading", not "frozen"). Once activated-ships fires again
      // (Blueprints._fireShipState after the user_spaceships query returns),
      // we re-render with real data.
      if (isAuthed) {
        el.innerHTML = '<div class="bridge-hero-wrap"><div class="bridge-hero-content">' + _renderSkeleton() + '</div></div>';
      } else {
        el.innerHTML = `
          <div class="schematic-empty app-empty">
            <h2>No spaceships deployed</h2>
            <p>Activate a ship from the catalog or build one from scratch to put a crew on the schematic.</p>
            <div class="app-empty-acts">
              <a href="#/bridge?tab=spaceship" class="btn btn-primary btn-sm">Browse spaceships</a>
              <a href="#/bridge/spaceships/new" class="btn btn-sm">Build your own</a>
            </div>
          </div>
        `;
      }
      return;
    }

    const _bu = typeof BlueprintUtils !== 'undefined' ? BlueprintUtils : null;
    const shipClass = _bu ? _bu.getSlotTemplate(activeShip)
      : { id: 'dynamic', name: 'Ship', slots: Array.from({ length: parseInt(activeShip.stats?.crew, 10) || 5 }, (_, i) => ({ id: i, label: 'Agent ' + i, maxRarity: 'Rare' })) };
    const slotMap = _getSlotMap();
    const filledCount = Object.values(slotMap).filter(Boolean).length;
    const totalSlots = shipClass.slots.length;
    const status = filledCount >= totalSlots ? 'DEPLOYED' : 'DOCKED';
    const statusColor = status === 'DEPLOYED' ? '#22c55e' : '#f59e0b';

    const mobile = _isMobile();
    _lastMobile = mobile;

    // No schematic-local header on either breakpoint. Ship picker lives
    // in #app-fixed-tabs alongside the bridge tab pill (mobile) or the
    // bridge tabs row (desktop) — see _mountFixedShipPicker. Ship name
    // is shown by the picker label, so a separate title row is dead UI.
    const headerHTML = '';

    const viewHTML = mobile
      ? _renderHeroSchematicMobile(shipClass, slotMap)
      : _renderHeroSchematic(shipClass, slotMap);

    el.innerHTML = `<div class="bridge-hero-wrap">${headerHTML}<div class="bridge-hero-content">${viewHTML}</div></div>`;

    // Add resize listener per render (removed in destroy)
    window.removeEventListener('resize', _onResize);
    window.addEventListener('resize', _onResize);

    {
      requestAnimationFrame(() => {
        // Ship picker mounts on both breakpoints — mobile gets a pill +
        // bottom sheet next to the Bridge tab pill; desktop gets a wide
        // native <select> appended to the bridge tabs row.
        _mountFixedShipPicker(activatedShips, activeShip, el);
        if (mobile) {
          // Stack layout pins the reactor at a fixed viewport position via
          // CSS (see `.schematic-stack` rules in app.css) so it's always
          // tappable regardless of scroll. Clear any inline anchor a
          // previous desktop render left behind so the CSS value wins.
          const docEl = document.documentElement;
          docEl.style.removeProperty('--reactor-x');
          docEl.style.removeProperty('--reactor-y');
          _mountSwapSheet(el, activeShip);
        } else {
          _unmountSwapSheet();
          // Double-rAF the initial wire: first frame paints the new markup
          // (so fresh mini-chat / cards have measurable box rects), second
          // frame runs the measurement once layout has settled. Prevents a
          // brief flash on theme swaps where the first measurement ran
          // against mid-transition mini-chat metrics.
          requestAnimationFrame(() => _wireSchematic());
          _observeWired();
        }
        const cvs = el.querySelector('.sch-radar-canvas');
        if (cvs) _initRadar(cvs);
        // Core click → open prompt panel + start dictation. The Schematic
        // route auto-scopes the prompt panel to the active ship (see
        // PromptPanel._updateRouteContext), so we don't need to prefill
        // @<ShipName> — the user's bare prompt already addresses the
        // ship and triage routes to the right crew member.
        const coreHit = el.querySelector('.sch-core-hit-overlay');
        if (coreHit) {
          coreHit.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof PromptPanel === 'undefined') return;
            if (PromptPanel.show) PromptPanel.show();
            if (PromptPanel.startDictation) PromptPanel.startDictation();
          });
        }
      });
    }

    // Desktop card click → open the agent's blueprint drawer — the same
    // right-side panel Blueprints uses to show card + stats. Prompts go
    // to the spaceship; the orchestrator delegates internally, so direct
    // @AgentName addressing is gone.
    el.querySelectorAll('.schematic-card-slot[data-bp-id]').forEach(slot => {
      slot.style.cursor = 'pointer';
      slot.addEventListener('click', () => {
        const bpId = slot.dataset.bpId;
        if (!bpId) return;
        if (typeof BlueprintsView !== 'undefined' && BlueprintsView.openDrawer) {
          BlueprintsView.openDrawer(bpId);
        }
      });
    });

    // Re-render when Supabase ships hydrate — fixes the false empty-state flash
    // and the slot-count race after a hard reset. Blueprints._fireShipState()
    // fires State.set('activated-ships') both at init (from localStorage) and
    // again once the user_spaceships query returns, so we get exactly one
    // re-render when real data arrives without polling.
    // Re-render when Supabase ships hydrate. Only register once per view mount
    // (_unsubShips already set means a prior render wired it). Since _el is
    // module-level and always points to the current container, the same handler
    // stays correct through resize / theme re-renders.
    if (!_unsubShips && typeof State !== 'undefined') {
      _unsubShips = () => { if (_el && !_rerendering) { _rerendering = true; render(_el); _rerendering = false; } };
      // Defer past State.on's immediate-fire behavior: activated-ships already
      // has data after init, so a synchronous State.on would recurse into
      // render() before this call returns. Microtask lets render() finish first.
      Promise.resolve().then(() => {
        if (_unsubShips && typeof State !== 'undefined') State.on('activated-ships', _unsubShips);
      });
    }

    // Subscribe to live activity signals so the status node reflects
    // mission-runner / agent-executor work in real time. Replace any
    // prior subscription from a previous render of this view.
    if (_unsubActivity) { try { _unsubActivity(); } catch (_) {} _unsubActivity = null; }
    if (typeof AgentActivity !== 'undefined') {
      _unsubActivity = AgentActivity.subscribe(_onActivityChange);
    }

    // Mobile ladder rows. Tap the action button OR an empty row → open
    // the swap bottom sheet (in-place agent assignment, no route change).
    // Tap a filled row body → open the agent's blueprint drawer.
    // Locked rows are inert — they explain the rank gate but accept no clicks.
    el.querySelectorAll('.schematic-stack-row').forEach(row => {
      if (row.dataset.locked === 'true') return;
      row.addEventListener('click', (e) => {
        const action = e.target.closest('.schematic-row-action');
        const slotId = row.dataset.slotId;
        const bpId = row.dataset.bpId;
        if (action || !bpId) {
          _openSwapSheet(slotId, bpId, el);
          return;
        }
        if (typeof BlueprintsView !== 'undefined' && BlueprintsView.openDrawer) {
          BlueprintsView.openDrawer(bpId);
        }
      });
    });

  }

  function _assignToSlot(shipId, slotId, bpId) {
    if (!shipId || typeof Blueprints === 'undefined') return;
    const current = Blueprints.getShipState(shipId) || {};
    const assignments = { ...(current.slot_assignments || {}) };
    if (bpId) {
      assignments[String(slotId)] = bpId;
    } else {
      delete assignments[String(slotId)];
    }
    const agentIds = Object.values(assignments).filter(Boolean);
    const status = agentIds.length > 0 ? 'deployed' : 'docked';
    Blueprints.saveShipState(shipId, { slot_assignments: assignments, agent_ids: agentIds, status });
  }

  function _renderHeroSchematic(shipClass, slotMap) {
    const slots = shipClass.slots || [];
    const CR = typeof CardRenderer !== 'undefined' ? CardRenderer : null;

    const crew = slots.map((slot, i) => {
      const bpId = slotMap[String(slot.id)] || null;
      const bp = bpId ? _resolveBp(bpId) : null;
      return { slot, bp, index: i };
    });

    const half = Math.ceil(crew.length / 2);
    const leftCrew = crew.slice(0, half);
    const rightCrew = crew.slice(half);

    function _miniCard(c, side) {
      const bp = c.bp;
      const locked = _isSlotLocked(c.slot);
      const status = bp ? _agentStatus(bp.id) : 'idle';
      const filled = !!bp;
      const cls = 'schematic-card-slot schematic-card-' + side +
        (filled ? '' : ' schematic-card-empty') +
        (locked ? ' schematic-card-locked' : '');
      return '<div class="' + cls + '" data-slot-idx="' + c.index + '"' +
        (filled && !locked ? ' data-bp-id="' + _esc(bp.id) + '"' : '') +
        (locked ? ' data-locked="true"' : '') +
        ' data-status="' + status + '">' +
        _renderSlotCard(bp, c.slot) +
        '<span class="schematic-card-node" aria-hidden="true"></span>' +
      '</div>';
    }

    const leftHTML = leftCrew.map(c => _miniCard(c, 'left')).join('');
    const rightHTML = rightCrew.map(c => _miniCard(c, 'right')).join('');
    // SVG sits at the wired level (not inside `.schematic-center`) so it
    // naturally covers the full crew arena — lines from edge cards in the
    // side columns don't get clipped by the narrower center column, and
    // its coordinate space matches the wired container's rect 1:1.
    const svg = '<svg class="schematic-svg" preserveAspectRatio="none"></svg>';

    // Mini-chat sits at the wired level (not inside `.schematic-center`).
    // On mobile the center column collapses to ~40px wide, so a
    // percentage width inside it renders as a one-character-per-line
    // sliver. Anchoring to the wired container gives it the full crew
    // arena width on every breakpoint.
    return '<div class="schematic-wired">' +
      '<canvas class="sch-radar-canvas" aria-hidden="true"></canvas>' +
      svg +
      '<div class="sch-mini-chat" aria-live="polite">' +
        '<div class="sch-mini-chat-content"><span class="sch-mini-chat-idle">Standing by.</span></div>' +
        '<button class="sch-mini-expand" type="button" aria-label="Open full chat" title="Open full chat">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="schematic-col schematic-col-left">' + leftHTML + '</div>' +
      '<div class="schematic-center">' +
        '<div class="sch-core-hit-overlay" title="Tap to speak a mission"></div>' +
      '</div>' +
      '<div class="schematic-col schematic-col-right">' + rightHTML + '</div>' +
    '</div>';
  }

  /* ── Mobile bottom-sheet UX ── */
  // Module state for the swap sheet — set when a row is tapped, read by
  // the option-click handler to know which slot to assign into.
  let _swapSlotId = null;
  let _swapEl = null;

  function _mountFixedShipPicker(activatedShips, activeShip, viewEl) {
    const tabs = document.getElementById('app-fixed-tabs');
    if (!tabs) return;
    _unmountFixedShipPicker();
    const shipName = activeShip?.name || 'Unnamed Ship';

    if (_isMobile()) {
      // Pill button sits next to .bp-tab-picker inside #app-fixed-tabs so
      // the two pills share one row. The sheet + backdrop, however, are
      // appended to document.body: .app-main has z-index:1 which traps
      // any descendants under the fixed prompt panel at z:200. Promoting
      // the sheet to the root stacking context lets its z:10000 win.
      const optionsHTML = activatedShips.map(s =>
        '<button class="bp-sheet-option' + (s.id === activeShip.id ? ' active' : '') +
        '" data-ship-id="' + _esc(s.id) + '">' + _esc(s.name || 'Unnamed Ship') + '</button>'
      ).join('');
      const pickerHTML =
        '<button class="sch-ship-picker" id="sch-ship-picker" aria-haspopup="dialog" aria-expanded="false">' +
          '<span class="sch-ship-picker-label">' + _esc(shipName) + '</span>' +
          '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4.5l3 3 3-3"/></svg>' +
        '</button>';
      const sheetHTML =
        '<div class="bp-sheet-backdrop sch-ship-sheet-backdrop" id="sch-ship-sheet-backdrop" hidden></div>' +
        '<div class="bp-sheet sch-ship-sheet" id="sch-ship-sheet" role="dialog" aria-label="Choose ship" aria-modal="true" hidden>' +
          '<div class="bp-sheet-handle"></div>' +
          '<div class="bp-sheet-header"><h3 class="bp-sheet-title">Ships</h3><button class="bp-sheet-close" id="sch-ship-sheet-close" aria-label="Close">&times;</button></div>' +
          '<div class="bp-sheet-body">' + optionsHTML + '</div>' +
        '</div>';
      tabs.insertAdjacentHTML('beforeend', pickerHTML);
      document.body.insertAdjacentHTML('beforeend', sheetHTML);

      const picker = tabs.querySelector('#sch-ship-picker');
      const sheet = document.querySelector('#sch-ship-sheet');
      const backdrop = document.querySelector('#sch-ship-sheet-backdrop');
      const close = sheet.querySelector('#sch-ship-sheet-close');
      const open = () => {
        sheet.hidden = false;
        backdrop.hidden = false;
        requestAnimationFrame(() => { sheet.classList.add('open'); backdrop.classList.add('open'); });
        picker.setAttribute('aria-expanded', 'true');
      };
      const hide = () => {
        sheet.classList.remove('open');
        backdrop.classList.remove('open');
        picker.setAttribute('aria-expanded', 'false');
        setTimeout(() => { sheet.hidden = true; backdrop.hidden = true; }, 200);
      };
      picker.addEventListener('click', open);
      backdrop.addEventListener('click', hide);
      close.addEventListener('click', hide);
      sheet.querySelectorAll('.bp-sheet-option').forEach(opt => {
        opt.addEventListener('click', () => {
          const id = opt.dataset.shipId;
          if (id) {
            localStorage.setItem(Utils.KEYS.mcShip, id);
            window.dispatchEvent(new StorageEvent('storage', { key: Utils.KEYS.mcShip, newValue: id }));
          }
          hide();
          if (viewEl) render(viewEl);
        });
      });
      return;
    }

    // Desktop: button + anchored popover. We can't use a native <select>
    // here — macOS Chrome ignores the CSS option font-size and renders the
    // popup at the system default (~16-18px), which dwarfs the rest of
    // the chrome. The picker is a sibling of #bp-type-tabs (not a child)
    // so the bridge tabs can scroll horizontally on tablet without
    // dragging the picker off-screen.
    const typeTabs = tabs.querySelector('#bp-type-tabs');
    if (!typeTabs) return;
    const optionsHTML = activatedShips.map(s =>
      '<button class="sch-ship-menu-option' + (s.id === activeShip.id ? ' active' : '') +
      '" role="option" aria-selected="' + (s.id === activeShip.id ? 'true' : 'false') +
      '" data-ship-id="' + _esc(s.id) + '">' + _esc(s.name || 'Unnamed Ship') + '</button>'
    ).join('');
    const html =
      '<div class="sch-fixed-ship-picker">' +
        '<button class="sch-fixed-ship-trigger" id="sch-fixed-ship-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">' +
          '<span class="sch-fixed-ship-label">' + _esc(shipName) + '</span>' +
          '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4.5l3 3 3-3"/></svg>' +
        '</button>' +
        '<div class="sch-fixed-ship-menu" id="sch-fixed-ship-menu" role="listbox" aria-label="Active ship" hidden>' + optionsHTML + '</div>' +
      '</div>';
    typeTabs.insertAdjacentHTML('afterend', html);

    const trigger = tabs.querySelector('#sch-fixed-ship-trigger');
    const menu = tabs.querySelector('#sch-fixed-ship-menu');
    const hide = () => { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
    const reposition = () => {
      // Anchor the fixed-position menu to the trigger's current rect so
      // the popover sits flush under it across resizes + scroll. If
      // left-anchoring would overflow the right edge of the viewport
      // (e.g. trigger sits at the end of the bridge tabs row on tablet),
      // flip to right-edge alignment matched to the trigger's own right
      // edge so the menu reads as anchored to the button.
      const r = trigger.getBoundingClientRect();
      const vw = window.innerWidth;
      const menuW = Math.max(r.width, menu.offsetWidth || r.width);
      menu.style.top = (r.bottom + 4) + 'px';
      menu.style.minWidth = r.width + 'px';
      const wouldOverflowRight = r.left + menuW > vw - 8;
      if (wouldOverflowRight) {
        menu.style.left = 'auto';
        menu.style.right = Math.max(8, vw - r.right) + 'px';
      } else {
        menu.style.right = 'auto';
        menu.style.left = r.left + 'px';
      }
    };
    const show = () => {
      reposition();
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
    };
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menu.hidden) show(); else hide();
    });
    // Dismiss on outside click + Escape so the popover doesn't trap focus.
    // Keep the menu anchored on scroll + resize while it's open.
    const onDocClick = (e) => { if (!menu.hidden && !trigger.contains(e.target) && !menu.contains(e.target)) hide(); };
    const onKey = (e) => { if (e.key === 'Escape' && !menu.hidden) { hide(); trigger.focus(); } };
    const onReflow = () => { if (!menu.hidden) reposition(); };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onReflow, true);
    window.addEventListener('resize', onReflow);
    // Stash cleanup hooks on the element so _unmountFixedShipPicker can
    // tear them down without leaking listeners on every render.
    menu._cleanup = () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onReflow, true);
      window.removeEventListener('resize', onReflow);
    };
    menu.querySelectorAll('.sch-ship-menu-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const id = opt.dataset.shipId;
        if (id) {
          localStorage.setItem(Utils.KEYS.mcShip, id);
          window.dispatchEvent(new StorageEvent('storage', { key: Utils.KEYS.mcShip, newValue: id }));
        }
        hide();
        if (viewEl) render(viewEl);
      });
    });
  }

  function _unmountFixedShipPicker() {
    const tabs = document.getElementById('app-fixed-tabs');
    if (!tabs) return;
    // Tear down document-level listeners stashed by the desktop popover
    // before we remove its nodes — otherwise a re-render leaks one
    // outside-click + Escape + scroll/resize pair per cycle.
    const menu = tabs.querySelector('#sch-fixed-ship-menu');
    if (menu && typeof menu._cleanup === 'function') menu._cleanup();
    tabs.querySelectorAll('.sch-ship-picker, .sch-fixed-ship-picker').forEach(n => n.remove());
    // The mobile bottom-sheet + backdrop are portaled to document.body so
    // they escape .app-main's stacking context — clean them up from there.
    document.querySelectorAll('.sch-ship-sheet, .sch-ship-sheet-backdrop').forEach(n => n.remove());
  }

  function _mountSwapSheet(viewEl, activeShip) {
    _swapEl = viewEl;
    if (document.getElementById('sch-swap-sheet')) return;
    const html =
      '<div class="bp-sheet-backdrop sch-swap-sheet-backdrop" id="sch-swap-sheet-backdrop" hidden></div>' +
      '<div class="bp-sheet sch-swap-sheet" id="sch-swap-sheet" role="dialog" aria-label="Manage agent" aria-modal="true" hidden>' +
        '<div class="bp-sheet-handle"></div>' +
        '<div class="bp-sheet-header">' +
          '<h3 class="bp-sheet-title" id="sch-swap-sheet-title">Manage agent</h3>' +
          '<button class="bp-sheet-close" id="sch-swap-sheet-close" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="bp-sheet-body">' +
          '<input type="text" class="sch-swap-input" id="sch-swap-input" placeholder="Search agents..." autocomplete="off" />' +
          '<div class="sch-swap-list" id="sch-swap-list"></div>' +
          '<button class="btn sch-swap-remove" id="sch-swap-remove" hidden>Remove agent</button>' +
        '</div>' +
      '</div>';
    document.body.insertAdjacentHTML('beforeend', html);

    const sheet = document.getElementById('sch-swap-sheet');
    const backdrop = document.getElementById('sch-swap-sheet-backdrop');
    const close = document.getElementById('sch-swap-sheet-close');
    const input = document.getElementById('sch-swap-input');
    const list = document.getElementById('sch-swap-list');
    const remove = document.getElementById('sch-swap-remove');

    const renderList = () => {
      const all = _getAvailableAgents(_getSlotMap());
      const q = (input.value || '').toLowerCase();
      const filtered = q ? all.filter(a => a.name.toLowerCase().includes(q)) : all.slice(0, 40);
      if (!filtered.length) {
        list.innerHTML = '<div class="sch-swap-empty">No agents found</div>';
      } else {
        list.innerHTML = filtered.map(a =>
          '<button class="sch-swap-item" data-id="' + _esc(a.id) + '">' + _esc(a.name) + '</button>'
        ).join('');
      }
    };

    input.addEventListener('input', renderList);
    list.addEventListener('click', (e) => {
      const item = e.target.closest('.sch-swap-item');
      if (!item) return;
      const shipId = _getShipId();
      _assignToSlot(shipId, _swapSlotId, item.dataset.id);
      _closeSwapSheet();
      if (_swapEl) render(_swapEl);
    });
    remove.addEventListener('click', () => {
      const shipId = _getShipId();
      _assignToSlot(shipId, _swapSlotId, null);
      _closeSwapSheet();
      if (_swapEl) render(_swapEl);
    });
    backdrop.addEventListener('click', _closeSwapSheet);
    close.addEventListener('click', _closeSwapSheet);

    sheet._renderList = renderList;
  }

  function _unmountSwapSheet() {
    document.querySelectorAll('#sch-swap-sheet, #sch-swap-sheet-backdrop').forEach(n => n.remove());
    _swapSlotId = null;
    _swapEl = null;
  }

  function _openSwapSheet(slotId, bpId, viewEl) {
    _swapSlotId = slotId;
    _swapEl = viewEl;
    const sheet = document.getElementById('sch-swap-sheet');
    const backdrop = document.getElementById('sch-swap-sheet-backdrop');
    const title = document.getElementById('sch-swap-sheet-title');
    const input = document.getElementById('sch-swap-input');
    const remove = document.getElementById('sch-swap-remove');
    if (!sheet || !backdrop) return;

    if (bpId) {
      const bp = _resolveBp(bpId);
      title.textContent = 'Swap ' + (bp?.name || 'agent');
      remove.hidden = false;
    } else {
      title.textContent = 'Assign agent';
      remove.hidden = true;
    }
    input.value = '';
    if (sheet._renderList) sheet._renderList();
    sheet.hidden = false;
    backdrop.hidden = false;
    requestAnimationFrame(() => { sheet.classList.add('open'); backdrop.classList.add('open'); });
    // Defer focus so iOS doesn't auto-zoom past the sheet's own animation.
    setTimeout(() => { try { input.focus(); } catch (e) {} }, 240);
  }

  function _closeSwapSheet() {
    const sheet = document.getElementById('sch-swap-sheet');
    const backdrop = document.getElementById('sch-swap-sheet-backdrop');
    if (!sheet || !backdrop) return;
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    setTimeout(() => { sheet.hidden = true; backdrop.hidden = true; }, 200);
  }

  // Agent status helper — drives the status node color on each row.
  // 'empty'  slot has no agent assigned
  // 'idle'   agent assigned, no recent activity
  // 'recent' finished within AgentActivity.RECENT_WINDOW_MS (default 60s)
  // 'active' currently executing (between mission_start and final_answer)
  function _agentStatus(bpId) {
    if (!bpId) return 'empty';
    if (typeof AgentActivity === 'undefined') return 'idle';
    return AgentActivity.getState(bpId);
  }

  // Live updates: when an agent's state changes, mutate the matching row's
  // data-status attribute in place. Avoids a full re-render and the layout
  // jitter that would come with one. Falls through silently if the row
  // isn't in the current viewport (e.g. desktop view, which doesn't
  // currently surface a status node).
  function _onActivityChange(agentId, state) {
    if (!_el) return;
    const status = agentId ? state : 'empty';
    const sel = '[data-bp-id="' + CSS.escape(agentId) + '"]';
    _el.querySelectorAll('.schematic-stack-row' + sel + ', .schematic-card-slot' + sel)
      .forEach((node) => { node.setAttribute('data-status', status); });
  }

  function _renderHeroSchematicMobile(shipClass, slotMap) {
    const slots = shipClass.slots || [];
    const RC = (typeof BlueprintUtils !== 'undefined' && BlueprintUtils.RARITY_COLORS) || {};

    const rowsHTML = slots.map((slot, i) => {
      const bpId = slotMap[String(slot.id)] || null;
      const bp = bpId ? _resolveBp(bpId) : null;
      const filled = !!bp;
      const locked = _isSlotLocked(slot);
      const name = locked ? 'Locked' : (filled ? (bp.name || 'Agent') : 'Empty');
      const rarity = filled ? _getBpRarity(bp) : (slot.maxRarity || 'Common');
      const rarityColor = locked ? 'var(--text-muted)' : (RC[rarity] || 'var(--text-muted)');
      const roleLabel = _roleLabel(slot.label || ('Slot ' + (i + 1)));
      const cap = locked
        ? 'Unlocks at ' + _unlockRankName(slot.min_class)
        : (filled ? _capabilityLabel(bp) : null);
      const dataBp = filled && !locked ? ' data-bp-id="' + _esc(bp.id) + '"' : '';
      const dataLocked = locked ? ' data-locked="true"' : '';
      const status = _agentStatus(filled ? bp.id : null);
      let cls = 'schematic-stack-row';
      if (locked) cls += ' schematic-stack-row-locked';
      else if (filled) cls += ' schematic-stack-row-filled';
      else cls += ' schematic-stack-row-empty';
      const lockGlyph = '<svg viewBox="0 0 12 14" width="11" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1.5" y="6" width="9" height="7" rx="1"/><path d="M3.5 6V4a2.5 2.5 0 0 1 5 0v2"/></svg>';
      const avatarContent = locked ? lockGlyph : _esc(filled ? (bp.name || '?').charAt(0).toUpperCase() : '+');
      return '<li class="' + cls + '" data-slot-idx="' + i + '" data-slot-id="' + _esc(slot.id) + '" data-status="' + status + '"' + dataBp + dataLocked + ' style="--row-tint:' + rarityColor + '">' +
        '<span class="schematic-row-node" aria-hidden="true"></span>' +
        '<span class="schematic-row-avatar">' + avatarContent + '</span>' +
        '<div class="schematic-row-info">' +
          '<div class="schematic-row-role">' + _esc(roleLabel) + '</div>' +
          '<div class="schematic-row-name">' + _esc(name) + '</div>' +
          (cap ? '<div class="schematic-row-cap">' + _esc(cap) + '</div>' : '') +
        '</div>' +
        (locked
          ? ''
          : '<button class="schematic-row-action" type="button" aria-label="' + (filled ? 'Manage' : 'Assign agent') + '" data-slot-id="' + _esc(slot.id) + '">' +
              (filled ? '⋯' : '+') +
            '</button>') +
      '</li>';
    }).join('');

    return '<div class="schematic-stack">' +
      '<div class="sch-mini-chat" aria-live="polite">' +
        '<div class="sch-mini-chat-content"><span class="sch-mini-chat-idle">Standing by.</span></div>' +
        '<button class="sch-mini-expand" type="button" aria-label="Open full chat" title="Open full chat">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>' +
        '</button>' +
      '</div>' +
      '<ol class="schematic-stack-rows">' + rowsHTML + '</ol>' +
      '<div class="schematic-stack-reactor">' +
        '<div class="sch-core-hit-overlay" title="Tap to speak a mission"></div>' +
      '</div>' +
    '</div>';
  }

  // Skeleton shown during the post-reset hydration window (authenticated,
  // but Blueprints/Supabase haven't returned the user's ships yet). Mirrors
  // the real layout — columns of slot outlines on desktop, a row stack on
  // mobile — so the schematic reads as present-and-loading, not frozen.
  // The active ship isn't known until hydration, so it uses the 6-slot
  // floor; real cards replace the whole tree when render() runs again.
  function _renderSkeleton() {
    const SLOTS = 6;
    if (_isMobile()) {
      let rows = '';
      for (let i = 0; i < SLOTS; i++) {
        rows += '<li class="schematic-stack-row">' +
          '<span class="schematic-row-node" aria-hidden="true"></span>' +
          '<span class="sch-sk sch-sk-avatar" aria-hidden="true"></span>' +
          '<div class="schematic-row-info">' +
            '<span class="sch-sk sch-sk-line sch-sk-role" aria-hidden="true"></span>' +
            '<span class="sch-sk sch-sk-line sch-sk-name" aria-hidden="true"></span>' +
          '</div>' +
        '</li>';
      }
      return '<div class="schematic-stack schematic-skeleton" aria-busy="true" aria-label="Loading crew">' +
        '<ol class="schematic-stack-rows">' + rows + '</ol>' +
      '</div>';
    }
    const card = '<div class="schematic-card-slot">' +
      '<div class="sch-slot-card sch-slot-card-skeleton">' +
        '<span class="sch-sk sch-sk-line sch-sk-role" aria-hidden="true"></span>' +
        '<span class="sch-sk sch-sk-line sch-sk-name" aria-hidden="true"></span>' +
        '<span class="sch-sk sch-sk-line sch-sk-cap" aria-hidden="true"></span>' +
      '</div>' +
    '</div>';
    let col = '';
    for (let i = 0; i < SLOTS / 2; i++) col += card;
    return '<div class="schematic-wired schematic-skeleton" aria-busy="true" aria-label="Loading crew">' +
      '<div class="schematic-col schematic-col-left">' + col + '</div>' +
      '<div class="schematic-center"></div>' +
      '<div class="schematic-col schematic-col-right">' + col + '</div>' +
    '</div>';
  }

  function _wireSchematic() {
    const container = document.querySelector('.schematic-wired');
    if (!container) return;
    const svgEl = container.querySelector('.schematic-svg');
    if (!svgEl) return;

    const cards = container.querySelectorAll('.schematic-card-slot');
    if (!cards.length) return;

    const cRect = container.getBoundingClientRect();
    const w = cRect.width;
    const h = cRect.height;

    // SVG sits inside `.schematic-wired` with `position:absolute; inset:0`,
    // so its painted area matches the wired rect 1:1. viewBox = pixel dims
    // keeps the coordinate space identical to wired-local coordinates.
    svgEl.setAttribute('viewBox', '0 0 ' + w + ' ' + h);

    // Reactor convergence point = the centroid of the actual rendered
    // crew cards, in wired-local coords. Anchoring to the cards (not the
    // wired's geometric center) keeps the reactor visually balanced for
    // every ship class. The 12-slot class lands on wired-center either
    // way because its 3-up/3-down staircase (+27/-28 nth-child translate)
    // sums to ~zero bias; smaller classes (6/10 slots → 3/5 cards per
    // column) leave one extra "+27" un-paired and drift the cards down,
    // which used to read as the reactor "floating high" above the cluster.
    let rcx, rcy;
    {
      let sumX = 0, sumY = 0;
      cards.forEach(card => {
        const inner = card.querySelector('.sch-slot-card') || card.querySelector('.blueprint-card-mini') || card.querySelector('.schematic-empty-slot') || card;
        const r = inner.getBoundingClientRect();
        sumX += (r.left - cRect.left) + r.width / 2;
        sumY += (r.top - cRect.top) + r.height / 2;
      });
      rcx = sumX / cards.length;
      rcy = sumY / cards.length;
    }
    // The horizontal centroid lands ~halfway between the left and right
    // columns by construction, so it tracks `w / 2` closely. Snap to the
    // exact midline anyway — sub-pixel column asymmetry shouldn't bias
    // the reactor sideways.
    rcx = w / 2;

    // Retarget the global `.jv-pp-reactor` to the convergence point while
    // the Schematic is mounted. Other views don't set these vars, so they
    // fall back to viewport center per the default in theme.css.
    const docEl = document.documentElement;
    docEl.style.setProperty('--reactor-x', (cRect.left + rcx) + 'px');
    docEl.style.setProperty('--reactor-y', (cRect.top + rcy) + 'px');

    let paths = '';
    let dots = '';
    let dotIdx = 0;

    const isStacked = getComputedStyle(container).flexDirection === 'column';

    // Pull each wire's endpoint back from the reactor center so wires
    // visibly "plug into" the reactor's outer edge instead of crossing
    // its visible body. Even with correct z-stacking, themes with
    // partially-transparent reactors (JARVIS spokes, default rings)
    // would otherwise let wires show through the gaps and read as
    // "in front of" the core. Tunable per theme via the CSS var.
    const clearanceRaw = getComputedStyle(document.documentElement)
      .getPropertyValue('--schematic-wire-clearance').trim();
    const clearance = parseFloat(clearanceRaw) || 140;

    cards.forEach((card, i) => {
      // Use the inner mini card (or empty slot) for precise center, fall back to wrapper
      const inner = card.querySelector('.sch-slot-card') || card.querySelector('.blueprint-card-mini') || card.querySelector('.schematic-empty-slot') || card;
      const cardRect = inner.getBoundingClientRect();
      const isLeft = card.classList.contains('schematic-card-left');
      const cardCx = cardRect.left - cRect.left + cardRect.width / 2;
      const cardCy = cardRect.top - cRect.top + cardRect.height / 2;

      // Treat locked slots as not-filled for wire/dot styling — some
      // ships seed their locked slots with a default blueprint so the
      // card has data, but the user can't access them and the wire
      // should read as dormant (faint dashed line, no traveling dot).
      const filled = !card.classList.contains('schematic-card-empty')
        && !card.classList.contains('schematic-card-locked');
      const pathId = 'sch-p-' + i;
      const opacity = filled ? '.25' : '.06';
      const dash = filled ? '' : ' stroke-dasharray="3 5"';
      const sw = filled ? '.8' : '.4';
      let d;

      // Endpoint sits exactly `clearance` from the reactor center along
      // the card→reactor ray, regardless of how close the card is. If a
      // card is already inside the clearance zone, the endpoint snaps
      // to the card center (zero-length wire) — better than a wire that
      // overshoots through the reactor.
      const dx = rcx - cardCx;
      const dy = rcy - cardCy;
      const distToReactor = Math.hypot(dx, dy) || 1;
      const t = Math.max(0, (distToReactor - clearance) / distToReactor);
      const endX = cardCx + dx * t;
      const endY = cardCy + dy * t;

      if (isStacked) {
        const cpOff = Math.abs(endY - cardCy) * 0.55;
        const cp1y = isLeft ? cardCy + cpOff : cardCy - cpOff;
        const cp2y = isLeft ? endY - cpOff * 0.3 : endY + cpOff * 0.3;
        d = 'M' + cardCx + ',' + cardCy +
          ' C' + cardCx + ',' + cp1y +
          ' ' + endX + ',' + cp2y +
          ' ' + endX + ',' + endY;
      } else {
        const cpOff = Math.abs(endX - cardCx) * 0.55;
        const cp1x = isLeft ? cardCx + cpOff : cardCx - cpOff;
        const cp2x = isLeft ? endX - cpOff * 0.3 : endX + cpOff * 0.3;
        d = 'M' + cardCx + ',' + cardCy +
          ' C' + cp1x + ',' + cardCy +
          ' ' + cp2x + ',' + endY +
          ' ' + endX + ',' + endY;
      }

      paths += '<path id="' + pathId + '" d="' + d + '" fill="none" ' +
        'stroke="var(--accent,#fff)" stroke-opacity="' + opacity + '" stroke-width="' + sw + '"' + dash + '/>';

      if (filled) {
        const dur1 = (2 + dotIdx * 0.25).toFixed(2);
        const dur2 = (2.8 + dotIdx * 0.25).toFixed(2);
        const begin1 = (dotIdx * 0.4).toFixed(2);
        const begin2 = (dotIdx * 0.4 + 1).toFixed(2);
        dots += '<circle r="2" fill="var(--accent,#fff)" opacity=".6">' +
          '<animateMotion dur="' + dur1 + 's" repeatCount="indefinite" begin="' + begin1 + 's" keyPoints="1;0" keyTimes="0;1" calcMode="linear">' +
          '<mpath href="#' + pathId + '"/></animateMotion></circle>';
        dots += '<circle r="1" fill="var(--accent,#fff)" opacity=".3">' +
          '<animateMotion dur="' + dur2 + 's" repeatCount="indefinite" begin="' + begin2 + 's" keyPoints="1;0" keyTimes="0;1" calcMode="linear">' +
          '<mpath href="#' + pathId + '"/></animateMotion></circle>';
        dotIdx++;
      }
    });

    // No local reactor circles — the global CoreReactor (positioned via
    // the CSS vars above) is the single centerpiece. The HTML overlay
    // `.sch-core-hit-overlay` in `.schematic-center` owns the click hit.
    svgEl.innerHTML = paths + dots;
  }

  // Derive a short capability label from the blueprint's tool list.
  // Maps MCP tool IDs to human-readable provider names. Slot agents
  // auto-created by the wizard (#512) carry config.capability_id instead
  // of an explicit config.tools array — resolve through the umbrella
  // blueprint so the schematic reflects what AgentExecutor._buildExecContext
  // actually loads at runtime. Without this, every #512 slot agent
  // rendered as "No live tools" even though the chat had full tool access.
  function _capabilityLabel(bp) {
    if (!bp) return null;
    let tools = (bp.config && bp.config.tools) || [];
    let umbrellaName = null;
    if (bp.config && bp.config.capability_id && typeof Blueprints !== 'undefined') {
      const capId = bp.config.capability_id;
      // getCapability is strict (returns null for kind='character'); fall
      // through to getAgent for the character-kind umbrellas that hold the
      // real catalog (HubSpot Agent, GitHub Agent, etc.).
      const cap = (Blueprints.getCapability && Blueprints.getCapability(capId))
               || (Blueprints.getAgent && Blueprints.getAgent(capId))
               || null;
      if (cap) {
        if (!tools.length && cap.config && Array.isArray(cap.config.tools)) {
          tools = cap.config.tools;
        }
        if (cap.name) umbrellaName = String(cap.name).replace(/\s+agent$/i, '').trim() || null;
      }
    }
    const t = tools[0] || '';
    if (t.includes('hubspot'))                               return 'HubSpot';
    if (t.includes('gmail') || t.includes('calendar') || t.includes('drive')) return 'Google Workspace';
    if (t.includes('outlook') || t.includes('microsoft') || t.includes('sharepoint')) return 'Microsoft 365';
    if (t.includes('slack'))                                 return 'Slack';
    if (t.includes('linear'))                                return 'Linear';
    if (t.includes('github'))                                return 'GitHub';
    if (t.includes('notion'))                                return 'Notion';
    if (t.includes('stripe'))                                return 'Stripe';
    if (t.includes('generate-image') || t.includes('generate-video')) return 'Media';
    if (t.includes('browser') || t.includes('web-search'))  return 'Web';
    // Prefer the umbrella's brand name ("GitHub Agent" → "GitHub") over a
    // generic type/role fallback — only reached when the prefix-matcher
    // above doesn't recognise the first tool name.
    if (umbrellaName) return umbrellaName;
    if (!tools.length) return null;
    return (bp.config && (bp.config.type || bp.config.role)) || null;
  }

  // Map a raw slot label to the 15-role vocabulary.
  // Strips naval/org-chart suffixes and normalises to the SaaS function name.
  function _roleLabel(raw) {
    if (!raw) return '';
    const s = String(raw).trim()
      .replace(/\s+(officer|specialist|lead|manager|director|chief|head|senior|junior)$/i, '')
      .trim();
    const lc = s.toLowerCase();
    if (lc === 'captain' || lc === 'commander' || lc === 'admiral' || lc === 'co') return 'Captain';
    if (lc.includes('comm') || lc.includes('message') || lc.includes('contact')) return 'Communications';
    if (lc.includes('sales') || lc.includes('deal') || lc.includes('revenue') || lc.includes('tactical')) return 'Sales';
    if (lc.includes('market') || lc.includes('brand') || lc.includes('content') || lc.includes('growth')) return 'Marketing';
    if (lc.includes('engineer') || lc.includes('dev') || lc.includes('tech') || lc.includes('code')) return 'Engineering';
    if (lc.includes('ops') || lc.includes('operat') || lc.includes('project')) return 'Operations';
    if (lc.includes('product') || lc.includes('roadmap')) return 'Product';
    if (lc.includes('success') || lc.includes('support') || lc.includes('customer')) return 'Customer Success';
    if (lc.includes('finance') || lc.includes('billing') || lc.includes('account')) return 'Finance';
    if (lc.includes('analyt') || lc.includes('data') || lc.includes('insight') || lc.includes('intel')) return 'Analytics';
    if (lc.includes('design') || lc.includes('ux') || lc.includes('creative')) return 'Design';
    if (lc.includes('legal') || lc.includes('compliance') || lc.includes('contract')) return 'Legal';
    if (lc.includes('security') || lc.includes('infosec') || lc.includes('audit')) return 'Security';
    if (lc.includes('people') || lc.includes('hr') || lc.includes('hiri') || lc.includes('recruit')) return 'People';
    if (lc.includes('research') || lc.includes('intel') || lc.includes('recon')) return 'Research';
    // Preserve the original label if it doesn't map cleanly
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Renders the three-layer slot card used on the desktop schematic.
  // Character / Role / Capability — one panel per slot, replacing the TCG mini-card.
  function _renderSlotCard(bp, slot) {
    const role  = _roleLabel(slot.label || '');
    const cap   = _capabilityLabel(bp);
    const name  = bp ? (bp.name || 'Agent') : null;
    const isStub = bp && !cap; // agent assigned but no live MCP tools
    if (_isSlotLocked(slot)) {
      const rankName = _unlockRankName(slot.min_class);
      return '<div class="sch-slot-card sch-slot-card-locked" title="Unlocks at ' + _esc(rankName) + '">' +
        '<div class="sch-slot-role">' + _esc(role) + '</div>' +
        '<div class="sch-slot-name sch-slot-name-locked"><span class="sch-slot-lock-glyph" aria-hidden="true">' +
          '<svg viewBox="0 0 12 14" width="11" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="1.5" y="6" width="9" height="7" rx="1"/>' +
            '<path d="M3.5 6V4a2.5 2.5 0 0 1 5 0v2"/>' +
          '</svg>' +
        '</span>Locked</div>' +
        '<div class="sch-slot-cap">Unlocks at ' + _esc(rankName) + '</div>' +
      '</div>';
    }
    if (bp) {
      return '<div class="sch-slot-card' + (isStub ? ' sch-slot-card-stub' : '') + '">' +
        '<div class="sch-slot-role">' + _esc(role) + '</div>' +
        '<div class="sch-slot-name">' + _esc(name) + '</div>' +
        (cap
          ? '<div class="sch-slot-cap">' + _esc(cap) + '</div>'
          : '<div class="sch-slot-cap sch-slot-cap-stub">No live tools</div>') +
      '</div>';
    }
    return '<div class="sch-slot-card sch-slot-card-empty">' +
      '<div class="sch-slot-role">' + _esc(role) + '</div>' +
      '<div class="sch-slot-name sch-slot-name-empty">Empty</div>' +
      '<div class="sch-slot-cap">Assign agent</div>' +
    '</div>';
  }

  function _isSlotLocked(slot) {
    if (!slot || !slot.min_class) return false;
    if (typeof Gamification === 'undefined' || !Gamification.isClassUnlocked) return false;
    return !Gamification.isClassUnlocked(slot.min_class);
  }

  function _unlockRankName(minClass) {
    if (!minClass) return '';
    if (minClass === 'class-5') return 'NICE Pro';
    if (typeof Gamification !== 'undefined' && Gamification.getFirstRankForClass) {
      const r = Gamification.getFirstRankForClass(minClass);
      if (r && r.name) return r.name;
    }
    return minClass;
  }

  function _getAvailableAgents(slotMap) {
    const agents = [];
    // From Blueprints
    if (typeof Blueprints !== 'undefined' && Blueprints.listAgents) {
      agents.push(...Blueprints.listAgents());
    }
    // From BlueprintsView SEED as fallback
    if (!agents.length && typeof BlueprintsView !== 'undefined' && BlueprintsView.SEED) {
      agents.push(...BlueprintsView.SEED.filter(b => b.type === 'agent'));
    }
    // Sort alphabetically
    agents.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return agents;
  }

  /* ── Helpers ── */

  function _normalizeShipId(id) {
    return id ? String(id) : null;
  }

  function _getShipId() {
    // Collect every ship the user could legitimately be pointing at: activated
    // ships from Blueprints plus custom ships from State (Crew Designer).
    const activated = (typeof Blueprints !== 'undefined') ? Blueprints.getActivatedShips() : [];
    const custom = (typeof State !== 'undefined' ? State.get('spaceships') : null) || [];
    const seen = new Set();
    const available = [];
    activated.forEach(s => { if (s && s.id && !seen.has(s.id)) { seen.add(s.id); available.push(s); } });
    custom.forEach(s => { if (s && s.id && !seen.has(s.id)) { seen.add(s.id); available.push(s); } });

    // Honour localStorage ONLY if the stored ID still matches a real ship —
    // otherwise it's stale (old session, deleted ship, ID-scheme migration)
    // and silently falls through. Self-heal by overwriting with the
    // first-available ship so subsequent reads are consistent.
    const stored = localStorage.getItem(Utils.KEYS.mcShip);
    if (stored && seen.has(stored)) return _normalizeShipId(stored);

    if (!available.length) return null;
    const fallbackId = _normalizeShipId(available[0].id);
    if (stored !== fallbackId) {
      try {
        localStorage.setItem(Utils.KEYS.mcShip, fallbackId);
        // Same-tab listeners (prompt-panel route resync) only fire if we
        // dispatch the event manually — setItem doesn't trigger 'storage'
        // for the originating tab.
        window.dispatchEvent(new StorageEvent('storage', { key: Utils.KEYS.mcShip, newValue: fallbackId }));
      } catch {}
    }
    return fallbackId;
  }

  function _getSlotMap() {
    const shipId = _getShipId();
    if (!shipId) return {};
    if (typeof Blueprints !== 'undefined' && Blueprints.getShipState) {
      const saved = Blueprints.getShipState(shipId);
      if (saved && saved.slot_assignments && Object.keys(saved.slot_assignments).length) {
        return { ...saved.slot_assignments };
      }
    }
    // Check custom ships from State (Crew Designer)
    const customShips = (typeof State !== 'undefined' ? State.get('spaceships') : null) || [];
    const customShip = customShips.find(s => s.id === shipId);
    if (customShip && customShip.slot_assignments && Object.keys(customShip.slot_assignments).length) {
      return { ...customShip.slot_assignments };
    }
    const rawId = shipId.replace(/^bp-/, '');
    const bp = (typeof Blueprints !== 'undefined') ? (Blueprints.getSpaceship(rawId) || Blueprints.getSpaceship(shipId)) : null;
    if (bp && bp.crew && bp.crew.length) {
      const map = {};
      bp.crew.forEach((c, i) => { map[String(i)] = '__new__' + (c.label || c.name || 'Agent ' + (i + 1)); });
      return map;
    }
    return {};
  }

  function _resolveBp(bpId) {
    if (!bpId) return null;
    let bp = (typeof BlueprintsView !== 'undefined' && BlueprintsView.SEED) ? BlueprintsView.SEED.find(b => b.id === bpId) : null;
    if (!bp && bpId.startsWith('__new__')) {
      const agentName = bpId.replace('__new__', '');
      // Look up rarity from the ship's crew data
      let crewRarity = 'Common';
      const shipId = _getShipId();
      if (shipId && typeof Blueprints !== 'undefined') {
        const rawId = shipId.replace(/^bp-/, '');
        const ship = Blueprints.getSpaceship(rawId) || Blueprints.getSpaceship(shipId);
        if (ship) {
          const crewMember = (ship.crew || []).find(c => c.label === agentName);
          if (crewMember?.rarity) crewRarity = crewMember.rarity;
        }
      }
      bp = { id: bpId, name: agentName, category: 'Agent', rarity: crewRarity };
    }
    if (!bp && typeof Blueprints !== 'undefined') bp = Blueprints.getAgent(bpId);
    if (!bp) {
      const agent = (typeof State !== 'undefined' && State.get('agents') || []).find(r => r.id === bpId);
      if (agent) bp = { id: agent.id, name: agent.name, category: agent.role || agent.category, rarity: agent.rarity || 'Common' };
    }
    // Check localStorage for custom agents (Crew Designer, survives reload)
    if (!bp) {
      try {
        const stored = JSON.parse(localStorage.getItem(Utils.KEYS.customAgents) || '[]');
        const agent = stored.find(a => a.id === bpId);
        if (agent) bp = { id: agent.id, name: agent.name, category: agent.role || 'Agent', rarity: 'Common' };
      } catch {}
    }
    return bp;
  }

  function _getBpRarity(bp) {
    return BlueprintUtils.getRarity(bp);
  }

  function _onResize() {
    // Collapse burst events (sidebar CSS transition, font load, theme
    // swap) into a single rAF — fast enough to feel instant, still safe
    // from re-entrant layout thrash.
    if (_resizeTimer) return;
    _resizeTimer = requestAnimationFrame(() => {
      _resizeTimer = null;
      const mobile = _isMobile();
      // Crossing the mobile breakpoint swaps the entire markup tree —
      // do a full re-render rather than trying to mutate in place.
      if (_lastMobile !== null && _lastMobile !== mobile && _el) {
        render(_el);
        return;
      }
      _lastMobile = mobile;
      // Mobile pins the reactor via CSS — no per-resize work needed.
      if (!mobile) _wireSchematic();
    });
  }

  // A window `resize` only fires when the viewport changes, but the
  // reactor target also shifts when the sidebar expands/collapses, the
  // theme swaps (fonts/metrics redraw the mini-chat), or the wired
  // reflows. The wired alone isn't enough — `.schematic-center` is
  // `flex:1`, so when the mini-chat grows/shrinks the center absorbs it
  // and wired stays the same height. Observe the mini-chat too so theme
  // swaps recompute the reactor center even when wired doesn't resize.
  function _observeWired() {
    if (!('ResizeObserver' in window)) return;
    const wired = document.querySelector('.schematic-wired');
    if (!wired) return;
    if (_wiredRO) _wiredRO.disconnect();
    _wiredRO = new ResizeObserver(_onResize);
    _wiredRO.observe(wired);
    const mini = wired.querySelector('.sch-mini-chat');
    if (mini) _wiredRO.observe(mini);
  }

  function destroy() {
    if (_resizeTimer) { cancelAnimationFrame(_resizeTimer); _resizeTimer = null; }
    window.removeEventListener('resize', _onResize);
    if (_wiredRO) { _wiredRO.disconnect(); _wiredRO = null; }
    if (_unsubShips) { try { if (typeof State !== 'undefined') State.off('activated-ships', _unsubShips); } catch (_) {} _unsubShips = null; }
    _rerendering = false;
    if (_unsubActivity) { try { _unsubActivity(); } catch (_) {} _unsubActivity = null; }
    // Mobile-only mounts — picker pill in #app-fixed-tabs and swap sheet
    // at body level. Both need explicit unmount when leaving the view.
    _unmountFixedShipPicker();
    _unmountSwapSheet();
    // Clean up radar canvas
    _stopRadar();
    // Release the core-reactor anchor so other views get viewport-centered.
    // Skip the clear when destroy fires as part of an in-place re-render
    // (e.g. Theme.set → Router.refresh while still on the Schematic route)
    // — clearing + re-setting leaves a one-frame window at fallback 50%,
    // which reads as a visible reactor jump. We only release when the
    // user is actually navigating away from the Schematic.
    const hash = location.hash || '';
    const stillOnSchematic = hash.includes('bridge') &&
      (/tab=schematic/.test(hash) || !/tab=/.test(hash));
    if (!stillOnSchematic) {
      const docEl = document.documentElement;
      docEl.style.removeProperty('--reactor-x');
      docEl.style.removeProperty('--reactor-y');
    }
  }

  return { render, destroy, _capabilityLabel };
})();
