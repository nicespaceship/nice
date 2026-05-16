# Tier-3 provider configs

One JSON file per umbrella where we know a safe-read tool that exercises
the gateway → OAuth → upstream chain without polluting account data.

If a file doesn't exist for a provider, the runner only does tier 2
(discover + drift) for it and prints `tier 3: skipped`.

## Shape

```json
{
  "tool": "<tool name as listed by `node ../run.mjs <provider>`>",
  "input": {}
}
```

`tool` is the exact name the upstream MCP exposes. `input` is whatever
that tool needs to succeed without side effects — `{}` for parameter-less
"who am I" style tools, or a known-safe query like `{"query": ""}`.

## How to add a provider

```bash
# 1. Print the umbrella's actual tool surface — names, required inputs, descriptions
SUPABASE_USER_JWT=<token> node tools/mcp-smoke/run.mjs --inspect hubspot

# Or dispatch in CI without copying a JWT:
gh workflow run mcp-smoke.yml --ref <branch> -f args="--inspect hubspot"
# then `gh run view <id> --log` for the output

# 2. Pick a tool that:
#    - is read-only (NOT a create/update/delete/save/send)
#    - returns deterministic data (an account/profile/list of users is ideal)
#    - takes no required input, OR takes input that's safe with empty/known values

# 3. Drop a JSON file matching the provider slug
cat > tools/mcp-smoke/providers/hubspot.json <<'JSON'
{ "tool": "get_user_details", "input": {} }
JSON

# 4. Re-run; should print `tier 3: get_user_details ok`
SUPABASE_USER_JWT=<token> node tools/mcp-smoke/run.mjs hubspot
```

## What "introspective" means here

Examples of safe-read tools confirmed against the live MCPs as of 2026-05-16:

- HubSpot: `get_user_details` ({}) — user + team + hub info
- Notion: `notion-get-users` ({}) — workspace users (≥1, bot user)
- Linear: `list_teams` ({}) — workspace teams (≥1, workspace requires)

Patterns to look for on other providers:

- GitHub: `get_me` / `get_authenticated_user`
- Stripe: `retrieve_account` (read-only on the connected account)
- Slack: `auth_test` / `users_me`
- Google Workspace: `gmail.users.getProfile` (own profile)
- Microsoft 365: `me` (own user)
- Klaviyo, Sentry, etc.: each provider has its own "me/whoami"
  equivalent — pick from the actual `--inspect` output, don't guess.

Anything that creates / updates / deletes / sends — **don't**. In
particular, Linear exposes `save_issue`, `save_project`, `save_document`
with **no required inputs** — calling them with `{}` would create empty
entities. The "required: (none)" filter alone is not safe; read the
description.
