-- Sweep every em-dash out of catalog seed copy.
--
-- The Blueprint Copy Standards default to commas, colons, semicolons, or a
-- new sentence; em-dashes are reserved for asides that genuinely need them.
-- The catalog shipped with 151 distinct em-dash constructions across
-- spaceship_blueprints (10 descriptions, 8 flavors, 10 ship prompts),
-- agent_blueprints (20 descriptions, 3 flavors, 32 system prompts, 19 card
-- caps arrays), and capabilities (20 descriptions, 2 flavors, 20 system
-- prompts, 19 card caps arrays; every capabilities row is scope 'catalog').
-- None of them needs the dash. Each rewrite below keeps the meaning and
-- swaps the punctuation: comma for a weak break, colon before an
-- explanation or list, semicolon between clauses, or a sentence split.
-- The umbrella agents and their capabilities carry byte-identical
-- description / flavor / caps / system_prompt copy (verified row by row),
-- so one pattern list serves both tables.
--
-- Mechanics: exact-phrase replaces, one (old, new) pair per construction,
-- looped per table and field. Guards use strpos() rather than LIKE because
-- several phrases contain '%' and '_', which are LIKE metacharacters.
-- Pattern order matters in the prompt lists: the paired-dash openers
-- ('workspace — list — by calling read tools') run before the generic
-- ' — by calling read tools.' trim so each dash is consumed exactly once.
-- Hyphens, en-dashes (the '14-30 days' range uses one), and the two
-- weekday 'Monday' prose lines are untouched; every pattern anchors on the
-- em-dash itself. Community and system scopes are not swept.
--
-- Coverage was dry-verified against production reads: applying these exact
-- pattern lists in order leaves zero em-dashes in every swept field. The
-- closing smoke block asserts that at apply time; if the catalog drifts and
-- grows a new em-dash before this lands, the apply fails loudly and rolls
-- back rather than half-sweeping.

