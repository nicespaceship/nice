-- ═══════════════════════════════════════════════════════════════════
-- 002: Subscriptions & Fuel Wallet System
-- Adds subscription management and fuel transaction ledger for
-- the 5-tier spaceship model (Scout/Frigate/Cruiser/Dreadnought/Flagship).
-- ═══════════════════════════════════════════════════════════════════

-- Subscriptions table — one active subscription per user
create table if not exists subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text default 'scout' not null,
  status text default 'active' not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Fuel transaction ledger — immutable append-only log
create table if not exists fuel_transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null,  -- 'subscription_credit', 'purchase_credit', 'usage_debit', 'refund'
  amount integer not null,
  balance_after integer not null,
  description text,
  reference_id text,  -- Stripe session/invoice ID
  created_at timestamptz default now()
);

-- Add fuel balance + stripe customer ID to profiles
alter table profiles add column if not exists fuel_balance integer default 500;
alter table profiles add column if not exists stripe_customer_id text;

-- Indexes
create index if not exists idx_subscriptions_user on subscriptions(user_id);
create index if not exists idx_subscriptions_stripe on subscriptions(stripe_subscription_id);
create index if not exists idx_fuel_transactions_user on fuel_transactions(user_id);
create index if not exists idx_fuel_transactions_created on fuel_transactions(created_at desc);

-- RLS policies
alter table subscriptions enable row level security;
alter table fuel_transactions enable row level security;

create policy "Users see own subscriptions"
  on subscriptions for select
  using (auth.uid() = user_id);

create policy "Users see own fuel transactions"
  on fuel_transactions for select
  using (auth.uid() = user_id);

-- Service role can manage subscriptions (for webhook handler)
create policy "Service role manages subscriptions"
  on subscriptions for all
  using (auth.role() = 'service_role');

create policy "Service role manages fuel transactions"
  on fuel_transactions for all
  using (auth.role() = 'service_role');
