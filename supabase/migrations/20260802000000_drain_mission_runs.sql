-- Cron drain for the headless mission executor (Unit C, increment 3).
--
-- The final wiring of server-side scheduled-run execution. tick_mission_schedules
-- already inserts queued scheduled runs from cron, Unit B added the atomic claim
-- primitive, and the mission-executor edge function (deployed) drains that queue,
-- walks the DAG, runs agent ReAct loops, and writes results back. But nothing
-- INVOKES the executor on a schedule yet, so cron-inserted runs still sit 'queued'
-- until a browser opens the Missions tab. This closes that gap: a pg_cron job calls
-- drain_mission_runs() every minute, which pg_net-POSTs the executor to drain.
--
-- The drain secret lives ONLY in the vault (generated server-side, never
-- materialized in an env var or anywhere a copy must be kept in sync). Both sides
-- read it from there: drain_mission_runs() reads it directly (SECURITY DEFINER, so
-- it can see the vault schema), and the edge function reads it through the
-- executor_drain_secret() RPC below (the function authenticates as service_role
-- over PostgREST, which does not expose the vault schema). Single source of truth.
--
-- executor_drain_secret():
--   Returns the drain secret from the vault. service_role only. The edge function
--   calls this to learn the value it must match the inbound bearer token against.
--
-- drain_mission_runs():
--   Kicks the executor over HTTP. Reads executor_drain_secret from the vault and
--   POSTs it as a bearer token so the function authenticates the inbound drain.
--   Fire-and-forget: pg_net queues the request and returns a request id immediately.
--
--   Skips the POST when nothing is claimable, to avoid a no-op edge invocation
--   every idle minute. The guard is a deliberate LOOSE SUPERSET of the
--   claim_mission_runs predicate (scheduled + non-terminal + attempts remaining):
--   it must never produce a false negative, so it does NOT mirror the exact
--   yielded / lease-expired sub-conditions. Claimability stays single-sourced in
--   claim_mission_runs; this is only an "is the queue totally idle?" short-circuit.
--
-- Mirrors tick_mission_schedules (the sibling minute job) and the
-- _community_review_dispatch vault + pg_net pattern. EXECUTE is service_role only.

BEGIN;

-- ── executor_drain_secret ────────────────────────────────────────────
-- Hands the vault-stored drain secret to the edge function, which can't read the
-- vault schema over PostgREST. service_role only; the value is already readable by
-- any service_role caller (admin), so this exposes nothing new.
CREATE OR REPLACE FUNCTION public.executor_drain_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, vault, pg_temp
AS $$
  SELECT decrypted_secret
    FROM vault.decrypted_secrets
   WHERE name = 'executor_drain_secret'
   LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.executor_drain_secret() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.executor_drain_secret() TO service_role;

-- ── drain_mission_runs ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.drain_mission_runs()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_secret     text;
  v_request_id bigint;
BEGIN
  -- Nothing to drain? Don't wake the executor. Loose superset of the claim
  -- predicate: scheduled, non-terminal, attempts remaining. Never a false
  -- negative, so claimability stays single-sourced in claim_mission_runs.
  -- status='review' (approval pause) is terminal here: it waits on a human.
  IF NOT EXISTS (
    SELECT 1
      FROM public.mission_runs
     WHERE metadata->>'scheduled' = 'true'
       AND attempts < 3
       AND status IN ('queued', 'running')
  ) THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'executor_drain_secret'
   LIMIT 1;

  -- Secret not provisioned yet (e.g. migration applied before the rotate):
  -- skip quietly rather than POST a kick the function will reject.
  IF v_secret IS NULL THEN
    RAISE NOTICE 'drain_mission_runs: executor_drain_secret missing from vault; skipping drain';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := 'https://zacllshbgmnwsmliteqx.supabase.co/functions/v1/mission-executor',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || v_secret,
                 'Content-Type',  'application/json'
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

-- ── Lock down EXECUTE ─────────────────────────────────────────────────
-- Supabase default-grants EXECUTE to anon/authenticated at creation. Only
-- pg_cron (as postgres) and a manual service_role call may drain.
REVOKE EXECUTE ON FUNCTION public.drain_mission_runs() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.drain_mission_runs() TO service_role;

-- ── Cron: drain every minute, beside tick_mission_schedules ──────────
-- Named schedule upserts by name, so re-applying the migration is idempotent.
SELECT cron.schedule('drain_mission_runs', '* * * * *', 'SELECT public.drain_mission_runs()');

-- ── Smoke test (rolls back the whole migration on failure) ───────────
-- Validates both halves landed WITHOUT firing the HTTP path: the function
-- exists and the cron job is registered exactly once. drain_mission_runs() is
-- intentionally not invoked here — a migration must not POST to the executor.
DO $smoke$
BEGIN
  ASSERT to_regprocedure('public.executor_drain_secret()') IS NOT NULL,
    'executor_drain_secret function should exist';
  ASSERT to_regprocedure('public.drain_mission_runs()') IS NOT NULL,
    'drain_mission_runs function should exist';
  ASSERT (SELECT count(*) FROM cron.job WHERE jobname = 'drain_mission_runs') = 1,
    'drain_mission_runs cron job should be registered exactly once';
END
$smoke$;

COMMIT;

-- ── Rollback (manual, for reference only) ────────────────────────────
--   BEGIN;
--   SELECT cron.unschedule('drain_mission_runs');
--   DROP FUNCTION IF EXISTS public.drain_mission_runs();
--   DROP FUNCTION IF EXISTS public.executor_drain_secret();
--   COMMIT;
