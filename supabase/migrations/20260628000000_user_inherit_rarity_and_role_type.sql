-- ═══════════════════════════════════════════════════════════════════
-- 2026-05-26 — Inherit rarity + role_type from catalog into user tables
-- ───────────────────────────────────────────────────────────────────
-- Closes the bug class fixed application-side in [3ad86e6]: every writer
-- of user_agents / user_ship_slots had to remember to thread catalog
-- rarity + role_type through to the insert payload. The wizard now does
-- so explicitly, but five other paths (community download, first-run
-- setup wizard, crew generator, resolver, guest migration) all still
-- drop the catalog metadata on the floor, leaving newly-activated agents
-- as 'Common' and slots with NULL role_type.
--
-- Centralize the inheritance at the database boundary so every writer
-- gets it for free, and the wizard's explicit propagation becomes
-- belt-and-suspenders rather than the only line of defense.
--
-- Contract — user_agents.rarity:
--   When blueprint_id is set AND rarity is NULL or 'Common' (the column
--   default), look up the catalog row's rarity. If the catalog has a
--   higher tier, promote NEW.rarity to it. Explicit non-default values
--   are left alone — the wizard's already-correct writes don't get
--   second-guessed.
--
-- Contract — user_ship_slots.role_type:
--   When role_type is NULL, look up via user_spaceships.blueprint_id →
--   ship_slots.role_type WHERE slot_position matches. If a row exists,
--   adopt it. Explicit role_type values pass through unchanged.
--
-- Both functions are SECURITY DEFINER so they read the catalog tables
-- (agent_blueprints, ship_slots) without depending on caller RLS — the
-- catalog is public read anyway, but pinning the security context here
-- makes the trigger immune to future RLS tightening on those tables.
-- search_path is locked to public + pg_temp per the standard SECURITY
-- DEFINER hardening pattern (prevents path-injection escalation).
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.inherit_user_agent_rarity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  catalog_rarity text;
BEGIN
  -- Only inherit when the caller has a catalog pointer AND didn't supply
  -- an explicit non-default rarity. This avoids overwriting the wizard's
  -- already-correct writes (which now pass 'Legendary' for Kirk, etc.).
  IF NEW.blueprint_id IS NOT NULL
     AND (NEW.rarity IS NULL OR NEW.rarity = 'Common') THEN
    SELECT rarity INTO catalog_rarity
    FROM public.agent_blueprints
    WHERE id = NEW.blueprint_id;
    IF catalog_rarity IS NOT NULL AND catalog_rarity <> 'Common' THEN
      NEW.rarity := catalog_rarity;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.inherit_user_ship_slot_role_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  catalog_role_type text;
BEGIN
  IF NEW.role_type IS NULL THEN
    SELECT ss.role_type INTO catalog_role_type
    FROM public.user_spaceships us
    JOIN public.ship_slots ss
      ON ss.spaceship_id = us.blueprint_id
     AND ss.slot_position = NEW.slot_position
    WHERE us.id = NEW.user_spaceship_id;
    IF catalog_role_type IS NOT NULL THEN
      NEW.role_type := catalog_role_type;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Idempotent re-creation: drop-if-exists so re-running the migration is
-- safe (matters for local dev resets and migration retries).
DROP TRIGGER IF EXISTS tg_user_agents_inherit_rarity ON public.user_agents;
CREATE TRIGGER tg_user_agents_inherit_rarity
  BEFORE INSERT ON public.user_agents
  FOR EACH ROW
  EXECUTE FUNCTION public.inherit_user_agent_rarity();

DROP TRIGGER IF EXISTS tg_user_ship_slots_inherit_role_type ON public.user_ship_slots;
CREATE TRIGGER tg_user_ship_slots_inherit_role_type
  BEFORE INSERT ON public.user_ship_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.inherit_user_ship_slot_role_type();

COMMENT ON FUNCTION public.inherit_user_agent_rarity IS
  'Trigger: BEFORE INSERT on user_agents. Inherits rarity from agent_blueprints when blueprint_id is set and caller passed NULL or ''Common''. Centralizes the catalog-to-user inheritance the wizard does application-side, so every other writer (community download, setup-wizard, crew-generator, guest migration) gets it for free.';

COMMENT ON FUNCTION public.inherit_user_ship_slot_role_type IS
  'Trigger: BEFORE INSERT on user_ship_slots. Fills role_type from ship_slots when caller passed NULL. Centralizes the catalog-to-user inheritance the wizard does application-side.';
