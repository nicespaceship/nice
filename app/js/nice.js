/* ═══════════════════════════════════════════════════════════════════
   NICE — Main Orchestrator
   Initializes all modules, registers routes, manages app lifecycle.
═══════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────────
   MODULE: Theme Engine (reused from main site)
───────────────────────────────────────────────────────────────── */
const Theme = (() => {
  const BUILTIN = ['spaceship','robotech','navigator','solar','matrix','retro','lcars','pixel','steampunk'];

  // CSS var keys to clear when switching themes
  const VAR_KEYS = ['--bg','--bg2','--surface','--surface2','--border','--border-hi','--accent','--accent2','--text','--fg','--text-muted','--text-dim','--glow','--glow-hi','--panel-bg','--nav-bg','--font-h','--font-d','--font-b','--font-m','--radius','--scan','--border-width','--hero-grad','--bg-pattern'];

  // All available themes — directly accessible from HUD dock and GUI editor
  const THEMES = [
    { id:'spaceship', name:'Nice Spaceship', builtin:true, accent:'#080808', preview:['#080808','#ffffff','#888888'],
      data:{ colors:{ '--bg':'#080808','--bg2':'#101010','--surface':'#161616','--surface2':'#1e1e1e','--border':'#2a2a2a','--border-hi':'#555555','--accent':'#ffffff','--accent2':'#888888','--text':'#f0f0f0','--text-muted':'#666666','--glow':'none','--panel-bg':'rgba(16,16,16,0.97)' }, fonts:{ '--font-h':"'Orbitron', sans-serif", '--font-b':"'Inter', sans-serif" }, radius:'0px' } },
    { id:'robotech', name:'Pod', builtin:true, accent:'#f8f8f8', preview:['#f8f8f8','#080808','#444444'],
      data:{ colors:{ '--bg':'#f8f8f8','--bg2':'#efefef','--surface':'#e4e4e4','--surface2':'#d8d8d8','--border':'#c8c8c8','--border-hi':'#888888','--accent':'#080808','--accent2':'#444444','--text':'#0f0f0f','--text-muted':'#666666','--glow':'none','--panel-bg':'rgba(239,239,239,0.97)' }, fonts:{ '--font-h':"'Orbitron', sans-serif", '--font-b':"'Inter', sans-serif" }, radius:'0px' } },
    { id:'navigator', name:'Navigator', builtin:true, accent:'#00e5ff', preview:['#02090f','#00e5ff','#0099bb'],
      data:{ colors:{ '--bg':'#02090f','--bg2':'#041220','--surface':'rgba(0,200,240,0.05)','--surface2':'rgba(0,200,240,0.09)','--border':'rgba(0,229,255,0.25)','--border-hi':'rgba(0,229,255,0.6)','--accent':'#00e5ff','--accent2':'#0099bb','--text':'#cce8f0','--text-muted':'rgba(0,229,255,0.55)','--glow':'0 0 16px rgba(0,229,255,0.22)','--panel-bg':'rgba(2,9,15,0.95)' }, fonts:{ '--font-h':"'Orbitron', sans-serif", '--font-b':"'Inter', sans-serif" }, radius:'2px' } },
    { id:'solar', name:'Solar', builtin:true, accent:'#ff8c00', preview:['#080200','#ff8c00','#ffd700'],
      data:{ colors:{ '--bg':'#080200','--bg2':'#120500','--surface':'rgba(255,110,0,0.05)','--surface2':'rgba(255,140,0,0.09)','--border':'rgba(255,110,0,0.28)','--border-hi':'rgba(255,180,0,0.6)','--accent':'#ff8c00','--accent2':'#ffd700','--text':'#ffe8cc','--text-muted':'rgba(255,180,100,0.6)','--glow':'0 0 18px rgba(255,110,0,0.28)','--panel-bg':'rgba(10,4,0,0.96)' }, fonts:{ '--font-h':"'Orbitron', sans-serif", '--font-b':"'Inter', sans-serif" }, radius:'0px' } },
    { id:'matrix', name:'The Matrix', builtin:true, accent:'#00ff41', preview:['#000800','#00ff41','#00aa2a'],
      data:{ colors:{ '--bg':'#000800','--bg2':'#000c00','--surface':'rgba(0,255,65,0.04)','--surface2':'rgba(0,255,65,0.08)','--border':'rgba(0,255,65,0.2)','--border-hi':'rgba(0,255,65,0.5)','--accent':'#00ff41','--accent2':'#00aa2a','--text':'#00ff41','--text-muted':'rgba(0,255,65,0.5)','--glow':'0 0 12px rgba(0,255,65,0.3)','--panel-bg':'rgba(0,6,0,0.97)' }, fonts:{ '--font-h':"'Fira Code', monospace", '--font-b':"'Fira Code', monospace" }, radius:'0px' } },
    { id:'retro', name:'Retro', builtin:true, accent:'#c8a848', preview:['#0e0e0a','#c8a848','#b83c28'],
      data:{ colors:{ '--bg':'#0e0e0a','--bg2':'#16160f','--surface':'rgba(180,160,100,0.05)','--surface2':'rgba(160,60,40,0.06)','--border':'rgba(180,160,100,0.22)','--border-hi':'rgba(200,180,120,0.5)','--accent':'#c8a848','--accent2':'#b83c28','--text':'#e8e0c8','--text-muted':'rgba(200,190,160,0.55)','--glow':'0 0 12px rgba(200,168,72,0.15)','--panel-bg':'rgba(16,16,12,0.97)' }, fonts:{ '--font-h':"'Space Mono', monospace", '--font-b':"'IBM Plex Sans', sans-serif" }, radius:'2px' } },
    { id:'lcars', name:'LCARS', builtin:true, accent:'#ff9966', preview:['#000000','#ff9966','#cc99ff'],
      data:{ colors:{ '--bg':'#000000','--bg2':'#000000','--surface':'rgba(255,153,102,0.06)','--surface2':'rgba(204,153,255,0.06)','--border':'#cc7744','--border-hi':'#ff9966','--accent':'#ff9966','--accent2':'#cc99ff','--text':'#ff9966','--text-muted':'#cc99ff','--glow':'none','--panel-bg':'#000000' }, fonts:{ '--font-h':"'Antonio', sans-serif", '--font-b':"'Antonio', sans-serif" }, radius:'24px' } },
    { id:'pixel', name:'16-Bit Pixel', builtin:true, accent:'#fccc00', preview:['#101020','#fccc00','#e83030'],
      data:{ colors:{ '--bg':'#101020','--bg2':'#181830','--surface':'#1e1e3a','--surface2':'#282850','--border':'#4040aa','--border-hi':'#fccc00','--accent':'#fccc00','--accent2':'#e83030','--text':'#f8f8f8','--text-muted':'#8888bb','--glow':'none','--panel-bg':'#181830' }, fonts:{ '--font-h':"'Press Start 2P', monospace", '--font-b':"'Press Start 2P', monospace" }, radius:'0px' } },
    { id:'cyberpunk', name:'Cyberpunk Neon', accent:'#ff2d95', preview:['#0a0014','#ff2d95','#00f0ff'],
      data:{ colors:{ '--bg':'#0a0014','--bg2':'#120020','--surface':'rgba(255,45,149,0.05)','--surface2':'rgba(0,240,255,0.07)','--border':'rgba(255,45,149,0.3)','--border-hi':'rgba(0,240,255,0.6)','--accent':'#ff2d95','--accent2':'#00f0ff','--text':'#ede0ff','--text-muted':'rgba(237,224,255,0.5)','--glow':'0 0 20px rgba(255,45,149,0.35)','--panel-bg':'rgba(10,0,20,0.97)' }, fonts:{ '--font-h':"'Rajdhani', sans-serif", '--font-b':"'Inter', sans-serif" }, radius:'2px' } },
    { id:'ocean', name:'Ocean Depths', accent:'#0af5e0', preview:['#020e1a','#0af5e0','#1a6bff'],
      data:{ colors:{ '--bg':'#020e1a','--bg2':'#041828','--surface':'rgba(10,245,224,0.04)','--surface2':'rgba(26,107,255,0.06)','--border':'rgba(10,245,224,0.2)','--border-hi':'rgba(26,107,255,0.5)','--accent':'#0af5e0','--accent2':'#1a6bff','--text':'#c0eaff','--text-muted':'rgba(192,234,255,0.5)','--glow':'0 0 14px rgba(10,245,224,0.2)','--panel-bg':'rgba(2,14,26,0.97)' }, fonts:{ '--font-h':"'Space Grotesk', sans-serif", '--font-b':"'Inter', sans-serif" }, radius:'4px' } },
    { id:'sunset', name:'Sunset Gradient', accent:'#ff6b35', preview:['#1a0810','#ff6b35','#ff3366'],
      data:{ colors:{ '--bg':'#1a0810','--bg2':'#220e18','--surface':'rgba(255,107,53,0.05)','--surface2':'rgba(255,51,102,0.06)','--border':'rgba(255,107,53,0.25)','--border-hi':'rgba(255,51,102,0.5)','--accent':'#ff6b35','--accent2':'#ff3366','--text':'#ffe0d0','--text-muted':'rgba(255,224,208,0.5)','--glow':'none','--panel-bg':'rgba(26,8,16,0.97)' }, fonts:{ '--font-h':"'Poppins', sans-serif", '--font-b':"'Inter', sans-serif" }, radius:'6px' } },
    { id:'holo', name:'Holo Chrome', accent:'#c0c0ff', preview:['#08080c','#c0c0ff','#ffc0e0'],
      data:{ colors:{ '--bg':'#08080c','--bg2':'#101018','--surface':'rgba(192,192,255,0.06)','--surface2':'rgba(255,192,224,0.06)','--border':'rgba(192,192,255,0.3)','--border-hi':'rgba(255,192,224,0.7)','--accent':'#c0c0ff','--accent2':'#ffc0e0','--text':'#e8e8ff','--text-muted':'rgba(232,232,255,0.55)','--glow':'0 0 24px rgba(192,192,255,0.4)','--panel-bg':'rgba(8,8,12,0.98)' }, fonts:{ '--font-h':"'Orbitron', sans-serif", '--font-b':"'Inter', sans-serif" }, radius:'4px' } },
    { id:'synthwave', name:'Synthwave', accent:'#f542e6', preview:['#0d0020','#f542e6','#00d4ff'],
      data:{ colors:{ '--bg':'#0d0020','--bg2':'#160030','--surface':'rgba(245,66,230,0.05)','--surface2':'rgba(0,212,255,0.06)','--border':'rgba(245,66,230,0.25)','--border-hi':'rgba(0,212,255,0.5)','--accent':'#f542e6','--accent2':'#00d4ff','--text':'#f0d0ff','--text-muted':'rgba(240,208,255,0.5)','--glow':'0 0 18px rgba(245,66,230,0.3)','--panel-bg':'rgba(13,0,32,0.97)' }, fonts:{ '--font-h':"'Orbitron', sans-serif", '--font-b':"'Rajdhani', sans-serif" }, radius:'0px' } },
    { id:'arctic', name:'Arctic', accent:'#a0d0ff', preview:['#0a1018','#a0d0ff','#60a0d0'],
      data:{ colors:{ '--bg':'#0a1018','--bg2':'#101820','--surface':'rgba(160,208,255,0.05)','--surface2':'rgba(96,160,208,0.07)','--border':'rgba(160,208,255,0.2)','--border-hi':'rgba(96,160,208,0.45)','--accent':'#a0d0ff','--accent2':'#60a0d0','--text':'#d8e8f0','--text-muted':'rgba(216,232,240,0.5)','--glow':'none','--panel-bg':'rgba(10,16,24,0.97)' }, fonts:{ '--font-h':"'Inter', sans-serif", '--font-b':"'Inter', sans-serif" }, radius:'2px' } },
    { id:'volcanic', name:'Volcanic', accent:'#ff3300', preview:['#100400','#ff3300','#ff8800'],
      data:{ colors:{ '--bg':'#100400','--bg2':'#1a0800','--surface':'rgba(255,51,0,0.05)','--surface2':'rgba(255,136,0,0.06)','--border':'rgba(255,51,0,0.25)','--border-hi':'rgba(255,136,0,0.5)','--accent':'#ff3300','--accent2':'#ff8800','--text':'#ffccaa','--text-muted':'rgba(255,204,170,0.5)','--glow':'0 0 16px rgba(255,51,0,0.25)','--panel-bg':'rgba(16,4,0,0.97)' }, fonts:{ '--font-h':"'Rajdhani', sans-serif", '--font-b':"'Inter', sans-serif" }, radius:'2px' } },
    { id:'steampunk', name:'Steampunk', accent:'#c8a050', preview:['#0f0a04','#c8a050','#8b6914'],
      data:{ colors:{ '--bg':'#0f0a04','--bg2':'#1a1208','--surface':'rgba(200,160,80,0.06)','--surface2':'rgba(139,105,20,0.08)','--border':'rgba(200,160,80,0.28)','--border-hi':'rgba(200,160,80,0.6)','--accent':'#c8a050','--accent2':'#8b6914','--text':'#e8d8c0','--text-muted':'rgba(232,216,192,0.5)','--glow':'0 0 16px rgba(200,160,80,0.22)','--panel-bg':'rgba(15,10,4,0.97)' }, fonts:{ '--font-h':"'Playfair Display', serif", '--font-b':"'Inter', sans-serif" }, radius:'4px' } },
    { id:'forest', name:'Forest', accent:'#4caf50', preview:['#040a04','#4caf50','#8bc34a'],
      data:{ colors:{ '--bg':'#040a04','--bg2':'#081208','--surface':'rgba(76,175,80,0.05)','--surface2':'rgba(139,195,74,0.06)','--border':'rgba(76,175,80,0.22)','--border-hi':'rgba(139,195,74,0.45)','--accent':'#4caf50','--accent2':'#8bc34a','--text':'#c8e8c8','--text-muted':'rgba(200,232,200,0.5)','--glow':'none','--panel-bg':'rgba(4,10,4,0.97)' }, fonts:{ '--font-h':"'Inter', sans-serif", '--font-b':"'Inter', sans-serif" }, radius:'4px' } },
    { id:'ultraviolet', name:'Ultraviolet', accent:'#b000ff', preview:['#08001a','#b000ff','#ff00aa'],
      data:{ colors:{ '--bg':'#08001a','--bg2':'#100028','--surface':'rgba(176,0,255,0.06)','--surface2':'rgba(255,0,170,0.06)','--border':'rgba(176,0,255,0.28)','--border-hi':'rgba(255,0,170,0.6)','--accent':'#b000ff','--accent2':'#ff00aa','--text':'#e0c0ff','--text-muted':'rgba(224,192,255,0.5)','--glow':'0 0 24px rgba(176,0,255,0.4)','--panel-bg':'rgba(8,0,26,0.98)' }, fonts:{ '--font-h':"'Orbitron', sans-serif", '--font-b':"'Inter', sans-serif" }, radius:'2px' } },
  ];

  function set(name) {
    // Clear inline vars first so built-in CSS takes over cleanly
    VAR_KEYS.forEach(k => document.documentElement.style.removeProperty(k));

    // Check if it's a built-in theme name
    if (BUILTIN.includes(name)) {
      document.documentElement.setAttribute('data-theme', name);
      localStorage.setItem('ns-theme', name);
      MatrixRain.toggle(name === 'matrix');
    } else {
      // Non-built-in: look up in THEMES by id
      const t = THEMES.find(t => t.id === name);
      if (!t) return;
      document.documentElement.removeAttribute('data-theme');
      const td = t.data;
      if (td.colors) Object.entries(td.colors).forEach(([k,v]) => document.documentElement.style.setProperty(k, v));
      if (td.fonts) {
        document.documentElement.style.setProperty('--font-h', td.fonts['--font-h']);
        document.documentElement.style.setProperty('--font-d', td.fonts['--font-h']);
        document.documentElement.style.setProperty('--font-b', td.fonts['--font-b']);
      }
      if (td.radius) document.documentElement.style.setProperty('--radius', td.radius);
      localStorage.setItem('ns-theme', name);
      MatrixRain.toggle(false);
    }

    // Highlight active dock button
    document.querySelectorAll('.db').forEach(b => b.classList.remove('active'));
    document.querySelector(`.db[data-theme-id="${name}"]`)?.classList.add('active');

    // Update active theme name label
    const nameEl = document.getElementById('active-theme-name');
    if (nameEl) {
      const t = THEMES.find(t => t.id === name);
      nameEl.textContent = t ? t.name : name;
    }

    // Update theme-color meta for PWA
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      meta.setAttribute('content', bg || '#080808');
    }
  }

  function toggleDarkLight() {
    const current = localStorage.getItem('ns-theme') || 'spaceship';
    const isLight = current === 'robotech';
    if (isLight) {
      const prev = localStorage.getItem('ns-dark-theme') || 'spaceship';
      set(prev || 'spaceship');
    } else {
      localStorage.setItem('ns-dark-theme', current);
      set('robotech');
    }
    _updateDarkLightIcon();
  }

  function _updateDarkLightIcon() {
    const btn = document.getElementById('btn-darklight');
    if (!btn) return;
    const current = localStorage.getItem('ns-theme') || 'spaceship';
    const isLight = current === 'robotech';
    const icon = isLight ? '#icon-moon' : '#icon-sun';
    btn.innerHTML = `<svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="${icon}"/></svg>`;
  }

  function renderDock(filterIds) {
    const container = document.getElementById('theme-dock-btns');
    if (!container) return;

    // Use saved selection or show all
    let dockIds = filterIds;
    if (!dockIds) {
      try { dockIds = JSON.parse(localStorage.getItem('nice-hud-dock-themes')); } catch {}
    }
    const themes = (Array.isArray(dockIds) && dockIds.length)
      ? THEMES.filter(t => dockIds.includes(t.id))
      : THEMES.filter(t => ['spaceship','robotech','navigator','solar','matrix','retro','lcars','pixel','cyberpunk','steampunk','sunset'].includes(t.id));

    container.innerHTML = themes.map(t => {
      const accent = t.accent || (t.preview && t.preview[1]) || '#888';
      return `<button class="db" data-theme-id="${t.id}" data-tip="${t.name}" style="background:${accent}" onclick="Theme.set('${t.id}')" aria-label="${t.name}" title="${t.name}"></button>`;
    }).join('');

    // Highlight current
    const current = localStorage.getItem('ns-theme') || 'spaceship';
    document.querySelectorAll('.db').forEach(b => b.classList.remove('active'));
    document.querySelector(`.db[data-theme-id="${current}"]`)?.classList.add('active');
  }

  function list() { return [...THEMES]; }

  function getTheme(id) { return THEMES.find(t => t.id === id) || null; }

  function init() {
    const saved = localStorage.getItem('ns-theme') || 'spaceship';
    renderDock();
    set(saved);
    _updateDarkLightIcon();
  }

  return { set, init, toggleDarkLight, renderDock, list, getTheme, THEMES };
})();

