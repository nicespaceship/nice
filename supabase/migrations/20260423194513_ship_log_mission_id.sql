-- ship_log.mission_id: direct FK to tasks so ship-less mission runs persist.
--
-- Before this column: MissionRunner fabricated spaceship_id='mission-<uuid>'
-- for ship-less runs. ship_log.spaceship_id is UUID; inserts errored; every
-- log entry for a ship-less mission quietly dropped into sessionStorage
-- (device-local). MissionDetailView's ship_log reader saw nothing and
-- displayed an empty Execution Log.
--
-- With this column, ship_log.append detects the 'mission-<uuid>' pattern
-- and routes to mission_id with spaceship_id=NULL. Ship-backed runs are
-- unchanged.

ALTER TABLE ship_log
  ADD COLUMN IF NOT EXISTS mission_id uuid REFERENCES tasks(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ship_log_mission_id_created_at
  ON ship_log (mission_id, created_at);
