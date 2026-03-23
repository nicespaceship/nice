# ATM Web App — Implementation Plan

## Context
ATM™ (Agent Task Manager) is the flagship product of Nice Spaceship. The marketing page (`atm.html`) showcases 12 features with an iPhone mockup. Significant scaffolding already exists — Auth module, FleetDash with 12 agents, Blueprint library, Supabase integration, 8-theme engine. The goal is to turn this into a **functional PWA** users can install on iOS/Android and actually use to manage AI agents.

**Approach:** Vanilla JS SPA at `/app/`, Supabase backend, PWA installable, built incrementally in 4 phases. No framework, no build step, deploys as static files on Vercel.

---

## File Structure

```
/app/
├── index.html            # SPA shell (single HTML file, all views rendered by JS)
├── manifest.json         # PWA manifest (name, icons, theme, display: standalone)
├── sw.js                 # Service worker (cache shell + offline fallback)
├── css/
│   └── app.css           # App-specific styles (imports theme tokens from /public/css/theme.css)
├── js/
│   ├── atm.js            # Main app: router, Supabase client, view orchestrator
│   ├── views/            # One file per view (lazy-loaded or bundled)
│   │   ├── home.js       # Dashboard home
│   │   ├── agents.js     # Agent list + CRUD
│   │   ├── builder.js    # Agent builder (no-code)
│   │   ├── fleet.js      # Fleet command
│   │   ├── tasks.js      # Task monitor
│   │   ├── blueprints.js # Blueprint marketplace
│   │   ├── analytics.js  # Analytics dashboard
│   │   ├── cost.js       # Cost tracker
│   │   ├── comms.js      # Communications hub
│   │   ├── integrations.js # MCP integrations
│   │   ├── academy.js    # Academy & training
│   │   ├── vault.js      # Secure vault
│   │   ├── profile.js    # Account & profile
│   │   └── settings.js   # App settings
│   └── lib/
│       ├── supabase.js   # Supabase client wrapper (auth, DB, realtime, storage)
│       ├── router.js     # Hash-based SPA router
│       ├── state.js      # Simple reactive state store
│       └── notify.js     # Push notification + in-app notification manager
└── icons/
    ├── icon-192.png      # PWA icon
    ├── icon-512.png      # PWA icon
    └── apple-touch-icon.png
```

**Also modified:**
- `/vercel.json` — Add SPA rewrite rule for `/app/**` → `/app/index.html`
- `/atm.html` — Update "Open Web App" button to link to `/app/`
- `/index.html` — Update ATM CTA links to `/app/`

---

## Architecture

### SPA Shell (`/app/index.html`)
- Fixed top header: ATM logo, page title, notification bell, profile avatar
- `<main id="app-view">` — Views rendered here by router
- Fixed bottom tab bar: Home, Agents, Fleet, Academy, Profile (matches iPhone mockup)
- Theme dock (reused from main site)
- Imports `theme.css` + `app.css` + all JS

### Hash Router (`router.js`)
```
#/              → home
#/agents        → agent list
#/agents/new    → agent builder
#/agents/:id    → agent detail
#/fleet         → fleet list
#/fleet/:id     → fleet detail
#/tasks         → task monitor
#/blueprints    → marketplace
#/analytics     → dashboard
#/cost          → cost tracker
#/comms         → communications
#/integrations  → MCP integrations
#/academy       → training
#/vault         → secure vault
#/profile       → account
#/settings      → app settings
```

### State Management (`state.js`)
Simple pub/sub store. Modules subscribe to state changes:
```js
State.set('agents', [...]);
State.on('agents', (agents) => AgentsView.render(agents));
```

### Supabase Client (`supabase.js`)
Wraps `@supabase/supabase-js` CDN import. Provides:
- `SB.auth.signUp/signIn/signOut/getUser`
- `SB.db.agents/tasks/fleets/blueprints` (CRUD helpers)
- `SB.realtime.subscribe(table, callback)` for live updates
- `SB.storage` for file uploads (blueprints, avatars)

