/* ═══════════════════════════════════════════════════════════════════
   NICE — Main Orchestrator
   Initializes all modules, registers routes, manages app lifecycle.
═══════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────────
   MODULE: Theme Engine (reused from main site)
───────────────────────────────────────────────────────────────── */
const Theme = (() => {
  // BUILTIN derived from THEMES — no separate list to maintain
  let BUILTIN; // set after THEMES definition

  // Local key constants — Theme loads before Utils, so can't use Utils.KEYS
  const _K_THEME = 'ns-theme';
  const _K_FONT  = 'ns-font';

  // CSS var keys to clear when switching themes
  const VAR_KEYS = ['--bg','--bg2','--bg-alt','--surface','--surface2','--border','--border-hi','--accent','--accent2','--text','--fg','--text-muted','--text-dim','--glow','--glow-hi','--panel-bg','--panel-border','--nav-bg','--nav-bg-dk','--nav-text','--nav-text-muted','--nav-text-dim','--nav-border','--nav-surface','--nav-surface2','--font-h','--font-d','--font-b','--font-m','--radius','--scan','--border-width','--hero-grad','--bg-pattern'];

  // All available themes — directly accessible from HUD dock and GUI editor
  const THEMES = [
    { id:'spaceship', name:'NICE', builtin:true, accent:'#080808', preview:['#080808','#ffffff','#888888'],
      data:{ colors:{ '--bg':'#080808','--bg2':'#101010','--surface':'#161616','--surface2':'#1e1e1e','--border':'#2a2a2a','--border-hi':'#555555','--accent':'#ffffff','--accent2':'#888888','--text':'#f0f0f0','--text-muted':'#666666','--glow':'none','--panel-bg':'rgba(16,16,16,0.97)' }, fonts:{ '--font-h':"'Inter', sans-serif", '--font-b':"'Inter', sans-serif" }, radius:'0px' } },
    { id:'robotech', name:'HAL-9000', builtin:true, accent:'#999', preview:['#f2f2f0','#999','#ef4444'],
      data:{ colors:{ '--bg':'#f2f2f0','--bg2':'#eaeae8','--bg-alt':'#ffffff','--surface':'#fff','--surface2':'#f8f8f6','--border':'#d0d0ce','--border-hi':'#999','--accent':'#666','--accent2':'#999','--text':'#1a1a1a','--text-muted':'#888','--text-dim':'#aaaaaa','--glow':'none','--panel-bg':'#fff','--panel-border':'#d0d0ce' }, fonts:{ '--font-h':"'Inter', sans-serif", '--font-b':"'Inter', sans-serif" }, radius:'4px' } },
    { id:'navigator', name:'The Grid', builtin:true, accent:'#18a0fb', preview:['#02090f','#18a0fb','#0a6bc4'],
      data:{ colors:{ '--bg':'#02090f','--bg2':'#041220','--surface':'rgba(24,120,220,0.05)','--surface2':'rgba(24,120,220,0.09)','--border':'rgba(24,160,251,0.25)','--border-hi':'rgba(24,160,251,0.6)','--accent':'#18a0fb','--accent2':'#0a6bc4','--text':'#c0d8f0','--text-muted':'rgba(24,160,251,0.55)','--glow':'0 0 16px rgba(24,160,251,0.22)','--panel-bg':'rgba(2,9,15,0.95)' }, fonts:{ '--font-h':"'Orbitron', sans-serif", '--font-b':"'Inter', sans-serif" }, radius:'2px' } },
    { id:'matrix', name:'The Matrix', builtin:true, accent:'#00ff41', preview:['#000800','#00ff41','#00aa2a'],
      data:{ colors:{ '--bg':'#000800','--bg2':'#000c00','--surface':'rgba(0,255,65,0.04)','--surface2':'rgba(0,255,65,0.08)','--border':'rgba(0,255,65,0.2)','--border-hi':'rgba(0,255,65,0.5)','--accent':'#00ff41','--accent2':'#00aa2a','--text':'#00ff41','--text-muted':'rgba(0,255,65,0.5)','--glow':'0 0 12px rgba(0,255,65,0.3)','--panel-bg':'rgba(0,6,0,0.97)' }, fonts:{ '--font-h':"'Fira Code', monospace", '--font-b':"'Fira Code', monospace" }, radius:'0px' } },
    { id:'lcars', name:'LCARS', builtin:true, accent:'#ff9966', preview:['#000000','#ff9966','#cc99ff'],
      data:{ colors:{ '--bg':'#000000','--bg2':'#000000','--surface':'rgba(255,153,102,0.06)','--surface2':'rgba(204,153,255,0.06)','--border':'#cc7744','--border-hi':'#ff9966','--accent':'#ff9966','--accent2':'#cc99ff','--text':'#ff9966','--text-muted':'#cc99ff','--glow':'none','--panel-bg':'#000000' }, fonts:{ '--font-h':"'Antonio', sans-serif", '--font-b':"'Antonio', sans-serif" }, radius:'24px' } },
    { id:'jarvis', name:'J.A.R.V.I.S.', builtin:true, accent:'#00e5ff', preview:['#070d1a','#00e5ff','#18ffff'],
      data:{ colors:{ '--bg':'#070d1a','--bg2':'#0c1829','--surface':'rgba(0,229,255,0.04)','--surface2':'rgba(0,229,255,0.08)','--border':'rgba(0,229,255,0.18)','--border-hi':'rgba(0,229,255,0.5)','--accent':'#00e5ff','--accent2':'#18ffff','--text':'#b2ebf2','--text-muted':'rgba(0,229,255,0.55)','--glow':'0 0 16px rgba(0,229,255,0.2)','--panel-bg':'rgba(7,13,26,0.95)' }, fonts:{ '--font-h':"'Exo 2', sans-serif", '--font-b':"'Inter', sans-serif" }, radius:'3px' } },
    { id:'cyberpunk', name:'Cyberpunk', builtin:true, accent:'#ff2d6f', preview:['#0a0a0f','#ff2d6f','#00fff5'],
      data:{ colors:{ '--bg':'#0a0a0f','--bg2':'#12121a','--surface':'#1a1a2e','--surface2':'#222240','--border':'#2a2a4a','--border-hi':'#ff2d6f','--accent':'#ff2d6f','--accent2':'#00fff5','--text':'#e0e0ff','--text-muted':'#7a7a9e','--glow':'0 0 15px rgba(255,45,111,0.3)','--glow-hi':'0 0 25px rgba(0,255,245,0.4)','--panel-bg':'rgba(10,10,15,0.97)' }, fonts:{ '--font-h':"'Orbitron', sans-serif", '--font-b':"'Fira Code', monospace" }, radius:'2px' } },
    { id:'gundam', name:'RX-78-2', builtin:true, accent:'#2b4e8c', preview:['#12131a','#2b4e8c','#c0392b'],
      data:{ colors:{ '--bg':'#12131a','--bg2':'#191b24','--surface':'#1e2030','--surface2':'#252838','--border':'#3a3f55','--border-hi':'#2b4e8c','--accent':'#2b4e8c','--accent2':'#c0392b','--text':'#e0e0e8','--text-muted':'#7a7e94','--glow':'0 0 12px rgba(43,78,140,0.25)','--glow-hi':'0 0 20px rgba(192,57,43,0.3)','--panel-bg':'rgba(18,19,26,0.97)' }, fonts:{ '--font-h':"'Rajdhani', sans-serif", '--font-b':"'Rajdhani', sans-serif" }, radius:'2px' } },
    { id:'16bit', name:'16-BIT', builtin:true, accent:'#e2b714', preview:['#1a1a2e','#e2b714','#2980b9'],
      data:{ colors:{ '--bg':'#1a1a2e','--bg2':'#16213e','--surface':'#1f2b47','--surface2':'#253352','--border':'#2e4068','--border-hi':'#e2b714','--accent':'#e2b714','--accent2':'#2980b9','--text':'#e8e0d0','--text-muted':'#8a8070','--glow':'0 0 0 1px #e2b714','--glow-hi':'0 0 0 2px #2980b9','--panel-bg':'rgba(22,33,62,0.97)' }, fonts:{ '--font-h':"'Press Start 2P', cursive", '--font-b':"'Press Start 2P', cursive" }, radius:'0px' } },
    { id:'office', name:'The Office', builtin:true, accent:'#0F52BA', preview:['#f0f0f2','#0F52BA','#3b7dd8'],
      data:{ colors:{ '--bg':'#e8e8ec','--bg2':'#dcdce0','--bg-alt':'#f0f0f2','--surface':'rgba(0,0,0,0.02)','--surface2':'#f5f5f7','--border':'#d4d4d8','--border-hi':'#0F52BA','--accent':'#0F52BA','--accent2':'#3b7dd8','--text':'#18181b','--text-muted':'#52525b','--text-dim':'#a1a1aa','--glow':'0 0 0 1px rgba(15,82,186,0.08)','--glow-hi':'0 0 12px rgba(15,82,186,0.12)','--panel-bg':'#ffffff','--panel-border':'#d4d4d8','--nav-bg':'#7285A5','--nav-bg-dk':'#0E4C92','--nav-text':'#ffffff','--nav-text-muted':'rgba(255,255,255,0.85)','--nav-text-dim':'rgba(255,255,255,0.6)','--nav-border':'rgba(255,255,255,0.15)','--nav-surface':'rgba(255,255,255,0.1)','--nav-surface2':'rgba(255,255,255,0.15)' }, fonts:{ '--font-h':"'Inter', sans-serif", '--font-b':"'Inter', sans-serif" }, radius:'10px' } },
    { id:'office-dark', name:'The Office', builtin:false, accent:'#a5b4fc', preview:['#09090b','#a5b4fc','#e0e7ff'],
      data:{ colors:{ '--bg':'#09090b','--bg2':'#18181b','--bg-alt':'#18181b','--surface':'rgba(255,255,255,0.03)','--surface2':'#27272a','--border':'#3f3f46','--border-hi':'#71717a','--accent':'#e0e7ff','--accent2':'#a5b4fc','--text':'#fafafa','--text-muted':'#a1a1aa','--text-dim':'#3f3f46','--glow':'0 0 0 1px rgba(224,231,255,0.06)','--glow-hi':'0 0 12px rgba(224,231,255,0.08)','--panel-bg':'rgba(24,24,27,0.75)','--panel-border':'#3f3f46','--nav-bg':'#111114' }, fonts:{ '--font-h':"'Inter', sans-serif", '--font-b':"'Inter', sans-serif" }, radius:'10px' } },
  ];

  BUILTIN = THEMES.filter(t => t.builtin).map(t => t.id);

  function set(name) {
    // ── FORCED RESET: kill all theme assets before applying new theme ──
    // 1. Clear all CSS custom properties
    VAR_KEYS.forEach(k => document.documentElement.style.removeProperty(k));
    // 2. Remove data-theme attribute
    document.documentElement.removeAttribute('data-theme');
    // 3. Turn off all canvas/animated assets
    MatrixRain.toggle(false);
    if (typeof StarField16 !== 'undefined') StarField16.toggle(false);
    if (typeof GundamField !== 'undefined') GundamField.toggle(false);
    // 4. Hide dedicated theme elements (CSS-driven ones reset via data-theme removal)
    const tronGrid = document.getElementById('tron-grid');
    if (tronGrid) tronGrid.style.display = 'none';
    const tronCity = document.getElementById('tron-city');
    if (tronCity) tronCity.style.display = 'none';
    const tronCycles = document.getElementById('tron-cycles');
    if (tronCycles) tronCycles.style.display = 'none';

    const t = THEMES.find(t => t.id === name);

    // ── Apply new theme ──
    if (BUILTIN.includes(name)) {
      document.documentElement.setAttribute('data-theme', name);
      localStorage.setItem(_K_THEME, name);
      // Apply inline color vars for themes not defined in theme.css
      if (t && t.data) {
        const td = t.data;
        if (td.colors) Object.entries(td.colors).forEach(([k,v]) => document.documentElement.style.setProperty(k, v));
        if (td.fonts) {
          document.documentElement.style.setProperty('--font-h', td.fonts['--font-h']);
          document.documentElement.style.setProperty('--font-d', td.fonts['--font-h']);
          document.documentElement.style.setProperty('--font-b', td.fonts['--font-b']);
        }
        if (td.radius) document.documentElement.style.setProperty('--radius', td.radius);
      }
      // Activate theme-specific assets
      MatrixRain.toggle(name === 'matrix');
      if (typeof StarField16 !== 'undefined') StarField16.toggle(name === '16bit');
      if (typeof GundamField !== 'undefined') GundamField.toggle(name === 'gundam');
      // Tron elements are CSS-driven via [data-theme="navigator"] — reset inline hide
      if (name === 'navigator') {
        if (tronGrid) tronGrid.style.removeProperty('display');
        if (tronCity) tronCity.style.removeProperty('display');
        if (tronCycles) tronCycles.style.removeProperty('display');
      }
    } else {
      // Non-built-in: look up in THEMES by id (custom themes)
      if (!t) return;
      const td = t.data;
      if (td.colors) Object.entries(td.colors).forEach(([k,v]) => document.documentElement.style.setProperty(k, v));
      if (td.fonts) {
        document.documentElement.style.setProperty('--font-h', td.fonts['--font-h']);
        document.documentElement.style.setProperty('--font-d', td.fonts['--font-h']);
        document.documentElement.style.setProperty('--font-b', td.fonts['--font-b']);
      }
      if (td.radius) document.documentElement.style.setProperty('--radius', td.radius);
      localStorage.setItem(_K_THEME, name);
    }

    // Highlight active dock button
    document.querySelectorAll('.db').forEach(b => b.classList.remove('active'));
    document.querySelector(`.db[data-theme-id="${name}"]`)?.classList.add('active');

    // Update active theme name label
    const nameEl = document.getElementById('active-theme-name');
    if (nameEl) nameEl.textContent = (t ? t.name : name).toUpperCase();

    // Update theme-color meta for PWA
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      meta.setAttribute('content', bg || '#080808');
    }

    // Theme-specific terminology
    _applyOfficeLabels(name === 'office' || name === 'office-dark');
    _applyLcarsLabels(name === 'lcars');
    _updateDarkLightIcon();

    // If leaving The Grid, destroy TRON game and reset to default tab
    if (name !== 'navigator' && typeof TronView !== 'undefined' && TronView.destroy) {
      TronView.destroy();
      const tronTab = document.querySelector('.bp-type-tab[data-tab="tron"]');
      if (tronTab && tronTab.classList.contains('active')) {
        const schTab = document.querySelector('.bp-type-tab[data-tab="schematic"]');
        if (schTab) schTab.click();
      }
    }
  }

  const _OFFICE_LABELS = {
    'Schematic': 'Overview', 'Missions': 'Tasks',
    'Outbox': 'Communications', 'Operations': 'Analytics', 'Log': 'Activity',
    'Bridge': 'The Office', 'Deploy': 'Activate', 'Deployed': 'Active',
    'DEPLOYED': 'ACTIVE', 'SCHEMATIC': 'OVERVIEW',
    'MISSIONS': 'TASKS', 'OUTBOX': 'COMMS', 'OPERATIONS': 'ANALYTICS', 'LOG': 'ACTIVITY',
    'Spaceships': 'Businesses', 'Spaceship': 'Business',
    'Ship': 'Business', 'Create Spaceship': 'Create Business', 'Create New Spaceship': 'Create New Business',
    'Crew': 'Staff',
    "Captain's Log": 'Audit Trail', "Ship's Log": 'Chat History',
    'Sign in to NICE': 'Sign in to The Office',
    'NICE™': 'The Office',
    'spaceships': 'businesses', 'spaceship': 'business', 'crew': 'staff',
  };
  // Placeholder overrides for Office theme (attribute values the DOM text swapper can't reach)
  const _OFFICE_PLACEHOLDERS = {
    'e.g. AURORA, VANGUARD, NEXUS': 'e.g. Acme Corp, Bright Solutions, Peak Digital',
    'What does this spaceship do?': 'Define your business objectives and key deliverables',
    'e.g. Ship faster. Scale smarter.': 'e.g. Automate operations. Scale without headcount.',
    'Comma-separated: saas, startup, tech': 'Comma-separated: marketing, sales, ops',
    'Search by name, description, or tags...': 'Search by name, description, or tags...',
  };
  // Reverse map for restoring originals
  const _OFFICE_REVERSE = Object.fromEntries(Object.entries(_OFFICE_LABELS).map(([k,v]) => [v,k]));
  let _officeActive = false;
  let _officeObserver = null;

  function _applyOfficeLabels(on) {
    if (on === _officeActive) return;
    _officeActive = on;
    const map = on ? _OFFICE_LABELS : _OFFICE_REVERSE;
    _swapTextInDOM(map);
    // Observe DOM changes to re-apply on tab switches / view renders
    if (on && !_officeObserver) {
      _officeObserver = new MutationObserver(() => { if (_officeActive) _swapTextInDOM(_OFFICE_LABELS); });
      const main = document.querySelector('main') || document.querySelector('.app-main') || document.body;
      _officeObserver.observe(main, { childList: true, subtree: true, characterData: true });
    } else if (!on && _officeObserver) {
      _officeObserver.disconnect();
      _officeObserver = null;
    }
  }

  // LCARS: swap Code back to Engineering
  const _LCARS_LABELS = { 'Code': 'Engineering' };
  const _LCARS_REVERSE = { 'Engineering': 'Code' };
  let _lcarsActive = false;
  let _lcarsObserver = null;

  function _applyLcarsLabels(on) {
    if (on === _lcarsActive) return;
    _lcarsActive = on;
    const map = on ? _LCARS_LABELS : _LCARS_REVERSE;
    _swapTextInDOM(map);
    if (on && !_lcarsObserver) {
      _lcarsObserver = new MutationObserver(() => { if (_lcarsActive) _swapTextInDOM(_LCARS_LABELS); });
      const main = document.querySelector('main') || document.querySelector('.app-main') || document.body;
      _lcarsObserver.observe(main, { childList: true, subtree: true, characterData: true });
    } else if (!on && _lcarsObserver) {
      _lcarsObserver.disconnect();
      _lcarsObserver = null;
    }
  }

  function _swapTextInDOM(map) {
    // Sort keys longest-first to prevent partial matches (e.g. "Spaceships" before "Spaceship")
    const keys = Object.keys(map).sort((a, b) => b.length - a.length);
    // Tabs
    document.querySelectorAll('.bp-type-tab, .side-link span, .bridge-hero-tab, .bp-sub-tab').forEach(el => {
      for (const k of keys) {
        if (el.textContent.trim() === k || el.textContent.trim().startsWith(k + ' ')) {
          el.childNodes.forEach(n => { if (n.nodeType === 3 && n.textContent.trim()) n.textContent = n.textContent.replace(k, map[k]); });
        }
      }
    });
    // Sidebar link text (direct text nodes)
    document.querySelectorAll('.side-link, .side-folder-toggle, .side-folder-label, .sidebar-section-label').forEach(el => {
      const nodes = [];
      el.childNodes.forEach(n => { if (n.nodeType === 3) nodes.push(n); });
      el.querySelectorAll('span').forEach(s => { s.childNodes.forEach(n => { if (n.nodeType === 3) nodes.push(n); }); });
      for (const k of keys) {
        nodes.forEach(n => { if (n.textContent.includes(k)) n.textContent = n.textContent.replace(k, map[k]); });
      }
    });
    // Hero header text, buttons, labels, legends
    document.querySelectorAll('.bridge-hero-meta, h2, h3, p, .wizard-title, .bp-card-type, .btn-primary, .btn-sm, .builder-sub, .builder-legend, .builder-hint, legend, label').forEach(el => {
      for (const k of keys) {
        el.childNodes.forEach(n => { if (n.nodeType === 3 && n.textContent.includes(k)) n.textContent = n.textContent.replace(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), map[k]); });
      }
    });
    // Placeholder attributes (input, textarea)
    const phMap = _officeActive ? _OFFICE_PLACEHOLDERS : Object.fromEntries(Object.entries(_OFFICE_PLACEHOLDERS).map(([k,v]) => [v,k]));
    document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
      const ph = el.getAttribute('placeholder');
      if (phMap[ph]) el.setAttribute('placeholder', phMap[ph]);
    });
  }

  function toggleDarkLight() {
    const current = localStorage.getItem(_K_THEME) || 'spaceship';
    if (current === 'office') set('office-dark');
    else if (current === 'office-dark') set('office');
    // No-op for all other themes — toggle is hidden
  }

  function _updateDarkLightIcon() {
    const btn = document.getElementById('btn-darklight');
    if (!btn) return;
    const current = localStorage.getItem(_K_THEME) || 'spaceship';
    const isOffice = current === 'office' || current === 'office-dark';
    btn.style.display = isOffice ? '' : 'none';
    if (isOffice) {
      const isLight = current === 'office';
      const icon = isLight ? '#icon-moon' : '#icon-sun';
      btn.innerHTML = `<svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="${icon}"/></svg>`;
    }
  }

  function renderDock(filterIds) {
    const container = document.getElementById('theme-dock-btns');
    if (!container) return;

    // Use saved selection or show all
    let dockIds = filterIds;
    if (!dockIds) {
      try { dockIds = JSON.parse(localStorage.getItem(Utils.KEYS.hudDockThemes)); } catch {}
    }
    const themes = (Array.isArray(dockIds) && dockIds.length)
      ? THEMES.filter(t => dockIds.includes(t.id))
      : THEMES.filter(t => BUILTIN.includes(t.id));

    container.innerHTML = themes.map(t => {
      const accent = t.accent || (t.preview && t.preview[1]) || '#888';
      const tn = t.name.toUpperCase();
      return `<button class="db" data-theme-id="${t.id}" data-tip="${tn}" style="background:${accent}" onclick="Theme.set('${t.id}')" aria-label="${tn}" title="${tn}"></button>`;
    }).join('');

    // Highlight current
    const current = localStorage.getItem(_K_THEME) || 'spaceship';
    document.querySelectorAll('.db').forEach(b => b.classList.remove('active'));
    document.querySelector(`.db[data-theme-id="${current}"]`)?.classList.add('active');
  }

  function list() { return [...THEMES]; }

  function getTheme(id) { return THEMES.find(t => t.id === id) || null; }

  function init() {
    const saved = localStorage.getItem(_K_THEME) || 'spaceship';
    renderDock();
    set(saved);
    _updateDarkLightIcon();
  }

  function current() { return localStorage.getItem(_K_THEME) || 'spaceship'; }

  return { set, init, toggleDarkLight, renderDock, list, getTheme, current, THEMES, BUILTIN };
})();

