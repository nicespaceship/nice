# Supabase migrations

## State (as of 2026-04-23)

All migration files in this directory use the **applied timestamp** from the
live `supabase_migrations.schema_migrations` table as their version prefix.
That means `supabase db push` against the `nice` project
(`zacllshbgmnwsmliteqx`) should see every file as already applied and no-op
cleanly.

## History repair

Prior to 2026-04-23 the repo used round-number timestamps (e.g.
`20260402000001`) that didn't match the actual apply times in the DB.
`supabase db push` treated every file as a new migration and tried to
re-apply, which errored because the schema had already progressed. The
workaround was to skip the CLI entirely and apply via the Supabase MCP's
`apply_migration` tool.

The repair (PR #251) renamed 33 local files to match their DB timestamps
via `git mv`, preserving blame history. One file
(`fix_moderator_blueprints.sql`) was re-applied idempotently via MCP so its
`schema_migrations` row was created, and the local filename was then
aligned to the new row's timestamp.

## DB-only migrations (no local file)

A handful of historical migrations were applied in prod without ever being
committed to this directory. They're real — the schema reflects them — but
there's no file to diff against. If you need to reconstruct any of these
(e.g. for a db-reset workflow), pull the statement from the DB or check git
archaeology:

- `004_mcp_api_connections` (2026-03-23)
- `add_deduct_tokens_function` (2026-03-28)
- `add_marketplace_teams_plugins_v2` (2026-03-28)
- `add_content_queue_columns` (2026-03-29)
- `add_rarity_to_user_agents` (2026-04-02)
- `crew_agents_part1..13`, `crew_agents_part00..12`, `crew_agents_batch_00..01` (2026-04-03; bulk catalog seed)
- `create_shared_blueprints`, `fix_shared_blueprints_rls_and_search_path` (2026-04-03)
- `create_newsletter_subscribers` (2026-04-05)
- `add_output_schema_to_top_10_agents`, `add_workflows_to_top_10_spaceships`, `seed_model_profile_by_rarity_for_all_agents` (2026-04-10)
- `add_persona_*` × 6 (2026-04-10; initial persona seeds, superseded by Tier 2)
- `add_error_log_read_policy` (2026-04-10)
- `community_decision_rpc_fix_ambiguous_v2`, `admin_list_pending_reviews_type_fix`, `admin_reviewer_status_qualify_cols` (2026-04-17; follow-up fixes to the community pipeline)
- `subscriptions_no_bootstrap`, `subscriptions_cancel_at` (2026-04-18; billing follow-ups)
- `fix_inbox_captain_slot_count`, `inbox_captain_react_prompt`, `inbox_captain_try_gemini` (2026-04-23; Captain iteration during the native-tool-use session)

A reasonable future task is to reconstruct these as files in-repo so a
fresh `db reset` can rebuild the full schema locally. Not urgent — no one
runs `db reset` against prod, and local dev uses the MCP for schema
changes.

## Rules going forward

1. **New migrations use the MCP `apply_migration` tool**, not the CLI.
   The tool writes both the SQL and the `schema_migrations` row in one
   step, so there's no drift to accumulate.

2. **Also commit the SQL to this directory** with a filename matching the
   version the MCP assigned. You can fetch the assigned version with
   `list_migrations` right after applying. That keeps the repo as the
   human-readable history even if the MCP is the operational source of
   truth.

3. **Never edit an already-applied migration.** Write a new one that
   reverses or patches the old one.

4. **Code PR first, migration second.** If a PR's code references a new
   column, merge the PR before applying the migration. The code-first
   order means the intermediate state (column missing) fails gracefully
   (DB errors → caught → local fallback) instead of crashing on null.
