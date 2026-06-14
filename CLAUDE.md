# NICE™ — Project Guide

## Branding
- **NICE** = Neural Intelligence Command Engine (the product)
- **NICE SPACESHIP** = the company (all caps)
- Product domain: `nicespaceship.ai`
- Company domain: `nicespaceship.com`

## Blueprint Copy Standards
Applies to ALL catalog content — blueprint `name`, `description`, `flavor`, `subtitle`, `caps`, ship `config.ship_system_prompt`, agent `config.system_prompt`, slot `label`, and any other user-facing string sourced from a seed migration.

- **Active voice.** Subject performs the verb. "The Front Desk Coordinator confirms appointments" — not "Appointments are confirmed by the Front Desk Coordinator." Reads as direct operator copy, not a press release.
- **No em-dashes (`—`) unless truly necessary.** Default to commas, colons, semicolons, or a new sentence. Em-dashes are reserved for parenthetical asides that genuinely need a stronger break than a comma. If a comma works, use a comma. Hyphens (`-`) in compound words ("six-person", "end-of-day") are fine; the rule is about em-dashes only.
- Applies on every new seed and any edit to an existing seed. Pre-existing em-dashes in shipped seeds are not a forced sweep — fix them when you touch the file for another reason.

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

## Automation
Claude Code config under `.claude/` is git-tracked (`settings.json`, `hooks/`, `skills/`) so the automation posture ships with the repo; local-only state (`settings.local.json`, `launch.json`, `worktrees/`) stays gitignored.

### Auto-merge boundary
- **Auto-merge allowed** for low-risk PRs with green CI that fall outside the carve-out.
- **Human-merge only** (Claude must not merge) for any PR whose diff touches:
  - `supabase/migrations/**`
  - billing: `stripe-config.js`, `token-config.js`, `subscription.js`, `wallet.js`
  - auth/security: `security.js`, `auth-modal.js`, any `*-oauth*` path
- Enforced by the `block-protected-merge` hook below, not just documented.

### Hooks (`.claude/settings.json` → `.claude/hooks/`, PreToolUse on `Bash`)
- **`block-coauthor-commit.sh`** — hard `deny` on any `git commit` carrying a `Co-Authored-By:` trailer (matches the trailer form, so prose that merely mentions the policy is not blocked). Backstops the Git Commit Standards above.
- **`block-protected-merge.sh`** — on `gh pr merge`, inspects the PR's changed files; if they hit the carve-out, returns `ask` (escalates to a human; an unattended routine has no approver, so it holds). Fails **open** if the diff cannot be inspected, so a transient `gh` error never blocks a clean merge.

### Routines (`~/.claude/scheduled-tasks/`)
Fire while the desktop app is open, or on next launch if it was closed; they are not cloud-unattended. New routines start report-only and graduate to auto-merge only after one clean cycle.
- **`nightly-launch-audit`** (`17 3 * * *`) — a fresh session re-runs the read-only launch-readiness security checks, diffs the set of anon-executable privileged DB functions against a known baseline, reports drift, and drafts a single REVOKE-migration PR for any clear low-risk regression. Report + draft only; never merges.

## Project Overview
**NICE™** is an Agentic Intelligence platform by NICE SPACESHIP. SPA dashboard for building, deploying, and managing AI agent fleets. Static HTML deployed on Cloudflare Pages via GitHub (`nicespaceship/nice`). Domain: `nicespaceship.ai`.

NICE IS the LLM provider — users never deal with API keys. NICE holds all provider keys server-side. Users toggle which models they want active. Free tier = Gemini 2.5 Flash. Premium models cost tokens (purchased via Stripe).

