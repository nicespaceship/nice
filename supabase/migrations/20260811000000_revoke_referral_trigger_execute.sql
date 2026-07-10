-- Revoke anon/authenticated EXECUTE on public.handle_new_user_referral.
--
-- The 20260809000000 referral migration created this SECURITY DEFINER trigger
-- function without revoking the default EXECUTE grants, so PUBLIC, anon, and
-- authenticated all inherited it (live ACL confirmed 2026-07-10). This is the
-- same drift class the #829 sweep closed; that sweep predates this function.
-- Practical exposure is low (trigger-returning functions are not invocable via
-- PostgREST /rest/v1/rpc), but it breaks the exactly-one anon-executable
-- SECURITY DEFINER baseline the nightly audit diffs against.
--
-- Trigger firing is unaffected: Postgres checks EXECUTE on trigger functions
-- at CREATE TRIGGER time, not at fire time. #829 applied the same revoke to
-- six other trigger functions with no signup regression.

REVOKE EXECUTE ON FUNCTION public.handle_new_user_referral() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_referral() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_referral() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user_referral() TO service_role;

DO $smoke$
BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.handle_new_user_referral()', 'EXECUTE'),
    'smoke: anon still has EXECUTE on handle_new_user_referral';
  ASSERT NOT has_function_privilege('authenticated', 'public.handle_new_user_referral()', 'EXECUTE'),
    'smoke: authenticated still has EXECUTE on handle_new_user_referral';
  ASSERT has_function_privilege('service_role', 'public.handle_new_user_referral()', 'EXECUTE'),
    'smoke: service_role lost EXECUTE on handle_new_user_referral';
  ASSERT (SELECT count(*) FROM pg_trigger WHERE tgname = 'on_auth_user_created_referral') = 1,
    'smoke: referral signup trigger missing after revoke';
END
$smoke$;
