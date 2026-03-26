# NICE™ — Project Guide

## Branding
- **NICE** = Neural Intelligence Command Engine (the product)
- **NICE SPACESHIP** = the company (all caps)
- Product domain: `nicespaceship.ai`
- Company domain: `nicespaceship.com`

## Housekeeping
At the start of each session, run `git worktree prune` and delete any stale `claude/*` branches (local and remote) that have no uncommitted work. Keep the repo clean.

## Project Overview
**NICE™** is an Agentic Intelligence platform by NICE SPACESHIP. SPA dashboard for building, deploying, and managing AI agent fleets. Static HTML deployed on Vercel via GitHub (`nicespaceship/nice`). Domain: `nicespaceship.ai`.

## Supabase
- Project: `nice` (ID: `zacllshbgmnwsmliteqx`)
- Region: `us-west-1`
- 308 blueprints seeded (261 agents + 43 spaceships + 4 special)

## XP Progression System
| Class | Slots | Max Rarity | Rank | XP |
|-------|-------|------------|------|-----|
| Class 1 | 6 | Common | Ensign | 0 |
| Class 2 | 8 | Rare | Lieutenant | 25,000 |
| Class 3 | 10 | Epic | Commander | 100,000 |
| Class 4 | 12 | Legendary | Captain | 200,000 |
| Class 5 | Unlimited | Mythic | Subscription only | — |

- All cards visible to browse; activation gated by XP rank
- Custom blueprints start Common, evolve through milestones
- Mythic = milestone-only (even subscribers must earn it)

## File Architecture
```
├── index.html              # Landing page (redirects to /app/)
├── assets/
│   └── logo.svg            # Vector logo (inline in nav/footer with fill="currentColor")
├── public/
│   ├── css/
│   │   └── theme.css       # All styles — 8-mode theme engine + component styles
│   └── js/
│       └── app.js          # Marketing site JS — theme switcher, telemetry, HUD, games
├── app/                    # NICE™ SPA Dashboard
│   ├── index.html          # SPA shell with sidebar + view container
│   ├── manifest.json       # PWA manifest with shortcuts & share target
│   ├── sw.js               # Service Worker (auto-versioned) (offline, periodic sync, push)
│   ├── css/
│   │   └── app.css         # NICE component styles (2000+ lines)
│   └── js/
│       ├── nice.js         # Main orchestrator (init, auth, presence, error handling)
│       ├── lib/            # Shared IIFE modules (see table below)
│       ├── views/          # View modules (see table below)
│       └── __tests__/      # Vitest unit tests
├── e2e/                    # Playwright E2E tests
│   └── smoke.spec.js       # 9 smoke tests
├── desktop/                # Electron desktop wrapper
│   ├── main.js             # BrowserWindow + system tray
│   ├── preload.js          # contextBridge API
│   └── package.json        # Electron dependencies
├── .github/workflows/
│   └── ci.yml              # GitHub Actions (vitest + playwright)
├── package.json            # npm config (vitest, playwright devDeps)
├── vitest.config.js        # Unit test configuration
├── playwright.config.js    # E2E test configuration
└── CLAUDE.md               # This file
```

## 8-Mode Theme Engine
Themes are set via `data-theme` attribute on `<html>`. Each theme overrides CSS custom properties.

| # | Theme Name     | Key Aesthetic                              | Font Stack               |
|---|----------------|--------------------------------------------|--------------------------|
| 1 | `spaceship`    | High-contrast monochrome (default)         | Inter / Orbitron         |
| 2 | `robotech`     | Mecha red/black, angular                   | Rajdhani                 |
| 3 | `navigator`    | Cyan/Blue HUD, scanlines                   | Rajdhani                 |
| 4 | `solar`        | Orange/Gold, breathing glow animations     | Heavy sans-serif         |
| 5 | `matrix`       | Digital Rain Green, terminal aesthetic     | Fira Code                |
| 6 | `retro`        | 70s Teal/Orange/Brown, wavy patterns       | Playfair Display         |
| 7 | `lcars`        | Star Trek modular, pastel palette          | Share Tech Mono          |
| 8 | `pixel`        | 16-bit pixel art, chunky borders           | Press Start 2P           |

### Theme CSS Variables (per theme)
- `--bg`, `--bg-alt` — background colors
- `--text`, `--text-muted` — text colors
- `--accent`, `--accent2` — primary/secondary accent
- `--border`, `--border-hi` — borders
- `--panel-bg`, `--panel-border` — panel styling
- `--glow`, `--glow-hi` — glow/shadow effects
- `--font-h`, `--font-b`, `--font-m` — heading/body/mono fonts
- `--radius` — border radius

