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
                /* Single wide curved glass highlight on the top of
                   the lens — the studio-light reflection across the
                   dome's upper third. */
      +         '<div class="hal-core-flare"></div>'
      +       '</div>'
      +     '</div>'
              /* Horizontal chrome strip above the speaker — same
                 thickness as the bottom of the monolith frame,
                 touching the inside of the left + right chrome on
                 both sides. Reads as the frame's bottom rail
                 separating the eye from the speaker section. */
      +     '<div class="hal-divider"></div>'
              /* Speaker grille sits inside the monolith — one chrome
                 frame wraps the entire faceplate (nameplate, eye,
                 grille) like the 2001 prop. */
      +     '<div class="hal-speaker"></div>'
      +   '</div>'
      + '</div>';
  }
  return { html };
})();
