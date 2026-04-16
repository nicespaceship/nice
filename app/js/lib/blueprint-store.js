/* ═══════════════════════════════════════════════════════════════════
   NICE — Blueprint Store
   Supabase-backed blueprint catalog with client-side SEED fallback.
   Loads agents, spaceships, and fleets from the database; merges with
   seed arrays so the app works offline or before DB tables exist.

   Also serves as the **single source of truth** for blueprint activation
   state — which agents and spaceships the user has activated.
   All views should read/write activation through this module.
═══════════════════════════════════════════════════════════════════ */

const BlueprintStore = (() => {
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
    catalogCache: 'nice-bp-catalog-v2',
    catalogCacheTs: 'nice-bp-catalog-v2-ts',
  };

  const _CACHE_TTL = 60 * 60 * 1000; // 1 hour

  /* ═══════════════════════════════════════════════════════════════
     Initialization
  ═══════════════════════════════════════════════════════════════ */

  async function init() {
    _loadSeeds();
    _loadActivationState();

    // Only fetch activated blueprints + counts on init (lazy catalog)
    try {
      if (typeof SB !== 'undefined' && SB.isReady() && SB.isOnline()) {
        await Promise.all([
          _loadActivatedFromDB(),
          _loadConnectedCounts(),
          _loadUserCreations(),
        ]);
      }
    } catch (e) {
      console.warn('[BlueprintStore] DB load failed, using seeds:', e.message);
    }

    // Single mock-count pass after all loading is done
    _seedMockCounts();

    // Resolve any __new__ agent IDs in ship states into real agents
    _resolveNewAgents();

    // Purge stale IDs that no longer exist in catalog
    _purgeStaleIds();

    // Heal legacy state drift: ships deployed via the old ShipSetupWizard
    // (pre-SSOT rewrite) used the 'bp-' + catalog_id convention for
    // _shipState keys and State.spaceships entry ids, while _activatedShipIds
    // held the plain catalog id. After the SSOT rewrite those layers share
    // one id, but existing users carry the divergence forward. This pass
    // canonicalises them on the next boot — idempotent for clean state.
    try { _reconcileShipState(); }
    catch (e) { console.warn('[BlueprintStore] init _reconcileShipState failed:', e.message); }

    // Sweep any agents whose parent ship was already removed — heals users
    // who already have orphans from prior deactivateShip calls that missed
    // them. Idempotent and no-op for clean state.
    try { await cleanupOrphans(); }
    catch (e) { console.warn('[BlueprintStore] init cleanupOrphans failed:', e.message); }

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
  function _resolveNewAgents() {
    let dirty = false;
    const customAgents = JSON.parse(localStorage.getItem(Utils.KEYS.customAgents) || '[]');
    const customById = new Map(customAgents.map(a => [a.id, a]));

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
            if (!_activatedAgentIds.includes(existing.id)) _activatedAgentIds.push(existing.id);
            dirty = true;
            continue;
          }

          const node = nodes.find(n => n.label === agentName);
          const newId = `agent-${shipBpId}-${slotIdx}`;
          const newAgent = {
            id: newId, name: agentName,
            category: node?.config?.agentRole || 'Ops',
            rarity: node?.rarity || 'Common',
            config: node?.config || { role: agentName, type: 'Agent', llm_engine: 'claude-4', tools: [] },
            stats: { spd: 7, acc: 8, cap: 6, pwr: 7 },
            tags: [], activated: true,
          };
          customAgents.push(newAgent);
          customById.set(newId, newAgent);
          if (!_activatedAgentIds.includes(newId)) _activatedAgentIds.push(newId);
          state.slot_assignments[slotIdx] = newId;
          dirty = true;
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
              const newAgent = {
                id: agentId, name: node.label,
                category: node.config?.agentRole || 'Ops',
                rarity: node.rarity || 'Common',
                config: node.config || { role: node.label, type: 'Agent', llm_engine: 'claude-4', tools: [] },
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
      localStorage.setItem(Utils.KEYS.customAgents, JSON.stringify(customAgents));
      _persistAgents();
      _persistShipState();
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

  /** Load only the user's activated blueprints from DB (fast init) */
  async function _loadActivatedFromDB() {
    try {
      const c = SB.client;
      if (!c || typeof c.from !== 'function') return;

      // Collect all IDs we need data for
      const ids = [...new Set([..._activatedAgentIds, ..._activatedShipIds])];
      if (!ids.length) return;

      const { data: rows, error } = await c
        .from('blueprints')
        .select('*')
        .in('id', ids);

      if (error || !rows || !rows.length) return;
      _mergeRows(rows);
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
        const stateShips = State.get('spaceships') || [];
        const existingIds = new Set(stateShips.map(s => s.id));
        ships.forEach(s => {
          const meta = s.slots || {};
          // Cross-reference blueprint catalog for rarity/stats if blueprint_id exists
          var catalogBp = null;
          if (s.blueprint_id) {
            catalogBp = getSpaceship(s.blueprint_id) || getSpaceship('bp-' + s.blueprint_id);
          }
          if (!existingIds.has(s.id)) {
            var crewCount = 0;
            if (meta.slot_assignments) crewCount = Object.keys(meta.slot_assignments).length;
            else if (Array.isArray(meta.crew)) crewCount = meta.crew.length;

            stateShips.push({
              id: s.id, name: s.name, type: 'spaceship',
              category: (catalogBp && catalogBp.category) || meta.category || '',
              description: (catalogBp && catalogBp.description) || meta.description || '',
              flavor: (catalogBp && catalogBp.flavor) || meta.flavor || '',
              tags: (catalogBp && catalogBp.tags) || meta.tags || [],
              rarity: (catalogBp && catalogBp.rarity) || meta.rarity || 'Common',
              status: s.status || 'standby',
              config: { slot_assignments: meta.slot_assignments || {} },
              stats: (catalogBp && catalogBp.stats) || meta.stats || { crew: String(crewCount), slots: '6' },
              metadata: (catalogBp && catalogBp.metadata) || { caps: meta.caps || [] },
              blueprint_id: s.blueprint_id,
              created_at: s.created_at,
            });
          }
          // Auto-activate — ships in user_spaceships are OWNED, always activate
          // Rarity gate only applies to NEW activations from the catalog
          if (!_activatedShipIds.includes(s.id)) {
            _activatedShipIds.push(s.id);
          }
          // Always restore ship state (slot assignments) from DB
          // Handle both formats: slot_assignments object and crew array
          var assignments = meta.slot_assignments || {};
          var agentIds = [];
          if (Object.keys(assignments).length) {
            agentIds = Object.values(assignments).filter(Boolean);
          } else if (Array.isArray(meta.crew) && meta.crew.length) {
            meta.crew.forEach(function(c, idx) {
              if (c.agent_id) { assignments[String(idx)] = c.agent_id; agentIds.push(c.agent_id); }
            });
          }
          // Backfill missing slots from catalog crew (Legendary/Mythic ships should be full)
          if (catalogBp) {
            var catalogCrew = catalogBp.metadata?.crew || catalogBp.crew || [];
            var totalSlots = parseInt(catalogBp.stats?.slots || '6', 10);
            if (catalogCrew.length > Object.keys(assignments).length) {
              catalogCrew.forEach(function(c, idx) {
                var key = String(idx);
                if (!assignments[key]) {
                  // Use __new__ prefix so ShipSetupWizard can resolve them
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
      console.warn('[BlueprintStore] Failed to load user creations:', e.message);
    }
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
      return;
    }

    try {
      const c = SB.client;
      if (!c || typeof c.from !== 'function') { _catalogLoaded = true; return; }

      // Load both catalog AND community scopes. The scope discriminator
      // is applied by the list/search methods (which filter to scope='catalog'
      // for Agents/Spaceships browsing), not at the cache level — a
      // single-row lookup by ID must succeed regardless of scope, so
      // activated marketplace blueprints still resolve after install.
      const { data: rows, error } = await c
        .from('blueprints')
        .select('*')
        .eq('is_public', true)
        .order('name', { ascending: true });

      if (!error && rows && rows.length) {
        _mergeRows(rows);
        // Cache the results
        try {
          localStorage.setItem(_KEYS.catalogCache, JSON.stringify(rows));
          localStorage.setItem(_KEYS.catalogCacheTs, String(Date.now()));
        } catch { /* storage full — still works without cache */ }
      }
    } catch { /* seed fallback */ }

    _catalogLoaded = true;
    _seedMockCounts(); // Cover newly loaded blueprints
  }

  /** Fetch only blueprints updated since lastSync and merge them */
  async function _diffSyncCatalog(lastSyncIso) {
    try {
      const c = SB.client;
      if (!c || typeof c.from !== 'function') return;

      const { data: rows, error } = await c
        .from('blueprints')
        .select('*')
        .eq('is_public', true)
        .gt('updated_at', lastSyncIso)
        .order('name', { ascending: true });

      if (error || !rows || !rows.length) return;

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
        console.warn('[BlueprintStore] Edge Function search failed, falling back:', e.message);
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

  /* ═══════════════════════════════════════════════════════════════
     Cloud sync — blueprint_activations table
  ═══════════════════════════════════════════════════════════════ */

  function _getUserId() {
    if (typeof State === 'undefined') return null;
    const u = State.get('user');
    return u?.id || null;
  }

  function _canSync() {
    return typeof SB !== 'undefined' && SB.isReady() && SB.isOnline() && _getUserId();
  }

  async function _syncActivation(blueprintId, blueprintType) {
    if (!_canSync()) return;
    try {
      await SB.db('blueprint_activations').create({
        user_id: _getUserId(),
        blueprint_id: blueprintId,
        blueprint_type: blueprintType
      });
      // Increment local count
      _connectedCounts[blueprintId] = (_connectedCounts[blueprintId] || 0) + 1;
    } catch (e) {
      if (!String(e).includes('duplicate')) console.warn('[BlueprintStore] Activation sync failed:', e.message);
    }
  }

  async function _syncDeactivation(blueprintId, blueprintType) {
    if (!_canSync()) return;
    const c = SB.client;
    if (!c || typeof c.from !== 'function') return;
    try {
      const userId = _getUserId();
      await c.from('blueprint_activations')
        .delete()
        .eq('user_id', userId)
        .eq('blueprint_id', blueprintId)
        .eq('blueprint_type', blueprintType);
      // Decrement local count
      if (_connectedCounts[blueprintId] > 0) _connectedCounts[blueprintId]--;
    } catch (e) {
      console.warn('[BlueprintStore] Deactivation sync failed:', e.message);
    }
  }

  async function _loadConnectedCounts() {
    if (typeof SB === 'undefined' || !SB.isReady() || !SB.isOnline()) return;
    const c = SB.client;
    if (!c || typeof c.from !== 'function') return; // Client not ready yet
    try {
      const { data, error } = await c
        .from('blueprint_activation_counts')
        .select('blueprint_id, connected_count');
      if (error) throw error;
      if (data && data.length > 0) {
        _connectedCounts = {};
        data.forEach(row => { _connectedCounts[row.blueprint_id] = row.connected_count; });
      }
    } catch (e) {
      // Silently fall back to mock counts — Supabase tables may not exist yet
    }
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
    // Check custom agents (auto-created from ship auto-fill)
    if (typeof State !== 'undefined') {
      a = (State.get('agents') || []).find(a => a.id === id);
      if (a) return a;
    }
    try { a = (JSON.parse(localStorage.getItem(Utils.KEYS.customAgents) || '[]')).find(a => a.id === id); } catch {}
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
    try {
      const guestShips = JSON.parse(localStorage.getItem(Utils.KEYS.customShips) || '[]');
      guestShips.forEach(s => { if (s && s.id && !seen.has(s.id)) { ships.push(s); seen.add(s.id); } });
    } catch {}
    try {
      const guestAgents = JSON.parse(localStorage.getItem(Utils.KEYS.customAgents) || '[]');
      guestAgents.forEach(a => { if (a && a.id && !seen.has(a.id)) { agents.push(a); seen.add(a.id); } });
    } catch {}
    return { spaceships: ships, agents: agents };
  }

  function get(id) {
    return getAgent(id) || getSpaceship(id);
  }

  function isReady() {
    return _ready;
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
    _syncActivation(bpId, 'agent');
    _fireAgentState();
    return true;
  }

  function deactivateAgent(bpId) {
    // Normalize: find the matching ID in the array (with or without bp- prefix)
    const match = _activatedAgentIds.find(id => id === bpId || 'bp-' + id === bpId || id === 'bp-' + bpId);
    if (!match) return;
    _activatedAgentIds = _activatedAgentIds.filter(id => id !== match);
    _persistAgents();
    _syncDeactivation(bpId, 'agent');

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

  /** Returns fully constructed agent objects from activated blueprint IDs */
  function getActivatedAgents() {
    const result = [];
    _activatedAgentIds.forEach(bpId => {
      let bp = getAgent(bpId);
      // Fallback: check State + localStorage for auto-created agents (from ship auto-fill)
      if (!bp && typeof State !== 'undefined') {
        bp = (State.get('agents') || []).find(a => a.id === bpId);
      }
      if (!bp) {
        try { bp = (JSON.parse(localStorage.getItem(Utils.KEYS.customAgents) || '[]')).find(a => a.id === bpId); } catch {}
      }
      if (!bp) return;
      const lookupId = bpId.startsWith('bp-') ? bpId : 'bp-' + bpId;
      const custom = typeof CardRenderer !== 'undefined' && CardRenderer.getCustomLabels
        ? CardRenderer.getCustomLabels(lookupId) : {};
      const localId = bpId;
      const agent = {
        id: localId,
        name: custom.name || bp.name,
        role: custom.role || bp.config?.role || bp.category || 'General',
        status: 'idle',
        llm_engine: bp.config?.llm_engine || 'claude-4',
        type: bp.config?.type || 'Specialist',
        config: { tools: bp.config?.tools || [], temperature: 0.7, memory: true },
        created_at: new Date().toISOString(),
        blueprint_id: bpId,
        rarity: bp.rarity,
        category: bp.category,
        caps: bp.caps,
        flavor: bp.flavor,
        desc: bp.desc || bp.description,
        description: bp.description || bp.desc,
        tags: bp.tags,
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

    _syncActivation(bpId, 'spaceship');
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
    _syncDeactivation(match, 'spaceship');

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
      try {
        const custom = JSON.parse(localStorage.getItem(Utils.KEYS.customAgents) || '[]');
        const filtered = custom.filter(a => a.id !== agentId);
        if (filtered.length !== custom.length) localStorage.setItem(Utils.KEYS.customAgents, JSON.stringify(filtered));
      } catch {}
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

    // Persist deletion to Supabase so the ship and its agents don't reappear on reload
    if (_canSync()) {
      const shipRowId = (stateShip?.id && _isUuid(stateShip.id)) ? stateShip.id
        : (_isUuid(match) ? match : null);
      if (shipRowId) {
        try { await SB.db('user_spaceships').remove(shipRowId); }
        catch (e) { console.warn('[BlueprintStore] user_spaceships delete failed:', e.message); }
      }
      for (const agentId of removedAgentIds) {
        if (_isUuid(agentId)) {
          try { await SB.db('user_agents').remove(agentId); }
          catch (e) { console.warn('[BlueprintStore] user_agents delete failed:', e.message); }
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
  async function cleanupOrphans() {
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
    try {
      const custom = JSON.parse(localStorage.getItem(Utils.KEYS.customAgents) || '[]');
      custom.forEach(a => { if (a?.id) allLocalAgents.add(a.id); });
    } catch {}

    const orphanIds = [...allLocalAgents].filter(isOrphan);
    if (!orphanIds.length) return [];

    const orphanSet = new Set(orphanIds);

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

    // 3. customAgents localStorage
    try {
      const custom = JSON.parse(localStorage.getItem(Utils.KEYS.customAgents) || '[]');
      const filtered = custom.filter(a => !orphanSet.has(a?.id));
      if (filtered.length !== custom.length) {
        localStorage.setItem(Utils.KEYS.customAgents, JSON.stringify(filtered));
      }
    } catch {}

    // 4. _uuidMap — drop mappings for removed local IDs
    let uuidMapDirty = false;
    for (const id of orphanIds) {
      if (_uuidMap[id]) { delete _uuidMap[id]; uuidMapDirty = true; }
    }
    if (uuidMapDirty) {
      try { localStorage.setItem(_KEYS.uuidMap, JSON.stringify(_uuidMap)); } catch {}
    }

    // 5. Supabase user_agents — delete only proper UUIDs, only when signed in.
    if (_canSync()) {
      for (const agentId of orphanIds) {
        if (_isUuid(agentId)) {
          try { await SB.db('user_agents').remove(agentId); }
          catch (e) { console.warn('[BlueprintStore] cleanupOrphans remove failed:', e.message); }
        }
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
      // Also check localStorage for persisted custom ships
      if (!bp) {
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
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    // Try Supabase direct query
    if (typeof SB !== 'undefined' && SB.isReady() && SB.isOnline()) {
      try {
        const c = SB.client;
        if (c && typeof c.from === 'function') {
          // Left-join the published listing so community rows carry their
          // rating / downloads / listing_id in a single round trip. Catalog
          // rows get an empty array for `listing` (hence normalized below).
          let q = c.from('blueprints')
            .select('*, listing:marketplace_listings!left(id, rating, rating_count, downloads, author_id, status)', { count: 'exact' })
            .eq('is_public', true)
            .eq('type', type);

          // Scope filter: omit → all; 'official' → catalog; 'community' → community.
          if (scope === 'official') q = q.eq('scope', 'catalog');
          else if (scope === 'community') q = q.eq('scope', 'community');

          // Full-text search via tsvector (GIN-indexed), with ilike fallback for short queries
          if (query) {
            if (query.length >= 3) {
              // Use Postgres full-text search (fast, uses GIN index)
              q = q.textSearch('search_vector', query, { type: 'websearch' });
            } else {
              // Short queries: prefix match on name
              const escaped = query.replace(/[%_]/g, '\\$&');
              q = q.ilike('name', `%${escaped}%`);
            }
          }

          // Rarity filter (all types use Common/Rare/Epic/Legendary/Mythic in the `rarity` column)
          if (rarity) {
            q = q.eq('rarity', rarity);
          }

          // Category filter
          if (category) {
            q = q.eq('category', category);
          }

          // Sort
          if (sort === 'popular') {
            q = q.order('activation_count', { ascending: false, nullsFirst: false });
          } else if (sort === 'rating') {
            q = q.order('rating_avg', { ascending: false, nullsFirst: false });
          } else if (sort === 'name-desc') {
            q = q.order('name', { ascending: false });
          } else {
            q = q.order('name', { ascending: true });
          }

          // Pagination
          q = q.range(from, to);

          const { data: rows, error, count } = await q;

          if (!error && rows) {
            const total = count ?? rows.length;
            // If DB has fewer blueprints than local seeds (not fully seeded), use local
            const localCount = type === 'spaceship' ? _spaceships.length : _agents.length;
            if (total < localCount && !query && !rarity && !category && scope === 'all') {
              return _searchCatalogLocal({ type, query, rarity, category, sort, page, perPage, scope });
            }

            // Normalize the listing sidecar: PostgREST returns left-join
            // embeds as an array. Collapse it to a single object (or null
            // if the row isn't listed) so callers don't have to unwrap it.
            rows.forEach(r => {
              if (Array.isArray(r.listing)) {
                const published = r.listing.find(l => l && l.status === 'published');
                r.listing = published || null;
              }
            });

            // Client-side rarity sort (no DB column for sort order)
            if (sort === 'rarity-desc' || sort === 'rarity-asc') {
              const ro = { Mythic: 5, Legendary: 4, Epic: 3, Rare: 2, Common: 1 };
              const dir = sort === 'rarity-desc' ? -1 : 1;
              rows.sort((a, b) => dir * ((ro[a.rarity] || 0) - (ro[b.rarity] || 0)));
            }

            return {
              results: rows,
              total,
              page,
              perPage,
              hasMore: from + rows.length < total,
            };
          }
        }
      } catch (e) {
        console.warn('[BlueprintStore] searchCatalog DB failed, falling back:', e.message);
      }
    }

    // Offline fallback: filter in-memory seeds
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
     Community blueprints live in the same `blueprints` table as the
     seeded catalog (discriminated by `scope='community'`). A
     `marketplace_listings` row sits alongside each one to carry
     rating / downloads / author / publish state.

     searchCatalog() left-joins the listing so every community card
     comes back with its listing sidecar in a single round trip — so
     there's no separate Marketplace list API. The helpers below are
     only for the actions (rate / install counter / publish / review
     lookup) that can't be bundled into the browse query.
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
   * Pure rating-math helper extracted for unit testing.
   *
   * Running average update:
   *   - First rating from this user (oldRating == null) → append to average
   *   - Updated rating → swap the user's old value for the new one
   *
   * The division-by-zero guard is there for the (impossible but cheap to
   * defend against) case of updating a rating on a listing with count 0.
   */
  function recomputeRating(prevAvg, prevCount, oldRating, newRating) {
    if (oldRating == null) {
      const count = prevCount + 1;
      return { rating: (prevAvg * prevCount + newRating) / count, rating_count: count };
    }
    if (prevCount <= 0) return { rating: prevAvg, rating_count: prevCount };
    return {
      rating: (prevAvg * prevCount - oldRating + newRating) / prevCount,
      rating_count: prevCount,
    };
  }

  async function rateMarketplaceListing(listingId, rating) {
    const c = SB?.client;
    if (!c) throw new Error('Not connected');
    const user = State.get('user');
    if (!user) throw new Error('Sign in to rate');

    // Pull the current listing so we can recompute the running average
    // client-side for instant feedback. Source of truth is still the DB.
    const { data: listing, error: lerr } = await c
      .from('marketplace_listings')
      .select('id, rating, rating_count, author_id')
      .eq('id', listingId)
      .maybeSingle();
    if (lerr) throw lerr;
    if (!listing) throw new Error('Listing not found');
    if (listing.author_id && listing.author_id === user.id) {
      throw new Error("You can't rate your own listing");
    }

    // Check for an existing review so we know whether to insert or update
    const { data: existing } = await c
      .from('marketplace_reviews')
      .select('rating')
      .eq('listing_id', listingId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      const { error } = await c
        .from('marketplace_reviews')
        .update({ rating })
        .eq('listing_id', listingId)
        .eq('user_id', user.id);
      if (error) throw error;
    } else {
      const { error } = await c
        .from('marketplace_reviews')
        .insert({ listing_id: listingId, user_id: user.id, rating });
      if (error) throw error;
    }

    const next = recomputeRating(
      Number(listing.rating || 0),
      Number(listing.rating_count || 0),
      existing ? existing.rating : null,
      rating
    );

    // Best-effort write-back. A concurrent rating would race — the next
    // fetch picks up the authoritative value recomputed server-side.
    try {
      await c.from('marketplace_listings')
        .update({ rating: next.rating, rating_count: next.rating_count })
        .eq('id', listingId);
    } catch { /* non-critical */ }

    return next;
  }

  async function incrementMarketplaceDownloads(listingId) {
    const c = SB?.client;
    if (!c) return;
    try {
      const { data } = await c
        .from('marketplace_listings')
        .select('downloads')
        .eq('id', listingId)
        .maybeSingle();
      if (data) {
        c.from('marketplace_listings')
          .update({ downloads: (data.downloads || 0) + 1 })
          .eq('id', listingId).then(() => {});
      }
    } catch { /* non-critical */ }
  }

  async function publishToMarketplace(blueprintId, { title, description, tags } = {}) {
    const c = SB?.client;
    if (!c) throw new Error('Not connected');
    const user = State.get('user');
    if (!user) throw new Error('Sign in to publish');

    // Fetch the blueprint so we can default title/description off it
    const { data: bp, error: berr } = await c
      .from('blueprints')
      .select('id, type, name, description, tags, creator_id, is_public')
      .eq('id', blueprintId)
      .maybeSingle();
    if (berr) throw berr;
    if (!bp) throw new Error('Blueprint not found');
    if (bp.creator_id && bp.creator_id !== user.id) {
      throw new Error("You can only publish blueprints you created");
    }

    // Don't double-publish. Authors get one active listing per blueprint.
    const { data: existing } = await c
      .from('marketplace_listings')
      .select('id')
      .eq('blueprint_id', blueprintId)
      .eq('author_id', user.id)
      .eq('status', 'published')
      .maybeSingle();
    if (existing) {
      throw new Error('This blueprint is already published');
    }

    const payload = {
      blueprint_id: blueprintId,
      author_id:    user.id,
      title:        (title || bp.name || 'Untitled').slice(0, 80),
      description:  (description || bp.description || '').slice(0, 400),
      category:     bp.type === 'spaceship' ? 'spaceship' : 'agent',
      tags:         Array.isArray(tags) ? tags : (bp.tags || []),
      version:      '1.0.0',
      status:       'published',
    };

    const { data, error } = await c.from('marketplace_listings').insert(payload).select().maybeSingle();
    if (error) throw error;
    return data;
  }

  /* ═══════════════════════════════════════════════════════════════
     Public API
  ═══════════════════════════════════════════════════════════════ */

  return {
    // Init
    init, isReady,

    // Catalog queries
    getAgent, listAgents, getSpaceship, listSpaceships,
    listMyBlueprints,
    get,

    // Agent activation
    activateAgent, deactivateAgent, isAgentActivated,
    getActivatedAgentIds, getActivatedAgents,

    // Ship activation
    activateShip, deactivateShip, isShipActivated, cleanupOrphans,
    getActivatedShipIds, getActivatedShips,

    // Ship state persistence
    getShipState, saveShipState, reassignAgentToShip,

    // Agent UUID mapping (local ID ↔ Supabase UUID)
    setAgentUuid, getAgentUuid,

    // Bulk deactivation
    deactivateAllAgents, deactivateAllShips,

    // Connected counts
    getConnectedCount,

    // Lazy catalog loading
    ensureCatalogLoaded,

    // Search & serial key lookup
    search, searchCatalog, getBySerial,

    // Guest → authenticated migration
    migrateGuestState,

    // Sharing
    shareBlueprint, importSharedBlueprint,

    // Marketplace — listing browse is handled by searchCatalog with its
    // left-join on marketplace_listings; these are the action helpers.
    getMyMarketplaceReview, rateMarketplaceListing,
    incrementMarketplaceDownloads, publishToMarketplace, recomputeRating,
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
      const guestAgents = JSON.parse(localStorage.getItem(Utils.KEYS.customAgents) || '[]');
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
        try {
          const created = await SB.db('user_spaceships').create(row);
          if (created?.id) {
            _activatedShipIds = _activatedShipIds.map(sid => sid === id ? created.id : sid);
            ship.id = created.id;
            delete ship._guest;
          }
        } catch (e) { /* skip duplicates */ }
      }
      localStorage.setItem(Utils.KEYS.customShips, JSON.stringify(guestShips));
      _persistShips();
    } catch {}

    // Sync all activations
    for (const id of _activatedAgentIds) _syncActivation(id, 'agent');
    for (const id of _activatedShipIds) _syncActivation(id, 'spaceship');
  }
})();
