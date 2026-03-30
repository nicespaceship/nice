/* ─────────────────────────────────────────────────────────────────
   MODULE: Skin — Compatibility wrapper over Theme (SSOT)
   Premium themes now live in Theme.THEMES. Skin delegates to Theme.
   Keeps: ownership/purchase, text/list lookups, effect registration.
───────────────────────────────────────────────────────────────── */
const Skin = (() => {
  const INV_KEY = (typeof Utils !== 'undefined' && Utils.KEYS) ? Utils.KEYS.skinInventory : 'nice-skin-inventory';

  // Legacy mapping: old skin IDs → new theme IDs
  const LEGACY_MAP = {
    'cyberpunk-2099': 'cyberpunk',
    'lcars-federation': 'lcars-federation',
    'matrix-reloaded': 'matrix-reloaded',
  };

  /* ── Ownership ── */
  function _getInventory() {
    try { return JSON.parse(localStorage.getItem(INV_KEY) || '[]'); } catch { return []; }
  }

  function ownsSkin(id) {
    const inv = _getInventory();
    const resolved = LEGACY_MAP[id] || id;
    return inv.includes(id) || inv.includes(resolved);
  }

  function purchaseSkin(id) {
    const inv = _getInventory();
    if (!inv.includes(id)) {
      inv.push(id);
      localStorage.setItem(INV_KEY, JSON.stringify(inv));
    }
  }

  /* ── Effect Registration (delegates to Theme) ── */
  function registerEffect(id, startFn) {
    if (typeof Theme !== 'undefined' && Theme.registerEffect) {
      Theme.registerEffect(id, startFn);
    }
  }

  /* ── Core API (delegates to Theme) ── */
  function activate(skinId) {
    const resolved = LEGACY_MAP[skinId] || skinId;
    if (typeof Theme !== 'undefined') {
      Theme.set(resolved);
      return true;
    }
    return false;
  }

  function deactivate() {
    // Switch back to default theme
    if (typeof Theme !== 'undefined') Theme.set('spaceship');
  }

  // Key lookup: Skin.text('nav.agents', 'Agents') → override or fallback
  function text(key, fallback) {
    if (fallback === undefined) fallback = key;
    const t = _currentPremium();
    if (!t || !t.copy) return fallback;
    // Support dotted keys: 'nav.home' → t.copy.nav.home
    const parts = key.split('.');
    let val = t.copy;
    for (const p of parts) {
      if (val && typeof val === 'object') val = val[p];
      else { val = undefined; break; }
    }
    return (typeof val === 'string') ? val : fallback;
  }

  // Array lookup: Skin.list('ranks') → ['Hacker', ...] or null
  function list(key) {
    const t = _currentPremium();
    if (!t || !t.copy) return null;
    const val = t.copy[key];
    return Array.isArray(val) ? val : null;
  }

  function _currentPremium() {
    if (typeof Theme === 'undefined') return null;
    const id = Theme.current();
    const t = Theme.getTheme(id);
    return (t && t.premium) ? t : null;
  }

  function isActive() { return !!_currentPremium(); }
  function activeSkin() { return _currentPremium(); }

  function allPacks() {
    if (typeof Theme === 'undefined') return [];
    return Theme.THEMES.filter(t => t.premium);
  }

  function getPack(id) {
    const resolved = LEGACY_MAP[id] || id;
    if (typeof Theme === 'undefined') return null;
    return Theme.getTheme(resolved) || Theme.getTheme(id) || null;
  }

  // Legacy no-ops
  function registerPack() {}

  function init() {
    // Migrate legacy skin → theme
    const legacySkin = localStorage.getItem('nice-active-skin');
    if (legacySkin) {
      const resolved = LEGACY_MAP[legacySkin] || legacySkin;
      localStorage.removeItem('nice-active-skin');
      localStorage.removeItem('nice-pre-skin-theme');
      if (typeof Theme !== 'undefined') {
        localStorage.setItem('ns-theme', resolved);
      }
    }
  }

  return {
    registerPack, registerEffect,
    activate, deactivate,
    text, list,
    isActive, activeSkin, allPacks, getPack,
    ownsSkin, purchaseSkin,
    init, PACKS: {},
  };
})();
