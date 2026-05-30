# NICE‑1 Phase 0 Spec — capture funnel + router seam + consent

**Status:** Proposed — design review before any DDL or edge-function edit.
**Parent:** [`nice-1-roadmap.md`](nice-1-roadmap.md).
**Principle:** zero user-visible change. Phase 0 makes every consented call a clean training asset and installs the routing seam. Routing still sends 100% to frontier; capture is the only new behavior.

## Scope

Three deliverables, one `nice-ai` refactor plus one migration:

1. **Consent** — `profiles.training_consent` + UI toggle + ToS/privacy copy.
2. **Capture** — versioned training-event records written to Cloudflare R2 from `nice-ai`.
3. **Router seam** — a `pick_model()` indirection inside `nice-ai`, returning the current model today.

Out of scope: any model training, any routing-away-from-frontier, the curation pipeline, the eval harness. Those are Phases 2+.

## 1. Consent

### Migration (spec — verify `profiles` columns before writing DDL)

`supabase/migrations/<timestamp>_training_consent.sql`:

```sql
alter table public.profiles
  add column if not exists training_consent boolean not null default false,
  add column if not exists training_consent_at timestamptz,
  add column if not exists training_consent_version text;
```

- **Opt-in:** default `false`. No call is captured until the user flips it on.
- `training_consent_version` ties the grant to the ToS/policy version in force at consent time, so a future policy change can re-prompt cleanly.
- Global — no regional column, because the policy is uniform (hard opt-in everywhere).

> Migrations flow through CI only (see CLAUDE.md). Write the file, commit, push; the `supabase-migrate` Action applies it. Do **not** use the MCP `apply_migration` for committed migrations.

### UI

- A toggle in Settings (and a one-line ask in onboarding): "Help improve NICE — let NICE learn from your missions to build faster, cheaper models. You can turn this off anytime." Wire to `profiles.training_consent` via `SB.db()`.
- Writing `true` stamps `training_consent_at = now()` and the current `training_consent_version`.

### Enforcement

Consent is checked **server-side in `nice-ai`**, never trusted from the client. The capture write is gated on the authenticated user's `training_consent` row. No consent → no capture, full stop.

## 2. Capture — the training-event record

`nice-ai` already authenticates the user (`auth.getUser()`) and brokers the provider call. After a successful call, if the user has consent, it appends one record to R2.

### Store

- **Cloudflare R2** (already on Cloudflare), append-only, **date-partitioned**: `s3://nice-training/v1/dt=YYYY-MM-DD/<uuid>.jsonl` (batch to Parquet downstream in Phase 2).
- **Not** Supabase Postgres. OLTP is the wrong store for an append-only training log and would buckle at volume. `fuel_usage` stays the billing ledger; this is a separate concern.

### Event schema (`schema_version: 1`)

```jsonc
{
  "schema_version": 1,
  "event_id": "uuid",
  "ts": "2026-05-29T12:34:56Z",
  "user_id": "uuid",                 // for deletion/opt-out honoring, not for training
  "surface": "web" | "electron" | "ios" | "windows",
  "model": "claude-4.6-sonnet",      // the teacher that actually answered
  "provider": "anthropic",
  "request": {
    "system": "…",                   // resolved system prompt
    "messages": [ … ],               // resolved context sent to the provider
    "tools": [ … ],                  // tool schemas offered
    "params": { "temperature": 0.7, "max_tokens": 1024 }
  },
  "response": {
    "text": "…",
    "tool_calls": [ … ],             // structured tool invocations the model emitted
    "finish_reason": "stop"
  },
  "join_keys": {
    "mission_run_id": "uuid|null",   // → mission_runs.status (outcome label)
    "ship_log_id": "uuid|null",
    "agent_id": "uuid|null",
    "spaceship_id": "uuid|null"
  },
  "quality": {
    "persona_judgment_id": "uuid|null"  // → persona_judgments (reward signal)
  }
}
```

### PII redaction (at capture time, before the write)

- Run a redaction pass over `request`/`response` text: emails, phone numbers, API keys/secrets (defense-in-depth even though NICE holds provider keys, not user keys), and obvious credential patterns → replaced with typed placeholders (`<EMAIL>`, `<PHONE>`, `<SECRET>`).
- `user_id` is retained **only** to honor deletion/opt-out requests (GDPR erasure), and is stripped before any training set is built.
- Document the redaction rules in the spec so Phase 2 curation can extend them.

### Outcome backfill

`mission_run_id` lets Phase 2 join the trace to its final `mission_runs.status` after the run completes — the outcome isn't known at capture time, so it's a downstream join, not an inline field.

## 3. Router seam

Introduce one indirection in `nice-ai` so the model choice becomes a function, not a hardcoded branch:

```ts
// today
function pickModel(req: Request, enabled: EnabledModels): Route {
  // returns exactly what nice-ai resolves today — no change in behavior
  return { provider, model, fallback: null };
}
```

- Every provider dispatch goes through `pickModel()`. Today it returns the current resolution. Later it can return `{ provider: "nice-1", model: "nice-1-v0", fallback: { provider, model } }` and a shadow flag.
- This is purely structural in Phase 0 — same outputs, same behavior. It exists so Phases 4–5 are a change to *one function*, not a rewrite.

## Execution order

1. `npx supabase functions download nice-ai` — pull the real current source (it's gitignored; not on disk). Read it before editing.
2. Write + commit the `training_consent` migration; let CI apply it.
3. Add the Settings/onboarding consent toggle (client).
4. Refactor `nice-ai`: extract `pickModel()`; add the consent-gated R2 capture write; deploy with `--no-verify-jwt` (ES256 gateway rule, see CLAUDE.md).
5. Provision the R2 bucket + credentials as Supabase secrets.
6. Verify end-to-end: a consented call lands one redacted record in R2; a non-consented call lands nothing; behavior is otherwise unchanged.

## Exit gate

- Consented calls across web + Electron write versioned, PII-redacted records to R2 with correct join keys.
- Non-consented users produce zero capture.
- `pickModel()` is the sole model-resolution path and routes 100% to frontier.
- No user-visible behavior change; tests green.

## Verification checklist (pre-implementation)

- [ ] Confirm actual `profiles` columns (don't assume) before writing the migration.
- [ ] Confirm R2 is provisioned / decide bucket naming.
- [ ] Confirm `nice-ai` deploy flags (`--no-verify-jwt`) still current.
- [ ] Legal: confirm ToS/privacy copy for training use + the free-vs-paid consent default.