### Theme Switching
- JS module `Theme` in `app.js` manages switching via `Theme.set(name)`
- Theme dock (8 colored buttons) is fixed at bottom of every page
- Selection persisted in `localStorage` key `ns-theme`
- Matrix theme activates canvas rain effect via `MatrixRain.toggle()`
- Theme Creator view (`#/theme-creator`) allows building custom themes

## NICE™ SPA Architecture

### Module Pattern
All NICE JS modules use the IIFE pattern for browser compatibility (no build step):
```javascript
const ModuleName = (() => {
  // Private state and functions
  return { /* public API */ };
})();
```
Modules are loaded via `<script>` tags in `app/index.html` in dependency order.

### Lib Modules (`app/js/lib/`)
| Module            | File                 | Purpose                                                    |
|-------------------|----------------------|------------------------------------------------------------|
| `State`           | `state.js`           | Pub/sub state store: `get/set/setBatched/on/off`           |
| `SB`              | `supabase.js`        | Supabase client wrapper: `db()`, `auth()`, `client`        |
| `Router`          | `router.js`          | Hash router with param extraction & page transitions       |
| `AuditLog`        | `audit-log.js`       | Persistent event logging (max 500 FIFO, localStorage)      |
| `DataIO`          | `data-io.js`         | Export/import all NICE data as JSON                        |
| `ActivityFeed`    | `activity-feed.js`   | Live event stream from Supabase realtime                   |
| `Notify`          | `notify.js`          | Toast notifications, badge API, permission management      |
| `Gamification`    | `gamification.js`    | XP system, ranks, ship classes, achievements               |
| `CommandPalette`  | `command-palette.js` | Cmd+K fuzzy search overlay (routes + live data)            |
| `Keyboard`        | `keyboard.js`        | Global keyboard shortcuts & chord system                   |
| `McpBridge`       | `mcp-bridge.js`      | Bridges MCP connections to ToolRegistry for agents         |

### View Modules (`app/js/views/`)
| View              | File                 | Route(s)                        | Title            |
|-------------------|----------------------|---------------------------------|------------------|
| `HomeView`        | `home.js`            | `#/`                            | Bridge           |
| `BlueprintsView`  | `blueprints.js`      | `#/blueprints`                  | Blueprints (2 tabs) |
| `LogView`         | `log-view.js`        | `#/log`                         | Log (3 tabs: Missions/Operations/Log) |
| `DockView`        | `dock-view.js`       | `#/dock`                        | Dock (fleet + schematic) |
| `AgentDetailView` | `agents.js`          | `#/agents/:id`                  | Agent Detail     |
| `AgentBuilderView`| `agent-builder.js`   | `#/agents/new`                  | Agent Builder    |
| `SpaceshipDetailView`| `spaceships.js`   | `#/spaceships/:id`              | Ship Detail      |
| `MissionsView`    | `missions.js`        | (embedded in LogView)           | Missions         |
| `AnalyticsView`   | `analytics.js`       | (embedded in LogView)           | Operations       |
| `AuditLogView`    | `audit-log.js`       | (embedded in LogView)           | Captain's Log    |
| `VaultView`       | `vault.js`           | (embedded in SecurityView)      | Vault            |
| `SecurityView`    | `security.js`        | `#/security`                    | Security         |
| `SettingsView`    | `settings.js`        | `#/settings`                    | Settings         |
| `ProfileView`     | `profile.js`         | `#/profile`                     | Profile          |
| `WalletView`      | `wallet.js`          | `#/wallet`                      | Wallet           |
| `WorkflowDetailView`| `workflows.js`     | `#/workflows/:id`               | Workflow Detail  |
| `ThemeCreatorView`| `theme-creator.js`   | `#/theme-editor`                | Theme Creator    |

### Script Load Order
```
state.js → supabase.js → router.js → [21 view scripts] →
audit-log.js → data-io.js → activity-feed.js → notify.js → gamification.js →
command-palette.js → keyboard.js → mcp-bridge.js → nice.js
```