-- Spaceship blueprints: description, flavor, ship_system_prompt.
DO $sweep_ships$
DECLARE
  p text[];
  desc_pats text[] := ARRAY[
    ARRAY['end-to-end — ', 'end-to-end: '],
    ARRAY['both sides of the house — variable ops', 'both sides of the house: variable ops'],
    ARRAY[' — and grows the practice as you rank up.', '. Grows the practice as you rank up.'],
    ARRAY[' — and grows the rooftop as you rank up.', '. Grows the rooftop as you rank up.'],
    ARRAY[' — and grows the room as you rank up.', '. Grows the room as you rank up.'],
    ARRAY[' — and grows the team as you rank up.', '. Grows the team as you rank up.'],
    ARRAY[' — and grows the channel as you rank up.', '. Grows the channel as you rank up.'],
    ARRAY['construction company — general contractor or specialty trades.', 'construction company: general contractor or specialty trades.'],
    ARRAY['property management company — residential or mixed-use rental portfolio.', 'property management company: residential or mixed-use rental portfolio.'],
    ARRAY['healthcare practice — primary care, specialty, or dental.', 'healthcare practice: primary care, specialty, or dental.']
  ];
  flavor_pats text[] := ARRAY[
    ARRAY[' — leads in, keys out.', ': leads in, keys out.'],
    ARRAY[' — matters in, outcomes out.', ': matters in, outcomes out.'],
    ARRAY[' — leads in, keys + repaired cars out.', ': leads in, keys + repaired cars out.'],
    ARRAY[' — orders in, plates out.', ': orders in, plates out.'],
    ARRAY[' — orders in, packages out.', ': orders in, packages out.'],
    ARRAY[' — briefs in, outcomes out.', ': briefs in, outcomes out.'],
    ARRAY['Maple Street remodel — building inspector due at ten.', 'Maple Street remodel; building inspector due at ten.'],
    ARRAY['Pine Street duplex — three applications already in.', 'Pine Street duplex; three applications already in.'],
    ARRAY['November rent — eighty-two units in', 'November rent: eighty-two units in']
  ];
  prompt_pats text[] := ARRAY[
    ARRAY['of the Brokerage — a real estate agency.', 'of the Brokerage, a real estate agency.'],
    ARRAY['of the Chambers — a law firm.', 'of the Chambers, a law firm.'],
    ARRAY['of the Dealership — an auto dealership.', 'of the Dealership, an auto dealership.'],
    ARRAY['of the Galley — a restaurant.', 'of the Galley, a restaurant.'],
    ARRAY['of the Jobsite — a construction company (general contracting or specialty trades).', 'of the Jobsite, a construction company (general contracting or specialty trades).'],
    ARRAY['of the Loft — a software startup.', 'of the Loft, a software startup.'],
    ARRAY['of the Portfolio — a property management company (residential or mixed-use rental portfolio).', 'of the Portfolio, a property management company (residential or mixed-use rental portfolio).'],
    ARRAY['of the Practice — a healthcare practice (primary care, specialty, or dental).', 'of the Practice, a healthcare practice (primary care, specialty, or dental).'],
    ARRAY['of the Storefront — an e-commerce shop.', 'of the Storefront, an e-commerce shop.'],
    ARRAY['of the Studio — a consultancy / professional services shop.', 'of the Studio, a consultancy / professional services shop.'],
    ARRAY['appraiser coordination — keeps the third parties moving', 'appraiser coordination; keeps the third parties moving'],
    ARRAY['disclosed in writing — every time, on every property', 'disclosed in writing: every time, on every property'],
    ARRAY['inspection windows — if one slips', 'inspection windows: if one slips'],
    ARRAY['every public communication — listings, emails, social, scripts', 'every public communication: listings, emails, social, scripts'],
    ARRAY['before substantive work — always.', 'before substantive work, always.'],
    ARRAY['on scope creep — politely.', 'on scope creep, politely.'],
    ARRAY['treat it as such — no third parties on the call.', 'treat it as such: no third parties on the call.'],
    ARRAY['Business Development Center — inbound calls', 'Business Development Center; inbound calls'],
    ARRAY['total of payments — disclosed accurately', 'total of payments: disclosed accurately'],
    ARRAY['same lender criteria — regardless of who walked in.', 'same lender criteria, regardless of who walked in.'],
    ARRAY[' — don''t. If ', '. Don''t. If '],
    ARRAY['act on patterns — not on outliers.', 'act on patterns, not on outliers.'],
    ARRAY['insulation, drywall, final — whatever the AHJ requires.', 'insulation, drywall, final: whatever the AHJ requires.'],
    ARRAY['posted wage decisions — non-negotiable.', 'posted wage decisions: non-negotiable.'],
    ARRAY['before the final draw — make the list', 'before the final draw: make the list'],
    ARRAY['writing it down — the Operations agent', 'writing it down; the Operations agent'],
    ARRAY['in five minutes — not the most relevant person', 'in five minutes, not the most relevant person'],
    ARRAY['same response time — disparate treatment', 'same response time; disparate treatment'],
    ARRAY['segregated trust account — never commingled', 'segregated trust account, never commingled'],
    ARRAY['any work claimed — sent within the statutory deadline', 'any work claimed, sent within the statutory deadline'],
    ARRAY['Protect Your Family pamphlet — at every new lease', 'Protect Your Family pamphlet, at every new lease'],
    ARRAY['not pets — no pet rent', 'not pets: no pet rent'],
    ARRAY['revenue-cycle ownership — coding accuracy', 'revenue-cycle ownership; coding accuracy'],
    ARRAY['signed BAA on file — the Forms & Consents Manager', 'signed BAA on file. The Forms & Consents Manager'],
    ARRAY['threats of harm — reported per state law', 'threats of harm: reported per state law'],
    ARRAY['the code changes — never the other way.', 'the code changes, never the other way.'],
    ARRAY['triaged into appointments — never answered', 'triaged into appointments, never answered'],
    ARRAY['B2B buyer relationships — email correspondence', 'B2B buyer relationships; email correspondence'],
    ARRAY['ten happy reviews — fix the product or the listing.', 'ten happy reviews: fix the product or the listing.'],
    ARRAY['beast from DTC — terms, payment cycles, samples.', 'beast from DTC: terms, payment cycles, samples.'],
    ARRAY['before it starts — not after.', 'before it starts, not after.'],
    ARRAY['the engagement letter — every time.', 'the engagement letter, every time.']
  ];
