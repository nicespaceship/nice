-- Seed the Google Workspace umbrella catalog blueprint.
--
-- Context (2026-05-04): mirrors the HubSpot Agent shape
-- (20260504184547_seed_hubspot_agent.sql) for our oldest connected MCP
-- provider. Google Workspace has been wired since 2026-03-29 but never
-- had a single first-class catalog agent that exposes the full Gmail +
-- Calendar + Drive read surface — users had to discover via Inbox
-- Captain (a multi-agent ship for Gmail triage) or generic agents.
-- This is the "ad-hoc Workspace operator" entry point: one ReAct loop,
-- read-only, all three services in one tool set.
--
-- Scope decision: single agent, read-only first ship. Mirrors the
-- HubSpot Agent rationale — writes (gmail_send_message,
-- calendar_create_event, drive_create_file, etc.) deferred until an
-- explicit approval-gate workflow node exists. Gmail's draft folder is
-- a soft buffer for sends, but exposing writes here without that flow
-- risks accidental sends from a casual chat. Reopen when the workflow
-- approval gate ships.
--
-- Tools wired (9 read-only):
--   * gmail_search_messages   — Gmail query syntax (is:unread, from:, subject:)
--   * gmail_read_message      — full message content by ID
--   * gmail_list_labels       — label discovery for filtering
--   * calendar_list_events    — events in a time range
--   * calendar_get_event      — single event details
--   * calendar_list_calendars — calendar discovery
--   * drive_search_files      — file search by name or content
--   * drive_get_file          — file metadata by ID
--   * drive_read_file         — file text content
--
-- Excluded (write tools, deferred):
--   * gmail_send_message, gmail_create_draft, gmail_reply_message
--   * calendar_create_event, calendar_update_event, calendar_delete_event
--   * drive_create_file, drive_update_file, drive_upload_file
--
-- Idempotent via ON CONFLICT (id) DO UPDATE.

BEGIN;

INSERT INTO public.blueprints (id, serial_key, type, name, description, flavor, category, rarity, tags, config, stats, metadata, rating_avg, activation_count)
VALUES (
  'bp-agent-google-workspace',
  'CR-GOOG-AGNT-0001-NICE',
  'agent',
  'Google Workspace Agent',
  E'You run the user''s Google Workspace on demand. Search and read Gmail, surface calendar load and conflicts, find and read Drive files. Read-only — every answer is grounded in live Workspace data, never in assumption.',
  'Gmail, Calendar, Drive — one operator.',
  'Ops',
  'Common',
  ARRAY['google','workspace','gmail','calendar','drive','reporting','ops']::text[],
  jsonb_build_object(
    'role', 'Operations',
    'type', 'Agent',
    'tools', ARRAY[
      'gmail_search_messages',
      'gmail_read_message',
      'gmail_list_labels',
      'calendar_list_events',
      'calendar_get_event',
      'calendar_list_calendars',
      'drive_search_files',
      'drive_get_file',
      'drive_read_file'
    ]::text[],
    -- claude-sonnet-4-6 for synthesis quality. Cross-service triage
    -- (e.g. "what's on my plate this week" pulls inbox + calendar + a
    -- referenced doc) needs real reasoning over JSON. Users without
    -- the Claude pool will hit a 402; defer fallback until a real 402
    -- surfaces.
    'llm_engine', 'claude-sonnet-4-6',
    'temperature', 0.3,
    'memory', true,
    'maxSteps', 30,
    'system_prompt',
      E'You are the Google Workspace Agent. You answer questions about the user''s Gmail, Calendar, and Drive by calling read tools. You are not an assistant who acts — you are an operator who reports on what Workspace actually says.\n\nHow to work:\n  1. Resolve the question into one or more concrete service queries. Most questions reduce to "search service X for filter Y, return the top N."\n  2. Pick the right service for the question:\n       - Inbox / messages / threads → gmail_search_messages, then gmail_read_message for detail\n       - Schedule / availability / meetings → calendar_list_events, then calendar_get_event for detail\n       - Documents / sheets / files → drive_search_files, then drive_read_file for content\n     Cross-service questions (e.g. "any emails about the Tuesday meeting") need both gmail_search_messages AND calendar_list_events.\n  3. Use Gmail query syntax in gmail_search_messages — is:unread, from:, to:, subject:, has:attachment, after:, before:. Combine with AND/OR.\n  4. For calendar load questions, sort events by start time and aggregate (count, hours blocked, conflicts).\n  5. Use gmail_list_labels and calendar_list_calendars for discovery when the user asks about something you don''t recognize.\n  6. NEVER call any write tool — you have no write access. If the user asks you to send, draft, schedule, create, update, or delete anything, refuse politely and explain that writes are not yet wired.\n\nOutput rules:\n  - Lead with the answer, then show the supporting data. Don''t bury the lede in a tool log.\n  - When listing messages/events/files, format as a compact table or bullet list with the 3-5 most useful fields per row (sender/subject/date for mail, time/title/attendees for calendar, name/owner/modified for files).\n  - Quote times in the user''s locale where the source data exposes a timezone.\n  - If the search returns zero results, say so directly. Don''t pad with apologies.\n  - When data spans services (e.g. emails about a meeting), interleave or join — don''t make the user cross-reference.\n\nGood example questions:\n  - "What''s on my calendar today, and any unread emails about those meetings?"\n  - "Find the latest version of the Q3 forecast spreadsheet."\n  - "Anything urgent in the inbox from the last 24 hours?"\n  - "What does my week look like — total hours blocked, biggest conflicts?"\n\nBad example questions (refuse politely, explain writes not wired):\n  - "Send a follow-up to that thread."\n  - "Block 2-3pm tomorrow for deep work."\n  - "Create a new doc with these notes."\n  - "Move that file to the Archive folder."\n\nCap: 25 records returned per service per query. If the result set is larger, summarize aggregates (count, total, oldest/newest) and offer to drill into a slice.'
  ),
  jsonb_build_object('acc','94%','cap','25 records','pwr','78','spd','3.0s'),
  jsonb_build_object(
    'art', 'workspace',
    'caps', ARRAY[
      'Searches and reads Gmail, Calendar, and Drive in one ReAct loop',
      'Cross-service triage — emails about a meeting, files referenced in a thread',
      'Calendar load + conflict reporting',
      'Read-only — no writes, no risk of accidental send/schedule/upload'
    ]::text[],
    'flavor', 'Gmail, Calendar, Drive — one operator.',
    'card_num', 'NS-574',
    'agentType', 'Agent',
    'tools_required', ARRAY['google']::text[]
  ),
  0, 0
)
ON CONFLICT (id) DO UPDATE
SET serial_key      = EXCLUDED.serial_key,
    name            = EXCLUDED.name,
    description     = EXCLUDED.description,
    flavor          = EXCLUDED.flavor,
    category        = EXCLUDED.category,
    rarity          = EXCLUDED.rarity,
    tags            = EXCLUDED.tags,
    config          = EXCLUDED.config,
    stats           = EXCLUDED.stats,
    metadata        = EXCLUDED.metadata,
    updated_at      = now();

COMMIT;
