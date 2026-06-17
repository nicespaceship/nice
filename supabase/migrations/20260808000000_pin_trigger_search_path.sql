-- Pin a non-mutable search_path on three trigger helper functions flagged by the
-- Supabase linter (0011 function_search_path_mutable). All three are SECURITY
-- INVOKER trigger functions that only touch NEW and now() (pg_catalog, which is
-- always implicitly searched), so an empty search_path is safe and closes the
-- search_path-injection surface the linter warns about. Verified pre-flight:
-- each has exactly one zero-arg signature and no existing proconfig.

ALTER FUNCTION public.personas_set_updated_at()         SET search_path = '';
ALTER FUNCTION public.set_updated_at()                  SET search_path = '';
ALTER FUNCTION public.clear_mcp_last_error_on_connect() SET search_path = '';

-- Apply-time gate: every targeted function must now carry a pinned search_path.
DO $smoke$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO v_missing
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('personas_set_updated_at', 'set_updated_at', 'clear_mcp_last_error_on_connect')
    AND NOT EXISTS (
      SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%'
    );
  ASSERT v_missing IS NULL, 'functions still missing a pinned search_path: ' || v_missing;
END
$smoke$;