BEGIN
  FOREACH p SLICE 1 IN ARRAY desc_pats LOOP
    UPDATE public.spaceship_blueprints
    SET description = replace(description, p[1], p[2])
    WHERE scope = 'catalog' AND strpos(description, p[1]) > 0;
  END LOOP;

  FOREACH p SLICE 1 IN ARRAY flavor_pats LOOP
    UPDATE public.spaceship_blueprints
    SET flavor = replace(flavor, p[1], p[2])
    WHERE scope = 'catalog' AND strpos(flavor, p[1]) > 0;
  END LOOP;

  FOREACH p SLICE 1 IN ARRAY prompt_pats LOOP
    UPDATE public.spaceship_blueprints
    SET config = jsonb_set(config, '{ship_system_prompt}',
          to_jsonb(replace(config->>'ship_system_prompt', p[1], p[2])))
    WHERE scope = 'catalog' AND strpos(config->>'ship_system_prompt', p[1]) > 0;
  END LOOP;
END;
$sweep_ships$;

-- Agent blueprints + capabilities: description, flavor, card caps,
-- system_prompt. The umbrella lists run against both tables; the specialist
-- and crew patterns exist only on agent_blueprints.
DO $sweep_crews$
DECLARE
  p text[];
  desc_pats text[] := ARRAY[
    ARRAY['Read-only — ', 'Read-only: '],
    ARRAY['screenshots — all via Cloudflare''s Browser Rendering', 'screenshots, all via Cloudflare''s Browser Rendering'],
    ARRAY['Workers Builds — the CI/CD pipeline for Workers — on demand', 'Workers Builds, the CI/CD pipeline for Workers, on demand'],
    ARRAY['debug production Workers — all read-only', 'debug production Workers, all read-only'],
    ARRAY['Power-user umbrella for Replicate — bring', 'Power-user umbrella for Replicate: bring'],
    ARRAY['not NICE — opt-in by users who want', 'not NICE. Opt-in for users who want'],
    ARRAY['at the action level — write actions', 'at the action level; write actions']
  ];
  flavor_pats text[] := ARRAY[
    ARRAY[' — one operator.', '. One operator.'],
    ARRAY['(silent — and then everything)', '(silent... and then everything)']
  ];
  card_pats text[] := ARRAY[
    ARRAY['Read-only — ', 'Read-only: '],
    ARRAY['Cross-service triage — ', 'Cross-service triage: ']
  ];
  -- Umbrella agent system prompts (mirrored verbatim on capabilities).
  -- The ten paired-dash openers must run before the generic
  -- ' — by calling read tools.' trim.
  prompt_pats text[] := ARRAY[
    ARRAY['Atlassian Cloud site — Jira issues, Confluence pages, Compass components — by calling read tools.', 'Atlassian Cloud site: Jira issues, Confluence pages, Compass components. You answer by calling read tools.'],
    ARRAY['Cloudflare account — Workers, KV namespaces, R2 buckets, D1 databases, Hyperdrive configs, and account membership — by calling read tools.', 'Cloudflare account: Workers, KV namespaces, R2 buckets, D1 databases, Hyperdrive configs, and account membership. You answer by calling read tools.'],
    ARRAY['Klaviyo account — profiles, lists, segments, campaigns, flows, events, metrics — by calling read tools.', 'Klaviyo account: profiles, lists, segments, campaigns, flows, events, metrics. You answer by calling read tools.'],
    ARRAY['Linear workspace — issues, projects, comments, teams, cycles, labels — by calling read tools.', 'Linear workspace: issues, projects, comments, teams, cycles, labels. You answer by calling read tools.'],
    ARRAY['Notion workspace — pages, databases, comments, teams, users — by calling read tools.', 'Notion workspace: pages, databases, comments, teams, users. You answer by calling read tools.'],
    ARRAY['Sentry organization — projects, issues, events, traces, releases — by calling read tools.', 'Sentry organization: projects, issues, events, traces, releases. You answer by calling read tools.'],
    ARRAY['Slack workspace — messages, channels, files, threads, canvases, users — by calling read tools.', 'Slack workspace: messages, channels, files, threads, canvases, users. You answer by calling read tools.'],
    ARRAY['Stripe account — customers, payments, subscriptions, invoices, products, prices, balance, disputes — by calling read tools.', 'Stripe account: customers, payments, subscriptions, invoices, products, prices, balance, disputes. You answer by calling read tools.'],
    ARRAY['Cloudflare Workers — what they did, how often, with what errors, in what regions — by querying live logs and metrics.', 'Cloudflare Workers: what they did, how often, with what errors, in what regions. You answer by querying live logs and metrics.'],
    ARRAY['Cloudflare Workers Builds — the CI/CD pipeline for Workers — by reading build records and logs.', 'Cloudflare Workers Builds, the CI/CD pipeline for Workers, by reading build records and logs.'],
    ARRAY[' — by calling read tools.', ' by calling read tools.'],
    ARRAY[' — you are an operator who reports on what ', '; you are an operator who reports on what '],
    ARRAY['Tool hygiene (read this first — applies to every turn):', 'Tool hygiene (read this first; applies to every turn):'],
    ARRAY['" — STOP.', '": STOP.'],
    ARRAY['(you have no write tools — never offer):', '(you have no write tools; never offer):'],
    ARRAY['" — those are writes.', '"; those are writes.'],
    ARRAY[' — you have no write access.', '; you have no write access.'],
    ARRAY['" — refuse the write and report the read.', '", refuse the write and report the read.'],
    ARRAY['" — refuse and report the read.', '", refuse and report the read.'],
    ARRAY[' — even when it would be the obvious next step.', ', even when it would be the obvious next step.'],
    ARRAY['" — these phrases are forbidden.', '"; these phrases are forbidden.'],
    ARRAY['Quote them verbatim — never paraphrase.', 'Quote them verbatim; never paraphrase.'],
    ARRAY[' syntax — ', ' syntax: '],
    ARRAY['gmail_search_messages — is:unread', 'gmail_search_messages: is:unread'],
    ARRAY['outlook_search_messages — from:', 'outlook_search_messages: from:'],
    ARRAY['interleave or join — don''t make the user cross-reference.', 'interleave or join; don''t make the user cross-reference.'],
    ARRAY['before showing — don''t make the user count rows.', 'before showing; don''t make the user count rows.'],
    ARRAY[' — excluded at catalog level.', '; excluded at catalog level.'],
    ARRAY[' — write tools are excluded.', '; write tools are excluded.'],
    ARRAY[' records — those tools are excluded.', ' records; those tools are excluded.'],
    ARRAY['web search engine — the user gives', 'web search engine; the user gives'],
    ARRAY['orientation step on every question — only when', 'orientation step on every question, only when'],
    ARRAY['back at them — extract the part that matters.', 'back at them; extract the part that matters.'],
    ARRAY['There are no write tools — this is read-only.', 'There are no write tools; this is read-only.'],
    ARRAY['" — call `workers_builds_', '": call `workers_builds_'],
    ARRAY['build_command — those are usually', 'build_command; those are usually'],
    ARRAY['a sensible filter — don''t pre-flight', 'a sensible filter; don''t pre-flight'],
    ARRAY['say so — they may be looking', 'say so; they may be looking'],
    ARRAY[') — but don''t over-interpret.', '), but don''t over-interpret.'],
    ARRAY['" — there are no write tools.', '"; there are no write tools.'],
    ARRAY['or any DDL — the tool will execute them', 'or any DDL; the tool will execute them'],
    ARRAY['D1 database — top 10 events today.', 'D1 database: top 10 events today.'],
    ARRAY['Date-bounded PR queries — when the user asks', 'Date-bounded PR queries: when the user asks'],
    ARRAY['(NOT `is:closed` — `is:closed` also returns', '(NOT `is:closed`; `is:closed` also returns'],
    ARRAY['is REST-paginated — it will silently miss merges', 'is REST-paginated; it will silently miss merges'],
    ARRAY['the dispatch protocol — search for', 'the dispatch protocol: search for'],
    ARRAY['week look like — total hours blocked', 'week look like? Total hours blocked'],
    ARRAY['meeting tomorrow — surface their contact records.', 'meeting tomorrow? Surface their contact records.'],
    ARRAY['`value` field — extract intelligently', '`value` field; extract intelligently'],
    ARRAY['(Notion-specific — read this first):', '(Notion-specific; read this first):'],
    ARRAY['Use specific terms — vague searches return', 'Use specific terms; vague searches return'],
    ARRAY['Quote URLs verbatim — Notion URLs are stable', 'Quote URLs verbatim; Notion URLs are stable'],
    ARRAY['own Replicate account — every prediction', 'own Replicate account: every prediction'],
    ARRAY['token pools — that''s the default lane', 'token pools; that''s the default lane'],
    ARRAY['shape the response — USE IT', 'shape the response; USE IT'],
    ARRAY['Don''t guess — pick based on the platform.', 'Don''t guess; pick based on the platform.'],
    ARRAY['they''re vague — "make me an Instagram post"', 'they''re vague: "make me an Instagram post"'],
    ARRAY['unless asked — extra runs cost extra.', 'unless asked; extra runs cost extra.'],
    ARRAY['be unambiguous — "make a model', 'be unambiguous: "make a model'],
    ARRAY['user-account modifications — only call when', 'user-account modifications; only call when'],
    ARRAY['(briefly — 1 line).', '(briefly, 1 line).'],
    ARRAY['After delivery, STOP — don''t volunteer', 'After delivery, STOP; don''t volunteer'],
    ARRAY['" — not for warmups.', '", not for warmups.'],
    ARRAY['NEVER call write tools — project:write', 'NEVER call write tools; project:write'],
    ARRAY[') — don''t silently truncate.', '); don''t silently truncate.'],
    ARRAY['"Open disputes — show me the ones over $500."', '"Open disputes: show me the ones over $500."'],
    ARRAY['Zapier MCP server — discover, enable, and execute', 'Zapier MCP server: discover, enable, and execute'],
    ARRAY['refuse politely — direct them to a NICE umbrella', 'refuse politely; direct them to a NICE umbrella']
  ];
  -- Specialist founders and bespoke crew: agent_blueprints only.
  specialist_pats text[] := ARRAY[
    ARRAY['When asked a leadership question — ', 'When asked a leadership question ('],
    ARRAY[' — give a recommendation', '), give a recommendation'],
    ARRAY['of the Brokerage — a real estate office.', 'of the Brokerage, a real estate office.'],
    ARRAY['of the Chambers — a law firm.', 'of the Chambers, a law firm.'],
    ARRAY['of the Dealership — an auto dealership.', 'of the Dealership, an auto dealership.'],
    ARRAY['of the Galley — a restaurant.', 'of the Galley, a restaurant.'],
    ARRAY['of the Jobsite — a construction company.', 'of the Jobsite, a construction company.'],
    ARRAY['of the Loft — a software startup.', 'of the Loft, a software startup.'],
    ARRAY['of the Madison — a marketing agency.', 'of the Madison, a marketing agency.'],
    ARRAY['of the Portfolio — a property management company (residential or mixed-use rental portfolio).', 'of the Portfolio, a property management company (residential or mixed-use rental portfolio).'],
    ARRAY['of the Practice — a healthcare practice (primary care, specialty, or dental).', 'of the Practice, a healthcare practice (primary care, specialty, or dental).'],
    ARRAY['of the Storefront — a direct-to-consumer brand.', 'of the Storefront, a direct-to-consumer brand.'],
    ARRAY['of the Studio — a consultancy.', 'of the Studio, a consultancy.'],
    ARRAY['without counsel''s consent — never.', 'without counsel''s consent: never.'],
    ARRAY['The legal floor is hard — no payment packing', 'The legal floor is hard: no payment packing'],
    ARRAY['Target 100%+ — at 100% the fixed side', 'Target 100%+; at 100% the fixed side'],
    ARRAY['Multilingual sensibility — words chosen with care.', 'Multilingual sensibility: words chosen with care.']
  ];
