-- Restrict service-role-only RPCs to the service_role (least privilege).
--
-- These SECURITY DEFINER functions are only ever invoked by edge functions
-- (as service_role) or as the definer of an admin_* wrapper. They inherited the
-- Postgres default PUBLIC EXECUTE grant at CREATE time, so the anon and
-- authenticated PostgREST roles could also call them — the same default-grant
-- gotcha documented in 20260424042155_mission_schedule_pg_cron.sql. Their
-- creating migrations granted service_role but never revoked PUBLIC. There is
-- no blanket GRANT-ON-ALL-FUNCTIONS in the repo, so this REVOKE is durable.
--
--   _community_review_secrets, _community_review_dispatch  (community-review internals)
--   debit_pool          (nice-ai debits with the service key)
--   community_decision  (community-review / admin_* wrappers, called as definer)
--
-- service_role keeps EXECUTE, so every edge-function path is unaffected.
-- Follow-up hardening (separate PR) covers the profiles.is_admin write grant
-- and the broader anon-executable SECURITY DEFINER sweep from the advisor.

BEGIN;

REVOKE EXECUTE ON FUNCTION public._community_review_secrets()                              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._community_review_dispatch()                             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.debit_pool(uuid, text, integer, text, jsonb)            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.community_decision(uuid, text, text, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;

-- Re-assert the intended service_role grant (idempotent) so the lockdown can
-- never strand the edge functions that legitimately call these.
GRANT EXECUTE ON FUNCTION public._community_review_secrets()                              TO service_role;
GRANT EXECUTE ON FUNCTION public._community_review_dispatch()                             TO service_role;
GRANT EXECUTE ON FUNCTION public.debit_pool(uuid, text, integer, text, jsonb)            TO service_role;
GRANT EXECUTE ON FUNCTION public.community_decision(uuid, text, text, jsonb, text, uuid) TO service_role;

-- Verify least privilege took AND that service_role can still call them.
DO $smoke$
BEGIN
  ASSERT NOT has_function_privilege('anon',          'public._community_review_secrets()', 'EXECUTE'),                       'anon still has _community_review_secrets';
  ASSERT NOT has_function_privilege('authenticated', 'public._community_review_secrets()', 'EXECUTE'),                       'authenticated still has _community_review_secrets';
  ASSERT NOT has_function_privilege('anon',          'public._community_review_dispatch()', 'EXECUTE'),                      'anon still has _community_review_dispatch';
  ASSERT NOT has_function_privilege('anon',          'public.debit_pool(uuid,text,integer,text,jsonb)', 'EXECUTE'),          'anon still has debit_pool';
  ASSERT NOT has_function_privilege('authenticated', 'public.debit_pool(uuid,text,integer,text,jsonb)', 'EXECUTE'),          'authenticated still has debit_pool';
  ASSERT NOT has_function_privilege('anon',          'public.community_decision(uuid,text,text,jsonb,text,uuid)', 'EXECUTE'),  'anon still has community_decision';
  ASSERT NOT has_function_privilege('authenticated', 'public.community_decision(uuid,text,text,jsonb,text,uuid)', 'EXECUTE'),  'authenticated still has community_decision';
  ASSERT has_function_privilege('service_role', 'public.debit_pool(uuid,text,integer,text,jsonb)', 'EXECUTE'),               'service_role lost debit_pool';
  ASSERT has_function_privilege('service_role', 'public.community_decision(uuid,text,text,jsonb,text,uuid)', 'EXECUTE'),     'service_role lost community_decision';
  ASSERT has_function_privilege('service_role', 'public._community_review_secrets()', 'EXECUTE'),                            'service_role lost _community_review_secrets';
END
$smoke$;

COMMIT;
