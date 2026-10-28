-- Stop the disk IO drain behind Supabase's 2026-10-27 "Disk IO Budget" warning.
--
-- pg_stat_statements had grown to 4,723 entries. Supabase's monitoring reads
-- that view every minute or two, and on the Micro instance (work_mem 2 MB)
-- each read spilled ~11 MB of temp files to disk: about 1.5 TB since spring,
-- enough to exhaust the daily IO budget and throttle the database. Resetting
-- the view dropped temp writes from ~62 MB per 5 minutes to zero (measured
-- live 2026-10-28). The nightly job now resets it whenever it grows past 500
-- entries, so it never regrows to the size that spills.
--
-- cron.job_run_details had never been pruned: 467k rows, 77 MB, 70% of the
-- database, +2,880 rows a day from the every-minute jobs. It now keeps 7 days.
-- (The 2026-10-28 backlog was cleared by hand the same day.)

CREATE OR REPLACE FUNCTION public.prune_old_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.error_log WHERE created_at < NOW() - INTERVAL '30 days';
  DELETE FROM public.audit_log WHERE created_at < NOW() - INTERVAL '90 days';
  DELETE FROM cron.job_run_details WHERE end_time < NOW() - INTERVAL '7 days';

  -- showtext = false counts entries without loading the query-text file.
  -- Isolated so a failure here can never roll back the log pruning above.
  BEGIN
    IF (SELECT count(*) FROM extensions.pg_stat_statements(false)) > 500 THEN
      PERFORM extensions.pg_stat_statements_reset();
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'prune_old_logs: pg_stat_statements reset skipped: %', SQLERRM;
  END;
END;
$$;

-- CREATE OR REPLACE keeps the function's existing grants; restate the
-- 20260806000000 revocations so this file stands on its own.
REVOKE EXECUTE ON FUNCTION public.prune_old_logs() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prune_old_logs() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prune_old_logs() FROM authenticated;
