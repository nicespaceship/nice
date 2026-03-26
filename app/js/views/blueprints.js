/* ═══════════════════════════════════════════════════════════════════
   NICE — Blueprints
   Browse and manage crew and agent blueprints.
═══════════════════════════════════════════════════════════════════ */

const BlueprintsView = (() => {
  const title = 'Bridge';
  const _esc = Utils.esc;

  const RARITY_COLORS = { Common:'#94a3b8', Rare:'#6366f1', Epic:'#a855f7', Legendary:'#f59e0b', Mythic:'#ff2d55' };

  /* ── Avatar Art Generator (role-colored initials for agent cards) ── */
  const _categoryColors = {
    Research:'#6366f1', Analytics:'#f59e0b', Content:'#ec4899', Engineering:'#06b6d4',
    Ops:'#22c55e', Sales:'#f97316', Support:'#8b5cf6', Legal:'#64748b',
    Marketing:'#e11d48', Automation:'#14b8a6'
  };

  /* ── Deterministic 16-char alphanumeric serial — unique fingerprint per blueprint ── */
  const _SERIAL_CHARS = 'A0B1C2D3E4F5G6H7J8K9LMNPQRSTUVWXYZ';
  function _serialHash(str, len) {
    len = len || 16;
    let h = 0;
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    const chars = [];
    const speeds = [];
    let n = Math.abs(h);
    for (let i = 0; i < len; i++) {
      n = ((n * 9301 + 49297) % 233280);
      const idx = n % _SERIAL_CHARS.length;
      chars.push(_SERIAL_CHARS[idx]);
      const ch = _SERIAL_CHARS[idx];
      speeds.push(ch >= '0' && ch <= '9' ? +ch : (ch.charCodeAt(0) - 65) % 10);
    }
    const raw = chars.join('');
    const code = raw.replace(/(.{4})(?=.)/g, '$1-');
    return { code: code, raw: raw, speeds: speeds };
  }

  function _avatarArt(name, category, serial) {
    const color = _categoryColors[category] || '#6366f1';
    const initials = (name || 'AG').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    if (!serial) serial = _serialHash(name);

    // 10-color spectrum — each dot gets a unique hue
    const dotColors = ['#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6','#6366f1','#a855f7','#ec4899'];

    // 10 orbiting dots — speed from serial character, unique color + varied size
    let dots = '';
    for (let i = 0; i < 10; i++) {
      const spd = serial.speeds[i];
      const dur = 24 - (spd * 2);       // 0→24s (slow), 9→6s (fast)
      const startAngle = i * 36;         // evenly spaced 36° apart
      const r = 1.5 + (spd * 0.15);     // faster dots are slightly bigger (1.5–2.85)
      const dc = dotColors[i];
      // Glow layer (larger, faded) + solid dot
      dots += `<circle cx="100" cy="20" r="${r + 2}" fill="${dc}" opacity="0.2"><animateTransform attributeName="transform" type="rotate" from="${startAngle} 100 60" to="${startAngle + 360} 100 60" dur="${dur}s" repeatCount="indefinite"/></circle>`;
      dots += `<circle cx="100" cy="20" r="${r}" fill="${dc}" opacity="0.85"><animateTransform attributeName="transform" type="rotate" from="${startAngle} 100 60" to="${startAngle + 360} 100 60" dur="${dur}s" repeatCount="indefinite"/></circle>`;
    }

    return `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
      <line x1="0" y1="30" x2="200" y2="30" stroke="${color}" stroke-width="0.5" opacity="0.08"/>
      <line x1="0" y1="60" x2="200" y2="60" stroke="${color}" stroke-width="0.5" opacity="0.08"/>
      <line x1="0" y1="90" x2="200" y2="90" stroke="${color}" stroke-width="0.5" opacity="0.08"/>
      <line x1="50" y1="0" x2="50" y2="120" stroke="${color}" stroke-width="0.5" opacity="0.08"/>
      <line x1="100" y1="0" x2="100" y2="120" stroke="${color}" stroke-width="0.5" opacity="0.08"/>
      <line x1="150" y1="0" x2="150" y2="120" stroke="${color}" stroke-width="0.5" opacity="0.08"/>
      <circle cx="100" cy="60" r="40" fill="none" stroke="${color}" stroke-width="3" opacity="0.18"/>
      ${dots}
      <circle cx="100" cy="60" r="32" fill="${color}" opacity="0.9"/>
      <text x="100" y="60" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="var(--font-h, Inter, sans-serif)" font-size="24" font-weight="700" letter-spacing="1">${initials}</text>
    </svg>`;
  }

  /* ── Spaceship Slot Template (XP-based progression, no fixed classes) ── */
  function _getShipSlots(classId) {
    if (typeof Gamification !== 'undefined') return Gamification.getSlotTemplate();
    return { name: 'Ship', slots: [{max:'Epic',label:'Bridge'},{max:'Rare',label:'Ops'},{max:'Rare',label:'Tactical'},{max:'Rare',label:'Science'},{max:'Rare',label:'Engineering'}] };
  }

  const _SLOT_COLORS = { Common:'#94a3b8', Rare:'#6366f1', Epic:'#a855f7', Legendary:'#f59e0b', Mythic:'#ff2d55' };

  /* ── Ship blueprint lookup (SEED + BlueprintStore for community ships) ── */
  function _findShipBp(id) {
    // SPACESHIP_SEED is defined later but this function is only called at runtime
    const seed = typeof SPACESHIP_SEED !== 'undefined' ? SPACESHIP_SEED : [];
    return seed.find(b => b.id === id)
      || (typeof BlueprintStore !== 'undefined' ? BlueprintStore.getSpaceship(id) : null);
  }

  /* ── Activated card → mission prompt with cap-derived chips ── */
  function _capChips(caps) {
    return caps.map(c => c.replace(/\s+(through|via|across|with|using|by|into|from)\s+.*/i, ''))
      .filter(Boolean).map(c => c.length > 40 ? c.substring(0, 37) + '…' : c).slice(0, 4);
  }

  function _promptShipMission(id) {
    if (typeof PromptPanel === 'undefined') return;
    const bp = _findShipBp(id) || _findShipBp(id.replace(/^bp-/, ''));
    if (!bp) return;
    const chips = _capChips(bp.caps || bp.metadata?.caps || []);
    if (!chips.length) chips.push('Run a mission', 'Check status', 'Generate report');
    PromptPanel.show();
    PromptPanel.prefill('');
    PromptPanel.setSuggestions(chips);
    const input = document.getElementById('nice-ai-input');
    if (input) { input.placeholder = 'Mission for ' + (bp.name || 'Ship') + '…'; input.focus(); }
  }

  function _promptAgentMission(id) {
    if (typeof PromptPanel === 'undefined') return;
    const rawId = id.replace(/^bp-/, '');
    const bp = (typeof BlueprintStore !== 'undefined')
      ? (BlueprintStore.getAgent(id) || BlueprintStore.getAgent(rawId))
      : null;
    if (!bp) return;
    const chips = _capChips(bp.caps || bp.metadata?.caps || bp.config?.tools || []);
    if (!chips.length) chips.push('Run a task', 'Check status', 'Generate report');
    PromptPanel.show();
    PromptPanel.prefill('@' + (bp.name || 'Agent') + ' ');
    PromptPanel.setSuggestions(chips);
    const input = document.getElementById('nice-ai-input');
    if (input) input.focus();
  }

  function _promptActivatedCard(id, type) {
    _closeDrawer();
    if (type === 'spaceship') _promptShipMission(id);
    else _promptAgentMission(id);
  }
  const _NS_LOGO_MINI = '<svg viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg" style="width:1.5em;height:1.5em;vertical-align:-.2em;margin-right:.35em" fill="currentColor"><path d="M962.08,762.91c-3.6,3.81-23,22.39-23.4,25.12s1.65,9.46,1.81,12.8c6.2,134.27-22.47,251.36-96.57,363.41-10.14,15.32-44.07,64.4-57.7,72.3-10.64,6.16-17.08,4.1-26.74-2.68l-205.91-206.08-2.61-1.47c-13.79,3.14-27.33,7.97-41.2,10.78-12.14,2.46-39.23,7.32-50.52,5.02-5.43-1.11-8.8-8.83-13.02-7.63-56.83,48.42-130.21,76.33-203.49,88.59-23.32,3.9-79.67,11.72-100.43,4.99-28.92-9.37-32.15-31.74-31.74-58.17,1.36-87.99,28.47-185.28,80.14-256.85,2.24-3.1,15.39-18.18,15.71-19.38.7-2.69-7.89-8.08-8.8-14.88-1.33-9.98,3.07-34.86,5.18-45.64,2.91-14.86,7.64-29.47,11.6-44.06L6.97,481.35c-6.58-10.16-9.77-14.46-3.86-25.92,4.89-9.48,28.96-27.24,38.49-34.51,113.03-86.2,243.65-127.64,386.44-121.64,5.01.21,23.34,2.94,26.44,1.52,117.49-117.68,260.78-215.29,420.81-265.18,95.99-29.93,217.05-45.19,316.54-29.13,13.03,2.1,32.43,2.67,37.16,16.84,5.97,17.89,9.64,56.02,10.55,75.45,12,255.12-107.2,483.74-277.46,664.12ZM842.3,261.63c-101.28,8.13-152.88,125.4-90.22,205.62,56.08,71.8,169.37,61.28,211.94-18.9,46.73-88.01-22.45-194.69-121.72-186.72ZM276.84,862.98c-1.02-.92-3.11-5.35-5.37-4.22-.87.43-8.43,11.31-9.79,13.25-32.97,47.21-49,105.67-56.19,162.31,1.77,1.77,42.17-6.13,48.04-7.46,31.2-7.03,64.74-18.77,92.63-34.37,4.52-2.53,34.5-21.3,35.27-23.8.34-1.12-.09-2.12-.89-2.92-35.52-32.96-67.86-70.35-103.71-102.79Z"/></svg>';

  const _NS_LOGO_BTN = '<svg viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg" style="width:10px;height:10px;display:block" fill="currentColor"><path d="M962.08,762.91c-3.6,3.81-23,22.39-23.4,25.12s1.65,9.46,1.81,12.8c6.2,134.27-22.47,251.36-96.57,363.41-10.14,15.32-44.07,64.4-57.7,72.3-10.64,6.16-17.08,4.1-26.74-2.68l-205.91-206.08-2.61-1.47c-13.79,3.14-27.33,7.97-41.2,10.78-12.14,2.46-39.23,7.32-50.52,5.02-5.43-1.11-8.8-8.83-13.02-7.63-56.83,48.42-130.21,76.33-203.49,88.59-23.32,3.9-79.67,11.72-100.43,4.99-28.92-9.37-32.15-31.74-31.74-58.17,1.36-87.99,28.47-185.28,80.14-256.85,2.24-3.1,15.39-18.18,15.71-19.38.7-2.69-7.89-8.08-8.8-14.88-1.33-9.98,3.07-34.86,5.18-45.64,2.91-14.86,7.64-29.47,11.6-44.06L6.97,481.35c-6.58-10.16-9.77-14.46-3.86-25.92,4.89-9.48,28.96-27.24,38.49-34.51,113.03-86.2,243.65-127.64,386.44-121.64,5.01.21,23.34,2.94,26.44,1.52,117.49-117.68,260.78-215.29,420.81-265.18,95.99-29.93,217.05-45.19,316.54-29.13,13.03,2.1,32.43,2.67,37.16,16.84,5.97,17.89,9.64,56.02,10.55,75.45,12,255.12-107.2,483.74-277.46,664.12ZM842.3,261.63c-101.28,8.13-152.88,125.4-90.22,205.62,56.08,71.8,169.37,61.28,211.94-18.9,46.73-88.01-22.45-194.69-121.72-186.72ZM276.84,862.98c-1.02-.92-3.11-5.35-5.37-4.22-.87.43-8.43,11.31-9.79,13.25-32.97,47.21-49,105.67-56.19,162.31,1.77,1.77,42.17-6.13,48.04-7.46,31.2-7.03,64.74-18.77,92.63-34.37,4.52-2.53,34.5-21.3,35.27-23.8.34-1.12-.09-2.12-.89-2.92-35.52-32.96-67.86-70.35-103.71-102.79Z"/></svg>';

  const _AGENT_ICON_BTN = '<svg viewBox="0 0 24 24" style="width:12px;height:12px;display:block" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="8" width="10" height="8" rx="2"/><path d="M9 2h6M12 2v6"/><circle cx="9.5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="12" r="1" fill="currentColor" stroke="none"/><path d="M9 16v2M15 16v2M3 12h4M17 12h4"/></svg>';

  /* ── Slot Diagram Art (static slots + neural network dot animation) ── */
  function _slotDiagramArt(classId, serial) {
    const cls = _getShipSlots(classId);
    const slots = cls.slots;
    const n = slots.length;
    if (!serial) serial = _serialHash(classId, 12);

    const cx = 100, cy = 60;

    // Fixed slot positions per layout
    const positions = n === 2
      ? [{x:72,y:60},{x:128,y:60}]
      : n === 3
      ? [{x:100,y:30},{x:60,y:80},{x:140,y:80}]
      : n === 5
      ? [{x:100,y:20},{x:50,y:50},{x:150,y:50},{x:65,y:95},{x:135,y:95}]
      : n === 8
      ? [{x:100,y:15},{x:155,y:30},{x:175,y:65},{x:155,y:95},{x:100,y:108},{x:45,y:95},{x:25,y:65},{x:45,y:30}]
      : n === 12
      ? [{x:100,y:10},{x:140,y:15},{x:170,y:35},{x:180,y:65},{x:170,y:90},{x:140,y:108},{x:100,y:113},{x:60,y:108},{x:30,y:90},{x:20,y:65},{x:30,y:35},{x:60,y:15}]
      : [{x:55,y:35},{x:100,y:35},{x:145,y:35},{x:55,y:85},{x:100,y:85},{x:145,y:85}];

    // Neural network connections between slot pairs
    const conns = n === 2 ? [[0,1]]
      : n === 3 ? [[0,1],[1,2],[0,2]]
      : n === 5 ? [[0,1],[0,2],[1,3],[2,4],[3,4],[1,2]]
      : n === 8 ? [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,0],[0,4],[2,6]]
      : n === 12 ? [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11],[11,0],[0,6],[3,9]]
      : [[0,1],[1,2],[3,4],[4,5],[0,3],[2,5],[1,4]];

    const dotColors = ['#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4',
                       '#3b82f6','#6366f1','#a855f7','#ec4899','#84cc16','#fb923c'];
    const localOrbitR = 18;

    // ── Background grid ──
    let svg = `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
      <line x1="10" y1="20" x2="190" y2="20" stroke="#3b82f6" stroke-width="0.5" opacity="0.1"/>
      <line x1="10" y1="40" x2="190" y2="40" stroke="#3b82f6" stroke-width="0.5" opacity="0.1"/>
      <line x1="10" y1="60" x2="190" y2="60" stroke="#3b82f6" stroke-width="0.5" opacity="0.1"/>
      <line x1="10" y1="80" x2="190" y2="80" stroke="#3b82f6" stroke-width="0.5" opacity="0.1"/>
      <line x1="10" y1="100" x2="190" y2="100" stroke="#3b82f6" stroke-width="0.5" opacity="0.1"/>
      <line x1="30" y1="5" x2="30" y2="115" stroke="#3b82f6" stroke-width="0.5" opacity="0.1"/>
      <line x1="60" y1="5" x2="60" y2="115" stroke="#3b82f6" stroke-width="0.5" opacity="0.1"/>
      <line x1="90" y1="5" x2="90" y2="115" stroke="#3b82f6" stroke-width="0.5" opacity="0.1"/>
      <line x1="120" y1="5" x2="120" y2="115" stroke="#3b82f6" stroke-width="0.5" opacity="0.1"/>
      <line x1="150" y1="5" x2="150" y2="115" stroke="#3b82f6" stroke-width="0.5" opacity="0.1"/>
      <line x1="180" y1="5" x2="180" y2="115" stroke="#3b82f6" stroke-width="0.5" opacity="0.1"/>`;

    // ── Center hub ──
    svg += `<circle cx="${cx}" cy="${cy}" r="5" fill="#3b82f6" opacity="0.3"/>`;

    // ── Neural network connection lines (slot-to-slot) ──
    conns.forEach(pair => {
      const a = positions[pair[0]], b = positions[pair[1]];
      svg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#3b82f6" stroke-width="0.6" opacity="0.1"/>`;
    });

    // ── Spoke lines (hub to each slot) ──
    positions.forEach(p => {
      svg += `<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" stroke="#3b82f6" stroke-width="0.8" opacity="0.12"/>`;
    });

    // ── Static slot circles ──
    slots.forEach((slot, i) => {
      const p = positions[i];
      const color = _SLOT_COLORS[slot.max] || '#6366f1';
      const r = 14;
      svg += `<circle cx="${p.x}" cy="${p.y}" r="${r + 3}" fill="${color}" opacity="0.12"/>`;
      svg += `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="5,3" opacity="0.7"/>`;
      svg += `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${color}" opacity="0.06"/>`;
      svg += `<text x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="central" fill="${color}" font-size="12" font-weight="300" opacity="0.6">+</text>`;
    });

    // ── Local orbit dots (one per slot) ──
    slots.forEach((slot, i) => {
      const p = positions[i];
      const spd = serial.speeds[i] || 0;
      const dur = 20 - (spd * 1.5);
      const dotR = 1.5 + (spd * 0.12);
      const dc = dotColors[i % dotColors.length];
      svg += `<circle cx="${p.x + localOrbitR}" cy="${p.y}" r="${dotR + 1.5}" fill="${dc}" opacity="0.2"><animateTransform attributeName="transform" type="rotate" from="0 ${p.x} ${p.y}" to="360 ${p.x} ${p.y}" dur="${dur}s" repeatCount="indefinite"/></circle>`;
      svg += `<circle cx="${p.x + localOrbitR}" cy="${p.y}" r="${dotR}" fill="${dc}" opacity="0.85"><animateTransform attributeName="transform" type="rotate" from="0 ${p.x} ${p.y}" to="360 ${p.x} ${p.y}" dur="${dur}s" repeatCount="indefinite"/></circle>`;
    });

    // ── Traveling dots between connections (neural data flow) ──
    const travelSpeeds = serial.speeds.slice(n);
    conns.forEach((pair, ci) => {
      const a = positions[pair[0]], b = positions[pair[1]];
      const spd = travelSpeeds[ci % travelSpeeds.length] || 3;
      const dur = 6 + (9 - spd) * 1.2;
      const dotR = 1.2 + (spd * 0.08);
      const dc = dotColors[(ci + n) % dotColors.length];
      const delay = ((ci * 0.7) % dur).toFixed(1);
      svg += `<circle r="${dotR + 1}" fill="${dc}" opacity="0.2"><animate attributeName="cx" values="${a.x};${b.x};${a.x}" dur="${dur}s" begin="${delay}s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1"/><animate attributeName="cy" values="${a.y};${b.y};${a.y}" dur="${dur}s" begin="${delay}s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1"/></circle>`;
      svg += `<circle r="${dotR}" fill="${dc}" opacity="0.7"><animate attributeName="cx" values="${a.x};${b.x};${a.x}" dur="${dur}s" begin="${delay}s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1"/><animate attributeName="cy" values="${a.y};${b.y};${a.y}" dur="${dur}s" begin="${delay}s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1"/></circle>`;
    });

    svg += '</svg>';
    return svg;
  }

  /* All blueprint data comes from Supabase via BlueprintStore */
  const SEED = [];

  /* ── Spaceship data comes from Supabase via BlueprintStore ── */
  const SPACESHIP_SEED = [];

  let _activeTab = 'schematic';
  let _subTab = 'spaceship'; // sub-tab within Blueprints: 'spaceship' or 'agent'
  let _viewMode = localStorage.getItem('nice-bp-view') || 'card';
  if (!['card', 'list', 'compact'].includes(_viewMode)) _viewMode = 'card';
  let _colSort = { key: null, dir: 'asc' }; // column header sort state

  /* ── Paginated catalog search state ── */
  let _currentPage = 1;
  let _totalResults = 0;
  let _isLoading = false;
  let _currentResults = [];
  const _PAGE_SIZE = 24;
  let _searchTimer = null;

  /* ── Drawer / Compare / Hangar state ── */
  let _drawerBpId = null;
  let _drawerBpList = [];
  let _drawerBpIndex = -1;
  let _drawerKeyHandler = null;
  let _compareIds = [];
  let _hangarItems = [];

  function _connCount(bp) {
    return (typeof BlueprintStore !== 'undefined' && BlueprintStore.getConnectedCount)
      ? BlueprintStore.getConnectedCount(bp.id) : 0;
  }

  function render(el, opts) {
    const embedded = opts && opts.embedded;
    const user = State.get('user');
    if (!user) return _authPrompt(el, 'the Blueprints');

    el.innerHTML = `
      <div class="bp-wrap">

        <!-- Type Tabs -->
        <div class="bp-type-tabs" id="bp-type-tabs">
          <button class="bp-type-tab" data-tab="schematic">Schematic</button>
          <button class="bp-type-tab active" data-tab="blueprints">Blueprints</button>
          <button class="bp-type-tab" data-tab="missions">Missions</button>
          <button class="bp-type-tab" data-tab="operations">Operations</button>
          <button class="bp-type-tab" data-tab="log">Log</button>
        </div>

        <!-- Blueprints sub-tabs (Spaceships / Agents) -->
        <div class="bp-sub-tabs" id="bp-sub-tabs">
          <button class="bp-sub-tab active" data-sub="spaceship">Spaceships <span class="bp-tab-count">${(typeof BlueprintStore !== 'undefined' ? BlueprintStore.listSpaceships() : SPACESHIP_SEED).length}</span></button>
          <button class="bp-sub-tab" data-sub="agent">Agents <span class="bp-tab-count">${(typeof BlueprintStore !== 'undefined' ? BlueprintStore.listAgents() : SEED).length}</span></button>
        </div>

        <!-- Log tab content (rendered by LogView sub-modules) -->
        <div id="bp-log-content" style="display:none"></div>

        <!-- Schematic content (rendered by DockView when active) -->
        <div id="bp-schematic-content" style="display:none"></div>


        <div class="bp-search-row">
          <div class="search-box">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-search"/></svg>
            <input type="text" id="bp-search" class="search-input" placeholder="Search by name, description, or tags..." aria-label="Search blueprints" />
          </div>
          <select id="bp-sort" class="filter-select" aria-label="Sort blueprints">
            <option value="popular">Most Popular</option>
            <option value="rating">Highest Rated</option>
            <option value="name">A — Z</option>
            <option value="name-desc">Z — A</option>
            <option value="rarity-desc">Rarity: High → Low</option>
            <option value="rarity-asc">Rarity: Low → High</option>
          </select>
          <div class="bp-rarity-filters" id="bp-rarity-filters" role="group" aria-label="Filter by rarity">
            <button class="bp-rarity-btn active" data-rarity="all" aria-pressed="true">All</button>
            <button class="bp-rarity-btn" data-rarity="Common" aria-pressed="false">Common</button>
            <button class="bp-rarity-btn" data-rarity="Rare" aria-pressed="false">Rare</button>
            <button class="bp-rarity-btn" data-rarity="Epic" aria-pressed="false">Epic</button>
            <button class="bp-rarity-btn" data-rarity="Legendary" aria-pressed="false">Legendary</button>
            <button class="bp-rarity-btn" data-rarity="Mythic" aria-pressed="false">Mythic</button>
          </div>
          <div class="bp-view-toggle" id="bp-view-toggle">
            <button class="bp-view-btn${_viewMode==='card'?' active':''}" data-view="card" title="Card view">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="0" width="6" height="6" rx="1"/><rect x="8" y="0" width="6" height="6" rx="1"/><rect x="0" y="8" width="6" height="6" rx="1"/><rect x="8" y="8" width="6" height="6" rx="1"/></svg>
            </button>
            <button class="bp-view-btn${_viewMode==='list'?' active':''}" data-view="list" title="List view">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="0" width="14" height="3" rx="1"/><rect x="0" y="5.5" width="14" height="3" rx="1"/><rect x="0" y="11" width="14" height="3" rx="1"/></svg>
            </button>
            <button class="bp-view-btn${_viewMode==='compact'?' active':''}" data-view="compact" title="Compact view">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="0" width="4" height="4" rx="1"/><rect x="5" y="0" width="4" height="4" rx="1"/><rect x="10" y="0" width="4" height="4" rx="1"/><rect x="0" y="5" width="4" height="4" rx="1"/><rect x="5" y="5" width="4" height="4" rx="1"/><rect x="10" y="5" width="4" height="4" rx="1"/><rect x="0" y="10" width="4" height="4" rx="1"/><rect x="5" y="10" width="4" height="4" rx="1"/><rect x="10" y="10" width="4" height="4" rx="1"/></svg>
            </button>
          </div>
        </div>

        <div class="bp-result-bar" id="bp-result-bar" aria-live="polite"></div>

        <div id="bp-activated-wrap"></div>

        <div class="tcg-grid bp-view-${_viewMode}" id="bp-grid">
          <!-- rendered by JS -->
        </div>
      </div>

    `;

    // Detect active tab from hash route or query param
    const _hash = (window.location.hash || '').split('?')[0];
    const _hashParams = new URLSearchParams((window.location.hash || '').split('?')[1] || '');
    const _tabParam = _hashParams.get('tab');
    const validTabs = ['schematic', 'blueprints', 'missions', 'operations', 'log'];
    if (_tabParam && validTabs.includes(_tabParam)) _activeTab = _tabParam;
    else if (_tabParam === 'spaceship' || _tabParam === 'agent') { _activeTab = 'blueprints'; _subTab = _tabParam; }
    else if (_hash === '#/agents' || _hash === '#/bridge/agents') { _activeTab = 'blueprints'; _subTab = 'agent'; }
    else if (_hash === '#/spaceships' || _hash === '#/bridge/spaceships') { _activeTab = 'blueprints'; _subTab = 'spaceship'; }
    else if (_hash === '#/log') _activeTab = 'missions';
    else _activeTab = 'schematic';

    // Highlight the correct tab + sub-tab buttons
    document.querySelectorAll('.bp-type-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.bp-type-tab[data-tab="${_activeTab}"]`)?.classList.add('active');
    document.querySelectorAll('.bp-sub-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.bp-sub-tab[data-sub="${_subTab}"]`)?.classList.add('active');

    // Show/hide sections based on active tab
    _toggleSchematicView();

    _bindEvents();
    if (_activeTab === 'blueprints') _applyFilters(); // async — renders activated section + paginated grid
    _loadCommunityBlueprints();
    _handleDeepLink();
  }

  function _getUserRatings() {
    try { return JSON.parse(localStorage.getItem('nice-bp-ratings') || '{}'); } catch(e) { return {}; }
  }

  function _showPreview(bpId) {
    _openDrawer(bpId);
  }

  function _tcgCardHTML(bp, type) {
    const CR = typeof CardRenderer !== 'undefined' ? CardRenderer : null;
    const _sh = CR ? CR.serialHash : _serialHash;
    const _aa = CR ? CR.avatarArt : _avatarArt;
    const _sda = CR ? CR.slotDiagramArt : _slotDiagramArt;
    const _RC = CR ? CR.RARITY_COLORS : RARITY_COLORS;

    if (type === 'skin') {
      const serial = _sh(bp.id || bp.name, 15);
      const owned = typeof Skin !== 'undefined' && Skin.ownsSkin(bp.id);
      const isActive = typeof Skin !== 'undefined' && Skin.activeSkin()?.id === bp.id;
      const _pa = CR ? CR.paletteArt : null;
      const marqueeText = _esc(bp.description || bp.flavor);
      const priceFmt = bp.price ? '$' + (bp.price / 100).toFixed(2) : 'FREE';
      const isFree = !bp.price;
      const _toggleHTML = (on, id, cls) => `<button class="bp-toggle-switch ${cls}${on ? ' on' : ''}" data-id="${id}"><span class="toggle-track"><span class="toggle-knob"></span></span></button>`;
      const actionBtn = (owned || isFree)
        ? _toggleHTML(isActive, bp.id, 'bp-skin-btn')
        : `<button class="c-btn bp-skin-btn bp-purchase" data-id="${bp.id}">Buy ${priceFmt}</button>`;
      const previewBtn = !isActive ? `<button class="c-btn bp-skin-preview-btn" data-id="${bp.id}">Preview</button>` : '';
      const copyPreview = bp.copy?.nav ? Object.entries(bp.copy.nav).slice(0, 4).map(([k,v]) => `<p class="tcg-cap" style="font-size:10px;opacity:0.7">${k} → ${_esc(v)}</p>`).join('') : '';
      return `<div class="tcg-card bp-card-clickable skin-card" data-id="${bp.id}" data-type="skin" data-tags="${(bp.tags||[]).join(',')}">
        <div class="tcg-name-bar"><span class="tcg-name">${_esc(bp.name)}</span><span class="tcg-rarity" style="color:#f59e0b">LEGENDARY</span></div>
        <div class="tcg-art"><div class="tcg-art-serial" title="Serial: ${serial.code}"><span class="tcg-serial-code">${serial.code}</span></div><div class="tcg-art-class"><span class="tcg-serial-code" style="color:#f59e0b;border:1px solid #f59e0b">SKIN</span></div>${_pa(bp.name, bp.preview_colors || ['#080808','#ffffff','#888'], serial)}</div>
        <div class="tcg-marquee"><div class="tcg-marquee-track"><span>${marqueeText}</span><span>${marqueeText}</span></div></div>
        <div class="tcg-text-box"><p class="tcg-flavor">"${_esc(bp.flavor)}"</p>${copyPreview}</div>
        <div class="tcg-stats"><div class="tcg-stat"><span class="tcg-stat-val">${Object.keys(bp.copy?.nav || {}).length}</span><span class="tcg-stat-lbl">LABELS</span></div><div class="tcg-stat"><span class="tcg-stat-val">${(bp.copy?.ranks || []).length}</span><span class="tcg-stat-lbl">RANKS</span></div><div class="tcg-stat"><span class="tcg-stat-val">${bp.effect ? '1' : '0'}</span><span class="tcg-stat-lbl">FX</span></div><div class="tcg-stat"><span class="tcg-stat-val">${priceFmt}</span><span class="tcg-stat-lbl">COST</span></div></div>
        <div class="tcg-actions">${previewBtn}${actionBtn}</div>
      </div>`;
    }


    if (type === 'spaceship') {
      const serial = _sh(bp.id || bp.name, 12);
      const isShipActivated = bp._forceActive || BlueprintStore.isShipActivated(bp.id);
      const deployBtn = `<button class="c-btn bp-deploy-ship-btn${isShipActivated ? ' bp-activated' : ''}" data-id="${bp.id}">${isShipActivated ? 'Deployed' : 'Deploy'}</button>`;
      const rendered = CR.render('spaceship', 'full', bp, { clickClass: 'bp-card-clickable' });
      return `<div class="bp-card-wrap">${rendered}<div class="bp-card-buttons">${deployBtn}</div></div>`;
    }

    // ── Agent Blueprint Card ──
    const serial = _sh(bp.id || bp.name);
    const rarityColor = (_RC || RARITY_COLORS)[bp.rarity || 'Common'] || '#94a3b8';

    // Integration connect button
    const integrationId = bp.integration || null;
    let connectBtn = '';
    if (integrationId) {
      const intList = State.get('connectors') || [];
      const integ = intList.find(i => i.id === integrationId);
      const isConn = integ?.status === 'connected';
      connectBtn = `<button class="c-btn bp-connect-btn ${isConn ? 'connected' : ''}" data-id="${bp.id}" data-integration="${integrationId}">${isConn ? '&#10003; Connected' : '&#9741; Connect'}</button>`;
    }

    const rendered = CR.render('agent', 'full', bp, { clickClass: 'bp-card-clickable' });
    return `<div class="bp-card-wrap">${rendered}${connectBtn ? `<div class="bp-card-buttons">${connectBtn}</div>` : ''}</div>`;
  }

  /* ── List-row renderer (horizontal row with key info) ── */
  function _listRowHTML(bp, type) {
    const _RC = (typeof CardRenderer !== 'undefined' && CardRenderer.RARITY_COLORS) ? CardRenderer.RARITY_COLORS : RARITY_COLORS;
    const rarity = (bp.rarity || 'Common').toLowerCase();
    let dotColor, dotLabel;

    if (type === 'spaceship') {
      dotColor = _RC[bp.rarity || 'Common'] || _RC.Common;
      dotLabel = { common:'C', rare:'R', epic:'E', legendary:'L', mythic:'M' }[rarity] || 'C';
    } else {
      dotColor = _RC[bp.rarity || 'Common'] || _RC.Common;
      dotLabel = { common:'C', rare:'R', epic:'E', legendary:'L' }[rarity] || 'C';
    }
    const cat = bp.category || '';
    const name = _esc(bp.name);
    const desc = _esc(bp.description || bp.flavor || bp.desc || '');
    const connCount = (typeof BlueprintStore !== 'undefined' && BlueprintStore.getConnectedCount)
      ? BlueprintStore.getConnectedCount(bp.id) : 0;
    const dlVal = connCount > 0 ? connCount : (bp.downloads || 0);
    const dl = dlVal > 0 ? dlVal.toLocaleString() : '—';
    const rating = bp.rating ? '★ ' + bp.rating : '—';
    const tags = (bp.tags || []).slice(0, 3).join(', ');

    // Type-specific stats (3 separate columns)
    let stat1 = '', stat2 = '', stat3 = '';
    if (type === 'agent') {
      const s = bp.stats || {};
      stat1 = s.spd || '—'; stat2 = s.acc || '—'; stat3 = s.pwr || '—';
    } else if (type === 'spaceship') {
      const s = bp.stats || {};
      stat1 = s.slots || '—'; stat2 = String(bp.activation_count || s.deployments || 0); stat3 = '';
    }

    // Determine activation state (not used for agents — no activate feature on crew cards)
    let isActivated = bp._forceActive || false;
    if (!isActivated && typeof BlueprintStore !== 'undefined') {
      if (type === 'spaceship') isActivated = BlueprintStore.isShipActivated(bp.id);
    }
    const actLabel = isActivated ? 'Deployed' : 'Deploy';
    const actClass = isActivated ? ' bpl-activated' : '';
    const showAction = type !== 'agent';

    return `<div class="bpl-row bp-card-clickable" data-id="${bp.id}" data-type="${type}" data-rarity="${rarity}" data-tags="${(bp.tags||[]).join(',')}">
      <span class="bpl-rarity" style="background:${dotColor}">${dotLabel}</span>
      <span class="bpl-name">${name}</span>
      <span class="bpl-cat">${cat}</span>
      <span class="bpl-desc">${desc}</span>
      <span class="bpl-stat1">${stat1}</span>
      <span class="bpl-stat2">${stat2}</span>
      <span class="bpl-stat3">${stat3}</span>
      <span class="bpl-rating">${rating}</span>
      <span class="bpl-dl">${dl}</span>
      <span></span>
      ${showAction
        ? `<span class="bpl-action"><button class="bpl-action-btn${actClass}" data-id="${bp.id}" data-type="${type}">${actLabel}</button></span>`
        : '<span></span>'}
    </div>`;
  }

  function _renderGrid(blueprints) {
    const grid = document.getElementById('bp-grid');
    if (!grid) return;

    // Update grid class for view mode
    grid.className = 'tcg-grid bp-view-' + _viewMode;

    if (!blueprints.length) {
      grid.className = 'tcg-grid bp-view-empty';
      grid.innerHTML = `
        <div class="app-empty">
          <svg class="app-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <h2>No Blueprints Found</h2>
          <p>Try adjusting your filters or search terms.</p>
          <div class="app-empty-acts">
            <button class="btn btn-sm bp-empty-clear">Clear Filters</button>
          </div>
        </div>`;
      grid.querySelector('.bp-empty-clear')?.addEventListener('click', () => {
        const searchEl = document.getElementById('bp-search');
        if (searchEl) searchEl.value = '';
        document.querySelectorAll('.bp-rarity-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
        const allBtn = document.querySelector('.bp-rarity-btn[data-rarity="all"]');
        if (allBtn) { allBtn.classList.add('active'); allBtn.setAttribute('aria-pressed', 'true'); }
        _applyFilters();
      });
      return;
    }

    if (_viewMode === 'list') {
      let sh1 = 'Spd', sh2 = 'Acc', sh3 = 'Pwr';
      if (_subTab === 'spaceship') { sh1 = 'Slots'; sh2 = 'Deploys'; sh3 = ''; }
      const _si = (key) => _colSort.key === key ? (_colSort.dir === 'asc' ? ' ▲' : ' ▼') : '';
      const header = `<div class="bpl-row bpl-header">
        <span class="bpl-rarity"></span>
        <span class="bpl-name bpl-sortable" data-sort="name">Name${_si('name')}</span>
        <span class="bpl-cat bpl-sortable" data-sort="category">Category${_si('category')}</span>
        <span class="bpl-desc">Description</span>
        <span class="bpl-stat1 bpl-sortable" data-sort="stat1">${sh1}${_si('stat1')}</span>
        <span class="bpl-stat2 bpl-sortable" data-sort="stat2">${sh2}${_si('stat2')}</span>
        <span class="bpl-stat3">${sh3}</span>
        <span class="bpl-rating bpl-sortable" data-sort="rating">Rating${_si('rating')}</span>
        <span class="bpl-dl bpl-sortable" data-sort="connected">Connected${_si('connected')}</span>
        <span></span>
        <span class="bpl-action"></span>
      </div>`;
      grid.innerHTML = header + blueprints.map(bp => _listRowHTML(bp, bp.type || _activeTab)).join('');
    } else {
      grid.innerHTML = blueprints.map(bp => _tcgCardHTML(bp, bp.type || _activeTab)).join('');
    }
    _bindCardEvents(grid);
  }

  /* ── Shared event binding for card containers ── */
  function _bindCardEvents(container) {
    // Column header sort clicks
    container.querySelectorAll('.bpl-sortable').forEach(hdr => {
      hdr.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = hdr.dataset.sort;
        if (_colSort.key === key) {
          _colSort.dir = _colSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          _colSort.key = key;
          _colSort.dir = (key === 'name' || key === 'category') ? 'asc' : 'desc';
        }
        _applyFilters();
      });
    });

    // Deployed → Remove on hover for spaceship deployed buttons
    container.querySelectorAll('.bp-deploy-ship-btn.bp-activated').forEach(btn => {
      btn.addEventListener('mouseenter', () => { btn.textContent = 'Remove'; });
      btn.addEventListener('mouseleave', () => { btn.textContent = 'Deployed'; });
    });

    // Activate/Deactivate spaceship buttons → open setup wizard
    container.querySelectorAll('.bp-deploy-ship-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (BlueprintStore.isShipActivated(id)) {
          const bp = _findShipBp(id);
          confirmDeactivate(bp?.name || 'this spaceship', () => {
            BlueprintStore.deactivateShip(id);
            if (typeof Notify !== 'undefined' && bp) Notify.send({ title: 'Spaceship Removed', message: `${bp.name} has been removed.`, type: 'info' });
            _applyFilters();
          });
        } else {
          const bp = _findShipBp(id);
          if (bp && typeof ShipSetupWizard !== 'undefined') {
            ShipSetupWizard.open(bp, { onComplete: () => _applyFilters() });
          } else {
            BlueprintStore.activateShip(id);
            if (typeof Gamification !== 'undefined') Gamification.addXP('activate_blueprint');
            _applyFilters();
          }
        }
      });
    });

    // NICE prompt buttons — mission prompt with cap-derived chips
    container.querySelectorAll('.bp-nice-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        _promptActivatedCard(btn.dataset.id, btn.dataset.type || 'agent');
      });
    });

    // Connect integration buttons
    container.querySelectorAll('.bp-connect-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        _toggleIntegration(btn.dataset.id, btn.dataset.integration, btn);
      });
    });

    // Skin activate/purchase buttons
    container.querySelectorAll('.bp-skin-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (typeof Skin === 'undefined') return;
        if (Skin.activeSkin()?.id === id) {
          // Deactivate
          Skin.deactivate();
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Skin Off', message: 'Restored default appearance.', type: 'info' });
          _applyFilters();
        } else if (Skin.ownsSkin(id)) {
          // Activate owned skin
          Skin.activate(id);
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Skin On', message: Skin.getPack(id)?.name + ' applied!', type: 'task_complete' });
          if (typeof Gamification !== 'undefined') Gamification.addXP('install_blueprint');
        } else {
          // Purchase
          Skin.purchaseSkin(id);
          Skin.activate(id);
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Skin Purchased', message: Skin.getPack(id)?.name + ' is now yours!', type: 'task_complete' });
          if (typeof Gamification !== 'undefined') Gamification.addXP('install_blueprint');
        }
        _applyFilters();
      });
    });

    // Skin preview buttons
    container.querySelectorAll('.bp-skin-preview-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (typeof Skin !== 'undefined') {
          Skin.activate(id);
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Skin Preview', message: 'Previewing ' + (Skin.getPack(id)?.name || id) + '. Navigate around to see changes.', type: 'info' });
          _applyFilters();
        }
      });
    });

    // Deployed → Remove on hover for list view spaceship buttons
    container.querySelectorAll('.bpl-action-btn.bpl-activated').forEach(btn => {
      if (btn.dataset.type === 'spaceship') {
        btn.addEventListener('mouseenter', () => { btn.textContent = 'Remove'; });
        btn.addEventListener('mouseleave', () => { btn.textContent = 'Deployed'; });
      }
    });

    // List view activate/deactivate buttons
    container.querySelectorAll('.bpl-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const type = btn.dataset.type;
        if (type === 'spaceship') {
          if (BlueprintStore.isShipActivated(id)) {
            const bp = BlueprintStore.getSpaceship(id);
            confirmDeactivate(bp?.name || 'this spaceship', () => {
              BlueprintStore.deactivateShip(id);
              if (typeof Notify !== 'undefined' && bp) Notify.send({ title: 'Spaceship Removed', message: `${bp.name} has been removed.`, type: 'info' });
              _applyFilters();
            });
          } else {
            const bp = _findShipBp(id);
            if (bp && typeof ShipSetupWizard !== 'undefined') {
              ShipSetupWizard.open(bp, { onComplete: () => _applyFilters() });
            }
          }
        } else if (type === 'skin') {
          if (typeof Skin === 'undefined') return;
          if (Skin.activeSkin()?.id === id) {
            Skin.deactivate();
            if (typeof Notify !== 'undefined') Notify.send({ title: 'Skin Off', message: 'Restored default appearance.', type: 'info' });
          } else {
            if (!Skin.ownsSkin(id) && Skin.getPack(id)?.price) {
              Skin.purchaseSkin(id);
            }
            Skin.activate(id);
            if (typeof Notify !== 'undefined') Notify.send({ title: 'Skin On', message: (Skin.getPack(id)?.name || id) + ' applied!', type: 'task_complete' });
            if (typeof Gamification !== 'undefined') Gamification.addXP('install_blueprint');
          }
          _applyFilters();
        }
      });
    });

    // Card click → open drawer for ALL types, shift+click → compare mode
    // Activated spaceships → mission prompt instead of drawer
    container.querySelectorAll('.bp-card-clickable').forEach(card => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', (e) => {
        if (e.target.closest('.bp-deploy-btn') || e.target.closest('.bp-nice-btn') || e.target.closest('.bp-configure-btn') || e.target.closest('.bp-contact-btn') || e.target.closest('.bp-connect-btn') || e.target.closest('.bp-skin-btn') || e.target.closest('.bp-skin-preview-btn') || e.target.closest('.bpl-action-btn') || e.target.closest('.bp-hangar-add-btn')) return;
        const id = card.dataset.id;
        if (e.shiftKey) {
          _toggleCompare(id);
        } else if (card.closest('.bp-activated-section') && typeof PromptPanel !== 'undefined') {
          _promptActivatedCard(id, card.dataset.type || 'agent');
        } else {
          _openDrawer(id);
        }
      });
    });

    // Hangar add buttons
    container.querySelectorAll('.bp-hangar-add-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        _addToHangar(btn.dataset.id, btn.dataset.type);
        btn.textContent = '✓';
        btn.disabled = true;
      });
    });
  }

  function _renderStars(rating) {
    const full = Math.floor(rating);
    const half = rating - full >= 0.5;
    let s = '';
    for (let i = 0; i < full; i++) s += '<span class="bp-star filled">★</span>';
    if (half) s += '<span class="bp-star half">★</span>';
    for (let i = full + (half ? 1 : 0); i < 5; i++) s += '<span class="bp-star">★</span>';
    return s;
  }

  function _formatNum(n) {
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  async function _deploy(bpId) {
    const bp = SEED.find(b => b.id === bpId) || SPACESHIP_SEED.find(b => b.id === bpId) || _remoteBlueprints.find(b => b.id === bpId);
    if (!bp) return;

    // Local-first: track activation in localStorage regardless of Supabase
    BlueprintStore.activateAgent(bpId);
    if (typeof Gamification !== 'undefined') Gamification.addXP('activate_blueprint');
    if (typeof Notify !== 'undefined') {
      Notify.send({ title: 'Agent Added', message: `${bp.name} has been added.`, type: 'task_complete' });
    }

    // Add to local agents state so it appears on the Agents page
    const agents = State.get('agents') || [];
    if (!agents.find(r => r.id === 'bp-' + bpId)) {
      agents.push({
        id: 'bp-' + bpId,
        name: bp.name,
        role: bp.config?.role || bp.category || 'General',
        status: 'idle',
        llm_engine: bp.config?.llm_engine || 'claude-4',
        type: bp.config?.type || 'Specialist',
        config: { tools: bp.config?.tools || [], temperature: 0.7, memory: true },
        created_at: new Date().toISOString(),
        blueprint_id: bpId,
        // Carry over blueprint display data so TCG cards render fully
        rarity: bp.rarity,
        category: bp.category,
        caps: bp.caps,
        flavor: bp.flavor,
        desc: bp.desc || bp.description,
        description: bp.description || bp.desc,
        tags: bp.tags,
        stats: bp.stats,
      });
      State.set('agents', agents);
    }

    // Best-effort Supabase sync (non-blocking) — capture UUID for mission assignment
    const user = State.get('user');
    if (user && typeof SB !== 'undefined') {
      try {
        const created = await SB.db('user_agents').create({
          user_id:    user.id,
          name:       bp.name,
          role:       bp.config.role,
          type:       bp.config.type,
          status:     'idle',
          llm_engine: bp.config.llm_engine,
          config:     { tools: bp.config.tools, temperature: 0.7, memory: true },
        });
        // Store the Supabase UUID so missions can reference this agent
        if (created && created.id && typeof BlueprintStore !== 'undefined') {
          BlueprintStore.setAgentUuid('bp-' + bpId, created.id);
        }
      } catch (e) { console.warn('Blueprint sync to cloud skipped:', e.message); }

      // Bump download count if remote
      if (!bp.id.startsWith('bp-')) {
        SB.db('agent_blueprints').update(bp.id, { downloads: (bp.downloads || 0) + 1 }).catch(() => {});
      }
    }

    // Stay on blueprints page — refresh cards to show activated state

    _applyFilters();
  }

  let _remoteBlueprints = [];
  async function _loadRemote() {
    try {
      // Use BlueprintStore if available (already handles DB + seed merge)
      if (typeof BlueprintStore !== 'undefined' && BlueprintStore.isReady()) {
        _remoteBlueprints = BlueprintStore.listAgents();
        _applyFilters();
        return;
      }
      const remote = await SB.db('agent_blueprints').list().catch(() => []);
      if (remote && remote.length) {
        _remoteBlueprints = remote;
        _applyFilters();
      }
    } catch (e) { /* seed data is enough */ }
  }

  function _getAllBlueprints() {

    if (_subTab === 'spaceship') {
      return (typeof BlueprintStore !== 'undefined') ? BlueprintStore.listSpaceships() : [...SPACESHIP_SEED];
    }
    if (_remoteBlueprints.length) {
      const ids = new Set(_remoteBlueprints.map(b => b.id));
      return [..._remoteBlueprints, ...SEED.filter(b => !ids.has(b.id))];
    }
    return (typeof BlueprintStore !== 'undefined') ? BlueprintStore.listAgents() : [...SEED];
  }

  function _updateRarityFilters() {
    const el = document.getElementById('bp-rarity-filters');
    if (!el) return;
    el.style.display = 'flex';
    let buttons;
    buttons = [
      { val: 'all', label: 'All' },
      { val: 'Common', label: 'Common' },
      { val: 'Rare', label: 'Rare' },
      { val: 'Epic', label: 'Epic' },
      { val: 'Legendary', label: 'Legendary' },
      { val: 'Mythic', label: 'Mythic' },
    ];
    el.innerHTML = buttons.map((b, i) =>
      `<button class="bp-rarity-btn${i === 0 ? ' active' : ''}" data-rarity="${b.val}" aria-pressed="${i === 0 ? 'true' : 'false'}">${b.label}</button>`
    ).join('');
  }

  /* ── Activated Items Section (top of each tab) ── */
  function _renderActivatedSection() {
    const wrap = document.getElementById('bp-activated-wrap');
    if (!wrap) return;
    if (typeof BlueprintStore === 'undefined') { wrap.innerHTML = ''; return; }

    let type, label, activated;
    if (_subTab === 'agent') {
      type = 'agent'; label = 'AGENTS';
      activated = BlueprintStore.getActivatedAgents ? BlueprintStore.getActivatedAgents() : [];
    } else if (_subTab === 'spaceship') {
      type = 'spaceship'; label = 'SPACESHIPS';
      activated = BlueprintStore.getActivatedShips ? BlueprintStore.getActivatedShips() : [];

    } else {
      wrap.innerHTML = ''; return;
    }

    if (!activated.length) {
      const emptyMsg = `No ${label.toLowerCase()} deployed yet. Browse below.`;
      wrap.innerHTML = `<div class="bp-activated-section"><p class="bp-activated-empty">${emptyMsg}</p></div><div class="bp-section-divider"></div>`;
      return;
    }

    // Merge instance data with blueprint — blueprint fields (rarity, name, etc.) take priority
    let items = activated.map(a => {
      const getter = type === 'agent' ? BlueprintStore.getAgent : BlueprintStore.getSpaceship;
      const fullBp = getter ? getter(a.id || a.blueprint_id) : null;
      return Object.assign({}, a, fullBp || {}, { type, _forceActive: true, id: a.id || (fullBp && fullBp.id) });
    });

    // Apply same filters as the main grid
    const q = (document.getElementById('bp-search')?.value || '').toLowerCase();
    if (q) {
      items = items.filter(b => {
        const name = (b.name || '').toLowerCase();
        const desc = (b.description || b.desc || '').toLowerCase();
        const tags = (b.tags || []).join(' ').toLowerCase();
        return name.includes(q) || desc.includes(q) || tags.includes(q);
      });
    }
    const rarityBtn = document.querySelector('.bp-rarity-btn.active');
    const rarity = rarityBtn?.dataset.rarity || 'all';
    if (rarity !== 'all') {
      if (type === 'spaceship') items = items.filter(b => b.recommended_class === rarity);
      else items = items.filter(b => (b.rarity || 'Common') === rarity);
    }

    // Hide section if all activated items are filtered out
    if (!items.length) {
      wrap.innerHTML = '';
      return;
    }

    let cardsHTML;
    if (_viewMode === 'list') {
      let sh1 = 'Spd', sh2 = 'Acc', sh3 = 'Pwr';
      if (type === 'spaceship') { sh1 = 'Slots'; sh2 = 'Deploys'; sh3 = ''; }
      const header = `<div class="bpl-row bpl-header">
        <span class="bpl-rarity"></span><span class="bpl-name">Name</span><span class="bpl-cat">Category</span>
        <span class="bpl-desc">Description</span><span class="bpl-stat1">${sh1}</span><span class="bpl-stat2">${sh2}</span>
        <span class="bpl-stat3">${sh3}</span><span class="bpl-rating">Rating</span><span class="bpl-dl">Connected</span>
        <span></span><span class="bpl-action"></span></div>`;
      cardsHTML = header + items.map(bp => _listRowHTML(bp, type)).join('');
    } else {
      cardsHTML = items.map(bp => _tcgCardHTML(bp, type)).join('');
    }

    const totalCount = activated.length;
    const countLabel = items.length < totalCount ? `${items.length}/${totalCount}` : `${totalCount}`;
    wrap.innerHTML = `<div class="bp-activated-section">
      <h3 class="bp-activated-title">YOUR ${label} <span class="bp-activated-count">${countLabel}</span></h3>
      <div class="bp-activated-grid tcg-grid bp-view-${_viewMode}">${cardsHTML}</div>
    </div><div class="bp-section-divider"></div>`;

    // Bind events for the activated section cards
    const section = wrap.querySelector('.bp-activated-grid');
    if (section) _bindCardEvents(section);
  }

  async function _applyFilters(append) {
    if (_isLoading) return;

    // Reset pagination when not appending
    if (!append) {
      _currentPage = 1;
      _currentResults = [];
    }

    const q = (document.getElementById('bp-search')?.value || '').trim();
    const sort = document.getElementById('bp-sort')?.value || 'popular';
    const rarityBtn = document.querySelector('.bp-rarity-btn.active');
    const rarity = rarityBtn?.dataset.rarity || 'all';

    // Activated section is always client-side (small dataset)
    _renderActivatedSection();

    // Show loading state
    _isLoading = true;
    _showLoadingState(append);

    try {
      const result = await BlueprintStore.searchCatalog({
        type: _subTab === 'spaceship' ? 'spaceship' : 'agent',
        query: q,
        rarity: rarity !== 'all' ? rarity : null,
        sort: sort,
        page: _currentPage,
        perPage: _PAGE_SIZE,
      });

      if (append) {
        _currentResults = _currentResults.concat(result.results);
      } else {
        _currentResults = result.results;
      }
      _totalResults = result.total;

      // Column header sort override (list view only, client-side on current page)
      if (_colSort.key && _viewMode === 'list') {
        _sortByColumn(_currentResults);
      }

      // Update result bar
      _updateResultBar(q, rarity);

      // Update tab count badge
      if (!q && rarity === 'all') {
        const countEl = document.querySelector(`.bp-type-tab[data-tab="${_activeTab}"] .bp-tab-count`);
        if (countEl) countEl.textContent = _totalResults;
      }

      _renderGrid(_currentResults);
      _renderLoadMore();

    } catch (err) {
      console.warn('[Blueprints] Search failed, falling back to local:', err);
      _applyFiltersLocal();
    } finally {
      _isLoading = false;
    }
  }

  /** Offline / fallback: filter in-memory seeds (original logic) */
  function _applyFiltersLocal() {
    const q = (document.getElementById('bp-search')?.value || '').toLowerCase();
    const sort = document.getElementById('bp-sort')?.value || 'popular';

    let list = _getAllBlueprints();
    if (q) {
      list = list.filter(b => {
        const name = (b.name || '').toLowerCase();
        const desc = (b.description || b.desc || '').toLowerCase();
        const tags = (b.tags || []).join(' ').toLowerCase();
        return name.includes(q) || desc.includes(q) || tags.includes(q);
      });
    }

    const rarityBtn = document.querySelector('.bp-rarity-btn.active');
    const rarity = rarityBtn?.dataset.rarity || 'all';
    if (rarity !== 'all') {
      if (_subTab === 'spaceship') list = list.filter(b => b.recommended_class === rarity);
      else list = list.filter(b => (b.rarity || 'Common') === rarity);
    }

    if (sort === 'popular') {
      if (_subTab === 'spaceship') {
        list.sort((a, b) => (parseInt(b.stats?.crew, 10) || 0) - (parseInt(a.stats?.crew, 10) || 0));
      } else {
        list.sort((a, b) => (_connCount(b) || b.downloads || 0) - (_connCount(a) || a.downloads || 0));
      }
    } else if (sort === 'rating') {
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sort === 'name-desc') {
      list.sort((a, b) => b.name.localeCompare(a.name));
    } else if (sort === 'rarity-desc') {
      const ro = { Mythic: 5, Legendary: 4, Epic: 3, Rare: 2, Common: 1 };
      list.sort((a, b) => (ro[b.rarity] || 0) - (ro[a.rarity] || 0));
    } else if (sort === 'rarity-asc') {
      const ro = { Mythic: 5, Legendary: 4, Epic: 3, Rare: 2, Common: 1 };
      list.sort((a, b) => (ro[a.rarity] || 0) - (ro[b.rarity] || 0));
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (_colSort.key && _viewMode === 'list') _sortByColumn(list);

    _updateResultBar(q, rarity);
    _renderActivatedSection();
    _currentResults = list;
    _totalResults = list.length;
    _renderGrid(list);

    // Remove load-more for local mode (all results shown)
    const lm = document.getElementById('bp-load-more');
    if (lm) lm.innerHTML = '';
  }

  /** Column header sort (client-side on current page of results) */
  function _sortByColumn(list) {
    const dir = _colSort.dir === 'asc' ? 1 : -1;
    const k = _colSort.key;
    list.sort((a, b) => {
      let va, vb;
      if (k === 'name') { va = (a.name || '').toLowerCase(); vb = (b.name || '').toLowerCase(); return dir * va.localeCompare(vb); }
      if (k === 'category') { va = (a.category || '').toLowerCase(); vb = (b.category || '').toLowerCase(); return dir * va.localeCompare(vb); }
      if (k === 'rating') { va = a.rating || 0; vb = b.rating || 0; return dir * (va - vb); }
      if (k === 'connected') { va = a.downloads || 0; vb = b.downloads || 0; return dir * (va - vb); }
      if (k === 'stat1') {
        va = parseFloat(a.stats?.spd || a.stats?.slots || a.stats?.ships || a.stats?.vars || 0);
        vb = parseFloat(b.stats?.spd || b.stats?.slots || b.stats?.ships || b.stats?.vars || 0);
        return dir * (va - vb);
      }
      if (k === 'stat2') {
        va = parseFloat(a.stats?.acc || a.stats?.cost?.replace(/[^0-9.]/g,'') || a.stats?.fonts || 0);
        vb = parseFloat(b.stats?.acc || b.stats?.cost?.replace(/[^0-9.]/g,'') || b.stats?.fonts || 0);
        return dir * (va - vb);
      }
      return 0;
    });
  }

  /** Show loading skeleton or spinner */
  function _showLoadingState(append) {
    if (append) {
      const lm = document.getElementById('bp-load-more');
      if (lm) lm.innerHTML = '<div class="bp-loading"><span class="bp-spinner"></span> Loading...</div>';
    } else {
      const grid = document.getElementById('bp-grid');
      if (grid) grid.innerHTML = '<div class="bp-loading"><span class="bp-spinner"></span> Searching catalog...</div>';
    }
  }

  /** Update the result count bar */
  function _updateResultBar(q, rarity) {
    const resultBar = document.getElementById('bp-result-bar');
    if (!resultBar) return;
    const hasFilters = q || rarity !== 'all';
    if (hasFilters) {
      resultBar.innerHTML = `<span class="bp-result-count">${_totalResults} blueprint${_totalResults !== 1 ? 's' : ''} found</span>
        <button class="bp-clear-filters" id="bp-clear-filters">Clear filters</button>`;
      document.getElementById('bp-clear-filters')?.addEventListener('click', () => {
        const searchEl = document.getElementById('bp-search');
        if (searchEl) searchEl.value = '';
        document.querySelectorAll('.bp-rarity-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
        const allBtn = document.querySelector('.bp-rarity-btn[data-rarity="all"]');
        if (allBtn) { allBtn.classList.add('active'); allBtn.setAttribute('aria-pressed', 'true'); }
        _applyFilters();
      });
    } else {
      resultBar.innerHTML = '';
    }
  }

  /** Render "Load More" button below grid */
  function _renderLoadMore() {
    let container = document.getElementById('bp-load-more');
    if (!container) {
      container = document.createElement('div');
      container.id = 'bp-load-more';
      container.className = 'bp-load-more';
      document.getElementById('bp-grid')?.after(container);
    }

    const loaded = _currentResults.length;
    if (loaded >= _totalResults) {
      container.innerHTML = loaded > _PAGE_SIZE
        ? `<span class="bp-load-more-status">${loaded} of ${_totalResults} blueprints</span>`
        : '';
      return;
    }

    container.innerHTML = `
      <button class="btn bp-load-more-btn" id="bp-load-more-btn">
        Load More <span class="bp-load-more-count">(${loaded} of ${_totalResults})</span>
      </button>`;

    document.getElementById('bp-load-more-btn')?.addEventListener('click', () => {
      _currentPage++;
      _applyFilters(true);
    });
  }

  /* ── Toggle integration connection from blueprint card ── */
  async function _toggleIntegration(bpId, integrationId, btn) {
    const user = State.get('user');
    if (!user) return;

    let list = State.get('connectors') || [];
    const item = list.find(i => i.id === integrationId);
    if (!item) return;

    const connect = item.status !== 'connected';
    item.status = connect ? 'connected' : 'available';
    State.set('connectors', list);

    // Optimistic UI update
    btn.classList.toggle('connected', connect);
    btn.innerHTML = connect ? '&#10003; Connected' : '&#9741; Connect';

    try {
      if (connect) {
        await SB.db('integrations').create({ user_id: user.id, service: integrationId, status: 'connected', config: {} });
      } else {
        const remote = await SB.db('integrations').list({ userId: user.id }).catch(() => []);
        const match = remote.find(r => r.service === integrationId);
        if (match) await SB.db('integrations').remove(match.id);
      }
    } catch(e) { /* UI already updated optimistically */ }
  }

  /* ── Toggle between schematic and catalog views ── */
  function _toggleSchematicView() {
    const schematicEl = document.getElementById('bp-schematic-content');
    const logEl = document.getElementById('bp-log-content');
    const searchRow = document.querySelector('.bp-search-row');
    const resultBar = document.getElementById('bp-result-bar');
    const activatedWrap = document.getElementById('bp-activated-wrap');
    const grid = document.getElementById('bp-grid');
    const loadMore = document.getElementById('bp-load-more');

    const subTabs = document.getElementById('bp-sub-tabs');
    const isLogTab = ['missions', 'operations', 'log'].includes(_activeTab);
    const isBlueprintsTab = _activeTab === 'blueprints';
    const isSchematic = _activeTab === 'schematic';

    // Sub-tabs (Spaceships/Agents) — only show when Blueprints tab active
    if (subTabs) subTabs.style.display = isBlueprintsTab ? '' : 'none';

    // Catalog UI (search, filters, grid)
    const catalogDisplay = isBlueprintsTab ? '' : 'none';
    if (searchRow) searchRow.style.display = catalogDisplay;
    if (resultBar) resultBar.style.display = catalogDisplay;
    if (activatedWrap) activatedWrap.style.display = catalogDisplay;
    if (grid) grid.style.display = catalogDisplay;
    if (loadMore) loadMore.style.display = catalogDisplay;

    // Schematic
    if (schematicEl) {
      schematicEl.style.display = isSchematic ? '' : 'none';
      if (isSchematic && typeof SchematicView !== 'undefined') SchematicView.render(schematicEl);
      if (!isSchematic && typeof SchematicView !== 'undefined' && SchematicView.destroy) SchematicView.destroy();
    }

    // Log tabs (Missions, Operations, Log)
    if (logEl) {
      logEl.style.display = isLogTab ? '' : 'none';
      if (isLogTab) {
        _renderLogTab(logEl);
      }
    }
  }

  function _renderLogTab(el) {
    if (_activeTab === 'missions' && typeof MissionsView !== 'undefined') {
      MissionsView.render(el);
    } else if (_activeTab === 'operations' && typeof AnalyticsView !== 'undefined') {
      AnalyticsView.render(el);
    } else if (_activeTab === 'log' && typeof AuditLogView !== 'undefined') {
      AuditLogView.render(el);
    } else {
      el.innerHTML = '<p class="text-muted" style="padding:20px">Module not loaded.</p>';
    }
  }

  function _bindEvents() {
    // Main tabs
    document.getElementById('bp-type-tabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('.bp-type-tab');
      if (!tab) return;
      document.querySelectorAll('.bp-type-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _activeTab = tab.dataset.tab;
      _colSort = { key: null, dir: 'asc' };
      _toggleSchematicView();
      if (_activeTab !== 'blueprints') return;
      _updateRarityFilters();
      if (document.getElementById('bp-search')) document.getElementById('bp-search').value = '';
      _applyFilters();
    });

    // Sub-tabs (Spaceships / Agents within Blueprints)
    document.getElementById('bp-sub-tabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('.bp-sub-tab');
      if (!tab) return;
      document.querySelectorAll('.bp-sub-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _subTab = tab.dataset.sub;
      _colSort = { key: null, dir: 'asc' };
      _updateRarityFilters();
      if (document.getElementById('bp-search')) document.getElementById('bp-search').value = '';
      _applyFilters();
    });

    document.getElementById('bp-search')?.addEventListener('input', () => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => _applyFilters(), 300);
    });
    document.getElementById('bp-sort')?.addEventListener('change', () => _applyFilters());

    // View toggle buttons
    document.getElementById('bp-view-toggle')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.bp-view-btn');
      if (!btn) return;
      _viewMode = btn.dataset.view;
      localStorage.setItem('nice-bp-view', _viewMode);
      document.querySelectorAll('.bp-view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _applyFilters();
    });

    // Rarity filter buttons
    document.getElementById('bp-rarity-filters')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.bp-rarity-btn');
      if (!btn) return;
      document.querySelectorAll('.bp-rarity-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      _applyFilters();
    });

    // Deactivate All button
  }

  function _fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    if (typeof Notify !== 'undefined') Notify.send({ title: 'Link Copied', message: 'Blueprint share URL copied to clipboard.', type: 'system' });
  }

  /* ── Share blueprint URL ── */
  function _share(bpId) {
    const rawId = bpId.replace(/^bp-/, '');
    const bp = SEED.find(b => b.id === bpId) || SPACESHIP_SEED.find(b => b.id === bpId) || _remoteBlueprints.find(b => b.id === bpId)
      || (typeof BlueprintStore !== 'undefined' && (BlueprintStore.getAgent(bpId) || BlueprintStore.getAgent(rawId) || BlueprintStore.getSpaceship(bpId) || BlueprintStore.getSpaceship(rawId)))
      || null;
    if (!bp) return;
    const url = window.location.origin + '/app/#/bridge?bp=' + encodeURIComponent(bpId);

    // Always copy to clipboard (fallback for non-secure contexts)
    try {
      navigator.clipboard.writeText(url).then(() => {
        if (typeof Notify !== 'undefined') {
          Notify.send({ title: 'Link Copied', message: 'Blueprint share URL copied to clipboard.', type: 'system' });
        }
      }).catch(() => _fallbackCopy(url));
    } catch (_) { _fallbackCopy(url); }
    // Also open native share if available
    if (navigator.share) {
      navigator.share({ title: bp.name + ' — NICE Blueprint', text: bp.description, url }).catch(() => {});
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     DRAWER — right-side detail panel (replaces modal for all types)
     ═══════════════════════════════════════════════════════════════ */

  function _findBp(bpId) {
    const BS = typeof BlueprintStore !== 'undefined' ? BlueprintStore : null;
    const a = SEED.find(b => b.id === bpId) || _remoteBlueprints.find(b => b.id === bpId)
      || (BS && BS.getAgent(bpId));
    if (a) return { bp: a, type: 'agent' };
    const s = SPACESHIP_SEED.find(b => b.id === bpId)
      || (BS && BS.getSpaceship(bpId));
    if (s) return { bp: s, type: 'spaceship' };
    if (typeof Skin !== 'undefined') {
      const sk = Skin.getPack(bpId);
      if (sk) return { bp: sk, type: 'skin' };
    }
    return null;
  }

  function _openDrawer(bpId) {
    const found = _findBp(bpId);
    if (!found) return;
    const { bp, type } = found;
    _drawerBpId = bpId;

    // Build filtered list for arrow-key nav
    const grid = document.getElementById('bp-grid');
    if (grid) {
      _drawerBpList = Array.from(grid.querySelectorAll('[data-id]')).map(el => el.dataset.id);
      _drawerBpIndex = _drawerBpList.indexOf(bpId);
    }

    // Highlight selected card
    document.querySelectorAll('.bp-card-selected').forEach(c => c.classList.remove('bp-card-selected'));
    const card = grid?.querySelector(`[data-id="${CSS.escape(bpId)}"]`);
    if (card) card.classList.add('bp-card-selected');

    let drawer = document.getElementById('bp-drawer');
    let overlay = document.getElementById('bp-drawer-overlay');
    if (!drawer) {
      overlay = document.createElement('div');
      overlay.id = 'bp-drawer-overlay';
      overlay.className = 'bp-drawer-overlay';
      overlay.addEventListener('click', _closeDrawer);
      document.body.appendChild(overlay);

      drawer = document.createElement('div');
      drawer.id = 'bp-drawer';
      drawer.className = 'bp-drawer';
      document.body.appendChild(drawer);
    }

    drawer.innerHTML = _renderDrawerContent(bp, type);
    _bindDrawerActions(bp, type);

    requestAnimationFrame(() => {
      drawer.classList.add('open');
      overlay.classList.add('open');
    });

    _bindDrawerKeyboard();
  }

  function _closeDrawer() {
    const drawer = document.getElementById('bp-drawer');
    const overlay = document.getElementById('bp-drawer-overlay');
    if (drawer) drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    document.querySelectorAll('.bp-card-selected').forEach(c => c.classList.remove('bp-card-selected'));
    _drawerBpId = null;
    _unbindDrawerKeyboard();
  }

  function _renderDrawerContent(bp, type) {
    const CR = typeof CardRenderer !== 'undefined' ? CardRenderer : null;
    const serial = CR ? CR.serialHash(bp.id || bp.name) : _serialHash(bp.id || bp.name);

    // Hero card — clone the actual catalog card for exact match
    let heroHTML = '';
    const sourceCard = document.querySelector(`.tcg-card[data-id="${CSS.escape(bp.id)}"]`);
    if (sourceCard) {
      const clone = sourceCard.cloneNode(true);
      // Remove interactive classes and actions from clone
      clone.classList.remove('bp-card-clickable', 'bp-card-selected');
      clone.style.pointerEvents = 'none';
      clone.style.margin = '0';
      clone.style.cursor = 'default';
      const actions = clone.querySelector('.tcg-actions');
      if (actions) actions.remove();
      heroHTML = clone.outerHTML;
    } else if (type === 'skin') {
      heroHTML = _tcgCardHTML(bp, 'skin');
    } else if (CR) {
      heroHTML = CR.render(type, 'full', bp, {});
    } else {
      heroHTML = `<div class="tcg-card" style="pointer-events:none"><div class="tcg-name-bar"><span class="tcg-name">${_esc(bp.name)}</span></div></div>`;
    }

    // Stats
    const statsHTML = _renderDrawerStats(bp, type);

    // Capabilities
    let caps = bp.caps || bp.config?.tools || [];
    // For skins, show nav label mappings as capabilities
    if (type === 'skin' && bp.copy?.nav) {
      caps = Object.entries(bp.copy.nav).map(([k, v]) => `${k} → ${v}`);
    }
    const capsHTML = caps.length ? `<div class="bp-drawer-caps">${caps.map(c => `<span class="agent-tool-tag">${_esc(c)}</span>`).join('')}</div>` : '';

    // Actions per type
    const actionsHTML = _renderDrawerActions(bp, type);

    // Social row
    const connCount = _connCount(bp);
    const ratingHTML = _renderStars(bp.rating || 0);
    const socialHTML = `<div class="bp-drawer-social">
      <span class="bp-stars">${ratingHTML}</span>
      <span style="opacity:.6;font-size:.75rem">${_formatNum(bp.downloads || connCount)} installs</span>
    </div>`;

    // Dependency hints
    const depsHTML = _getDependencyHints(bp, type);

    // Related blueprints
    const relatedHTML = _getRelatedBlueprints(bp, type);

    return `
      <div class="bp-drawer-header">
        <h3>${_esc(bp.name)}</h3>
        <button class="bp-drawer-close" aria-label="Close">&times;</button>
      </div>
      <div class="bp-drawer-body">
        <div class="bp-drawer-hero">${heroHTML}</div>
        <p style="margin:12px 0;opacity:.8;font-size:.85rem">${_esc(bp.description || bp.desc || bp.flavor || '')}</p>
        ${socialHTML}
        ${depsHTML}
        <div class="bp-drawer-stats">${statsHTML}</div>
        ${capsHTML}
        <div class="bp-drawer-actions">${actionsHTML}</div>
        ${relatedHTML}
      </div>`;
  }

  function _renderDrawerStats(bp, type) {
    const rows = [];
    if (type === 'agent') {
      const c = bp.config || {};
      const s = bp.stats || {};
      rows.push(['Role', c.role || bp.category || '—']);
      rows.push(['Type', c.type || '—']);
      const modelLabel = c.llm_engine === 'nice-auto' ? 'NICE Auto' : (c.llm_engine || '—');
      rows.push(['Model', modelLabel]);
      rows.push(['Rarity', bp.rarity || 'Common']);
      if (s.spd) rows.push(['Speed', s.spd]);
      if (s.acc) rows.push(['Accuracy', s.acc]);
      if (s.pwr) rows.push(['Power', s.pwr]);
      // Model Intelligence stats
      if (typeof ModelIntel !== 'undefined') {
        const profile = ModelIntel.getProfile(bp.id);
        if (profile && Object.keys(profile.models).length > 0) {
          const sorted = Object.entries(profile.models)
            .filter(([, d]) => d.runs >= 1)
            .sort((a, b) => (b[1].successes / b[1].runs) - (a[1].successes / a[1].runs));
          if (sorted.length) {
            rows.push(['', '']);
            const models = typeof LLM_MODELS !== 'undefined' ? LLM_MODELS : [];
            sorted.slice(0, 3).forEach(([modelId, data]) => {
              const label = models.find(m => m.id === modelId)?.label || modelId;
              const rate = Math.round((data.successes / data.runs) * 100);
              rows.push([label, rate + '% (' + data.runs + ' runs)']);
            });
          }
        }
      }
    } else if (type === 'spaceship') {
      const s = bp.stats || {};
      rows.push(['Rank', bp.rarity || 'Common']);
      rows.push(['Agents', s.crew || '—']);
      rows.push(['Deploys', String(bp.activation_count || 0)]);
      rows.push(['Category', bp.category || '—']);
    } else if (type === 'skin') {
      const td = bp.theme_data || {};
      rows.push(['Category', bp.category || '—']);
      rows.push(['Rarity', bp.rarity || 'Legendary']);
      rows.push(['Cost', bp.price ? '$' + (bp.price / 100).toFixed(2) : 'Free']);
      if (td.fonts?.['--font-h']) rows.push(['Heading Font', td.fonts['--font-h']]);
      if (td.fonts?.['--font-b']) rows.push(['Body Font', td.fonts['--font-b']]);
      if (td.radius) rows.push(['Border Radius', td.radius]);
      if (bp.effect) rows.push(['Canvas Effect', bp.effect]);
    }
    return rows.map(([k, v, raw]) => {
      if (raw) return `<div class="detail-kv-row bp-stat-full"><span class="kv-label">${_esc(k)}</span><span class="kv-val bp-formation-wrap">${v}</span></div>`;
      return `<div class="detail-kv-row"><span class="kv-label">${_esc(k)}</span><span class="kv-val">${_esc(String(v))}</span></div>`;
    }).join('');
  }

  function _renderDrawerActions(bp, type) {
    const btns = [];
    if (type === 'agent') {
      if (BlueprintStore.isAgentActivated(bp.id)) {
        btns.push(`<button class="btn btn-sm bp-drawer-nice" data-id="${bp.id}" data-name="${_esc(bp.name)}" data-type="agent">Message ${_esc(bp.name)}</button>`);
      }
      btns.push(`<button class="btn btn-sm bp-drawer-nav" data-route="#/agents/${encodeURIComponent(bp.id)}">View Agent &rarr;</button>`);
    } else if (type === 'spaceship') {
      const isAct = BlueprintStore.isShipActivated(bp.id);
      if (isAct) {
        btns.push(`<button class="btn btn-sm bp-drawer-nice" data-id="${bp.id}" data-name="${_esc(bp.name)}" data-type="spaceship">Message ${_esc(bp.name)}</button>`);
        btns.push(`<button class="btn btn-sm bp-drawer-activate" data-id="${bp.id}" data-type="spaceship">&#10003; Deployed</button>`);
      } else {
        btns.push(`<button class="btn btn-primary btn-sm bp-drawer-ship-wizard" data-id="${bp.id}">Setup Spaceship</button>`);
      }
    } else if (type === 'skin') {
      const isActive = typeof Skin !== 'undefined' && Skin.activeSkin()?.id === bp.id;
      btns.push(`<button class="bp-toggle-switch bp-drawer-skin-toggle${isActive ? ' on' : ''}" data-id="${bp.id}"><span class="toggle-track"><span class="toggle-knob"></span></span></button>`);
      if (!isActive) btns.push(`<button class="btn btn-sm bp-drawer-skin-preview" data-id="${bp.id}">Preview</button>`);
    }
    btns.push(`<button class="btn btn-sm bp-drawer-share" data-id="${bp.id}" title="Share">&#8599; Share</button>`);
    return btns.join('');
  }

  function _bindDrawerActions(bp, type) {
    const drawer = document.getElementById('bp-drawer');
    if (!drawer) return;

    drawer.querySelector('.bp-drawer-close')?.addEventListener('click', _closeDrawer);

    // Hero card click → mission prompt for activated blueprints
    const isActivated = type === 'spaceship'
      ? BlueprintStore.isShipActivated(bp.id)
      : BlueprintStore.isAgentActivated(bp.id);
    if (isActivated) {
      const heroCard = drawer.querySelector('.tcg-card');
      if (heroCard) {
        heroCard.style.cursor = 'pointer';
        heroCard.style.pointerEvents = 'auto';
        heroCard.addEventListener('click', () => _promptActivatedCard(bp.id, type));
      }
    }

    // Activate (spaceship only — crew cards don't have activate)
    drawer.querySelectorAll('.bp-drawer-activate').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const t = btn.dataset.type;
        if (t === 'spaceship') {
          if (BlueprintStore.isShipActivated(id)) {
            const b = _findBp(id)?.bp;
            confirmDeactivate(b?.name || 'this spaceship', () => { BlueprintStore.deactivateShip(id); _applyFilters(); _openDrawer(id); });
          } else {
            _closeDrawer();
            const bp = _findShipBp(id);
            if (bp && typeof ShipSetupWizard !== 'undefined') {
              ShipSetupWizard.open(bp, { onComplete: () => _applyFilters() });
            }
          }
        }
      });
    });

    // NICE
    drawer.querySelectorAll('.bp-drawer-nice').forEach(btn => {
      btn.addEventListener('click', () => _promptActivatedCard(bp.id, type));
    });

    // Navigate
    drawer.querySelectorAll('.bp-drawer-nav').forEach(btn => {
      btn.addEventListener('click', () => {
        _closeDrawer();
        const route = btn.dataset.route;
        if (typeof Router !== 'undefined') Router.navigate(route);
        else location.hash = route;
      });
    });

    // Ship Setup Wizard
    drawer.querySelectorAll('.bp-drawer-ship-wizard').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const bpObj = _findBp(id)?.bp;
        if (!bpObj || typeof ShipSetupWizard === 'undefined') return;
        _closeDrawer();
        const isReconfigure = btn.dataset.reconfigure === '1';
        const existingName = bpObj._shipName || bpObj.name;
        ShipSetupWizard.open(bpObj, isReconfigure ? { startStep: 1, shipName: existingName } : {});
      });
    });

    // Contact Sales
    drawer.querySelectorAll('.bp-drawer-contact').forEach(btn => {
      btn.addEventListener('click', () => _contactSales(btn.dataset.id));
    });

    // Skin toggle
    drawer.querySelectorAll('.bp-drawer-skin-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof Skin === 'undefined') return;
        const id = btn.dataset.id;
        if (Skin.activeSkin()?.id === id) {
          Skin.deactivate();
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Skin Off', message: 'Restored default appearance.', type: 'info' });
        } else {
          if (!Skin.ownsSkin(id) && Skin.getPack(id)?.price) Skin.purchaseSkin(id);
          Skin.activate(id);
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Skin On', message: (Skin.getPack(id)?.name || id) + ' applied!', type: 'task_complete' });
          if (typeof Gamification !== 'undefined') Gamification.addXP('install_blueprint');
        }
        _applyFilters();
        _openDrawer(id);
      });
    });

    // Skin preview
    drawer.querySelectorAll('.bp-drawer-skin-preview').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof Skin === 'undefined') return;
        const id = btn.dataset.id;
        Skin.activate(id);
        if (typeof Notify !== 'undefined') Notify.send({ title: 'Skin Preview', message: 'Previewing ' + (Skin.getPack(id)?.name || id) + '. Navigate around to see changes.', type: 'info' });
        _applyFilters();
      });
    });

    // Share
    drawer.querySelectorAll('.bp-drawer-share').forEach(btn => {
      btn.addEventListener('click', () => _share(btn.dataset.id));
    });

    // Hangar add from drawer
    drawer.querySelectorAll('.bp-drawer-hangar-add').forEach(btn => {
      btn.addEventListener('click', () => _addToHangar(btn.dataset.id, btn.dataset.type));
    });

    // Related blueprint clicks
    drawer.querySelectorAll('.bp-drawer-related-card').forEach(card => {
      card.addEventListener('click', () => _openDrawer(card.dataset.id));
    });
  }

  /* ═══════════════════════════════════════════════════════
     KEYBOARD NAVIGATION — arrows to browse, ESC to close
     ═══════════════════════════════════════════════════════ */

  function _bindDrawerKeyboard() {
    _unbindDrawerKeyboard();
    _drawerKeyHandler = (e) => {
      // Don't intercept when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'Escape') {
        e.preventDefault();
        // Close compare panel first if open
        const cp = document.getElementById('bp-compare-panel');
        if (cp) { _closeComparePanel(); return; }
        _closeDrawer();
        return;
      }

      if (!_drawerBpId || !_drawerBpList.length) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = _drawerBpIndex + 1;
        if (next < _drawerBpList.length) {
          _drawerBpIndex = next;
          _openDrawer(_drawerBpList[next]);
          // Scroll card into view
          const card = document.querySelector(`[data-id="${CSS.escape(_drawerBpList[next])}"]`);
          if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = _drawerBpIndex - 1;
        if (prev >= 0) {
          _drawerBpIndex = prev;
          _openDrawer(_drawerBpList[prev]);
          const card = document.querySelector(`[data-id="${CSS.escape(_drawerBpList[prev])}"]`);
          if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    };
    document.addEventListener('keydown', _drawerKeyHandler);
  }

  function _unbindDrawerKeyboard() {
    if (_drawerKeyHandler) {
      document.removeEventListener('keydown', _drawerKeyHandler);
      _drawerKeyHandler = null;
    }
  }

  /* ═══════════════════════════════════════════════
     QUICK-COMPARE MODE — shift+click up to 4 cards
     ═══════════════════════════════════════════════ */

  function _toggleCompare(bpId) {
    const idx = _compareIds.indexOf(bpId);
    if (idx > -1) {
      _compareIds.splice(idx, 1);
    } else {
      if (_compareIds.length >= 4) return; // max 4
      _compareIds.push(bpId);
    }

    // Update card highlights
    document.querySelectorAll('.bp-compare-selected').forEach(c => c.classList.remove('bp-compare-selected'));
    _compareIds.forEach(id => {
      const card = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (card) card.classList.add('bp-compare-selected');
    });

    _renderCompareBar();
  }

  function _renderCompareBar() {
    let bar = document.getElementById('bp-compare-bar');
    if (_compareIds.length === 0) {
      if (bar) bar.classList.remove('visible');
      return;
    }
    // Hide hangar bar when compare is active
    const hBar = document.getElementById('bp-hangar-bar');
    if (hBar) hBar.classList.remove('visible');

    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'bp-compare-bar';
      bar.className = 'bp-compare-bar';
      document.body.appendChild(bar);
    }
    bar.innerHTML = `<span>${_compareIds.length} selected</span>
      <button class="btn btn-primary btn-sm" id="bp-compare-go" ${_compareIds.length < 2 ? 'disabled' : ''}>Compare</button>
      <button class="btn btn-sm" id="bp-compare-clear">Clear</button>`;
    bar.classList.add('visible');

    document.getElementById('bp-compare-go')?.addEventListener('click', _showComparePanel);
    document.getElementById('bp-compare-clear')?.addEventListener('click', () => {
      _compareIds = [];
      document.querySelectorAll('.bp-compare-selected').forEach(c => c.classList.remove('bp-compare-selected'));
      _renderCompareBar();
    });
  }

  function _showComparePanel() {
    if (_compareIds.length < 2) return;
    _closeDrawer();

    const panel = document.createElement('div');
    panel.id = 'bp-compare-panel';
    panel.className = 'bp-compare-panel';

    const cards = _compareIds.map(id => {
      const found = _findBp(id);
      if (!found) return '';
      const { bp, type } = found;
      const CR = typeof CardRenderer !== 'undefined' ? CardRenderer : null;
      const cardHTML = CR ? CR.render(type, 'full', bp, {}) : `<div class="tcg-card"><div class="tcg-name-bar"><span class="tcg-name">${_esc(bp.name)}</span></div></div>`;

      // Build stat rows for comparison
      const statsHTML = _renderDrawerStats(bp, type);
      const caps = (bp.caps || bp.config?.tools || []).slice(0, 5);
      const capsHTML = caps.map(c => `<span class="agent-tool-tag">${_esc(c)}</span>`).join('');

      return `<div class="bp-compare-col">
        <div class="bp-compare-card">${cardHTML}</div>
        <div class="bp-compare-stats">${statsHTML}</div>
        <div class="bp-compare-caps">${capsHTML}</div>
      </div>`;
    }).join('');

    panel.innerHTML = `
      <div class="bp-compare-panel-header">
        <h3>Compare Blueprints</h3>
        <button class="bp-compare-panel-close" aria-label="Close">&times;</button>
      </div>
      <div class="bp-compare-grid">${cards}</div>`;
    document.body.appendChild(panel);

    panel.querySelector('.bp-compare-panel-close')?.addEventListener('click', _closeComparePanel);
    panel.addEventListener('click', (e) => { if (e.target === panel) _closeComparePanel(); });

    // ESC to close compare panel
    const _escHandler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); _closeComparePanel(); document.removeEventListener('keydown', _escHandler); }
    };
    document.addEventListener('keydown', _escHandler);
  }

  function _closeComparePanel() {
    const panel = document.getElementById('bp-compare-panel');
    if (panel) panel.remove();
  }

  /* ═══════════════════════════════════════════
     HANGAR CART — batch activation
     ═══════════════════════════════════════════ */

  function _addToHangar(bpId, type) {
    if (_hangarItems.find(h => h.id === bpId)) return;
    const found = _findBp(bpId);
    if (!found) return;

    // No hangar for crew cards
    if (type === 'agent') return;
    // Don't add already-activated items
    if (type === 'spaceship' && BlueprintStore.isShipActivated(bpId)) return;
    _hangarItems.push({ id: bpId, type: type, name: found.bp.name });
    _renderHangarBar();
  }

  function _removeFromHangar(bpId) {
    _hangarItems = _hangarItems.filter(h => h.id !== bpId);
    _renderHangarBar();
  }

  function _renderHangarBar() {
    let bar = document.getElementById('bp-hangar-bar');
    if (_hangarItems.length === 0) {
      if (bar) bar.classList.remove('visible');
      return;
    }
    // Hide compare bar when hangar is active
    const cBar = document.getElementById('bp-compare-bar');
    if (cBar) cBar.classList.remove('visible');

    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'bp-hangar-bar';
      bar.className = 'bp-hangar-bar';
      document.body.appendChild(bar);
    }

    const thumbs = _hangarItems.map(h =>
      `<div class="bp-hangar-item" data-id="${h.id}" title="${_esc(h.name)}">
        <span class="bp-hangar-item-name">${_esc(h.name.slice(0, 8))}</span>
        <button class="bp-hangar-item-x" data-id="${h.id}">&times;</button>
      </div>`
    ).join('');

    bar.innerHTML = `
      <div class="bp-hangar-items">${thumbs}</div>
      <span style="font-size:.8rem;opacity:.7">${_hangarItems.length} in hangar</span>
      <button class="btn btn-primary btn-sm" id="bp-hangar-activate-all">Deploy All</button>
      <button class="btn btn-sm" id="bp-hangar-clear">Clear</button>`;
    bar.classList.add('visible');

    // Bind remove buttons
    bar.querySelectorAll('.bp-hangar-item-x').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); _removeFromHangar(btn.dataset.id); });
    });

    document.getElementById('bp-hangar-activate-all')?.addEventListener('click', _activateAllHangar);
    document.getElementById('bp-hangar-clear')?.addEventListener('click', () => {
      _hangarItems = [];
      _renderHangarBar();
    });
  }

  function _activateAllHangar() {
    _hangarItems.forEach(h => {
      if (h.type === 'spaceship') { BlueprintStore.activateShip(h.id); if (typeof Gamification !== 'undefined') Gamification.addXP('activate_blueprint'); }
    });
    const count = _hangarItems.length;
    _hangarItems = [];
    _renderHangarBar();
    _applyFilters();
    if (typeof Notify !== 'undefined') Notify.send({ title: 'Hangar Deployed', message: count + ' blueprints deployed.', type: 'task_complete' });
  }

  /* ═══════════════════════════════════════════════
     DEPENDENCY HINTS — shown in drawer
     ═══════════════════════════════════════════════ */

  function _getDependencyHints(bp, type) {
    if (type === 'fleet') {
      const neededShips = parseInt(bp.stats?.ships, 10) || 0;
      const activeShips = (typeof BlueprintStore !== 'undefined' && BlueprintStore.getActivatedShipIds)
        ? BlueprintStore.getActivatedShipIds().length : (State.get('spaceships') || []).length;
      if (neededShips > 0 && activeShips < neededShips) {
        return `<div class="bp-drawer-deps">
          <span class="bp-deps-icon">&#9888;</span>
          Needs ${neededShips} spaceships. You have ${activeShips}.
          <a href="#/bridge?tab=spaceship" class="bp-deps-link" onclick="document.getElementById('bp-drawer')?.classList.remove('open');document.getElementById('bp-drawer-overlay')?.classList.remove('open')">Browse Spaceship Blueprints &rarr;</a>
        </div>`;
      }
    }
    return '';
  }

  /* ═══════════════════════════════════════════════
     RELATED BLUEPRINTS — shown in drawer footer
     ═══════════════════════════════════════════════ */

  function _getRelatedBlueprints(bp, type) {
    let related = [];

    if (type === 'agent') {
      // Same category, different rarity
      related = SEED.filter(b => b.id !== bp.id && b.category === bp.category).slice(0, 4);
    } else if (type === 'spaceship') {
      // Agent blueprints that could fit in this ship's slots
      related = SEED.filter(b => b.category && b.id !== bp.id).slice(0, 4);
    }

    if (!related.length) return '';

    const cards = related.map(r => {
      const rType = SEED.find(b => b.id === r.id) ? 'agent' : 'spaceship';
      return `<div class="bp-drawer-related-card" data-id="${r.id}" title="${_esc(r.name)}">
        <div class="bp-related-mini-name">${_esc(r.name)}</div>
        <div class="bp-related-mini-cat">${_esc(r.category || '')}</div>
      </div>`;
    }).join('');

    return `<div class="bp-drawer-related">
      <h4 style="margin:0 0 8px;font-size:.8rem;opacity:.6">RELATED</h4>
      <div class="bp-drawer-related-scroll">${cards}</div>
    </div>`;
  }

  /* ── Deep-link: auto-highlight blueprint from URL ── */
  function _handleDeepLink() {
    const hq = typeof Router !== 'undefined' ? Router.hashQuery() : {};

    // Handle ?tab= param
    const tabParam = hq.tab;
    if (tabParam && ['agent','spaceship'].includes(tabParam) && _activeTab !== tabParam) {
      _activeTab = tabParam;
      document.querySelectorAll('.bp-type-tab').forEach(t => t.classList.remove('active'));
      document.querySelector(`.bp-type-tab[data-tab="${tabParam}"]`)?.classList.add('active');
      _updateRarityFilters();
      _applyFilters();
    }

    // Handle ?search= param — populate search box and filter
    const searchParam = hq.search;
    if (searchParam) {
      const searchInput = document.getElementById('bp-search');
      if (searchInput) {
        searchInput.value = searchParam;
        _applyFilters();
      }
    }

    const bpId = hq.bp;
    if (!bpId) return;

    // Detect which tab the blueprint belongs to and switch if needed
    if (SPACESHIP_SEED.find(b => b.id === bpId) && _activeTab !== 'spaceship') {
      _activeTab = 'spaceship';
      document.querySelectorAll('.bp-type-tab').forEach(t => t.classList.remove('active'));
      document.querySelector('.bp-type-tab[data-tab="spaceship"]')?.classList.add('active');
      _updateRarityFilters();
      _applyFilters();

      _updateRarityFilters();
      _applyFilters();
    }

    // Small delay to let grid render, then open drawer
    setTimeout(() => {
      const card = document.querySelector(`.tcg-card[data-id="${CSS.escape(bpId)}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      _openDrawer(bpId);
    }, 200);
  }

  /* ── Public API for cross-view lookup ── */
  function _getSpaceshipSeed(bpId) {
    return SPACESHIP_SEED.find(b => b.id === bpId) || null;
  }

  /* ── Community Blueprints ── */
  let _communityBlueprints = [];

  async function _loadCommunityBlueprints() {
    try {
      const rows = await SB.db('blueprint_submissions').list({ status: 'approved' });
      if (rows && rows.length) {
        _communityBlueprints = rows.map(r => ({
          id: r.id,
          name: r.agent_data?.name || 'Community Agent',
          category: r.agent_data?.category || r.agent_data?.config?.role || 'Custom',
          rarity: r.agent_data?.rarity || 'Common',
          rating: r.avg_rating || 0,
          downloads: r.download_count || 0,
          description: r.agent_data?.description || '',
          art: r.agent_data?.art || 'intelligence',
          flavor: r.agent_data?.flavor || '',
          card_num: 'CM-' + String(r.id).slice(-3),
          agentType: r.agent_data?.config?.type || 'Agent',
          tags: r.agent_data?.tags || ['community'],
          caps: r.agent_data?.caps || [],
          stats: r.agent_data?.stats || {},
          config: r.agent_data?.config || {},
          _community: true,
          _submission_id: r.id,
        }));
      }
    } catch (err) {
      console.warn('Failed to load community blueprints:', err.message);
    }
  }

  async function _publishBlueprint(agentId) {
    const user = State.get('user');
    if (!user) return;
    const agents = State.get('agents') || [];
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;

    try {
      await SB.db('blueprint_submissions').create({
        user_id: user.id,
        agent_data: {
          name: agent.name,
          category: agent.role || 'Custom',
          rarity: 'Common',
          description: 'Community-published agent: ' + agent.name,
          config: {
            role: agent.role,
            type: agent.type,
            llm_engine: agent.llm_engine,
            tools: (agent.config || {}).tools || [],
          },
          tags: ['community'],
        },
        status: 'pending',
      });
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Blueprint Submitted', message: `${agent.name} submitted for community review.`, type: 'system' });
      }
    } catch (err) {
      console.warn('Publish failed:', err.message);
    }
  }

  /* ── Removal confirmation dialog ── */
  function confirmDeactivate(name, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'bp-confirm-overlay';
    overlay.innerHTML = `
      <div class="bp-confirm-modal">
        <h3>Remove Blueprint</h3>
        <p>Are you sure you want to remove <span class="bp-confirm-name">${name}</span>?</p>
        <p class="bp-confirm-warning">This will remove it from your roster. You can add it back anytime from the Blueprints.</p>
        <div class="bp-confirm-actions">
          <button class="bp-confirm-cancel">Cancel</button>
          <button class="bp-confirm-submit">Remove</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('.bp-confirm-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.bp-confirm-submit').addEventListener('click', () => {
      overlay.remove();
      onConfirm();
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }

  function renderEmbedded(el) { return render(el, { embedded: true }); }

  return { title, render, renderEmbedded, _getSpaceshipSeed, SEED, SPACESHIP_SEED,
    serialHash: typeof CardRenderer !== 'undefined' ? CardRenderer.serialHash : _serialHash,
    avatarArt: typeof CardRenderer !== 'undefined' ? CardRenderer.avatarArt : _avatarArt,
    categoryColors: typeof CardRenderer !== 'undefined' ? CardRenderer.CATEGORY_COLORS : _categoryColors,
    publishBlueprint: _publishBlueprint, confirmDeactivate, openDrawer: _openDrawer, closeDrawer: _closeDrawer };
})();
