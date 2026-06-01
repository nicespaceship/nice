-- Roll the executive-crew naming pattern (proven on the two Enterprises) across
-- the seven remaining Legendary sci-fi ships. Each slot label becomes a clean
-- character name and the rank/post moves to a per-slot "Position · Ship" title,
-- using the ship's short common name as the suffix. Bespoke crew (their own
-- agent_blueprints rows) also get the clean name + config.title; umbrella
-- reskins carry the persona on the slot only. ship_slots.title already exists
-- from the Enterprise-A rollout, so this only writes data.

-- ── Millennium Falcon ───────────────────────────────────────────────────────
DO $$
DECLARE v_ship uuid;
BEGIN
  SELECT id INTO v_ship FROM public.spaceship_blueprints WHERE slug='the-millennium-falcon';
  IF v_ship IS NULL THEN RAISE NOTICE 'Falcon not found, skipping'; RETURN; END IF;
  UPDATE public.ship_slots s SET label=v.lbl, title=v.ttl FROM (VALUES
    (1,'Han Solo','Captain · Millennium Falcon'),
    (2,'Princess Leia','General · Millennium Falcon'),
    (3,'Chewbacca','First Mate · Millennium Falcon'),
    (4,'Lando Calrissian','Baron Administrator · Millennium Falcon'),
    (5,'Poe Dameron','Ace Pilot · Millennium Falcon'),
    (6,'Rey','Jedi Knight · Millennium Falcon'),
    (7,'BB-8','Astromech Droid · Millennium Falcon'),
    (8,'Maz Kanata','Information Broker · Millennium Falcon'),
    (9,'K-2SO','Security Droid · Millennium Falcon'),
    (10,'Finn','Resistance Fighter · Millennium Falcon'),
    (11,'R2-D2','Systems Droid · Millennium Falcon'),
    (12,'C-3PO','Protocol Droid · Millennium Falcon')
  ) AS v(pos,lbl,ttl) WHERE s.spaceship_id=v_ship AND s.slot_position=v.pos;
  UPDATE public.agent_blueprints a SET name=v.nm, config=jsonb_set(a.config,'{title}',to_jsonb(v.ttl::text)) FROM (VALUES
    ('falcon-han-solo','Han Solo','Captain · Millennium Falcon'),
    ('falcon-leia','Princess Leia','General · Millennium Falcon'),
    ('falcon-chewbacca','Chewbacca','First Mate · Millennium Falcon'),
    ('falcon-lando','Lando Calrissian','Baron Administrator · Millennium Falcon'),
    ('falcon-rey','Rey','Jedi Knight · Millennium Falcon'),
    ('falcon-c3po','C-3PO','Protocol Droid · Millennium Falcon')
  ) AS v(slug,nm,ttl) WHERE a.slug=v.slug;
END $$;

-- ── Serenity ────────────────────────────────────────────────────────────────
DO $$
DECLARE v_ship uuid;
BEGIN
  SELECT id INTO v_ship FROM public.spaceship_blueprints WHERE slug='the-serenity';
  IF v_ship IS NULL THEN RAISE NOTICE 'Serenity not found, skipping'; RETURN; END IF;
  UPDATE public.ship_slots s SET label=v.lbl, title=v.ttl FROM (VALUES
    (1,'Malcolm Reynolds','Captain · Serenity'),
    (2,'Zoë Washburne','First Mate · Serenity'),
    (3,'Kaylee Frye','Ship''s Mechanic · Serenity'),
    (4,'Simon Tam','Ship''s Medic · Serenity'),
    (5,'Jayne Cobb','Mercenary · Serenity'),
    (6,'Hoban "Wash" Washburne','Pilot · Serenity'),
    (7,'Badger','Fixer · Serenity'),
    (8,'Inara Serra','Companion · Serenity'),
    (9,'Shepherd Book','Ship''s Preacher · Serenity'),
    (10,'Saffron','Grifter · Serenity'),
    (11,'Mr. Universe','Hacker · Serenity'),
    (12,'River Tam','Reader · Serenity')
  ) AS v(pos,lbl,ttl) WHERE s.spaceship_id=v_ship AND s.slot_position=v.pos;
  UPDATE public.agent_blueprints a SET name=v.nm, config=jsonb_set(a.config,'{title}',to_jsonb(v.ttl::text)) FROM (VALUES
    ('serenity-mal','Malcolm Reynolds','Captain · Serenity'),
    ('serenity-zoe','Zoë Washburne','First Mate · Serenity'),
    ('serenity-jayne','Jayne Cobb','Mercenary · Serenity'),
    ('serenity-wash','Hoban "Wash" Washburne','Pilot · Serenity'),
    ('serenity-river','River Tam','Reader · Serenity')
  ) AS v(slug,nm,ttl) WHERE a.slug=v.slug;
END $$;

