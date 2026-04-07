# NICE™ — Project Guide

## Branding
- **NICE** = Neural Intelligence Command Engine (the product)
- **NICE SPACESHIP** = the company (all caps)
- Product domain: `nicespaceship.ai`
- Company domain: `nicespaceship.com`

## Housekeeping
At the start of each session, run `git worktree prune` and delete any stale `claude/*` branches (local and remote) that have no uncommitted work. Keep the repo clean.

## Git Commit Standards
- **Never** add `Co-Authored-By: Claude` or any AI attribution to commits. Benjamin is the author.
- Write commits in the founder's voice — short, direct, technical.
- One concern per commit. Prefer small focused commits over large multi-feature commits.
- Commit message format: imperative mood, under 72 chars for the subject line. No bullet lists in subject.
  - Good: `Fix streaming endpoint in prompt panel`
  - Good: `Add blueprint sharing via Supabase`
  - Bad: `9-point upgrade: streaming, orchestration, MCP tools, achievements, sharing, onboarding`
  - Bad: `Fix various issues and add new features`
- Body (optional): explain *why*, not *what*. The diff shows what changed.
- Never force-add files that are in `.gitignore`.

## Project Overview
**NICE™** is an Agentic Intelligence platform by NICE SPACESHIP. SPA dashboard for building, deploying, and managing AI agent fleets. Static HTML deployed on Cloudflare Pages via GitHub (`nicespaceship/nice`). Domain: `nicespaceship.ai`.

NICE IS the LLM provider — users never deal with API keys. NICE holds all provider keys server-side. Users toggle which models they want active. Free tier = Gemini 2.5 Flash. Premium models cost tokens (purchased via Stripe).

## Supabase
- Project: `nice` (ID: `zacllshbgmnwsmliteqx`)
- Region: `us-west-1`
- 800+ blueprints (agents + spaceships + fleets)

### Edge Functions (11)
| Function | Purpose |
|----------|---------|
| `nice-ai` | Multi-provider LLM proxy (Gemini, Anthropic, OpenAI, Mistral, DeepSeek, xAI) |
| `nice-media` | Image/video generation proxy (Imagen 3, Veo 2, DALL-E 3, Flux) |
| `gmail-mcp` | Gmail MCP server (search, read, labels) — OAuth + service account dual auth |
| `calendar-mcp` | Google Calendar MCP server (events, calendars) |
| `drive-mcp` | Google Drive MCP server (search, read, metadata) |
| `social-mcp` | Social media publishing (Buffer, X, LinkedIn) |
| `mcp-gateway` | MCP tool router — auth, token refresh, tool invocation |
| `google-oauth` | OAuth 2.0 flow (authorize, callback, disconnect) for any Google account |
| `stripe-webhook` | Credits tokens on Stripe purchase (500K/5M/25M packages) |
| `blueprint-search` | Full-text blueprint catalog search |
| `browser-proxy` | Fetches web pages for agent browser tools; returns clean text |

