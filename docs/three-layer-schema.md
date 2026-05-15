# Three-Layer Blueprint Schema

**Status:** Proposed — design review before any DDL is written.
**Supersedes:** the jsonb-heavy single `blueprints` table (`config`/`stats`/`metadata` blobs + a `kind` discriminator).
**Timing:** the catalog was wiped to 20 capability blueprints in the Phase 1 reset, so this lands on an effectively clean slate — no data migration, no users' custom content to preserve. This is the cheapest this refactor will ever be.

## Why normalized

The single `blueprints` table was right for a small, curated, platform-seeded catalog. It is the wrong backbone for the actual product vision:

- **User-authored content** — users build and program their own agent and spaceship blueprints → unbounded, relational, multi-tenant data, not a curated catalog.
- **Security** — Postgres RLS keyed off real columns (`creator_id`, `visibility`) is airtight and auditable. RLS reasoning about jsonb contents is neither.
- **Uncapped slots** — a spaceship has N agent slots, no 12 cap → a real one-to-many child table, not an unbounded jsonb array.
- **Standalone app** — a future iOS/Windows app syncing clean relational entities is tractable. Syncing implicit-shape blobs is misery.

**Design principle: structure → tables, columns, FKs. Content → jsonb.** Ownership, visibility, relationships, and anything queried / filtered / secured-on are real columns. Prompts, params, and presentation are jsonb.

## The three layers

| Layer | Owns | Table |
|---|---|---|
| **Capability** | a function — MCP tools + how to use them. No persona. | `capabilities` |
| **Agent Blueprint** | "agent programming" — persona + role + which capability it wraps | `agent_blueprints` |
| **Spaceship Blueprint** | orchestrator — workflow + ship voice + N agent slots | `spaceship_blueprints` + `ship_slots` |

Plus a `roles` vocabulary table, and the instance layer (`user_*`) where activated copies live.

## Schema

### `roles` — the role vocabulary (≈15 seed rows)

Fixed, platform-owned vocabulary. Fixes a current gap: the role → required-capability-tags map lives in `mission-runner.js` *code* today; it moves here as *data*.

| Column | Type | Notes |
|---|---|---|
| `slug` | text PK | `captain`, `sales`, `engineering`, `communications`, … |
| `label` | text NOT NULL | display name |
| `tier` | text NOT NULL | `leadership` \| `functional` |
| `authority` | text | `decides` \| `coordinates` \| `executes` \| `advises` |
| `required_capability_tags` | text[] | tags an agent needs to fill this role |
| `responsibilities` | text | short description |
| `sort_order` | int | |
| `created_at`, `updated_at` | timestamptz | |

### `capabilities` — the function layer

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `slug` | text UNIQUE NOT NULL | stable ref — `hubspot`, `github`, `slack` |
| `name`, `description`, `flavor` | text | display text |
| `category`, `rarity` | text | display / filtering |
| `scope` | text NOT NULL DEFAULT `'catalog'` | `catalog` \| `community` |
| `creator_id` | uuid → `auth.users` ON DELETE SET NULL | null for platform/catalog |
| `visibility` | text NOT NULL DEFAULT `'public'` | `public` \| `unlisted` \| `private` |
| `capability_tags` | text[] NOT NULL DEFAULT `'{}'` | queried by dispatch matching |
| `tools` | text[] NOT NULL DEFAULT `'{}'` | MCP tool ids |
| `mcp_provider` | text | which MCP integration; null for tool-less |
| `config` | jsonb NOT NULL DEFAULT `'{}'` | content: `{ system_prompt, llm_defaults }` |
| `card` | jsonb NOT NULL DEFAULT `'{}'` | presentation: `{ serial_key, art, stats, caps[] }` |
| `created_at`, `updated_at` | timestamptz | |

