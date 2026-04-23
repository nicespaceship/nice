-- Admin ops RPCs for the /moderation dashboard (Stage C3.5b)
--
-- Four admin-gated helpers that make the dashboard operationally
-- useful without SQL access:
--
--   admin_reviewer_status()       — is the auto-reviewer armed?
--   admin_pause_reviewer()        — remove the service key from vault
--                                   (trigger falls through to human review)
--   admin_resume_reviewer(key)    — upsert the service key
--   admin_recent_decisions(limit) — newest-first non-pending listings
--                                   with their safety_scores audit
--
-- All four gate on public.is_admin() and run SECURITY DEFINER so they
-- can touch vault.secrets (which isn't directly SELECT'able by
-- authenticated users by default). Key handling never echoes the
-- secret back — admin_reviewer_status reports presence and a masked
-- prefix, not the full value.
--
-- The ops value: 2am incident response doesn't need Supabase Studio.
-- An admin can pause the reviewer from the dashboard, investigate,
-- and resume when safe.

BEGIN;

-- ── admin_reviewer_status ────────────────────────────────────────────
-- RETURNS TABLE column names are intentionally distinct from the
-- vault.decrypted_secrets columns they pull from. RETURNS TABLE
-- names become implicit PL/pgSQL variables that shadow same-name
-- table columns in unqualified refs — hence `key_updated_at`, not
-- `updated_at`.
CREATE OR REPLACE FUNCTION public.admin_reviewer_status()
RETURNS TABLE (
  armed           BOOLEAN,
  endpoint_set    BOOLEAN,
  key_preview     TEXT,
  key_updated_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_url   TEXT;
  v_key   TEXT;
  v_upd   TIMESTAMPTZ;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
  END IF;

  SELECT ds.decrypted_secret INTO v_url
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'community_review_url'
  LIMIT 1;

  SELECT ds.decrypted_secret, ds.updated_at INTO v_key, v_upd
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'community_review_service_key'
  LIMIT 1;

  RETURN QUERY SELECT
    (v_key IS NOT NULL),
    (v_url IS NOT NULL),
    CASE
      WHEN v_key IS NULL THEN NULL
      WHEN length(v_key) <= 8 THEN '…'   -- too short to meaningfully mask
      ELSE substring(v_key FROM 1 FOR 4) || '…' || substring(v_key FROM length(v_key) - 3)
    END,
    v_upd;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reviewer_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reviewer_status() TO authenticated;


-- ── admin_pause_reviewer ─────────────────────────────────────────────
-- Removes the service key from vault. The trigger still fires on new
-- pending_review rows but the dispatch function sees no key and
-- returns without calling pg_net. Submissions queue for human review.
CREATE OR REPLACE FUNCTION public.admin_pause_reviewer()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_deleted_count INT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
  END IF;

  DELETE FROM vault.secrets WHERE name = 'community_review_service_key';
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_pause_reviewer() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_pause_reviewer() TO authenticated;


-- ── admin_resume_reviewer ────────────────────────────────────────────
-- Upserts the service-role key into vault. Admin pastes the real key
-- from Supabase Studio → Settings → API. Returns whether the write
-- succeeded and a masked preview so the UI can confirm without the
-- admin having to re-read the key.
CREATE OR REPLACE FUNCTION public.admin_resume_reviewer(p_service_key TEXT)
RETURNS TABLE (
  armed BOOLEAN,
  key_preview TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_existing_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
  END IF;

  IF p_service_key IS NULL OR length(trim(p_service_key)) < 20 THEN
    RAISE EXCEPTION 'Service key looks too short — expected a JWT-like string' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_existing_id FROM vault.secrets WHERE name = 'community_review_service_key';
  IF v_existing_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_existing_id, p_service_key);
  ELSE
    PERFORM vault.create_secret(
      p_service_key,
      'community_review_service_key',
      'Service-role key for the community-review edge function'
    );
  END IF;

  RETURN QUERY SELECT
    true,
    CASE
      WHEN length(p_service_key) <= 8 THEN '…'
      ELSE substring(p_service_key FROM 1 FOR 4) || '…' || substring(p_service_key FROM length(p_service_key) - 3)
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resume_reviewer(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resume_reviewer(TEXT) TO authenticated;


-- ── admin_recent_decisions ───────────────────────────────────────────
-- Newest-first listings that have exited pending_review. Includes the
-- full safety_scores audit so the UI can expand a row and show every
-- specialist finding + Arbiter output + validator verdict.
CREATE OR REPLACE FUNCTION public.admin_recent_decisions(p_limit INT DEFAULT 50)
RETURNS TABLE (
  listing_id      UUID,
  blueprint_id    TEXT,
  author_email    TEXT,
  title           TEXT,
  status          TEXT,
  review_notes    TEXT,
  policy_version  TEXT,
  safety_scores   JSONB,
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     UUID,
  was_automated   BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT ml.id,
         ml.blueprint_id,
         u.email::TEXT,
         ml.title::TEXT,
         ml.status::TEXT,
         ml.review_notes::TEXT,
         ml.policy_version::TEXT,
         ml.safety_scores,
         ml.reviewed_at,
         ml.reviewed_by,
         (ml.reviewed_by IS NULL)  -- admin decisions set reviewed_by=auth.uid(); automated ones leave it NULL
  FROM public.marketplace_listings ml
  LEFT JOIN auth.users u ON u.id = ml.author_id
  WHERE ml.status IN ('published', 'rejected', 'flagged', 'removed')
    AND ml.reviewed_at IS NOT NULL
  ORDER BY ml.reviewed_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_recent_decisions(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recent_decisions(INT) TO authenticated;

COMMIT;
