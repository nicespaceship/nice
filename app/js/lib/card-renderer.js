/* ═══════════════════════════════════════════════════════════════════
   NICE — Card Renderer
   Shared TCG card rendering for agents, spaceships, and themes.
   Three sizes: full (terminal), compact (operational), mini (dock).
═══════════════════════════════════════════════════════════════════ */

const CardRenderer = (() => {
  const _esc = Utils.esc;

  /* ── Constants ── */
  const RARITY_COLORS = BlueprintUtils.RARITY_COLORS;

  const ROLE_COLORS = BlueprintUtils.CATEGORY_COLORS;
  const CATEGORY_COLORS = BlueprintUtils.CATEGORY_COLORS;

  const SHIP_CLASSES = BlueprintUtils.SHIP_CLASSES;

  const SLOT_COLORS = RARITY_COLORS; // Same colors — unified via BlueprintUtils



  const NS_LOGO_MINI = '<svg viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg" style="width:1.5em;height:1.5em;vertical-align:-.2em;margin-right:.35em" fill="currentColor"><path d="M962.08,762.91c-3.6,3.81-23,22.39-23.4,25.12s1.65,9.46,1.81,12.8c6.2,134.27-22.47,251.36-96.57,363.41-10.14,15.32-44.07,64.4-57.7,72.3-10.64,6.16-17.08,4.1-26.74-2.68l-205.91-206.08-2.61-1.47c-13.79,3.14-27.33,7.97-41.2,10.78-12.14,2.46-39.23,7.32-50.52,5.02-5.43-1.11-8.8-8.83-13.02-7.63-56.83,48.42-130.21,76.33-203.49,88.59-23.32,3.9-79.67,11.72-100.43,4.99-28.92-9.37-32.15-31.74-31.74-58.17,1.36-87.99,28.47-185.28,80.14-256.85,2.24-3.1,15.39-18.18,15.71-19.38.7-2.69-7.89-8.08-8.8-14.88-1.33-9.98,3.07-34.86,5.18-45.64,2.91-14.86,7.64-29.47,11.6-44.06L6.97,481.35c-6.58-10.16-9.77-14.46-3.86-25.92,4.89-9.48,28.96-27.24,38.49-34.51,113.03-86.2,243.65-127.64,386.44-121.64,5.01.21,23.34,2.94,26.44,1.52,117.49-117.68,260.78-215.29,420.81-265.18,95.99-29.93,217.05-45.19,316.54-29.13,13.03,2.1,32.43,2.67,37.16,16.84,5.97,17.89,9.64,56.02,10.55,75.45,12,255.12-107.2,483.74-277.46,664.12ZM842.3,261.63c-101.28,8.13-152.88,125.4-90.22,205.62,56.08,71.8,169.37,61.28,211.94-18.9,46.73-88.01-22.45-194.69-121.72-186.72ZM276.84,862.98c-1.02-.92-3.11-5.35-5.37-4.22-.87.43-8.43,11.31-9.79,13.25-32.97,47.21-49,105.67-56.19,162.31,1.77,1.77,42.17-6.13,48.04-7.46,31.2-7.03,64.74-18.77,92.63-34.37,4.52-2.53,34.5-21.3,35.27-23.8.34-1.12-.09-2.12-.89-2.92-35.52-32.96-67.86-70.35-103.71-102.79Z"/></svg>';

  const NS_LOGO_BTN = '<svg viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg" style="width:10px;height:10px;display:block" fill="currentColor"><path d="M962.08,762.91c-3.6,3.81-23,22.39-23.4,25.12s1.65,9.46,1.81,12.8c6.2,134.27-22.47,251.36-96.57,363.41-10.14,15.32-44.07,64.4-57.7,72.3-10.64,6.16-17.08,4.1-26.74-2.68l-205.91-206.08-2.61-1.47c-13.79,3.14-27.33,7.97-41.2,10.78-12.14,2.46-39.23,7.32-50.52,5.02-5.43-1.11-8.8-8.83-13.02-7.63-56.83,48.42-130.21,76.33-203.49,88.59-23.32,3.9-79.67,11.72-100.43,4.99-28.92-9.37-32.15-31.74-31.74-58.17,1.36-87.99,28.47-185.28,80.14-256.85,2.24-3.1,15.39-18.18,15.71-19.38.7-2.69-7.89-8.08-8.8-14.88-1.33-9.98,3.07-34.86,5.18-45.64,2.91-14.86,7.64-29.47,11.6-44.06L6.97,481.35c-6.58-10.16-9.77-14.46-3.86-25.92,4.89-9.48,28.96-27.24,38.49-34.51,113.03-86.2,243.65-127.64,386.44-121.64,5.01.21,23.34,2.94,26.44,1.52,117.49-117.68,260.78-215.29,420.81-265.18,95.99-29.93,217.05-45.19,316.54-29.13,13.03,2.1,32.43,2.67,37.16,16.84,5.97,17.89,9.64,56.02,10.55,75.45,12,255.12-107.2,483.74-277.46,664.12ZM842.3,261.63c-101.28,8.13-152.88,125.4-90.22,205.62,56.08,71.8,169.37,61.28,211.94-18.9,46.73-88.01-22.45-194.69-121.72-186.72ZM276.84,862.98c-1.02-.92-3.11-5.35-5.37-4.22-.87.43-8.43,11.31-9.79,13.25-32.97,47.21-49,105.67-56.19,162.31,1.77,1.77,42.17-6.13,48.04-7.46,31.2-7.03,64.74-18.77,92.63-34.37,4.52-2.53,34.5-21.3,35.27-23.8.34-1.12-.09-2.12-.89-2.92-35.52-32.96-67.86-70.35-103.71-102.79Z"/></svg>';

  const AGENT_ICON_BTN = '<svg viewBox="0 0 24 24" style="width:12px;height:12px;display:block" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="8" width="10" height="8" rx="2"/><path d="M9 2h6M12 2v6"/><circle cx="9.5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="12" r="1" fill="currentColor" stroke="none"/><path d="M9 16v2M15 16v2M3 12h4M17 12h4"/></svg>';

  const FLIP_ICON_BTN = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><polyline points="21 3 21 8 16 8"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><polyline points="3 21 3 16 8 16"/></svg>';

  /* ── Ship front tab icons (Lucide-style 12px line glyphs) ── */
  const TAB_ICONS = {
    crew:         '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    specialties:  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>',
    workflows:    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/></svg>',
    protocols:    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>',
  };

  /* Tabs on the front of a ship card. Crew is the live default; the
     others are Coming-soon placeholders until per-tab seed data lands
     (specialties, workflows, protocols). Hovering an icon surfaces
     its title as an overlay in the art zone above. */
  const SHIP_FRONT_TABS = [
    { id: 'crew',         title: 'Crew',        icon: TAB_ICONS.crew        },
    { id: 'specialties',  title: 'Specialties', icon: TAB_ICONS.specialties },
    { id: 'workflows',    title: 'Workflows',   icon: TAB_ICONS.workflows   },
    { id: 'protocols',    title: 'Protocols',   icon: TAB_ICONS.protocols   },
  ];

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

  /* ── Slot Diagram Art (spaceship cards) ──
     Renders the ship's slot constellation. When `opts.slots` is supplied
     (each slot { min_class, max?, maxRarity? }), the diagram shows every
     slot the ship defines and dims/locks the ones above the viewer's
     current class so the growth ladder is visible from rank 1. Without
     `opts.slots` the function falls back to the synthetic class layout
     (used for catalog-card art before crew data has loaded). */
  function slotDiagramArt(classId, serial, opts) {
    opts = opts || {};
    const cls = SHIP_CLASSES[classId] || SHIP_CLASSES['class-1'];

    // Tests + early-boot renders (before Gamification has loaded) treat
    // every slot as unlocked so the visual is never broken in those
    // environments. Live UI hits the real comparator.
    const _gam = typeof Gamification !== 'undefined' ? Gamification : null;
    const userRank = _gam && _gam.getCurrentClass ? _gam.getClassRank(_gam.getCurrentClass().id || 'class-1') : 99;
    const slotRank = (s) => _gam && _gam.getClassRank ? _gam.getClassRank(s && s.min_class) : 0;
    const isLocked = (s) => slotRank(s) > userRank;

    // Front-of-card art now shows only the slots the viewer has
    // unlocked. Locked slots are surfaced elsewhere (drawer crew
    // roster, class progression display) — keeping the screen as a
    // clean canvas for the active crew.
    const liveSlots = Array.isArray(opts.slots) && opts.slots.length ? opts.slots : null;
    const allSlots = liveSlots || cls.slots;
    const slots = allSlots.filter(s => !isLocked(s));
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
    const LOCKED_COLOR = '#475569';

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
      if (!a || !b) return;
      // Connections fade when either endpoint is locked, so the unlocked
      // half of the ship reads as the "alive" graph and the locked half
      // as the future expansion.
      const dimmed = isLocked(slots[pair[0]]) || isLocked(slots[pair[1]]);
      svg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#3b82f6" stroke-width="0.6" opacity="${dimmed ? 0.04 : 0.1}"/>`;
    });

    positions.forEach((p, i) => {
      const dimmed = isLocked(slots[i]);
      svg += `<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" stroke="#3b82f6" stroke-width="0.8" opacity="${dimmed ? 0.05 : 0.12}"/>`;
    });

    // Cap slot rendering to the number of available positions (class-3 has
    // 10 slots, class-5 has 24, but the position layout only goes up to 12).
    const renderSlots = slots.slice(0, positions.length);

    renderSlots.forEach((slot, i) => {
      const p = positions[i];
      const locked = isLocked(slot);
      const color = locked ? LOCKED_COLOR : (SLOT_COLORS[slot.max || slot.maxRarity] || '#6366f1');
      const r = 14;
      const ringOpacity = locked ? 0.35 : 0.7;
      svg += `<circle cx="${p.x}" cy="${p.y}" r="${r + 3}" fill="${color}" opacity="${locked ? 0.05 : 0.12}"/>`;
      svg += `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="none" stroke="${color}" stroke-width="${locked ? 1 : 1.5}" stroke-dasharray="${locked ? '2,3' : '5,3'}" opacity="${ringOpacity}"/>`;
      svg += `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${color}" opacity="${locked ? 0.03 : 0.06}"/>`;
      if (locked) {
        // Lock glyph — small padlock centered on the slot.
        const lx = p.x - 4, ly = p.y - 4;
        svg += `<g transform="translate(${lx},${ly})" fill="${color}" stroke="${color}" stroke-width="0.6" opacity="0.85">` +
                 `<rect x="0" y="3.5" width="8" height="5" rx="0.8"/>` +
                 `<path d="M2,3.5 L2,2 a2,2 0 0,1 4,0 L6,3.5" fill="none"/>` +
               `</g>`;
      } else {
        svg += `<text x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="central" fill="${color}" font-size="12" font-weight="300" opacity="0.6">+</text>`;
      }
    });

    renderSlots.forEach((slot, i) => {
      if (isLocked(slot)) return; // No orbital motion on locked slots.
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
      if (!a || !b) return;
      // Skip travel particles for edges that touch a locked slot — the
      // path is "asleep" until that side wakes up.
      if (isLocked(slots[pair[0]]) || isLocked(slots[pair[1]])) return;
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

  /* ── Node Hex Art (spaceship cards, ported from marketing inside-stage)
     Central pulsing core with 6 nodes arranged in a vertically-compressed
     hex (top + bottom pulled in for the 200×120 rectangle). Data lines
     connect core ↔ each node; particles travel core → node on a stagger.
     Each node is colored by its slot's class (C1 slate / C2 light blue /
     C3 purple / C4 amber) so the animation stays tied to the user's
     specific ship. Only unlocked slots render; locked ones live in the
     drawer + Crew tab. */
  function nodeHexArt(slots, serial) {
    if (!serial) serial = serialHash('nodeHex', 12);

    // Locked-slot filter — same logic as slotDiagramArt's gating.
    const _gam = typeof Gamification !== 'undefined' ? Gamification : null;
    const userRank = _gam && _gam.getCurrentClass ? _gam.getClassRank(_gam.getCurrentClass().id || 'class-1') : 99;
    const slotRank = (s) => _gam && _gam.getClassRank ? _gam.getClassRank(s && s.min_class) : 0;
    const isLocked = (s) => slotRank(s) > userRank;

    const allSlots = (slots || []).filter(Boolean);
    const unlocked = allSlots.filter(s => !isLocked(s)).slice(0, 6);

    // Vertically-compressed hex: top + bottom pulled in (y closer to center),
    // sides at full horizontal reach. Fits the 200×120 rectangle cleanly.
    const positions = [
      { x: 100, y: 22 },   // top
      { x: 162, y: 38 },   // top-right
      { x: 162, y: 82 },   // bottom-right
      { x: 100, y: 98 },   // bottom
      { x:  38, y: 82 },   // bottom-left
      { x:  38, y: 38 },   // top-left
    ].slice(0, unlocked.length);

    const cx = 100, cy = 60;
    const slotColor = (s) => SLOT_COLORS[s && (s.max || s.maxRarity || ({
      'class-1': 'Common', 'class-2': 'Rare', 'class-3': 'Epic', 'class-4': 'Legendary', 'class-5': 'Legendary',
    })[s && s.min_class])] || '#94a3b8';

    let svg = `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">`;

    // Faint grid background — keeps the screen feeling like a display.
    svg += `<g opacity="0.06" stroke="#6366f1" stroke-width="0.4">
      <line x1="0" y1="30" x2="200" y2="30"/>
      <line x1="0" y1="60" x2="200" y2="60"/>
      <line x1="0" y1="90" x2="200" y2="90"/>
      <line x1="50" y1="0" x2="50" y2="120"/>
      <line x1="100" y1="0" x2="100" y2="120"/>
      <line x1="150" y1="0" x2="150" y2="120"/>
    </g>`;

    // Data lines core → node. Drawn first so nodes and core sit on top.
    positions.forEach((p, i) => {
      const color = slotColor(unlocked[i]);
      svg += `<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" stroke="${color}" stroke-width="0.7" opacity="0.32"/>`;
    });

    // Traveling particles — core → node, staggered loop. SVG <animate>
    // inline so each card is self-contained; no global CSS keyframes
    // needed. No drop-shadow filter (Safari can't animate it smoothly).
    positions.forEach((p, i) => {
      const dur = 2.4;
      const delay = 0.18 * i;
      const color = slotColor(unlocked[i]);
      svg += `<circle r="1.6" fill="${color}" opacity="0">
        <animate attributeName="opacity" values="0;0.95;0.95;0" dur="${dur}s" begin="${delay}s" repeatCount="indefinite" keyTimes="0;0.12;0.88;1"/>
        <animate attributeName="cx" values="${cx};${p.x}" dur="${dur}s" begin="${delay}s" repeatCount="indefinite"/>
        <animate attributeName="cy" values="${cy};${p.y}" dur="${dur}s" begin="${delay}s" repeatCount="indefinite"/>
      </circle>`;
    });

    // Pulsing core — concentric rings + bright center. Outer halo
    // breathes via r-attribute animation (works in all modern browsers,
    // including Safari, without filter recompute).
    svg += `<circle cx="${cx}" cy="${cy}" r="13" fill="none" stroke="#6366f1" stroke-width="0.5" opacity="0.35">
      <animate attributeName="r" values="11;15;11" dur="3s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.45;0.15;0.45" dur="3s" repeatCount="indefinite"/>
    </circle>`;
    svg += `<circle cx="${cx}" cy="${cy}" r="9" fill="rgba(99, 102, 241, 0.10)"/>`;
    svg += `<circle cx="${cx}" cy="${cy}" r="6" fill="#6366f1" opacity="0.85"/>`;
    svg += `<circle cx="${cx}" cy="${cy}" r="2.5" fill="#ffffff" opacity="0.9"/>`;

    // Nodes — halo + ring + filled dot at each hex position.
    positions.forEach((p, i) => {
      const color = slotColor(unlocked[i]);
      svg += `<circle cx="${p.x}" cy="${p.y}" r="8" fill="${color}" opacity="0.12"/>`;
      svg += `<circle cx="${p.x}" cy="${p.y}" r="5.5" fill="none" stroke="${color}" stroke-width="1" opacity="0.7"/>`;
      svg += `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${color}" opacity="0.9"/>`;
    });

    svg += `</svg>`;
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

  /* Renders one front-tab's panel. Crew tab uses the crew list; the
     other three are Coming-soon stubs so the strip reads as wired
     even before per-tab seed data lands. */
  function _renderFrontTabPanel(tabId, bp) {
    if (tabId === 'crew') {
      const crewHTML = _renderCrewList(bp);
      return crewHTML || `<p class="blueprint-card-front-empty">No crew defined.</p>`;
    }
    const label = (SHIP_FRONT_TABS.find(t => t.id === tabId) || {}).title || tabId;
    return `<div class="blueprint-card-front-soon">
        <p class="blueprint-card-front-soon-title">${_esc(label)}</p>
        <p class="blueprint-card-front-soon-hint">Coming soon</p>
      </div>`;
  }

  /* ── Front crew list (ships only) ──
     Renders the 12-role roster as a dense 2-column list with
     class-color dots. Reused inside the Crew tab panel; mirrors the
     drawer's class-number derivation so visual language is consistent. */
  function _renderCrewList(bp) {
    const crew = bp.crew || bp.config?.crew_roles || bp.metadata?.crew || [];
    if (!crew.length) return '';
    return `<ul class="blueprint-card-crew-list">${crew.map(slot => {
      const label = slot.label || slot.role || 'Slot';
      const minClass = slot.min_class || 'class-1';
      const classNum = parseInt((minClass.match(/(\d+)/) || [])[1] || '1', 10);
      return `<li class="blueprint-card-crew-item bp-crew-c${classNum}" title="${_esc(label)} — Class ${classNum}"><span class="blueprint-card-crew-dot"></span><span class="blueprint-card-crew-label">${_esc(label)}</span></li>`;
    }).join('')}</ul>`;
  }

  /* ── Back-face content ──
     Front of card is the visual artifact. Back is the "rules text" — the
     discipline the card encodes (ships) or the operating spec (agents).
     Parser is permissive: matches the bullet block under a "How (you|to)
     work:" header in seeded prompts, falls back to caps when absent so
     custom blueprints still render something.  */

  function _extractDisciplines(prompt) {
    if (!prompt || typeof prompt !== 'string') return [];
    const lines = prompt.split('\n');
    const startIdx = lines.findIndex(l => /^\s*How (?:you|to) work:\s*$/.test(l));
    if (startIdx === -1) return [];

    const bullets = [];
    let current = null;
    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (/^[A-Z][^:\n]{0,60}:$/.test(trimmed) && trimmed !== '-') {
        if (current !== null) { bullets.push(current.trim()); current = null; }
        break;
      }

      if (/^\s*-\s+/.test(line)) {
        if (current !== null) bullets.push(current.trim());
        current = line.replace(/^\s*-\s+/, '');
      } else if (current !== null && trimmed) {
        current += ' ' + trimmed;
      } else if (current !== null && !trimmed) {
        bullets.push(current.trim());
        current = null;
      }
    }
    if (current !== null) bullets.push(current.trim());
    return bullets.filter(Boolean);
  }

  function _renderShipBack(bp) {
    const prompt = bp.config?.ship_system_prompt || bp.ship_system_prompt || '';
    const disciplines = _extractDisciplines(prompt);
    const caps = bp.caps || bp.card?.caps || bp.metadata?.caps || [];
    const items = disciplines.length ? disciplines : caps;
    const title = disciplines.length ? 'Discipline' : 'Capabilities';

    const body = items.length
      ? `<ul class="blueprint-card-back-list">${items.map(d => `<li>${_esc(d)}</li>`).join('')}</ul>`
      : `<p class="blueprint-card-back-empty">No discipline notes yet.</p>`;

    return `<div class="blueprint-card-back-header"><span class="blueprint-card-back-title">${title}</span></div>
      <div class="blueprint-card-back-body">${body}</div>`;
  }

  function _renderAgentBack(bp) {
    const prompt = bp.config?.system_prompt || bp.system_prompt || bp.config?.prompt || '';
    const tools = bp.config?.tools || [];
    const model = bp.llm_engine || bp.config?.llm_engine || '';

    const promptHTML = prompt
      ? `<p class="blueprint-card-back-prompt">${_esc(prompt)}</p>`
      : `<p class="blueprint-card-back-empty">No system prompt set.</p>`;

    const toolsHTML = tools.length
      ? `<div class="blueprint-card-back-section">
           <span class="blueprint-card-back-label">Tools</span>
           <div class="blueprint-card-back-chips">${tools.map(t => `<span class="blueprint-card-back-chip">${_esc(t)}</span>`).join('')}</div>
         </div>`
      : '';

    const modelHTML = model
      ? `<div class="blueprint-card-back-section">
           <span class="blueprint-card-back-label">Model</span>
           <span class="blueprint-card-back-chip blueprint-card-back-chip-model">${_esc(model)}</span>
         </div>`
      : '';

    return `<div class="blueprint-card-back-header"><span class="blueprint-card-back-title">System Prompt</span></div>
      <div class="blueprint-card-back-body">${promptHTML}${toolsHTML}${modelHTML}</div>`;
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

    const clickClass = opts.clickClass || 'blueprint-clickable';
    const statusDot = opts.statusDot || '';
    const draggable = opts.draggable ? ' draggable="true"' : '';
    const statusAttr = bp.status ? ` data-status="${bp.status}"` : '';
    const subtitle = bp.subtitle || bp.metadata?.subtitle || '';

    // ── Rarity badge — same treatment for ALL rarities ──
    const badgeClass = rarity === 'mythic' ? ' mythic-badge-animated' : '';
    const badgeStyle = `style="color:${rarityColor};border:1px solid ${rarityColor}"`;

    // ── Art ──
    // Ship cards on the front use the ported marketing inside-stage
    // animation (nodeHexArt): pulsing core + 6 unlocked nodes in
    // compressed hex + flowing particles. Agent cards keep avatarArt.
    const shipSlots = isShip ? BlueprintUtils.getCrewDefs(bp) : null;
    const artContent = isShip
      ? nodeHexArt(shipSlots, serial)
      : avatarArt(bp.name, bp.category || bp.role, serial);

    // ── Back face content (rules text) ──
    const backHTML = isShip ? _renderShipBack(bp) : _renderAgentBack(bp);

    // ── ONE template ──
    // Front face wraps the existing card content. Back face holds the
    // rules text. Flip button lives in the perspective container outside
    // the rotating inner so it stays in place across the flip.
    return `<div class="blueprint-card ${clickClass}" data-id="${bp.id}" data-type="${type}" data-rarity="${rarity}" data-tags="${(bp.tags||[]).join(',')}"${statusAttr}${draggable}>
      <button class="blueprint-card-flip-btn" type="button" data-action="flip-card" aria-label="Flip card" title="Flip card">${FLIP_ICON_BTN}</button>
      <div class="blueprint-card-inner">
        <div class="blueprint-card-front">
          <div class="blueprint-card-name-bar">
            <span class="blueprint-card-name"${nameEditable}>${_esc(displayName)}</span>
            ${subtitle ? `<span class="blueprint-card-subtitle">${_esc(subtitle)}</span>` : ''}
            ${statusDot}
          </div>
          <div class="blueprint-card-sub-header">
            ${roleLabel
              ? `<span class="blueprint-card-sub-category"${roleEditable}>${_esc(roleLabel)}</span>`
              : '<span class="blueprint-card-sub-category"></span>'}
            <span class="blueprint-card-sub-rarity${badgeClass}" ${badgeStyle}>${rarityLabel}</span>
          </div>
          <div class="blueprint-card-art">
            ${artContent}
            ${isShip ? `<div class="blueprint-card-art-hover-title"><span></span></div>` : ''}
          </div>
          ${isShip
            ? `<div class="blueprint-card-front-tabs" role="tablist">
                ${SHIP_FRONT_TABS.map((t, i) => `<button type="button" class="blueprint-card-front-tab${i === 0 ? ' active' : ''}" data-tab="${t.id}" data-title="${_esc(t.title)}" aria-label="${_esc(t.title)}" title="${_esc(t.title)}">${t.icon}</button>`).join('')}
              </div>`
            : `<div class="blueprint-card-marquee"><div class="blueprint-card-marquee-track"><span>${marqueeText}</span><span>${marqueeText}</span></div></div>`}
          <div class="blueprint-card-text-box">
            ${isShip
              ? SHIP_FRONT_TABS.map((t, i) => `<div class="blueprint-card-front-panel${i === 0 ? ' active' : ''}" data-tab="${t.id}">${_renderFrontTabPanel(t.id, bp)}</div>`).join('')
              : `<p class="blueprint-card-flavor">"${_esc(flavor)}"</p>${caps.slice(0,3).map(c => `<p class="blueprint-card-cap">${_esc(c)}</p>`).join('')}`}
          </div>
          ${opts.overlay ? `<div class="blueprint-card-overlay">${opts.overlay}</div>` : ''}
          ${isShip ? '' : `<div class="blueprint-card-stats">
            ${statLbls.map((l,i) => `<div class="blueprint-card-stat"><span class="blueprint-card-stat-val">${statVals[i]}</span><span class="blueprint-card-stat-lbl">${l}</span></div>`).join('')}
          </div>`}
          ${opts.footer ? `<div class="blueprint-card-footer">${opts.footer}</div>` : ''}
          ${opts.actions ? `<div class="blueprint-card-actions">${opts.actions}</div>` : ''}
        </div>
        <div class="blueprint-card-back">${backHTML}</div>
      </div>
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
        ? `<span class="blueprint-card-grid-badge mythic-badge-animated">${rarity.toUpperCase()}</span>`
        : `<span class="blueprint-card-grid-badge" style="color:${rarityColor};border-color:${rarityColor}">${rarity.toUpperCase()}</span>`;
      dataAttrs += ` data-rarity="${rarity}" data-bp-id="${data.id}"`;
      if (data.stats) {
        const lbls = ['SPD','ACC','CAP','PWR'], keys = ['spd','acc','cap','pwr'];
        statsHTML = `<div class="blueprint-card-grid-stats">${lbls.map((l,i) => `<span><b>${data.stats[keys[i]] || '—'}</b> ${l}</span>`).join('')}</div>`;
      }
    } else if (type === 'spaceship') {
      const shipRarity = data.rarity || 'Common';
      const shipRarityColor = SLOT_COLORS[shipRarity] || '#94a3b8';
      const serial = serialHash(data.id || data.name, 12);
      const artClassId = _isSpecialShip(data) ? _deriveClassId(data) : 'slot-6';
      const shipSlots = BlueprintUtils.getCrewDefs(data);
      const slotOpts = shipSlots.length ? { slots: shipSlots } : undefined;
      art = slotDiagramArt(artClassId, serial, slotOpts);
      badgeHTML = `<span class="blueprint-card-grid-badge" style="color:${shipRarityColor};border-color:${shipRarityColor}">${shipRarity.toUpperCase()}</span>`;
      dataAttrs += ` data-rarity="${shipRarity.toLowerCase()}" data-bp-id="${data.id}"`;
    }

    return `<div class="blueprint-card-grid ${clickClass}" ${dataAttrs}${draggable}>
      <div class="blueprint-card-grid-art">${art}</div>
      <div class="blueprint-card-grid-info">
        <span class="blueprint-card-grid-name">${name}</span>
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
        ? `<span class="blueprint-card-compact-badge mythic-badge-animated">${rarity.toUpperCase()}</span>`
        : `<span class="blueprint-card-compact-badge" style="color:${rarityColor};border-color:${rarityColor}">${rarity.toUpperCase()}</span>`;
      dataAttrs += ` data-rarity="${rarity}" data-bp-id="${data.id}" data-status="${data.status || ''}"`;

      const config = data.config || {};
      const roleTags = [data.llm_engine || 'claude-4-6-sonnet', data.type || 'Specialist'].filter(Boolean);
      metaHTML = `<div class="blueprint-card-compact-meta">
        ${roleTags.map(t => `<span class="agent-tag">${_esc(t)}</span>`).join('')}
        ${data.status ? `<span class="agent-tag status-tag-${data.status}">${_esc(data.status)}</span>` : ''}
      </div>`;
      if (config.tools && config.tools.length) {
        metaHTML += `<div class="blueprint-card-compact-tools">${config.tools.slice(0,3).map(t => `<span class="agent-tool-tag">${_esc(t)}</span>`).join('')}${config.tools.length > 3 ? `<span class="agent-tool-tag">+${config.tools.length - 3}</span>` : ''}</div>`;
      }

      // Stats bar
      const statKeys = data.stats ? ['spd','acc','cap','pwr'] : [];
      if (statKeys.length && data.stats) {
        const lbls = ['SPD','ACC','CAP','PWR'];
        statsHTML = `<div class="blueprint-card-compact-stats">${lbls.map((l,i) => `<span class="blueprint-card-compact-stat"><b>${data.stats[statKeys[i]] || '—'}</b> ${l}</span>`).join('')}</div>`;
      }
    } else if (type === 'spaceship') {
      const shipRarity = data.rarity || 'Common';
      const shipRarityColor = SLOT_COLORS[shipRarity] || '#94a3b8';
      const serial = serialHash(data.id || data.name, 12);
      const artClassId = _isSpecialShip(data) ? _deriveClassId(data) : 'slot-6';
      const shipSlots = BlueprintUtils.getCrewDefs(data);
      const slotOpts = shipSlots.length ? { slots: shipSlots } : undefined;
      art = slotDiagramArt(artClassId, serial, slotOpts);
      badgeHTML = `<span class="blueprint-card-compact-badge" style="color:${shipRarityColor};border-color:${shipRarityColor}">${shipRarity.toUpperCase()}</span>`;
      dataAttrs += ` data-rarity="${shipRarity.toLowerCase()}" data-status="${data.status || ''}"`;

      const members = data._members || [];
      const memberCount = members.length || (data.agent_ids || []).length;
      metaHTML = `<div class="blueprint-card-compact-meta">
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
        statsHTML = `<div class="blueprint-card-compact-stats">${lbls.map((l,i) => `<span class="blueprint-card-compact-stat"><b>${vals[i]}</b> ${l}</span>`).join('')}</div>`;
      }
    }
    const clickClass = opts.clickClass || '';

    return `<div class="blueprint-card-compact ${clickClass}" ${dataAttrs}${draggable}>
      <div class="blueprint-card-compact-art">${art}</div>
      <div class="blueprint-card-compact-body">
        <div class="blueprint-card-compact-header">
          <span class="blueprint-card-compact-name">${name}</span>
          ${badgeHTML}
          ${statusDot}
        </div>
        ${metaHTML}
        ${statsHTML}
        ${overlay}
      </div>
      ${actions ? `<div class="blueprint-card-compact-actions">${actions}</div>` : ''}
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
      const shipSlots = BlueprintUtils.getCrewDefs(data);
      const slotOpts = shipSlots.length ? { slots: shipSlots } : undefined;
      art = slotDiagramArt(artClassId, serial, slotOpts);
    }

    return `<div class="blueprint-card-mini${assigned}" ${dataAttrs}${draggable} style="border-color:${badgeColor}">
      <span class="blueprint-card-mini-name">${name}</span>
      <div class="blueprint-card-mini-art">${art}</div>
      <span class="blueprint-card-mini-badge" style="background:${badgeColor}">${badgeLabel}</span>
    </div>`;
  }

  /* ── Helper: get agent rarity (delegates to BlueprintUtils SSOT) ── */
  function _getAgentRarity(data) {
    return BlueprintUtils.getRarity(data);
  }

  /* ── Custom name/role persistence ── */
  const _CUSTOM_KEY = Utils.KEYS.bpCustomLabels;
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

  /* ── Card flip — single delegated listener on document body.
     Capture phase + stopPropagation so the click never reaches the
     card's bubble-phase drawer/activation handlers attached per view.
     Idempotent: re-binding is a no-op. */
  function bindFlipCards(root) {
    const target = root || (typeof document !== 'undefined' ? document.body : null);
    if (!target || target._niceFlipCardsBound) return;
    target._niceFlipCardsBound = true;
    target.addEventListener('click', function(e) {
      const btn = e.target.closest && e.target.closest('[data-action="flip-card"]');
      if (!btn) return;
      e.stopPropagation();
      e.preventDefault();
      const card = btn.closest('.blueprint-card');
      if (!card) return;
      card.classList.toggle('flipped');
    }, true);
  }

  /* ── Front tabs — click toggles active panel; hover shows the tab
     title as an overlay in the art zone above. Click never reaches
     the card's drawer-open handler (capture + stopPropagation). */
  function bindFrontTabs(root) {
    const target = root || (typeof document !== 'undefined' ? document.body : null);
    if (!target || target._niceFrontTabsBound) return;
    target._niceFrontTabsBound = true;

    target.addEventListener('click', function(e) {
      const tab = e.target.closest && e.target.closest('.blueprint-card-front-tab');
      if (!tab) return;
      e.stopPropagation();
      e.preventDefault();
      const front = tab.closest('.blueprint-card-front');
      if (!front) return;
      const id = tab.dataset.tab;
      front.querySelectorAll('.blueprint-card-front-tab').forEach(t => t.classList.toggle('active', t === tab));
      front.querySelectorAll('.blueprint-card-front-panel').forEach(p => p.classList.toggle('active', p.dataset.tab === id));
    }, true);

    target.addEventListener('mouseover', function(e) {
      const tab = e.target.closest && e.target.closest('.blueprint-card-front-tab');
      if (!tab) return;
      const front = tab.closest('.blueprint-card-front');
      if (!front) return;
      const overlay = front.querySelector('.blueprint-card-art-hover-title');
      if (!overlay) return;
      const span = overlay.querySelector('span');
      if (span) span.textContent = tab.dataset.title || '';
      overlay.classList.add('visible');
    });

    target.addEventListener('mouseout', function(e) {
      const tab = e.target.closest && e.target.closest('.blueprint-card-front-tab');
      if (!tab) return;
      const related = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.blueprint-card-front-tab');
      if (related && related.closest('.blueprint-card-front') === tab.closest('.blueprint-card-front')) return;
      const front = tab.closest('.blueprint-card-front');
      if (!front) return;
      const overlay = front.querySelector('.blueprint-card-art-hover-title');
      if (!overlay) return;
      overlay.classList.remove('visible');
    });
  }

  // Auto-bind once the DOM is ready so views don't have to wire this up.
  if (typeof document !== 'undefined') {
    if (document.body) {
      bindFlipCards(document.body);
      bindFrontTabs(document.body);
    } else {
      document.addEventListener('DOMContentLoaded', function() {
        bindFlipCards(document.body);
        bindFrontTabs(document.body);
      });
    }
  }

  /* ── Public API ── */
  return {
    render,
    roleColor,
    avatarArt,
    slotDiagramArt,
    nodeHexArt,
    paletteArt,
    serialHash,
    getCustomLabels,
    setCustomLabel,
    bindEditableCards,
    bindFlipCards,
    bindFrontTabs,
    _extractDisciplines,
    RARITY_COLORS,
    ROLE_COLORS,
    CATEGORY_COLORS,
    SHIP_CLASSES,
    TIER_ALIAS,
    NS_LOGO_MINI,
    NS_LOGO_BTN,
    AGENT_ICON_BTN,
    FLIP_ICON_BTN,
  };
})();
