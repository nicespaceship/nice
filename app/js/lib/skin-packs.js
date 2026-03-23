/* ─────────────────────────────────────────────────────────────────
   MODULE: Premium Skin Packs
   3 skins: Cyberpunk 2099, LCARS Starfleet, The Matrix
───────────────────────────────────────────────────────────────── */
(() => {
  if (typeof Skin === 'undefined') return;

  /* ══════════════════════════════════════════════════════════════
     SKIN 1: Cyberpunk 2099
  ══════════════════════════════════════════════════════════════ */
  Skin.registerPack({
    id: 'cyberpunk-2099',
    name: 'Cyberpunk 2099',
    category: 'Sci-Fi',
    price: 0,
    rarity: 'Legendary',
    description: 'Jack into the Net. Neon-drenched dystopian interface for elite operators.',
    flavor: 'The street finds its own uses for things.',
    card_num: 'NS-S01',
    tags: ['cyberpunk', 'neon', 'hacker', 'scifi'],
    preview_colors: ['#0a0a0f', '#ff2d6f', '#00fff5'],
    googleFonts: 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700&family=Fira+Code&display=swap',

    theme_data: {
      colors: {
        '--bg': '#0a0a0f', '--bg2': '#12121a', '--surface': '#1a1a2e', '--surface2': '#222240',
        '--border': '#2a2a4a', '--border-hi': '#ff2d6f',
        '--accent': '#ff2d6f', '--accent2': '#00fff5',
        '--text': '#e0e0ff', '--text-muted': '#7a7a9e',
        '--glow': '0 0 15px rgba(255,45,111,0.3)', '--glow-hi': '0 0 25px rgba(0,255,245,0.4)',
        '--panel-bg': 'rgba(10,10,15,0.97)', '--nav-bg': 'rgba(10,10,15,0.98)',
      },
      fonts: { '--font-h': "'Orbitron', sans-serif", '--font-b': "'Fira Code', monospace" },
      radius: '2px',
    },

    copy: {
      nav: {
        home: 'Terminal', missions: 'Ops',
        blueprints: 'Black Market', analytics: 'Surveillance',
        cost: 'Crypto Ledger', comms: 'Darknet',
        vault: 'Data Vault',
        log: 'System Logs', stations: 'Megacorps', profile: 'ID Chip',
        settings: 'Config', 'theme-creator': 'Mod Shop',
      },
      titles: {
        home: 'Terminal',
        missions: 'Active Ops', blueprints: 'Black Market',
        analytics: 'Surveillance Feed', cost: 'Crypto Ledger', comms: 'Darknet Comms',
        vault: 'Data Vault', log: 'System Logs', stations: 'Megacorp Directory',
        profile: 'ID Chip', settings: 'Config',
      },
      ranks: ['Script Kiddie', 'Hacker', 'Netrunner', 'Ghost', 'Architect', 'Daemon Lord', 'Singularity'],
      shipClasses: ['Burner Phone', 'Custom Rig', 'Server Farm', 'Neural Mainframe', 'Quantum Core'],
      stationTiers: ['Back Alley', 'Night Market', 'Corporate Tower', 'Orbital Station'],
      greeting: 'Welcome back, Runner',
      newAgent: 'New Netrunner',
      newMission: 'New Op',
      newSpaceship: 'New Rig',
    },

    effect: 'glitch',
  });

  /* ══════════════════════════════════════════════════════════════
     SKIN 2: LCARS (Star Trek TNG)
  ══════════════════════════════════════════════════════════════ */
  Skin.registerPack({
    id: 'lcars-federation',
    name: 'LCARS — Starfleet',
    category: 'Entertainment',
    price: 0,
    rarity: 'Legendary',
    description: 'Library Computer Access and Retrieval System. The iconic Okuda-designed interface from the 24th century.',
    flavor: 'Make it so.',
    card_num: 'NS-S02',
    tags: ['lcars', 'star trek', 'tng', 'federation', 'starfleet', 'okuda'],
    preview_colors: ['#000000', '#ff9966', '#cc99cc'],
    googleFonts: 'https://fonts.googleapis.com/css2?family=Antonio:wght@400;600;700&family=Share+Tech+Mono&display=swap',

    theme_data: {
      colors: {
        '--bg': '#000000', '--bg2': '#0a0a0e', '--surface': '#111118', '--surface2': '#1a1a22',
        '--border': '#cc6699', '--border-hi': '#ff9966',
        '--accent': '#ff9966', '--accent2': '#cc99cc',
        '--text': '#ff9966', '--text-muted': '#9999cc',
        '--glow': '0 0 8px rgba(255,153,102,0.2)', '--glow-hi': '0 0 16px rgba(204,153,204,0.3)',
        '--panel-bg': 'rgba(0,0,0,0.97)', '--nav-bg': 'rgba(0,0,0,0.98)',
        '--skin-card-border': '#cc6699',
      },
      fonts: { '--font-h': "'Antonio', sans-serif", '--font-b': "'Share Tech Mono', monospace" },
      radius: '24px',
    },

    copy: {
      nav: {
        home: 'Main Bridge',
        missions: 'Away Missions', blueprints: 'Schematics',
        analytics: 'Sensor Array', cost: 'Resource Alloc.', comms: 'Subspace Comms',
        vault: 'Classified', log: "Captain's Log", stations: 'Starbases',
        profile: 'Personnel File', settings: 'Ship Config',
        'theme-creator': 'Holodeck Program',
      },
      titles: {
        home: 'Main Bridge',
        missions: 'Away Mission Briefing',
        blueprints: 'Starfleet Schematics Database', analytics: 'Sensor Array — Long Range',
        cost: 'Resource Allocation', comms: 'Subspace Communications',
        vault: 'Classified — Clearance Required',
        log: "Captain's Log — Supplemental", stations: 'Starbase Operations',
        profile: 'Personnel File', settings: 'Ship Configuration',
      },
      ranks: ['Cadet', 'Ensign', 'Lieutenant', 'Lt. Commander', 'Commander', 'Captain', 'Admiral'],
      shipClasses: ['Shuttlecraft', 'Runabout', 'Defiant-class', 'Intrepid-class', 'Galaxy-class'],
      stationTiers: ['Deep Space Outpost', 'Starbase', 'Spacedock', 'Utopia Planitia'],
      greeting: 'Welcome aboard, Captain',
      newAgent: 'New Officer',
      newMission: 'New Away Mission',
      newSpaceship: 'New Starship',
    },

    effect: 'lcars',
  });

  /* ══════════════════════════════════════════════════════════════
     SKIN 3: The Matrix
  ══════════════════════════════════════════════════════════════ */
  Skin.registerPack({
    id: 'matrix-reloaded',
    name: 'The Matrix',
    category: 'Sci-Fi',
    price: 0,
    rarity: 'Legendary',
    description: 'Welcome to the desert of the real. Full digital rain, phosphor glow, and operator-grade terminal aesthetics.',
    flavor: 'There is no spoon.',
    card_num: 'NS-S03',
    tags: ['matrix', 'green', 'terminal', 'hacker', 'digital rain', 'scifi', 'neo'],
    preview_colors: ['#000800', '#00ff41', '#00cc33'],
    googleFonts: 'https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;600;700&family=Share+Tech+Mono&display=swap',

    theme_data: {
      colors: {
        '--bg': '#000600', '--bg2': '#000a00', '--surface': '#001a00', '--surface2': '#002200',
        '--border': 'rgba(0,255,65,0.25)', '--border-hi': '#00ff41',
        '--accent': '#00ff41', '--accent2': '#00cc33',
        '--text': '#00ff41', '--text-muted': 'rgba(0,255,65,0.45)',
        '--glow': '0 0 12px rgba(0,255,65,0.35)', '--glow-hi': '0 0 24px rgba(0,255,65,0.6)',
        '--panel-bg': 'rgba(0,4,0,0.97)', '--nav-bg': 'rgba(0,4,0,0.98)',
      },
      fonts: { '--font-h': "'Fira Code', monospace", '--font-b': "'Share Tech Mono', monospace" },
      radius: '0px',
    },

    copy: {
      nav: {
        home: 'Construct', missions: 'Assignments',
        blueprints: 'Source Code', analytics: 'Surveillance',
        cost: 'Resource Monitor', comms: 'Broadcast',
        vault: 'Encrypted',
        log: 'Operator Log', stations: 'Nodes', profile: 'Identity',
        settings: 'System Config', 'theme-creator': 'Code Editor',
      },
      titles: {
        home: 'The Construct',
        missions: 'Active Assignments', blueprints: 'Source Code',
        analytics: 'Surveillance Grid', cost: 'Resource Monitor', comms: 'Pirate Broadcast',
        vault: 'Encrypted Archive', log: 'Operator Log — Authenticated',
        stations: 'Node Network', profile: 'Identity File', settings: 'System Configuration',
      },
      ranks: ['Bluepill', 'Awakened', 'Rebel', 'Operator', 'The One\'s Ally', 'Oracle', 'The One'],
      shipClasses: ['Escape Pod', 'Hovercraft', 'Nebuchadnezzar', 'Hammer', 'Logos'],
      stationTiers: ['Safe House', 'Broadcast Depth', 'Zion Dock', 'Zion Command'],
      greeting: 'Welcome back, Operator',
      newAgent: 'New Operative',
      newMission: 'New Assignment',
      newSpaceship: 'New Hovercraft',
    },

    effect: 'digital-rain',
  });

  /* ══════════════════════════════════════════════════════════════
     CANVAS EFFECTS
  ══════════════════════════════════════════════════════════════ */

  /* ── Glitch (Cyberpunk) ── */
  Skin.registerEffect('glitch', (canvas) => {
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    let raf;
    let tick = 0;
    function draw() {
      tick++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Horizontal glitch lines
      if (tick % 4 === 0) {
        const numLines = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < numLines; i++) {
          const y = Math.random() * canvas.height;
          const h = 1 + Math.random() * 3;
          const w = 30 + Math.random() * 200;
          const x = Math.random() * canvas.width;
          ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,45,111,0.15)' : 'rgba(0,255,245,0.12)';
          ctx.fillRect(x, y, w, h);
        }
      }
      // Occasional scanline burst
      if (tick % 60 < 3) {
        for (let y = 0; y < canvas.height; y += 4) {
          ctx.fillStyle = 'rgba(0,255,245,0.03)';
          ctx.fillRect(0, y, canvas.width, 1);
        }
      }
      // Random pixel noise
      for (let i = 0; i < 8; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,45,111,0.2)' : 'rgba(0,255,245,0.2)';
        ctx.fillRect(x, y, 2 + Math.random() * 4, 2);
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    const onResize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  });

  /* ── Digital Rain (Matrix) ── */
  Skin.registerEffect('digital-rain', (canvas) => {
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF';
    const fontSize = 14;
    const columns = Math.floor(canvas.width / fontSize);
    const drops = new Array(columns).fill(0).map(() => Math.random() * -100);
    const speeds = new Array(columns).fill(0).map(() => 0.3 + Math.random() * 0.7);
    let raf;
    function draw() {
      ctx.fillStyle = 'rgba(0,6,0,0.12)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < columns; i++) {
        const char = CHARS[Math.floor(Math.random() * CHARS.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;
        // Lead character — bright white-green
        ctx.fillStyle = '#aaffaa';
        ctx.font = fontSize + 'px "Fira Code", monospace';
        ctx.globalAlpha = 0.9;
        ctx.fillText(char, x, y);
        // Trail — green with fade
        ctx.fillStyle = '#00ff41';
        ctx.globalAlpha = 0.15;
        for (let t = 1; t < 6; t++) {
          const tc = CHARS[Math.floor(Math.random() * CHARS.length)];
          ctx.fillText(tc, x, y - t * fontSize);
        }
        ctx.globalAlpha = 1;
        drops[i] += speeds[i];
        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    const onResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const newCols = Math.floor(canvas.width / fontSize);
      drops.length = newCols;
      speeds.length = newCols;
      for (let i = 0; i < newCols; i++) {
        if (drops[i] === undefined) { drops[i] = Math.random() * -100; speeds[i] = 0.3 + Math.random() * 0.7; }
      }
    };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  });

  /* ── LCARS Data Stream (Star Trek) ── */
  Skin.registerEffect('lcars', (canvas) => {
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const COLORS = ['#ff9966', '#cc6699', '#9999cc', '#cc99cc', '#ffcc99', '#6688cc', '#cc6666'];
    // Floating data readouts
    const readouts = [];
    for (let i = 0; i < 30; i++) {
      readouts.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        num: Math.floor(Math.random() * 99999).toString().padStart(2 + Math.floor(Math.random() * 4), '0'),
        alpha: Math.random() * 0.3,
        da: 0.003 + Math.random() * 0.005,
        fadeDir: 1,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: 9 + Math.floor(Math.random() * 5),
        life: Math.floor(Math.random() * 300),
      });
    }
    // Horizontal scan bars
    const bars = [];
    for (let i = 0; i < 4; i++) {
      bars.push({
        y: Math.random() * canvas.height,
        speed: 0.3 + Math.random() * 0.6,
        width: 40 + Math.random() * 160,
        height: 2 + Math.random() * 4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        x: Math.random() * canvas.width,
        dir: Math.random() > 0.5 ? 1 : -1,
      });
    }
    let raf, tick = 0;
    function draw() {
      tick++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Draw horizontal scan bars
      bars.forEach(b => {
        b.x += b.speed * b.dir;
        if (b.x > canvas.width + b.width) { b.x = -b.width; b.y = Math.random() * canvas.height; }
        if (b.x < -b.width) { b.x = canvas.width + b.width; b.y = Math.random() * canvas.height; }
        ctx.fillStyle = b.color;
        ctx.globalAlpha = 0.08;
        // Pill shape (rounded rect)
        const r = b.height / 2;
        ctx.beginPath();
        ctx.moveTo(b.x + r, b.y);
        ctx.lineTo(b.x + b.width - r, b.y);
        ctx.arc(b.x + b.width - r, b.y + r, r, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(b.x + r, b.y + b.height);
        ctx.arc(b.x + r, b.y + r, r, Math.PI / 2, -Math.PI / 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });
      // Draw floating data numbers
      ctx.font = '12px "Share Tech Mono", monospace';
      readouts.forEach(r => {
        r.life++;
        r.alpha += r.da * r.fadeDir;
        if (r.alpha >= 0.25) r.fadeDir = -1;
        if (r.alpha <= 0) {
          r.fadeDir = 1; r.alpha = 0;
          r.x = Math.random() * canvas.width;
          r.y = Math.random() * canvas.height;
          r.num = Math.floor(Math.random() * 99999).toString().padStart(2 + Math.floor(Math.random() * 4), '0');
          r.color = COLORS[Math.floor(Math.random() * COLORS.length)];
        }
        ctx.globalAlpha = Math.max(0, r.alpha);
        ctx.fillStyle = r.color;
        ctx.font = r.size + 'px "Share Tech Mono", monospace';
        ctx.fillText(r.num, r.x, r.y);
      });
      ctx.globalAlpha = 1;
      // Occasional full-width scan pulse
      if (tick % 180 < 2) {
        const pulseY = (tick * 1.5) % canvas.height;
        const grad = ctx.createLinearGradient(0, pulseY - 20, 0, pulseY + 20);
        grad.addColorStop(0, 'rgba(255,153,102,0)');
        grad.addColorStop(0.5, 'rgba(255,153,102,0.06)');
        grad.addColorStop(1, 'rgba(255,153,102,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, pulseY - 20, canvas.width, 40);
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    const onResize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  });

})();
