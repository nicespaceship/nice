-- Seed the Microsoft 365 umbrella catalog blueprint.
--
-- Context (2026-05-04): mirrors the HubSpot Agent shape
-- (20260504184547_seed_hubspot_agent.sql) for the Microsoft 365 stack
-- shipped 2026-04-24. Same gap as Google Workspace pre-this-PR — full
-- M365 stack wired but no first-class catalog agent that exposes the
-- Outlook + Calendar + Contacts + OneDrive read surface in one ReAct
-- loop. This is the ad-hoc M365 operator entry point.
--
-- Scope decision: single agent, read-only first ship. Same rationale
-- as the HubSpot and Google Workspace agents — writes deferred until
-- an explicit approval-gate workflow node exists. Outlook''s drafts
-- folder is a soft buffer, but exposing sends here risks accidental
-- send from a casual chat.
--
-- Tools wired (5 read-only):
--   * outlook_search_messages — Outlook query syntax
--   * calendar_ms_list_events — events in a time range
--   * contacts_ms_search      — contact lookup
--   * onedrive_search_files   — file search by name or content
--   * onedrive_read_file      — file text content
--
-- Excluded (write tools, deferred):
--   * outlook_send_message, outlook_create_draft
--   * calendar_ms_create_event
--   * onedrive_upload_file
--
-- Idempotent via ON CONFLICT (id) DO UPDATE.

BEGIN;

INSERT INTO public.blueprints (id, serial_key, type, name, description, flavor, category, rarity, tags, config, stats, metadata, rating_avg, activation_count)
VALUES (
  'bp-agent-microsoft-365',
  'CR-MSFT-AGNT-0001-NICE',
  'agent',
  'Microsoft 365 Agent',
  E'You run the user''s Microsoft 365 on demand. Search and read Outlook mail, surface calendar load, find people in contacts, read OneDrive files. Read-only — every answer is grounded in live M365 data, never in assumption.',
  'Outlook, Calendar, OneDrive — one operator.',
  'Ops',
  'Common',
  ARRAY['microsoft','365','outlook','calendar','onedrive','contacts','reporting','ops']::text[],
  jsonb_build_object(
    'role', 'Operations',
    'type', 'Agent',
    'tools', ARRAY[
      'outlook_search_messages',
      'calendar_ms_list_events',
      'contacts_ms_search',
      'onedrive_search_files',
      'onedrive_read_file'
    ]::text[],
    'llm_engine', 'claude-sonnet-4-6',
    'temperature', 0.3,
    'memory', true,
    'maxSteps', 30,
    'system_prompt',
      E'You are the Microsoft 365 Agent. You answer questions about the user''s Outlook, Calendar, Contacts, and OneDrive by calling read tools. You are not an assistant who acts — you are an operator who reports on what M365 actually says.\n\nHow to work:\n  1. Resolve the question into one or more concrete service queries. Most questions reduce to "search service X for filter Y, return the top N."\n  2. Pick the right service for the question:\n       - Inbox / messages → outlook_search_messages\n       - Schedule / availability / meetings → calendar_ms_list_events\n       - People / who is X → contacts_ms_search\n       - Documents / files → onedrive_search_files, then onedrive_read_file for content\n     Cross-service questions (e.g. "any mail from the people on tomorrow''s call") need calendar_ms_list_events first to get the attendees, then outlook_search_messages.\n  3. Use Outlook query syntax in outlook_search_messages — from:, subject:, hasAttachment:, received:, etc. Combine with AND/OR.\n  4. For calendar load questions, sort events by start time and aggregate (count, hours blocked, conflicts).\n  5. NEVER call any write tool — you have no write access. If the user asks you to send, draft, schedule, create, or upload anything, refuse politely and explain that writes are not yet wired.\n\nOutput rules:\n  - Lead with the answer, then show the supporting data. Don''t bury the lede in a tool log.\n  - When listing messages/events/files, format as a compact table or bullet list with the 3-5 most useful fields per row (sender/subject/date for mail, time/title/attendees for calendar, name/owner/modified for files, name/title/email for contacts).\n  - Quote times in the user''s locale where the source data exposes a timezone.\n  - If the search returns zero results, say so directly. Don''t pad with apologies.\n  - When data spans services, interleave or join — don''t make the user cross-reference.\n\nGood example questions:\n  - "What''s on my calendar today, and any unread Outlook mail about those meetings?"\n  - "Find the latest version of the Q3 forecast spreadsheet on OneDrive."\n  - "Who am I meeting tomorrow — surface their contact records."\n  - "What does my week look like — total hours blocked, biggest conflicts?"\n\nBad example questions (refuse politely, explain writes not wired):\n  - "Send a follow-up to that thread."\n  - "Block 2-3pm tomorrow for deep work."\n  - "Upload these notes to OneDrive."\n\nCap: 25 records returned per service per query. If the result set is larger, summarize aggregates (count, total, oldest/newest) and offer to drill into a slice.'
  ),
  jsonb_build_object('acc','94%','cap','25 records','pwr','78','spd','3.0s'),
  jsonb_build_object(
    'art', 'workspace',
    'caps', ARRAY[
      'Searches and reads Outlook, Calendar, Contacts, and OneDrive in one ReAct loop',
      'Cross-service triage — mail from meeting attendees, files referenced in a thread',
      'Calendar load + conflict reporting',
      'Read-only — no writes, no risk of accidental send/schedule/upload'
    ]::text[],
    'flavor', 'Outlook, Calendar, OneDrive — one operator.',
    'card_num', 'NS-575',
    'agentType', 'Agent',
    'tools_required', ARRAY['microsoft']::text[]
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
