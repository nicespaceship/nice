-- Pre-D.7: rewrite the six admin / moderation RPCs to query the new
-- agent_blueprints + spaceship_blueprints tables instead of the legacy
-- public.blueprints. D.4-D.6 migrated the edge functions but skipped
-- the SQL RPCs that views/moderation.js calls. Without this rewrite,
-- D.7's DROP TABLE blueprints CASCADE silently breaks the admin
-- moderation queue.
--
-- Pattern mirrors the community-review edge function: a marketplace
-- listing's `category` column ('agent' | 'spaceship') discriminates
-- which new table holds the corresponding blueprint row, and the
-- legacy `is_public boolean` becomes `visibility text` with values
-- 'public' / 'private'.
--
-- IDs on the new tables are uuid; marketplace_listings.blueprint_id
-- is text post-D.6 FK drop, so joins cast id::TEXT for compatibility.

-- ── admin_list_pending_reviews ───────────────────────────────────
-- Returns pending listings enriched with blueprint fields. LEFT JOIN
-- both new tables on category match; COALESCE the columns. The
-- blueprint_type column derives from ml.category since the new tables
-- don't carry a `type` field of their own.
CREATE OR REPLACE FUNCTION public.admin_list_pending_reviews()
RETURNS TABLE (
  listing_id          UUID,
  blueprint_id        TEXT,
  author_id           UUID,
  author_email        TEXT,
  title               TEXT,
  description         TEXT,
  listing_tags        TEXT[],
  listing_created     TIMESTAMPTZ,
  content_hash        TEXT,
  blueprint_name      TEXT,
  blueprint_type      TEXT,
  blueprint_category  TEXT,
  blueprint_config    JSONB,
  blueprint_flavor    TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ml.id,
    ml.blueprint_id,
    ml.author_id,
    u.email::TEXT,
    ml.title::TEXT,
    ml.description::TEXT,
    ml.tags::TEXT[],
    ml.created_at,
    ml.content_hash::TEXT,
    COALESCE(ab.name, sb.name)::TEXT,
    ml.category::TEXT,
    COALESCE(ab.category, sb.category)::TEXT,
    COALESCE(ab.config, sb.config),
    COALESCE(ab.flavor, sb.flavor)::TEXT
  FROM public.marketplace_listings ml
  LEFT JOIN public.agent_blueprints ab
    ON ml.category = 'agent' AND ab.id::TEXT = ml.blueprint_id
  LEFT JOIN public.spaceship_blueprints sb
    ON ml.category = 'spaceship' AND sb.id::TEXT = ml.blueprint_id
  LEFT JOIN auth.users u ON u.id = ml.author_id
  WHERE ml.status = 'pending_review'
  ORDER BY ml.created_at;
END;
$$;

-- ── community_decision ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_decision(
  p_listing_id     UUID,
  p_status         TEXT,
  p_notes          TEXT,
  p_scores         JSONB,
  p_policy_version TEXT,
  p_reviewer_id    UUID DEFAULT NULL
)
RETURNS TABLE (
  listing_id   UUID,
  new_status   TEXT,
  notes        TEXT,
  reviewed_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blueprint_id TEXT;
  v_category     TEXT;
  v_visibility   TEXT;
BEGIN
  IF p_status NOT IN ('published', 'rejected', 'pending_review') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status USING ERRCODE = '22023';
  END IF;

  SELECT ml.blueprint_id, ml.category INTO v_blueprint_id, v_category
  FROM public.marketplace_listings ml
  WHERE ml.id = p_listing_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing % not found', p_listing_id USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1 FROM public.marketplace_listings ml
  WHERE ml.id = p_listing_id AND ml.status = 'pending_review';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing % is not pending_review', p_listing_id USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.marketplace_listings ml
  SET status         = p_status,
      review_notes   = p_notes,
      safety_scores  = COALESCE(p_scores, ml.safety_scores),
      policy_version = p_policy_version,
      reviewed_at    = now(),
      reviewed_by    = p_reviewer_id,
      updated_at     = now()
  WHERE ml.id = p_listing_id;

  v_visibility := CASE WHEN p_status = 'published' THEN 'public' ELSE 'private' END;

  IF v_category = 'agent' THEN
    UPDATE public.agent_blueprints
    SET visibility = v_visibility, updated_at = now()
    WHERE id::TEXT = v_blueprint_id;
  ELSIF v_category = 'spaceship' THEN
    UPDATE public.spaceship_blueprints
    SET visibility = v_visibility, updated_at = now()
    WHERE id::TEXT = v_blueprint_id;
  END IF;

  RETURN QUERY
  SELECT ml.id, ml.status, ml.review_notes, ml.reviewed_at
  FROM public.marketplace_listings ml
  WHERE ml.id = p_listing_id;
END;
$$;

-- ── admin_restore_flagged ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_restore_flagged(
  p_listing_id UUID,
  p_notes      TEXT DEFAULT NULL
)
RETURNS TABLE (listing_id UUID, new_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current  TEXT;
  v_bp_id    TEXT;
  v_category TEXT;
  v_note     TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
  END IF;

  SELECT ml.status, ml.blueprint_id, ml.category
    INTO v_current, v_bp_id, v_category
  FROM public.marketplace_listings ml
  WHERE ml.id = p_listing_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing % not found', p_listing_id USING ERRCODE = 'P0002';
  END IF;
  IF v_current <> 'flagged' THEN
    RAISE EXCEPTION 'Listing % is not flagged (current: %)', p_listing_id, v_current USING ERRCODE = 'P0001';
  END IF;

  v_note := E'\n[restore ' || now()::text || '] un-flagged by admin' || COALESCE(' — ' || p_notes, '');

  UPDATE public.marketplace_listings ml
  SET status        = 'published',
      review_notes  = COALESCE(ml.review_notes, '') || v_note,
      reviewed_by   = auth.uid(),
      reviewed_at   = now(),
      policy_version= 'c3.5.admin',
      updated_at    = now()
  WHERE ml.id = p_listing_id;

  IF v_category = 'agent' THEN
    UPDATE public.agent_blueprints
    SET visibility = 'public', updated_at = now()
    WHERE id::TEXT = v_bp_id;
  ELSIF v_category = 'spaceship' THEN
    UPDATE public.spaceship_blueprints
    SET visibility = 'public', updated_at = now()
    WHERE id::TEXT = v_bp_id;
  END IF;

  RETURN QUERY SELECT p_listing_id, 'published'::TEXT;
END;
$$;

-- ── admin_unpublish_listing ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_unpublish_listing(
  p_listing_id UUID,
  p_reason     TEXT
)
RETURNS TABLE (listing_id UUID, new_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current  TEXT;
  v_bp_id    TEXT;
  v_category TEXT;
  v_note     TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Unpublish reason required' USING ERRCODE = '22023';
  END IF;

  SELECT ml.status, ml.blueprint_id, ml.category
    INTO v_current, v_bp_id, v_category
  FROM public.marketplace_listings ml
  WHERE ml.id = p_listing_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing % not found', p_listing_id USING ERRCODE = 'P0002';
  END IF;
  IF v_current <> 'published' THEN
    RAISE EXCEPTION 'Listing % is not published (current: %)', p_listing_id, v_current USING ERRCODE = 'P0001';
  END IF;

  v_note := E'\n[unpublish ' || now()::text || '] by admin — ' || p_reason;

  UPDATE public.marketplace_listings ml
  SET status        = 'flagged',
      review_notes  = COALESCE(ml.review_notes, '') || v_note,
      reviewed_by   = auth.uid(),
      reviewed_at   = now(),
      policy_version= 'c3.5.admin',
      updated_at    = now()
  WHERE ml.id = p_listing_id;

  IF v_category = 'agent' THEN
    UPDATE public.agent_blueprints
    SET visibility = 'private', updated_at = now()
    WHERE id::TEXT = v_bp_id;
  ELSIF v_category = 'spaceship' THEN
    UPDATE public.spaceship_blueprints
    SET visibility = 'private', updated_at = now()
    WHERE id::TEXT = v_bp_id;
  END IF;

  RETURN QUERY SELECT p_listing_id, 'flagged'::TEXT;
END;
$$;

-- ── admin_rollback_auto_approvals ────────────────────────────────
-- Bulk-flag every auto-approved (reviewed_by IS NULL) listing within
-- the lookback window, then mirror visibility='private' on every
-- corresponding blueprint row in the right new table.
CREATE OR REPLACE FUNCTION public.admin_rollback_auto_approvals(
  p_hours INT DEFAULT 24
)
RETURNS TABLE (affected_count INT, since TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since      TIMESTAMPTZ;
  v_count      INT;
  v_annotation TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
  END IF;
  IF p_hours IS NULL OR p_hours < 1 OR p_hours > 168 THEN
    RAISE EXCEPTION 'p_hours must be between 1 and 168' USING ERRCODE = '22023';
  END IF;

  v_since := now() - (p_hours || ' hours')::interval;
  v_annotation := E'\n[rollback ' || now()::text || '] auto-approval reverted by admin';

  UPDATE public.marketplace_listings ml
  SET status       = 'flagged',
      review_notes = COALESCE(ml.review_notes, '') || v_annotation,
      updated_at   = now()
  WHERE ml.status     = 'published'
    AND ml.reviewed_by IS NULL
    AND ml.reviewed_at > v_since;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.agent_blueprints ab
  SET visibility = 'private', updated_at = now()
  WHERE ab.id::TEXT IN (
    SELECT ml.blueprint_id FROM public.marketplace_listings ml
    WHERE ml.status = 'flagged'
      AND ml.reviewed_by IS NULL
      AND ml.reviewed_at > v_since
      AND ml.category = 'agent'
  );

  UPDATE public.spaceship_blueprints sb
  SET visibility = 'private', updated_at = now()
  WHERE sb.id::TEXT IN (
    SELECT ml.blueprint_id FROM public.marketplace_listings ml
    WHERE ml.status = 'flagged'
      AND ml.reviewed_by IS NULL
      AND ml.reviewed_at > v_since
      AND ml.category = 'spaceship'
  );

  RETURN QUERY SELECT v_count, v_since;
END;
$$;

-- ── check_publish_rate_limit ─────────────────────────────────────
-- Counts the caller's community-scoped blueprint creations in the
-- last 24h across both new tables and returns the remaining budget
-- under a 5-per-day cap.
CREATE OR REPLACE FUNCTION public.check_publish_rate_limit()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM (
    SELECT id FROM public.agent_blueprints
      WHERE creator_id = auth.uid()
        AND scope      = 'community'
        AND created_at > now() - interval '24 hours'
    UNION ALL
    SELECT id FROM public.spaceship_blueprints
      WHERE creator_id = auth.uid()
        AND scope      = 'community'
        AND created_at > now() - interval '24 hours'
  ) AS recent;

  RETURN GREATEST(0, 5 - v_count);
END;
$$;
