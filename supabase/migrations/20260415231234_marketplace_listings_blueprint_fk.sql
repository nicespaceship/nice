-- Add foreign key: marketplace_listings.blueprint_id → blueprints.id
--
-- Without this constraint, PostgREST's schema cache can't infer the
-- relationship between the two tables, so the embedded-select syntax
-- used by the client (`.select('..., blueprint:blueprints!inner(...)')`)
-- returns "Could not find a relationship" errors.
--
-- Declaring the FK both enables the join and guarantees referential
-- integrity: a listing can't point at a blueprint that doesn't exist,
-- and deleting a blueprint cascades its listings.

BEGIN;

ALTER TABLE public.marketplace_listings
  ADD CONSTRAINT marketplace_listings_blueprint_id_fkey
  FOREIGN KEY (blueprint_id)
  REFERENCES public.blueprints(id)
  ON DELETE CASCADE;

COMMIT;
