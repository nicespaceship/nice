# NICE SPACESHIP — Brand Guidelines

Canonical brand reference, set 2026-10-01. Source SVGs live at [assets/](assets/) (app/root deploy) and [www/assets/](www/assets/) (marketing deploy) — both directories carry identical copies; there is no third `public/assets/brand/` location.

## Platform architecture

| Property | Role |
|---|---|
| `nicespaceship.com` | Marketplace — community site, deployed from `www/` |
| `nicespaceship.ai` | NICE App / Studio — the product SPA, deployed from `app/` + root |
| `longeron.app` | ServiceNow CMS Engine Core — separate product under the NICE SPACESHIP umbrella, separate repo |

## Identity

Three-triangle equilateral pyramid mark: one apex triangle (Emerald) sitting above two base triangles, separated by uniform micro-gap negative-space channels (1–1.5px at a 32px rendering). Source files:

- [`assets/nice-icon.svg`](assets/nice-icon.svg) — favicon / app icon, self-contained dark square background.
- [`assets/nice-mark.svg`](assets/nice-mark.svg) / `nice-mark-dark.svg` / `nice-mark-light.svg` — icon only, transparent background, for inline use. `-dark` = black base triangles (light surfaces), `-light` = white base triangles (dark surfaces), unsuffixed = auto via `prefers-color-scheme`. Apex triangle is always Emerald regardless of variant.
- [`assets/nice-wordmark-primary.svg`](assets/nice-wordmark-primary.svg) — full "nice spaceship" lockup, black text, light surfaces.
- [`assets/nice-wordmark-dark.svg`](assets/nice-wordmark-dark.svg) — full "nice spaceship" lockup, white text, dark surfaces.
- [`assets/nice-wordmark-app.svg`](assets/nice-wordmark-app.svg) — "nice" only (no "spaceship"), white text, for in-app contexts.

In the app, the mark and the wordmark render as separate elements (icon SVG + a `NICE` text span), not a single flattened image — this keeps brand color fixed (Emerald apex, theme-appropriate base) while surrounding chrome still themes per the Skin system.

## Color tokens

| Token | Hex | Use |
|---|---|---|
| Space Black | `#080A12` | App icon background, dark-base-triangle variant, primary-lockup text |
| Pure White | `#FFFFFF` | Light-base-triangle variant, dark-lockup text |
| Emerald Apex | `#00C897` | The mark's apex triangle — fixed, never theme-adaptive. Confirmed live on longeron.app as `--b-logo-flange`. |
| Deep Cobalt | `#0A2540` | Not in the 3 logo SVGs, but confirmed real: it's longeron.app's live `--b-accent` token (its primary solid-fill action color). Adopted here as the NICE app's `--accent` (app/js/nice.js `nice`/`nice-dark` themes + public/css/theme.css) — Deep Cobalt needs white text for contrast, so it takes the solid-fill button role; Emerald takes `--accent2` (hover text, tint washes, glows — foreground/translucent uses, not white-on-color fills). |

**Known tradeoff:** Deep Cobalt is a near-black navy, so on `nice-dark` (bg `#0a0a0a`) a solid-fill button's edge reads subtly against the page — button text stays fully legible (white, confirmed), but the fill-vs-background distinction is soft. Didn't attempt a per-mode color-role swap (e.g. Emerald-fill in dark mode) without a design call — flagging rather than guessing further.

## Typography

- **Outfit**, weight 900 — display and headings, and the sole wordmark typeface (`-0.5px` letter-spacing at the 28px size baked into the wordmark SVGs). Loaded via Google Fonts (`family=Outfit:wght@900`).
- **JetBrains Mono** — technical telemetry, hex values, code. Already the established mono face per `www/brand.html`'s own type scale; unchanged by this update.
- Everything else (body/UI prose) stays on the app's existing per-theme `--font-h`/`--font-b` system — Outfit is scoped to the brand wordmark only, not a site-wide body font swap.

## UI aesthetics

- Dark-mode-first chrome; `www/brand.html` and the app's default theme already follow this.
- 1px translucent borders (`rgba(255,255,255,0.08)`-class) on dark surfaces — consistent with the app's existing flat, no-shadow posture (`* { box-shadow: none !important }` is already universal; depth comes from border/background, not shadow).
- Spatial coordinate-grid backgrounds and monospaced telemetry headers — descriptive of the existing Schematic / HUD treatment already in the app; not a new system to build.

## Open questions for a human

- **`nice-dark` button fill vs. background contrast** (above) — acceptable as-is, or worth a per-mode accent swap?
- No Tailwind config exists in this repo (vanilla CSS custom properties only) and there is no `public/assets/brand/` path — if a Tailwind-based project needs these tokens (e.g. Longeron), that's a separate repo and a separate task.
