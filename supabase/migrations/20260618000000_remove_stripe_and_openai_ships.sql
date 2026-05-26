-- Remove the Stripe and OpenAI Epic ships from the catalog.
--
-- Both ships were seeded earlier today (cards #27 and #29) and Ben asked
-- for them to be removed. Zero user activations on either at removal
-- time, so this is a clean drop with no orphan user_spaceships rows.
--
-- Removes in dependency order: ship_slots first, then the bespoke
-- captain agent_blueprints (tagged `*-exclusive` so they cannot appear
-- in any other ship's slot dropdown), then the spaceship_blueprints rows.

DELETE FROM public.ship_slots
 WHERE spaceship_id IN (
   SELECT id FROM public.spaceship_blueprints
    WHERE slug IN ('the-stripe', 'the-openai')
      AND scope = 'catalog'
 );

DELETE FROM public.agent_blueprints
 WHERE slug IN ('stripe-patrick-collison', 'openai-sam-altman')
   AND scope = 'catalog';

DELETE FROM public.spaceship_blueprints
 WHERE slug IN ('the-stripe', 'the-openai')
   AND scope = 'catalog';
