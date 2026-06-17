# NICE — Plan of Attack (phased roadmap)

> Strategic SSOT for the build. The loop and Ben work top-down from the current phase.
> Today's slice → `TODAY.md`. Prioritized queue → `BACKLOG.md`. Forks for Ben → `QUESTIONS.md`.
> Synthesized 2026-06-17 from a 3-dimension codebase review (completeness / scope-vs-reality / velocity).

## Where we are
Core engine is **shipped and coherent**: agents, spaceships, missions/runs/schedules, the 14-node workflow engine, multi-LLM routing, billing + 3 token pools, 19 integrations, gamification, 11 themes, community/marketplace, sharing, PWA, Electron desktop. **1791 unit + 30 E2E tests green; zero `TODO`/`FIXME` in source.** This is *harden-to-launch*, not *build-to-launch*.

Concentrated gaps (the work):
- **Marketing ≠ reality** — catalog claims 500+/800+/924 vs ~219 live; "agents schedule posts" but the Outbox is dead (no `social-mcp`); "read & write your tools" but only Google/MS/HubSpot write; "fully open source" but the backend edge functions are proprietary/absent.
- **Half-wired surfaces** — Security "Access Policies" enforce nothing & don't persist; referral program has no `?ref=` write-path at signup.
- **Moat bets, early** — NICE-1 at Phase 0/5 (no model serves traffic); native iOS/Windows not started.
- **Structural debt** — `prompt-panel.js` (3,785 LOC, untested) + `blueprints.js` (3,582) god-files; `ship-slots`/`quality-gate` logic untested; recurring defect classes: escaping/XSS, realtime subscriptions, billing races.

Velocity: ~4–6 loop-landed PRs/day; one focused human day = 3–5 small PRs.

## Phases

### Phase 0 — Ship (now → ~2026-06-28)
Credible, honest, secure soft-launch on email auth.
- **BEN (critical path):** Google OAuth verification (the long pole — start now); console sweep (redirect allowlist, `community_review_service_key` rotation, storage policies, disable anon sign-ins, HIBP, confirm edge-fn secrets).
- **Code:** finish P1 (`search_path` migration); marketing-honesty (catalog counts → "growing library", soften "schedule posts" until `social-mcp` ships); relabel Security Access Policies as a posture checklist; remove dead mock-LLM scaffolding; referral `?ref=` write-path; smoke-test Grok/Llama/Codex.

### Phase 1 — Stabilize (Jun 28 → ~Jul 12)
Production-grade under real traffic.
- Defensive hardening on the 3 recurring defect classes (escaping, realtime subscriptions, billing races).
- Test coverage for untested logic: `ship-slots`, `quality-gate`, `wallet`, `prompt-panel`.
- Monitor + fix real-user issues. Google sign-in fast-follow when verification clears.

### Phase 2 — Complete the surface (Jul → Aug)
Close the vision↔reality gaps.
- Build `social-mcp` → light up the Outbox (the headline dead capability).
- Add write capabilities to more integrations.
- Catalog growth: business-vertical ships toward the marketed scale.
- Wire Security Access Policies to real enforcement + persistence.
- Refactor: split the `prompt-panel.js` + `blueprints.js` god-views.

### Phase 3 — The moat (Aug+)
The differentiated bets.
- NICE-1 Phases 1–5 (cost-efficiency moat) — gated on legal sign-off.
- Persona Engine Tier 4 (state machine).
- Realtime / push-to-talk voice.
- Native iOS / Windows apps (big lift; the three-layer schema is already architected for clean sync).
- Community growth (leaderboards, public profiles, "Powered by NICE" badge).

## Daily ritual
- **MORNING** — Ben reads `TODAY.md` (4–6 focus items), reorders / strikes / approves.
- **DAY** — the loop (every 3h) + in-session work ship one PR per item: maker → `build-checker` → `npm test` → draft PR. Security/billing/migrations queue for Ben.
- **EVENING** — Ben reviews + merges the day's PRs (~15–30 min). Forks wait in `QUESTIONS.md` with a recommendation.

Continuous flow: finish an item → open its PR → immediately start the next (don't wait on merge). Pauses only at the merge gate, a real fork, or the ≥5-open-PR cap.
