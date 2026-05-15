-- Three-layer schema — Phase B1: clear the legacy community blueprints.
--
-- The 8 scope='community' agents were thin, unattributed (creator_id null)
-- pre-launch marketplace test submissions — fictional characters with no
-- real user value. Per the catalog rebuild's "archive then clear" pattern,
-- they're snapshotted in seed/community-agents.json and removed here so the
-- new normalized tables become the complete client-facing content source.
--
-- The 8 marketplace_listings pointing at them cascade-delete (FK ON DELETE
-- CASCADE); community_reports and marketplace_reviews are empty. The 5
-- scope='system' reviewer agents + 1 ship stay in `blueprints` — they are
-- read only by the community-review edge function, never by the client.

BEGIN;

DELETE FROM public.blueprints WHERE scope = 'community';

COMMIT;
