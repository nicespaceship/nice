-- Three-layer blueprint schema — Phase A: tables, RLS, role vocabulary.
--
-- Implements docs/three-layer-schema.md (design reviewed in #497). Replaces
-- the jsonb-heavy single `blueprints` table with a normalized relational
-- core: structure (ownership, visibility, relationships) in columns + FKs,
-- content (prompts, params, presentation) in jsonb.
--
-- Phase A is purely additive — these six tables sit alongside `blueprints`
-- and nothing reads them yet. Phase B rewires the runtime; Phase D drops
-- the old table. The catalog being empty post-Phase-1-wipe means there is
-- no data migration here — only the role vocabulary is seeded.
--
-- RLS mirrors the established blueprints / user_* ownership pattern:
-- catalog rows are public-or-owner readable, writes are owner-only, the
-- service_role bypasses. Child tables gate via EXISTS against their parent.

BEGIN;

-- ── roles ──────────────────────────────────────────────────────────
-- Fixed, platform-owned vocabulary. The role -> required-capability-tags
-- map lived in mission-runner.js code; it lives here now as tunable data.
CREATE TABLE IF NOT EXISTS public.roles (
  slug                     text PRIMARY KEY,
  label                    text NOT NULL,
  tier                     text NOT NULL CHECK (tier IN ('leadership','functional')),
  authority                text CHECK (authority IN ('decides','coordinates','executes','advises')),
  required_capability_tags text[] NOT NULL DEFAULT '{}',
  responsibilities         text,
  sort_order               integer NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- ── capabilities ───────────────────────────────────────────────────
-- The function layer — MCP tools + how to use them. No persona.
CREATE TABLE IF NOT EXISTS public.capabilities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text UNIQUE NOT NULL,
  name            text NOT NULL,
  description     text,
  flavor          text,
  category        text,
  rarity          text NOT NULL DEFAULT 'Common',
  scope           text NOT NULL DEFAULT 'catalog' CHECK (scope IN ('catalog','community')),
  creator_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  visibility      text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','unlisted','private')),
  capability_tags text[] NOT NULL DEFAULT '{}',
  tools           text[] NOT NULL DEFAULT '{}',
  mcp_provider    text,
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  card            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── agent_blueprints ───────────────────────────────────────────────
-- The "agent programming" — persona + role + a link to a capability.
CREATE TABLE IF NOT EXISTS public.agent_blueprints (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text UNIQUE NOT NULL,
  name          text NOT NULL,
  description   text,
  flavor        text,
  category      text,
  rarity        text NOT NULL DEFAULT 'Common',
  scope         text NOT NULL DEFAULT 'catalog' CHECK (scope IN ('catalog','community')),
  creator_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  visibility    text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','unlisted','private')),
  role_type     text REFERENCES public.roles(slug) ON DELETE RESTRICT,
  capability_id uuid REFERENCES public.capabilities(id) ON DELETE SET NULL,
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  card          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── spaceship_blueprints ───────────────────────────────────────────
-- The orchestrator — workflow + ship voice. Slot count is COUNT(ship_slots),
-- never a column: uncapped by construction.
CREATE TABLE IF NOT EXISTS public.spaceship_blueprints (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  description text,
  flavor      text,
  category    text,
  rarity      text NOT NULL DEFAULT 'Common',
  scope       text NOT NULL DEFAULT 'catalog' CHECK (scope IN ('catalog','community')),
  creator_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  visibility  text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','unlisted','private')),
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  card        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── ship_slots ─────────────────────────────────────────────────────
-- Uncapped agent slots — one row per slot. Replaces the old triple
-- representation (config.crew_roles / config.crew_overrides / metadata.crew).
CREATE TABLE IF NOT EXISTS public.ship_slots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spaceship_id     uuid NOT NULL REFERENCES public.spaceship_blueprints(id) ON DELETE CASCADE,
  slot_index       integer NOT NULL,
  role_type        text NOT NULL REFERENCES public.roles(slug) ON DELETE RESTRICT,
  default_agent_id uuid REFERENCES public.agent_blueprints(id) ON DELETE SET NULL,
  label            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (spaceship_id, slot_index)
);

-- ── user_ship_slots ────────────────────────────────────────────────
-- Instance-layer mirror of ship_slots — which activated agent fills each
-- slot of an activated spaceship. Replaces config.slot_assignments.
CREATE TABLE IF NOT EXISTS public.user_ship_slots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_spaceship_id uuid NOT NULL REFERENCES public.user_spaceships(id) ON DELETE CASCADE,
  slot_index        integer NOT NULL,
  role_type         text REFERENCES public.roles(slug) ON DELETE SET NULL,
  user_agent_id     uuid REFERENCES public.user_agents(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_spaceship_id, slot_index)
);

-- ── indexes ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_capabilities_scope         ON public.capabilities (scope);
CREATE INDEX IF NOT EXISTS idx_capabilities_creator       ON public.capabilities (creator_id);
CREATE INDEX IF NOT EXISTS idx_capabilities_tags          ON public.capabilities USING gin (capability_tags);
CREATE INDEX IF NOT EXISTS idx_agent_blueprints_scope     ON public.agent_blueprints (scope);
CREATE INDEX IF NOT EXISTS idx_agent_blueprints_creator   ON public.agent_blueprints (creator_id);
CREATE INDEX IF NOT EXISTS idx_agent_blueprints_role      ON public.agent_blueprints (role_type);
CREATE INDEX IF NOT EXISTS idx_agent_blueprints_cap       ON public.agent_blueprints (capability_id);
CREATE INDEX IF NOT EXISTS idx_spaceship_blueprints_scope   ON public.spaceship_blueprints (scope);
CREATE INDEX IF NOT EXISTS idx_spaceship_blueprints_creator ON public.spaceship_blueprints (creator_id);
CREATE INDEX IF NOT EXISTS idx_ship_slots_ship            ON public.ship_slots (spaceship_id);
CREATE INDEX IF NOT EXISTS idx_ship_slots_default_agent   ON public.ship_slots (default_agent_id);
CREATE INDEX IF NOT EXISTS idx_user_ship_slots_ship       ON public.user_ship_slots (user_spaceship_id);
CREATE INDEX IF NOT EXISTS idx_user_ship_slots_agent      ON public.user_ship_slots (user_agent_id);

-- ── row-level security ─────────────────────────────────────────────
ALTER TABLE public.roles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capabilities         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_blueprints     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spaceship_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ship_slots           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ship_slots      ENABLE ROW LEVEL SECURITY;

-- roles: world-readable vocabulary; writes service_role only.
CREATE POLICY "roles readable"      ON public.roles FOR SELECT USING (true);
CREATE POLICY "roles service write" ON public.roles FOR ALL USING (auth.role() = 'service_role');

-- capabilities: public-or-owner read, owner-only writes, service_role bypass.
CREATE POLICY "capabilities public read"  ON public.capabilities FOR SELECT USING (visibility = 'public' OR auth.uid() = creator_id);
CREATE POLICY "capabilities owner insert" ON public.capabilities FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "capabilities owner update" ON public.capabilities FOR UPDATE USING (auth.uid() = creator_id);
CREATE POLICY "capabilities owner delete" ON public.capabilities FOR DELETE USING (auth.uid() = creator_id);
CREATE POLICY "capabilities service all"  ON public.capabilities FOR ALL USING (auth.role() = 'service_role');

-- agent_blueprints: same pattern.
CREATE POLICY "agent_blueprints public read"  ON public.agent_blueprints FOR SELECT USING (visibility = 'public' OR auth.uid() = creator_id);
CREATE POLICY "agent_blueprints owner insert" ON public.agent_blueprints FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "agent_blueprints owner update" ON public.agent_blueprints FOR UPDATE USING (auth.uid() = creator_id);
CREATE POLICY "agent_blueprints owner delete" ON public.agent_blueprints FOR DELETE USING (auth.uid() = creator_id);
CREATE POLICY "agent_blueprints service all"  ON public.agent_blueprints FOR ALL USING (auth.role() = 'service_role');

-- spaceship_blueprints: same pattern.
CREATE POLICY "spaceship_blueprints public read"  ON public.spaceship_blueprints FOR SELECT USING (visibility = 'public' OR auth.uid() = creator_id);
CREATE POLICY "spaceship_blueprints owner insert" ON public.spaceship_blueprints FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "spaceship_blueprints owner update" ON public.spaceship_blueprints FOR UPDATE USING (auth.uid() = creator_id);
CREATE POLICY "spaceship_blueprints owner delete" ON public.spaceship_blueprints FOR DELETE USING (auth.uid() = creator_id);
CREATE POLICY "spaceship_blueprints service all"  ON public.spaceship_blueprints FOR ALL USING (auth.role() = 'service_role');

-- ship_slots: gate on the parent spaceship_blueprint.
CREATE POLICY "ship_slots parent read" ON public.ship_slots FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.spaceship_blueprints s
          WHERE s.id = ship_slots.spaceship_id
            AND (s.visibility = 'public' OR auth.uid() = s.creator_id)));
