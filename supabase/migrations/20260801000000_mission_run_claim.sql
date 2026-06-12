-- Atomic claim primitive for the headless mission executor (Unit B).
--
-- Phase 1 of server-side scheduled-run execution. tick_mission_schedules
-- already inserts queued mission_runs from cron, but today nothing executes
-- them until a browser opens the Missions tab. A later edge function (the
-- executor) will drain that queue. This migration ships only the DB half it
-- needs: a lease + attempt counter and an atomic claim function. It wires NO
-- cron and makes NO HTTP call, so on its own it changes no runtime behavior.
--
-- claim_mission_runs(p_limit):
--   Atomically grabs up to p_limit claimable SCHEDULED runs (Phase-1 scope:
--   metadata.scheduled='true'), flips them to 'running' under a short lease,
--   and returns the rows. FOR UPDATE SKIP LOCKED makes overlapping drain ticks
--   safe: each row is handed to exactly one caller.
--
--   Claimable =
--     - status='queued'                                  (fresh, never run)
--     - status='running' + metadata.dag_status='yielded' (clean time-yield, resume)
--     - status='running' + lease_expires_at < now()      (crashed mid-run, reclaim)
--   ...with attempts < 3. A clean yield is a continuation, not a retry, so it
--   does NOT spend the attempt budget; only fresh claims and crash reclaims do.
--   status='review' (approval pause) is intentionally NOT claimable: it waits
--   on a human, not the drainer.
--
-- The executor calls this as service_role via PostgREST rpc, so EXECUTE is
-- granted to service_role only and revoked from anon/authenticated/PUBLIC.

BEGIN;

-- ── Claim bookkeeping columns ────────────────────────────────────────
ALTER TABLE public.mission_runs
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0;

-- Partial index for the claim scan: small in-flight set, ordered by created_at.
CREATE INDEX IF NOT EXISTS idx_mission_runs_drain
  ON public.mission_runs (created_at)
  WHERE status IN ('queued', 'running');

-- ── claim_mission_runs ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_mission_runs(p_limit int DEFAULT 5)
RETURNS SETOF public.mission_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_lease_minutes constant int := 5;
  v_max_attempts  constant int := 3;
BEGIN
  IF p_limit IS NULL OR p_limit < 0 THEN p_limit := 0; END IF;

  RETURN QUERY
  UPDATE public.mission_runs mr
     SET status           = 'running',
         lease_expires_at = clock_timestamp() + make_interval(mins => v_lease_minutes),
         -- A clean time-yield is a continuation, not a retry: don't spend the
         -- attempt budget on it. Fresh queued runs and crashed (lease-expired)
         -- reclaims do count.
         attempts         = mr.attempts + CASE
                              WHEN mr.status = 'running'
                               AND mr.metadata->>'dag_status' = 'yielded' THEN 0
                              ELSE 1
                            END,
         updated_at       = clock_timestamp()
   WHERE mr.id IN (
     SELECT c.id
       FROM public.mission_runs c
      WHERE c.metadata->>'scheduled' = 'true'
        AND c.attempts < v_max_attempts
        AND (
              c.status = 'queued'
           OR (c.status = 'running' AND c.metadata->>'dag_status' = 'yielded')
           OR (c.status = 'running' AND c.lease_expires_at IS NOT NULL
                                    AND c.lease_expires_at < clock_timestamp())
            )
      ORDER BY c.created_at
      FOR UPDATE SKIP LOCKED
      LIMIT p_limit
   )
  RETURNING mr.*;
END;
$$;

-- ── Lock down EXECUTE ─────────────────────────────────────────────────
-- Supabase default-grants EXECUTE to anon/authenticated/service_role at
-- creation. Only the backend executor (service_role) may claim runs.
REVOKE EXECUTE ON FUNCTION public.claim_mission_runs(int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_mission_runs(int) TO service_role;

-- ── Smoke test (rolls back the whole migration on failure) ───────────
-- No fixtures needed: limit 0 claims nothing, proving the function plans
-- and executes cleanly.
DO $smoke$
BEGIN
  ASSERT (SELECT count(*) FROM public.claim_mission_runs(0)) = 0,
    'claim_mission_runs(0) should return no rows';
END
$smoke$;

COMMIT;

-- ── Rollback (manual, for reference only) ────────────────────────────
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.claim_mission_runs(int);
--   DROP INDEX IF EXISTS public.idx_mission_runs_drain;
--   ALTER TABLE public.mission_runs DROP COLUMN IF EXISTS attempts;
--   ALTER TABLE public.mission_runs DROP COLUMN IF EXISTS lease_expires_at;
--   COMMIT;
