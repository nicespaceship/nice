/* ═══════════════════════════════════════════════════════════════════
   NICE — Blueprints
   Browse and manage crew and agent blueprints.
═══════════════════════════════════════════════════════════════════ */

const BlueprintsView = (() => {
  const title = 'Bridge';
  const _esc = Utils.esc;

  const RARITY_COLORS = BlueprintUtils.RARITY_COLORS;

  /* ── Art generators — delegate to CardRenderer (SSOT) ── */
  const _categoryColors = BlueprintUtils.CATEGORY_COLORS;
  function _serialHash(str, len) { return CardRenderer.serialHash(str, len); }
  function _avatarArt(name, category, serial) { return CardRenderer.avatarArt(name, category, serial); }

  /* ── Spaceship Slot Template (XP-based progression, no fixed classes) ── */
  function _getShipSlots(classId) {
    if (typeof Gamification !== 'undefined') return Gamification.getSlotTemplate();
    return { name: 'Ship', slots: [{max:'Epic',label:'Bridge'},{max:'Rare',label:'Ops'},{max:'Rare',label:'Tactical'},{max:'Rare',label:'Science'},{max:'Rare',label:'Engineering'}] };
  }

  const _SLOT_COLORS = BlueprintUtils.RARITY_COLORS;

  /* ── Ship blueprint lookup (via BlueprintStore catalog) ── */
  function _findShipBp(id) {
    // SPACESHIP_SEED is defined later but this function is only called at runtime
    const seed = typeof SPACESHIP_SEED !== 'undefined' ? SPACESHIP_SEED : [];
    return seed.find(b => b.id === id)
      || (typeof BlueprintStore !== 'undefined' ? BlueprintStore.getSpaceship(id) : null);
  }

  /* ── Activated card → mission prompt with cap-derived chips ── */
  function _capChips(caps) {
    return caps.map(c => c.replace(/\s+(through|via|across|with|using|by|into|from)\s+.*/i, ''))
      .filter(Boolean).map(c => c.length > 40 ? c.substring(0, 37) + '…' : c).slice(0, 4);
  }

  function _promptShipMission(id) {
    if (typeof PromptPanel === 'undefined') return;
    const bp = _findShipBp(id) || _findShipBp(id.replace(/^bp-/, ''));
    if (!bp) return;
    const chips = _capChips(bp.caps || bp.metadata?.caps || []);
    if (!chips.length) chips.push('Run a mission', 'Check status', 'Generate report');
    PromptPanel.show();
    PromptPanel.prefill('');
    PromptPanel.setSuggestions(chips);
    const input = document.getElementById('nice-ai-input');
    if (input) { input.placeholder = 'Mission for ' + (bp.name || 'Ship') + '…'; input.focus(); }
  }

  function _promptAgentMission(id) {
    if (typeof PromptPanel === 'undefined') return;
    const rawId = id.replace(/^bp-/, '');
    const bp = (typeof BlueprintStore !== 'undefined')
      ? (BlueprintStore.getAgent(id) || BlueprintStore.getAgent(rawId))
      : null;
    if (!bp) return;
    const chips = _capChips(bp.caps || bp.metadata?.caps || bp.config?.tools || []);
    if (!chips.length) chips.push('Run a task', 'Check status', 'Generate report');
    PromptPanel.show();
    PromptPanel.prefill('@' + (bp.name || 'Agent') + ' ');
    PromptPanel.setSuggestions(chips);
    const input = document.getElementById('nice-ai-input');
    if (input) input.focus();
  }

  function _promptActivatedCard(id, type) {
    _closeDrawer();
    if (type === 'spaceship') _promptShipMission(id);
    else _promptAgentMission(id);
  }
  const _NS_LOGO_MINI = '<svg viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg" style="width:1.5em;height:1.5em;vertical-align:-.2em;margin-right:.35em" fill="currentColor"><path d="M962.08,762.91c-3.6,3.81-23,22.39-23.4,25.12s1.65,9.46,1.81,12.8c6.2,134.27-22.47,251.36-96.57,363.41-10.14,15.32-44.07,64.4-57.7,72.3-10.64,6.16-17.08,4.1-26.74-2.68l-205.91-206.08-2.61-1.47c-13.79,3.14-27.33,7.97-41.2,10.78-12.14,2.46-39.23,7.32-50.52,5.02-5.43-1.11-8.8-8.83-13.02-7.63-56.83,48.42-130.21,76.33-203.49,88.59-23.32,3.9-79.67,11.72-100.43,4.99-28.92-9.37-32.15-31.74-31.74-58.17,1.36-87.99,28.47-185.28,80.14-256.85,2.24-3.1,15.39-18.18,15.71-19.38.7-2.69-7.89-8.08-8.8-14.88-1.33-9.98,3.07-34.86,5.18-45.64,2.91-14.86,7.64-29.47,11.6-44.06L6.97,481.35c-6.58-10.16-9.77-14.46-3.86-25.92,4.89-9.48,28.96-27.24,38.49-34.51,113.03-86.2,243.65-127.64,386.44-121.64,5.01.21,23.34,2.94,26.44,1.52,117.49-117.68,260.78-215.29,420.81-265.18,95.99-29.93,217.05-45.19,316.54-29.13,13.03,2.1,32.43,2.67,37.16,16.84,5.97,17.89,9.64,56.02,10.55,75.45,12,255.12-107.2,483.74-277.46,664.12ZM842.3,261.63c-101.28,8.13-152.88,125.4-90.22,205.62,56.08,71.8,169.37,61.28,211.94-18.9,46.73-88.01-22.45-194.69-121.72-186.72ZM276.84,862.98c-1.02-.92-3.11-5.35-5.37-4.22-.87.43-8.43,11.31-9.79,13.25-32.97,47.21-49,105.67-56.19,162.31,1.77,1.77,42.17-6.13,48.04-7.46,31.2-7.03,64.74-18.77,92.63-34.37,4.52-2.53,34.5-21.3,35.27-23.8.34-1.12-.09-2.12-.89-2.92-35.52-32.96-67.86-70.35-103.71-102.79Z"/></svg>';

  const _NS_LOGO_BTN = '<svg viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg" style="width:10px;height:10px;display:block" fill="currentColor"><path d="M962.08,762.91c-3.6,3.81-23,22.39-23.4,25.12s1.65,9.46,1.81,12.8c6.2,134.27-22.47,251.36-96.57,363.41-10.14,15.32-44.07,64.4-57.7,72.3-10.64,6.16-17.08,4.1-26.74-2.68l-205.91-206.08-2.61-1.47c-13.79,3.14-27.33,7.97-41.2,10.78-12.14,2.46-39.23,7.32-50.52,5.02-5.43-1.11-8.8-8.83-13.02-7.63-56.83,48.42-130.21,76.33-203.49,88.59-23.32,3.9-79.67,11.72-100.43,4.99-28.92-9.37-32.15-31.74-31.74-58.17,1.36-87.99,28.47-185.28,80.14-256.85,2.24-3.1,15.39-18.18,15.71-19.38.7-2.69-7.89-8.08-8.8-14.88-1.33-9.98,3.07-34.86,5.18-45.64,2.91-14.86,7.64-29.47,11.6-44.06L6.97,481.35c-6.58-10.16-9.77-14.46-3.86-25.92,4.89-9.48,28.96-27.24,38.49-34.51,113.03-86.2,243.65-127.64,386.44-121.64,5.01.21,23.34,2.94,26.44,1.52,117.49-117.68,260.78-215.29,420.81-265.18,95.99-29.93,217.05-45.19,316.54-29.13,13.03,2.1,32.43,2.67,37.16,16.84,5.97,17.89,9.64,56.02,10.55,75.45,12,255.12-107.2,483.74-277.46,664.12ZM842.3,261.63c-101.28,8.13-152.88,125.4-90.22,205.62,56.08,71.8,169.37,61.28,211.94-18.9,46.73-88.01-22.45-194.69-121.72-186.72ZM276.84,862.98c-1.02-.92-3.11-5.35-5.37-4.22-.87.43-8.43,11.31-9.79,13.25-32.97,47.21-49,105.67-56.19,162.31,1.77,1.77,42.17-6.13,48.04-7.46,31.2-7.03,64.74-18.77,92.63-34.37,4.52-2.53,34.5-21.3,35.27-23.8.34-1.12-.09-2.12-.89-2.92-35.52-32.96-67.86-70.35-103.71-102.79Z"/></svg>';

  const _AGENT_ICON_BTN = '<svg viewBox="0 0 24 24" style="width:12px;height:12px;display:block" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="8" width="10" height="8" rx="2"/><path d="M9 2h6M12 2v6"/><circle cx="9.5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="12" r="1" fill="currentColor" stroke="none"/><path d="M9 16v2M15 16v2M3 12h4M17 12h4"/></svg>';

  /* ── Slot Diagram Art — delegate to CardRenderer (SSOT) ── */
  function _slotDiagramArt(classId, serial) { return CardRenderer.slotDiagramArt(classId, serial); }

  /* All blueprint data comes from Supabase via BlueprintStore */
  const SEED = [];

  /* ── Spaceship data comes from Supabase via BlueprintStore ── */
  const SPACESHIP_SEED = [];

  let _activeTab = 'schematic';
  let _subTab = 'spaceship'; // sub-tab within Blueprints: 'spaceship', 'agent', or 'workshop' (custom builds + imports)
  // Source filter: 'all' mixes catalog + community blueprints; 'official'
  // narrows to the seeded NICE library; 'community' narrows to user-
  // published content. Replaces the old standalone Marketplace sub-tab.
  let _sourceFilter = 'all';
  const _mobileDefault = window.innerWidth <= 768 ? 'compact' : 'card';
  let _viewMode = localStorage.getItem(Utils.KEYS.bpView) || _mobileDefault;
  if (!['card', 'list', 'compact'].includes(_viewMode)) _viewMode = _mobileDefault;
  let _colSort = { key: null, dir: 'asc' }; // column header sort state

  /* ── Paginated catalog search state ── */
  let _currentPage = 1;
  let _totalResults = 0;
  let _isLoading = false;
  // Monotonic sequence for overlapping _applyFilters calls. Each call
  // captures its seq at entry and checks it against _applySeq after each
  // await — if another call has started in the meantime, the older one
  // aborts silently instead of overwriting the grid with stale results.
  let _applySeq = 0;
  let _currentResults = [];
  const _PAGE_SIZE = 24;
  let _searchTimer = null;

  /* ── Drawer / Compare / Hangar state ── */
  let _drawerBpId = null;
  let _drawerBpList = [];
  let _drawerBpIndex = -1;
  let _drawerKeyHandler = null;
  let _compareIds = [];
  let _hangarItems = [];

  function _connCount(bp) {
    return (typeof BlueprintStore !== 'undefined' && BlueprintStore.getConnectedCount)
      ? BlueprintStore.getConnectedCount(bp.id) : 0;
  }

  function render(el, opts) {
    const embedded = opts && opts.embedded;
    const user = State.get('user');

    // Parse URL state BEFORE the first innerHTML assignment so the template
    // renders with the correct initial `_sourceFilter` / `_subTab` / etc.
    // Otherwise the filter pills start on their defaults and get silently
    // out-of-sync with the actual data fetch driven by _sourceFilter.
    {
      const _hash = (window.location.hash || '').split('?')[0];
      const _hashParams = new URLSearchParams((window.location.hash || '').split('?')[1] || '');
      const _tabParam = _hashParams.get('tab');
      const _sourceParam = _hashParams.get('source');
      const validTabs = ['schematic', 'blueprints', 'missions', 'outbox', 'operations', 'log', 'documentation', 'tron'];
      if (_tabParam && validTabs.includes(_tabParam)) _activeTab = _tabParam;
      else if (_tabParam === 'spaceship' || _tabParam === 'agent' || _tabParam === 'workshop') { _activeTab = 'blueprints'; _subTab = _tabParam; }
      else if (_hash === '#/agents' || _hash === '#/bridge/agents') { _activeTab = 'blueprints'; _subTab = 'agent'; }
      else if (_hash === '#/spaceships' || _hash === '#/bridge/spaceships') { _activeTab = 'blueprints'; _subTab = 'spaceship'; }
      else if (_hash === '#/log') _activeTab = 'missions';
      else _activeTab = 'schematic';
      if (_sourceParam === 'official' || _sourceParam === 'community' || _sourceParam === 'all') {
        _sourceFilter = _sourceParam;
      }
    }

    // Render tabs into fixed container (outside scroll area)
    const fixedTabs = document.getElementById('app-fixed-tabs');
    if (fixedTabs) {
      const draftCount = (typeof ContentQueue !== 'undefined' && ContentQueue.getCounts)
        ? (ContentQueue.getCounts().draft || 0)
        : 0;
      const outboxBadge = draftCount > 0
        ? ` <span class="bp-tab-count bp-tab-count--alert">${draftCount}</span>`
        : '';
      fixedTabs.innerHTML = `
        <div class="bp-type-tabs" id="bp-type-tabs">
          <button class="bp-type-tab" data-tab="schematic">Schematic</button>
          <button class="bp-type-tab active" data-tab="blueprints">Blueprints</button>
          <button class="bp-type-tab" data-tab="missions">Missions</button>
          <button class="bp-type-tab" data-tab="outbox">Outbox${outboxBadge}</button>
          <button class="bp-type-tab" data-tab="operations">Operations</button>
          <button class="bp-type-tab" data-tab="log">Log</button>
          <button class="bp-type-tab" data-tab="documentation">Documentation</button>
          <span style="flex:1"></span>
          <button class="bp-type-tab bp-tab-tron" data-tab="tron">TRON</button>
        </div>`;
    }

    el.innerHTML = `
      <div class="bp-wrap">

        <!-- Blueprints sub-tabs (Spaceships / Agents) -->
        <div class="bp-sub-tabs" id="bp-sub-tabs">
          <button class="bp-sub-tab active" data-sub="spaceship">Spaceships <span class="bp-tab-count">${(typeof BlueprintStore !== 'undefined' ? BlueprintStore.listSpaceships() : SPACESHIP_SEED).length}</span></button>
          <button class="bp-sub-tab" data-sub="agent">Agents <span class="bp-tab-count">${(typeof BlueprintStore !== 'undefined' ? BlueprintStore.listAgents() : SEED).length}</span></button>
          <button class="bp-sub-tab" data-sub="workshop">Workshop <span class="bp-tab-count">${_workshopCount()}</span></button>
        </div>

        <!-- Log tab content (rendered by LogView sub-modules) -->
        <div id="bp-log-content" style="display:none"></div>

        <!-- Schematic content (rendered by DockView when active) -->
        <div id="bp-schematic-content" style="display:none"></div>



        <div class="bp-search-row">
          <div class="search-box">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-search"/></svg>
            <input type="text" id="bp-search" class="search-input" placeholder="Search by name, description, or tags..." aria-label="Search blueprints" />
          </div>
          <select id="bp-sort" class="filter-select" aria-label="Sort blueprints">
            <option value="name">A — Z</option>
            <option value="name-desc">Z — A</option>
            <option value="popular">Most Popular</option>
            <option value="rating">Highest Rated</option>
            <option value="rarity-desc">Rarity: High → Low</option>
            <option value="rarity-asc">Rarity: Low → High</option>
          </select>
          <select id="bp-category" class="filter-select" aria-label="Filter by category">
            <option value="">All Categories</option>
            ${Object.keys(BlueprintUtils.CATEGORY_COLORS).map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
          <select id="bp-tier" class="filter-select" aria-label="Filter by tier">
            <option value="">All Tiers</option>
            <option value="free">Free</option>
            <option value="premium">Premium</option>
          </select>
          <div class="bp-source-filter" id="bp-source-filter" role="group" aria-label="Filter by source">
            <button class="bp-source-btn${_sourceFilter==='all'?' active':''}"       data-source="all"       aria-pressed="${_sourceFilter==='all'}">All</button>
            <button class="bp-source-btn${_sourceFilter==='official'?' active':''}"  data-source="official"  aria-pressed="${_sourceFilter==='official'}">Official</button>
            <button class="bp-source-btn${_sourceFilter==='community'?' active':''}" data-source="community" aria-pressed="${_sourceFilter==='community'}">Community</button>
          </div>
          <div class="bp-rarity-filters" id="bp-rarity-filters" role="group" aria-label="Filter by rarity">
            <button class="bp-rarity-btn active" data-rarity="all" aria-pressed="true">All</button>
            <button class="bp-rarity-btn" data-rarity="Common" aria-pressed="false">Common</button>
            <button class="bp-rarity-btn" data-rarity="Rare" aria-pressed="false">Rare</button>
            <button class="bp-rarity-btn" data-rarity="Epic" aria-pressed="false">Epic</button>
            <button class="bp-rarity-btn" data-rarity="Legendary" aria-pressed="false">Legendary</button>
            <button class="bp-rarity-btn" data-rarity="Mythic" aria-pressed="false">Mythic</button>
          </div>
          <div class="bp-view-toggle" id="bp-view-toggle">
            <button class="bp-view-btn${_viewMode==='card'?' active':''}" data-view="card" title="Card view">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="0" width="6" height="6" rx="1"/><rect x="8" y="0" width="6" height="6" rx="1"/><rect x="0" y="8" width="6" height="6" rx="1"/><rect x="8" y="8" width="6" height="6" rx="1"/></svg>
            </button>
            <button class="bp-view-btn${_viewMode==='list'?' active':''}" data-view="list" title="List view">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="0" width="14" height="3" rx="1"/><rect x="0" y="5.5" width="14" height="3" rx="1"/><rect x="0" y="11" width="14" height="3" rx="1"/></svg>
            </button>
            <button class="bp-view-btn${_viewMode==='compact'?' active':''}" data-view="compact" title="Compact view">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="0" width="4" height="4" rx="1"/><rect x="5" y="0" width="4" height="4" rx="1"/><rect x="10" y="0" width="4" height="4" rx="1"/><rect x="0" y="5" width="4" height="4" rx="1"/><rect x="5" y="5" width="4" height="4" rx="1"/><rect x="10" y="5" width="4" height="4" rx="1"/><rect x="0" y="10" width="4" height="4" rx="1"/><rect x="5" y="10" width="4" height="4" rx="1"/><rect x="10" y="10" width="4" height="4" rx="1"/></svg>
            </button>
          </div>
        </div>

        <div class="bp-toolbar-actions" id="bp-toolbar-actions">
          <a href="#/bridge/agents/new" class="btn btn-sm" id="btn-bp-create">+ Create</a>
          <button class="btn btn-sm" id="btn-bp-import">Import Blueprint</button>
        </div>

        <div class="bp-result-bar" id="bp-result-bar" aria-live="polite"></div>

        <div id="bp-activated-wrap"></div>

        <div class="tcg-grid bp-view-${_viewMode}" id="bp-grid">
          <!-- rendered by JS -->
        </div>
      </div>

    `;

    // Highlight the correct tab + sub-tab buttons
    document.querySelectorAll('.bp-type-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.bp-type-tab[data-tab="${_activeTab}"]`)?.classList.add('active');
    document.querySelectorAll('.bp-sub-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.bp-sub-tab[data-sub="${_subTab}"]`)?.classList.add('active');

    // Show/hide sections based on active tab
    _toggleSchematicView();

    _bindEvents();
    if (_activeTab === 'blueprints') _applyFilters(); // async — renders activated section + paginated grid
    _handleDeepLink();
  }

  function _getUserRatings() {
    try { return JSON.parse(localStorage.getItem(Utils.KEYS.bpRatings) || '{}'); } catch(e) { return {}; }
  }

  function _showPreview(bpId) {
    _openDrawer(bpId);
  }

  function _tcgCardHTML(bp, type) {
    const CR = typeof CardRenderer !== 'undefined' ? CardRenderer : null;
    const _sh = CR ? CR.serialHash : _serialHash;
    const _aa = CR ? CR.avatarArt : _avatarArt;
    const _sda = CR ? CR.slotDiagramArt : _slotDiagramArt;
    const _RC = CR ? CR.RARITY_COLORS : RARITY_COLORS;

    if (type === 'skin') {
      const serial = _sh(bp.id || bp.name, 15);
      const owned = typeof Skin !== 'undefined' && Skin.ownsSkin(bp.id);
      const isActive = typeof Skin !== 'undefined' && Skin.activeSkin()?.id === bp.id;
      const _pa = CR ? CR.paletteArt : null;
      const marqueeText = _esc(bp.description || bp.flavor);
      const priceFmt = bp.price ? '$' + (bp.price / 100).toFixed(2) : 'FREE';
      const isFree = !bp.price;
      const _toggleHTML = (on, id, cls) => `<button class="bp-toggle-switch ${cls}${on ? ' on' : ''}" data-id="${id}"><span class="toggle-track"><span class="toggle-knob"></span></span></button>`;
      const actionBtn = (owned || isFree)
        ? _toggleHTML(isActive, bp.id, 'bp-skin-btn')
        : `<button class="c-btn bp-skin-btn bp-purchase" data-id="${bp.id}">Buy ${priceFmt}</button>`;
      const previewBtn = !isActive ? `<button class="c-btn bp-skin-preview-btn" data-id="${bp.id}">Preview</button>` : '';
      const copyPreview = bp.copy?.nav ? Object.entries(bp.copy.nav).slice(0, 4).map(([k,v]) => `<p class="tcg-cap" style="font-size:10px;opacity:0.7">${k} → ${_esc(v)}</p>`).join('') : '';
      return `<div class="tcg-card bp-card-clickable skin-card" data-id="${bp.id}" data-type="skin" data-tags="${(bp.tags||[]).join(',')}">
        <div class="tcg-name-bar"><span class="tcg-name">${_esc(bp.name)}</span><span class="tcg-rarity" style="color:#f59e0b">LEGENDARY</span></div>
        <div class="tcg-art"><div class="tcg-art-serial" title="Serial: ${serial.code}"><span class="tcg-serial-code">${serial.code}</span></div><div class="tcg-art-class"><span class="tcg-serial-code" style="color:#f59e0b;border:1px solid #f59e0b">SKIN</span></div>${_pa(bp.name, bp.preview_colors || ['#080808','#ffffff','#888'], serial)}</div>
        <div class="tcg-marquee"><div class="tcg-marquee-track"><span>${marqueeText}</span><span>${marqueeText}</span></div></div>
        <div class="tcg-text-box"><p class="tcg-flavor">"${_esc(bp.flavor)}"</p>${copyPreview}</div>
        <div class="tcg-stats"><div class="tcg-stat"><span class="tcg-stat-val">${Object.keys(bp.copy?.nav || {}).length}</span><span class="tcg-stat-lbl">LABELS</span></div><div class="tcg-stat"><span class="tcg-stat-val">${(bp.copy?.ranks || []).length}</span><span class="tcg-stat-lbl">RANKS</span></div><div class="tcg-stat"><span class="tcg-stat-val">${bp.effect ? '1' : '0'}</span><span class="tcg-stat-lbl">FX</span></div><div class="tcg-stat"><span class="tcg-stat-val">${priceFmt}</span><span class="tcg-stat-lbl">COST</span></div></div>
        <div class="tcg-actions">${previewBtn}${actionBtn}</div>
      </div>`;
    }


    if (type === 'spaceship') {
      const serial = _sh(bp.id || bp.name, 12);
      const isShipActivated = bp._forceActive || BlueprintStore.isShipActivated(bp.id);
      const shipRarity = bp.rarity || 'Common';
      const isLocked = typeof Gamification !== 'undefined' && Gamification.isRarityUnlocked && !Gamification.isRarityUnlocked(shipRarity);
      let deployBtn;
      // Order matters: owned ships ALWAYS show Remove regardless of current
      // rank. A user can lose rank (or subscription) after deploying a high-
      // rarity ship — the card must keep showing Remove so they can still
      // uninstall, even if they couldn't re-deploy it from scratch.
      if (isShipActivated) {
        deployBtn = `<button class="c-btn bp-deploy-ship-btn bp-activated" data-id="${bp.id}">Remove</button>`;
      } else if (isLocked) {
        deployBtn = `<button class="c-btn bp-deploy-ship-btn bp-locked" data-id="${bp.id}" disabled title="Reach ${shipRarity} rank to deploy">🔒 ${shipRarity}</button>`;
      } else {
        deployBtn = `<button class="c-btn bp-deploy-ship-btn" data-id="${bp.id}">Deploy</button>`;
      }
      const rendered = CR.render('spaceship', 'full', bp, { clickClass: 'bp-card-clickable' });
      const scopeBadge = bp.scope === 'community' ? '<span class="bp-scope-badge">COMMUNITY</span>' : '';
      return `<div class="bp-card-wrap">${scopeBadge}${rendered}<div class="bp-card-buttons">${deployBtn}</div></div>`;
    }

    // ── Agent Blueprint Card ──
    const serial = _sh(bp.id || bp.name);
    const rarityColor = (_RC || RARITY_COLORS)[bp.rarity || 'Common'] || '#94a3b8';

    // Integration connect button
    const integrationId = bp.integration || null;
    let connectBtn = '';
    if (integrationId) {
      const intList = State.get('connectors') || [];
      const integ = intList.find(i => i.id === integrationId);
      const isConn = integ?.status === 'connected';
      connectBtn = `<button class="c-btn bp-connect-btn ${isConn ? 'connected' : ''}" data-id="${bp.id}" data-integration="${integrationId}">${isConn ? '&#10003; Connected' : '&#9741; Connect'}</button>`;
    }

    const rendered = CR.render('agent', 'full', bp, { clickClass: 'bp-card-clickable' });
    const scopeBadge = bp.scope === 'community' ? '<span class="bp-scope-badge">COMMUNITY</span>' : '';
    return `<div class="bp-card-wrap">${scopeBadge}${rendered}${connectBtn ? `<div class="bp-card-buttons">${connectBtn}</div>` : ''}</div>`;
  }

  /* ── List-row renderer (horizontal row with key info) ── */
  function _listRowHTML(bp, type) {
    const _RC = (typeof CardRenderer !== 'undefined' && CardRenderer.RARITY_COLORS) ? CardRenderer.RARITY_COLORS : RARITY_COLORS;
    const rarity = (bp.rarity || 'Common').toLowerCase();
    let dotColor, dotLabel;

    if (type === 'spaceship') {
      dotColor = _RC[bp.rarity || 'Common'] || _RC.Common;
      dotLabel = { common:'C', rare:'R', epic:'E', legendary:'L', mythic:'M' }[rarity] || 'C';
    } else {
      dotColor = _RC[bp.rarity || 'Common'] || _RC.Common;
      dotLabel = { common:'C', rare:'R', epic:'E', legendary:'L' }[rarity] || 'C';
    }
    const cat = bp.category || '';
    const name = _esc(bp.name);
    const desc = _esc(bp.description || bp.flavor || bp.desc || '');
    const connCount = (typeof BlueprintStore !== 'undefined' && BlueprintStore.getConnectedCount)
      ? BlueprintStore.getConnectedCount(bp.id) : 0;
    const dlVal = connCount > 0 ? connCount : (bp.downloads || 0);
    const dl = dlVal > 0 ? dlVal.toLocaleString() : '—';
    const rating = bp.rating ? '★ ' + bp.rating : '—';
    const tags = (bp.tags || []).slice(0, 3).join(', ');

    // Type-specific stats (3 separate columns)
    let stat1 = '', stat2 = '', stat3 = '';
    if (type === 'agent') {
      const s = bp.stats || {};
      stat1 = s.spd || '—'; stat2 = s.acc || '—'; stat3 = s.pwr || '—';
    } else if (type === 'spaceship') {
      const s = bp.stats || {};
      stat1 = s.slots || '—'; stat2 = String(bp.activation_count || s.deployments || 0); stat3 = '';
    }

    // Determine activation state (not used for agents — no activate feature on crew cards)
    let isActivated = bp._forceActive || false;
    if (!isActivated && typeof BlueprintStore !== 'undefined') {
      if (type === 'spaceship') isActivated = BlueprintStore.isShipActivated(bp.id);
    }
    const actLabel = isActivated ? 'Remove' : 'Deploy';
    const actClass = isActivated ? ' bpl-activated' : '';
    const showAction = type !== 'agent';

    return `<div class="bpl-row bp-card-clickable" data-id="${bp.id}" data-type="${type}" data-rarity="${rarity}" data-tags="${(bp.tags||[]).join(',')}">
      <span class="bpl-rarity" style="background:${dotColor}">${dotLabel}</span>
      <span class="bpl-name">${name}</span>
      <span class="bpl-cat">${cat}</span>
      <span class="bpl-desc">${desc}</span>
      <span class="bpl-stat1">${stat1}</span>
      <span class="bpl-stat2">${stat2}</span>
      <span class="bpl-stat3">${stat3}</span>
      <span class="bpl-rating">${rating}</span>
      <span class="bpl-dl">${dl}</span>
      <span></span>
      ${showAction
        ? `<span class="bpl-action"><button class="bpl-action-btn${actClass}" data-id="${bp.id}" data-type="${type}">${actLabel}</button></span>`
        : '<span></span>'}
    </div>`;
  }

  function _renderGrid(blueprints) {
    const grid = document.getElementById('bp-grid');
    if (!grid) return;

    // Update grid class for view mode
    grid.className = 'tcg-grid bp-view-' + _viewMode;

    if (!blueprints.length) {
      grid.className = 'tcg-grid bp-view-empty';
      grid.innerHTML = `
        <div class="app-empty">
          <svg class="app-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <h2>No Blueprints Found</h2>
          <p>Try adjusting your filters or search terms.</p>
          <div class="app-empty-acts">
            <button class="btn btn-sm bp-empty-clear">Clear Filters</button>
          </div>
        </div>`;
      grid.querySelector('.bp-empty-clear')?.addEventListener('click', () => {
        const searchEl = document.getElementById('bp-search');
        if (searchEl) searchEl.value = '';
        document.querySelectorAll('.bp-rarity-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
        const allBtn = document.querySelector('.bp-rarity-btn[data-rarity="all"]');
        if (allBtn) { allBtn.classList.add('active'); allBtn.setAttribute('aria-pressed', 'true'); }
        _applyFilters();
      });
      return;
    }

    if (_viewMode === 'list') {
      let sh1 = 'Spd', sh2 = 'Acc', sh3 = 'Pwr';
      if (_subTab === 'spaceship') { sh1 = 'Slots'; sh2 = 'Deploys'; sh3 = ''; }
      const _si = (key) => _colSort.key === key ? (_colSort.dir === 'asc' ? ' ▲' : ' ▼') : '';
      const header = `<div class="bpl-row bpl-header">
        <span class="bpl-rarity"></span>
        <span class="bpl-name bpl-sortable" data-sort="name">Name${_si('name')}</span>
        <span class="bpl-cat bpl-sortable" data-sort="category">Category${_si('category')}</span>
        <span class="bpl-desc">Description</span>
        <span class="bpl-stat1 bpl-sortable" data-sort="stat1">${sh1}${_si('stat1')}</span>
        <span class="bpl-stat2 bpl-sortable" data-sort="stat2">${sh2}${_si('stat2')}</span>
        <span class="bpl-stat3">${sh3}</span>
        <span class="bpl-rating bpl-sortable" data-sort="rating">Rating${_si('rating')}</span>
        <span class="bpl-dl bpl-sortable" data-sort="connected">Connected${_si('connected')}</span>
        <span></span>
        <span class="bpl-action"></span>
      </div>`;
      grid.innerHTML = header + blueprints.map(bp => _listRowHTML(bp, bp.type || _activeTab)).join('');
    } else {
      grid.innerHTML = blueprints.map(bp => _tcgCardHTML(bp, bp.type || _activeTab)).join('');
    }
    _bindCardEvents(grid);
  }

  /* ── Shared event binding for card containers ── */
  function _bindCardEvents(container) {
    // Column header sort clicks
    container.querySelectorAll('.bpl-sortable').forEach(hdr => {
      hdr.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = hdr.dataset.sort;
        if (_colSort.key === key) {
          _colSort.dir = _colSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          _colSort.key = key;
          _colSort.dir = (key === 'name' || key === 'category') ? 'asc' : 'desc';
        }
        _applyFilters();
      });
    });

    // Activate/Deactivate spaceship buttons → open setup wizard
    container.querySelectorAll('.bp-deploy-ship-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (BlueprintStore.isShipActivated(id)) {
          const bp = _findShipBp(id);
          confirmDeactivate(bp?.name || 'this spaceship', async () => {
            await BlueprintStore.deactivateShip(id);
            if (typeof Notify !== 'undefined' && bp) Notify.send({ title: 'Spaceship Removed', message: `${bp.name} has been removed.`, type: 'info' });
            _applyFilters();
          });
        } else {
          const bp = _findShipBp(id);
          if (bp && typeof ShipSetupWizard !== 'undefined') {
            ShipSetupWizard.open(bp, { onComplete: () => _applyFilters() });
          } else {
            BlueprintStore.activateShip(id);
            if (typeof Gamification !== 'undefined') Gamification.addXP('activate_blueprint');
            _applyFilters();
          }
        }
      });
    });

    // NICE prompt buttons — mission prompt with cap-derived chips
    container.querySelectorAll('.bp-nice-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        _promptActivatedCard(btn.dataset.id, btn.dataset.type || 'agent');
      });
    });

    // Connect integration buttons
    container.querySelectorAll('.bp-connect-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        _toggleIntegration(btn.dataset.id, btn.dataset.integration, btn);
      });
    });

    // Skin activate/purchase buttons
    container.querySelectorAll('.bp-skin-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (typeof Skin === 'undefined') return;
        if (Skin.activeSkin()?.id === id) {
          // Deactivate
          Skin.deactivate();
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Skin Off', message: 'Restored default appearance.', type: 'info' });
          _applyFilters();
        } else if (Skin.ownsSkin(id)) {
          // Activate owned skin
          Skin.activate(id);
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Skin On', message: Skin.getPack(id)?.name + ' applied!', type: 'task_complete' });
          if (typeof Gamification !== 'undefined') Gamification.addXP('install_blueprint');
        } else {
          // Purchase
          Skin.purchaseSkin(id);
          Skin.activate(id);
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Skin Purchased', message: Skin.getPack(id)?.name + ' is now yours!', type: 'task_complete' });
          if (typeof Gamification !== 'undefined') Gamification.addXP('install_blueprint');
        }
        _applyFilters();
      });
    });

    // Skin preview buttons
    container.querySelectorAll('.bp-skin-preview-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (typeof Skin !== 'undefined') {
          Skin.activate(id);
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Skin Preview', message: 'Previewing ' + (Skin.getPack(id)?.name || id) + '. Navigate around to see changes.', type: 'info' });
          _applyFilters();
        }
      });
    });

    // List view activate/deactivate buttons
    container.querySelectorAll('.bpl-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const type = btn.dataset.type;
        if (type === 'spaceship') {
          if (BlueprintStore.isShipActivated(id)) {
            const bp = BlueprintStore.getSpaceship(id);
            confirmDeactivate(bp?.name || 'this spaceship', async () => {
              await BlueprintStore.deactivateShip(id);
              if (typeof Notify !== 'undefined' && bp) Notify.send({ title: 'Spaceship Removed', message: `${bp.name} has been removed.`, type: 'info' });
              _applyFilters();
            });
          } else {
            const bp = _findShipBp(id);
            if (bp && typeof ShipSetupWizard !== 'undefined') {
              ShipSetupWizard.open(bp, { onComplete: () => _applyFilters() });
            }
          }
        } else if (type === 'skin') {
          if (typeof Skin === 'undefined') return;
          if (Skin.activeSkin()?.id === id) {
            Skin.deactivate();
            if (typeof Notify !== 'undefined') Notify.send({ title: 'Skin Off', message: 'Restored default appearance.', type: 'info' });
          } else {
            if (!Skin.ownsSkin(id) && Skin.getPack(id)?.price) {
              Skin.purchaseSkin(id);
            }
            Skin.activate(id);
            if (typeof Notify !== 'undefined') Notify.send({ title: 'Skin On', message: (Skin.getPack(id)?.name || id) + ' applied!', type: 'task_complete' });
            if (typeof Gamification !== 'undefined') Gamification.addXP('install_blueprint');
          }
          _applyFilters();
        }
      });
    });

    // Card click → open drawer for ALL types, shift+click → compare mode
    // Activated spaceships → mission prompt instead of drawer
    container.querySelectorAll('.bp-card-clickable').forEach(card => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', (e) => {
        if (e.target.closest('.bp-deploy-btn') || e.target.closest('.bp-nice-btn') || e.target.closest('.bp-configure-btn') || e.target.closest('.bp-contact-btn') || e.target.closest('.bp-connect-btn') || e.target.closest('.bp-skin-btn') || e.target.closest('.bp-skin-preview-btn') || e.target.closest('.bpl-action-btn') || e.target.closest('.bp-hangar-add-btn')) return;
        const id = card.dataset.id;
        if (e.shiftKey) {
          _toggleCompare(id);
        } else {
          _openDrawer(id);
        }
      });
    });

    // Hangar add buttons
    container.querySelectorAll('.bp-hangar-add-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        _addToHangar(btn.dataset.id, btn.dataset.type);
        btn.textContent = '✓';
        btn.disabled = true;
      });
    });
  }

  function _renderStars(rating) {
    const full = Math.floor(rating);
    const half = rating - full >= 0.5;
    let s = '';
    for (let i = 0; i < full; i++) s += '<span class="bp-star filled">★</span>';
    if (half) s += '<span class="bp-star half">★</span>';
    for (let i = full + (half ? 1 : 0); i < 5; i++) s += '<span class="bp-star">★</span>';
    return s;
  }

  function _formatNum(n) {
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  async function _deploy(bpId) {
    const bp = SEED.find(b => b.id === bpId) || SPACESHIP_SEED.find(b => b.id === bpId) || _remoteBlueprints.find(b => b.id === bpId);
    if (!bp) return;

    // Local-first: track activation in localStorage regardless of Supabase
    BlueprintStore.activateAgent(bpId);
    if (typeof Gamification !== 'undefined') Gamification.addXP('activate_blueprint');
    if (typeof Notify !== 'undefined') {
      Notify.send({ title: 'Agent Added', message: `${bp.name} has been added.`, type: 'task_complete' });
    }

    // Add to local agents state so it appears on the Agents page
    const agents = State.get('agents') || [];
    if (!agents.find(r => r.id === 'bp-' + bpId)) {
      agents.push({
        id: 'bp-' + bpId,
        name: bp.name,
        role: bp.config?.role || bp.category || 'General',
        status: 'idle',
        llm_engine: bp.config?.llm_engine || 'claude-4',
        type: bp.config?.type || 'Specialist',
        config: { tools: bp.config?.tools || [], temperature: 0.7, memory: true },
        created_at: new Date().toISOString(),
        blueprint_id: bpId,
        // Carry over blueprint display data so TCG cards render fully
        rarity: bp.rarity,
        category: bp.category,
        caps: bp.caps,
        flavor: bp.flavor,
        desc: bp.desc || bp.description,
        description: bp.description || bp.desc,
        tags: bp.tags,
        stats: bp.stats,
      });
      State.set('agents', agents);
    }

    // Best-effort Supabase sync (non-blocking) — capture UUID for mission assignment
    const user = State.get('user');
    if (user && typeof SB !== 'undefined') {
      try {
        const created = await SB.db('user_agents').create({
          user_id:    user.id,
          name:       bp.name,
          role:       bp.config.role,
          type:       bp.config.type,
          status:     'idle',
          llm_engine: bp.config.llm_engine,
          config:     { tools: bp.config.tools, temperature: 0.7, memory: true },
        });
        // Store the Supabase UUID so missions can reference this agent
        if (created && created.id && typeof BlueprintStore !== 'undefined') {
          BlueprintStore.setAgentUuid('bp-' + bpId, created.id);
        }
      } catch (e) { console.warn('Blueprint sync to cloud skipped:', e.message); }

      // Bump download count if remote
      if (!bp.id.startsWith('bp-')) {
        SB.db('agent_blueprints').update(bp.id, { downloads: (bp.downloads || 0) + 1 }).catch(() => {});
      }
    }

    // Stay on blueprints page — refresh cards to show activated state

    _applyFilters();
  }

  let _remoteBlueprints = [];
  async function _loadRemote() {
    try {
      // Use BlueprintStore if available (already handles DB + seed merge)
      if (typeof BlueprintStore !== 'undefined' && BlueprintStore.isReady()) {
        _remoteBlueprints = BlueprintStore.listAgents();
        _applyFilters();
        return;
      }
      const remote = await SB.db('agent_blueprints').list().catch(() => []);
      if (remote && remote.length) {
        _remoteBlueprints = remote;
        _applyFilters();
      }
    } catch (e) { /* seed data is enough */ }
  }

  function _getAllBlueprints() {

    if (_subTab === 'spaceship') {
      return (typeof BlueprintStore !== 'undefined') ? BlueprintStore.listSpaceships() : [...SPACESHIP_SEED];
    }
    if (_remoteBlueprints.length) {
      const ids = new Set(_remoteBlueprints.map(b => b.id));
      return [..._remoteBlueprints, ...SEED.filter(b => !ids.has(b.id))];
    }
    return (typeof BlueprintStore !== 'undefined') ? BlueprintStore.listAgents() : [...SEED];
  }

  function _updateRarityFilters() {
    const el = document.getElementById('bp-rarity-filters');
    if (!el) return;
    el.style.display = 'flex';
    let buttons;
    buttons = [
      { val: 'all', label: 'All' },
      { val: 'Common', label: 'Common' },
      { val: 'Rare', label: 'Rare' },
      { val: 'Epic', label: 'Epic' },
      { val: 'Legendary', label: 'Legendary' },
      { val: 'Mythic', label: 'Mythic' },
    ];
    el.innerHTML = buttons.map((b, i) =>
      `<button class="bp-rarity-btn${i === 0 ? ' active' : ''}" data-rarity="${b.val}" aria-pressed="${i === 0 ? 'true' : 'false'}">${b.label}</button>`
    ).join('');
  }

  /* ── Activated Items Section (top of each tab) ── */
  function _renderProgressionBar() {
    const el = document.getElementById('bp-progression-bar');
    if (!el || typeof Gamification === 'undefined') return;
    const p = Gamification.getProgressToNextTier();
    if (!p.nextRank) { el.innerHTML = `<span class="bp-prog-rank">${p.rank.badge} ${p.rank.name}</span> <span class="bp-prog-max">MAX RANK</span>`; return; }
    const xpFmt = p.xpNeeded >= 1000 ? Math.round(p.xpNeeded / 1000) + 'K' : p.xpNeeded;
    el.innerHTML = `
      <span class="bp-prog-rank">${p.rank.badge} ${p.rank.name}</span>
      <div class="bp-prog-track"><div class="bp-prog-fill" style="width:${p.progress}%"></div></div>
      <span class="bp-prog-next">${p.nextRank.name} — ${xpFmt} XP to unlock ${p.nextMaxRarity} (${p.nextSlots} slots)</span>`;
  }

  function _renderActivatedSection() {
    _renderProgressionBar();
    const wrap = document.getElementById('bp-activated-wrap');
    if (!wrap) return;
    if (typeof BlueprintStore === 'undefined') { wrap.innerHTML = ''; return; }

    let type, label, activated;
    if (_subTab === 'agent') {
      type = 'agent'; label = 'AGENTS';
      activated = BlueprintStore.getActivatedAgents ? BlueprintStore.getActivatedAgents() : [];
      // Include custom agents from State (same merge pattern as Schematic)
      const customAgents = (typeof State !== 'undefined' ? State.get('agents') : null) || [];
      customAgents.forEach(ca => { if (ca && !activated.find(a => a.id === ca.id)) activated.push(ca); });
    } else if (_subTab === 'spaceship') {
      type = 'spaceship'; label = 'SPACESHIPS';
      activated = BlueprintStore.getActivatedShips ? BlueprintStore.getActivatedShips() : [];
      // Include custom ships from State (same merge pattern as Schematic)
      const customShips = (typeof State !== 'undefined' ? State.get('spaceships') : null) || [];
      customShips.forEach(cs => { if (cs && !activated.find(s => s.id === cs.id)) activated.push(cs); });
    } else {
      wrap.innerHTML = ''; return;
    }

    if (!activated.length) {
      const emptyMsg = `No ${label.toLowerCase()} deployed yet. Browse below.`;
      wrap.innerHTML = `<div class="bp-activated-section"><p class="bp-activated-empty">${emptyMsg}</p></div><div class="bp-section-divider"></div>`;
      return;
    }

    // Merge instance data with blueprint — blueprint fields (rarity, name, etc.) take priority
    let items = activated.map(a => {
      const getter = type === 'agent' ? BlueprintStore.getAgent : BlueprintStore.getSpaceship;
      const fullBp = getter ? getter(a.id || a.blueprint_id) : null;
      return Object.assign({}, a, fullBp || {}, { type, _forceActive: true, id: a.id || (fullBp && fullBp.id) });
    });

    // Apply same filters as the main grid
    const q = (document.getElementById('bp-search')?.value || '').toLowerCase();
    if (q) {
      items = items.filter(b => {
        const name = (b.name || '').toLowerCase();
        const desc = (b.description || b.desc || '').toLowerCase();
        const tags = (b.tags || []).join(' ').toLowerCase();
        return name.includes(q) || desc.includes(q) || tags.includes(q);
      });
    }
    const rarityBtn = document.querySelector('.bp-rarity-btn.active');
    const rarity = rarityBtn?.dataset.rarity || 'all';
    if (rarity !== 'all') {
      items = items.filter(b => (b.rarity || 'Common') === rarity);
    }

    // Hide section if all activated items are filtered out
    if (!items.length) {
      wrap.innerHTML = '';
      return;
    }

    let cardsHTML;
    if (_viewMode === 'list') {
      let sh1 = 'Spd', sh2 = 'Acc', sh3 = 'Pwr';
      if (type === 'spaceship') { sh1 = 'Slots'; sh2 = 'Deploys'; sh3 = ''; }
      const header = `<div class="bpl-row bpl-header">
        <span class="bpl-rarity"></span><span class="bpl-name">Name</span><span class="bpl-cat">Category</span>
        <span class="bpl-desc">Description</span><span class="bpl-stat1">${sh1}</span><span class="bpl-stat2">${sh2}</span>
        <span class="bpl-stat3">${sh3}</span><span class="bpl-rating">Rating</span><span class="bpl-dl">Connected</span>
        <span></span><span class="bpl-action"></span></div>`;
      cardsHTML = header + items.map(bp => _listRowHTML(bp, type)).join('');
    } else {
      cardsHTML = items.map(bp => _tcgCardHTML(bp, type)).join('');
    }

    const totalCount = activated.length;
    const countLabel = items.length < totalCount ? `${items.length}/${totalCount}` : `${totalCount}`;
    wrap.innerHTML = `<div class="bp-activated-section">
      <h3 class="bp-activated-title">YOUR ${label} <span class="bp-activated-count">${countLabel}</span></h3>
      <div class="bp-activated-grid tcg-grid bp-view-${_viewMode}">${cardsHTML}</div>
    </div><div class="bp-section-divider"></div>`;

    // Bind events for the activated section cards
    const section = wrap.querySelector('.bp-activated-grid');
    if (section) _bindCardEvents(section);
  }

  function _workshopCount() {
    if (typeof BlueprintStore === 'undefined' || !BlueprintStore.listMyBlueprints) return 0;
    const my = BlueprintStore.listMyBlueprints();
    return my.spaceships.length + my.agents.length;
  }

  /* ── Workshop — custom builds + imports for both ships and agents ── */
  function _renderWorkshop() {
    _renderProgressionBar();
    const wrap = document.getElementById('bp-activated-wrap');
    const grid = document.getElementById('bp-grid');
    const loadMore = document.getElementById('bp-load-more');
    const resultBar = document.getElementById('bp-result-bar');
    if (!wrap) return;

    // The catalog grid + result bar + load-more are not used on this tab
    if (grid) grid.innerHTML = '';
    if (loadMore) loadMore.innerHTML = '';
    if (resultBar) resultBar.textContent = '';

    if (typeof BlueprintStore === 'undefined' || !BlueprintStore.listMyBlueprints) {
      wrap.innerHTML = '';
      return;
    }

    const my = BlueprintStore.listMyBlueprints();

    // Apply the same client-side filters the activated section uses, so
    // search / rarity narrowing keeps working on this tab.
    const q = (document.getElementById('bp-search')?.value || '').toLowerCase().trim();
    const rarityBtn = document.querySelector('.bp-rarity-btn.active');
    const rarity = rarityBtn?.dataset.rarity || 'all';
    const filterFn = (b) => {
      if (q) {
        const name = (b.name || '').toLowerCase();
        const desc = (b.description || b.desc || '').toLowerCase();
        const tags = (b.tags || []).join(' ').toLowerCase();
        if (!name.includes(q) && !desc.includes(q) && !tags.includes(q)) return false;
      }
      if (rarity !== 'all' && (b.rarity || 'Common') !== rarity) return false;
      return true;
    };

    const ships = my.spaceships.filter(filterFn).map(s => Object.assign({}, s, { type: 'spaceship', _forceActive: true }));
    const agents = my.agents.filter(filterFn).map(a => Object.assign({}, a, { type: 'agent', _forceActive: true }));

    if (!ships.length && !agents.length) {
      const totalRaw = my.spaceships.length + my.agents.length;
      const empty = totalRaw === 0
        ? `<p class="bp-activated-empty">Workshop is empty. Use <strong>+ Create</strong> or <strong>Import Blueprint</strong> to add your own builds.</p>`
        : `<p class="bp-activated-empty">No workshop blueprints match the current filter.</p>`;
      wrap.innerHTML = `<div class="bp-activated-section">${empty}</div>`;
      return;
    }

    const renderSection = (label, items, type) => {
      if (!items.length) return '';
      let cardsHTML;
      if (_viewMode === 'list') {
        let sh1 = 'Spd', sh2 = 'Acc', sh3 = 'Pwr';
        if (type === 'spaceship') { sh1 = 'Slots'; sh2 = 'Deploys'; sh3 = ''; }
        const header = `<div class="bpl-row bpl-header">
          <span class="bpl-rarity"></span><span class="bpl-name">Name</span><span class="bpl-cat">Category</span>
          <span class="bpl-desc">Description</span><span class="bpl-stat1">${sh1}</span><span class="bpl-stat2">${sh2}</span>
          <span class="bpl-stat3">${sh3}</span><span class="bpl-rating">Rating</span><span class="bpl-dl">Connected</span>
          <span></span><span class="bpl-action"></span></div>`;
        cardsHTML = header + items.map(bp => _listRowHTML(bp, type)).join('');
      } else {
        cardsHTML = items.map(bp => _tcgCardHTML(bp, type)).join('');
      }
      return `<div class="bp-activated-section">
        <h3 class="bp-activated-title">${label} <span class="bp-activated-count">${items.length}</span></h3>
        <div class="bp-activated-grid tcg-grid bp-view-${_viewMode}">${cardsHTML}</div>
      </div>`;
    };

    wrap.innerHTML = renderSection('SPACESHIPS', ships, 'spaceship') + renderSection('AGENTS', agents, 'agent');
    wrap.querySelectorAll('.bp-activated-grid').forEach(section => _bindCardEvents(section));
  }

  async function _applyFilters(append) {
    // Bump the epoch — any concurrent _applyFilters call will see a newer
    // seq and abort its render. We intentionally do NOT short-circuit on
    // _isLoading: a newer call should supersede an older one, not be
    // dropped by it (which used to leave stale results on screen when
    // the user rapid-fired filter changes).
    const mySeq = ++_applySeq;
    const isCurrent = () => mySeq === _applySeq;

    // Workshop sub-tab — entirely client-side render of custom builds +
    // imports. Skip the catalog query and just paint the grid.
    if (_subTab === 'workshop') {
      _renderWorkshop();
      return;
    }

    // Reset pagination when not appending
    if (!append) {
      _currentPage = 1;
      _currentResults = [];
    }

    const q = (document.getElementById('bp-search')?.value || '').trim();
    const sort = document.getElementById('bp-sort')?.value || 'name';
    const category = document.getElementById('bp-category')?.value || '';
    const rarityBtn = document.querySelector('.bp-rarity-btn.active');
    const rarity = rarityBtn?.dataset.rarity || 'all';

    // Activated section is always client-side (small dataset)
    _renderActivatedSection();

    // Show loading state
    _isLoading = true;
    _showLoadingState(append);

    try {
      const result = await BlueprintStore.searchCatalog({
        type: _subTab === 'spaceship' ? 'spaceship' : 'agent',
        query: q,
        rarity: rarity !== 'all' ? rarity : null,
        category: category || null,
        sort: sort,
        page: _currentPage,
        perPage: _PAGE_SIZE,
        scope: _sourceFilter,
      });

      if (!isCurrent()) return; // a newer call took over

      if (append) {
        _currentResults = _currentResults.concat(result.results);
      } else {
        _currentResults = result.results;
      }
      _totalResults = result.total;

      // Column header sort override (list view only, client-side on current page)
      if (_colSort.key && _viewMode === 'list') {
        _sortByColumn(_currentResults);
      }

      // Update result bar
      _updateResultBar(q, rarity);

      // Update tab count badge
      if (!q && rarity === 'all') {
        const countEl = document.querySelector(`.bp-type-tab[data-tab="${_activeTab}"] .bp-tab-count`);
        if (countEl) countEl.textContent = _totalResults;
      }

      _renderGrid(_currentResults);
      _renderLoadMore();

    } catch (err) {
      if (!isCurrent()) return;
      console.warn('[Blueprints] Search failed, falling back to local:', err);
      _applyFiltersLocal();
    } finally {
      if (isCurrent()) _isLoading = false;
    }
  }

  /** Offline / fallback: filter in-memory seeds (original logic) */
  function _applyFiltersLocal() {
    const q = (document.getElementById('bp-search')?.value || '').toLowerCase().trim();
    const sort = document.getElementById('bp-sort')?.value || 'name';
    const category = document.getElementById('bp-category')?.value || '';
    const tier = document.getElementById('bp-tier')?.value || '';

    let list = _getAllBlueprints();

    // Token-based fuzzy matching: all words must appear somewhere in name+desc+tags
    if (q) {
      const tokens = q.split(/\s+/).filter(Boolean);
      list = list.filter(b => {
        const haystack = ((b.name || '') + ' ' + (b.description || b.desc || '') + ' ' + (b.tags || []).join(' ')).toLowerCase();
        return tokens.every(t => haystack.includes(t));
      });
    }

    // Category filter
    if (category) {
      list = list.filter(b => (b.category || '').toLowerCase() === category.toLowerCase());
    }

    // Tier filter — free models use Gemini, premium requires paid models
    if (tier) {
      const FREE_MODELS = ['gemini-2.5-flash', 'gemini-2.0-lite', 'gemini-2-flash'];
      list = list.filter(b => {
        const engine = b.config?.llm_engine || b.llm_engine || 'gemini-2.5-flash';
        const isFree = FREE_MODELS.some(m => engine.toLowerCase().includes(m.toLowerCase()));
        return tier === 'free' ? isFree : !isFree;
      });
    }

    const rarityBtn = document.querySelector('.bp-rarity-btn.active');
    const rarity = rarityBtn?.dataset.rarity || 'all';
    if (rarity !== 'all') {
      list = list.filter(b => (b.rarity || 'Common') === rarity);
    }

    if (sort === 'popular') {
      if (_subTab === 'spaceship') {
        list.sort((a, b) => (parseInt(b.stats?.crew, 10) || 0) - (parseInt(a.stats?.crew, 10) || 0));
      } else {
        list.sort((a, b) => (_connCount(b) || b.downloads || 0) - (_connCount(a) || a.downloads || 0));
      }
    } else if (sort === 'rating') {
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sort === 'name-desc') {
      list.sort((a, b) => b.name.localeCompare(a.name));
    } else if (sort === 'rarity-desc') {
      const ro = { Mythic: 5, Legendary: 4, Epic: 3, Rare: 2, Common: 1 };
      list.sort((a, b) => (ro[b.rarity] || 0) - (ro[a.rarity] || 0));
    } else if (sort === 'rarity-asc') {
      const ro = { Mythic: 5, Legendary: 4, Epic: 3, Rare: 2, Common: 1 };
      list.sort((a, b) => (ro[a.rarity] || 0) - (ro[b.rarity] || 0));
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (_colSort.key && _viewMode === 'list') _sortByColumn(list);

    _updateResultBar(q, rarity);
    _renderActivatedSection();
    _currentResults = list;
    _totalResults = list.length;
    _renderGrid(list);

    // Remove load-more for local mode (all results shown)
    const lm = document.getElementById('bp-load-more');
    if (lm) lm.innerHTML = '';
  }

  /** Column header sort (client-side on current page of results) */
  function _sortByColumn(list) {
    const dir = _colSort.dir === 'asc' ? 1 : -1;
    const k = _colSort.key;
    list.sort((a, b) => {
      let va, vb;
      if (k === 'name') { va = (a.name || '').toLowerCase(); vb = (b.name || '').toLowerCase(); return dir * va.localeCompare(vb); }
      if (k === 'category') { va = (a.category || '').toLowerCase(); vb = (b.category || '').toLowerCase(); return dir * va.localeCompare(vb); }
      if (k === 'rating') { va = a.rating || 0; vb = b.rating || 0; return dir * (va - vb); }
      if (k === 'connected') { va = a.downloads || 0; vb = b.downloads || 0; return dir * (va - vb); }
      if (k === 'stat1') {
        va = parseFloat(a.stats?.spd || a.stats?.slots || a.stats?.ships || a.stats?.vars || 0);
        vb = parseFloat(b.stats?.spd || b.stats?.slots || b.stats?.ships || b.stats?.vars || 0);
        return dir * (va - vb);
      }
      if (k === 'stat2') {
        va = parseFloat(a.stats?.acc || a.stats?.cost?.replace(/[^0-9.]/g,'') || a.stats?.fonts || 0);
        vb = parseFloat(b.stats?.acc || b.stats?.cost?.replace(/[^0-9.]/g,'') || b.stats?.fonts || 0);
        return dir * (va - vb);
      }
      return 0;
    });
  }

  /** Show loading skeleton or spinner */
  function _showLoadingState(append) {
    if (append) {
      const lm = document.getElementById('bp-load-more');
      if (lm) lm.innerHTML = '<div class="bp-loading"><span class="bp-spinner"></span> Loading...</div>';
    } else {
      const grid = document.getElementById('bp-grid');
      if (grid) grid.innerHTML = '<div class="bp-loading"><span class="bp-spinner"></span> Searching catalog...</div>';
    }
  }

  /** Update the result count bar */
  function _updateResultBar(q, rarity) {
    const resultBar = document.getElementById('bp-result-bar');
    if (!resultBar) return;
    const hasFilters = q || rarity !== 'all';
    if (hasFilters) {
      resultBar.innerHTML = `<span class="bp-result-count">${_totalResults} blueprint${_totalResults !== 1 ? 's' : ''} found</span>
        <button class="bp-clear-filters" id="bp-clear-filters">Clear filters</button>`;
      document.getElementById('bp-clear-filters')?.addEventListener('click', () => {
        const searchEl = document.getElementById('bp-search');
        if (searchEl) searchEl.value = '';
        document.querySelectorAll('.bp-rarity-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
        const allBtn = document.querySelector('.bp-rarity-btn[data-rarity="all"]');
        if (allBtn) { allBtn.classList.add('active'); allBtn.setAttribute('aria-pressed', 'true'); }
        _applyFilters();
      });
    } else {
      resultBar.innerHTML = '';
    }
  }

  /** Render "Load More" button below grid */
  function _renderLoadMore() {
    let container = document.getElementById('bp-load-more');
    if (!container) {
      container = document.createElement('div');
      container.id = 'bp-load-more';
      container.className = 'bp-load-more';
      document.getElementById('bp-grid')?.after(container);
    }

    const loaded = _currentResults.length;
    if (loaded >= _totalResults) {
      container.innerHTML = loaded > _PAGE_SIZE
        ? `<span class="bp-load-more-status">${loaded} of ${_totalResults} blueprints</span>`
        : '';
      return;
    }

    container.innerHTML = `
      <button class="btn bp-load-more-btn" id="bp-load-more-btn">
        Load More <span class="bp-load-more-count">(${loaded} of ${_totalResults})</span>
      </button>`;

    document.getElementById('bp-load-more-btn')?.addEventListener('click', () => {
      _currentPage++;
      _applyFilters(true);
    });
  }

  /* ── Toggle integration connection from blueprint card ── */
  async function _toggleIntegration(bpId, integrationId, btn) {
    const user = State.get('user');
    if (!user) return;

    let list = State.get('connectors') || [];
    const item = list.find(i => i.id === integrationId);
    if (!item) return;

    const connect = item.status !== 'connected';
    item.status = connect ? 'connected' : 'available';
    State.set('connectors', list);

    // Optimistic UI update
    btn.classList.toggle('connected', connect);
    btn.innerHTML = connect ? '&#10003; Connected' : '&#9741; Connect';

    try {
      if (connect) {
        await SB.db('integrations').create({ user_id: user.id, service: integrationId, status: 'connected', config: {} });
      } else {
        const remote = await SB.db('integrations').list({ userId: user.id }).catch(() => []);
        const match = remote.find(r => r.service === integrationId);
        if (match) await SB.db('integrations').remove(match.id);
      }
    } catch(e) { /* UI already updated optimistically */ }
  }

  /* ── Toggle between schematic and catalog views ── */
  function _toggleSchematicView() {
    const schematicEl = document.getElementById('bp-schematic-content');
    const logEl = document.getElementById('bp-log-content');
    const searchRow = document.querySelector('.bp-search-row');
    const resultBar = document.getElementById('bp-result-bar');
    const activatedWrap = document.getElementById('bp-activated-wrap');
    const grid = document.getElementById('bp-grid');
    const loadMore = document.getElementById('bp-load-more');

    const subTabs = document.getElementById('bp-sub-tabs');
    const isLogTab = ['missions', 'outbox', 'operations', 'log', 'documentation', 'tron'].includes(_activeTab);
    const isBlueprintsTab = _activeTab === 'blueprints';
    const isSchematic = _activeTab === 'schematic';

    // Sub-tabs (Spaceships/Agents) — only show when Blueprints tab active
    if (subTabs) subTabs.style.display = isBlueprintsTab ? '' : 'none';

    // Catalog UI (search, filters, grid, toolbar actions) — only on Blueprints tab
    const catalogDisplay = isBlueprintsTab ? '' : 'none';
    if (searchRow) searchRow.style.display = catalogDisplay;
    if (resultBar) resultBar.style.display = catalogDisplay;
    if (activatedWrap) activatedWrap.style.display = catalogDisplay;
    if (grid) grid.style.display = catalogDisplay;
    if (loadMore) loadMore.style.display = catalogDisplay;
    const toolbarActions = document.getElementById('bp-toolbar-actions');
    if (toolbarActions) toolbarActions.style.display = catalogDisplay;

    // Schematic
    if (schematicEl) {
      schematicEl.style.display = isSchematic ? '' : 'none';
      if (isSchematic && typeof SchematicView !== 'undefined') SchematicView.render(schematicEl);
      if (!isSchematic && typeof SchematicView !== 'undefined' && SchematicView.destroy) SchematicView.destroy();
    }

    // Log tabs (Missions, Operations, Log, Tron)
    if (logEl) {
      logEl.style.display = isLogTab ? '' : 'none';
      if (isLogTab) {
        _renderLogTab(logEl);
      }
      if (_activeTab !== 'tron' && typeof TronView !== 'undefined' && TronView.destroy) TronView.destroy();
    }

  }

  function _renderLogTab(el) {
    if (_activeTab === 'missions' && typeof MissionsView !== 'undefined') {
      MissionsView.render(el);
    } else if (_activeTab === 'outbox') {
      _renderOutbox(el);
    } else if (_activeTab === 'operations' && typeof AnalyticsView !== 'undefined') {
      AnalyticsView.render(el);
    } else if (_activeTab === 'log' && typeof AuditLogView !== 'undefined') {
      AuditLogView.render(el);
    } else if (_activeTab === 'documentation' && typeof DocsView !== 'undefined') {
      DocsView.render(el);
    } else if (_activeTab === 'tron' && typeof TronView !== 'undefined') {
      TronView.render(el);
    } else {
      el.innerHTML = '<p class="text-muted" style="padding:20px">Module not loaded.</p>';
    }
  }

  /* ── Outbox (Content Calendar + Queue) ── */
  let _outboxViewMode = 'calendar';   // 'calendar' | 'list'
  let _outboxTypeFilter = 'all';      // 'all' | 'social' | 'email' | 'report'
  let _outboxStatusFilter = 'all';    // 'all' | 'draft' | 'approved' | 'rejected'
  let _outboxWeekOffset = 0;          // 0 = current week, -1 = prev, +1 = next

  function _getOutboxWeekDays(offset) {
    const now = new Date();
    const day = now.getDay();
    const mondayDiff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayDiff + (offset * 7));
    monday.setHours(0, 0, 0, 0);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(d);
    }
    return days;
  }

  function _outboxDateKey(date) {
    return date.toISOString().slice(0, 10);
  }

  function _outboxItemDate(item) {
    const meta = item.metadata || {};
    return meta.scheduled_for || item.created_at || '';
  }

  function _outboxFilterItems(items) {
    let filtered = items;
    if (_outboxTypeFilter !== 'all') {
      filtered = filtered.filter(i => i.content_type === _outboxTypeFilter);
    }
    if (_outboxStatusFilter !== 'all') {
      filtered = filtered.filter(i => (i.approval_status || 'draft') === _outboxStatusFilter);
    }
    return filtered;
  }

  function _renderOutbox(el) {
    const _e = typeof Utils !== 'undefined' ? Utils.esc : (s) => String(s || '');
    const items = (typeof State !== 'undefined' ? State.get('content-queue') : null) || [];

    // Load from ContentQueue if empty
    if (!items.length && typeof ContentQueue !== 'undefined') {
      ContentQueue.load().then(() => {
        const loaded = State.get('content-queue') || [];
        if (loaded.length) _renderOutbox(el);
      });
    }

    const filtered = _outboxFilterItems(items);
    const pending = items.filter(i => i.approval_status === 'draft');
    const approved = items.filter(i => i.approval_status === 'approved');
    const rejected = items.filter(i => i.approval_status === 'rejected');

    const weekDays = _getOutboxWeekDays(_outboxWeekOffset);
    const weekLabel = _outboxFormatWeekLabel(weekDays);

    // Group filtered items by date key
    const byDate = {};
    filtered.forEach(item => {
      const dateStr = _outboxItemDate(item);
      if (!dateStr) return;
      const key = dateStr.slice(0, 10);
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(item);
    });
    const unscheduled = filtered.filter(item => !_outboxItemDate(item));

    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const todayKey = _outboxDateKey(new Date());

    el.innerHTML = `
      <div class="outbox-container">
        <div class="outbox-header">
          <div class="outbox-toolbar">
            <div class="outbox-filters">
              <button class="outbox-filter${_outboxStatusFilter === 'all' ? ' active' : ''}" data-status="all">All <span class="outbox-badge">${items.length}</span></button>
              <button class="outbox-filter${_outboxStatusFilter === 'draft' ? ' active' : ''}" data-status="draft">Pending <span class="outbox-badge">${pending.length}</span></button>
              <button class="outbox-filter${_outboxStatusFilter === 'approved' ? ' active' : ''}" data-status="approved">Approved <span class="outbox-badge">${approved.length}</span></button>
              <button class="outbox-filter${_outboxStatusFilter === 'rejected' ? ' active' : ''}" data-status="rejected">Rejected <span class="outbox-badge">${rejected.length}</span></button>
            </div>
            <div class="outbox-type-filters">
              <button class="outbox-type-btn${_outboxTypeFilter === 'all' ? ' active' : ''}" data-type="all">All Types</button>
              <button class="outbox-type-btn${_outboxTypeFilter === 'social' ? ' active' : ''}" data-type="social" style="--type-color:#c084fc">Social</button>
              <button class="outbox-type-btn${_outboxTypeFilter === 'email' ? ' active' : ''}" data-type="email" style="--type-color:#60a5fa">Email</button>
              <button class="outbox-type-btn${_outboxTypeFilter === 'report' ? ' active' : ''}" data-type="report" style="--type-color:#34d399">Report</button>
            </div>
            <div class="outbox-view-toggle">
              <button class="outbox-view-btn${_outboxViewMode === 'calendar' ? ' active' : ''}" data-view="calendar" title="Calendar view">&#9634;</button>
              <button class="outbox-view-btn${_outboxViewMode === 'list' ? ' active' : ''}" data-view="list" title="List view">&#9776;</button>
              ${approved.length ? `<button class="btn outbox-export-btn" id="outbox-export">Export Approved</button>` : ''}
            </div>
          </div>
        </div>

        ${_outboxViewMode === 'calendar' ? `
        <div class="outbox-calendar">
          <div class="outbox-cal-nav">
            <button class="btn outbox-week-btn" id="outbox-prev-week">&larr;</button>
            <span class="outbox-week-label">${_e(weekLabel)}</span>
            <button class="btn outbox-week-btn" id="outbox-next-week">&rarr;</button>
            <button class="btn outbox-today-btn" id="outbox-today">Today</button>
          </div>
          <div class="outbox-cal-grid">
            <div class="outbox-cal-header">
              ${weekDays.map((d, i) => {
                const key = _outboxDateKey(d);
                const isToday = key === todayKey;
                const dayNum = d.getDate();
                const monthShort = d.toLocaleString('en', { month: 'short' });
                return `<div class="outbox-cal-col-head${isToday ? ' today' : ''}">
                  <span class="outbox-cal-day-name">${dayNames[i]}</span>
                  <span class="outbox-cal-day-num">${dayNum} ${monthShort}</span>
                </div>`;
              }).join('')}
            </div>
            <div class="outbox-cal-body">
              ${weekDays.map(d => {
                const key = _outboxDateKey(d);
                const isToday = key === todayKey;
                const dayItems = byDate[key] || [];
                return `<div class="outbox-cal-col${isToday ? ' today' : ''}" data-date="${key}">
                  ${dayItems.length === 0
                    ? '<div class="outbox-cal-empty-day"></div>'
                    : dayItems.map(item => _renderOutboxCalCard(item, _e)).join('')
                  }
                </div>`;
              }).join('')}
            </div>
          </div>
          ${unscheduled.length ? `
          <div class="outbox-unscheduled">
            <div class="outbox-unscheduled-label">Unscheduled (${unscheduled.length})</div>
            <div class="outbox-unscheduled-items">
              ${unscheduled.map(item => _renderOutboxCalCard(item, _e)).join('')}
            </div>
          </div>` : ''}
        </div>
        ` : `
        <div class="outbox-feed" id="outbox-feed">
          ${filtered.length === 0 ? `
            <div class="outbox-empty">
              <p class="outbox-empty-icon">📬</p>
              <p class="outbox-empty-title">No drafts yet</p>
              <p class="outbox-empty-sub">Run a mission to generate content. Agent output will appear here for review.</p>
            </div>
          ` : filtered.map(item => _renderOutboxListCard(item)).join('')}
        </div>
        `}
      </div>
    `;

    _bindOutboxEvents(el);
  }

  function _outboxFormatWeekLabel(days) {
    if (!days.length) return '';
    const s = days[0];
    const e = days[days.length - 1];
    const opts = { month: 'short', day: 'numeric' };
    const sStr = s.toLocaleDateString('en', opts);
    const eStr = e.toLocaleDateString('en', { ...opts, year: 'numeric' });
    return `${sStr} \u2014 ${eStr}`;
  }

  function _renderOutboxCalCard(item, _e) {
    const CQ = typeof ContentQueue !== 'undefined' ? ContentQueue : null;
    const type = CQ ? CQ.getTypeMeta(item.content_type) : { icon: '\uD83D\uDCDD', label: 'Content', color: '#94a3b8' };
    const status = item.approval_status || 'draft';
    const content = CQ ? CQ.getContent(item) : (item.result || '');
    const snippet = (content || '').replace(/<[^>]+>/g, '').slice(0, 50);
    const statusColors = { draft: '#eab308', approved: '#22c55e', rejected: '#ef4444' };
    const statusLabels = { draft: 'Draft', approved: 'Approved', rejected: 'Rejected' };

    return `
      <div class="outbox-cal-card" data-id="${_e(item.id)}" data-status="${status}" draggable="true"
           style="--status-color:${statusColors[status] || '#94a3b8'}">
        <div class="outbox-cal-card-head">
          <span class="outbox-cal-card-icon" style="color:${type.color}">${type.icon}</span>
          <span class="outbox-cal-card-badge" style="background:${statusColors[status] || '#94a3b8'}">${statusLabels[status] || status}</span>
        </div>
        <div class="outbox-cal-card-title">${_e(snippet || type.label)}</div>
      </div>
    `;
  }

  function _renderOutboxListCard(item) {
    const _e = typeof Utils !== 'undefined' ? Utils.esc : (s) => String(s || '');
    const CQ = typeof ContentQueue !== 'undefined' ? ContentQueue : null;
    const type = CQ ? CQ.getTypeMeta(item.content_type) : { icon: '\uD83D\uDCDD', label: 'Content', color: '#94a3b8' };
    const content = CQ ? CQ.getContent(item) : (item.result || '');
    const time = CQ ? CQ.timeAgo(item.created_at) : '';
    const rendered = CQ ? CQ.renderMarkdown(content) : _e(content);
    const status = item.approval_status || 'draft';

    return `
      <div class="outbox-card ${status}" data-id="${_e(item.id)}" data-status="${status}">
        <div class="outbox-card-header">
          <span class="outbox-card-type" style="color:${type.color}">${type.icon} ${_e(type.label)}</span>
          <span class="outbox-card-agent">${_e(item.agent_name || 'Agent')}</span>
          <span class="outbox-card-time">${_e(time)}</span>
          ${status === 'approved' ? '<span class="outbox-status-badge approved">&#10003; Approved</span>' : ''}
          ${status === 'rejected' ? '<span class="outbox-status-badge rejected">&#10005; Rejected</span>' : ''}
        </div>
        <div class="outbox-card-preview">${rendered}</div>
        <div class="outbox-card-actions" data-id="${_e(item.id)}">
          ${status === 'draft' ? `
            <button class="btn outbox-approve-btn">&#10003; Approve</button>
            <button class="btn outbox-edit-btn">&#9998; Edit</button>
            <button class="btn outbox-reject-btn">&#10005; Reject</button>
          ` : ''}
          ${status === 'approved' && (item.content_type === 'social') ? `
            <button class="btn btn-primary outbox-publish-btn">&#x21AA; Publish</button>
            <button class="btn outbox-schedule-btn">&#x23F1; Schedule</button>
          ` : ''}
          ${status === 'approved' ? `<button class="btn outbox-edit-btn">&#9998; Edit</button>` : ''}
          <button class="btn outbox-copy-btn">Copy</button>
        </div>
      </div>
    `;
  }

  function _bindOutboxEvents(el) {
    const _e = typeof Utils !== 'undefined' ? Utils.esc : (s) => String(s || '');

    // Status filter clicks
    el.querySelectorAll('.outbox-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        _outboxStatusFilter = btn.dataset.status || 'all';
        _renderOutbox(el);
      });
    });

    // Type filter clicks
    el.querySelectorAll('.outbox-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _outboxTypeFilter = btn.dataset.type || 'all';
        _renderOutbox(el);
      });
    });

    // View toggle (calendar / list)
    el.querySelectorAll('.outbox-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _outboxViewMode = btn.dataset.view || 'calendar';
        _renderOutbox(el);
      });
    });

    // Week navigation
    el.querySelector('#outbox-prev-week')?.addEventListener('click', () => {
      _outboxWeekOffset--;
      _renderOutbox(el);
    });
    el.querySelector('#outbox-next-week')?.addEventListener('click', () => {
      _outboxWeekOffset++;
      _renderOutbox(el);
    });
    el.querySelector('#outbox-today')?.addEventListener('click', () => {
      _outboxWeekOffset = 0;
      _renderOutbox(el);
    });

    // Drag-and-drop on calendar cards
    el.querySelectorAll('.outbox-cal-card[draggable]').forEach(card => {
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', card.dataset.id);
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });

    el.querySelectorAll('.outbox-cal-col').forEach(col => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drag-over'); });
      col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('drag-over');
        const itemId = e.dataTransfer.getData('text/plain');
        const newDate = col.dataset.date;
        if (!itemId || !newDate) return;
        const allItems = (typeof State !== 'undefined' ? State.get('content-queue') : null) || [];
        const item = allItems.find(i => i.id === itemId);
        if (item) {
          if (!item.metadata) item.metadata = {};
          item.metadata.scheduled_for = newDate + 'T09:00:00Z';
          if (typeof State !== 'undefined') State.set('content-queue', [...allItems]);
          _renderOutbox(el);
        }
      });
    });

    // Calendar card click -> detail overlay
    el.querySelectorAll('.outbox-cal-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.defaultPrevented) return;
        const id = card.dataset.id;
        const allItems = (typeof State !== 'undefined' ? State.get('content-queue') : null) || [];
        const item = allItems.find(i => i.id === id);
        if (!item) return;
        _showOutboxCardDetail(el, item);
      });
    });

    // List card actions (delegated)
    const feed = el.querySelector('#outbox-feed');
    if (feed) feed.addEventListener('click', async (e) => {
      const id = e.target.closest('[data-id]')?.dataset.id;
      if (!id) return;

      if (e.target.closest('.outbox-approve-btn')) {
        if (typeof ContentQueue !== 'undefined') await ContentQueue.approve(id);
        _renderOutbox(el);
      }
      if (e.target.closest('.outbox-reject-btn')) {
        if (typeof ContentQueue !== 'undefined') await ContentQueue.reject(id);
        _renderOutbox(el);
      }
      if (e.target.closest('.outbox-copy-btn')) {
        if (typeof ContentQueue !== 'undefined') await ContentQueue.copy(id);
      }
      if (e.target.closest('.outbox-edit-btn')) {
        const card = e.target.closest('.outbox-card');
        const preview = card?.querySelector('.outbox-card-preview');
        const items = (typeof State !== 'undefined' ? State.get('content-queue') : null) || [];
        const item = items.find(i => i.id === id);
        if (!preview || !item) return;

        const content = typeof ContentQueue !== 'undefined' ? ContentQueue.getContent(item) : '';
        preview.innerHTML = `
          <textarea class="outbox-edit-area" id="outbox-edit-${_e(id)}">${_e(content)}</textarea>
          <div class="outbox-edit-actions">
            <button class="btn outbox-save-btn" data-id="${_e(id)}">Save</button>
            <button class="btn outbox-cancel-btn" data-id="${_e(id)}">Cancel</button>
          </div>
        `;
      }
      if (e.target.closest('.outbox-save-btn')) {
        const textarea = el.querySelector(`#outbox-edit-${CSS.escape(id)}`);
        if (textarea && typeof ContentQueue !== 'undefined') {
          await ContentQueue.edit(id, textarea.value);
          _renderOutbox(el);
        }
      }
      if (e.target.closest('.outbox-cancel-btn')) {
        _renderOutbox(el);
      }
      if (e.target.closest('.outbox-publish-btn')) {
        _showPlatformPicker(el, id, 'publish');
      }
      if (e.target.closest('.outbox-schedule-btn')) {
        _showPlatformPicker(el, id, 'schedule');
      }
    });

    // Export button
    el.querySelector('#outbox-export')?.addEventListener('click', () => {
      if (typeof ContentQueue !== 'undefined') ContentQueue.exportApproved();
    });
  }

  /* ── Platform picker modal for Publish / Schedule ──
     Opens a small dialog with a checkbox list of supported platforms
     and, when mode === 'schedule', a datetime input. On submit it
     calls ContentQueue.publishTo / scheduleTo which fan out to each
     selected platform in turn and return per-platform results. */
  function _showPlatformPicker(parentEl, itemId, mode) {
    const _e = typeof Utils !== 'undefined' ? Utils.esc : (s) => String(s || '');
    const CQ = typeof ContentQueue !== 'undefined' ? ContentQueue : null;
    if (!CQ) return;

    const platforms = CQ.getPlatforms();
    const isSchedule = mode === 'schedule';
    const title = isSchedule ? 'Schedule Post' : 'Publish Post';
    const submitLabel = isSchedule ? 'Schedule' : 'Publish now';

    // Default the schedule input to "one hour from now" in the user's
    // local timezone, formatted for <input type="datetime-local">.
    const defaultWhen = (() => {
      const d = new Date(Date.now() + 60 * 60 * 1000);
      const tz = d.getTimezoneOffset() * 60000;
      return new Date(d - tz).toISOString().slice(0, 16);
    })();

    const overlay = document.createElement('div');
    overlay.className = 'outbox-picker-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', title);
    overlay.innerHTML = `
      <div class="outbox-picker-panel">
        <div class="outbox-picker-head">
          <h3 class="outbox-picker-title">${_e(title)}</h3>
          <button class="btn btn-xs outbox-picker-close" aria-label="Close">&times;</button>
        </div>
        <div class="outbox-picker-body">
          <p class="outbox-picker-intro">Pick one or more platforms. Each selected destination gets its own publish call to the Social MCP.</p>
          <div class="outbox-picker-list">
            ${platforms.map(p => `
              <label class="outbox-picker-row">
                <input type="checkbox" class="outbox-picker-check" value="${_e(p.id)}" />
                <span class="outbox-picker-icon">${_e(p.icon)}</span>
                <span class="outbox-picker-info">
                  <span class="outbox-picker-name">${_e(p.label)}</span>
                  <span class="outbox-picker-desc">${_e(p.desc)}</span>
                </span>
              </label>
            `).join('')}
          </div>
          ${isSchedule ? `
            <label class="outbox-picker-label">
              Schedule for
              <input type="datetime-local" class="outbox-picker-when" value="${_e(defaultWhen)}" />
            </label>
          ` : ''}
          <div class="outbox-picker-status" id="outbox-picker-status"></div>
        </div>
        <div class="outbox-picker-actions">
          <button class="btn btn-sm outbox-picker-cancel">Cancel</button>
          <button class="btn btn-sm btn-primary outbox-picker-submit" disabled>${_e(submitLabel)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const closeOverlay = () => {
      overlay.remove();
      document.body.style.overflow = '';
    };

    const submitBtn = overlay.querySelector('.outbox-picker-submit');
    const statusEl  = overlay.querySelector('#outbox-picker-status');

    const refreshSubmit = () => {
      const any = overlay.querySelectorAll('.outbox-picker-check:checked').length > 0;
      submitBtn.disabled = !any;
    };

    overlay.querySelectorAll('.outbox-picker-check').forEach(cb => {
      cb.addEventListener('change', refreshSubmit);
    });

    overlay.querySelector('.outbox-picker-close')?.addEventListener('click', closeOverlay);
    overlay.querySelector('.outbox-picker-cancel')?.addEventListener('click', closeOverlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { closeOverlay(); document.removeEventListener('keydown', onKey); }
    });

    submitBtn.addEventListener('click', async () => {
      const selected = Array.from(overlay.querySelectorAll('.outbox-picker-check:checked')).map(c => c.value);
      if (!selected.length) return;

      submitBtn.disabled = true;
      submitBtn.textContent = isSchedule ? 'Scheduling…' : 'Publishing…';
      statusEl.innerHTML = '';

      let results = [];
      try {
        if (isSchedule) {
          const whenEl = overlay.querySelector('.outbox-picker-when');
          const whenIso = whenEl && whenEl.value ? new Date(whenEl.value).toISOString() : null;
          if (!whenIso) {
            statusEl.innerHTML = '<span class="outbox-picker-err">Pick a schedule time.</span>';
            submitBtn.disabled = false;
            submitBtn.textContent = submitLabel;
            return;
          }
          results = await CQ.scheduleTo(itemId, selected, whenIso);
        } else {
          results = await CQ.publishTo(itemId, selected);
        }
      } catch (err) {
        results = selected.map(p => ({ platform: p, success: false, error: err && err.message || 'unknown error' }));
      }

      const ok = results.filter(r => r.success).map(r => r.platform);
      const fail = results.filter(r => !r.success);

      if (!fail.length) {
        closeOverlay();
        _renderOutbox(parentEl);
      } else {
        statusEl.innerHTML = `
          ${ok.length ? `<div class="outbox-picker-ok">Succeeded on: ${ok.map(_e).join(', ')}</div>` : ''}
          <div class="outbox-picker-err">Failed on: ${fail.map(f => _e(f.platform) + ' (' + _e(f.error || 'error') + ')').join('; ')}</div>
        `;
        submitBtn.disabled = false;
        submitBtn.textContent = submitLabel;
        // Still refresh the outbox so any partial successes reflect
        _renderOutbox(parentEl);
      }
    });
  }

  function _showOutboxCardDetail(parentEl, item) {
    const _e = typeof Utils !== 'undefined' ? Utils.esc : (s) => String(s || '');
    const CQ = typeof ContentQueue !== 'undefined' ? ContentQueue : null;
    const type = CQ ? CQ.getTypeMeta(item.content_type) : { icon: '\uD83D\uDCDD', label: 'Content', color: '#94a3b8' };
    const content = CQ ? CQ.getContent(item) : (item.result || '');
    const rendered = CQ ? CQ.renderMarkdown(content) : _e(content);
    const status = item.approval_status || 'draft';
    const time = CQ ? CQ.timeAgo(item.created_at) : '';
    const statusColors = { draft: '#eab308', approved: '#22c55e', rejected: '#ef4444' };

    const overlay = document.createElement('div');
    overlay.className = 'outbox-detail-overlay';
    overlay.innerHTML = `
      <div class="outbox-detail-panel">
        <div class="outbox-detail-head">
          <span class="outbox-card-type" style="color:${type.color}">${type.icon} ${_e(type.label)}</span>
          <span class="outbox-card-agent">${_e(item.agent_name || 'Agent')}</span>
          <span class="outbox-cal-card-badge" style="background:${statusColors[status] || '#94a3b8'}">${_e(status)}</span>
          <span class="outbox-card-time">${_e(time)}</span>
          <button class="btn outbox-detail-close">&times;</button>
        </div>
        <div class="outbox-detail-body">${rendered}</div>
        <div class="outbox-detail-actions" data-id="${_e(item.id)}">
          ${status === 'draft' ? `
            <button class="btn outbox-approve-btn">&#10003; Approve</button>
            <button class="btn outbox-reject-btn">&#10005; Reject</button>
          ` : ''}
          ${status === 'approved' && item.content_type === 'social' ? `
            <button class="btn btn-primary outbox-publish-btn">&#x21AA; Publish</button>
            <button class="btn outbox-schedule-btn">&#x23F1; Schedule</button>
          ` : ''}
          <button class="btn outbox-copy-btn">Copy</button>
        </div>
      </div>
    `;

    overlay.addEventListener('click', async (e) => {
      if (e.target === overlay || e.target.closest('.outbox-detail-close')) {
        overlay.remove();
        return;
      }
      if (e.target.closest('.outbox-approve-btn')) {
        if (typeof ContentQueue !== 'undefined') await ContentQueue.approve(item.id);
        overlay.remove();
        _renderOutbox(parentEl);
      }
      if (e.target.closest('.outbox-reject-btn')) {
        if (typeof ContentQueue !== 'undefined') await ContentQueue.reject(item.id);
        overlay.remove();
        _renderOutbox(parentEl);
      }
      if (e.target.closest('.outbox-copy-btn')) {
        if (typeof ContentQueue !== 'undefined') await ContentQueue.copy(item.id);
      }
      if (e.target.closest('.outbox-publish-btn')) {
        overlay.remove();
        _showPlatformPicker(parentEl, item.id, 'publish');
      }
      if (e.target.closest('.outbox-schedule-btn')) {
        overlay.remove();
        _showPlatformPicker(parentEl, item.id, 'schedule');
      }
    });

    parentEl.appendChild(overlay);
  }

  function _bindEvents() {
    // Scroll-end detection for tab fade hint
    const tabBar = document.getElementById('bp-type-tabs');
    if (tabBar) {
      const _checkScroll = () => {
        const atEnd = tabBar.scrollLeft + tabBar.clientWidth >= tabBar.scrollWidth - 4;
        tabBar.classList.toggle('scroll-end', atEnd);
      };
      tabBar.addEventListener('scroll', _checkScroll, { passive: true });
      _checkScroll();
    }

    // Main tabs
    document.getElementById('bp-type-tabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('.bp-type-tab');
      if (!tab) return;
      document.querySelectorAll('.bp-type-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _activeTab = tab.dataset.tab;
      _colSort = { key: null, dir: 'asc' };
      _toggleSchematicView();
      if (_activeTab !== 'blueprints') return;
      _updateRarityFilters();
      if (document.getElementById('bp-search')) document.getElementById('bp-search').value = '';
      _applyFilters();
    });

    // Sub-tabs (Spaceships / Agents within Blueprints)
    document.getElementById('bp-sub-tabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('.bp-sub-tab');
      if (!tab) return;
      document.querySelectorAll('.bp-sub-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _subTab = tab.dataset.sub;
      _colSort = { key: null, dir: 'asc' };
      _updateRarityFilters();
      if (document.getElementById('bp-search')) document.getElementById('bp-search').value = '';
      _applyFilters();
    });

    document.getElementById('bp-search')?.addEventListener('input', () => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => _applyFilters(), 300);
    });
    document.getElementById('bp-sort')?.addEventListener('change', () => _applyFilters());
    document.getElementById('bp-category')?.addEventListener('change', () => _applyFilters());
    document.getElementById('bp-tier')?.addEventListener('change', () => _applyFilters());

    // View toggle buttons
    document.getElementById('bp-view-toggle')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.bp-view-btn');
      if (!btn) return;
      _viewMode = btn.dataset.view;
      localStorage.setItem(Utils.KEYS.bpView, _viewMode);
      document.querySelectorAll('.bp-view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _applyFilters();
    });

    // Rarity filter buttons
    document.getElementById('bp-rarity-filters')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.bp-rarity-btn');
      if (!btn) return;
      document.querySelectorAll('.bp-rarity-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      _applyFilters();
    });

    document.getElementById('bp-source-filter')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.bp-source-btn');
      if (!btn) return;
      _sourceFilter = btn.dataset.source;
      document.querySelectorAll('.bp-source-btn').forEach(b => {
        const on = b.dataset.source === _sourceFilter;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      // Reflect in the URL so the filter is shareable / survives reloads
      const base = (location.hash || '').split('?')[0] || '#/bridge';
      const params = new URLSearchParams((location.hash || '').split('?')[1] || '');
      if (_sourceFilter === 'all') params.delete('source');
      else params.set('source', _sourceFilter);
      if (!params.has('tab')) params.set('tab', _subTab);
      const qs = params.toString();
      history.replaceState(null, '', base + (qs ? '?' + qs : ''));
      _applyFilters();
    });

    // Import Blueprint button
    document.getElementById('btn-bp-import')?.addEventListener('click', () => {
      // Create import modal if it doesn't exist
      if (!document.getElementById('bp-import-modal')) {
        const modal = document.createElement('div');
        modal.id = 'bp-import-modal';
        modal.className = 'builder-import-modal';
        modal.innerHTML = `
          <div class="builder-import-content">
            <h3>Import Blueprint</h3>
            <textarea id="bp-import-textarea" class="builder-md-textarea" spellcheck="false" placeholder="Paste blueprint text here..."></textarea>
            <div id="bp-import-status" class="builder-md-status"></div>
            <div class="builder-actions-row">
              <button type="button" class="btn btn-primary" id="bp-import-confirm">Import</button>
              <button type="button" class="btn btn-sm" id="bp-import-cancel">Cancel</button>
            </div>
          </div>`;
        document.body.appendChild(modal);

        let _debTimer;
        document.getElementById('bp-import-textarea').addEventListener('input', () => {
          clearTimeout(_debTimer);
          _debTimer = setTimeout(() => {
            const md = document.getElementById('bp-import-textarea').value;
            const statusEl = document.getElementById('bp-import-status');
            if (!md) { statusEl.textContent = ''; return; }
            const v = BlueprintMarkdown.validate(md);
            if (!v.valid) { statusEl.textContent = v.errors.join('; '); statusEl.className = 'builder-md-status error'; }
            else if (v.warnings.length) { statusEl.textContent = v.warnings.join('; '); statusEl.className = 'builder-md-status warn'; }
            else { statusEl.textContent = 'Valid blueprint'; statusEl.className = 'builder-md-status ok'; }
          }, 300);
        });

        document.getElementById('bp-import-cancel').addEventListener('click', () => {
          document.getElementById('bp-import-modal').style.display = 'none';
        });

        document.getElementById('bp-import-confirm').addEventListener('click', () => {
          const md = document.getElementById('bp-import-textarea').value;
          const v = BlueprintMarkdown.validate(md);
          if (!v.valid) { document.getElementById('bp-import-status').textContent = v.errors.join('; '); return; }
          const bp = BlueprintMarkdown.parse(md);
          document.getElementById('bp-import-modal').style.display = 'none';
          // Navigate to the appropriate builder with parsed data
          if (bp.type === 'spaceship') {
            Router.navigate('#/bridge/spaceships/new');
          } else {
            Router.navigate('#/bridge/agents/new');
          }
          // Store parsed data for the builder to pick up
          sessionStorage.setItem(Utils.KEYS.importBp, JSON.stringify(bp));
          if (typeof Notify !== 'undefined') Notify.send('Blueprint parsed — fill in the builder form', 'success');
        });
      }
      document.getElementById('bp-import-textarea').value = '';
      document.getElementById('bp-import-status').textContent = '';
      document.getElementById('bp-import-modal').style.display = '';
    });

    // Create button — context-sensitive (agent vs spaceship sub-tab)
    document.getElementById('btn-bp-create')?.addEventListener('click', (e) => {
      if (_subTab === 'spaceship') {
        e.preventDefault();
        Router.navigate('#/bridge/spaceships/new');
      }
    });

    // Deactivate All button
  }

  function _fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    if (typeof Notify !== 'undefined') Notify.send({ title: 'Link Copied', message: 'Blueprint share URL copied to clipboard.', type: 'system' });
  }

  /* ── Share blueprint URL ── */
  function _share(bpId) {
    const rawId = bpId.replace(/^bp-/, '');
    const bp = SEED.find(b => b.id === bpId) || SPACESHIP_SEED.find(b => b.id === bpId) || _remoteBlueprints.find(b => b.id === bpId)
      || (typeof BlueprintStore !== 'undefined' && (BlueprintStore.getAgent(bpId) || BlueprintStore.getAgent(rawId) || BlueprintStore.getSpaceship(bpId) || BlueprintStore.getSpaceship(rawId)))
      || null;
    if (!bp) return;
    const url = window.location.origin + '/app/#/bridge?bp=' + encodeURIComponent(bpId);

    // Always copy to clipboard (fallback for non-secure contexts)
    try {
      navigator.clipboard.writeText(url).then(() => {
        if (typeof Notify !== 'undefined') {
          Notify.send({ title: 'Link Copied', message: 'Blueprint share URL copied to clipboard.', type: 'system' });
        }
      }).catch(() => _fallbackCopy(url));
    } catch (_) { _fallbackCopy(url); }
    // Also open native share if available
    if (navigator.share) {
      navigator.share({ title: bp.name + ' — NICE Blueprint', text: bp.description, url }).catch(() => {});
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     DRAWER — right-side detail panel (replaces modal for all types)
     ═══════════════════════════════════════════════════════════════ */

  function _findBp(bpId) {
    const BS = typeof BlueprintStore !== 'undefined' ? BlueprintStore : null;
    // Community blueprints that came back in _currentResults carry their
    // joined `listing` sidecar — prefer that row so the drawer has the
    // listing_id for install/rate actions. Falls through to catalog
    // lookups for rows not in the current result set.
    const cr = _currentResults.find(b => b.id === bpId);
    if (cr) {
      if ((cr.type || 'agent') === 'spaceship') return { bp: cr, type: 'spaceship' };
      return { bp: cr, type: 'agent' };
    }
    const a = SEED.find(b => b.id === bpId) || _remoteBlueprints.find(b => b.id === bpId)
      || (BS && BS.getAgent(bpId));
    if (a) return { bp: a, type: 'agent' };
    const s = SPACESHIP_SEED.find(b => b.id === bpId)
      || (BS && BS.getSpaceship(bpId));
    if (s) return { bp: s, type: 'spaceship' };
    if (typeof Skin !== 'undefined') {
      const sk = Skin.getPack(bpId);
      if (sk) return { bp: sk, type: 'skin' };
    }
    // Fallback: check State for user-created ships/agents
    const stateShips = (typeof State !== 'undefined' ? State.get('spaceships') : null) || [];
    const us = stateShips.find(b => b.id === bpId);
    if (us) return { bp: us, type: 'spaceship' };
    const stateAgents = (typeof State !== 'undefined' ? State.get('agents') : null) || [];
    const ua = stateAgents.find(b => b.id === bpId);
    if (ua) return { bp: ua, type: 'agent' };
    return null;
  }

  function _openDrawer(bpId) {
    const found = _findBp(bpId);
    if (!found) return;
    const { bp, type } = found;
    _drawerBpId = bpId;

    // Build filtered list for arrow-key nav (include activated + catalog cards)
    const grid = document.getElementById('bp-grid');
    const activated = document.getElementById('bp-activated-wrap');
    _drawerBpList = [];
    if (activated) _drawerBpList.push(...Array.from(activated.querySelectorAll('[data-id]')).map(el => el.dataset.id));
    if (grid) _drawerBpList.push(...Array.from(grid.querySelectorAll('[data-id]')).map(el => el.dataset.id));
    _drawerBpIndex = _drawerBpList.indexOf(bpId);

    // Highlight selected card
    document.querySelectorAll('.bp-card-selected').forEach(c => c.classList.remove('bp-card-selected'));
    const card = document.querySelector(`[data-id="${CSS.escape(bpId)}"]`);
    if (card) card.classList.add('bp-card-selected');

    let drawer = document.getElementById('bp-drawer');
    let overlay = document.getElementById('bp-drawer-overlay');
    if (!drawer) {
      overlay = document.createElement('div');
      overlay.id = 'bp-drawer-overlay';
      overlay.className = 'bp-drawer-overlay';
      overlay.addEventListener('click', _closeDrawer);
      document.body.appendChild(overlay);

      drawer = document.createElement('div');
      drawer.id = 'bp-drawer';
      drawer.className = 'bp-drawer';
      document.body.appendChild(drawer);
    }

    drawer.innerHTML = _renderDrawerContent(bp, type);
    _bindDrawerActions(bp, type);

    requestAnimationFrame(() => {
      drawer.classList.add('open');
      overlay.classList.add('open');
    });

    _bindDrawerKeyboard();
  }

  function _closeDrawer() {
    const drawer = document.getElementById('bp-drawer');
    const overlay = document.getElementById('bp-drawer-overlay');
    if (drawer) drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    document.querySelectorAll('.bp-card-selected').forEach(c => c.classList.remove('bp-card-selected'));
    _drawerBpId = null;
    _unbindDrawerKeyboard();
  }

  function _renderDrawerContent(bp, type) {
    const CR = typeof CardRenderer !== 'undefined' ? CardRenderer : null;
    const serial = CR ? CR.serialHash(bp.id || bp.name) : _serialHash(bp.id || bp.name);

    // Hero card — clone the actual catalog card for exact match
    let heroHTML = '';
    const sourceCard = document.querySelector(`.tcg-card[data-id="${CSS.escape(bp.id)}"]`);
    if (sourceCard) {
      const clone = sourceCard.cloneNode(true);
      // Remove interactive classes and actions from clone
      clone.classList.remove('bp-card-clickable', 'bp-card-selected');
      clone.style.pointerEvents = 'none';
      clone.style.margin = '0';
      clone.style.cursor = 'default';
      const actions = clone.querySelector('.tcg-actions');
      if (actions) actions.remove();
      heroHTML = clone.outerHTML;
    } else if (type === 'skin') {
      heroHTML = _tcgCardHTML(bp, 'skin');
    } else if (CR) {
      heroHTML = CR.render(type, 'full', bp, {});
    } else {
      heroHTML = `<div class="tcg-card" style="pointer-events:none"><div class="tcg-name-bar"><span class="tcg-name">${_esc(bp.name)}</span></div></div>`;
    }

    // Stats
    const statsHTML = _renderDrawerStats(bp, type);

    // Capabilities
    let caps = bp.caps || bp.config?.tools || [];
    // For skins, show nav label mappings as capabilities
    if (type === 'skin' && bp.copy?.nav) {
      caps = Object.entries(bp.copy.nav).map(([k, v]) => `${k} → ${v}`);
    }
    const capsHTML = caps.length ? `<div class="bp-drawer-caps">${caps.map(c => `<span class="agent-tool-tag">${_esc(c)}</span>`).join('')}</div>` : '';

    // Actions per type
    const actionsHTML = _renderDrawerActions(bp, type);

    // Social row
    const connCount = _connCount(bp);
    const socialHTML = `<div class="bp-drawer-social">
      <span class="bp-stars" id="bp-drawer-stars">${_renderStars(bp.rating || 0)}</span>
      <span style="opacity:.6;font-size:.75rem">${_formatNum(bp.downloads || connCount)} installs</span>
    </div>`;

    // Dependency hints
    const depsHTML = _getDependencyHints(bp, type);

    // Related blueprints
    const relatedHTML = _getRelatedBlueprints(bp, type);

    return `
      <div class="bp-drawer-header">
        <h3>${_esc(bp.name)}</h3>
        <button class="bp-drawer-close" aria-label="Close">&times;</button>
      </div>
      <div class="bp-drawer-body">
        <div class="bp-drawer-hero">${heroHTML}</div>
        <p style="margin:12px 0;opacity:.8;font-size:.85rem">${_esc(bp.description || bp.desc || bp.flavor || '')}</p>
        ${socialHTML}
        ${depsHTML}
        <div class="bp-drawer-stats">${statsHTML}</div>
        ${capsHTML}
        <div class="bp-drawer-actions">${actionsHTML}</div>
        ${relatedHTML}
      </div>`;
  }

  function _renderDrawerStats(bp, type) {
    const rows = [];
    if (type === 'agent') {
      const c = bp.config || {};
      const s = bp.stats || {};
      const profile = c.model_profile || null;
      const _humanize = (typeof BlueprintUtils !== 'undefined' && BlueprintUtils.humanizeModel)
        ? BlueprintUtils.humanizeModel
        : (id) => id || '—';

      rows.push(['Role', c.role || bp.category || '—']);
      rows.push(['Type', c.type || '—']);
      // Runtime model — model_profile.preferred wins, falls back to legacy llm_engine
      const modelId = (profile && profile.preferred) || c.llm_engine || '';
      rows.push(['Model', modelId ? _humanize(modelId) : '—']);
      // Surface the rest of model_profile so users see what they're getting
      if (profile) {
        if (profile.tier) {
          const tierLabel = profile.tier === 'premium' ? 'Premium (token cost)' : 'Free (no cost)';
          rows.push(['Tier', tierLabel]);
        }
        if (profile.fallback) rows.push(['Fallback', _humanize(profile.fallback)]);
        if (typeof profile.temperature === 'number') {
          rows.push(['Temperature', String(profile.temperature)]);
        }
        if (typeof profile.max_output_tokens === 'number') {
          rows.push(['Max Output', profile.max_output_tokens.toLocaleString() + ' tokens']);
        }
      }
      rows.push(['Rarity', bp.rarity || 'Common']);
      if (s.spd) rows.push(['Speed', s.spd]);
      if (s.acc) rows.push(['Accuracy', s.acc]);
      if (s.pwr) rows.push(['Power', s.pwr]);
      // Model Intelligence stats
      if (typeof ModelIntel !== 'undefined') {
        const profile = ModelIntel.getProfile(bp.id);
        if (profile && Object.keys(profile.models).length > 0) {
          const sorted = Object.entries(profile.models)
            .filter(([, d]) => d.runs >= 1)
            .sort((a, b) => (b[1].successes / b[1].runs) - (a[1].successes / a[1].runs));
          if (sorted.length) {
            rows.push(['', '']);
            const models = typeof LLM_MODELS !== 'undefined' ? LLM_MODELS : [];
            sorted.slice(0, 3).forEach(([modelId, data]) => {
              const label = models.find(m => m.id === modelId)?.label || modelId;
              const rate = Math.round((data.successes / data.runs) * 100);
              rows.push([label, rate + '% (' + data.runs + ' runs)']);
            });
          }
        }
      }
    } else if (type === 'spaceship') {
      const s = bp.stats || {};
      rows.push(['Rank', bp.rarity || 'Common']);
      rows.push(['Agents', s.crew || '—']);
      rows.push(['Deploys', String(bp.activation_count || 0)]);
      rows.push(['Category', bp.category || '—']);
    } else if (type === 'skin') {
      const td = bp.theme_data || {};
      rows.push(['Category', bp.category || '—']);
      rows.push(['Rarity', bp.rarity || 'Legendary']);
      rows.push(['Cost', bp.price ? '$' + (bp.price / 100).toFixed(2) : 'Free']);
      if (td.fonts?.['--font-h']) rows.push(['Heading Font', td.fonts['--font-h']]);
      if (td.fonts?.['--font-b']) rows.push(['Body Font', td.fonts['--font-b']]);
      if (td.radius) rows.push(['Border Radius', td.radius]);
      if (bp.effect) rows.push(['Canvas Effect', bp.effect]);
    }
    return rows.map(([k, v, raw]) => {
      if (raw) return `<div class="detail-kv-row bp-stat-full"><span class="kv-label">${_esc(k)}</span><span class="kv-val bp-formation-wrap">${v}</span></div>`;
      return `<div class="detail-kv-row"><span class="kv-label">${_esc(k)}</span><span class="kv-val">${_esc(String(v))}</span></div>`;
    }).join('');
  }

  function _renderDrawerActions(bp, type) {
    const btns = [];
    const isCommunity = bp && bp.scope === 'community';
    const listingId = bp && bp.listing && bp.listing.id;
    if (type === 'agent') {
      if (BlueprintStore.isAgentActivated(bp.id)) {
        btns.push(`<button class="btn btn-sm bp-drawer-nice" data-id="${bp.id}" data-name="${_esc(bp.name)}" data-type="agent">Message ${_esc(bp.name)}</button>`);
      } else if (isCommunity) {
        // Community agents use "Install" wording — same underlying
        // activation flow (rarity gate + persistence) via BlueprintStore,
        // plus the listing download counter bump for discovery stats.
        btns.push(`<button class="btn btn-primary btn-sm bp-drawer-mp-install" data-id="${bp.id}" data-listing="${_esc(listingId || '')}">Install</button>`);
      }
      btns.push(`<button class="btn btn-sm bp-drawer-nav" data-route="#/agents/${encodeURIComponent(bp.id)}">View Agent &rarr;</button>`);
    } else if (type === 'spaceship') {
      const isAct = BlueprintStore.isShipActivated(bp.id);
      if (isAct) {
        btns.push(`<button class="btn btn-sm bp-drawer-nice" data-id="${bp.id}" data-name="${_esc(bp.name)}" data-type="spaceship">Message ${_esc(bp.name)}</button>`);
        btns.push(`<button class="btn btn-sm bp-drawer-activate" data-id="${bp.id}" data-type="spaceship">Remove</button>`);
      } else {
        btns.push(`<button class="btn btn-primary btn-sm bp-drawer-ship-wizard" data-id="${bp.id}">Setup Spaceship</button>`);
      }
    } else if (type === 'skin') {
      const isActive = typeof Skin !== 'undefined' && Skin.activeSkin()?.id === bp.id;
      btns.push(`<button class="bp-toggle-switch bp-drawer-skin-toggle${isActive ? ' on' : ''}" data-id="${bp.id}"><span class="toggle-track"><span class="toggle-knob"></span></span></button>`);
      if (!isActive) btns.push(`<button class="btn btn-sm bp-drawer-skin-preview" data-id="${bp.id}">Preview</button>`);
    }
    if (typeof BlueprintMarkdown !== 'undefined') {
      btns.push(`<button class="btn btn-sm bp-drawer-copy-bp" data-id="${bp.id}" data-type="${type}" title="Copy as text">Copy Blueprint</button>`);
    }
    btns.push(`<button class="btn btn-sm bp-drawer-share" data-id="${bp.id}" title="Share">&#8599; Share</button>`);
    return btns.join('');
  }

  function _bindDrawerActions(bp, type) {
    const drawer = document.getElementById('bp-drawer');
    if (!drawer) return;

    drawer.querySelector('.bp-drawer-close')?.addEventListener('click', _closeDrawer);

    // Hero card click → mission prompt for activated blueprints
    const isActivated = type === 'spaceship'
      ? BlueprintStore.isShipActivated(bp.id)
      : BlueprintStore.isAgentActivated(bp.id);
    if (isActivated) {
      const heroCard = drawer.querySelector('.tcg-card');
      if (heroCard) {
        heroCard.style.cursor = 'pointer';
        heroCard.style.pointerEvents = 'auto';
        heroCard.addEventListener('click', () => _promptActivatedCard(bp.id, type));
      }
    }

    // Activate (spaceship only — crew cards don't have activate)
    drawer.querySelectorAll('.bp-drawer-activate').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const t = btn.dataset.type;
        if (t === 'spaceship') {
          if (BlueprintStore.isShipActivated(id)) {
            const b = _findBp(id)?.bp;
            confirmDeactivate(b?.name || 'this spaceship', async () => { await BlueprintStore.deactivateShip(id); _applyFilters(); _openDrawer(id); });
          } else {
            _closeDrawer();
            const bp = _findShipBp(id);
            if (bp && typeof ShipSetupWizard !== 'undefined') {
              ShipSetupWizard.open(bp, { onComplete: () => _applyFilters() });
            }
          }
        }
      });
    });

    // NICE
    drawer.querySelectorAll('.bp-drawer-nice').forEach(btn => {
      btn.addEventListener('click', () => _promptActivatedCard(bp.id, type));
    });

    // Marketplace install — delegates to BlueprintStore.activateAgent so
    // rarity gates, persistence, and realtime sync all work for free.
    drawer.querySelectorAll('.bp-drawer-mp-install').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const listingId = btn.dataset.listing;
        const ok = BlueprintStore.activateAgent(id);
        if (ok === false) return; // rarity gate already notified the user
        if (listingId) BlueprintStore.incrementMarketplaceDownloads(listingId);
        if (typeof Notify !== 'undefined') {
          Notify.send({ title: 'Installed', message: `${bp.name} added to your agents.`, type: 'task_complete' });
        }
        if (typeof Gamification !== 'undefined') Gamification.addXP('install_blueprint');
        _applyFilters();
        _openDrawer(id);
      });
    });

    // Navigate
    drawer.querySelectorAll('.bp-drawer-nav').forEach(btn => {
      btn.addEventListener('click', () => {
        _closeDrawer();
        const route = btn.dataset.route;
        if (typeof Router !== 'undefined') Router.navigate(route);
        else location.hash = route;
      });
    });

    // Ship Setup Wizard
    drawer.querySelectorAll('.bp-drawer-ship-wizard').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const bpObj = _findBp(id)?.bp;
        if (!bpObj || typeof ShipSetupWizard === 'undefined') return;
        _closeDrawer();
        const isReconfigure = btn.dataset.reconfigure === '1';
        const existingName = bpObj._shipName || bpObj.name;
        ShipSetupWizard.open(bpObj, isReconfigure ? { startStep: 1, shipName: existingName } : {});
      });
    });

    // Contact Sales
    drawer.querySelectorAll('.bp-drawer-contact').forEach(btn => {
      btn.addEventListener('click', () => _contactSales(btn.dataset.id));
    });

    // Skin toggle
    drawer.querySelectorAll('.bp-drawer-skin-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof Skin === 'undefined') return;
        const id = btn.dataset.id;
        if (Skin.activeSkin()?.id === id) {
          Skin.deactivate();
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Skin Off', message: 'Restored default appearance.', type: 'info' });
        } else {
          if (!Skin.ownsSkin(id) && Skin.getPack(id)?.price) Skin.purchaseSkin(id);
          Skin.activate(id);
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Skin On', message: (Skin.getPack(id)?.name || id) + ' applied!', type: 'task_complete' });
          if (typeof Gamification !== 'undefined') Gamification.addXP('install_blueprint');
        }
        _applyFilters();
        _openDrawer(id);
      });
    });

    // Skin preview
    drawer.querySelectorAll('.bp-drawer-skin-preview').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof Skin === 'undefined') return;
        const id = btn.dataset.id;
        Skin.activate(id);
        if (typeof Notify !== 'undefined') Notify.send({ title: 'Skin Preview', message: 'Previewing ' + (Skin.getPack(id)?.name || id) + '. Navigate around to see changes.', type: 'info' });
        _applyFilters();
      });
    });

    // Share
    drawer.querySelectorAll('.bp-drawer-share').forEach(btn => {
      btn.addEventListener('click', () => _share(btn.dataset.id));
    });

    // Copy Blueprint (as text)
    drawer.querySelectorAll('.bp-drawer-copy-bp').forEach(btn => {
      btn.addEventListener('click', () => {
        const bpObj = Object.assign({}, bp, { type: btn.dataset.type || type });
        const md = BlueprintMarkdown.serialize(bpObj);
        navigator.clipboard.writeText(md).then(() => {
          if (typeof Notify !== 'undefined') Notify.send('Blueprint copied to clipboard', 'success');
        });
      });
    });

    // Hangar add from drawer
    drawer.querySelectorAll('.bp-drawer-hangar-add').forEach(btn => {
      btn.addEventListener('click', () => _addToHangar(btn.dataset.id, btn.dataset.type));
    });

    // Related blueprint clicks
    drawer.querySelectorAll('.bp-drawer-related-card').forEach(card => {
      card.addEventListener('click', () => _openDrawer(card.dataset.id));
    });

  }

  /* ═══════════════════════════════════════════════════════
     KEYBOARD NAVIGATION — arrows to browse, ESC to close
     ═══════════════════════════════════════════════════════ */

  function _bindDrawerKeyboard() {
    _unbindDrawerKeyboard();
    _drawerKeyHandler = (e) => {
      // Don't intercept when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'Escape') {
        e.preventDefault();
        // Close compare panel first if open
        const cp = document.getElementById('bp-compare-panel');
        if (cp) { _closeComparePanel(); return; }
        _closeDrawer();
        return;
      }

      if (!_drawerBpId || !_drawerBpList.length) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = _drawerBpIndex + 1;
        if (next < _drawerBpList.length) {
          _drawerBpIndex = next;
          _openDrawer(_drawerBpList[next]);
          // Scroll card into view
          const card = document.querySelector(`[data-id="${CSS.escape(_drawerBpList[next])}"]`);
          if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = _drawerBpIndex - 1;
        if (prev >= 0) {
          _drawerBpIndex = prev;
          _openDrawer(_drawerBpList[prev]);
          const card = document.querySelector(`[data-id="${CSS.escape(_drawerBpList[prev])}"]`);
          if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    };
    document.addEventListener('keydown', _drawerKeyHandler);
  }

  function _unbindDrawerKeyboard() {
    if (_drawerKeyHandler) {
      document.removeEventListener('keydown', _drawerKeyHandler);
      _drawerKeyHandler = null;
    }
  }

  /* ═══════════════════════════════════════════════
     QUICK-COMPARE MODE — shift+click up to 4 cards
     ═══════════════════════════════════════════════ */

  function _toggleCompare(bpId) {
    const idx = _compareIds.indexOf(bpId);
    if (idx > -1) {
      _compareIds.splice(idx, 1);
    } else {
      if (_compareIds.length >= 4) return; // max 4
      _compareIds.push(bpId);
    }

    // Update card highlights
    document.querySelectorAll('.bp-compare-selected').forEach(c => c.classList.remove('bp-compare-selected'));
    _compareIds.forEach(id => {
      const card = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (card) card.classList.add('bp-compare-selected');
    });

    _renderCompareBar();
  }

  function _renderCompareBar() {
    let bar = document.getElementById('bp-compare-bar');
    if (_compareIds.length === 0) {
      if (bar) bar.classList.remove('visible');
      return;
    }
    // Hide hangar bar when compare is active
    const hBar = document.getElementById('bp-hangar-bar');
    if (hBar) hBar.classList.remove('visible');

    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'bp-compare-bar';
      bar.className = 'bp-compare-bar';
      document.body.appendChild(bar);
    }
    bar.innerHTML = `<span>${_compareIds.length} selected</span>
      <button class="btn btn-primary btn-sm" id="bp-compare-go" ${_compareIds.length < 2 ? 'disabled' : ''}>Compare</button>
      <button class="btn btn-sm" id="bp-compare-clear">Clear</button>`;
    bar.classList.add('visible');

    document.getElementById('bp-compare-go')?.addEventListener('click', _showComparePanel);
    document.getElementById('bp-compare-clear')?.addEventListener('click', () => {
      _compareIds = [];
      document.querySelectorAll('.bp-compare-selected').forEach(c => c.classList.remove('bp-compare-selected'));
      _renderCompareBar();
    });
  }

  function _showComparePanel() {
    if (_compareIds.length < 2) return;
    _closeDrawer();

    const panel = document.createElement('div');
    panel.id = 'bp-compare-panel';
    panel.className = 'bp-compare-panel';

    const cards = _compareIds.map(id => {
      const found = _findBp(id);
      if (!found) return '';
      const { bp, type } = found;
      const CR = typeof CardRenderer !== 'undefined' ? CardRenderer : null;
      const cardHTML = CR ? CR.render(type, 'full', bp, {}) : `<div class="tcg-card"><div class="tcg-name-bar"><span class="tcg-name">${_esc(bp.name)}</span></div></div>`;

      // Build stat rows for comparison
      const statsHTML = _renderDrawerStats(bp, type);
      const caps = (bp.caps || bp.config?.tools || []).slice(0, 5);
      const capsHTML = caps.map(c => `<span class="agent-tool-tag">${_esc(c)}</span>`).join('');

      return `<div class="bp-compare-col">
        <div class="bp-compare-card">${cardHTML}</div>
        <div class="bp-compare-stats">${statsHTML}</div>
        <div class="bp-compare-caps">${capsHTML}</div>
      </div>`;
    }).join('');

    panel.innerHTML = `
      <div class="bp-compare-panel-header">
        <h3>Compare Blueprints</h3>
        <button class="bp-compare-panel-close" aria-label="Close">&times;</button>
      </div>
      <div class="bp-compare-grid">${cards}</div>`;
    document.body.appendChild(panel);

    // Highlight best/worst stats across compared cards
    _highlightCompareDiffs(panel);

    panel.querySelector('.bp-compare-panel-close')?.addEventListener('click', _closeComparePanel);
    panel.addEventListener('click', (e) => { if (e.target === panel) _closeComparePanel(); });

    // ESC to close compare panel
    const _escHandler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); _closeComparePanel(); document.removeEventListener('keydown', _escHandler); }
    };
    document.addEventListener('keydown', _escHandler);
  }

  function _highlightCompareDiffs(panel) {
    // Find all stat value cells across columns and highlight best/worst
    const cols = panel.querySelectorAll('.bp-compare-col');
    if (cols.length < 2) return;
    // Gather stat rows: each .bp-compare-stats has .stat-row elements
    const statRowSets = [...cols].map(col => col.querySelectorAll('.stat-row .stat-val, .drawer-stat-val'));
    if (!statRowSets[0]?.length) return;
    const rowCount = statRowSets[0].length;
    for (let i = 0; i < rowCount; i++) {
      const vals = statRowSets.map(rows => rows[i]);
      const nums = vals.map(el => parseFloat((el?.textContent || '').replace(/[^0-9.]/g, '')) || 0);
      if (nums.every(n => n === nums[0])) continue; // all equal
      const max = Math.max(...nums);
      const min = Math.min(...nums);
      vals.forEach((el, j) => {
        if (!el) return;
        if (nums[j] === max) el.classList.add('bp-compare-best');
        else if (nums[j] === min && nums.filter(n => n === min).length < nums.length) el.classList.add('bp-compare-worst');
      });
    }
    // Highlight unique vs shared capabilities
    const capSets = [...cols].map(col => [...col.querySelectorAll('.bp-compare-caps .agent-tool-tag')].map(el => el.textContent.trim()));
    const allCaps = capSets.flat();
    cols.forEach((col, ci) => {
      col.querySelectorAll('.bp-compare-caps .agent-tool-tag').forEach(tag => {
        const text = tag.textContent.trim();
        const isUnique = allCaps.filter(c => c === text).length === 1;
        if (isUnique) tag.classList.add('bp-compare-unique');
      });
    });
  }

  function _closeComparePanel() {
    const panel = document.getElementById('bp-compare-panel');
    if (panel) panel.remove();
  }

  /* ═══════════════════════════════════════════
     HANGAR CART — batch activation
     ═══════════════════════════════════════════ */

  function _addToHangar(bpId, type) {
    if (_hangarItems.find(h => h.id === bpId)) return;
    const found = _findBp(bpId);
    if (!found) return;

    // No hangar for crew cards
    if (type === 'agent') return;
    // Don't add already-activated items
    if (type === 'spaceship' && BlueprintStore.isShipActivated(bpId)) return;
    _hangarItems.push({ id: bpId, type: type, name: found.bp.name });
    _renderHangarBar();
  }

  function _removeFromHangar(bpId) {
    _hangarItems = _hangarItems.filter(h => h.id !== bpId);
    _renderHangarBar();
  }

  function _renderHangarBar() {
    let bar = document.getElementById('bp-hangar-bar');
    if (_hangarItems.length === 0) {
      if (bar) bar.classList.remove('visible');
      return;
    }
    // Hide compare bar when hangar is active
    const cBar = document.getElementById('bp-compare-bar');
    if (cBar) cBar.classList.remove('visible');

    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'bp-hangar-bar';
      bar.className = 'bp-hangar-bar';
      document.body.appendChild(bar);
    }

    const thumbs = _hangarItems.map(h =>
      `<div class="bp-hangar-item" data-id="${h.id}" title="${_esc(h.name)}">
        <span class="bp-hangar-item-name">${_esc(h.name.slice(0, 8))}</span>
        <button class="bp-hangar-item-x" data-id="${h.id}">&times;</button>
      </div>`
    ).join('');

    bar.innerHTML = `
      <div class="bp-hangar-items">${thumbs}</div>
      <span style="font-size:.8rem;opacity:.7">${_hangarItems.length} in hangar</span>
      <button class="btn btn-primary btn-sm" id="bp-hangar-activate-all">Deploy All</button>
      <button class="btn btn-sm" id="bp-hangar-clear">Clear</button>`;
    bar.classList.add('visible');

    // Bind remove buttons
    bar.querySelectorAll('.bp-hangar-item-x').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); _removeFromHangar(btn.dataset.id); });
    });

    document.getElementById('bp-hangar-activate-all')?.addEventListener('click', _activateAllHangar);
    document.getElementById('bp-hangar-clear')?.addEventListener('click', () => {
      _hangarItems = [];
      _renderHangarBar();
    });
  }

  function _activateAllHangar() {
    _hangarItems.forEach(h => {
      if (h.type === 'spaceship') { BlueprintStore.activateShip(h.id); if (typeof Gamification !== 'undefined') Gamification.addXP('activate_blueprint'); }
    });
    const count = _hangarItems.length;
    _hangarItems = [];
    _renderHangarBar();
    _applyFilters();
    if (typeof Notify !== 'undefined') Notify.send({ title: 'Hangar Deployed', message: count + ' blueprints deployed.', type: 'task_complete' });
  }

  /* ═══════════════════════════════════════════════
     DEPENDENCY HINTS — shown in drawer
     ═══════════════════════════════════════════════ */

  function _getDependencyHints(bp, type) {
    if (type === 'fleet') {
      const neededShips = parseInt(bp.stats?.ships, 10) || 0;
      const activeShips = (typeof BlueprintStore !== 'undefined' && BlueprintStore.getActivatedShipIds)
        ? BlueprintStore.getActivatedShipIds().length : (State.get('spaceships') || []).length;
      if (neededShips > 0 && activeShips < neededShips) {
        return `<div class="bp-drawer-deps">
          <span class="bp-deps-icon">&#9888;</span>
          Needs ${neededShips} spaceships. You have ${activeShips}.
          <a href="#/bridge?tab=spaceship" class="bp-deps-link" onclick="document.getElementById('bp-drawer')?.classList.remove('open');document.getElementById('bp-drawer-overlay')?.classList.remove('open')">Browse Spaceship Blueprints &rarr;</a>
        </div>`;
      }
    }
    return '';
  }

  /* ═══════════════════════════════════════════════
     RELATED BLUEPRINTS — shown in drawer footer
     ═══════════════════════════════════════════════ */

  function _getRelatedBlueprints(bp, type) {
    let related = [];

    if (type === 'agent') {
      // Same category, different rarity
      related = SEED.filter(b => b.id !== bp.id && b.category === bp.category).slice(0, 4);
    } else if (type === 'spaceship') {
      // Agent blueprints that could fit in this ship's slots
      related = SEED.filter(b => b.category && b.id !== bp.id).slice(0, 4);
    }

    if (!related.length) return '';

    const cards = related.map(r => {
      const rType = SEED.find(b => b.id === r.id) ? 'agent' : 'spaceship';
      return `<div class="bp-drawer-related-card" data-id="${r.id}" title="${_esc(r.name)}">
        <div class="bp-related-mini-name">${_esc(r.name)}</div>
        <div class="bp-related-mini-cat">${_esc(r.category || '')}</div>
      </div>`;
    }).join('');

    return `<div class="bp-drawer-related">
      <h4 style="margin:0 0 8px;font-size:.8rem;opacity:.6">RELATED</h4>
      <div class="bp-drawer-related-scroll">${cards}</div>
    </div>`;
  }

  /* ── Deep-link: auto-highlight blueprint from URL ── */
  function _handleDeepLink() {
    const hq = typeof Router !== 'undefined' ? Router.hashQuery() : {};

    // Handle ?tab= param
    const tabParam = hq.tab;
    if (tabParam && ['agent','spaceship'].includes(tabParam) && _activeTab !== tabParam) {
      _activeTab = tabParam;
      document.querySelectorAll('.bp-type-tab').forEach(t => t.classList.remove('active'));
      document.querySelector(`.bp-type-tab[data-tab="${tabParam}"]`)?.classList.add('active');
      _updateRarityFilters();
      _applyFilters();
    }

    // Handle ?search= param — populate search box and filter
    const searchParam = hq.search;
    if (searchParam) {
      const searchInput = document.getElementById('bp-search');
      if (searchInput) {
        searchInput.value = searchParam;
        _applyFilters();
      }
    }

    const bpId = hq.bp;
    if (!bpId) return;

    // Detect which tab the blueprint belongs to and switch if needed
    if (SPACESHIP_SEED.find(b => b.id === bpId) && _activeTab !== 'spaceship') {
      _activeTab = 'spaceship';
      document.querySelectorAll('.bp-type-tab').forEach(t => t.classList.remove('active'));
      document.querySelector('.bp-type-tab[data-tab="spaceship"]')?.classList.add('active');
      _updateRarityFilters();
      _applyFilters();

      _updateRarityFilters();
      _applyFilters();
    }

    // Small delay to let grid render, then open drawer
    setTimeout(() => {
      const card = document.querySelector(`.tcg-card[data-id="${CSS.escape(bpId)}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      _openDrawer(bpId);
    }, 200);
  }

  /* ── Public API for cross-view lookup ── */
  function _getSpaceshipSeed(bpId) {
    return SPACESHIP_SEED.find(b => b.id === bpId) || null;
  }

  /* ── Removal confirmation dialog ──
     Destructive actions re-authenticate. Email/password users must re-enter
     their password (verified via signInWithPassword). OAuth users — who have
     no password to check — must type the blueprint name instead. Signed-out
     users fall through to a plain yes/no since there's no DB write to gate.

     Detection uses user.identities[].provider as the primary source: if any
     identity has provider === 'email' the user has a password, otherwise
     they're OAuth-only. app_metadata.provider is a fallback for shapes where
     identities isn't populated. On any ambiguity we default to TYPED mode —
     better to ask for a name match than lock the user out of their own data.

     Every mode also surfaces a "Use blueprint name instead" escape hatch so
     even if detection is wrong, nobody gets stuck.
  ─────────────────────────────────────────────────────────────────── */
  function _detectAuthMode(user) {
    if (!user) return { mode: 'simple', provider: null };
    // Primary signal: identities array (most reliable for OAuth vs email)
    if (Array.isArray(user.identities) && user.identities.length) {
      const hasEmail = user.identities.some(i => i?.provider === 'email');
      if (hasEmail) return { mode: 'password', provider: 'email' };
      const first = user.identities.find(i => i?.provider)?.provider || 'oauth';
      return { mode: 'typed', provider: first };
    }
    // Fallback: app_metadata
    const amp = user.app_metadata?.provider
      || user.app_metadata?.providers?.[0]
      || null;
    if (amp === 'email') return { mode: 'password', provider: 'email' };
    if (amp) return { mode: 'typed', provider: amp };
    // Unknown — default to typed. Locking a user out is worse than asking
    // them to type a name.
    return { mode: 'typed', provider: 'single sign-on' };
  }

  function confirmDeactivate(name, onConfirm) {
    const user = typeof State !== 'undefined' ? State.get('user') : null;
    let { mode, provider } = _detectAuthMode(user);
    const safeName = _esc(name);

    const overlay = document.createElement('div');
    overlay.className = 'bp-confirm-overlay';
    overlay.innerHTML = `
      <div class="bp-confirm-modal">
        <h3>Remove Blueprint</h3>
        <p>Are you sure you want to remove <span class="bp-confirm-name">${safeName}</span>?</p>
        <p class="bp-confirm-warning">This will permanently remove it from your roster and delete its crew. You can add it back anytime from the Blueprints.</p>
        <p class="bp-confirm-helper" data-role="helper" hidden></p>
        <input data-role="input" class="bp-confirm-input" hidden />
        <button type="button" class="bp-confirm-switch" data-role="switch" hidden></button>
        <p class="bp-confirm-error" data-role="error" hidden></p>
        <div class="bp-confirm-actions">
          <button class="bp-confirm-cancel">Cancel</button>
          <button class="bp-confirm-submit">Remove</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const submitBtn = overlay.querySelector('.bp-confirm-submit');
    const cancelBtn = overlay.querySelector('.bp-confirm-cancel');
    const input     = overlay.querySelector('[data-role="input"]');
    const helper    = overlay.querySelector('[data-role="helper"]');
    const errEl     = overlay.querySelector('[data-role="error"]');
    const switchBtn = overlay.querySelector('[data-role="switch"]');

    const close = () => overlay.remove();
    const showError = (msg) => { if (errEl) { errEl.textContent = msg; errEl.hidden = false; } };
    const clearError = () => { if (errEl) { errEl.hidden = true; errEl.textContent = ''; } };

    const applyMode = () => {
      clearError();
      if (mode === 'simple') {
        input.hidden = true;
        helper.hidden = true;
        switchBtn.hidden = true;
        return;
      }
      if (mode === 'password') {
        input.hidden = false;
        input.type = 'password';
        input.value = '';
        input.placeholder = 'Enter your password';
        input.setAttribute('autocomplete', 'current-password');
        helper.hidden = true;
        switchBtn.hidden = false;
        switchBtn.textContent = "Don't have a password? Type blueprint name instead";
      } else { // typed
        input.hidden = false;
        input.type = 'text';
        input.value = '';
        input.placeholder = 'Type blueprint name to confirm';
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('spellcheck', 'false');
        helper.hidden = false;
        helper.innerHTML = `Your account uses ${_esc(provider || 'single sign-on')}. Type <span class="bp-confirm-name">${safeName}</span> to confirm.`;
        switchBtn.hidden = true;
      }
      setTimeout(() => input.focus(), 50);
    };

    applyMode();

    const doSubmit = async () => {
      clearError();

      if (mode === 'simple') {
        close();
        onConfirm();
        return;
      }

      if (mode === 'password') {
        const pw = input?.value || '';
        if (!pw) { showError('Password required.'); return; }
        if (typeof SB === 'undefined' || !SB.auth || !user?.email) {
          showError('Cannot verify right now — please try again.');
          return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verifying…';
        try {
          await SB.auth.signIn(user.email, pw);
          close();
          onConfirm();
        } catch {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Remove';
          showError('Incorrect password. Click the link below if this isn’t your account.');
          if (input) { input.value = ''; input.focus(); }
        }
        return;
      }

      // typed mode: match blueprint name exactly (case-insensitive, trimmed)
      const entered = (input?.value || '').trim().toLowerCase();
      if (entered !== name.trim().toLowerCase()) {
        showError(`Type "${name}" to confirm.`);
        return;
      }
      close();
      onConfirm();
    };

    switchBtn.addEventListener('click', () => {
      mode = 'typed';
      provider = provider || 'sign-in';
      applyMode();
    });
    cancelBtn.addEventListener('click', close);
    submitBtn.addEventListener('click', doSubmit);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doSubmit(); }
      else if (e.key === 'Escape') close();
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }

  function renderEmbedded(el) { return render(el, { embedded: true }); }

  return { title, render, renderEmbedded, _getSpaceshipSeed, SEED, SPACESHIP_SEED,
    serialHash: typeof CardRenderer !== 'undefined' ? CardRenderer.serialHash : _serialHash,
    avatarArt: typeof CardRenderer !== 'undefined' ? CardRenderer.avatarArt : _avatarArt,
    categoryColors: typeof CardRenderer !== 'undefined' ? CardRenderer.CATEGORY_COLORS : _categoryColors,
    confirmDeactivate, openDrawer: _openDrawer, closeDrawer: _closeDrawer };
})();
