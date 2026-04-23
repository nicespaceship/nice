-- Fix Inbox Captain slot count.
--
-- The initial seed (20260423000002_seed_inbox_captain.sql) set
-- stats.slots = "2" to match the two seeded crew (Triage + Drafter).
-- That was wrong: NICE's class system says every Class-1 ship exposes
-- 6 slots, and the convention across the other 237 catalog ships is
-- stats.slots = class slot count, stats.crew = preloaded crew count.
--
-- Consequence of the wrong value: the Ship Setup Wizard rendered only
-- 2 stations, hiding the user's ability to extend the crew later
-- (e.g. a Scheduler or Follow-up agent alongside Triage + Drafter).
--
-- Additive patch. No structural change — just updating the jsonb value
-- for the one row. Safe to re-run; jsonb_set is idempotent.

BEGIN;

UPDATE public.blueprints
SET stats = jsonb_set(stats, '{slots}', '"6"'),
    updated_at = now()
WHERE id = 'fleet-inbox-captain';

COMMIT;
