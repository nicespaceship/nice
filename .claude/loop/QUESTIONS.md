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
### Q1 — Catalog-count gap: soften the numbers, or run a catalog sprint?   ·   raised 2026-06-17 · item: marketing-honesty (catalog counts)
**Question:** The marketing site claims 500+/800+/924 blueprints but ~219 are live (53 ships + 166 agents). Do we (a) soften the public numbers to "growing library / hundreds," or (b) commit to a catalog sprint to actually reach ~500 before launch (the business-vertical ships are already seeding toward this)?
**Default taken:** (a) soften — reversible, and matches the standing "future-proof the numbers" preference ([[feedback_brand_voice_future_proof_numbers]]). The loop will scope the www-count source before editing (counts are build-generated, not in `scripts/build.js`).
**Why it needs you:** (b) is a real product/marketing call about whether launch waits on catalog scale. Flip it anytime and I'll redirect the week.

## Answered
- 2026-06-16 — *Autonomy envelope & cadence:* draft-and-queue (Ben merges all; nothing auto-deploys pre-launch) at a ~3-hour cycle. Revisit after launch to enable auto-merge for the safe class.
- 2026-06-16 — *config.toml verify_jwt for the 4 MCP fns:* confirmed safe to add (all four already live as `verify_jwt=false`); it's codification, not a behavior change.