/* ─────────────────────────────────────────────────────────────────
   MODULE: Font Engine
───────────────────────────────────────────────────────────────── */
const Font = (() => {
  const FONTS = ['auto','clean','space','tac','code','serif','mono','pixel'];

  function set(name) {
    if (!FONTS.includes(name)) return;
    if (name === 'auto') {
      document.documentElement.removeAttribute('data-font');
    } else {
      document.documentElement.setAttribute('data-font', name);
    }
    localStorage.setItem('ns-font', name);
    document.querySelectorAll('.fb').forEach(b => b.classList.remove('active'));
    document.querySelector(`.fb[data-fid="${name}"]`)?.classList.add('active');
  }

  function init() {
    const saved = localStorage.getItem('ns-font') || 'auto';
    set(saved);
  }

  return { set, init };
})();

/* ─────────────────────────────────────────────────────────────────
   MODULE: Matrix Rain (canvas)
───────────────────────────────────────────────────────────────── */
const MatrixRain = (() => {
  const canvas = document.getElementById('matrix-canvas');
  if (!canvas) return { toggle: () => {} };

  const ctx = canvas.getContext('2d');
  let _on = false, _raf = null;
  const chars = 'アカサタナハマヤラワ0123456789ABCDEF';
  let cols, drops;

  function _resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    cols  = Math.floor(canvas.width / 18);
    drops = Array(cols).fill(1);
  }

  let _lastDraw = 0;
  const _drawInterval = 80; // ms between frames (higher = slower rain)

  function _draw(time) {
    _raf = requestAnimationFrame(_draw);
    if (time - _lastDraw < _drawInterval) return;
    _lastDraw = time;

    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#00ff41';
    ctx.font = '15px monospace';
    for (let i = 0; i < cols; i++) {
      const ch = chars[Math.floor(Math.random() * chars.length)];
      ctx.fillText(ch, i * 18, drops[i] * 18);
      if (drops[i] * 18 > canvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
  }

  function toggle(on) {
    _on = on;
    canvas.style.display = on ? 'block' : 'none';
    if (on) { _resize(); _draw(); }
    else if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
  }

  window.addEventListener('resize', () => { if (_on) _resize(); });
  return { toggle };
})();

/* ─────────────────────────────────────────────────────────────────
   MODULE: NICE App Controller
───────────────────────────────────────────────────────────────── */
const NICE = (() => {

  /* ── Sidebar toggle ── */
  function _initSidebar() {
    const toggle  = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (toggle) {
      toggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
      });
    }
    const mobileToggle = document.getElementById('mobile-sidebar-toggle');


    if (mobileToggle) {
      mobileToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('open');
      });
    }

    if (overlay) {
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
      });
    }

    // Close sidebar on nav
    document.querySelectorAll('.side-link, .side-user-card, .side-popover-item, .mobile-bar-btn[href]').forEach(link => {
      link.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
      });
    });

    // Swipe gesture to open/close sidebar on mobile
    _initSwipeGesture(sidebar, overlay);

    // Close button inside sidebar drawer
    const closeBtn = document.getElementById('sidebar-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
      });
    }

    // Collapsible nav groups
    document.querySelectorAll('.side-group-toggle').forEach(btn => {
      const itemsId = btn.id + '-items';
      const items = document.getElementById(itemsId);
      if (!items) return;
      const stored = localStorage.getItem('nice-nav-' + btn.id);
      if (stored === '0') {
        items.classList.add('collapsed');
        btn.setAttribute('aria-expanded', 'false');
      }
      btn.addEventListener('click', () => {
        const isCollapsed = items.classList.toggle('collapsed');
        btn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
        localStorage.setItem('nice-nav-' + btn.id, isCollapsed ? '0' : '1');
      });
    });


    // Side footer popover (Settings / Export / Log Out)
    const moreBtn = document.getElementById('side-more-btn');
    const popover = document.getElementById('side-popover');
    if (moreBtn && popover) {
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = popover.classList.toggle('open');
        moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      document.addEventListener('click', (e) => {
        if (!popover.contains(e.target) && e.target !== moreBtn) {
          popover.classList.remove('open');
          moreBtn.setAttribute('aria-expanded', 'false');
        }
      });
      // Close popover when a link inside is clicked
      popover.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', () => {
          popover.classList.remove('open');
          moreBtn.setAttribute('aria-expanded', 'false');
        });
      });
      // Export data button
      const exportBtn = document.getElementById('btn-export-data');
      if (exportBtn) {
        exportBtn.addEventListener('click', () => {
          popover.classList.remove('open');
          if (typeof DataIO !== 'undefined') DataIO.exportData();
        });
      }
      // Log out button
      const logoutBtn = document.getElementById('btn-logout');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
          popover.classList.remove('open');
          if (typeof SB !== 'undefined') await SB.auth().signOut();
          window.location.reload();
        });
      }
    }

    // ── Missions folder (collapsible) ──
    _initMissionsFolder();
  }

  function _initMissionsFolder() {
    const toggle = document.getElementById('side-missions-toggle');
    const folder = document.getElementById('side-missions-folder');
    if (toggle && folder) {
      // Restore open state
      if (localStorage.getItem('nice-missions-folder') !== '0') folder.classList.add('open');
      toggle.addEventListener('click', () => {
        const isOpen = folder.classList.toggle('open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        localStorage.setItem('nice-missions-folder', isOpen ? '1' : '0');
      });
      // Set initial aria state
      if (folder.classList.contains('open')) toggle.setAttribute('aria-expanded', 'true');
    }

    // Populate missions list from State
    _renderMissionsFolderList();
    State.on('missions', _renderMissionsFolderList);
  }

  function _renderMissionsFolderList() {
    const list = document.getElementById('side-missions-list');
    if (!list) return;
    const missions = State.get('missions') || [];
    const STATUS_COLORS = { queued:'#f59e0b', running:'#6366f1', completed:'#22c55e', failed:'#ef4444' };

    // Show running first, then queued, limit to 10
    const sorted = [...missions]
      .sort((a, b) => {
        const order = { running:0, queued:1, failed:2, completed:3 };
        return (order[a.status] ?? 4) - (order[b.status] ?? 4);
      })
      .slice(0, 10);

    if (!sorted.length) {
      list.innerHTML = '<div class="side-folder-item" style="opacity:.4;cursor:default">No missions</div>';
      return;
    }

    list.innerHTML = sorted.map(m => {
      const color = STATUS_COLORS[m.status] || '#888';
      const title = (m.title || 'Untitled').slice(0, 30);
      return `<a href="#/missions/${m.id}" class="side-folder-item" title="${m.title}">
        <span class="side-folder-dot" style="background:${color}"></span>
        ${title}
      </a>`;
    }).join('');
  }

  /* ── Ship → Theme auto-switching ── */
  /* Ship-theme: switching ships triggers theme check via storage event */
  function _initShipThemeWatcher() {
    window.addEventListener('storage', (e) => {
      if (e.key === 'nice-mc-ship') _checkShipTheme(e.newValue);
    });
  }

  function _checkShipTheme(shipId) {
    if (!shipId) return;
    let search = shipId.toLowerCase();
    if (typeof BlueprintStore !== 'undefined') {
      const rawId = shipId.replace(/^bp-/, '');
      const ship = BlueprintStore.getSpaceship(rawId) || BlueprintStore.getSpaceship(shipId);
      if (ship) search += ' ' + (ship.name || '').toLowerCase();
    }
    if (search.includes('enterprise') || search.includes('ncc-1701')) {
      if (localStorage.getItem('ns-theme') !== 'lcars') {
        Theme.set('lcars');
        if (typeof Notify !== 'undefined') Notify.send({ title: 'Theme Activated', message: 'LCARS interface engaged.', type: 'system' });
      }
    }
  }

  /* ── Mobile swipe gesture for sidebar ── */
  function _initSwipeGesture(sidebar, overlay) {
    if (!sidebar || !overlay) return;

    let _touchStartX = 0;
    let _touchStartY = 0;
    let _tracking = false;
    const SWIPE_THRESHOLD = 50;
    const EDGE_ZONE = 30; // px from left edge to trigger open

    document.addEventListener('touchstart', (e) => {
      _touchStartX = e.touches[0].clientX;
      _touchStartY = e.touches[0].clientY;
      // Only track if starting from left edge (for open) or sidebar is open (for close)
      _tracking = (_touchStartX <= EDGE_ZONE) || sidebar.classList.contains('open');
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      if (!_tracking || window.innerWidth > 768) return;
      _tracking = false;

      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const deltaX = touchEndX - _touchStartX;
      const deltaY = Math.abs(touchEndY - _touchStartY);

      // Only register horizontal swipes (deltaX > deltaY)
      if (deltaY > Math.abs(deltaX)) return;

      if (deltaX > SWIPE_THRESHOLD && _touchStartX <= EDGE_ZONE && !sidebar.classList.contains('open')) {
        // Swipe right from edge → open
        sidebar.classList.add('open');
        overlay.classList.add('open');
      } else if (deltaX < -SWIPE_THRESHOLD && sidebar.classList.contains('open')) {
        // Swipe left → close
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
      }
    }, { passive: true });
  }

  /* ── Header user info (Name + Rank Badge) ── */
  function _updateHeaderUser() {
    const user = State.get('user');
    const nameEl  = document.getElementById('hdr-username');
    const badgeEl = document.getElementById('hdr-user-badge');
    if (!nameEl || !badgeEl) return;
    const meta = user?.user_metadata || {};
    const name = meta.display_name || user?.email?.split('@')[0] || 'Pilot';
    nameEl.textContent = name;
    const rank = (typeof Gamification !== 'undefined') ? Gamification.getRank() : { name: 'Ensign' };
    badgeEl.textContent = rank.name.toUpperCase();
  }

  /* ── Scroll to top on navigation ── */
  function _initScrollToTop() {
    window.addEventListener('hashchange', () => {
      const main = document.querySelector('.app-main');
      if (main) main.scrollTo({ top: 0, behavior: 'instant' });
    });
  }

  /* ── Bell dropdown ── */
  function _initBellDropdown() {
    const btn   = document.getElementById('btn-notifications');
    const panel = document.getElementById('bell-dropdown');
    if (!btn || !panel) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) _renderBellDropdown();
    });

    document.addEventListener('click', (e) => {
      if (!panel.contains(e.target) && !e.target.closest('#btn-notifications')) {
        panel.classList.remove('open');
      }
    });

    document.getElementById('bell-mark-all')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const notifs = State.get('notifications') || [];
      notifs.forEach(n => { n.read = true; });
      State.set('notifications', notifs);
      _renderBellDropdown();
      _updateBellBadge(notifs);
    });

    document.getElementById('bell-dropdown-footer')?.addEventListener('click', () => {
      panel.classList.remove('open');
    });

    // Re-render when notifications change
    State.on('notifications', _renderBellDropdown);
  }

  function _renderBellDropdown() {
    const list = document.getElementById('bell-dropdown-list');
    if (!list) return;

    const notifs = (State.get('notifications') || []).slice(0, 5);
    if (!notifs.length) {
      list.innerHTML = '<p class="bell-dropdown-empty">No notifications yet.</p>';
      return;
    }

    const TYPES = {
      'agent_error':    { icon: '#icon-alert',   color: '#ef4444' },
      'task_complete':  { icon: '#icon-check',   color: '#22c55e' },
      'task_failed':    { icon: '#icon-x',       color: '#ef4444' },
      'fleet_deployed': { icon: '#icon-spaceship', color: '#6366f1' },
      'budget_alert':   { icon: '#icon-dollar',  color: '#f59e0b' },
      'system':         { icon: '#icon-settings', color: 'var(--accent)' },
      'broadcast':      { icon: '#icon-comms',    color: '#06b6d4' },
    };

    list.innerHTML = notifs.map(n => {
      const t = TYPES[n.type] || TYPES.system;
      const title = n.title || '';
      const msg = (n.message || '').length > 60 ? n.message.slice(0, 60) + '...' : (n.message || '');
      return `
        <div class="bell-dropdown-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
          <div class="bell-item-icon" style="color:${t.color}">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="${t.icon}"/></svg>
          </div>
          <div class="bell-item-body">
            <span class="bell-item-title">${title}</span>
            <span class="bell-item-msg">${msg}</span>
          </div>
          <span class="bell-item-time">${_bellTimeAgo(n.created_at)}</span>
        </div>
      `;
    }).join('');

    // Click to mark read
    list.querySelectorAll('.bell-dropdown-item.unread').forEach(item => {
      item.addEventListener('click', () => {
        const notifs = State.get('notifications') || [];
        const n = notifs.find(x => x.id === item.dataset.id);
        if (n) { n.read = true; _renderBellDropdown(); _updateBellBadge(notifs); }
      });
    });

    _updateBellBadge(State.get('notifications') || []);
  }

  function _updateBellBadge(notifs) {
    const unread = notifs.filter(n => !n.read).length;
    const badge = document.getElementById('bell-badge');
    if (badge) {
      badge.textContent = unread || '';
      badge.style.display = unread > 0 ? '' : 'none';
    }
    const hudBadge = document.getElementById('hud-alert-badge');
    if (hudBadge) {
      hudBadge.textContent = unread || '';
      hudBadge.style.display = unread > 0 ? '' : 'none';
    }
    const tabBadge = document.getElementById('tab-alert-badge');
    if (tabBadge) {
      tabBadge.textContent = unread || '';
      tabBadge.style.display = unread > 0 ? '' : 'none';
    }
  }

  function _renderAlertDropdown() {
    const list = document.getElementById('hud-alert-list');
    if (!list) return;
    const notifs = State.get('notifications') || [];
    if (!notifs.length) {
      list.innerHTML = '<p class="hud-alert-empty">No alerts.</p>';
      return;
    }

    const TYPES = {
      'mission_complete': { icon: '#icon-check',    color: '#22c55e' },
      'mission_failed':   { icon: '#icon-alert',    color: '#ef4444' },
      'agent_ready':      { icon: '#icon-agent',    color: '#3b82f6' },
      'fleet_deployed':   { icon: '#icon-spaceship', color: '#6366f1' },
      'budget_alert':     { icon: '#icon-alert',    color: '#f59e0b' },
      'system':           { icon: '#icon-settings', color: 'var(--accent)' },
      'broadcast':        { icon: '#icon-comms',    color: '#06b6d4' },
    };

    list.innerHTML = notifs.map(n => {
      const t = TYPES[n.type] || TYPES.system;
      const msg = (n.message || '').length > 50 ? n.message.slice(0, 50) + '...' : (n.message || '');
      return `
        <div class="hud-alert-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
          <div class="hud-alert-item-icon" style="color:${t.color}">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="${t.icon}"/></svg>
          </div>
          <div class="hud-alert-item-body">
            <span class="hud-alert-item-title">${n.title || ''}</span>
            <span class="hud-alert-item-msg">${msg}</span>
          </div>
          <span class="hud-alert-item-time">${_bellTimeAgo(n.created_at)}</span>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.hud-alert-item.unread').forEach(item => {
      item.addEventListener('click', () => {
        const notifs = State.get('notifications') || [];
        const n = notifs.find(x => x.id === item.dataset.id);
        if (n) { n.read = true; _renderAlertDropdown(); _updateBellBadge(notifs); }
      });
    });
  }

  function _bellTimeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return mins + 'm';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h';
    return Math.floor(hrs / 24) + 'd';
  }

  /* ── HUD panel toggle ── */
  function _initHUD() {
    const btn   = document.getElementById('btn-hud');
    const panel = document.getElementById('app-hud-panel');

    if (btn && panel) {
      const toggleHUD = () => {
        const sidebar = document.getElementById('app-sidebar');
        if (sidebar && !sidebar.classList.contains('open')) {
          sidebar.classList.add('open');
        }
        panel.classList.toggle('open');
        btn.classList.toggle('active');
      };
      btn.addEventListener('click', toggleHUD);

      // Close on outside click
      // Alert badge dropdown
      const alertBadge = document.getElementById('hud-alert-badge');
      const alertDropdown = document.getElementById('hud-alert-dropdown');
      if (alertBadge && alertDropdown) {
        alertBadge.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = alertDropdown.classList.toggle('open');
          if (isOpen) {
            const rect = alertBadge.getBoundingClientRect();
            alertDropdown.style.top = (rect.bottom + 8) + 'px';
            alertDropdown.style.left = rect.left + 'px';
            _renderAlertDropdown();
          }
        });
      }

      const markAllBtn = document.getElementById('hud-alert-mark-all');
      if (markAllBtn) {
        markAllBtn.addEventListener('click', () => {
          const notifs = State.get('notifications') || [];
          notifs.forEach(n => n.read = true);
          State.set('notifications', notifs);
          _renderAlertDropdown();
          _updateBellBadge(notifs);
        });
      }

      document.addEventListener('click', e => {
        if (!panel.contains(e.target) && e.target !== btn) {
          panel.classList.remove('open');
          btn.classList.remove('active');
        }
        if (alertDropdown && !alertDropdown.contains(e.target) && e.target !== alertBadge) {
          alertDropdown.classList.remove('open');
        }
      });
    }
  }

  /* ── Auth state listener ── */
  function _initAuth() {
    // Dev mode: bypass auth on localhost
    const _isDevMode = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (_isDevMode) {
      const devUser = { id: 'dev-user', email: 'dev@nicespaceship.com', name: 'Commander' };
      State.set('user', devUser);
      _updateAuthUI(devUser);
      console.log('[NICE] Dev mode — auth bypassed');
      return;
    }

    // Ephemeral session: if "Remember me" was unchecked, sign out on new browser session
    if (localStorage.getItem('nice-ephemeral-session') === '1' && !sessionStorage.getItem('nice-ephemeral-session')) {
      localStorage.removeItem('nice-ephemeral-session');
      SB.auth.signOut().catch(() => {});
    }

    SB.auth.onAuthChange((user) => {
      State.set('user', user);
      _updateAuthUI(user);
      if (user) {
        _migrateLocalSpaceships(user);
        if (typeof Notify !== 'undefined') Notify.subscribePush().catch(() => {});
      }
      if (typeof AuditLog !== 'undefined') {
        AuditLog.log('auth', { description: user ? 'Signed in as ' + (user.email || 'user') : 'Signed out' });
      }
    });

    // Check initial session
    SB.auth.getUser().then(user => {
      State.set('user', user);
      _updateAuthUI(user);
      if (user) _migrateLocalSpaceships(user);
    }).catch(() => {
      State.set('user', null);
      _updateAuthUI(null);
    });
  }

  /* ── Migrate localStorage spaceship slots to Supabase user_spaceships ── */
  async function _migrateLocalSpaceships(user) {
    if (!user || !SB.isReady() || !SB.isOnline()) return;
    const migrated = localStorage.getItem('nice-mc-migrated-' + user.id);
    if (migrated) return;

    const localShip = localStorage.getItem('nice-mc-ship');
    const localSlots = (() => { try { return JSON.parse(localStorage.getItem('nice-mc-slots') || '{}'); } catch { return {}; } })();
    if (!localShip && !Object.keys(localSlots).length) return;

    try {
      const existing = await SB.db('user_spaceships').list({ userId: user.id });
      if (existing && existing.length) {
        // User already has DB records — skip migration
        localStorage.setItem('nice-mc-migrated-' + user.id, '1');
        return;
      }

      // Build slots from localStorage
      const shipId = localShip || 'class-1';
      const shipSlots = localSlots[shipId] || {};
      const slots = {};
      for (const [idx, agentId] of Object.entries(shipSlots)) {
        if (agentId) slots[idx] = agentId;
      }

      const shipName = (typeof BlueprintStore !== 'undefined' && BlueprintStore.getSpaceship(shipId))
        ? BlueprintStore.getSpaceship(shipId).name : 'My Ship';

      await SB.db('user_spaceships').create({
        user_id: user.id,
        name: shipName,
        blueprint_id: shipId,
        slots: slots,
        status: 'standby',
      });

      localStorage.setItem('nice-mc-migrated-' + user.id, '1');
    } catch (err) {
      // Set flag even on failure to prevent retry loops
      localStorage.setItem('nice-mc-migrated-' + user.id, '1');
      console.warn('[NICE] Spaceship migration failed:', err.message);
    }
  }

  function _updateAuthUI(user) {
    const badge = document.getElementById('bell-badge');
    if (badge) badge.style.display = user ? '' : 'none';
    const hudBadge = document.getElementById('hud-alert-badge');
    if (hudBadge && !user) hudBadge.style.display = 'none';
  }

  /* ── Register routes ── */
  function _initRoutes() {
    // 4 primary zones
    Router.on('/', HomeView);                       // NICE (chat home)
    Router.on('/bridge', BlueprintsView);            // Bridge
    Router.on('/dock', { title: 'Bridge', render: () => { location.hash = '#/'; } });

    // Bridge sub-routes
    Router.on('/bridge/agents', BlueprintsView);
    Router.on('/bridge/agents/new', AgentBuilderView);
    Router.on('/bridge/agents/:id', AgentDetailView);
    Router.on('/bridge/spaceships', BlueprintsView);
    Router.on('/bridge/spaceships/new', SpaceshipBuilderView);
    Router.on('/bridge/spaceships/:id', SpaceshipDetailView);

    // Legacy redirects → bridge
    Router.on('/blueprints', { title: 'Bridge', render: () => { location.hash = '#/bridge'; } });
    Router.on('/blueprints/agents', { title: 'Bridge', render: () => { location.hash = '#/bridge?tab=agent'; } });
    Router.on('/blueprints/spaceships', { title: 'Bridge', render: () => { location.hash = '#/bridge?tab=spaceship'; } });
    Router.on('/agents', { title: 'Bridge', render: () => { location.hash = '#/bridge?tab=agent'; } });
    Router.on('/agents/new', AgentBuilderView);
    Router.on('/agents/:id', AgentDetailView);
    Router.on('/spaceships', { title: 'Bridge', render: () => { location.hash = '#/bridge?tab=spaceship'; } });
    Router.on('/spaceships/new', SpaceshipBuilderView);
    Router.on('/spaceships/:id', SpaceshipDetailView);
    Router.on('/log', { title: 'Bridge', render: () => { location.hash = '#/bridge?tab=missions'; } });
    Router.on('/missions', { title: 'Bridge', render: () => { location.hash = '#/bridge?tab=missions'; } });
    if (typeof MissionDetailView !== 'undefined') Router.on('/missions/:id', MissionDetailView);
    Router.on('/analytics', { title: 'Bridge', render: () => { location.hash = '#/bridge?tab=operations'; } });
    Router.on('/cost', { title: 'Bridge', render: () => { location.hash = '#/bridge?tab=operations'; } });
    Router.on('/board', { title: 'Bridge', render: () => { location.hash = '#/'; } });
    Router.on('/workflows', { title: 'Bridge', render: () => { location.hash = '#/bridge?tab=missions'; } });

    // Ecosystem routes (kept)
    Router.on('/connectors', { title: 'Bridge', render: () => { location.hash = '#/bridge'; } });
    Router.on('/integrations', { title: 'Integrations', render: () => { location.hash = '#/security?tab=integrations'; } });
    Router.on('/vault', { title: 'Vault', render: () => { location.hash = '#/security?tab=vault'; } });
    Router.on('/security', SecurityView);
    Router.on('/profile', ProfileView);
    if (typeof AlertsView !== 'undefined') Router.on('/alerts', AlertsView);
    Router.on('/settings', SettingsView);
    Router.on('/wallet', WalletView);
    Router.on('/theme-editor', ThemeCreatorView);
    Router.on('/theme-creator', ThemeCreatorView);
    Router.on('/workflows/:id', WorkflowDetailView);
    if (typeof ShipLogView !== 'undefined') Router.on('/ship-log', ShipLogView);
    if (typeof SharedReportView !== 'undefined') Router.on('/share/:id', SharedReportView);
  }

  /* ── Modal helpers ── */
  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    _focusTrapCleanup = _trapFocus(modal);
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('open');
    if (_focusTrapCleanup) { _focusTrapCleanup(); _focusTrapCleanup = null; }
  }

  /* ── Service Worker ── */
  function _registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(async (reg) => {
          // Register periodic sync (12h interval)
          if ('periodicSync' in reg) {
            try {
              await reg.periodicSync.register('nice-sync', { minInterval: 12 * 60 * 60 * 1000 });
            } catch (e) { /* periodic sync not supported or permission denied */ }
          }
          // Listen for SW messages
          navigator.serviceWorker.addEventListener('message', (e) => {
            if (e.data?.type === 'SYNC_READY' && typeof Notify !== 'undefined') {
              Notify.send({ title: 'Back Online', message: 'Connection restored. Data synced.', type: 'system' });
            }
          });
        })
        .catch(err => {
          console.warn('SW registration failed:', err);
        });
    }
  }

  /* ── localStorage migration (ATM → NICE) ── */
  function _migrateStorage() {
    const migrations = [
      ['atm-settings', 'nice-settings'],
      ['atm-budget', 'nice-budget'],
    ];
    migrations.forEach(([oldKey, newKey]) => {
      if (!localStorage.getItem(newKey) && localStorage.getItem(oldKey)) {
        localStorage.setItem(newKey, localStorage.getItem(oldKey));
        localStorage.removeItem(oldKey);
      }
    });
  }

  /* ── Realtime Presence ── */
  let _presenceChannel = null;

  function _initPresence() {
    const user = State.get('user');
    if (!user?.id || typeof SB === 'undefined' || !SB.client) return;

    try {
      const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Pilot';
      _presenceChannel = SB.client.channel('nice-presence', {
        config: { presence: { key: user.id } },
      });

      _presenceChannel
        .on('presence', { event: 'sync' }, () => {
          const state = _presenceChannel.presenceState();
          const users = Object.values(state).flat();
          State.set('onlineUsers', users);
          _updatePresenceUI(users);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await _presenceChannel.track({
              user_id: user.id,
              display_name: displayName,
              current_view: Router.path(),
              online_at: new Date().toISOString(),
            });
          }
        });

      // Update presence on route change
      window.addEventListener('hashchange', () => {
        if (_presenceChannel) {
          _presenceChannel.track({
            user_id: user.id,
            display_name: displayName,
            current_view: Router.path(),
            online_at: new Date().toISOString(),
          }).catch(() => {});
        }
      });
    } catch (e) {
      console.warn('[NICE] Presence init failed:', e);
    }
  }

  function _updatePresenceUI(users) {
    const el = document.getElementById('sidebar-presence');
    if (!el) return;
    const currentUser = State.get('user');
    const others = users.filter(u => u.user_id !== currentUser?.id);
    const count = users.length;

    const avatarHTML = others.slice(0, 5).map(u => {
      const initials = (u.display_name || 'U').slice(0, 2).toUpperCase();
      const viewLabel = (u.current_view || '/').replace(/^\//, '') || 'Home';
      return `<span class="presence-avatar" title="${u.display_name || 'User'} viewing ${viewLabel}" style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:var(--accent);color:var(--bg);font-size:.6rem;font-weight:700;cursor:default">${initials}</span>`;
    }).join('');

    el.innerHTML = `
      <div class="presence-indicator">
        <span class="presence-dot"></span>
        <span class="presence-count">${count} online</span>
        ${others.length ? `<div class="presence-avatars" style="display:flex;gap:2px;margin-left:6px">${avatarHTML}${others.length > 5 ? `<span class="presence-avatar presence-more" style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:var(--border);color:var(--text-muted);font-size:.55rem;font-weight:600">+${others.length - 5}</span>` : ''}</div>` : ''}
      </div>`;
  }

  /* ── Idle session timeout ── */
  let _idleTimer = null;
  let _warningTimer = null;
  const IDLE_WARN_MS  = 30 * 60 * 1000; // 30 minutes
  const IDLE_LOGOUT_MS = 5 * 60 * 1000; // 5 more minutes after warning

  function _initIdleTimeout() {
    const events = ['click', 'keypress', 'scroll', 'mousemove', 'touchstart'];

    function resetIdle() {
      if (_idleTimer) clearTimeout(_idleTimer);
      if (_warningTimer) clearTimeout(_warningTimer);
      _dismissIdleWarning();

      _idleTimer = setTimeout(() => {
        _showIdleWarning();
        _warningTimer = setTimeout(() => {
          _dismissIdleWarning();
          if (typeof SB !== 'undefined') {
            SB.auth.signOut().catch(() => {});
          }
          State.set('user', null);
          window.location.hash = '#/profile';
          if (typeof Notify !== 'undefined') {
            Notify.send({ title: 'Session Expired', message: 'You were signed out due to inactivity.', type: 'system' });
          }
        }, IDLE_LOGOUT_MS);
      }, IDLE_WARN_MS);
    }

    events.forEach(evt => document.addEventListener(evt, resetIdle, { passive: true }));
    resetIdle();
  }

  function _showIdleWarning() {
    if (document.getElementById('idle-warning-modal')) return;
    const overlay = document.createElement('div');
    overlay.id = 'idle-warning-modal';
    overlay.className = 'modal-overlay open';
    overlay.setAttribute('role', 'dialog');
    overlay.innerHTML = `
      <div class="modal-box" style="max-width:400px;text-align:center;">
        <div class="modal-hdr"><h3 class="modal-title">Session Expiring</h3></div>
        <div class="modal-body">
          <p style="margin-bottom:16px;">Your session will expire in 5 minutes due to inactivity.</p>
          <button class="btn btn-primary btn-sm" id="idle-dismiss-btn">I'm still here</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('idle-dismiss-btn')?.addEventListener('click', () => {
      _dismissIdleWarning();
    });
  }

  function _dismissIdleWarning() {
    const modal = document.getElementById('idle-warning-modal');
    if (modal) modal.remove();
  }

  /* ── Global error handlers ── */
  let _errorQueue = [];
  let _errorFlushTimer = null;

  function _logErrorToDb(entry) {
    _errorQueue.push(entry);
    if (!_errorFlushTimer) {
      _errorFlushTimer = setTimeout(_flushErrors, 2000);
    }
  }

  async function _flushErrors() {
    _errorFlushTimer = null;
    if (!_errorQueue.length) return;
    const batch = _errorQueue.splice(0, 10);
    if (typeof SB === 'undefined' || !SB.isReady()) return;
    const user = typeof State !== 'undefined' ? State.get('user') : null;
    for (const e of batch) {
      try {
        await SB.db('error_log').create({
          user_id: user ? user.id : null,
          message: (e.message || '').slice(0, 500),
          source: (e.source || '').slice(0, 200),
          line: e.line || null,
          col: e.col || null,
          stack: (e.stack || '').slice(0, 2000),
          url: location.href.slice(0, 200),
          user_agent: navigator.userAgent.slice(0, 200),
        });
      } catch { /* don't recurse on error logging failures */ }
    }
  }

  function _initErrorHandlers() {
    window.onerror = function(msg, src, line, col, err) {
      const message = err?.message || (typeof msg === 'string' ? msg : 'Unknown error');
      const location = src ? ` at ${src}:${line}:${col}` : '';
      console.error(`[NICE] Error: ${message}${location}`);
      // Log to DB
      _logErrorToDb({ message, source: src, line, col, stack: err?.stack });
      // Suppress Supabase/network errors from notification spam
      if (/supabase|fetch|network|CORS|ERR_/i.test(message)) return false;
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'System Error', message: message.slice(0, 80), type: 'system' });
      }
      return false;
    };

    window.addEventListener('unhandledrejection', (e) => {
      const reason = e.reason;
      const message = reason?.message || (typeof reason === 'string' ? reason : 'Unhandled async error');
      console.error(`[NICE] Unhandled rejection: ${message}`);
      // Log to DB
      _logErrorToDb({ message, stack: reason?.stack, source: 'unhandledrejection' });
      // Suppress Supabase/network errors from notification spam
      if (/supabase|fetch|network|CORS|ERR_|Failed to fetch/i.test(message)) return;
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Async Error', message: message.slice(0, 80), type: 'system' });
      }
    });
  }

  /* ── Focus trapping for modals ── */
  let _focusTrapCleanup = null;

  function _trapFocus(modal) {
    const focusable = modal.querySelectorAll('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return () => {};
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    function handler(e) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    modal.addEventListener('keydown', handler);
    first.focus();
    return () => modal.removeEventListener('keydown', handler);
  }

  /* ── Sidebar drag & drop reordering ── */
  let _draggedNavLink = null;

  function _applySidebarOrder() {
    const saved = localStorage.getItem('nice-sidebar-order');
    if (!saved) return;
    try {
      const order = JSON.parse(saved);
      const container = document.getElementById('nav-group-main-items');
      if (!container) return;
      const links = Array.from(container.querySelectorAll('.side-link'));
      const map = {};
      links.forEach(l => { map[l.dataset.view] = l; });
      order.forEach(id => { if (map[id]) container.appendChild(map[id]); });
    } catch(e) { /* ignore */ }
  }

  function _saveSidebarOrder() {
    const container = document.getElementById('nav-group-main-items');
    if (!container) return;
    const order = Array.from(container.querySelectorAll('.side-link')).map(l => l.dataset.view);
    localStorage.setItem('nice-sidebar-order', JSON.stringify(order));
  }

  function _initSidebarDnD() {
    const container = document.getElementById('nav-group-main-items');
    if (!container || window.innerWidth <= 768) return;

    _applySidebarOrder();

    container.querySelectorAll('.side-link').forEach(link => {
      link.setAttribute('draggable', 'true');

      link.addEventListener('dragstart', (e) => {
        _draggedNavLink = link;
        link.classList.add('side-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', link.dataset.view);
      });

      link.addEventListener('dragend', () => {
        link.classList.remove('side-dragging');
        container.querySelectorAll('.side-link').forEach(l => l.classList.remove('side-drag-over'));
        _draggedNavLink = null;
      });

      link.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (_draggedNavLink && _draggedNavLink !== link) {
          link.classList.add('side-drag-over');
        }
      });

      link.addEventListener('dragleave', () => {
        link.classList.remove('side-drag-over');
      });

      link.addEventListener('drop', (e) => {
        e.preventDefault();
        link.classList.remove('side-drag-over');
        if (_draggedNavLink && _draggedNavLink !== link) {
          const children = Array.from(container.querySelectorAll('.side-link'));
          const dragIdx = children.indexOf(_draggedNavLink);
          const dropIdx = children.indexOf(link);
          if (dragIdx < dropIdx) {
            container.insertBefore(_draggedNavLink, link.nextSibling);
          } else {
            container.insertBefore(_draggedNavLink, link);
          }
          _saveSidebarOrder();
        }
      });
    });
  }

  /* ── Sidebar keyboard navigation ── */
  function _initSidebarKeyboard() {
    const links = Array.from(document.querySelectorAll('.side-link'));
    links.forEach((link, i) => {
      link.setAttribute('tabindex', '0');
      link.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); links[(i + 1) % links.length].focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); links[(i - 1 + links.length) % links.length].focus(); }
      });
    });
  }

  /* ── UTM / referral capture ── */
  function _captureUTM() {
    const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref'];
    const params = Router.query();
    const captured = {};
    keys.forEach(k => { if (params[k]) captured[k] = params[k]; });
    if (!Object.keys(captured).length) return;

    // First-touch: never overwrite
    if (!localStorage.getItem('nice-utm-first')) {
      localStorage.setItem('nice-utm-first', JSON.stringify(captured));
    }
    // Last-touch: always overwrite
    localStorage.setItem('nice-utm-last', JSON.stringify(captured));
  }

  /* ── Step 50: Pull-to-refresh ── */
  function _initPullToRefresh() {
    const main = document.querySelector('.app-main');
    if (!main || !('ontouchstart' in window)) return;

    let _startY = 0;
    let _pulling = false;
    let _indicator = null;

    // Create indicator element
    _indicator = document.createElement('div');
    _indicator.className = 'pull-refresh-indicator';
    _indicator.textContent = '↻';
    main.style.position = 'relative';
    main.appendChild(_indicator);

    main.addEventListener('touchstart', (e) => {
      if (main.scrollTop <= 0) {
        _startY = e.touches[0].clientY;
        _pulling = true;
      }
    }, { passive: true });

    main.addEventListener('touchmove', (e) => {
      if (!_pulling) return;
      const deltaY = e.touches[0].clientY - _startY;
      if (deltaY > 20 && main.scrollTop <= 0) {
        _indicator.classList.add('visible');
      }
      if (deltaY > 60) {
        _indicator.classList.add('refreshing');
      }
    }, { passive: true });

    main.addEventListener('touchend', () => {
      if (!_pulling) return;
      _pulling = false;
      if (_indicator.classList.contains('refreshing')) {
        // Reload current view
        const hash = location.hash || '#/';
        if (typeof Router !== 'undefined') Router.navigate(hash);
        _announce('Page refreshed');
      }
      setTimeout(() => {
        _indicator.classList.remove('visible', 'refreshing');
      }, 300);
    }, { passive: true });
  }

  /* ── Step 53: Active sidebar link aria-current ── */
  function _updateActiveSidebarLink() {
    const path = location.hash.replace(/^#/, '') || '/';
    document.querySelectorAll('.side-link').forEach(link => {
      const href = (link.getAttribute('href') || '').replace(/^#/, '');
      if (href === path || (path.startsWith(href) && href !== '/' && href.length > 1)) {
        link.setAttribute('aria-current', 'page');
        link.classList.add('active');
      } else {
        link.removeAttribute('aria-current');
        link.classList.remove('active');
      }
    });
  }

  /* ── Step 56: Screen reader announcements ── */
  function _announce(message) {
    const el = document.getElementById('sr-announcer');
    if (!el) return;
    el.textContent = '';
    // Force re-announcement by clearing first
    requestAnimationFrame(() => { el.textContent = message; });
  }

  /* ── Guest / Demo mode ── */
  function _initGuestMode() {
    const params = new URLSearchParams(window.location.search);
    const isDemo = params.get('demo') === '1';
    const user = State.get('user');

    if (isDemo || !user) {
      State.set('guestMode', true);
      _showGuestBanner();
    } else {
      State.set('guestMode', false);
    }
  }

  function _showGuestBanner() {
    if (document.getElementById('guest-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'guest-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:var(--accent);color:var(--bg);padding:8px 16px;text-align:center;font-size:0.82rem;font-family:var(--font-m);display:flex;align-items:center;justify-content:center;gap:12px;';
    banner.innerHTML = 'You are in demo mode. <a href="#/profile" style="color:var(--bg);font-weight:700;text-decoration:underline;">Sign Up</a> to save your work.';
    document.body.prepend(banner);
    const sidebar = document.getElementById('app-sidebar');
    if (sidebar) sidebar.style.top = '32px';
    const mobileBar = document.getElementById('app-mobile-bar');
    if (mobileBar) mobileBar.style.top = '32px';
  }

  /** Check if a write operation is allowed (blocks in guest mode) */
  function guardWrite(action) {
    if (State.get('guestMode')) {
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Demo Mode', message: 'Sign up to save your ' + (action || 'changes') + '.', type: 'system' });
      }
      return false;
    }
    return true;
  }

  /* ── Init ── */
  function init() {
    _initErrorHandlers();
    _migrateStorage();
    _captureUTM();
    Theme.init();
    Font.init();
    if (typeof Skin !== 'undefined') Skin.init();
    if (typeof ThemeCreatorView !== 'undefined' && ThemeCreatorView.restoreSaved) ThemeCreatorView.restoreSaved();
    // Restore high contrast mode (Step 54)
    if (localStorage.getItem('nice-high-contrast') === '1') {
      document.documentElement.setAttribute('data-contrast', 'high');
    }
    _initSidebar();
    _initSidebarDnD();
    _initSidebarKeyboard();
    _initScrollToTop();
    _initHUD();
    _initBellDropdown();
    _initAuth();
    _initRoutes();
    _registerSW();
    Notify.init();

    // Initialize command palette and keyboard shortcuts
    if (typeof CommandPalette !== 'undefined') CommandPalette.init();
    if (typeof Keyboard !== 'undefined') Keyboard.init();

    // Header user info
    _updateHeaderUser();
    State.on('user', _updateHeaderUser);

    // Blueprint store (loads seeds immediately, fetches DB in background)
    if (typeof BlueprintStore !== 'undefined') BlueprintStore.init();

    // Ship-themed auto-switching
    _initShipThemeWatcher();

    // Gamification DB sync (merge localStorage with Supabase)
    if (typeof Gamification !== 'undefined' && Gamification.initFromDB) Gamification.initFromDB();

    // Floating prompt panel (route-aware)
    if (typeof PromptPanel !== 'undefined') {
      PromptPanel.init();
      PromptPanel.syncRoute();
      window.addEventListener('hashchange', () => {
        PromptPanel.syncRoute();
        // On home route, hide floating bar (HomeView embeds it inline)
        const path = (location.hash || '#/').replace('#', '') || '/';
        if (path === '/') PromptPanel.hide();
      });
      // Brand logo click → navigate to home (chat)
      const brandBtn = document.getElementById('nice-brand-btn');
      if (brandBtn) brandBtn.addEventListener('click', (e) => {
        e.preventDefault();
        location.hash = '#/';
      });
    }
    if (typeof PreviewPanel !== 'undefined') PreviewPanel.init();

    // Start router
    const appView = document.getElementById('app-view');
    Router.init(appView);

    // Sidebar gamification removed — rank & resources shown in Home view widgets

    // Activity feed
    if (typeof ActivityFeed !== 'undefined') ActivityFeed.init();

    // Message bar (AI communications ticker)
    if (typeof MessageBar !== 'undefined') MessageBar.init();

    // Quick Notes panel
    if (typeof QuickNotes !== 'undefined') QuickNotes.init();

    // Favorites / Bookmarks
    if (typeof Favorites !== 'undefined') Favorites.init();

    // Realtime presence
    _initPresence();

    // Idle session timeout
    _initIdleTimeout();

    // Sidebar badges — live counts
    _updateSidebarBadges();
    State.on('agents', _updateSidebarBadges);
    State.on('missions', _updateSidebarBadges);
    State.on('spaceships', _updateSidebarBadges);

    // Re-render current view when skin changes
    State.on('skin', () => {
      const hash = window.location.hash || '#/';
      if (typeof Router !== 'undefined') Router.navigate(hash);
    });

    // Offline queue (Step 52)
    if (typeof OfflineQueue !== 'undefined') OfflineQueue.init();

    // Pull-to-refresh (Step 50)
    _initPullToRefresh();

    // Active sidebar link + aria-current (Step 53)
    _updateActiveSidebarLink();
    window.addEventListener('hashchange', () => {
      _updateActiveSidebarLink();
      // Screen reader announce view change (Step 56)
      const title = document.getElementById('app-page-title');
      if (title) _announce('Navigated to ' + title.textContent);
    });

    // Announce notification count changes (Step 56)
    State.on('notifications', (notifs) => {
      const unread = (notifs || []).filter(n => !n.read).length;
      if (unread > 0) _announce(unread + ' new notification' + (unread !== 1 ? 's' : ''));
    });

    // Guest/demo mode (after auth init has set user)
    setTimeout(_initGuestMode, 500);
    State.on('user', (user) => {
      if (user) {
        State.set('guestMode', false);
        const banner = document.getElementById('guest-banner');
        if (banner) banner.remove();
        const sidebar = document.getElementById('app-sidebar');
        if (sidebar) sidebar.style.top = '';
        const mobileBar = document.getElementById('app-mobile-bar');
        if (mobileBar) mobileBar.style.top = '';
      }
    });
  }

  function _updateSidebarBadges() {
    const agents = State.get('agents') || [];
    const missions = State.get('missions') || [];
    const spaceships = State.get('spaceships') || [];

    // Agents: alert when any agent is in error or offline
    const agentAlerts = agents.filter(a => a.status === 'error' || a.status === 'offline').length;
    _setBadge('sb-agents', agentAlerts, 'badge-warn');

    // Missions: alert when missions have failed
    const failedMissions = missions.filter(m => m.status === 'failed').length;
    _setBadge('sb-running', failedMissions, 'badge-warn');

    // Spaceships: alert when a deployed ship has agents in error state
    const shipAlerts = spaceships.filter(s => {
      if (s.status !== 'deployed') return false;
      const crew = Array.isArray(s.agents) ? s.agents : (Array.isArray(s.agent_ids) ? s.agent_ids : []);
      return crew.some(id => {
        const agent = agents.find(a => a.id === id);
        return agent && (agent.status === 'error' || agent.status === 'offline');
      });
    }).length;
    _setBadge('sb-ships', shipAlerts, 'badge-warn');
  }

  function _setBadge(id, count, extraClass) {
    const el = document.getElementById(id);
    if (!el) return;
    if (count > 0) {
      el.textContent = count;
      el.style.display = '';
      el.className = 'side-badge' + (extraClass ? ' ' + extraClass : '');
    } else {
      el.style.display = 'none';
    }
  }

  return { init, openModal, closeModal, guardWrite, _trapFocus };
})();

/* ── Boot ── */
document.addEventListener('DOMContentLoaded', NICE.init);
