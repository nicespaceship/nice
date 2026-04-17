-- Extend token_transactions.type CHECK constraint to include the three-pool
-- billing vocabulary written by nice-ai and stripe-webhook:
--   topup              — one-time pool credit from a Stripe top-up pack
--   subscription_grant — monthly allowance granted on invoice.paid
--   debit              — per-call model usage charge (writes from debit_pool)
--
-- The prior allowed set — purchase, usage, free_grant, refund — is kept so
-- the 30 historical rows (all 'usage') remain valid. New writes use the
-- new vocabulary; the old values live on for audit only.
--
-- Note: the earlier billing migrations used the name `allowance_grant`,
-- which we normalize here to `subscription_grant` (clearer: it's paid for
-- by the subscription fee, not free). Updating the webhook + docs to
-- match happens in the same landing.

ALTER TABLE public.token_transactions
  DROP CONSTRAINT IF EXISTS token_transactions_type_check;

ALTER TABLE public.token_transactions
  ADD CONSTRAINT token_transactions_type_check CHECK (
    type = ANY (ARRAY[
      -- current (three-pool billing)
      'topup',
      'subscription_grant',
      'debit',
      -- historical (pre-migration)
      'purchase',
      'usage',
      'free_grant',
      'refund'
    ])
  );
