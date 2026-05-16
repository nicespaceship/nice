-- Server-side mission scheduling via pg_cron.
--
-- See CLAUDE.md → "Mission Ontology (SSOT)" → Schedule primitive. Closes
-- the last Pending row in the ontology migration: the localStorage
-- MissionScheduler is replaced by a pg_cron job that ticks every minute
-- and creates mission_runs from active missions whose cron expression
-- matches the current wall-clock in the schedule's timezone.
--
-- Schedule JSONB shape (allowed by the existing missions_schedule_shape
-- CHECK constraint requiring an object):
--   { "cron": "0 9 * * *", "tz": "America/Los_Angeles", "enabled": true }
--   cron    — standard 5-field expression (minute hour dom month dow).
--             Supports: literals, *, */N, N/M, N-M, and N,M,O lists.
--             DOM/DOW follow Vixie OR semantics.
--   tz      — IANA timezone. Defaults to UTC when absent or empty.
--   enabled — optional. Missing/true → fires. False → paused.
--
-- Dedupe: missions.last_scheduled_run_at holds the floor-to-minute
-- timestamp of the most recent auto-fire. Guards against double-fire if
-- two ticks ever collide within the same minute.
--
-- Safety: tick_mission_schedules uses FOR UPDATE SKIP LOCKED and a
-- per-mission EXCEPTION handler so a single malformed schedule can't
-- block the rest of the tick. All three public.* helpers have their
-- default PUBLIC EXECUTE revoked so PostgREST can't expose them; the
-- pg_cron job runs as postgres and doesn't need the grant.

BEGIN;

-- ── missions.last_scheduled_run_at ───────────────────────────────────
-- Floor-to-minute timestamp of the most recent auto-fire. NULL if never
-- fired. Updated inside tick_mission_schedules in the same transaction
-- that creates the run.
ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS last_scheduled_run_at timestamptz;

-- ── _cron_field_matches (helper) ─────────────────────────────────────
-- Matches one field of a 5-field cron expression against an integer
-- value in [min_val, max_val]. Returns FALSE on any unparseable form
-- rather than raising — the caller treats that as "don't fire".
CREATE OR REPLACE FUNCTION public._cron_field_matches(
  field text, val int, min_val int, max_val int
) RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  terms text[];
  term text;
  step_parts text[];
  range_parts text[];
  step_val int;
  base text;
  range_start int;
  range_end int;
BEGIN
  IF field IS NULL OR field = '' THEN RETURN FALSE; END IF;
  terms := string_to_array(field, ',');

  FOREACH term IN ARRAY terms LOOP
    term := trim(term);
    IF term = '*' THEN
      RETURN TRUE;
    END IF;

    IF position('/' IN term) > 0 THEN
      step_parts := string_to_array(term, '/');
      IF array_length(step_parts, 1) <> 2 THEN CONTINUE; END IF;
      base := step_parts[1];
      BEGIN
        step_val := step_parts[2]::int;
      EXCEPTION WHEN others THEN CONTINUE;
      END;
      IF step_val <= 0 THEN CONTINUE; END IF;

      IF base = '*' THEN
        range_start := min_val;
        range_end   := max_val;
      ELSIF position('-' IN base) > 0 THEN
        range_parts := string_to_array(base, '-');
        IF array_length(range_parts, 1) <> 2 THEN CONTINUE; END IF;
        BEGIN
          range_start := range_parts[1]::int;
          range_end   := range_parts[2]::int;
        EXCEPTION WHEN others THEN CONTINUE;
        END;
      ELSE
        BEGIN
          range_start := base::int;
        EXCEPTION WHEN others THEN CONTINUE;
        END;
        range_end := max_val;
      END IF;

      IF val >= range_start AND val <= range_end
         AND ((val - range_start) % step_val) = 0 THEN
        RETURN TRUE;
      END IF;
      CONTINUE;
    END IF;

    IF position('-' IN term) > 0 THEN
      range_parts := string_to_array(term, '-');
      IF array_length(range_parts, 1) <> 2 THEN CONTINUE; END IF;
      BEGIN
        range_start := range_parts[1]::int;
        range_end   := range_parts[2]::int;
      EXCEPTION WHEN others THEN CONTINUE;
      END;
      IF val >= range_start AND val <= range_end THEN
        RETURN TRUE;
      END IF;
      CONTINUE;
    END IF;

    BEGIN
      IF val = term::int THEN RETURN TRUE; END IF;
    EXCEPTION WHEN others THEN CONTINUE;
    END;
  END LOOP;

  RETURN FALSE;
END;
$$;