-- ── Battlestar Galactica ────────────────────────────────────────────────────
DO $$
DECLARE v_ship uuid;
BEGIN
  SELECT id INTO v_ship FROM public.spaceship_blueprints WHERE slug='the-galactica';
  IF v_ship IS NULL THEN RAISE NOTICE 'Galactica not found, skipping'; RETURN; END IF;
  UPDATE public.ship_slots s SET label=v.lbl, title=v.ttl FROM (VALUES
    (1,'William Adama','Admiral · Galactica'),
    (2,'Laura Roslin','President · Galactica'),
    (3,'Galen Tyrol','Deck Chief · Galactica'),
    (4,'Sharon "Boomer" Valerii','Raptor Pilot · Galactica'),
    (5,'Kara "Starbuck" Thrace','Viper Pilot · Galactica'),
    (6,'Lee "Apollo" Adama','Air Group Commander · Galactica'),
    (7,'Saul Tigh','Executive Officer · Galactica'),
    (8,'Karl "Helo" Agathon','Rescue Pilot · Galactica'),
    (9,'Tom Zarek','Vice President · Galactica'),
    (10,'Number Six','Cylon Operative · Galactica'),
    (11,'Felix Gaeta','Tactical Officer · Galactica'),
    (12,'Gaius Baltar','Chief Scientist · Galactica')
  ) AS v(pos,lbl,ttl) WHERE s.spaceship_id=v_ship AND s.slot_position=v.pos;
  UPDATE public.agent_blueprints a SET name=v.nm, config=jsonb_set(a.config,'{title}',to_jsonb(v.ttl::text)) FROM (VALUES
    ('galactica-adama','William Adama','Admiral · Galactica'),
    ('galactica-roslin','Laura Roslin','President · Galactica'),
    ('galactica-starbuck','Kara "Starbuck" Thrace','Viper Pilot · Galactica'),
    ('galactica-apollo','Lee "Apollo" Adama','Air Group Commander · Galactica'),
    ('galactica-baltar','Gaius Baltar','Chief Scientist · Galactica')
  ) AS v(slug,nm,ttl) WHERE a.slug=v.slug;
END $$;

-- ── Normandy SR-2 ───────────────────────────────────────────────────────────
DO $$
DECLARE v_ship uuid;
BEGIN
  SELECT id INTO v_ship FROM public.spaceship_blueprints WHERE slug='the-normandy';
  IF v_ship IS NULL THEN RAISE NOTICE 'Normandy not found, skipping'; RETURN; END IF;
  UPDATE public.ship_slots s SET label=v.lbl, title=v.ttl FROM (VALUES
    (1,'Commander Shepard','Spectre · Normandy'),
    (2,'Joker','Helmsman · Normandy'),
    (3,'Garrus Vakarian','Weapons Officer · Normandy'),
    (4,'Liara T''Soni','Shadow Broker · Normandy'),
    (5,'Urdnot Wrex','Battlemaster · Normandy'),
    (6,'EDI','Ship''s AI · Normandy'),
    (7,'Miranda Lawson','Executive Officer · Normandy'),
    (8,'Mordin Solus','Science Officer · Normandy'),
    (9,'Thane Krios','Assassin · Normandy'),
    (10,'Samara','Justicar · Normandy'),
    (11,'Jacob Taylor','Armory Officer · Normandy'),
    (12,'Tali''Zorah vas Normandy','Chief Engineer · Normandy')
  ) AS v(pos,lbl,ttl) WHERE s.spaceship_id=v_ship AND s.slot_position=v.pos;
  UPDATE public.agent_blueprints a SET name=v.nm, config=jsonb_set(a.config,'{title}',to_jsonb(v.ttl::text)) FROM (VALUES
    ('normandy-shepard','Commander Shepard','Spectre · Normandy'),
    ('normandy-garrus','Garrus Vakarian','Weapons Officer · Normandy'),
    ('normandy-liara','Liara T''Soni','Shadow Broker · Normandy'),
    ('normandy-edi','EDI','Ship''s AI · Normandy'),
    ('normandy-tali','Tali''Zorah vas Normandy','Chief Engineer · Normandy')
  ) AS v(slug,nm,ttl) WHERE a.slug=v.slug;
END $$;

-- ── SDF-1 Macross ───────────────────────────────────────────────────────────
DO $$
DECLARE v_ship uuid;
BEGIN
  SELECT id INTO v_ship FROM public.spaceship_blueprints WHERE slug='the-sdf-1-macross';
  IF v_ship IS NULL THEN RAISE NOTICE 'Macross not found, skipping'; RETURN; END IF;
  UPDATE public.ship_slots s SET label=v.lbl, title=v.ttl FROM (VALUES
    (1,'Bruno Global','Captain · Macross'),
    (2,'Misa Hayase','First Officer · Macross'),
    (3,'Hikaru Ichijo','Lead Pilot · Macross'),
    (4,'Emil Lang','Chief Scientist · Macross'),
    (5,'Roy Focker','Squadron Leader · Macross'),
    (6,'Lynn Minmay','Idol Singer · Macross'),
    (7,'Kakizaki','Fighter Pilot · Macross'),
    (8,'Max Jenius','Ace Pilot · Macross'),
    (9,'Milia','Zentradi Ace · Macross'),
    (10,'Exsedol Folmo','Chief Archivist · Macross'),
    (11,'Britai Kridanik','Zentradi Commander · Macross'),
    (12,'Claudia LaSalle','Bridge Officer · Macross')
  ) AS v(pos,lbl,ttl) WHERE s.spaceship_id=v_ship AND s.slot_position=v.pos;
  UPDATE public.agent_blueprints a SET name=v.nm, config=jsonb_set(a.config,'{title}',to_jsonb(v.ttl::text)) FROM (VALUES
    ('macross-global','Bruno Global','Captain · Macross'),
    ('macross-misa','Misa Hayase','First Officer · Macross'),
    ('macross-hikaru','Hikaru Ichijo','Lead Pilot · Macross'),
    ('macross-roy','Roy Focker','Squadron Leader · Macross'),
    ('macross-minmay','Lynn Minmay','Idol Singer · Macross'),
    ('macross-claudia','Claudia LaSalle','Bridge Officer · Macross')
  ) AS v(slug,nm,ttl) WHERE a.slug=v.slug;
