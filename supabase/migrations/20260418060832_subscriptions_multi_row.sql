-- Allow multiple rows per user_id in subscriptions, keyed by stripe_subscription_id.
--
-- NICE's Stripe catalog uses one Payment Link per product (Pro, Claude add-on,
-- Premium add-on). Each Payment Link creates a separate Stripe subscription.
-- A Pro user who buys the Claude add-on ends up with two `sub_...` IDs in Stripe.
--
-- Prior schema had UNIQUE(user_id), so stripe-webhook's upsert-by-user_id
-- clobbered the first row every time a new subscription landed. Drop that
-- constraint and switch the natural key to stripe_subscription_id.
-- Reads aggregate plan + addons across all active subscriptions for a user.

-- Drop the UNIQUE(user_id) constraint / index
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='subscriptions'
      AND indexname='subscriptions_user_id_key'
  ) THEN
    EXECUTE 'ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_user_id_key';
  END IF;
END $$;

-- Keep the non-unique btree index on user_id for read performance
-- (already exists as `idx_subscriptions_user`).

-- Add UNIQUE(stripe_subscription_id). Rows with NULL stripe_subscription_id
-- (the free-plan bootstrap rows) are allowed in multiples — NULL doesn't
-- participate in UNIQUE by default in Postgres.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_key
  ON public.subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Backfill Ben's duplicate state (the single user impacted).
-- Before this migration the table has ONE row for Ben with mixed state
-- (Pro's stripe_subscription_id + Claude's stripe_customer_id). Split it
-- into the two rows it should have been.
DO $$
BEGIN
  -- Only run if we're in the mixed state (Pro sub id + Claude customer id)
  IF EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = '79e9d954-9355-462b-9feb-bc2c12b51a3d'
      AND stripe_subscription_id = 'sub_1TNL4kBTNqh90rCu3MBkwjSG'
      AND stripe_customer_id = 'cus_UMADgnMXgRe9Dc'
  ) THEN
    -- Reset the existing row to correct Pro state
    UPDATE public.subscriptions
    SET stripe_customer_id = 'cus_UM3Buf4SyEPs1p',
        updated_at = now()
    WHERE user_id = '79e9d954-9355-462b-9feb-bc2c12b51a3d'
      AND stripe_subscription_id = 'sub_1TNL4kBTNqh90rCu3MBkwjSG';

    -- Insert the Claude subscription as a separate row
    INSERT INTO public.subscriptions (
      user_id, stripe_customer_id, stripe_subscription_id,
      plan, status, addons,
      current_period_start, current_period_end, cancel_at_period_end
    ) VALUES (
      '79e9d954-9355-462b-9feb-bc2c12b51a3d',
      'cus_UMADgnMXgRe9Dc',
      'sub_1TNRswBTNqh90rCuxZAxP3Hx',
      'free',
      'active',
      ARRAY['claude']::text[],
      to_timestamp(1776491858),
      to_timestamp(1779083858),
      false
    )
    ON CONFLICT (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL
    DO NOTHING;
  END IF;
END $$;

-- Grant claude pool allowance (the invoice was paid when Ben bought the
-- add-on; webhook updated addons but didn't grant because of the upsert
-- collision). Idempotent — only runs if claude pool is currently empty.
UPDATE public.token_balances
SET pools = jsonb_set(
        jsonb_set(pools, ARRAY['claude','allowance'], to_jsonb(500)),
        ARRAY['claude','used'], to_jsonb(0)
     ),
    updated_at = now()
WHERE user_id = '79e9d954-9355-462b-9feb-bc2c12b51a3d'
  AND (pools->'claude'->>'allowance')::bigint = 0;

INSERT INTO public.token_transactions (user_id, type, pool, amount, balance_after, metadata)
SELECT
  '79e9d954-9355-462b-9feb-bc2c12b51a3d',
  'subscription_grant',
  'claude',
  500,
  500,
  jsonb_build_object(
    'subscription_id', 'sub_1TNRswBTNqh90rCuxZAxP3Hx',
    'billing_reason', 'backfill_addon_purchase',
    'note', 'multi-row migration backfill'
  )
WHERE NOT EXISTS (
  SELECT 1 FROM public.token_transactions
  WHERE user_id = '79e9d954-9355-462b-9feb-bc2c12b51a3d'
    AND type = 'subscription_grant'
    AND pool = 'claude'
);