### `agent_blueprints` — the "agent programming"

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `slug` | text UNIQUE NOT NULL | |
| `name`, `description`, `flavor` | text | |
| `category`, `rarity` | text | |
| `scope` | text NOT NULL DEFAULT `'catalog'` | `catalog` \| `community` |
| `creator_id` | uuid → `auth.users` ON DELETE SET NULL | the author (null = platform) |
| `visibility` | text NOT NULL DEFAULT `'public'` | |
| `role_type` | text → `roles(slug)` ON DELETE RESTRICT | the role this agent is built for |
| `capability_id` | uuid → `capabilities(id)` ON DELETE SET NULL | nullable — a Captain / pure-persona agent may wrap none |
| `config` | jsonb NOT NULL DEFAULT `'{}'` | content: `{ system_prompt (persona), llm_engine, temperature, max_steps, memory, eval_criteria }` |
| `card` | jsonb NOT NULL DEFAULT `'{}'` | presentation |
| `created_at`, `updated_at` | timestamptz | |

### `spaceship_blueprints` — the orchestrator

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `slug` | text UNIQUE NOT NULL | |
| `name`, `description`, `flavor` | text | |
| `category`, `rarity` | text | |
| `scope` | text NOT NULL DEFAULT `'catalog'` | |
| `creator_id` | uuid → `auth.users` ON DELETE SET NULL | |
| `visibility` | text NOT NULL DEFAULT `'public'` | |
| `config` | jsonb NOT NULL DEFAULT `'{}'` | content: `{ ship_system_prompt, ship_voice, workflow_patterns[], flow, auto_theme }` |
| `card` | jsonb NOT NULL DEFAULT `'{}'` | presentation |
| `created_at`, `updated_at` | timestamptz | |

No slot-count column — slot count is `COUNT(*)` of `ship_slots`. **Uncapped by construction.**

### `ship_slots` — the uncapped agent slots

The one-to-many that makes slots uncapped *and* clean. Replaces the three overlapping crew representations in the old schema (`config.crew_roles`, `config.crew_overrides`, `metadata.crew`) with a single one.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `spaceship_id` | uuid NOT NULL → `spaceship_blueprints(id)` ON DELETE CASCADE | |
| `slot_index` | int NOT NULL | ordering |
| `role_type` | text NOT NULL → `roles(slug)` ON DELETE RESTRICT | the role this slot is for |
| `default_agent_id` | uuid → `agent_blueprints(id)` ON DELETE SET NULL | prebuilt crew member; null = open slot |
| `label` | text | optional display override |
| `created_at` | timestamptz | |
| | | UNIQUE `(spaceship_id, slot_index)` |

### Instance layer

Activated copies, per user. Mostly carries forward, with FK types corrected and the slot map promoted to a table.

- **`user_agents`** — `blueprint_id` becomes `uuid → agent_blueprints(id) ON DELETE SET NULL` (was loose `text`). Keeps `config` jsonb (the activated copy), `rarity`, `user_id`, `name`, `status`, timestamps.
- **`user_spaceships`** — `blueprint_id` becomes `uuid → spaceship_blueprints(id) ON DELETE SET NULL`. The legacy `slots` jsonb is dropped; `config.slot_assignments` is replaced by:
- **`user_ship_slots`** (new) — instance-layer mirror of `ship_slots`: `id`, `user_spaceship_id → user_spaceships(id) ON DELETE CASCADE`, `slot_index`, `role_type → roles(slug)`, `user_agent_id → user_agents(id) ON DELETE SET NULL`, UNIQUE `(user_spaceship_id, slot_index)`.

## Row-Level Security

Mirrors the established `blueprints` / `user_*` policy pattern exactly.

- **Catalog tables** (`capabilities`, `agent_blueprints`, `spaceship_blueprints`):
  - `SELECT` — `visibility = 'public' OR auth.uid() = creator_id`
  - `INSERT` / `UPDATE` / `DELETE` — `auth.uid() = creator_id`
  - `ALL` — service_role bypass
- **`roles`** — `SELECT` public (fixed vocabulary); writes service_role only.
- **`ship_slots`** — policies via `EXISTS` against the parent `spaceship_blueprints` (a slot is visible/editable iff its parent is), the same cross-check pattern `marketplace_listings` uses against `blueprints`.
- **Instance tables** (`user_agents`, `user_spaceships`) — `ALL` on `auth.uid() = user_id`. `user_ship_slots` — via `EXISTS` against the parent `user_spaceships`.

This is what makes the platform multi-tenant-safe: ownership and visibility are real columns, so the database enforces isolation — a user physically cannot read or reference another user's private blueprint.