### Database Tables
| Table | Purpose |
|-------|---------|
| `blueprints` | Agent + spaceship blueprint catalog (800+ seeded) |
| `shared_blueprints` | Blueprint sharing via links (8-char codes, 30-day expiry) |
| `profiles` | Public user profile data (extends auth.users) |
| `user_agents` | Activated agent instances per user |
| `user_spaceships` | Activated spaceship instances per user |
| `user_shared_agents` | Agent sharing between users |
| `tasks` | Missions (queued → running → completed/failed) |
| `ship_log` | Agent conversation history per spaceship |
| `mcp_connections` | MCP server connections with OAuth tokens |
| `integrations` | OAuth/API integrations (Gmail, Calendar, Drive) |
| `token_balances` | Per-user token balance (free tier + purchased) |
| `token_transactions` | Purchase/usage transaction log |
| `workflow_runs` | Workflow execution history |
| `blueprint_ratings` | Community blueprint ratings |
| `blueprint_submissions` | Community-submitted blueprints |
| `notifications` | System notifications |
| `error_log` | Client-side error reporting |
| `vault_secrets` | Encrypted credential storage |

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
│   └── logo.svg            # Vector logo
├── public/
│   ├── css/
│   │   └── theme.css       # Marketing site styles + skin engine
│   └── js/
│       └── app.js          # Marketing site JS — theme switcher, telemetry, HUD
├── app/                    # NICE™ SPA Dashboard
│   ├── index.html          # SPA shell (78 script tags in dependency order)
│   ├── manifest.json       # PWA manifest
│   ├── sw.js               # Service Worker v36 (offline, periodic sync, push)
│   ├── css/
│   │   └── app.css         # NICE component styles (8000+ lines)
│   └── js/
│       ├── nice.js         # Main orchestrator (init, auth, routing, error handling)
│       ├── lib/            # 36 shared IIFE modules
│       ├── views/          # 24 view modules
│       └── __tests__/      # 19 Vitest test files (343 tests)
├── supabase/
│   └── functions/          # 8 Deno edge functions
├── e2e/
│   └── smoke.spec.js       # 14 Playwright E2E tests
├── desktop/                # Electron desktop wrapper
├── .github/workflows/
│   └── ci.yml              # GitHub Actions (vitest + playwright, strict)
├── package.json            # npm config
├── vitest.config.js        # Unit test config
├── playwright.config.js    # E2E config (60s timeout, 15s expect)
└── CLAUDE.md               # This file
```

## Skin System
Skins are applied via the `Skin` module. Base theme uses CSS custom properties on `<html>`.

| Skin | Aesthetic | Source |
|------|-----------|--------|
| NICE (default) | Premium dark command center | Built-in |
| The Office | Light/warm corporate, real-world terminology | Built-in |
| Navigator | Electric blue TRON grid | Built-in |
| Matrix | Digital rain green, terminal | Built-in |
| LCARS | Star Trek modular, pastels | Built-in |
| J.A.R.V.I.S. | Holographic blue HUD, arc reactor | Built-in |
| + 5 more | Pod, Gundam, 16-bit, Solar, Retro | Built-in |

### Skin CSS Variables
- `--bg`, `--bg-alt` — background colors
- `--text`, `--text-muted` — text colors
- `--accent`, `--accent2` — primary/secondary accent
- `--border`, `--border-hi` — borders
- `--panel-bg`, `--panel-border` — panel styling
- `--glow`, `--glow-hi` — glow/shadow effects
- `--font-h`, `--font-b`, `--font-m` — heading/body/mono fonts
- `--radius` — border radius

### Skin Switching
- Persisted in `localStorage` key `ns-theme`
- Theme Creator view (`#/theme-editor`) for custom skins

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

