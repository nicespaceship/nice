-- Add catalog_id column to mcp_connections + backfill legacy rows.
--
-- Context (2026-04-23 smoke test): the client-side integrations code
-- has always used a `catalog_id` property to key MCP connections
-- ('google-gmail', 'google-calendar', 'google-drive', 'buffer', etc).
-- The property was set on the seed data that lives in
-- app/js/views/integrations.js but NEVER persisted to the DB — the
-- mcp_connections table simply didn't have the column.
--
-- Consequence: after a user connects via OAuth, the row written to
-- the DB lacks catalog_id. The client then re-reads that row on the
-- next bootstrap, replacing the richer seed object. Any downstream
-- code that matches by catalog_id (card rendering, MissionComposer
-- Gmail gate) suddenly can't find the connection.
--
-- Symptoms:
--   * Integrations page shows CONNECT on cards the user has already
--     connected.
--   * MissionComposer's Inbox Captain gate says "Needs: Connect
--     Gmail" even when Gmail is connected.
--   * Header stats (CONNECTIONS / ONLINE) count seed stubs instead
--     of real rows.
--
-- Fix: schema change + backfill + client creation path sets
-- catalog_id on every new row. Client patch lands in a separate
-- commit on the same PR. The google-oauth edge function (proprietary,
-- not in this repo) also writes rows; we'll update it out-of-band
-- in the same rollout. Until then, the client patches any missing
-- catalog_id on connections it owns by name pattern.
--
-- Additive + nullable — older rows the edge function wrote before
-- the schema rollout stay workable (clients will patch them on next
-- load). A NOT NULL constraint lands after the edge function catches
-- up, probably in the next sprint.

BEGIN;

ALTER TABLE public.mcp_connections
  ADD COLUMN IF NOT EXISTS catalog_id TEXT;

-- Index for card-matching queries — every card lookup is a WHERE
-- clause on (user_id, catalog_id).
CREATE INDEX IF NOT EXISTS idx_mcp_connections_user_catalog
  ON public.mcp_connections (user_id, catalog_id)
  WHERE catalog_id IS NOT NULL;

-- Backfill existing rows by pattern. name-based matching is
-- deterministic for the built-in connectors and anything the client
-- seed is responsible for. For unknown rows we leave catalog_id
-- NULL — the UI treats NULL as "unmatched custom connection" and
-- stops trying to match it against the catalog card grid.
UPDATE public.mcp_connections
SET catalog_id = CASE
    WHEN name = 'Gmail'                           THEN 'google-gmail'
    WHEN name = 'Google Calendar'                 THEN 'google-calendar'
    WHEN name = 'Google Drive'                    THEN 'google-drive'
    WHEN name IN ('Social Media', 'Buffer')       THEN 'buffer'
    WHEN server_url LIKE '%/gmail-mcp'            THEN 'google-gmail'
    WHEN server_url LIKE '%/calendar-mcp'         THEN 'google-calendar'
    WHEN server_url LIKE '%/drive-mcp'            THEN 'google-drive'
    WHEN server_url LIKE '%/social-mcp'           THEN 'buffer'
    ELSE NULL
  END
WHERE catalog_id IS NULL;

COMMIT;
