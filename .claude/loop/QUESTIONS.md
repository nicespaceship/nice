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

### Q4 — Community groundwork is no longer one `[READY]` unit   ·   raised 2026-09-03 · item: P2 community features groundwork
**Question:** Two separate steers needed. (a) The badge was specced as "Powered by NICE", but NICE is now the *company* and Longeron is the *product* — should it read "Powered by Longeron", "Powered by NICE SPACESHIP", or drop the badge? (b) The public profile view needs a public-read policy on `profiles`, which is a carve-out migration, not `[READY]` code.
**Default taken (if any):** none — reflagged `[BEN]` and left unbuilt. Guessing the badge wording would put the wrong brand on other people's sites, and guessing the `profiles` read policy would expose user rows.
**Why it needs you:** (a) is brand, (b) is a security/RLS fork. Split into two items once you call it: the badge is then `[READY]`, the profile view is `[QUEUE]`.

### Q6 — Which subreddit is canonical?   ·   raised 2026-09-03 · item: `/community` soft-404
**Question:** `www/js/nav.js` links `reddit.com/r/nicespaceship`; `www/brand.html` links `reddit.com/r/nicespaceship_ai` (twice). The dead `vercel-www.json` pointed `/community` at the former. Which is real?
**Default taken (if any):** none — logged only. Picking wrong sends users to an empty or squatted subreddit, and I can't tell from the repo which one you actually created.
**Why it needs you:** it's an external fact about accounts you own (memory rule 7). Once you answer, fixing the odd link out and adding the `/community` redirect is a single `[READY]` cycle.

### Q5 — The loop backlog went stale for ~2.5 months   ·   raised 2026-09-03 · item: loop integrity
**Question:** `BACKLOG.md` was last written 2026-06-19 (#878), but #885–#906 shipped outside the loop (Longeron rename, model lineup swaps, NICE Auto routing, model-watch, the audit quick-win tier). Its top `[READY]` item was already built. Do you want the loop to keep running against this file as SSOT, and if so should a cycle be spent reconciling it against `git log` first?
**Default taken (if any):** corrected only what this cycle proved cold — removed the shipped account-deletion line, rescoped the typography sweep, reflagged community groundwork. Reversible; the rest of the file is untouched. Loop rule 6's "pre-launch until ~2026-06-28" window has also expired and needs a call.
**Why it needs you:** a stale SSOT makes every future cycle risk duplicating merged work. Reconciling it is cheap but it's your prioritization, not mine to invent.

## Answered
- 2026-06-18 — *Q3 Self-merge non-carve-out green PRs:* **YES** — Ben (session opener): self-merge non-carve-out PRs once **CI is green AND the build-checker PASSes**; he spot-checks after the fact. Carve-outs (migrations / billing / auth) still wait for him. Standing rule now; supersedes the blanket "Ben merges all" reading of BACKLOG rule 2 for the non-carve-out class. Applied: #851-853 self-merged this session.
- 2026-06-18 — *Q2 Untested models:* decided + closed — **drop Codex** (removed in [#848](https://github.com/nicespaceship/nice/pull/848)), **keep Grok + Llama**, and the smoke-test **passed**: verified live via an authenticated Pro call, `fuel_usage` logged `grok-4-1-fast` + `llama-4-scout` with real token counts (no Gemini downgrade). Text verified; vision still untested. Nothing left to gate.
- 2026-06-17 — *Q1 Catalog-count gap:* default (a) soften taken + shipped ([#842](https://github.com/nicespaceship/nice/pull/842)) — all public 500+/800+/924 claims → "hundreds of blueprints" across marketing, app shell, docs SSOT, README, BUSINESS.md. Reversible; flip to a catalog sprint anytime.
- 2026-06-16 — *Autonomy envelope & cadence:* draft-and-queue (Ben merges all; nothing auto-deploys pre-launch) at a ~3-hour cycle. Revisit after launch to enable auto-merge for the safe class.
- 2026-06-16 — *config.toml verify_jwt for the 4 MCP fns:* confirmed safe to add (all four already live as `verify_jwt=false`); it's codification, not a behavior change.
