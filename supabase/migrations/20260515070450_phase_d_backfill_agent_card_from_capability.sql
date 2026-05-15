-- Backfill agent_blueprints.card from the matching capability's card
-- for the 20 wired-MCP umbrella agents migrated in 20260515064211.
-- Phase D.1 ran before this discovery: legacy blueprints.config.card was
-- null for the 20 umbrellas (verified pre-migration), so the D.1
-- INSERT left agent_blueprints.card = {}. The capability seed (Phase A)
-- DID populate cap.card with stats / caps / art / card_num / serial_key,
-- and after D.1 every umbrella agent links 1:1 to a capability by slug.
-- Copy that card across so the catalog browse shows full stats again.

UPDATE public.agent_blueprints ab
SET    card = c.card,
       updated_at = now()
FROM   public.capabilities c
WHERE  ab.capability_id = c.id
  AND  ab.scope = 'catalog'
  AND  (ab.card IS NULL OR ab.card = '{}'::jsonb);
