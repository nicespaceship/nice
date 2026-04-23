-- Collapse Inbox Captain from Spaceship-with-2-agents to a single agent.
--
-- Context (2026-04-23 smoke test): asking the user to install a
-- Spaceship, assign a crew, and activate a DAG just to draft reply
-- emails is too heavy. Inbox Captain reads + drafts — one agent's
-- worth of work in a single ReAct loop, not a fleet orchestration.
--
-- What changes:
--   * DROP  fleet-inbox-captain (spaceship blueprint)
--   * DROP  bp-agent-inbox-triage, bp-agent-inbox-drafter (the old 2-agent crew)
--   * INSERT bp-agent-inbox-captain (unified agent with Gmail
--            read + draft tools, system prompt covers triage + drafting)
--
-- What stays:
--   * The WorkflowEngine node types (approval_gate, persona_dispatch,
--     notify) still ship — they're the right primitive for future
--     multi-agent orchestrations (end-of-month reporting, cross-
--     domain fleets, etc). Not used for Inbox Captain anymore because
--     MissionRunner's existing status='review' flow covers "approve
--     before anything lands" without a dedicated gate node.
--   * The voice sample + persona_dispatch contract — the unified
--     agent's system prompt tells the model to match the user's
--     voice reference (which the composer still injects at runtime).
--
-- Idempotent via ON CONFLICT DO UPDATE on the insert + IF EXISTS on
-- the drops.

BEGIN;

-- ── Remove the old ship + old agents ────────────────────────────────
DELETE FROM public.blueprints WHERE id IN (
  'fleet-inbox-captain',
  'bp-agent-inbox-triage',
  'bp-agent-inbox-drafter'
);

-- ── Unified Inbox Captain agent ─────────────────────────────────────
INSERT INTO public.blueprints (id, serial_key, type, name, description, flavor, category, rarity, tags, config, stats, metadata, rating_avg, activation_count)
VALUES (
  'bp-agent-inbox-captain',
  'CR-INBX-CPTN-0003-NICE',
  'agent',
  'Inbox Captain',
  'You run the user''s Gmail inbox on demand. Scan recent unread threads, decide which deserve a reply, draft responses in the user''s voice, and land every reply as a Gmail draft — never sending. The user reviews and approves before anything goes out.',
  'Your inbox at 9 AM. Drafted by 9:02.',
  'Ops',
  'Common',
  ARRAY['inbox','email','gmail','ops','drafting','triage'],
  jsonb_build_object(
    'role', 'Ops',
    'type', 'Captain',
    -- Tool list: read + draft only. No send, no delete. Every reply
    -- lands as a draft so the existing mission review flow covers the
    -- approval contract — the user sees the drafts in Gmail AND gets
    -- the mission result to approve/reject.
    'tools', ARRAY['gmail_search_messages','gmail_read_message','gmail_list_labels','gmail_create_draft']::text[],
    -- claude-sonnet-4-6 for quality on the drafting side. Users
    -- without a Claude subscription will get a 402 from nice-ai;
    -- the composer can fall back to gemini-2.5-flash inline if
    -- we want a free-tier demo. Defer until a 402 actually happens
    -- in a real run.
    'llm_engine', 'claude-sonnet-4-6',
    'temperature', 0.4,
    'memory', true,
    'system_prompt',
      E'You are the Inbox Captain. You triage the user''s recent Gmail threads and draft reply emails in their voice. Every reply lands as a Gmail draft — you NEVER send.\n\nYour flow on each run:\n\n  1. Call gmail_search_messages with a query like `is:unread newer_than:1d -from:me` (cap maxResults at 20) to pull recent unread threads.\n  2. For each thread: read context with gmail_read_message if the subject + snippet isn''t enough. Classify the thread in your head:\n       * customer — needs a reply\n       * internal — usually needs a reply\n       * newsletter / marketing / no-reply — skip\n       * spam — skip\n  3. For threads that need a reply, draft one via gmail_create_draft. Rules:\n       - Match the user''s voice. A VOICE REFERENCE block may be prepended to this prompt at runtime; if present, mirror its tone, phrasing, and length patterns.\n       - Direct, warm, concise. No corporate filler ("I hope this email finds you well"). No over-apologizing.\n       - Subject prefix "Re: " if not already present.\n       - Body body only; don''t re-quote the thread — Gmail handles that.\n  4. Do NOT call gmail_send_message, gmail_reply_message, or any send-like tool. Drafts only.\n  5. When done, output ONE JSON summary:\n     {"total_scanned": N, "drafted": [{"thread_id": id, "from": sender, "subject": subject, "preview": first 120 chars of body, "draft_id": returned id}], "skipped": [{"thread_id": id, "reason": string}]}\n     No prose before or after the JSON.\n\nCap at 20 threads per run. If there are more, pick the most urgent 20.'
  ),
  jsonb_build_object('acc','91%','cap','20 threads','pwr','76','spd','3.5s'),
  jsonb_build_object(
    'art', 'ops',
    'caps', ARRAY[
      'Scans recent unread Gmail threads on demand',
      'Drafts replies in the user''s voice — never sends',
      'Lands every reply as a Gmail draft for one-tap review'
    ]::text[],
    'flavor', 'Your inbox at 9 AM. Drafted by 9:02.',
    'card_num', 'NS-571',
    'agentType', 'Captain',
    'tools_required', ARRAY['google-gmail']::text[]
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
