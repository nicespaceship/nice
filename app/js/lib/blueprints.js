/* ═══════════════════════════════════════════════════════════════════
   NICE — Blueprint Store
   Supabase-backed blueprint catalog with client-side SEED fallback.
   Loads agents, spaceships, and fleets from the database; merges with
   seed arrays so the app works offline or before DB tables exist.

   Also serves as the **single source of truth** for blueprint activation
   state — which agents and spaceships the user has activated.
   All views should read/write activation through this module.
═══════════════════════════════════════════════════════════════════ */

const Blueprints = (() => {
  /* ── Catalog data ── */
  let _agents = [];
  let _spaceships = [];
  let _ready = false;

  /* ── Activation state (mirrors localStorage) ── */
  let _activatedAgentIds = [];
  let _activatedShipIds = [];
  let _shipState = {};   // { [shipId]: { slot_assignments, status, agent_ids } }

  /* ── Connected counts (from Supabase) ── */
  let _connectedCounts = {};  // { 'bp-agent-01': 5, 'ship-04': 12, ... }

  /* ── UUID mapping: local blueprint IDs → Supabase UUIDs ── */
  let _uuidMap = {};  // { 'bp-agent-01': 'a1b2c3d4-...', ... }

  /* ── Catalog loading state ── */
  let _catalogLoaded = false;  // true once full catalog fetched or cache used

  /* ── localStorage keys ── */
  const _KEYS = {
    agents: 'nice-bp-activated',
    ships:  'nice-bp-activated-ships',
    shipState: 'nice-ship-state',
    uuidMap: 'nice-bp-uuid-map',
    // Bumped to v6 in the 2026-05-14 Phase B2 rewire — the catalog now
    // sources from the normalized three-layer schema (`capabilities`,
    // `agent_blueprints`, `spaceship_blueprints` ⨝ `ship_slots`) rather
    // than the legacy single `blueprints` table. The cached array still
    // holds rows in the legacy shape (post-translator) so the rest of
    // the module reads it unchanged. Bumps:
    //   v4→v5 — Phase 1 catalog wipe.
    //   v5→v6 — Phase B2 rewire onto new tables.
    //   v6→v7 — Phase D translator surfaces top-level serial_key/tags/
    //           activation_count from new columns + dedupes capability
    //           rows whose agent_blueprints mirror exists.
    //   v7→v8 — Catalog default llm_engine flipped from claude-4-6-sonnet
    //           to gemini-2-5-flash (free tier). Wizard activations
    //           inherit from cached blueprints, so existing v7 caches
    //           would keep stamping new user_agents with the premium
    //           default until the cache TTL expired.
    // The diff-sync path can only add/update rows, not detect deletes,
    // so any shape or content cut requires a key bump to mass-invalidate
    // stale caches.
    catalogCache: 'nice-bp-catalog-v15',
    catalogCacheTs: 'nice-bp-catalog-v15-ts',
  };

  const _CACHE_TTL = 60 * 60 * 1000; // 1 hour

  /* ═══════════════════════════════════════════════════════════════
     Initialization
  ═══════════════════════════════════════════════════════════════ */

  async function init() {
    // Evict superseded catalog cache keys so existing users don't carry
    // ~1MB of orphaned localStorage forever. Bumped 2026-05-04 (#377).
    try { localStorage.removeItem('nice-bp-catalog-v2'); } catch {}
    try { localStorage.removeItem('nice-bp-catalog-v2-ts'); } catch {}
    try { localStorage.removeItem('nice-bp-catalog-v3'); } catch {}
    try { localStorage.removeItem('nice-bp-catalog-v3-ts'); } catch {}
    try { localStorage.removeItem('nice-bp-catalog-v4'); } catch {}
    try { localStorage.removeItem('nice-bp-catalog-v4-ts'); } catch {}
    try { localStorage.removeItem('nice-bp-catalog-v5'); } catch {}
    try { localStorage.removeItem('nice-bp-catalog-v5-ts'); } catch {}
    try { localStorage.removeItem('nice-bp-catalog-v6'); } catch {}
    try { localStorage.removeItem('nice-bp-catalog-v6-ts'); } catch {}
    try { localStorage.removeItem('nice-bp-catalog-v7'); } catch {}
    try { localStorage.removeItem('nice-bp-catalog-v7-ts'); } catch {}
    try { localStorage.removeItem('nice-bp-catalog-v8'); } catch {}
    try { localStorage.removeItem('nice-bp-catalog-v8-ts'); } catch {}
    try { localStorage.removeItem('nice-bp-catalog-v9'); } catch {}
    try { localStorage.removeItem('nice-bp-catalog-v9-ts'); } catch {}
    try { localStorage.removeItem('nice-bp-catalog-v10'); } catch {}
    try { localStorage.removeItem('nice-bp-catalog-v10-ts'); } catch {}
    try { localStorage.removeItem('nice-bp-catalog-v11'); } catch {}
    try { localStorage.removeItem('nice-bp-catalog-v11-ts'); } catch {}
    try { localStorage.removeItem('nice-bp-catalog-v12'); } catch {}
    try { localStorage.removeItem('nice-bp-catalog-v12-ts'); } catch {}
    try { localStorage.removeItem('nice-bp-catalog-v13'); } catch {}
    try { localStorage.removeItem('nice-bp-catalog-v13-ts'); } catch {}
    try { localStorage.removeItem('nice-bp-catalog-v14'); } catch {}
    try { localStorage.removeItem('nice-bp-catalog-v14-ts'); } catch {}

    _loadSeeds();
    _loadActivationState();

    // Only fetch activated blueprints on init (lazy catalog).
    // Connected counts come from blueprints.activation_count on each row;
    // mock seeds fill in for dev when the DB isn't reachable.
    try {
      if (typeof SB !== 'undefined' && SB.isReady() && SB.isOnline()) {
        await Promise.all([
          _loadActivatedFromDB(),
          _loadUserCreations(),
        ]);
      }
    } catch (e) {
      console.warn('[Blueprints] DB load failed, using seeds:', e.message);
    }

    // Single mock-count pass after all loading is done
    _seedMockCounts();

    // Resolve any __new__ agent IDs in ship states into real agents
    await _resolveNewAgents();

    // Purge stale IDs that no longer exist in catalog
    _purgeStaleIds();

    // Heal pre-resolver activations whose persistent rows still hold the
    // legacy hardcoded fakes. Fire-and-forget — DB writes don't block init,
    // and the runtime resolver in getActivatedAgents already serves a
    // correct view while writes settle.
    refreshActivatedAgentsFromCatalog().catch(err => {
      console.warn('[Blueprints] init refreshActivatedAgentsFromCatalog failed:', err.message);
    });

    // Heal legacy state drift: ships deployed via the old ShipSetupWizard
    // (pre-SSOT rewrite) used the 'bp-' + catalog_id convention for
    // _shipState keys and State.spaceships entry ids, while _activatedShipIds
    // held the plain catalog id. After the SSOT rewrite those layers share
    // one id, but existing users carry the divergence forward. This pass
    // canonicalises them on the next boot — idempotent for clean state.
    try { _reconcileShipState(); }
    catch (e) { console.warn('[Blueprints] init _reconcileShipState failed:', e.message); }

    // Sweep any agents whose parent ship was already removed — heals users
    // who already have orphans from prior deactivateShip calls that missed
    // them. `scope: 'local'` is mandatory here: State.spaceships hydrates
    // async from Supabase, so an init-time full sweep runs with an
    // incomplete view of slot assignments and has wiped real user_agents
    // rows in the past (2026-04-24 smoke session). Local-only cleanup is
    // safe because the caches rebuild from the DB on the next read.
    try { await cleanupOrphans({ scope: 'local' }); }
    catch (e) { console.warn('[Blueprints] init cleanupOrphans failed:', e.message); }

    _ready = true;

    // Fire initial State events so views pick up activation data
    _fireAgentState();
    _fireShipState();
  }

  /**
   * Reconcile every ship-state store so `State.spaceships` is authoritative
   * and the legacy caches (`_activatedShipIds`, `_shipState`) are consistent
   * derived views.
   *
   * Performs, in order:
   *
   * 1. **Migrate `'bp-' + id` prefixes.** Old wizard-deployed ships keyed
   *    `_shipState` under `'bp-' + catalogId` but `_activatedShipIds` under
   *    `catalogId`. Rename the `_shipState` key to the plain id if the plain
   *    id already exists in `_activatedShipIds`, so both stores share one
   *    canonical form. Same treatment for `State.spaceships[*].id`.
   *
   * 2. **Backfill `State.spaceships` entries for activated ships.** Any id
   *    in `_activatedShipIds` that lacks a corresponding `State.spaceships`
   *    entry gets a minimal synthesised entry from catalog data. This is
   *    the critical step — before the SSOT rewrite, activateShip could
   *    update `_activatedShipIds` without touching State, so existing users
   *    have drift to heal.
   *
   * 3. **Backfill `_activatedShipIds` from `State.spaceships`.** Any entry
   *    in `State.spaceships` whose id isn't in `_activatedShipIds` gets
   *    pushed in. Covers the inverse drift case (custom ships loaded from
   *    user_spaceships but never activated locally).
   *
   * Idempotent: running on already-canonical state is a no-op.
   */
  function _reconcileShipState() {
    if (typeof State === 'undefined') return;
    let dirty = false;

    // --- 1. Migrate 'bp-' prefix in _shipState ---
    const shipStateKeys = Object.keys(_shipState);
    for (const key of shipStateKeys) {
      if (key.startsWith('bp-')) {
        const plain = key.slice(3);
        if (!_shipState[plain] && _activatedShipIds.includes(plain)) {
          _shipState[plain] = _shipState[key];
          delete _shipState[key];
          dirty = true;
        }
      }
    }

    // --- 1b. Migrate 'bp-' prefix on State.spaceships entry ids ---
    const spaceships = State.get('spaceships') || [];
    let spaceshipsDirty = false;
    for (const ship of spaceships) {
      if (ship && typeof ship.id === 'string' && ship.id.startsWith('bp-')) {
        const plain = ship.id.slice(3);
        // Only rename if another entry with the plain id isn't already present
        const collision = spaceships.find(s => s !== ship && s.id === plain);
        if (!collision && _activatedShipIds.includes(plain)) {
          ship.id = plain;
          if (!ship.blueprint_id) ship.blueprint_id = plain;
          spaceshipsDirty = true;
        }
      }
    }

    // --- 2. Backfill State.spaceships from _activatedShipIds ---
    for (const actId of _activatedShipIds) {
      if (!actId) continue;
      const exists = spaceships.some(s => s && (
        s.id === actId || s.blueprint_id === actId ||
        s.id === 'bp-' + actId || s.blueprint_id === 'bp-' + actId ||
        (actId.startsWith('bp-') && (s.id === actId.slice(3) || s.blueprint_id === actId.slice(3)))
      ));
      if (exists) continue;
      const catalogBp = getSpaceship(actId) || getSpaceship(actId.startsWith('bp-') ? actId.slice(3) : 'bp-' + actId);
      if (!catalogBp) continue; // Custom ship without a catalog — would have a State entry from _loadUserCreations
      spaceships.push({
        id: actId,
        blueprint_id: catalogBp.id || actId,
        name: catalogBp.name || actId,
        type: 'spaceship',
        rarity: catalogBp.rarity || 'Common',
        category: catalogBp.category || '',
        description: catalogBp.description || '',
        flavor: catalogBp.flavor || '',
        tags: catalogBp.tags || [],
        stats: catalogBp.stats || {},
        metadata: catalogBp.metadata || {},
        status: _shipState[actId]?.status || 'standby',
        slot_assignments: _shipState[actId]?.slot_assignments || {},
        agent_ids: _shipState[actId]?.agent_ids || [],
        config: { slot_assignments: _shipState[actId]?.slot_assignments || {} },
        created_at: new Date().toISOString(),
      });
      spaceshipsDirty = true;
    }

    // --- 3. Backfill _activatedShipIds from State.spaceships ---
    for (const ship of spaceships) {
      if (!ship?.id) continue;
      if (!_activatedShipIds.includes(ship.id)) {
        _activatedShipIds.push(ship.id);
        dirty = true;
      }
    }

    if (dirty) { _persistShips(); _persistShipState(); }
    if (spaceshipsDirty) { State.set('spaceships', spaceships); }
  }

  function _loadSeeds() {
    if (typeof BlueprintsView !== 'undefined') {
      if (BlueprintsView.SEED) _agents = [...BlueprintsView.SEED];
      if (BlueprintsView.SPACESHIP_SEED) _spaceships = [...BlueprintsView.SPACESHIP_SEED];
    }
  }

  function _loadActivationState() {
    try { _activatedAgentIds = JSON.parse(localStorage.getItem(_KEYS.agents) || '[]'); } catch { _activatedAgentIds = []; }
    try { _activatedShipIds = JSON.parse(localStorage.getItem(_KEYS.ships) || '[]'); } catch { _activatedShipIds = []; }
    try { _shipState = JSON.parse(localStorage.getItem(_KEYS.shipState) || '{}'); } catch { _shipState = {}; }
    try { _uuidMap = JSON.parse(localStorage.getItem(_KEYS.uuidMap) || '{}'); } catch { _uuidMap = {}; }
  }

  /**
   * Convert any __new__AgentName slot assignments into real persisted agents.
   * This handles ships deployed via Auto-Fill before the persistence fix.
   */
  /**
   * Ensure all agents referenced in ship slot_assignments are activated.
   * For __new__ IDs: create real agents and update slot assignments.
   * For real IDs: just ensure they're in the activated list.
   */
  const _RESOLVER_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /**
   * Persist synthetic slot-character rows queued by `_resolveNewAgents` into
   * Supabase user_agents + user_ship_slots. Mirrors the wizard's
   * `_persistSlotAgent` pattern so a localStorage wipe doesn't strand the
   * slot reference. Mutates each queued agent's `id` to the returned UUID
   * and rewrites every in-memory reference (_activatedAgentIds, _shipState
   * slot_assignments + agent_ids) so the rest of init sees the canonical
   * id. `user_agents.blueprint_id` stays NULL by design — slot characters
   * resolve through the parent ship's crew_overrides, not their own
   * agent_blueprints row (see commit 7b61a88).
   *
   * Returns true when at least one row was created.
   */
  async function _persistResolvedSlotAgents(pending) {
    if (!_canSync()) return false;
    const userId = _getUserId();
    if (!userId) return false;
    let changed = false;
    for (const { shipId, slotIdx, agent } of pending) {
      try {
        const row = {
          user_id: userId,
          name: agent.name,
          rarity: agent.rarity || 'Common',
          status: agent.status || 'idle',
          config: agent.config || {},
        };
        const created = await SB.db('user_agents').create(row);
        if (!created || !created.id) continue;
        const oldId = agent.id;
        const newId = created.id;
        agent.id = newId;
        const aIdx = _activatedAgentIds.indexOf(oldId);
        if (aIdx !== -1) _activatedAgentIds[aIdx] = newId;
        const shipState = _shipState[shipId];
        if (shipState && shipState.slot_assignments && shipState.slot_assignments[slotIdx] === oldId) {
          shipState.slot_assignments[slotIdx] = newId;
        }
        if (shipState && Array.isArray(shipState.agent_ids)) {
          const idIdx = shipState.agent_ids.indexOf(oldId);
          if (idIdx !== -1) shipState.agent_ids[idIdx] = newId;
        }
        // bp-prefixed catalog ids don't have a user_spaceships row, so the
        // setSlot FK would 23503. UUID-keyed ships are wizard-deployed and
        // safe; _reconcileShipState eventually migrates any bp-prefixed
        // legacy keys to plain UUIDs.
        if (typeof ShipSlots !== 'undefined' && _RESOLVER_UUID_RE.test(shipId)) {
          try {
            await ShipSlots.setSlot(shipId, parseInt(slotIdx, 10), newId);
          } catch (e) {
            console.warn('[Blueprints] ShipSlots.setSlot failed for', shipId, slotIdx, ':', e.message);
          }
        }
        changed = true;
      } catch (err) {
        console.warn('[Blueprints] _resolveNewAgents user_agents create failed for', agent.name, ':', err.message);
      }
    }
    return changed;
  }

  async function _resolveNewAgents() {
    let dirty = false;
    // Signed-in users: State.agents (mirrored from user_agents) is SSOT.
    // Reading + writing nice-custom-agents for them creates a local-only
    // ghost layer that disappears on a localStorage wipe. Guests still
    // use the cache; migrateGuestState promotes on sign-in.
    const isGuest = _isGuestSession();
    const customAgents = isGuest
      ? _readLocalAgents()
      : (((typeof State !== 'undefined' ? State.get('agents') : null) || []).slice());
    const customById = new Map(customAgents.map(a => [a.id, a]));
    // {shipId, slotIdx, agent} tuples queued by the __new__ branch for
    // signed-in users — promoted to real user_agents rows after the main
    // loop so the synchronous in-memory work stays straightforward.
    const pendingPersists = [];

    for (const [shipId, state] of Object.entries(_shipState)) {
      if (!state?.slot_assignments) continue;

      const shipBpId = shipId.replace('bp-', '');
      const shipBp = _spaceships.find(s => s.id === shipBpId);
      const nodes = shipBp?.nodes || [];

      for (const [slotIdx, agentId] of Object.entries(state.slot_assignments)) {
        if (!agentId) continue;

        if (agentId.startsWith('__new__')) {
          // Create a real agent from the blueprint node
          const agentName = agentId.replace('__new__', '');
          // Reuse existing agent with same name (crew can only be on one ship)
          const existing = customAgents.find(a => a.name === agentName);
          if (existing) {
            // Remove from any other ship's slot_assignments
            for (const [otherShipId, otherState] of Object.entries(_shipState)) {
              if (otherShipId === shipId || !otherState?.slot_assignments) continue;
              for (const [otherSlot, otherId] of Object.entries(otherState.slot_assignments)) {
                if (otherId === existing.id) { otherState.slot_assignments[otherSlot] = null; dirty = true; }
              }
            }
            state.slot_assignments[slotIdx] = existing.id;
            if (Array.isArray(state.agent_ids)) {
              const aIdx = state.agent_ids.indexOf(agentId);
              if (aIdx !== -1) state.agent_ids[aIdx] = existing.id;
            }
            if (!_activatedAgentIds.includes(existing.id)) _activatedAgentIds.push(existing.id);
            dirty = true;
            continue;
          }

          const node = nodes.find(n => n.label === agentName);
          const newId = `agent-${shipBpId}-${slotIdx}`;
          const crewBpId = `${shipBpId}-crew-${slotIdx}`;
          const baseCfg = node?.config || { role: agentName, type: 'Agent', llm_engine: 'gemini-2-5-flash', tools: [] };
          const newAgent = {
            id: newId, name: agentName,
            category: node?.config?.agentRole || 'Ops',
            rarity: node?.rarity || 'Common',
            blueprint_id: crewBpId,
            config: { ...baseCfg, blueprint_id: crewBpId },
            stats: { spd: 7, acc: 8, cap: 6, pwr: 7 },
            tags: [], activated: true,
          };
          customAgents.push(newAgent);
          customById.set(newId, newAgent);
          if (!_activatedAgentIds.includes(newId)) _activatedAgentIds.push(newId);
          state.slot_assignments[slotIdx] = newId;
          if (Array.isArray(state.agent_ids)) {
            const aIdx = state.agent_ids.indexOf(agentId);
            if (aIdx !== -1) state.agent_ids[aIdx] = newId;
          }
          dirty = true;
          // Signed-in users get a real user_agents row + user_ship_slots
          // pointer so the slot survives a localStorage wipe and
          // _loadUserCreations stops synthesising __new__ next boot.
          if (!isGuest) pendingPersists.push({ shipId, slotIdx, agent: newAgent });
        } else {
          // Real ID — ensure it's activated and has agent data
          if (!_activatedAgentIds.includes(agentId)) {
            _activatedAgentIds.push(agentId);
            dirty = true;
          }
          // If agent data doesn't exist anywhere, create it from blueprint nodes
          const inSeed = _agents.find(a => a.id === agentId);
          const inCustom = customById.has(agentId);
          if (!inSeed && !inCustom && nodes.length) {
            const node = nodes[parseInt(slotIdx, 10)];
            if (node) {
              const crewBpId = `${shipBpId}-crew-${slotIdx}`;
              const baseCfg = node.config || { role: node.label, type: 'Agent', llm_engine: 'gemini-2-5-flash', tools: [] };
              const newAgent = {
                id: agentId, name: node.label,
                category: node.config?.agentRole || 'Ops',
                rarity: node.rarity || 'Common',
                blueprint_id: crewBpId,
                config: { ...baseCfg, blueprint_id: crewBpId },
                stats: { spd: 7, acc: 8, cap: 6, pwr: 7 },
                tags: [], activated: true,
              };
              customAgents.push(newAgent);
              customById.set(agentId, newAgent);
              dirty = true;
            }
          }
        }
      }
    }

    // Dedup: crew can only be on one ship — if same name appears twice,
    // keep the first, remove the duplicate from its ship and from activated list
    const seenNames = new Map(); // name → kept agent id
    const deduped = [];
    for (const a of customAgents) {
      if (seenNames.has(a.name)) {
        // Duplicate — remove from any ship slot_assignments
        for (const [sid, st] of Object.entries(_shipState)) {
          if (!st?.slot_assignments) continue;
          for (const [slot, id] of Object.entries(st.slot_assignments)) {
            if (id === a.id) { st.slot_assignments[slot] = null; }
          }
        }
        const idx = _activatedAgentIds.indexOf(a.id);
        if (idx !== -1) _activatedAgentIds.splice(idx, 1);
        dirty = true;
      } else {
        seenNames.set(a.name, a.id);
        deduped.push(a);
      }
    }
    if (deduped.length !== customAgents.length) {
      customAgents.length = 0;
      customAgents.push(...deduped);
      dirty = true;
    }

    if (dirty) {
      if (isGuest) {
        localStorage.setItem(Utils.KEYS.customAgents, JSON.stringify(customAgents));
      } else if (typeof State !== 'undefined') {
        State.set('agents', customAgents);
      }
      _persistAgents();
      _persistShipState();
    }

    if (pendingPersists.length) {
      const promoted = await _persistResolvedSlotAgents(pendingPersists);
      if (promoted) {
        // Re-fire State.agents so subscribers see the canonical UUIDs
        // (the synthetic ids on the agent objects above were mutated in
        // place by the helper). _persistAgents picks up the patched
        // _activatedAgentIds and _persistShipState picks up the patched
        // slot_assignments / agent_ids references.
        if (typeof State !== 'undefined') State.set('agents', customAgents);
        _persistAgents();
        _persistShipState();
      }
    }
  }

  function _purgeStaleIds() {
    // Only keep agents that are assigned to an active ship's slots
    const shipAssignedAgents = new Set();
    for (const [shipKey, state] of Object.entries(_shipState)) {
      const shipBpId = shipKey.replace('bp-', '');
      if (!_activatedShipIds.includes(shipBpId)) continue;
      if (state?.slot_assignments) {
        Object.values(state.slot_assignments).forEach(id => { if (id) shipAssignedAgents.add(id); });
      }
      if (state?.agent_ids) {
        state.agent_ids.forEach(id => { if (id) shipAssignedAgents.add(id); });
      }
    }
    // Include both seed catalog and user-created ships/agents from State
    const shipIds = new Set(_spaceships.map(s => s.id));
    const stateShips = (typeof State !== 'undefined' ? State.get('spaceships') : null) || [];
    stateShips.forEach(s => shipIds.add(s.id));

    const agentIds = new Set(_agents.map(a => a.id));
    const stateAgents = (typeof State !== 'undefined' ? State.get('agents') : null) || [];
    stateAgents.forEach(a => agentIds.add(a.id));

    const cleanAgents = _activatedAgentIds.filter(id => shipAssignedAgents.has(id) || agentIds.has(id));
    if (cleanAgents.length !== _activatedAgentIds.length) {
      _activatedAgentIds = cleanAgents;
      _persistAgents();
    }

    const cleanShips = _activatedShipIds.filter(id => shipIds.has(id));
    if (cleanShips.length !== _activatedShipIds.length) {
      _activatedShipIds = cleanShips;
      _persistShips();
    }

    // Prune ship state for ships that are no longer activated
    // Check both raw ID and bp- prefixed ID since custom ships use raw UUIDs
    const activeShipKeys = new Set();
    _activatedShipIds.forEach(id => { activeShipKeys.add(id); activeShipKeys.add('bp-' + id); });
    let pruned = false;
    for (const key of Object.keys(_shipState)) {
      if (!activeShipKeys.has(key)) {
        delete _shipState[key];
        pruned = true;
      }
    }
    if (pruned) _persistShipState();
  }

  /** Normalize a DB row into seed-compatible format */
  /* ═══════════════════════════════════════════════════════════════
     New-tables → legacy row-shape translators (Phase B2 rewire).

     Each fn takes one row from the normalized three-layer schema
     (`capabilities`, `agent_blueprints` ⨝ `capabilities` ⨝ `roles`,
     `spaceship_blueprints` ⨝ `ship_slots`) and returns a row in the
     legacy single-`blueprints`-table shape that `_normalizeRow` and
     every downstream consumer expects. The translation is the only
     place that knows about both shapes; the rest of the module
     consumes the legacy shape unchanged. When Phase D drops the old
     `blueprints` table, these translators stay — they become the SSOT
     for the row shape the rest of the codebase reads.
  ═══════════════════════════════════════════════════════════════ */

  function _translateCapabilityRow(cap) {
    if (!cap) return null;
    const card = cap.card || {};
    const cfg = cap.config || {};
    const llm = cfg.llm_defaults || {};
    return {
      id: cap.id,
      slug: cap.slug,
      name: cap.name,
      description: cap.description || '',
      flavor: cap.flavor || '',
      category: cap.category || '',
      rarity: cap.rarity || 'Common',
      scope: cap.scope || 'catalog',
      type: 'agent',                   // capabilities surface as Common-tier agents
      kind: 'capability',
      visibility: cap.visibility || 'public',
      is_public: cap.visibility === 'public',
      activation_count: 0,
      serial_key: card.serial_key || null,
      tags: card.tags || [],
      stats: card.stats || {},
      capability_tags: cap.capability_tags || [],
      mcp_provider: cap.mcp_provider || null,
      capability_id: cap.id,           // self-ref so umbrella resolution stays trivial
      config: {
        role: card.role || cap.category || '',
        type: 'Agent',
        tools: cap.tools || [],
        memory: llm.memory,
        maxSteps: llm.max_steps,
        role_type: card.role_type || null,
        llm_engine: llm.engine,
        temperature: llm.temperature,
        system_prompt: cfg.system_prompt || '',
      },
      metadata: {
        art: card.art || null,
        caps: card.caps || [],
        flavor: cap.flavor || '',
        card_num: card.card_num || null,
        agentType: 'Agent',
        tools_required: cap.mcp_provider ? [cap.mcp_provider] : [],
      },
      created_at: cap.created_at,
      updated_at: cap.updated_at,
    };
  }

  function _translateAgentBlueprintRow(ag) {
    if (!ag) return null;
    const card = ag.card || {};
    const agCfg = ag.config || {};
    const llm = agCfg.llm_defaults || {};
    // Joined rows (PostgREST embed): `capability` from capabilities, `role` from roles.
    const cap = ag.capability || null;
    const role = ag.role || null;
    return {
      id: ag.id,
      slug: ag.slug,
      name: ag.name,
      description: ag.description || '',
      flavor: ag.flavor || '',
      category: ag.category || (role ? role.label : '') || '',
      rarity: ag.rarity || 'Common',
      scope: ag.scope || 'catalog',
      type: 'agent',
      kind: 'character',                // persona overlay wrapping a capability
      visibility: ag.visibility || 'public',
      is_public: ag.visibility === 'public',
      activation_count: ag.activation_count || 0,
      serial_key: ag.serial_key || card.serial_key || null,
      tags: (Array.isArray(ag.tags) && ag.tags.length) ? ag.tags : (card.tags || []),
      stats: card.stats || {},
      capability_tags: (cap && cap.capability_tags) || [],
      mcp_provider: (cap && cap.mcp_provider) || null,
      capability_id: ag.capability_id || null,
      role_type: ag.role_type || null,
      config: {
        role: (role && role.label) || ag.category || '',
        type: 'Agent',
        tools: (cap && cap.tools) || [],
        memory: llm.memory,
        maxSteps: llm.max_steps,
        role_type: ag.role_type || null,
        capability_id: ag.capability_id || null,
        llm_engine: llm.engine,
        temperature: llm.temperature,
        system_prompt: agCfg.system_prompt || '',
      },
      metadata: {
        art: card.art || null,
        caps: card.caps || ((cap && cap.card && cap.card.caps) || []),
        flavor: ag.flavor || '',
        card_num: card.card_num || null,
        agentType: 'Agent',
        tools_required: cap && cap.mcp_provider ? [cap.mcp_provider] : [],
      },
      created_at: ag.created_at,
      updated_at: ag.updated_at,
    };
  }

  function _translateSpaceshipBlueprintRow(sh) {
    if (!sh) return null;
    const card = sh.card || {};
    const cfg = sh.config || {};
    const slots = Array.isArray(sh.slots) ? sh.slots : [];
    // Build crew[] in slot order from ship_slots rows. Mirrors the legacy
    // `metadata.crew` shape so card-renderer / wizards keep working.
    //
    // INTERMEDIATE: DB stores 1-indexed `slot_position`; the JS layer is
    // still on the 0-indexed convention. Translate at the read boundary
    // until every consumer is migrated, then collapse this `- 1` shift.
    const crew = slots
      .slice()
      .sort((a, b) => (a.slot_position || 0) - (b.slot_position || 0))
      .map((s) => {
        const zeroIndexed = (s.slot_position != null) ? (s.slot_position - 1) : 0;
        return {
          label: s.label || s.role_type || `Slot ${zeroIndexed}`,
          role: s.role_type || null,
          slot: zeroIndexed,
          agent_id: s.default_agent_id || null,
          min_class: s.min_class || 'class-1',
        };
      });
    return {
      id: sh.id,
      slug: sh.slug,
      name: sh.name,
      description: sh.description || '',
      flavor: sh.flavor || '',
      category: sh.category || '',
      rarity: sh.rarity || 'Common',
      scope: sh.scope || 'catalog',
      type: 'spaceship',
      visibility: sh.visibility || 'public',
      is_public: sh.visibility === 'public',
      activation_count: sh.activation_count || 0,
      serial_key: sh.serial_key || card.serial_key || null,
      tags: (Array.isArray(sh.tags) && sh.tags.length) ? sh.tags : (card.tags || []),
      stats: card.stats || { slots: String(slots.length || 6) },
      // Lifted from card jsonb to the top level so card-renderer's
      // front-tab panels pick them up via `bp.specialties` / `bp.workflows`.
      // Without this, both tabs fell through to the "Coming soon" stub
      // even though every seeded ship populates the data.
      specialties: Array.isArray(card.specialties) ? card.specialties : [],
      workflows: Array.isArray(card.workflows) ? card.workflows : [],
      config: {
        ship_system_prompt: cfg.ship_system_prompt || cfg.system_prompt || '',
        ship_voice: cfg.ship_voice || null,
        workflow_patterns: cfg.workflow_patterns || [],
        flow: cfg.flow || null,
        auto_theme: cfg.auto_theme || null,
        crew_roles: crew,
      },
      metadata: {
        art: card.art || null,
        caps: card.caps || [],
        flavor: sh.flavor || '',
        card_num: card.card_num || null,
        recommended_class: card.recommended_class || null,
        crew: crew,
      },
      created_at: sh.created_at,
      updated_at: sh.updated_at,
    };
  }

  function _normalizeRow(r) {
    const CLASS_TO_TIER = { 'class-1':'scout', 'class-2':'frigate', 'class-3':'cruiser', 'class-4':'dreadnought', 'class-5':'flagship' };
    if (r.type === 'agent') {
      const meta = r.metadata || {};
      return { ...r, agentType: meta.agentType, art: meta.art, caps: meta.caps };
    }
    if (r.type === 'spaceship') {
      const meta = r.metadata || {};
      const cfg = r.config || {};
      const crewDefs = (typeof BlueprintUtils !== 'undefined') ? BlueprintUtils.getCrewDefs(r) : (meta.crew || cfg.crew || []);
      const ship = { ...r, recommended_class: meta.recommended_class, card_num: meta.card_num, caps: meta.caps, crew: crewDefs, nodes: crewDefs, desc: r.description };
      const cid = ship.recommended_class || ship.class_id;
      if (cid && CLASS_TO_TIER[cid]) ship.tier = CLASS_TO_TIER[cid];
      return ship;
    }
    return r;
  }

  /** Merge normalized rows into _agents/_spaceships (seeds win by ID) */
  function _mergeRows(rows) {
    const agentSeedIds = new Set(_agents.map(a => a.id));
    const shipSeedIds = new Set(_spaceships.map(s => s.id));
    rows.forEach(r => {
      const nr = _normalizeRow(r);
      if (r.type === 'agent' && !agentSeedIds.has(r.id)) {
        _agents.push(nr);
        agentSeedIds.add(r.id);
      } else if (r.type === 'spaceship' && !shipSeedIds.has(r.id)) {
        _spaceships.push(nr);
        shipSeedIds.add(r.id);
      }
    });
  }

  /** Load only the user's activated blueprints from DB (fast init).
   *  Phase B2: any id may now resolve to one of `capabilities`,
   *  `agent_blueprints`, or `spaceship_blueprints`. We try each in
   *  parallel and translate matches. Activated ids may be uuids (new
   *  schema) or legacy text ids (carried over from pre-rewire caches);
   *  the `.in('id', uuids)` calls silently ignore non-uuids so the
   *  parallel fan-out is safe to issue with the full id set.
   */
  async function _loadActivatedFromDB() {
    try {
      const c = SB.client;
      if (!c || typeof c.from !== 'function') return;

      const ids = [...new Set([..._activatedAgentIds, ..._activatedShipIds])];
      if (!ids.length) return;
      const uuidIds = ids.filter(id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
      if (!uuidIds.length) return;

      const [capRes, agRes, shRes] = await Promise.all([
        c.from('capabilities').select('*').in('id', uuidIds),
        c.from('agent_blueprints')
          .select('*, capability:capabilities(*), role:roles(*)')
          .in('id', uuidIds),
        c.from('spaceship_blueprints')
          .select('*, slots:ship_slots(slot_position, role_type, default_agent_id, label, min_class)')
          .in('id', uuidIds),
      ]);

      const rows = [];
      (capRes.data || []).forEach(r => { const t = _translateCapabilityRow(r); if (t) rows.push(t); });
      (agRes.data  || []).forEach(r => { const t = _translateAgentBlueprintRow(r); if (t) rows.push(t); });
      (shRes.data  || []).forEach(r => { const t = _translateSpaceshipBlueprintRow(r); if (t) rows.push(t); });
      if (rows.length) _mergeRows(rows);
    } catch { /* seed fallback already loaded */ }
  }

  /**
   * Load user-created spaceships and agents from Supabase.
   * These are private custom blueprints — not in the seed catalog.
   * Merges into State so getActivatedShips/Agents can find them.
   */
  async function _loadUserCreations() {
    try {
      const c = SB.client;
      if (!c || typeof c.from !== 'function') return;

      // Load custom spaceships
      const { data: ships } = await c.from('user_spaceships').select('*');
      if (ships && ships.length) {
        // SSOT for slot assignments is `user_ship_slots` after Phase C.1.
        // Fetch all slot rows for these ships in one round-trip; legacy
        // `slots` column is dropped and `config.slot_assignments` is no
        // longer written.
        const shipIds = ships.map(s => s.id);
        const slotsByShip = (typeof ShipSlots !== 'undefined')
          ? await ShipSlots.fetchForShips(shipIds)
          : {};

        const stateShips = State.get('spaceships') || [];
        const existingIds = new Set(stateShips.map(s => s.id));
        ships.forEach(s => {
          // Structural fields (description, flavor, tags, caps) live in the
          // `config` JSONB. Slot assignments live in `user_ship_slots`.
          const cfg = (s.config && Object.keys(s.config).length) ? s.config : {};
          const freshAssignments = slotsByShip[s.id] || {};

          // Cross-reference blueprint catalog for rarity/stats if blueprint_id exists
          var catalogBp = null;
          if (s.blueprint_id) {
            catalogBp = getSpaceship(s.blueprint_id) || getSpaceship('bp-' + s.blueprint_id);
          }
          if (!existingIds.has(s.id)) {
            var crewCount = Object.values(freshAssignments).filter(Boolean).length;
            if (!crewCount && Array.isArray(cfg.crew)) crewCount = cfg.crew.length;

            stateShips.push({
              id: s.id, name: s.name, type: 'spaceship',
              category: s.category || (catalogBp && catalogBp.category) || cfg.category || '',
              description: (catalogBp && catalogBp.description) || cfg.description || '',
              flavor: (catalogBp && catalogBp.flavor) || cfg.flavor || '',
              tags: (catalogBp && catalogBp.tags) || cfg.tags || [],
              rarity: s.rarity || (catalogBp && catalogBp.rarity) || cfg.rarity || 'Common',
              status: s.status || 'standby',
              config: { slot_assignments: freshAssignments },
              stats: (catalogBp && catalogBp.stats) || cfg.stats || { crew: String(crewCount), slots: '6' },
              metadata: (catalogBp && catalogBp.metadata) || { caps: cfg.caps || [] },
              blueprint_id: s.blueprint_id,
              created_at: s.created_at,
            });
          }
          // Auto-activate — ships in user_spaceships are OWNED, always activate
          // Rarity gate only applies to NEW activations from the catalog
          if (!_activatedShipIds.includes(s.id)) {
            _activatedShipIds.push(s.id);
          }
          // Restore ship state. Slot assignments come from user_ship_slots;
          // legacy crew-array fallback only fires when no slot rows exist.
          var assignments = Object.assign({}, freshAssignments);
          var agentIds = Object.values(assignments).filter(Boolean);
          if (!agentIds.length && Array.isArray(cfg.crew) && cfg.crew.length) {
            cfg.crew.forEach(function(c, idx) {
              if (c.agent_id) { assignments[String(idx)] = c.agent_id; agentIds.push(c.agent_id); }
            });
          }
          // Backfill missing slots from catalog crew (Legendary/Mythic ships should be full).
          // `__new__` placeholders live in memory only — user_ship_slots rejects
          // non-uuid `user_agent_id` via FK, so the wizard must resolve them
          // before any ShipSlots.setForShip call.
          if (catalogBp) {
            var catalogCrew = catalogBp.metadata?.crew || catalogBp.crew || [];
            if (catalogCrew.length > Object.keys(assignments).length) {
              catalogCrew.forEach(function(c, idx) {
                var key = String(idx);
                if (!assignments[key]) {
                  var crewId = '__new__' + (c.label || c.name || 'Agent ' + (idx + 1));
                  assignments[key] = crewId;
                  agentIds.push(crewId);
                }
              });
            }
          }
          if (agentIds.length) {
            _shipState[s.id] = {
              slot_assignments: assignments,
              status: 'deployed',
              agent_ids: agentIds,
            };
          }
        });
        State.set('spaceships', stateShips);
        _persistShips();
        _persistShipState();
      }

      // Load custom agents — rarity stored in DB column
      const { data: agents } = await c.from('user_agents').select('*');
      if (agents && agents.length) {
        const stateAgents = State.get('agents') || [];
        const existingIds = new Set(stateAgents.map(a => a.id));
        agents.forEach(a => {
          var agentRarity = a.rarity || 'Common';
          if (existingIds.has(a.id)) {
            var existing = stateAgents.find(function(e) { return e.id === a.id; });
            if (existing) existing.rarity = agentRarity;
            return;
          }
          const cfg = a.config || {};
          // Surface fields that live inside the config JSONB to top-level
          // so card-renderer / PromptBuilder / search work with the same
          // shape they use for catalog blueprints.
          stateAgents.push({
            id: a.id, name: a.name, type: 'agent',
            category: cfg.role || a.role || '', rarity: agentRarity,
            status: a.status || 'idle', config: cfg,
            metadata: { agentType: cfg.type || 'Agent', caps: cfg.caps || [] },
            description: cfg.description || '',
            flavor: cfg.flavor || '',
            caps: cfg.caps || [],
            tags: cfg.tags || [],
            persona: cfg.persona || null,
            model_profile: cfg.model_profile || null,
            output_schema: cfg.output_schema || null,
            example_io: cfg.example_io || [],
            eval_criteria: cfg.eval_criteria || [],
            created_at: a.created_at,
          });
          if (!_activatedAgentIds.includes(a.id)) {
            _activatedAgentIds.push(a.id);
          }
        });
        State.set('agents', stateAgents);
        _persistAgents();
      }
    } catch (e) {
      console.warn('[Blueprints] Failed to load user creations:', e.message);
    }
  }

  /**
   * Pull catalog rows from the normalized three-layer schema and run them
   * through the legacy-shape translators. Three queries in parallel:
   * `capabilities`, `agent_blueprints` (with `capability` + `role`
   * embeds), `spaceship_blueprints` (with `slots` embed). Returns the
   * concatenated translated array. Errors on individual tables are
   * logged and skipped — the rest still return.
   *
   * @param {Object} c — `SB.client`
   * @param {Object} [opts]
   * @param {string} [opts.since] — ISO timestamp; if set, only rows whose
   *   `updated_at` is strictly greater are returned (diff-sync mode).
   * @returns {Promise<Array>} translated rows in legacy shape
   */
  async function _fetchCatalogFromNewTables(c, opts = {}) {
    const out = [];
    const applySince = (q) => (opts.since ? q.gt('updated_at', opts.since) : q);

    const capCall = applySince(
      c.from('capabilities')
        .select('*')
        .eq('visibility', 'public')
        .order('name', { ascending: true })
    );
    const agCall = applySince(
      c.from('agent_blueprints')
        .select('*, capability:capabilities(*), role:roles(*)')
        .eq('visibility', 'public')
        .order('name', { ascending: true })
    );
    const shCall = applySince(
      c.from('spaceship_blueprints')
        .select('*, slots:ship_slots(slot_position, role_type, default_agent_id, label, min_class)')
        .eq('visibility', 'public')
        .order('name', { ascending: true })
    );

    const [capRes, agRes, shRes] = await Promise.all([capCall, agCall, shCall]);

    if (capRes.error) console.warn('[Blueprints] capabilities fetch failed:', capRes.error.message);
    if (agRes.error)  console.warn('[Blueprints] agent_blueprints fetch failed:', agRes.error.message);
    if (shRes.error)  console.warn('[Blueprints] spaceship_blueprints fetch failed:', shRes.error.message);

    // After Phase D.1 every umbrella capability has a 1:1 agent_blueprints
    // mirror with the same slug. Skip the capability translation when the
    // mirror exists so the catalog browse stops double-rendering each
    // umbrella (one rich card + one stub card with empty stats).
    const agentSlugs = new Set((agRes.data || []).map(r => r.slug));
    (capRes.data || []).forEach(r => {
      if (agentSlugs.has(r.slug)) return;
      const t = _translateCapabilityRow(r);
      if (t) out.push(t);
    });
    (agRes.data  || []).forEach(r => { const t = _translateAgentBlueprintRow(r); if (t) out.push(t); });
    (shRes.data  || []).forEach(r => { const t = _translateSpaceshipBlueprintRow(r); if (t) out.push(t); });

    return out;
  }

  /**
   * Load full catalog from DB with localStorage cache + differential sync.
   * Called lazily when user browses blueprints or calls listAgents/listSpaceships.
   */
  let _catalogLoadPromise = null;
  async function _loadCatalogFromDB() {
    if (_catalogLoaded) return;
    // Deduplicate concurrent calls
    if (_catalogLoadPromise) return _catalogLoadPromise;
    _catalogLoadPromise = _loadCatalogFromDBInner();
    try { await _catalogLoadPromise; } finally { _catalogLoadPromise = null; }
  }

  async function _loadCatalogFromDBInner() {
    // 1. Try localStorage cache first
    try {
      const cacheTs = parseInt(localStorage.getItem(_KEYS.catalogCacheTs) || '0', 10);
      const cacheAge = Date.now() - cacheTs;

      if (cacheAge < _CACHE_TTL) {
        const cached = JSON.parse(localStorage.getItem(_KEYS.catalogCache) || '[]');
        if (cached.length) {
          _mergeRows(cached);
          _catalogLoaded = true;
          _finalizeCatalogLoad();

          // Differential sync in background — fetch only rows updated since cache
          if (typeof SB !== 'undefined' && typeof SB.isReady === 'function' && SB.isReady() && SB.isOnline()) {
            _diffSyncCatalog(new Date(cacheTs).toISOString());
          }
          return;
        }
      }
    } catch { /* cache miss, fall through to full fetch */ }

    // 2. No cache or expired — full fetch from Supabase
    if (typeof SB === 'undefined' || typeof SB.isReady !== 'function' || !SB.isReady() || !SB.isOnline()) {
      _catalogLoaded = true; // seeds-only mode
      _finalizeCatalogLoad();
      return;
    }

    try {
      const c = SB.client;
      if (!c || typeof c.from !== 'function') { _catalogLoaded = true; _finalizeCatalogLoad(); return; }

      // Phase B2 rewire: pull from the normalized three-layer schema.
      // - `capabilities` — the umbrella functions (HubSpot Agent, GitHub
      //   Agent, …); surface as kind='capability' agents.
      // - `agent_blueprints` — persona overlays wrapping a capability;
      //   surface as kind='character' agents. Joined to `capabilities`
      //   (for tools + mcp_provider) and `roles` (for label).
      // - `spaceship_blueprints` — orchestrators; joined to `ship_slots`
      //   so crew[] is reconstructed from the child rows.
      // All filters on `visibility='public'` (matches the legacy
      // `is_public=true` semantics — a user's own private blueprints
      // come through `_loadUserCreations`, not the catalog).
      const rowsTranslated = await _fetchCatalogFromNewTables(c);

      if (rowsTranslated.length) {
        _mergeRows(rowsTranslated);
        // Cache the translated rows (legacy shape, post-translator).
        try {
          localStorage.setItem(_KEYS.catalogCache, JSON.stringify(rowsTranslated));
          localStorage.setItem(_KEYS.catalogCacheTs, String(Date.now()));
        } catch { /* storage full — still works without cache */ }
      }
    } catch (e) {
      console.warn('[Blueprints] catalog fetch failed:', e?.message);
      /* seed fallback */
    }

    _catalogLoaded = true;
    _finalizeCatalogLoad();
  }

  /** Fetch only blueprints updated since lastSync and merge them.
   *  Phase B2: sources from the new three-layer tables via
   *  `_fetchCatalogFromNewTables(c, { since })`. The result is already
   *  translated to legacy shape, so the per-row merge below stays
   *  unchanged — it reads `r.type` exactly as before.
   */
  async function _diffSyncCatalog(lastSyncIso) {
    try {
      const c = SB.client;
      if (!c || typeof c.from !== 'function') return;

      const rows = await _fetchCatalogFromNewTables(c, { since: lastSyncIso });
      if (!rows.length) return;

      // Replace existing entries with updated versions
      rows.forEach(r => {
        const nr = _normalizeRow(r);
        if (r.type === 'agent') {
          const idx = _agents.findIndex(a => a.id === r.id);
          if (idx >= 0) _agents[idx] = nr; else _agents.push(nr);
        } else if (r.type === 'spaceship') {
          const idx = _spaceships.findIndex(s => s.id === r.id);
          if (idx >= 0) _spaceships[idx] = nr; else _spaceships.push(nr);
        }
      });

      // Update cache with fresh full snapshot
      try {
        const allRows = [].concat(
          _agents.filter(a => a.serial_key || a.type === 'agent'),
          _spaceships.filter(s => s.serial_key || s.type === 'spaceship')
        );
        localStorage.setItem(_KEYS.catalogCache, JSON.stringify(allRows));
        localStorage.setItem(_KEYS.catalogCacheTs, String(Date.now()));
      } catch {}

      _seedMockCounts();
    } catch {}
  }

  /** Public method for views to ensure full catalog is loaded before rendering */
  async function ensureCatalogLoaded() {
    if (!_catalogLoaded) await _loadCatalogFromDB();
  }

  /**
   * Search blueprints via the blueprint-search Edge Function.
   * Falls back to client-side listAgents() for offline/error.
   * @param {string} query - Search string
   * @param {Object} [filters] - { type, category, rarity, tags, page, per_page }
   * @returns {Promise<{results:Array, total:number, page:number, per_page:number}>}
   */
  async function search(query, filters = {}) {
    // Try Edge Function first
    if (typeof SB !== 'undefined' && typeof SB.isReady === 'function' && SB.isReady() && SB.isOnline()) {
      try {
        const url = (SB.client?.supabaseUrl || '').replace(/\/$/, '');
        const anonKey = SB.client?.supabaseKey || '';
        if (url && anonKey) {
          const resp = await fetch(`${url}/functions/v1/blueprint-search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': anonKey },
            body: JSON.stringify({ q: query, ...filters }),
          });
          if (resp.ok) return await resp.json();
        }
      } catch (e) {
        console.warn('[Blueprints] Edge Function search failed, falling back:', e.message);
      }
    }

    // Offline fallback: search seeds + cached catalog
    await ensureCatalogLoaded();
    const q = (query || '').toLowerCase();
    const matchText = (item) =>
      (item.name || '').toLowerCase().includes(q) ||
      (item.description || item.desc || '').toLowerCase().includes(q) ||
      (item.tags || []).join(' ').toLowerCase().includes(q);

    let results;
    if (filters.type === 'spaceship') {
      results = _spaceships.filter(matchText);
    } else if (filters.type === 'agent') {
      results = _agents.filter(matchText);
    } else {
      results = [..._agents, ..._spaceships].filter(matchText);
    }
    if (filters.category) results = results.filter(r => r.category === filters.category);
    if (filters.rarity) results = results.filter(r => r.rarity === filters.rarity);
    return { results, total: results.length, page: 1, per_page: results.length };
  }

  /**
   * Look up a blueprint by its serial key (soul key).
   * @param {string} serialKey - e.g. 'CR-J0CWCJ'
   * @returns {Promise<Object|null>}
   */
  async function getBySerial(serialKey) {
    if (!serialKey) return null;

    // Try Edge Function
    if (typeof SB !== 'undefined' && typeof SB.isReady === 'function' && SB.isReady() && SB.isOnline()) {
      try {
        const url = (SB.client?.supabaseUrl || '').replace(/\/$/, '');
        const anonKey = SB.client?.supabaseKey || '';
        if (url && anonKey) {
          const resp = await fetch(`${url}/functions/v1/blueprint-search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': anonKey },
            body: JSON.stringify({ serial_key: serialKey }),
          });
          if (resp.ok) {
            const data = await resp.json();
            return data.results?.[0] || null;
          }
        }
      } catch {}
    }

    // Offline fallback: scan seeds
    const key = serialKey.toUpperCase();
    const agent = _agents.find(a => (a.serial || '').toUpperCase() === key || (a.serial_key || '').toUpperCase() === key);
    if (agent) return agent;
    // Spaceships don't have serial in seed, but check DB-loaded ones
    const ship = _spaceships.find(s => (s.serial_key || '').toUpperCase() === key);
    return ship || null;
  }

  /* ═══════════════════════════════════════════════════════════════
     Persist helpers (write to localStorage)
  ═══════════════════════════════════════════════════════════════ */

  function _persistAgents() {
    try { localStorage.setItem(_KEYS.agents, JSON.stringify(_activatedAgentIds)); } catch {}
  }
  function _persistShips() {
    try { localStorage.setItem(_KEYS.ships, JSON.stringify(_activatedShipIds)); } catch {}
  }
  function _persistShipState() {
    try { localStorage.setItem(_KEYS.shipState, JSON.stringify(_shipState)); } catch {}
  }

  function _getUserId() {
    if (typeof State === 'undefined') return null;
    const u = State.get('user');
    return u?.id || null;
  }

  function _canSync() {
    return typeof SB !== 'undefined' && SB.isReady() && SB.isOnline() && _getUserId();
  }

  /**
   * True when no Supabase user is signed in. Read-path branches gate
   * localStorage reads behind this so signed-in users get a clean
   * State.agents (mirrored from `user_agents`) view — wiping
   * `nice-custom-agents` no longer breaks dispatch once 3a (forward
   * UUID writes) and 3b (BlueprintBackfill recovery) have shipped.
   */
  function _isGuestSession() {
    return !_getUserId();
  }

  /**
   * Parse the `nice-custom-agents` localStorage cache. SSOT for guest
   * sessions; for signed-in sessions State.agents is authoritative and
   * this only matters in flows that mutate the cache directly
   * (`_resolveNewAgents`, `migrateGuestState`, `cleanupOrphans` writes).
   */
  function _readLocalAgents() {
    try { return JSON.parse(localStorage.getItem(Utils.KEYS.customAgents) || '[]'); }
    catch { return []; }
  }

  /**
   * Heal stale ship stats in State.spaceships once the catalog is queryable.
   *
   * `_loadUserCreations` writes ship rows with
   *   stats: catalogBp.stats || meta.stats || { crew: <count>, slots: '6' }
   * — when init runs in parallel with catalog load (the common case on hard
   * reload), `catalogBp` is null and the fallback locks `slots` to "6"
   * regardless of the ship's true crew size. After the catalog arrives this
   * walks State.spaceships and rewrites stats from the matching catalog row,
   * so getSlotCount returns the right number on the next render.
   *
   * Idempotent — entries already aligned with the catalog are skipped.
   * Returns true if any entry was rewritten.
   */
  function _healStaleShipStats() {
    if (typeof State === 'undefined') return false;
    const ships = State.get('spaceships');
    if (!Array.isArray(ships) || !ships.length) return false;
    let dirty = false;
    ships.forEach(s => {
      if (!s || !s.blueprint_id) return;
      const catalogBp = getSpaceship(s.blueprint_id) || getSpaceship('bp-' + s.blueprint_id);
      if (!catalogBp || !catalogBp.stats) return;
      const currentSlots = parseInt(s.stats?.slots, 10) || 0;
      const catalogSlots = parseInt(catalogBp.stats.slots, 10) || 0;
      if (catalogSlots && currentSlots !== catalogSlots) {
        s.stats = { ...catalogBp.stats };
        // _loadUserCreations falls back to `metadata: { caps: meta.caps || [] }`
        // when catalogBp is null, which strips the crew labels getCrewDefs reads.
        // Restore catalog metadata so slot rendering picks up the real names.
        if (catalogBp.metadata && (!s.metadata || !s.metadata.crew)) {
          s.metadata = { ...catalogBp.metadata };
        }
        dirty = true;
      }
    });
    if (dirty) State.set('spaceships', ships);
    return dirty;
  }

  /**
   * Finalise a catalog load: seed mock counts, heal stale State entries,
   * and fan out the two events views care about. Called from every path
   * that flips `_catalogLoaded = true` so subscribers fire whether the
   * catalog came from cache, full fetch, or seeds-only mode. Without this
   * the cache-hit path (the common case on warm reload) never notified
   * subscribers — Schematic stayed at the pre-catalog slot count.
   */
  function _finalizeCatalogLoad() {
    _seedMockCounts();
    _healStaleShipStats();
    if (typeof State !== 'undefined') State.set('catalog-loaded', Date.now());
    // Re-fire activated-ships so SchematicView and other subscribers
    // re-render with the freshly enriched stats. _healStaleShipStats
    // fixes State.spaceships, but Schematic listens on activated-ships.
    _fireShipState();
  }

  /** Generate deterministic mock connected counts from seed data for dev/testing */
  function _seedMockCounts() {
    const rarityWeight = { Common: 1, Rare: 1.8, Epic: 3, Legendary: 5 };
    // Deterministic pseudo-random from string hash
    function hash(s) {
      let h = 0;
      for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
      return Math.abs(h);
    }
    const allBps = [].concat(_agents, _spaceships);
    allBps.forEach(bp => {
      if (!bp || !bp.id) return;
      if (_connectedCounts[bp.id]) return; // don't overwrite real or existing counts
      const w = rarityWeight[bp.rarity] || 1;
      const h = hash(bp.id);
      // Range: 8-980 scaled by rarity — Legendary items trend higher
      const base = (h % 200) + 8;
      _connectedCounts[bp.id] = Math.round(base * w);
    });
  }

  function getConnectedCount(blueprintId) {
    return _connectedCounts[blueprintId] || 0;
  }

  /* ═══════════════════════════════════════════════════════════════
     State.set helpers (notify views reactively)
  ═══════════════════════════════════════════════════════════════ */

  function _fireAgentState() {
    if (typeof State !== 'undefined') {
      State.set('activated-agents', getActivatedAgents());
    }
  }

  function _fireShipState() {
    if (typeof State !== 'undefined') {
      State.set('activated-ships', getActivatedShips());
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     Catalog queries (existing API, unchanged)
  ═══════════════════════════════════════════════════════════════ */

  function getAgent(id) {
    let a = _agents.find(a => a.id === id);
    if (a) return a;
    // State.agents is the canonical store for user-created agents
    // (mirrored from user_agents for signed-in, hydrated from localStorage
    // for guests via _loadUserCreations).
    if (typeof State !== 'undefined') {
      a = (State.get('agents') || []).find(a => a.id === id);
      if (a) return a;
    }
    // Guest fallback only — signed-in State.agents already covers
    // every persisted custom agent.
    if (_isGuestSession()) {
      a = _readLocalAgents().find(a => a.id === id);
    }
    return a || null;
  }

  function listAgents(filter) {
    // Trigger lazy catalog load (non-blocking — returns seeds immediately)
    if (!_catalogLoaded) _loadCatalogFromDB();
    // Returns both catalog and community scopes — community blueprints
    // live alongside the seeded library in the same browse, discriminated
    // by a COMMUNITY badge on the card. Callers that want to filter by
    // scope pass it through searchCatalog({ scope }).
    if (!filter) return [..._agents];
    let list = [..._agents];
    if (filter.scope === 'official') list = list.filter(a => (a.scope || 'catalog') === 'catalog');
    else if (filter.scope === 'community') list = list.filter(a => a.scope === 'community');
    if (filter.rarity) list = list.filter(a => a.rarity === filter.rarity);
    if (filter.category) list = list.filter(a => a.category === filter.category);
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(a =>
        (a.name || '').toLowerCase().includes(q) ||
        (a.description || a.desc || '').toLowerCase().includes(q) ||
        (a.tags || []).join(' ').toLowerCase().includes(q)
      );
    }
    return list;
  }

  function getSpaceship(id) {
    return _spaceships.find(s => s.id === id) || null;
  }

  function listSpaceships() {
    // Trigger lazy catalog load (non-blocking — returns seeds immediately)
    if (!_catalogLoaded) _loadCatalogFromDB();
    // Returns both catalog and community scopes — see listAgents.
    return [..._spaceships];
  }

  /**
   * List capability blueprints (kind='capability'). These are the wired
   * umbrellas that actually carry tools — HubSpot Agent, GitHub Agent,
   * etc. Excludes characters (persona overlays) and spaceships.
   *
   * Falls back to checking presence of capability_tags for blueprints
   * loaded before the kind column existed (cached snapshots).
   */
  function listCapabilities() {
    if (!_catalogLoaded) _loadCatalogFromDB();
    return _agents.filter(a => {
      if (a.kind === 'capability') return true;
      if (a.kind) return false;
      return Array.isArray(a.capability_tags) && a.capability_tags.length > 0;
    });
  }

  /**
   * List character blueprints (kind='character'). These are persona
   * overlays — Apollo, Geordi, Picard. Some wrap capabilities via
   * config.capability_id; some are stubs (tool-less).
   */
  function listCharacters() {
    if (!_catalogLoaded) _loadCatalogFromDB();
    return _agents.filter(a => a.kind === 'character');
  }

  /**
   * Look up a capability blueprint by id. Returns null if the id
   * resolves to a character or spaceship instead — callers shouldn't
   * mistake one for the other.
   */
  function getCapability(id) {
    const bp = getAgent(id);
    if (!bp) return null;
    if (bp.kind === 'capability') return bp;
    if (!bp.kind && Array.isArray(bp.capability_tags) && bp.capability_tags.length) return bp;
    return null;
  }

  /**
   * List the user's own blueprints — custom builds and imports, distinct
   * from catalog activations. Splits by type so the view can render them
   * in two sections.
   *
   * Source of truth:
   * - State.spaceships / State.agents — entries WITHOUT `blueprint_id`
   *   are user-built (catalog activations carry the blueprint_id link).
   * - localStorage `customShips` / `customAgents` — the guest/offline
   *   path before sign-in syncs to user_spaceships / user_agents.
   */
  function listMyBlueprints() {
    const ships = ((typeof State !== 'undefined' ? State.get('spaceships') : null) || [])
      .filter(s => s && !s.blueprint_id);
    const agents = ((typeof State !== 'undefined' ? State.get('agents') : null) || [])
      .filter(a => a && !a.blueprint_id);
    const seen = new Set([...ships.map(s => s.id), ...agents.map(a => a.id)]);
    if (_isGuestSession()) {
      try {
        const guestShips = JSON.parse(localStorage.getItem(Utils.KEYS.customShips) || '[]');
        guestShips.forEach(s => { if (s && s.id && !seen.has(s.id)) { ships.push(s); seen.add(s.id); } });
      } catch {}
      _readLocalAgents().forEach(a => {
        if (a && a.id && !seen.has(a.id)) { agents.push(a); seen.add(a.id); }
      });
    }
    return { spaceships: ships, agents: agents };
  }

  function get(id) {
    return getAgent(id) || getSpaceship(id);
  }

  function isReady() {
    return _ready;
  }

  /* ═══════════════════════════════════════════════════════════════
     CREATE a private agent — blueprint row + activation row
     Used by Setup Wizard, Crew Generator, Crew Designer, and any
     future flow that produces a new standalone agent from a custom
     spec (vs. activating an existing catalog blueprint). Mirrors the
     agent-builder pattern: insert into agent_blueprints first so the
     user_agents activation row can link via blueprint_id. Before this
     helper existed, those callers wrote user_agents with NULL
     blueprint_id, leaving the edit/fork path with no template to
     hydrate from on first save.
  ═══════════════════════════════════════════════════════════════ */

  async function createPrivateAgent(spec, user) {
    if (!spec || !spec.name) return null;
    if (!user || typeof SB === 'undefined' || !SB.isReady()) return null;
    const slug = (spec.name || 'agent').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + '-' + Math.random().toString(36).slice(2, 8);
    const serial = 'USER-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const config = Object.assign({
      role: spec.role || 'Custom',
      type: spec.type || 'Specialist',
      tools: spec.tools || [],
      memory: spec.memory == null ? false : !!spec.memory,
      temperature: spec.temperature == null ? 0.7 : spec.temperature,
      llm_engine: spec.model || spec.llm_engine || 'gemini-2.5-flash',
      description: spec.description || '',
    }, spec.system_prompt ? { system_prompt: spec.system_prompt } : {},
       spec.source ? { source: spec.source } : {},
       spec.extraConfig || {});
    const blueprintRow = {
      slug,
      name: spec.name,
      description: spec.description || '',
      flavor: spec.flavor || '',
      category: spec.role || '',
      rarity: spec.rarity || 'Common',
      scope: 'community',
      creator_id: user.id,
      visibility: 'private',
      role_type: spec.role_type || 'operations',
      capability_id: null,
      config,
      card: { caps: spec.caps || [] },
      serial_key: serial,
      tags: spec.tags || [],
    };
    try {
      const blueprint = await SB.db('agent_blueprints').create(blueprintRow);
      if (!blueprint || !blueprint.id) return null;
      const agent = await SB.db('user_agents').create({
        user_id: user.id,
        name: spec.name,
        status: spec.status || 'idle',
        rarity: spec.rarity || 'Common',
        blueprint_id: blueprint.id,
        config,
      });
      return { agent, blueprint };
    } catch (err) {
      console.warn('[Blueprints.createPrivateAgent] failed for', spec.name, '—', err.message);
      return null;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     AGENT activation
  ═══════════════════════════════════════════════════════════════ */

  function activateAgent(bpId) {
    if (_activatedAgentIds.includes(bpId)) return;

    // Rarity gate: check if user's rank allows this rarity
    var bp = getAgent(bpId);
    if (!bp) {
      var stateAgents = (typeof State !== 'undefined' ? State.get('agents') : null) || [];
      bp = stateAgents.find(function(a) { return a.id === bpId; });
    }
    var rarity = bp ? (bp.rarity || 'Common') : 'Common';
    if (typeof Gamification !== 'undefined' && Gamification.isRarityUnlocked && !Gamification.isRarityUnlocked(rarity)) {
      if (typeof Notify !== 'undefined') {
        var rank = Gamification.getRank();
        Notify.send('Requires ' + rarity + ' rank. Current max: ' + (rank.maxRarity || 'Common'), 'warning');
      }
      return false;
    }

    _activatedAgentIds.push(bpId);
    _persistAgents();
    _fireAgentState();
    return true;
  }

  function deactivateAgent(bpId) {
    // Normalize: find the matching ID in the array (with or without bp- prefix)
    const match = _activatedAgentIds.find(id => id === bpId || 'bp-' + id === bpId || id === 'bp-' + bpId);
    if (!match) return;
    _activatedAgentIds = _activatedAgentIds.filter(id => id !== match);
    _persistAgents();

    // Cascade: remove from local agents state
    const agentId = bpId.startsWith('bp-') ? bpId : 'bp-' + bpId;
    if (typeof State !== 'undefined') {
      const agents = State.get('agents') || [];
      const filtered = agents.filter(r => r.id !== agentId);
      if (filtered.length !== agents.length) State.set('agents', filtered);

      // Cascade: remove agent from any spaceship slots
      const spaceships = State.get('spaceships') || [];
      let unslotted = false;
      spaceships.forEach(ship => {
        if (!ship.slot_assignments) return;
        Object.keys(ship.slot_assignments).forEach(slotKey => {
          if (ship.slot_assignments[slotKey] === agentId) {
            ship.slot_assignments[slotKey] = null;
            unslotted = true;
          }
        });
        if (ship.agent_ids) ship.agent_ids = ship.agent_ids.filter(id => id !== agentId);
      });
      if (unslotted) State.set('spaceships', spaceships);
    }

    // Cascade: prune agent from persisted ship state
    _pruneAgentFromShipState(agentId);

    _fireAgentState();
  }

  function isAgentActivated(bpId) {
    if (_activatedAgentIds.includes(bpId)) return true;
    // Check without bp- prefix (activated IDs don't have it)
    if (bpId.startsWith('bp-')) return _activatedAgentIds.includes(bpId.slice(3));
    return _activatedAgentIds.includes('bp-' + bpId);
  }

  function getActivatedAgentIds() {
    return [..._activatedAgentIds];
  }

  /**
   * Capability fields the catalog owns. Edits to these on a catalog blueprint
   * propagate to every activated copy via resolveLiveAgent. The remaining
   * config fields (role, temperature, memory) stay user-tunable.
   */
  const _CATALOG_DRIVEN_CONFIG = [
    'system_prompt', 'tools', 'llm_engine', 'is_captain',
    'role_type', 'agentRole', 'type',
  ];

  /**
   * Merge a stored agent with its catalog blueprint, preferring catalog
   * for capability fields and stored values for user-tunable fields.
   *
   * Without this, every activation snapshots the catalog at deploy time
   * and a later edit to (e.g.) a stub agent's system_prompt never reaches
   * the activated copy. Resolver runs at read time on every getActivatedAgents
   * call so callers always see the live catalog config.
   *
   * Resolves the catalog blueprint by, in order:
   *   1. agent.blueprint_id (preferred — set by activation paths that know the catalog ID)
   *   2. agent.config.blueprint_id (legacy)
   *   3. agent.id (for slug-keyed activations like 'bp-agent-google-workspace')
   *
   * Returns the agent unchanged if no catalog match is found, so unknown
   * IDs and offline-only custom builds keep working.
   */
  function resolveLiveAgent(agent) {
    if (!agent) return agent;
    const candidates = [];
    if (agent.blueprint_id) candidates.push(agent.blueprint_id);
    if (agent.config && agent.config.blueprint_id) candidates.push(agent.config.blueprint_id);
    if (agent.id) candidates.push(agent.id);

    let catalog = null;
    for (const cid of candidates) {
      if (!cid) continue;
      catalog = _agents.find(a => a.id === cid)
            || _agents.find(a => a.id === 'bp-' + cid)
            || (typeof cid === 'string' && cid.startsWith('bp-')
                ? _agents.find(a => a.id === cid.slice(3)) : null);
      if (catalog) break;
      // Synthetic crew id ("<shipId>-crew-<n>") points at a node inside a ship
      // blueprint, not a top-level agent. Resolve by indexing into the ship's
      // crew array so edits to crew_overrides reach the activated copy.
      const crewMatch = typeof cid === 'string' ? cid.match(/^(.+)-crew-(\d+)$/) : null;
      if (crewMatch) {
        const shipId = crewMatch[1];
        const slotIdx = parseInt(crewMatch[2], 10);
        const ship = _spaceships.find(s => s.id === shipId)
                  || _spaceships.find(s => s.id === 'bp-' + shipId)
                  || (shipId.startsWith('bp-') ? _spaceships.find(s => s.id === shipId.slice(3)) : null);
        const crew = (ship && (ship.metadata?.crew || ship.crew || ship.nodes)) || [];
        if (crew[slotIdx]) { catalog = crew[slotIdx]; break; }
      }
    }
    if (!catalog || catalog === agent) return agent;

    const aCfg = agent.config || {};
    const cCfg = catalog.config || {};
    const mergedCfg = { ...aCfg };
    for (const k of _CATALOG_DRIVEN_CONFIG) {
      if (cCfg[k] !== undefined) mergedCfg[k] = cCfg[k];
    }
    return {
      ...agent,
      description: catalog.description || agent.description,
      flavor: catalog.flavor || agent.flavor,
      kind: catalog.kind || agent.kind,
      capability_tags: catalog.capability_tags || agent.capability_tags,
      config: mergedCfg,
    };
  }

  /**
   * Pure helper: returns a refreshed copy of `agent` if any catalog-driven
   * config field would change vs the stored value, else null. Lets callers
   * skip writes when nothing actually moved. Used by the persistent-store
   * migration below.
   */
  function _diffAgainstCatalog(agent) {
    if (!agent) return null;
    const live = resolveLiveAgent(agent);
    if (live === agent) return null;
    const aCfg = agent.config || {};
    const lCfg = live.config || {};
    const cfgChanged = _CATALOG_DRIVEN_CONFIG.some(
      k => JSON.stringify(aCfg[k]) !== JSON.stringify(lCfg[k])
    );
    const descChanged = live.description !== agent.description;
    const flavorChanged = live.flavor !== agent.flavor;
    return (cfgChanged || descChanged || flavorChanged) ? live : null;
  }

  /**
   * One-time migration that walks every persistent agent store and rewrites
   * stale catalog-driven config fields from the live catalog. Idempotent —
   * a second call is a no-op when nothing has drifted.
   *
   * Without this, the runtime resolver wired into getActivatedAgents serves
   * a correct merged view, but persistent rows (Supabase user_agents,
   * customAgents localStorage, State.agents) keep their stale snapshots and
   * get re-loaded as-is on the next session. This call heals the snapshots
   * so the merge becomes a no-op going forward.
   *
   * Catalog load is lazy, so this can run with an incomplete _agents list.
   * That's safe — entries it can't match stay untouched until the next
   * call (after _loadCatalogFromDB completes).
   *
   * Returns { refreshed, dbUpdated } counts. DB writes are fire-and-forget
   * (concurrent, errors logged) so init() doesn't block on them.
   */
  async function refreshActivatedAgentsFromCatalog() {
    const refreshedIds = new Set();
    let dbUpdated = 0;
    const dbWrites = [];

    // 1. customAgents localStorage — guest sessions only. For signed-in
    //    users State.agents (mirrored from user_agents) is authoritative,
    //    and step 2 also writes back to Supabase; refreshing the cache
    //    here would be wasted work.
    if (_isGuestSession()) {
      try {
        const stored = _readLocalAgents();
        let dirty = false;
        for (let i = 0; i < stored.length; i++) {
          const next = _diffAgainstCatalog(stored[i]);
          if (next) { stored[i] = next; dirty = true; refreshedIds.add(next.id); }
        }
        if (dirty) localStorage.setItem(Utils.KEYS.customAgents, JSON.stringify(stored));
      } catch {}
    }

    // 2. State.agents — drives every view. Refire after to repaint.
    if (typeof State !== 'undefined') {
      const agents = State.get('agents') || [];
      const next = [...agents];
      let dirty = false;
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-/;
      for (let i = 0; i < next.length; i++) {
        const refreshedAgent = _diffAgainstCatalog(next[i]);
        if (!refreshedAgent) continue;
        next[i] = refreshedAgent;
        dirty = true;
        refreshedIds.add(refreshedAgent.id);
        // Queue a Supabase row update for every UUID-keyed agent. Local-only
        // ids (e.g. 'agent-<ts>-<rand>') don't have a row to update.
        if (_canSync() && uuidRe.test(refreshedAgent.id)) {
          dbWrites.push(
            SB.db('user_agents').update(refreshedAgent.id, { config: refreshedAgent.config })
              .then(() => { dbUpdated++; })
              .catch(e => console.warn('[Blueprints] refresh DB update failed:', refreshedAgent.id, e.message))
          );
        }
      }
      if (dirty) State.set('agents', next);
    }

    if (dbWrites.length) await Promise.allSettled(dbWrites);
    const refreshed = refreshedIds.size;
    if (refreshed) _fireAgentState();
    return { refreshed, dbUpdated };
  }

  /** Returns fully constructed agent objects from activated blueprint IDs */
  function getActivatedAgents() {
    const result = [];
    _activatedAgentIds.forEach(bpId => {
      // getAgent already walks _agents → State.agents → localStorage
      // (guest only); no need to repeat the fallback chain here.
      let bp = getAgent(bpId);
      if (!bp) return;
      // Live-merge with catalog: capability fields (system_prompt, tools, llm_engine,
      // role_type, agentRole, is_captain, type) refresh from catalog every read so
      // catalog edits reach activated copies without re-deploy.
      bp = resolveLiveAgent(bp);
      const lookupId = bpId.startsWith('bp-') ? bpId : 'bp-' + bpId;
      const custom = typeof CardRenderer !== 'undefined' && CardRenderer.getCustomLabels
        ? CardRenderer.getCustomLabels(lookupId) : {};
      const localId = bpId;
      const agent = {
        id: localId,
        name: custom.name || bp.name,
        role: custom.role || bp.config?.role || bp.category || 'General',
        status: 'idle',
        llm_engine: bp.config?.llm_engine || 'gemini-2.5-flash',
        type: bp.config?.type || 'Specialist',
        config: Object.assign({ temperature: 0.7, memory: true }, bp.config || {}),
        created_at: new Date().toISOString(),
        blueprint_id: bpId,
        rarity: bp.rarity,
        category: bp.category,
        caps: bp.caps,
        flavor: bp.flavor,
        desc: bp.desc || bp.description,
        description: bp.description || bp.desc,
        tags: bp.tags,
        kind: bp.kind,
        capability_tags: bp.capability_tags || [],
        stats: bp.stats,
      };
      // Attach Supabase UUID if available
      if (_uuidMap[localId]) agent.supabase_id = _uuidMap[localId];
      result.push(agent);
    });
    return result;
  }

  /** Store a Supabase UUID for a local blueprint agent ID */
  function setAgentUuid(localId, uuid) {
    _uuidMap[localId] = uuid;
    try { localStorage.setItem(_KEYS.uuidMap, JSON.stringify(_uuidMap)); } catch {}
  }

  /** Get the Supabase UUID for a local agent ID, or null */
  function getAgentUuid(localId) {
    return _uuidMap[localId] || null;
  }

  /* ═══════════════════════════════════════════════════════════════
     SPACESHIP activation
  ═══════════════════════════════════════════════════════════════ */

  /**
   * Find an existing active user_spaceships row for (user_id, blueprint_id),
   * or create a new one. The single entry point for every spaceship
   * activation flow — replaces 8 ad-hoc SB.db('user_spaceships').create()
   * call sites that historically produced duplicate rows for the same
   * blueprint.
   *
   * @param {string|null} blueprintId — Catalog blueprint id (e.g.
   *   'ship-falcon'). Pass null for custom builds; those always create
   *   a new row because each custom ship is unique-per-instance.
   * @param {() => object} rowFactory — Lazy factory returning the row
   *   payload to insert when a fresh create is needed. The user_id and
   *   blueprint_id fields are auto-filled from session/argument if the
   *   factory omits them.
   * @returns {Promise<{ship: object|null, created: boolean}>} ship is
   *   null in guest/offline mode; otherwise the existing or freshly
   *   created row. created indicates whether an INSERT happened.
   */
  async function findOrCreateActiveShip(blueprintId, rowFactory) {
    if (!_canSync()) return { ship: null, created: false };
    const userId = _getUserId();
    if (!userId) return { ship: null, created: false };

    // Custom builds (no blueprint_id) skip the find phase — every
    // instance is unique by definition. The DB unique partial index
    // also excludes null blueprint_id rows.
    if (blueprintId) {
      try {
        const c = SB.client;
        if (c) {
          const { data: existing } = await c
            .from('user_spaceships')
            .select('*')
            .eq('user_id', userId)
            .eq('blueprint_id', blueprintId)
            .neq('status', 'archived')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (existing) return { ship: existing, created: false };
        }
      } catch (e) {
        // Fall through to create — preserves prior behaviour where
        // the activation flow continued even if the find query failed.
      }
    }

    const row = rowFactory() || {};
    if (!row.user_id) row.user_id = userId;
    if (blueprintId && !row.blueprint_id) row.blueprint_id = blueprintId;

    try {
      const ship = await SB.db('user_spaceships').create(row);
      return { ship, created: true };
    } catch (e) {
      // Race condition: another tab/window inserted between our find and
      // create. The unique partial index rejects the duplicate; recover
      // by returning the row that won the race.
      if (blueprintId) {
        try {
          const c = SB.client;
          if (c) {
            const { data: winner } = await c
              .from('user_spaceships')
              .select('*')
              .eq('user_id', userId)
              .eq('blueprint_id', blueprintId)
              .neq('status', 'archived')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (winner) return { ship: winner, created: false };
          }
        } catch {}
      }
      throw e;
    }
  }

  /**
   * Activate a ship — the single entry point that guarantees every state
   * layer reflects ownership before it returns.
   *
   * SSOT contract: after a successful activateShip call, the ship exists
   * in `State.spaceships` (canonical) AND `_activatedShipIds` (legacy
   * derived cache). `isShipActivated(bpId)` is guaranteed to return true.
   *
   * Callers may pass:
   *   - A catalog id (`'ship-52'`) — a minimal State.spaceships entry is
   *     synthesized from the catalog blueprint if none exists yet.
   *   - A DB row UUID — assumes State.spaceships already has the entry
   *     (loaded from user_spaceships); only updates `_activatedShipIds`.
   *
   * Rarity gate: only applied when `options.force` is falsy. The gate is
   * a UX safety check for generic entry points (command palette, console),
   * redundant with the UI-level `🔒 Rarity` lock on the blueprint card,
   * and NOT a security boundary — Supabase RLS is the real gate.
   *
   * The ShipSetupWizard passes `force: true` because by the time the
   * wizard reaches its deploy step the user has already cleared the UI
   * lock AND committed three steps of choices. Silently rejecting the
   * final push here was the root cause of Mythic ships showing "Deploy"
   * after being fully deployed.
   *
   * @param {string} bpId
   * @param {{force?: boolean}} [options]
   * @returns {boolean} true if the ship is now activated (or was already),
   *                    false only when the rarity gate rejects a non-force push.
   */
  function activateShip(bpId, options) {
    if (!bpId) return false;
    // Fast path: already activated under any id form the resolver recognizes.
    // This prevents duplicate State.spaceships entries on re-activation.
    if (_resolveActivatedShipId(bpId)) {
      if (!_activatedShipIds.includes(bpId)) {
        _activatedShipIds.push(bpId);
        _persistShips();
      }
      return true;
    }

    const force = !!(options && options.force);

    // Resolve blueprint metadata (for rarity gate + State synthesis)
    let catalogBp = getSpaceship(bpId);
    if (!catalogBp) {
      const variants = _bpIdVariants(bpId);
      for (const v of variants) {
        catalogBp = getSpaceship(v);
        if (catalogBp) break;
      }
    }
    const rarity = catalogBp ? (catalogBp.rarity || 'Common') : 'Common';

    if (!force) {
      if (typeof Gamification !== 'undefined' && Gamification.isRarityUnlocked && !Gamification.isRarityUnlocked(rarity)) {
        if (typeof Notify !== 'undefined') {
          const rank = Gamification.getRank();
          Notify.send('Requires ' + rarity + ' rank. Current max: ' + (rank.maxRarity || 'Common'), 'warning');
        }
        return false;
      }
    }

    // 1. Legacy cache — stay in lockstep with State.spaceships
    if (!_activatedShipIds.includes(bpId)) {
      _activatedShipIds.push(bpId);
      _persistShips();
    }

    // 2. SSOT — ensure a State.spaceships entry exists for this ship.
    //    If the caller already populated State (wizard path), don't clobber.
    //    Otherwise synthesize a minimal entry from catalog data so downstream
    //    queries (isShipActivated, getActivatedShips, drawer, catalog card)
    //    have something authoritative to find.
    if (typeof State !== 'undefined') {
      const spaceships = State.get('spaceships') || [];
      const existing = spaceships.find(s =>
        s && (s.id === bpId || s.blueprint_id === bpId
           || s.id === 'bp-' + bpId || s.blueprint_id === 'bp-' + bpId
           || (typeof bpId === 'string' && bpId.startsWith('bp-') && (s.id === bpId.slice(3) || s.blueprint_id === bpId.slice(3))))
      );
      if (!existing && catalogBp) {
        spaceships.push({
          id: bpId,
          blueprint_id: bpId,
          name: catalogBp.name || bpId,
          type: 'spaceship',
          rarity: catalogBp.rarity || 'Common',
          category: catalogBp.category || '',
          description: catalogBp.description || '',
          flavor: catalogBp.flavor || '',
          tags: catalogBp.tags || [],
          stats: catalogBp.stats || {},
          metadata: catalogBp.metadata || {},
          status: 'standby',
          config: { slot_assignments: {} },
          created_at: new Date().toISOString(),
        });
        State.set('spaceships', spaceships);
      }
    }

    _fireShipState();
    return true;
  }

  async function deactivateShip(bpId) {
    // Resolve the caller's id (catalog id, bp- variant, or UUID) to the id
    // the ship is actually activated under. Without this, clicking Remove on
    // a catalog card for a ship that was loaded from user_spaceships (where
    // _activatedShipIds holds the DB UUID) silently no-ops.
    const match = _resolveActivatedShipId(bpId);
    if (!match) return;
    _activatedShipIds = _activatedShipIds.filter(id => id !== match);
    _persistShips();

    // Resolve _shipState entry — keys may be raw id (DB-loaded ships) or bp-prefixed (catalog wizard)
    const stateKeyVariants = [match, bpId, 'bp-' + match, 'bp-' + bpId];
    let stateKey = null;
    let state = null;
    for (const k of stateKeyVariants) {
      if (k && _shipState[k]) { stateKey = k; state = _shipState[k]; break; }
    }

    // Resolve State.spaceships entry as a fallback source for slot data
    let stateShip = null;
    if (typeof State !== 'undefined') {
      const ships = State.get('spaceships') || [];
      stateShip = ships.find(s =>
        s.id === match || s.id === bpId ||
        s.id === 'bp-' + match || s.id === 'bp-' + bpId
      );
    }

    // Collect every agent ID assigned to this ship from any source.
    // Crew belongs to exactly one ship (invariant enforced by reassignAgentToShip
    // and the dedup pass in _resolveNewAgents), so every agent found here is removed.
    const agentIdsToRemove = new Set();
    const collect = (src) => {
      if (!src) return;
      if (src.slot_assignments) {
        Object.values(src.slot_assignments).forEach(id => { if (id) agentIdsToRemove.add(id); });
      }
      if (src.agent_ids) {
        src.agent_ids.forEach(id => { if (id) agentIdsToRemove.add(id); });
      }
    };
    collect(state);
    collect(stateShip);
    collect(stateShip?.config);

    const removedAgentIds = [];
    for (const agentId of agentIdsToRemove) {
      removedAgentIds.push(agentId);
      _activatedAgentIds = _activatedAgentIds.filter(id => id !== agentId);
      // Mirror the removal into the guest cache so a wipe-then-revisit
      // doesn't resurrect dead agents. Skipped for signed-in users —
      // user_agents is the SSOT and gets the delete below.
      if (_isGuestSession()) {
        try {
          const custom = _readLocalAgents();
          const filtered = custom.filter(a => a.id !== agentId);
          if (filtered.length !== custom.length) localStorage.setItem(Utils.KEYS.customAgents, JSON.stringify(filtered));
        } catch {}
      }
    }
    if (removedAgentIds.length) _persistAgents();

    // Remove from State.agents (in-memory)
    if (typeof State !== 'undefined' && removedAgentIds.length) {
      const agents = State.get('agents') || [];
      const removeSet = new Set(removedAgentIds);
      const cleaned = agents.filter(a => !removeSet.has(a.id));
      if (cleaned.length !== agents.length) State.set('agents', cleaned);
    }

    // Drop the _shipState entry under whichever key it lived
    if (stateKey) {
      delete _shipState[stateKey];
      _persistShipState();
    }

    // Remove from State.spaceships (in-memory) — match every plausible id form
    if (typeof State !== 'undefined') {
      const spaceships = State.get('spaceships') || [];
      const filtered = spaceships.filter(s => {
        if (stateShip && s.id === stateShip.id) return false;
        return s.id !== match && s.id !== bpId &&
               s.id !== 'bp-' + match && s.id !== 'bp-' + bpId;
      });
      if (filtered.length !== spaceships.length) State.set('spaceships', filtered);
    }

    _fireShipState();
    if (removedAgentIds.length) _fireAgentState();

    // Persist deletion to Supabase so the ship and its agents don't reappear on reload.
    // mission_runs cascades to ship_log; user_spaceships cascades to mission_runs.
    // Surface failures so silent UI/DB drift doesn't recur (see #ship-cascade-delete).
    if (_canSync()) {
      const shipRowId = (stateShip?.id && _isUuid(stateShip.id)) ? stateShip.id
        : (_isUuid(match) ? match : null);
      if (shipRowId) {
        try { await SB.db('user_spaceships').remove(shipRowId); }
        catch (e) {
          console.warn('[Blueprints] user_spaceships delete failed:', e.message);
          if (typeof Notify !== 'undefined') {
            Notify.send('Ship removal didn’t fully sync — reload to reconcile.', 'warning');
          }
        }
      }
      for (const agentId of removedAgentIds) {
        if (_isUuid(agentId)) {
          try { await SB.db('user_agents').remove(agentId); }
          catch (e) {
            console.warn('[Blueprints] user_agents delete failed:', e.message);
            if (typeof Notify !== 'undefined') {
              Notify.send('Agent removal didn’t fully sync — reload to reconcile.', 'warning');
            }
          }
        }
      }
    }

    // Safety net: sweep any agents whose slot mapping was missing from both
    // _shipState and State.spaceships at the moment of deletion. Without this
    // catch, those agents leak into "YOUR AGENTS" forever.
    await cleanupOrphans();
  }

  function _isUuid(s) {
    return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  }

  /**
   * Remove agents that aren't assigned to any active ship — comprehensive
   * cleanup across every persistence layer. Safe to call any time; idempotent.
   *
   * Cleans: `_activatedAgentIds`, `State.agents`, `customAgents` localStorage,
   * `_uuidMap`, and `user_agents` Supabase rows (UUIDs only, when signed in).
   *
   * Protected from removal:
   *   - agents assigned to a slot on any active ship (via `_shipState`
   *     OR `State.spaceships` — the latter covers DB-loaded ships whose
   *     `_shipState` row was never populated, which is the exact case
   *     that leaks crew when a ship is removed)
   *   - catalog blueprint agents (`bp-agent-*`)
   *   - unresolved placeholders (`__new__*`) — `_resolveNewAgents` owns these
   *
   * @returns {Promise<string[]>} IDs of orphans that were removed
   */
  async function cleanupOrphans(opts) {
    // `opts.scope`:
    //   - 'full' (default): local caches PLUS Supabase user_agents deletes
    //   - 'local': local caches only, never touches Supabase. Mandatory for
    //     init-time sweeps where State.spaceships hasn't hydrated and the
    //     assignedAgents set would be incomplete.
    // `opts.graceMs`: skip Supabase delete for orphans whose State.agents
    //   record shows a created_at within this many ms of now. Guards
    //   against races where an agent was just created by another flow
    //   (agent-builder → ship slot wiring) that hasn't finished yet.
    opts = opts || {};
    const scope = opts.scope === 'local' ? 'local' : 'full';
    const graceMs = typeof opts.graceMs === 'number' ? opts.graceMs : 5 * 60 * 1000;

    // Build set of agent IDs that are currently assigned to a live ship.
    const assignedAgents = new Set();
    const collect = (src) => {
      if (!src) return;
      if (src.slot_assignments) {
        Object.values(src.slot_assignments).forEach(id => { if (id) assignedAgents.add(id); });
      }
      if (src.agent_ids) {
        src.agent_ids.forEach(id => { if (id) assignedAgents.add(id); });
      }
    };
    for (const [, state] of Object.entries(_shipState)) collect(state);
    if (typeof State !== 'undefined') {
      const spaceships = State.get('spaceships') || [];
      spaceships.forEach(s => { collect(s); collect(s?.config); });
    }

    const isOrphan = (id) => {
      if (!id || typeof id !== 'string') return false;
      if (assignedAgents.has(id)) return false;
      if (id.startsWith('bp-agent-')) return false;
      if (id.startsWith('__new__')) return false;
      return true;
    };

    // Gather every agent ID referenced anywhere locally, then filter to orphans.
    const allLocalAgents = new Set();
    _activatedAgentIds.forEach(id => allLocalAgents.add(id));
    if (typeof State !== 'undefined') {
      (State.get('agents') || []).forEach(a => { if (a?.id) allLocalAgents.add(a.id); });
    }
    // Guest sessions only — for signed-in users every persisted custom
    // agent is already in State.agents via _loadUserCreations.
    if (_isGuestSession()) {
      _readLocalAgents().forEach(a => { if (a?.id) allLocalAgents.add(a.id); });
    }

    const orphanIds = [...allLocalAgents].filter(isOrphan);
    if (!orphanIds.length) return [];

    const orphanSet = new Set(orphanIds);

    // Snapshot agent metadata BEFORE local cleanup strips State.agents
    // (step 2 below). The Supabase delete gate reads created_at off this
    // index — without the snapshot, the grace-window check would always
    // miss and hard-delete young orphans.
    const agentIndex = new Map();
    if (typeof State !== 'undefined') {
      (State.get('agents') || []).forEach(a => { if (a?.id) agentIndex.set(a.id, a); });
    }

    // 1. _activatedAgentIds
    const beforeCount = _activatedAgentIds.length;
    _activatedAgentIds = _activatedAgentIds.filter(id => !orphanSet.has(id));
    if (_activatedAgentIds.length !== beforeCount) _persistAgents();

    // 2. State.agents (in-memory + subscriber notification)
    if (typeof State !== 'undefined') {
      const agents = State.get('agents') || [];
      const cleaned = agents.filter(a => !orphanSet.has(a?.id));
      if (cleaned.length !== agents.length) State.set('agents', cleaned);
    }

    // 3. customAgents localStorage — guest sessions only. Signed-in
    //    users don't read this cache (see _isGuestSession gates above),
    //    so leaving stale entries is harmless and skips unneeded I/O.
    if (_isGuestSession()) {
      try {
        const custom = _readLocalAgents();
        const filtered = custom.filter(a => !orphanSet.has(a?.id));
        if (filtered.length !== custom.length) {
          localStorage.setItem(Utils.KEYS.customAgents, JSON.stringify(filtered));
        }
      } catch {}
    }

    // 4. _uuidMap — drop mappings for removed local IDs
    let uuidMapDirty = false;
    for (const id of orphanIds) {
      if (_uuidMap[id]) { delete _uuidMap[id]; uuidMapDirty = true; }
    }
    if (uuidMapDirty) {
      try { localStorage.setItem(_KEYS.uuidMap, JSON.stringify(_uuidMap)); } catch {}
    }

    // 5. Supabase user_agents — delete only proper UUIDs, only when
    //    signed in, only in 'full' scope (never on init where
    //    State.spaceships may not have hydrated yet), and only for rows
    //    older than the grace window (protects agents created seconds
    //    ago by a concurrent flow that hasn't yet wired them to a slot).
    if (scope === 'full' && _canSync()) {
      const now = Date.now();
      for (const agentId of orphanIds) {
        if (!_isUuid(agentId)) continue;
        const agent = agentIndex.get(agentId);
        if (agent?.created_at) {
          const age = now - new Date(agent.created_at).getTime();
          if (Number.isFinite(age) && age >= 0 && age < graceMs) {
            continue; // young — defer delete to next sweep
          }
        }
        try { await SB.db('user_agents').remove(agentId); }
        catch (e) { console.warn('[Blueprints] cleanupOrphans remove failed:', e.message); }
      }
    }

    _fireAgentState();
    return orphanIds;
  }

  /**
   * Normalize a blueprint id to the set of equivalent forms we'll match on.
   * Handles bp- prefix + strip variants in one place.
   */
  function _bpIdVariants(bpId) {
    if (!bpId || typeof bpId !== 'string') return [];
    const set = new Set([bpId]);
    if (bpId.startsWith('bp-')) set.add(bpId.slice(3));
    else set.add('bp-' + bpId);
    return [...set];
  }

  /**
   * Resolve a blueprint id to the actual id under which the ship exists in
   * the user's local state, or null if the ship isn't in state at all.
   *
   * A ship is considered "activated" if it appears in ANY of these places:
   *
   *   1. `_activatedShipIds` — direct or bp- prefix variant match.
   *      (Wizard path for unlocked rarities: catalog id pushed directly.)
   *
   *   2. `State.spaceships[*].id` — exact or bp- variant match.
   *      Covers wizard-deployed ships whose State entry keys under
   *      `'bp-' + catalog-id` even when `_activatedShipIds` got the plain id.
   *
   *   3. `State.spaceships[*].blueprint_id` — catalog-id reverse lookup.
   *      Covers ships loaded from `user_spaceships` where `_activatedShipIds`
   *      holds the DB row UUID (not the catalog id), AND ships whose
   *      `activateShip()` call silently failed (rarity gate, any other
   *      reason) but whose State entry was still populated. This is the
   *      case that was missing for Mythic ships — `activateShip()` never
   *      pushed the catalog id because the rarity gate rejected it, so the
   *      previous version of this resolver had nothing in
   *      `_activatedShipIds` to walk through.
   *
   * Rationale: if the user has the ship in State at all — however it got
   * there — the catalog card should reflect that. Trusting State.spaceships
   * as a source of truth makes this resilient to every upstream bug that
   * forgets to populate `_activatedShipIds`.
   *
   * @returns {string|null} The id the ship is activated under (either the
   *                        entry in _activatedShipIds OR the State.spaceships
   *                        row id), or null if the ship is not present
   *                        anywhere in local state.
   */
  function _resolveActivatedShipId(bpId) {
    if (!bpId) return null;
    const queryVariants = new Set(_bpIdVariants(bpId));

    // 1. Direct / prefix-variant match against _activatedShipIds.
    for (const variant of queryVariants) {
      if (_activatedShipIds.includes(variant)) return variant;
    }

    // 2 + 3. Scan State.spaceships unconditionally. The ship is considered
    //        activated if its id OR its blueprint_id matches the query in any
    //        variant. Walking State directly means we don't depend on
    //        _activatedShipIds being in sync, which was the bug that kept
    //        Mythic (and silently-rarity-gated) ships showing Deploy.
    if (typeof State !== 'undefined') {
      const spaceships = State.get('spaceships') || [];
      for (const ship of spaceships) {
        if (!ship || !ship.id) continue;
        // Match by id (or bp- variant)
        for (const sv of _bpIdVariants(ship.id)) {
          if (queryVariants.has(sv)) return ship.id;
        }
        // Match by blueprint_id (or bp- variant)
        const linked = ship.blueprint_id || ship.blueprintId;
        if (linked) {
          for (const lv of _bpIdVariants(linked)) {
            if (queryVariants.has(lv)) return ship.id;
          }
        }
      }
    }

    return null;
  }

  function isShipActivated(bpId) {
    return _resolveActivatedShipId(bpId) !== null;
  }

  function getActivatedShipIds() {
    return [..._activatedShipIds];
  }

  /** Returns fully constructed spaceship objects from activated blueprint IDs */
  function getActivatedShips() {
    const result = [];
    _activatedShipIds.forEach(bpId => {
      let bp = getSpaceship(bpId);
      const shipId = bpId.startsWith('bp-') ? bpId : bpId;
      const saved = getShipState(bpId) || getShipState(shipId);

      // If not in seed catalog, check State for custom ships (Crew Designer)
      if (!bp) {
        const stateShips = (typeof State !== 'undefined' ? State.get('spaceships') : null) || [];
        bp = stateShips.find(s => s.id === bpId || s.id === shipId);
      }
      // Also check localStorage for persisted custom ships — guest-only.
      // Signed-in users have user_spaceships rows mirrored into State above.
      if (!bp && _isGuestSession()) {
        try {
          const stored = JSON.parse(localStorage.getItem(Utils.KEYS.customShips) || '[]');
          bp = stored.find(s => s.id === bpId || s.id === shipId);
        } catch {}
      }
      if (!bp) return;

      // Enrich with catalog blueprint data if blueprint_id links to a seed ship
      var catalogBp = null;
      var bpLinkId = bp.blueprint_id || bp.blueprintId;
      if (bpLinkId) {
        catalogBp = getSpaceship(bpLinkId) || getSpaceship('bp-' + bpLinkId);
      }

      const custom = typeof CardRenderer !== 'undefined' && CardRenderer.getCustomLabels
        ? CardRenderer.getCustomLabels(shipId) : {};
      const merged = Object.assign({}, catalogBp || {}, bp, {
        id: shipId,
        name: custom.name || bp.name,
        rarity: (catalogBp && catalogBp.rarity) || bp.rarity || 'Common',
        stats: (catalogBp && catalogBp.stats) || bp.stats,
        category: (catalogBp && catalogBp.category) || bp.category,
        status: saved?.status || bp.status || 'standby',
        slot_assignments: saved?.slot_assignments || bp.slot_assignments || {},
        agent_ids: saved?.agent_ids || [],
        created_at: bp.created_at || new Date().toISOString(),
        blueprint_id: bpId,
      });
      result.push(merged);
    });
    return result;
  }

  /* ═══════════════════════════════════════════════════════════════
     SHIP STATE persistence (slot assignments, deploy status)
  ═══════════════════════════════════════════════════════════════ */

  function getShipState(shipId) {
    return _shipState[shipId] || null;
  }

  function saveShipState(shipId, state) {
    _shipState[shipId] = {
      slot_assignments: state.slot_assignments || {},
      status: state.status || 'standby',
      agent_ids: state.agent_ids || [],
    };
    if (state.class_id) _shipState[shipId].class_id = state.class_id;

    // Enforce invariant: crew belongs to exactly one ship. Detach every agent
    // assigned here from any other ship's slots before we persist.
    const assignedAgents = new Set();
    Object.values(_shipState[shipId].slot_assignments).forEach(id => { if (id) assignedAgents.add(id); });
    (_shipState[shipId].agent_ids || []).forEach(id => { if (id) assignedAgents.add(id); });
    for (const agentId of assignedAgents) {
      for (const otherKey of Object.keys(_shipState)) {
        if (otherKey === shipId) continue;
        const os = _shipState[otherKey];
        if (os?.slot_assignments) {
          for (const slotKey of Object.keys(os.slot_assignments)) {
            if (os.slot_assignments[slotKey] === agentId) os.slot_assignments[slotKey] = null;
          }
        }
        if (Array.isArray(os?.agent_ids)) {
          os.agent_ids = os.agent_ids.filter(id => id !== agentId);
        }
      }
    }

    _persistShipState();
  }

  /** Remove an agent from all ships except `exceptShipId`, then persist */
  /** Atomically reassign a ship from `oldId` to `newId` across every
   *  local layer. Used by ShipSetupWizard when a successful
   *  user_spaceships insert returns a DB UUID that should supersede the
   *  catalog id the wizard was already using. Without this, the old id
   *  stays in `_activatedShipIds`, `_shipState`, and `State.spaceships`
   *  — a ghost ship that re-hydrates on every page load.
   *
   *  Does NOT touch agents, the DB, or anything downstream of state. The
   *  caller has already persisted whatever it needed to under `newId`. */
  function handoffShipId(oldId, newId) {
    if (!oldId || !newId || oldId === newId) return false;
    let changed = false;

    // _activatedShipIds — evict oldId (newId is the caller's responsibility)
    const before = _activatedShipIds.length;
    _activatedShipIds = _activatedShipIds.filter(id => id !== oldId);
    if (_activatedShipIds.length !== before) { _persistShips(); changed = true; }

    // _shipState — move entry if oldId present and newId empty
    if (_shipState[oldId]) {
      if (!_shipState[newId]) _shipState[newId] = _shipState[oldId];
      delete _shipState[oldId];
      _persistShipState();
      changed = true;
    }

    // State.spaceships — drop any stale entry under oldId
    if (typeof State !== 'undefined') {
      const ships = State.get('spaceships') || [];
      const filtered = ships.filter(s => s && s.id !== oldId);
      if (filtered.length !== ships.length) { State.set('spaceships', filtered); changed = true; }
    }

    if (changed) _fireShipState();
    return changed;
  }

  function reassignAgentToShip(agentId, targetShipId) {
    let changed = false;
    for (const shipId of Object.keys(_shipState)) {
      if (shipId === targetShipId) continue;
      const ss = _shipState[shipId];
      if (!ss?.slot_assignments) continue;
      for (const slotKey of Object.keys(ss.slot_assignments)) {
        if (ss.slot_assignments[slotKey] === agentId) {
          ss.slot_assignments[slotKey] = null;
          changed = true;
        }
      }
      if (ss.agent_ids) {
        const before = ss.agent_ids.length;
        ss.agent_ids = ss.agent_ids.filter(id => id !== agentId);
        if (ss.agent_ids.length !== before) changed = true;
      }
    }
    if (changed) _persistShipState();
    return changed;
  }

  /** Remove an agent from all ship slot_assignments in persisted state */
  function _pruneAgentFromShipState(agentId) {
    let changed = false;
    for (const shipId of Object.keys(_shipState)) {
      const ss = _shipState[shipId];
      if (!ss.slot_assignments) continue;
      for (const slotKey of Object.keys(ss.slot_assignments)) {
        if (ss.slot_assignments[slotKey] === agentId) {
          ss.slot_assignments[slotKey] = null;
          changed = true;
        }
      }
      if (ss.agent_ids) {
        const before = ss.agent_ids.length;
        ss.agent_ids = ss.agent_ids.filter(id => id !== agentId);
        if (ss.agent_ids.length !== before) changed = true;
      }
    }
    if (changed) _persistShipState();
  }

  /* ═══════════════════════════════════════════════════════════════
     Deactivate-all helpers
  ═══════════════════════════════════════════════════════════════ */

  function deactivateAllAgents() {
    _activatedAgentIds = [];
    _persistAgents();
    // Cascade: clear all ship slot assignments referencing blueprint agents
    if (typeof State !== 'undefined') {
      const spaceships = State.get('spaceships') || [];
      spaceships.forEach(ship => {
        if (!ship.slot_assignments) return;
        Object.keys(ship.slot_assignments).forEach(key => {
          if (ship.slot_assignments[key]?.startsWith('bp-')) ship.slot_assignments[key] = null;
        });
        if (ship.agent_ids) ship.agent_ids = ship.agent_ids.filter(id => !id.startsWith('bp-'));
      });
      State.set('spaceships', spaceships);
      State.set('agents', (State.get('agents') || []).filter(r => !r.blueprint_id));
    }
    // Prune all bp-agents from ship state
    for (const shipId of Object.keys(_shipState)) {
      const ss = _shipState[shipId];
      if (!ss.slot_assignments) continue;
      for (const key of Object.keys(ss.slot_assignments)) {
        if (ss.slot_assignments[key]?.startsWith('bp-')) ss.slot_assignments[key] = null;
      }
      if (ss.agent_ids) ss.agent_ids = ss.agent_ids.filter(id => !id.startsWith('bp-'));
    }
    _persistShipState();
    _fireAgentState();
  }

  function deactivateAllShips() {
    _activatedShipIds = [];
    _persistShips();
    _shipState = {};
    _persistShipState();
    if (typeof State !== 'undefined') {
      const spaceships = State.get('spaceships') || [];
      State.set('spaceships', spaceships.filter(s => !s.blueprint_id));
    }
    _fireShipState();
  }

  /* ═══════════════════════════════════════════════════════════════
     Paginated Catalog Search (server-side via Supabase)
     Returns { results, total, page, perPage, hasMore }
  ═══════════════════════════════════════════════════════════════ */

  async function searchCatalog({
    type = 'agent',
    query = '',
    rarity = null,
    category = null,
    sort = 'popular',
    page = 1,
    perPage = 24,
    // Scope filter: 'all' (default) surfaces both official catalog blueprints
    // and community-published ones side-by-side. 'official' narrows to the
    // seeded library; 'community' narrows to user-published blueprints.
    // This replaces the old separate Marketplace sub-tab.
    scope = 'all',
  } = {}) {
    // Phase B2 rewire: the legacy direct-query path (`from('blueprints')`
    // with tsvector full-text search + `marketplace_listings` left-join +
    // server-side pagination) is retired here. Reasons:
    //   - The new three-layer schema has no `search_vector` GIN index.
    //     With ~20 catalog rows post-wipe, in-memory filtering is fine.
    //   - Server-side pagination across three tables (capabilities,
    //     agent_blueprints, spaceship_blueprints) doesn't translate
    //     cleanly — the catalog is small enough to paginate locally.
    // The `blueprint-search` edge function was rewritten in Phase D.4
    // onto the same new tables (UNION across agent_blueprints +
    // spaceship_blueprints) — see `supabase/functions/blueprint-search/`.
    await ensureCatalogLoaded();
    return _searchCatalogLocal({ type, query, rarity, category, sort, page, perPage, scope });
  }

  function _searchCatalogLocal({ type, query, rarity, category, sort, page, perPage, scope = 'all' }) {
    let list = type === 'spaceship' ? [..._spaceships] : [..._agents];
    const q = (query || '').toLowerCase();

    // Scope filter (parallels the server query)
    if (scope === 'official') list = list.filter(b => (b.scope || 'catalog') === 'catalog');
    else if (scope === 'community') list = list.filter(b => b.scope === 'community');

    if (q) {
      const tokens = q.split(/\s+/).filter(Boolean);
      list = list.filter(b => {
        const haystack = ((b.name || '') + ' ' + (b.description || b.desc || '') + ' ' + (b.tags || []).join(' ')).toLowerCase();
        return tokens.every(t => haystack.includes(t));
      });
    }

    if (rarity) {
      if (type === 'spaceship') list = list.filter(b => b.recommended_class === rarity);
      else list = list.filter(b => (b.rarity || 'Common') === rarity);
    }

    if (category) list = list.filter(b => b.category === category);

    // Sort
    if (sort === 'popular') {
      list.sort((a, b) => (b.connected_count || b.downloads || 0) - (a.connected_count || a.downloads || 0));
    } else if (sort === 'rating') {
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sort === 'name-desc') {
      list.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    } else if (sort === 'rarity-desc') {
      const ro = { Mythic: 5, Legendary: 4, Epic: 3, Rare: 2, Common: 1 };
      list.sort((a, b) => (ro[b.rarity] || 0) - (ro[a.rarity] || 0));
    } else if (sort === 'rarity-asc') {
      const ro = { Mythic: 5, Legendary: 4, Epic: 3, Rare: 2, Common: 1 };
      list.sort((a, b) => (ro[a.rarity] || 0) - (ro[b.rarity] || 0));
    } else {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    const total = list.length;
    const from = (page - 1) * perPage;
    const results = list.slice(from, from + perPage);

    return {
      results,
      total,
      page,
      perPage,
      hasMore: from + results.length < total,
    };
  }

  /* ═══════════════════════════════════════════════════════════════
     Blueprint Sharing
  ═══════════════════════════════════════════════════════════════ */

  function _generateShareCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghkmnpqrstuvwxyz23456789';
    let code = '';
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  async function shareBlueprint(blueprintId, type) {
    if (typeof SB === 'undefined' || !SB.client) throw new Error('Not connected');
    const bp = type === 'agent' ? getAgent(blueprintId) : getSpaceship(blueprintId);
    if (!bp) throw new Error('Blueprint not found');

    const user = typeof State !== 'undefined' ? State.get('user') : null;
    if (!user) throw new Error('Sign in to share blueprints');

    const shareCode = _generateShareCode();
    const data = {
      id: bp.id, name: bp.name, type: bp.type || type,
      category: bp.category, description: bp.description,
      rarity: bp.rarity, config: bp.config,
    };
    if (type === 'spaceship' && bp.crew) data.crew = bp.crew;

    const { error } = await SB.client
      .from('shared_blueprints')
      .insert({ blueprint_type: type, data, creator_id: user.id, share_code: shareCode });

    if (error) throw new Error(error.message);
    return shareCode;
  }

  async function importSharedBlueprint(shareCode) {
    if (typeof SB === 'undefined' || !SB.client) throw new Error('Not connected');

    const { data: rows, error } = await SB.client
      .from('shared_blueprints')
      .select('*')
      .eq('share_code', shareCode)
      .gt('expires_at', new Date().toISOString())
      .limit(1);

    if (error) throw new Error(error.message);
    if (!rows || !rows.length) throw new Error('Share link expired or not found');

    const shared = rows[0];

    // Increment import count (fire and forget)
    SB.client.from('shared_blueprints')
      .update({ import_count: (shared.import_count || 0) + 1 })
      .eq('id', shared.id).then(() => {});

    return { type: shared.blueprint_type, data: shared.data, createdAt: shared.created_at };
  }

  /* ═══════════════════════════════════════════════════════════════
     Marketplace
     ────────────────────────────────────────────────────────────────
     Community blueprints live in `agent_blueprints` or
     `spaceship_blueprints` (Phase D), discriminated by
     `scope='community'`. The `marketplace_listings` row sidecar carries
     rating / downloads / author / publish state; its `category` column
     ('agent'|'spaceship') points at the right blueprint table.

     searchCatalog() loads the catalog in-memory and filters locally —
     the catalog is small post-wipe, so the listing sidecar comes
     through the same `_agents` / `_spaceships` cache rather than a
     server-side join. The helpers below are for the actions (rate /
     install counter / publish / unpublish / download / review lookup)
     that can't be bundled into the browse query.
  ═══════════════════════════════════════════════════════════════ */

  async function getMyMarketplaceReview(listingId) {
    if (!SB?.client) return null;
    const user = State.get('user');
    if (!user) return null;
    try {
      const { data } = await SB.client
        .from('marketplace_reviews')
        .select('rating, comment')
        .eq('listing_id', listingId)
        .eq('user_id', user.id)
        .maybeSingle();
      return data || null;
    } catch { return null; }
  }

  /**
   * Upsert the caller's review and let the DB keep the listing aggregate
   * in sync. A trigger on marketplace_reviews recomputes rating /
   * rating_count from the actual review rows, so there's no client math
   * to race.
   *
   * Self-review is still blocked defensively before the network call —
   * the RLS policy enforces it on the server, but catching it early
   * gives a cleaner error message than a generic RLS violation.
   */
  async function rateMarketplaceListing(listingId, rating) {
    const c = SB?.client;
    if (!c) throw new Error('Not connected');
    const user = State.get('user');
    if (!user) throw new Error('Sign in to rate');

    const { data: listing, error: lerr } = await c
      .from('marketplace_listings')
      .select('id, author_id')
      .eq('id', listingId)
      .maybeSingle();
    if (lerr) throw lerr;
    if (!listing) throw new Error('Listing not found');
    if (listing.author_id && listing.author_id === user.id) {
      throw new Error("You can't rate your own listing");
    }

    const { error: uerr } = await c
      .from('marketplace_reviews')
      .upsert(
        { listing_id: listingId, user_id: user.id, rating },
        { onConflict: 'listing_id,user_id' }
      );
    if (uerr) throw uerr;

    // Re-read the authoritative aggregate the trigger just computed.
    const { data: after } = await c
      .from('marketplace_listings')
      .select('rating, rating_count')
      .eq('id', listingId)
      .maybeSingle();

    return {
      rating: Number(after?.rating || 0),
      rating_count: Number(after?.rating_count || 0),
    };
  }

  async function incrementMarketplaceDownloads(listingId) {
    const c = SB?.client;
    if (!c) return;
    try {
      await c.rpc('increment_listing_download', { p_listing_id: listingId });
    } catch { /* non-critical */ }
  }

  /**
   * Submit a user-built agent or spaceship to the community library.
   *
   * The entire gate stack runs server-side in the community-submit edge
   * function: ownership check, re-publish detection, rate limit, secret
   * scan, schema validation, config sanitization (for ships: stripping
   * user-specific agent IDs from slot_assignments and replacing with
   * slot_placeholders), content hashing, blueprint+listing insert with
   * rollback. The client is a thin wrapper that maps error codes to
   * actionable messages.
   *
   * Putting the gates on the client would let anyone with a browser
   * devtools session bypass them — they have to live server-side.
   *
   * @param {{ type: 'agent'|'spaceship', id: string }} entity
   * @param {{ title?: string, description?: string, tags?: string[] }} [opts]
   */
  async function publishToCommunity(entity, { title, description, tags } = {}) {
    const c = SB?.client;
    if (!c) throw new Error('Not connected');
    const user = State.get('user');
    if (!user) throw new Error('Sign in to publish');
    if (!entity || !entity.id) throw new Error('Missing entity id');

    const type = entity.type === 'spaceship' ? 'spaceship' : 'agent';

    const { data, error } = await c.functions.invoke('community-submit', {
      body: { entity_id: entity.id, entity_type: type, title, description, tags },
    });

    // The Supabase client wraps any non-2xx into `error`; the response body
    // still comes through (on recent client versions) as `data`, but older
    // ones bury it in error.context. Try both so we surface the server's
    // actionable message regardless of client version.
    if (error) {
      let srv = null;
      if (data && typeof data === 'object') srv = data;
      else if (error && error.context && typeof error.context.json === 'function') {
        try { srv = await error.context.json(); } catch { /* ignore */ }
      }
      throw new Error(_friendlyPublishError(srv, error));
    }
    if (data && data.error) throw new Error(_friendlyPublishError(data));
    return { blueprint: data.blueprint, listing: data.listing, content_hash: data.content_hash };
  }

  /**
   * Map edge-function error codes to actionable user-facing messages.
   * Keeping this mapping on the client (not in the edge function) lets
   * copy change without redeploying the function.
   */
  function _friendlyPublishError(srv, fallbackErr) {
    if (!srv || !srv.error) {
      return (fallbackErr && fallbackErr.message) || 'Submission failed';
    }
    switch (srv.error) {
      case 'secret_detected':        return srv.message || 'Your submission contains a credential. Remove it and try again.';
      case 'schema_invalid':         return srv.message || 'Blueprint configuration is invalid.';
      case 'not_owner':              return srv.message || 'You can only publish things you created';
      case 'already_published':      return srv.message || 'Already published — unpublish first to edit';
      case 'rate_limited':           return srv.message || 'Publish limit reached — you can publish 5 per day. Try again tomorrow.';
      case 'blueprint_insert_failed':
      case 'listing_insert_failed':  return 'Submission failed while saving. Please try again.';
      case 'invalid_request':        return srv.message || 'Invalid submission';
      case 'unauthorized':           return 'Sign in to publish';
      default:                       return srv.message || 'Submission failed';
    }
  }

  /**
   * Unpublish a community blueprint the caller owns. Deletes both the
   * marketplace_listings row and the community blueprints snapshot — the
   * underlying user_agents / user_spaceships row is untouched, so the
   * author can edit it and re-publish.
   */
  async function unpublishFromCommunity(blueprintId) {
    const c = SB?.client;
    if (!c) throw new Error('Not connected');
    const user = State.get('user');
    if (!user) throw new Error('Sign in to unpublish');
    if (!blueprintId) throw new Error('Missing blueprint id');

    // Phase D.5: blueprint snapshot now lives in agent_blueprints or
    // spaceship_blueprints. listing.category is the discriminator —
    // matches the pattern community-review uses on the server side.
    const { data: listing } = await c
      .from('marketplace_listings')
      .select('category')
      .eq('blueprint_id', blueprintId)
      .eq('author_id', user.id)
      .maybeSingle();

    const { error: lerr } = await c
      .from('marketplace_listings')
      .delete()
      .eq('blueprint_id', blueprintId)
      .eq('author_id', user.id);
    if (lerr) throw lerr;

    if (!listing) return { ok: true };

    const targetTable = listing.category === 'spaceship'
      ? 'spaceship_blueprints'
      : 'agent_blueprints';

    const { error: berr } = await c
      .from(targetTable)
      .delete()
      .eq('id', blueprintId)
      .eq('scope', 'community')
      .eq('creator_id', user.id);
    if (berr) throw berr;

    return { ok: true };
  }

  /**
   * Install a community blueprint into the caller's own user_agents /
   * user_spaceships. Unlike catalog activation — which just flips the
   * blueprint id into the user's activated list — this creates a fresh
   * row the downloader fully owns: they can edit, re-publish, delete.
   *
   * The new row's blueprint_id is set to the source community blueprint's
   * id, which doubles as the lineage pointer (so the UI can surface
   * "installed from @author's X" later) and the "already downloaded"
   * detection key used by hasDownloadedCommunity().
   *
   * For ships, slot_placeholders from the community snapshot is expanded
   * into an empty slot_assignments map keyed by the original slot index —
   * the publisher's private agent UUIDs were already stripped at publish
   * time, so the downloader's setup wizard picks up empty slots to fill.
   *
   * Fires a best-effort increment_listing_download RPC after the insert.
   *
   * @param {string} blueprintId — community blueprints.id
   * @param {{ listingId?: string }} [opts]
   * @returns {{ id, type, name, blueprint_id }} the new user row
   */
  async function downloadCommunityBlueprint(blueprintId, { listingId } = {}) {
    const c = SB?.client;
    if (!c) throw new Error('Not connected');
    const user = State.get('user');
    if (!user) throw new Error('Sign in to install');
    if (!blueprintId) throw new Error('Missing blueprint id');

    // Phase D.5: source row lives in agent_blueprints or
    // spaceship_blueprints. The marketplace_listings.category column is
    // the discriminator; a blueprint without a listing is unreachable
    // from browse, so a missing listing is "not available".
    const { data: listing, error: derr } = await c
      .from('marketplace_listings')
      .select('category')
      .eq('blueprint_id', blueprintId)
      .maybeSingle();
    if (derr) throw derr;
    if (!listing) throw new Error('This blueprint is not available in the community');

    const sourceTable = listing.category === 'spaceship'
      ? 'spaceship_blueprints'
      : 'agent_blueprints';
    const type = listing.category === 'spaceship' ? 'spaceship' : 'agent';

    const { data: bp, error: berr } = await c
      .from(sourceTable)
      .select('*')
      .eq('id', blueprintId)
      .eq('scope', 'community')
      .maybeSingle();
    if (berr) throw berr;
    if (!bp) throw new Error('This blueprint is not available in the community');

    const table = type === 'spaceship' ? 'user_spaceships' : 'user_agents';

    // Sanitize the snapshotted config. Drop scope-bound / author-bound
    // fields that shouldn't propagate into the downloader's own row.
    const cfg = Object.assign({}, bp.config || {});

    let placeholderAssignments = null;
    if (type === 'spaceship') {
      // Expand slot_placeholders into an empty assignments map keyed by
      // slot index. After insert we persist the empty rows to
      // user_ship_slots so the schematic / wizard knows the slot space.
      const placeholders = Array.isArray(cfg.slot_placeholders) ? cfg.slot_placeholders : [];
      placeholderAssignments = {};
      placeholders.forEach((p) => {
        const idx = typeof p === 'object' ? p.slot : p;
        if (idx != null && !isNaN(Number(idx))) placeholderAssignments[String(idx)] = null;
      });
      delete cfg.slot_placeholders;
      delete cfg.slot_assignments;
    }

    // Put back hoisted top-level fields so the downloader's copy surfaces
    // description / flavor / tags through the existing loaders.
    if (bp.description) cfg.description = bp.description;
    if (bp.flavor)      cfg.flavor      = bp.flavor;
    if (Array.isArray(bp.tags) && bp.tags.length) cfg.tags = bp.tags;

    const row = type === 'spaceship'
      ? {
          user_id:      user.id,
          name:         bp.name || 'Untitled',
          blueprint_id: blueprintId,
          category:     bp.category || null,
          rarity:       bp.rarity || 'Common',
          status:       'standby',
          config:       cfg,
        }
      : {
          user_id:      user.id,
          name:         bp.name || 'Untitled',
          blueprint_id: blueprintId,
          config:       cfg,
          rarity:       bp.rarity || 'Common',
          status:       'idle',
        };

    const { data: created, error: ierr } = await c
      .from(table)
      .insert(row)
      .select()
      .maybeSingle();
    if (ierr) throw ierr;

    // Slot assignments live in user_ship_slots (Phase C.1). The downloader
    // gets empty slot rows so the wizard / Schematic knows the slot space.
    if (type === 'spaceship' && created?.id && placeholderAssignments
        && Object.keys(placeholderAssignments).length
        && typeof ShipSlots !== 'undefined') {
      try { await ShipSlots.setForShip(created.id, placeholderAssignments); }
      catch { /* slot rows are not load-bearing for catalog browse */ }
    }

    // Increment the download counter on the listing. Best effort — we
    // already wrote the row, and the RPC is RLS-gated server-side.
    if (listingId) {
      try { await c.rpc('increment_listing_download', { p_listing_id: listingId }); }
      catch { /* swallow — counter is not load-bearing */ }
    }

    // Mirror the new row into State so the browse UI can immediately
    // reflect "already downloaded" without a full reload.
    try {
      const stateKey = type === 'spaceship' ? 'spaceships' : 'agents';
      const arr = State.get(stateKey) || [];
      if (!arr.some(e => e.id === created.id)) {
        arr.push(Object.assign({ type }, created));
        State.set(stateKey, arr);
      }
    } catch { /* state update failure is not load-bearing */ }

    return created;
  }

  /**
   * Report a community blueprint for moderation. Writes one row to
   * community_reports; UNIQUE(blueprint_id, reporter_id) means the same
   * caller can't stack reports. RLS blocks authors from reporting their
   * own blueprints, and the server trigger auto-flips the listing to
   * status='flagged' at >=3 distinct reporters.
   *
   * @param {string} blueprintId
   * @param {{ reason: 'spam'|'offensive'|'malicious'|'copyright'|'broken'|'other', details?: string }} opts
   */
  async function reportCommunityBlueprint(blueprintId, { reason, details } = {}) {
    const c = SB?.client;
    if (!c) throw new Error('Not connected');
    const user = State.get('user');
    if (!user) throw new Error('Sign in to report');
    if (!blueprintId) throw new Error('Missing blueprint id');
    const validReasons = ['spam', 'offensive', 'malicious', 'copyright', 'broken', 'other'];
    if (!validReasons.includes(reason)) throw new Error('Pick a reason');

    const { error } = await c.from('community_reports').insert({
      blueprint_id: blueprintId,
      reporter_id:  user.id,
      reason,
      details:      details ? String(details).slice(0, 1000) : null,
    });
    if (error) {
      // Surface the two most common failures with friendly language
      if (error.code === '23505' || /duplicate/.test(error.message || '')) {
        throw new Error("You've already reported this.");
      }
      if (error.code === '42501' || /row-level security/.test(error.message || '')) {
        throw new Error("You can't report your own blueprint.");
      }
      throw error;
    }
    return { ok: true };
  }

  /**
   * Has the current user already downloaded this community blueprint?
   * Backed by State.agents / State.spaceships scanning for rows whose
   * blueprint_id matches — so no extra DB round-trip per card.
   */
  function hasDownloadedCommunity(blueprintId) {
    if (!blueprintId) return false;
    const agents = State.get('agents') || [];
    if (agents.some(a => a.blueprint_id === blueprintId)) return true;
    const ships = State.get('spaceships') || [];
    return ships.some(s => s.blueprint_id === blueprintId);
  }

  /* ═══════════════════════════════════════════════════════════════
     Public API
  ═══════════════════════════════════════════════════════════════ */

  return {
    // Init
    init, isReady,

    // Catalog queries
    getAgent, listAgents, getSpaceship, listSpaceships,
    listCapabilities, listCharacters, getCapability,
    listMyBlueprints,
    get,

    // Private agent creation (blueprint + activation)
    createPrivateAgent,

    // Agent activation
    activateAgent, deactivateAgent, isAgentActivated,
    getActivatedAgentIds, getActivatedAgents,
    resolveLiveAgent, refreshActivatedAgentsFromCatalog,

    // Ship activation
    activateShip, deactivateShip, isShipActivated, cleanupOrphans,
    getActivatedShipIds, getActivatedShips, findOrCreateActiveShip,

    // Ship state persistence
    getShipState, saveShipState, reassignAgentToShip, handoffShipId,

    // Agent UUID mapping (local ID ↔ Supabase UUID)
    setAgentUuid, getAgentUuid,

    // Bulk deactivation
    deactivateAllAgents, deactivateAllShips,

    // Connected counts
    getConnectedCount,

    // Lazy catalog loading
    ensureCatalogLoaded,

    // Heal State.spaceships entries whose stats came from the pre-catalog
    // fallback in _loadUserCreations. Exposed for testability and as an
    // escape hatch — _finalizeCatalogLoad already calls it on every load.
    healStaleShipStats: _healStaleShipStats,

    // Search & serial key lookup
    search, searchCatalog, getBySerial,

    // Guest → authenticated migration
    migrateGuestState,

    // Sharing
    shareBlueprint, importSharedBlueprint,

    // Marketplace — listing browse is handled by searchCatalog with its
    // left-join on marketplace_listings; these are the action helpers.
    getMyMarketplaceReview, rateMarketplaceListing,
    incrementMarketplaceDownloads,
    publishToCommunity, unpublishFromCommunity,
    downloadCommunityBlueprint, hasDownloadedCommunity,
    reportCommunityBlueprint,
  };

  /**
   * Migrate guest localStorage data to Supabase on first sign-in.
   * Call this after successful authentication.
   */
  async function migrateGuestState() {
    if (!_canSync()) return;
    const userId = _getUserId();
    if (!userId) return;

    // Migrate guest agents
    try {
      const guestAgents = _readLocalAgents();
      const toMigrate = guestAgents.filter(a => a._guest);
      for (const agent of toMigrate) {
        const { _guest, id, ...row } = agent;
        row.user_id = userId;
        try {
          const created = await SB.db('user_agents').create(row);
          if (created?.id) {
            // Update local references from guest ID to real ID
            _activatedAgentIds = _activatedAgentIds.map(aid => aid === id ? created.id : aid);
            agent.id = created.id;
            delete agent._guest;
          }
        } catch (e) { /* skip duplicates */ }
      }
      localStorage.setItem(Utils.KEYS.customAgents, JSON.stringify(guestAgents));
      _persistAgents();
    } catch {}

    // Migrate guest ships
    try {
      const guestShips = JSON.parse(localStorage.getItem(Utils.KEYS.customShips) || '[]');
      const toMigrate = guestShips.filter(s => s._guest);
      for (const ship of toMigrate) {
        const { _guest, id, ...row } = ship;
        row.user_id = userId;
        const guestAssignments = (row.config && row.config.slot_assignments) || ship.slot_assignments || null;
        if (row.config && row.config.slot_assignments) {
          row.config = Object.assign({}, row.config);
          delete row.config.slot_assignments;
        }
        try {
          const { ship: created } = await findOrCreateActiveShip(row.blueprint_id || null, () => row);
          if (created?.id) {
            _activatedShipIds = _activatedShipIds.map(sid => sid === id ? created.id : sid);
            ship.id = created.id;
            delete ship._guest;
            if (guestAssignments && Object.keys(guestAssignments).length && typeof ShipSlots !== 'undefined') {
              try { await ShipSlots.setForShip(created.id, guestAssignments); } catch {}
            }
          }
        } catch (e) { /* skip duplicates */ }
      }
      localStorage.setItem(Utils.KEYS.customShips, JSON.stringify(guestShips));
      _persistShips();
    } catch {}

    // After migration, reload the user's existing ships + agents from
    // Supabase. init() only runs at app boot; a returning user signing
    // in mid-session would otherwise see an empty schematic until they
    // hard-refreshed. Fires activated-ships when complete so the
    // Schematic view re-renders with the freshly loaded data.
    try {
      await Promise.all([
        _loadActivatedFromDB(),
        _loadUserCreations(),
      ]);
      await _resolveNewAgents();
      _purgeStaleIds();
      _fireShipState();
      _fireAgentState();
    } catch (e) {
      console.warn('[Blueprints] post-signin reload failed:', e.message);
    }
  }
})();
