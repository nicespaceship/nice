-- model-watch: provider model-list baseline + daily poll trigger.
--
-- The model-watch edge function polls every wired LLM provider's model-list
-- API, diffs the result against provider_models, and alerts admins on drift:
-- NEW models (adoption candidates), REMOVED models, and the urgent case of a
-- model NICE actively dispatches vanishing from its provider's list (the
-- deepseek-chat EOL scenario). Detect-and-draft posture: this infrastructure
-- only detects and reports; adopting a model stays a human-gated PR because
-- it sets pricing, pool weights, and capability flags across three SSOTs.

BEGIN;

CREATE TABLE IF NOT EXISTS public.provider_models (
  provider   text NOT NULL,
  model_id   text NOT NULL,
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen  timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (provider, model_id)
);

-- Service-role only: RLS on with no policies. The model-watch function reads
-- and writes with the service key; clients never touch the raw baseline.
ALTER TABLE public.provider_models ENABLE ROW LEVEL SECURITY;

-- Shared-secret reader for the model-watch function, mirror of
-- executor_drain_secret. Ben provisions the secret via the Dashboard:
--   SELECT vault.create_secret('<value>', 'model_watch_secret');
-- and the same value goes to the function env as MODEL_WATCH_SECRET
-- (fallback path when the vault read fails).
CREATE OR REPLACE FUNCTION public.model_watch_secret()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'vault', 'pg_temp'
AS $fn$
  SELECT decrypted_secret
    FROM vault.decrypted_secrets
   WHERE name = 'model_watch_secret'
   LIMIT 1;
$fn$;

REVOKE ALL ON FUNCTION public.model_watch_secret() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.model_watch_secret() FROM anon;
REVOKE ALL ON FUNCTION public.model_watch_secret() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.model_watch_secret() TO service_role;

-- Daily tick: POST to the model-watch edge function with the vault secret.
-- Skips quietly when the secret is not provisioned yet, mirroring
-- drain_mission_runs, so the migration can land before the vault step.
CREATE OR REPLACE FUNCTION public.model_watch_tick()
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'vault', 'pg_temp'
AS $fn$
DECLARE
  v_secret     text;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'model_watch_secret'
   LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE NOTICE 'model_watch_tick: model_watch_secret missing from vault; skipping poll';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := 'https://zacllshbgmnwsmliteqx.supabase.co/functions/v1/model-watch',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || v_secret,
                 'Content-Type',  'application/json'
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.model_watch_tick() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.model_watch_tick() FROM anon;
REVOKE ALL ON FUNCTION public.model_watch_tick() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.model_watch_tick() TO service_role;

-- 06:30 UTC daily; providers publish model changes on no fixed clock, one
-- poll a day is plenty to catch them before they matter.
SELECT cron.schedule('model_watch_daily', '30 6 * * *', 'SELECT public.model_watch_tick()');

-- ── Smoke test (rolls back the whole migration on failure) ───────────
-- Validates everything landed WITHOUT firing the HTTP path: a migration
-- must not POST to the watcher.
DO $smoke$
BEGIN
  ASSERT to_regclass('public.provider_models') IS NOT NULL,
    'provider_models table should exist';
  ASSERT to_regprocedure('public.model_watch_secret()') IS NOT NULL,
    'model_watch_secret function should exist';
  ASSERT to_regprocedure('public.model_watch_tick()') IS NOT NULL,
    'model_watch_tick function should exist';
  ASSERT (SELECT count(*) FROM cron.job WHERE jobname = 'model_watch_daily') = 1,
    'model_watch_daily cron job should be registered exactly once';
  ASSERT NOT has_function_privilege('anon', 'public.model_watch_secret()', 'EXECUTE'),
    'anon must not execute model_watch_secret';
  ASSERT NOT has_function_privilege('anon', 'public.model_watch_tick()', 'EXECUTE'),
    'anon must not execute model_watch_tick';
  ASSERT NOT has_function_privilege('authenticated', 'public.model_watch_secret()', 'EXECUTE'),
    'authenticated must not execute model_watch_secret';
  ASSERT NOT has_function_privilege('authenticated', 'public.model_watch_tick()', 'EXECUTE'),
    'authenticated must not execute model_watch_tick';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.provider_models'::regclass),
    'provider_models must have RLS enabled';
END
$smoke$;

COMMIT;
