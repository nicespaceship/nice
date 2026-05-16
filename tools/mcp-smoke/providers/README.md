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

Safe-read tools confirmed against the live MCPs as of 2026-05-16:

- HubSpot: `get_user_details` ({}) — user + team + hub info
- Notion: `notion-get-users` ({}) — workspace users (≥1, bot user)
- Linear: `list_teams` ({}) — workspace teams (≥1, workspace requires)
- Google Gmail: `gmail_list_labels` ({}) — system labels (INBOX, SENT, DRAFT) always present
- Google Calendar: `calendar_list_calendars` ({}) — primary calendar always present
- Google Drive: `drive_search_files` ({}) — no filter, returns array (possibly empty on fresh drive)
- Microsoft 365: `outlook_list_folders` ({}) — mail folders (Inbox always present)
- GitHub: `get_me` ({}) — authenticated user details
- Replicate: `get_account` ({}) — connected account info
- Atlassian: `atlassianUserInfo` ({}) — "Get current user info"
- Slack: `slack_read_user_profile` ({}) — current user profile (defaults to caller)
- Cloudflare (+ cf-observability + cf-builds + cf-browser): `accounts_list` ({}) — accounts on the connected token (≥1)
- Klaviyo: `klaviyo_get_account_details` ({ model: "other" }) — account details. The `model` field is the calling-LLM enum, not a Pydantic class; valid values are claude/gpt/gemini/other.

### Pattern for new providers

Each provider has its own "me/whoami" or "list one of the always-present
things" equivalent. Always run `--inspect <slug>` first, then pick from
the actual surface. When a required field's accepted values aren't
obvious from the description, run `--describe <provider> <tool>` to dump
the full inputSchema (Klaviyo's `model` enum was hidden behind a generic
`required: [model]` row — `--describe` surfaced the four valid values).

Anything that creates / updates / deletes / sends — **don't**. In
particular, Linear exposes `save_issue`, `save_project`, `save_document`
with **no required inputs** — calling them with `{}` would create empty
entities. The "required: (none)" filter alone is not safe; read the
description.
