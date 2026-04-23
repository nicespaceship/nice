-- Three-pool billing architecture
--
-- Replaces the flat `balance`/`free_tier_remaining` enforcement path (which
-- matched neither the client UI nor the Stripe catalog) with per-pool
-- allowance/used/purchased accounting. Adds:
--   token_balances.pools jsonb  — { standard, claude, premium } with
--                                 { allowance, used, purchased } each.
--   subscriptions.addons  text[]  — active add-ons (subset of
--                                   {'claude','premium'}).
--   token_transactions.pool text  — pool the ledger row debited/credited.
--   public.stripe_events          — webhook idempotency dedup (event_id PK).
--
-- Legacy enforcement columns dropped: balance, free_tier_remaining.
-- Kept as running totals for analytics: lifetime_purchased, lifetime_used.
--
-- Safe to run because there are zero paying customers (lifetime_purchased
-- sum across all rows is 0) and the only `token_balances` row is the
-- owner's test record.

-- 1. token_balances.pools ---------------------------------------------------

ALTER TABLE public.token_balances
  ADD COLUMN IF NOT EXISTS pools jsonb NOT NULL DEFAULT
    '{"standard":{"allowance":0,"used":0,"purchased":0},"claude":{"allowance":0,"used":0,"purchased":0},"premium":{"allowance":0,"used":0,"purchased":0}}'::jsonb;

-- Top-level shape constraint. Field-level shape (numeric, non-negative) is
-- enforced by the webhook + nice-ai writers; a strict CHECK here evaluates
-- every predicate unconditionally and breaks if a path is missing, so we
-- only guarantee the three pool keys exist as objects.
ALTER TABLE public.token_balances
  DROP CONSTRAINT IF EXISTS token_balances_pools_shape;
ALTER TABLE public.token_balances
  ADD CONSTRAINT token_balances_pools_shape CHECK (
    pools ? 'standard'
    AND pools ? 'claude'
    AND pools ? 'premium'
    AND jsonb_typeof(pools->'standard') = 'object'
    AND jsonb_typeof(pools->'claude')   = 'object'
    AND jsonb_typeof(pools->'premium')  = 'object'
  );

-- Drop legacy enforcement columns (no paying customers; Gemini is free +
-- unlimited so `free_tier_remaining` as a cap was never correct).
ALTER TABLE public.token_balances DROP COLUMN IF EXISTS balance;
ALTER TABLE public.token_balances DROP COLUMN IF EXISTS free_tier_remaining;

-- 2. subscriptions.addons ---------------------------------------------------

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS addons text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_addons_valid;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_addons_valid CHECK (
    addons <@ ARRAY['claude','premium']::text[]
  );

-- 3. token_transactions.pool ------------------------------------------------

ALTER TABLE public.token_transactions
  ADD COLUMN IF NOT EXISTS pool text;

ALTER TABLE public.token_transactions
  DROP CONSTRAINT IF EXISTS token_transactions_pool_valid;
ALTER TABLE public.token_transactions
  ADD CONSTRAINT token_transactions_pool_valid CHECK (
    pool IS NULL OR pool IN ('standard','claude','premium')
  );

-- 4. stripe_events dedup ---------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stripe_events (
  event_id   text PRIMARY KEY,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages stripe_events" ON public.stripe_events;
CREATE POLICY "Service role manages stripe_events"
  ON public.stripe_events
  FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 5. Explicit service_role RLS for the billing tables (bypassed by default
--    via service role, but an explicit policy makes the intent auditable).

DROP POLICY IF EXISTS "Service role manages token_balances" ON public.token_balances;
CREATE POLICY "Service role manages token_balances"
  ON public.token_balances
  FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role manages token_transactions" ON public.token_transactions;
CREATE POLICY "Service role manages token_transactions"
  ON public.token_transactions
  FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
