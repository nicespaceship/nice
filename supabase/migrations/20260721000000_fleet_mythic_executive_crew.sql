-- Roll the executive-crew naming pattern across the five Mythic ships. Unlike
-- the Legendary fleet these ship bespoke crew on every slot (their own
-- agent_blueprints rows with <slug>-exclusive tags), so each slot updates both
-- the slot label/title and the agent name/config.title. Labels become clean
-- character names (or their iconic designation) and the post moves into a
-- per-slot "Position · Ship" title.

-- ── The Matrix ──────────────────────────────────────────────────────────────
DO $$
DECLARE v_ship uuid;
BEGIN
  SELECT id INTO v_ship FROM public.spaceship_blueprints WHERE slug='the-matrix';
  IF v_ship IS NULL THEN RAISE NOTICE 'Matrix not found, skipping'; RETURN; END IF;
  UPDATE public.ship_slots s SET label=v.lbl, title=v.ttl FROM (VALUES
    (1,'Morpheus','Captain · The Matrix'),
    (2,'Neo','The One · The Matrix'),
    (3,'Trinity','First Officer · The Matrix'),
    (4,'The Oracle','Seer · The Matrix'),
    (5,'Agent Smith','Rogue Program · The Matrix'),
    (6,'Tank','Operator · The Matrix'),
    (7,'The Keymaker','Gatekeeper · The Matrix'),
    (8,'Merovingian','Information Trafficker · The Matrix'),
    (9,'Seraph','Guardian · The Matrix'),
    (10,'Sati','Angel Program · The Matrix'),
    (11,'Cypher','Broker · The Matrix'),
    (12,'The Architect','System Designer · The Matrix')
  ) AS v(pos,lbl,ttl) WHERE s.spaceship_id=v_ship AND s.slot_position=v.pos;
  UPDATE public.agent_blueprints a SET name=v.nm, config=jsonb_set(a.config,'{title}',to_jsonb(v.ttl::text)) FROM (VALUES
    ('matrix-morpheus','Morpheus','Captain · The Matrix'),
    ('matrix-neo','Neo','The One · The Matrix'),
    ('matrix-trinity','Trinity','First Officer · The Matrix'),
    ('matrix-oracle','The Oracle','Seer · The Matrix'),
    ('matrix-smith','Agent Smith','Rogue Program · The Matrix'),
    ('matrix-tank','Tank','Operator · The Matrix'),
    ('matrix-keymaker','The Keymaker','Gatekeeper · The Matrix'),
    ('matrix-merovingian','Merovingian','Information Trafficker · The Matrix'),
    ('matrix-seraph','Seraph','Guardian · The Matrix'),
    ('matrix-sati','Sati','Angel Program · The Matrix'),
    ('matrix-cypher','Cypher','Broker · The Matrix'),
    ('matrix-architect','The Architect','System Designer · The Matrix')
  ) AS v(slug,nm,ttl) WHERE a.slug=v.slug;
END $$;

-- ── The Heart of Gold ───────────────────────────────────────────────────────
DO $$
DECLARE v_ship uuid;
BEGIN
  SELECT id INTO v_ship FROM public.spaceship_blueprints WHERE slug='the-heart-of-gold';
  IF v_ship IS NULL THEN RAISE NOTICE 'Heart of Gold not found, skipping'; RETURN; END IF;
  UPDATE public.ship_slots s SET label=v.lbl, title=v.ttl FROM (VALUES
    (1,'Zaphod Beeblebrox','Galactic President · Heart of Gold'),
    (2,'Trillian','Astrophysicist · Heart of Gold'),
    (3,'Marvin the Paranoid Android','Ship''s Robot · Heart of Gold'),
    (4,'Ford Prefect','Field Researcher · Heart of Gold'),
    (5,'Eddie the Shipboard Computer','Onboard AI · Heart of Gold'),
    (6,'Arthur Dent','Earthling Survivor · Heart of Gold'),
    (7,'The Infinite Improbability Drive','Propulsion Core · Heart of Gold'),
    (8,'Fenchurch','Companion · Heart of Gold'),
    (9,'Vroomfondel','Philosopher · Heart of Gold'),
    (10,'Slartibartfast','Planet Designer · Heart of Gold'),
    (11,'Wonko the Sane','Resident Sage · Heart of Gold'),
    (12,'Deep Thought','Supercomputer · Heart of Gold')
  ) AS v(pos,lbl,ttl) WHERE s.spaceship_id=v_ship AND s.slot_position=v.pos;
  UPDATE public.agent_blueprints a SET name=v.nm, config=jsonb_set(a.config,'{title}',to_jsonb(v.ttl::text)) FROM (VALUES
    ('hgg-zaphod','Zaphod Beeblebrox','Galactic President · Heart of Gold'),
    ('hgg-trillian','Trillian','Astrophysicist · Heart of Gold'),
    ('hgg-marvin','Marvin the Paranoid Android','Ship''s Robot · Heart of Gold'),
    ('hgg-ford','Ford Prefect','Field Researcher · Heart of Gold'),
    ('hgg-eddie','Eddie the Shipboard Computer','Onboard AI · Heart of Gold'),
    ('hgg-arthur','Arthur Dent','Earthling Survivor · Heart of Gold'),
    ('hgg-improbability-drive','The Infinite Improbability Drive','Propulsion Core · Heart of Gold'),
    ('hgg-fenchurch','Fenchurch','Companion · Heart of Gold'),
    ('hgg-vroomfondel','Vroomfondel','Philosopher · Heart of Gold'),
    ('hgg-slartibartfast','Slartibartfast','Planet Designer · Heart of Gold'),
    ('hgg-wonko','Wonko the Sane','Resident Sage · Heart of Gold'),
    ('hgg-deep-thought','Deep Thought','Supercomputer · Heart of Gold')
  ) AS v(slug,nm,ttl) WHERE a.slug=v.slug;
