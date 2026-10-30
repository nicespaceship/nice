# NICE SPACESHIP — Brand Guidelines

Working reference as of 2026-10-30. The NICE SPACESHIP company icon is being redesigned, so this documents the interim state.

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

- **The NICE theme is monochrome** (`nice` and `nice-dark`, decided 2026-10-30): black, white and neutral grays only, with no blue-tinted grays. Pure white or neutral gray surfaces on light, black and neutral grays on dark. Primary buttons are black with white text on light and white with black text on dark; active nav, links, focus rings, toggles, checkboxes, selection, badges and tabs all follow the same ink. `--accent` is that ink (`#0a0a0a` light, `#fafafa` dark). The runtime source of truth is `app/js/nice.js` `THEMES`, injected as inline styles; `public/css/theme.css` mirrors it.
- **Color appears only as small indicator dots**, and each color has one meaning:
  - **Red** (`--dot-stop`): no, stop, cancel, error, rejected.
  - **Green** (`--dot-go`): go, ready, done, approved, connected.
  - **Orange** (`--dot-busy`): working, waiting, needs attention.
  - **Blue** (`--dot-info`): info, a neutral highlight.
  A status that used to be a colored fill, text or border is now ink plus a dot. Blueprint cards follow the same rule in NICE: frames, badges and card art render in ink.
- **Sapphire** (`#0F52BA`, `#1862ce` on hover) no longer applies to the NICE theme's UI. It stays a brand color only where the marketing front page (`index.html`, `landing.css`) still uses it.
- **No reactor in NICE.** The circular centerpiece reactor is off in the NICE theme (`reactor:false` in `THEMES`); the sci-fi themes keep theirs.
- **Other themes** (HAL-9000, The Grid, The Matrix, LCARS, J.A.R.V.I.S., Cyberpunk, RX-78-2, 16-BIT, The Office) keep their own palettes, status dots included. The dot tokens are defined for NICE only.
