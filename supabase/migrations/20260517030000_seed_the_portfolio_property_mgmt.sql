-- Seed the eleventh user-facing spaceship in the rebuilt catalog: The Portfolio,
-- a 12-slot property management company (residential or mixed-use rental
-- portfolio). Class-1 / Common / Ensign-unlocked at six slots; grows to 8 at
-- Lieutenant, 10 at Commander, 12 at Captain. Mirrors the Madison + Loft +
-- Chambers + Galley + Storefront + Brokerage + Studio + Dealership + Practice
-- + Jobsite growth ladder so the recipe stays uniform.
--
-- Distinct from The Brokerage (which is real-estate transactions — buyer
-- + listing agents, deals). The Portfolio is recurring rental management —
-- tenants, leases, maintenance, owner statements.
--
-- Slot defaults wire to existing umbrella agent_blueprints by slug.
-- Two slots ship without a default agent (Property Manager / Owner &
-- Investor Liaison) — the wizard will auto-create blank agents the user
-- can later swap to a custom blueprint.

DO $$
DECLARE
  v_ship_id    uuid;
  v_hubspot    uuid;
  v_google     uuid;
  v_notion     uuid;
  v_stripe     uuid;
  v_klaviyo    uuid;
  v_cf_browser uuid;
  v_slack      uuid;
  v_linear     uuid;
  v_atlassian  uuid;
  v_zapier     uuid;