### Lib Modules (`app/js/lib/`) — 49 modules
| Module | File | Purpose |
|--------|------|---------|
| `State` | `state.js` | Pub/sub state store: `get/set/setBatched/on/off` |
| `SB` | `supabase.js` | Supabase client wrapper: `db()`, `auth()`, `client` |
| `Router` | `router.js` | Hash router with param extraction & page transitions |
| `Utils` | `utils.js` | Shared utilities (esc, debounce, format) + `KEYS` constants |
| `BlueprintUtils` | `blueprint-utils.js` | SSOT: rarity colors, slot labels, ship classes, categories |
| `AuditLog` | `audit-log.js` | Persistent event logging (max 500 FIFO) |
| `DataIO` | `data-io.js` | Export/import all NICE data as JSON |
| `ActivityFeed` | `activity-feed.js` | Live event stream from Supabase realtime |
| `Notify` | `notify.js` | Toast notifications, badge API |
| `Gamification` | `gamification.js` | XP system, ranks, ship classes, achievements |
| `CommandPalette` | `command-palette.js` | Cmd+K fuzzy search overlay |
| `Keyboard` | `keyboard.js` | Global keyboard shortcuts & chord system |
| `McpBridge` | `mcp-bridge.js` | Bridges MCP connections to ToolRegistry |
| `ToolRegistry` | `tool-registry.js` | Central registry for agent tools |
| `AgentExecutor` | `agent-executor.js` | ReAct loop: LLM → tool calls → observations |
| `AgentMemory` | `agent-memory.js` | Agent memory and context management |
| `MissionRunner` | `mission-runner.js` | Long-running mission lifecycle management |
| `MissionRouter` | `mission-router.js` | Routes prompts to optimal agent on spaceship |
| `MissionScheduler` | `mission-scheduler.js` | Scheduled/recurring mission execution |
| `ShipLog` | `ship-log.js` | Agent conversation persistence to Supabase |
| `ShipBehaviors` | `ship-behaviors.js` | Spaceship behavior definitions |
| `ShipTemplates` | `ship-templates.js` | Pre-built spaceship templates |
| `LLMConfig` | `llm-config.js` | Model selection from enabled_models state |
| `ModelIntel` | `model-intel.js` | Learns optimal models from mission history |
| `BlueprintStore` | `blueprint-store.js` | Blueprint catalog with Supabase sync + sharing |
| `BlueprintMarkdown` | `blueprint-markdown.js` | Markdown rendering for blueprint descriptions |
| `CardRenderer` | `card-renderer.js` | Unified TCG card template renderer |
| `CrewDesigner` | `crew-designer.js` | Describe → Design → Deploy crew builder |
| `CrewGenerator` | `crew-generator.js` | AI crew generation from business description |
| `QualityGate` | `quality-gate.js` | Blueprint quality validation |
| `BrowserTools` | `browser-tools.js` | Agent web browsing via browser-proxy edge function |
| `MediaTools` | `media-tools.js` | Image/video generation tools for agents |
| `ContentQueue` | `content-queue.js` | Social media content queue |
| `VirtualFS` | `virtual-fs.js` | Virtual file system for agent file operations |
| `Skin` | `skin.js` | Skin system (CSS variable overrides) |
| `SkinPacks` | `skin-packs.js` | Premium skin definitions |
| `Subscription` | `subscription.js` | Stripe subscription management |
| `WorkflowEngine` | `workflow-engine.js` | Multi-step workflow execution |
| `AuthModal` | `auth-modal.js` | Sign-in/sign-up modal |
| `Favorites` | `favorites.js` | Sidebar favorites management |
| `QuickNotes` | `quick-notes.js` | Ephemeral note-taking |
| `SetupWizard` | `setup-wizard.js` | First-run onboarding wizard |
| `ShipSetupWizard` | `ship-setup-wizard.js` | Spaceship activation wizard |
| `PromptBuilder` | `prompt-builder.js` | System prompt construction |
| `PreviewPanel` | `preview-panel.js` | Content preview rendering |
| `MessageBar` | `message-bar.js` | Status message display |
| `UpgradeModal` | `upgrade-modal.js` | Subscription upgrade prompts |
| `OfflineQueue` | `offline-queue.js` | Queue actions when offline |
| `RateLimiter` | `rate-limiter.js` | Client-side rate limiting |

### View Modules (`app/js/views/`) — 25 views
| View | File | Route(s) | Title |
|------|------|----------|-------|
| `HomeView` | `home.js` | `#/` | NICE SPACESHIP |
| `BlueprintsView` | `blueprints.js` | `#/bridge` | Bridge |
| `AgentDetailView` | `agents.js` | `#/bridge/agents/:id` | Agent Detail |
| `AgentBuilderView` | `agent-builder.js` | `#/bridge/agents/new` | Agent Builder |
| `SpaceshipDetailView` | `spaceships.js` | `#/bridge/spaceships/:id` | Ship Detail |
| `SpaceshipBuilderView` | `spaceship-builder.js` | `#/bridge/spaceships/new` | Ship Builder |
| `SchematicView` | `schematic.js` | (embedded in BlueprintsView) | Schematic |
| `MissionsView` | `missions.js` | (embedded in BlueprintsView) | Missions |
| `AnalyticsView` | `analytics.js` | (embedded in BlueprintsView) | Operations |
| `LogView` | `log-view.js` | (embedded in BlueprintsView) | Log |
| `AuditLogView` | `audit-log.js` | (embedded in BlueprintsView) | Captain's Log |
| `ShipLogView` | `ship-log-view.js` | (embedded in SchematicView) | Ship's Log |
| `DockView` | `dock-view.js` | `#/dock` → redirects to `#/` | — |
| `SecurityView` | `security.js` | `#/security` | Security |
| `IntegrationsView` | `integrations.js` | (tab in SecurityView) | Integrations |
| `VaultView` | `vault.js` | (section in IntegrationsView) | AI Models |
| `WalletView` | `wallet.js` | (tab in SecurityView) | Wallet |
| `SettingsView` | `settings.js` | `#/settings` | Settings |
| `ProfileView` | `profile.js` | `#/profile` | Profile |
| `CostView` | `cost.js` | (embedded) | Cost Tracker |
| `AlertsView` | `alerts.js` | (embedded) | Alerts |
| `WorkflowDetailView` | `workflows.js` | `#/workflows/:id` | Workflow Detail |
| `ThemeCreatorView` | `theme-creator.js` | `#/theme-editor` | Theme Editor |
| `EngineeringView` | `engineering.js` | `#/engineering` | Engineering |
| `PromptPanel` | `prompt-panel.js` | (global overlay) | Prompt Panel |

