# NICE‑1 Roadmap — a cost-efficient, task-specialized model behind `nice-ai`

**Status:** Phase 0 shipped to prod 2026-05-29, exit gate confirmed 2026-05-30 (consent + 100%-frontier routing live; consented PII-redacted events landing in R2 `nice-training` as `v1/dt=*/*.jsonl`). Phases 1–5 proposed. Design SSOT.
**Goal:** Build a small, NICE-owned model (NICE‑1) that matches frontier quality *on NICE's own task distribution* — agentic tool-calling, blueprint missions, workflow steps — at a fraction of the per-token cost, and serve it behind a router so users get cheaper fuel with no quality regression.
**Non-goal:** A general-purpose frontier competitor. NICE‑1 is a task specialist, not a GPT/Claude replacement. The frontier models stay in the library for hard work.

## The one idea that makes this cheap to build

The **capture funnel** and the **router seam** are the same `nice-ai` change. Refactor `nice-ai` once so that:

1. every consented call is captured to a data lake, and
2. every call flows through a router that *today* sends 100% to the frontier models (no behavior change) but has the seam where NICE‑1 plugs in later.

That single refactor delivers both foundations at once. Nothing user-facing changes until we choose to flip routing — possibly years later — and the client + standalone apps never have to change again.

## Why a task specialist wins on cost

- **Cost per token scales with model size.** A self-hosted ~4–9B model runs roughly an order of magnitude cheaper per token than a frontier API call, and cuts the provider markup entirely. Those savings become cheaper fuel for users.
- **Most NICE work is routine.** Parse a request, pick a tool, format a response, summarize a result. Paying frontier prices for commodity work is the waste NICE‑1 removes.
- **A small model fine-tuned on one task distribution matches a giant general model on that distribution.** Narrow is the whole point — narrow is what makes small viable.

## The data NICE already generates (the moat)

`nice-ai` is a single server-side choke point: every LLM call from every surface already flows through one proxy that holds the keys. That gives us the three ingredients of an RLHF-grade dataset as a byproduct of normal usage:

| Ingredient | Source in NICE |
|---|---|
| **SFT demonstrations** | Every premium call `nice-ai` proxies to Claude/GPT/Gemini is a *teacher demonstration* → distillation target. We pay for those tokens anyway. |
| **Reward / outcome signal** | `mission_runs.status` (completed / failed / cancelled) labels a whole agentic trace. |
| **Preference pairs** | Approval gates (approve/reject in `review` mode), regenerations, user edits → `(chosen, rejected)` pairs for DPO. `persona_judgments` is a pre-built reward signal. |

## Consent policy (decided)

**All users, all regions, from day one → one global consent model, hard opt-in for everyone.** No regional branching. Data captured without consent is permanently unusable for training, so consent lands before the first captured event. Free vs paid default is a legal/policy call to confirm, but the baseline is opt-in worldwide.

---

## Phases (each with an exit gate)

### Phase 0 — The `nice-ai` refactor: capture + router seam + consent ✅ SHIPPED 2026-05-29
*Every interaction becomes a clean, consented training asset, and the routing seam exists — with zero user-visible change.* Detailed in [`nice-1-phase0-spec.md`](nice-1-phase0-spec.md). Shipped via PRs #628–#635: `training_consent` on `profiles`, Settings toggle + one-time `ConsentPrompt`, and `nice-ai` consent-gated PII-redacted capture to R2 bucket `nice-training` (`v1/dt=YYYY-MM-DD/<uuid>.jsonl`) plus the `pickModel()` seam.

- Consent: `profiles.training_consent` + visible toggle + ToS/privacy update, opt-in, global.
- Capture: `nice-ai` writes a **versioned** training event per call to **Cloudflare R2** (Parquet/JSONL, date-partitioned) with join keys to `mission_runs` and `persona_judgments`. PII redacted at capture. Not Supabase Postgres.
- Router seam: `pick_model(request) → provider` inside `nice-ai`. Returns the current model today; can return `nice-1` with frontier fallback later.
- Funnel lock: close any path reaching a provider without going through `nice-ai`.
- ⚠️ `nice-ai` source is proprietary/gitignored. Execution step one: `npx supabase functions download nice-ai`.

