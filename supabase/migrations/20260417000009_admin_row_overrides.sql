-- Admin per-row override RPCs (Stage C3.5d)
--
-- Three narrow, purpose-specific state transitions for the Recent
-- Decisions section of /moderation. Each targets one direction:
--
--   admin_restore_flagged(id)       flagged   → published
--   admin_unpublish_listing(id, r)  published → flagged
--   admin_reopen_rejection(id)      rejected  → pending_review
--
-- Per-transition instead of a generic admin_set_status so each has a
-- defined purpose, a matching audit annotation, and the right
-- blueprints.is_public sync. A generic knob is easier to abuse and
-- harder to log meaningfully.
--
-- Every transition:
--   * Requires is_admin()
--   * Locks the row FOR UPDATE
--   * Requires the current status to match the expected source state
--     (P0001 if not — prevents double-transitions from concurrent
--     admins)
--   * Syncs blueprints.is_public atomically with the listing status
--   * Stamps reviewed_by=auth.uid(), reviewed_at=now(),
--     policy_version='c3.5.admin' so Recent Decisions attributes the
--     action to the admin, not the automated pipeline
--   * Appends to review_notes with a timestamped annotation so the
--     paper trail survives future reviews

BEGIN;

-- ── admin_restore_flagged ────────────────────────────────────────────
-- flagged → published. Use when a listing was auto-flagged by reports
-- or rollback but you've reviewed and determined it should be live.
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
  v_current TEXT;
  v_bp_id   TEXT;
  v_note    TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
  END IF;

  SELECT ml.status, ml.blueprint_id INTO v_current, v_bp_id
  FROM public.marketplace_listings ml WHERE ml.id = p_listing_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing % not found', p_listing_id USING ERRCODE = 'P0002';
  END IF;
  IF v_current <> 'flagged' THEN
    RAISE EXCEPTION 'Listing % is not flagged (current: %)', p_listing_id, v_current USING ERRCODE = 'P0001';
  END IF;

  v_note := E'\n[restore ' || now()::text || '] un-flagged by admin'
            || COALESCE(' — ' || p_notes, '');

  UPDATE public.marketplace_listings ml
  SET status = 'published',
      review_notes = COALESCE(ml.review_notes, '') || v_note,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      policy_version = 'c3.5.admin',
      updated_at = now()
  WHERE ml.id = p_listing_id;

  UPDATE public.blueprints bp
  SET is_public = true, updated_at = now()
  WHERE bp.id = v_bp_id;

  RETURN QUERY SELECT p_listing_id, 'published'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_restore_flagged(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_restore_flagged(UUID, TEXT) TO authenticated;


-- ── admin_unpublish_listing ──────────────────────────────────────────
-- published → flagged (single-row version of the rollback button). Use
-- when one specific approved listing turns out to be problematic and
-- you don't want to roll back everything in a time window.
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
  v_current TEXT;
  v_bp_id   TEXT;
  v_note    TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Unpublish reason required' USING ERRCODE = '22023';
  END IF;

  SELECT ml.status, ml.blueprint_id INTO v_current, v_bp_id
  FROM public.marketplace_listings ml WHERE ml.id = p_listing_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing % not found', p_listing_id USING ERRCODE = 'P0002';
  END IF;
  IF v_current <> 'published' THEN
    RAISE EXCEPTION 'Listing % is not published (current: %)', p_listing_id, v_current USING ERRCODE = 'P0001';
  END IF;

  v_note := E'\n[unpublish ' || now()::text || '] by admin — ' || p_reason;

  UPDATE public.marketplace_listings ml
  SET status = 'flagged',
      review_notes = COALESCE(ml.review_notes, '') || v_note,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      policy_version = 'c3.5.admin',
      updated_at = now()
  WHERE ml.id = p_listing_id;

  UPDATE public.blueprints bp
  SET is_public = false, updated_at = now()
  WHERE bp.id = v_bp_id;

  RETURN QUERY SELECT p_listing_id, 'flagged'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_unpublish_listing(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_unpublish_listing(UUID, TEXT) TO authenticated;


-- ── admin_reopen_rejection ───────────────────────────────────────────
-- rejected → pending_review. Gives the author another shot without
-- requiring them to edit + resubmit. Useful when you realize a
-- rejection was too aggressive.
CREATE OR REPLACE FUNCTION public.admin_reopen_rejection(
  p_listing_id UUID,
  p_notes      TEXT DEFAULT NULL
)
RETURNS TABLE (listing_id UUID, new_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current TEXT;
  v_note    TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
  END IF;

  SELECT ml.status INTO v_current
  FROM public.marketplace_listings ml WHERE ml.id = p_listing_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing % not found', p_listing_id USING ERRCODE = 'P0002';
  END IF;
  IF v_current <> 'rejected' THEN
    RAISE EXCEPTION 'Listing % is not rejected (current: %)', p_listing_id, v_current USING ERRCODE = 'P0001';
  END IF;

  v_note := E'\n[reopen ' || now()::text || '] by admin'
            || COALESCE(' — ' || p_notes, '');

  UPDATE public.marketplace_listings ml
  SET status = 'pending_review',
      review_notes = COALESCE(ml.review_notes, '') || v_note,
      reviewed_by = NULL,  -- clear so Recent Decisions shows the next resolution, not this re-open
      reviewed_at = NULL,
      policy_version = NULL,
      updated_at = now()
  WHERE ml.id = p_listing_id;

  -- blueprints.is_public stays false — it was already false for a rejected
  -- row, and re-opening doesn't make it public until a new decision lands.

  RETURN QUERY SELECT p_listing_id, 'pending_review'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reopen_rejection(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reopen_rejection(UUID, TEXT) TO authenticated;

COMMIT;
