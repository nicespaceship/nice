-- Community submission state machine (Stage C0)
--
-- Today publishToCommunity writes status='published' immediately — the
-- listing goes live the moment the user clicks the button. The strict
-- approval flow requires instead:
--
--   submit → pending_review → (auto-gates + reviewer agent) → approved OR rejected
--
-- This migration widens the status enum and adds the columns the review
-- pipeline needs to persist its decisions. It deliberately does NOT
-- touch the 8 pre-existing 'published' rows (the Forge-migrated demos);
-- they stay live. The app-layer change in the same PR flips new
-- submissions to write status='pending_review' instead.
--
-- No reviewer agent exists yet, so between now and Stage C3 human
-- reviewers (service-role) approve pending submissions manually. This
-- is intentional — slow manual review is strictly safer than the prior
-- "publish instantly" behavior while the automated pipeline is built.
--
-- Columns added:
--   * review_notes     — rejection reason or moderator comment
--   * reviewed_at      — decision timestamp
--   * reviewed_by      — who made the decision (auth user or service)
--   * safety_scores    — JSONB { profanity, hate, sexual, violence, self_harm, malicious }
--                        filled by the Content Screen crew agent in C3
--   * content_hash     — SHA-256 of the submitted content; used by C3 to
--                        detect edits between submission and approval
--   * policy_version   — git SHA of docs/community-policy.md at review time;
--                        every decision is audit-traceable to a specific policy
--
-- The 'scope' column on blueprints is also widened to accept 'system',
-- the scope the forthcoming Community Moderator spaceship will use. No
-- rows carry that value yet; adding it now lets C3 migrations drop in
-- clean without re-widening the check constraint.

BEGIN;

-- ── marketplace_listings: state machine widening ─────────────────────

ALTER TABLE public.marketplace_listings
  DROP CONSTRAINT IF EXISTS marketplace_listings_status_check;
ALTER TABLE public.marketplace_listings
  ADD CONSTRAINT marketplace_listings_status_check
  CHECK (status IN (
    'draft',            -- author is still editing, never submitted
    'pending_review',   -- submitted, awaiting decision
    'published',        -- decision=approve, public
    'unlisted',         -- author took it down post-approval
    'flagged',          -- 3+ reports, hidden pending moderator action
    'rejected',         -- decision=reject, private to author
    'removed'           -- severe moderation action, terminal
  ));

ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS review_notes    TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by     UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS safety_scores   JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS content_hash    TEXT,
  ADD COLUMN IF NOT EXISTS policy_version  TEXT;

-- Index the review queue for the /moderation dashboard lookup and
-- `SELECT ... WHERE status='pending_review' ORDER BY created_at`.
CREATE INDEX IF NOT EXISTS marketplace_listings_pending_review_idx
  ON public.marketplace_listings (created_at)
  WHERE status = 'pending_review';


-- ── blueprints: add 'system' scope for the future Moderator ──────────

ALTER TABLE public.blueprints
  DROP CONSTRAINT IF EXISTS blueprints_scope_check;
ALTER TABLE public.blueprints
  ADD CONSTRAINT blueprints_scope_check
  CHECK (scope IN ('catalog', 'community', 'system'));

COMMIT;
