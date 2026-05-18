-- Rename slot 11 from the placeholder 'Operations Engineer' label to
-- an industry-appropriate title on each ship. The class-4 workflow-
-- automation operator should read as a real-business role, not a
-- generic engineering one — that label was a first-draft holdover.
-- The Lobby (#554) shipped with 'Director of Operations' to set the
-- precedent for hospitality; this migration catches the nine ships
-- seeded before that decision and gives each a role title that fits
-- its industry's actual org chart.

DO $$
DECLARE
  v_id uuid;
BEGIN
  -- The Galley — restaurant. FOH GM is the standard counterpart
  -- to the Head Chef.
  SELECT id INTO v_id FROM public.spaceship_blueprints WHERE slug = 'the-galley';
  IF v_id IS NOT NULL THEN
    UPDATE public.ship_slots SET label = 'General Manager'
      WHERE spaceship_id = v_id AND slot_position = 11;
  END IF;

  -- The Storefront — e-commerce.
  SELECT id INTO v_id FROM public.spaceship_blueprints WHERE slug = 'the-storefront';
  IF v_id IS NOT NULL THEN
    UPDATE public.ship_slots SET label = 'Operations Director'
      WHERE spaceship_id = v_id AND slot_position = 11;
  END IF;

  -- The Brokerage — real estate.
  SELECT id INTO v_id FROM public.spaceship_blueprints WHERE slug = 'the-brokerage';
  IF v_id IS NOT NULL THEN
    UPDATE public.ship_slots SET label = 'Director of Operations'
      WHERE spaceship_id = v_id AND slot_position = 11;
  END IF;

  -- The Studio — consultancy.
  SELECT id INTO v_id FROM public.spaceship_blueprints WHERE slug = 'the-studio';
  IF v_id IS NOT NULL THEN
    UPDATE public.ship_slots SET label = 'Director of Operations'
      WHERE spaceship_id = v_id AND slot_position = 11;
  END IF;

  -- The Dealership — auto. Captain is already General Manager;
  -- slot 12 is Fixed Ops Director (service + parts), so slot 11
  -- becomes Variable Ops Director (new + used vehicle sales side)
  -- to complete the standard dealership ops split.
  SELECT id INTO v_id FROM public.spaceship_blueprints WHERE slug = 'the-dealership';
  IF v_id IS NOT NULL THEN
    UPDATE public.ship_slots SET label = 'Variable Ops Director'
      WHERE spaceship_id = v_id AND slot_position = 11;
  END IF;

  -- The Practice — healthcare. Practice Administrator is the
  -- standard non-clinical operations title in primary care,
  -- specialty, and dental practices.
  SELECT id INTO v_id FROM public.spaceship_blueprints WHERE slug = 'the-practice';
  IF v_id IS NOT NULL THEN
    UPDATE public.ship_slots SET label = 'Practice Administrator'
      WHERE spaceship_id = v_id AND slot_position = 11;
  END IF;

  -- The Jobsite — construction.
  SELECT id INTO v_id FROM public.spaceship_blueprints WHERE slug = 'the-jobsite';
  IF v_id IS NOT NULL THEN
    UPDATE public.ship_slots SET label = 'Operations Director'
      WHERE spaceship_id = v_id AND slot_position = 11;
  END IF;

  -- The Portfolio — property management.
  SELECT id INTO v_id FROM public.spaceship_blueprints WHERE slug = 'the-portfolio';
  IF v_id IS NOT NULL THEN
    UPDATE public.ship_slots SET label = 'Director of Operations'
      WHERE spaceship_id = v_id AND slot_position = 11;
  END IF;

  -- The Salon — beauty / hair / day spa.
  SELECT id INTO v_id FROM public.spaceship_blueprints WHERE slug = 'the-salon';
  IF v_id IS NOT NULL THEN
    UPDATE public.ship_slots SET label = 'Salon Director'
      WHERE spaceship_id = v_id AND slot_position = 11;
  END IF;
END $$;
