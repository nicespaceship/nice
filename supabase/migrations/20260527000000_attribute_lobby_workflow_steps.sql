-- Per-step agent attribution for The Lobby's Workflows tab. Each
-- workflow step gets an `agent_slot` (1-indexed against ship_slots)
-- so the card renders "Capture reservation and intake — Front Desk
-- Lead" instead of an unowned verb. The renderer resolves the slot
-- label at render time via bp.crew, so future slot renames propagate
-- without touching this data again.
--
-- Lobby is the proof-of-design ship; the other 12 ships will be
-- backfilled in a follow-up migration once this shape lands.

DO $$
DECLARE
  v_ship_id uuid;
BEGIN
  SELECT id INTO v_ship_id FROM public.spaceship_blueprints WHERE slug = 'the-lobby';
  IF v_ship_id IS NULL THEN
    RAISE NOTICE 'the-lobby not found; skipping workflow attribution';
    RETURN;
  END IF;

  UPDATE public.spaceship_blueprints
  SET card = jsonb_set(
    card,
    '{workflows}',
    jsonb_build_array(
      jsonb_build_object('title', 'New reservation end-to-end',
        'steps', jsonb_build_array(
          jsonb_build_object('step', 'Capture reservation and intake',       'agent_slot',  2),
          jsonb_build_object('step', 'Confirm payment and deposit',          'agent_slot',  4),
          jsonb_build_object('step', 'Flag occasion and preferences',        'agent_slot',  3),
          jsonb_build_object('step', 'Send pre-arrival sequence',            'agent_slot',  6),
          jsonb_build_object('step', 'Prep arrivals sheet for front desk',   'agent_slot', 11)
        )),
      jsonb_build_object('title', 'Stay end-to-end',
        'steps', jsonb_build_array(
          jsonb_build_object('step', 'Welcome and key handoff',              'agent_slot',  2),
          jsonb_build_object('step', 'Note preferences during stay',         'agent_slot',  3),
          jsonb_build_object('step', 'Capture moments for content with consent', 'agent_slot',  9),
          jsonb_build_object('step', 'Settle folio at checkout',             'agent_slot',  4),
          jsonb_build_object('step', 'Pre-book next stay or queue recall',   'agent_slot', 12)
        )),
      jsonb_build_object('title', 'Review response',
        'steps', jsonb_build_array(
          jsonb_build_object('step', 'Surface review under threshold',       'agent_slot',  8),
          jsonb_build_object('step', 'Tag staff names and issues',           'agent_slot',  8),
          jsonb_build_object('step', 'Draft owner reply',                    'agent_slot',  8),
          jsonb_build_object('step', 'Approve and post',                     'agent_slot',  1),
          jsonb_build_object('step', 'Close loop with staff on the floor',   'agent_slot',  7)
        )),
      jsonb_build_object('title', 'Daily close',
        'steps', jsonb_build_array(
          jsonb_build_object('step', 'Reconcile folios to deposit',          'agent_slot',  4),
          jsonb_build_object('step', 'Push OTA payout file',                 'agent_slot',  4),
          jsonb_build_object('step', 'Publish direct-vs-OTA share',          'agent_slot',  1),
          jsonb_build_object('step', 'Flag low amenity SKUs',                'agent_slot', 10),
          jsonb_build_object('step', 'Confirm tomorrow''s arrivals briefing','agent_slot', 11)
        ))
    )
  )
  WHERE id = v_ship_id;
END $$;