### Security Page Tabs
| Tab | Content |
|-----|---------|
| Security | Threats, compliance checklist, access policies |
| Integrations | MCP connections (Google, Slack, etc.) + AI model selector |
| Wallet | Token balance, buy tokens (Stripe), transaction history |

### AI Model System
Models defined in `VaultView.MODEL_CATALOG`. Users toggle models on/off. State key: `enabled_models`.

| Model | Provider | Tier | Notes |
|-------|----------|------|-------|
| Gemini 2.5 Flash | Google | Free | Default for all users |
| Gemini 2.0 Lite | Google | Free | Ultra-fast |
| Claude Sonnet 4 | Anthropic | Premium | Best reasoning |
| Claude Opus 4 | Anthropic | Premium | Most capable |
| GPT-5.2 | OpenAI | Premium | Flagship |
| GPT-5 Mini | OpenAI | Premium | Fast + cheap |
| Gemini 2.5 Pro | Google | Premium | Complex tasks |
| DeepSeek V3 | DeepSeek | Budget | Affordable |
| Mistral Large 3 | Mistral | Budget | Multilingual |
| Grok 4 | xAI | Premium | Real-time knowledge |

Backwards-compatible `LLM_PROVIDERS` and `LLM_MODELS` globals derived from `MODEL_CATALOG` in `agent-builder.js`.

### Token Credit System
- 100K free tokens per new user
- Stripe packages: Starter ($4.99/500K), Pro ($19.99/5M), Enterprise ($69.99/25M)
- `nice-ai` checks balance before premium calls (402 if insufficient)
- Free Gemini models don't consume tokens
- Usage tracked per request (fire-and-forget deduction)

### Key localStorage Keys
| Key | Purpose |
|-----|---------|
| `ns-theme` | Current skin name |
| `nice-enabled-models` | Toggled AI models (object keyed by model ID) |
| `nice-xp` | Gamification XP points |
| `nice-achievements` | Unlocked achievement IDs |
| `nice-audit-log` | Audit log entries (max 500) |
| `nice-workflows` | Saved workflow definitions |
| `nice-mcp-connections` | MCP connection cache |
| `nice-budget` | Cost tracker budget data |
| `nice-bp-activated` | Activated blueprint IDs |
| `nice-agent-stats` | Per-agent usage statistics |
| `nice-favorites` | Sidebar favorites |
| `nice-ai-messages` | Prompt panel conversation history |

## Gamification System
- **XP Actions**: `create_robot: 20`, `complete_mission: 15`, `chat_agent: 5`, `create_workflow: 20`, etc.
- **Ranks** (12 Starfleet ranks): Ensign (0) → Lieutenant JG (10K) → Lieutenant (25K) → Lt Commander (50K) → Commander (100K) → Captain (200K) → Fleet Captain (350K) → Commodore (500K) → Rear Admiral (750K) → Vice Admiral (1M) → Admiral (1.5M) → Fleet Admiral (2.5M)
- **Ship Classes**: Scout (1-2 agents) → Cruiser (3-5) → Dreadnought (6-10) → Flagship (11+)
- **Achievements**: `first-agent`, `agent-army`, `mission-streak`, `workflow-creator`, `data-exporter`, etc.

