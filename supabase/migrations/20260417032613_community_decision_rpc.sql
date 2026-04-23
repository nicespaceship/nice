-- community_decision RPC (Stage C3.2)
--
-- The review edge function orchestrates LLM calls and ends up with a
-- decision record; this RPC applies it atomically to the listing +
-- blueprint pair. Kept out of the edge function body because:
--
--   * RLS on marketplace_listings.UPDATE requires author_id = auth.uid().
--     The reviewer is NOT the author. We need a service-role path that
--     bypasses RLS cleanly and audibly.
--   * The author-facing visibility (blueprints.is_public) needs to stay
--     in sync with the decision: approved → is_public=true, anything
--     else → is_public=false. A single RPC applies both in one txn.
--   * SECURITY DEFINER lets the edge function call this without the
--     edge function itself needing to elevate to service_role for every
--     operation — which would be a bigger blast radius if the edge
--     function were ever compromised.
--
-- Input shape is flat (listing id, status, author-facing note, scores,
-- policy version). The reviewer can embed its full audit (per-agent
-- findings) in p_scores JSONB so ship_log isn't required for v1.
--
-- Allowed status transitions from pending_review:
--   pending_review → published   (approve)
--   pending_review → rejected    (reject)
--   pending_review → pending_review (escalate — unchanged, kept in queue)
-- Anything else is a no-op. The RPC returns the updated row so callers
-- can confirm what landed.

BEGIN;

DROP FUNCTION IF EXISTS public.community_decision(UUID, TEXT, TEXT, JSONB, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.community_decision(
  p_listing_id     UUID,
  p_status         TEXT,     -- 'published' | 'rejected' | 'pending_review'
  p_notes          TEXT,     -- review_notes or rejection reason
  p_scores         JSONB,    -- safety_scores + per-agent findings + arbiter output
  p_policy_version TEXT,     -- git SHA of docs/community-policy.md at review time
  p_reviewer_id    UUID DEFAULT NULL  -- NULL for automated decisions; uuid for manual override
)
RETURNS TABLE (
  -- Named to avoid ambiguity with marketplace_listings.id / .status /
  -- .review_notes — RETURNS TABLE columns become implicit PL/pgSQL
  -- variables, which shadow same-name table columns in unqualified refs.
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
  v_author_id    UUID;
BEGIN
  IF p_status NOT IN ('published', 'rejected', 'pending_review') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status USING ERRCODE = '22023';
  END IF;

  SELECT ml.blueprint_id, ml.author_id INTO v_blueprint_id, v_author_id
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

  UPDATE public.blueprints bp
  SET is_public  = (p_status = 'published'),
      updated_at = now()
  WHERE bp.id = v_blueprint_id;

  RETURN QUERY
  SELECT ml.id, ml.status, ml.review_notes, ml.reviewed_at
  FROM public.marketplace_listings ml
  WHERE ml.id = p_listing_id;
END;
$$;

-- Edge functions run under the service_role key. They're the only
-- intended caller of this RPC; the authenticated grant would mean any
-- client could approve their own listing. Do not grant to authenticated.
REVOKE ALL ON FUNCTION public.community_decision(UUID, TEXT, TEXT, JSONB, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.community_decision(UUID, TEXT, TEXT, JSONB, TEXT, UUID) TO service_role;

COMMIT;
