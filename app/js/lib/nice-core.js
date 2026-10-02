/* ═══════════════════════════════════════════════════════════════════
   NICE — Brand Core (CORE / nice-dark themes)
   The marketing-site Stage 1 ("What is NICE?") glyph rendered as a
   reactor overlay. Sits on top of `DefaultCore`'s concentric pulsing
   rings — the rings continue to breathe behind the brand mark, and
   the mark itself reads as the centerpiece.

   Content mirrors `www/index.html`'s `.home-mark` SVG: HUD disc +
   frame rings + animated blue arcs + tick marks, the six orbit dots,
   pillars, chevrons, and the central core ring. LLM logos / MCP
   chips from later marketing stages are intentionally NOT included —
   this is the Stage 1 silhouette only.

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

    /* Brand mark — 6 orbit dots arranged hexagonally around the
       center, plus the two vertical pillars and four diagonal
       chevrons that connect them. Paths lifted verbatim from
       www/index.html .home-mark-orbit / .home-mark-pillars /
       .home-mark-chevrons. */
    + '<g class="nice-core-mark-body">'
    +   '<g class="nice-core-mark-orbit">'
    +     '<path d="M2467.2,673.2c345.58-32.47,524.02,397,258.68,618.68-180.13,150.49-459.08,78.97-546.6-137.16-87.17-215.28,55.93-459.73,287.92-481.52Z"/>'
    +     '<path d="M3537.4,2014.6c-177.73-177.72-114.08-485.01,120.51-574.69,274.93-105.11,544.87,148.19,461.85,429.85-73.68,249.96-398.06,329.14-582.35,144.85Z"/>'
    +     '<path d="M3763.2,2905.2c246.91-17.2,431.6,227.75,353.89,461.89-87.4,263.37-443.86,323.54-610.74,100.57-168.07-224.56-21.82-543.04,256.85-562.46Z"/>'
    +     '<path d="M2463.17,3633.17c348.87-33.89,529.56,395.76,262.71,618.71-179.73,150.16-459.24,78.58-546.6-137.16-85.98-212.33,54.43-459.26,283.89-481.55Z"/>'
    +     '<path d="M1203.18,2905.19c275.09-15.44,457.71,280.84,322.9,522.88-119.67,214.87-425.07,238.14-577.97,45.82-177.41-223.16-28.22-552.8,255.07-568.7Z"/>'
    +     '<path d="M1187.2,1409.2c279.69-26.25,476.07,269.48,341.49,517.49-117.32,216.2-419.09,243.76-576.57,55.2-178.93-214.25-41.59-546.72,235.08-572.68Z"/>'
    +   '</g>'
    +   '<g class="nice-core-mark-pillars">'
    +     '<path d="M1272,2204v604c-33.72-4.09-66.28-4.09-100,0v-604c31.79,6.4,68.34,6.38,100,0Z"/>'
    +     '<path d="M3836,2808c-34.42-3.47-65.53-5.37-100,0v-596c2.93-1.06,4.78,4,6,4h84c1.4,0,4.44-7.1,10,2v590Z"/>'
    +   '</g>'
    +   '<g class="nice-core-mark-chevrons">'
    +     '<polygon points="3375.95 1580 2868.23 1291.66 2912.04 1203.99 3418.07 1491.98 3423.59 1497.98 3375.95 1580"/>'
    +     '<polygon points="2139.99 1291.94 1637.96 1579.88 1588.37 1497.36 2086.75 1204.5 2095.49 1210.49 2139.99 1291.94"/>'
    +     '<path d="M2139.98,3712.08c2.15,3.03-33.45,55.51-38.18,63.72-4.14,7.19-5.9,25.29-15.33,23.83l-494.1-289.2,43.94-82.16,11.78,1.54,491.88,282.27Z"/>'
    +     '<path d="M3366,3424.08l45.38,82.85-3.37,11.08-492.12,280.28c-7.13-25.22-36.8-54.55-44.83-75.52-1.4-3.67-4.89-6.66-1.38-10.87l496.32-287.83Z"/>'
    +   '</g>'

    /* Central ring + inner dot. Two stacked paths form the ring;
       a third small circle would be the bright pin (omitted so
       DefaultCore's bright inner core continues to read through
       this overlay). */
    +   '<g class="nice-core-mark-center">'
    +     '<path d="M2447.2,1853.2c550.99-42.77,908.61,573.22,585.69,1025.69-276.72,387.72-866.37,355.58-1097.57-60.2-228.12-410.24,44.43-929.2,511.88-965.49ZM2455.2,1953.2c-427.55,33.48-653.11,541.85-388.78,882.39,257.89,332.24,777.21,269.58,942.28-116.89,164.38-384.87-139.97-797.88-553.5-765.5Z"/>'
    +     '<path d="M2483.19,2101.18c280.93-16.74,488.07,258.72,401.96,525.96-85.83,266.35-424.89,363.36-639.04,180.75-276.2-235.52-124.03-685.19,237.08-706.71Z"/>'
    +   '</g>'
    + '</g>'
    + '</svg>';

  function html() { return SVG; }
  return { html };
})();