## Testing

### Unit Tests (Vitest) — 343 tests across 19 files
```bash
npm test          # Run all tests
npm run test:watch  # Watch mode
```
Test files: `app/js/__tests__/*.test.js`
- `state.test.js` — State pub/sub store (9 tests)
- `gamification.test.js` — XP, ranks, ship classes, achievements (21 tests)
- `audit-log.test.js` — CRUD, filtering, FIFO limit (11 tests)
- `data-io.test.js` — Export/import mechanics (5 tests)
- `command-palette.test.js` — Fuzzy scoring, module API (10 tests)
- `router.test.js` — Route matching, param extraction (8 tests)
- `ship-log.test.js` — Conversation persistence, LLM calls
- `mission-runner.test.js` — Mission lifecycle management
- `llm-config.test.js` — Model selection from enabled_models
- `blueprint-store.test.js` — Blueprint CRUD operations
- `keyboard.test.js` — Shortcut binding and chord system
- `notify.test.js` — Toast notification system
- `prompt-builder.test.js` — System prompt construction
- `supabase.test.js` — Supabase client wrapper
- `home-view.test.js` — Home view rendering
- `missions-view.test.js` — Missions view rendering

### E2E Tests (Playwright) — 14 tests
```bash
npm run test:e2e  # Run all E2E tests
```
- Smoke: app loads, sidebar nav, view rendering, command palette, theme switching, responsive
- Routes: hash navigation between views
- Accessibility: skip-to-content, WCAG 2.1 AA (axe-core), ARIA landmarks, keyboard nav
- Auth: unauthenticated navigation without errors
- Performance: load time < 5s, no JS errors during rapid navigation

**Test helpers:**
- `waitForApp(page)` — waits for State + Router globals (JS bootstrap complete)
- `navigateTo(page, hash, title)` — navigates and waits for document.title update

### CI/CD
GitHub Actions (`.github/workflows/ci.yml`): Node 20 → `npm ci` → security audit → SW version stamp → verify build → vitest (343 tests) → playwright (14 tests) → bundle size check

**CI is strict** — both unit and E2E failures block merges.

## Google Workspace Integration
- OAuth flow for any Google account (Gmail, Workspace, any domain)
- `google-oauth` edge function: `/authorize` → Google consent → `/callback` → stores tokens
- MCP servers: gmail-mcp, calendar-mcp, drive-mcp
- `mcp-gateway` auto-refreshes expired OAuth tokens before tool calls
- Scopes: gmail.readonly, calendar.readonly, drive.readonly
- Domain-wide delegation fallback for @nicespaceship.com internal users

## Single Source of Truth (SSOT)
Before adding constants, arrays, or configuration, check if a source already exists:

| Data | SSOT Location | Notes |
|------|--------------|-------|
| Blueprint data | `BlueprintStore` + Supabase `blueprints` table | Never hardcode blueprint lists |
| Crew slots, rarity, ship classes | `BlueprintUtils` (`blueprint-utils.js`) | Loaded before card-renderer |
| localStorage keys | `Utils.KEYS` (28 constants) | Never use raw string keys |
| State keys | `State.KEYS` (10 constants) | Never use raw string keys |
| Theme definitions | `THEMES` array in `nice.js` → `Theme.BUILTIN` | No separate theme list |
| Ranks & XP | `Gamification.RANKS` / `XP_ACTIONS` | Never duplicate rank data |
| Card rendering | `CardRenderer.render()` | ONE renderer for all card types |
| Model catalog | `VaultView.MODEL_CATALOG` | `LLM_PROVIDERS`/`LLM_MODELS` derived from it |
| Rarity colors | `BlueprintUtils.RARITY_COLORS` | Used by card-renderer and all views |

