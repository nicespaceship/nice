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
# 1. Run tier 2 to see the umbrella's actual tool list
SUPABASE_USER_JWT=<token> node tools/mcp-smoke/run.mjs hubspot
# inspect tools/mcp-smoke/.cache/hubspot.json for the names

# 2. Pick a tool that:
#    - is read-only
#    - returns deterministic data (an account/profile/owner is ideal)
#    - takes no required input, OR takes input that's safe with empty/known values

# 3. Drop a JSON file matching the provider slug
cat > tools/mcp-smoke/providers/hubspot.json <<'JSON'
{ "tool": "list_owners", "input": {} }
JSON

# 4. Re-run; should print `tier 3: list_owners ok`
SUPABASE_USER_JWT=<token> node tools/mcp-smoke/run.mjs hubspot
```

## What "introspective" means here

Examples of safe choices (verify against each MCP's actual surface):

- HubSpot: `list_owners` / `get_owner` — the account's owner records
- Linear: `viewer` / `me` — the authenticated user
- Notion: `get_self` / `users.me` — the bot's user record
- GitHub: `get_me` / `get_authenticated_user`
- Stripe: `retrieve_account` (read-only on the connected account)
- Slack: `auth_test` / `users_me`
- Google Workspace: `gmail.users.getProfile` (own profile)
- Microsoft 365: `me` (own user)
- Linear, Klaviyo, Sentry, etc.: each provider has its own "me/whoami"
  equivalent — pick from the actual tool list.

Anything that creates / updates / deletes / sends — **don't**.
