-- Hand-author crew_overrides for 8 flagship spaceship blueprints.
-- The CrewMatcher (shipped in PR #308) reads these from blueprint.config
-- at activation time and pins specific iconic agents to specific slot
-- indices. Slots beyond the override list fall through to the matcher's
-- rarity-aware fallback (so e.g. Death Star's 24 slots fill with the
-- highest-rarity unused agents after the 6 named officers).
--
-- All overrides reference catalog agent IDs (verified existence at
-- migration authoring time, 2026-04-27 03:50 UTC). Uses jsonb_set so
-- existing config keys (none today, but defensively) are preserved.

UPDATE blueprints
SET config = jsonb_set(COALESCE(config, '{}'::jsonb), '{crew_overrides}', $$
{
  "0": "bp-agent-250",
  "1": "bp-agent-251",
  "2": "bp-agent-254",
  "3": "bp-agent-255",
  "4": "bp-agent-253",
  "5": "bp-agent-256",
  "6": "bp-agent-252",
  "7": "bp-agent-257"
}
$$::jsonb)
WHERE id = 'ship-47' AND type = 'spaceship' AND scope = 'catalog';
-- USS Enterprise NCC-1701-D: Picard / Riker / Data / La Forge / Worf /
-- Beverly Crusher / Troi / Wesley Crusher

UPDATE blueprints
SET config = jsonb_set(COALESCE(config, '{}'::jsonb), '{crew_overrides}', $$
{
  "0": "bp-agent-541",
  "1": "bp-agent-542",
  "2": "bp-agent-543",
  "3": "bp-agent-546",
  "4": "bp-agent-545",
  "5": "bp-agent-547"
}
$$::jsonb)
WHERE id = 'ship-54' AND type = 'spaceship' AND scope = 'catalog';
-- USS Enterprise NCC-1701-A: Kirk / Spock / McCoy / Sulu / Uhura / Chekov

UPDATE blueprints
SET config = jsonb_set(COALESCE(config, '{}'::jsonb), '{crew_overrides}', $$
{
  "0": "bp-agent-273",
  "1": "bp-agent-279",
  "2": "bp-agent-275",
  "3": "bp-agent-276",
  "4": "bp-agent-274",
  "5": "bp-agent-277",
  "6": "bp-agent-281",
  "7": "bp-agent-282"
}
$$::jsonb)
WHERE id = 'ship-52' AND type = 'spaceship' AND scope = 'catalog';
-- Battlestar Galactica: Adama / Tigh / Starbuck / Apollo / Roslin /
-- Baltar / Helo / Athena

UPDATE blueprints
SET config = jsonb_set(COALESCE(config, '{}'::jsonb), '{crew_overrides}', $$
{
  "0": "matrix-morpheus",
  "1": "matrix-neo",
  "2": "matrix-trinity",
  "3": "bp-agent-371",
  "4": "bp-agent-374",
  "5": "bp-agent-373",
  "6": "bp-agent-372",
  "7": "bp-agent-330"
}
$$::jsonb)
WHERE id = 'the-matrix' AND type = 'spaceship' AND scope = 'catalog';
-- The Matrix: Morpheus / Neo / Trinity (custom matrix-* IDs seeded for
-- this ship) / Tank / Cypher / Apoc / Switch / Smith

UPDATE blueprints
SET config = jsonb_set(COALESCE(config, '{}'::jsonb), '{crew_overrides}', $$
{
  "0": "bp-agent-369",
  "1": "bp-agent-368",
  "2": "bp-agent-370",
  "3": "bp-agent-371",
  "4": "bp-agent-374",
  "5": "bp-agent-373",
  "6": "bp-agent-372"
}
$$::jsonb)
WHERE id = 'ship-71' AND type = 'spaceship' AND scope = 'catalog';
-- Nebuchadnezzar: Morpheus / Neo / Trinity / Tank / Cypher / Apoc /
-- Switch (uses bp-agent-* duplicates of the matrix crew)

UPDATE blueprints
SET config = jsonb_set(COALESCE(config, '{}'::jsonb), '{crew_overrides}', $$
{
  "0": "bp-agent-376",
  "1": "bp-agent-377",
  "2": "bp-agent-378",
  "3": "bp-agent-379",
  "4": "bp-agent-380",
  "5": "bp-agent-381",
  "6": "bp-agent-384",
  "7": "bp-agent-387",
  "8": "bp-agent-386",
  "9": "bp-agent-385"
}
$$::jsonb)
WHERE id = 'ship-63' AND type = 'spaceship' AND scope = 'catalog';
-- Normandy SR-2: Shepard / Garrus / Tali / Liara / Wrex / Mordin /
-- Thane / Legion / Miranda / Jack

UPDATE blueprints
SET config = jsonb_set(COALESCE(config, '{}'::jsonb), '{crew_overrides}', $$
{
  "0": "bp-agent-347",
  "1": "bp-agent-348",
  "2": "bp-agent-351",
  "3": "bp-agent-349",
  "4": "bp-agent-352",
  "5": "bp-agent-353"
}
$$::jsonb)
WHERE id = 'ship-60' AND type = 'spaceship' AND scope = 'catalog';
-- Millennium Falcon: Han Solo / Chewbacca / Luke / Lando / C-3PO / R2-D2

UPDATE blueprints
SET config = jsonb_set(COALESCE(config, '{}'::jsonb), '{crew_overrides}', $$
{
  "0": "bp-agent-435",
  "1": "bp-agent-436",
  "2": "bp-agent-438",
  "3": "bp-agent-437",
  "4": "bp-agent-439",
  "5": "bp-agent-441",
  "6": "bp-agent-440"
}
$$::jsonb)
WHERE id = 'ship-66' AND type = 'spaceship' AND scope = 'catalog';
-- Serenity: Zoe / Wash / Jayne / Kaylee / Inara / River / Book
