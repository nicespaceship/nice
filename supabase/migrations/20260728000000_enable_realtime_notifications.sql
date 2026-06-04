-- Enable realtime (postgres_changes) for the notifications table so the in-app
-- notification store syncs live across tabs and devices, and server-side
-- inserts surface without a reload.
--
-- Context: the supabase_realtime publication was EMPTY — realtime had never
-- been enabled for any table, so every realtime subscription in the client
-- (mission_runs, ship_log, etc.) is currently a silent no-op. This migration
-- only enables it for notifications; reviving the others is tracked separately.
--
-- Privacy: notifications has RLS ("Users manage own notifications":
-- auth.uid() = user_id), and realtime applies RLS per authenticated subscriber,
-- so each client only receives its own notification changes.
--
-- Idempotent: re-running is a no-op once the table is already a publication
-- member (Postgres has no ADD TABLE IF NOT EXISTS for publications).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
