-- Mission ontology migration — Sprint M6
--
-- See CLAUDE.md → "Mission Ontology (SSOT)".
-- Four primitives: Spaceship (orchestrator), Mission (template),
-- Workflow (lives in missions.plan), Run (instance).
--
-- This migration realigns the schema to match:
--   1. Wipe existing dev test data (all owned by one user; no ship backing
--      → cannot backfill spaceship_id, so a clean slate is the only path).
--   2. Rename `missions.captain_id` → `missions.spaceship_id`, enforce
--      NOT NULL + FK to user_spaceships with ON DELETE RESTRICT.
--   3. Rename `tasks` → `mission_runs`.
--   4. Add `mission_runs.spaceship_id` mirror column (NOT NULL). Denormalized
--      for filtering without a join to missions.
--   5. Add `mission_runs.status` CHECK constraint including `cancelled`.
--   6. Enforce `mission_runs.user_id` NOT NULL.
--   7. Drop unused tables `workflow_runs` (0 rows) and `user_workflows`
--      (0 rows).
--
-- Atomic: wrapped in one transaction. If any step fails the whole migration
-- rolls back and the DB is untouched. RLS policies, triggers, and indexes
-- move with the renamed tables automatically (Postgres behavior).
--
-- Client code is updated in the same PR: `.from('tasks')` → `.from('mission_runs')`
-- across the 12 files grepped. No compat view / dual-write period — Missions
-- have zero non-dev users today, so a synchronized cutover is the simplest
-- correct move.

BEGIN;

-- ─── 1. Wipe dev test data ───────────────────────────────────────────
-- Pre-ontology state: 18 missions + 27 tasks, all owned by Benjamin's
-- user, none with a ship assignment. ship_log.mission_id cascades on
-- task delete (86 rows). No production users, no real data at risk.
DELETE FROM public.tasks;      -- cascades to ship_log via ON DELETE CASCADE
DELETE FROM public.missions;   -- no FK-back from anything after tasks are gone

-- ─── 2. missions.captain_id → spaceship_id (NOT NULL, FK) ────────────
ALTER TABLE public.missions
  DROP CONSTRAINT IF EXISTS missions_captain_id_fkey;  -- none exists, but safe

ALTER TABLE public.missions
  RENAME COLUMN captain_id TO spaceship_id;

ALTER INDEX IF EXISTS idx_missions_captain RENAME TO idx_missions_spaceship;

-- After the wipe, zero rows exist — NOT NULL is enforceable immediately.
ALTER TABLE public.missions
  ALTER COLUMN spaceship_id SET NOT NULL;

-- ON DELETE RESTRICT: can't delete a ship while missions reference it.
-- Forces explicit cleanup (archive or reassign) before removing a ship.
ALTER TABLE public.missions
  ADD CONSTRAINT missions_spaceship_id_fkey
  FOREIGN KEY (spaceship_id)
  REFERENCES public.user_spaceships(id)
  ON DELETE RESTRICT;

-- Replace the partial index (captain_id was nullable) with a full one.
DROP INDEX IF EXISTS idx_missions_spaceship;
CREATE INDEX idx_missions_spaceship ON public.missions (spaceship_id);

-- ─── 3. tasks → mission_runs ─────────────────────────────────────────
-- Table rename: indexes, triggers, FKs (tasks.agent_id, tasks.mission_id,
-- ship_log.mission_id → tasks.id) all follow automatically.
ALTER TABLE public.tasks RENAME TO mission_runs;

-- Rename dependent index (Postgres doesn't auto-rename these even though
-- they still work — but consistent naming aids ops).
ALTER INDEX IF EXISTS idx_tasks_mission_id     RENAME TO idx_mission_runs_mission_id;
-- Any other tasks_* indexes created without explicit ALTER INDEX RENAME
-- above still function; they stay named idx_tasks_* until a future cleanup.

-- FK constraint names from the old table stay (tasks_mission_id_fkey,
-- tasks_agent_id_fkey, ship_log_mission_id_fkey). Constraint names are
-- cosmetic; tests reference columns, not constraint names. Leave.

-- ─── 4. mission_runs.spaceship_id (NOT NULL mirror) ──────────────────
-- Post-wipe, table is empty. Add NOT NULL + FK in one step.
ALTER TABLE public.mission_runs
  ADD COLUMN spaceship_id uuid NOT NULL
    REFERENCES public.user_spaceships(id) ON DELETE RESTRICT;

CREATE INDEX idx_mission_runs_spaceship_id ON public.mission_runs (spaceship_id);

-- ─── 5. mission_runs.status CHECK (includes cancelled) ───────────────
-- Pre-migration the column was freeform text. Lock it down.
ALTER TABLE public.mission_runs
  DROP CONSTRAINT IF EXISTS mission_runs_status_check;

ALTER TABLE public.mission_runs
  ADD CONSTRAINT mission_runs_status_check
  CHECK (status IN ('queued','running','review','completed','failed','cancelled'));

-- approval_status already in use; add a CHECK for consistency.
ALTER TABLE public.mission_runs
  DROP CONSTRAINT IF EXISTS mission_runs_approval_status_check;

ALTER TABLE public.mission_runs
  ADD CONSTRAINT mission_runs_approval_status_check
  CHECK (approval_status IS NULL OR approval_status IN ('draft','approved','rejected'));

-- ─── 6. mission_runs.user_id NOT NULL ────────────────────────────────
-- Was nullable from legacy `tasks`. Post-wipe we can enforce.
ALTER TABLE public.mission_runs
  ALTER COLUMN user_id SET NOT NULL;

-- ─── 7. Drop unused tables ───────────────────────────────────────────
-- Both verified empty 2026-04-24. Superseded by mission_runs.node_results
-- and missions.plan respectively.
DROP TABLE IF EXISTS public.workflow_runs CASCADE;
DROP TABLE IF EXISTS public.user_workflows CASCADE;

COMMIT;

-- ─── Rollback (manual, for reference only) ───────────────────────────
--   BEGIN;
--   ALTER TABLE public.mission_runs RENAME TO tasks;
--   ALTER TABLE public.tasks ALTER COLUMN user_id DROP NOT NULL;
--   ALTER TABLE public.tasks DROP CONSTRAINT mission_runs_status_check;
--   ALTER TABLE public.tasks DROP CONSTRAINT mission_runs_approval_status_check;
--   ALTER TABLE public.tasks DROP COLUMN spaceship_id;
--   ALTER TABLE public.missions DROP CONSTRAINT missions_spaceship_id_fkey;
--   ALTER TABLE public.missions ALTER COLUMN spaceship_id DROP NOT NULL;
--   ALTER TABLE public.missions RENAME COLUMN spaceship_id TO captain_id;
--   COMMIT;
-- (workflow_runs / user_workflows are recreated from earlier migrations if
-- needed; check git history for their DDL.)