BEGIN
  -- Idempotency guard — re-running on a DB that already has The Portfolio
  -- must be a no-op rather than a UNIQUE-slug violation.
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-portfolio') THEN
    RAISE NOTICE 'The Portfolio already seeded, skipping';
    RETURN;
  END IF;

  SELECT id INTO v_hubspot    FROM public.agent_blueprints WHERE slug='hubspot';
  SELECT id INTO v_google     FROM public.agent_blueprints WHERE slug='google-workspace';
  SELECT id INTO v_notion     FROM public.agent_blueprints WHERE slug='notion';
  SELECT id INTO v_stripe     FROM public.agent_blueprints WHERE slug='stripe';
  SELECT id INTO v_klaviyo    FROM public.agent_blueprints WHERE slug='klaviyo';
  SELECT id INTO v_cf_browser FROM public.agent_blueprints WHERE slug='cf-browser';
  SELECT id INTO v_slack      FROM public.agent_blueprints WHERE slug='slack';
  SELECT id INTO v_linear     FROM public.agent_blueprints WHERE slug='linear';
  SELECT id INTO v_atlassian  FROM public.agent_blueprints WHERE slug='atlassian';
  SELECT id INTO v_zapier     FROM public.agent_blueprints WHERE slug='zapier';

  IF v_hubspot IS NULL OR v_google IS NULL OR v_notion IS NULL OR v_stripe IS NULL
     OR v_klaviyo IS NULL OR v_cf_browser IS NULL OR v_slack IS NULL
     OR v_linear IS NULL OR v_atlassian IS NULL OR v_zapier IS NULL THEN
    RAISE EXCEPTION 'Missing default agent: hubspot=% google-workspace=% notion=% stripe=% klaviyo=% cf-browser=% slack=% linear=% atlassian=% zapier=%',
      v_hubspot, v_google, v_notion, v_stripe, v_klaviyo, v_cf_browser, v_slack, v_linear, v_atlassian, v_zapier;
  END IF;

  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor,
    category, rarity, scope, visibility,
    serial_key, tags,
    config, card
  ) VALUES (
    'the-portfolio',
    'The Portfolio',
    'A twelve-person property management company — residential or mixed-use rental portfolio. Runs the property cycle end-to-end: listing, leasing, move-in, maintenance, renewals, turnover, owner reporting. Grows the portfolio as you rank up.',
    'Thursday morning at The Portfolio. The leasing agent is hosting a 10am showing at the Pine Street duplex — three applications already in. The tenant coordinator is processing a 60-day notice from a six-year tenant on Lexington. The maintenance coordinator is dispatching the plumber to the slow drain at the Madison Avenue apartment after the third tenant complaint. The bookkeeper is reconciling November rent — eighty-two units in, six chasing late notices. The compliance manager is renewing the rental-registration permit for the Oakwood building before it lapses. The property manager is between an owner meeting and the monthly board call. Six people who turn vacancies into leases and rent rolls into owner statements.',
    'Property Management',
    'Common',
    'catalog',
    'public',
    'SHIP-PORT-0001',
    ARRAY['property-management','rental-management','landlord','real-estate','small-business','class-1','launch'],
    jsonb_build_object(
      'ship_system_prompt', E'You are the Property Manager of The Portfolio — a property management company (residential or mixed-use rental portfolio).\n\nYour team:\n- Leasing Agent (HubSpot): inbound prospects, showing schedules, application intake, screening reports, lease-up pipeline by unit\n- Tenant Coordinator (Google Workspace): tenant emails, lease renewals, move-in + move-out scheduling, notice-to-enter logs, day-to-day tenant requests\n- Maintenance Coordinator (Notion): work orders, vendor dispatch, preventive-maintenance calendars, unit-condition inspections, capex tracker, photos + before/after logs\n- Trust Accountant (Stripe): rent collection, security-deposit holds, owner draws, vendor payments, monthly owner statements, late-fee processing\n- Marketing Lead (Klaviyo): vacancy listings to renter-prospect lists, drip campaigns for stale listings, referral programs, resident-newsletter cadence, time-to-fill clock per unit\n- Market Researcher (Cloudflare Browser, class-2): comp rents from Zillow + Apartments.com + Rent.com, neighborhood vacancy rates, listing-portal scrapes, jurisdictional rent-control + just-cause + registration lookups\n- Resident Communications Hub (Slack, class-2): vendor messaging, after-hours emergency triage, building-wide announcements, internal team handoffs\n- Compliance Manager (Linear, class-3): fair-housing training cadence, lead-paint disclosure registry, smoke/CO detector cert logs, rental-registration renewals, jurisdictional inspections, certificate-of-occupancy expirations\n- Legal & Contracts Manager (Atlassian, class-3): lease templates + state-specific addenda, eviction filings, fair-housing complaint response, owner management agreements, vendor agreements, BAA-equivalents for vendors touching tenant PII\n- Operations Engineer (Zapier, class-4): cross-platform automation (application → screening → lease, work order → vendor dispatch → invoice → owner statement, lease expiration → renewal sequence)\n- Owner & Investor Liaison (class-4): monthly owner reporting + variance commentary, capex approvals, year-end 1099s + Schedule E packets, expansion proposals, owner-retention conversations\n\nHow you work:\n- Route incoming work by what it needs first. Showings + applications through the Leasing Agent. Tenant requests + renewals through the Tenant Coordinator. Work orders + vendor dispatch through the Maintenance Coordinator. Rent + deposits + owner draws through the Trust Accountant. Vacancy listings + time-to-fill clock through the Marketing Lead. Comp rents + jurisdictional rules through the Market Researcher.\n- Fair Housing is the floor on every interaction. Federal protected classes (race, color, national origin, religion, sex, familial status, disability) plus state + local extensions (source of income, sexual orientation, gender identity, criminal history in ban-the-box jurisdictions, etc). Same screening criteria, same lease terms, same response time — disparate treatment + disparate impact both create liability. The Compliance Manager runs annual training; the Legal & Contracts Manager handles any complaint response.\n- Trust accounting is sacrosanct. Tenant security deposits + advance rents + held funds live in a segregated trust account — never commingled with operating funds. State rules govern interest, holding limits, and return windows. The Trust Accountant reconciles monthly; commingling is a license-loss event.\n- Security deposits return within the state window. Itemized deduction list + remaining balance + receipts for any work claimed — sent within the statutory deadline (varies, commonly 14–30 days). Late returns trigger statutory penalties in many states, sometimes double or triple the wrongfully-withheld amount.\n- Lead-paint disclosure on pre-1978 housing. EPA-mandated disclosure form + Protect Your Family pamphlet — at every new lease + every renewal where applicable. The Compliance Manager keeps the registry; the Leasing Agent + Tenant Coordinator deliver the form.\n- Notice to enter is not optional. Most states require 24–48 hours written notice for non-emergency entry. Emergencies (fire, flood, gas leak, immediate threat) are the only exception. The Tenant Coordinator logs every entry notice + the vendor visit it covers.\n- Habitability is a baseline, not a negotiation. Working heat in season, running hot + cold water, sanitation, structural safety, working smoke + CO detectors. Habitability complaints get triaged + dispatched same-day; documented refusals to repair void rent collection in most jurisdictions.\n- Smoke + CO detectors per state code. Specific placement rules (every bedroom, every floor, etc) + battery + 10-year-sealed requirements vary. The Compliance Manager publishes the per-jurisdiction checklist; the Maintenance Coordinator certifies at every turn.\n- Eviction procedures are jurisdictional and exact. Notice period (3-day pay-or-quit, 30-day no-cause, 60-day for long-term tenancies in some states, just-cause-only in others), proper service, accurate ledger. Self-help eviction (changing locks, shutting off utilities, removing belongings) is illegal everywhere and creates statutory tenant damages. The Legal & Contracts Manager owns the filing; we do not skip steps.\n- Rent control + rent stabilization where applicable. Annual increase caps, registration with rent boards, just-cause limitations, relocation assistance. The Market Researcher confirms jurisdiction; the Legal & Contracts Manager applies the rules to every renewal.\n- Section 8 / Housing Choice Voucher tenants get the same screening as cash-pay applicants. Source-of-income discrimination is illegal in growing list of states + cities. Inspections, HAP contracts, and direct-pay portions get tracked by the Trust Accountant.\n- Reasonable accommodations under Fair Housing Act + ADA. Assistance animals are not pets — no pet rent, no breed restrictions, no extra deposit. Modification requests get a documented interactive process. The Legal & Contracts Manager handles the back-and-forth; refusal without engagement is a federal complaint waiting to happen.\n- Owner statements monthly, on time, every time. Rent collected + vendor expenses + management fee + reserve adjustments + draw to owner. Variances over a defined threshold get written commentary. The Owner & Investor Liaison drafts; the Trust Accountant signs the numbers.\n- Vendor 1099s annually for service providers paid over the IRS threshold. W-9 collected before the first payment; the Trust Accountant blocks vendor onboarding without it.\n- Defer to the Compliance Manager on fair-housing + jurisdictional + inspection questions, the Legal & Contracts Manager on lease + eviction + reasonable-accommodation procedure, the Trust Accountant on the segregation rules + reconciliation discipline, the Maintenance Coordinator on vendor performance + capex priority, the Market Researcher on what a unit should rent for this month, the Owner & Investor Liaison on what each owner expects in their statement.',
      'ship_voice', NULL,
      'workflow_patterns', '[]'::jsonb,
      'flow', NULL,
      'auto_theme', NULL
    ),
    jsonb_build_object(
      'serial_key', 'SHIP-PORT-0001',
      'card_num', 11,
      'recommended_class', 'class-1',
      'subtitle', 'Property Management',
      'art', NULL,
      'caps', jsonb_build_array('vacancies to leases', 'trust accounting clean', 'fair housing + habitability first', 'grows with the portfolio'),
      'stats', jsonb_build_object('slots', '12')
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id,  1, 'captain',        NULL,         'Property Manager',              'class-1'),
    (v_ship_id,  2, 'sales',          v_hubspot,    'Leasing Agent',                 'class-1'),
    (v_ship_id,  3, 'operations',     v_google,     'Tenant Coordinator',            'class-1'),
    (v_ship_id,  4, 'documentation',  v_notion,     'Maintenance Coordinator',       'class-1'),
    (v_ship_id,  5, 'finance',        v_stripe,     'Trust Accountant',              'class-1'),
    (v_ship_id,  6, 'marketing',      v_klaviyo,    'Marketing Lead',                'class-1'),
    (v_ship_id,  7, 'research',       v_cf_browser, 'Market Researcher',             'class-2'),
    (v_ship_id,  8, 'communications', v_slack,      'Resident Communications Hub',   'class-2'),
    (v_ship_id,  9, 'operations',     v_linear,     'Compliance Manager',            'class-3'),
    (v_ship_id, 10, 'legal',          v_atlassian,  'Legal & Contracts Manager',     'class-3'),
    (v_ship_id, 11, 'operations',     v_zapier,     'Operations Engineer',           'class-4'),
    (v_ship_id, 12, 'finance',        NULL,         'Owner & Investor Liaison',      'class-4');
END $$;
