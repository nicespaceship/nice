/* ═══════════════════════════════════════════════════════════════════
   NICE — Brand Core (CORE / nice-dark themes)
   The marketing-site Stage 1 ("What is NICE?") glyph rendered as a
   reactor overlay. Sits on top of `DefaultCore`'s concentric pulsing
   rings — the rings continue to breathe behind the brand mark, and
   the mark itself reads as the centerpiece.

   HUD disc + frame rings + animated blue arcs mirror `www/index.html`'s
   `.home-mark-hud` group. The brand mark itself is the 2026-10
   three-triangle rebrand, rendered static — it intentionally does NOT
   mirror www/index.html's `.home-mark-orbit`/`-pillars`/`-chevrons`/
   `-core` groups, which still carry the OLD ring-mark geometry: that
   multi-stage scroll choreography (60+ CSS rules in site.css keyed to
   nth-child selectors on those exact sub-parts) is too deeply coupled
   to safely re-geometry in a mechanical asset swap. Re-animating the
   new mark there is separate, deliberate work.

   Theming:
   - Brand-mark fill uses `var(--text)` so the dots + pillars
     stay readable on both `nice` (black on white) and `nice-dark`
     (white on near-black).
   - HUD disc + frame rings use `--surface` / `--border` so the
     translucent backplate sits cleanly on top of `DefaultCore`'s
     concentric rings without smothering them.
   - The four animated arcs use `--accent` (Sapphire blue).

   The wrapper SVG fills the reactor container (CoreReactor sizes that
   to min(620px, 85vmin)); its 5000×5000 viewBox matches the marketing
   site exactly so the geometry stays identical.
═══════════════════════════════════════════════════════════════════ */
const NiceCore = (() => {
  const SVG =
    '<svg class="nice-core-mark" viewBox="0 0 5000 5000" '
    + 'preserveAspectRatio="xMidYMid meet" width="100%" height="100%" aria-hidden="true">'

    /* HUD frame — disc, outer + inner rings, four animated arcs.
       Geometry copied from the marketing site's .home-mark-hud group;
       arc dasharray ratios follow the same 70°/20° / 4-segment pattern
       (segment = 70/360 × 2π × 2300 ≈ 2810, gap ≈ 803). */
    + '<g class="nice-core-hud">'
    +   '<circle class="nice-core-hud-disc"  cx="2500" cy="2500" r="2240"/>'
    +   '<circle class="nice-core-hud-frame" cx="2500" cy="2500" r="2380" fill="none"/>'
    +   '<circle class="nice-core-hud-frame-inner" cx="2500" cy="2500" r="2210" fill="none"/>'
    +   '<circle class="nice-core-hud-arcs"  cx="2500" cy="2500" r="2300" fill="none"/>'
    + '</g>'

    /* Brand mark — the three-triangle pyramid, static (the 2026-10
       rebrand's geometry has no sub-parts to orbit/chevron like the
       old ring mark did; apex stays fixed Emerald, base pair reads
       --text so it still sits on both nice and nice-dark). Mirrors
       www/index.html .home-mark-body — update both together. */
    + '<g class="nice-core-mark-body" transform="translate(900,1125) scale(100)">'
    +   '<polygon points="16,0 23.5,13 8.5,13" fill="#00C897"/>'
    +   '<polygon points="7.5,14.5 15,27.5 0,27.5"/>'
    +   '<polygon points="24.5,14.5 32,27.5 17,27.5"/>'
    + '</g>'
    + '</svg>';

  function html() { return SVG; }
  return { html };
})();
