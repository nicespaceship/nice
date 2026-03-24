/* ═══════════════════════════════════════════════════════════════════
   NICE — Schematic View
   Ship crew schematic with animated SVG curves connecting agent slots
   to a central reactor core. Extracted from the original Bridge view.
   Rendered as a tab inside the Blueprints view.
═══════════════════════════════════════════════════════════════════ */

const SchematicView = (() => {
  const _esc = typeof Utils !== 'undefined' ? Utils.esc : (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let _heroView = 'schematic';
  let _resizeTimer = null;

  function render(el) {
    const shipId = _getShipId();
    const activatedShips = (typeof BlueprintStore !== 'undefined') ? BlueprintStore.getActivatedShips() : [];
    const activeShip = activatedShips.find(s => s.id === shipId) || activatedShips[0];

    if (!activeShip) {
      el.innerHTML = `
        <div class="schematic-empty">
          <p>No spaceships deployed.</p>
        </div>
      `;
      return;
    }

    const shipCrewCount = parseInt(activeShip.stats?.crew, 10) || 0;
    const slotCount = shipCrewCount > 0 ? shipCrewCount : (typeof Gamification !== 'undefined' ? Gamification.getMaxSlots() : 5);
    const shipClass = typeof Gamification !== 'undefined'
      ? Gamification.getSlotTemplate(slotCount)
      : { id: 'dynamic', name: 'Ship', slots: Array.from({ length: slotCount }, (_, i) => ({ id: i, label: 'Agent ' + i, maxRarity: 'Rare' })) };
    const slotMap = _getSlotMap();
    const filledCount = Object.values(slotMap).filter(Boolean).length;
    const totalSlots = shipClass.slots.length;
    const status = filledCount >= totalSlots ? 'DEPLOYED' : 'DOCKED';
    const statusColor = status === 'DEPLOYED' ? '#22c55e' : '#f59e0b';

    const tabs = [
      { id: 'schematic', label: 'Schematic' },
      { id: 'slots', label: 'Agents' },
    ];
    const tabsHTML = tabs.map(t =>
      `<button class="bridge-hero-tab ${_heroView === t.id ? 'active' : ''}" data-view="${t.id}">${t.label}</button>`
    ).join('');

    const headerHTML = `
      <div class="bridge-hero-header">
        <div class="bridge-hero-info">
          <span class="bridge-hero-name">${_esc(activeShip.name || 'Unnamed Ship')}</span>
          <span class="bridge-hero-meta">${shipClass.name} (${filledCount}/${totalSlots}) <span style="color:${statusColor}">${status}</span></span>
        </div>
        <div class="bridge-hero-tabs">${tabsHTML}</div>
      </div>
    `;

    if (_heroView === 'card') _heroView = 'slots';
    let viewHTML = '';
    if (_heroView === 'schematic') {
      viewHTML = _renderHeroSchematic(shipClass, slotMap, activeShip);
    } else {
      viewHTML = _renderHeroSlots(shipClass, slotMap, activeShip);
    }

    // Ship switcher
    const switcherHTML = activatedShips.length > 1
      ? `<button class="btn btn-sm bridge-hero-switch" style="margin-top:8px">Switch Ship</button>`
      : '';

    el.innerHTML = `<div class="bridge-hero-wrap">${headerHTML}<div class="bridge-hero-content">${viewHTML}</div>${switcherHTML}</div>`;

    if (_heroView === 'schematic') {
      requestAnimationFrame(() => {
        _wireSchematic();
        const cvs = el.querySelector('.sch-radar-canvas');
        if (cvs && typeof DockView !== 'undefined' && DockView._initRadar) {
          DockView._initRadar(cvs);
        }
      });
    }

    // Tab click handlers
    el.querySelectorAll('.bridge-hero-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        _heroView = tab.dataset.view;
        render(el);
      });
    });

    // Slot click → open detail
    el.querySelectorAll('.bridge-slot-filled, .schematic-card-slot[data-bp-id]').forEach(slot => {
      slot.addEventListener('click', () => {
        const bpId = slot.dataset.bpId;
        if (bpId && typeof BlueprintsView !== 'undefined' && BlueprintsView.openDrawer) {
          BlueprintsView.openDrawer(bpId);
        }
      });
    });

    // Ship switcher
    el.querySelectorAll('.bridge-hero-switch').forEach(btn => {
      btn.addEventListener('click', () => {
        const currentIdx = activatedShips.findIndex(s => s.id === (activeShip?.id));
        const nextIdx = (currentIdx + 1) % activatedShips.length;
        localStorage.setItem('nice-mc-ship', activatedShips[nextIdx].id);
        render(el);
      });
    });
  }

  function _renderHeroSchematic(shipClass, slotMap) {
    const slots = shipClass.slots || [];
    const CR = typeof CardRenderer !== 'undefined' ? CardRenderer : null;
    const RC = { Common:'#94a3b8', Rare:'#6366f1', Epic:'#a855f7', Legendary:'#f59e0b', Mythic:'#ff2d55' };

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
    const svg = '<svg class="schematic-svg" preserveAspectRatio="none"></svg>';

    return '<div class="schematic-wired">' +
      '<canvas class="sch-radar-canvas" aria-hidden="true"></canvas>' +
      '<div class="schematic-col schematic-col-left">' + leftHTML + '</div>' +
      '<div class="schematic-center">' + svg + '</div>' +
      '<div class="schematic-col schematic-col-right">' + rightHTML + '</div>' +
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
    const centerEl = container.querySelector('.schematic-center');
    const centerRect = centerEl.getBoundingClientRect();

    const rcx = centerRect.left - cRect.left + centerRect.width / 2;
    const rcy = centerRect.top - cRect.top + centerRect.height / 2;

    const w = cRect.width;
    const h = cRect.height;
    svgEl.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svgEl.style.width = w + 'px';
    svgEl.style.height = h + 'px';

    let paths = '';
    let dots = '';
    let dotIdx = 0;

    const isStacked = getComputedStyle(container).flexDirection === 'column';

    cards.forEach((card, i) => {
      const cardRect = card.getBoundingClientRect();
      const isLeft = card.classList.contains('schematic-card-left');
      const cardCx = cardRect.left - cRect.left + cardRect.width / 2;
      const cardCy = cardRect.top - cRect.top + cardRect.height / 2;

      const filled = !card.classList.contains('schematic-card-empty');
      const pathId = 'sch-p-' + i;
      const opacity = filled ? '.25' : '.06';
      const dash = filled ? '' : ' stroke-dasharray="3 5"';
      const sw = filled ? '.8' : '.4';
      let d;

      if (isStacked) {
        const cpOff = Math.abs(rcy - cardCy) * 0.55;
        const cp1y = isLeft ? cardCy + cpOff : cardCy - cpOff;
        const cp2y = isLeft ? rcy - cpOff * 0.3 : rcy + cpOff * 0.3;
        d = 'M' + cardCx + ',' + cardCy +
          ' C' + cardCx + ',' + cp1y +
          ' ' + rcx + ',' + cp2y +
          ' ' + rcx + ',' + rcy;
      } else {
        const cpOff = Math.abs(rcx - cardCx) * 0.55;
        const cp1x = isLeft ? cardCx + cpOff : cardCx - cpOff;
        const cp2x = isLeft ? rcx - cpOff * 0.3 : rcx + cpOff * 0.3;
        d = 'M' + cardCx + ',' + cardCy +
          ' C' + cp1x + ',' + cardCy +
          ' ' + cp2x + ',' + rcy +
          ' ' + rcx + ',' + rcy;
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

    const reactor = '<circle cx="' + rcx + '" cy="' + rcy + '" r="90" fill="var(--accent,#fff)" opacity=".04">' +
      '<animate attributeName="r" values="80;100;80" dur="3s" repeatCount="indefinite"/>' +
      '<animate attributeName="opacity" values=".02;.07;.02" dur="3s" repeatCount="indefinite"/>' +
    '</circle>' +
    '<circle cx="' + rcx + '" cy="' + rcy + '" r="48" fill="var(--accent,#fff)" opacity=".08">' +
      '<animate attributeName="r" values="42;54;42" dur="2.5s" repeatCount="indefinite"/>' +
      '<animate attributeName="opacity" values=".05;.12;.05" dur="2.5s" repeatCount="indefinite"/>' +
    '</circle>' +
    '<circle cx="' + rcx + '" cy="' + rcy + '" r="21" fill="var(--accent,#fff)" opacity=".9"/>';

    svgEl.innerHTML = paths + reactor + dots;
  }

  function _renderHeroSlots(shipClass, slotMap, activeShip) {
    const slotsHTML = shipClass.slots.map(slot => {
      const bpId = slotMap[String(slot.id)] || null;
      const bp = _resolveBp(bpId);

      if (bp) {
        const bpRarity = _getBpRarity(bp);
        const RC = { Common:'#94a3b8', Rare:'#6366f1', Epic:'#a855f7', Legendary:'#f59e0b', Mythic:'#ff2d55' };
        const bpRarityColor = RC[bpRarity] || '#94a3b8';
        return `
          <div class="bridge-slot bridge-slot-filled" data-bp-id="${bp.id}">
            <span class="bridge-slot-label">${_esc(slot.label).toUpperCase()}</span>
            <span class="bridge-slot-name">${_esc(bp.name)}</span>
            <span class="bridge-slot-rarity" style="color:${bpRarityColor}">[${bpRarity.charAt(0)}]</span>
          </div>`;
      }
      return `
        <div class="bridge-slot bridge-slot-empty">
          <span class="bridge-slot-label">${_esc(slot.label).toUpperCase()}</span>
          <a href="#/bridge?tab=agent" class="bridge-slot-dock">+ ASSIGN</a>
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

  /* ── Helpers ── */

  function _normalizeShipId(id) {
    return id ? String(id) : null;
  }

  function _getShipId() {
    const stored = localStorage.getItem('nice-mc-ship');
    if (stored) return _normalizeShipId(stored);
    const ships = (typeof BlueprintStore !== 'undefined') ? BlueprintStore.getActivatedShips() : [];
    return ships.length ? _normalizeShipId(ships[0].id) : null;
  }

  function _getSlotMap() {
    const shipId = _getShipId();
    if (!shipId) return {};
    if (typeof BlueprintStore !== 'undefined' && BlueprintStore.getShipState) {
      const saved = BlueprintStore.getShipState(shipId);
      if (saved && saved.slot_assignments && Object.keys(saved.slot_assignments).length) {
        return { ...saved.slot_assignments };
      }
    }
    const rawId = shipId.replace(/^bp-/, '');
    const bp = (typeof BlueprintStore !== 'undefined') ? (BlueprintStore.getSpaceship(rawId) || BlueprintStore.getSpaceship(shipId)) : null;
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
      if (shipId && typeof BlueprintStore !== 'undefined') {
        const rawId = shipId.replace(/^bp-/, '');
        const ship = BlueprintStore.getSpaceship(rawId) || BlueprintStore.getSpaceship(shipId);
        if (ship) {
          const crewMember = (ship.crew || []).find(c => c.label === agentName);
          if (crewMember?.rarity) crewRarity = crewMember.rarity;
        }
      }
      bp = { id: bpId, name: agentName, category: 'Agent', rarity: crewRarity };
    }
    if (!bp && typeof BlueprintStore !== 'undefined') bp = BlueprintStore.getAgent(bpId);
    if (!bp) {
      const agent = (typeof State !== 'undefined' && State.get('agents') || []).find(r => r.id === bpId);
      if (agent) bp = { id: agent.id, name: agent.name, category: agent.role || agent.category, rarity: agent.rarity || 'Common' };
    }
    return bp;
  }

  function _getBpRarity(bp) {
    if (bp.rarity) return bp.rarity;
    if (typeof Gamification === 'undefined') return 'Common';
    return Gamification.calcAgentRarity(bp).name;
  }

  function _onResize() {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(_wireSchematic, 150);
  }

  function destroy() {
    clearTimeout(_resizeTimer);
    window.removeEventListener('resize', _onResize);
    // Clean up radar canvas from DockView
    if (typeof DockView !== 'undefined' && DockView.destroy) {
      try { cancelAnimationFrame(DockView._radarRaf); } catch(e) {}
    }
  }

  // Redraw schematic on resize (listener added/removed per lifecycle)
  window.addEventListener('resize', _onResize);

  return { render, destroy };
})();
