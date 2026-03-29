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
    let activatedShips = (typeof BlueprintStore !== 'undefined') ? BlueprintStore.getActivatedShips() : [];
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

    // Ship selector dropdown
    const shipOptions = activatedShips.map(s =>
      `<option value="${_esc(s.id)}" ${s.id === activeShip.id ? 'selected' : ''}>${_esc(s.name || 'Unnamed Ship')}</option>`
    ).join('');
    const shipSelectHTML = `<select class="sch-ship-select" id="sch-ship-select">${shipOptions}</select>`;
    const switchBtnHTML = activatedShips.length > 1
      ? `<button class="btn btn-sm sch-switch-btn" id="sch-switch-btn">Switch Spaceship</button>`
      : '';

    const headerHTML = `
      <div class="bridge-hero-header">
        <div class="bridge-hero-info">
          <span class="bridge-hero-name">${_esc(activeShip.name || 'Unnamed Ship')}</span>
          <span class="bridge-hero-meta">${shipClass.name} (${filledCount}/${totalSlots}) <span style="color:${statusColor}">${status}</span></span>
        </div>
        <div class="bridge-hero-controls">
          ${switchBtnHTML}
          ${shipSelectHTML}
          <div class="bridge-hero-tabs">${tabsHTML}</div>
        </div>
      </div>
    `;

    let viewHTML = '';
    if (_heroView === 'schematic') {
      viewHTML = _renderHeroSchematic(shipClass, slotMap);
    } else {
      viewHTML = _renderHeroSlots(shipClass, slotMap, activeShip);
    }

    el.innerHTML = `<div class="bridge-hero-wrap">${headerHTML}<div class="bridge-hero-content">${viewHTML}</div></div>`;

    // Add resize listener per render (removed in destroy)
    window.removeEventListener('resize', _onResize);
    window.addEventListener('resize', _onResize);

    if (_heroView === 'schematic') {
      requestAnimationFrame(() => {
        _wireSchematic();
        const cvs = el.querySelector('.sch-radar-canvas');
        if (cvs && typeof DockView !== 'undefined' && DockView._initRadar) {
          DockView._initRadar(cvs);
        }
        // Core click → prefill prompt with spaceship name (HTML overlay above SVG + slots)
        const coreHit = el.querySelector('.sch-core-hit-overlay') || el.querySelector('.sch-core-hit');
        if (coreHit) {
          coreHit.addEventListener('click', (e) => {
            e.stopPropagation();
            const shipName = activeShip?.name || 'Ship';
            if (typeof PromptPanel !== 'undefined' && PromptPanel.prefill) {
              PromptPanel.show();
              PromptPanel.prefill('@' + shipName + ' ');
            }
          });
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

    // Ship selector dropdown
    const shipSelect = el.querySelector('#sch-ship-select');
    if (shipSelect) {
      shipSelect.addEventListener('change', () => {
        localStorage.setItem('nice-mc-ship', shipSelect.value);
        window.dispatchEvent(new StorageEvent('storage', { key: 'nice-mc-ship', newValue: shipSelect.value }));
        render(el);
      });
    }

    // Switch spaceship button (cycles to next)
    const switchBtn = el.querySelector('#sch-switch-btn');
    if (switchBtn) {
      switchBtn.addEventListener('click', () => {
        const currentIdx = activatedShips.findIndex(s => s.id === (activeShip?.id));
        const nextIdx = (currentIdx + 1) % activatedShips.length;
        const nextId = activatedShips[nextIdx].id;
        localStorage.setItem('nice-mc-ship', nextId);
        window.dispatchEvent(new StorageEvent('storage', { key: 'nice-mc-ship', newValue: nextId }));
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
    if (!shipId || typeof BlueprintStore === 'undefined') return;
    const current = BlueprintStore.getShipState(shipId) || {};
    const assignments = { ...(current.slot_assignments || {}) };
    if (bpId) {
      assignments[String(slotId)] = bpId;
    } else {
      delete assignments[String(slotId)];
    }
    const agentIds = Object.values(assignments).filter(Boolean);
    const status = agentIds.length > 0 ? 'deployed' : 'docked';
    BlueprintStore.saveShipState(shipId, { slot_assignments: assignments, agent_ids: agentIds, status });
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
    const svg = '<svg class="schematic-svg" preserveAspectRatio="none"></svg>';

    return '<div class="schematic-wired">' +
      '<canvas class="sch-radar-canvas" aria-hidden="true"></canvas>' +
      '<div class="schematic-col schematic-col-left">' + leftHTML + '</div>' +
      '<div class="schematic-center">' + svg + '<div class="sch-core-hit-overlay" title="Send a mission to this ship"></div>' + '</div>' +
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
      // Use the inner mini card (or empty slot) for precise center, fall back to wrapper
      const inner = card.querySelector('.tcg-card-mini') || card.querySelector('.schematic-empty-slot') || card;
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
    '<circle cx="' + rcx + '" cy="' + rcy + '" r="21" fill="var(--accent,#fff)" opacity=".9"/>' +
    '<circle class="sch-core-hit" cx="' + rcx + '" cy="' + rcy + '" r="50" fill="transparent" style="cursor:pointer;pointer-events:all"/>';

    svgEl.innerHTML = paths + reactor + dots;
  }

  function _renderHeroSlots(shipClass, slotMap, activeShip) {
    // Get all available agent blueprints for swap dropdowns
    const allAgents = _getAvailableAgents(slotMap);

    const slotsHTML = shipClass.slots.map(slot => {
      const bpId = slotMap[String(slot.id)] || null;
      const bp = _resolveBp(bpId);
      const RC = { Common:'#94a3b8', Rare:'#6366f1', Epic:'#a855f7', Legendary:'#f59e0b', Mythic:'#ff2d55' };

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
        return `
          <div class="bridge-slot bridge-slot-filled" data-slot-id="${slot.id}" data-bp-id="${bp.id}">
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
    // From BlueprintStore
    if (typeof BlueprintStore !== 'undefined' && BlueprintStore.listAgents) {
      agents.push(...BlueprintStore.listAgents());
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
    const ship = (typeof BlueprintStore !== 'undefined')
      ? (BlueprintStore.getSpaceship(rawId) || BlueprintStore.getSpaceship(shipId))
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
    const stored = localStorage.getItem('nice-mc-ship');
    if (stored) return _normalizeShipId(stored);
    const ships = (typeof BlueprintStore !== 'undefined') ? BlueprintStore.getActivatedShips() : [];
    if (ships.length) return _normalizeShipId(ships[0].id);
    // Check custom ships from State (Crew Designer)
    const custom = (typeof State !== 'undefined' ? State.get('spaceships') : null) || [];
    return custom.length ? _normalizeShipId(custom[0].id) : null;
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
    // Check custom ships from State (Crew Designer)
    const customShips = (typeof State !== 'undefined' ? State.get('spaceships') : null) || [];
    const customShip = customShips.find(s => s.id === shipId);
    if (customShip && customShip.slot_assignments && Object.keys(customShip.slot_assignments).length) {
      return { ...customShip.slot_assignments };
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
    // Clean up radar canvas
    if (typeof DockView !== 'undefined' && DockView._stopRadar) {
      DockView._stopRadar();
    }
  }

  return { render, destroy };
})();
