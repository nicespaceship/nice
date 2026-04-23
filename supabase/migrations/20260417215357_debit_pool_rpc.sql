-- Replace flat-balance `deduct_tokens` RPC with per-pool `debit_pool`.
--
-- `debit_pool` atomically debits a single pool's `used` counter,
-- spilling into `purchased` when `used` would exceed `allowance`.
-- Returns the pool's remaining balance (allowance-used + purchased)
-- so the caller can include it in the ledger row.
--
-- All writes happen under a single UPDATE with jsonb_set, so concurrent
-- invocations on the same user serialize at the row lock.

DROP FUNCTION IF EXISTS public.deduct_tokens(uuid, integer);

CREATE OR REPLACE FUNCTION public.debit_pool(
  p_user_id     uuid,
  p_pool        text,
  p_amount      integer,
  p_model       text DEFAULT NULL,
  p_metadata    jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE (remaining bigint, used bigint, purchased bigint, allowance bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool_before jsonb;
  v_used        bigint;
  v_allowance   bigint;
  v_purchased   bigint;
  v_spill_used  bigint;  -- portion debited from allowance (bounded by allowance)
  v_spill_paid  bigint;  -- portion debited from purchased (the remainder)
  v_new_used    bigint;
  v_new_purch   bigint;
  v_remaining   bigint;
BEGIN
  IF p_pool NOT IN ('standard','claude','premium') THEN
    RAISE EXCEPTION 'Invalid pool: %', p_pool;
  END IF;
  IF p_amount < 0 THEN
    RAISE EXCEPTION 'Amount must be non-negative';
  END IF;

  -- Lock the row for the duration of this transaction
  SELECT pools -> p_pool
    INTO v_pool_before
    FROM token_balances
   WHERE user_id = p_user_id
     FOR UPDATE;

  IF v_pool_before IS NULL THEN
    RAISE EXCEPTION 'No token_balances row for user %', p_user_id;
  END IF;

  v_allowance := COALESCE((v_pool_before->>'allowance')::bigint, 0);
  v_used      := COALESCE((v_pool_before->>'used')::bigint, 0);
  v_purchased := COALESCE((v_pool_before->>'purchased')::bigint, 0);

  -- Debit allowance first (up to what remains), then spill into purchased.
  v_spill_used := LEAST(p_amount, GREATEST(v_allowance - v_used, 0));
  v_spill_paid := p_amount - v_spill_used;

  IF v_spill_paid > v_purchased THEN
    RAISE EXCEPTION 'Insufficient balance in pool % (need %, have %)',
      p_pool, p_amount, GREATEST(v_allowance - v_used, 0) + v_purchased;
  END IF;

  v_new_used  := v_used + v_spill_used;
  v_new_purch := v_purchased - v_spill_paid;
  v_remaining := GREATEST(v_allowance - v_new_used, 0) + v_new_purch;

  UPDATE token_balances
     SET pools = jsonb_set(
                  jsonb_set(pools,
                            ARRAY[p_pool, 'used'],
                            to_jsonb(v_new_used)),
                  ARRAY[p_pool, 'purchased'],
                  to_jsonb(v_new_purch)),
         lifetime_used = COALESCE(lifetime_used, 0) + p_amount,
         updated_at = now()
   WHERE user_id = p_user_id;

  INSERT INTO token_transactions (user_id, type, pool, amount, balance_after, model, metadata)
  VALUES (
    p_user_id,
    'debit',
    p_pool,
    p_amount,
    v_remaining,
    p_model,
    p_metadata
  );

  remaining := v_remaining;
  used      := v_new_used;
  purchased := v_new_purch;
  allowance := v_allowance;
  RETURN NEXT;
END;
$$;

-- Service role and authenticated users may call this; RLS on the
-- underlying tables still applies to the outer queries.
GRANT EXECUTE ON FUNCTION public.debit_pool(uuid, text, integer, text, jsonb) TO service_role;
