-- Only the server writes mcp_connections.auth_config.
--
-- auth_config holds an integration's OAuth tokens and the endpoint they
-- refresh at. The *-oauth functions and mcp-gateway write it with the
-- service role; the app never does: it creates rows for key-less
-- connections and deletes rows on disconnect. Supabase's default table
-- grants still let a signed-in user write any column of their own rows,
-- so credentials could be set from the browser that the server then
-- trusts. This takes that write away.
--
-- The client keeps INSERT and UPDATE on every other column. A column added
-- later needs its own grant here if the app writes it. SELECT and DELETE
-- are unchanged; service_role and postgres are untouched.

REVOKE INSERT, UPDATE ON public.mcp_connections FROM anon, authenticated;

GRANT INSERT (
  id, user_id, spaceship_id, name, server_url, transport, auth_type,
  available_tools, status, created_at, updated_at, catalog_id,
  last_error, last_error_at
) ON public.mcp_connections TO authenticated;

GRANT UPDATE (
  spaceship_id, name, server_url, transport, auth_type, available_tools,
  status, updated_at, catalog_id, last_error, last_error_at
) ON public.mcp_connections TO authenticated;
