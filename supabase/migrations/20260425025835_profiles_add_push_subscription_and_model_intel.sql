-- Profiles cache columns used by Notify.subscribePush and
-- ModelIntel.syncToServer. Without these, every page bootstrap
-- issues a PATCH /rest/v1/profiles that PostgREST rejects with
-- 400 ("column does not exist"). Silent today — neither feature
-- is critical — but the logs are noisy on every page load and
-- push subscriptions + cross-device model-intel sync quietly
-- don't work.
--
-- Both columns are per-user JSON blobs that round-trip as strings.
-- Kept as text (not jsonb) because both callers JSON.stringify
-- before writing — switching to jsonb would require a client
-- change to stop double-encoding, and the data isn't queried by
-- shape so jsonb's structural advantages don't apply.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_subscription text,
  ADD COLUMN IF NOT EXISTS model_intel        text;

-- No RLS changes needed — the existing profiles self-read/update
-- policies cover the new columns automatically.

COMMIT;
