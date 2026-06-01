-- Enforce the "connected => no stale error breadcrumb" invariant in one place.
-- The gateway clears last_error on its discover-success path, but the OAuth
-- reconnect path (the 19 *-oauth callbacks) sets status='connected' without
-- touching last_error, so a healed row keeps lying about its last failure.
-- A trigger covers the gateway, every OAuth callback, and any future writer
-- uniformly instead of duplicating the clear across 19 functions.

CREATE OR REPLACE FUNCTION public.clear_mcp_last_error_on_connect()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'connected' THEN
    NEW.last_error := NULL;
    NEW.last_error_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_mcp_last_error_on_connect ON public.mcp_connections;

CREATE TRIGGER trg_clear_mcp_last_error_on_connect
  BEFORE INSERT OR UPDATE OF status, last_error, last_error_at
  ON public.mcp_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_mcp_last_error_on_connect();
