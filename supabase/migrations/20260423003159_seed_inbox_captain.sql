-- Sprint 3 — Inbox Captain seeded catalog blueprint.
--
-- Ships the first DAG-shaped Mission template end-to-end: a Triage agent
-- reads recent Gmail threads, a Drafter agent writes replies in the
-- user's voice, an approval_gate node queues them for review in the
-- existing Missions review UI (tasks.status='review'). The Mission
-- Composer detects hello-world patterns ("inbox", "email", "gmail",
-- "reply") and offers an "Install from template: Inbox Captain" chip.
--
-- Scope decision (session 2026-04-23): catalog. Inbox Captain shows in
-- Bridge → Spaceships as a normal Class-1 Common card and is also
-- installable via the Composer chip. No 'system' scope — it's the
-- demoable hero, not a hidden primitive.
--
-- Ontology alignment:
--   * Two agent blueprints (Triage, Drafter) — standard catalog agents.
--   * One spaceship blueprint (Inbox Captain) — references the two
--     crew via metadata.crew (deployFromCatalog contract) and via
--     metadata.workflow (the DAG plan the Composer installs).
--
-- The workflow JSON on the ship is the template the Composer copies
-- into missions.plan at activation. Keeping it on the blueprint means
-- future template tweaks happen via migration, not code change.
--
-- Idempotent via ON CONFLICT (id) DO UPDATE — re-running the migration
-- overwrites the three rows, which is what we want for seed data.

BEGIN;

