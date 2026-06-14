-- Least-privilege hardening: strip anon/authenticated EXECUTE on SECURITY DEFINER
-- functions that have no legitimate direct client caller in those roles.
--
-- Two shapes of grant are cleaned up here:
--   1. Trigger / maintenance / internal-helper functions that also carry a
--      vestigial PUBLIC EXECUTE grant. Effective privilege is the UNION of
--      role-specific and PUBLIC grants, so the PUBLIC grant must be revoked
--      alongside anon/authenticated or the roles retain EXECUTE via PUBLIC.
--   2. Admin RPCs (and is_admin) that carry no PUBLIC grant; revoking the
--      drifted anon grant alone restores the defining migration's intent.
--
-- service_role and the postgres owner are left untouched throughout.
-- Idempotent: REVOKE on an absent grant is a no-op.

-- Trigger fn (AFTER INSERT/DELETE on community_reports). Not callable as an RPC
-- (trigger-returning); no client/RLS/policy dependency. Clear PUBLIC + both roles.
REVOKE EXECUTE ON FUNCTION public.community_reports_autoflag() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.community_reports_autoflag() FROM anon;
REVOKE EXECUTE ON FUNCTION public.community_reports_autoflag() FROM authenticated;

-- Signup trigger fn on auth.users; fires via trigger machinery as definer, never
-- as a client RPC. Profile creation is independent of these grants.
REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile() FROM authenticated;

-- Signup trigger fn on auth.users (subscription bootstrap); definer-context only,
-- no RPC/RLS caller. Signup unaffected by revoking these grants.
REVOKE EXECUTE ON FUNCTION public.handle_new_user_subscription() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_subscription() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_subscription() FROM authenticated;

-- BEFORE INSERT trigger fn on user_agents; fires under table-owner authority,
-- not EXECUTE. No client/RLS dependency. Clear PUBLIC + both roles.
REVOKE EXECUTE ON FUNCTION public.inherit_user_agent_rarity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inherit_user_agent_rarity() FROM anon;
REVOKE EXECUTE ON FUNCTION public.inherit_user_agent_rarity() FROM authenticated;

-- BEFORE INSERT trigger fn on user_ship_slots; same trigger-machinery rationale.
-- Inheritance keeps working for every INSERT writer regardless of these grants.
REVOKE EXECUTE ON FUNCTION public.inherit_user_ship_slot_role_type() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inherit_user_ship_slot_role_type() FROM anon;
REVOKE EXECUTE ON FUNCTION public.inherit_user_ship_slot_role_type() FROM authenticated;

-- AFTER INSERT/UPDATE/DELETE trigger fn on marketplace_reviews; recompute runs as
-- owner via the trigger. Not RPC-callable; grants are vestigial.
REVOKE EXECUTE ON FUNCTION public.marketplace_reviews_sync_listing() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.marketplace_reviews_sync_listing() FROM anon;
REVOKE EXECUTE ON FUNCTION public.marketplace_reviews_sync_listing() FROM authenticated;

-- Maintenance fn (log retention DELETE); fired by pg_cron as postgres. No client
-- caller, no RLS dependency. Clear PUBLIC + both roles.
REVOKE EXECUTE ON FUNCTION public.prune_old_logs() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prune_old_logs() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prune_old_logs() FROM authenticated;

