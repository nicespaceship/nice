-- Rename the product to Longeron in seeded catalog and persona content.
--
-- The app and marketing site were renamed on the client side; this brings
-- the live content the seeds created into line. Explicit phrase
-- replacements only, so nothing else in the JSONB payloads can shift.
--
-- Deliberately untouched:
--   * NICE SPACESHIP           — the studio name stays.
--   * NICE Pro                 — the plan name stays (billing SSOT).
--   * card serial_key suffixes — "-NICE" serials are collectible
--     identifiers on shipped cards, not prose.
--   * community-scope rows     — user-authored content is not ours to edit.
--
-- Dry-run verified 2026-08-31 against prod inside BEGIN/ROLLBACK: after
-- these updates, zero rows match \mNICE\M outside the exclusions above.
-- Note for reviewers reading only the seed files: the 2026-04-22 persona
-- seed's "I'm NICE, your AI mission control" greeting no longer exists in
-- prod — later persona updates rewrote it (the active default-theme row
-- greets as CORE today), so the phrase set here is complete against the
-- live rows.

-- Replicate agent: description + system prompt reference the product by name.
UPDATE agent_blueprints
SET description = replace(replace(description,
      'not NICE.', 'not Longeron.'),
      'than NICE''s built-in', 'than Longeron''s built-in'),
    config = replace(replace(replace(config::text,
      'NOT to NICE.', 'NOT to Longeron.'),
      'NICE has its own built-in', 'Longeron has its own built-in'),
      'not NICE''s)', 'not Longeron''s)')::jsonb
WHERE slug = 'replicate' AND scope = 'catalog';

-- Zapier agent: the write-refusal copy points users at platform umbrellas.
UPDATE agent_blueprints
SET config = replace(config::text, 'a NICE umbrella', 'a Longeron umbrella')::jsonb
WHERE slug = 'zapier' AND scope = 'catalog';

-- The Arbiter (community reviewer): its prompt names the moderator pipeline
-- and the policy document.
UPDATE agent_blueprints
SET config = replace(replace(config::text,
      'the NICE Community Moderator', 'the Longeron Community Moderator'),
      'the NICE Community Policy', 'the Longeron Community Policy')::jsonb
WHERE slug = 'community-moderator-arbiter' AND scope = 'system';

-- Capabilities row mirroring the Replicate description.
UPDATE capabilities
SET description = replace(replace(description,
      'not NICE.', 'not Longeron.'),
      'than NICE''s built-in', 'than Longeron''s built-in')
WHERE slug = 'replicate' AND description ~ '\mNICE\M';

-- Personas: every theme persona is written "aboard NICE Spaceship" (the
-- vessel is the product), and the default persona translates business
-- needs "into NICE terms". Both read as Longeron now.
UPDATE personas
SET data               = replace(replace(data::text, 'NICE Spaceship', 'Longeron'), 'NICE terms', 'Longeron terms')::jsonb,
    voice              = replace(replace(voice::text, 'NICE Spaceship', 'Longeron'), 'NICE terms', 'Longeron terms')::jsonb,
    hard_rules         = replace(replace(hard_rules::text, 'NICE Spaceship', 'Longeron'), 'NICE terms', 'Longeron terms')::jsonb,
    soft_rules         = replace(replace(soft_rules::text, 'NICE Spaceship', 'Longeron'), 'NICE terms', 'Longeron terms')::jsonb,
    lexicon            = replace(replace(lexicon::text, 'NICE Spaceship', 'Longeron'), 'NICE terms', 'Longeron terms')::jsonb,
    forbidden_patterns = replace(replace(forbidden_patterns::text, 'NICE Spaceship', 'Longeron'), 'NICE terms', 'Longeron terms')::jsonb
WHERE to_jsonb(personas)::text ~ 'NICE Spaceship|NICE terms';
