# NICE‑1 Cascade — confidence scoring & escalation

**Status:** Proposed — design review. Refines Phase 4 of [`nice-1-roadmap.md`](nice-1-roadmap.md).
**Question it answers:** after NICE‑1 attempts a task, how do we decide "ship this answer" vs "escalate to a frontier model" — safely, cheaply, and in a way that *widens* as data proves NICE‑1 reliable?
**Principle:** the cheapest reliable check wins. Prefer deterministic verification over probabilistic confidence; prefer not calling NICE‑1 at all on tasks it can't do over calling it and throwing the answer away.

## The cost math that constrains everything

Let `f` = frontier cost/task, `n` = NICE‑1 cost/task (`n ≈ 0.1f`), `e` = escalation rate among NICE‑1 attempts, `v` = verification overhead.

- **Post-route escalation** (call NICE‑1, then re-run on frontier if it fails): expected cost `= n + v + e·f`. This beats `f` whenever `e < (f − n − v)/f ≈ 1 − n/f`. With `n ≈ 0.1f`, that tolerates a *surprisingly high* escalation rate on a pure-token basis — but every escalation **doubles latency** for that task, so the UX constraint binds long before the cost constraint does. Target low escalation for experience, not just economics.
- **Pre-route** (send a task straight to frontier, never try NICE‑1): cost `= f`, no waste. This is the lever that protects the math — hard tasks never incur a wasted NICE‑1 call.

**Conclusion:** good *pre-routing* (don't attempt what NICE‑1 can't do) matters more than good *post-scoring*. Partition first, score second.

## The scoring cascade — cheap to expensive

Four tiers. A task exits at the first tier that resolves it.

### Tier A — Pre-route policy (zero marginal cost)
Decide *before* calling NICE‑1 whether to attempt it at all.

- Keyed on **task type** (mission step type, tool set required, agent role) + learned success rates.
- Bootstrapped from a conservative allowlist (e.g. summarization, formatting, single-tool calls). Becomes **learned routing via `ModelIntel`**: per task-type, NICE‑1's measured shadow success rate gates whether it's a candidate.
- Task types below the success threshold go **straight to frontier** — no NICE‑1 call, no waste.

### Tier B — Deterministic verification (near-zero cost)
After NICE‑1 answers, run structural checks. No model call.

- **Tool-call schema validity** — does the emitted tool call match the offered tool's schema?
- **Structured-output conformance** — valid JSON / matches the expected shape / respects constraints.
- **Tool execution success** — did the call actually run without error?

This is the high-value tier for NICE, because a large share of agentic work *is* structured tool-calling, which is **verifiable, not probabilistic**. A malformed tool call is a deterministic fail → escalate. No judgment needed.

### Tier C — Lightweight judge (small cost)
Only for free-form outputs that pass B but aren't deterministically checkable.

- A small verifier scores NICE‑1's output against a quality threshold. **Reuse / extend the Persona judge** (`persona_judgments`, Tier 3) rather than building a new scorer.
- Invoked only when needed, so its cost is amortized across the minority of tasks that reach it.
- Below threshold → escalate.

### Tier D — Escalate to frontier
Anything that fails A's gate, B's checks, or C's threshold runs on the frontier model. The user sees the frontier answer; the NICE‑1 attempt + the reason for escalation is logged.

## The metric that governs traffic share

Two numbers per task-type, both from shadow + live data:

- **`acceptance_rate`** — fraction of attempts NICE‑1 resolves without escalation.
- **`quality_parity`** — NICE‑1's *accepted* outputs vs the frontier baseline on the Phase 2 eval harness, on that task-type.

**Rule:** raise NICE‑1's allowed share of a task-type only when `quality_parity` holds at the current `acceptance_rate`. If parity slips, the share contracts automatically. This is the safety valve — traffic share is *earned per task-type*, never granted globally.

## Bootstrapping in shadow mode (Phase 4)

NICE‑1 can't be trusted yet, so the scorer runs but **never serves**. Each real task logs:

`(task features, NICE‑1 output, frontier output, Tier-B result, Tier-C score, eventual mission_runs outcome)`

That dataset does two jobs:
1. **Trains Tier A** — turns the hand-written allowlist into learned per-task-type routing in `ModelIntel`.
2. **Calibrates Tier C** — sets the judge threshold against real outcomes before a single user is served by NICE‑1.

Only when a task-type clears the parity rule in shadow does it become eligible for live NICE‑1 serving (Phase 5), free tier first.

## Where it lives in code

- **`nice-ai` / `pickModel()`** — Tier A pre-route decision + the escalation orchestration (try NICE‑1 → check → maybe re-run on frontier).
- **`nice-ai` validators** — Tier B deterministic checks (schema/JSON/execution).
- **Persona judge infra** — Tier C, extended for the cascade.
- **`ModelIntel`** — owns the learned Tier A policy and the per-task-type `acceptance_rate` / `quality_parity` tables.

## Open questions to resolve before Phase 4

- **Judge cost vs coverage** — how much free-form (Tier C) traffic is there really? If most NICE tasks are tool-calls (Tier B), Tier C may be a small tail and a cheap classifier suffices.
- **Latency budget for escalation** — set the max acceptable double-call latency; it, not token cost, caps the escalation rate.
- **Calibration confidence** — minimum shadow sample size per task-type before trusting its parity number (analogous to the Persona Engine's n≥30/theme gate).
- **Self-reported confidence** — whether NICE‑1's own logprobs/perplexity add signal on top of B/C, or are too poorly calibrated to bother. Decide empirically from shadow data; don't assume.
