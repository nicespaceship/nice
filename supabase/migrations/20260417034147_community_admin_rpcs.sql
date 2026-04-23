-- Admin moderation primitives (Stage C3.5)
--
-- Three pieces that together enable the /moderation dashboard:
--
--   1. profiles.is_admin — a persistent, server-authoritative flag that
--      admin UI routes, admin RPCs, and the community-review edge
--      function all consult. Moved off the JWT (app_metadata) on
--      purpose: revoking admin should be a single DB update, not
--      waiting for token rotation.
--
--   2. admin_approve_listing / admin_reject_listing — thin wrappers
--      over community_decision that first verify the caller is an
--      admin. SECURITY DEFINER so they can re-enter the underlying
--      RPC (which is itself service_role-gated). The caller presents
--      only their own user JWT; admin status is resolved server-side.
--
--   3. Bootstrap grant — the only way to create the first admin is
--      via a direct SQL UPDATE in this migration. Setting is_admin
--      is not exposed through any RPC by design; the column has no
--      client-writable policy. Additional admins get promoted by
--      running a new migration or by an existing admin via SQL
--      console — never through the app.

BEGIN;

-- ── profiles.is_admin ────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_is_admin_idx
  ON public.profiles (id)
  WHERE is_admin = true;

-- Bootstrap the first admin. The user id is the real account the app
-- signs into; updating an existing profile is idempotent, and the
-- INSERT path covers the case where no profiles row exists yet.
INSERT INTO public.profiles (id, is_admin)
VALUES ('022a9fe5-3d6a-4663-b81a-774cbca37b8a', true)
ON CONFLICT (id) DO UPDATE SET is_admin = true, updated_at = now();


-- ── Admin moderation RPCs ────────────────────────────────────────────

-- Helper — checks if the caller is an admin. Used inline in the two
-- moderation RPCs. Exposed separately so the app can cheaply query
-- "is this user an admin?" without granting direct SELECT on the
-- column (which would be visible across all rows by anyone authed).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid()), false);
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_approve_listing(
  p_listing_id UUID,
  p_notes      TEXT DEFAULT NULL
)
RETURNS TABLE (
  listing_id  UUID,
  new_status  TEXT,
  notes       TEXT,
  reviewed_at TIMESTAMPTZ
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
  SELECT * FROM public.community_decision(
    p_listing_id,
    'published',
    p_notes,
    jsonb_build_object(
      'reviewed_by',  'admin',
      'reviewer_id',  auth.uid(),
      'reviewed_at',  now(),
      'decision',     'approve',
      'notes',        p_notes
    ),
    'c3.5.admin',
    auth.uid()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_listing(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_approve_listing(UUID, TEXT) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_reject_listing(
  p_listing_id UUID,
  p_reason     TEXT
)
RETURNS TABLE (
  listing_id  UUID,
  new_status  TEXT,
  notes       TEXT,
  reviewed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Rejection reason required' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT * FROM public.community_decision(
    p_listing_id,
    'rejected',
    p_reason,
    jsonb_build_object(
      'reviewed_by',  'admin',
      'reviewer_id',  auth.uid(),
      'reviewed_at',  now(),
      'decision',     'reject',
      'reason',       p_reason
    ),
    'c3.5.admin',
    auth.uid()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reject_listing(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reject_listing(UUID, TEXT) TO authenticated;


-- ── Admin queue view ─────────────────────────────────────────────────
-- Lets an admin fetch every pending_review listing + blueprint detail
-- in a single round-trip. RLS-safe because the function is
-- SECURITY DEFINER and gated on is_admin() — non-admins get 42501.
CREATE OR REPLACE FUNCTION public.admin_list_pending_reviews()
RETURNS TABLE (
  listing_id     UUID,
  blueprint_id   TEXT,
  author_id      UUID,
  author_email   TEXT,
  title          TEXT,
  description    TEXT,
  listing_tags   TEXT[],
  listing_created TIMESTAMPTZ,
  content_hash   TEXT,
  blueprint_name TEXT,
  blueprint_type TEXT,
  blueprint_category TEXT,
  blueprint_config JSONB,
  blueprint_flavor TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
  END IF;

  -- Explicit casts to TEXT because auth.users.email is varchar(255) and
  -- a few of the listing / blueprint columns arrive as domain types that
  -- PG's RETURNS TABLE signature check won't auto-coerce.
  RETURN QUERY
  SELECT ml.id, ml.blueprint_id, ml.author_id,
         u.email::TEXT,
         ml.title::TEXT, ml.description::TEXT,
         ml.tags::TEXT[],
         ml.created_at,
         ml.content_hash::TEXT,
         bp.name::TEXT, bp.type::TEXT, bp.category::TEXT,
         bp.config,
         bp.flavor::TEXT
  FROM public.marketplace_listings ml
  JOIN public.blueprints bp ON bp.id = ml.blueprint_id
  LEFT JOIN auth.users u ON u.id = ml.author_id
  WHERE ml.status = 'pending_review'
  ORDER BY ml.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_pending_reviews() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_pending_reviews() TO authenticated;

COMMIT;
