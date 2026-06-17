# Today — 2026-06-17 (Phase 0 — Ship)

> The day's focus slice. Ben reorders / strikes / approves in the morning; the loop + in-session work pull from the top. Full queue → `BACKLOG.md`. Forks needing you → `QUESTIONS.md`.

## For Ben to merge (in flight)
- [#837](https://github.com/nicespaceship/nice/pull/837) — build-cycle dedup hardening (**merge first**)
- [#838](https://github.com/nicespaceship/nice/pull/838) — config.toml verify_jwt for the 4 MCP fns
- (this PR) — build-loop plan + daily ritual

## Today's focus
1. **[BEN]** Start **Google OAuth verification** (the long pole) + **redirect allowlist** — the actual critical path; doesn't wait on code.
2. **[me · QUEUE]** `search_path` hardening migration (last P1 code item) — SQL shown for push-confirm.
3. **[loop · READY]** Marketing-honesty: catalog counts → "growing library / hundreds" (default per catalog fork — see `QUESTIONS.md`). *Scope first: counts are build-generated, not in `scripts/build.js`; locate the www-count source before editing.*
4. **[loop · READY]** Remove dead mock-LLM scaffolding in `prompt-panel.js` (`_finishMock` + canned `_NS_RESPONSES`/`_AGENT_RESPONSES` banks — ~150 dead lines).
5. **[loop · QUEUE]** Relabel Security "Access Policies" as a posture checklist (stop implying unenforced protections) — touches `security.js` (carve-out → draft for your merge).

## Done today
- Launch should-fix batch merged + RLS verified live (#832–#835).
- Build-loop infra merged (#836); loop armed + validated (first output #838).
- Build-loop plan + daily ritual committed.
