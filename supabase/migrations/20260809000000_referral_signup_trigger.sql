-- Referral write-path: consume the ?ref= code captured at signup.
--
-- profile.js shares links as  nicespaceship.ai/#/?ref=<first 8 hex chars of
-- the referrer's user id>.  nice.js _captureUTM() already persists `ref` to
-- localStorage, and auth-modal now forwards it as signup metadata
-- (raw_user_meta_data->>'ref').  This trigger resolves that prefix to the
-- referrer and writes the referrals row.
--
-- Server-side by necessity: the referrals INSERT policy is
-- WITH CHECK (auth.uid() = referrer_id), so the *referred* user (the only
-- party present at signup) cannot insert the row from the client. A
-- SECURITY DEFINER trigger is the correct place, and it also blocks bonus
-- farming: the client never gets to name an arbitrary referrer_id.
--
-- Guards: 8-hex-only format (rejects junk and LIKE wildcards), exactly-one
-- match (skips prefix collisions), excludes self-referral, and at most one
-- row per referred user. Verified end-to-end with a BEGIN; ROLLBACK; dry-run.

CREATE OR REPLACE FUNCTION public.handle_new_user_referral()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_ref      text;
  v_count    integer;
  v_referrer uuid;
BEGIN
  v_ref := NEW.raw_user_meta_data->>'ref';
  IF v_ref IS NULL OR v_ref !~ '^[0-9a-f]{8}$' THEN
    RETURN NEW;
  END IF;

  -- Resolve the prefix; only proceed on a single unambiguous, non-self match.
  SELECT count(*) INTO v_count
  FROM auth.users
  WHERE id::text LIKE v_ref || '%' AND id <> NEW.id;
  IF v_count <> 1 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_referrer
  FROM auth.users
  WHERE id::text LIKE v_ref || '%' AND id <> NEW.id;
  IF v_referrer IS NULL THEN
    RETURN NEW;
  END IF;

  -- One referrer per referred user; never double-write.
  IF NOT EXISTS (SELECT 1 FROM public.referrals WHERE referred_id = NEW.id) THEN
    INSERT INTO public.referrals (referrer_id, referred_id, status)
    VALUES (v_referrer, NEW.id, 'pending');
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS on_auth_user_created_referral ON auth.users;
CREATE TRIGGER on_auth_user_created_referral
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_referral();

-- Apply-gate: confirm the function + trigger materialized.
DO $smoke$
BEGIN
  ASSERT (SELECT count(*) FROM pg_proc WHERE proname = 'handle_new_user_referral') = 1,
    'handle_new_user_referral function missing';
  ASSERT (SELECT count(*) FROM pg_trigger WHERE tgname = 'on_auth_user_created_referral') = 1,
    'on_auth_user_created_referral trigger missing';
END;
$smoke$;
