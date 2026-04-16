-- Atomic counters for community listings
--
-- Today the app recomputes `marketplace_listings.rating` and
-- `marketplace_listings.rating_count` client-side in blueprint-store.js
-- and writes the result back — the inline comment literally acknowledges
-- "a concurrent rating would race." Downloads have the same pattern:
-- fetch current count, write +1.
--
-- This migration removes both races by:
--
--   1. Trigger on marketplace_reviews that recomputes the parent listing's
--      rating / rating_count from the actual review rows on every
--      INSERT / UPDATE / DELETE. Aggregate becomes an emergent property
--      of the reviews table — no way for client math to drift.
--   2. `increment_listing_download(UUID)` RPC that does an atomic
--      UPDATE ... SET downloads = downloads + 1 with a status guard.
--      SECURITY DEFINER so it can bypass RLS for the increment (the
--      listing row is publicly readable anyway, so this leaks nothing).
--
-- The trigger body runs as the table owner, so RLS on marketplace_listings
-- doesn't block the aggregate write. That's intentional — the client only
-- writes a review row; the DB owns the derived columns.

BEGIN;

-- ── Aggregate trigger ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.recompute_listing_rating(p_listing_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.marketplace_listings
  SET rating       = COALESCE((SELECT avg(rating)   FROM public.marketplace_reviews WHERE listing_id = p_listing_id), 0),
      rating_count = COALESCE((SELECT count(*)::int FROM public.marketplace_reviews WHERE listing_id = p_listing_id), 0),
      updated_at   = now()
  WHERE id = p_listing_id;
$$;

CREATE OR REPLACE FUNCTION public.marketplace_reviews_sync_listing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_listing_rating(OLD.listing_id);
    RETURN OLD;
  END IF;

  PERFORM public.recompute_listing_rating(NEW.listing_id);

  -- On UPDATE across listing_ids (shouldn't happen, but defend): recompute
  -- the old listing too so its aggregate doesn't carry a stale vote.
  IF TG_OP = 'UPDATE' AND NEW.listing_id IS DISTINCT FROM OLD.listing_id THEN
    PERFORM public.recompute_listing_rating(OLD.listing_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketplace_reviews_sync_listing_trg ON public.marketplace_reviews;
CREATE TRIGGER marketplace_reviews_sync_listing_trg
AFTER INSERT OR UPDATE OR DELETE ON public.marketplace_reviews
FOR EACH ROW EXECUTE FUNCTION public.marketplace_reviews_sync_listing();

-- Backfill once so any pre-existing reviews are reflected. At migration
-- time there are 0 reviews, so this is a no-op, but it's cheap.
SELECT public.recompute_listing_rating(id) FROM public.marketplace_listings;


-- ── Atomic download counter ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_listing_download(p_listing_id UUID)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count bigint;
BEGIN
  UPDATE public.marketplace_listings
  SET downloads  = COALESCE(downloads, 0) + 1,
      updated_at = now()
  WHERE id = p_listing_id
    AND status = 'published'
  RETURNING downloads INTO new_count;

  RETURN COALESCE(new_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_listing_download(UUID) TO authenticated, anon;

COMMIT;
