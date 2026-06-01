---
name: theme-system
description: NICE's CSS theme engine — custom properties, the THEMES SSOT, the Theme module, and the Theme Editor. Use when styling components, adding themes, or working with the GUI editor.
user-invocable: true
---

# Theme System

## How It Works
- `<html data-theme="<id>">` selects the active theme.
- Theme definitions live in the **`THEMES` array in `app/js/nice.js`** (the SSOT). Each entry sets CSS custom properties on `<html>`; the `Theme` module applies them.
- Per-theme component overrides are `[data-theme="<id>"] .component { … }` blocks in `app/css/app.css`.
- Components consume `var(--prop)` — never hardcode colors.
- Selection persists in `localStorage['ns-theme']`.

## Built-in Themes (`THEMES` where `builtin:true`)
`nice` is the default. The full skin table (display names, aesthetics, fonts) is in CLAUDE.md; the `id`s the engine uses:

| id | name |
|----|------|
| `nice` | NICE (default, monochrome) |
| `hal-9000` | HAL-9000 |
| `grid` | The Grid |
| `matrix` | The Matrix |
| `lcars` | LCARS |
| `jarvis` | J.A.R.V.I.S. |
| `cyberpunk` | Cyberpunk |
| `rx-78-2` | RX-78-2 |
| `16bit` | 16-BIT |
| `office` | The Office |

`nice-dark` and `office-dark` are `builtin:false` dark variants, toggled via `Theme.toggleDarkLight` (moon/sun in the HUD dock). Don't hardcode this list anywhere — read `Theme.BUILTIN` (derived from `THEMES`).

## A theme entry (shape in `THEMES`)
```javascript
{ id:'matrix', name:'The Matrix', persona:{ name:'Morpheus', callsign:'Neo' },
  builtin:true, accent:'#00ff41', preview:['#000800','#00ff41','#00aa2a'],
  data:{ colors:{ '--bg':'…','--text':'…','--accent':'…', … }, fonts:{ '--font-h':'…','--font-b':'…' }, radius:'0px' },
  reactor:{ html:() => DefaultCore.html() },                 // centerpiece reactor markup
  voice:{ provider:'elevenlabs', voice:'morpheus', … },      // per-theme TTS (CoreVoice → nice-tts)
  copy:{ labels:{…}, placeholders:{…} } }                    // optional per-theme string swaps
```

## CSS Custom Property Contract
Set per theme in `THEMES[].data`. Canonical set (SSOT: `:root` in `app/css/app.css`):
```css
--bg, --bg-alt          /* backgrounds */
--text, --text-muted    /* text */
--accent, --accent2     /* accents */
--border, --border-hi   /* borders */
--panel-bg, --panel-border
--glow, --glow-hi       /* glow/shadow */
--font-h, --font-b, --font-m   /* display / body / mono */
--radius                /* per-theme corner radius (varies: nice 10px, matrix 0px, lcars 24px) */
```
The Office adds `--nav-*` overrides for its light sidebar. Typography role tokens (`--text-*`, `--fw-*`, `--tracking-*`) are theme-independent — see the Typography System in CLAUDE.md.

## Usage in CSS
```css
.my-component {
  background: var(--panel-bg);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: var(--radius);
  font-family: var(--font-b);
}
.my-component:hover { border-color: var(--accent); }
/* Theme-specific override */
[data-theme="lcars"] .my-component { border-radius: 24px; }
```

## Design Rules
- Theme only via CSS custom properties — never hardcoded colors (exception: rarity colors in `BlueprintUtils.RARITY_COLORS`, and blueprint cards, which are color-exempt).
- The app is **flat**: a universal `* { box-shadow:none !important }` rule ends `app.css`. Never add `box-shadow`; use border/background for depth.
- Corner radius is per-theme via `--radius` (not globally 0).
- Themes may change `font-family`, `color`, `border`, `background`, `glow` on cards — but never card `font-size`, `font-weight`, `letter-spacing`, or `text-transform` (see the card typography exemption in CLAUDE.md).

## Theme Editor (`#/theme-editor`)
`ThemeCreatorView` — a GUI editor with color pickers, font selects, radius/glow sliders, live preview, and CSS export for authoring custom themes.

## Switching Themes in JS
```javascript
Theme.set('matrix');              // Apply a theme by id
Theme.toggleDarkLight();          // Swap nice ↔ nice-dark / office ↔ office-dark
localStorage.getItem('ns-theme'); // Read current id
```