END $$;

-- ── The Borg Cube ───────────────────────────────────────────────────────────
DO $$
DECLARE v_ship uuid;
BEGIN
  SELECT id INTO v_ship FROM public.spaceship_blueprints WHERE slug='the-borg-cube';
  IF v_ship IS NULL THEN RAISE NOTICE 'Borg Cube not found, skipping'; RETURN; END IF;
  UPDATE public.ship_slots s SET label=v.lbl, title=v.ttl FROM (VALUES
    (1,'The Borg Queen','Hive Sovereign · the Collective'),
    (2,'Locutus of Borg','Borg Spokesman · the Collective'),
    (3,'Engineering Drone Alpha','Fabrication Unit · the Collective'),
    (4,'Adaptation Drone','Adaptation Unit · the Collective'),
    (5,'Tactical Drone','Assault Unit · the Collective'),
    (6,'Communications Node','Subspace Relay · the Collective'),
    (7,'Assimilation Specialist','Assimilation Unit · the Collective'),
    (8,'Vinculum Controller','Hive Vinculum · the Collective'),
    (9,'Unimatrix Coordinator','Unimatrix Hub · the Collective'),
    (10,'Data Analysis Node','Analysis Core · the Collective'),
    (11,'Transwarp Specialist','Transwarp Conduit · the Collective'),
    (12,'Seven of Nine','Liberated Drone · the Collective')
  ) AS v(pos,lbl,ttl) WHERE s.spaceship_id=v_ship AND s.slot_position=v.pos;
  UPDATE public.agent_blueprints a SET name=v.nm, config=jsonb_set(a.config,'{title}',to_jsonb(v.ttl::text)) FROM (VALUES
    ('borg-queen','The Borg Queen','Hive Sovereign · the Collective'),
    ('borg-locutus','Locutus of Borg','Borg Spokesman · the Collective'),
    ('borg-engineering-drone','Engineering Drone Alpha','Fabrication Unit · the Collective'),
    ('borg-adaptation-drone','Adaptation Drone','Adaptation Unit · the Collective'),
    ('borg-tactical-drone','Tactical Drone','Assault Unit · the Collective'),
    ('borg-comms-node','Communications Node','Subspace Relay · the Collective'),
    ('borg-assimilation-specialist','Assimilation Specialist','Assimilation Unit · the Collective'),
    ('borg-vinculum-controller','Vinculum Controller','Hive Vinculum · the Collective'),
    ('borg-unimatrix-coordinator','Unimatrix Coordinator','Unimatrix Hub · the Collective'),
    ('borg-data-analysis-node','Data Analysis Node','Analysis Core · the Collective'),
    ('borg-transwarp-specialist','Transwarp Specialist','Transwarp Conduit · the Collective'),
    ('borg-seven-of-nine','Seven of Nine','Liberated Drone · the Collective')
  ) AS v(slug,nm,ttl) WHERE a.slug=v.slug;
END $$;

