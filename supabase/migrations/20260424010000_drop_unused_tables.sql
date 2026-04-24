-- Drop three unused tables identified by 2026-04-24 Supabase audit:
--
--   * api_connections — zero rows, only referenced from db-types.d.ts (stale)
--   * teams           — zero rows, zero code references
--   * team_members    — zero rows, zero code references
--
-- Teams / team_members were scaffolded for a multi-seat feature that never
-- shipped; api_connections was deprecated when the model-selector design
-- replaced per-user API keys (NICE became the LLM provider, users don't
-- bring their own keys anymore).
--
-- Using IF EXISTS so re-running the migration on a clean clone is a no-op.
-- CASCADE drops any FK pointers from the (already empty) child tables.

DROP TABLE IF EXISTS public.team_members CASCADE;
DROP TABLE IF EXISTS public.teams CASCADE;
DROP TABLE IF EXISTS public.api_connections CASCADE;