END $$;

-- ── Space Battleship Yamato ─────────────────────────────────────────────────
DO $$
DECLARE v_ship uuid;
BEGIN
  SELECT id INTO v_ship FROM public.spaceship_blueprints WHERE slug='the-yamato';
  IF v_ship IS NULL THEN RAISE NOTICE 'Yamato not found, skipping'; RETURN; END IF;
  UPDATE public.ship_slots s SET label=v.lbl, title=v.ttl FROM (VALUES
    (1,'Juzo Okita','Captain · Yamato'),
    (2,'Susumu Kodai','Tactical Leader · Yamato'),
    (3,'Yamazaki','Systems Engineer · Yamato'),
    (4,'Analyzer','Ship''s Robot · Yamato'),
    (5,'Kato','Fighter Pilot · Yamato'),
    (6,'Yuki Mori','Radar Operator · Yamato'),
    (7,'Daisuke Shima','Chief Navigator · Yamato'),
    (8,'Yamamoto','Combat Pilot · Yamato'),
    (9,'Sado','Ship''s Doctor · Yamato'),
    (10,'Tokugawa Hikozaemon','Engine Room Chief · Yamato'),
    (11,'Yabu','Flight Officer · Yamato'),
    (12,'Shiro Sanada','Science Officer · Yamato')
  ) AS v(pos,lbl,ttl) WHERE s.spaceship_id=v_ship AND s.slot_position=v.pos;
  UPDATE public.agent_blueprints a SET name=v.nm, config=jsonb_set(a.config,'{title}',to_jsonb(v.ttl::text)) FROM (VALUES
    ('yamato-okita','Juzo Okita','Captain · Yamato'),
    ('yamato-kodai','Susumu Kodai','Tactical Leader · Yamato'),
    ('yamato-analyzer','Analyzer','Ship''s Robot · Yamato'),
    ('yamato-yuki','Yuki Mori','Radar Operator · Yamato'),
    ('yamato-sanada','Shiro Sanada','Science Officer · Yamato')
  ) AS v(slug,nm,ttl) WHERE a.slug=v.slug;
END $$;

-- ── Discovery One ───────────────────────────────────────────────────────────
DO $$
DECLARE v_ship uuid;
BEGIN
  SELECT id INTO v_ship FROM public.spaceship_blueprints WHERE slug='the-discovery-one';
  IF v_ship IS NULL THEN RAISE NOTICE 'Discovery One not found, skipping'; RETURN; END IF;
  UPDATE public.ship_slots s SET label=v.lbl, title=v.ttl FROM (VALUES
    (1,'HAL 9000','Mission Computer · Discovery One'),
    (2,'Frank Poole','Mission Pilot · Discovery One'),
    (3,'Dr. Chandra','AI Architect · Discovery One'),
    (4,'Dave Bowman','Mission Commander · Discovery One'),
    (5,'SAL 9000','Backup Computer · Discovery One'),
    (6,'Heywood Floyd','Mission Director · Discovery One'),
    (7,'Maxim Brailovsky','Cosmonaut · Discovery One'),
    (8,'Walter Curnow','Systems Engineer · Discovery One'),
    (9,'Vasili Orlov','Science Officer · Discovery One'),
    (10,'Smyslov','Mission Specialist · Discovery One'),
    (11,'Kaminsky','Flight Engineer · Discovery One'),
    (12,'The Monolith','Cosmic Enigma · Discovery One')
  ) AS v(pos,lbl,ttl) WHERE s.spaceship_id=v_ship AND s.slot_position=v.pos;
  UPDATE public.agent_blueprints a SET name=v.nm, config=jsonb_set(a.config,'{title}',to_jsonb(v.ttl::text)) FROM (VALUES
    ('discovery-hal-9000','HAL 9000','Mission Computer · Discovery One'),
    ('discovery-frank-poole','Frank Poole','Mission Pilot · Discovery One'),
    ('discovery-dave-bowman','Dave Bowman','Mission Commander · Discovery One'),
    ('discovery-sal-9000','SAL 9000','Backup Computer · Discovery One'),
    ('discovery-monolith','The Monolith','Cosmic Enigma · Discovery One')
  ) AS v(slug,nm,ttl) WHERE a.slug=v.slug;
END $$;
