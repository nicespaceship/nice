-- Auto-fire community-review on new pending_review listings (Stage C3.4)
--
-- After a submission lands in marketplace_listings with
-- status='pending_review', this trigger fires the community-review
-- edge function asynchronously. The edge function orchestrates the
-- reviewer agent pipeline and updates the row via community_decision
-- RPC once the Arbiter returns.
--
-- Mechanics:
--
--   * pg_net.http_post schedules the HTTP call on a background worker
--     and returns immediately, so the INSERT isn't blocked on LLM
--     latency (~2-5s for the Arbiter). The submitter sees their
--     listing land in pending_review instantly; the decision arrives
--     when the reviewer finishes.
--
--   * Service-role auth for the review endpoint is required. The key
--     lives in supabase_vault under the name 'community_review_service_key'
--     and is read at trigger-fire time via a SECURITY DEFINER helper.
--     The value is never stored in git or in the trigger function body.
--
--   * Degradation path: if the vault secrets are missing, the helper
--     logs a NOTICE and returns without calling pg_net. The INSERT
--     still succeeds and the listing sits at pending_review waiting
--     for a human reviewer via /moderation. Human-review is the
--     always-available fallback.
--
-- Out-of-band setup required after this migration lands:
--
--   SELECT vault.create_secret(
--     '<service-role-key-from-project-settings>',
--     'community_review_service_key',
--     'Service-role key for the community-review edge function');
--
--   SELECT vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/community-review',
--     'community_review_url',
--     'Full URL of the community-review edge function');
--
-- A moderator can retrieve + update these secrets via Supabase Studio
-- → Vault. Pausing auto-review is as simple as deleting the service-key
-- secret — every INSERT will still succeed, just fall through to
-- human review.

BEGIN;

-- pg_net ships with Supabase but isn't enabled by default on new
-- projects. Safe to re-run; CREATE EXTENSION IF NOT EXISTS is idempotent.
-- The 'extensions' schema is Supabase's convention for extension-owned
-- objects so the public schema stays clean.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Helper to resolve the review endpoint + service key. SECURITY DEFINER
-- so trigger callers (authenticated users inserting their own listings)
-- can call it without needing direct read access on vault.decrypted_secrets.
-- Returns NULL entries if the corresponding vault secret is missing,
-- which the trigger handler treats as "auto-review disabled, fall
-- through to human review."
CREATE OR REPLACE FUNCTION public._community_review_secrets()
RETURNS TABLE (endpoint_url TEXT, service_key TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
  SELECT
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'community_review_url'         LIMIT 1) AS endpoint_url,
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'community_review_service_key' LIMIT 1) AS service_key;
$$;

REVOKE ALL ON FUNCTION public._community_review_secrets() FROM PUBLIC;
-- Only the trigger function (owned by the DB owner) + service_role
-- should call this. Not granted to authenticated — no client path reads
-- the keys.


-- Trigger function. Fires AFTER INSERT on marketplace_listings when the
-- new row lands at pending_review. Schedules the review call via pg_net
-- and returns. Does NOT block the INSERT on the HTTP call.
CREATE OR REPLACE FUNCTION public._community_review_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url  TEXT;
  v_key  TEXT;
  v_request_id BIGINT;
BEGIN
  -- Only auto-fire for rows that land directly at pending_review. If
  -- the row is inserted at any other status (shouldn't happen in normal
  -- flow, but belt-and-suspenders) the trigger skips.
  IF NEW.status IS DISTINCT FROM 'pending_review' THEN
    RETURN NEW;
  END IF;

  SELECT s.endpoint_url, s.service_key INTO v_url, v_key
  FROM public._community_review_secrets() s;

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'community-review auto-trigger disabled (vault secrets missing); listing % stays pending_review', NEW.id;
    RETURN NEW;
  END IF;

  -- Fire-and-forget. pg_net returns a request_id which we discard —
  -- the review's effect lands via the community_decision RPC, not via
  -- the HTTP response.
  SELECT net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || v_key,
                 'Content-Type',  'application/json'
               ),
    body    := jsonb_build_object('listing_id', NEW.id),
    timeout_milliseconds := 30000
  ) INTO v_request_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._community_review_dispatch() FROM PUBLIC;


DROP TRIGGER IF EXISTS marketplace_listings_auto_review_trg
  ON public.marketplace_listings;

CREATE TRIGGER marketplace_listings_auto_review_trg
AFTER INSERT ON public.marketplace_listings
FOR EACH ROW
WHEN (NEW.status = 'pending_review')
EXECUTE FUNCTION public._community_review_dispatch();

COMMIT;
