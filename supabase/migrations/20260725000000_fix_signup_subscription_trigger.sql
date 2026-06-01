-- Fix: new-user signups have been failing in production.
--
-- handle_new_user_subscription() (fired AFTER INSERT on auth.users) runs:
--     INSERT INTO subscriptions ... ON CONFLICT (user_id) DO NOTHING
-- but the only unique index on subscriptions.user_id is the PARTIAL index
-- `subscriptions_user_id_bootstrap_key` (... WHERE stripe_subscription_id IS NULL),
-- added when the multi-row subscription model landed. `ON CONFLICT (user_id)`
-- without that predicate matches no unique constraint, so Postgres raises
-- 42P10 ("no unique or exclusion constraint matching the ON CONFLICT
-- specification") on every auth.users insert and the entire signup
-- transaction rolls back. Symptom: no new user has been created since the
-- index was introduced.
--
-- The bootstrap row this trigger inserts always has stripe_subscription_id
-- NULL, so it falls under the partial index. Add the matching index predicate
-- to the ON CONFLICT clause so the bootstrap free row dedups correctly and the
-- insert succeeds.

CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, plan, status, addons)
  VALUES (NEW.id, 'free', 'active', ARRAY[]::text[])
  ON CONFLICT (user_id) WHERE (stripe_subscription_id IS NULL) DO NOTHING;

  INSERT INTO public.token_balances (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;
