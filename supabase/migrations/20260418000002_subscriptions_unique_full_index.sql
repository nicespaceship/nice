-- The previous migration created a PARTIAL UNIQUE INDEX on
-- stripe_subscription_id (WHERE stripe_subscription_id IS NOT NULL).
-- That collides with Supabase's client-side upsert(..., {
-- onConflict: 'stripe_subscription_id' }), because Postgres requires
-- ON CONFLICT to specify the same WHERE predicate the partial index
-- uses, and the JS client doesn't expose that knob.
--
-- Replace with a regular UNIQUE constraint. Postgres allows multiple
-- NULLs in a plain unique index by default, so the bootstrap rows
-- (stripe_subscription_id=NULL) still don't collide with each other.

DROP INDEX IF EXISTS public.subscriptions_stripe_subscription_id_key;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_stripe_subscription_id_key
  UNIQUE (stripe_subscription_id);
