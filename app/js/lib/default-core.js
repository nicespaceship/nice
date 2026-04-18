/* ═══════════════════════════════════════════════════════════════════
   NICE — Default Core
   The fallback reactor markup any theme can register on its `reactor`
   field. Mirrors the SVG circles the Schematic view renders for non-
   JARVIS themes (concentric pulsing rings + a solid inner core), all
   colored via `var(--accent)` so each theme automatically inherits its
   own palette.

   Themes that want a unique core (e.g. JARVIS's arc reactor + HUD)
   register their own markup module instead and call its render fn from
   `reactor: { html: () => MyCore.html() }`.
═══════════════════════════════════════════════════════════════════ */
const DefaultCore = (() => {
  // 200×200 viewBox; CoreReactor's wrapper sizes to min(620px, 85vmin)
  // and SVG scales to fill it via width/height 100%.
  const SVG = '<svg class="core-default" viewBox="0 0 200 200" '
    + 'preserveAspectRatio="xMidYMid meet" width="100%" height="100%" aria-hidden="true">'
    // Outer ring — slow breathe
    + '<circle cx="100" cy="100" r="90" fill="none" stroke="var(--accent,#fff)" '
    +   'stroke-opacity=".12" stroke-width="1">'
    +   '<animate attributeName="r" values="86;94;86" dur="3.4s" repeatCount="indefinite"/>'
    +   '<animate attributeName="stroke-opacity" values=".08;.18;.08" dur="3.4s" repeatCount="indefinite"/>'
    + '</circle>'
    // Mid ring — slightly faster
    + '<circle cx="100" cy="100" r="62" fill="none" stroke="var(--accent,#fff)" '
    +   'stroke-opacity=".22" stroke-width="1.5">'
    +   '<animate attributeName="r" values="58;66;58" dur="2.8s" repeatCount="indefinite"/>'
    +   '<animate attributeName="stroke-opacity" values=".15;.32;.15" dur="2.8s" repeatCount="indefinite"/>'
    + '</circle>'
    // Filled glow disc — soft accent halo
    + '<circle cx="100" cy="100" r="38" fill="var(--accent,#fff)" fill-opacity=".08">'
    +   '<animate attributeName="r" values="34;42;34" dur="2.4s" repeatCount="indefinite"/>'
    +   '<animate attributeName="fill-opacity" values=".05;.14;.05" dur="2.4s" repeatCount="indefinite"/>'
    + '</circle>'
    // Bright inner core
    + '<circle cx="100" cy="100" r="20" fill="var(--accent,#fff)" fill-opacity=".55">'
    +   '<animate attributeName="fill-opacity" values=".45;.85;.45" dur="2s" repeatCount="indefinite"/>'
    + '</circle>'
    // Solid pin — anchor point
    + '<circle cx="100" cy="100" r="6" fill="var(--accent,#fff)"/>'
    + '</svg>';

  function html() { return SVG; }
  return { html };
})();