-- Internal helper called only by the marketplace_reviews_sync_listing definer
-- trigger (runs as owner). No client/RLS caller; anon/auth grants trace to the
-- PUBLIC default. Clear PUBLIC + both roles.
REVOKE EXECUTE ON FUNCTION public.recompute_listing_rating(p_listing_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recompute_listing_rating(p_listing_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recompute_listing_rating(p_listing_id uuid) FROM authenticated;

-- Rate-limit helper invoked only by the community-submit edge function as
-- service_role. No reachable anon/authenticated client caller; revoke PUBLIC + anon.
-- authenticated EXECUTE retained (conservative authenticated_rpc default; explicit
-- grant survives the PUBLIC revoke).
REVOKE EXECUTE ON FUNCTION public.check_publish_rate_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_publish_rate_limit() FROM anon;

-- Admin RPC (is_admin-guarded); sole caller is the authenticated admin Moderation
-- view. No PUBLIC grant; anon is drift. Revoke anon, keep authenticated.
REVOKE EXECUTE ON FUNCTION public.admin_approve_listing(p_listing_id uuid, p_notes text) FROM anon;

-- Admin RPC; only the authenticated admin queue calls it. Revoke drifted anon.
REVOKE EXECUTE ON FUNCTION public.admin_list_pending_reviews() FROM anon;

-- Admin RPC (destructive vault write); is_admin-guarded, authenticated-only caller.
-- Revoke anon as defense-in-depth; keep authenticated.
REVOKE EXECUTE ON FUNCTION public.admin_pause_reviewer() FROM anon;

-- Admin RPC; sole caller is the authenticated admin Moderation view. Revoke anon.
REVOKE EXECUTE ON FUNCTION public.admin_recent_decisions(p_limit integer) FROM anon;

-- Admin RPC (is_admin-guarded); authenticated admin caller only. Revoke drifted anon.
REVOKE EXECUTE ON FUNCTION public.admin_reject_listing(p_listing_id uuid, p_reason text) FROM anon;

-- Admin RPC; authenticated admin Moderation caller only. Revoke drifted anon.
REVOKE EXECUTE ON FUNCTION public.admin_reopen_rejection(p_listing_id uuid, p_notes text) FROM anon;

-- Admin RPC (un-flag + republish); is_admin-guarded, authenticated admin caller.
-- Revoke drifted anon; keep authenticated.
REVOKE EXECUTE ON FUNCTION public.admin_restore_flagged(p_listing_id uuid, p_notes text) FROM anon;

-- Admin RPC (arms reviewer service key); is_admin-guarded, authenticated admin
-- caller. Revoke anon to restore migration intent; keep authenticated.
REVOKE EXECUTE ON FUNCTION public.admin_resume_reviewer(p_service_key text) FROM anon;

-- Admin RPC; authenticated admin Moderation caller only. Revoke drifted anon.
REVOKE EXECUTE ON FUNCTION public.admin_reviewer_status() FROM anon;

-- Admin RPC (is_admin-guarded rollback); authenticated admin caller only. Revoke anon.
REVOKE EXECUTE ON FUNCTION public.admin_rollback_auto_approvals(p_hours integer) FROM anon;

-- Admin RPC; sole caller is the authenticated admin Moderation view. Revoke drifted anon.
REVOKE EXECUTE ON FUNCTION public.admin_unpublish_listing(p_listing_id uuid, p_reason text) FROM anon;

-- is_admin(): only the authenticated post-login flag lookup calls it; not an RLS
-- helper (no policy references it). anon was added out-of-band. Revoke anon, keep
-- authenticated (the legitimate admin lookup runs as authenticated).
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;

-- Fail atomically if any revoked (function, role) still resolves EXECUTE. Because
-- has_function_privilege returns the UNION of role-specific and PUBLIC grants, a
-- TRUE here on a PUBLIC-carrying function would mean the PUBLIC grant survived.
DO $smoke$
BEGIN
  -- community_reports_autoflag(): anon + authenticated revoked
  ASSERT has_function_privilege('anon', 'public.community_reports_autoflag()'::regprocedure, 'EXECUTE') IS FALSE,
    'anon retains EXECUTE on community_reports_autoflag()';
  ASSERT has_function_privilege('authenticated', 'public.community_reports_autoflag()'::regprocedure, 'EXECUTE') IS FALSE,
    'authenticated retains EXECUTE on community_reports_autoflag()';

  -- handle_new_user_profile(): anon + authenticated revoked
  ASSERT has_function_privilege('anon', 'public.handle_new_user_profile()'::regprocedure, 'EXECUTE') IS FALSE,
    'anon retains EXECUTE on handle_new_user_profile()';
  ASSERT has_function_privilege('authenticated', 'public.handle_new_user_profile()'::regprocedure, 'EXECUTE') IS FALSE,
    'authenticated retains EXECUTE on handle_new_user_profile()';

  -- handle_new_user_subscription(): anon + authenticated revoked
  ASSERT has_function_privilege('anon', 'public.handle_new_user_subscription()'::regprocedure, 'EXECUTE') IS FALSE,
    'anon retains EXECUTE on handle_new_user_subscription()';
  ASSERT has_function_privilege('authenticated', 'public.handle_new_user_subscription()'::regprocedure, 'EXECUTE') IS FALSE,
    'authenticated retains EXECUTE on handle_new_user_subscription()';

  -- inherit_user_agent_rarity(): anon + authenticated revoked
  ASSERT has_function_privilege('anon', 'public.inherit_user_agent_rarity()'::regprocedure, 'EXECUTE') IS FALSE,
    'anon retains EXECUTE on inherit_user_agent_rarity()';
  ASSERT has_function_privilege('authenticated', 'public.inherit_user_agent_rarity()'::regprocedure, 'EXECUTE') IS FALSE,
    'authenticated retains EXECUTE on inherit_user_agent_rarity()';

  -- inherit_user_ship_slot_role_type(): anon + authenticated revoked
  ASSERT has_function_privilege('anon', 'public.inherit_user_ship_slot_role_type()'::regprocedure, 'EXECUTE') IS FALSE,
    'anon retains EXECUTE on inherit_user_ship_slot_role_type()';
  ASSERT has_function_privilege('authenticated', 'public.inherit_user_ship_slot_role_type()'::regprocedure, 'EXECUTE') IS FALSE,
    'authenticated retains EXECUTE on inherit_user_ship_slot_role_type()';

  -- marketplace_reviews_sync_listing(): anon + authenticated revoked
  ASSERT has_function_privilege('anon', 'public.marketplace_reviews_sync_listing()'::regprocedure, 'EXECUTE') IS FALSE,
    'anon retains EXECUTE on marketplace_reviews_sync_listing()';
  ASSERT has_function_privilege('authenticated', 'public.marketplace_reviews_sync_listing()'::regprocedure, 'EXECUTE') IS FALSE,
    'authenticated retains EXECUTE on marketplace_reviews_sync_listing()';

  -- prune_old_logs(): anon + authenticated revoked
  ASSERT has_function_privilege('anon', 'public.prune_old_logs()'::regprocedure, 'EXECUTE') IS FALSE,
    'anon retains EXECUTE on prune_old_logs()';
  ASSERT has_function_privilege('authenticated', 'public.prune_old_logs()'::regprocedure, 'EXECUTE') IS FALSE,
    'authenticated retains EXECUTE on prune_old_logs()';

  -- recompute_listing_rating(uuid): anon + authenticated revoked
  ASSERT has_function_privilege('anon', 'public.recompute_listing_rating(uuid)'::regprocedure, 'EXECUTE') IS FALSE,
    'anon retains EXECUTE on recompute_listing_rating(uuid)';
  ASSERT has_function_privilege('authenticated', 'public.recompute_listing_rating(uuid)'::regprocedure, 'EXECUTE') IS FALSE,
    'authenticated retains EXECUTE on recompute_listing_rating(uuid)';

  -- check_publish_rate_limit(): anon revoked (authenticated kept)
  ASSERT has_function_privilege('anon', 'public.check_publish_rate_limit()'::regprocedure, 'EXECUTE') IS FALSE,
    'anon retains EXECUTE on check_publish_rate_limit()';

  -- admin_approve_listing(uuid, text): anon revoked
  ASSERT has_function_privilege('anon', 'public.admin_approve_listing(uuid, text)'::regprocedure, 'EXECUTE') IS FALSE,
    'anon retains EXECUTE on admin_approve_listing(uuid, text)';

  -- admin_list_pending_reviews(): anon revoked
  ASSERT has_function_privilege('anon', 'public.admin_list_pending_reviews()'::regprocedure, 'EXECUTE') IS FALSE,
    'anon retains EXECUTE on admin_list_pending_reviews()';

  -- admin_pause_reviewer(): anon revoked
  ASSERT has_function_privilege('anon', 'public.admin_pause_reviewer()'::regprocedure, 'EXECUTE') IS FALSE,
    'anon retains EXECUTE on admin_pause_reviewer()';

  -- admin_recent_decisions(integer): anon revoked
  ASSERT has_function_privilege('anon', 'public.admin_recent_decisions(integer)'::regprocedure, 'EXECUTE') IS FALSE,
    'anon retains EXECUTE on admin_recent_decisions(integer)';

  -- admin_reject_listing(uuid, text): anon revoked
  ASSERT has_function_privilege('anon', 'public.admin_reject_listing(uuid, text)'::regprocedure, 'EXECUTE') IS FALSE,
    'anon retains EXECUTE on admin_reject_listing(uuid, text)';

  -- admin_reopen_rejection(uuid, text): anon revoked
  ASSERT has_function_privilege('anon', 'public.admin_reopen_rejection(uuid, text)'::regprocedure, 'EXECUTE') IS FALSE,
    'anon retains EXECUTE on admin_reopen_rejection(uuid, text)';

  -- admin_restore_flagged(uuid, text): anon revoked
  ASSERT has_function_privilege('anon', 'public.admin_restore_flagged(uuid, text)'::regprocedure, 'EXECUTE') IS FALSE,
    'anon retains EXECUTE on admin_restore_flagged(uuid, text)';

  -- admin_resume_reviewer(text): anon revoked
  ASSERT has_function_privilege('anon', 'public.admin_resume_reviewer(text)'::regprocedure, 'EXECUTE') IS FALSE,
    'anon retains EXECUTE on admin_resume_reviewer(text)';

  -- admin_reviewer_status(): anon revoked
  ASSERT has_function_privilege('anon', 'public.admin_reviewer_status()'::regprocedure, 'EXECUTE') IS FALSE,
    'anon retains EXECUTE on admin_reviewer_status()';

  -- admin_rollback_auto_approvals(integer): anon revoked
  ASSERT has_function_privilege('anon', 'public.admin_rollback_auto_approvals(integer)'::regprocedure, 'EXECUTE') IS FALSE,
    'anon retains EXECUTE on admin_rollback_auto_approvals(integer)';

  -- admin_unpublish_listing(uuid, text): anon revoked
  ASSERT has_function_privilege('anon', 'public.admin_unpublish_listing(uuid, text)'::regprocedure, 'EXECUTE') IS FALSE,
    'anon retains EXECUTE on admin_unpublish_listing(uuid, text)';

  -- is_admin(): anon revoked (authenticated kept)
  ASSERT has_function_privilege('anon', 'public.is_admin()'::regprocedure, 'EXECUTE') IS FALSE,
    'anon retains EXECUTE on is_admin()';
END $smoke$;