### Key localStorage Keys
| Key                    | Purpose                           |
|------------------------|-----------------------------------|
| `ns-theme`             | Current theme name                |
| `nice-xp`             | Gamification XP points            |
| `nice-achievements`   | Unlocked achievement IDs          |
| `nice-audit-log`      | Audit log entries (max 500)       |
| `nice-widget-order`   | Home dashboard widget order       |
| `nice-workflows`      | Saved workflow definitions        |
| `nice-custom-themes`  | Custom theme definitions          |
| `nice-mcp-connections`| MCP connection cache              |
| `nice-budget`         | Cost tracker budget data          |

## Gamification System
- **XP Actions**: `create_robot: 20`, `complete_mission: 15`, `chat_agent: 5`, `create_workflow: 20`, etc.
- **Ranks** (12 Starfleet ranks): Ensign (0) → Lieutenant JG (10K) → Lieutenant (25K) → Lt Commander (50K) → Commander (100K) → Captain (200K) → Fleet Captain (350K) → Commodore (500K) → Rear Admiral (750K) → Vice Admiral (1M) → Admiral (1.5M) → Fleet Admiral (2.5M)
- **Ship Classes**: Scout (1-2 agents) → Cruiser (3-5) → Dreadnought (6-10) → Flagship (11+)
- **Achievements**: `first-agent`, `agent-army`, `mission-streak`, `workflow-creator`, `data-exporter`, etc.

## Testing

### Unit Tests (Vitest)
```bash
npm test          # Run all 64 unit tests
npm run test:watch  # Watch mode
```
Test files: `app/js/__tests__/*.test.js`
- `state.test.js` — State pub/sub store (9 tests)
- `gamification.test.js` — XP, ranks, ship classes, achievements (21 tests)
- `audit-log.test.js` — CRUD, filtering, FIFO limit (11 tests)
- `data-io.test.js` — Export/import mechanics (5 tests)
- `command-palette.test.js` — Fuzzy scoring, module API (10 tests)
- `router.test.js` — Route matching, param extraction, path parsing (8 tests)

**Test Setup**: IIFE modules are loaded via `loadScriptGlobal()` which replaces `const X =` with `globalThis.X =` and evals the code, making modules available as globals in the jsdom environment.

### E2E Tests (Playwright)
```bash
npm run test:e2e  # Run 9 smoke tests
```
Tests: `e2e/smoke.spec.js` — app loads, sidebar nav, 14 views render, command palette, theme switching, keyboard shortcuts, responsive layout, settings, widget cards.

### CI/CD
GitHub Actions (`.github/workflows/ci.yml`): Node 20 → `npm ci` → `vitest` → `playwright install --with-deps chromium` → `playwright test`

## NICE™ Branding Rules
- **Full name**: NICE™ (always include ™ on first mention per page)
- **Short form**: NICE™ or NICE
- **Tagline**: "Mission control for your AI agent fleet"
- **Visual**: Concentric animated rings with glowing core
- **Version**: v3.5 (displayed in HUD panels)

## Marketing Site JS Modules (public/js/app.js)
| Module          | Purpose                                      |
|-----------------|----------------------------------------------|
| `Theme`         | 8-mode theme switching + localStorage         |
| `MatrixRain`    | Canvas digital rain for Matrix theme          |
| `Telemetry`     | Mission Elapsed Time clock                    |
| `MissionControl`| Animated dial, position coords, console log   |
| `Toggles`       | Interactive toggle switches                   |
| `TacSim`        | Tactical Sim Lab (Tic Tac Toe)               |
| `MobileMenu`    | Hamburger menu for mobile                     |
| `NavActive`     | Highlights current page in nav                |

## Shared Marketing Page Shell
Every marketing page includes (in order):
1. `<canvas id="matrix-canvas">` + background divs
2. Telemetry ticker bar (`.tel-bar`)
3. `<nav>` with inline SVG logo, nav-links, hamburger
4. `<div class="page">` — unique page content
5. `<footer>` with inline SVG logo, link columns
6. Theme dock (8 buttons)
7. `<script src="./public/js/app.js">`

## Desktop App (Electron)
```bash
cd desktop && npm install && npm start
```
- BrowserWindow 1200x800 loading local `app/index.html`
- System tray with online/offline status + context menu
- Desktop notifications via Electron Notification API

## Deployment
- **Platform**: Vercel (auto-deploy from `main` branch)
- **Repo**: `github.com/nicespaceship/nice`
- **Forms**: Formspree endpoint `xbdzrjnn`
- **PWA**: Service Worker (auto-versioned) with offline fallback, periodic sync (12h), push notifications
