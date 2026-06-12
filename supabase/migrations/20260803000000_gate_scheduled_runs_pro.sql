-- Gate scheduled (headless) mission execution behind NICE Pro.
--
-- See CLAUDE.md → "Mission Ontology (SSOT)" → Schedule, and the Token Credit
-- System / subscription model. Scheduled missions fire server-side via the
-- `tick_mission_schedules` pg_cron job (20260424042155) and execute fully
-- headless via `drain_mission_runs` (20260802000000). Until now that path had
-- NO tier check — any user's scheduled mission fired unattended.
--
-- Product decision (2026-06-12): unattended scheduled execution is a Pro perk,
-- alongside "run a fleet of spaceships." Manual mission runs stay free for
-- everyone; only the automatic, scheduled firing requires Pro.
--
-- This migration CREATE OR REPLACEs `tick_mission_schedules` to enqueue runs
-- only for missions whose owner holds an active Pro subscription. Gating at the
-- ENQUEUE step (not the drain) means a non-Pro user's schedule simply never
-- creates runs — nothing piles up queued, and the drain stays tier-agnostic.
-- The pg_cron job already calls this function by name, so replacing the body in
-- place is sufficient; no re-scheduling needed.
--
-- The Pro predicate mirrors Subscription.isPro() exactly: a user is Pro iff
-- ANY of their subscriptions rows has plan='pro' AND status='active'. This
-- matches the comped founder row (stripe_subscription_id='founder-comp') and
-- every real Stripe Pro sub, and excludes canceled/past_due/trialing-free rows.
--
-- Self-host note: the client `paywallEnabled=false` escape hatch (which makes
-- Subscription.isPro() return true for everyone) is invisible to SQL. A future
-- self-host build that wants everyone-Pro scheduling would gate this on a DB
-- setting instead. Not relevant to the hosted product (paywall on; edge-fn
-- source is proprietary so full self-hosting isn't shipped).

BEGIN;

-- ── tick_mission_schedules (Pro-gated) ───────────────────────────────
-- Identical to 20260424042155 except the candidate SELECT now requires the
-- owning user to hold an active Pro subscription. The EXISTS subquery is not
-- in the outer FROM, so FOR UPDATE SKIP LOCKED still locks only `missions`.
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
       -- Pro gate: only enqueue scheduled runs for missions owned by an
       -- active Pro subscriber. Mirrors Subscription.isPro() aggregation.
       AND EXISTS (
             SELECT 1
               FROM public.subscriptions s
              WHERE s.user_id = missions.user_id
                AND s.plan = 'pro'
                AND s.status = 'active'
           )
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

-- Keep the function locked out of PostgREST (CREATE OR REPLACE preserves
-- existing grants, but re-revoke defensively to match the original posture).
REVOKE EXECUTE ON FUNCTION public.tick_mission_schedules() FROM PUBLIC, anon, authenticated, service_role;

-- ── Smoke-test inside the migration transaction ──────────────────────
-- Side-effect-free: confirms the cron dependency still resolves and that the
-- replaced body actually carries the Pro gate. We do NOT call
-- tick_mission_schedules() here — it would fire real runs for any Pro-owned
-- schedule that matches the apply-time minute. The gate's row-level behaviour
-- is validated by a seeded BEGIN;…ROLLBACK; dry-run (it needs real auth.users /
-- user_spaceships FKs, which a migration must not fabricate).
DO $smoke$
BEGIN
  ASSERT public.cron_matches_now('* * * * *', 'UTC', '2024-01-01T00:00:00Z'::timestamptz);
  ASSERT (
    SELECT pg_get_functiondef('public.tick_mission_schedules()'::regprocedure)
           ILIKE '%public.subscriptions%'
  ), 'tick_mission_schedules is missing the Pro subscription gate';
END
$smoke$;

COMMIT;

-- ── Rollback (manual, for reference only) ────────────────────────────
-- Restore the un-gated body from 20260424042155_mission_schedule_pg_cron.sql
-- (the same CREATE OR REPLACE without the EXISTS subscriptions clause).
