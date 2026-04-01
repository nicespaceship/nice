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

    _ready = true;

    // Fire initial State events so views pick up activation data
    _fireAgentState();
    _fireShipState();
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
    const customAgents = JSON.parse(localStorage.getItem('nice-custom-agents') || '[]');
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
      localStorage.setItem('nice-custom-agents', JSON.stringify(customAgents));
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
    const activeShipKeys = new Set(_activatedShipIds.map(id => 'bp-' + id));
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
          if (!existingIds.has(s.id)) {
            stateShips.push({
              id: s.id, name: s.name, type: 'spaceship',
              category: meta.category || '', description: meta.description || '',
              flavor: meta.flavor || '', tags: meta.tags || [],
              rarity: 'Common', status: s.status || 'standby',
              config: { slot_assignments: meta.slot_assignments || {} },
              stats: meta.stats || { crew: '0', slots: '6' },
              metadata: { caps: meta.caps || [] },
              created_at: s.created_at,
            });
          }
          // Auto-activate if not already
          if (!_activatedShipIds.includes(s.id)) {
            _activatedShipIds.push(s.id);
          }
          // Always restore ship state (slot assignments) from DB
          if (meta.slot_assignments && Object.keys(meta.slot_assignments).length) {
            var agentIds = Object.values(meta.slot_assignments).filter(Boolean);
            _shipState[s.id] = {
              slot_assignments: meta.slot_assignments,
              status: s.status === 'active' ? 'deployed' : (s.status || 'standby'),
              agent_ids: agentIds,
            };
          }
        });
        State.set('spaceships', stateShips);
        _persistShips();
        _persistShipState();
      }

      // Load custom agents
      const { data: agents } = await c.from('user_agents').select('*');
      if (agents && agents.length) {
        const stateAgents = State.get('agents') || [];
        const existingIds = new Set(stateAgents.map(a => a.id));
        agents.forEach(a => {
          if (existingIds.has(a.id)) return;
          const cfg = a.config || {};
          stateAgents.push({
            id: a.id, name: a.name, type: 'agent',
            category: cfg.role || a.role || '', rarity: 'Common',
            status: a.status || 'idle', config: cfg,
            metadata: { agentType: cfg.type || 'Agent' },
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
    try { a = (JSON.parse(localStorage.getItem('nice-custom-agents') || '[]')).find(a => a.id === id); } catch {}
    return a || null;
  }

  function listAgents(filter) {
    // Trigger lazy catalog load (non-blocking — returns seeds immediately)
    if (!_catalogLoaded) _loadCatalogFromDB();
    if (!filter) return [..._agents];
    let list = [..._agents];
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
    return [..._spaceships];
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
    _activatedAgentIds.push(bpId);
    _persistAgents();
    _syncActivation(bpId, 'agent');
    _fireAgentState();
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
        try { bp = (JSON.parse(localStorage.getItem('nice-custom-agents') || '[]')).find(a => a.id === bpId); } catch {}
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

  function activateShip(bpId) {
    if (_activatedShipIds.includes(bpId)) return;
    _activatedShipIds.push(bpId);
    _persistShips();
    _syncActivation(bpId, 'spaceship');
    _fireShipState();
  }

  function deactivateShip(bpId) {
    // Normalize: find the matching ID in the array (with or without bp- prefix)
    const match = _activatedShipIds.find(id => id === bpId || 'bp-' + id === bpId || id === 'bp-' + bpId);
    if (!match) return;
    _activatedShipIds = _activatedShipIds.filter(id => id !== match);
    _persistShips();
    _syncDeactivation(bpId, 'spaceship');

    // Cascade: deactivate agents assigned to this ship
    const shipId = bpId.startsWith('bp-') ? bpId : 'bp-' + bpId;
    const state = _shipState[shipId];
    if (state) {
      const agentIdsToRemove = new Set();
      if (state.slot_assignments) {
        Object.values(state.slot_assignments).forEach(id => { if (id) agentIdsToRemove.add(id); });
      }
      if (state.agent_ids) {
        state.agent_ids.forEach(id => { if (id) agentIdsToRemove.add(id); });
      }

      // Only remove agents not assigned to another active ship
      const otherShipAgents = new Set();
      for (const [otherKey, otherState] of Object.entries(_shipState)) {
        if (otherKey === shipId || !otherState?.slot_assignments) continue;
        Object.values(otherState.slot_assignments).forEach(id => { if (id) otherShipAgents.add(id); });
      }

      for (const agentId of agentIdsToRemove) {
        if (otherShipAgents.has(agentId)) continue;
        _activatedAgentIds = _activatedAgentIds.filter(id => id !== agentId);
        // Also remove from custom agents
        try {
          const custom = JSON.parse(localStorage.getItem('nice-custom-agents') || '[]');
          const filtered = custom.filter(a => a.id !== agentId);
          if (filtered.length !== custom.length) localStorage.setItem('nice-custom-agents', JSON.stringify(filtered));
        } catch {}
      }
      _persistAgents();

      // Remove from State.agents
      if (typeof State !== 'undefined') {
        const agents = State.get('agents') || [];
        const cleaned = agents.filter(a => !agentIdsToRemove.has(a.id) || otherShipAgents.has(a.id));
        if (cleaned.length !== agents.length) State.set('agents', cleaned);
      }

      delete _shipState[shipId];
      _persistShipState();
    }

    // Cascade: remove from State.spaceships
    if (typeof State !== 'undefined') {
      const spaceships = State.get('spaceships') || [];
      const filtered = spaceships.filter(s => s.id !== shipId);
      if (filtered.length !== spaceships.length) State.set('spaceships', filtered);
    }

    _fireShipState();
  }

  function isShipActivated(bpId) {
    if (_activatedShipIds.includes(bpId)) return true;
    // Check without bp- prefix (activated IDs don't have it)
    if (bpId.startsWith('bp-')) return _activatedShipIds.includes(bpId.slice(3));
    return _activatedShipIds.includes('bp-' + bpId);
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
          const stored = JSON.parse(localStorage.getItem('nice-custom-ships') || '[]');
          bp = stored.find(s => s.id === bpId || s.id === shipId);
        } catch {}
      }
      if (!bp) return;

      const custom = typeof CardRenderer !== 'undefined' && CardRenderer.getCustomLabels
        ? CardRenderer.getCustomLabels(shipId) : {};
      result.push(Object.assign({}, bp, {
        id: shipId,
        name: custom.name || bp.name,
        status: saved?.status || bp.status || 'standby',
        slot_assignments: saved?.slot_assignments || bp.slot_assignments || {},
        agent_ids: saved?.agent_ids || [],
        created_at: bp.created_at || new Date().toISOString(),
        blueprint_id: bpId,
      }));
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
  } = {}) {
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    // Try Supabase direct query
    if (typeof SB !== 'undefined' && SB.isReady() && SB.isOnline()) {
      try {
        const c = SB.client;
        if (c && typeof c.from === 'function') {
          let q = c.from('blueprints')
            .select('*', { count: 'exact' })
            .eq('is_public', true)
            .eq('type', type);

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

          // Rarity filter (agents: Common/Rare/etc, spaceships: class-1/class-2/etc — both stored in `rarity` column)
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
            if (total < localCount && !query && !rarity && !category) {
              return _searchCatalogLocal({ type, query, rarity, category, sort, page, perPage });
            }

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
    return _searchCatalogLocal({ type, query, rarity, category, sort, page, perPage });
  }

  function _searchCatalogLocal({ type, query, rarity, category, sort, page, perPage }) {
    let list = type === 'spaceship' ? [..._spaceships] : [..._agents];
    const q = (query || '').toLowerCase();

    if (q) {
      list = list.filter(b =>
        (b.name || '').toLowerCase().includes(q) ||
        (b.description || b.desc || '').toLowerCase().includes(q) ||
        (b.tags || []).join(' ').toLowerCase().includes(q)
      );
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
     Public API
  ═══════════════════════════════════════════════════════════════ */

  return {
    // Init
    init, isReady,

    // Catalog queries
    getAgent, listAgents, getSpaceship, listSpaceships,
    get,

    // Agent activation
    activateAgent, deactivateAgent, isAgentActivated,
    getActivatedAgentIds, getActivatedAgents,

    // Ship activation
    activateShip, deactivateShip, isShipActivated,
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
  };
})();
