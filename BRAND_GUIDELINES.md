# NICE SPACESHIP — Brand Guidelines

Working reference as of 2026-10-02. The NICE SPACESHIP company icon is being redesigned, so this documents the interim state.

## Platform architecture

| Property | Role | Deploys from |
|---|---|---|
| `nicespaceship.com` | NICE SPACESHIP, the company site and marketplace | `www/` |
| `nicespaceship.ai` | NICE, the product (app / studio) | `app/` + repo root |
| `longeron.app` | Longeron, the ServiceNow CMS engine | separate repo |

## Logos

- **NICE SPACESHIP (company): wordmark only, for now.** "NICE SPACESHIP" in Orbitron Black, uppercase, 0.4em tracking (`--tracking-wordmark`), black on white or white on black. A new company icon is in design; until it lands, nothing sits beside the wordmark. Don't pair it with the NICE ring mark.
- **NICE (product): the ring mark.** Six orbit dots, two pillars, four chevrons, and a central ring. Files: `assets/nice-mark.svg` (auto light/dark), `assets/nice-mark-dark.svg` (black, for light surfaces), `assets/nice-mark-light.svg` (white, for dark surfaces); `www/assets/` carries the same set for nicespaceship.com. In the app it renders from the `#icon-nice` symbol in `app/index.html`, next to "NICE" in Orbitron.
- A three-triangle mark was tried for the company on 2026-10-01 and dropped. Don't reintroduce it.

## Typography

- **Orbitron Black**: wordmarks only (NICE SPACESHIP, NICE).
- **Inter**: all UI and prose.
- **Mono**: Fira Code in the app and site tokens (`--font-m`). `www/brand.html` copy says JetBrains Mono; that mismatch predates this doc.

## Color

- **Accent (app NICE theme + nicespaceship.com):** Deep Cobalt `#0A2540` as `--accent` (solid fills, white text) and Emerald `#00C897` as `--accent2` (hover text, tints, glows). Both come from longeron.app's live palette. The app's runtime source of truth is `app/js/nice.js` `THEMES`, which is injected as inline styles; `public/css/theme.css` mirrors it.
- **Surfaces:** monochrome (black, white, gray). Blueprint cards keep their own rarity palette.

## Open

- `www/brand.html` still documents and uses the previous Sapphire `#0F52BA` accent, while the app and the rest of nicespaceship.com run Cobalt/Emerald. Pick one as canonical, then align the brand kit.
- On `nice-dark`, Cobalt used as text (links, active tab, the sign-in mark) has too little contrast against the near-black surface.
