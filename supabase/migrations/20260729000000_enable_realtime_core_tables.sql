-- Enable realtime (postgres_changes) for the core user-owned tables that the
-- client already subscribes to. The supabase_realtime publication was empty
-- (see 20260728000000), so these subscriptions have been silent no-ops: live
-- mission updates, ship-log streaming, and agent/spaceship list refreshes never
-- actually fired. #750 enabled notifications; this enables the rest.
--
-- Each table here was checked to have RLS with a per-user (or per-membership)
-- SELECT scope, so realtime delivers each subscriber only their own rows:
--   mission_runs     — auth.uid() = user_id
--   user_agents      — auth.uid() = user_id
--   user_spaceships  — auth.uid() = user_id
--   ship_log         — spaceship_id IN (own user_spaceships) OR
--                      mission_id IN (own mission_runs)
-- (`fleets` was intentionally excluded — that table was dropped; its stale
-- client subscription is repointed to user_spaceships in the same change.)
--
-- Idempotent: skips any table already in the publication (Postgres has no
-- ADD TABLE IF NOT EXISTS for publications).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mission_runs', 'ship_log', 'user_agents', 'user_spaceships'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