### Supabase Tables
- `profiles` — user display name, avatar, plan tier
- `agents` — id, user_id, name, role, type, status, llm_engine, config (JSONB)
- `fleets` — id, user_id, name, agent_ids[], status
- `tasks` — id, agent_id, user_id, title, status, priority, progress, result
- `blueprints` — id, name, category, rarity, config, author_id, is_public, downloads, rating
- `notifications` — id, user_id, type, title, message, read
- `integrations` — id, user_id, service, status, config
- `vault_secrets` — id, user_id, name, service, encrypted_value
- `cost_logs` — id, user_id, agent_id, amount, model, tokens_used, timestamp
- `academy_progress` — id, user_id, track, module, status, score

---

## Phased Build Plan

### Phase 1: Foundation (App Shell + Auth + PWA)
**Goal:** Installable PWA with working auth. Users can sign up, log in, see the app shell.

**Files created:**
- `/app/index.html` — SPA shell with header, tab bar, theme dock
- `/app/manifest.json` — PWA manifest
- `/app/sw.js` — Service worker
- `/app/css/app.css` — App styles (shell, tabs, header, panels)
- `/app/js/atm.js` — Main orchestrator
- `/app/js/lib/router.js` — Hash router
- `/app/js/lib/supabase.js` — Supabase client
- `/app/js/lib/state.js` — State store
- `/app/js/views/home.js` — Home dashboard (placeholder stats)
- `/app/js/views/profile.js` — Login/signup/profile view
- `/app/icons/` — PWA icons

**Files modified:**
- `/vercel.json` — SPA rewrite

**Delivers:** Installable app, working auth, home screen with mission control stats, theme switching, bottom tab navigation.

### Phase 2: Core Loop (Agents + Tasks + Fleet)
**Goal:** The product works. Users create agents, assign tasks, organize fleets, see live status.

**Files created:**
- `/app/js/views/agents.js` — Agent list + CRUD
- `/app/js/views/builder.js` — Agent builder
- `/app/js/views/fleet.js` — Fleet command
- `/app/js/views/tasks.js` — Task monitor

**Supabase tables:** agents, tasks, fleets (with RLS policies)

**Delivers:** Full agent lifecycle — create → configure → deploy → monitor. Fleet grouping. Task queue with real-time progress. **This is the investor-demo milestone.**

### Phase 3: Intelligence (Blueprints + Analytics + Cost)
**Goal:** Marketplace, data insights, and cost management.

**Files created:**
- `/app/js/views/blueprints.js` — Blueprint marketplace
- `/app/js/views/analytics.js` — Analytics dashboard (canvas charts)
- `/app/js/views/cost.js` — Cost tracker

**Supabase tables:** blueprints, cost_logs

**Delivers:** Browse/deploy blueprints, performance charts, per-agent cost tracking with budget alerts.

### Phase 4: Ecosystem (Comms + Integrations + Academy + Vault)
**Goal:** Full feature parity with marketing page.

**Files created:**
- `/app/js/views/comms.js` — Communications hub
- `/app/js/views/integrations.js` — MCP integrations
- `/app/js/views/academy.js` — Academy & training
- `/app/js/views/vault.js` — Secure vault
- `/app/js/views/settings.js` — App settings
- `/app/js/lib/notify.js` — Push notification manager

**Supabase tables:** notifications, integrations, vault_secrets, academy_progress

**Delivers:** Complete ATM platform matching all 12 features on the marketing page.

---

## Verification Plan
After each phase:
1. `preview_start` the dev server, verify no console errors
2. Test on mobile viewport (`preview_resize` to mobile preset)
3. Verify PWA installability (manifest, service worker registration)
4. Test auth flow (signup → login → persist across reload)
5. Test theme switching across all 8 themes
6. Test hash routing (navigate, back button, direct URL access)
7. Screenshot for visual verification

---

## Key Design Decisions
- **No build step** — all vanilla JS loaded via `<script>` tags, Supabase via CDN
- **Theme reuse** — `app.css` imports theme tokens, all colors via `var(--token)`
- **Mobile-first** — bottom tab bar, touch targets 44px+, swipe-friendly
- **Offline capable** — service worker caches shell, shows offline state for data
- **Incremental** — each phase is independently deployable and useful
