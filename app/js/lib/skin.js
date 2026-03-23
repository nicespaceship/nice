/* ─────────────────────────────────────────────────────────────────
   MODULE: Skin Engine — Premium App Skins
   Complete makeover: visuals + copy + effects + card styling
───────────────────────────────────────────────────────────────── */
const Skin = (() => {
  const STORAGE_KEY = 'nice-active-skin';
  const INV_KEY = 'nice-skin-inventory';
  const PRE_SKIN_THEME = 'nice-pre-skin-theme';

  let _activeSkin = null;
  let _overrides = {};
  let _effectCleanup = null;

  /* ── Skin Pack Registry ── */
  const PACKS = {};

  function registerPack(pack) {
    if (pack && pack.id) PACKS[pack.id] = pack;
  }

  /* ── Ownership ── */
  function _getInventory() {
    try { return JSON.parse(localStorage.getItem(INV_KEY) || '[]'); } catch { return []; }
  }

  function ownsSkin(id) { return _getInventory().includes(id); }

  function purchaseSkin(id) {
    const inv = _getInventory();
    if (!inv.includes(id)) {
      inv.push(id);
      localStorage.setItem(INV_KEY, JSON.stringify(inv));
    }
  }

  /* ── Override Map Builder ── */
  function _buildOverrideMap(pack) {
    const map = {};
    if (!pack.copy) return map;
    const copy = pack.copy;
    // Flatten nested objects: nav.agents, titles.agents, etc.
    for (const section of Object.keys(copy)) {
      const val = copy[section];
      if (typeof val === 'string') {
        map[section] = val;
      } else if (Array.isArray(val)) {
        // Arrays accessed via list(), not overrides
        continue;
      } else if (typeof val === 'object') {
        for (const key of Object.keys(val)) {
          map[section + '.' + key] = val[key];
        }
      }
    }
    return map;
  }

  /* ── Visual Layer ── */
  function _applyVisuals(pack) {
    const td = pack.theme_data;
    if (!td) return;
    const root = document.documentElement;
    // Apply CSS variables
    if (td.colors) {
      Object.entries(td.colors).forEach(([k, v]) => root.style.setProperty(k, v));
    }
    if (td.fonts) {
      Object.entries(td.fonts).forEach(([k, v]) => root.style.setProperty(k, v));
    }
    if (td.radius) root.style.setProperty('--radius', td.radius);
    // Inject Google Fonts if needed
    if (pack.googleFonts) {
      let link = document.getElementById('skin-fonts');
      if (!link) {
        link = document.createElement('link');
        link.id = 'skin-fonts';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      }
      link.href = pack.googleFonts;
    }
  }

  function _clearVisuals() {
    document.documentElement.style.cssText = '';
    const link = document.getElementById('skin-fonts');
    if (link) link.remove();
  }

  /* ── Effect Layer (canvas background) ── */
  const _effects = {};

  function registerEffect(id, startFn) {
    // startFn(canvas) returns a cleanup function
    _effects[id] = startFn;
  }

  function _startEffect(effectId) {
    _stopEffect();
    if (!effectId || !_effects[effectId]) return;
    const canvas = document.getElementById('matrix-canvas');
    if (!canvas) return;
    canvas.style.display = 'block';
    canvas.style.opacity = '0.15';
    _effectCleanup = _effects[effectId](canvas);
  }

  function _stopEffect() {
    if (_effectCleanup) { _effectCleanup(); _effectCleanup = null; }
    const canvas = document.getElementById('matrix-canvas');
    if (canvas) { canvas.style.display = 'none'; }
  }

  /* ── Sidebar Refresh ── */
  function _refreshSidebar() {
    document.querySelectorAll('[data-skin-nav]').forEach(el => {
      const key = el.dataset.skinNav;
      // Store original text on first encounter
      if (!el.dataset.skinDefault) el.dataset.skinDefault = el.textContent;
      el.textContent = _activeSkin?.copy?.nav?.[key] || el.dataset.skinDefault;
    });
  }

  /* ── Core API ── */
  function activate(skinId) {
    const pack = PACKS[skinId];
    if (!pack) return false;

    // Save current theme before overriding
    if (!_activeSkin) {
      const currentTheme = localStorage.getItem('ns-theme') || 'spaceship';
      localStorage.setItem(PRE_SKIN_THEME, currentTheme);
    }

    _activeSkin = pack;
    _overrides = _buildOverrideMap(pack);

    // Apply layers
    _applyVisuals(pack);
    _startEffect(pack.effect);
    document.documentElement.setAttribute('data-skin', skinId);
    localStorage.setItem(STORAGE_KEY, skinId);

    // Refresh DOM
    _refreshSidebar();

    // Notify state subscribers
    if (typeof State !== 'undefined') State.set('skin', skinId);
    return true;
  }

  function deactivate() {
    _activeSkin = null;
    _overrides = {};

    // Clear skin visuals
    _clearVisuals();
    _stopEffect();
    document.documentElement.removeAttribute('data-skin');
    localStorage.removeItem(STORAGE_KEY);

    // Restore previous theme
    const prevTheme = localStorage.getItem(PRE_SKIN_THEME) || 'spaceship';
    localStorage.removeItem(PRE_SKIN_THEME);
    if (typeof Theme !== 'undefined') Theme.set(prevTheme);

    // Refresh DOM
    _refreshSidebar();

    if (typeof State !== 'undefined') State.set('skin', null);
  }

  // Key lookup: Skin.text('nav.agents', 'Agents') → override or fallback
  function text(key, fallback) {
    if (fallback === undefined) fallback = key;
    return _overrides[key] || fallback;
  }

  // Array lookup: Skin.list('ranks') → ['Waterboy', ...] or null
  function list(key) {
    if (!_activeSkin || !_activeSkin.copy) return null;
    const val = _activeSkin.copy[key];
    return Array.isArray(val) ? val : null;
  }

  function isActive() { return !!_activeSkin; }
  function activeSkin() { return _activeSkin; }
  function allPacks() { return Object.values(PACKS); }
  function getPack(id) { return PACKS[id] || null; }

  function init() {
    // Wrap Theme.set so switching themes deactivates the active skin
    if (typeof Theme !== 'undefined' && Theme.set) {
      const _origThemeSet = Theme.set;
      Theme.set = function(name) {
        if (_activeSkin) {
          // User is switching theme manually — deactivate skin first
          _activeSkin = null;
          _overrides = {};
          _clearVisuals();
          _stopEffect();
          document.documentElement.removeAttribute('data-skin');
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(PRE_SKIN_THEME);
          _refreshSidebar();
          if (typeof State !== 'undefined') State.set('skin', null);
        }
        _origThemeSet(name);
      };
    }

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && PACKS[saved] && ownsSkin(saved)) {
      activate(saved);
    }
  }

  return {
    registerPack, registerEffect,
    activate, deactivate,
    text, list,
    isActive, activeSkin, allPacks, getPack,
    ownsSkin, purchaseSkin,
    init, PACKS
  };
})();