## Tool Preferences
- **CLI first.** Always prefer CLI tools over browser/GUI for GitHub (`gh`), Supabase (`npx supabase`), npm, and git operations. CLI is faster, scriptable, and doesn't depend on browser rendering.
- **Supabase CLI**: `npx supabase functions deploy`, `npx supabase secrets set`, `npx supabase db push`
- **GitHub CLI**: `gh pr create`, `gh issue list`, `gh repo view`
- Fall back to browser automation only when CLI doesn't support the operation.

## Coding Guidelines
- **Read before write.** Never modify a file you haven't read. Understand existing patterns.
- **Prefer editing over creating.** Don't create new files when extending an existing module works.
- **No speculative abstractions.** Three similar lines > premature helper function.
- **No unnecessary comments.** Only explain *why*, never *what*. The code shows what.
- **Escape user content.** Always use `Utils.esc()` before inserting into DOM. No raw `innerHTML` with user data.
- **Test after changes.** Run `npm test` after editing JS. All 343 tests must pass.
- **Mobile-first.** Check changes at 375px. Breakpoints: 480px, 640px, 768px.
- **Theme-aware.** Use CSS custom properties (`var(--accent)`, `var(--bg)`), never hardcoded colors.

## Deployment
- **Platform**: Cloudflare Pages (auto-deploy from `main` branch)
- **Domains**: `nicespaceship.ai` (app), `nicespaceship.com` (community site, deployed from `www/`)
- **Repo**: `github.com/nicespaceship/nice`
- **Supabase**: 11 edge functions deployed via `npx supabase functions deploy` (source is proprietary, not in repo)
- **Stripe**: 3 token packages with payment links
- **PWA**: Service Worker v36 with offline fallback, periodic sync (12h), push notifications
- **Build**: `node scripts/build.js` → 865KB minified bundle (78 scripts)

### Cloudflare Pages Routing
- `nicespaceship.ai`: app served at root via `_redirects` and `_headers`
- `nicespaceship.com`: community site deployed from `www/` directory
- Security headers: HSTS, CSP, X-Frame-Options, nosniff, Referrer-Policy

## Environment Variables (Supabase Secrets)
| Variable | Used By | Required |
|----------|---------|----------|
| `SUPABASE_URL` | All functions | Auto-set |
| `SUPABASE_ANON_KEY` | All functions | Auto-set |
| `SUPABASE_SERVICE_ROLE_KEY` | stripe-webhook, mcp-gateway | Auto-set |
| `GOOGLE_AI_API_KEY` | nice-ai, nice-media | Yes (free tier) |
| `ANTHROPIC_API_KEY` | nice-ai | Premium models |
| `OPENAI_API_KEY` | nice-ai, nice-media | Premium models |
| `MISTRAL_API_KEY` | nice-ai | Budget models |
| `DEEPSEEK_API_KEY` | nice-ai | Budget models |
| `XAI_API_KEY` | nice-ai | Budget models |
| `GOOGLE_CLIENT_ID` | google-oauth, mcp-gateway | For OAuth |
| `GOOGLE_CLIENT_SECRET` | google-oauth, mcp-gateway | For OAuth |
| `GOOGLE_SERVICE_ACCOUNT` | gmail-mcp | Domain-wide delegation |
| `STRIPE_WEBHOOK_SECRET` | stripe-webhook | For payments |
| `REPLICATE_API_TOKEN` | nice-media | Flux image gen |

## CSS Naming Conventions
- **Block-element**: `.agent-card`, `.agent-card-hdr`, `.agent-card-info` (hyphenated, not BEM)
- **View prefixes**: `.bp-` (blueprints), `.mc-` (missions), `.sch-` (schematic), `.fleet-` (spaceships)
- **Utility prefixes**: `.btn`, `.badge-`, `.skeleton-`
- **IDs use hyphens**: `#nice-ai-input`, `#btn-logout`, `#hud-alert-badge`
- **SVG icons**: `<use href="#icon-name"/>` referencing `<symbol id="icon-name">` in index.html
- **Data attributes**: `data-theme`, `data-tab`, `data-view`, `data-tip`, `data-rarity`
- **Theme overrides**: `[data-theme="office"] .component { ... }`
