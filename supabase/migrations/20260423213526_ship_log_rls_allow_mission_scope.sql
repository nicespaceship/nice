-- ship_log RLS was scoped to spaceship_id only. Mission-scoped rows
-- (spaceship_id IS NULL, mission_id IS NOT NULL) added in migration
-- 20260423194513_ship_log_mission_id silently failed every client-side
-- INSERT because the policy's IN clause returns NULL when spaceship_id
-- is NULL. PR #253 wired AgentExecutor to log every step, but every
-- write was dropped at the RLS gate.
--
-- Extend the policy to also allow access to rows whose mission_id
-- belongs to one of the user's tasks. SELECT/INSERT/UPDATE/DELETE all
-- inherit the same condition via cmd='ALL'.

DROP POLICY IF EXISTS "Users manage own ship logs" ON ship_log;

CREATE POLICY "Users manage own ship logs" ON ship_log
  FOR ALL
  USING (
    spaceship_id IN (SELECT id FROM user_spaceships WHERE user_id = auth.uid())
    OR mission_id IN (SELECT id FROM tasks WHERE user_id = auth.uid())
  )
  WITH CHECK (
    spaceship_id IN (SELECT id FROM user_spaceships WHERE user_id = auth.uid())
    OR mission_id IN (SELECT id FROM tasks WHERE user_id = auth.uid())
  );