-- ── cron_matches_now ─────────────────────────────────────────────────
-- TRUE iff `cron_expr` matches the wall-clock at `now_utc` in `tz`.
-- Vixie DOM/DOW semantics: if both are restricted, match is OR.
-- STABLE rather than IMMUTABLE because timezone rules can shift at DST
-- boundaries in ways Postgres can't introspect statically.
CREATE OR REPLACE FUNCTION public.cron_matches_now(
  cron_expr text, tz text, now_utc timestamptz
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  parts text[];
  local_ts timestamp;
  minute_val int; hour_val int; dom_val int; month_val int; dow_val int;
BEGIN
  IF cron_expr IS NULL THEN RETURN FALSE; END IF;
  parts := regexp_split_to_array(trim(cron_expr), '\s+');
  IF array_length(parts, 1) <> 5 THEN RETURN FALSE; END IF;

  local_ts := (now_utc AT TIME ZONE COALESCE(NULLIF(tz, ''), 'UTC'));
  minute_val := EXTRACT(minute FROM local_ts)::int;
  hour_val   := EXTRACT(hour   FROM local_ts)::int;
  dom_val    := EXTRACT(day    FROM local_ts)::int;
  month_val  := EXTRACT(month  FROM local_ts)::int;
  dow_val    := EXTRACT(dow    FROM local_ts)::int;

  IF NOT public._cron_field_matches(parts[1], minute_val, 0, 59) THEN RETURN FALSE; END IF;
  IF NOT public._cron_field_matches(parts[2], hour_val,   0, 23) THEN RETURN FALSE; END IF;
  IF NOT public._cron_field_matches(parts[4], month_val,  1, 12) THEN RETURN FALSE; END IF;

  IF parts[3] = '*' AND parts[5] = '*' THEN RETURN TRUE; END IF;
  IF parts[3] = '*' THEN
    RETURN public._cron_field_matches(parts[5], dow_val, 0, 6);
  END IF;
  IF parts[5] = '*' THEN
    RETURN public._cron_field_matches(parts[3], dom_val, 1, 31);
  END IF;

  RETURN public._cron_field_matches(parts[3], dom_val, 1, 31)
      OR public._cron_field_matches(parts[5], dow_val, 0, 6);
EXCEPTION WHEN others THEN
  RETURN FALSE;
END;
$$;

-- ── tick_mission_schedules ───────────────────────────────────────────
-- Fires every minute from pg_cron. Creates a queued mission_run for
-- each active mission whose schedule matches the current wall-clock.
-- Per-mission exception handler + FOR UPDATE SKIP LOCKED keep one bad
-- row from blocking the tick and prevent double-processing across
-- overlapping ticks.
--
-- Runs as the pg_cron owner (postgres on Supabase), so RLS is bypassed.
-- mission_runs.user_id is copied from the template so the end user
-- still sees their own runs via their normal SELECT policy.
CREATE OR REPLACE FUNCTION public.tick_mission_schedules()
RETURNS integer
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  m RECORD;
  fired_count int := 0;
  now_utc timestamptz := clock_timestamp();
  current_minute timestamptz := date_trunc('minute', now_utc);
  new_run_id uuid;
  is_enabled boolean;
BEGIN
  FOR m IN
    SELECT id, user_id, spaceship_id, title, plan, schedule, last_scheduled_run_at
      FROM public.missions
     WHERE state = 'active'
       AND schedule IS NOT NULL
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      is_enabled := COALESCE((m.schedule->>'enabled')::boolean, TRUE);
      IF NOT is_enabled THEN CONTINUE; END IF;

      IF m.last_scheduled_run_at IS NOT NULL
         AND m.last_scheduled_run_at >= current_minute THEN
        CONTINUE;
      END IF;

      IF NOT public.cron_matches_now(
               m.schedule->>'cron',
               m.schedule->>'tz',
               now_utc) THEN
        CONTINUE;
      END IF;

      INSERT INTO public.mission_runs (
        user_id, spaceship_id, mission_id, plan_snapshot, status, title,
        priority, progress, metadata, created_at, updated_at
      )
      VALUES (
        m.user_id, m.spaceship_id, m.id, m.plan, 'queued', m.title,
        'medium', 0,
        jsonb_build_object(
          'scheduled', true,
          'cron',      m.schedule->>'cron',
          'tz',        COALESCE(m.schedule->>'tz', 'UTC'),
          'fired_at',  now_utc
        ),
        now_utc, now_utc
      )
      RETURNING id INTO new_run_id;

      UPDATE public.missions
         SET last_scheduled_run_at = current_minute
       WHERE id = m.id;

      fired_count := fired_count + 1;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'tick_mission_schedules: mission % failed: %', m.id, SQLERRM;
    END;
  END LOOP;

  RETURN fired_count;
END;
$$;

-- ── Lock the helpers out of PostgREST ────────────────────────────────
-- Supabase default-grants EXECUTE on `public.*` functions to anon,
-- authenticated, and service_role at creation time, so `REVOKE ... FROM
-- PUBLIC` alone leaves them exposed on /rest/v1/rpc/*. Revoke from each
-- role explicitly. pg_cron runs as postgres (owner) and isn't affected.
REVOKE EXECUTE ON FUNCTION public.tick_mission_schedules()                  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.cron_matches_now(text, text, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public._cron_field_matches(text, int, int, int)  FROM PUBLIC, anon, authenticated, service_role;

-- ── Smoke-test the matcher inside the migration transaction ──────────
-- Anything that fails here rolls back the whole migration.
-- 2024-01-01T00:00:00Z is a known Monday (dow=1). January is standard
-- time in the US (America/New_York = UTC-5).
DO $smoke$
BEGIN
  -- field matcher
  ASSERT public._cron_field_matches('*', 30, 0, 59);
  ASSERT public._cron_field_matches('30', 30, 0, 59);
  ASSERT NOT public._cron_field_matches('30', 29, 0, 59);
  ASSERT public._cron_field_matches('0,15,30,45', 30, 0, 59);
  ASSERT NOT public._cron_field_matches('0,15,30,45', 29, 0, 59);
  ASSERT public._cron_field_matches('10-20', 15, 0, 59);
  ASSERT NOT public._cron_field_matches('10-20', 21, 0, 59);
  ASSERT public._cron_field_matches('*/5', 30, 0, 59);
  ASSERT NOT public._cron_field_matches('*/5', 29, 0, 59);
  ASSERT public._cron_field_matches('5/10', 25, 0, 59);
  ASSERT NOT public._cron_field_matches('5/10', 20, 0, 59);
  ASSERT NOT public._cron_field_matches('bogus', 0, 0, 59);

  -- cron_matches_now
  ASSERT public.cron_matches_now('* * * * *', 'UTC', '2024-01-01T00:00:00Z'::timestamptz);
  ASSERT public.cron_matches_now('0 0 * * *', 'UTC', '2024-01-01T00:00:00Z'::timestamptz);
  ASSERT NOT public.cron_matches_now('1 0 * * *', 'UTC', '2024-01-01T00:00:00Z'::timestamptz);
  ASSERT public.cron_matches_now('0 0 * * 1', 'UTC', '2024-01-01T00:00:00Z'::timestamptz);     -- Monday
  ASSERT NOT public.cron_matches_now('0 0 * * 2', 'UTC', '2024-01-01T00:00:00Z'::timestamptz); -- Tuesday

  -- Vixie OR: dom=1 AND dow=6; only dom matches, but OR → TRUE.
  ASSERT public.cron_matches_now('0 0 1 * 6', 'UTC', '2024-01-01T00:00:00Z'::timestamptz);

  -- Timezone: 9am EST (UTC-5 in Jan) = 14:00 UTC.
  ASSERT public.cron_matches_now('0 9 * * *', 'America/New_York', '2024-01-01T14:00:00Z'::timestamptz);
  ASSERT NOT public.cron_matches_now('0 9 * * *', 'UTC', '2024-01-01T14:00:00Z'::timestamptz);

  -- Invalid input fails closed.
  ASSERT NOT public.cron_matches_now(NULL, 'UTC', '2024-01-01T00:00:00Z'::timestamptz);
  ASSERT NOT public.cron_matches_now('not a cron', 'UTC', '2024-01-01T00:00:00Z'::timestamptz);
  ASSERT NOT public.cron_matches_now('* * * *', 'UTC', '2024-01-01T00:00:00Z'::timestamptz); -- 4 fields
END
$smoke$;

-- ── Register the pg_cron job (idempotent) ────────────────────────────
DO $schedule$
DECLARE
  existing_jobid bigint;
BEGIN
  SELECT jobid INTO existing_jobid
    FROM cron.job
   WHERE jobname = 'tick_mission_schedules';
  IF existing_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(existing_jobid);
  END IF;
END
$schedule$;

SELECT cron.schedule(
  'tick_mission_schedules',
  '* * * * *',
  'SELECT public.tick_mission_schedules()'
);

COMMIT;

-- ── Rollback (manual, for reference only) ────────────────────────────
--   BEGIN;
--   SELECT cron.unschedule('tick_mission_schedules');
--   DROP FUNCTION IF EXISTS public.tick_mission_schedules();
--   DROP FUNCTION IF EXISTS public.cron_matches_now(text, text, timestamptz);
--   DROP FUNCTION IF EXISTS public._cron_field_matches(text, int, int, int);
--   ALTER TABLE public.missions DROP COLUMN IF EXISTS last_scheduled_run_at;
--   COMMIT;
