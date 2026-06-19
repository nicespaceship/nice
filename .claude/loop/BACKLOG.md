# NICE — Build-Loop Backlog (SSOT for the autonomous loop)

> This file is the loop's brain. The `build-cycle` skill reads it each run, picks the
> highest-priority **actionable** item, ships ONE PR for it, then updates this file.
> Humans reprioritize by reordering items. Memory lives here, not in the conversation.

## Flags
- `[READY]` — Claude can take this start-to-finish as a draft PR (no human input needed to *build* it). Pure code: views, CSS, tests, docs, non-carve-out fixes, `config.toml`.
- `[QUEUE]` — Carve-out (migrations / billing / auth). Claude **drafts** the PR; the `block-protected-merge` hook makes merging Ben's. Migrations also need the Supabase MCP for the dry-run, so prefer to work these in an app-open session, not a headless cloud run.
- `[BEN]` — Human-only. Console actions, merges, OAuth verification, key rotation. Claude never does these; it only tracks them.
- `[BLOCKED: reason]` — Not actionable yet. Skip until the reason clears.

## Loop rules (enforced by the `build-cycle` skill)
1. **One PR-sized item per cycle.** Bounded scope, reviewable.
2. **Self-merge the safe class only; carve-outs queue for Ben.** Non-carve-out PRs may be self-merged once **CI is green AND the `build-checker` PASSes** (Q3, 2026-06-18 — Ben spot-checks after the fact). Carve-outs (migrations / billing / auth) stay draft-and-queue for Ben. Merging a non-carve-out PR triggers Cloudflare auto-deploy of main; that is accepted for the safe class. (Supersedes the blanket "Ben merges all" from the 2026-06-16 envelope.)
3. **Maker ≠ checker.** Run the `build-checker` agent on the diff before opening the PR.
4. **CI is the compiler gate.** `npm test` must pass; a red suite means fix-or-abandon, never ship.
5. **No console / deploy / secret / money actions, ever** — those are `[BEN]`.
6. **Pre-launch (until ~2026-06-28): prefer `[READY]` over `[QUEUE]`.** Keep risk low while Ben is heads-down on the console sweep.
7. If nothing is actionable, do a P3 hygiene item; if those are drained too, append a note to `QUESTIONS.md` and stop.

---

