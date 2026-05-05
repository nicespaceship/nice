-- mission_runs.spaceship_id was ON DELETE RESTRICT, which trapped user-driven
-- "remove ship" actions: every ship has at least one chat-surface mission_run
-- pointing at it (ephemeral runs from the casual chat surface — see CLAUDE.md
-- "Chat surface tiers"). The Blueprints.deactivateShip path swallowed the FK
-- violation in a try/catch + console.warn, so the UI dropped the ship from
-- local state while the DB row persisted indefinitely.
--
-- Switch to CASCADE so a user removing their ship cascades through its runs.
-- ship_log already cascades from mission_runs, so this completes the chain:
--   user_spaceships → mission_runs → ship_log
--
-- Run history loss is acceptable: ship-less mission_runs are functional
-- orphans (RUN.spaceship_id is NOT NULL — they can never re-execute), and
-- the user is explicitly asking to remove the ship.

ALTER TABLE mission_runs
  DROP CONSTRAINT mission_runs_spaceship_id_fkey,
  ADD CONSTRAINT mission_runs_spaceship_id_fkey
    FOREIGN KEY (spaceship_id) REFERENCES user_spaceships(id) ON DELETE CASCADE;