BEGIN
  FOREACH p SLICE 1 IN ARRAY desc_pats LOOP
    UPDATE public.agent_blueprints
    SET description = replace(description, p[1], p[2])
    WHERE scope = 'catalog' AND strpos(description, p[1]) > 0;
    UPDATE public.capabilities
    SET description = replace(description, p[1], p[2])
    WHERE scope = 'catalog' AND strpos(description, p[1]) > 0;
  END LOOP;

  FOREACH p SLICE 1 IN ARRAY flavor_pats LOOP
    UPDATE public.agent_blueprints
    SET flavor = replace(flavor, p[1], p[2])
    WHERE scope = 'catalog' AND strpos(flavor, p[1]) > 0;
    UPDATE public.capabilities
    SET flavor = replace(flavor, p[1], p[2])
    WHERE scope = 'catalog' AND strpos(flavor, p[1]) > 0;
  END LOOP;

  FOREACH p SLICE 1 IN ARRAY card_pats LOOP
    UPDATE public.agent_blueprints
    SET card = jsonb_set(card, '{caps}', (
          SELECT jsonb_agg(replace(elem, p[1], p[2]) ORDER BY ord)
          FROM jsonb_array_elements_text(card->'caps') WITH ORDINALITY AS c(elem, ord)))
    WHERE scope = 'catalog' AND strpos((card->'caps')::text, p[1]) > 0;
    UPDATE public.capabilities
    SET card = jsonb_set(card, '{caps}', (
          SELECT jsonb_agg(replace(elem, p[1], p[2]) ORDER BY ord)
          FROM jsonb_array_elements_text(card->'caps') WITH ORDINALITY AS c(elem, ord)))
    WHERE scope = 'catalog' AND strpos((card->'caps')::text, p[1]) > 0;
  END LOOP;

  FOREACH p SLICE 1 IN ARRAY prompt_pats LOOP
    UPDATE public.agent_blueprints
    SET config = jsonb_set(config, '{system_prompt}',
          to_jsonb(replace(config->>'system_prompt', p[1], p[2])))
    WHERE scope = 'catalog' AND strpos(config->>'system_prompt', p[1]) > 0;
    UPDATE public.capabilities
    SET config = jsonb_set(config, '{system_prompt}',
          to_jsonb(replace(config->>'system_prompt', p[1], p[2])))
    WHERE scope = 'catalog' AND strpos(config->>'system_prompt', p[1]) > 0;
  END LOOP;

  FOREACH p SLICE 1 IN ARRAY specialist_pats LOOP
    UPDATE public.agent_blueprints
    SET config = jsonb_set(config, '{system_prompt}',
          to_jsonb(replace(config->>'system_prompt', p[1], p[2])))
    WHERE scope = 'catalog' AND strpos(config->>'system_prompt', p[1]) > 0;
  END LOOP;
END;
$sweep_crews$;

-- Apply-gate: zero em-dashes anywhere in catalog-scope rows of the three
-- swept tables. Pre-sweep the em-dash lived only in the swept fields
-- (verified), so a whole-row check is the strongest guard: any leftover,
-- including copy that drifted in after this migration was authored, fails
-- the apply and rolls the sweep back.
DO $smoke$
BEGIN
  ASSERT (SELECT count(*) FROM public.spaceship_blueprints t
          WHERE t.scope = 'catalog' AND to_jsonb(t)::text LIKE '%—%') = 0,
    'catalog spaceship_blueprints rows still carry em-dashes';
  ASSERT (SELECT count(*) FROM public.agent_blueprints t
          WHERE t.scope = 'catalog' AND to_jsonb(t)::text LIKE '%—%') = 0,
    'catalog agent_blueprints rows still carry em-dashes';
  ASSERT (SELECT count(*) FROM public.capabilities t
          WHERE t.scope = 'catalog' AND to_jsonb(t)::text LIKE '%—%') = 0,
    'catalog capabilities rows still carry em-dashes';
END;
$smoke$;
