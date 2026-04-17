-- admin_rollback_auto_approvals (Stage C3.5c)
--
-- Incident-response knob for when the reviewer agent auto-approved
-- something it shouldn't have and you notice an hour (or six) later.
-- Flips every AUTO-approval in the last p_hours to status='flagged'
-- and blueprints.is_public=false, hiding them from the community
-- browse surface until a human re-reviews via /moderation.
--
-- Scope intentionally narrow:
--
--   * Only affects listings where reviewed_by IS NULL — the
--     automated path. Admin manual approvals (reviewed_by=auth.uid())
--     are untouched; if you need to undo one of those, use the
--     eventual C3.5d override flow, not a blanket rollback.
--   * Only affects status='published' at time of rollback. Already-
--     rejected / flagged / pending_review rows are left alone.
--   * Time-bounded: p_hours in [1, 168]. A week is the outer limit
--     — if you need longer, the blast radius is wide enough that
--     manual SQL review is the right tool, not a button.
--   * Appends to review_notes so the author / admin sees this
--     wasn't a standalone rejection — it was a bulk rollback tied
--     to an incident.
--   * Blueprints.is_public is flipped in the same function so the
--     browse RLS policy (public_read = is_public=true) hides the
--     affected rows immediately. Keeping that consistent with
--     community_decision's own sync behavior.
--
-- The companion UI (C3.5c in the /moderation dashboard) adds a
-- "Rollback recent auto-approvals" button near the pause/resume
-- controls, since this belongs to the same incident-response
-- surface.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_rollback_auto_approvals(
  p_hours INT DEFAULT 24
)
RETURNS TABLE (
  affected_count INT,
  since          TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since       TIMESTAMPTZ;
  v_count       INT;
  v_annotation  TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
  END IF;

  IF p_hours IS NULL OR p_hours < 1 OR p_hours > 168 THEN
    RAISE EXCEPTION 'p_hours must be between 1 and 168' USING ERRCODE = '22023';
  END IF;

  v_since := now() - (p_hours || ' hours')::interval;
  v_annotation := E'\n[rollback ' || now()::text || '] auto-approval reverted by admin';

  -- Flip the listings. The COALESCE keeps any pre-existing review_notes
  -- (usually null for auto-approvals) and the annotation preserves a
  -- paper trail the moderator sees during re-review.
  UPDATE public.marketplace_listings ml
  SET status       = 'flagged',
      review_notes = COALESCE(ml.review_notes, '') || v_annotation,
      updated_at   = now()
  WHERE ml.status = 'published'
    AND ml.reviewed_by IS NULL
    AND ml.reviewed_at > v_since;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Sync the parent blueprints. The is_public=false flip plus the
  -- public_read RLS (already gated on is_public=true AND status='published')
  -- means these disappear from browse the moment this commits.
  UPDATE public.blueprints bp
  SET is_public  = false,
      updated_at = now()
  WHERE bp.id IN (
    SELECT ml.blueprint_id
    FROM public.marketplace_listings ml
    WHERE ml.status = 'flagged'
      AND ml.reviewed_by IS NULL
      AND ml.reviewed_at > v_since
  );

  RETURN QUERY SELECT v_count, v_since;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_rollback_auto_approvals(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_rollback_auto_approvals(INT) TO authenticated;

COMMIT;
