-- Guard profiles.is_admin against self-elevation.
--
-- profiles lets owners update their own row (RLS USING auth.uid() = id, no
-- WITH CHECK) and the is_admin column carries no write guard, so the admin flag
-- sat within reach of an ordinary owner update. Every admin_* RPC gates on
-- public.is_admin(), so the flag must be writable by service_role only. This is
-- the hardening follow-up flagged in
-- 20260804000000_restrict_internal_rpcs_to_service_role.sql.
--
-- Fix with a BEFORE INSERT OR UPDATE trigger rather than a column REVOKE: the
-- trigger holds regardless of table-vs-column grant mechanics (a later
-- GRANT ALL can silently re-open a column grant; it cannot bypass the trigger).
-- is_admin is provisioned out of band by service_role; no app RPC sets it, so
-- blocking the two PostgREST request roles breaks nothing. Internal
-- SECURITY DEFINER paths (the signup insert, admin tooling) run as the definer
-- role (current_user = postgres), not anon/authenticated, so they pass. The
-- guard fires only when is_admin actually changes, so ordinary profile edits
-- that echo the unchanged flag are unaffected.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_profile_is_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' AND COALESCE(NEW.is_admin, false) THEN
      RAISE EXCEPTION 'is_admin cannot be set by role %', current_user
        USING errcode = 'insufficient_privilege';
    ELSIF TG_OP = 'UPDATE' AND NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
      RAISE EXCEPTION 'is_admin cannot be changed by role %', current_user
        USING errcode = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_is_admin ON public.profiles;
CREATE TRIGGER guard_profile_is_admin
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_is_admin();

-- Apply-time gate: a simulated authenticated self-update must NOT set is_admin.
-- Impersonate a NON-admin profile owner (set role + jwt claims) and attempt the
-- exact false->true escalation, then assert the guard rejected it. The guard
-- fires only on an actual change, so the test row must start non-admin. On the
-- expected path the caught exception's subtransaction rollback reverts the role,
-- the claims, and the write.
DO $smoke$
DECLARE
  v_uid     uuid;
  v_blocked boolean := false;
BEGIN
  SELECT id INTO v_uid FROM public.profiles WHERE is_admin = false LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE NOTICE 'guard_profile_is_admin smoke skipped: no non-admin profile to test';
    RETURN;
  END IF;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    PERFORM set_config('role', 'authenticated', true);
    -- If the impersonation did not take, the guard is correctly silent and the
    -- test would prove nothing; fail loudly with the actual context instead.
    IF current_user <> 'authenticated' OR auth.uid() IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'smoke setup failed: current_user=%, auth.uid()=% (expected authenticated / %)', current_user, auth.uid(), v_uid;
    END IF;
    UPDATE public.profiles SET is_admin = true WHERE id = v_uid;  -- must be blocked
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_blocked := true;
  END;

  ASSERT v_blocked, 'guard_profile_is_admin did not block an authenticated is_admin escalation';
END
$smoke$;

COMMIT;
