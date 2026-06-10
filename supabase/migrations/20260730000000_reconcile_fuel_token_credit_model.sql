-- Reconcile the fuel/token credit model.
--
-- The token model (token_balances + token_transactions) is the live, sole credit
-- system: written by nice-ai (pool debits) and stripe-webhook (grants, top-ups,
-- refunds), mirrored client-side by TokenConfig. The fuel_* tables were a stalled
-- half-migration. fuel_usage is the per-call telemetry log the Cost Tracker and
-- Operations analytics read, but nothing ever wrote it, so those views rendered an
-- empty state for everyone; nice-ai now writes one fuel_usage row per LLM call.
-- fuel_purchases / fuel_transactions / profiles.fuel_balance duplicated the token
-- ledger's job while staying empty (tables) or write-only (column).
--
-- This migration widens fuel_cost to hold fractional-dollar COGS, drops the three
-- dead credit-imposters, and stops the signup trigger writing fuel_balance.

-- 1. fuel_usage.fuel_cost: integer -> numeric. Per-call provider COGS is sub-dollar
--    (a Gemini Flash message costs ~$0.001); an integer column rounded it to 0.
ALTER TABLE public.fuel_usage ALTER COLUMN fuel_cost DROP DEFAULT;
ALTER TABLE public.fuel_usage ALTER COLUMN fuel_cost TYPE numeric(12,6) USING fuel_cost::numeric;
ALTER TABLE public.fuel_usage ALTER COLUMN fuel_cost SET DEFAULT 0;

-- 2. Drop the empty, never-written credit-imposter tables. token_transactions
--    (types topup / subscription_grant / refund) is the sole purchase/grant ledger;
--    wallet.js already reads it. RLS policies drop with the tables.
DROP TABLE IF EXISTS public.fuel_purchases;
DROP TABLE IF EXISTS public.fuel_transactions;

-- 3. profiles.fuel_balance was set to 1000 once at signup and read by zero code.
--    Stop the trigger writing it, then drop the column. Rewrite preserves the live
--    function verbatim apart from the dropped column (id PK ON CONFLICT, search_path).
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, display_name, plan, xp, achievements)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      split_part(NEW.email, '@', 1),
      'Pilot'
    ),
    'free',
    0,
    '[]'::jsonb
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS fuel_balance;
