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

## P1 — Launch should-fixes (code)
- `[READY]` **config.toml verify_jwt entries** — add `[functions.<name>] verify_jwt = false` for `gmail-mcp`, `calendar-mcp`, `drive-mcp`, `microsoft-graph-mcp`. Verified 2026-06-16: all four are already live with `verify_jwt=false`, so this only codifies the running state (prevents a plain redeploy flipping them to `true` and breaking the gateway forward of the user's ES256 JWT). Not carve-out.
- `[QUEUE]` **search_path hardening migration** — `ALTER FUNCTION public.<fn>() SET search_path = ''` for `personas_set_updated_at`, `set_updated_at`, `clear_mcp_last_error_on_connect` (3 advisor WARNs). All are trivial `SECURITY INVOKER` trigger helpers (only `now()` + NEW), so `''` is safe (pg_catalog implicit). Migration → app-open session for the dry-run + `DO $smoke$` gate. Next timestamp after `20260807000000`.

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

## Done log (most recent first, trimmed periodically)
- 2026-06-16 — Build-loop infrastructure stood up (this file, QUESTIONS.md, `build-cycle` skill, `build-checker` agent).