/* ─────────────────────────────────────────────────────────────────
   MODULE: Font Engine
───────────────────────────────────────────────────────────────── */
const Font = (() => {
  // Local key constants — Font loads before Utils
  const _K_THEME = 'ns-theme';
  const _K_FONT  = 'ns-font';

  const FONT_MAP = {
    auto:  null,
    clean: "'Inter', sans-serif",
    space: "'Orbitron', sans-serif",
    tac:   "'Rajdhani', sans-serif",
    code:  "'Fira Code', monospace",
    serif: "'Playfair Display', serif",
    mono:  "'Share Tech Mono', monospace",
    pixel: "'Press Start 2P', monospace",
  };

  function set(name) {
    if (!(name in FONT_MAP)) return;
    const root = document.documentElement;
    if (name === 'auto') {
      root.removeAttribute('data-font');
      root.style.removeProperty('--font-h');
      root.style.removeProperty('--font-b');
      root.style.removeProperty('--font-d');
      // Re-apply theme fonts
      const themeId = localStorage.getItem(_K_THEME) || 'spaceship';
      const theme = Theme.THEMES.find(t => t.id === themeId);
      if (theme?.data?.fonts) {
        Object.entries(theme.data.fonts).forEach(([k, v]) => root.style.setProperty(k, v));
      }
    } else {
      root.setAttribute('data-font', name);
      const family = FONT_MAP[name];
      root.style.setProperty('--font-h', family);
      root.style.setProperty('--font-b', family);
      root.style.setProperty('--font-d', family);
    }
    localStorage.setItem(_K_FONT, name);
    document.querySelectorAll('.fb').forEach(b => b.classList.remove('active'));
    document.querySelector(`.fb[data-fid="${name}"]`)?.classList.add('active');
  }

  function init() {
    const saved = localStorage.getItem(_K_FONT) || 'auto';
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
    if (on) { _resize(); _draw(0); }
    else {
      if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  window.addEventListener('resize', () => { if (_on) _resize(); });
  return { toggle };
})();

/* ─────────────────────────────────────────────────────────────────
   MODULE: Gundam Particles (canvas) — Minovsky particle debris
───────────────────────────────────────────────────────────────── */
const GundamField = (() => {
  const canvas = document.getElementById('gundam-canvas');
  if (!canvas) return { toggle: () => {} };

  const ctx = canvas.getContext('2d');
  let _on = false, _raf = null;

  const PARTICLE_COUNT = 60;
  let particles = [];

  function _init() {
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: 1 + Math.random() * 3,
        speedX: (Math.random() - 0.5) * 0.4,
        speedY: (Math.random() - 0.5) * 0.3,
        alpha: 0.15 + Math.random() * 0.4,
        // Color: mix of white debris, blue Minovsky, red thruster sparks
        color: i < 35 ? '#8090a8' : i < 50 ? '#4a7abb' : '#c04030',
        drift: Math.random() * Math.PI * 2,
        driftSpeed: 0.003 + Math.random() * 0.008,
        shape: Math.random() > 0.7 ? 'rect' : 'dot', // debris chunks vs particles
      });
    }
  }

  function _resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    _init();
  }

  let _lastDraw = 0;
  const _interval = 50;

  function _draw(time) {
    _raf = requestAnimationFrame(_draw);
    if (time - _lastDraw < _interval) return;
    _lastDraw = time;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.drift += p.driftSpeed;
      p.x += p.speedX + Math.sin(p.drift) * 0.2;
      p.y += p.speedY + Math.cos(p.drift) * 0.15;

      // Wrap around
      if (p.x < -10) p.x = canvas.width + 10;
      if (p.x > canvas.width + 10) p.x = -10;
      if (p.y < -10) p.y = canvas.height + 10;
      if (p.y > canvas.height + 10) p.y = -10;

      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') {
        // Angular debris chunks — rotated rectangles
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.drift * 2);
        ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8);
        ctx.restore();
      } else {
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function toggle(on) {
    _on = on;
    canvas.style.display = on ? 'block' : 'none';
    if (on) { _resize(); _draw(0); }
    else {
      if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  window.addEventListener('resize', () => { if (_on) _resize(); });
  return { toggle };
})();

/* ─────────────────────────────────────────────────────────────────
   MODULE: 16-BIT Starfield (canvas) — parallax pixel starfield
───────────────────────────────────────────────────────────────── */
const StarField16 = (() => {
  const canvas = document.getElementById('snes-canvas');
  if (!canvas) return { toggle: () => {} };

  const ctx = canvas.getContext('2d');
  let _on = false, _raf = null;

  const STAR_COUNT = 120;
  const LAYERS = [
    { speed: 0.3, size: 1, color: '#4a4060', count: 50 },   // far — dim purple
    { speed: 0.8, size: 2, color: '#8a8070', count: 40 },   // mid — warm gray
    { speed: 1.8, size: 3, color: '#e8e0d0', count: 20 },   // near — bright
    { speed: 2.5, size: 4, color: '#e2b714', count: 10 },   // accent — gold twinkle
  ];

  let stars = [];

  function _init() {
    stars = [];
    LAYERS.forEach(layer => {
      for (let i = 0; i < layer.count; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          speed: layer.speed + Math.random() * 0.3,
          size: layer.size,
          color: layer.color,
          twinkle: Math.random() * Math.PI * 2,
        });
      }
    });
  }

  function _resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    _init();
  }

  let _lastDraw = 0;
  const _interval = 50; // ~20fps for retro feel

  function _draw(time) {
    _raf = requestAnimationFrame(_draw);
    if (time - _lastDraw < _interval) return;
    _lastDraw = time;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Pixel grid overlay (subtle)
    ctx.fillStyle = 'rgba(255,255,255,0.012)';
    for (let x = 0; x < canvas.width; x += 4) {
      for (let y = 0; y < canvas.height; y += 4) {
        ctx.fillRect(x, y, 1, 1);
      }
    }

    // Draw and move stars
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      s.x -= s.speed;
      s.twinkle += 0.05;
      if (s.x < -4) { s.x = canvas.width + 4; s.y = Math.random() * canvas.height; }

      const alpha = 0.5 + 0.5 * Math.sin(s.twinkle);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.color;
      // Pixel-snapped rendering (no anti-alias feel)
      const px = Math.floor(s.x);
      const py = Math.floor(s.y);
      ctx.fillRect(px, py, s.size, s.size);
    }
    ctx.globalAlpha = 1;

    // Scanline overlay
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let y = 0; y < canvas.height; y += 3) {
      ctx.fillRect(0, y, canvas.width, 1);
    }
  }

  function toggle(on) {
    _on = on;
    canvas.style.display = on ? 'block' : 'none';
    if (on) { _resize(); _draw(0); }
    else {
      if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
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
          if (typeof SB !== 'undefined') await SB.auth.signOut();
          window.location.reload();
        });
      }
    }

    // ── Chats + Missions folders (collapsible) ──
    _initChatsFolder();
    _initMissionsFolder();
  }

  function _initMissionsFolder() {
    const toggle = document.getElementById('side-missions-toggle');
    const folder = document.getElementById('side-missions-folder');
    if (toggle && folder) {
      // Restore open state
      if (localStorage.getItem(Utils.KEYS.missionsFolder) !== '0') folder.classList.add('open');
      toggle.addEventListener('click', () => {
        const isOpen = folder.classList.toggle('open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        localStorage.setItem(Utils.KEYS.missionsFolder, isOpen ? '1' : '0');
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

  /* ── Chats folder (collapsible, conversation history) ── */
  const CONVS_KEY = Utils.KEYS.conversations;
  const ACTIVE_CONV_KEY = Utils.KEYS.activeConv;

  function _getConversations() {
    try { return JSON.parse(localStorage.getItem(CONVS_KEY) || '[]'); } catch { return []; }
  }
  function _saveConversations(convs) {
    try { localStorage.setItem(CONVS_KEY, JSON.stringify(convs)); } catch {}
  }
  function _getActiveConvId() { return localStorage.getItem(ACTIVE_CONV_KEY); }
  function _setActiveConvId(id) { localStorage.setItem(ACTIVE_CONV_KEY, id); }

  function _migrateMessages() {
    // One-time migration: move flat nice-ai-messages into first conversation
    const convs = _getConversations();
    if (convs.length > 0) return;
    try {
      const raw = localStorage.getItem(Utils.KEYS.aiMessages);
      const msgs = raw ? JSON.parse(raw) : [];
      if (msgs.length > 0) {
        const firstUserMsg = msgs.find(m => m.role === 'user');
        const title = firstUserMsg ? firstUserMsg.text.slice(0, 40) : 'Chat';
        const conv = {
          id: 'conv-' + Date.now(),
          title,
          createdAt: msgs[0].ts || Date.now(),
          updatedAt: msgs[msgs.length - 1].ts || Date.now(),
          pinned: false,
          messages: msgs,
        };
        _saveConversations([conv]);
        _setActiveConvId(conv.id);
      }
    } catch {}
  }

  function _newConversation() {
    const convs = _getConversations();
    const conv = {
      id: 'conv-' + Date.now(),
      title: 'New Chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pinned: false,
      messages: [],
    };
    convs.unshift(conv);
    _saveConversations(convs);
    _setActiveConvId(conv.id);
    // Clear prompt panel messages
    localStorage.setItem(Utils.KEYS.aiMessages, '[]');
    if (typeof PromptPanel !== 'undefined' && PromptPanel._reload) PromptPanel._reload();
    _renderChatsList();
    // Navigate home to show clean state
    window.location.hash = '#/';
  }

  function _loadConversation(id) {
    // Save current conversation first
    _saveActiveConversation();
    const convs = _getConversations();
    const conv = convs.find(c => c.id === id);
    if (!conv) return;
    _setActiveConvId(id);
    localStorage.setItem(Utils.KEYS.aiMessages, JSON.stringify(conv.messages || []));
    if (typeof PromptPanel !== 'undefined' && PromptPanel._reload) PromptPanel._reload();
    _renderChatsList();
    window.location.hash = '#/';
  }

  function _saveActiveConversation() {
    const id = _getActiveConvId();
    if (!id) return;
    const convs = _getConversations();
    const conv = convs.find(c => c.id === id);
    if (!conv) return;
    try {
      const msgs = JSON.parse(localStorage.getItem(Utils.KEYS.aiMessages) || '[]');
      conv.messages = msgs;
      conv.updatedAt = Date.now();
      if (msgs.length > 0 && conv.title === 'New Chat') {
        const firstUser = msgs.find(m => m.role === 'user');
        if (firstUser) conv.title = firstUser.text.slice(0, 40);
      }
      _saveConversations(convs);
    } catch {}
  }

  function _deleteConversation(id) {
    let convs = _getConversations();
    convs = convs.filter(c => c.id !== id);
    _saveConversations(convs);
    if (_getActiveConvId() === id) {
      if (convs.length > 0) {
        _loadConversation(convs[0].id);
      } else {
        _setActiveConvId('');
        localStorage.setItem(Utils.KEYS.aiMessages, '[]');
        if (typeof PromptPanel !== 'undefined' && PromptPanel._reload) PromptPanel._reload();
        window.location.hash = '#/';
      }
    }
    _renderChatsList();
  }

  function _pinConversation(id) {
    const convs = _getConversations();
    const conv = convs.find(c => c.id === id);
    if (conv) conv.pinned = !conv.pinned;
    _saveConversations(convs);
    _renderChatsList();
  }

  function _renameConversation(id) {
    const item = document.querySelector(`.side-chat-item[data-conv-id="${id}"] .side-chat-title`);
    if (!item) return;
    const current = item.textContent;
    item.contentEditable = 'true';
    item.focus();
    // Select all text
    const range = document.createRange();
    range.selectNodeContents(item);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);

    const finish = () => {
      item.contentEditable = 'false';
      const newTitle = item.textContent.trim() || current;
      const convs = _getConversations();
      const conv = convs.find(c => c.id === id);
      if (conv) conv.title = newTitle.slice(0, 60);
      _saveConversations(convs);
    };
    item.addEventListener('blur', finish, { once: true });
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); item.blur(); }
      if (e.key === 'Escape') { item.textContent = current; item.blur(); }
    });
  }

  function _shareConversation(id) {
    const convs = _getConversations();
    const conv = convs.find(c => c.id === id);
    if (!conv || !conv.messages.length) return;
    const text = conv.messages.map(m => (m.role === 'user' ? 'You' : 'NICE') + ': ' + m.text).join('\n\n');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        if (typeof Notify !== 'undefined') Notify.send({ title: 'Copied', message: 'Conversation copied to clipboard', type: 'success' });
      });
    }
  }

  let _chatMenuEl = null;
  function _showChatMenu(id, x, y) {
    _closeChatMenu();
    const menu = document.createElement('div');
    menu.className = 'side-chat-menu';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    const convs = _getConversations();
    const conv = convs.find(c => c.id === id);
    const pinLabel = conv?.pinned ? 'Unpin' : 'Pin';
    menu.innerHTML = `
      <button class="side-chat-menu-item" data-action="share">
        <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z"/></svg>
        Share conversation
      </button>
      <button class="side-chat-menu-item" data-action="pin">
        <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0 1 20.25 6v12A2.25 2.25 0 0 1 18 20.25H6A2.25 2.25 0 0 1 3.75 18V6A2.25 2.25 0 0 1 6 3.75h1.5m9 0h-9"/></svg>
        ${pinLabel}
      </button>
      <button class="side-chat-menu-item" data-action="rename">
        <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"/></svg>
        Rename
      </button>
      <button class="side-chat-menu-item side-chat-menu-item--danger" data-action="delete">
        <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>
        Delete
      </button>`;
    document.body.appendChild(menu);
    _chatMenuEl = menu;

    // Keep menu in viewport
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';

    menu.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      _closeChatMenu();
      if (action === 'share') _shareConversation(id);
      else if (action === 'pin') _pinConversation(id);
      else if (action === 'rename') _renameConversation(id);
      else if (action === 'delete') _deleteConversation(id);
    });

    // Close on click outside
    setTimeout(() => document.addEventListener('click', _closeChatMenu, { once: true }), 10);
  }

  function _closeChatMenu() {
    if (_chatMenuEl) { _chatMenuEl.remove(); _chatMenuEl = null; }
  }

  function _initChatsFolder() {
    _migrateMessages();

    const newBtn = document.getElementById('side-chat-new');

    if (newBtn) {
      newBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        _newConversation();
      });
    }

    // Auto-save active conversation periodically
    setInterval(_saveActiveConversation, 30000);
    window.addEventListener('beforeunload', _saveActiveConversation);

    _renderChatsList();
  }

  function _renderChatsList() {
    const list = document.getElementById('side-chats-list');
    if (!list) return;
    const convs = _getConversations();
    const activeId = _getActiveConvId();

    // Sort: pinned first, then by updatedAt desc
    const sorted = [...convs].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.updatedAt - a.updatedAt;
    }).slice(0, 20);

    if (!sorted.length) {
      list.innerHTML = '<div class="side-folder-item" style="opacity:.4;cursor:default">No chats yet</div>';
      return;
    }

    list.innerHTML = sorted.map(c => {
      const active = c.id === activeId ? ' side-chat-active' : '';
      const pin = c.pinned ? '<span class="side-chat-pin">📌</span>' : '';
      const title = Utils.esc((c.title || 'Untitled').slice(0, 30));
      return `<div class="side-folder-item side-chat-item${active}" data-conv-id="${c.id}" title="${Utils.esc(c.title)}">
        <span class="side-chat-title">${title}</span>${pin}
        <button class="side-chat-dots" data-conv-id="${c.id}" aria-label="Chat options">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
        </button>
      </div>`;
    }).join('');

    // Bind click, 3-dot menu, and context menu
    list.querySelectorAll('.side-chat-item').forEach(item => {
      const id = item.dataset.convId;
      item.addEventListener('click', (e) => {
        if (e.target.closest('.side-chat-dots')) return; // don't load when clicking dots
        _loadConversation(id);
      });
      // 3-dot menu button
      item.querySelector('.side-chat-dots')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        _showChatMenu(id, rect.right, rect.bottom);
      });
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        _showChatMenu(id, e.clientX, e.clientY);
      });
      // Long-press for mobile
      let _lp;
      item.addEventListener('touchstart', (e) => {
        _lp = setTimeout(() => {
          e.preventDefault();
          const t = e.touches[0];
          _showChatMenu(id, t.clientX, t.clientY);
        }, 500);
      }, { passive: false });
      item.addEventListener('touchend', () => clearTimeout(_lp));
      item.addEventListener('touchmove', () => clearTimeout(_lp));
    });
  }

  /* ── Ship → Theme auto-switching ── */
  /* Ship-theme: switching ships triggers theme check via storage event */
  function _initShipThemeWatcher() {
    window.addEventListener('storage', (e) => {
      if (e.key === Utils.KEYS.mcShip) _checkShipTheme(e.newValue);
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
      if (localStorage.getItem(Utils.KEYS.theme) !== 'lcars') {
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
    return (typeof Utils !== 'undefined' && Utils.timeAgo) ? Utils.timeAgo(ts) : '';
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

    // Dark/light toggle (replaces inline onclick)
    const dlBtn = document.getElementById('btn-darklight');
    if (dlBtn) dlBtn.addEventListener('click', () => Theme.toggleDarkLight());

    // Font buttons (replaces inline onclick)
    document.querySelectorAll('.fb[data-fid]').forEach(fb => {
      fb.addEventListener('click', () => Font.set(fb.dataset.fid));
    });

    // Auth modal close (replaces inline onclick)
    const authClose = document.getElementById('auth-modal-close-btn');
    if (authClose) authClose.addEventListener('click', () => NICE.closeModal('modal-auth'));
  }

  /* ── Auth state listener ── */
  function _initAuth() {
    const _isDevMode = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    // Ephemeral session: if "Remember me" was unchecked, sign out on new browser session
    if (localStorage.getItem(Utils.KEYS.ephemeralSession) === '1' && !sessionStorage.getItem(Utils.KEYS.ephemeralSession)) {
      localStorage.removeItem(Utils.KEYS.ephemeralSession);
      SB.auth.signOut().catch(() => {});
    }

    SB.auth.onAuthChange((user, _session, event) => {
      State.set('user', user);
      _updateAuthUI(user);
      if (user) {
        _migrateLocalSpaceships(user);
        if (typeof BlueprintStore !== 'undefined' && BlueprintStore.migrateGuestState) BlueprintStore.migrateGuestState();
        _loadTokenBalance(user);
        if (typeof Notify !== 'undefined') Notify.subscribePush().catch(() => {});
        // Sync cross-device data
        if (typeof ModelIntel !== 'undefined' && ModelIntel.syncFromServer) ModelIntel.syncFromServer().catch(() => {});
        if (typeof MissionScheduler !== 'undefined' && MissionScheduler.syncFromServer) MissionScheduler.syncFromServer().catch(() => {});
        // First-run check: show setup wizard for new users with no spaceships
        _checkFirstRun(user);
      }
      // Handle session expiry — prompt re-login
      if (event === 'TOKEN_REFRESHED' && !user) {
        if (typeof Notify !== 'undefined') {
          Notify.send({ title: 'Session Expired', message: 'Please sign in again to continue.', type: 'warning' });
        }
        if (typeof AuthModal !== 'undefined') AuthModal.show();
      }
      if (typeof AuditLog !== 'undefined') {
        AuditLog.log('auth', { description: user ? 'Signed in as ' + (user.email || 'user') : 'Signed out' });
      }
    });

    // Check initial session
    SB.auth.getUser().then(user => {
      State.set('user', user);
      _updateAuthUI(user);
      if (user) { _migrateLocalSpaceships(user); _loadTokenBalance(user); }
      // Dev mode: auto-sign in anonymously for a real JWT (edge functions need it)
      if (!user && _isDevMode) {
        SB.auth.signInAnonymously().catch(() => {
          // Anonymous auth not enabled — user can sign in via auth modal manually
        });
      }
    }).catch(() => {
      State.set('user', null);
      _updateAuthUI(null);
    });
  }

  /* ── Token Balance ── */
  let _tokenBalanceSub = null;

  async function _loadTokenBalance(user) {
    if (!user || !SB.isReady()) return;
    try {
      const { data } = await SB.client
        .from('token_balances')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      // Default empty pools shape — no free trial grant. New free users
      // run Gemini 2.5 Flash only; tokens unlock when they subscribe to Pro.
      const fallback = {
        pools: { standard: { allowance: 0, used: 0, purchased: 0 }, claude: { allowance: 0, used: 0, purchased: 0 }, premium: { allowance: 0, used: 0, purchased: 0 } },
        // Legacy columns kept readable for backward compatibility:
        balance: 0, free_tier_remaining: 0, lifetime_purchased: 0, lifetime_used: 0,
      };
      State.set('token_balance', data || fallback);
    } catch (err) {
      console.warn('[NICE] Failed to load token balance:', err.message);
    }

    // Subscribe to realtime balance updates (e.g. after Stripe webhook credits)
    if (!_tokenBalanceSub) {
      _tokenBalanceSub = SB.client
        .channel('token-balance')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'token_balances',
          filter: `user_id=eq.${user.id}`,
        }, (payload) => {
          if (payload.new) State.set('token_balance', payload.new);
        })
        .subscribe();
    }
  }

  /* ── First-run onboarding: show setup wizard for new users ── */
  async function _checkFirstRun(user) {
    if (!user) return;
    // Check both the new simple flag and legacy per-user flag
    if (localStorage.getItem(Utils.KEYS.onboarded) || localStorage.getItem('nice-onboarded-' + user.id)) return;
    // Wait a moment for the app to settle
    await new Promise(r => setTimeout(r, 1500));
    // Check if user has any spaceships — skip wizard if they do
    const ships = State.get('user_spaceships') || [];
    if (ships.length > 0) {
      localStorage.setItem(Utils.KEYS.onboarded, '1');
      return;
    }
    // Try loading from DB
    try {
      const dbShips = await SB.db('user_spaceships').list({ user_id: user.id, limit: 1 });
      if (dbShips && dbShips.length > 0) {
        localStorage.setItem(Utils.KEYS.onboarded, '1');
        return;
      }
    } catch { /* proceed to wizard */ }
    // No spaceships — show setup wizard
    if (typeof SetupWizard !== 'undefined' && SetupWizard.open) {
      SetupWizard.open();
    }
  }

  /* ── Migrate localStorage spaceship slots to Supabase user_spaceships ── */
  async function _migrateLocalSpaceships(user) {
    if (!user || !SB.isReady() || !SB.isOnline()) return;
    const migrated = localStorage.getItem('nice-mc-migrated-' + user.id);
    if (migrated) return;

    const localShip = localStorage.getItem(Utils.KEYS.mcShip);
    const localSlots = (() => { try { return JSON.parse(localStorage.getItem(Utils.KEYS.mcSlots) || '{}'); } catch { return {}; } })();
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
    if (typeof WorkflowsView !== 'undefined') Router.on('/workflows', WorkflowsView);

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
    if (typeof DocsView !== 'undefined') Router.on('/docs', DocsView);
    if (typeof EngineeringView !== 'undefined') Router.on('/engineering', EngineeringView);
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
  /* ── PWA Install Prompt — suppressed, users install via browser menu ── */
  let _deferredInstallPrompt = null;
  function _initPWAInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      _deferredInstallPrompt = e;
    });

    window.addEventListener('appinstalled', () => {
      _deferredInstallPrompt = null;
      if (typeof Notify !== 'undefined') Notify.send({ title: 'NICE Installed', message: 'App installed successfully!', type: 'success' });
      if (typeof Gamification !== 'undefined') Gamification.addXP('install_pwa');
    });
  }

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
      ['atm-settings', Utils.KEYS.settings],
      ['atm-budget', Utils.KEYS.budget],
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
    const saved = localStorage.getItem(Utils.KEYS.sidebarOrder);
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
    localStorage.setItem(Utils.KEYS.sidebarOrder, JSON.stringify(order));
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
    if (!localStorage.getItem(Utils.KEYS.utmFirst)) {
      localStorage.setItem(Utils.KEYS.utmFirst, JSON.stringify(captured));
    }
    // Last-touch: always overwrite
    localStorage.setItem(Utils.KEYS.utmLast, JSON.stringify(captured));
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
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:var(--bg-alt);color:var(--text);padding:6px 16px;text-align:center;font-size:0.78rem;font-family:var(--font-b);display:flex;align-items:center;justify-content:center;gap:8px;border-bottom:1px solid var(--border);';
    banner.innerHTML = 'Browse freely &mdash; <a href="#/profile" style="color:var(--accent);font-weight:600;text-decoration:underline;">Sign in</a> to deploy agents and run missions.';
    document.body.prepend(banner);
    const sidebar = document.getElementById('app-sidebar');
    if (sidebar) sidebar.style.top = '30px';
    const mobileBar = document.getElementById('app-mobile-bar');
    if (mobileBar) mobileBar.style.top = '30px';
  }

  /** Check if a write operation is allowed (blocks in guest mode) */
  function guardWrite(action) {
    if (State.get('guestMode')) {
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Sign in required', message: 'Sign in to ' + (action || 'save changes') + '.', type: 'system' });
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
    if (localStorage.getItem(Utils.KEYS.highContrast) === '1') {
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
    _initPWAInstall();
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
