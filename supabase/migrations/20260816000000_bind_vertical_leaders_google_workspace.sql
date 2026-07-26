-- Bind the 30 business-vertical leaders to the Google Workspace umbrella.
--
-- Every Common/Rare business ship's slot-1 leader (all Rare, all
-- role_type 'captain') shipped with capability_id NULL: no capability
-- layer, so no MCP tools, while their supporting crew all carry
-- umbrella capabilities. The canonical reskin pattern binds a persona
-- over an umbrella capability via capability_id; the owner's daily
-- driver is mail + calendar + files, which is exactly the
-- google-workspace umbrella.
--
-- Two behavior notes, both deliberate. Dispatch is unaffected (the
-- captain role requires no capability tags). The CHAT surface changes:
-- catalog leaders move from the tool-less streaming path to
-- AgentExecutor with Google tools once the user connects Google; with
-- Google disconnected they stay a plain persona chat (the executor
-- omits the tools section when nothing resolves). Already-activated
-- leaders are untouched: user_agents snapshots tools at activation.
--
-- Identity-pinned: the update targets exactly the slot-1 defaults of
-- Common/Rare catalog ships, not a loose predicate that could catch a
-- future Rare captain. Deliberately scoped to the vertical leaders;
-- the Epic/Legendary/Mythic sci-fi personas stay a separate thematic
-- pass. Verified with a BEGIN; ROLLBACK; dry-run.

DO $bind$
DECLARE
  v_gws uuid;
  v_n integer;
BEGIN
  SELECT id INTO STRICT v_gws FROM public.capabilities WHERE slug = 'google-workspace';

  UPDATE public.agent_blueprints ab
  SET capability_id = v_gws
  WHERE ab.scope = 'catalog'
    AND ab.rarity = 'Rare'
    AND ab.role_type = 'captain'
    AND ab.capability_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.ship_slots ss
      JOIN public.spaceship_blueprints sb ON sb.id = ss.spaceship_id
      WHERE ss.default_agent_id = ab.id
        AND ss.slot_position = 1
        AND sb.scope = 'catalog'
        AND sb.rarity IN ('Common','Rare')
    );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  ASSERT v_n = 30, format('expected 30 leader bindings, got %s', v_n);
END;
$bind$;

-- Apply-gate: every Common/Rare business ship's slot-1 default carries a
-- capability. LEFT JOIN so a slot with a NULL default would fail loudly
-- instead of dropping out of the count.
DO $smoke$
BEGIN
  ASSERT (SELECT count(*)
          FROM public.ship_slots ss
          JOIN public.spaceship_blueprints sb ON sb.id = ss.spaceship_id
          LEFT JOIN public.agent_blueprints ab ON ab.id = ss.default_agent_id
          WHERE sb.scope = 'catalog' AND sb.rarity IN ('Common','Rare')
            AND ss.slot_position = 1
            AND (ab.id IS NULL OR ab.capability_id IS NULL)) = 0,
    'a business-ship slot-1 leader is missing or has no capability';
  ASSERT (SELECT count(*) FROM public.agent_blueprints
          WHERE scope = 'catalog' AND rarity = 'Rare' AND role_type = 'captain'
            AND capability_id = (SELECT id FROM public.capabilities WHERE slug = 'google-workspace')) = 30,
    'expected 30 leaders on the google-workspace umbrella';
END;
$smoke$;
