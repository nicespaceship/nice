-- Enable realtime (postgres_changes) for token_balances. The client subscribes to
-- balance changes (nice.js `token-balance` channel, filtered by user_id) to update
-- the wallet/HUD live after Stripe webhook credits and in-app debits, but the table
-- was never added to the supabase_realtime publication, so the subscription has been
-- a silent no-op: balance only refreshed on full page load or the checkout-return
-- focus refetch, never on debits or out-of-band credits.
--
-- RLS is enabled with a per-user SELECT scope (`auth.uid() = user_id`), so realtime
-- delivers each subscriber only their own balance row. REPLICA IDENTITY default(pk)
-- matches the other published user-owned tables; INSERT/UPDATE payloads carry the
-- full new row so the user_id filter resolves (token_balances rows are upserted,
-- never deleted).
--
-- Idempotent: skips if already present (Postgres has no ADD TABLE IF NOT EXISTS for
-- publications). Mirrors 20260729000000_enable_realtime_core_tables.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'token_balances'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.token_balances;
  END IF;
END $$;
