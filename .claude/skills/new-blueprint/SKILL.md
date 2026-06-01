---
name: new-blueprint
description: Add a new spaceship or agent blueprint to the catalog. Use when the user wants to create a new pre-built blueprint card for the catalog library.
user-invocable: true
---

# Add a New Catalog Blueprint

Catalog content lives in **normalized Supabase tables**, seeded via **SQL migrations through CI**. There is no client-side `SEED` array anymore (the old jsonb `blueprints` table was dropped in #604). Schema SSOT: [`docs/three-layer-schema.md`](../../../docs/three-layer-schema.md).

| Table | Holds |
|-------|-------|
| `spaceship_blueprints` | the ship: identity, `config.ship_system_prompt`, `card` presentation |
| `agent_blueprints` | a crew member / captain: identity, `role_type`, `config.system_prompt`, `card` |
| `ship_slots` | one row per crew slot: which agent fills it, its label, its unlock class |
| `roles` | fixed `role_type` vocabulary (FK target) |
| `capabilities` | the wired-MCP function layer agents wrap (seeded with integrations, not here) |

**Authoring a ship = one seed migration** that inserts one `spaceship_blueprints` row, one bespoke captain `agent_blueprints` row, and twelve `ship_slots` rows. Tool-wielding crew slots **reuse existing umbrella capability agents** (HubSpot, Stripe, etc.) by `default_agent_id`; they are not re-authored per ship.

All user-facing strings follow the **Blueprint Copy Standards** in [`CLAUDE.md`](../../../CLAUDE.md): active voice, no em-dashes, "spaceship" never "ship".

## Workflow (migrations flow through CI only)

1. Pick the next timestamp: `ls -t supabase/migrations | head -1`, then name the file
   `supabase/migrations/<YYYYMMDDHHMMSS>_seed_<slug>_<rarity>.sql` with a timestamp strictly greater than the latest.
2. Write the migration (skeleton below).
3. **Dry-run** against the live DB with the sanctioned rollback pattern (never `apply_migration` on a committed migration, it desyncs `schema_migrations`):
   ```sql
   BEGIN;
   -- paste the DO $$ ... END $$ block
   SELECT slug, name, rarity FROM public.spaceship_blueprints WHERE slug = '<slug>';
   SELECT slot_position, role_type, label, min_class FROM public.ship_slots
     WHERE spaceship_id = (SELECT id FROM public.spaceship_blueprints WHERE slug='<slug>') ORDER BY slot_position;
   ROLLBACK;
   ```
   Run via Supabase MCP `execute_sql` on project `zacllshbgmnwsmliteqx`.
4. Commit (founder voice, imperative, < 72 chars, **no AI attribution**), push, open a PR.
5. On merge to main the `supabase-migrate` GitHub Action applies it. Watch the run, then verify live.
6. To see it in the app, clear the `nice-bp-catalog-v19` localStorage key to force a fresh catalog fetch.

## Rarity gate (apply before assigning a tier)

Each tier has a distinct purpose, locked in [`CLAUDE.md`](../../../CLAUDE.md) (XP Progression System):

- **Common** — real-business **single-operator** starter (The Galley, The Salon). Day-one reachable.
- **Rare** — real-business **small-team** vertical (The Loft, The Brokerage). Day-one reachable.
- **Epic** — real-world company examples (NVIDIA, Stripe) + the Founder's Office. Commander rank (100K XP).
- **Legendary** — sci-fi IP for aspiration (Enterprise, Serenity). Captain rank (200K XP) or Pro.
- **Mythic** — apex sci-fi IP. Bespoke crew with their own `agent_blueprints` rows + `<slug>-exclusive` tags. Admiral milestone only.

## Slot model

Every ship defines **12 `ship_slots`**; slot 1 is the captain. `min_class` gates when each slot unlocks as the operator ranks up, and must follow the slot-count ladder:

| Slots | `min_class` | Unlocks at |
|-------|-------------|------------|
| 1–6   | `class-1`   | Ensign (day one) |
| 7–8   | `class-2`   | Lieutenant |
| 9–10  | `class-3`   | Commander |
| 11–12 | `class-4`   | Captain |

`role_type` on each slot (and on the captain) is a FK to `roles.slug`. Valid values:
`captain`, `sales`, `marketing`, `communications`, `engineering`, `product`, `operations`,
`finance`, `analytics`, `design`, `legal`, `security`, `people`, `research`, `documentation`,
`support`, `customer_success`, `moderation`. A slot's `role_type` is what mission dispatch matches on; its `label` is the ship-specific reskin name shown on the card.

## Reusable umbrella capability agents (for tool-wielding crew)

Resolve these by slug into a slot's `default_agent_id`; each wraps a wired MCP. Choose the slot's `role_type` from the vocabulary above and give it a ship-specific `label` (the agent's own stored `role_type` is just a default a slot can override).

| slug | wraps |
|------|-------|
| `google-workspace` | Gmail / Calendar / Drive |
| `microsoft-365` | Outlook / SharePoint |
| `hubspot` | CRM |
| `stripe` | payments |
| `klaviyo` | email marketing |
| `slack` | team messaging |
| `notion` | docs / wiki |
| `linear` | issue tracking |
| `monday` | project management |
| `airtable` | databases |
| `zapier` | cross-app automation |
| `github` | code / repos |
| `atlassian` | Jira / Confluence |
| `sentry` | error monitoring |
| `cf-browser` | web research / browsing |
| `cf-observability` | infra telemetry |
| `replicate` | image / media generation |
| `miro` | whiteboard / diagrams |

> Verify the live roster before relying on it: `SELECT slug, name, role_type FROM public.agent_blueprints WHERE scope='catalog' AND capability_id IS NOT NULL ORDER BY slug;`

## Ship seed skeleton

The fastest correct path is to **copy the most recent seed of the same rarity** and adapt it. Common single-operator: [`20260711000000_seed_the_care_common.sql`](../../../supabase/migrations/20260711000000_seed_the_care_common.sql). Rare small-team: [`20260715000000_seed_the_agency_rare.sql`](../../../supabase/migrations/20260715000000_seed_the_agency_rare.sql). Structure:

```sql
-- Seed <Name> as a <Rarity>-tier <single-operator|small-team> starter spaceship.
DO $$
DECLARE
  v_ship_id  uuid;
  v_owner_id uuid;
  v_hubspot uuid; v_stripe uuid; v_monday uuid; /* …one var per umbrella crew capability… */
BEGIN
  IF EXISTS (SELECT 1 FROM public.spaceship_blueprints WHERE slug = '<slug>') THEN
    RAISE NOTICE '<Name> already seeded, skipping'; RETURN;
  END IF;

  SELECT id INTO v_hubspot FROM public.agent_blueprints WHERE slug='hubspot';
  SELECT id INTO v_stripe  FROM public.agent_blueprints WHERE slug='stripe';
  SELECT id INTO v_monday  FROM public.agent_blueprints WHERE slug='monday';
  -- …resolve every umbrella capability you slot…

  INSERT INTO public.spaceship_blueprints (
    slug, name, description, flavor, category, rarity, scope, visibility, serial_key, tags, config, card
  ) VALUES (
    '<slug>', '<Name>',
    E'<description: what the business is and that it grows as you rank up>',
    E'<flavor: one short line>',
    E'<Category>', '<Common|Rare|Epic|Legendary|Mythic>', 'catalog', 'public',
    'SHIP-XXXX-0001',
    ARRAY['<slug>','<rarity>','<vertical>','…'],
    jsonb_build_object(
      'flow', NULL, 'auto_theme', NULL, 'ship_voice', NULL, 'workflow_patterns', '[]'::jsonb,
      'ship_system_prompt', E'<orchestrator prompt: the crew roster + how the captain routes work>'
    ),
    jsonb_build_object(
      'art', NULL,
      'caps', jsonb_build_array('<cap1>','<cap2>','<cap3>','<cap4>'),
      'stats', jsonb_build_object('slots','12'),
      'card_num', <next integer>,
      'subtitle', '<Category>',
      'serial_key', 'SHIP-XXXX-0001',
      'recommended_class', 'class-1',
      'specialties', jsonb_build_array('…'),
      'workflows', jsonb_build_array(
        jsonb_build_object('title','<flow>','steps', jsonb_build_array(
          jsonb_build_object('step','<step>','agent_slot', <slot#>) ))
      )
    )
  ) RETURNING id INTO v_ship_id;

  INSERT INTO public.agent_blueprints (
    slug, name, description, flavor, category, rarity, scope, visibility, role_type, capability_id, config, card, serial_key, tags
  ) VALUES (
    '<slug>-specialist', '<Captain title, e.g. Owner / Founder>',
    E'<who the captain is>', E'<flavor line>',
    E'Operations', '<Rarity>', 'catalog', 'public', 'captain', NULL,
    jsonb_build_object('role','Captain','type','Agent','tools',ARRAY[]::text[],'memory',true,
      'maxSteps',30,'role_type','captain','llm_engine','gemini-2-5-flash','temperature',0.4,
      'system_prompt', E'<captain persona: domain, how they lead, what they do not do>'),
    jsonb_build_object('art','operations','caps',jsonb_build_array('…'),
      'stats',jsonb_build_object('acc','93%','cap','strategic','pwr','84','spd','2.4s'),
      'card_num','NS-XXX','agentType','Captain','serial_key','CR-XXXX-SPEC-0001-NICE'),
    'CR-XXXX-SPEC-0001-NICE', ARRAY['captain','specialist','operations','<vertical>','<slug>']
  ) RETURNING id INTO v_owner_id;

  INSERT INTO public.ship_slots (spaceship_id, slot_position, role_type, default_agent_id, label, min_class) VALUES
    (v_ship_id, 1,'captain', v_owner_id, '<Captain label>', 'class-1'),
    (v_ship_id, 2,'sales',   v_hubspot,  '<reskin label>',  'class-1'),
    -- …slots 3–6 class-1, 7–8 class-2, 9–10 class-3, 11–12 class-4…
    (v_ship_id,12,'operations', v_monday, '<reskin label>', 'class-4');
END $$;
```

### Conventions

- **Serial keys** — ship: `SHIP-<4LETTER>-0001`; captain: `CR-<4LETTER>-SPEC-0001-NICE`. Mirror the ship key in `card.serial_key`.
- **card_num** — ship: next sequential **integer** (`SELECT max((card->>'card_num')::int) FROM public.spaceship_blueprints WHERE card ? 'card_num';`). Agent: string `NS-XXX`.
- **`E'…'` strings** — use the `E''` form so apostrophes escape as `''` and copy reads naturally. No em-dashes.
- **`recommended_class`** — matches the rarity's unlock rank (`class-1` Common/Rare, `class-3` Epic, `class-4` Legendary).

## Named-crew ships (Epic real CEOs, sci-fi, Mythic)

When crew are **named characters** (Jensen Huang, Captain Kirk, Trinity) rather than umbrella reskins, also give each slot a **title**:

- `ship_slots.title = '<Position> · <Ship short name>'` (e.g. `'Navigator · USS Enterprise'`).
- Bespoke crew (their own `agent_blueprints` row): also set `config.title` —
  `config = jsonb_set(config, '{title}', to_jsonb('<title>'::text))`. The `::text` cast is required or you get SQLSTATE 42804.
- Mythic crew must be **bespoke** (own row, own LLM/voice/rarity) and tagged `<slug>-exclusive` so they are filtered out of every other ship's slot dropdown.

Umbrella-reskin starters (Common/Rare) do **not** get titles; their `label` already is the role.

## Add a standalone agent blueprint

To add a crew agent that is **not** a ship captain (a bespoke specialist, or a new umbrella capability agent), insert one `agent_blueprints` row with the same column list as above:

- Set `role_type` to a valid `roles.slug`.
- `capability_id` = `NULL` for a pure-persona / tool-less agent. For a tool-wielding agent it points at a `capabilities` row. **New wired-MCP capability agents are part of integration wiring** (capabilities row + edge function + gateway), not a blueprint-authoring task; do that through the remote-MCP integration pattern, not this skill.
- Give it `config.system_prompt`, `card.stats`, `card.caps[]`, a `serial_key`, and `tags[]`.

## After adding

1. Confirm the migration is idempotent (the `IF EXISTS … RETURN` guard) and the dry-run counts match.
2. After CI applies it: `SELECT scope, rarity, COUNT(*) FROM public.spaceship_blueprints GROUP BY scope, rarity;` to confirm the row landed.
3. Verify the card renders in the Bridge → Blueprints catalog (clear `nice-bp-catalog-v19` first).
4. Update any catalog counts in `CLAUDE.md` if the addition is significant.