## Runtime rewire

The goal is to keep the `Blueprints` module's public API stable so view consumers barely change; the rewire is concentrated behind that API.

- **`Blueprints` module** (`blueprints.js`) — internal load rewired to the new tables (joining `agent_blueprints` ⨝ `capabilities` ⨝ `roles`, and `spaceship_blueprints` ⨝ `ship_slots`). Public API (`getAgent` / `listAgents` / `getCapability` / `listCapabilities` / `getSpaceship` / `listSpaceships` / …) kept stable.
- **`agent-executor.js`** — `capability_id` is now a real FK; tool resolution through the module API is unchanged in shape.
- **`mission-runner.js`** — role → required-capability-tags matching now reads `roles.required_capability_tags` (data) instead of the hardcoded in-file map.
- **`crew-matcher.js`** — matches activated agents against `ship_slots` rows directly.
- **`card-renderer.js`** — reads the consolidated `card` jsonb instead of the scattered `stats` + `metadata.caps` + top-level fields.
- **Activation flow + wizards** — write `user_ship_slots` rows instead of `config.slot_assignments`.

## Invariants the rewire must preserve

From the current consumption map — fields/behaviors a schema change must carry over, not drop:

- **Tool resolution chain** in `agent-executor.js`: explicit tools → `capability_id` → fallback. The "R2 saw 314 tools" fix depends on capability-scoped tools.
- **Dispatch matching** in `mission-runner.js`: role → capability_tags → activated agent.
- **`slot_assignments`** semantics (slot → activated agent) — carried by `user_ship_slots`, both `config.slot_assignments` and legacy `slots.slot_assignments` readers retired.
- **Card fields** `card-renderer.js` needs: name, type, rarity, description/flavor, category/role, stats, caps, activation_count, tags, status.
- **Untouched by this refactor:** themes/skins, TTS (`nice-tts`/`CoreVoice` — per-theme), the Persona Engine (`personas` — per-theme), the MCP gateway / edge functions / OAuth, and `mcp_connections` (OAuth tokens).

## Phasing

Each phase is its own PR(s), independently shippable, gated on review.

- **Phase A — schema + seed.** One migration: create the 6 tables + RLS policies. Seed `roles` (≈15) and re-seed the 20 `capabilities` from `seed/catalog/capability-agents.json`. New tables sit alongside `blueprints`; nothing reads them yet. Zero runtime risk.
- **Phase B — rewire reads.** Point the `Blueprints` module + `agent-executor` / `mission-runner` / `crew-matcher` / `card-renderer` at the new tables. Public API stays stable. After this, the old `blueprints` table is read by nothing.
- **Phase C — instance layer.** Migrate `user_agents` / `user_spaceships` FKs to uuid → the new blueprint tables; introduce `user_ship_slots`; rewire the activation flow + wizards. Folds in the activation-flow bug cluster fixes (duplicate ships, stale `_routeShip`, synthetic-id leak).
- **Phase D — retire `blueprints`.** Drop the old table and its `kind` / `capability_tags` columns once nothing references them.
- **Then the rebuild** — author real-business ships + agents into the finalized schema, and build the user-facing blueprint builders so users can author their own.

## Design decisions & rationale

- **uuid PK + text `slug`** — uuid for internal FK joins and the future standalone-app sync; `slug` for stable human-facing refs and re-seeding. Replaces the old loose text-id scheme.
- **Three separate tables, not one table + `kind`** — capability / agent / spaceship have genuinely different columns and relationships; separate tables let FKs and RLS be precise instead of "it depends on `kind`."
- **`roles` as a table, not a code SSOT** — the one spot that's more normalized than strictly forced. Chosen because it gives `role_type` real FK integrity *and* relocates the role → required-capability-tags map out of `mission-runner.js` code into data, which was a named gap.
- **`card` jsonb** — consolidates the scattered TCG presentation (`stats`, `metadata.caps`, `serial_key`, art) into one content blob. Pure presentation, never queried — correct use of jsonb.
- **No `slot_count` column** — derived from `ship_slots`. Hardcoding a count is what the 12-cap was; not repeating it.
