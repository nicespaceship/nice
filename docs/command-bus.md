# NICE Command Bus — one registry, four front-ends

**Status:** Proposed 2026-05-30. Design SSOT. No new code yet; the substrate (`ToolRegistry`) already exists and already has one disciplined consumer (`AgentExecutor`). This is a *convergence* plan, not a rewrite.

**Goal:** Define every NICE capability once as a registered command, and let four front-ends dispatch the same command:
1. the top-level NICE chat (natural language),
2. the command palette (Cmd+K),
3. UI buttons,
4. the LLM (tool-call / EXEC).

…and let `WorkflowEngine` compose those same commands into agentic blueprints.

**Non-goal:** Merging the two chat *modes*. Standalone (raw LLM) and Spaceship (agentic) stay architecturally distinct — see the two-modes rule. The bus is orthogonal: raw chat stays raw and fast; it only gains the ability to *dispatch* a command or hand off, not a personality.

## The problem this solves

A capability today is wired separately into each surface that triggers it. "Create a mission" exists in at least three implementations:

- `_executeExec('create_mission', …)` in [`prompt-panel.js`](../app/js/views/prompt-panel.js) — a hand-rolled `switch` that writes `mission_runs` directly, **with no approval gate**.
- `AgentExecutor` tool calls — gated by `approvalMode: 'review'` + `SIDE_EFFECT_PATTERNS` in [`agent-executor.js`](../app/js/lib/agent-executor.js).
- `MissionRunner.run` + the composer UI.

