-- ═══════════════════════════════════════════════════════════════
-- NICE — Initial Schema (001)
-- Documents the expected Supabase tables used by the NICE app.
-- ═══════════════════════════════════════════════════════════════

-- User profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  plan TEXT DEFAULT 'explorer',
  fuel_balance INTEGER DEFAULT 1000,
  xp INTEGER DEFAULT 0,
  achievements JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User agents (robots)
CREATE TABLE IF NOT EXISTS user_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  blueprint_id TEXT,
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'idle',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User spaceships
CREATE TABLE IF NOT EXISTS user_spaceships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  blueprint_id TEXT,
  slots JSONB DEFAULT '{}',
  status TEXT DEFAULT 'standby',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tasks / Missions
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  agent_id UUID REFERENCES user_agents(id) ON DELETE SET NULL,
  agent_name TEXT,
  status TEXT DEFAULT 'queued',
  priority TEXT DEFAULT 'medium',
  progress INTEGER DEFAULT 0,
  result TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Ship's Log (agent conversation context)
CREATE TABLE IF NOT EXISTS ship_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spaceship_id UUID REFERENCES user_spaceships(id) ON DELETE CASCADE,
  agent_id UUID,
  role TEXT DEFAULT 'system',
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Vault secrets
CREATE TABLE IF NOT EXISTS vault_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  service TEXT DEFAULT 'api_key',
  encrypted_value TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used TIMESTAMPTZ
);

-- Fuel usage tracking
CREATE TABLE IF NOT EXISTS fuel_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  model TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  fuel_cost INTEGER DEFAULT 1,
  agent_id UUID,
  spaceship_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Fuel purchases (Stripe checkout completions)
CREATE TABLE IF NOT EXISTS fuel_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  fuel_amount INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'card',
  stripe_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE fuel_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own fuel purchases" ON fuel_purchases
  FOR ALL USING (auth.uid() = user_id);

-- Audit log (persisted events, 90-day retention recommended)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Error log (client-side errors)
CREATE TABLE IF NOT EXISTS error_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  message TEXT,
  source TEXT,
  line INTEGER,
  col INTEGER,
  stack TEXT,
  url TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'system',
  title TEXT,
  message TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Workflows
CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  steps JSONB DEFAULT '[]',
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Academy progress tracking
CREATE TABLE IF NOT EXISTS academy_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  status TEXT DEFAULT 'locked',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, track_id, module_id)
);

-- Community blueprint submissions
CREATE TABLE IF NOT EXISTS blueprint_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_data JSONB NOT NULL DEFAULT '{}',
  status TEXT DEFAULT 'pending',
  avg_rating NUMERIC(3,2) DEFAULT 0,
  download_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User workflows (persisted)
CREATE TABLE IF NOT EXISTS user_workflows (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Workflow',
  nodes TEXT DEFAULT '[]',
  connections TEXT DEFAULT '[]',
  trigger TEXT DEFAULT '{"type":"manual"}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Referrals
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending',
  bonus_fuel_sent INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Blueprint ratings
CREATE TABLE IF NOT EXISTS blueprint_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  blueprint_id UUID NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, blueprint_id)
);

-- Integrations
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  status TEXT DEFAULT 'available',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Station invites
CREATE TABLE IF NOT EXISTS station_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL,
  invited_email TEXT NOT NULL,
  invited_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User shared agents
CREATE TABLE IF NOT EXISTS user_shared_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL,
  shared_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_email TEXT NOT NULL,
  permissions TEXT DEFAULT 'view',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Workflow runs
CREATE TABLE IF NOT EXISTS workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id TEXT NOT NULL,
  status TEXT DEFAULT 'running',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  result JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_spaceships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ship_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_shared_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