CREATE POLICY "ship_slots parent insert" ON public.ship_slots FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.spaceship_blueprints s
          WHERE s.id = ship_slots.spaceship_id AND auth.uid() = s.creator_id));
CREATE POLICY "ship_slots parent update" ON public.ship_slots FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.spaceship_blueprints s
          WHERE s.id = ship_slots.spaceship_id AND auth.uid() = s.creator_id));
CREATE POLICY "ship_slots parent delete" ON public.ship_slots FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.spaceship_blueprints s
          WHERE s.id = ship_slots.spaceship_id AND auth.uid() = s.creator_id));
CREATE POLICY "ship_slots service all" ON public.ship_slots FOR ALL USING (auth.role() = 'service_role');

-- user_ship_slots: gate on the parent user_spaceship (owner-only).
CREATE POLICY "user_ship_slots owner all" ON public.user_ship_slots FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_spaceships u
          WHERE u.id = user_ship_slots.user_spaceship_id AND auth.uid() = u.user_id));
CREATE POLICY "user_ship_slots service all" ON public.user_ship_slots FOR ALL USING (auth.role() = 'service_role');

-- ── seed: role vocabulary ──────────────────────────────────────────
-- 15 roles — 1 leadership + 14 functional (the SaaS/ERP-familiar set).
-- required_capability_tags reference the live capability_tags vocabulary;
-- empty {} means no specialized capability exists yet (the role can still
-- be filled by a persona-only agent). These are tunable data — adjust here,
-- not in code.
INSERT INTO public.roles (slug, label, tier, authority, required_capability_tags, responsibilities, sort_order) VALUES
  ('captain',          'Captain',          'leadership', 'decides',     '{}',                       'Reads requests, dispatches to crew, synthesizes outputs, owns ship-level decisions.', 0),
  ('communications',   'Communications',   'functional', 'executes',    '{communications}',         'Email, internal/external messaging, scheduling.',                 1),
  ('sales',            'Sales',            'functional', 'executes',    '{sales,crm}',              'Pipeline, deals, accounts, prospecting.',                          2),
  ('marketing',        'Marketing',        'functional', 'executes',    '{marketing}',              'Campaigns, content, brand, social, lead-gen.',                     3),
  ('engineering',      'Engineering',      'functional', 'executes',    '{engineering}',            'Code, technical execution, deploys, infrastructure.',              4),
  ('product',          'Product',          'functional', 'executes',    '{product,pm}',             'Roadmap, specs, user research, feature triage.',                   5),
  ('operations',       'Operations',       'functional', 'coordinates', '{ops}',                    'Process management, project ops, daily execution.',                6),
  ('customer_success', 'Customer Success', 'functional', 'executes',    '{}',                       'Onboarding, retention, support, customer health.',                 7),
  ('finance',          'Finance',          'functional', 'executes',    '{finance,payments}',       'Budget, billing, reporting, AR/AP.',                               8),
  ('analytics',        'Analytics',        'functional', 'advises',     '{}',                       'Metrics, dashboards, insights, reporting.',                        9),
  ('design',           'Design',           'functional', 'executes',    '{design}',                 'UX, brand assets, creative.',                                      10),
  ('legal',            'Legal',            'functional', 'advises',     '{}',                       'Contracts, compliance, risk.',                                     11),
  ('security',         'Security',         'functional', 'advises',     '{observability}',          'Infosec, access, audit, incident response.',                       12),
  ('people',           'People',           'functional', 'coordinates', '{}',                       'Hiring, performance, culture, HR ops.',                            13),
  ('research',         'Research',         'functional', 'advises',     '{research,web,docs}',      'Competitive intel, market research, analysis.',                    14)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