That is N front-ends × M capabilities of bespoke wiring. The symptoms are already visible: the dead-end "build me a spaceship" chip (fixed in #638 by hand-wiring one more intent), the regex pile in `_detectIntent`/`_executeIntent`, and a side-effecting chat path that bypasses the approval gate the agent path enforces.

**The fix is one dispatch layer, not co-locating surfaces.** Even if the chat and the Bridge shared one view, you would still need to translate "build me a spaceship for my bakery" into an action. That translation is the work, and it is identical whether the panels are adjacent or not. Co-locating would also *cost* reach — the NICE chat is a global overlay that floats over every view, so it is already more reachable than any single Bridge tab.

## The substrate already exists

| Piece | File | What it is today | Role in the bus |
|---|---|---|---|
| `ToolRegistry` | `app/js/lib/tool-registry.js` | `register({ id, name, description, schema, execute })` + `resolve`/`list`/`execute`/`getSchemas`/`registerAlias`. Validates on register; alias-resolves friendly names. | **This is the bus.** Carries only agent tools today; extend it to carry every capability. |
| `AgentExecutor` | `app/js/lib/agent-executor.js` | ReAct loop; resolves + executes tools via `ToolRegistry.execute`; enforces the approval gate (`SIDE_EFFECT_PATTERNS`, `approvalMode`, `onApprovalNeeded`). | The one disciplined consumer. The model for how every caller should dispatch. |
| EXEC markers | `app/js/views/prompt-panel.js` | `[EXEC: action \| params]` parsed by `_parseActions`, run by `_executeExec` — a parallel `switch`, no gate. | Collapse onto the bus; delete the switch. |
| `CommandPalette` | `app/js/lib/command-palette.js` | Commands as `{ label, action: () => …, keywords, icon }` thunks + folded-in nav/search. | A human front-end; its `action` thunks become `Bus.execute(id, params)`. |
| `_detectIntent` / `_executeIntent` | `app/js/views/prompt-panel.js` | Regex NL → navigate / open modal / text. | Becomes a thin resolver: phrase → command id + params → `Bus.execute`. |
| `WorkflowEngine` | `app/js/lib/workflow-engine.js` | Sole workflow executor; `agent`/tool nodes. | Composes registry commands into blueprints. |

`ToolRegistry.register` already validates `{ id, name, execute }`, stores a JSON-schema `schema`, and resolves aliases. The shape is right. What it lacks is (a) capabilities beyond agent tools, (b) a notion of which front-ends may call a command, and (c) the approval gate living *in dispatch* rather than only in `AgentExecutor`.

## Target command shape

Extend the existing tool shape with two optional, backward-compatible fields:

```js
ToolRegistry.register({
  id:          'create-mission',         // verb-noun, kebab
  name:        'Create Mission',          // human label (Cmd+K, alias)
  description: 'Queue a mission run on the active spaceship.',
  schema:      { type: 'object', properties: { title: {…}, agent: {…} }, required: ['title'] },
  surfaces:    ['human', 'agent'],        // NEW — which front-ends may dispatch. Default ['agent'].
  sideEffect:  true,                       // NEW — routes through the approval gate. Default: inferred from name via SIDE_EFFECT_PATTERNS.
  execute:     async (input, ctx) => { … } // ctx carries user, approvalMode, onApprovalNeeded
});
```

Existing agent tools default to `surfaces: ['agent']` and keep working untouched. The two new fields are the whole API delta.

## Three disciplines (or it's just a bigger switch statement)

1. **Commands declare their params.** Already true on `ToolRegistry` (`schema`). Validate at the dispatch edge so the LLM, Cmd+K, and a button all call a command the same way. An untyped `dispatch(string, anyObject)` is worse than explicit wiring — nobody can discover what exists.
2. **Handlers self-register with their subsystem.** `missions.js` registers `create-mission`; `blueprints.js` registers `publish-blueprint`. The registry is an index, not a 2,000-line home. Browser/media/MCP tools already do this; built-ins currently sit in `tool-registry.js` and can stay or move.
3. **Side-effecting commands inherit the approval gate.** The gate moves into `execute()` dispatch so *every* caller inherits it — closing today's gap where EXEC and the palette and `_executeIntent` write data without the `review`-mode prompt the agent path shows.

## Phases (each with an exit gate)

### Phase 0 — Bus shape + gate-in-dispatch
Add `surfaces` + `sideEffect` to `ToolRegistry`; lift the approval gate out of `AgentExecutor` into a dispatch wrapper all callers share. Existing tools default to agent-only, side-effect inferred from `SIDE_EFFECT_PATTERNS`.
**Exit:** a side-effecting command invoked outside `AgentExecutor` triggers the same approval prompt the agent path shows; all existing agent-tool tests pass unchanged.

### Phase 1 — Collapse EXEC onto the bus
`_executeExec` delegates to `Bus.execute`; register the handful of EXEC actions (`create_mission`, …) as real commands; delete the parallel `switch`.
**Exit:** every EXEC action resolves through `ToolRegistry`; the duplicate `mission_runs` write in `prompt-panel.js` is gone; chat mission-create now hits the gate. No user-visible change except the added gate.

### Phase 2 — Register Bridge capabilities
Each Bridge panel self-registers its verbs: `open-schematic`, `create-mission`, `query-operations`, `publish-blueprint`, `run-workflow`, `open-crew-designer`, `open-outbox`, `open-log`, … with `surfaces` set per command (most start `['human']`; opt into `'agent'` deliberately).
**Exit:** each capability is callable from Cmd+K **and** chat **and** (where opted in) the LLM, defined in exactly one place.

### Phase 3 — Chat NL becomes a resolver
`_detectIntent` returns `{ commandId, params }`; `_executeIntent` becomes `Bus.execute`. Keep a fast deterministic path for obvious phrases; fall to LLM tool-calling only when intent is ambiguous (protects raw-chat latency). The #638 crew-designer intent is the first to move.
**Exit:** the regex pile is a thin resolver over the registry; adding a command needs no new intent branch for exact-match phrases.

### Phase 4 — Palette + buttons converge
`CommandPalette` `action` thunks become `() => Bus.execute(id)`; the noisiest UI button handlers call `Bus.execute` instead of inlining logic.
**Exit:** a capability added once appears in chat, Cmd+K, and its button with no extra wiring.

### Phase 5 — Workflows compose bus commands
`WorkflowEngine` tool/agent nodes dispatch registry commands, so a blueprint can sequence UI/Bridge commands, not only agent tools (e.g. `create-mission → run-workflow → notify`).
**Exit:** a blueprint workflow drives multi-step work through the bus end to end.

## Open decisions

| Decision | Recommendation | Note |
|---|---|---|
| Command visibility default | `['human']`; opt into `'agent'` explicitly | Safety: the LLM shouldn't be able to call every UI verb by default. |
| LLM dispatch format | Migrate EXEC text-markers → provider-native tool-calling over time | `AgentExecutor` already uses tool-call blocks; EXEC is the text fallback. |
| Fast path vs LLM fallback | Deterministic match for exact verbs; LLM only for ambiguous NL | Caps raw-chat latency; avoids a tool-loop on every turn. |
| `id` convention | `verb-noun`, kebab (`create-mission`, `open-schematic`) | Mirrors existing tool ids (`web-search`, `code-gen`). |

## Why this is the standards-correct path

Add a capability once → it is instantly available to humans, natural language, and agents, with one place to test. It preserves the two-modes rule. It is incrementally adoptable because the bus already exists and already has a disciplined consumer — so each phase ships behind an exit gate with no big-bang. The failure mode to avoid is an untyped god-switch; the three disciplines above are what keep it a bus and not a regression.
