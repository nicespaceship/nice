-- Give the seven duplicate-named vertical leaders distinct names.
--
-- Three catalog display names are shared across distinct agents (Shop
-- Owner x3, Owner-Operator x2, Practice Owner x2), all with the same
-- category, so slot dropdowns and browse cards render indistinguishable
-- entries. Each leader gets a vertical-specific name; the Practice's
-- Practice Owner keeps its name since healthcare is the canonical home
-- for that title.
--
-- Every rename mirrors the display name into every surface that speaks
-- it: the agent's own system prompt and description/flavor, the ship's
-- system prompt ("You are the Shop Owner of the Cart..."), and the
-- ship_slots.label for slot 1, which is the rendered identity in the
-- schematic, slot editors, and the setup wizard, and the string
-- activation names the user's agent from. Ships and slots key by SLUG
-- (display names are mutable; 20260716 renamed them once already).
-- Replacements are scoped to the specific rows, so the phrase can never
-- leak into unrelated copy. The `config ? key` guards keep jsonb_set
-- from nulling a config whose prompt key is absent. Verified with a
-- BEGIN; ROLLBACK; dry-run.

DO $rename$
DECLARE
  r record;
  v_n integer;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('the-route-specialist',  'Owner-Operator', 'Route Operator',   'the-route'),
      ('the-trade-specialist',  'Owner-Operator', 'Trade Owner',      'the-trade'),
      ('the-clinic-specialist', 'Practice Owner', 'Clinic Owner',     'the-clinic'),
      ('the-cart-specialist',   'Shop Owner',     'Store Owner',      'the-cart'),
      ('the-chair-specialist',  'Shop Owner',     'Barbershop Owner', 'the-chair'),
      ('the-garage-specialist', 'Shop Owner',     'Garage Owner',     'the-garage')
    ) AS t(slug, old_name, new_name, ship_slug)
  LOOP
    UPDATE public.agent_blueprints
    SET name = r.new_name,
        description = replace(description, r.old_name, r.new_name),
        flavor = replace(flavor, r.old_name, r.new_name),
        config = jsonb_set(config, '{system_prompt}',
          to_jsonb(replace(config->>'system_prompt', r.old_name, r.new_name)::text))
    WHERE scope = 'catalog' AND slug = r.slug AND name = r.old_name
      AND config ? 'system_prompt';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    ASSERT v_n = 1, format('agent rename %s -> %s matched %s rows', r.slug, r.new_name, v_n);

    UPDATE public.spaceship_blueprints
    SET config = jsonb_set(config, '{ship_system_prompt}',
          to_jsonb(replace(config->>'ship_system_prompt', r.old_name, r.new_name)::text))
    WHERE scope = 'catalog' AND slug = r.ship_slug
      AND config ? 'ship_system_prompt'
      AND strpos(config->>'ship_system_prompt', r.old_name) > 0;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    ASSERT v_n = 1, format('ship prompt mirror for %s matched %s rows', r.ship_slug, v_n);

    UPDATE public.ship_slots ss
    SET label = r.new_name
    FROM public.spaceship_blueprints sb
    WHERE sb.id = ss.spaceship_id AND sb.scope = 'catalog' AND sb.slug = r.ship_slug
      AND ss.slot_position = 1 AND ss.label = r.old_name;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    ASSERT v_n = 1, format('slot-1 label mirror for %s matched %s rows', r.ship_slug, v_n);
  END LOOP;
END;
$rename$;

-- Apply-gate: the goal state, scoped to the touched names so unrelated
-- catalog drift cannot fail this file.
DO $smoke$
BEGIN
  ASSERT (SELECT count(*) FROM (
            SELECT name FROM public.agent_blueprints
            WHERE scope = 'catalog'
              AND name IN ('Route Operator','Trade Owner','Clinic Owner','Store Owner','Barbershop Owner','Garage Owner','Practice Owner')
            GROUP BY name HAVING count(*) <> 1
          ) d) = 0,
    'the seven leader names are not each unique';
  ASSERT (SELECT count(*)
          FROM public.ship_slots ss
          JOIN public.spaceship_blueprints sb ON sb.id = ss.spaceship_id
          WHERE sb.scope = 'catalog' AND ss.slot_position = 1
            AND sb.slug IN ('the-route','the-trade','the-clinic','the-cart','the-chair','the-garage')
            AND ss.label IN ('Route Operator','Trade Owner','Clinic Owner','Store Owner','Barbershop Owner','Garage Owner')) = 6,
    'a slot-1 label still carries a shared title';
  ASSERT (SELECT count(*) FROM public.spaceship_blueprints
          WHERE scope = 'catalog' AND slug = 'the-cart'
            AND config->>'ship_system_prompt' LIKE '%You are the Store Owner of the Cart%') = 1,
    'Cart ship prompt does not speak the new name';
END;
$smoke$;
