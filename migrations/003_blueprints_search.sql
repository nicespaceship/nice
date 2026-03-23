-- ═══════════════════════════════════════════════════════════════════
-- 003: Blueprints Search Infrastructure
-- Single unified table for agent + spaceship blueprints with
-- full-text search, trigram fuzzy matching, and public RLS.
-- ═══════════════════════════════════════════════════════════════════

-- Enable trigram extension for fuzzy name matching
create extension if not exists pg_trgm;

-- Immutable wrapper for array_to_string (required for generated column)
create or replace function immutable_array_to_string(arr text[], sep text)
returns text language sql immutable as $$
  select array_to_string(arr, sep);
$$;

-- Unified blueprints table
create table if not exists blueprints (
  id text primary key,
  serial_key text unique not null,
  type text not null check (type in ('agent', 'spaceship')),
  name text not null,
  description text,
  flavor text,
  category text,
  rarity text,
  tags text[] default '{}',
  config jsonb default '{}',
  stats jsonb default '{}',
  metadata jsonb default '{}',
  is_public boolean default true,
  creator_id uuid references auth.users(id) on delete set null,
  rating_avg numeric default 0,
  activation_count integer default 0,
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(flavor, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(immutable_array_to_string(tags, ' '), '')), 'B')
  ) stored,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Full-text search index
create index if not exists idx_blueprints_search on blueprints using gin(search_vector);

-- Trigram index for fuzzy name matching
create index if not exists idx_blueprints_name_trgm on blueprints using gin(name gin_trgm_ops);

-- Lookup indexes
create index if not exists idx_blueprints_type on blueprints(type);
create index if not exists idx_blueprints_category on blueprints(category);
create index if not exists idx_blueprints_rarity on blueprints(rarity);
create index if not exists idx_blueprints_serial on blueprints(serial_key);
create index if not exists idx_blueprints_public on blueprints(is_public);
create index if not exists idx_blueprints_creator on blueprints(creator_id);

-- Tags GIN index for @> (contains) operator
create index if not exists idx_blueprints_tags on blueprints using gin(tags);

-- ── Row Level Security ────────────────────────────────────────────
alter table blueprints enable row level security;

-- Anyone can read public blueprints
create policy "Public blueprints are readable by everyone"
  on blueprints for select
  using (is_public = true);

-- Authenticated users can read their own private blueprints
create policy "Users can read own blueprints"
  on blueprints for select
  using (auth.uid() = creator_id);

-- Authenticated users can create blueprints
create policy "Users can create blueprints"
  on blueprints for insert
  with check (auth.uid() = creator_id);

-- Users can update their own blueprints
create policy "Users can update own blueprints"
  on blueprints for update
  using (auth.uid() = creator_id);

-- Users can delete their own blueprints
create policy "Users can delete own blueprints"
  on blueprints for delete
  using (auth.uid() = creator_id);

-- Service role has full access (for seeding, admin)
create policy "Service role full access"
  on blueprints for all
  using (auth.role() = 'service_role');
