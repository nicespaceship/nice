# NICE — Loop Questions (async channel to Ben)

> When a build cycle hits a genuine product/priority/architecture fork it can't
> resolve from the repo, CLAUDE.md, or the roadmaps, it logs the question here and
> either (a) proceeds on a clearly-reversible default, noting which, or (b) parks
> the item and moves on. Ben answers when he surfaces; answered items move to the
> log at the bottom. **Claude never guesses on irreversible or money/security forks.**

## Format
```
### Q<n> — <short title>   ·   raised <date> · item: <backlog item>
**Question:** ...
**Default taken (if any):** ... (reversible because ...)
**Why it needs you:** ...
```

## Open
_(none)_

## Answered
- 2026-06-18 — *Q2 Untested models:* decided + closed — **drop Codex** (removed in [#848](https://github.com/nicespaceship/nice/pull/848)), **keep Grok + Llama**, and the smoke-test **passed**: verified live via an authenticated Pro call, `fuel_usage` logged `grok-4-1-fast` + `llama-4-scout` with real token counts (no Gemini downgrade). Text verified; vision still untested. Nothing left to gate.
- 2026-06-17 — *Q1 Catalog-count gap:* default (a) soften taken + shipped ([#842](https://github.com/nicespaceship/nice/pull/842)) — all public 500+/800+/924 claims → "hundreds of blueprints" across marketing, app shell, docs SSOT, README, BUSINESS.md. Reversible; flip to a catalog sprint anytime.
- 2026-06-16 — *Autonomy envelope & cadence:* draft-and-queue (Ben merges all; nothing auto-deploys pre-launch) at a ~3-hour cycle. Revisit after launch to enable auto-merge for the safe class.
- 2026-06-16 — *config.toml verify_jwt for the 4 MCP fns:* confirmed safe to add (all four already live as `verify_jwt=false`); it's codification, not a behavior change.
