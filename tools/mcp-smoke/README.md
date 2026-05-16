# MCP smoke runner

Layer 2 of the three-layer MCP testing plan. Per-umbrella functional
smoke against the live `mcp-gateway`.

Layer 1 ([tools/blueprint-validate/](../blueprint-validate/)) is the
declarative check that runs in CI on every PR. Layer 2 (this directory)
is the runtime check that the upstream MCPs are still healthy and the
tools we *think* exist actually do.

## What it does

For one umbrella (or `--all` connected umbrellas) per invocation:

**Tier 2 — always**
1. Looks up the caller's `mcp_connections` row for the provider (RLS-scoped).
2. Calls `mcp-gateway` with `action: 'discover'` → tool list + input schemas.
3. Hashes the tool signatures, compares to `.cache/<provider>.json`.
4. Reports `no drift` / `DRIFT detected (added / removed / schema changed)`.

**Tier 3 — when `providers/<slug>.json` exists**
1. Loads the per-provider config (`{ tool, input }`).
2. Calls `mcp-gateway` with `action: 'invoke'` for that tool.
3. Asserts non-error response. Catches "the tool we think exists
   actually returns valid data."

See [providers/README.md](providers/README.md) for how to pick a
safe-read tool per provider and add its config file.

## How to run locally

```bash
# 1. Sign in at https://nicespaceship.ai (any account with MCPs connected)
# 2. DevTools → Application → Local Storage → `nice-auth` → copy `access_token`
# 3. Run against one provider:
SUPABASE_USER_JWT=eyJ... node tools/mcp-smoke/run.mjs hubspot

# Or all connected providers (mirrors what nightly CI does):
SUPABASE_USER_JWT=eyJ... node tools/mcp-smoke/run.mjs --all
```

JWTs expire after one hour. If you see 401s, refresh the browser
session and re-copy.

## CI

The nightly GH Action [`.github/workflows/mcp-smoke.yml`](../../.github/workflows/mcp-smoke.yml)
runs `--all` against your prod connections at 06:00 UTC and on manual
dispatch. Setup:

1. Make sure your nicespaceship.ai account has a password set (not
   OAuth-only). If you signed in with Google, set one via the Supabase
   dashboard → Authentication → Users → your row → "Send password
   recovery", or just complete the email-link flow once.
2. In the repo's Settings → Secrets and variables → Actions, add two
   new secrets:
   - `SUPABASE_USER_EMAIL` — your account email
   - `SUPABASE_USER_PASSWORD` — your account password
3. Actions tab → MCP smoke → **Run workflow** to verify before relying
   on the cron.

Each CI run signs in fresh, so there's no token rotation or expiry to
manage. If you change your password, update the secret.

> **Note on `SUPABASE_REFRESH_TOKEN`** — the runner still supports the
> refresh-token path for local use, but it's brittle in CI: Supabase
> rotates refresh tokens on each exchange (10s reuse window), so the
> second nightly run with the same stored token fails. Email + password
> is the right pattern for unattended runs.

## Exit codes

| Code | Meaning |
|---:|---|
| 0 | All smoked umbrellas passed |
| 1 | One or more umbrellas failed (auth, network, drift-removed, tier-3 invoke error) |
| 2 | Misuse — missing required env or provider arg |

## Open follow-ups

- **Drift severity policy.** Today any drift logs without changing
  exit code (only tier-3 errors fail). Once we see real churn, decide
  whether `removed` tools should fail by default.
- **Issue-on-failure.** Workflow failures only show in the Actions
  tab today. If we want auto-filed GH issues, add `permissions: issues:
  write` and a `gh issue create` step on failure.
- **Tests for the runner.** The hash/drift logic is pure compute and
  worth a vitest; deferred until the script grows.
