-- Account-deletion FK actions.
-- Make the 7 remaining NO-ACTION foreign keys to auth.users resolve on user
-- deletion, so the self-service delete-account flow (auth.admin.deleteUser)
-- cascades cleanly instead of failing with a foreign-key violation. The other
-- ~22 user-referencing FKs are already CASCADE or SET NULL.
--
-- Policy (all seven columns are nullable, so SET NULL is valid where chosen):
--   SET NULL — community content others consume; keep the row, drop the author
--     link. Consistent with the existing agent_blueprints / spaceship_blueprints
--     / capabilities .creator_id behavior (a deleted creator's catalog content
--     already survives anonymized).
--       marketplace_listings.author_id, marketplace_listings.reviewed_by,
--       plugins.author_id
--   CASCADE — personal/ephemeral rows that are meaningless without the user.
--       marketplace_reviews.user_id, plugin_installs.user_id,
--       shared_blueprints.creator_id, team_invites.invited_by
--
-- Note: marketplace_listings caches rating/rating_count; CASCADE-deleting a
-- departing user's marketplace_reviews can leave that cache marginally stale.
-- That is a separate denormalization concern, not handled here.

-- SET NULL (keep + anonymize)
ALTER TABLE public.marketplace_listings DROP CONSTRAINT marketplace_listings_author_id_fkey;
ALTER TABLE public.marketplace_listings ADD CONSTRAINT marketplace_listings_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.marketplace_listings DROP CONSTRAINT marketplace_listings_reviewed_by_fkey;
ALTER TABLE public.marketplace_listings ADD CONSTRAINT marketplace_listings_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.plugins DROP CONSTRAINT plugins_author_id_fkey;
ALTER TABLE public.plugins ADD CONSTRAINT plugins_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- CASCADE (remove with the user)
ALTER TABLE public.marketplace_reviews DROP CONSTRAINT marketplace_reviews_user_id_fkey;
ALTER TABLE public.marketplace_reviews ADD CONSTRAINT marketplace_reviews_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.plugin_installs DROP CONSTRAINT plugin_installs_user_id_fkey;
ALTER TABLE public.plugin_installs ADD CONSTRAINT plugin_installs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.shared_blueprints DROP CONSTRAINT shared_blueprints_creator_id_fkey;
ALTER TABLE public.shared_blueprints ADD CONSTRAINT shared_blueprints_creator_id_fkey
  FOREIGN KEY (creator_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.team_invites DROP CONSTRAINT team_invites_invited_by_fkey;
ALTER TABLE public.team_invites ADD CONSTRAINT team_invites_invited_by_fkey
  FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Apply-time gate: every targeted FK must now carry its intended action
-- (n = SET NULL, c = CASCADE). Fail loudly in CI if not.
DO $smoke$
DECLARE
  v_bad text;
BEGIN
  -- confdeltype is Postgres's internal "char" type; cast to text so the ||
  -- concatenation and the comparison below resolve unambiguously (a bare
  -- `text || "char"` raises "operator is not unique", SQLSTATE 42725).
  SELECT string_agg(c.conname || '=' || c.confdeltype::text, ', ') INTO v_bad
  FROM pg_constraint c
  WHERE c.conname IN (
    'marketplace_listings_author_id_fkey', 'marketplace_listings_reviewed_by_fkey', 'plugins_author_id_fkey',
    'marketplace_reviews_user_id_fkey', 'plugin_installs_user_id_fkey', 'shared_blueprints_creator_id_fkey',
    'team_invites_invited_by_fkey'
  )
  AND c.confdeltype::text <> CASE c.conname
    WHEN 'marketplace_listings_author_id_fkey'   THEN 'n'
    WHEN 'marketplace_listings_reviewed_by_fkey' THEN 'n'
    WHEN 'plugins_author_id_fkey'                THEN 'n'
    ELSE 'c'
  END;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'account-deletion FK actions not applied as intended: %', v_bad;
  END IF;
END
$smoke$;
