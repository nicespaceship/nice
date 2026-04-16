/* ═══════════════════════════════════════════════════════════════════
   NICE — JARVIS HUD markup (SSOT)
   The arc reactor + HUD ring stack is rendered by both the prompt panel
   (mounted globally on body) and the Schematic (inside the center column).
   This module is the single source of truth for that markup so any tweak
   to ring counts, segments, or canvas sizes lands in one place.
═══════════════════════════════════════════════════════════════════ */
const JarvisHUD = (() => {
  const ARC_SEGMENTS = 10;
  const HUD_RINGS = 6;

  function arcReactor() {
    const segs = '<div class="jv-arc-seg"></div>'.repeat(ARC_SEGMENTS);
    return '<div class="jv-arc-reactor" aria-hidden="true">' +
      '<div class="jv-arc-ring">' + segs + '</div>' +
      '<div class="jv-arc-inner-ring"></div>' +
      '<div class="jv-arc-core"></div>' +
    '</div>';
  }

  function hud() {
    let rings = '';
    for (let i = 1; i <= HUD_RINGS; i++) rings += '<div class="jv-hud-r jv-hud-r' + i + '"></div>';
    return '<div class="jv-sch-hud" aria-hidden="true">' + rings +
      '<div class="jv-hud-ticks"></div>' +
      '<canvas class="jv-eq-canvas" width="800" height="800"></canvas>' +
    '</div>';
  }

  return { arcReactor, hud };
})();
