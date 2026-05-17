-- Backfill `user_agents.config.capability_id` for slot agents that were
-- auto-created during ship activation when `ship_slots.default_agent_id`
-- was NULL. Those rows were wired in 20260519000000; this migration
-- propagates the new wiring into already-activated user instances.
--
-- Without capability_id, the runtime in `agent-executor._buildExecContext`
-- falls into the generic-agent path, which dumps every available tool and
-- gets truncated to 128 by `_truncateToolsForProvider` for OpenAI models.
-- After this backfill, each affected slot resolves only its umbrella's tools.
--
-- Captain slots (`ship_slots.role_type = 'captain'`) are intentionally
-- skipped — the wizard does not set capability_id for captains. The
-- separate `blueprint_id` gap on auto-created agents is tracked elsewhere.
--
-- Idempotent: only writes where `config.capability_id` is still NULL.

UPDATE public.user_agents ua
SET config = jsonb_set(ua.config, '{capability_id}', to_jsonb(ss.default_agent_id::text), true),
    updated_at = now()
FROM public.user_ship_slots uss
JOIN public.user_spaceships us ON us.id = uss.user_spaceship_id
JOIN public.ship_slots ss ON ss.spaceship_id = us.blueprint_id AND ss.slot_position = uss.slot_position
WHERE ua.id = uss.user_agent_id
  AND ua.config->>'capability_id' IS NULL
  AND ss.default_agent_id IS NOT NULL
  AND ss.role_type != 'captain';
