-- Auto-create a profiles row for every new auth.users signup +
-- backfill the 3092 existing users who never got one.
--
-- Context (found 2026-04-23 smoke test): the existing
-- `on_auth_user_created_subscription` trigger provisions a subscriptions
-- row at signup but not a profiles row. Downstream code assumes a
-- profiles row exists — Notify.subscribePush writes push subscription
-- data there, ModelIntel.syncFromServer reads it via `.single()`. With
-- no row, both paths fail (PATCH 400, GET 406) on every bootstrap.
-- Silent today because neither failure blocks the core app, but the
-- logs are noisy and the features are quietly broken.
--
-- Fix: add a second trigger with a dedicated function. Separation
-- of concerns from subscription provisioning — each trigger has one
-- job, which keeps rollback isolated if either surface regresses.
--
-- SECURITY DEFINER: triggers on auth.users run in the auth schema
-- owner context; without definer rights they can't INSERT into
-- public.profiles under normal RLS. search_path is locked so a role
-- with CREATE on public can't shim a fake helper function during
-- trigger execution. Same hardening pattern as the missions
-- updated_at trigger (20260423000001).
--
-- Backfill runs in the same migration so the noise stops for all
-- existing users on the next request, not just new signups.

BEGIN;

-- ── Trigger function ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, plan, xp, fuel_balance, achievements)
  VALUES (
    NEW.id,
    -- Priority: explicit display_name from signup metadata → email
    -- local-part → generic "Pilot" fallback. Matches the display
    -- fallback in ProfileView._renderProfile so the UI and DB agree.
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      split_part(NEW.email, '@', 1),
      'Pilot'
    ),
    'free',
    0,
    1000,         -- default fuel_balance for a free pilot
    '[]'::jsonb   -- achievements jsonb column — empty array
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ── Trigger ──────────────────────────────────────────────────────────
-- AFTER INSERT so auth-side bookkeeping finalizes before we reference
-- NEW.id. Separate from on_auth_user_created_subscription — both fire
-- on the same event; trigger order on the same event is alphabetical
-- in Postgres (on_auth_user_created_profile runs before
-- on_auth_user_created_subscription), which is fine because neither
-- reads from the other's output.
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- ── Backfill existing users ──────────────────────────────────────────
-- 3092 of 3094 users at writing time. ON CONFLICT (id) DO NOTHING
-- keeps the statement idempotent if any were created in the gap
-- between this migration being written and running.
INSERT INTO public.profiles (id, display_name, plan, xp, fuel_balance, achievements)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1), 'Pilot'),
  'free',
  0,
  1000,
  '[]'::jsonb
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

COMMIT;
