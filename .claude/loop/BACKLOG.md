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
2. **Never merge. Never auto-deploy.** Draft-and-queue: every change is a PR Ben merges (decided 2026-06-16, pre-launch posture).
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
> Three Phase 0 honesty/cleanup items shipped 2026-06-17 (in review — see below): catalog counts, "schedule posts", dead mock-LLM. Remaining:
- `[BEN]` **Smoke-test Grok / Llama (Groq) / Codex** through `nice-ai` — needs an authenticated Pro call (the loop can't sign in or spend tokens). `fuel_usage` confirms these have NEVER run in prod (only `gemini-2.5-flash` has). See [[QUESTIONS]] Q2: run the smoke-test or hide the 3 untested models from the catalog before launch.
- `[QUEUE]` **Relabel Security "Access Policies"** — the 6 toggles enforce nothing and don't persist (`security.js:63-70,418-427`). Relabel as a posture checklist so the UI stops implying protections that don't exist. Carve-out (`security.js`) → draft for Ben.
- `[QUEUE]` **Referral `?ref=` write-path** — link + count display exist (`profile.js:287,301`) but nothing consumes `?ref=` at signup to write the `referrals` row. Touches the auth/signup flow → likely carve-out, draft for Ben.

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
- [#842](https://github.com/nicespaceship/nice/pull/842) — Marketing-honesty: catalog counts → "hundreds" (all public surfaces + idempotent docs-favicon fix). build-checker PASS, 1791 tests.
- [#843](https://github.com/nicespaceship/nice/pull/843) — Marketing-honesty: "schedule posts" → "schedule meetings" on the explore page. build-checker PASS.
- [#844](https://github.com/nicespaceship/nice/pull/844) — Remove dead mock-LLM scaffolding from `prompt-panel.js` (~96 lines, behavior-preserving). build-checker PASS.

## Done log (most recent first, trimmed periodically)
- 2026-06-17 — **Phase 0 honesty/cleanup (in review):** catalog-count softening ([#842](https://github.com/nicespaceship/nice/pull/842)), "schedule posts" claim ([#843](https://github.com/nicespaceship/nice/pull/843)), dead mock-LLM removal ([#844](https://github.com/nicespaceship/nice/pull/844)) — all build-checker PASS, awaiting Ben's merge. Smoke-test item reclassified `[BEN]` (needs auth — [[QUESTIONS]] Q2).
- 2026-06-17 — **P1 cleared.** `search_path` pinned on 3 trigger helpers ([#840](https://github.com/nicespaceship/nice/pull/840), applied + verified live `search_path=""`); config.toml verify_jwt for the 4 MCP fns ([#838](https://github.com/nicespaceship/nice/pull/838), first loop output).
- 2026-06-17 — Phased build plan + daily ritual ([#839](https://github.com/nicespaceship/nice/pull/839)); build-cycle dedup hardening ([#837](https://github.com/nicespaceship/nice/pull/837)).
- 2026-06-16 — Build-loop infrastructure stood up (this file, QUESTIONS.md, `build-cycle` skill, `build-checker` agent).
