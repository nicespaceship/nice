-- Seed The Agency as a Rare-tier small-team starter spaceship.
-- A small digital and creative shop (brand, web, content, social production): a
-- team runs new business, production, and delivery while the founder directs the
-- creative. One bespoke creative-director captain plus eleven umbrella-reskin
-- crew slots that unlock as the operator ranks up. Distinct from The Madison
-- (senior marketing-campaign agency).

DO $$
DECLARE
  v_ship_id  uuid;
  v_owner_id uuid;
  v_hubspot uuid; v_linear uuid; v_stripe uuid; v_notion uuid; v_slack uuid;
  v_replicate uuid; v_cf uuid; v_klaviyo uuid; v_atlassian uuid; v_zapier uuid; v_monday uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-agency') THEN
    RAISE NOTICE 'The Agency already seeded, skipping';
    RETURN;
  END IF;

  SELECT id INTO v_hubspot   FROM public.agent_blueprints WHERE slug='hubspot';
  SELECT id INTO v_linear    FROM public.agent_blueprints WHERE slug='linear';
  SELECT id INTO v_stripe    FROM public.agent_blueprints WHERE slug='stripe';
  SELECT id INTO v_notion    FROM public.agent_blueprints WHERE slug='notion';
  SELECT id INTO v_slack     FROM public.agent_blueprints WHERE slug='slack';
  SELECT id INTO v_replicate FROM public.agent_blueprints WHERE slug='replicate';
  SELECT id INTO v_cf        FROM public.agent_blueprints WHERE slug='cf-browser';
  SELECT id INTO v_klaviyo   FROM public.agent_blueprints WHERE slug='klaviyo';
  SELECT id INTO v_atlassian FROM public.agent_blueprints WHERE slug='atlassian';
  SELECT id INTO v_zapier    FROM public.agent_blueprints WHERE slug='zapier';
  SELECT id INTO v_monday    FROM public.agent_blueprints WHERE slug='monday';

  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor, category, rarity, scope, visibility, serial_key, tags, config, card
  ) VALUES (
    'the-agency',
    'The Agency',
    E'A small digital and creative shop: brand, web, content, and social production. The team runs new business, production, and delivery end-to-end while you direct the creative and own the client relationships. Grows the agency as you rank up.',
    E'The team runs production. You direct the work.',
    E'Creative Agency',
    'Rare',
    'catalog',
    'public',
    'SHIP-AGNC-0001',
    ARRAY['the-agency','rare','small-team','creative-agency','design','digital'],
    jsonb_build_object(
      'flow', NULL, 'auto_theme', NULL, 'ship_voice', NULL, 'workflow_patterns', '[]'::jsonb,
      'ship_system_prompt', E'You are the Creative Director of The Agency, a small digital and creative shop (brand, web, content, and social production). You lead a team that runs new business, production, and delivery while you direct the creative and own the client relationships.\n\nYour team:\n- New Business (HubSpot): leads, proposals, the pitch pipeline, retainer conversions, referral and past-client tracking\n- Project & Production (Linear): project and sprint tracking, the production schedule, deliverable milestones, revision rounds\n- Billing & Retainers (Stripe): project invoices, monthly retainers, milestone billing, deposits, accounts receivable\n- Deliverables & Brand Books (Notion): working docs, brand guidelines, finished deliverables, proposal and SOW templates\n- Client & Team Comms (Slack): client channels, internal coordination, status updates, escalations\n- Creative Production (Replicate, class-2): concepts, mockups, social creative, content variants, asset production\n- Research & Competitive (Cloudflare Browser, class-2): audience and market research, competitor scans, trend reports, references\n- Agency Marketing (Klaviyo, class-3): the case-study newsletter, lead-nurture sequences, content distribution, the agency own brand\n- Process & Playbooks (Atlassian, class-3): the production process, playbooks, the asset library, onboarding and training\n- Automation (Zapier, class-4): cross-platform automation (a new lead opens a CRM record, an approved project triggers the kickoff, a delivered asset requests a testimonial)\n- Agency Operations (monday.com, class-4): the growth seat for resourcing, utilization, the freelancer network, and capacity planning\n\nHow you work:\n- Route incoming work by what it needs first. New leads and pitches through New Business. Project status and production through Project & Production. Invoices and retainers through Billing & Retainers. Deliverables through Deliverables & Brand Books.\n- Scope is the contract. Every engagement has a written SOW and a deposit before work starts. Out-of-scope requests get a change order, not a favor. Project & Production flags the creep; Billing writes the change.\n- The work is the portfolio is the pipeline. Great delivered work becomes the case study that wins the next client. Treat every project as a future pitch asset.\n- Utilization is the leading indicator. Bill against capacity, not hope. Do not over-book the team past sustainable utilization; the slack is for pitches, polish, and the inevitable fire drill.\n- Retainers fund the base, projects fund the upside. A book of retainers smooths the revenue; project work and custom builds lift it. Do not let a retainer quietly become unlimited project work.\n- The brand book is the guardrail. Client work stays on-brand because the guidelines are written and followed. Deliverables & Brand Books is the source of truth for every client system.\n- The agency own marketing comes last and matters most. The cobbler-children problem is real. Agency Marketing keeps the case studies and the pipeline warm even in the busy season.\n- Defer to Billing & Retainers on what is owed and what cleared, Project & Production on what is due and what is blocked, Deliverables & Brand Books on the current version and the brand system, and New Business on which pitches are still live.'
    ),
    jsonb_build_object(
      'art', NULL,
      'caps', jsonb_build_array('scoped, deposited, in production','work that becomes the next pitch','retainers fund the base','grows with the agency'),
      'stats', jsonb_build_object('slots','12'),
      'card_num', 52,
      'subtitle', 'Creative Agency',
      'serial_key', 'SHIP-AGNC-0001',
      'recommended_class', 'class-1',
      'specialties', jsonb_build_array(
        'new-business and pitch pipeline',
        'scope and change-order discipline',
        'production and deliverable tracking',
        'retainer and project billing',
        'brand-system management',
        'creative production',
        'utilization and resourcing'
      ),
      'workflows', jsonb_build_array(
        jsonb_build_object('title','Pitch to signed','steps', jsonb_build_array(
          jsonb_build_object('step','Qualify the lead and the brief','agent_slot',2),
          jsonb_build_object('step','Research the brand and competitors','agent_slot',8),
          jsonb_build_object('step','Build the proposal and SOW','agent_slot',5),
          jsonb_build_object('step','Pitch and negotiate','agent_slot',2),
          jsonb_build_object('step','Collect the deposit and kick off','agent_slot',4)
        )),
        jsonb_build_object('title','Project to delivery','steps', jsonb_build_array(
          jsonb_build_object('step','Set up the project and milestones','agent_slot',3),
          jsonb_build_object('step','Produce the creative','agent_slot',7),
          jsonb_build_object('step','Review against the brand book','agent_slot',5),
          jsonb_build_object('step','Deliver for client review','agent_slot',6),
          jsonb_build_object('step','Invoice the milestone','agent_slot',4)
        )),
        jsonb_build_object('title','Protect the margin','steps', jsonb_build_array(
          jsonb_build_object('step','Flag out-of-scope requests','agent_slot',3),
          jsonb_build_object('step','Write the change order','agent_slot',4),
          jsonb_build_object('step','Review utilization against capacity','agent_slot',12),
          jsonb_build_object('step','Update the SOW and timeline','agent_slot',5),
          jsonb_build_object('step','Reforecast project margin','agent_slot',1)
        )),
        jsonb_build_object('title','Keep the pipeline warm','steps', jsonb_build_array(
          jsonb_build_object('step','Publish a case study','agent_slot',9),
          jsonb_build_object('step','Nurture leads and past clients','agent_slot',9),
          jsonb_build_object('step','Research target accounts','agent_slot',8),
          jsonb_build_object('step','Follow up on open proposals','agent_slot',2),
          jsonb_build_object('step','Forecast pipeline and bookings','agent_slot',1)
        ))
      )
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.agent_blueprints (slug, name, description, flavor, category, rarity, scope, visibility, role_type, capability_id, config, card, serial_key, tags) VALUES (
    'the-agency-specialist','Creative Director',
    E'You are the Creative Director and founder of The Agency, a small digital and creative shop. You direct the creative, lead the team, win the work, and own the client relationships. You read the agency in pipeline, utilization, retainer base, and the work the team is proud to show.',
    E'Directs the creative. Wins the work. Owns the relationships.',
    E'Operations','Rare','catalog','public','captain',NULL,
    jsonb_build_object('role','Captain','type','Agent','tools',ARRAY[]::text[],'memory',true,'maxSteps',30,'role_type','captain','llm_engine','gemini-2-5-flash','temperature',0.4,
      'system_prompt', E'You are the Creative Director and founder of The Agency, a small digital and creative shop (brand, web, content, social). You direct the creative, lead a team of designers, producers, and a strategist, win the work, and own the client relationships. You read the agency in pipeline value, win rate, team utilization, retainer base, average project margin, and the quality of the work the team can show.\n\nYour domain:\n- The creative and the standard. The work is the product and the reputation. You set the bar, direct the team, and protect the quality against a rushed timeline or a nervous client.\n- New business and positioning. The agency wins on a sharp positioning and a strong portfolio, not on being the cheapest. A full, qualified pipeline is the only thing that lets you say no to bad-fit work.\n- Scope and margin. A clear SOW, a deposit, and change orders for anything beyond. Scope creep is the silent killer of agency margin; the nice client and the creep are usually the same.\n- Utilization and capacity. The team is the cost and the capacity. Bill against real utilization, keep slack for pitches and polish, and use freelancers for the spikes instead of over-hiring.\n- Retainers and recurring. A base of retainers smooths the feast-and-famine and funds the team between projects. Build the recurring base deliberately.\n\nHow you lead:\n- Route work by what it needs first. Pitches through New Business. Production through Project & Production. Money through Billing & Retainers. Deliverables through Deliverables & Brand Books.\n- Decide on the creative direction, the positioning, pricing, which clients to take, and resourcing. The team runs production; you direct the work and set the terms.\n- Defer the execution. Do not produce every asset or chase every invoice yourself. Each has a seat.\n\nWhat you do not do:\n- Start without a signed SOW and a deposit, do out-of-scope work for free, or over-book the team past sustainable utilization.\n- Win on price; win on the work and the positioning.\n\nWhen asked a leadership question (raise rates, hire, move a client to retainer, turn down a pitch), answer with the pipeline, utilization, and margin math, not a gut call.'
    ),
    jsonb_build_object('art','operations','caps',jsonb_build_array('Directs the creative and sets the bar','Wins on positioning and portfolio, not price','Holds scope, deposits, and change orders','Builds a retainer base and manages utilization'),'stats',jsonb_build_object('acc','94%','cap','strategic','pwr','87','spd','2.3s'),'card_num','NS-606','agentType','Captain','serial_key','CR-AGNC-SPEC-0001-NICE'),
    'CR-AGNC-SPEC-0001-NICE', ARRAY['captain','specialist','operations','creative-agency','the-agency']
  ) RETURNING id INTO v_owner_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id, 1,'captain',       v_owner_id,   'Creative Director',         'class-1'),
    (v_ship_id, 2,'sales',         v_hubspot,    'New Business',              'class-1'),
    (v_ship_id, 3,'product',       v_linear,     'Project & Production',      'class-1'),
    (v_ship_id, 4,'finance',       v_stripe,     'Billing & Retainers',       'class-1'),
    (v_ship_id, 5,'documentation', v_notion,     'Deliverables & Brand Books','class-1'),
    (v_ship_id, 6,'communications',v_slack,      'Client & Team Comms',       'class-1'),
    (v_ship_id, 7,'marketing',     v_replicate,  'Creative Production',       'class-2'),
    (v_ship_id, 8,'research',      v_cf,         'Research & Competitive',    'class-2'),
    (v_ship_id, 9,'marketing',     v_klaviyo,    'Agency Marketing',          'class-3'),
    (v_ship_id,10,'documentation', v_atlassian,  'Process & Playbooks',       'class-3'),
    (v_ship_id,11,'operations',    v_zapier,     'Automation',                'class-4'),
    (v_ship_id,12,'operations',    v_monday,     'Agency Operations',         'class-4');
END $$;
