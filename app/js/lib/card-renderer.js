/* ═══════════════════════════════════════════════════════════════════
   NICE — Card Renderer
   Shared TCG card rendering for agents, spaceships, and themes.
   Three sizes: full (terminal), compact (operational), mini (dock).
═══════════════════════════════════════════════════════════════════ */

const CardRenderer = (() => {
  const _esc = Utils.esc;

  /* ── Constants ── */
  const RARITY_COLORS = { Common:'#94a3b8', Rare:'#6366f1', Epic:'#a855f7', Legendary:'#f59e0b', Mythic:'#ff2d55' };

  const ROLE_COLORS = { Research:'#6366f1', Code:'#06b6d4', Data:'#f59e0b', Content:'#ec4899', Ops:'#22c55e', Custom:'#8b5cf6' };

  const CATEGORY_COLORS = {
    Research:'#6366f1', Analytics:'#f59e0b', Content:'#ec4899', Engineering:'#06b6d4',
    Ops:'#22c55e', Sales:'#f97316', Support:'#8b5cf6', Legal:'#64748b',
    Marketing:'#e11d48', Automation:'#14b8a6'
  };

  const SHIP_CLASSES = {
    'class-1': { name:'Scout',       tier:'FREE',   slots:[{max:'Common',label:'Bridge'},{max:'Common',label:'Ops'}] },
    'class-2': { name:'Frigate',     tier:'$49',    slots:[{max:'Epic',label:'Bridge'},{max:'Rare',label:'Comms'},{max:'Rare',label:'Ops'}] },
    'class-3': { name:'Cruiser',     tier:'$149',   slots:[{max:'Epic',label:'Bridge'},{max:'Epic',label:'Comms'},{max:'Epic',label:'Tactical'},{max:'Rare',label:'Science'},{max:'Rare',label:'Engineering'}] },
    'class-4': { name:'Dreadnought', tier:'$349',   slots:[{max:'Legendary',label:'Bridge'},{max:'Epic',label:'Comms'},{max:'Epic',label:'Tactical'},{max:'Epic',label:'Science'},{max:'Epic',label:'Engineering'},{max:'Rare',label:'Ops'},{max:'Rare',label:'Logistics'},{max:'Rare',label:'Support'}] },
    'class-5': { name:'Flagship',    tier:'$799',   slots:[{max:'Mythic',label:'Bridge'},{max:'Legendary',label:'Command'},{max:'Epic',label:'Comms'},{max:'Epic',label:'Tactical'},{max:'Epic',label:'Science'},{max:'Epic',label:'Engineering'},{max:'Epic',label:'Analytics'},{max:'Epic',label:'Operations'},{max:'Rare',label:'Support'},{max:'Rare',label:'Logistics'},{max:'Rare',label:'Intel'},{max:'Rare',label:'Creative'}] },
    'slot-6':  { name:'Ship',       tier:'',       slots:[{max:'Legendary',label:'Bridge'},{max:'Epic',label:'Command'},{max:'Epic',label:'Tactical'},{max:'Epic',label:'Ops'},{max:'Rare',label:'Science'},{max:'Rare',label:'Engineering'}] }
  };

  const SLOT_COLORS = { Common:'#94a3b8', Rare:'#6366f1', Epic:'#a855f7', Legendary:'#f59e0b', Mythic:'#ff2d55' };



  const NS_LOGO_MINI = '<svg viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg" style="width:1.5em;height:1.5em;vertical-align:-.2em;margin-right:.35em" fill="currentColor"><path d="M962.08,762.91c-3.6,3.81-23,22.39-23.4,25.12s1.65,9.46,1.81,12.8c6.2,134.27-22.47,251.36-96.57,363.41-10.14,15.32-44.07,64.4-57.7,72.3-10.64,6.16-17.08,4.1-26.74-2.68l-205.91-206.08-2.61-1.47c-13.79,3.14-27.33,7.97-41.2,10.78-12.14,2.46-39.23,7.32-50.52,5.02-5.43-1.11-8.8-8.83-13.02-7.63-56.83,48.42-130.21,76.33-203.49,88.59-23.32,3.9-79.67,11.72-100.43,4.99-28.92-9.37-32.15-31.74-31.74-58.17,1.36-87.99,28.47-185.28,80.14-256.85,2.24-3.1,15.39-18.18,15.71-19.38.7-2.69-7.89-8.08-8.8-14.88-1.33-9.98,3.07-34.86,5.18-45.64,2.91-14.86,7.64-29.47,11.6-44.06L6.97,481.35c-6.58-10.16-9.77-14.46-3.86-25.92,4.89-9.48,28.96-27.24,38.49-34.51,113.03-86.2,243.65-127.64,386.44-121.64,5.01.21,23.34,2.94,26.44,1.52,117.49-117.68,260.78-215.29,420.81-265.18,95.99-29.93,217.05-45.19,316.54-29.13,13.03,2.1,32.43,2.67,37.16,16.84,5.97,17.89,9.64,56.02,10.55,75.45,12,255.12-107.2,483.74-277.46,664.12ZM842.3,261.63c-101.28,8.13-152.88,125.4-90.22,205.62,56.08,71.8,169.37,61.28,211.94-18.9,46.73-88.01-22.45-194.69-121.72-186.72ZM276.84,862.98c-1.02-.92-3.11-5.35-5.37-4.22-.87.43-8.43,11.31-9.79,13.25-32.97,47.21-49,105.67-56.19,162.31,1.77,1.77,42.17-6.13,48.04-7.46,31.2-7.03,64.74-18.77,92.63-34.37,4.52-2.53,34.5-21.3,35.27-23.8.34-1.12-.09-2.12-.89-2.92-35.52-32.96-67.86-70.35-103.71-102.79Z"/></svg>';

  const NS_LOGO_BTN = '<svg viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg" style="width:10px;height:10px;display:block" fill="currentColor"><path d="M962.08,762.91c-3.6,3.81-23,22.39-23.4,25.12s1.65,9.46,1.81,12.8c6.2,134.27-22.47,251.36-96.57,363.41-10.14,15.32-44.07,64.4-57.7,72.3-10.64,6.16-17.08,4.1-26.74-2.68l-205.91-206.08-2.61-1.47c-13.79,3.14-27.33,7.97-41.2,10.78-12.14,2.46-39.23,7.32-50.52,5.02-5.43-1.11-8.8-8.83-13.02-7.63-56.83,48.42-130.21,76.33-203.49,88.59-23.32,3.9-79.67,11.72-100.43,4.99-28.92-9.37-32.15-31.74-31.74-58.17,1.36-87.99,28.47-185.28,80.14-256.85,2.24-3.1,15.39-18.18,15.71-19.38.7-2.69-7.89-8.08-8.8-14.88-1.33-9.98,3.07-34.86,5.18-45.64,2.91-14.86,7.64-29.47,11.6-44.06L6.97,481.35c-6.58-10.16-9.77-14.46-3.86-25.92,4.89-9.48,28.96-27.24,38.49-34.51,113.03-86.2,243.65-127.64,386.44-121.64,5.01.21,23.34,2.94,26.44,1.52,117.49-117.68,260.78-215.29,420.81-265.18,95.99-29.93,217.05-45.19,316.54-29.13,13.03,2.1,32.43,2.67,37.16,16.84,5.97,17.89,9.64,56.02,10.55,75.45,12,255.12-107.2,483.74-277.46,664.12ZM842.3,261.63c-101.28,8.13-152.88,125.4-90.22,205.62,56.08,71.8,169.37,61.28,211.94-18.9,46.73-88.01-22.45-194.69-121.72-186.72ZM276.84,862.98c-1.02-.92-3.11-5.35-5.37-4.22-.87.43-8.43,11.31-9.79,13.25-32.97,47.21-49,105.67-56.19,162.31,1.77,1.77,42.17-6.13,48.04-7.46,31.2-7.03,64.74-18.77,92.63-34.37,4.52-2.53,34.5-21.3,35.27-23.8.34-1.12-.09-2.12-.89-2.92-35.52-32.96-67.86-70.35-103.71-102.79Z"/></svg>';

  const AGENT_ICON_BTN = '<svg viewBox="0 0 24 24" style="width:12px;height:12px;display:block" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="8" width="10" height="8" rx="2"/><path d="M9 2h6M12 2v6"/><circle cx="9.5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="12" r="1" fill="currentColor" stroke="none"/><path d="M9 16v2M15 16v2M3 12h4M17 12h4"/></svg>';

  /* ── Serial Hash — deterministic alphanumeric fingerprint ── */
  const _SERIAL_CHARS = 'A0B1C2D3E4F5G6H7J8K9LMNPQRSTUVWXYZ';

  function serialHash(str, len) {
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
    var raw = chars.join('');
    var code = raw.replace(/(.{4})(?=.)/g, '$1-');
    return { code: code, raw: raw, speeds: speeds };
  }

  /* ── Role Color ── */
  function roleColor(role) {
    return ROLE_COLORS[role] || CATEGORY_COLORS[role] || '#6366f1';
  }

  /* ── Avatar Art (agent cards) ── */
  function avatarArt(name, category, serial) {
    const color = CATEGORY_COLORS[category] || '#6366f1';
    const initials = (name || 'AG').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    if (!serial) serial = serialHash(name);

    const dotColors = ['#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6','#6366f1','#a855f7','#ec4899'];

    let dots = '';
    for (let i = 0; i < 10; i++) {
      const spd = serial.speeds[i];
      const dur = 24 - (spd * 2);
      const startAngle = i * 36;
      const r = 1.5 + (spd * 0.15);
      const dc = dotColors[i];
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

  /* ── Slot Diagram Art (spaceship cards) ── */
  function slotDiagramArt(classId, serial) {
    const cls = SHIP_CLASSES[classId] || SHIP_CLASSES['class-1'];
    const slots = cls.slots;
    const n = slots.length;
    if (!serial) serial = serialHash(classId, 12);

    const cx = 100, cy = 60;
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

    const conns = n === 2 ? [[0,1]]
      : n === 3 ? [[0,1],[1,2],[0,2]]
      : n === 5 ? [[0,1],[0,2],[1,3],[2,4],[3,4],[1,2]]
      : n === 8 ? [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,0],[0,4],[2,6]]
      : n === 12 ? [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11],[11,0],[0,6],[3,9]]
      : [[0,1],[1,2],[3,4],[4,5],[0,3],[2,5],[1,4]];

    const dotColors = ['#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4',
                       '#3b82f6','#6366f1','#a855f7','#ec4899','#84cc16','#fb923c'];
    const localOrbitR = 18;

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

    svg += `<circle cx="${cx}" cy="${cy}" r="5" fill="#3b82f6" opacity="0.3"/>`;

    conns.forEach(pair => {
      const a = positions[pair[0]], b = positions[pair[1]];
      svg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#3b82f6" stroke-width="0.6" opacity="0.1"/>`;
    });

    positions.forEach(p => {
      svg += `<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" stroke="#3b82f6" stroke-width="0.8" opacity="0.12"/>`;
    });

    slots.forEach((slot, i) => {
      const p = positions[i];
      const color = SLOT_COLORS[slot.max] || '#6366f1';
      const r = 14;
      svg += `<circle cx="${p.x}" cy="${p.y}" r="${r + 3}" fill="${color}" opacity="0.12"/>`;
      svg += `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="5,3" opacity="0.7"/>`;
      svg += `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${color}" opacity="0.06"/>`;
      svg += `<text x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="central" fill="${color}" font-size="12" font-weight="300" opacity="0.6">+</text>`;
    });

    slots.forEach((slot, i) => {
      const p = positions[i];
      const spd = serial.speeds[i] || 0;
      const dur = 20 - (spd * 1.5);
      const dotR = 1.5 + (spd * 0.12);
      const dc = dotColors[i % dotColors.length];
      svg += `<circle cx="${p.x + localOrbitR}" cy="${p.y}" r="${dotR + 1.5}" fill="${dc}" opacity="0.2"><animateTransform attributeName="transform" type="rotate" from="0 ${p.x} ${p.y}" to="360 ${p.x} ${p.y}" dur="${dur}s" repeatCount="indefinite"/></circle>`;
      svg += `<circle cx="${p.x + localOrbitR}" cy="${p.y}" r="${dotR}" fill="${dc}" opacity="0.85"><animateTransform attributeName="transform" type="rotate" from="0 ${p.x} ${p.y}" to="360 ${p.x} ${p.y}" dur="${dur}s" repeatCount="indefinite"/></circle>`;
    });

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

  /* ── Palette Art ── */
  function paletteArt(name, previewColors, serial) {
    const pc = previewColors || ['#080808', '#ffffff', '#888888'];
    if (!serial) serial = serialHash(name);

    // Derive 2 more colors from existing ones
    const c1 = pc[0], c2 = pc[1], c3 = pc[2];

    // 5 swatch positions in an arc
    const swatches = [
      { x: 40, y: 55, r: 12, color: c1 },
      { x: 72, y: 38, r: 14, color: c3 },
      { x: 100, y: 30, r: 18, color: c2 },
      { x: 128, y: 38, r: 14, color: c3 },
      { x: 160, y: 55, r: 12, color: c1 },
    ];

    let svg = '';

    // Grid lines
    svg += `<line x1="0" y1="30" x2="200" y2="30" stroke="${c2}" stroke-width="0.5" opacity="0.06"/>`;
    svg += `<line x1="0" y1="60" x2="200" y2="60" stroke="${c2}" stroke-width="0.5" opacity="0.06"/>`;
    svg += `<line x1="0" y1="90" x2="200" y2="90" stroke="${c2}" stroke-width="0.5" opacity="0.06"/>`;
    svg += `<line x1="50" y1="0" x2="50" y2="120" stroke="${c2}" stroke-width="0.5" opacity="0.06"/>`;
    svg += `<line x1="100" y1="0" x2="100" y2="120" stroke="${c2}" stroke-width="0.5" opacity="0.06"/>`;
    svg += `<line x1="150" y1="0" x2="150" y2="120" stroke="${c2}" stroke-width="0.5" opacity="0.06"/>`;

    // Connecting lines between swatches
    for (let i = 0; i < swatches.length - 1; i++) {
      svg += `<line x1="${swatches[i].x}" y1="${swatches[i].y}" x2="${swatches[i+1].x}" y2="${swatches[i+1].y}" stroke="${c2}" stroke-width="1" opacity="0.15"/>`;
    }

    // Swatch circles with glow
    swatches.forEach((s, i) => {
      svg += `<circle cx="${s.x}" cy="${s.y}" r="${s.r + 4}" fill="${s.color}" opacity="0.12"/>`;
      svg += `<circle cx="${s.x}" cy="${s.y}" r="${s.r}" fill="${s.color}" opacity="0.85" stroke="${c2}" stroke-width="0.5" stroke-opacity="0.3"/>`;
    });

    // 6 orbiting dots around center swatch
    const dotColors = [c2, c3, c2, c3, c2, c3];
    for (let i = 0; i < 6; i++) {
      const spd = serial.speeds[i] || 5;
      const dur = 20 - (spd * 1.5);
      const startAngle = i * 60;
      const r = 1.2 + (spd * 0.1);
      svg += `<circle cx="100" cy="10" r="${r}" fill="${dotColors[i]}" opacity="0.7"><animateTransform attributeName="transform" type="rotate" from="${startAngle} 100 50" to="${startAngle + 360} 100 50" dur="${dur}s" repeatCount="indefinite"/></circle>`;
    }

    // Font preview text
    svg += `<text x="100" y="85" text-anchor="middle" dominant-baseline="central" fill="${c2}" font-family="var(--font-h, Inter, sans-serif)" font-size="20" font-weight="700" letter-spacing="2" opacity="0.6">Aa</text>`;

    return `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">${svg}</svg>`;
  }

  /* ══════════════════════════════════════════════════════════════════
     RENDER — Main entry point
     type: 'agent' | 'spaceship'
     size: 'full' | 'grid' | 'compact' | 'mini'
     data: blueprint or instance object
     options: { actions, statusDot, overlay, draggable, activated, clickClass }
  ══════════════════════════════════════════════════════════════════ */
  function render(type, size, data, options) {
    options = options || {};
    if (size === 'compact') return _renderCompact(type, data, options);
    if (size === 'mini')    return _renderMini(type, data, options);
    if (size === 'grid')    return _renderGrid(type, data, options);
    return _renderFull(type, data, options);
  }

  /* ── Full TCG Card — ONE unified template for all types and rarities ── */

  const _SPECIAL_SHIPS = ['USS Enterprise NCC-1701-D', 'Star Destroyer'];
  function _isSpecialShip(bp) { return _SPECIAL_SHIPS.includes(bp.name); }

  function _deriveClassId(bp) {
    if (bp.class_id) return bp.class_id;
    const _bu = typeof BlueprintUtils !== 'undefined' ? BlueprintUtils : null;
    const slots = _bu ? _bu.getSlotCount(bp, 0) : (parseInt(bp.stats?.slots || bp.stats?.crew, 10) || 0);
    if (slots >= 10) return 'class-5';
    if (slots >= 7)  return 'class-4';
    if (slots >= 4)  return 'class-3';
    if (slots >= 3)  return 'class-2';
    return 'slot-6';
  }

  const TIER_ALIAS = { lite:'scout', pro:'frigate', elite:'cruiser', free:'scout' };

  function _renderFull(type, bp, opts) {
    const isShip = type === 'spaceship';

    // ── Rarity (unified) ──
    const rarity = isShip ? (bp.rarity || 'Common').toLowerCase() : _getAgentRarity(bp).toLowerCase();
    const rarityLabel = { common:'COMMON', rare:'RARE', epic:'EPIC', legendary:'LEGENDARY', mythic:'MYTHIC' }[rarity] || 'COMMON';
    const rarityColor = (isShip ? SLOT_COLORS : RARITY_COLORS)[bp.rarity || 'Common'] || '#94a3b8';

    // ── Serial ──
    const serial = serialHash(bp.id || bp.name, isShip ? 12 : undefined);

    // ── BlueprintUtils (single source of truth) ──
    const _bu = typeof BlueprintUtils !== 'undefined' ? BlueprintUtils : null;

    // ── Text content ──
    const memberCount = _bu ? _bu.getFilledCount(bp) : ((bp._members || []).length || (bp.agent_ids || []).length);
    const classId = isShip ? _deriveClassId(bp) : null;
    const cls = isShip ? (SHIP_CLASSES[classId] || SHIP_CLASSES['slot-6'] || SHIP_CLASSES['class-1']) : null;
    const fallbackDesc = isShip
      ? `${cls.name} · ${memberCount} agent${memberCount !== 1 ? 's' : ''}`
      : [bp.role, bp.type, bp.llm_engine].filter(Boolean).join(' · ') || '';
    const desc = bp.desc || bp.description || bp.flavor || fallbackDesc;
    const marqueeText = _esc(desc);
    const flavor = bp.flavor || bp.description || bp.desc || desc;

    // ── Capabilities (same derivation for both types) ──
    const crewDefs = _bu ? _bu.getCrewDefs(bp) : (bp.metadata?.crew || bp._members || []);
    const caps = bp.caps || bp.metadata?.caps
      || (isShip && crewDefs.length ? crewDefs.map(m => '⚙ ' + (m.name || m.label || 'Agent')) : [])
      || (!isShip ? (bp.config?.tools || []).map(t => '⚙ ' + t) : []);

    // ── Stats (type-specific data, same 3-4 column layout) ──
    let statLbls, statVals;
    if (isShip) {
      const slotCount = _bu ? _bu.getSlotCount(bp) : (cls.slots.length);
      const crewCount = _bu ? _bu.getFilledCount(bp) || slotCount : (bp.stats?.crew || memberCount);
      const deployCount = bp.activation_count || bp.stats?.deployments || 0;
      statLbls = ['AGENTS','SLOTS','DEPLOYS'];
      statVals = [crewCount.toString(), slotCount.toString(), deployCount.toLocaleString()];
    } else {
      const statKeys = ['spd','acc','cap','pwr'];
      statLbls = ['SPD','ACC','CAP','PWR'];
      statVals = statKeys.map(k => bp.stats?.[k] || '&#8212;');
    }

    // ── Labels & editability ──
    const isActivated = !!opts.activated;
    const _cl = isActivated ? getCustomLabels(bp.id) : {};
    const displayName = _cl.name || bp.name;
    const roleLabel = isShip
      ? (_cl.role || bp.category || (bp.desc || bp.description || '').split(/[—–.]/)[0]?.trim() || '')
      : (_cl.role || bp.category || bp.role || '');
    const nameEditable = isActivated ? ' contenteditable="true" spellcheck="false" data-field="name"' : '';
    const roleEditable = isActivated ? ' contenteditable="true" spellcheck="false" data-field="role"' : '';

    const clickClass = opts.clickClass || 'bp-card-clickable';
    const statusDot = opts.statusDot || '';
    const draggable = opts.draggable ? ' draggable="true"' : '';
    const statusAttr = bp.status ? ` data-status="${bp.status}"` : '';
    const subtitle = bp.subtitle || bp.metadata?.subtitle || '';

    // ── Rarity badge — same treatment for ALL rarities ──
    const badgeClass = rarity === 'mythic' ? ' mythic-badge-animated' : '';
    const badgeStyle = `style="color:${rarityColor};border:1px solid ${rarityColor}"`;

    // ── Art ──
    const artContent = isShip
      ? (_isSpecialShip(bp) ? slotDiagramArt(classId, serial) : slotDiagramArt('slot-6', serial))
      : avatarArt(bp.name, bp.category || bp.role, serial);

    // ── ONE template ──
    return `<div class="tcg-card ${clickClass}" data-id="${bp.id}" data-type="${type}" data-rarity="${rarity}" data-tags="${(bp.tags||[]).join(',')}"${statusAttr}${draggable}>
      <div class="tcg-name-bar">
        <span class="tcg-name"${nameEditable}>${_esc(displayName)}</span>
        ${subtitle ? `<span class="tcg-subtitle">${_esc(subtitle)}</span>` : ''}
        ${statusDot}
      </div>
      <div class="tcg-art">
        ${roleLabel ? `<div class="tcg-art-role"><span class="tcg-serial-code"${roleEditable}>${_esc(roleLabel)}</span></div>` : ''}
        <div class="tcg-art-class"><span class="tcg-serial-code${badgeClass}" ${badgeStyle}>${rarityLabel}</span></div>
        <div class="tcg-art-serial" title="Serial: ${serial.code}"><span class="tcg-serial-code">${serial.code}</span></div>
        ${artContent}
      </div>
      <div class="tcg-marquee"><div class="tcg-marquee-track"><span>${marqueeText}</span><span>${marqueeText}</span></div></div>
      <div class="tcg-text-box">
        <p class="tcg-flavor">"${_esc(flavor)}"</p>
        ${caps.slice(0,3).map(c => `<p class="tcg-cap">${_esc(c)}</p>`).join('')}
      </div>
      ${opts.overlay ? `<div class="tcg-overlay">${opts.overlay}</div>` : ''}
      <div class="tcg-stats">
        ${statLbls.map((l,i) => `<div class="tcg-stat"><span class="tcg-stat-val">${statVals[i]}</span><span class="tcg-stat-lbl">${l}</span></div>`).join('')}
      </div>
      ${opts.footer ? `<div class="tcg-footer">${opts.footer}</div>` : ''}
      ${opts.actions ? `<div class="tcg-actions">${opts.actions}</div>` : ''}
    </div>`;
  }


  /* ── Grid TCG Card (medium density — art + name + rarity + stats) ── */
  function _renderGrid(type, data, opts) {
    const _cl = opts.activated ? getCustomLabels(data.id) : {};
    const name = _esc(_cl.name || data.name || 'Unknown');
    const draggable = opts.draggable ? ' draggable="true"' : '';
    const clickClass = opts.clickClass || '';

    let art = '', badgeHTML = '', statsHTML = '', dataAttrs = `data-id="${data.id}"`;

    if (type === 'agent') {
      const rarity = _getAgentRarity(data);
      const rarityColor = RARITY_COLORS[rarity] || RARITY_COLORS.Common;
      const serial = serialHash(data.id || data.name);
      art = avatarArt(data.name, data.category || data.role, serial);
      badgeHTML = rarity === 'Mythic'
        ? `<span class="tcg-grid-badge mythic-badge-animated">${rarity.toUpperCase()}</span>`
        : `<span class="tcg-grid-badge" style="color:${rarityColor};border-color:${rarityColor}">${rarity.toUpperCase()}</span>`;
      dataAttrs += ` data-rarity="${rarity}" data-bp-id="${data.id}"`;
      if (data.stats) {
        const lbls = ['SPD','ACC','CAP','PWR'], keys = ['spd','acc','cap','pwr'];
        statsHTML = `<div class="tcg-grid-stats">${lbls.map((l,i) => `<span><b>${data.stats[keys[i]] || '—'}</b> ${l}</span>`).join('')}</div>`;
      }
    } else if (type === 'spaceship') {
      const shipRarity = data.rarity || 'Common';
      const shipRarityColor = SLOT_COLORS[shipRarity] || '#94a3b8';
      const serial = serialHash(data.id || data.name, 12);
      const artClassId = _isSpecialShip(data) ? _deriveClassId(data) : 'slot-6';
      art = slotDiagramArt(artClassId, serial);
      badgeHTML = `<span class="tcg-grid-badge" style="color:${shipRarityColor};border-color:${shipRarityColor}">${shipRarity.toUpperCase()}</span>`;
      dataAttrs += ` data-rarity="${shipRarity.toLowerCase()}" data-bp-id="${data.id}"`;
    }

    return `<div class="tcg-card-grid ${clickClass}" ${dataAttrs}${draggable}>
      <div class="tcg-grid-art">${art}</div>
      <div class="tcg-grid-info">
        <span class="tcg-grid-name">${name}</span>
        ${badgeHTML}
      </div>
      ${statsHTML}
    </div>`;
  }

  /* ── Compact TCG Card (operational views) ── */
  function _renderCompact(type, data, opts) {
    const _cl = opts.activated ? getCustomLabels(data.id) : {};
    const name = _esc(_cl.name || data.name || 'Unknown');
    const statusDot = opts.statusDot || '';
    const actions = opts.actions || '';
    const overlay = opts.overlay || '';
    const draggable = opts.draggable ? ' draggable="true"' : '';

    let art = '';
    let badgeHTML = '';
    let metaHTML = '';
    let statsHTML = '';
    let dataAttrs = `data-id="${data.id}"`;

    if (type === 'agent') {
      const rarity = _getAgentRarity(data);
      const rarityLower = rarity.toLowerCase();
      const rarityColor = RARITY_COLORS[rarity] || RARITY_COLORS.Common;
      const serial = serialHash(data.id || data.name);
      art = avatarArt(data.name, data.category || data.role, serial);
      badgeHTML = rarity === 'Mythic'
        ? `<span class="tcg-compact-badge mythic-badge-animated">${rarity.toUpperCase()}</span>`
        : `<span class="tcg-compact-badge" style="color:${rarityColor};border-color:${rarityColor}">${rarity.toUpperCase()}</span>`;
      dataAttrs += ` data-rarity="${rarity}" data-bp-id="${data.id}" data-status="${data.status || ''}"`;

      const config = data.config || {};
      const roleTags = [data.llm_engine || 'claude-4', data.type || 'Specialist'].filter(Boolean);
      metaHTML = `<div class="tcg-compact-meta">
        ${roleTags.map(t => `<span class="agent-tag">${_esc(t)}</span>`).join('')}
        ${data.status ? `<span class="agent-tag status-tag-${data.status}">${_esc(data.status)}</span>` : ''}
      </div>`;
      if (config.tools && config.tools.length) {
        metaHTML += `<div class="tcg-compact-tools">${config.tools.slice(0,3).map(t => `<span class="agent-tool-tag">${_esc(t)}</span>`).join('')}${config.tools.length > 3 ? `<span class="agent-tool-tag">+${config.tools.length - 3}</span>` : ''}</div>`;
      }

      // Stats bar
      const statKeys = data.stats ? ['spd','acc','cap','pwr'] : [];
      if (statKeys.length && data.stats) {
        const lbls = ['SPD','ACC','CAP','PWR'];
        statsHTML = `<div class="tcg-compact-stats">${lbls.map((l,i) => `<span class="tcg-compact-stat"><b>${data.stats[statKeys[i]] || '—'}</b> ${l}</span>`).join('')}</div>`;
      }
    } else if (type === 'spaceship') {
      const shipRarity = data.rarity || 'Common';
      const shipRarityColor = SLOT_COLORS[shipRarity] || '#94a3b8';
      const serial = serialHash(data.id || data.name, 12);
      const artClassId = _isSpecialShip(data) ? _deriveClassId(data) : 'slot-6';
      art = slotDiagramArt(artClassId, serial);
      badgeHTML = `<span class="tcg-compact-badge" style="color:${shipRarityColor};border-color:${shipRarityColor}">${shipRarity.toUpperCase()}</span>`;
      dataAttrs += ` data-rarity="${shipRarity.toLowerCase()}" data-status="${data.status || ''}"`;

      const members = data._members || [];
      const memberCount = members.length || (data.agent_ids || []).length;
      metaHTML = `<div class="tcg-compact-meta">
        <span class="agent-tag">${memberCount} agent${memberCount !== 1 ? 's' : ''}</span>
        <span class="agent-tag">${shipRarity}</span>
        ${data.status ? `<span class="agent-tag status-tag-${data.status}">${_esc(data.status)}</span>` : ''}
      </div>`;

      if (data.stats) {
        const isAct = !!data.class_id;
        const deployCount = data.activation_count || data.stats?.deployments || 0;
        const lbls = isAct ? ['AGENTS','SLOTS','DEPLOYS'] : ['AGENTS'];
        const vals = isAct
          ? [data.stats.crew || '—', data.stats.slots || '—', deployCount.toLocaleString()]
          : [data.stats.crew || '—'];
        statsHTML = `<div class="tcg-compact-stats">${lbls.map((l,i) => `<span class="tcg-compact-stat"><b>${vals[i]}</b> ${l}</span>`).join('')}</div>`;
      }
    }
    const clickClass = opts.clickClass || '';

    return `<div class="tcg-card-compact ${clickClass}" ${dataAttrs}${draggable}>
      <div class="tcg-compact-art">${art}</div>
      <div class="tcg-compact-body">
        <div class="tcg-compact-header">
          <span class="tcg-compact-name">${name}</span>
          ${badgeHTML}
          ${statusDot}
        </div>
        ${metaHTML}
        ${statsHTML}
        ${overlay}
      </div>
      ${actions ? `<div class="tcg-compact-actions">${actions}</div>` : ''}
    </div>`;
  }

  /* ── Mini TCG Card (dock / inventory) ── */
  function _renderMini(type, data, opts) {
    const _cl = opts.activated ? getCustomLabels(data.id) : {};
    const name = _esc(_cl.name || data.name || 'Unknown');
    const draggable = opts.draggable ? ' draggable="true"' : '';
    const assigned = opts.assigned ? ' assigned' : '';

    let art = '';
    let badgeColor = '#94a3b8';
    let badgeLabel = '';
    let dataAttrs = `data-id="${data.id}"`;

    if (type === 'agent') {
      const rarity = _getAgentRarity(data);
      badgeColor = RARITY_COLORS[rarity] || RARITY_COLORS.Common;
      badgeLabel = rarity;
      const serial = serialHash(data.id || data.name);
      art = avatarArt(data.name, data.category || data.role, serial);
      dataAttrs += ` data-bp-id="${data.id}" data-rarity="${rarity}"`;
    } else if (type === 'spaceship') {
      const shipRarity = data.rarity || 'Common';
      badgeColor = SLOT_COLORS[shipRarity] || '#94a3b8';
      badgeLabel = shipRarity;
      const serial = serialHash(data.id || data.name, 12);
      const artClassId = _isSpecialShip(data) ? _deriveClassId(data) : 'slot-6';
      art = slotDiagramArt(artClassId, serial);
    }

    return `<div class="tcg-card-mini${assigned}" ${dataAttrs}${draggable} style="border-color:${badgeColor}">
      <span class="tcg-mini-name">${name}</span>
      <div class="tcg-mini-art">${art}</div>
      <span class="tcg-mini-badge" style="background:${badgeColor}">${badgeLabel}</span>
    </div>`;
  }

  /* ── Helper: get agent rarity ── */
  function _getAgentRarity(data) {
    if (data.rarity) return data.rarity;
    if (typeof Gamification !== 'undefined') {
      const r = Gamification.calcAgentRarity(data);
      return r?.name || 'Common';
    }
    return 'Common';
  }

  /* ── Custom name/role persistence ── */
  const _CUSTOM_KEY = 'nice-bp-custom-labels';
  function getCustomLabels(id) {
    try { const m = JSON.parse(localStorage.getItem(_CUSTOM_KEY) || '{}'); return m[id] || {}; } catch(e) { return {}; }
  }
  function setCustomLabel(id, field, value) {
    try {
      const m = JSON.parse(localStorage.getItem(_CUSTOM_KEY) || '{}');
      if (!m[id]) m[id] = {};
      m[id][field] = value;
      localStorage.setItem(_CUSTOM_KEY, JSON.stringify(m));
    } catch(e) {}
  }
  function bindEditableCards(container) {
    if (!container) return;
    container.addEventListener('blur', function(e) {
      const el = e.target;
      if (!el.matches || !el.matches('[contenteditable="true"][data-field]')) return;
      const card = el.closest('[data-id]');
      if (!card) return;
      const id = card.dataset.id;
      const field = el.dataset.field;
      const val = el.textContent.trim();
      if (id && field && val) setCustomLabel(id, field, val);
    }, true);
    container.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && e.target.matches && e.target.matches('[contenteditable="true"][data-field]')) {
        e.preventDefault();
        e.target.blur();
      }
    }, true);
  }

  /* ── Public API ── */
  return {
    render,
    roleColor,
    avatarArt,
    slotDiagramArt,
    paletteArt,
    serialHash,
    getCustomLabels,
    setCustomLabel,
    bindEditableCards,
    RARITY_COLORS,
    ROLE_COLORS,
    CATEGORY_COLORS,
    SHIP_CLASSES,
    TIER_ALIAS,
    NS_LOGO_MINI,
    NS_LOGO_BTN,
    AGENT_ICON_BTN,
  };
})();
