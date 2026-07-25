-- Swap the blocked monday.com Agent out of every default crew.
--
-- monday.com consent is blocked upstream (403 org_internal), yet the
-- monday.com Agent ships as the default in 23 of 30 Common/Rare business
-- crews: a new user's first ship comes staffed with an agent that cannot
-- connect. Worse, 4 of those slots carry role_type 'sales' whose required
-- capability tags [sales, crm] the monday capability [pm, product, ops]
-- never satisfied, so role-based dispatch was already broken there.
--
-- Replacement: Microsoft 365 Agent. None of the 23 ships carries it
-- (verified), so no crew duplicates; it is a live integration; and the
-- seat duties in every affected ship prompt (growth outreach, recruiting,
-- procurement, loyalty, partnerships) run on mail + calendar + files,
-- which is exactly the M365 capability [email, calendar, files,
-- communications]. Slots move to role_type 'communications', whose
-- required tags M365 satisfies. Labels and the bespoke vertical seat
-- copy stay; only the provider tag inside 19 ship_system_prompts changes
-- ('(monday.com, class-4)' becomes '(Microsoft 365, class-4)'; the other
-- 4 seat lines never named a provider). Two catalog prompts mention the
-- weekday 'Monday' (Madison, The Founder's Office); the exact-match
-- replacement cannot touch them.
--
-- The monday.com Agent blueprint itself stays in the catalog for direct
-- browse/activation once the upstream block clears.
--
-- Row-count asserts pin the expected 23 slots / 19 prompts at apply time;
-- if the catalog drifts before this lands, the apply fails loudly rather
-- than half-writing. Verified with a BEGIN; ROLLBACK; dry-run.

DO $swap$
DECLARE
  v_monday uuid;
  v_m365   uuid;
  v_n      integer;
BEGIN
  SELECT id INTO STRICT v_monday FROM public.agent_blueprints WHERE scope = 'catalog' AND slug = 'monday';
  SELECT id INTO STRICT v_m365   FROM public.agent_blueprints WHERE scope = 'catalog' AND slug = 'microsoft-365';

  UPDATE public.ship_slots ss
  SET default_agent_id = v_m365,
      role_type = 'communications'
  FROM public.spaceship_blueprints sb
  WHERE sb.id = ss.spaceship_id
    AND sb.scope = 'catalog'
    AND ss.default_agent_id = v_monday;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  ASSERT v_n = 23, format('expected 23 slot swaps, got %s', v_n);

  UPDATE public.spaceship_blueprints
  SET config = jsonb_set(config, '{ship_system_prompt}',
        to_jsonb(replace(config->>'ship_system_prompt', '(monday.com, class-4)', '(Microsoft 365, class-4)')))
  WHERE scope = 'catalog'
    AND config->>'ship_system_prompt' LIKE '%(monday.com, class-4)%';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  ASSERT v_n = 19, format('expected 19 prompt updates, got %s', v_n);
END;
$swap$;

-- Apply-gate: no catalog crew slot or ship prompt references monday anymore.
DO $smoke$
BEGIN
  ASSERT (SELECT count(*)
          FROM public.ship_slots ss
          JOIN public.spaceship_blueprints sb ON sb.id = ss.spaceship_id
          JOIN public.agent_blueprints ab ON ab.id = ss.default_agent_id
          WHERE sb.scope = 'catalog' AND ab.slug = 'monday') = 0,
    'catalog slots still default to the monday.com Agent';
  ASSERT (SELECT count(*)
          FROM public.spaceship_blueprints
          WHERE scope = 'catalog'
            AND config->>'ship_system_prompt' LIKE '%(monday.com%') = 0,
    'catalog ship prompts still name monday.com as a seat provider';
  ASSERT (SELECT count(*)
          FROM public.ship_slots ss
          JOIN public.spaceship_blueprints sb ON sb.id = ss.spaceship_id
          JOIN public.agent_blueprints ab ON ab.id = ss.default_agent_id
          WHERE sb.scope = 'catalog' AND ab.slug = 'microsoft-365' AND ss.role_type = 'communications') >= 23,
    'swapped slots did not land on Microsoft 365 / communications';
END;
$smoke$;
