/* ═══════════════════════════════════════════════════════════════════
   NICE — Bridge (Home View)
   Single-screen command center: crew panel + mission feed + stats strip.
   Schematic and fleet management moved to DockView.
═══════════════════════════════════════════════════════════════════ */

const HomeView = (() => {
  const title = 'Bridge';

  let _missionChannel = null;

  /* ── Render ── */

  function render(el) {
    const user = State.get('user');

    el.innerHTML = `
      <div class="bridge-wrap">
        <div class="bridge-stats" id="bridge-stats"></div>
        <div class="bridge-hero" id="bridge-hero"></div>
        <div class="bridge-feed" id="bridge-feed"></div>
      </div>
    `;

    _renderStatsStrip();
    _renderShipHero();
    _renderMissionFeed();

    // Load live data if user is signed in
    if (user) _loadLiveStats(user);

    // Auto-refresh when State changes
    State.on('missions', _onMissionsChanged);
    State.on('agents', _onAgentsChanged);
  }

  /* ── Stats Strip ── */

  function _renderStatsStrip() {
    const container = document.getElementById('bridge-stats');
    if (!container) return;

    const xp = typeof Gamification !== 'undefined' && Gamification.getXP ? Gamification.getXP() : 0;
    const rank = typeof Gamification !== 'undefined' && Gamification.getRank ? Gamification.getRank() : { name: 'Ensign' };
    const tokens = typeof Gamification !== 'undefined' && Gamification.getResources ? (Gamification.getResources()?.tokens || 0) : 0;
    const streak = typeof Gamification !== 'undefined' && Gamification.getStreak ? Gamification.getStreak() : 0;
    const nextRank = typeof Gamification !== 'undefined' && Gamification.getNextRank ? Gamification.getNextRank() : null;
    const xpProgress = nextRank ? Math.min(100, Math.round(((xp - (rank.minXP || 0)) / (nextRank.minXP - (rank.minXP || 0))) * 100)) : 100;

    container.innerHTML = `
      <div class="bridge-stat"><span class="bridge-stat-label">Rank</span><span class="bridge-stat-value">${rank.name}</span></div>
      <div class="bridge-stat bridge-stat-xp">
        <span class="bridge-stat-label">XP</span>
        <div class="bridge-xp-bar"><div class="bridge-xp-fill" style="width:${xpProgress}%"></div></div>
        <span class="bridge-stat-value">${xp.toLocaleString()}</span>
      </div>
      <div class="bridge-stat"><span class="bridge-stat-label">Tokens</span><span class="bridge-stat-value">${tokens}</span></div>
      ${streak > 0 ? `<div class="bridge-stat"><span class="bridge-stat-label">Streak</span><span class="bridge-stat-value">${streak}d</span></div>` : ''}
    `;
  }

  /* ── Ship Hero (3-view carousel) ── */

  let _heroView = 'schematic'; // 'schematic' | 'slots' | 'card'

  function _renderShipHero() {
    const container = document.getElementById('bridge-hero');
    if (!container) return;

    const shipId = _getShipId();
    const activatedShips = (typeof BlueprintStore !== 'undefined') ? BlueprintStore.getActivatedShips() : [];
    const activeShip = activatedShips.find(s => s.id === shipId) || activatedShips[0];

    if (!activeShip) {
      container.innerHTML = `
        <div class="bridge-hero-empty">
          <p>No ship deployed</p>
          <a href="#/blueprints" class="btn btn-sm btn-primary">Browse Blueprints</a>
        </div>
      `;
      return;
    }

    // Use ship's actual crew count for slot template (Enterprise = 12, etc.)
    const shipCrewCount = parseInt(activeShip.stats?.crew, 10) || 0;
    const slotCount = shipCrewCount > 0 ? shipCrewCount : (typeof Gamification !== 'undefined' ? Gamification.getMaxSlots() : 5);
    const shipClass = typeof Gamification !== 'undefined'
      ? Gamification.getSlotTemplate(slotCount)
      : { id: 'dynamic', name: 'Ship', slots: Array.from({ length: slotCount }, function(_, i) { return { id: i, label: 'Agent ' + i, maxRarity: 'Rare' }; }) };
    const slotMap = _getSlotMap();
    const filledCount = Object.values(slotMap).filter(Boolean).length;
    const totalSlots = shipClass.slots.length;
    const status = filledCount >= totalSlots ? 'DEPLOYED' : 'DOCKED';
    const statusColor = status === 'DEPLOYED' ? '#22c55e' : '#f59e0b';

    // View tabs
    const tabs = [
      { id: 'schematic', label: 'Schematic' },
      { id: 'slots', label: 'Agents' },
    ];
    const tabsHTML = tabs.map(t =>
      `<button class="bridge-hero-tab ${_heroView === t.id ? 'active' : ''}" data-view="${t.id}">${t.label}</button>`
    ).join('');

    // Ship header
    const headerHTML = `
      <div class="bridge-hero-header">
        <div class="bridge-hero-info">
          <span class="bridge-hero-name">${_esc(activeShip.name || 'Unnamed Ship')}</span>
          <span class="bridge-hero-meta">${shipClass.name} (${filledCount}/${totalSlots}) <span style="color:${statusColor}">${status}</span></span>
        </div>
        <div class="bridge-hero-tabs">${tabsHTML}</div>
      </div>
    `;

    // View content
    if (_heroView === 'card') _heroView = 'slots'; // removed card tab, fallback
    let viewHTML = '';
    if (_heroView === 'schematic') {
      viewHTML = _renderHeroSchematic(shipClass, slotMap, activeShip);
    } else if (_heroView === 'slots') {
      viewHTML = _renderHeroSlots(shipClass, slotMap, activeShip);
    }

    container.innerHTML = headerHTML + `<div class="bridge-hero-content">${viewHTML}</div>`;

    // Wire schematic SVG after DOM mount
    if (_heroView === 'schematic') {
      requestAnimationFrame(_wireSchematic);
    }

    // Tab click handlers
    container.querySelectorAll('.bridge-hero-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        _heroView = tab.dataset.view;
        _renderShipHero();
      });
    });

    // Slot click handlers (for crew view + schematic cards)
    container.querySelectorAll('.bridge-slot-filled, .schematic-card-slot[data-bp-id]').forEach(slot => {
      slot.addEventListener('click', () => {
        const bpId = slot.dataset.bpId;
        if (bpId && typeof BlueprintsView !== 'undefined' && BlueprintsView.openDrawer) {
          BlueprintsView.openDrawer(bpId);
        }
      });
    });

    // Card click → prefill prompt bar with mission suggestions
    const crewCard = container.querySelector('.bridge-crew-card');
    if (crewCard) {
      crewCard.style.cursor = 'pointer';
      crewCard.addEventListener('click', () => _promptMission(activeShip));
    }

    // Ship switcher (if multiple ships)
    if (activatedShips.length > 1) {
      container.querySelectorAll('.bridge-hero-switch').forEach(btn => {
        btn.addEventListener('click', () => {
          const currentIdx = activatedShips.findIndex(s => s.id === (activeShip?.id));
          const nextIdx = (currentIdx + 1) % activatedShips.length;
          localStorage.setItem('nice-mc-ship', activatedShips[nextIdx].id);
          _renderShipHero();
        });
      });
    }

    // Auto-prompt the spaceship on Bridge load
    setTimeout(() => _promptMission(activeShip), 300);
  }

  function _renderHeroSchematic(shipClass, slotMap, activeShip) {
    var slots = shipClass.slots || [];
    var CR = typeof CardRenderer !== 'undefined' ? CardRenderer : null;

    // Resolve crew agents for each slot
    var crew = slots.map(function(slot, i) {
      var bpId = slotMap[String(slot.id)] || null;
      var bp = bpId ? _resolveBp(bpId) : null;
      return { slot: slot, bp: bp, index: i };
    });

    var half = Math.ceil(crew.length / 2);
    var leftCrew = crew.slice(0, half);
    var rightCrew = crew.slice(half);
    var RC = { Common:'#94a3b8', Rare:'#6366f1', Epic:'#a855f7', Legendary:'#f59e0b', Mythic:'#ff2d55' };

    function _miniCard(c, side) {
      var bp = c.bp;
      var label = c.slot.label || 'Agent ' + c.index;
      var rarity = c.slot.maxRarity || 'Common';
      var rarityColor = RC[rarity] || '#94a3b8';
      if (bp && CR) {
        return '<div class="schematic-card-slot schematic-card-' + side + '" data-slot-idx="' + c.index + '" data-bp-id="' + bp.id + '">' +
          CR.render('agent', 'mini', bp) +
        '</div>';
      }
      return '<div class="schematic-card-slot schematic-card-empty schematic-card-' + side + '" data-slot-idx="' + c.index + '">' +
        '<div class="schematic-empty-slot" style="border-color:' + rarityColor + '">' +
          '<div class="schematic-card-role">' + _esc(label) + '</div>' +
          '<div class="schematic-card-rarity" style="color:' + rarityColor + '">' + rarity + '</div>' +
        '</div>' +
      '</div>';
    }

    var leftHTML = leftCrew.map(function(c) { return _miniCard(c, 'left'); }).join('');
    var rightHTML = rightCrew.map(function(c) { return _miniCard(c, 'right'); }).join('');

    // SVG placeholder — paths drawn after mount by _wireSchematic()
    var svg = '<svg class="schematic-svg" preserveAspectRatio="none"></svg>';

    return '<div class="schematic-wired">' +
      '<div class="schematic-col schematic-col-left">' + leftHTML + '</div>' +
      '<div class="schematic-center">' + svg + '</div>' +
      '<div class="schematic-col schematic-col-right">' + rightHTML + '</div>' +
    '</div>';
  }

  /** Measure card positions after DOM mount and draw smooth SVG curves */
  function _wireSchematic() {
    var container = document.querySelector('.schematic-wired');
    if (!container) return;
    var svgEl = container.querySelector('.schematic-svg');
    if (!svgEl) return;

    var cards = container.querySelectorAll('.schematic-card-slot');
    if (!cards.length) return;

    var cRect = container.getBoundingClientRect();
    var centerEl = container.querySelector('.schematic-center');
    var centerRect = centerEl.getBoundingClientRect();

    // Reactor center in container-relative coords
    var rcx = centerRect.left - cRect.left + centerRect.width / 2;
    var rcy = centerRect.top - cRect.top + centerRect.height / 2;

    // Size SVG to fill entire container
    var w = cRect.width;
    var h = cRect.height;
    svgEl.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svgEl.style.width = w + 'px';
    svgEl.style.height = h + 'px';

    var paths = '';
    var dots = '';
    var dotIdx = 0;

    // Detect stacked (mobile) vs side-by-side layout
    var isStacked = getComputedStyle(container).flexDirection === 'column';

    cards.forEach(function(card, i) {
      var cardRect = card.getBoundingClientRect();
      var isLeft = card.classList.contains('schematic-card-left');
      var cardCx = cardRect.left - cRect.left + cardRect.width / 2;
      var cardCy = cardRect.top - cRect.top + cardRect.height / 2;

      var filled = !card.classList.contains('schematic-card-empty');
      var pathId = 'sch-p-' + i;
      var opacity = filled ? '.25' : '.06';
      var dash = filled ? '' : ' stroke-dasharray="3 5"';
      var sw = filled ? '.8' : '.4';
      var d;

      if (isStacked) {
        // Mobile: curves from card bottom/top edge to reactor
        var edgeY = isLeft
          ? cardRect.bottom - cRect.top   // left cards are above → bottom edge
          : cardRect.top - cRect.top;     // right cards are below → top edge
        var cpOff = Math.abs(rcy - edgeY) * 0.55;
        var cp1y = isLeft ? edgeY + cpOff : edgeY - cpOff;
        var cp2y = isLeft ? rcy - cpOff * 0.3 : rcy + cpOff * 0.3;
        d = 'M' + cardCx + ',' + edgeY +
          ' C' + cardCx + ',' + cp1y +
          ' ' + rcx + ',' + cp2y +
          ' ' + rcx + ',' + rcy;
      } else {
        // Desktop: curves from card inner edge to reactor
        var edgeX = isLeft
          ? cardRect.right - cRect.left
          : cardRect.left - cRect.left;
        var cpOff = Math.abs(rcx - edgeX) * 0.55;
        var cp1x = isLeft ? edgeX + cpOff : edgeX - cpOff;
        var cp2x = isLeft ? rcx - cpOff * 0.3 : rcx + cpOff * 0.3;
        d = 'M' + edgeX + ',' + cardCy +
          ' C' + cp1x + ',' + cardCy +
          ' ' + cp2x + ',' + rcy +
          ' ' + rcx + ',' + rcy;
      }

      paths += '<path id="' + pathId + '" d="' + d + '" fill="none" ' +
        'stroke="var(--accent,#fff)" stroke-opacity="' + opacity + '" stroke-width="' + sw + '"' + dash + '/>';

      if (filled) {
        var dur1 = (2 + dotIdx * 0.25).toFixed(2);
        var dur2 = (2.8 + dotIdx * 0.25).toFixed(2);
        var begin1 = (dotIdx * 0.4).toFixed(2);
        var begin2 = (dotIdx * 0.4 + 1).toFixed(2);
        dots += '<circle r="2" fill="var(--accent,#fff)" opacity=".6">' +
          '<animateMotion dur="' + dur1 + 's" repeatCount="indefinite" begin="' + begin1 + 's" keyPoints="1;0" keyTimes="0;1" calcMode="linear">' +
          '<mpath href="#' + pathId + '"/></animateMotion></circle>';
        dots += '<circle r="1" fill="var(--accent,#fff)" opacity=".3">' +
          '<animateMotion dur="' + dur2 + 's" repeatCount="indefinite" begin="' + begin2 + 's" keyPoints="1;0" keyTimes="0;1" calcMode="linear">' +
          '<mpath href="#' + pathId + '"/></animateMotion></circle>';
        dotIdx++;
      }
    });

    // Reactor core: outer glow + mid ring + solid center
    var reactor = '<circle cx="' + rcx + '" cy="' + rcy + '" r="90" fill="var(--accent,#fff)" opacity=".04">' +
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
        const bpRarityColor = typeof Gamification !== 'undefined'
          ? (Gamification.RARITY_THRESHOLDS.find(r => r.name === bpRarity)?.color || '#94a3b8')
          : '#94a3b8';
        return `
          <div class="bridge-slot bridge-slot-filled" data-bp-id="${bp.id}">
            <span class="bridge-slot-label">${_esc(slot.label).toUpperCase()}</span>
            <span class="bridge-slot-name">${_esc(bp.name)}</span>
            <span class="bridge-slot-rarity" style="color:${bpRarityColor}">[${bpRarity.charAt(0)}]</span>
          </div>`;
      } else {
        return `
          <div class="bridge-slot bridge-slot-empty">
            <span class="bridge-slot-label">${_esc(slot.label).toUpperCase()}</span>
            <a href="#/blueprints" class="bridge-slot-dock">+ ASSIGN</a>
          </div>`;
      }
    }).join('');

    const cardHTML = typeof CardRenderer !== 'undefined'
      ? CardRenderer.render('spaceship', 'full', activeShip)
      : '';

    return `<div class="bridge-crew-split">
      <div class="bridge-crew-list">${slotsHTML}</div>
      <div class="bridge-crew-card">${cardHTML}</div>
    </div>`;
  }

  /* ── Card → Mission Prompt ── */

  function _capToChip(cap) {
    // Turn a capability sentence into a short actionable chip
    // e.g. "Route command decisions through ops, security, and engineering teams" → "Route command decisions"
    var short = cap.replace(/\s+(through|via|across|with|using|by|into|from)\s+.*/i, '');
    if (short.length > 40) short = short.substring(0, 37) + '…';
    return short;
  }

  function _promptMission(ship) {
    if (typeof PromptPanel === 'undefined') return;
    var caps = ship.caps || ship.metadata?.caps || [];
    var chips = caps.map(_capToChip).filter(Boolean).slice(0, 4);
    // Fallback chips if no caps
    if (!chips.length) chips = ['Run a mission', 'Check status', 'Generate report'];
    PromptPanel.show();
    PromptPanel.prefill('');
    PromptPanel.setSuggestions(chips);
    var input = document.getElementById('nice-ai-input');
    if (input) {
      input.placeholder = 'Mission for ' + (ship.name || 'Ship') + '…';
      input.focus();
    }
  }

  /* ── Mission Feed ── */

  function _renderMissionFeed() {
    const container = document.getElementById('bridge-feed');
    if (!container) return;

    const missions = State.get('missions') || [];
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const running = missions.filter(m => m.status === 'running');
    const queued = missions.filter(m => m.status === 'queued');
    const completedToday = missions.filter(m => (m.status === 'completed' || m.status === 'failed') && new Date(m.updated_at || m.created_at).getTime() >= todayStart);

    let feedHTML = '';

    if (running.length) {
      feedHTML += `<div class="bridge-feed-section">
        <h4 class="bridge-feed-heading">Active</h4>
        ${running.map(m => _renderMissionItem(m, 'running')).join('')}
      </div>`;
    }

    if (queued.length) {
      feedHTML += `<div class="bridge-feed-section">
        <h4 class="bridge-feed-heading">Queued</h4>
        ${queued.map(m => _renderMissionItem(m, 'queued')).join('')}
      </div>`;
    }

    if (completedToday.length) {
      feedHTML += `<div class="bridge-feed-section">
        <h4 class="bridge-feed-heading">Completed Today</h4>
        ${completedToday.map(m => _renderMissionItem(m, m.status)).join('')}
      </div>`;
    }

    if (!feedHTML) {
      feedHTML = `
        <div class="bridge-feed-empty">
          <p>No missions yet</p>
          <p class="text-muted">Tap your ship card to start a mission.</p>
        </div>`;
    }

    container.innerHTML = `
      <div class="bridge-feed-list">${feedHTML}</div>
    `;
  }

  function _renderMissionItem(m, status) {
    const statusIcons = { running: '&#9654;', queued: '&#9679;', completed: '&#10003;', failed: '&#10007;' };
    const statusColors = { running: '#6366f1', queued: 'var(--text-muted)', completed: '#22c55e', failed: '#ef4444' };
    const icon = statusIcons[status] || '&#9679;';
    const color = statusColors[status] || 'var(--text-muted)';
    const priority = m.priority ? `<span class="bridge-mission-priority bridge-priority-${m.priority}">${m.priority}</span>` : '';
    const timeStr = _timeAgo(m.updated_at || m.created_at);
    const progress = status === 'running' && m.progress != null ? `<div class="bridge-mission-progress"><div class="bridge-mission-progress-fill" style="width:${m.progress}%"></div></div>` : '';

    return `
      <div class="bridge-mission-item bridge-mission-${status}">
        <span class="bridge-mission-icon" style="color:${color}">${icon}</span>
        <div class="bridge-mission-body">
          <span class="bridge-mission-title">${_esc(m.title || m.name || 'Untitled')}</span>
          ${progress}
          <span class="bridge-mission-meta">${timeStr} ${priority}</span>
        </div>
      </div>`;
  }

  /* ── State Change Handlers ── */

  function _onMissionsChanged() {
    if (!document.getElementById('bridge-feed')) return;
    _renderMissionFeed();
  }

  function _onAgentsChanged() {
    if (!document.getElementById('bridge-crew')) return;
    _renderCrewPanel();
  }

  /* ── Live Stats ── */

  async function _loadLiveStats(user) {
    try {
      let [agents, missions, spaceships] = await Promise.all([
        SB.db('user_agents').list({ userId: user.id }).catch(() => []),
        SB.db('tasks').list({ userId: user.id }).catch(() => []),
        SB.db('user_spaceships').list({ userId: user.id }).catch(() => []),
      ]);
      if (!agents.length) agents = State.get('agents') || [];
      if (!missions.length) missions = State.get('missions') || [];
      if (!spaceships.length) spaceships = State.get('spaceships') || [];
      State.set('agents', agents);
      State.set('missions', missions);
      State.set('spaceships', spaceships);
      _checkAchievements();
    } catch (err) {
      console.warn('Failed to load bridge stats:', err);
    }
  }

  function _checkAchievements() {
    if (typeof Gamification !== 'undefined') Gamification.checkAchievements();
  }

  /* ── Ship State Helpers ── */

  function _normalizeShipId(id) {
    if (!id) return null;
    return id.startsWith('bp-') ? id : 'bp-' + id;
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
    // Fallback: auto-populate from blueprint crew definitions
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
    let bp = BlueprintsView?.SEED?.find(b => b.id === bpId) || null;
    if (!bp && bpId.startsWith('__new__')) {
      bp = { id: bpId, name: bpId.replace('__new__', ''), category: 'Agent', rarity: 'Common' };
    }
    if (!bp && typeof BlueprintStore !== 'undefined') bp = BlueprintStore.getAgent(bpId);
    if (!bp) {
      const agent = (State.get('agents') || []).find(r => r.id === bpId);
      if (agent) bp = { id: agent.id, name: agent.name, category: agent.role || agent.category, rarity: agent.rarity || 'Common' };
    }
    return bp;
  }

  function _getBpRarity(bp) {
    if (bp.rarity) return bp.rarity;
    if (typeof Gamification === 'undefined') return 'Common';
    return Gamification.calcAgentRarity(bp).name;
  }

  /* ── Helpers ── */

  const _timeAgo = Utils.timeAgo;
  const _esc = Utils.esc;

  /* ── Cleanup ── */

  // Redraw schematic on resize (debounced)
  let _resizeTimer = null;
  window.addEventListener('resize', function() {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(_wireSchematic, 150);
  });

  function destroy() {
    if (_missionChannel) {
      SB.realtime.unsubscribe(_missionChannel);
      _missionChannel = null;
    }
    State.off('missions', _onMissionsChanged);
    State.off('agents', _onAgentsChanged);
  }

  return { title, render, destroy };
})();
