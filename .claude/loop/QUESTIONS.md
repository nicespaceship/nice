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
### Q2 — Untested models (Grok / Llama / Codex): smoke-test before launch, or hide until verified?   ·   raised 2026-06-17 · item: smoke-test Grok/Llama/Codex
**Question:** Grok 4.1 Fast, Llama 4 Scout, and GPT-5.3 Codex are live + user-selectable in `MODEL_CATALOG` (`model-catalog.js:48-61`), but `fuel_usage` telemetry shows they have **never** been called in prod (only `gemini-2.5-flash` has). A real end-to-end smoke-test needs an authenticated Pro session calling `nice-ai` (the headless loop can't sign in or spend tokens), so it can't ship as a code PR. Do we (a) run the smoke-test manually before launch (sign in Pro, enable each, send a prompt, confirm it streams), or (b) hide these 3 from the catalog until verified (ship fewer working models over exposing possibly-broken ones)?
**Default taken:** none — parked. Needs an authenticated prod call (money/credentials) or a product call about catalog exposure; both are yours per the "never guess on money/security forks" rule.
**Why it needs you:** If they error for a paying user at launch, that's a bad first impression. Multimodal is already conservatively gated off for all three (`model-catalog.js` comments); this is about whether text generation works at all. Safest is to verify or hide before launch.

## Answered
- 2026-06-17 — *Q1 Catalog-count gap:* default (a) soften taken + shipped ([#842](https://github.com/nicespaceship/nice/pull/842)) — all public 500+/800+/924 claims → "hundreds of blueprints" across marketing, app shell, docs SSOT, README, BUSINESS.md. Reversible; flip to a catalog sprint anytime.
- 2026-06-16 — *Autonomy envelope & cadence:* draft-and-queue (Ben merges all; nothing auto-deploys pre-launch) at a ~3-hour cycle. Revisit after launch to enable auto-merge for the safe class.
- 2026-06-16 — *config.toml verify_jwt for the 4 MCP fns:* confirmed safe to add (all four already live as `verify_jwt=false`); it's codification, not a behavior change.
