-- ═══════════════════════════════════════════════════════════════════
-- 005: Token Pools & Subscription Add-ons
-- Restructures the token balance into named pools (standard, claude)
-- so expensive flagship models can be weighted and billed separately
-- from cheaper standard models without a user-visible schema change.
-- Adds `subscriptions.addons` so plan is still `free | pro` and
-- optional flagship tiers (Claude, future GPT-5 Pro, etc.) are
-- additive items on the same subscription.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Ensure base tables exist (repo was out of sync with live DB)
create table if not exists token_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0,
  free_tier_remaining integer not null default 0,
  lifetime_purchased integer not null default 0,
  lifetime_used integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists token_transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null,           -- 'subscription_credit', 'purchase_credit', 'usage_debit', 'refund', 'addon_credit'
  pool text not null default 'standard',  -- 'standard' | 'claude' | future pools
  amount integer not null,      -- positive for credits, negative for debits
  balance_after integer not null,
  description text,
  reference_id text,            -- Stripe session/invoice ID or model name for debits
  created_at timestamptz not null default now()
);

create index if not exists idx_token_transactions_user on token_transactions(user_id);
create index if not exists idx_token_transactions_created on token_transactions(created_at desc);
create index if not exists idx_token_transactions_pool on token_transactions(pool);

alter table token_balances enable row level security;
alter table token_transactions enable row level security;

drop policy if exists "Users see own token balance" on token_balances;
create policy "Users see own token balance"
  on token_balances for select
  using (auth.uid() = user_id);

drop policy if exists "Service role manages token balances" on token_balances;
create policy "Service role manages token balances"
  on token_balances for all
  using (auth.role() = 'service_role');

drop policy if exists "Users see own token transactions" on token_transactions;
create policy "Users see own token transactions"
  on token_transactions for select
  using (auth.uid() = user_id);

drop policy if exists "Service role manages token transactions" on token_transactions;
create policy "Service role manages token transactions"
  on token_transactions for all
  using (auth.role() = 'service_role');

-- ── 2. Pool-based balance shape on token_balances
-- Each pool tracks its own monthly allowance + purchased top-ups.
-- {
--   "standard": { "allowance": 1000, "used": 0, "purchased": 0 },
--   "claude":   { "allowance": 0,    "used": 0, "purchased": 0 }
-- }
alter table token_balances
  add column if not exists pools jsonb not null default '{}'::jsonb;

-- period_end governs when the per-cycle allowance resets to its full
-- value for the next billing period. Nullable for legacy rows that
-- don't yet have a subscription cycle attached.
alter table token_balances
  add column if not exists period_end timestamptz;

-- ── 3. Backfill pools from legacy columns
-- Existing purchased balance becomes `standard.purchased`; existing
-- free-tier grant becomes `standard.purchased` as a one-time grandfather
-- credit so nobody loses tokens on migration day.
update token_balances
set pools = jsonb_build_object(
  'standard', jsonb_build_object(
    'allowance', 0,
    'used', 0,
    'purchased', coalesce(balance, 0) + coalesce(free_tier_remaining, 0)
  ),
  'claude', jsonb_build_object(
    'allowance', 0,
    'used', 0,
    'purchased', 0
  )
)
where pools = '{}'::jsonb;

-- ── 4. Subscription add-ons
-- Every plan in this system is now just `free` or `pro`. Flagship
-- tiers (Claude today, GPT-5 Pro tomorrow) live in the addons array
-- so adding a new one is a config change instead of a new enum value.
alter table subscriptions
  add column if not exists addons text[] not null default '{}'::text[];

-- Normalize legacy plan values (scout, explorer, pilot, cruiser,
-- captain, dreadnought, flagship, pro, starpass) down to the new
-- `free | pro` space. Anything that was a paid tier becomes `pro`;
-- the free/scout tier becomes `free`.
update subscriptions
set plan = case
  when plan in ('free', 'scout') then 'free'
  else 'pro'
end
where plan is not null
  and plan not in ('free', 'pro');

-- ── 5. Constrain plan to the new enumeration going forward
alter table subscriptions drop constraint if exists subscriptions_plan_check;
alter table subscriptions
  add constraint subscriptions_plan_check
  check (plan in ('free', 'pro'));

-- Index for fast add-on lookups when the webhook credits pool refills
create index if not exists idx_subscriptions_addons on subscriptions using gin (addons);
