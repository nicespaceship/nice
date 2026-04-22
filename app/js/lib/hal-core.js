/* ═══════════════════════════════════════════════════════════════════
   NICE — HAL-9000 Core
   Renders the HAL-9000 camera eye as the centerpiece reactor. Same
   visual language as the schematic's `.sch-core-hit-overlay` (chrome
   bezel, red lens, lens flare, slow pulse), re-expressed as a mountable
   reactor so it can live on Home, Bridge, and Spaceship-detail — not
   just Schematic with a deployed ship.

   CoreReactor wraps this in a fixed-position viewport-centered box, so
   only the inner layers are declared here. Each layer is a div the CSS
   draws — no SVG, because the bezel is stacked ring shadows that don't
   translate cleanly to SVG stroke geometry.
═══════════════════════════════════════════════════════════════════ */
const HalCore = (() => {
  function html() {
    return '<div class="hal-core" aria-hidden="true">'
      +   '<div class="hal-monolith">'
      +     '<div class="hal-nameplate">'
      +       '<span class="hal-nameplate-hal">HAL</span>'
      +       '<span class="hal-nameplate-9000">9000</span>'
      +     '</div>'
      +     '<div class="hal-core-bezel">'
      +       '<div class="hal-core-lens">'
      +         '<div class="hal-core-flare"></div>'
      +       '</div>'
      +     '</div>'
      +   '</div>'
      +   '<div class="hal-speaker"></div>'
      + '</div>';
  }
  return { html };
})();
