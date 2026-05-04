-- Purge legacy Common-rarity catalog blueprints (clean-slate reset).
--
-- Context (2026-05-04 session): the Common-rarity tier of the catalog
-- accumulated ~150 generic advisory-text agents and ~195 placeholder
-- spaceships over earlier seed waves. None had real MCP wiring; their
-- "tools" were abstract capability labels (e.g. "Calendar Sync",
-- "File Classifier") rather than actual tool names. As MCPs are now
-- being added methodically — one provider at a time, each backed by a
-- real read-focused agent that wraps the live tool surface — the
-- legacy Commons no longer represent the quality bar we want users to
-- see. Rebuild the Common tier from a clean slate as each MCP ships.
--
-- Carveouts (the only Common-rarity catalog blueprints kept):
--   * bp-agent-hubspot          — HubSpot Agent, shipped #376
--   * bp-agent-google-workspace — Google Workspace Agent, this PR
--   * bp-agent-microsoft-365    — Microsoft 365 Agent, this PR
--
-- Also caught by this migration (deleted in-session before this file
-- was drafted, but included here so a fresh DB rebuild reproduces the
-- cleaned state):
--   * 47 "X Expert" advisory agents (Slack Expert, GitHub Expert,
--     HubSpot Expert, etc.). Per-service placeholder agents whose
--     "tools" were abstract labels — same quality issue as the
--     broader Common purge.
--
-- Blast radius (verified pre-execution):
--   * 0 active user_agents instances on Common catalog agents
--   * 6 active user_spaceships instances on 2 Common ships
--     (fleet-193 "3D Printing Service Bureau" — 5 instances,
--      fleet-180 "Advertising Agency" — 1 instance). Approved by
--     Benjamin to delete; user_spaceships rows survive (no FK CASCADE),
--     but the source blueprint is gone.
--
-- Known follow-up (3 dangling crew refs, not load-bearing):
--   * ship-71 Nebuchadnezzar (Epic) → bp-agent-36 Video Sales Agent
--   * ship-52 Battlestar Galactica (Legendary) → bp-agent-28 Tactical Content Agent
--   * ship-63 Normandy SR-2 (Legendary) → bp-agent-38 Race Marketing Agent
--   These were auto-populate artifacts from pickBestUnused, not
--   themed crew picks. Per the "Enterprise gets MCP-skinned crew"
--   plan, these slots will be reassigned to real MCP-capable agents
--   in a follow-up PR.

BEGIN;

DELETE FROM public.blueprints
WHERE scope = 'catalog'
  AND rarity = 'Common'
  AND id NOT IN (
    'bp-agent-hubspot',
    'bp-agent-google-workspace',
    'bp-agent-microsoft-365'
  );

-- Catch any "X Expert" advisory agents at any rarity. Idempotent —
-- already deleted in-session 2026-05-04, this clause keeps a fresh
-- rebuild aligned with the cleaned prod state.
DELETE FROM public.blueprints
WHERE scope = 'catalog'
  AND type = 'agent'
  AND name ~* 'Expert\s*$';

COMMIT;