## Supabase
- Project: `nice` (ID: `zacllshbgmnwsmliteqx`)
- Region: `us-west-1`
- **Catalog is the three-layer schema** (the legacy single `blueprints` table was dropped in the #604 rebuild — do NOT reference it): `capabilities` (capability layer) → `agent_blueprints` (role + capability) → `spaceship_blueprints` (+ `ship_slots` for crew). Each blueprint table is partitioned via the `scope` column: `catalog` (seed library), `community` (user-published), `system` (internal/reviewer). Counts drift — verify with `SELECT scope, COUNT(*) FROM spaceship_blueprints GROUP BY scope;` (and the same on `agent_blueprints`). As of 2026-06-10: spaceships 53 catalog / 2 community / 1 system; agents 166 catalog / 65 community / 5 system.
- **Migrations flow through CI only.** Write `supabase/migrations/<timestamp>_name.sql`, commit, push. The `supabase-migrate` GitHub Action applies it on push to main. Do NOT use the Supabase MCP `apply_migration` for committed migrations — it stamps `schema_migrations.version` with wall-clock time instead of the filename's timestamp, which desyncs local vs remote and the CI fails on the next push with "Remote migration versions not found in local migrations directory". MCP `execute_sql` is fine for ad-hoc reads and one-off non-migration writes; reserve `apply_migration` for emergency only, and always edit the schema_migrations row to use the local filename's timestamp afterwards.

### Edge Functions (34)
Verify the live list with `npx supabase functions list` — it drifts as integrations land.
| Function | Purpose |
|----------|---------|
| `nice-ai` | Multi-provider LLM proxy (Gemini, Anthropic, OpenAI, xAI, Groq/Llama) |
| `nice-media` | Image/video generation proxy (Imagen 3, Veo 2, DALL-E 3, Flux) |
| `nice-tts` | ElevenLabs-backed text-to-speech; resolves per-theme voice config |
| `gmail-mcp` | Gmail MCP server (search, read, labels) — OAuth + service account dual auth |
| `calendar-mcp` | Google Calendar MCP server (events, calendars) |
| `drive-mcp` | Google Drive MCP server (search, read, metadata) |
| `microsoft-graph-mcp` | Microsoft 365 MCP server (Outlook mail/calendar, SharePoint) |
| `mcp-gateway` | MCP tool router — auth, token refresh, tool invocation |
| `google-oauth` | OAuth 2.0 flow (authorize, callback, disconnect) for any Google account |
| `stripe-webhook` | Credits the matching pool on Stripe purchase (NICE Pro / Claude / Premium subscriptions + Boost/Max top-ups) |
| `stripe-portal` | Issues a Stripe billing-portal session URL scoped to one of the three subscriptions via `prefer: pro\|claude\|premium` |
| `blueprint-search` | Full-text blueprint catalog search |
| `community-submit` | Community blueprint submission — runs the full gate stack server-side before inserting the `marketplace_listings` row |
| `community-review` | 5-agent auto-reviewer that processes the submission queue; service-role-only, HS256, unaffected by ES256 sweep |
| `browser-proxy` | Fetches web pages for agent browser tools; returns clean text |
| `*-oauth` (19) | OAuth 2.0 authorize/callback/disconnect flows, one per remote-MCP integration: `microsoft-oauth`, `hubspot-oauth`, `github-oauth`, `slack-oauth`, `linear-oauth`, `notion-oauth`, `stripe-oauth`, `atlassian-oauth`, `cloudflare-oauth`, `cf-browser-oauth`, `cf-builds-oauth`, `cf-observability-oauth`, `sentry-oauth`, `zapier-oauth`, `airtable-oauth`, `monday-oauth`, `klaviyo-oauth`, `miro-oauth`, `replicate-oauth` |

### Edge Function JWT Verification
The Supabase project signs JWTs with **ES256** (asymmetric). Functions called directly from the client with a user JWT must declare `verify_jwt = false` in [`supabase/config.toml`](supabase/config.toml) and deploy with `npx supabase functions deploy <name> --no-verify-jwt`. Otherwise the platform gateway rejects every authenticated call before it hits the function with:

```json
{"code":"UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM","message":"Unsupported JWT algorithm ES256"}
```

The function still validates the user internally via `supabase.auth.getUser()` — GoTrue handles ES256 natively.

**Applied to:** `nice-ai`, `nice-media`, `nice-tts`, `mcp-gateway`, `blueprint-search`, `community-submit`, `stripe-portal`, `browser-proxy` (2026-04-20 sweep). `nice-media` and `nice-tts` were also patched to require strict internal `auth.getUser()` so `verify_jwt=false` doesn't open them to anonymous provider-credit abuse. `blueprint-search` is public by design (anon key + RLS). `browser-proxy` was rebuilt in the same sweep after being found undeployed. Not applicable: `stripe-webhook` (HMAC-signed, not JWT), the `*-oauth` functions (own flow), `community-review` (service-role only, HS256 unaffected), `gmail-mcp`/`calendar-mcp`/`drive-mcp`/`microsoft-graph-mcp` (invoked via `mcp-gateway`, not directly from client). Check the response body, not just the status code — the gateway only surfaces the `UNSUPPORTED_TOKEN_ALGORITHM` code in the body.

### Database Tables
36 tables (`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`). The list drifts — verify before assuming a table does or doesn't exist.
| Table | Purpose |
|-------|---------|
| `spaceship_blueprints` | Spaceship blueprints (catalog/community/system via `scope`). `config` (ship_system_prompt + reserved keys) + `card` (presentation JSONB: workflows, specialties, caps, art) |
| `agent_blueprints` | Agent blueprints — the role+capability layer. `role_type` → `roles.slug`, `capability_id` → `capabilities.id`. `scope`-partitioned like ships |
| `capabilities` | Capability layer of the three-layer schema: `capability_tags`, `tools`, `mcp_provider`. Agents bind one via `agent_blueprints.capability_id` |
| `ship_slots` | Catalog crew-slot defs per spaceship blueprint: `slot_position` (1-indexed), `role_type`, `default_agent_id`, `min_class`, per-slot `rarity` override |
| `user_ship_slots` | Per-user crew assignments (SSOT via `ShipSlots`): `user_spaceship_id`, `slot_position` (1-indexed), `user_agent_id` |
| `roles` | Role vocabulary (17 rows) backing the `Roles` lib; `required_capability_tags` drives mission dispatch role→capability match |
| `marketplace_listings` | Community blueprint listings — `blueprint_id` points at an `agent_blueprints`/`spaceship_blueprints` row, with ratings/downloads/publish state |
| `marketplace_reviews` | Per-user ratings + comments on marketplace listings |
| `shared_blueprints` | Blueprint sharing via links (8-char codes, 30-day expiry) |
| `profiles` | Public user profile data (extends auth.users) |
| `user_agents` | Activated agent instances per user |
| `user_spaceships` | Activated spaceship instances per user |
| `user_shared_agents` | Agent sharing between users |
| `mission_runs` | Mission execution instances. Renamed from `tasks` 2026-04-24. `spaceship_id` NOT NULL; status CHECK: queued / running / review / completed / failed / cancelled. |
| `missions` | Mission templates. `spaceship_id` NOT NULL (renamed from `captain_id` 2026-04-24). |
| `ship_log` | Agent conversation history per spaceship (FK to `mission_runs.id` for ship-less runs) |
| `mcp_connections` | MCP server connections with OAuth tokens |
| `integrations` | OAuth/API integrations (Gmail, Calendar, Drive, and the remote-MCP providers) |
| `token_balances` | Per-user token balance — the live credit system. `pools` JSONB `{ [pool]: { allowance, used, purchased } }` mirrors `TokenConfig`; written by `nice-ai` (debits) + `stripe-webhook` (grants/top-ups/refunds) |
| `token_transactions` | Token-credit ledger — `type` (debit/usage/subscription_grant/topup/refund), `amount`, `balance_after`, `model`, `pool`. The sole purchase/grant/refund record (wallet + cost purchase panels read it) |
| `notifications` | System notifications |
| `error_log` | Client-side error reporting |
| `vault_secrets` | Encrypted credential storage |
| `fuel_usage` | Per-LLM-call usage **telemetry** (free + paid), NOT a credit system: `model`, `input_tokens`/`output_tokens`, `fuel_cost` (provider COGS in USD, `numeric`), `agent_id`, `spaceship_id`. Written by `nice-ai` per call; read by the Cost Tracker + Operations analytics |
| `subscriptions` | Stripe subscription state: `plan`, `status`, period, `addons[]` |
| `stripe_events` | Stripe webhook event log (idempotency / replay guard) |
| `personas` | Persona Engine — per-theme persona definitions (hard/soft rules) |
| `persona_judgments` | Persona Engine — Tier 3 judge verdicts on agent replies |
| `plugins` | Plugin catalog |
| `plugin_installs` | Per-user plugin installations |
| `referrals` | Referral tracking: `referrer_id`/`referred_id`, `bonus_fuel_sent` |
| `newsletter_subscribers` | Marketing newsletter signups |
| `station_invites` | Invites to a station (workspace) by email |
| `team_invites` | Team-member invites by email |
| `community_reports` | User reports on community/marketplace content (moderation input) |
| `audit_log` | Server-side audit events (`type`, `description`, `metadata` per user) |

> **`fuel_*` vs `token_*`:** there is ONE credit system — the **token** model (`token_balances` + `token_transactions`), per the "Token Credit System" section below. `fuel_usage` is NOT a credit system; it is per-call usage **telemetry** (one row per LLM call, written by `nice-ai`) feeding the Cost Tracker + Operations analytics. Do NOT re-add the dropped credit-imposters `fuel_purchases`, `fuel_transactions`, or `profiles.fuel_balance`.

## Mission Ontology (SSOT)
Locked 2026-04-23 after the mission/workflow audit. Four primitives, no overlap. Every new feature in this space MUST fit this model; if it doesn't, revise the ontology explicitly — don't smuggle a fifth primitive.

**Spaceship** — Orchestrator + crew. The worker pool for one Mission. No Mission exists without a Ship; no "solo agent" execution path.
- Template: `spaceship_blueprints` (+ `ship_slots` for crew)
- Instance: `user_spaceships` (+ `user_ship_slots`)

**Mission** — Reusable template: *which Ship runs what plan, on what schedule, toward what outcome.* Templates only — not runs.
- Table: `missions`
- Key cols: `spaceship_id` (NOT NULL), `plan` (Workflow JSONB), `schedule` (cron JSONB, nullable), `outcome_spec`, `state`

**Workflow** — The DAG of steps a Mission executes. Always present; single-agent missions are 1-node workflows. Not a standalone primitive — lives inside a Mission.
- Stored inline as `missions.plan` JSONB
- Node types: `agent`, `approval_gate`, `pipeline`, `parallel`, `quality_loop`, `triage`, `condition`, `branch`, `loop`, `delay`, `webhook`, `notify`, `output`, `command` (dispatches a registered command-bus command via `ToolRegistry.execute`; `config.params` with `{{input}}` upstream binding)
- Executed by `WorkflowEngine` (sole executor)

**Run** — One execution instance of a Mission. Owns the lifecycle state machine.
- Table: `mission_runs`
- State machine: `queued → running → review → completed | failed | cancelled`
- Approval: `draft → approved | rejected`
- Key cols: `mission_id` (FK, NOT NULL), `spaceship_id` (FK, mirror for filtering), `plan_snapshot` (frozen at run time), `node_results`

**Schedule** — Cron trigger that creates Runs server-side.
- Stored as `missions.schedule` JSONB: `{ cron, tz, enabled }` — standard 5-field cron expression + IANA timezone
- Fired by the `tick_mission_schedules` pg_cron job (runs every minute); dedup floor stored in `missions.last_scheduled_run_at`
- No client-side scheduling — localStorage `MissionScheduler` is deleted

### Invariants (about Runs and Missions that exist)
- Every Run has a Mission (`mission_id` NOT NULL).
- Every Mission has a Spaceship (`spaceship_id` NOT NULL). The onboarding flow must ensure a Ship exists before any prompt that creates a Run.
- Every Mission has a Workflow (`plan` NOT NULL, minimum 1 node).
- `AgentExecutor` is the sole ReAct loop; invoked by `WorkflowEngine` for `agent` nodes.
- `MissionRouter` is deleted. Its delegation patterns (pipeline, parallel, quality-loop, triage, hierarchy) are WorkflowEngine node types.

### Chat surface tiers — which chats create Runs
NICE has three chat surfaces. Two intentionally bypass the Run primitive; one is full mission-grade. This is the current shape, not drift — the simpler patterns are correct for ephemeral surfaces and the ontology accommodates the split.

| Surface | Code path | Creates Run? | Lifecycle |
|---|---|---|---|
| **Mission-grade chat** (ship-level) | [prompt-panel.js:725](app/js/views/prompt-panel.js:725) → `MissionRunner.run` | ✅ | Full Run state machine, audit, cancel, analytics |
| **Agent-with-tools chat** | [prompt-panel.js:2119](app/js/views/prompt-panel.js:2119) → `AgentExecutor.converse` | ❌ | Request-response, `ship_log` persistence only |
| **Top-level NICE chat** | [prompt-panel.js:1909](app/js/views/prompt-panel.js:1909) → `_callDirectLLM` | ❌ | Request-response, no persistence beyond message history |

**Rationale for the split:** casual chat surfaces are latency-sensitive and ephemeral. Forcing a `mission_runs` INSERT before each LLM call adds round-trip latency and bloats the table with throwaway rows. Audit, cancel, and analytics features that depend on Runs apply only to mission-grade chat today, and that's currently fine — there's no user demand for cancel/audit/analytics on casual chat.

**Future direction (when audit/analytics demand surfaces):** consolidate by adding server-side bookkeeping in `nice-ai` — get-or-create a singleton Mission per `(user_id, spaceship_id, agent_id)` and INSERT a `mission_runs` row per reply. Keeps the client surface unchanged, centralises the bookkeeping in one place that already authenticates the user and writes to Supabase. Not implemented today.

**Don't add a fifth chat surface without revising this table.** If a new path needs Run-level features, route it through `MissionRunner`. If it doesn't, document it here as a casual surface with rationale.

## XP Progression System (SSOT: `app/js/lib/gamification.js`)
| Class | Slots unlocked | Max Rarity | Rank | XP | Note |
|-------|----------------|------------|------|-----|------|
| 1 | min_class ≤ class-1 | Common    | Ensign     | 0    | default |
| 2 | ≤ class-2           | Rare      | Lieutenant | 25,000  | |
| 3 | ≤ class-3           | Epic      | Commander  | 100,000 | |
| 4 | ≤ class-4 (all)     | Legendary | Captain    | 200,000 | |
| 5 | all (instant)       | Legendary | Pro        | —    | subscription-granted |

- **Crew capacity is rank/min_class-gated, not subscription-capped.** A spaceship's `crew_roles` define up to 12 slots; each slot carries a `min_class` and unlocks when the user reaches that class, enforced at activation by `ShipSetupWizard` via `BlueprintUtils.getSlotTemplate` (the real per-ship authority). `Gamification.getMaxSlots()` returns the 12-slot ceiling, NOT a per-tier cap; the old "Free 6 / Pro 12" slot cap is dropped. Pro (class-5) unlocks every slot regardless of rank.

- **Mythic is milestone-only**, never directly granted by class or subscription. Even subscribers earn it. The primary unlock milestone is reaching Admiral rank (1.5M XP); Fleet Admiral inherits Mythic access.
- **Ship rarity tier model** (locked 2026-05-26): Each tier has a distinct *voice* and *purpose*. Apply this gate before assigning a rarity to any new ship.
  - **Common + Rare**: real-business starters. Reachable from day one so users can immediately run actual businesses. Single-operator (Common) and small-team (Rare) verticals. Examples: Galley, Salon, Studio, Gym (Common); Loft, Practice, Brokerage, Chambers (Rare).
  - **Epic**: real-world company examples (NVIDIA, SpaceX, Apple, Amazon, etc.) plus the multi-line **Founder's Office** archetype. The "learn from the best" tier. Reached at Commander rank (100K XP).
  - **Legendary**: sci-fi IP for marketing and aspiration (Enterprise, Serenity, Galactica, etc.). Not a real-business utility tier. Reached at Captain rank (200K XP) or instantly via Pro subscription. Crew can be bespoke or umbrella reskins; characters are NOT required to be ship-exclusive.
  - **Mythic**: apex sci-fi IP. Qualifies only if it (a) is apex-tier — meant to feel earned through real XP grind to Admiral rank (1.5M XP), (b) ships **bespoke crew** with their own `agent_blueprints` rows, voices, LLMs, and rarities — no umbrella reskins, and (c) tags crew with `<slug>-exclusive` so each member is filtered out of every other ship's slot dropdown. Reference implementations: The Matrix, The Heart of Gold.
- **Crew rarity rules** (locked 2026-06-01): apply to the catalog crew of every **Legendary** and **Epic** ship.
  - **Floor**: no Common crew. Rare is the lowest crew rarity on both tiers. Common/Rare business ships are exempt; their umbrella crew stay Common.
  - **Legendary marquee**: every Legendary ship has at least 3 Legendary crew, the captain plus two marquee mains (e.g. Enterprise-A: Kirk / Spock / Scotty; Enterprise-D: Picard / Riker / Data). Remaining crew span Epic and Rare: Epic covers the bespoke secondary mains plus two standout supporting characters per ship; the rest of the umbrella supporting cast is Rare. Target shape ≈ 3 Legendary / 4–5 Epic / 4–5 Rare.
  - **Epic spread**: each Epic company ship is one Epic lead plus its senior operating circle at Epic (COO / CFO / CSO, or the Founder's Office equivalents), the rest of the C-suite Rare. Shape ≈ 4 Epic / 8 Rare.
  - **Mechanism**: a per-slot `ship_slots.rarity` override; the client reads `slot.rarity ?? agent.rarity`. Needed because most Common crew are backed by **shared umbrella agents** reused across the business ships, so their rarity can't be raised on the agent itself. Bespoke crew carry rarity on their own `agent_blueprints` row, so marquee promotions edit the agent directly.
- **Fleet Admiral (2.5M XP)** unlocks Mythic + 1 year of NICE Pro free.
- Pro subscription grants Class 5: every crew slot unlocked regardless of rank, Legendary cap, instant. **Pro's tangible capacity perk is running more than one active spaceship at once (Free = 1 active spaceship).**
- All cards visible to browse; activation gated by XP rank
- Custom blueprints start Common, evolve through usage milestones
- Owned ships always load regardless of current rank; rarity gate only blocks NEW catalog activations

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
│   ├── index.html          # SPA shell (script tags in dependency order)
│   ├── manifest.json       # PWA manifest
│   ├── sw.js               # Service Worker (version CI-auto-stamped; offline, periodic sync, push)
│   ├── css/
│   │   └── app.css         # NICE component styles
│   └── js/
│       ├── nice.js         # Main orchestrator (init, auth, routing, error handling)
│       ├── lib/            # Shared IIFE modules
│       ├── views/          # View modules (one per route)
│       └── __tests__/      # Vitest test files
├── supabase/
│   └── migrations/         # DB migrations (edge function source is proprietary, not in repo)
├── www/                    # Marketing site (nicespaceship.com)
├── e2e/
│   └── smoke.spec.js       # Playwright E2E smoke suite
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
| HAL-9000 | Sci-fi red/dark HUD | Built-in |
| The Grid | Electric blue TRON grid | Built-in |
| The Matrix | Digital rain green, terminal | Built-in |
| LCARS | Star Trek modular, pastels | Built-in |
| J.A.R.V.I.S. | Holographic blue HUD, arc reactor | Built-in |
| Cyberpunk | Neon pink/cyan, dark | Built-in |
| RX-78-2 | Gundam blue/red military | Built-in |
| 16-BIT | Retro pixel art, gold/navy | Built-in |
| The Office | Light/warm corporate, real-world terminology | Built-in |
| The Office (dark) | Dark variant of The Office | Custom |

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

## Typography System (SSOT: `:root` in `app/css/app.css` + `public/css/theme.css`)

**Rule of thumb:** if you're about to write `font-size:`, `text-transform:`, `letter-spacing:`, or `font-weight:` with a raw value, stop — use a token. New raw values are bugs, not features.

### Type scale (minor third, 1.2×)
| Token | Size | Use for |
|-------|------|---------|
| `--text-3xs` | 0.5rem / 8px | Dense chrome micro only (stat label, count badge); not prose |
| `--text-2xs` | 0.625rem / 10px | Dense chrome only (meta, type line, role/scope chip); not prose |
| `--text-xs` | 0.6875rem / 11px | Overline, caption, meta, stat chip |
| `--text-sm` | 0.8125rem / 13px | Secondary UI chrome, sidebar labels, buttons |
| `--text-base` | 0.9375rem / 15px | Body default, form inputs, list items |
| `--text-md` | 1.0625rem / 17px | Lead paragraph, emphasized body |
| `--text-lg` | 1.25rem / 20px | Section title, card title |
| `--text-xl` | 1.5rem / 24px | Page title |
| `--text-2xl` | 2rem / 32px | Hero, in-app |
| `--text-3xl` | `clamp(2.25rem, 4vw, 3rem)` | Marketing display only |

**Micro-chrome tier (`--text-2xs` / `--text-3xs`):** dense UI chrome only: stat labels, count/notification badges, role/scope/type chips, timestamps, overlines. **Not for prose;** prose still floors at `--text-xs` (11px). These tokens ratify the ~92 sub-11px values the app already shipped (the original "11px floor for everything, sub-11px only in cards" stance was never honored in non-card chrome). In review, a sub-`--text-xs` literal outside a card selector, this micro tier, or a glyph/icon is still a bug. Labels already below the 8px `--text-3xs` floor stay raw (the schematic diagram cluster `.sch-slot-*` / `.schematic-*` and `.ship-slot-max`); you cannot tokenize below the floor without growing them.

### Role tokens
- **Weights:** `--fw-regular` (400), `--fw-medium` (600), `--fw-bold` (700). Drop 500 and 800.
- **Line heights:** `--lh-tight` (1.15, display), `--lh-snug` (1.35, titles/buttons), `--lh-base` (1.55, body).
- **Tracking:** `--tracking-display` (-0.01em, hero), `--tracking-normal` (0), `--tracking-caps` (0.08em, tight chrome caps). Marketing-display eyebrow scale (`theme.css` only): `--tracking-caps-wide` (0.12em, standard eyebrows + telemetry labels), `--tracking-caps-wider` (0.2em, display eyebrows: section labels, hero eyebrows, footer headings, wordmarks). App chrome uses `--tracking-caps`; the wide tiers are for the marketing surface. Wordmark lockup tracking (`site.css` only): `--tracking-wordmark` (0.4em) is the canonical NICE SPACESHIP lockup spacing (nav, footer, pricing eyebrow). The in-app `.app-brand-text` ("NICE") is intentionally tighter at `--tracking-caps` (0.08em), a separate brand treatment.
- **Font families (theme-driven):** `--font-h` (display/titles), `--font-b` (body/UI), `--font-m` (monospace, code/telemetry only). `--font-brand` is the brand wordmark.

### Case rules (follow modern SaaS — Linear/Stripe/Notion/Figma)
- **Sentence case** — default for buttons, labels, body, empty states, nav items, form labels, links. "Create spaceship", not "Create Spaceship" or "CREATE SPACESHIP".
- **ALL CAPS (`text-transform: uppercase` + `--tracking-caps`)** — reserved for the **overline** role only: eyebrow labels, stat chips, badges. Requires `--text-xs` and `--fw-bold` or `--fw-medium`. Never use on anything ≥ `--text-base`.
- **Title Case** — page titles, product/feature names, proper nouns only ("NICE SPACESHIP", "Bridge", "Captain's Log", "Gemini 2.5 Flash"). Do NOT title-case arbitrary headings.
- **Banned:** `text-transform: capitalize`. Produces "An Agent Of The Fleet" which no style guide blesses. Fix the source string instead.

### Font families per theme
- **Maximum 2 families per theme** — one display (`--font-h`), one body (`--font-b`). Mono only where genuinely mono (code, terminal, telemetry). Cap at 3 total.
- Per-theme differentiation comes from the **display** font, not from stacking extra weights or sizes. Body should stay readable in every theme.

### How to apply a token
```css
/* Correct */
.blueprint-tile-title { font-size: var(--text-lg); font-weight: var(--fw-bold); line-height: var(--lh-snug); }
.eyebrow        { font-size: var(--text-xs); text-transform: uppercase; letter-spacing: var(--tracking-caps); font-weight: var(--fw-bold); }

/* Wrong — raw values */
.blueprint-tile-title { font-size: 1.2rem; font-weight: 700; }
.eyebrow        { font-size: .65rem; text-transform: uppercase; letter-spacing: .1em; }
```

### Card exemption (visual artifacts, not prose)
`.blueprint-card`, `.blueprint-tile`, `.agent-card`, `.spaceship-card` and their compact/mini/grid variants are **visual artifacts** (TCG-style collectibles), not prose. They use a card-scoped mini-scale declared at `:root` alongside the prose scale. The prose `--text-xs` (11px) floor **does not apply**.

**Card tokens (6):**
- `--card-text-name` 1.1rem (~17.6px) — primary card title
- `--card-text-name-sm` 0.875rem (14px) — secondary card title (tile, agent, ship, compact)
- `--card-text-stat` 0.875rem (14px) — stat value
- `--card-text-body` 0.75rem (12px) — flavor, description, capability chip
- `--card-text-meta` 0.625rem (10px) — subtitle, type line, rarity, role, category
- `--card-text-micro` 0.5rem (8px) — marquee, stat label, footer serial, mini badge — **FLOOR**

**Rules:**
- Use card tokens **only inside card selectors** (`.blueprint-card*`, `.blueprint-tile*`, `.agent-card*`, `.spaceship-card*`). Never use them for prose, sidebars, modals, forms.
- Never introduce raw card font-sizes — use the token. In review, if you see a sub-`--text-xs` literal *outside* a card selector, flag it.
- Floor is **0.5rem (8px)**. Do not add values below it. If a card element doesn't fit at micro, shrink the element or the container — don't shrink the type.
- Themes may change `font-family`, `color`, `border`, `background`, `glow/shadow` on cards. Themes must **not** change `font-size`, `font-weight`, `letter-spacing`, or `text-transform`.
- `text-transform: capitalize` is banned on cards same as prose — fix source strings.

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

### Lib Modules (`app/js/lib/`) — 64 modules
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
| `AttachmentUtils` | `attachment-utils.js` | SSOT for prompt-panel attachment classification + size caps + fallback rules (unit-testable without the full panel) |
| `MissionRunner` | `mission-runner.js` | Long-running mission lifecycle management |
| `ShipLog` | `ship-log.js` | Agent conversation persistence to Supabase |
| `ShipBehaviors` | `ship-behaviors.js` | Spaceship behavior definitions |
| `ShipTemplates` | `ship-templates.js` | Pre-built spaceship templates |
| `LLMConfig` | `llm-config.js` | Model selection from enabled_models state |
| `ModelIntel` | `model-intel.js` | Learns optimal models from mission history |
| `Blueprints` | `blueprints.js` | Blueprint catalog with Supabase sync + sharing |
| `BlueprintMarkdown` | `blueprint-markdown.js` | Markdown rendering for blueprint descriptions |
| `CardRenderer` | `card-renderer.js` | Unified blueprint card template renderer |
| `CrewDesigner` | `crew-designer.js` | Describe → Design → Deploy crew builder |
| `CrewGenerator` | `crew-generator.js` | AI crew generation from business description |
| `CommunityPublish` | `community-publish.js` | Community publish/unpublish modal + submission state wiring shared by agent + spaceship detail views |
| `QualityGate` | `quality-gate.js` | Blueprint quality validation |
| `BrowserTools` | `browser-tools.js` | Agent web browsing via browser-proxy edge function |
| `MediaTools` | `media-tools.js` | Image/video generation tools for agents |
| `ContentQueue` | `content-queue.js` | Social media content queue |
| `VirtualFS` | `virtual-fs.js` | Virtual file system for agent file operations |
| `Skin` | `skin.js` | Skin system (CSS variable overrides) |
| `Stacks` | `stacks.js` | Curated LLM bundle definitions for Stack Picker |
| `StripeConfig` | `stripe-config.js` | SSOT for Stripe product/price/payment-link IDs |
| `TokenConfig` | `token-config.js` | SSOT for token pool definitions and pricing |
| `Onboarding` | `onboarding.js` | Onboarding funnel analytics (6 instrumented events) |
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
| `CoreReactor` | `core-reactor.js` | Centerpiece reactor mount + state machine + audio-analyser pipeline; every theme registers its own core markup against it. Visibility gated via `setVisible(bool)` (toggles `html.reactor-visible`); Router default-hides on every route change, views opt in on render (Home / Schematic / SpaceshipDetail) |
| `CoreVoice` | `core-voice.js` | Theme-pluggable TTS router — resolves per-theme voice config and calls `nice-tts`, drives `CoreReactor` during playback |
| `DefaultCore` | `default-core.js` | Fallback reactor SVG (concentric pulsing rings) for themes without a custom core markup |
| `JarvisHUD` | `jarvis-hud.js` | SSOT for JARVIS arc reactor + HUD ring markup, shared by the prompt panel and Schematic center column |
| `HalCore` | `hal-core.js` | HAL-9000 camera-eye centerpiece reactor — mountable core markup, sibling of `DefaultCore`/`JarvisHUD` |
| `AgentActivity` | `agent-activity.js` | In-memory pub/sub for "is this agent working?" signals — drives the schematic status node (idle/recent/active) |
| `LLMActivity` | `llm-activity.js` | In-memory pub/sub for "an LLM call is in flight" signals. Handle-pairing only (no polled flag) — drives the elapsed-seconds chip above the prompt panel |
| `CrewMatcher` | `crew-matcher.js` | Resolves a spaceship's `crew_roles` + `crew_overrides` spec into a `slot_assignments` map at activation |
| `ShipSlots` | `ship-slots.js` | SSOT for slot assignments via `public.user_ship_slots` after Phase C.1 (`fetchForShips` / `setForShip` replace-all / `setSlot` upsert / `clearSlot` / `deleteForShip`) |
| `ModelCatalog` | `model-catalog.js` | SSOT for the AI-model presentation layer — display name, provider, speed/quality bars, marketing copy |
| `Terminology` | `terminology.js` | SSOT for theme-aware noun labels — per-theme overrides for `mission`/`agent`/`spaceship`/`crew`/`captain` |
| `DocsContent` | `docs-content.js` | SSOT for in-app Documentation hub content (consumed by `docs.js`) |
| `Roles` | `roles.js` | SSOT for the role vocabulary backed by `public.roles` (17 rows). `Roles.getRequiredTags(slug)` drives mission dispatch's role→capability-tags match; SEED constant mirrors the seed migration for offline/test/early-boot |

### View Modules (`app/js/views/`) — 25 views
| View | File | Route(s) | Title |
|------|------|----------|-------|
| `HomeView` | `home.js` | `#/` | NICE SPACESHIP |
| `BlueprintsView` | `blueprints.js` | `#/bridge` | Bridge (tabs: Schematic / Blueprints / Missions / Outbox / Operations / Log / Documentation / TRON; Blueprints sub-tabs: Spaceships / Agents / Active / Workshop. Spaceships + Agents are pure catalogs; community blueprints mix into the same browse, discriminated by a COMMUNITY badge and a Source filter pill All/Official/Community. Active shows user's deployed ships + agents in two labeled sections. Workshop is custom builds + imports — only surface where "+ Create" / "Import Blueprint" buttons appear.) |
| `DocsView` | `docs.js` | `#/bridge?tab=documentation` (legacy `#/docs` redirects) | Documentation |
| `TronView` | `tron.js` | `#/tron` | Tron |
| `AgentDetailView` | `agents.js` | `#/bridge/agents/:id` | Agent Detail |
| `AgentBuilderView` | `agent-builder.js` | `#/bridge/agents/new` | Agent Builder |
| `SpaceshipDetailView` | `spaceships.js` | `#/bridge/spaceships/:id` | Ship Detail |
| `SpaceshipBuilderView` | `spaceship-builder.js` | `#/bridge/spaceships/new` | Ship Builder |
| `SchematicView` | `schematic.js` | (embedded in BlueprintsView) | Schematic |
| `MissionsView` | `missions.js` | (embedded in BlueprintsView) | Missions |
| `MissionComposerView` | `mission-composer.js` | `#/missions/new` | Mission Composer (prompt-driven authoring; emits to `missions` table + enqueues a `mission_runs` row) |
| `AnalyticsView` | `analytics.js` | (embedded in BlueprintsView) | Operations |
| `AuditLogView` | `audit-log.js` | (embedded in BlueprintsView; serves Bridge "Log" tab) | Captain's Log |
| `ShipLogView` | `ship-log-view.js` | (embedded in SchematicView) | Ship's Log |
| `SecurityView` | `security.js` | `#/security` | Security |
| `IntegrationsView` | `integrations.js` | (tab in SecurityView) | Integrations |
| `VaultView` | `vault.js` | (section in IntegrationsView) | AI Models |
| `WalletView` | `wallet.js` | (tab in SecurityView) | Wallet |
| `SettingsView` | `settings.js` | `#/settings` | Settings |
| `ProfileView` | `profile.js` | `#/profile` | Profile |
| `CostView` | `cost.js` | (embedded) | Cost Tracker |
| `AlertsView` | `alerts.js` | (embedded) | Alerts |
| `ThemeCreatorView` | `theme-creator.js` | `#/theme-editor` | Theme Editor |
| `ModerationView` | `moderation.js` | `#/moderation` | Moderation — admin-only queue for `pending_review` community submissions; gated server-side via `admin_*` RPCs and client-side by `State.user.is_admin` |
| `PromptPanel` | `prompt-panel.js` | (global overlay) | Prompt Panel — multimodal attachments (images/PDFs/audio/video/text) via `+` button or drag-and-drop, up to 4 files/message, soft-fallback to Gemini Flash if current model lacks the needed capability |

### Security Page Tabs
| Tab | Content |
|-----|---------|
| Security | Threats, compliance checklist, access policies |
| Integrations | MCP connections (Google, Slack, etc.) + AI model selector |
| Wallet | Token balance, buy tokens (Stripe), transaction history |

### AI Model System
Models defined in `VaultView.MODEL_CATALOG`. Users toggle models on/off. State key: `enabled_models`.

Attachment capability flags (`vision` / `pdf` / `audio` / `video`) live on each `MODEL_CATALOG` entry and drive prompt-panel gating. Text/code attachments are inlined as fenced blocks in the text part and need no capability flag.

| Model | Provider | Tier | vision | pdf | audio | video | Notes |
|-------|----------|------|--------|-----|-------|-------|-------|
| Gemini 2.5 Flash | Google | Free | ✓ | ✓ | ✓ | ✓ | Default for all users; attachment fallback target |
| Gemini 2.5 Pro | Google | Premium | ✓ | ✓ | ✓ | ✓ | Complex tasks |
| Claude 4.6 Sonnet | Anthropic | Premium | ✓ | ✓ | ✗ | ✗ | Best reasoning |
| Claude 4.7 Opus | Anthropic | Premium | ✓ | ✓ | ✗ | ✗ | Most capable |
| GPT-5 Mini | OpenAI | Premium | ✓ | ✗ | ✗ | ✗ | Fast + cheap |
| GPT-5.4 Pro | OpenAI | Premium | ✓ | ✗ | ✗ | ✗ | Flagship |
| o3 | OpenAI | Premium | ✓ | ✗ | ✗ | ✗ | Reasoning |
| Grok | xAI | Premium | ✗ | ✗ | ✗ | ✗ | Awaiting smoke-test |
| Llama (Groq) | Meta | Standard | ✗ | ✗ | ✗ | ✗ | Awaiting smoke-test |
| Codex | OpenAI | Premium | ✗ | ✗ | ✗ | ✗ | Awaiting smoke-test |

Backwards-compatible `LLM_PROVIDERS` and `LLM_MODELS` globals derived from `MODEL_CATALOG` in `agent-builder.js`.

### Token Credit System
- Three independent pools: **Standard**, **Claude**, **Premium** — each tied to its own subscription
- Gemini 2.5 Flash is free and unlimited for everyone (no pool)
- NICE Pro ($9.99/mo) → 1,000 Standard tokens/month + non-flagship models
- Claude Add-on (+$9.99/mo) → 500 Claude tokens/month + Sonnet 4.6 / Opus 4.6
- Premium Add-on (+$9.99/mo) → 500 Premium tokens/month + GPT-5.4 Pro / Codex / o3 / Gemini 3.1 Pro
- Top-ups (Pro only): Boost ($29.99) and Max ($49.99) packs per pool, never expire
- `StripeConfig` ([app/js/lib/stripe-config.js](app/js/lib/stripe-config.js)) is SSOT for all product/price/payment-link IDs
- `nice-ai` checks the matching pool before premium calls (402 if insufficient)
- Usage tracked per request, fire-and-forget: a pool debit (`debit_pool`) for paid models, plus a `fuel_usage` telemetry row for every call (free + paid) that feeds the Cost Tracker + Operations analytics

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

### Unit Tests (Vitest)
```bash
npm test          # Run all tests
npm run test:watch  # Watch mode
```
Test files: `app/js/__tests__/**/*.test.js` + `tools/**/*.test.js` — 49 files, ~1241 tests. Counts drift with each feature — verify with `npm test`.

Coverage areas:
- **Core infra**: `state`, `router`, `supabase`, `keyboard`, `notify`, `command-palette`, `audit-log`, `data-io`
- **Blueprints + community**: `blueprints`, `blueprints-download`, `blueprints-marketplace`, `blueprints-moderation`, `blueprints-publish`, `blueprints-ship-hoist`, `community-publish`, `blueprint-markdown`, `blueprint-utils-humanize`
- **Agents + missions**: `agent-executor`, `mission-runner`, `ship-log`, `tool-registry`, `virtual-fs`, `prompt-builder`, `workflow-engine` (triage / pipeline / parallel / quality_loop replace the deleted MissionRouter)
- **Models + billing**: `llm-config`, `stacks`, `stripe-config`, `subscription`, `token-config`
- **Views**: `home-view`, `missions-view`
- **Gamification + onboarding**: `gamification`, `onboarding`
- **Prompt panel**: `attachment-utils`
- **Other**: `content-queue`

### E2E Tests (Playwright) — `e2e/smoke.spec.js`, 22 tests
```bash
npm run test:e2e
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
GitHub Actions (`.github/workflows/ci.yml`): Node 20 → `npm ci` → security audit → SW version stamp → verify build → vitest → playwright → bundle size check

**CI is strict** — both unit and E2E failures block merges.

## Google Workspace Integration
- OAuth flow for any Google account (Gmail, Workspace, any domain)
- `google-oauth` edge function: `/authorize` → Google consent → `/callback` → stores tokens
- MCP servers: gmail-mcp (read + send/draft/reply), calendar-mcp (read + create/update/delete events), drive-mcp (read + create/update/upload files)
- `mcp-gateway` auto-refreshes expired OAuth tokens before tool calls
- **Requested scopes** (hardcoded in [auth-modal.js](app/js/lib/auth-modal.js:208)):
  - `https://www.googleapis.com/auth/gmail.modify` — full mailbox access except delete
  - `https://www.googleapis.com/auth/calendar` — full calendar access
  - `https://www.googleapis.com/auth/drive.file` — files created or opened by the app
- Write tools are gated by `ShipBehaviors.approvalMode` — in `review` mode, any tool whose name matches the `SIDE_EFFECT_PATTERNS` list in `agent-executor.js` triggers an inline approval prompt before execution
- Domain-wide delegation fallback for @nicespaceship.com internal users

## Single Source of Truth (SSOT)
Before adding constants, arrays, or configuration, check if a source already exists:

| Data | SSOT Location | Notes |
|------|--------------|-------|
| Blueprint data | `Blueprints` + Supabase `spaceship_blueprints` / `agent_blueprints` / `capabilities` | Never hardcode blueprint lists |
| Crew slots, rarity, ship classes | `BlueprintUtils` (`blueprint-utils.js`) | Loaded before card-renderer |
| localStorage keys | `Utils.KEYS` (64 constants) | Never use raw string keys |
| State keys | `State.KEYS` (10 constants) | Never use raw string keys |
| Theme definitions | `THEMES` array in `nice.js` → `Theme.BUILTIN` | No separate theme list |
| Ranks & XP | `Gamification.RANKS` / `XP_ACTIONS` | Never duplicate rank data |
| Card rendering | `CardRenderer.render()` | ONE renderer for all card types |
| Model catalog | `VaultView.MODEL_CATALOG` | `LLM_PROVIDERS`/`LLM_MODELS` derived from it |
| Attachment gating | `MODEL_CATALOG.vision` / `pdf` / `audio` / `video` | Per-model capability flags consumed by prompt-panel soft-fallback and model-change guard |
| Rarity colors | `BlueprintUtils.RARITY_COLORS` | Used by card-renderer and all views |
| Guest-banner height | `--guest-banner-height` CSS var on `<html>` | `nice.js` measures the banner on mount via `ResizeObserver` and writes the var; sidebar / mobile-bar / hud-panel / app-main consume via `var(--guest-banner-height, 0px)`. No magic pixel numbers |

## Tool Preferences
- **CLI first.** Always prefer CLI tools over browser/GUI for GitHub (`gh`), Supabase (`npx supabase`), npm, and git operations. CLI is faster, scriptable, and doesn't depend on browser rendering.
- **Supabase CLI**: `npx supabase functions deploy`, `npx supabase secrets set`, `npx supabase db push`
- **GitHub CLI**: `gh pr create`, `gh issue list`, `gh repo view`
- Fall back to browser automation only when CLI doesn't support the operation.

## Coding Guidelines

### PRIORITY: No shortcuts, no hacks, no band-aids.
**Always implement the correct architectural solution.** Never use quick fixes, padding hacks, inline style overrides, or CSS `!important` as workarounds. If a fix requires restructuring HTML or refactoring CSS, do that. If you don't understand the root cause, investigate until you do — don't patch symptoms. Every change must work correctly on **desktop, tablet, AND mobile** — test all three, not just the one you're working on.

**CSS rules:**
- ONE scrolling container per view (`.app-view-content`). Never create nested scrollers with `overflow-x:hidden` (forces `overflow-y:auto`). Use `overflow:visible` on all view wraps.
- Never use `padding`/`margin` hacks to mask layout issues. Fix the actual positioning.
- Never set `position:relative` on elements that need `position:sticky` — it breaks sticky.
- All theme CSS overrides must use opaque backgrounds on sticky elements (no `rgba` transparency).
- Consolidate — never scatter the same selector across multiple `@media` blocks. One source of truth per rule.

**JS rules:**
- Use CSS classes (`.view-no-scroll`, `.hidden`) instead of inline `el.style.overflow`/`el.style.display` whenever possible.
- Guard all variable access before game/module initialization (`if (!_dir) return`).
- Clean up event listeners and DOM state in `destroy()` methods.

### General
- **Read before write.** Never modify a file you haven't read. Understand existing patterns.
- **Prefer editing over creating.** Don't create new files when extending an existing module works.
- **No speculative abstractions.** Three similar lines > premature helper function.
- **No unnecessary comments.** Only explain *why*, never *what*. The code shows what.
- **Escape user content.** Always use `Utils.esc()` before inserting into DOM. No raw `innerHTML` with user data.
- **Test after changes.** Run `npm test` after editing JS. All tests must pass.
- **Mobile-first.** Check changes at 375px. Breakpoints: 480px, 640px, 768px. Always verify desktop + tablet + mobile.
- **Theme-aware.** Use CSS custom properties (`var(--accent)`, `var(--bg)`), never hardcoded colors.
- **SSOT.** Before adding a rule, check if one already exists. Never duplicate selectors across media queries.

## Deployment
- **Platform**: Cloudflare Pages (auto-deploy from `main` branch)
- **Domains**: `nicespaceship.ai` (app), `nicespaceship.com` (community site, deployed from `www/`)
- **Repo**: `github.com/nicespaceship/nice`
- **Supabase**: edge functions deployed via `npx supabase functions deploy` (count drifts — see the Edge Functions table above; source is proprietary, not in repo)
- **Stripe**: 9 live products — NICE Pro + Claude Add-on + Premium Add-on + 6 top-up packs (Standard/Claude/Premium × Boost/Max), all wired via `StripeConfig` SSOT
- **PWA**: Service Worker with offline fallback, periodic sync (12h), push notifications. Version is CI-auto-stamped on every push to main.
- **Build**: `node scripts/build.js` produces a minified bundle (size drifts with each feature)

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
| `XAI_API_KEY` | nice-ai | Grok models (standard pool) |
| `GROQ_API_KEY` | nice-ai | Llama models (standard pool, hosted on Groq) |
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