**Exit gate:** consented calls across web + Electron land in R2 in the versioned schema; router shell routes 100% to frontier; zero behavior change. *Status: ✅ met 2026-05-30 — deployed and serving; consent + 100%-frontier routing live; multiple consented `v1/dt=2026-05-30/<uuid>.jsonl` events confirmed in the `nice-training` bucket.*

### Phase 1 — Standalone apps inherit the funnel
*iOS/Windows are thin clients to `nice-ai`, never direct provider callers.*

- Write the thin-client contract (call `nice-ai`, same consent, same capture schema) **before** the apps are built.
- On-device small Gemma (E2B/E4B) allowed for offline/privacy; its telemetry conforms to the same schema.

**Exit gate:** app architecture docs encode the contract; first native build passes capture conformance.

### Phase 2 — Curation + eval harness (no model shipped)
*Turn the raw lake into trainable datasets and build the scoreboard NICE‑1 must beat.*

- Curation: dedup, redact, quality-filter using signal we already have (mission completed + judge passed → keep).
- **Eval harness on NICE's real task distribution** — the scoreboard. Establish the incumbent baseline (Gemini Flash on routine tasks) so the release gate is a real number.
- Dataset versioning.

**Exit gate:** versioned SFT + preference datasets exist; eval harness produces a frontier-baseline score on NICE tasks.

### Phase 3 — NICE‑1 v0, internal-only
*Prove the specialist + pipeline, ship nothing.*

- Task-specialized distillation: LoRA/QLoRA onto Gemma 4 E4B (v0 proof) → 26B MoE (production target).
- DPO from approval-gate + judge preference pairs.
- Measure against the Phase 2 harness. Internal checkpoints only.

**Exit gate:** NICE‑1 v0 scored against the scoreboard; pipeline reproducible.

### Phase 4 — Cascade in shadow mode
*NICE‑1 runs on real traffic, scored, but never serves users.* Detailed in [`nice-1-cascade-confidence.md`](nice-1-cascade-confidence.md).

- Router tries NICE‑1 in shadow alongside the real frontier response; log both + confidence score; never return NICE‑1 to the user.
- Confidence/escalation: task-type allowlist + judge-score threshold first → learned routing via `ModelIntel` later.

**Exit gate:** shadow data shows the % of real tasks NICE‑1 handles at frontier-comparable quality, plus the cost delta.

### Phase 5 — Graduated rollout
*Cost-savings reach users.*

- Flip routing so NICE‑1 serves the routine tier on the **free tier first**, frontier fallback on low confidence → widen.
- Release gate: **frontier-comparable quality on NICE tasks at a cost-per-task below the API it offloads, with graceful escalation.**

**Exit gate:** measured fuel-cost reduction per task with no quality regression.

---

## Open decisions (recommendations)

| Decision | Recommendation | Note |
|---|---|---|
| Consent default | Opt-in, global, all users from day one | **Decided.** Free vs paid default is a legal check. |
| Capture store | Cloudflare R2, Parquet, date-partitioned | Already on Cloudflare; keeps Postgres clean. |
| Base model | Gemma 4 E4B (v0) → 26B MoE (prod) | Apache 2.0, native tool-calling. |
| Serving (v0) | Managed endpoint (Baseten/Fireworks/Together) | Avoid GPU ops until volume justifies self-host. |
| Fine-tune (v0) | Managed LoRA service | Same reason. |
| Confidence scoring | Task-type allowlist + judge threshold → learned via `ModelIntel` | Start simple, get smart with data. |

## Where the two tracks meet

The foundation track (Phases 0→2) and the cost-efficiency track (cascade, Phases 4→5) share one piece of code: the `nice-ai` router seam built in Phase 0. Build the seam once, it captures data immediately, and NICE‑1 plugs into it later without touching the client or the native apps.