-- ── The Death Star ──────────────────────────────────────────────────────────
DO $$
DECLARE v_ship uuid;
BEGIN
  SELECT id INTO v_ship FROM public.spaceship_blueprints WHERE slug='the-death-star';
  IF v_ship IS NULL THEN RAISE NOTICE 'Death Star not found, skipping'; RETURN; END IF;
  UPDATE public.ship_slots s SET label=v.lbl, title=v.ttl FROM (VALUES
    (1,'Grand Moff Tarkin','Station Commander · the Death Star'),
    (2,'General Veers','Ground Forces Commander · the Death Star'),
    (3,'Galen Erso','Weapon Architect · the Death Star'),
    (4,'Director Krennic','Project Overseer · the Death Star'),
    (5,'Darth Vader','Sith Enforcer · the Death Star'),
    (6,'Admiral Piett','Fleet Commander · the Death Star'),
    (7,'Captain Motti','Tactical Officer · the Death Star'),
    (8,'General Tagge','Chief Strategist · the Death Star'),
    (9,'Mas Amedda','Grand Vizier · the Death Star'),
    (10,'Colonel Yularen','Intelligence Chief · the Death Star'),
    (11,'Vizier Sate Pestage','Imperial Advisor · the Death Star'),
    (12,'Emperor Palpatine','Galactic Ruler · the Death Star')
  ) AS v(pos,lbl,ttl) WHERE s.spaceship_id=v_ship AND s.slot_position=v.pos;
  UPDATE public.agent_blueprints a SET name=v.nm, config=jsonb_set(a.config,'{title}',to_jsonb(v.ttl::text)) FROM (VALUES
    ('death-star-tarkin','Grand Moff Tarkin','Station Commander · the Death Star'),
    ('death-star-veers','General Veers','Ground Forces Commander · the Death Star'),
    ('death-star-erso','Galen Erso','Weapon Architect · the Death Star'),
    ('death-star-krennic','Director Krennic','Project Overseer · the Death Star'),
    ('death-star-vader','Darth Vader','Sith Enforcer · the Death Star'),
    ('death-star-piett','Admiral Piett','Fleet Commander · the Death Star'),
    ('death-star-motti','Captain Motti','Tactical Officer · the Death Star'),
    ('death-star-tagge','General Tagge','Chief Strategist · the Death Star'),
    ('death-star-amedda','Mas Amedda','Grand Vizier · the Death Star'),
    ('death-star-yularen','Colonel Yularen','Intelligence Chief · the Death Star'),
    ('death-star-pestage','Vizier Sate Pestage','Imperial Advisor · the Death Star'),
    ('death-star-palpatine','Emperor Palpatine','Galactic Ruler · the Death Star')
  ) AS v(slug,nm,ttl) WHERE a.slug=v.slug;
END $$;

-- ── The Grid ────────────────────────────────────────────────────────────────
DO $$
DECLARE v_ship uuid;
BEGIN
  SELECT id INTO v_ship FROM public.spaceship_blueprints WHERE slug='the-grid';
  IF v_ship IS NULL THEN RAISE NOTICE 'Grid not found, skipping'; RETURN; END IF;
  UPDATE public.ship_slots s SET label=v.lbl, title=v.ttl FROM (VALUES
    (1,'Kevin Flynn','The Creator · the Grid'),
    (2,'Sam Flynn','User · the Grid'),
    (3,'Tron','Security Program · the Grid'),
    (4,'Quorra','ISO · the Grid'),
    (5,'Rinzler','Enforcer Program · the Grid'),
    (6,'Yori','Input Program · the Grid'),
    (7,'Beck','Renegade · the Grid'),
    (8,'Castor / Zuse','Club Proprietor · the Grid'),
    (9,'Dumont','I/O Guardian · the Grid'),
    (10,'Anon','Sentry Program · the Grid'),
    (11,'Sark','Command Program · the Grid'),
    (12,'CLU 2.0','System Administrator · the Grid')
  ) AS v(pos,lbl,ttl) WHERE s.spaceship_id=v_ship AND s.slot_position=v.pos;
  UPDATE public.agent_blueprints a SET name=v.nm, config=jsonb_set(a.config,'{title}',to_jsonb(v.ttl::text)) FROM (VALUES
    ('grid-kevin-flynn','Kevin Flynn','The Creator · the Grid'),
    ('grid-sam-flynn','Sam Flynn','User · the Grid'),
    ('grid-tron','Tron','Security Program · the Grid'),
    ('grid-quorra','Quorra','ISO · the Grid'),
    ('grid-rinzler','Rinzler','Enforcer Program · the Grid'),
    ('grid-yori','Yori','Input Program · the Grid'),
    ('grid-beck','Beck','Renegade · the Grid'),
    ('grid-castor','Castor / Zuse','Club Proprietor · the Grid'),
    ('grid-dumont','Dumont','I/O Guardian · the Grid'),
    ('grid-anon','Anon','Sentry Program · the Grid'),
    ('grid-sark','Sark','Command Program · the Grid'),
    ('grid-clu','CLU 2.0','System Administrator · the Grid')
  ) AS v(slug,nm,ttl) WHERE a.slug=v.slug;
END $$;
