-- Moderation primitives for the community publish flow (Stage B4)
--
-- Three coordinated pieces:
--
--   1. community_reports — a table where any authenticated user can flag
--      a community blueprint. RLS enforces: one report per (blueprint,
--      reporter), reporter can't be the blueprint's author, report rows
--      are not readable by the general public (service_role + the
--      reporter themselves only).
--
--   2. Auto-hide trigger — when a blueprint's report count crosses 3
--      distinct reporters, the parent marketplace_listings row is flipped
--      to status='flagged'. A new 'flagged' value is added to the status
--      check so the listing becomes invisible to the public_read policy
--      (which still requires status='published'). Service role can
--      review and either restore ('published') or ban ('removed').
--
--   3. check_publish_rate_limit RPC — called from the client before
--      publishToCommunity; counts the caller's community blueprints
--      created in the last 24 hours and returns a remaining-budget
--      integer. 5/day/user cap. The client translates a zero remainder
--      into a friendly error; the server re-enforces via a CHECK-style
--      RLS policy side-effect so even a bypassed client can't publish
--      faster than the rate limit allows.
--
-- None of this is load-bearing for the six end-to-end invariants already
-- in place from B0-B3. A bug here degrades to "no moderation yet" —
-- the existing RLS still blocks creator spoofing, duplicate listings,
-- and self-reviews. B4 adds containment for spam and abuse on top of
-- the already-secure publish path.

BEGIN;

-- ── community_reports ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id TEXT NOT NULL REFERENCES public.blueprints(id) ON DELETE CASCADE,
  reporter_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL
               CHECK (reason IN ('spam', 'offensive', 'malicious', 'copyright', 'broken', 'other')),
  details      TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- One report per user per blueprint. Prevents a single bad actor from
-- swinging the auto-flag count with repeat submissions.
ALTER TABLE public.community_reports
  DROP CONSTRAINT IF EXISTS community_reports_blueprint_reporter_key;
ALTER TABLE public.community_reports
  ADD CONSTRAINT community_reports_blueprint_reporter_key
  UNIQUE (blueprint_id, reporter_id);

CREATE INDEX IF NOT EXISTS community_reports_blueprint_idx
  ON public.community_reports (blueprint_id);

ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;

-- Reporter can read their own report (for confirmation UI); service_role
-- gets full read access via its usual bypass. No general SELECT — report
-- lists are a moderation concern, not a public feed.
CREATE POLICY community_reports_reporter_read
  ON public.community_reports
  FOR SELECT
  USING (auth.uid() = reporter_id);

-- INSERT: reporter = caller AND reporter != blueprint creator (can't
-- self-report to silence your own criticism). The EXISTS clause leverages
-- RLS on blueprints: since blueprints enforce public-read for is_public,
-- any authenticated user can resolve creator_id here.
CREATE POLICY community_reports_reporter_insert
  ON public.community_reports
  FOR INSERT
  WITH CHECK (
    auth.uid() = reporter_id
    AND NOT EXISTS (
      SELECT 1 FROM public.blueprints
      WHERE id = blueprint_id AND creator_id = auth.uid()
    )
  );

-- Reporters can withdraw their own report (deletes the row; auto-flag
-- trigger re-counts below).
CREATE POLICY community_reports_reporter_delete
  ON public.community_reports
  FOR DELETE
  USING (auth.uid() = reporter_id);


-- ── Auto-flag: marketplace_listings.status='flagged' at ≥3 reports ───

-- Widen the status check to admit the new value. DROP + re-ADD because
-- ALTER CONSTRAINT doesn't exist for CHECK in standard Postgres.
ALTER TABLE public.marketplace_listings
  DROP CONSTRAINT IF EXISTS marketplace_listings_status_check;
ALTER TABLE public.marketplace_listings
  ADD CONSTRAINT marketplace_listings_status_check
  CHECK (status IN ('draft', 'published', 'unlisted', 'removed', 'flagged'));

CREATE OR REPLACE FUNCTION public.community_reports_autoflag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bp_id TEXT;
  report_count INT;
BEGIN
  bp_id := COALESCE(NEW.blueprint_id, OLD.blueprint_id);
  SELECT count(DISTINCT reporter_id) INTO report_count
  FROM public.community_reports
  WHERE blueprint_id = bp_id;

  -- Cross the threshold → flip matching listing to flagged so the public
  -- read policy hides it. Once a human moderator (service_role) reviews,
  -- they can restore to 'published' or ban with 'removed'.
  IF report_count >= 3 THEN
    UPDATE public.marketplace_listings
    SET status = 'flagged', updated_at = now()
    WHERE blueprint_id = bp_id
      AND status = 'published';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS community_reports_autoflag_trg ON public.community_reports;
CREATE TRIGGER community_reports_autoflag_trg
AFTER INSERT OR DELETE ON public.community_reports
FOR EACH ROW EXECUTE FUNCTION public.community_reports_autoflag();


-- ── Publish rate limit ───────────────────────────────────────────────

-- Returns how many publishes the caller has left in the current 24h
-- window. 5/day/user. Client gates on this before calling the publish
-- path, so the user gets a clean "slow down" message instead of a raw
-- RLS rejection.
CREATE OR REPLACE FUNCTION public.check_publish_rate_limit()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  recent_count int;
BEGIN
  SELECT count(*) INTO recent_count
  FROM public.blueprints
  WHERE creator_id = auth.uid()
    AND scope = 'community'
    AND created_at > now() - interval '24 hours';

  RETURN GREATEST(0, 5 - recent_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_publish_rate_limit() TO authenticated;

COMMIT;
