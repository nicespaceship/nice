---
name: theme-system
description: 8-mode CSS theme engine with custom properties, Theme Creator, and theme-reactive styling. Use when styling components, adding themes, or working with the GUI Editor.
user-invocable: true
---

# Theme System

## How It Works
- `<html data-theme="spaceship">` selects active theme
- Each theme sets CSS custom properties in `public/css/theme.css`
- Components use `var(--prop)` — never hardcode colors
- Theme dock persists selection in `localStorage['ns-theme']`

## 8 Built-in Themes
| # | Name | Aesthetic | Font |
|---|------|-----------|------|
| 1 | spaceship | Monochrome (default) | Inter/Orbitron |
| 2 | robotech | Mecha red/black | Rajdhani |
| 3 | navigator | Cyan/blue HUD | Rajdhani |
| 4 | solar | Orange/gold | Heavy sans |
| 5 | matrix | Green terminal | Fira Code |
| 6 | retro | 70s teal/orange | Playfair Display |
| 7 | lcars | Star Trek modular | Share Tech Mono |
| 8 | pixel | 16-bit pixel art | Press Start 2P |

## CSS Custom Properties (per theme)
```css
/* Colors */
--bg, --bg-alt          /* backgrounds */
--text, --text-muted    /* text */
--accent, --accent2     /* accents */
--border, --border-hi   /* borders */
--panel-bg              /* panel backgrounds */
--glow, --glow-hi       /* glow effects */

/* Typography */
--font-h, --font-d      /* heading/display fonts */
--font-b                /* body font */
--font-m                /* monospace font */

/* Layout */
--radius                /* general border radius */
--card-radius           /* blueprint card radius */
--btn-radius            /* button radius */
--prompt-radius         /* prompt bar radius */
--border-width          /* border thickness */
--nav-bg                /* sidebar background */
```

## Usage in CSS
```css
.my-component {
  background: var(--panel-bg);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: var(--card-radius, 0px);
  font-family: var(--font-b);
}
.my-component:hover {
  border-color: var(--accent);
}
```

## Design Rules
- All corners default to 0px (sharp edges)
- No gradients — use flat solid colors
- No pulse/shimmer animations — use static styles
- Animated dots on connection lines are OK (flat colored vectors)
- Blueprint cards use `var(--card-radius, 0px)`
- Buttons use `var(--btn-radius, 0px)`

## Theme Creator (#/theme-creator)
GUI Editor with sliders for:
- 12 color pickers (bg, text, accent, border, etc.)
- Heading/Body font selects
- Border Radius, Card Radius, Button Radius, Prompt Bar Radius sliders
- Glow Effect slider
- Live preview + CSS export

## Switching Themes in JS
```javascript
Theme.set('navigator');           // Apply theme
localStorage.getItem('ns-theme'); // Read current
```
