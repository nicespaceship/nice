-- Lock down marketplace_listings / marketplace_reviews for the community
-- publish flow. These tables exist in production but were never codified in
-- the migrations directory — this migration captures the current shape
-- (for branch DBs) and tightens the RLS gaps audit turned up:
--
--   1. UNIQUE (blueprint_id, author_id) on listings — today nothing stops
--      the same user from publishing duplicate listings for the same
--      blueprint. 0 duplicates exist at migration time.
--   2. INSERT on listings requires that the inserter owns the blueprint.
--      The existing ALL policy only checked author_id = auth.uid(), which
--      meant a user could publish a listing for someone else's blueprint
--      as long as they claimed authorship on the listing row itself.
--   3. SELECT on reviews is narrowed to reviews of published listings.
--      USING (true) leaked reviews of unpublished/removed listings.
--   4. INSERT on reviews blocks self-reviews (user = blueprint creator).
--      Today an author can rate their own blueprint to inflate its score.
--
-- Policies are dropped + recreated rather than stacked because RLS is
-- permissive (OR-combined) — adding a stricter policy alongside a looser
-- one doesn't tighten anything. `updated_at` is added to reviews so edits
-- are observable. The 8 existing NULL-author listings (migrated from
-- Forge) stay locked to service_role — `auth.uid() = author_id` never
-- matches NULL, so no regular user can touch them.
--
-- Counter atomicity (`downloads`, `rating_count` race conditions) is a
-- separate concern handled in Stage B1 via RPCs.

BEGIN;

-- ── marketplace_listings ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.marketplace_listings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id  TEXT REFERENCES public.blueprints(id) ON DELETE CASCADE,
  author_id     UUID REFERENCES auth.users(id),
  title         TEXT NOT NULL,
  description   TEXT,
  category      TEXT DEFAULT 'agent',
  tags          TEXT[] DEFAULT '{}',
  version       TEXT DEFAULT '1.0.0',
  downloads     INTEGER DEFAULT 0,
  rating        NUMERIC DEFAULT 0,
  rating_count  INTEGER DEFAULT 0,
  status        TEXT DEFAULT 'published'
                CHECK (status IN ('draft', 'published', 'unlisted', 'removed')),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;

-- 0 duplicate pairs at migration time — verified by audit query.
ALTER TABLE public.marketplace_listings
  DROP CONSTRAINT IF EXISTS marketplace_listings_blueprint_author_key;
ALTER TABLE public.marketplace_listings
  ADD CONSTRAINT marketplace_listings_blueprint_author_key
  UNIQUE (blueprint_id, author_id);

-- Queries filter by (blueprint_id, status) when resolving a listing sidecar
-- to a blueprint row. Current table has no supporting index.
CREATE INDEX IF NOT EXISTS marketplace_listings_blueprint_status_idx
  ON public.marketplace_listings (blueprint_id, status);

-- Drop old permissive policies before recreating with tighter scopes.
DROP POLICY IF EXISTS marketplace_listings_author_manage ON public.marketplace_listings;
DROP POLICY IF EXISTS marketplace_listings_public_read   ON public.marketplace_listings;

CREATE POLICY marketplace_listings_public_read
  ON public.marketplace_listings
  FOR SELECT
  USING (status = 'published');

-- Authors can see their own listings regardless of status (drafts etc.).
CREATE POLICY marketplace_listings_author_read
  ON public.marketplace_listings
  FOR SELECT
  USING (auth.uid() = author_id);

-- INSERT requires: (1) claiming own authorship, (2) owning the referenced
-- blueprint. The EXISTS sub-select enforces publisher == blueprint creator.
CREATE POLICY marketplace_listings_author_insert
  ON public.marketplace_listings
  FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.blueprints
      WHERE id = blueprint_id AND creator_id = auth.uid()
    )
  );

-- UPDATE: author can edit title/description/tags/status. WITH CHECK also
-- ensures the new blueprint_id (if changed) still points at one of the
-- author's own blueprints, so a listing can't be re-homed to someone
-- else's blueprint mid-lifetime.
CREATE POLICY marketplace_listings_author_update
  ON public.marketplace_listings
  FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.blueprints
      WHERE id = blueprint_id AND creator_id = auth.uid()
    )
  );

CREATE POLICY marketplace_listings_author_delete
  ON public.marketplace_listings
  FOR DELETE
  USING (auth.uid() = author_id);


-- ── marketplace_reviews ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.marketplace_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  UUID REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id),
  rating      INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Add updated_at column if the table already existed without it.
ALTER TABLE public.marketplace_reviews
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.marketplace_reviews ENABLE ROW LEVEL SECURITY;

-- UNIQUE(listing_id, user_id) already exists per the live schema dump.
-- Repeat defensively so branch DBs get the same shape.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketplace_reviews_listing_id_user_id_key'
  ) THEN
    ALTER TABLE public.marketplace_reviews
      ADD CONSTRAINT marketplace_reviews_listing_id_user_id_key
      UNIQUE (listing_id, user_id);
  END IF;
END $$;

DROP POLICY IF EXISTS marketplace_reviews_public_read ON public.marketplace_reviews;
DROP POLICY IF EXISTS marketplace_reviews_user_manage ON public.marketplace_reviews;

-- Reviews of unpublished / removed listings shouldn't leak.
CREATE POLICY marketplace_reviews_published_read
  ON public.marketplace_reviews
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_listings
      WHERE id = listing_id AND status = 'published'
    )
  );

-- Self-reviews (author rating their own blueprint) would let publishers
-- inflate ratings. Block via NOT EXISTS on blueprint-creator match.
CREATE POLICY marketplace_reviews_user_insert
  ON public.marketplace_reviews
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.marketplace_listings ml
      JOIN public.blueprints b ON b.id = ml.blueprint_id
      WHERE ml.id = listing_id AND b.creator_id = auth.uid()
    )
  );

CREATE POLICY marketplace_reviews_user_update
  ON public.marketplace_reviews
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY marketplace_reviews_user_delete
  ON public.marketplace_reviews
  FOR DELETE
  USING (auth.uid() = user_id);

COMMIT;
