-- ═══════════════════════════════════════════════════════════════════
-- 004: MCP & API Connections
-- Adds tables for managing MCP server connections (spaceship-scoped)
-- and API key integrations for the Security view.
-- ═══════════════════════════════════════════════════════════════════

-- MCP connections — one per spaceship + MCP server
create table if not exists mcp_connections (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  spaceship_id text not null,
  name text not null,
  server_url text,
  transport text default 'streamable-http' not null,
  auth_type text default 'none' not null,
  auth_config jsonb default '{}',
  available_tools jsonb default '[]',
  status text default 'disconnected' not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- API connections — direct key-based integrations
create table if not exists api_connections (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  service text not null,
  api_key_ref uuid references vault_secrets(id) on delete set null,
  spaceship_ids text[] default '{}',
  status text default 'active' not null,
  config jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists idx_mcp_connections_user on mcp_connections(user_id);
create index if not exists idx_mcp_connections_spaceship on mcp_connections(spaceship_id);
create index if not exists idx_api_connections_user on api_connections(user_id);

-- RLS policies
alter table mcp_connections enable row level security;
alter table api_connections enable row level security;

create policy "Users manage own MCP connections"
  on mcp_connections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own API connections"
  on api_connections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
