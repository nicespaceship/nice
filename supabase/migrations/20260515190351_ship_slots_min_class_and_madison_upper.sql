-- Add per-slot rank gating + backfill The Madison's upper six slots.
--
-- Until now, every `ship_slots` row was visible to every user; whether a
-- ship felt accessible at low rank came from the ship's overall rarity
-- only. With per-slot `min_class`, a single ship can present a growth
-- ladder: The Madison ships with 6 visible slots at Ensign, expands to
-- 8 at Lieutenant (class-2), 10 at Commander (class-3), and 12 at
-- Captain (class-4). The user sees the locked slots in the card art
-- and on the schematic, with the unlock rank surfaced inline.
--
-- `class-1` = always visible (no rank gate). The CHECK constraint
-- matches `gamification.js`'s SPACESHIP_CLASSES — class-5 is the Pro
-- subscription tier and unlocks everything class-4 does.

BEGIN;

ALTER TABLE public.ship_slots
  ADD COLUMN min_class text NOT NULL DEFAULT 'class-1';

ALTER TABLE public.ship_slots
  ADD CONSTRAINT ship_slots_min_class_chk
  CHECK (min_class IN ('class-1','class-2','class-3','class-4','class-5'));

-- The Madison: backfill slots 7-12 (1-indexed; conceptually slots 6-11).
-- See docs/three-layer-schema.md for the 12-slot growth narrative.
DO $$
DECLARE
  v_ship_id   uuid;
  v_slack     uuid;
  v_replicate uuid;
  v_zapier    uuid;
  v_stripe    uuid;
BEGIN
  SELECT id INTO v_ship_id FROM public.spaceship_blueprints WHERE slug='the-madison';
  IF v_ship_id IS NULL THEN
    RAISE EXCEPTION 'The Madison spaceship_blueprint not found (slug=the-madison)';
  END IF;

  SELECT id INTO v_slack     FROM public.agent_blueprints WHERE slug='slack';
  SELECT id INTO v_replicate FROM public.agent_blueprints WHERE slug='replicate';
  SELECT id INTO v_zapier    FROM public.agent_blueprints WHERE slug='zapier';
  SELECT id INTO v_stripe    FROM public.agent_blueprints WHERE slug='stripe';

  IF v_slack IS NULL OR v_replicate IS NULL OR v_zapier IS NULL OR v_stripe IS NULL THEN
    RAISE EXCEPTION 'Missing default agent: slack=% replicate=% zapier=% stripe=%',
      v_slack, v_replicate, v_zapier, v_stripe;
  END IF;

  -- Idempotency guard — re-running this migration on a DB that already
  -- has the upper six must be a no-op rather than a UNIQUE violation.
  IF EXISTS (
    SELECT 1 FROM public.ship_slots
     WHERE spaceship_id = v_ship_id AND slot_position >= 7
  ) THEN
    RAISE NOTICE 'The Madison upper slots already present, skipping backfill';
    RETURN;
  END IF;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id,  7, 'communications', v_slack,     'Comms Lead',       'class-2'),
    (v_ship_id,  8, 'marketing',      v_replicate, 'Media Producer',   'class-2'),
    (v_ship_id,  9, 'analytics',      NULL,        'Performance Lead', 'class-3'),
    (v_ship_id, 10, 'operations',     v_zapier,    'Studio Manager',   'class-3'),
    (v_ship_id, 11, 'research',       NULL,        'Strategy Lead',    'class-4'),
    (v_ship_id, 12, 'finance',        v_stripe,    'Finance Lead',     'class-4');
END $$;

-- Update the card's stats.slots so the surfaced count reflects the
-- full agency line, not the six-slot beachhead. Card-renderer reads
-- card.stats.slots when no live slot count is available.
UPDATE public.spaceship_blueprints
   SET card = jsonb_set(card, '{stats,slots}', '"12"'::jsonb)
 WHERE slug = 'the-madison';

COMMIT;
