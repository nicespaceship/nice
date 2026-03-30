/* ═══════════════════════════════════════════════════════════════════
   NICE — Dock View
   Fleet management: ship switcher, SVG schematic, progression.
   Schematic code extracted from home.js.
═══════════════════════════════════════════════════════════════════ */

const DockView = (() => {
  const title = 'Dock';

  let _selectedBpId = null;

  /* ── Dynamic slot positions (circular layout for any count) ── */
  function _generateSlotPositions(count) {
    if (count <= 0) return [];
    if (count === 1) return [{ x: 50, y: 50 }];
    if (count === 2) return [{ x: 30, y: 50 }, { x: 70, y: 50 }];
    var positions = [];
    var cx = 50, cy = 50, r = 38;
    for (var i = 0; i < count; i++) {
      var angle = (Math.PI * 2 * i / count) - Math.PI / 2;
      positions.push({ x: Math.round(cx + r * Math.cos(angle)), y: Math.round(cy + r * Math.sin(angle)) });
    }
    return positions;
  }

  // Backward compat: keep named positions for legacy class IDs
  const SLOT_POSITIONS = {
    'class-1': _generateSlotPositions(2),
    'class-2': _generateSlotPositions(3),
    'class-3': _generateSlotPositions(5),
    'class-4': _generateSlotPositions(8),
    'class-5': _generateSlotPositions(12),
  };

  function render(el) {
    const user = State.get('user');
    if (!user) return _authPrompt(el, 'dock');

    const activatedShips = (typeof BlueprintStore !== 'undefined') ? BlueprintStore.getActivatedShips() : [];
    const shipId = _getShipId();

    el.innerHTML = `
      <div class="dock-wrap">
        <div class="bp-header">
          <div>
            <h1 class="bp-title">Dock</h1>
            <p class="bp-sub">Fleet management, agent assignments, and progression.</p>
          </div>
        </div>

        <!-- Ship Switcher -->
        <div class="dock-ships" id="dock-ships"></div>

        <!-- Schematic -->
        <div class="dock-schematic-section">
          <div class="widget-card mc-hero-schematic" data-widget="schematic" id="mc-schematic-widget">
            <div class="mc-schematic" id="mc-schematic">
              <div class="loading-state"><p>Loading schematic...</p></div>
            </div>
          </div>
        </div>

        <!-- Progression -->
        <div class="dock-progression" id="dock-progression"></div>
      </div>
    `;

    _renderShipSwitcher(activatedShips, shipId);
    _renderSchematicWidget();
    _initSchematicDnD();
    _renderProgression();
  }

  /* ── Ship Switcher ── */

  function _renderShipSwitcher(ships, activeShipId) {
    const container = document.getElementById('dock-ships');
    if (!container) return;

    if (!ships.length) {
      container.innerHTML = '<p class="text-muted">No ships deployed. Visit <a href="#/bridge">Blueprints</a> to activate a spaceship.</p>';
      return;
    }

    container.innerHTML = ships.map(ship => {
      const isActive = ship.id === activeShipId;
      const _bu = typeof BlueprintUtils !== 'undefined' ? BlueprintUtils : null;
      const classId = _bu ? _bu.getClassId(ship) : (ship.class_id || 'class-1');
      const slotCount = _bu ? _bu.getSlotCount(ship) : 6;
      const className = ship.name || classId;
      const state = (typeof BlueprintStore !== 'undefined' && BlueprintStore.getShipState) ? BlueprintStore.getShipState(ship.id) : null;
      const filledSlots = _bu ? _bu.getFilledCount(state || ship) : (state?.agent_ids?.length || 0);
      const status = state?.status || 'standby';
      const statusColor = status === 'deployed' ? '#22c55e' : status === 'docked' ? '#f59e0b' : 'var(--text-muted)';

      return `
        <div class="dock-ship-card ${isActive ? 'dock-ship-active' : ''}" data-ship-id="${ship.id}">
          <div class="dock-ship-info">
            <span class="dock-ship-name">${_esc(ship.name || 'Unnamed Ship')}</span>
            <span class="dock-ship-class">${className} &middot; ${filledSlots}/${slotCount} agents</span>
          </div>
          <span class="dock-ship-status" style="color:${statusColor}">${status.toUpperCase()}</span>
        </div>`;
    }).join('');

    container.querySelectorAll('.dock-ship-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.shipId;
        localStorage.setItem('nice-mc-ship', id);
        render(document.getElementById('app-view'));
      });
    });
  }

  /* ── Progression ── */

  function _renderProgression() {
    const container = document.getElementById('dock-progression');
    if (!container) return;

    const xp = (typeof Gamification !== 'undefined' && Gamification.getXP ? Gamification.getXP() : 0) || 0;
    const rank = (typeof Gamification !== 'undefined' && Gamification.getRank ? Gamification.getRank() : null) || { name: 'Ensign', minXP: 0 };
    const nextRank = typeof Gamification !== 'undefined' && Gamification.getNextRank ? Gamification.getNextRank() : null;
    const achievements = (typeof Gamification !== 'undefined' && Gamification.getUnlockedAchievements ? Gamification.getUnlockedAchievements() : []) || [];
    const streak = (typeof Gamification !== 'undefined' && Gamification.getStreak ? Gamification.getStreak() : 0) || 0;

    const rankMinXP = rank.minXP || 0;
    const nextMinXP = nextRank ? (nextRank.minXP || 1) : 1;
    const xpProgress = nextRank ? Math.min(100, Math.round(((xp - rankMinXP) / (nextMinXP - rankMinXP)) * 100)) : 100;

    container.innerHTML = `
      <div class="dock-prog-section">
        <h3 class="dock-section-title">Commander Progress</h3>
        <div class="mc-stats-strip">
          <div class="mc-stat-card"><span class="mc-stat-label">Rank</span><span class="mc-stat-value">${rank.name}</span></div>
          <div class="mc-stat-card"><span class="mc-stat-label">XP</span><span class="mc-stat-value">${xp.toLocaleString()}</span></div>
          <div class="mc-stat-card"><span class="mc-stat-label">Streak</span><span class="mc-stat-value">${streak}d</span></div>
        </div>
        <div class="dock-xp-bar">
          <div class="dock-xp-fill" style="width:${xpProgress}%"></div>
          <span class="dock-xp-label">${nextRank ? `${xp.toLocaleString()} / ${nextMinXP.toLocaleString()} XP` : 'MAX RANK'}</span>
        </div>
      </div>
      <div class="dock-prog-section">
        <h3 class="dock-section-title">Achievements (${achievements.length})</h3>
        <div class="dock-achievements">
          ${achievements.length ? achievements.map(a => `<span class="dock-achievement" title="${_esc(a.name)}">${a.icon || '★'}</span>`).join('') : '<p class="text-muted">No achievements yet.</p>'}
        </div>
      </div>
    `;
  }

  /* ═══════════════════════════════════════════════════════════════════
     RADAR / SONAR BACKGROUND CANVAS
  ═══════════════════════════════════════════════════════════════════ */
  let _radarRaf = 0;
  let _radarRo = null;

  function _stopRadar() {
    cancelAnimationFrame(_radarRaf);
    _radarRaf = 0;
    if (_radarRo) { _radarRo.disconnect(); _radarRo = null; }
  }

  function _initRadarCanvas(cvs) {
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

    // Read accent colour from CSS (re-read each frame for theme switches)
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

    // Stars (micro particles)
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

    // Ping blips
    let pings = [];
    let nextPing = 0;

    let _accentFrame = 0;
    function draw(t) {
      if (W < 1 || H < 1) { resize(); _radarRaf = requestAnimationFrame(draw); return; }
      // Re-read accent every ~60 frames (~1s) for theme switches
      if (++_accentFrame % 60 === 0) refreshAccent();
      ctx.clearRect(0, 0, W, H);
      const CX = cx(), CY = cy();
      const maxR = Math.max(W, H) * 0.6;

      // ── Grid ───────────────────────────────
      ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.04)`;
      ctx.lineWidth = 0.5;
      const gridSize = 20;
      for (let x = gridSize; x < W; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = gridSize; y < H; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // ── Concentric rings (sonar) ──────────
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

      // ── Sonar pings (expanding rings) ─────
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
        // blip dot
        if (p.life > 0.8) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${ar},${ag},${ab},${p.life * 0.5})`;
          ctx.fill();
        }
      }

      // ── Micro stars ────────────────────────
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

      // ── Crosshair at centre ────────────────
      const chLen = 8;
      ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.08)`;
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(CX - chLen, CY); ctx.lineTo(CX + chLen, CY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(CX, CY - chLen); ctx.lineTo(CX, CY + chLen); ctx.stroke();

      _radarRaf = requestAnimationFrame(draw);
    }

    _radarRaf = requestAnimationFrame(draw);

    // Handle resize (stored for cleanup)
    _radarRo = new ResizeObserver(() => { resize(); makeStars(); });
    _radarRo.observe(body);
  }

  /* ═══════════════════════════════════════════════════════════════════
     SCHEMATIC (extracted from home.js)
  ═══════════════════════════════════════════════════════════════════ */

  function _renderSchematicWidget() {
    const wrapper = document.getElementById('mc-schematic-widget');
    const container = document.getElementById('mc-schematic');
    if (!container || !wrapper) return;

    const activatedShips = (typeof BlueprintStore !== 'undefined') ? BlueprintStore.getActivatedShips() : [];
    const shipId = _getShipId();
    const activeShip = activatedShips.find(s => s.id === shipId) || activatedShips[0];
    const classId = activeShip ? activeShip.class_id : 'class-1';

    const _bu2 = typeof BlueprintUtils !== 'undefined' ? BlueprintUtils : null;
    const shipClass = _bu2 ? _bu2.getSlotTemplate(activeShip) : (typeof Gamification !== 'undefined'
      ? Gamification.getSpaceshipClass(classId)
      : { id: classId, name: 'Scout', slots: [{ id: 0, label: 'Bridge', maxRarity: 'Rare' }, { id: 1, label: 'Ops', maxRarity: 'Rare' }] });

    const slotMap = _getSlotMap();
    const deployedCount = Object.values(slotMap).filter(Boolean).length;
    const totalSlots = shipClass.slots.length;
    const shipName = activeShip?.name || 'No Ship';

    container.innerHTML = `
      <div class="mc-schematic-header">
        <div class="mc-schematic-ship-info">
          <span class="mc-schematic-ship-name">${_esc(shipName)}</span>
          <span class="mc-schematic-ship-class">${shipClass.name || classId} &middot; ${deployedCount}/${totalSlots} agents</span>
        </div>
      </div>
      <div class="mc-schematic-body" style="position:relative;width:100%;aspect-ratio:3/${shipClass.id === 'class-1' || shipClass.id === 'class-2' ? '1' : shipClass.id === 'class-3' ? '1.5' : '2'}">
        <canvas class="sch-radar-canvas" aria-hidden="true"></canvas>
        ${_renderSchematicSVG(shipClass, slotMap)}
        <div class="mc-schematic-slots">
          ${_renderSchematicSlots(shipClass, slotMap)}
        </div>
      </div>
    `;

    // Start radar background
    _initRadarCanvas(container.querySelector('.sch-radar-canvas'));

    // Undock buttons
    container.querySelectorAll('.mc-slot-undock').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        _removeBlueprintFromSlot(btn.dataset.slotId);
      });
    });

    // Empty slot click — mobile tap-to-assign
    container.querySelectorAll('.mc-slot-empty').forEach(slot => {
      slot.addEventListener('click', () => {
        if (_selectedBpId) {
          _assignBlueprintToSlot(slot.dataset.slotId, _selectedBpId);
          _selectedBpId = null;
        }
      });
    });
  }

  function _renderSchematicSVG(shipClass, slotMap) {
    const classId = shipClass.id;
    const positions = SLOT_POSITIONS[classId] || _generateSlotPositions(shipClass.slots.length);
    const svgH = (classId === 'class-1' || classId === 'class-2') ? 100 : classId === 'class-3' ? 150 : 200;
    const svgCx = 150, svgCy = svgH / 2;
    const yScale = svgH / 100;
    const toSvg = (p) => ({ x: p.x * 3, y: p.y * yScale });

    const hullPoints = positions.map(p => {
      const sp = toSvg(p);
      const dx = sp.x - svgCx, dy = sp.y - svgCy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = (dist + 28) / (dist || 1);
      return `${svgCx + dx * scale},${svgCy + dy * scale}`;
    }).join(' ');

    let gridLines = '';
    for (let i = 15; i <= 285; i += 15) {
      gridLines += `<line x1="${i}" y1="5" x2="${i}" y2="${svgH - 5}" stroke="var(--accent,#fff)" stroke-opacity=".05" stroke-width=".3"/>`;
    }
    for (let i = 10; i <= svgH - 10; i += 10) {
      gridLines += `<line x1="5" y1="${i}" x2="295" y2="${i}" stroke="var(--accent,#fff)" stroke-opacity=".05" stroke-width=".3"/>`;
    }

    let connLines = '';
    let animDots = '';
    let dotIdx = 0;
    const filledCount = Object.values(slotMap).filter(Boolean).length;

    positions.forEach((p, i) => {
      const sp = toSvg(p);
      const filled = !!slotMap[String(i)];
      const pathId = `conn-${i}-core`;
      let opacity = '.08', dash = '2 4', width = '.4';
      if (filled) { opacity = '.8'; dash = 'none'; width = '.25'; }
      connLines += `<path id="${pathId}" d="M${sp.x},${sp.y} L${svgCx},${svgCy}" fill="none" stroke="var(--accent,#fff)" stroke-opacity="${opacity}" stroke-width="${width}" ${dash !== 'none' ? `stroke-dasharray="${dash}"` : ''}/>`;
      if (filled) {
        animDots += `<circle r="2" fill="var(--accent,#fff)" opacity=".8"><animateMotion dur="2.5s" repeatCount="indefinite" begin="${dotIdx * 0.5}s"><mpath href="#${pathId}"/></animateMotion></circle>`;
        animDots += `<circle r="1" fill="var(--accent,#fff)" opacity=".4"><animateMotion dur="3s" repeatCount="indefinite" begin="${dotIdx * 0.5 + 1.2}s" keyPoints="1;0" keyTimes="0;1" calcMode="linear"><mpath href="#${pathId}"/></animateMotion></circle>`;
        dotIdx++;
      }
    });

    let slotNodes = '';
    positions.forEach((p, i) => {
      const sp = toSvg(p);
      if (slotMap[String(i)]) slotNodes += `<circle cx="${sp.x}" cy="${sp.y}" r="3" fill="var(--accent,#fff)" opacity=".2"/>`;
    });

    const reactorR = Math.min(4 + (filledCount * 1), 12);
    const reactorOpacity = Math.min(0.3 + (filledCount / positions.length) * 0.3, 0.6);

    return `
      <svg class="mc-schematic-svg" viewBox="0 0 300 ${svgH}" style="overflow:visible" preserveAspectRatio="xMidYMid meet">
        ${gridLines}
        <polygon points="${hullPoints}" fill="none" stroke="var(--accent,#fff)" stroke-opacity=".05" stroke-width=".3" stroke-dasharray="2 2"/>
        <circle cx="${svgCx}" cy="${svgCy}" r="${reactorR}" fill="var(--accent,#fff)" opacity="${reactorOpacity.toFixed(2)}"/>
        <circle cx="${svgCx}" cy="${svgCy}" r="${Math.min(reactorR * 0.45, 4)}" fill="var(--accent,#fff)" opacity=".9"/>
        ${connLines}
        ${slotNodes}
        ${animDots}
      </svg>`;
  }

  function _renderSchematicSlots(shipClass, slotMap) {
    const classId = shipClass.id;
    const positions = SLOT_POSITIONS[classId] || _generateSlotPositions(shipClass.slots.length);
    const activatedBps = _getActivatedBlueprints();

    return shipClass.slots.map((slot, i) => {
      const pos = positions[i];
      if (!pos) return '';
      const bpId = slotMap[String(slot.id)] || null;
      let bp = bpId ? (BlueprintsView?.SEED?.find(b => b.id === bpId) || null) : null;
      if (!bp && bpId) {
        if (bpId.startsWith('__new__')) {
          const agentName = bpId.replace('__new__', '');
          const _shipId = _getShipId();
          const _ships = (typeof BlueprintStore !== 'undefined') ? BlueprintStore.getActivatedShips() : [];
          const _activeShip = _ships.find(s => s.id === _shipId) || _ships[0];
          const _rawShipId = _activeShip?.id?.startsWith('bp-') ? _activeShip.id.slice(3) : _activeShip?.id;
          const shipBp = _activeShip ? (BlueprintsView?.SPACESHIP_SEED?.find(s => s.id === _rawShipId) || null) : null;
          const nodeData = shipBp?.nodes?.find(n => n.label === agentName);
          bp = { id: bpId, name: agentName, category: nodeData?.config?.agentRole || 'Agent', rarity: nodeData?.rarity || 'Common' };
        }
        if (!bp && typeof BlueprintStore !== 'undefined') bp = BlueprintStore.getAgent(bpId);
        if (!bp) {
          const agent = (State.get('agents') || []).find(r => r.id === bpId);
          if (agent) bp = { id: agent.id, name: agent.name, category: agent.role || agent.category, rarity: agent.rarity || 'Common' };
        }
      }
      const rarity = slot.maxRarity;
      const rarityColor = typeof Gamification !== 'undefined'
        ? (Gamification.RARITY_THRESHOLDS.find(r => r.name === rarity)?.color || '#94a3b8')
        : '#94a3b8';

      if (bp) {
        const bpRarity = _getBpRarity(bp);
        const bpRarityColor = typeof Gamification !== 'undefined'
          ? (Gamification.RARITY_THRESHOLDS.find(r => r.name === bpRarity)?.color || '#94a3b8')
          : '#94a3b8';
        const serial = typeof BlueprintsView !== 'undefined' ? BlueprintsView.serialHash(bp.name) : { code: '000000', speeds: [2] };
        const avatar = typeof BlueprintsView !== 'undefined' ? BlueprintsView.avatarArt(bp.name, bp.category, serial) : '';
        return `
          <div class="mc-slot mc-slot-filled" style="left:${pos.x}%;top:${pos.y}%;border-color:${bpRarityColor}" data-slot-id="${slot.id}" data-max-rarity="${rarity}">
            <button class="mc-slot-undock" data-slot-id="${slot.id}" title="Undock agent">&times;</button>
            <span class="mc-slot-name">${_esc(bp.name)}</span>
            <div class="mc-slot-avatar">${avatar}</div>
            <span class="mc-slot-rarity" style="background:${bpRarityColor}">${bpRarity}</span>
          </div>`;
      } else {
        return `
          <div class="mc-slot mc-slot-empty" style="left:${pos.x}%;top:${pos.y}%" data-slot-id="${slot.id}" data-max-rarity="${rarity}">
            <span class="mc-slot-icon">+</span>
            <span class="mc-slot-label">${_esc(slot.label)}</span>
            <span class="mc-slot-rarity" style="background:${rarityColor}">${rarity}</span>
          </div>`;
      }
    }).join('');
  }

  /* ── Drag & Drop ── */

  function _initSchematicDnD() {
    document.querySelectorAll('.mc-slot').forEach(slot => {
      slot.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (slot.classList.contains('mc-slot-empty') || slot.dataset.bpId) {
          e.dataTransfer.dropEffect = 'copy';
          slot.classList.add('mc-slot-valid');
        }
      });
      slot.addEventListener('dragleave', () => {
        slot.classList.remove('mc-slot-valid', 'mc-slot-invalid');
      });
      slot.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        slot.classList.remove('mc-slot-valid', 'mc-slot-invalid');
        const bpId = e.dataTransfer.getData('application/x-bp-id');
        const bpRarity = e.dataTransfer.getData('application/x-bp-rarity');
        const slotMaxRarity = slot.dataset.maxRarity;
        const slotId = slot.dataset.slotId;
        if (!bpId || !slotId) return;
        if (typeof Gamification !== 'undefined' && !Gamification.canSlotAccept(slotMaxRarity, bpRarity)) {
          slot.classList.add('mc-slot-invalid', 'mc-slot-shake');
          setTimeout(() => slot.classList.remove('mc-slot-invalid', 'mc-slot-shake'), 500);
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Slot Mismatch', message: `${bpRarity} agent requires a ${bpRarity}+ slot`, type: 'error' });
          return;
        }
        _assignBlueprintToSlot(slotId, bpId);
      });
    });
  }

  function _assignBlueprintToSlot(slotId, bpId) {
    const shipId = _getShipId();
    // Enforce one-ship-per-crew: remove agent from any other ship first
    if (shipId && typeof BlueprintStore !== 'undefined' && BlueprintStore.reassignAgentToShip) {
      BlueprintStore.reassignAgentToShip(bpId, shipId);
    }
    const slotMap = _getSlotMap();
    Object.keys(slotMap).forEach(key => { if (slotMap[key] === bpId) delete slotMap[key]; });
    slotMap[slotId] = bpId;
    _saveSlotMap(slotMap);

    if (typeof Gamification !== 'undefined') {
      Gamification.addXP('dock_agent');
      const shipClass = Gamification.getSpaceshipClass(_getShipId());
      const filledCount = Object.values(slotMap).filter(Boolean).length;
      if (filledCount >= shipClass.slots.length) {
        Gamification.unlockAchievement('full-ship');
        Gamification.unlockAchievement('mission-control-setup');
        Gamification.addXP('complete_mission');
      }
      const bp = BlueprintsView?.SEED?.find(b => b.id === bpId);
      if (bp && _getBpRarity(bp) === 'Legendary') Gamification.unlockAchievement('legendary-captain');
      Gamification.unlockAchievement('first-dock-slot');
    }

    if (typeof AuditLog !== 'undefined') {
      const bp2 = BlueprintsView?.SEED?.find(b => b.id === bpId);
      AuditLog.log('agent', { description: `Docked ${bp2?.name || bpId} into schematic slot` });
    }

    // Auto-deploy when all slots filled
    const activatedShips = (typeof BlueprintStore !== 'undefined') ? BlueprintStore.getActivatedShips() : [];
    const activeShip = activatedShips.find(s => s.id === shipId);
    if (activeShip && typeof Gamification !== 'undefined') {
      const sc = Gamification.getSpaceshipClass(activeShip.class_id);
      const allFilled = sc.slots.every(s => slotMap[String(s.id)]);
      if (allFilled && activeShip.status !== 'deployed') {
        // Ships with 12+ slots require Pro plan to deploy
        const crewCount = parseInt(activeShip.stats?.crew, 10) || sc.slots.length;
        if (crewCount >= 12 && typeof Subscription !== 'undefined' && Subscription.getSlotLimit() < 12) {
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Pro Plan Required', message: `${activeShip.name || 'This ship'} requires a Pro plan to deploy. Upgrade to unlock all 12 slots.`, type: 'warning' });
          return;
        }
        _updateShipState(shipId, { status: 'deployed' });
        if (typeof Notify !== 'undefined') Notify.send({ title: 'Spaceship Launched', message: `${activeShip.name || 'Spaceship'} is fully staffed and deployed!`, type: 'fleet_deployed' });
        Gamification.addXP('launch_spaceship');
      }
    }

    _safeRerender();
  }

  function _removeBlueprintFromSlot(slotId) {
    const slotMap = _getSlotMap();
    const bpId = slotMap[slotId];
    delete slotMap[slotId];
    _saveSlotMap(slotMap);

    if (typeof AuditLog !== 'undefined') {
      const bp = bpId ? BlueprintsView?.SEED?.find(b => b.id === bpId) : null;
      AuditLog.log('agent', { description: `Undocked ${bp?.name || bpId} from schematic slot` });
    }

    const shipId = _getShipId();
    const activatedShips = (typeof BlueprintStore !== 'undefined') ? BlueprintStore.getActivatedShips() : [];
    const activeShip = activatedShips.find(s => s.id === shipId);
    if (activeShip && activeShip.status === 'deployed') {
      _updateShipState(shipId, { status: 'docked' });
    }
    _selectedBpId = null;
    _safeRerender();
  }

  function _safeRerender() {
    try {
      _renderSchematicWidget();
      _initSchematicDnD();
    } catch (err) {
      console.error('[Dock] Re-render failed:', err);
    }
  }

  /* ── Ship state helpers (same as home.js) ── */

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
      if (!saved || !saved.slot_assignments) return {};
      const slotMap = { ...saved.slot_assignments };
      let pruned = false;
      for (const [key, bpId] of Object.entries(slotMap)) {
        if (!bpId) continue;
        if (bpId.startsWith('__new__')) continue;
        const exists = _agentExists(bpId);
        if (!exists) { slotMap[key] = null; pruned = true; }
      }
      if (pruned) _updateShipState(shipId, { slot_assignments: slotMap });
      return slotMap;
    }
    return {};
  }

  function _agentExists(bpId) {
    if (!bpId) return false;
    if (BlueprintsView?.SEED?.find(b => b.id === bpId)) return true;
    if (typeof BlueprintStore !== 'undefined' && BlueprintStore.getAgent(bpId)) return true;
    if ((State.get('agents') || []).find(a => a.id === bpId)) return true;
    return false;
  }

  function _saveSlotMap(slotMap) {
    const shipId = _getShipId();
    if (!shipId) return;
    const slot_assignments = {};
    for (const [key, bpId] of Object.entries(slotMap)) {
      if (bpId) slot_assignments[key] = bpId;
    }
    _updateShipState(shipId, { slot_assignments });
  }

  function _updateShipState(shipId, updates) {
    if (!shipId || typeof BlueprintStore === 'undefined') return;
    try {
      const current = BlueprintStore.getShipState(shipId) || {};
      const slot_assignments = updates.slot_assignments || current.slot_assignments || {};
      const agent_ids = Object.values(slot_assignments).filter(Boolean);
      const status = updates.status || current.status || 'standby';
      const class_id = updates.class_id || current.class_id;
      const newState = { slot_assignments, agent_ids, status };
      if (class_id) newState.class_id = class_id;
      BlueprintStore.saveShipState(shipId, newState);
      const spaceships = State.get('spaceships') || [];
      const ship = spaceships.find(s => s.id === shipId);
      if (ship) {
        ship.status = status;
        ship.slot_assignments = slot_assignments;
        ship.agent_ids = agent_ids;
        State.set('spaceships', spaceships);
      }
    } catch (err) {
      console.error('[Dock] Failed to update ship state:', err);
    }
  }

  function _getActivatedBlueprints() {
    try {
      const catalogBps = (typeof BlueprintStore !== 'undefined')
        ? BlueprintStore.getActivatedAgents().map(a => {
            const bp = BlueprintStore.getAgent(a.blueprint_id);
            return bp || a;
          })
        : [];
      const agents = State.get('agents') || [];
      const bpIds = new Set(
        (typeof BlueprintStore !== 'undefined' ? BlueprintStore.getActivatedAgentIds() : []).map(id => 'bp-' + id)
      );
      const customAgents = agents
        .filter(a => (a.source === 'builder' || a.imported_via || a._custom) && !a.blueprint_id && !bpIds.has(a.id))
        .map(a => ({
          id: a.id, name: a.name, category: a.role || 'General', role: a.role || 'General',
          desc: a.type || 'Custom Agent', rarity: a.rarity || 'Rare', config: a.config || {}, _custom: true,
        }));
      return [...catalogBps, ...customAgents];
    } catch { return []; }
  }

  function _getBpRarity(bp) {
    if (bp.rarity) return bp.rarity;
    if (typeof Gamification === 'undefined') return 'Common';
    return Gamification.calcAgentRarity(bp).name;
  }

  const _esc = Utils.esc;

  function _authPrompt(el, viewName) {
    el.innerHTML = `<div class="auth-gate"><h2>Sign in to view ${viewName}</h2><p>Create an account or sign in to access this feature.</p><button class="btn btn-primary" onclick="NICE.openModal('modal-auth')">Sign In</button></div>`;
  }

  function destroy() { _stopRadar(); }

  return { title, render, destroy, renderSchematicSVG: _renderSchematicSVG, getSlotMap: _getSlotMap, getShipId: _getShipId, _initRadar: _initRadarCanvas, _stopRadar };
})();
