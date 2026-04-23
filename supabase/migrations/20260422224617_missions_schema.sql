-- Sprint 1 — Agentic Workflows foundation.
--
-- Introduces the `missions` table (Mission templates) and extends `tasks`
-- (Mission runs / instances) with the fields the future Mission Composer
-- and WorkflowEngine need. Additive only — nothing in the app reads these
-- columns yet, so zero behavior change at ship time.
--
-- Ontology decision (PR discussion, 2026-04-22):
--   Mission = a unit of intent. It can be a template (`missions` row) or
--   an instance (`tasks` row with `mission_id` set, or ad-hoc when
--   `mission_id` is null).
--   Workflow  = a shaped Mission (DAG body). Lives in `missions.plan`.
--   Schedule  = a trigger on a Mission. Lives in `missions.schedule`.
--   Fleet     = who runs it — a Spaceship blueprint referenced by
--               `missions.captain_id`.
--
-- Deferred to later sprints (not this PR):
--   - Drop `workflow_runs` / `user_workflows` — S6, after migration.
--   - Rename `tasks` → `mission_runs` — S7, last step (long-tail grep).
--
-- No breaking changes:
--   - New columns on `tasks` are all nullable with no defaults.
--   - New table + indexes are additive.
--   - Rollback is `DROP TABLE ... CASCADE` + `ALTER TABLE ... DROP
--     COLUMN` — safe because no code touches the new surface yet.

BEGIN;

-- ── missions (template definitions) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.missions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text NOT NULL,
  description     text,
  -- `shape` discriminates between simple (single-agent), DAG (multi-node
  -- workflow), scheduled (cron trigger), and triggered (event/webhook).
  -- The Composer in Sprint 2 writes this; runtime dispatch in Sprint 3
  -- branches on it.
  shape           text NOT NULL DEFAULT 'simple'
                    CHECK (shape IN ('simple','dag','scheduled','triggered')),
  -- Spaceship blueprint id that owns the Mission. Soft reference — the
  -- `blueprints` table's `id` is text, and user_spaceships carry their
  -- own UUID, so we keep this nullable and resolve at render time.
  captain_id      uuid,
  -- `plan` holds the node graph for dag-shaped missions (and a single
  -- agent node for simple). Structure is enforced by the Composer, not
  -- the DB — WorkflowEngine is the contract.
  plan            jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- `schedule` is a cron/webhook spec (null = manual run).
  schedule        jsonb,
  -- `outcome_spec` defines what success looks like — metric + target.
  -- Checked against `tasks.outcome` after the run completes.
  outcome_spec    jsonb,
  -- MCP tool ids the mission requires. Used at install time to gate on
  -- missing integrations (e.g. "this mission needs Gmail — connect it").
  tools_required  text[] NOT NULL DEFAULT ARRAY[]::text[],
  state           text NOT NULL DEFAULT 'draft'
                    CHECK (state IN ('draft','active','paused','archived')),
  version         int  NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- plan must always be a JSON object (empty object is the default for
-- simple shapes; DAG shapes populate nodes/edges keys).
ALTER TABLE public.missions
  DROP CONSTRAINT IF EXISTS missions_plan_shape;
ALTER TABLE public.missions
  ADD CONSTRAINT missions_plan_shape
  CHECK (jsonb_typeof(plan) = 'object');

-- schedule, when present, must be a JSON object.
ALTER TABLE public.missions
  DROP CONSTRAINT IF EXISTS missions_schedule_shape;
ALTER TABLE public.missions
  ADD CONSTRAINT missions_schedule_shape
  CHECK (schedule IS NULL OR jsonb_typeof(schedule) = 'object');

-- outcome_spec, when present, must be a JSON object.
ALTER TABLE public.missions
  DROP CONSTRAINT IF EXISTS missions_outcome_spec_shape;
ALTER TABLE public.missions
  ADD CONSTRAINT missions_outcome_spec_shape
  CHECK (outcome_spec IS NULL OR jsonb_typeof(outcome_spec) = 'object');

CREATE INDEX IF NOT EXISTS idx_missions_user     ON public.missions (user_id);
CREATE INDEX IF NOT EXISTS idx_missions_active   ON public.missions (user_id) WHERE state = 'active';
CREATE INDEX IF NOT EXISTS idx_missions_captain  ON public.missions (captain_id) WHERE captain_id IS NOT NULL;

-- RLS — users read/write their own templates.
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

-- `(select auth.uid())` (not bare `auth.uid()`) — Postgres evaluates the
-- scalar subquery once per statement instead of once per row. Matters at
-- scale; the `auth_rls_initplan` advisor flags the bare call. Same fix
-- Supabase recommends for all auth.* references in RLS predicates.
DROP POLICY IF EXISTS "Users manage own missions" ON public.missions;
CREATE POLICY "Users manage own missions"
  ON public.missions
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Keep updated_at honest. clock_timestamp() (wall-clock) rather than now()
-- (transaction-start) so a write-then-read-then-update inside the same
-- transaction still advances updated_at — matters for the smoke tests and
-- for any future batched sequence of mutations.
--
-- `search_path = pg_catalog, pg_temp` locks resolution of `clock_timestamp`
-- to the built-in so a role with CREATE on public can't shim a fake
-- implementation. Supabase's function_search_path_mutable advisor flags
-- this when omitted.
CREATE OR REPLACE FUNCTION public.missions_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS missions_updated_at ON public.missions;
CREATE TRIGGER missions_updated_at
  BEFORE UPDATE ON public.missions
  FOR EACH ROW EXECUTE FUNCTION public.missions_set_updated_at();

-- ── tasks (run instances — future `mission_runs`) ────────────────────
-- mission_id: back-reference to the template this run spawned from.
--   NULL = ad-hoc run (the current UX: user typed "Analyze Q4 sales"
--   into the prompt panel with no saved template).
-- plan_snapshot: frozen copy of `missions.plan` at run time so replays
--   are deterministic even if the template was edited after.
-- node_results: per-node output from WorkflowEngine runs. Replaces the
--   separate `workflow_runs` table (deferred drop to S6).
-- outcome: measured business impact against `missions.outcome_spec`.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS mission_id    uuid REFERENCES public.missions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plan_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS node_results  jsonb,
  ADD COLUMN IF NOT EXISTS outcome       jsonb;

CREATE INDEX IF NOT EXISTS idx_tasks_mission_id
  ON public.tasks (mission_id) WHERE mission_id IS NOT NULL;

COMMIT;
