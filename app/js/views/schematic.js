/* ═══════════════════════════════════════════════════════════════════
   NICE — Schematic View
   Ship crew schematic with animated SVG curves connecting agent slots
   to a central reactor core. Extracted from the original Bridge view.
   Rendered as a tab inside the Blueprints view.
═══════════════════════════════════════════════════════════════════ */

const SchematicView = (() => {
  const _esc = Utils.esc;

  let _heroView = 'schematic';
  let _resizeTimer = null;
  let _wiredRO = null;
  // Module ref to the view container so resize-driven re-renders (e.g.
  // crossing the mobile breakpoint) can rebuild the right markup without
  // a full Router refresh.
  let _el = null;
  let _lastMobile = null;
  function _isMobile() {
    try { return window.matchMedia('(max-width:600px)').matches; }
    catch (e) { return false; }
  }
  // Mobile-only: when true, hide the crew cards + wires so the reactor
  // core + mini-chat own the viewport (better for ship-level prompts on
  // narrow screens). Persisted across visits. Defaults to ON on mobile
  // (fresh session, no stored preference) so first-time mobile users
  // land on the focused ship view; desktop keeps the full crew layout.
  const _KEY_DECLUTTER = 'nice-sch-declutter';
  let _declutter = (function(){
    try {
      const stored = localStorage.getItem(_KEY_DECLUTTER);
      if (stored === '1') return true;
      if (stored === '0') return false;
      return window.matchMedia('(max-width:600px)').matches;
    } catch (e) { return false; }
  })();

  function render(el) {
    _el = el;
    // Schematic converges the crew ring on the core reactor — opt in.
    if (typeof CoreReactor !== 'undefined') CoreReactor.setVisible(true);
    const shipId = _getShipId();
    let activatedShips = (typeof Blueprints !== 'undefined') ? Blueprints.getActivatedShips() : [];
    // Include custom ships from State (created by Crew Designer)
    const customShips = (typeof State !== 'undefined' ? State.get('spaceships') : null) || [];
    customShips.forEach(cs => { if (!activatedShips.find(s => s.id === cs.id)) activatedShips.push(cs); });
    const activeShip = activatedShips.find(s => s.id === shipId) || activatedShips[0];

    if (!activeShip) {
      el.innerHTML = `
        <div class="schematic-empty">
          <p>No spaceships deployed.</p>
        </div>
      `;
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
    // On mobile we always render the ladder — the Schematic/Agents tab
    // toggle and the declutter eye are gone (replaced by a bottom-sheet
    // swap UI on each row). Force schematic view in case stale state
    // from a previous desktop session set it to 'slots'.
    if (mobile) _heroView = 'schematic';

    const tabs = [
      { id: 'schematic', label: 'Schematic' },
      { id: 'slots', label: 'Agents' },
    ];
    const tabsHTML = tabs.map(t =>
      `<button class="bridge-hero-tab ${_heroView === t.id ? 'active' : ''}" data-view="${t.id}">${t.label}</button>`
    ).join('');
    // Declutter toggle — desktop-only now (mobile dropped the eye icon
    // along with the tabs since the ladder + fixed reactor make
    // declutter mode redundant).
    const eyeIcon = _declutter
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.6 19.6 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.6 19.6 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    const declutterLabel = _declutter ? 'Show cards' : 'Hide cards';
    const declutterHTML = `<button class="bridge-hero-tab sch-declutter-toggle${_declutter ? ' active' : ''}" id="sch-declutter" type="button" aria-pressed="${_declutter}" aria-label="${declutterLabel}" title="${declutterLabel}">${eyeIcon}</button>`;

    // Ship selector dropdown — desktop only, in the schematic header.
    // Mobile gets a sheet-based ship picker mounted into #app-fixed-tabs
    // next to the Bridge tab pill (see _mountFixedShipPicker).
    const shipOptions = activatedShips.map(s =>
      `<option value="${_esc(s.id)}" ${s.id === activeShip.id ? 'selected' : ''}>${_esc(s.name || 'Unnamed Ship')}</option>`
    ).join('');
    const shipSelectHTML = `<select class="sch-ship-select" id="sch-ship-select">${shipOptions}</select>`;

    // Mobile renders no schematic-local header — the ship picker lives
    // in #app-fixed-tabs (alongside the Bridge tab pill) instead.
    const headerHTML = mobile ? '' : `
      <div class="bridge-hero-header">
        <div class="bridge-hero-info">
          <span class="bridge-hero-name">${_esc(activeShip.name || 'Unnamed Ship')}</span>
          <span class="bridge-hero-meta">${shipClass.name} (${filledCount}/${totalSlots}) <span style="color:${statusColor}">${status}</span></span>
        </div>
        <div class="bridge-hero-controls">
          ${shipSelectHTML}
          <div class="bridge-hero-tabs">${tabsHTML}${declutterHTML}</div>
        </div>
      </div>
    `;

    let viewHTML = '';
    if (_heroView === 'schematic') {
      viewHTML = mobile
        ? _renderHeroSchematicMobile(shipClass, slotMap)
        : _renderHeroSchematic(shipClass, slotMap);
    } else {
      viewHTML = _renderHeroSlots(shipClass, slotMap, activeShip);
    }

    el.innerHTML = `<div class="bridge-hero-wrap">${headerHTML}<div class="bridge-hero-content">${viewHTML}</div></div>`;

    // Add resize listener per render (removed in destroy)
    window.removeEventListener('resize', _onResize);
    window.addEventListener('resize', _onResize);

    if (_heroView === 'schematic') {
      requestAnimationFrame(() => {
        if (mobile) {
          // Stack layout pins the reactor at a fixed viewport position via
          // CSS (see `.schematic-stack` rules in app.css) so it's always
          // tappable regardless of scroll. Clear any inline anchor a
          // previous desktop render left behind so the CSS value wins.
          const docEl = document.documentElement;
          docEl.style.removeProperty('--reactor-x');
          docEl.style.removeProperty('--reactor-y');
          // Mount the ship picker pill into #app-fixed-tabs next to the
          // Bridge tab pill so they share the same row. Also mount the
          // swap sheet at body level for the row-action sheet UX.
          _mountFixedShipPicker(activatedShips, activeShip, el);
          _mountSwapSheet(el, activeShip);
        } else {
          _unmountFixedShipPicker();
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
        if (cvs && typeof DockView !== 'undefined' && DockView._initRadar) {
          DockView._initRadar(cvs);
        }
        // Core click → open prompt panel, prefill @Ship, and start dictation.
        // Maps the centrepiece to the "activate the AI to listen" gesture:
        // one tap, user speaks, transcript auto-sends when they stop.
        const coreHit = el.querySelector('.sch-core-hit-overlay');
        if (coreHit) {
          coreHit.addEventListener('click', (e) => {
            e.stopPropagation();
            const shipName = activeShip?.name || 'Ship';
            if (typeof PromptPanel === 'undefined') return;
            if (PromptPanel.show) PromptPanel.show();
            if (PromptPanel.prefill) PromptPanel.prefill('@' + shipName + ' ');
            if (PromptPanel.startDictation) PromptPanel.startDictation();
          });
        }
      });
    }

    // Tab click handlers — skip the declutter toggle (no data-view; it has
    // its own handler below that flips the mobile-hide state in place).
    el.querySelectorAll('.bridge-hero-tab[data-view]').forEach(tab => {
      tab.addEventListener('click', () => {
        _heroView = tab.dataset.view;
        render(el);
      });
    });

    // Declutter toggle — mobile-only. Hides crew cards + wires so the
    // reactor core + mini-chat own the viewport. Toggles a class on
    // `.schematic-wired`; CSS handles the actual hiding so no re-render
    // or DOM churn is needed.
    const declutterBtn = el.querySelector('#sch-declutter');
    if (declutterBtn) {
      declutterBtn.addEventListener('click', () => {
        _declutter = !_declutter;
        try { localStorage.setItem(_KEY_DECLUTTER, _declutter ? '1' : '0'); } catch (e) {}
        render(el);
      });
    }

    // Slot click → prefill prompt with @AgentName
    el.querySelectorAll('.bridge-slot-filled, .schematic-card-slot[data-bp-id]').forEach(slot => {
      slot.style.cursor = 'pointer';
      slot.addEventListener('click', () => {
        const bpId = slot.dataset.bpId;
        if (!bpId) return;
        const bp = _resolveBp(bpId);
        const name = bp?.name || bpId.replace(/^bp-/, '').replace(/-/g, ' ');
        if (typeof PromptPanel !== 'undefined' && PromptPanel.prefill) {
          PromptPanel.show();
          PromptPanel.prefill('@' + name + ' ');
        }
      });
    });

    // Mobile ladder rows. Tap the action button OR an empty row → open
    // the swap bottom sheet (in-place agent assignment, no route
    // change). Tap a filled row body → prefill the prompt with
    // @AgentName and mark the agent active (status node turns green
    // for 5s, then yellow until 60s).
    el.querySelectorAll('.schematic-stack-row').forEach(row => {
      row.addEventListener('click', (e) => {
        const action = e.target.closest('.schematic-row-action');
        const slotId = row.dataset.slotId;
        const bpId = row.dataset.bpId;
        if (action || !bpId) {
          _openSwapSheet(slotId, bpId, el);
          return;
        }
        const bp = _resolveBp(bpId);
        const name = bp?.name || bpId.replace(/^bp-/, '').replace(/-/g, ' ');
        if (typeof PromptPanel !== 'undefined' && PromptPanel.prefill) {
          PromptPanel.show();
          PromptPanel.prefill('@' + name + ' ');
        }
        _markAgentActive(bpId);
      });
    });

    // Ship selector dropdown
    const shipSelect = el.querySelector('#sch-ship-select');
    if (shipSelect) {
      shipSelect.addEventListener('change', () => {
        localStorage.setItem(Utils.KEYS.mcShip, shipSelect.value);
        window.dispatchEvent(new StorageEvent('storage', { key: Utils.KEYS.mcShip, newValue: shipSelect.value }));
        render(el);
      });
    }

    // Searchable agent dropdowns
    const allAgents = _getAvailableAgents(_getSlotMap());
    el.querySelectorAll('.sch-search-drop').forEach(drop => {
      const input = drop.querySelector('.sch-search-input');
      const list = drop.querySelector('.sch-search-list');
      const slotId = drop.dataset.slotId;

      function showResults(query) {
        const q = (query || '').toLowerCase();
        const filtered = q ? allAgents.filter(a => a.name.toLowerCase().includes(q)) : allAgents.slice(0, 20);
        if (!filtered.length) {
          list.innerHTML = '<div class="sch-search-empty">No agents found</div>';
        } else {
          list.innerHTML = filtered.map(a =>
            `<div class="sch-search-item" data-id="${_esc(a.id)}">${_esc(a.name)}</div>`
          ).join('');
        }
        list.style.display = 'block';
      }

      input.addEventListener('focus', () => showResults(input.value));
      input.addEventListener('input', () => showResults(input.value));
      input.addEventListener('click', e => e.stopPropagation());

      list.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = e.target.closest('.sch-search-item');
        if (!item) return;
        _assignToSlot(shipId, slotId, item.dataset.id);
        render(el);
      });

      // Close on outside click
      document.addEventListener('click', (e) => {
        if (!drop.contains(e.target)) list.style.display = 'none';
      }, { once: false });
    });

    // Slot remove buttons
    el.querySelectorAll('.sch-slot-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const slotId = btn.dataset.slotId;
        _assignToSlot(shipId, slotId, null);
        render(el);
      });
    });

    // Default/recommended agent buttons
    el.querySelectorAll('.sch-slot-default').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        _assignToSlot(shipId, btn.dataset.slotId, btn.dataset.bpId);
        render(el);
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
      const label = c.slot.label || '';
      const rarity = c.slot.maxRarity || 'Common';
      if (bp && CR) {
        return '<div class="schematic-card-slot schematic-card-' + side + '" data-slot-idx="' + c.index + '" data-bp-id="' + bp.id + '">' +
          CR.render('agent', 'mini', bp) +
          (label ? '<div class="schematic-slot-label">' + _esc(label) + '</div>' : '') +
        '</div>';
      }
      return '<div class="schematic-card-slot schematic-card-empty schematic-card-' + side + '" data-slot-idx="' + c.index + '">' +
        '<div class="schematic-empty-slot">' +
          '<div class="schematic-card-rarity" style="color:var(--text-muted)">+</div>' +
        '</div>' +
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
    return '<div class="schematic-wired' + (_declutter ? ' schematic-declutter' : '') + '">' +
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
    const optionsHTML = activatedShips.map(s =>
      '<button class="bp-sheet-option' + (s.id === activeShip.id ? ' active' : '') +
      '" data-ship-id="' + _esc(s.id) + '">' + _esc(s.name || 'Unnamed Ship') + '</button>'
    ).join('');
    const html =
      '<button class="sch-ship-picker" id="sch-ship-picker" aria-haspopup="dialog" aria-expanded="false">' +
        '<span class="sch-ship-picker-label">' + _esc(shipName) + '</span>' +
        '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4.5l3 3 3-3"/></svg>' +
      '</button>' +
      '<div class="bp-sheet-backdrop sch-ship-sheet-backdrop" id="sch-ship-sheet-backdrop" hidden></div>' +
      '<div class="bp-sheet sch-ship-sheet" id="sch-ship-sheet" role="dialog" aria-label="Choose ship" aria-modal="true" hidden>' +
        '<div class="bp-sheet-handle"></div>' +
        '<div class="bp-sheet-header"><h3 class="bp-sheet-title">Ships</h3><button class="bp-sheet-close" id="sch-ship-sheet-close" aria-label="Close">&times;</button></div>' +
        '<div class="bp-sheet-body">' + optionsHTML + '</div>' +
      '</div>';
    tabs.insertAdjacentHTML('beforeend', html);

    const picker = tabs.querySelector('#sch-ship-picker');
    const sheet = tabs.querySelector('#sch-ship-sheet');
    const backdrop = tabs.querySelector('#sch-ship-sheet-backdrop');
    const close = tabs.querySelector('#sch-ship-sheet-close');
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
  }

  function _unmountFixedShipPicker() {
    const tabs = document.getElementById('app-fixed-tabs');
    if (!tabs) return;
    tabs.querySelectorAll('.sch-ship-picker, .sch-ship-sheet, .sch-ship-sheet-backdrop').forEach(n => n.remove());
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

  // Agent activity tracking — drives the status node color on each row.
  // Module-scoped so it survives view re-renders. Updated when the user
  // prefills the prompt with @AgentName (heuristic for "I'm interacting
  // with this agent now"). Decay timers re-paint the affected rows.
  const _agentActivity = new Map();

  function _markAgentActive(bpId) {
    if (!bpId) return;
    _agentActivity.set(bpId, Date.now());
    _refreshStatusNodes();
    setTimeout(_refreshStatusNodes, 5100);   // active → recent boundary
    setTimeout(_refreshStatusNodes, 60100);  // recent → idle boundary
  }

  function _agentStatus(bpId) {
    if (!bpId) return 'empty';
    const ts = _agentActivity.get(bpId);
    if (!ts) return 'idle';
    const age = Date.now() - ts;
    if (age < 5000) return 'active';
    if (age < 60000) return 'recent';
    return 'idle';
  }

  function _refreshStatusNodes() {
    if (!_el) return;
    _el.querySelectorAll('.schematic-stack-row').forEach(row => {
      row.dataset.status = _agentStatus(row.dataset.bpId || null);
    });
  }

  function _renderHeroSchematicMobile(shipClass, slotMap) {
    const slots = shipClass.slots || [];
    const RC = (typeof BlueprintUtils !== 'undefined' && BlueprintUtils.RARITY_COLORS) || {};

    const rowsHTML = slots.map((slot, i) => {
      const bpId = slotMap[String(slot.id)] || null;
      const bp = bpId ? _resolveBp(bpId) : null;
      const filled = !!bp;
      const name = filled ? (bp.name || 'Agent') : 'Empty slot';
      const rarity = filled ? _getBpRarity(bp) : (slot.maxRarity || 'Common');
      const rarityColor = RC[rarity] || 'var(--text-muted)';
      const initial = filled ? (bp.name || '?').charAt(0).toUpperCase() : '+';
      const slotLabel = (slot.label || ('Slot ' + (i + 1))).toUpperCase();
      const dataBp = filled ? ' data-bp-id="' + _esc(bp.id) + '"' : '';
      const status = _agentStatus(filled ? bp.id : null);
      const cls = 'schematic-stack-row' + (filled ? ' schematic-stack-row-filled' : ' schematic-stack-row-empty');
      return '<li class="' + cls + '" data-slot-idx="' + i + '" data-slot-id="' + _esc(slot.id) + '" data-status="' + status + '"' + dataBp + ' style="--row-tint:' + rarityColor + '">' +
        '<span class="schematic-row-node" aria-hidden="true"></span>' +
        '<span class="schematic-row-avatar">' + _esc(initial) + '</span>' +
        '<div class="schematic-row-info">' +
          '<div class="schematic-row-name">' + _esc(name) + '</div>' +
          '<div class="schematic-row-role">' + _esc(slotLabel) + ' · ' + _esc(rarity) + '</div>' +
        '</div>' +
        '<button class="schematic-row-action" type="button" aria-label="' + (filled ? 'Manage' : 'Assign agent') + '" data-slot-id="' + _esc(slot.id) + '">' +
          (filled ? '⋯' : '+') +
        '</button>' +
      '</li>';
    }).join('');

    return '<div class="schematic-stack' + (_declutter ? ' schematic-stack-declutter' : '') + '">' +
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
        const inner = card.querySelector('.blueprint-card-mini') || card.querySelector('.schematic-empty-slot') || card;
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

    const decluttered = container.classList.contains('schematic-declutter');
    if (decluttered && window.innerWidth <= 600) {
      // On decluttered mobile the cards are hidden — fall back to the
      // visible stretch between the mini-chat and the prompt panel,
      // which is the only space the reactor + mini-chat cohabit.
      const miniChat = container.querySelector('.sch-mini-chat');
      const miniChatRect = miniChat ? miniChat.getBoundingClientRect() : null;
      const topBound = miniChatRect ? miniChatRect.bottom : cRect.top;
      // Prompt panel is `position:fixed`, so offsetParent is always null —
      // check the computed display + rect height instead of offsetParent.
      const promptEl = document.getElementById('nice-ai');
      const promptVisible = promptEl &&
        getComputedStyle(promptEl).display !== 'none';
      const promptRect = promptVisible ? promptEl.getBoundingClientRect() : null;
      const bottomBound = promptRect && promptRect.height > 0
        ? promptRect.top : window.innerHeight;
      const visibleCenterY = (topBound + bottomBound) / 2;
      rcy = visibleCenterY - cRect.top;
    }

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
      const inner = card.querySelector('.blueprint-card-mini') || card.querySelector('.schematic-empty-slot') || card;
      const cardRect = inner.getBoundingClientRect();
      const isLeft = card.classList.contains('schematic-card-left');
      const cardCx = cardRect.left - cRect.left + cardRect.width / 2;
      const cardCy = cardRect.top - cRect.top + cardRect.height / 2;

      const filled = !card.classList.contains('schematic-card-empty');
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

  function _renderHeroSlots(shipClass, slotMap, activeShip) {
    // Get all available agent blueprints for swap dropdowns
    const allAgents = _getAvailableAgents(slotMap);

    const slotsHTML = shipClass.slots.map(slot => {
      const bpId = slotMap[String(slot.id)] || null;
      const bp = _resolveBp(bpId);
      const RC = BlueprintUtils.RARITY_COLORS;

      const placeholder = bp ? 'Swap Agent...' : 'Assign Agent...';
      const searchDropdown = `<div class="sch-search-drop" data-slot-id="${slot.id}">
        <input type="text" class="sch-search-input" placeholder="${placeholder}" autocomplete="off" />
        <div class="sch-search-list"></div>
      </div>`;

      // Get recommended/default agent for this slot from ship crew data
      const defaultAgent = _getDefaultAgent(activeShip, slot.id);
      const defaultBtn = (!bp && defaultAgent)
        ? `<button class="btn btn-sm sch-slot-default" data-slot-id="${slot.id}" data-bp-id="${_esc(defaultAgent.id)}" title="Assign ${_esc(defaultAgent.name)}">⚡ ${_esc(defaultAgent.name)}</button>`
        : '';

      if (bp) {
        const bpRarity = _getBpRarity(bp);
        const bpRarityColor = RC[bpRarity] || '#94a3b8';
        const maxRarity = slot.maxRarity || 'Legendary';
        const rarityOrder = { Common: 1, Rare: 2, Epic: 3, Legendary: 4, Mythic: 5 };
        const isMismatch = (rarityOrder[bpRarity] || 1) > (rarityOrder[maxRarity] || 4);
        const mismatchClass = isMismatch ? ' slot-rarity-mismatch' : '';
        const mismatchTitle = isMismatch ? ` title="Agent rarity (${bpRarity}) exceeds slot max (${maxRarity})"` : '';
        return `
          <div class="bridge-slot bridge-slot-filled${mismatchClass}" data-slot-id="${slot.id}" data-bp-id="${bp.id}"${mismatchTitle}>
            <div class="bridge-slot-top">
              <span class="bridge-slot-label">${_esc(slot.label).toUpperCase()}</span>
              <span class="bridge-slot-rarity" style="color:${bpRarityColor}">[${bpRarity.charAt(0)}]</span>
            </div>
            <span class="bridge-slot-name">${_esc(bp.name)}</span>
            <div class="bridge-slot-swap">
              ${searchDropdown}
              <button class="btn btn-sm sch-slot-remove" data-slot-id="${slot.id}" title="Remove agent">✕</button>
            </div>
          </div>`;
      }
      return `
        <div class="bridge-slot bridge-slot-empty" data-slot-id="${slot.id}">
          <span class="bridge-slot-label">${_esc(slot.label).toUpperCase()}</span>
          ${defaultBtn}
          <div class="bridge-slot-swap">
            ${searchDropdown}
          </div>
        </div>`;
    }).join('');

    const cardHTML = typeof CardRenderer !== 'undefined'
      ? CardRenderer.render('spaceship', 'full', activeShip)
      : '';

    return `<div class="bridge-crew-split">
      <div class="bridge-crew-list">${slotsHTML}</div>
      <div class="bridge-crew-card">${cardHTML}</div>
    </div>`;
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

  function _getDefaultAgent(activeShip, slotIdx) {
    if (!activeShip) return null;
    const shipId = activeShip.id;
    const rawId = shipId ? shipId.replace(/^bp-/, '') : '';
    const ship = (typeof Blueprints !== 'undefined')
      ? (Blueprints.getSpaceship(rawId) || Blueprints.getSpaceship(shipId))
      : null;
    if (!ship || !ship.crew || !ship.crew[slotIdx]) return null;
    const crew = ship.crew[slotIdx];
    const name = crew.label || crew.name || null;
    if (!name) return null;
    // Try to find a matching blueprint by name
    const allAgents = _getAvailableAgents({});
    const match = allAgents.find(a => a.name.toLowerCase() === name.toLowerCase());
    if (match) return match;
    // Return the __new__ placeholder
    return { id: '__new__' + name, name };
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
      try { localStorage.setItem(Utils.KEYS.mcShip, fallbackId); } catch {}
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
    // Mobile-only mounts — picker pill in #app-fixed-tabs and swap sheet
    // at body level. Both need explicit unmount when leaving the view.
    _unmountFixedShipPicker();
    _unmountSwapSheet();
    // Clean up radar canvas
    if (typeof DockView !== 'undefined' && DockView._stopRadar) {
      DockView._stopRadar();
    }
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

  return { render, destroy };
})();
