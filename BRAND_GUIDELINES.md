# NICE SPACESHIP — Brand Guidelines

Working reference as of 2026-10-02. The NICE SPACESHIP company icon is being redesigned, so this documents the interim state.

## Platform architecture

| Property | Role | Deploys from |
|---|---|---|
| `nicespaceship.com` | NICE SPACESHIP, the company site and marketplace | the private `NiceSpaceship/nicespaceship.com` repo |
| `nicespaceship.ai` | NICE, the product (app / studio) | `app/` + repo root |
| `longeron.app` | Longeron, the ServiceNow CMS engine | separate repo |

## Logos

- **NICE SPACESHIP (company): wordmark only, for now.** "NICE SPACESHIP" in Orbitron Black, uppercase, 0.4em tracking (`--tracking-wordmark`), black on white or white on black. A new company icon is in design; until it lands, nothing sits beside the wordmark. Don't pair it with the NICE ring mark.
- **NICE (product): the N tile** (adopted 2026-10-30, replacing the ring mark). A rounded tile with Figtree Bold's N cut through its full height, so the strokes split the tile into pieces: the models are the pieces, NICE is what joins them. The tile is 79:64 and the N is centered with equal side bars. One compound path, `fill-rule="evenodd"`, no font or mask, so it renders the same everywhere. Files: `assets/nice-mark.svg` (auto light/dark), `assets/nice-mark-dark.svg` (black, for light surfaces), `assets/nice-mark-light.svg` (white, for dark surfaces), all on a square canvas; `app/icons/icon.svg` and its PNGs for the installed app. In the app it renders from the `#icon-nice` symbol in `app/index.html`, sized by height, next to "NICE" in Figtree. Ben may revisit it.
- A three-triangle mark was tried for the company on 2026-10-01 and dropped. Don't reintroduce it.

## Typography

- **Figtree Bold** (700, `--tracking-caps`): the NICE wordmark (`--font-brand`). The icon's N is Figtree's N, so the two match.
- **Orbitron Black**: the NICE SPACESHIP company wordmark only.
- **Inter**: all UI and prose.
- **Mono**: Fira Code in the app and site tokens (`--font-m`).

## Color

- **Accent:** Sapphire, the only brand color, used on CTAs. The rule is `#0F52BA`, with `#1862ce` on hover; the theme tokens are `--accent: #1862ce` and `--accent2: #0F52BA`. The app's runtime source of truth is `app/js/nice.js` `THEMES`, which is injected as inline styles; `public/css/theme.css` mirrors it.
- **Surfaces:** monochrome (black, white, gray). Blueprint cards keep their own rarity palette.
