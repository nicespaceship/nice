# MissionRouter fold-in — scoping doc

_Written 2026-04-24 after the mission ontology migration landed ([#269](https://github.com/nicespaceship/nice/pull/269), [#271](https://github.com/nicespaceship/nice/pull/271)). Not yet executed — kicking off from this doc._

## Why

Post-migration, ship-level chat is the only execution path that still bypasses the Mission lifecycle. Every ship-prompt goes through `MissionRouter.route/pipeline/parallel/hierarchical/loop`, which writes to `ship_log` but **never creates a `mission_runs` row**. That means:

- No audit trail for ship chats in the Missions view
- No status machine, no cancel, no progress
- No analytics — ship chats don't count toward agent performance or token budgets the way Missions do
- Two separate "how a prompt becomes work" pipelines in the codebase

The ontology says there's one primitive: **every execution is a Mission Run on a Spaceship**. Ship chat should be no exception. It's an auto-created, ephemeral Mission Run — still a Run.

## Target: four new WorkflowEngine node types

Drop `MissionRouter` entirely. Its five patterns become node types inside `workflow-engine.js`, reusing the existing `agent` node as the primitive.

| New node type | Replaces | Shape |
|---|---|---|
| `triage` | `MissionRouter.route()` | Uses Claude Haiku to pick the best crew agent from the Ship's slot_assignments, then inlines an `agent` node with that agent. Output = that agent's output + routing reasoning in metadata. |
| `pipeline` | `MissionRouter.pipeline()` | Ordered list of agents. Each agent gets the previous agent's output as input. Output = last agent's output. |
| `parallel` | `MissionRouter.parallel()` | All listed agents get the same prompt. Output = merged results (either concatenated or summarized by a synthesis step). |
| `quality_loop` | `MissionRouter.loop()` | `{ worker, reviewer, threshold, maxIterations }`. Worker runs → reviewer scores → if below threshold, re-run with reviewer feedback. Output = final approved worker output + iteration count. |

`hierarchical` (captain plans → crew executes → captain synthesizes) is **not its own node type** — it composes from the above: a triage-style captain node feeds subtasks into `parallel`, output goes to another agent for synthesis. A DAG with three nodes. No special runtime path.

### Why these specific four

They map cleanly to the five `MissionRouter` methods:
- `route` → `triage`
- `pipeline` → `pipeline`
- `parallel` → `parallel`
- `loop` → `quality_loop`
- `hierarchical` → composition of `triage` + `parallel` + `agent`
- `routerPattern` → composition of `triage` + `parallel`

Five methods → four primitives + composition. That's the right simplification.

### Config shape

```js
// triage
{ id, type: 'triage', config: {
    candidates: ['agent-id-1', 'agent-id-2', ...],  // or omit → all crew on this Ship
    intent: 'research' | 'code' | 'analyze' | 'build', // optional hint
    routingModel: 'claude-haiku',  // optional override
  }}

// pipeline
{ id, type: 'pipeline', config: {
    steps: [
      { agentId: '...', promptTemplate: '...' },  // {input} placeholder for upstream
      { agentId: '...', promptTemplate: '{input}\n\nNext: ...' },
    ],
  }}

// parallel
{ id, type: 'parallel', config: {
    agents: ['agent-id-1', 'agent-id-2', ...],
    merge: 'concat' | 'summarize',  // default 'concat'
    synthesisAgent: 'agent-id-3',   // required if merge='summarize'
  }}

// quality_loop
{ id, type: 'quality_loop', config: {
    worker: 'agent-id',
    reviewer: 'agent-id',
    threshold: 0.8,          // reviewer returns {score, feedback}; below threshold → retry
    maxIterations: 3,
  }}
```

## The adapter: ship-chat → Mission Run

Today's prompt-panel call at [prompt-panel.js:2030-2045](app/js/views/prompt-panel.js:2030):

```js
// Current
const mode = _activeMode || 'auto';
if (mode === 'pipeline') routerPromise = MissionRouter.pipeline(...)
else if (mode === 'parallel') routerPromise = MissionRouter.parallel(...)
else if (mode === 'hierarchical') routerPromise = MissionRouter.hierarchical(...)
else if (mode === 'loop') routerPromise = MissionRouter.loop(...)
else routerPromise = MissionRouter.route(...)
```

Post-fold-in: every ship chat becomes an **ephemeral Mission Run** — a `mission_runs` row with `mission_id = null` (ad-hoc) and an inline `plan_snapshot` that is a single node of the chosen type.

```js
// Post-fold-in
const node = buildNodeForMode(mode, crewIds);  // {id:'root', type:'triage'|'pipeline'|..., config}
const run = await SB.db('mission_runs').create({
  user_id, spaceship_id, title: _truncate(text, 60),
  status: 'queued',
  mission_id: null,
  plan_snapshot: { shape: 'dag', nodes: [node], edges: [] },
  metadata: { source: 'prompt_panel', mode, input: text },
});
await MissionRunner.run(run.id);  // goes through _runDag → WorkflowEngine
```

Benefits:
- Ship chats show up in Missions view with status/progress
- Cancel button works on them
- Analytics / token counting is unified
- Audit log is automatic (mission_runs + ship_log are already wired)

Cost: every prompt opens a Missions row. Noise concern — see open questions.

## Migration sequence

Four PRs, strictly ordered:

### PR A — Add new node types to WorkflowEngine
- `_executeTriage`, `_executePipeline`, `_executeParallel`, `_executeQualityLoop` in [workflow-engine.js](app/js/lib/workflow-engine.js)
- Add cases in `_executeNode` switch
- Unit tests for each node type + composition tests (triage + parallel in one DAG)
- **Invariant:** don't touch prompt-panel yet; MissionRouter still runs
- Exit criteria: can execute a DAG containing each new node type via WorkflowEngine directly

### PR B — Wire prompt-panel to create Mission Runs
- Replace the `MissionRouter.*` dispatch at [prompt-panel.js:2030-2045](app/js/views/prompt-panel.js:2030) with ephemeral Mission Run creation + `MissionRunner.run()`
- Result plumbing: listen to the run's completion (via realtime or polling) to display the agent output in the chat monitor
- Preserve the orchestration-mode UI (auto/pipeline/parallel/hierarchical/loop) — just bind to the new node-type factory
- **Invariant:** MissionRouter is still in the codebase but no longer called from prompt-panel
- Exit criteria: every chat prompt produces a `mission_runs` row; Missions view shows them; cancel works on running chats

### PR C — Delete MissionRouter
- Delete [app/js/lib/mission-router.js](app/js/lib/mission-router.js)
- Delete [app/js/__tests__/mission-router.test.js](app/js/__tests__/mission-router.test.js) — or migrate any unique assertions into workflow-engine.test.js
- Remove script tag from `app/index.html`, `app/sw.js`, `scripts/build.js`
- Remove the Schematic center-prompt call if it also talks to MissionRouter (audit needed — see open question)
- **Invariant:** zero callers of MissionRouter left
- Exit criteria: `grep -rn MissionRouter app/ scripts/` returns nothing

### PR D — Kill MissionRunner ephemeral-blueprint fallback
- Remove the "last resort: create a minimal agent config from name alone" block at [mission-runner.js:99-109](app/js/lib/mission-runner.js:99)
- Tighten the agent-resolution chain: if no `agent` after the three lookup paths, fail fast with a clear error
- Covered by the new `spaceship_id` NOT NULL invariant — every Run is on a Ship, so the Ship's crew is always available
- Exit criteria: MissionRunner has a single agent-resolution path (Ship crew → State → Supabase), no ephemeral fallback

## Open questions (decide before coding)

### Q1 — Ship chats as Missions: keep them forever, or ephemeralize?
Every ship chat becomes a Mission Run. Two philosophies:
- **(a) Keep.** Every ship chat is a permanent audit record. Missions view fills up fast. Search becomes important.
- **(b) Ephemeralize.** Runs with `mission_id = null` and `metadata.source = 'prompt_panel'` auto-delete after N days. Keeps the Missions view clean.

Leaning **(b)** — add a `expires_at` column on `mission_runs` with a nightly pg_cron cleanup. But that's a follow-up; default to (a) for PR B.

### Q2 — Schematic center-prompt: same treatment?
The Schematic view's reactor core also accepts prompts. Does it go through the same adapter? Probably yes — same rule: all ship prompts create Mission Runs. Worth confirming during PR B.

### Q3 — Streaming results during a running Mission Run
Prompt-panel shows token-by-token streaming from `MissionRouter.route` via the `onChunk` callback. Mission Runs currently don't stream — they write progress %. To preserve chat UX, PR B needs either:
- **(a)** Stream via State — MissionRunner exposes an `onChunk` hook that the prompt-panel listens to for this run
- **(b)** Stream via Supabase realtime — subscribe to `ship_log` rows tagged with `mission_id`, render them as they arrive

Leaning **(a)** for implementation simplicity — same process, direct callback. (b) is cleaner architecturally but adds a realtime-channel dependency. Defer.

### Q4 — Router-picked agent identity in Mission metadata
`MissionRouter.route` returns `{ routing: { agentId, agentName, reasoning } }` so the chat UI can display "NICE → ResearchBot: I picked this because…". Post-fold-in, the triage node's output should carry the same info in its metadata. WorkflowEngine's node result needs a shape that carries both the output text AND the routing reasoning, so the UI can still show it. Confirm shape during PR A.

### Q5 — Orchestration-mode UI: keep or simplify?
The current prompt-panel has a mode toggle (auto/pipeline/parallel/hierarchical/loop). Few users understand these modes. Post-fold-in, we have a clean opportunity to:
- **(a) Keep the toggle** — advanced users who understand DAG patterns can still pick
- **(b) Drop the toggle** — always use triage (auto). Advanced patterns move into Mission Composer where the user actually builds the DAG

Leaning **(b)** — simpler UX, and the patterns are better expressed in the Composer where you can see the graph. But that's a UX call for you.

## What this unlocks

After D ships:
- One execution pipeline (WorkflowEngine) for everything
- Cancel button works on every prompt everywhere
- Missions view = canonical "what is happening / has happened on this Ship"
- Analytics, token budgets, model intel all account for every prompt
- MissionRouter (725 lines) and its test (unknown LOC) deleted — smaller codebase

Estimated scope: ~600 LOC added (node types + tests), ~900 LOC deleted (MissionRouter + mission-router.test.js + ephemeral fallback). Net −300 LOC.

## Not in this work (explicit non-goals)

- **AgentExecutor abort** — adding mid-tool-call cancellation is a separate PR (would require SSE abort signal from `nice-ai` edge function).
- **Server-side scheduler** — `MissionScheduler` → pg_cron on `missions.schedule` is a separate concern.
- **Mission Composer UI** — the DAG builder for templates is its own feature, downstream of this fold-in.
- **`missions.outcome_spec` surfacing** — still stored, still no UI. Wait for a concrete first use case.

## Decision I need from you before PR A

**Q5 is the only hard fork** — keep the orchestration-mode toggle in prompt-panel, or drop it in favor of "always triage"? Q1–Q4 I can call on my own during implementation. Your call shapes PR B's UX scope.
