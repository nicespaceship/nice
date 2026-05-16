# MCP smoke runner

Layer 2 of the three-layer MCP testing plan. Per-umbrella functional smoke
against the live `mcp-gateway`, with schema-drift detection between runs.

Layer 1 ([tools/blueprint-validate/](../blueprint-validate/)) is the
declarative check that runs in CI on every PR. Layer 2 (this directory)
is the runtime check that verifies the upstream MCPs are still healthy
and the tools we *think* exist actually do.

## What it does

For one umbrella per invocation:

1. Looks up the caller's `mcp_connections` row for the provider (RLS-scoped).
2. Calls `mcp-gateway` with `action: 'discover'` → tool list + input schemas.
3. Hashes the tool signatures, compares to `.cache/<provider>.json` from the last run.
4. Reports `no drift` / `DRIFT detected (added / removed / schema changed)`.

Catches: OAuth token rot, upstream tool rename/removal, gateway routing
regressions, schema changes that would silently break our seed prompts.

Does NOT yet do tier 3 (functional `call_tool` against sentinel data) —
that's the next iteration, gated on creating a "NICE-Smoke" record in
each provider account.

## How to run

```bash
# 1. Sign in at https://nicespaceship.ai (any account with the MCP connected)
# 2. DevTools → Application → Local Storage → `nice-auth` → copy `access_token`
# 3. Run against any wired provider:
SUPABASE_USER_JWT=eyJ... node tools/mcp-smoke/run.mjs hubspot
SUPABASE_USER_JWT=eyJ... node tools/mcp-smoke/run.mjs notion
SUPABASE_USER_JWT=eyJ... node tools/mcp-smoke/run.mjs cf-browser
```

JWTs expire after one hour. If you see 401s, refresh the browser session
and re-copy.

The first run for any provider creates the cache file and reports
`(first run — caching)`. Subsequent runs compare against it.

Exit codes: 0 pass, 1 functional failure (network / auth / drift not
itself a failure exit), 2 misuse.

## Open follow-ups (not in v1)

- **Tier 3 — functional `call_tool` check.** Add a per-provider config
  (`providers/<slug>.json` with `{ tool, input, assert }`) and a sentinel
  record in the upstream provider. Each smoke run also fires one known-safe
  tool call and asserts on response shape.
- **CI wiring.** A nightly GH Action that fans out across the 19 wired
  umbrellas and posts a summary issue if anything red. Needs an auth
  strategy — either a long-lived service-account JWT (cleaner) or a
  refresh-token exchange (cheaper). Decide and wire after tier 3 lands.
- **Drift severity.** Today any drift logs without changing exit code.
  Once we have a baseline of expected churn, decide whether drift should
  fail (exit 1) by default or only on `removed` tools.
- **Tests for the runner itself.** The hashing/drift logic is pure
  compute and worth a vitest; deferred until the script grows.
