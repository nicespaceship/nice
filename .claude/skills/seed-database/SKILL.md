---
name: seed-database
description: Seed or reseed Supabase tables from the JS client-side seed arrays. Use when tables are empty or need refreshing.
disable-model-invocation: true
---

# Seed Database

Populate Supabase tables from the existing client-side seed data in `app/js/views/blueprints.js`.

## Supabase Project
- **Project ID**: `txprptdrnsansjfoysjx`

## Steps

1. **Check current state**: Run `list_tables` on schemas `['public']` with `verbose: false` to see existing tables
2. **Count existing rows**:
   ```sql
   SELECT 'agent_blueprints' as tbl, count(*) FROM agent_blueprints
   UNION ALL SELECT 'spaceship_blueprints', count(*) FROM spaceship_blueprints
   UNION ALL SELECT 'fleet_blueprints', count(*) FROM fleet_blueprints;
   ```
3. **If tables are empty or need reseeding**:
   - Read `BlueprintsView.SEED` from `app/js/views/blueprints.js` for agent data (241 rows)
   - Read `BlueprintsView.SPACESHIP_SEED` for spaceship data (45 rows)
   - Read `BlueprintsView.FLEET_SEED` for fleet data (12 rows)
   - Generate INSERT SQL from the JS arrays
   - **Batch inserts**: Agent blueprints must be split into batches of ~40 rows to stay under parameter size limits. Use parallel agents for speed.
   - Execute via `execute_sql` on project `txprptdrnsansjfoysjx`
4. **Verify**: Re-run the count query to confirm all rows inserted

## Table Schemas

### agent_blueprints
`id TEXT PK, name, category, rarity, rating, downloads, description, art, flavor, card_num, agent_type, tags TEXT[], caps TEXT[], stats JSONB, config JSONB`

### spaceship_blueprints
`id TEXT PK, name, category, class, tier, flavor, caps TEXT[], stats JSONB, card_num, tags TEXT[], description`

### fleet_blueprints
`id TEXT PK, name, category, fleet_tier, flavor, caps TEXT[], stats JSONB, card_num, tags TEXT[], description, composition JSONB`

## Notes
- Escape single quotes in SQL strings (use `''` or `E'...'` syntax)
- Fleet and spaceship seeds are small enough for single inserts
- Agent seed (241 rows) MUST be batched — single insert will exceed limits
- Run `get_advisors` with type `security` after seeding to check for RLS issues
