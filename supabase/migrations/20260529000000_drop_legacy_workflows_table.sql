-- Drop the legacy public.workflows table.
--
-- Background: the Mission Ontology rewrite (April 2026) replaced the
-- "Workflow" primitive with `missions.plan` JSONB executed by
-- WorkflowEngine. `workflow_runs` and `user_workflows` were dropped
-- as part of that rewrite. `workflows` was overlooked but became dead:
-- the client never reads or writes it (verified by grep across
-- app/js/, app/css/, app/index.html), and the 34 deployed edge
-- functions never reference it (verified by `npx supabase functions
-- download` + grep across all of them). The table holds 0 rows, no
-- foreign keys point at it, and its only triggers/policies are the
-- ones tied to the table itself (auto-dropped with the table).
--
-- CASCADE is defensive — the audit found zero dependents, but the
-- keyword ensures we don't get blocked if a forgotten view, trigger,
-- or RLS policy elsewhere references it.

DROP TABLE IF EXISTS public.workflows CASCADE;
