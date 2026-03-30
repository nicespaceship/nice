/* ─────────────────────────────────────────────────────────────────
   MODULE: Skin — Legacy compatibility shim
   Skins have been removed. All visual identities are now Themes.
   This module preserves the API surface so existing code doesn't break.
───────────────────────────────────────────────────────────────── */
const Skin = (() => {
  function isActive()    { return false; }
  function activeSkin()  { return null; }
  function allPacks()    { return []; }
  function getPack()     { return null; }
  function ownsSkin()    { return false; }
  function purchaseSkin(){ }
  function activate()    { return false; }
  function deactivate()  { }
  function text(k, fb)   { return fb !== undefined ? fb : k; }
  function list()        { return null; }
  function registerPack(){ }
  function registerEffect(id, fn) {
    if (typeof Theme !== 'undefined' && Theme.registerEffect) Theme.registerEffect(id, fn);
  }
  function init() {
    // Clean up legacy keys
    localStorage.removeItem('nice-active-skin');
    localStorage.removeItem('nice-pre-skin-theme');
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
