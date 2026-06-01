-- Seed The Cart as a Common-tier single-operator starter spaceship.
-- A solo online store: one seller sources, lists, markets, packs, and supports
-- the whole funnel. One bespoke shop-owner captain plus eleven umbrella-reskin
-- crew slots that unlock as the seller ranks up.

DO $$
DECLARE
  v_ship_id  uuid;
  v_owner_id uuid;
  v_stripe uuid; v_gw uuid; v_klaviyo uuid; v_cf uuid; v_airtable uuid;
  v_hubspot uuid; v_replicate uuid; v_notion uuid; v_linear uuid; v_zapier uuid; v_monday uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = 'the-cart') THEN
    RAISE NOTICE 'The Cart already seeded, skipping';
    RETURN;
  END IF;

  SELECT id INTO v_stripe    FROM public.agent_blueprints WHERE slug='stripe';
  SELECT id INTO v_gw        FROM public.agent_blueprints WHERE slug='google-workspace';
  SELECT id INTO v_klaviyo   FROM public.agent_blueprints WHERE slug='klaviyo';
  SELECT id INTO v_cf        FROM public.agent_blueprints WHERE slug='cf-browser';
  SELECT id INTO v_airtable  FROM public.agent_blueprints WHERE slug='airtable';
  SELECT id INTO v_hubspot   FROM public.agent_blueprints WHERE slug='hubspot';
  SELECT id INTO v_replicate FROM public.agent_blueprints WHERE slug='replicate';
  SELECT id INTO v_notion    FROM public.agent_blueprints WHERE slug='notion';
  SELECT id INTO v_linear    FROM public.agent_blueprints WHERE slug='linear';
  SELECT id INTO v_zapier    FROM public.agent_blueprints WHERE slug='zapier';
  SELECT id INTO v_monday    FROM public.agent_blueprints WHERE slug='monday';

  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor, category, rarity, scope, visibility, serial_key, tags, config, card
  ) VALUES (
    'the-cart',
    'The Cart',
    E'A solo online store on Shopify, Etsy, eBay, or your own site. One seller sources the product, lists it, markets it, packs it, and answers every customer email. Starts lean on day one and grows the channels and the catalog as you rank up.',
    E'You find the product. The Cart runs the store.',
    E'E-commerce',
    'Common',
    'catalog',
    'public',
    'SHIP-CART-0001',
    ARRAY['the-cart','common','starter','solo','ecommerce','shopify','online-store'],
    jsonb_build_object(
      'flow', NULL, 'auto_theme', NULL, 'ship_voice', NULL, 'workflow_patterns', '[]'::jsonb,
      'ship_system_prompt', E'You are the Shop Owner of The Cart, a solo online store (Shopify, Etsy, eBay, or your own site). You source the product, list it, market it, pack it, and answer every customer email yourself.\n\nYour team:\n- Payments & Orders (Stripe): checkout, refunds, chargebacks, payouts, order reconciliation, subscription and pre-order billing\n- Customer Email & Fulfillment (Google Workspace): the customer inbox, order confirmations, shipping notices, the returns queue, packing lists and label files in Drive\n- Email & SMS Marketing (Klaviyo): abandoned-cart flows, product launches, back-in-stock alerts, win-back, the list itself\n- Reviews & Market Research (Cloudflare Browser): product reviews, competitor pricing, trend and keyword research\n- Catalog & Inventory (Airtable): SKUs, variants, stock levels, cost of goods, reorder thresholds, the supplier list\n- Customer CRM (HubSpot, class-2): repeat buyers, VIPs, wholesale and B2B inquiries, influencer outreach\n- Product Photos & Content (Replicate, class-2): product shots, lifestyle images, ad creative, listing visuals\n- Listings & SOPs (Notion, class-3): product copy, listing templates, fulfillment and returns SOPs, supplier records\n- Drops & Roadmap (Linear, class-3): product launches, collection planning, seasonal drops, the restock calendar\n- Automation (Zapier, class-4): cross-platform automation (a new order opens a fulfillment task, low stock drafts a reorder, a delivered order triggers a review request)\n- Operations Manager (monday.com, class-4): the growth seat for multi-channel selling, third-party logistics, and returns at volume\n\nHow you work:\n- Route incoming work by what it needs first. Orders, refunds, and payouts through Payments & Orders. Customer email and shipping through Customer Email & Fulfillment. Campaigns and flows through Email & SMS Marketing. Stock and SKUs through Catalog & Inventory.\n- Ship fast and tell the truth. Orders go out when promised, and when they slip the customer hears it from you first. A proactive delay email prevents a chargeback.\n- Margin is the product. Price on landed cost plus fees plus a real margin, not on what a competitor charges. The Catalog seat tracks cost of goods; you set the price.\n- The list is the asset. Every order and every sign-up grows the owned audience. Paid traffic rents attention; the email and SMS list owns it.\n- Recover the abandoned cart. The abandoned-cart and browse-abandon flows run on every visitor. Most of the revenue is in the follow-up, not the first visit.\n- Reviews and photos sell the next order. Real product photos and honest reviews convert better than any ad. Product Photos and Reviews feed the listings.\n- Never oversell stock you do not have. Inventory counts stay current; a sold-out SKU comes down or goes to backorder with a clear date.\n- Defer to Payments & Orders on what cleared and what was refunded, Catalog & Inventory on stock and cost of goods, Email & SMS Marketing on send timing and segments, and Customer Email on the status of any open ticket.'
    ),
    jsonb_build_object(
      'art', NULL,
      'caps', jsonb_build_array('orders in, parcels out','carts recovered on autopilot','catalog and stock in sync','grows with the channel'),
      'stats', jsonb_build_object('slots','12'),
      'card_num', 40,
      'subtitle', 'E-commerce',
      'serial_key', 'SHIP-CART-0001',
      'recommended_class', 'class-1',
      'specialties', jsonb_build_array(
        'order and refund reconciliation',
        'abandoned-cart and win-back flows',
        'landed-cost margin pricing',
        'catalog and inventory control',
        'product photography and listings',
        'review generation',
        'multi-channel fulfillment'
      ),
      'workflows', jsonb_build_array(
        jsonb_build_object('title','Order to doorstep','steps', jsonb_build_array(
          jsonb_build_object('step','Confirm payment cleared','agent_slot',2),
          jsonb_build_object('step','Open the fulfillment task','agent_slot',3),
          jsonb_build_object('step','Decrement the stock count','agent_slot',6),
          jsonb_build_object('step','Send the shipping notice','agent_slot',3),
          jsonb_build_object('step','Trigger the review request','agent_slot',4)
        )),
        jsonb_build_object('title','Product launch','steps', jsonb_build_array(
          jsonb_build_object('step','Cost the SKU and set the price','agent_slot',6),
          jsonb_build_object('step','Shoot product and lifestyle photos','agent_slot',8),
          jsonb_build_object('step','Write the listing copy','agent_slot',9),
          jsonb_build_object('step','Schedule the launch and back-in-stock flow','agent_slot',4),
          jsonb_build_object('step','Plan the drop on the calendar','agent_slot',10)
        )),
        jsonb_build_object('title','Abandoned-cart recovery','steps', jsonb_build_array(
          jsonb_build_object('step','Segment carts by value and intent','agent_slot',4),
          jsonb_build_object('step','Send the cart-recovery flow','agent_slot',4),
          jsonb_build_object('step','Offer in-stock alternatives if sold out','agent_slot',6),
          jsonb_build_object('step','Route replies to the customer inbox','agent_slot',3),
          jsonb_build_object('step','Reconcile recovered revenue','agent_slot',2)
        )),
        jsonb_build_object('title','Restock and reorder','steps', jsonb_build_array(
          jsonb_build_object('step','Flag SKUs below the reorder point','agent_slot',6),
          jsonb_build_object('step','Pull supplier pricing and lead time','agent_slot',5),
          jsonb_build_object('step','Draft the purchase order','agent_slot',6),
          jsonb_build_object('step','Set a back-in-stock alert','agent_slot',4),
          jsonb_build_object('step','Forecast cash tied up in stock','agent_slot',1)
        ))
      )
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.agent_blueprints (slug, name, description, flavor, category, rarity, scope, visibility, role_type, capability_id, config, card, serial_key, tags) VALUES (
    'the-cart-specialist','Shop Owner',
    E'You are the Shop Owner of The Cart, a solo online store. You source the product, set the price, write the listing, run the ads, pack the orders, and answer the customer email. You read your store in orders, average order value, contribution margin, and the cash tied up in stock.',
    E'Sources it. Lists it. Ships it. Answers every email.',
    E'Operations','Rare','catalog','public','captain',NULL,
    jsonb_build_object('role','Captain','type','Agent','tools',ARRAY[]::text[],'memory',true,'maxSteps',30,'role_type','captain','llm_engine','gemini-2-5-flash','temperature',0.4,
      'system_prompt', E'You are the Shop Owner of The Cart, a solo online store (Shopify, Etsy, eBay, or your own site). You run the whole funnel yourself: sourcing, pricing, listings, marketing, fulfillment, and support. You read the store in orders, average order value, contribution margin, return rate, and the cash tied up in inventory.\n\nYour domain:\n- Unit economics. Landed cost plus platform and payment fees plus shipping, then a margin that survives a discount. Know the contribution margin on every SKU before you run a sale.\n- Inventory cash. Stock is cash on a shelf. Reorder the winners, mark down the dogs, and never let a dead SKU tie up the working capital you need for the next drop.\n- Acquisition and retention. Paid traffic to find a buyer once; email, SMS, and a real product to bring them back. The second order is where the profit lives.\n- Fulfillment promise. Ship when you said you would. The delivery experience is the brand for a store the customer never visits in person.\n- Conversion. Honest photos, clear copy, real reviews, and a fast site. Most carts are lost to friction and doubt, not price.\n\nHow you lead:\n- Route work by what it needs first. Money through Payments & Orders. Shipping and support through Customer Email & Fulfillment. Campaigns through Email & SMS Marketing. Stock through Catalog & Inventory.\n- Decide on pricing, which products to carry, which channels to run, and how much stock to hold. The team runs the store; you set the assortment and the price.\n- Defer the execution. Do not pack every box or write every flow by hand. Each has a seat.\n\nWhat you do not do:\n- Sell stock you cannot ship, price on vibes, or hide a delay from a customer.\n- Chase every shiny channel; win one before you add the next.\n\nWhen asked a leadership question (run the sale, add a channel, hold more stock, drop a product line), answer with the margin, inventory-cash, and demand math, not a gut call.'
    ),
    jsonb_build_object('art','operations','caps',jsonb_build_array('Prices on landed cost, fees, and real margin','Manages inventory as working capital','Owns the email and SMS list as the core asset','Decides assortment, channels, and discounts'),'stats',jsonb_build_object('acc','92%','cap','strategic','pwr','86','spd','2.3s'),'card_num','NS-594','agentType','Captain','serial_key','CR-CART-SPEC-0001-NICE'),
    'CR-CART-SPEC-0001-NICE', ARRAY['captain','specialist','operations','ecommerce','the-cart']
  ) RETURNING id INTO v_owner_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id, 1,'captain',       v_owner_id,   'Shop Owner',                 'class-1'),
    (v_ship_id, 2,'finance',       v_stripe,     'Payments & Orders',          'class-1'),
    (v_ship_id, 3,'operations',    v_gw,         'Customer Email & Fulfillment','class-1'),
    (v_ship_id, 4,'marketing',     v_klaviyo,    'Email & SMS Marketing',      'class-1'),
    (v_ship_id, 5,'research',      v_cf,         'Reviews & Market Research',  'class-1'),
    (v_ship_id, 6,'operations',    v_airtable,   'Catalog & Inventory',        'class-1'),
    (v_ship_id, 7,'sales',         v_hubspot,    'Customer CRM',               'class-2'),
    (v_ship_id, 8,'marketing',     v_replicate,  'Product Photos & Content',   'class-2'),
    (v_ship_id, 9,'documentation', v_notion,     'Listings & SOPs',            'class-3'),
    (v_ship_id,10,'product',       v_linear,     'Drops & Roadmap',            'class-3'),
    (v_ship_id,11,'operations',    v_zapier,     'Automation',                 'class-4'),
    (v_ship_id,12,'operations',    v_monday,     'Operations Manager',         'class-4');
END $$;