## P0 — Launch-critical (tracking only; nearly all `[BEN]`)
- `[BEN]` Merge open PRs [#832](https://github.com/nicespaceship/nice/pull/832)–[#835](https://github.com/nicespaceship/nice/pull/835) (Apple/X removal, subscriptions RLS, signup terms, password-reset UI).
- `[BEN]` Console sweep: rotate `community_review_service_key` (runbook in [[project_launch_readiness_audit]]); disable anonymous sign-ins; Supabase redirect allowlist (`https://nicespaceship.ai/app/**` — unblocks #835); HIBP leaked-password toggle; confirm edge-fn secrets.
- `[BEN]` Fix-3 storage policies via Dashboard → Storage → Policies (not migratable — [[project_storage_rls_dashboard_only]]).
- `[BEN]` Google OAuth verification (CASA, long pole — start now, runs parallel) + Microsoft Entra publisher verification.

## P1 — Launch should-fixes (code)  ·  Phase 0, see [PLAN.md](PLAN.md)
> **Cleared 2026-06-18.** Every Phase 0 code item shipped + merged (#842-849), and the Grok + Llama smoke-test passed (verified live — `fuel_usage` logged the real models). Next code work is **Phase 1** (see [PLAN.md](PLAN.md)); detail in the done log below.

## Phase 1 — Stabilize (code)  ·  in progress, see [PLAN.md](PLAN.md)
> Test coverage for untested load-bearing logic + defensive hardening on the recurring defect classes. Started 2026-06-17. **The named Phase 1 list is complete** (days 1+2), and the listener-leak class is now closed. Only the carve-out billing-race item remains.
- **Day 1 (merged):** ShipSlots tests ([#851](https://github.com/nicespaceship/nice/pull/851)), QualityGate tests ([#852](https://github.com/nicespaceship/nice/pull/852)), Bridge keydown-leak fix ([#853](https://github.com/nicespaceship/nice/pull/853)). **Escaping/XSS audit: CLEAN** (Utils.esc/escAttr/safeUrl holds throughout — no PR). **Realtime/listener audit: done** — 1 genuine leak fixed (#853), 7 findings were false-positive once-at-boot singletons (don't re-audit those: `_subscribeCountUpdates` guard, `PromptPanel.init` single call, mission-composer cleanup).
- **Day 2 (merged):** `views/*` render-test harness + 25 WalletView tests ([#855](https://github.com/nicespaceship/nice/pull/855)); compare-panel + outbox-picker keydown-leak follow-ups, preview-verified ([#856](https://github.com/nicespaceship/nice/pull/856)); 17 PromptPanel app-context tests via the harness ([#857](https://github.com/nicespaceship/nice/pull/857)); QualityGate `maxRetries: 0` footgun fixed with a numeric guard ([#858](https://github.com/nicespaceship/nice/pull/858)).
- **Day 3 (merged, self-merged per Q3):** coverage extended beyond the named list onto untested load-bearing logic — PromptPanel model-capability gate ([#865](https://github.com/nicespaceship/nice/pull/865)), SettingsView account-deletion gate ([#866](https://github.com/nicespaceship/nice/pull/866)), ShipBehaviors token-budget gate ([#867](https://github.com/nicespaceship/nice/pull/867)), Roles dispatch SSOT ([#868](https://github.com/nicespaceship/nice/pull/868)), AgentMemory ([#869](https://github.com/nicespaceship/nice/pull/869)). Suite 1913→1986. **Clean high-value coverage vein now largely drained** — remaining untested surfaces are lower-stakes libs (rate-limiter / offline-queue / model-catalog) or the big god-views (need test seams).
- `[QUEUE]` Billing-race hardening (3rd defect class) — touches carve-out billing files; lower marginal value (the v66 webhook status-race was already fixed). The only remaining Phase 1 defect-class item.
- ✅ **Listener-leak class closed** (swept the other views): `prompt-panel.js` binds once via `init` + removes in `destroy`; `schematic.js` uses `menu._cleanup`; the `spaceships.js:555` "leak" was inside the orphaned `SpaceshipsView`, removed as dead code ([#860](https://github.com/nicespaceship/nice/pull/860)). No live leak remains beyond #853/#856.

## P2 — Post-launch backlog (from the roadmaps)
- `[READY]` Self-service account-deletion UI (DB layer is `ON DELETE CASCADE`; mind the 6 NO-ACTION FKs — verify before wiring).
- `[READY]` Community features groundwork: public profile view, "Powered by NICE" badge (see [[project_community_features]]).
- `[QUEUE]` Persona Engine PR3 (regen decision) — `[BLOCKED: needs n≥30/theme live traffic]`.
- NICE-1 Phase 1 thin-client — `[BLOCKED: legal sign-off on consent default]` ([[project_nice1]]).
- Business-vertical ships — `[BLOCKED: more MCPs + schema refactor]` ([[project_business_vertical_ships]]).
- Per-channel social agents (Reddit first) — `[BLOCKED: per-channel MCPs]`.
- `[BEN]` Public contact email migration `ben@` → `hello@nicespaceship.com` (6-step sweep) + the 6 OAuth-portal redirect-URI updates for `api.nicespaceship.ai`.

## P3 — Hygiene / always-available filler (when P1–P2 are blocked)
- `[READY]` Typography SSOT sweep: hunt raw `font-size`/`letter-spacing`/`font-weight` literals, replace with tokens (CLAUDE.md Typography rules).
- `[READY]` CSS orphan audit (playbook: [[feedback_css_orphan_audit]]) — verify each claim cold before removing.
- `[READY]` Test-coverage gaps for recently shipped modules; doc freshness vs current code.
- `[QUEUE]` RLS advisor WARNs: review `error_log` / `newsletter_subscribers` always-true INSERT + `shared_blueprints` always-true UPDATE; decide intended access for the 3 `rls_enabled_no_policy` tables (`persona_judgments`, `personas`, `team_invites`); move `pg_trgm` out of `public`. Each is a small migration — batch thoughtfully, one concern per PR.

---

## In review (open PRs from the loop)
_(the loop appends here when it opens a PR, and Ben removes the line when merged)_
_(none — Phase 1 day-1 PRs merged)_

## Done log (most recent first, trimmed periodically)
- 2026-06-19 — **Phase 1 coverage batch (5 PRs, all merged, self-merged per Q3):** five untested load-bearing modules pinned — PromptPanel model-capability/soft-fallback gate (`_modelHasCapability`/`_modelSatisfies`, [#865](https://github.com/nicespaceship/nice/pull/865)); SettingsView account-deletion gate (type-to-confirm + submit teardown/error paths, [#866](https://github.com/nicespaceship/nice/pull/866)); ShipBehaviors daily token-budget gate (checkBudget/deductBudget + midnight reset via fake timers, [#867](https://github.com/nicespaceship/nice/pull/867)); Roles dispatch SSOT (SEED getters + init() DB-load with all 3 SEED fallbacks, [#868](https://github.com/nicespaceship/nice/pull/868)); AgentMemory (FIFO trims, deep-clone isolation, buildPromptContext budget/ordering/recency, learn regex extraction, [#869](https://github.com/nicespaceship/nice/pull/869)). All build-checker PASS; suite 1913→1986. Each was the highest-bug-surface untested path on its surface; the clean high-value vein is now largely drained.
- 2026-06-18 — **Dead-code removal (merged):** removed the orphaned `SpaceshipsView` (legacy Shipyard list, ~640 LOC) + its now-orphaned `.share-key-input` CSS and `Utils.KEYS.shipsView` ([#860](https://github.com/nicespaceship/nice/pull/860)). Unrouted/unreferenced since the Bridge consolidation (`/bridge/spaceships` → BlueprintsView); Ben confirmed the "Spaceship Key" feature deprecated. Preview-verified the live `SpaceshipDetailView` + catalog still render. `spaceships.js` 2300→1657. Closes the listener-sweep lead.
- 2026-06-18 — **Phase 1 day-2 (merged, self-merged per Q3):** `views/*` render-test harness (`helpers/view-harness.js`) + 25 WalletView tests ([#855](https://github.com/nicespaceship/nice/pull/855)) — unblocks all view-render coverage; compare-panel + outbox-picker `document.keydown` leak follow-ups, preview-verified open-adds-1/close-removes-1 ([#856](https://github.com/nicespaceship/nice/pull/856)); 17 PromptPanel app-context tests (`_getSlottedAgents` 3-source roster + `_buildAppContext`, via the harness, [#857](https://github.com/nicespaceship/nice/pull/857)); QualityGate `maxRetries: 0` footgun fixed with a `typeof===number && >=0` guard ([#858](https://github.com/nicespaceship/nice/pull/858)). All build-checker PASS. **Named Phase 1 list complete.**
- 2026-06-18 — **Phase 1 day-1 (merged, self-merged per Q3):** ShipSlots unit tests (48; pins the +1/−1 slot-index translation, [#851](https://github.com/nicespaceship/nice/pull/851)); QualityGate unit tests (29; pins the `maxRetries: 0 → default 2` footgun, [#852](https://github.com/nicespaceship/nice/pull/852)); Bridge `document.keydown` leak fix (preview-verified 5 navs → 1 listener, [#853](https://github.com/nicespaceship/nice/pull/853)). All CI green + build-checker PASS.
- 2026-06-18 — **Grok + Llama smoke-test PASSED** — verified live via an authenticated Pro call; `fuel_usage` logged `grok-4-1-fast` + `llama-4-scout` with real token counts, no Gemini downgrade. Q2 fully closed; CLAUDE.md model table updated.
- 2026-06-18 — **Phase 0 carve-outs + Codex (all merged):** Security "Access Policies" → "Recommended Controls" ([#846](https://github.com/nicespaceship/nice/pull/846)); referral `?ref=` write-path + auth-trigger migration ([#847](https://github.com/nicespaceship/nice/pull/847), verified live in prod); drop GPT-5.3 Codex from the catalog ([#848](https://github.com/nicespaceship/nice/pull/848)); Q2 loop-doc resolution ([#849](https://github.com/nicespaceship/nice/pull/849)).
- 2026-06-17 — **Phase 0 honesty/cleanup (merged):** catalog-count softening ([#842](https://github.com/nicespaceship/nice/pull/842)), "schedule posts" claim ([#843](https://github.com/nicespaceship/nice/pull/843)), dead mock-LLM removal ([#844](https://github.com/nicespaceship/nice/pull/844)) — all build-checker PASS.
- 2026-06-17 — **P1 cleared.** `search_path` pinned on 3 trigger helpers ([#840](https://github.com/nicespaceship/nice/pull/840), applied + verified live `search_path=""`); config.toml verify_jwt for the 4 MCP fns ([#838](https://github.com/nicespaceship/nice/pull/838), first loop output).
- 2026-06-17 — Phased build plan + daily ritual ([#839](https://github.com/nicespaceship/nice/pull/839)); build-cycle dedup hardening ([#837](https://github.com/nicespaceship/nice/pull/837)).
- 2026-06-16 — Build-loop infrastructure stood up (this file, QUESTIONS.md, `build-cycle` skill, `build-checker` agent).
