-- The Galley's slot 12 (class-4 unlock, role_type='product') shipped as
-- "Sous Chef", which is second-in-command on the line and ranks below
-- the captain slot's "Head Chef". A class-4 unlock should be a senior
-- peer/parallel role, not a subordinate.
--
-- Executive Chef owns menu, concept, and culinary direction across the
-- operation — the role a chef-operator grows into when the business
-- outgrows a single kitchen lead. Matches role_type='product' (menu R&D
-- = product development).
--
-- Idempotent: only renames when the label still reads "Sous Chef".

UPDATE public.ship_slots
SET label = 'Executive Chef'
WHERE spaceship_id = (SELECT id FROM public.spaceship_blueprints WHERE slug = 'the-galley')
  AND slot_position = 12
  AND label = 'Sous Chef';