-- ── Inbox Triage (agent) ─────────────────────────────────────────────
INSERT INTO public.blueprints (id, serial_key, type, name, description, flavor, category, rarity, tags, config, stats, metadata, rating_avg, activation_count)
VALUES (
  'bp-agent-inbox-triage',
  'CR-INBX-TRGE-0001-NICE',
  'agent',
  'Inbox Triage',
  'You scan recent Gmail threads, classify each by urgency and intent (customer, internal, newsletter, spam), and produce a short triaged list for the Drafter. You never reply yourself — your job is to decide what deserves a reply and summarize the context the Drafter needs.',
  'Read it once. Sort it right.',
  'Ops',
  'Common',
  ARRAY['inbox','triage','email','gmail','ops'],
  jsonb_build_object(
    'role', 'Ops',
    'type', 'Triage',
    'tools', ARRAY['gmail_search_messages','gmail_read_message','gmail_list_labels']::text[],
    'llm_engine', 'gemini-2.5-flash',
    'temperature', 0.2,
    'memory', false,
    'system_prompt',
      E'You are the Inbox Triage agent. Use the Gmail tools to search for recent unread threads (last 24h, is:unread -from:me), read the ones worth replying to, and output a compact JSON list of threads that need a reply.\n\nFor each thread, output:\n  - thread_id: Gmail thread id\n  - from: sender name/email\n  - subject: subject line\n  - snippet: 1-2 sentence summary of the thread\n  - intent: "customer" | "internal" | "newsletter" | "spam"\n  - reply_needed: true | false\n  - reply_context: 1-3 sentences the Drafter needs to write a reply (null if reply_needed=false)\n\nRules:\n  - Skip newsletters, no-reply senders, and anything that looks like marketing unless the user specifically handles them.\n  - Do NOT draft replies. That is the Drafter''s job.\n  - Do NOT call gmail_send_message, gmail_reply_message, or gmail_create_draft.\n  - Cap at 20 threads. If there are more, pick the most urgent 20.\n  - Output ONE JSON object: {"threads":[...], "total_scanned": N, "reply_needed_count": M}. No prose, no fences.'
  ),
  jsonb_build_object('acc','92%','cap','20 threads','pwr','68','spd','2.5s'),
  jsonb_build_object(
    'art', 'ops',
    'caps', ARRAY[
      'Scans recent Gmail threads and classifies by intent',
      'Surfaces reply-worthy threads with context for the Drafter',
      'Skips newsletters, spam, and no-reply senders'
    ]::text[],
    'flavor', 'Read it once. Sort it right.',
    'card_num', 'NS-571',
    'agentType', 'Triage'
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

-- ── Inbox Drafter (agent) ────────────────────────────────────────────
INSERT INTO public.blueprints (id, serial_key, type, name, description, flavor, category, rarity, tags, config, stats, metadata, rating_avg, activation_count)
VALUES (
  'bp-agent-inbox-drafter',
  'CR-INBX-DRFT-0002-NICE',
  'agent',
  'Inbox Drafter',
  'You receive triaged Gmail threads from the Triage agent and draft reply emails in the user''s voice. Each reply lands in Gmail as a draft (never sent) and is queued behind an approval gate so the user reviews before anything goes out.',
  'Your voice. Your inbox. Drafted.',
  'Content',
  'Common',
  ARRAY['inbox','drafting','email','gmail','content'],
  jsonb_build_object(
    'role', 'Content',
    'type', 'Drafter',
    'tools', ARRAY['gmail_read_message','gmail_create_draft']::text[],
    'llm_engine', 'claude-sonnet-4-6',
    'temperature', 0.4,
    'memory', true,
    'system_prompt',
      E'You are the Inbox Drafter. You receive a JSON list of triaged Gmail threads (from the Triage agent, earlier in this run''s context) and draft a reply for each thread where reply_needed=true.\n\nFor each thread:\n  1. Call gmail_read_message with the thread_id to load the latest message in the thread if you need more context than the Triage snippet provides.\n  2. Draft a reply in the user''s voice — direct, warm, concise. Match the tone of prior correspondence with that sender when you can see it. Do NOT use corporate filler ("I hope this email finds you well"). Do NOT over-apologize.\n  3. Call gmail_create_draft with the thread_id, subject (prefix "Re: " if not already present), and body. The draft lives in Gmail''s Drafts folder — NOT sent.\n  4. After drafting, output a JSON summary: {"thread_id": id, "subject": subject, "preview": first 120 chars of body, "draft_id": returned draft id}.\n\nRules:\n  - NEVER call gmail_send_message or gmail_reply_message. Drafts only.\n  - If a thread''s reply_context is ambiguous, skip it and note why in the output.\n  - Output ONE JSON object at the end: {"drafted":[...], "skipped":[{"thread_id": id, "reason": string}], "draft_count": N}. No prose outside the JSON.'
  ),
  jsonb_build_object('acc','89%','cap','20 drafts','pwr','74','spd','4.0s'),
  jsonb_build_object(
    'art', 'content',
    'caps', ARRAY[
      'Drafts Gmail replies in the user''s voice',
      'Lands every reply as a draft — never sends',
      'Learns from prior approved drafts via agent memory'
    ]::text[],
    'flavor', 'Your voice. Your inbox. Drafted.',
    'card_num', 'NS-572',
    'agentType', 'Drafter'
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

-- ── Inbox Captain (spaceship) ────────────────────────────────────────
--
-- metadata.crew drives CrewGenerator.deployFromCatalog (app/js/lib/
-- crew-generator.js:185) — entries with `label` + `config.agentRole` are
-- hoisted into user_agents at activation time.
--
-- metadata.workflow is the DAG template the Mission Composer copies
-- into `missions.plan` when the user clicks the "Install from template"
-- chip. Nodes: triage (agent) → drafter (agent) → review (approval_gate).
--
-- tools_required lists the MCP catalog ids the Composer's install gate
-- checks against `mcp_connections` before letting the user activate.
INSERT INTO public.blueprints (id, serial_key, type, name, description, flavor, category, rarity, tags, config, stats, metadata, rating_avg, activation_count)
VALUES (
  'fleet-inbox-captain',
  'SS-INBX-CPTN-0001-NICE',
  'spaceship',
  'Inbox Captain',
  'You orchestrate a two-agent inbox crew: a Triage that classifies unread threads and a Drafter that writes replies in the user''s voice. Every reply lands as a Gmail draft and pauses at an approval gate — nothing sends without the captain signing off.',
  'Your inbox at 9 AM. Drafted by 9:02.',
  'Ops',
  'Common',
  ARRAY['inbox','email','gmail','ops','triage'],
  jsonb_build_object(
    'suggested_agents', ARRAY['bp-agent-inbox-triage','bp-agent-inbox-drafter']::text[],
    'tools_required',   ARRAY['google-gmail']::text[]
  ),
  jsonb_build_object('cost','$0','crew','2','tier','FREE','slots','2'),
  jsonb_build_object(
    'caps', ARRAY[
      'Scans recent Gmail threads on a schedule or on demand',
      'Drafts reply emails in the user''s voice — never sends',
      'Queues drafts behind an approval gate for one-tap review'
    ]::text[],
    'tier', 'scout',
    'card_num', 'NS-F87',
    'recommended_class', 'class-1',
    'tools_required', ARRAY['google-gmail']::text[],
    'crew', jsonb_build_array(
      jsonb_build_object(
        'label', 'Inbox Triage',
        'rarity', 'Common',
        'blueprint_id', 'bp-agent-inbox-triage',
        'config', jsonb_build_object('agentRole', 'Ops')
      ),
      jsonb_build_object(
        'label', 'Inbox Drafter',
        'rarity', 'Common',
        'blueprint_id', 'bp-agent-inbox-drafter',
        'config', jsonb_build_object('agentRole', 'Content')
      )
    ),
    'workflow', jsonb_build_object(
      'shape', 'dag',
      'nodes', jsonb_build_array(
        jsonb_build_object(
          'id', 'triage',
          'type', 'agent',
          'label', 'Triage unread threads',
          'config', jsonb_build_object(
            'blueprintId', 'bp-agent-inbox-triage',
            'prompt', 'Triage the last 24 hours of unread Gmail threads. Output the compact JSON triage list defined in your system prompt.'
          )
        ),
        jsonb_build_object(
          'id', 'drafter',
          'type', 'persona_dispatch',
          'label', 'Draft replies in the user''s voice',
          'config', jsonb_build_object(
            'blueprintId', 'bp-agent-inbox-drafter',
            'prompt', 'Using the triaged thread list from the prior step, draft replies for every thread with reply_needed=true. Land each as a Gmail draft. Output the drafted/skipped JSON summary defined in your system prompt.',
            'personaHint', 'user_voice'
          )
        ),
        jsonb_build_object(
          'id', 'review',
          'type', 'approval_gate',
          'label', 'Review drafts before send',
          'config', jsonb_build_object(
            'reason', 'Drafts queued for captain review.',
            'approveLabel', 'Approve drafts',
            'rejectLabel', 'Reject all'
          )
        )
      ),
      'edges', jsonb_build_array(
        jsonb_build_object('from','triage','to','drafter'),
        jsonb_build_object('from','drafter','to','review')
      )
    )
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
