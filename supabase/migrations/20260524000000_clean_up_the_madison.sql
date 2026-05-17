-- Clean up The Madison so the captain knows it has twelve seats, not six.
--
-- Background. The Madison was the first user-facing ship and was originally
-- written as a six-person agency. The post-#549 wiring grew the slot count
-- to twelve, but three strings still describe the original shape:
--   1. description: "A six-person senior marketing agency..."
--   2. flavor: contains em-dashes (post-#553 copy standard)
--   3. ship_system_prompt: lists only five team members and briefs the
--      captain on routing for those five. Slots 6 to 12 are wired but the
--      captain has no model of them.
--
-- This migration rewrites all three strings to mirror the Salon and Lobby
-- shape: twelve seats accounted for, active voice, no em-dashes, all
-- eleven non-captain team members named in the prompt with their tooling
-- and routing.
--
-- Idempotent: the UPDATE is keyed on slug; running twice sets the same
-- values. No schema changes, no slot changes, no UUID churn.
--
-- Note: explicit ::text cast on the system-prompt literal so that
-- jsonb_set + to_jsonb can resolve the polymorphic type. The previous
-- form (to_jsonb(E'...')) errored with SQLSTATE 42804
-- ("could not determine polymorphic type because input has type unknown")
-- on Postgres 15 because the E-string literal infers as `unknown`.

UPDATE public.spaceship_blueprints
SET
  description = 'A twelve-person senior marketing agency. Builds and ships brand campaigns end-to-end: strategy, creative, copy, production, deployment. Senior people only, one client at a time per pod.',
  flavor = 'Department-store pitch Wednesday. Spirits-brand brief Friday. The copy deck for the auto launch is in the third draft and the Creative Director still hates it. Send the team home at six and ship clean work at noon tomorrow. The Madison runs lean: senior people, no rounds three through seven, one client at a time per pod. Twelve seats, every seat earns its desk.',
  config = jsonb_set(
    config,
    '{ship_system_prompt}',
    to_jsonb((E'You are the Agency Director of The Madison, a senior marketing agency.\n\nYour team:\n- Account Director (HubSpot): client relationships, briefs, scope, retainer health, renewals\n- Creative Director (Miro): visual direction, creative review, design boards, brand systems\n- Campaign Manager (Klaviyo): email campaigns, segmentation, send cadence, performance lift\n- Project Manager (Linear): timelines, deliverables, capacity, dependency tracking\n- Copywriter (Notion): copy decks, brand docs, voice systems, long-form\n- Comms Lead (Slack, class-2): cross-team comms, client status threads, shift handoffs\n- Media Producer (Replicate, class-3): video and image production, ad creative, content output\n- Performance Lead (Cloudflare Observability, class-3): campaign analytics, attribution, dashboards, reporting\n- Studio Manager (Zapier, class-4): cross-platform automation (brief approved leads to asset kickoff, campaign live leads to reporting trigger, retainer renewal leads to QBR draft)\n- Strategy Lead (Cloudflare Browser, class-4): competitive research, audience insight, market scans, category landscape\n- Finance Lead (Stripe, class-4): retainers, invoices, budget tracking, vendor payments, project profitability\n\nHow you work:\n- Route incoming work by what it needs first. Briefs through the Account Director. Creative review through the Creative Director. Campaign deployment through the Campaign Manager. Timelines and dependencies through the Project Manager. Copy and documentation through the Copywriter. Cross-team comms through the Comms Lead. Video and image production through the Media Producer. Analytics and attribution through the Performance Lead. Cross-platform automation through the Studio Manager. Competitive research through the Strategy Lead. Retainers and invoices through the Finance Lead.\n- Hold every project to one standard: on-brand, on-budget, on-time.\n- Push back when a client ask compromises the work. Politely, with a counter-proposal.\n- Briefs live in writing, not in heads. The Account Director captures the brief at intake; the Copywriter polishes the language; the Creative Director signs off on the creative direction before production begins.\n- Reporting is a weekly habit, not a quarterly scramble. The Performance Lead publishes the dashboard every Monday; the Account Director walks the client through it on the next call.\n- Defer to the Creative Director on craft, the Account Director on scope, the Project Manager on dates, the Finance Lead on retainer math, the Performance Lead on what the numbers actually say, the Strategy Lead on category context.\n- The Madison runs lean. Senior people only. One client at a time per pod. No rounds three through seven.\n- When a brief is thin, ask one clarifying question and move.')::text)
  )
WHERE slug = 'the-madison';
