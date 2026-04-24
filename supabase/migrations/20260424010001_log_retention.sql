-- Clear accumulated dev-loop noise from error_log + add daily retention
-- jobs for both log tables. Findings from the 2026-04-24 audit:
--   * error_log: 134 rows, 100% from localhost dev sessions (CallMode /
--     realtime-collision / "Script error." noise) — safe to truncate.
--   * audit_log: 15K+ rows growing unbounded (~1.1K/day) with no policy.
--
-- Retention windows:
--   * error_log → 30 days (short-lived debugging window)
--   * audit_log → 90 days (compliance/investigation cushion)
--
-- Jobs run daily at 03:00 UTC (low-traffic window). Idempotent: rerunning
-- the migration unschedules any existing job with the same name first.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

TRUNCATE TABLE public.error_log;

CREATE OR REPLACE FUNCTION public.prune_old_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.error_log WHERE created_at < NOW() - INTERVAL '30 days';
  DELETE FROM public.audit_log WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$;

-- Remove any prior schedule with this name so the migration is idempotent.
DO $$
BEGIN
  PERFORM cron.unschedule('prune_old_logs')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune_old_logs');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'prune_old_logs',
  '0 3 * * *',
  $$SELECT public.prune_old_logs()$$
);
