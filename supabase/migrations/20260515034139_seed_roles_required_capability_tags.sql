-- Phase B3.a — bring `roles.required_capability_tags` into alignment
-- with the hardcoded `_ROLE_REQUIRED_CAPS` map in mission-runner.js, so
-- the table becomes the SSOT for role → capability matching. Phase A
-- seeded a conservative `{}` for several roles ("no specialized
-- capability exists yet") — but the live in-code map carries richer
-- vocabulary covering email/messaging/calendar fan-out, media-gen,
-- automation, etc. The dispatcher's tag intersection is broader than
-- Phase A's seed assumed, and that's the canonical behaviour we want
-- to preserve when reads move off the hardcoded map.
--
-- All tags below are validated against the live capability_tags
-- vocabulary on `capabilities` (25 distinct tags as of this migration).
-- Two roles in the in-code map were never seeded into the table —
-- `documentation` and `support` — and are added here.

BEGIN;

UPDATE public.roles SET required_capability_tags = '{email,messaging,calendar,communications}' WHERE slug = 'communications';
UPDATE public.roles SET required_capability_tags = '{code,issues,engineering}'                 WHERE slug = 'engineering';
UPDATE public.roles SET required_capability_tags = '{pm,issues,product,docs}'                  WHERE slug = 'product';
UPDATE public.roles SET required_capability_tags = '{pm,automation,database,ops}'              WHERE slug = 'operations';
UPDATE public.roles SET required_capability_tags = '{marketing,messaging,media-gen,email}'     WHERE slug = 'marketing';
UPDATE public.roles SET required_capability_tags = '{analytics}'                               WHERE slug = 'analytics';
UPDATE public.roles SET required_capability_tags = '{design,media-gen}'                        WHERE slug = 'design';
UPDATE public.roles SET required_capability_tags = '{docs}'                                    WHERE slug = 'legal';
UPDATE public.roles SET required_capability_tags = '{observability,infrastructure}'            WHERE slug = 'security';
UPDATE public.roles SET required_capability_tags = '{messaging}'                               WHERE slug = 'people';

INSERT INTO public.roles (slug, label, tier, authority, required_capability_tags, responsibilities, sort_order) VALUES
  ('documentation', 'Documentation', 'functional', 'executes', '{docs}',         'Internal and external docs, API references, runbooks, knowledge base.', 15),
  ('support',       'Support',       'functional', 'executes', '{messaging,crm}', 'Customer support, ticket triage, response routing.',                    16)
ON CONFLICT (slug) DO NOTHING;

-- Note: `analytics` references the `analytics` capability_tag, which is
-- not currently in the live vocabulary on `capabilities` (no wired
-- analytics MCP umbrella yet). It's kept for forward-compat — when the
-- first analytics capability lands (Amplitude / BigQuery / etc.), this
-- role auto-resolves without a schema change.

COMMIT;
