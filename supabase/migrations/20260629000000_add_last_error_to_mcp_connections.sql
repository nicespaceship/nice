-- Breadcrumb columns for MCP connection failures.
-- The gateway writes last_error on every discover-failure path and clears it
-- on success. Future audits can read the column instead of trawling logs.

ALTER TABLE public.mcp_connections
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz;
