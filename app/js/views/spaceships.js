/* ═══════════════════════════════════════════════════════════════════
   NICE — Spaceship Detail View
   Single-spaceship detail: crew slots, behaviors, workflows, launch/dock.
   (The legacy Shipyard list view lived here too; it was orphaned by the
   Bridge consolidation — /bridge/spaceships routes to BlueprintsView now.)
═══════════════════════════════════════════════════════════════════ */

/* ── Spaceship Detail — Computing Panel with Slot Formation ── */
const SpaceshipDetailView = (() => {
  const title = 'Spaceship Detail';
  const _esc = Utils.esc;
  let _channel = null;
  let _draggedAgentId = null;
  let _draggedAgentRarity = null;

  /* ── Behaviors settings panel ── */
  function _renderBehaviorsPanel(shipId) {
    if (typeof ShipBehaviors === 'undefined') return '';
    const b = ShipBehaviors.getBehaviors(shipId);

    const modeOptions = [
      { value: 'review', label: 'Review Mode', desc: 'All output goes to Outbox for approval' },
      { value: 'autonomous', label: 'Autonomous', desc: 'Agent runs freely, no approval needed' },
      { value: 'draft', label: 'Draft Mode', desc: 'Creates drafts but never auto-publishes' },
    ].map(opt =>
      `<label class="behavior-radio ${b.approvalMode === opt.value ? 'active' : ''}">
        <input type="radio" name="sb-approval-${Utils.esc(shipId)}" value="${opt.value}" ${b.approvalMode === opt.value ? 'checked' : ''}>
        <span class="behavior-radio-label">${opt.label}</span>
        <span class="behavior-radio-desc">${opt.desc}</span>
      </label>`
    ).join('');

    const budgetK = b.dailyBudget ? Math.round(b.dailyBudget / 1000) : '';
    const usedK   = b.budgetUsedToday ? Math.round(b.budgetUsedToday / 1000) : 0;
    const budgetPct = b.dailyBudget ? Math.min(100, Math.round((b.budgetUsedToday / b.dailyBudget) * 100)) : 0;

    return `
      <div class="detail-section ship-behaviors-panel" data-ship-id="${Utils.esc(shipId)}">
        <h3 class="detail-section-title">⚙️ Ship Behaviors</h3>

        <div class="behavior-group">
          <div class="behavior-group-label">Approval Mode</div>
          <div class="behavior-radios">${modeOptions}</div>
        </div>

        <div class="behavior-group behavior-toggles">
          <label class="behavior-toggle">
            <span class="behavior-toggle-text">Auto-run missions on schedule</span>
            <input type="checkbox" class="behavior-cb" data-key="autoRun" ${b.autoRun ? 'checked' : ''}>
            <span class="behavior-toggle-track"></span>
          </label>
          <label class="behavior-toggle">
            <span class="behavior-toggle-text">Notify on mission complete</span>
            <input type="checkbox" class="behavior-cb" data-key="notifyOnComplete" ${b.notifyOnComplete ? 'checked' : ''}>
            <span class="behavior-toggle-track"></span>
          </label>
          <label class="behavior-toggle">
            <span class="behavior-toggle-text">Notify on mission failure</span>
            <input type="checkbox" class="behavior-cb" data-key="notifyOnFail" ${b.notifyOnFail ? 'checked' : ''}>
            <span class="behavior-toggle-track"></span>
          </label>
        </div>

        <div class="behavior-group">
          <div class="behavior-group-label">Daily Token Budget
            <span class="behavior-hint">0 = unlimited</span>
          </div>
          <div class="behavior-budget-row">
            <input type="number" class="behavior-input" id="sb-budget-${Utils.esc(shipId)}"
              placeholder="0" min="0" step="1000" value="${b.dailyBudget || ''}">
            <span class="behavior-budget-unit">tokens / day</span>
            <button class="behavior-save-btn" data-key="dailyBudget" data-input="sb-budget-${Utils.esc(shipId)}">Save</button>
          </div>
          ${b.dailyBudget ? `
          <div class="behavior-budget-bar">
            <div class="behavior-budget-fill" style="width:${budgetPct}%"></div>
          </div>
          <div class="behavior-budget-meta">${usedK}K of ${budgetK}K used today (${budgetPct}%)</div>` : ''}
        </div>

        <div class="behavior-group">
          <div class="behavior-group-label">Max Concurrent Missions</div>
          <div class="behavior-budget-row">
            <input type="number" class="behavior-input" id="sb-concurrent-${Utils.esc(shipId)}"
              placeholder="3" min="1" max="10" value="${b.maxConcurrent || 3}">
            <button class="behavior-save-btn" data-key="maxConcurrent" data-input="sb-concurrent-${Utils.esc(shipId)}">Save</button>
          </div>
        </div>
      </div>
    `;
  }

  /* ── Dashboard panel renderer ── */
  async function _renderDashboard(shipId, memberIds, allMissions) {
    const shipMissions = allMissions.filter(m => memberIds.includes(m.agent_id) || m.spaceship_id === shipId);
    const activeMissions = shipMissions.filter(m => m.status === 'running' || m.status === 'queued').length;
    const completedMissions = shipMissions.filter(m => m.status === 'completed').length;

    // Approval rate: missions that were reviewed (approved or rejected) vs approved
    const reviewed = shipMissions.filter(m => m.reviewed);
    const approved = reviewed.filter(m => m.approved);
    const approvalRate = reviewed.length ? Math.round((approved.length / reviewed.length) * 100) : 100;

    // Tokens used this session (from ShipBehaviors if available)
    let tokensUsed = 0;
    if (typeof ShipBehaviors !== 'undefined') {
      const b = ShipBehaviors.getBehaviors(shipId);
      tokensUsed = b.budgetUsedToday || 0;
    }

    // Last 5 Ship's Log entries
    let logEntries = [];
    if (typeof ShipLog !== 'undefined') {
      try {
        logEntries = await ShipLog.getEntries(shipId, 5);
      } catch (e) { /* offline */ }
    }

    const logHtml = logEntries.length
      ? logEntries.map(entry => {
          const time = entry.created_at ? new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          const role = Utils.esc(entry.role || 'system');
          const content = Utils.esc((entry.content || '').substring(0, 120));
          return `<div class="ship-dash-log-entry">
            <span class="ship-dash-log-time">${time}</span>
            <span class="ship-dash-log-role">${role}</span>
            <span class="ship-dash-log-content">${content}</span>
          </div>`;
        }).join('')
      : '<p class="text-muted" style="font-size:.78rem">No log entries yet.</p>';

    return `
      <div class="detail-section ship-dashboard">
        <h3 class="detail-section-title">Dashboard</h3>
        <div class="ship-dash-stats">
          <div class="ship-dash-stat">
            <div class="ship-dash-stat-value">${activeMissions}</div>
            <div class="ship-dash-stat-label">Active Missions</div>
          </div>
          <div class="ship-dash-stat">
            <div class="ship-dash-stat-value">${completedMissions}</div>
            <div class="ship-dash-stat-label">Completed</div>
          </div>
          <div class="ship-dash-stat">
            <div class="ship-dash-stat-value">${approvalRate}%</div>
            <div class="ship-dash-stat-label">Approval Rate</div>
          </div>
          <div class="ship-dash-stat">
            <div class="ship-dash-stat-value">${tokensUsed ? tokensUsed.toLocaleString() : '0'}</div>
            <div class="ship-dash-stat-label">Tokens Today</div>
          </div>
        </div>
        <div class="ship-dash-log">
          <div class="ship-dash-log-title">Recent Ship's Log</div>
          ${logHtml}
        </div>
      </div>
    `;
  }

  /* ── Ship state persistence delegated to Blueprints ── */

  /* ── Ship Profile: icon, name, description persistence ── */
  const _PROFILE_KEY = Utils.KEYS.shipProfiles;

  function _getShipProfile(id) {
    try { const m = JSON.parse(localStorage.getItem(_PROFILE_KEY) || '{}'); return m[id] || {}; } catch(e) { return {}; }
  }

  function _saveShipProfile(id, data) {
    try {
      const m = JSON.parse(localStorage.getItem(_PROFILE_KEY) || '{}');
      m[id] = { ...(m[id] || {}), ...data };
      localStorage.setItem(_PROFILE_KEY, JSON.stringify(m));
    } catch(e) {}
  }

  function _getShipIcon(id) {
    const profile = _getShipProfile(id);
    if (profile.icon) {
      return `<img src="${profile.icon}" class="ship-profile-img" alt="Ship icon" />`;
    }
    return `<svg class="detail-header-icon-lg" fill="currentColor" stroke="none"><use href="#icon-spaceship"/></svg>`;
  }

  function _bindShipProfile(el, shipId) {
    const iconWrap = el.querySelector('#ship-profile-icon');
    const fileInput = el.querySelector('#ship-icon-upload');
    if (iconWrap && fileInput) {
      iconWrap.addEventListener('click', (e) => {
        if (e.target.closest('.ship-profile-icon-overlay') || e.target === iconWrap || e.target.closest('.ship-profile-img') || e.target.closest('.detail-header-icon-lg')) {
          fileInput.click();
        }
      });
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 512000) {
          if (typeof Notify !== 'undefined') Notify.send({ title: 'File Too Large', message: 'Max 500KB for ship icons.', type: 'error' });
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          _saveShipProfile(shipId, { icon: dataUrl });
          const img = iconWrap.querySelector('.ship-profile-img');
          if (img) {
            img.src = dataUrl;
          } else {
            const svg = iconWrap.querySelector('.detail-header-icon-lg');
            if (svg) svg.outerHTML = `<img src="${dataUrl}" class="ship-profile-img" alt="Ship icon" />`;
          }
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Icon Updated', message: 'Ship icon saved.', type: 'success' });
        };
        reader.readAsDataURL(file);
      });
    }

    // Name editing (with uniqueness check)
    const nameEl = el.querySelector('#ship-profile-name');
    if (nameEl) {
      nameEl.addEventListener('blur', () => {
        const raw = nameEl.textContent.trim();
        // Strip any ship class badge text appended after the name
        const newName = raw.replace(/\s*(⚔|✦|★|✧|▸).*$/, '').replace(/\s*<.*$/, '').trim();
        if (!newName) { const ship = (State.get('spaceships') || []).find(s => s.id === shipId); if (ship) nameEl.textContent = ship.name; return; }
        const ships = State.get('spaceships') || [];
        const dup = ships.find(s => s.id !== shipId && s.name.toLowerCase() === newName.toLowerCase());
        if (dup) {
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Name Taken', message: `"${newName}" is already in use.`, type: 'error' });
          const ship = ships.find(s => s.id === shipId);
          if (ship) nameEl.textContent = ship.name;
          return;
        }
        if (typeof CardRenderer !== 'undefined') CardRenderer.setCustomLabel(shipId, 'name', newName);
        const ship = ships.find(s => s.id === shipId);
        if (ship) ship.name = newName;
        State.set('spaceships', ships);
        if (ship && !ship.blueprint_id) {
          try { SB.db('user_spaceships').update(shipId, { name: newName }); } catch(e) {}
        }
      });
    }

    // Description editing
    const descEl = el.querySelector('#ship-profile-desc');
    if (descEl) {
      descEl.addEventListener('blur', () => {
        const desc = descEl.textContent.trim();
        _saveShipProfile(shipId, { desc });
      });
    }
  }

  /* ── Bind behaviors panel interactions ── */
  function _bindBehaviors(el, shipId) {
    const panel = el.querySelector('.ship-behaviors-panel');
    if (!panel || typeof ShipBehaviors === 'undefined') return;

    // Approval mode radios
    panel.querySelectorAll('input[type="radio"]').forEach(function(radio) {
      radio.addEventListener('change', function() {
        ShipBehaviors.setBehavior(shipId, 'approvalMode', radio.value);
        panel.querySelectorAll('.behavior-radio').forEach(function(lbl) {
          lbl.classList.toggle('active', lbl.querySelector('input').value === radio.value);
        });
        if (typeof Notify !== 'undefined') Notify.send({ title: 'Behavior Saved', message: 'Approval mode: ' + radio.value, type: 'success' });
      });
    });

    // Toggle checkboxes
    panel.querySelectorAll('.behavior-cb').forEach(function(cb) {
      cb.addEventListener('change', function() {
        const key = cb.dataset.key;
        ShipBehaviors.setBehavior(shipId, key, cb.checked);
      });
    });

    // Save number inputs
    panel.querySelectorAll('.behavior-save-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const key = btn.dataset.key;
        const inputEl = document.getElementById(btn.dataset.input);
        if (!inputEl) return;
        const val = parseInt(inputEl.value, 10) || 0;
        ShipBehaviors.setBehavior(shipId, key, val);
        if (typeof Notify !== 'undefined') Notify.send({ title: 'Saved', message: key + ' updated', type: 'success' });
      });
    });
  }

  function render(el, params) {
    // Spaceship detail is the schematic for a specific ship — opt in to
    // the core reactor as its centerpiece.
    if (typeof CoreReactor !== 'undefined') CoreReactor.setVisible(true);
    const user = State.get('user');
    el.innerHTML = `<div class="loading-state"><p>Loading spaceship...</p></div>`;
    _loadSpaceship(el, params.id);
  }

  async function _loadSpaceship(el, id) {
    try {
      // Ensure the blueprint catalog is loaded before we render. The detail
      // resolves the ship's blueprint via Blueprints.getSpaceship() (and crew
      // via getAgent()), both bare `_spaceships`/`_agents` lookups that do NOT
      // trigger the lazy catalog load. On a hard-reload / direct-nav straight
      // onto a ship detail — before the Bridge has primed the catalog — they'd
      // return null, rendering empty Workflows + blueprint-derived crew. This
      // dedupes against in-flight loads and is a no-op once loaded.
      if (typeof Blueprints !== 'undefined' && Blueprints.ensureCatalogLoaded) {
        try { await Blueprints.ensureCatalogLoaded(); } catch (e) { /* render with whatever resolves */ }
      }
      let fleet;
      // Prefer local state (has latest slot edits) over Supabase fetch
      const _localFleet = (State.get('spaceships') || []).find(f => f.id === id);
      try {
        fleet = await Promise.race([
          SB.db('user_spaceships').get(id),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
        ]);
      } catch(e) {
        fleet = _localFleet;
      }
      if (!fleet) throw new Error('Spaceship not found');
      // Merge local state (may be ahead of DB)
      if (_localFleet) {
        if (_localFleet.slot_assignments) {
          fleet.slots = _localFleet.slot_assignments;
          fleet.slot_assignments = _localFleet.slot_assignments;
          fleet.agent_ids = Object.values(_localFleet.slot_assignments).filter(Boolean);
        }
        if (_localFleet.status) fleet.status = _localFleet.status;
        if (_localFleet.name) fleet.name = _localFleet.name;
      }

      // Normalize DB columns to expected shape
      if (fleet.blueprint_id && !fleet.class_id) fleet.class_id = fleet.blueprint_id;
      if (!fleet.class_id) fleet.class_id = 'class-1';
      if (!fleet.slot_assignments) {
        // Pick fresh slot_assignments across the dual-shape `slots` column and
        // the newer `config.slot_assignments`. See blueprints.js loader
        // for the full decision tree — same rules apply here for single-row
        // fetches via `_loadSpaceship`.
        const _bagSlots = fleet.slots && fleet.slots.slot_assignments;
        const _plainSlots = fleet.slots && !fleet.slots.slot_assignments && Object.keys(fleet.slots).length
          ? fleet.slots : null;
        const _cfgSlots = fleet.config && fleet.config.slot_assignments;
        fleet.slot_assignments = _bagSlots || _plainSlots || _cfgSlots || null;
      }
      if (!fleet.slot_assignments) {
        fleet.slot_assignments = {};
        (fleet.agent_ids || []).forEach((aid, i) => { fleet.slot_assignments[i] = aid; });
      }
      if (!fleet.agent_ids) fleet.agent_ids = Object.values(fleet.slot_assignments).filter(Boolean);

      // Reconcile status: auto-dock if deployed but not all slots filled
      if (fleet.status === 'deployed' && typeof BlueprintUtils !== 'undefined') {
        const sc = BlueprintUtils.getSlotTemplate(fleet);
        const allFilled = sc && sc.slots.every(s => fleet.slot_assignments[s.id]);
        if (!allFilled) {
          fleet.status = 'docked';
          const spaceships = State.get('spaceships') || [];
          const ls = spaceships.find(f => f.id === id);
          if (ls) { ls.status = 'docked'; State.set('spaceships', spaceships); }
          Blueprints.saveShipState(id, fleet);
        }
      }

      // Apply saved custom labels (e.g. renamed ship)
      if (typeof CardRenderer !== 'undefined' && CardRenderer.getCustomLabels) {
        const cl = CardRenderer.getCustomLabels(fleet.id);
        if (cl.name) fleet.name = cl.name;
      }

      let allAgents = State.get('agents') || [];
      const agentMap = {};
      allAgents.forEach(a => { agentMap[a.id] = a; });
      if (allAgents.length === 0) {
        try {
          const user = State.get('user');
          const fresh = await SB.db('user_agents').list({ userId: user.id });
          State.set('agents', fresh);
          allAgents = fresh;
          fresh.forEach(a => { agentMap[a.id] = a; });
        } catch(e) {}
      }
      // Merge terminal-activated agents (from Blueprints)
      try {
        const activated = typeof Blueprints !== 'undefined' ? Blueprints.getActivatedAgentIds() : [];
        activated.forEach(bpId => {
          const activatedId = 'bp-' + bpId;
          if (agentMap[activatedId]) return; // already in list
          let bp = null;
          if (typeof Blueprints !== 'undefined' && Blueprints.getAgent) bp = Blueprints.getAgent(bpId);
          if (!bp && typeof BlueprintsView !== 'undefined' && BlueprintsView.SEED) bp = BlueprintsView.SEED.find(b => b.id === bpId);
          if (bp) {
            const custom = typeof CardRenderer !== 'undefined' ? CardRenderer.getCustomLabels(activatedId) : {};
            const agent = {
              id: activatedId,
              name: custom.name || bp.name,
              role: custom.role || bp.config?.role || bp.category || 'General',
              status: 'idle',
              llm_engine: bp.config?.llm_engine || 'gemini-2-5-flash',
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
            allAgents.push(agent);
            agentMap[activatedId] = agent;
          }
        });
      } catch(e) {}

      const memberIds = fleet.agent_ids || [];
      const members = memberIds.map(mid => agentMap[mid]).filter(Boolean);
      const dotClass = fleet.status === 'deployed' ? 'dot-g dot-pulse' : fleet.status === 'paused' ? 'dot-a' : 'dot-g';
      const shipClass = typeof Gamification !== 'undefined' ? Gamification.renderShipClassBadge(members.length) : '';
      const allMissions = State.get('missions') || [];
      const health = typeof Gamification !== 'undefined' ? Gamification.getSpaceshipHealth(fleet, allAgents, allMissions) : null;

      // Build dashboard HTML (async for ShipLog)
      const dashboardHtml = await _renderDashboard(fleet.id, memberIds, allMissions);
      // Slots come from the ship's OWN crew defs (real labels, per-slot
      // rarity, min_class), not the rank-based generic template — matches
      // schematic.js and the activation wizard. Gamification.getSlotTemplate()
      // would render 12 generic "Bridge/Ops" slots capped at the viewer's
      // rank rarity, ignoring what the ship actually defines.
      const _bu = typeof BlueprintUtils !== 'undefined' ? BlueprintUtils : null;
      const spaceshipClass = _bu ? _bu.getSlotTemplate(fleet)
        : (typeof Gamification !== 'undefined' ? Gamification.getSlotTemplate() : { id:'dynamic', name:'Ship', slots:[{id:0,maxRarity:'Mythic',label:'Bridge'},{id:1,maxRarity:'Legendary',label:'Ops'}] });
      const assignedIds = new Set(Object.values(fleet.slot_assignments || {}).filter(Boolean));

      // Community publish is only offered for user-built ships owned by
      // the current viewer. Catalog ships loaded via Blueprints have
      // no user_id, so the slot stays hidden.
      const _user = State.get('user');
      const _canPublish = !!(_user && fleet.user_id && fleet.user_id === _user.id);

      el.innerHTML = `
        <div class="detail-wrap">
          <div class="detail-back">
            <a href="#/bridge/spaceships" class="btn btn-sm">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-arrow-left"/></svg>
              Back to Spaceships
            </a>
            ${_canPublish ? '<span id="community-publish-slot"></span>' : ''}
          </div>

          <div class="detail-header">
            <div class="ship-profile-icon" id="ship-profile-icon" title="Click to upload custom icon">
              ${_getShipIcon(fleet.id)}
              <input type="file" id="ship-icon-upload" accept="image/png,image/jpeg,image/svg+xml" style="display:none" />
              <div class="ship-profile-icon-overlay">
                <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-edit"/></svg>
              </div>
            </div>
            <div class="detail-header-info">
              <h2 class="detail-name" contenteditable="true" spellcheck="false" data-field="name" id="ship-profile-name">${_esc(fleet.name)} ${shipClass}</h2>
              <div class="ship-profile-desc" contenteditable="true" spellcheck="false" id="ship-profile-desc" data-placeholder="Add a ship description...">${_esc(_getShipProfile(fleet.id).desc || '')}</div>
              <div class="detail-meta-row">
                <span class="status-dot ${dotClass}"></span>
                <span class="detail-status">${_esc(Utils.titleCase(fleet.status))}</span>
                <span class="agent-tag">${members.length} agent${members.length !== 1 ? 's' : ''}</span>
                <span class="agent-tag">${spaceshipClass.slots.length} slots</span>
              </div>
            </div>
          </div>

          ${dashboardHtml}

          <div class="fleet-detail-actions">
            <div class="bridge-launch-wrap">
              <span class="agent-tag">${spaceshipClass.slots.length} slots (${typeof Gamification !== 'undefined' ? Gamification.getRank().name : 'Ensign'} rank)</span>
            </div>
          </div>

          <!-- Ship Formation (card row above inventory) -->
          <div class="computing-formation">
            <div class="computing-formation-header">
              <div class="computing-inv-title">Bridge</div>
            </div>
            <div class="slot-grid slot-grid-${spaceshipClass.slots.length}" id="slot-grid">
              ${spaceshipClass.slots.map(slot => _renderSlot(slot, fleet.slot_assignments[slot.id], agentMap, spaceshipClass)).join('')}
            </div>
          </div>

          <!-- Agent Inventory Dock -->
          <div class="computing-inventory">
            <div class="computing-inv-header">
              <div class="computing-inv-title">Agent Inventory</div>
              <div class="computing-inv-filter">
                <button class="bp-cat-btn active" data-rarity="All">All</button>
                <button class="bp-cat-btn" data-rarity="Common">Common</button>
                <button class="bp-cat-btn" data-rarity="Rare">Rare</button>
                <button class="bp-cat-btn" data-rarity="Epic">Epic</button>
                <button class="bp-cat-btn" data-rarity="Legendary">Legendary</button>
              </div>
            </div>
            <div id="computing-inv-list">
              ${_renderInventory(allAgents, assignedIds, spaceshipClass)}
            </div>
          </div>

          ${health ? `<div class="detail-section" style="margin-top:20px"><h3 class="detail-section-title">Ship Health</h3>${Gamification.renderHealthBars(health)}</div>` : ''}

          <!-- Ship Behaviors -->
          ${_renderBehaviorsPanel(fleet.id)}

          <!-- Agent Missions -->
          <div class="detail-section">
            <h3 class="detail-section-title">Agent Missions</h3>
            ${_renderCrewMissions(allMissions, memberIds, agentMap)}
          </div>

          <!-- Workflows -->
          ${_renderShipWorkflows(fleet, agentMap)}
        </div>
      `;

      _bindDetailEvents(el, id, fleet, allAgents, agentMap, spaceshipClass);
      _bindShipProfile(el, id);
      _bindBehaviors(el, id);
      _initSlotDnD(el, id, fleet, allAgents, agentMap, spaceshipClass);

      // Community publish button — owns its own async state check and
      // delegated click handler so the slot stays in sync across
      // publish/unpublish round-trips without re-rendering the whole view.
      if (_canPublish && typeof CommunityPublish !== 'undefined') {
        const slot = document.getElementById('community-publish-slot');
        const renderSlot = async () => {
          if (!slot) return;
          const state = await CommunityPublish.getSubmissionState(fleet.id);
          slot.innerHTML = CommunityPublish.renderActionButton(state);
        };
        renderSlot();
        slot?.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-action]');
          if (!btn) return;
          const cfg = fleet.config || {};
          const entity = {
            type: 'spaceship',
            id: fleet.id,
            name: fleet.name,
            description: cfg.description || fleet.description,
            tags: cfg.tags || fleet.tags,
          };
          const action = btn.dataset.action;
          if (action === 'community-publish') {
            CommunityPublish.openPublishModal(entity, { onSuccess: renderSlot });
          } else if (action === 'community-unpublish' || action === 'community-withdraw') {
            CommunityPublish.confirmUnpublish(entity, { onSuccess: renderSlot });
          } else if (action === 'community-rejected') {
            const reason = btn.dataset.reason || 'No reason given.';
            if (typeof Notify !== 'undefined') {
              Notify.send({
                title: 'Submission rejected',
                message: reason + ' — edit your blueprint and resubmit when ready.',
                type: 'agent_error',
              });
            }
            CommunityPublish.confirmUnpublish(entity, {
              onSuccess: () => CommunityPublish.openPublishModal(entity, { onSuccess: renderSlot }),
            });
          }
        });
      }

      // Repointed from the dropped `fleets` table to user_spaceships (its
      // rename) so the detail view live-updates when this ship's row changes.
      _channel = SB.realtime.subscribe('user_spaceships', (payload) => {
        if (payload.new?.id === id || payload.old?.id === id) _loadSpaceship(el, id);
      });
    } catch (err) {
      el.innerHTML = `
        <div class="app-empty">
          <h2>Spaceship Not Found</h2>
          <p>${_esc(err.message)}</p>
          <div class="app-empty-acts"><a href="#/bridge/spaceships" class="btn btn-sm">Back to Spaceships</a></div>
        </div>
      `;
    }
  }

  function _renderInventory(allAgents, assignedIds, spaceshipClass) {
    // Only show terminal-activated agents and custom-built agents
    const activatedBpIds = typeof Blueprints !== 'undefined' ? new Set(Blueprints.getActivatedAgentIds()) : new Set();
    // Ordered low→high from the Gamification SSOT so Mythic crew (and
    // Mythic-capped slots) are represented — a local list that stopped at
    // Legendary filtered every Mythic agent out of the dock, and made an
    // all-Mythic ship's inventory empty.
    const _ro = (typeof Gamification !== 'undefined' && Gamification.RARITY_ORDER) || { Common: 0, Rare: 1, Epic: 2, Legendary: 3, Mythic: 4 };
    const rarityOrder = Object.keys(_ro).sort((a, b) => _ro[a] - _ro[b]);
    // Determine max allowed rarity from ship slots
    const maxSlotRarityIdx = spaceshipClass
      ? Math.max(...spaceshipClass.slots.map(s => rarityOrder.indexOf(s.maxRarity)))
      : rarityOrder.length - 1;
    const allowedRarities = new Set(rarityOrder.slice(0, maxSlotRarityIdx + 1));

    const activated = allAgents.filter(a => {
      // Must be genuinely activated — check Blueprints activation list
      const bpId = a.blueprint_id || a.id.replace(/^bp-/, '');
      const isActivated = activatedBpIds.has(a.id) || activatedBpIds.has(bpId) || a.imported_via || a._custom;
      if (!isActivated) return false;
      // Filter by rarity that fits in the ship's slots
      const agentRarity = BlueprintUtils.getRarity(a);
      return allowedRarities.has(agentRarity);
    });
    if (!activated.length) return '<p class="text-muted" style="font-size:.78rem">No agents added. <a href="#/bridge" style="color:var(--accent)">Browse the Blueprint Catalog.</a></p>';
    return activated.map(a => {
      const rarity = BlueprintUtils.getRarityInfo(a);
      const initials = (a.name || 'AG').slice(0,2).toUpperCase();
      const isAssigned = assignedIds.has(a.id);
      return `
        <div class="computing-inv-card ${isAssigned ? 'assigned' : ''}" draggable="${isAssigned ? 'false' : 'true'}" data-agent-id="${a.id}" data-rarity="${rarity.name}">
          <div class="computing-inv-avatar" style="background:${_roleColorFromAgent(a)}">${_esc(initials)}</div>
          <div class="computing-inv-name">${_esc(a.name)}</div>
          <span class="rarity-badge rarity-${rarity.name.toLowerCase()}">${rarity.name}</span>
          <div class="computing-inv-role">${_esc(a.role || '')}</div>
        </div>
      `;
    }).join('');
  }

  // Whether a crew slot is gated behind a class the viewer hasn't reached.
  // Mirrors ShipSetupWizard._isSlotLocked so the dock honors the same gate
  // the wizard and schematic already enforce.
  function _isSlotLocked(slot) {
    if (!slot || !slot.min_class) return false;
    if (typeof Gamification === 'undefined' || !Gamification.isClassUnlocked) return false;
    return !Gamification.isClassUnlocked(slot.min_class);
  }

  function _slotUnlockLabel(minClass) {
    if (minClass === 'class-5') return 'NICE Pro';
    if (typeof Gamification !== 'undefined' && Gamification.getFirstRankForClass) {
      const r = Gamification.getFirstRankForClass(minClass);
      if (r && r.name) return r.name;
    }
    return minClass || '';
  }

  function _renderSlot(slot, agentId, agentMap, spaceshipClass) {
    const maxRarity = slot.maxRarity || 'Rare';
    const agent = agentId ? agentMap[agentId] : null;
    const rarityClass = 'ship-slot-' + maxRarity.toLowerCase();

    if (agent) {
      const rarity = BlueprintUtils.getRarityInfo(agent);
      const initials = (agent.name || 'AG').slice(0,2).toUpperCase();
      return `
        <div class="ship-slot ship-slot-filled ${rarityClass}" data-slot-id="${slot.id}" data-max-rarity="${maxRarity}" data-agent-rarity="${rarity.name}">
          <button class="slot-undock-btn" data-slot-id="${slot.id}" title="Undock">&times;</button>
          <div class="slot-agent-mini">
            <div class="slot-agent-avatar" style="background:${_roleColorFromAgent(agent)}">${_esc(initials)}</div>
            <div class="slot-agent-name">${_esc(agent.name)}</div>
            <span class="rarity-badge rarity-${rarity.name.toLowerCase()}">${rarity.name}</span>
          </div>
          <div class="ship-slot-label">${_esc(slot.label)}</div>
        </div>
      `;
    }

    // Empty + class-gated beyond the viewer's rank: render locked. The
    // .ship-slot-locked CSS dims it, sets pointer-events:none (so it can't
    // receive a drop), and overlays the unlock label. Already-filled locked
    // slots fall through above, so existing crew stay visible ("owned loads").
    if (_isSlotLocked(slot)) {
      const lockLabel = 'Unlocks at ' + _slotUnlockLabel(slot.min_class);
      return `
        <div class="ship-slot ${rarityClass} ship-slot-locked" data-slot-id="${slot.id}" data-lock-label="${Utils.escAttr(lockLabel)}">
          <div class="ship-slot-empty-icon">+</div>
          <div class="ship-slot-label">${_esc(slot.label)}</div>
        </div>
      `;
    }

    return `
      <div class="ship-slot ${rarityClass}" data-slot-id="${slot.id}" data-max-rarity="${maxRarity}">
        <div class="ship-slot-empty-icon">+</div>
        <div class="ship-slot-label">${_esc(slot.label)}</div>
        <span class="ship-slot-max rarity-${maxRarity.toLowerCase()}">${maxRarity === 'Legendary' ? 'Any' : maxRarity}</span>
      </div>
    `;
  }

  function _renderCrewMissions(allMissions, memberIds, agentMap) {
    const crewMissions = allMissions.filter(m => memberIds.includes(m.agent_id));
    if (!crewMissions.length) return '<p class="text-muted" style="font-size:.82rem">No agent missions yet.</p>';
    return `<div class="task-mini-list">${crewMissions.slice(0, 10).map(m => {
      const agentName = (agentMap[m.agent_id] || {}).name || 'Agent';
      return `<div class="task-mini-row"><span class="task-status-badge badge-${m.status}">${m.status}</span><span class="task-mini-title">${_esc(m.title)}</span><span class="task-mini-time">${_esc(agentName)}</span></div>`;
    }).join('')}</div>`;
  }

  /* Effective workflows for an owned spaceship. A persisted user override
     (user_spaceships.config.workflows) wins over the catalog blueprint's
     card.workflows; any override array — including [] — is authoritative, so
     "Reset to defaults" deletes the key to fall back to the catalog again.
     Pure: unit-tested in ship-workflow-plan.test.js. */
  function effectiveWorkflows(fleet, bp) {
    const override = fleet && fleet.config && fleet.config.workflows;
    if (Array.isArray(override)) return override;
    return (bp && Array.isArray(bp.workflows)) ? bp.workflows : [];
  }

  /* True once the user has forked this ship's workflows (an override array is
     present), so the section can badge it and offer a reset. */
  function isWorkflowsCustomized(fleet) {
    return !!(fleet && fleet.config && Array.isArray(fleet.config.workflows));
  }

  /* The ship's workflows source from the user override if present, else the
     branded catalog sequences (card.workflows → bp.workflows). Each step's
     `agent_slot` (1-indexed; 0/absent = captain) resolves to the agent docked
     in that slot for an inline attribution. Owned ships always render the
     section so an empty ship can author from scratch; New / Edit / Delete /
     Reset / Run are wired in _bindDetailEvents. */
  function _renderShipWorkflows(fleet, agentMap) {
    const bp = (typeof Blueprints !== 'undefined' && Blueprints.getSpaceship)
      ? Blueprints.getSpaceship(fleet.blueprint_id || fleet.class_id) : null;
    const workflows = effectiveWorkflows(fleet, bp);
    const customized = isWorkflowsCustomized(fleet);
    const hasCatalog = !!(bp && Array.isArray(bp.workflows) && bp.workflows.length);
    const slots = fleet.slot_assignments || {};
    const stepLi = (s) => {
      const text = (typeof s === 'string') ? s : (s && s.step ? s.step : '');
      const slotIdx = (s && typeof s === 'object' && s.agent_slot) ? s.agent_slot - 1 : null;
      const agent = (slotIdx != null && agentMap) ? agentMap[slots[slotIdx]] : null;
      const who = agent && agent.name ? ` <span class="ship-wf-step-agent">&mdash; ${_esc(agent.name)}</span>` : '';
      const gated = !!(s && typeof s === 'object' && s.approval)
        ? ' <svg class="icon icon-xs ship-wf-step-gate" fill="none" stroke="currentColor" stroke-width="1.5" aria-label="Requires approval"><use href="#icon-lock"/></svg>'
        : '';
      return `<li class="ship-wf-step${(s && s.approval) ? ' gated' : ''}">${_esc(text)}${who}${gated}</li>`;
    };
    const schedIsPro = typeof Subscription !== 'undefined' && Subscription.isPro ? Subscription.isPro() : true;
    const cards = workflows.map((wf, i) => {
      const steps = Array.isArray(wf.steps) ? wf.steps : [];
      const sched = (wf && wf.schedule && wf.schedule.cron) ? wf.schedule : null;
      // Free users get a visible Pro lock on the NEW-schedule action. An
      // existing schedule (sched) stays editable so a downgraded user can
      // still pause/remove it — matches the gate in _openScheduleEditor.
      const schedLocked = !schedIsPro && !sched;
      const schedPaused = !!(sched && sched.enabled === false);
      const schedLabel = sched ? (sched.label || describeSchedule(sched.spec, sched.tz)) : '';
      return `
        <div class="ship-wf-card" data-wf-idx="${i}">
          <div class="ship-wf-header">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-workflow"/></svg>
            <span class="ship-wf-name">${_esc(wf.title || 'Untitled workflow')}</span>
            <div class="ship-wf-card-actions">
              <button class="ship-wf-icon ship-wf-schedule${sched ? ' is-active' : ''}${schedLocked ? ' ship-wf-schedule-locked' : ''}" data-wf-idx="${i}" title="${sched ? 'Edit schedule' : (schedLocked ? 'Scheduling is a NICE Pro feature' : 'Schedule')}" aria-label="${sched ? 'Edit schedule' : (schedLocked ? 'Schedule workflow, NICE Pro feature' : 'Schedule workflow')}">
                <svg class="icon icon-xs" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-clock"/></svg>${schedLocked ? '<svg class="ship-wf-pro-lock" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><use href="#icon-lock"/></svg>' : ''}
              </button>
              <button class="ship-wf-icon ship-wf-edit" data-wf-idx="${i}" title="Edit workflow" aria-label="Edit workflow">
                <svg class="icon icon-xs" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-edit"/></svg>
              </button>
              <button class="ship-wf-icon ship-wf-delete" data-wf-idx="${i}" title="Delete workflow" aria-label="Delete workflow">
                <svg class="icon icon-xs" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-x"/></svg>
              </button>
            </div>
          </div>
          <ol class="ship-wf-steps">${steps.map(stepLi).join('')}</ol>
          <div class="ship-wf-footer">
            <div class="ship-wf-footer-l">
              <span class="ship-wf-meta">${steps.length} step${steps.length !== 1 ? 's' : ''}</span>
              ${sched ? `<span class="ship-wf-sched-chip${schedPaused ? ' paused' : ''}" title="${_esc(schedLabel)}">
                <svg class="icon icon-xs" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-clock"/></svg>
                ${schedPaused ? 'Paused' : _esc(schedLabel)}
              </span>` : ''}
            </div>
            <button class="btn btn-xs btn-primary ship-wf-run" data-wf-idx="${i}">
              <svg class="icon icon-xs" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-play"/></svg>
              Run
            </button>
          </div>
        </div>`;
    }).join('');
    const empty = `<div class="ship-wf-empty">No workflows yet. Build a sequence your crew runs on demand.</div>`;
    return `
      <div class="detail-section ship-workflows">
        <div class="ship-wf-titlerow">
          <h3 class="detail-section-title">Workflows${customized ? ' <span class="ship-wf-badge">Customized</span>' : ''}</h3>
          <div class="ship-wf-toolbar">
            ${(customized && hasCatalog) ? '<button class="btn btn-xs ship-wf-reset">Reset to defaults</button>' : ''}
            <button class="btn btn-xs ship-wf-new">
              <svg class="icon icon-xs" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-plus"/></svg>
              New workflow
            </button>
          </div>
        </div>
        <div class="ship-wf-grid">${workflows.length ? cards : empty}</div>
      </div>`;
  }

  /* Translate a branded ship workflow ({ title, steps:[{ step, agent_slot,
     approval }] }) into an executable mission plan. Pure (no DOM/State) so it's
     unit-tested in isolation. Each step becomes a linear `agent` node;
     `agent_slot` (1-indexed) resolves against the ship's slot_assignments
     (0-indexed) to the docked agent, falling back to the captain (lowest filled
     slot) when a referenced slot is empty or locked. A step with `approval:true`
     gets an `approval_gate` node wired in before it, so the WorkflowEngine
     pauses the run for captain approval before that step executes (the run
     enters `review`; approving resumes via MissionRunner.resumeDag). Emits
     `edges` (the stored plan shape MissionRunner maps to WorkflowEngine
     `connections`). */
  function buildPlanFromShipWorkflow(workflow, slotAssignments) {
    const steps = (workflow && Array.isArray(workflow.steps)) ? workflow.steps : [];
    const slots = slotAssignments || {};
    const filled = Object.keys(slots).map(Number).filter((k) => slots[k]).sort((a, b) => a - b);
    const captainId = filled.length ? slots[filled[0]] : null;
    const nodes = [];
    const edges = [];
    let prevId = null;
    steps.forEach((s, i) => {
      const text = (typeof s === 'string') ? s : (s && s.step ? s.step : '');
      const slotIdx = (s && typeof s === 'object' && s.agent_slot) ? s.agent_slot - 1 : null;
      const slotAgent = (slotIdx != null) ? slots[slotIdx] : null;
      const stepId = `step-${i}`;
      let entry = prevId;
      if (s && typeof s === 'object' && s.approval) {
        const gateId = `gate-${i}`;
        nodes.push({
          id: gateId,
          type: 'approval_gate',
          label: text ? `Approve: ${text}` : 'Approval gate',
          config: { reason: text ? `Approve before "${text}"` : 'Approve before continuing.' },
        });
        if (prevId) edges.push({ from: prevId, to: gateId });
        entry = gateId;
      }
      nodes.push({
        id: stepId,
        type: 'agent',
        label: text,
        config: { agentId: slotAgent || captainId || null, prompt: text },
      });
      if (entry) edges.push({ from: entry, to: stepId });
      prevId = stepId;
    });
    return { shape: 'dag', nodes, edges };
  }

  /* ── Scheduling helpers (pure) ──────────────────────────────────────
     buildCron turns the scheduler form spec into the 5-field cron string
     the pg_cron tick job reads; describeSchedule renders the human cadence
     label stored on the workflow for the card chip. Both pure, unit-tested
     in ship-workflow-plan.test.js. */
  const _DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const _clampInt = (v, lo, hi, dflt) => {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return dflt;
    return Math.min(hi, Math.max(lo, n));
  };
  const _pad2 = (n) => String(_clampInt(n, 0, 59, 0)).padStart(2, '0');

  function buildCron(spec) {
    const s = spec || {};
    const m = _clampInt(s.minute, 0, 59, 0);
    const h = _clampInt(s.hour, 0, 23, 9);
    const dow = _clampInt(s.dow, 0, 6, 1);
    const dom = _clampInt(s.dom, 1, 28, 1);
    switch (s.freq) {
      case 'hourly':  return `${m} * * * *`;
      case 'weekly':  return `${m} ${h} * * ${dow}`;
      case 'monthly': return `${m} ${h} ${dom} * *`;
      case 'custom':  return String(s.cron || '').trim();
      case 'daily':
      default:        return `${m} ${h} * * *`;
    }
  }

  function describeSchedule(spec, tz) {
    const s = spec || {};
    const hhmm = `${_pad2(s.hour == null ? 9 : s.hour)}:${_pad2(s.minute || 0)}`;
    const tzL = tz ? ` ${tz}` : '';
    switch (s.freq) {
      case 'hourly':  return `Hourly at :${_pad2(s.minute || 0)}`;
      case 'weekly':  return `Weekly on ${_DOW_NAMES[_clampInt(s.dow, 0, 6, 1)]} at ${hhmm}${tzL}`;
      case 'monthly': return `Monthly on day ${_clampInt(s.dom, 1, 28, 1)} at ${hhmm}${tzL}`;
      case 'custom':  return `Custom (${String(s.cron || '').trim()})`;
      case 'daily':
      default:        return `Daily at ${hhmm}${tzL}`;
    }
  }

  function _bindDetailEvents(el, id, fleet, allAgents, agentMap, spaceshipClass) {
    // Launch/Dock is now automatic — deploys when all slots filled, docks when a slot is emptied

    // Resolve the blueprint once — the workflow handlers below all need it to
    // fall back to the catalog when the ship has no user override.
    const bp = (typeof Blueprints !== 'undefined' && Blueprints.getSpaceship)
      ? Blueprints.getSpaceship(fleet.blueprint_id || fleet.class_id) : null;

    // Undock from slot
    el.querySelectorAll('.slot-undock-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const slotId = btn.dataset.slotId;
        _removeAgentFromSlot(el, id, fleet, slotId, allAgents, agentMap, spaceshipClass);
      });
    });

    // Double-click inventory card → auto-dock to first available compatible slot
    el.querySelectorAll('.computing-inv-card').forEach(card => {
      card.addEventListener('dblclick', (e) => {
        e.preventDefault();
        if (card.classList.contains('assigned')) return;
        const agentId = card.dataset.agentId;
        const agentRarity = card.dataset.rarity;
        const assignments = fleet.slots || fleet.slot_assignments || {};
        // Find first empty slot that can accept this agent's rarity
        const targetSlot = spaceshipClass.slots.find(slot => {
          if (assignments[slot.id]) return false;
          return typeof Gamification !== 'undefined' ? Gamification.canSlotAccept(slot.maxRarity, agentRarity) : true;
        });
        if (!targetSlot) {
          if (typeof Notify !== 'undefined') Notify.send({ title: 'No Compatible Slot', message: 'No empty slot can accept this agent rarity.', type: 'system' });
          return;
        }
        _assignAgentToSlot(el, id, fleet, String(targetSlot.id), agentId, allAgents, agentMap, spaceshipClass);
      });
    });

    // Inventory rarity filter
    el.querySelector('.computing-inv-filter')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.bp-cat-btn');
      if (!btn) return;
      el.querySelectorAll('.computing-inv-filter .bp-cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const rarity = btn.dataset.rarity;
      el.querySelectorAll('.computing-inv-card').forEach(card => {
        if (rarity === 'All' || card.dataset.rarity === rarity) card.style.display = '';
        else card.style.display = 'none';
      });
    });

    // Run a ship workflow: resolve crew → translate to a mission plan →
    // enqueue + dispatch a Run → jump to the run detail. Sources the effective
    // workflow (user override if present, else the branded catalog sequence).
    el.querySelectorAll('.ship-wf-run').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const wfIdx = parseInt(btn.dataset.wfIdx, 10);
        const workflow = effectiveWorkflows(fleet, bp)[wfIdx] || null;
        if (!workflow) return;
        const slots = fleet.slot_assignments || {};
        if (!Object.values(slots).some(Boolean)) {
          if (typeof Notify !== 'undefined') Notify.send({ title: 'No crew aboard', message: 'Dock at least one crew member before running a workflow.', type: 'system' });
          return;
        }
        if (typeof MissionRunner === 'undefined' || !MissionRunner.createRun) return;
        btn.disabled = true;
        try {
          const plan = buildPlanFromShipWorkflow(workflow, slots);
          const { runId } = await MissionRunner.createRun({
            title: `${fleet.name}: ${workflow.title}`,
            shape: 'dag',
            spaceshipId: fleet.id,
            plan,
          });
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Workflow launched', message: workflow.title, type: 'success' });
          if (runId) MissionRunner.run(runId);
          location.hash = runId ? `#/missions/${runId}` : '#/missions';
        } catch (err) {
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Could not start workflow', message: err.message || 'Unknown error', type: 'system' });
          btn.disabled = false;
        }
      });
    });

    // New workflow → open the editor with a blank sequence (append on save).
    el.querySelector('.ship-wf-new')?.addEventListener('click', (e) => {
      e.preventDefault();
      _openWorkflowEditor(el, id, fleet, spaceshipClass, agentMap, bp, -1);
    });

    // Edit a workflow → open the editor prefilled from the effective sequence.
    el.querySelectorAll('.ship-wf-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        _openWorkflowEditor(el, id, fleet, spaceshipClass, agentMap, bp, parseInt(btn.dataset.wfIdx, 10));
      });
    });

    // Schedule a workflow → open the cron builder. Scheduling forks the
    // workflow onto the user ship (it needs somewhere to store the link).
    el.querySelectorAll('.ship-wf-schedule').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        _openScheduleEditor(el, id, fleet, bp, parseInt(btn.dataset.wfIdx, 10));
      });
    });

    // Delete a workflow → fork the effective list minus this entry, persist.
    // If the entry carried a schedule, stop its mission from firing first.
    el.querySelectorAll('.ship-wf-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const wfIdx = parseInt(btn.dataset.wfIdx, 10);
        const list = effectiveWorkflows(fleet, bp);
        const wf = list[wfIdx];
        if (!wf) return;
        if (!window.confirm(`Delete the "${wf.title || 'untitled'}" workflow from this spaceship?`)) return;
        if (wf.schedule && wf.schedule.missionId && typeof MissionRunner !== 'undefined' && MissionRunner.unscheduleMission) {
          await MissionRunner.unscheduleMission(wf.schedule.missionId);
        }
        const next = JSON.parse(JSON.stringify(list));
        next.splice(wfIdx, 1);
        await _persistWorkflows(el, id, fleet, next);
      });
    });

    // Reset → drop the override so the catalog defaults show again. Unschedule
    // every forked workflow first so no orphaned mission keeps firing.
    el.querySelector('.ship-wf-reset')?.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!window.confirm("Reset this spaceship's workflows to the catalog defaults? Your customizations will be removed.")) return;
      const list = effectiveWorkflows(fleet, bp);
      if (typeof MissionRunner !== 'undefined' && MissionRunner.unscheduleMission) {
        for (const wf of list) {
          if (wf && wf.schedule && wf.schedule.missionId) await MissionRunner.unscheduleMission(wf.schedule.missionId);
        }
      }
      await _persistWorkflows(el, id, fleet, null);
    });
  }

  /* Open the workflow editor modal. `wfIdx` < 0 (or null) authors a new
     workflow appended on save; otherwise it edits the effective workflow at
     that index. Built fresh each open (prior instance removed) so handlers
     never stack. Persists to user_spaceships.config.workflows via
     _persistWorkflows. Each step carries `agent_slot` (0 = Auto/Captain, else
     1-indexed crew slot) chosen through the macOS-safe CSelect dropdown. */
  function _openWorkflowEditor(el, id, fleet, spaceshipClass, agentMap, bp, wfIdx) {
    document.getElementById('modal-wf-editor')?.remove();

    const toStep = (s) => (typeof s === 'string')
      ? { step: s, agent_slot: 0, approval: false }
      : { step: (s && s.step) || '', agent_slot: (s && s.agent_slot) || 0, approval: !!(s && s.approval) };

    const source = (wfIdx != null && wfIdx >= 0) ? effectiveWorkflows(fleet, bp)[wfIdx] : null;
    let steps = (source && Array.isArray(source.steps) && source.steps.length)
      ? source.steps.map(toStep) : [{ step: '', agent_slot: 0 }];

    const slotDefs = (spaceshipClass && Array.isArray(spaceshipClass.slots)) ? spaceshipClass.slots : [];
    const slotOptions = [{ value: '0', label: 'Auto · Captain' }].concat(
      slotDefs.map(s => {
        const aid = (fleet.slot_assignments || {})[s.id];
        const agent = aid && agentMap ? agentMap[aid] : null;
        const who = agent && agent.name ? agent.name : 'empty';
        return { value: String(s.id + 1), label: `Slot ${s.id + 1} · ${_esc(s.label || ('Agent ' + (s.id + 1)))} — ${who}` };
      })
    );

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.id = 'modal-wf-editor';
    overlay.innerHTML = `
      <div class="modal-box wfe-box">
        <div class="modal-hdr">
          <h3 class="modal-title">${source ? 'Edit workflow' : 'New workflow'}</h3>
          <button class="modal-close" id="wfe-close" aria-label="Close">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-x"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="auth-field">
            <label for="wfe-title">Name</label>
            <input type="text" id="wfe-title" maxlength="80" placeholder="e.g. New-patient onboarding" />
          </div>
          <label class="wfe-steps-label">Steps</label>
          <div id="wfe-steps" class="wfe-steps"></div>
          <button type="button" class="btn btn-xs wfe-add" id="wfe-add">
            <svg class="icon icon-xs" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-plus"/></svg>
            Add step
          </button>
          <div class="auth-error" id="wfe-error"></div>
          <div class="wfe-actions">
            <button type="button" class="btn btn-xs" id="wfe-cancel">Cancel</button>
            <button type="button" class="btn btn-xs btn-primary" id="wfe-save">Save workflow</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const titleInput = overlay.querySelector('#wfe-title');
    const stepsWrap = overlay.querySelector('#wfe-steps');
    const errEl = overlay.querySelector('#wfe-error');
    titleInput.value = source ? (source.title || '') : '';

    const rowHTML = (step, i) => `
      <div class="wfe-step" data-i="${i}">
        <span class="wfe-step-num">${i + 1}</span>
        <input type="text" class="wfe-step-text" value="${_esc(step.step)}" placeholder="Describe what happens in this step…" />
        ${CSelect.html('wfe-slot-' + i, 'Assign crew slot', slotOptions, String(step.agent_slot || 0))}
        <div class="wfe-step-ctrls">
          <button type="button" class="wfe-ctrl wfe-gate${step.approval ? ' is-on' : ''}" aria-pressed="${!!step.approval}" aria-label="Require approval before this step" title="Require approval before this step">
            <svg class="icon icon-xs" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-lock"/></svg>
          </button>
          <button type="button" class="wfe-ctrl wfe-up" aria-label="Move step up"${i === 0 ? ' disabled' : ''}>↑</button>
          <button type="button" class="wfe-ctrl wfe-down" aria-label="Move step down"${i === steps.length - 1 ? ' disabled' : ''}>↓</button>
          <button type="button" class="wfe-ctrl wfe-del" aria-label="Remove step">
            <svg class="icon icon-xs" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-x"/></svg>
          </button>
        </div>
      </div>`;

    // Snapshot live inputs back into `steps` before any structural change so
    // in-progress text + slot picks survive a reorder/add/remove re-render.
    const syncFromDOM = () => {
      steps = [...stepsWrap.querySelectorAll('.wfe-step')].map(row => {
        const text = row.querySelector('.wfe-step-text').value;
        const sel = row.querySelector('.bp-cselect');
        const slot = sel ? parseInt(sel.dataset.value, 10) : 0;
        const approval = !!row.querySelector('.wfe-gate.is-on');
        return { step: text, agent_slot: Number.isFinite(slot) ? slot : 0, approval };
      });
    };
    const paint = () => {
      stepsWrap.innerHTML = steps.map((s, i) => rowHTML(s, i)).join('');
      steps.forEach((_, i) => CSelect.mount('wfe-slot-' + i, () => {}));
    };

    stepsWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.wfe-ctrl');
      if (!btn) return;
      // Approval toggle flips in place — no reorder, so no re-paint (which
      // would lose focus). syncFromDOM reads the class at the next change/save.
      if (btn.classList.contains('wfe-gate')) {
        const on = btn.classList.toggle('is-on');
        btn.setAttribute('aria-pressed', String(on));
        return;
      }
      const rows = [...stepsWrap.querySelectorAll('.wfe-step')];
      const i = rows.indexOf(btn.closest('.wfe-step'));
      if (i < 0) return;
      syncFromDOM();
      if (btn.classList.contains('wfe-del')) steps.splice(i, 1);
      else if (btn.classList.contains('wfe-up') && i > 0) { const t = steps[i - 1]; steps[i - 1] = steps[i]; steps[i] = t; }
      else if (btn.classList.contains('wfe-down') && i < steps.length - 1) { const t = steps[i + 1]; steps[i + 1] = steps[i]; steps[i] = t; }
      if (!steps.length) steps = [{ step: '', agent_slot: 0, approval: false }];
      paint();
    });

    overlay.querySelector('#wfe-add').addEventListener('click', () => {
      syncFromDOM();
      steps.push({ step: '', agent_slot: 0, approval: false });
      paint();
      const rows = stepsWrap.querySelectorAll('.wfe-step');
      rows[rows.length - 1]?.querySelector('.wfe-step-text')?.focus();
    });

    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#wfe-close').addEventListener('click', close);
    overlay.querySelector('#wfe-cancel').addEventListener('click', close);

    overlay.querySelector('#wfe-save').addEventListener('click', async () => {
      syncFromDOM();
      const title = titleInput.value.trim();
      const cleanSteps = steps
        .map(s => {
          const o = { step: (s.step || '').trim(), agent_slot: s.agent_slot || 0 };
          if (s.approval) o.approval = true;
          return o;
        })
        .filter(s => s.step);
      if (!title) { errEl.textContent = 'Give the workflow a name.'; return; }
      if (!cleanSteps.length) { errEl.textContent = 'Add at least one step with a description.'; return; }
      errEl.textContent = '';
      const saveBtn = overlay.querySelector('#wfe-save');
      saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
      // Deep-clone the effective list so untouched entries detach from the
      // catalog refs; replace at index or append the edited workflow. Carry
      // forward any existing schedule so editing steps keeps the cron link
      // (_persistWorkflows re-syncs the scheduled mission's plan).
      const next = JSON.parse(JSON.stringify(effectiveWorkflows(fleet, bp)));
      const editing = wfIdx != null && wfIdx >= 0 && wfIdx < next.length;
      const wf = { title, steps: cleanSteps };
      if (editing && next[wfIdx] && next[wfIdx].schedule) wf.schedule = next[wfIdx].schedule;
      if (editing) next[wfIdx] = wf;
      else next.push(wf);
      const ok = await _persistWorkflows(el, id, fleet, next);
      if (ok) {
        close();
        if (typeof Notify !== 'undefined') Notify.send({ title: 'Workflow saved', message: title, type: 'success' });
      } else {
        saveBtn.disabled = false; saveBtn.textContent = 'Save workflow';
      }
    });

    paint();
    setTimeout(() => titleInput.focus(), 50);
  }

  /* Persist the ship's workflow override to user_spaceships.config.workflows.
     `workflows == null` deletes the key (reset to catalog defaults). Mirrors
     into State.spaceships so other surfaces stay in sync, then re-renders the
     detail view from the fresh row. Returns false on a write failure. */
  async function _persistWorkflows(el, id, fleet, workflows) {
    const config = Object.assign({}, fleet.config || {});
    if (workflows == null) delete config.workflows;
    else config.workflows = workflows;
    fleet.config = config;
    try {
      const ships = State.get('spaceships') || [];
      const local = ships.find(s => s && s.id === id);
      if (local) { local.config = config; State.set('spaceships', ships); }
    } catch (e) { /* state mirror is best-effort */ }
    try {
      await SB.db('user_spaceships').update(id, { config });
    } catch (e) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Could not save workflow', message: e.message || 'Save failed.', type: 'system' });
      return false;
    }
    // Keep each scheduled workflow's mission in step with its current
    // definition: rebuild the plan + title so cron-fired runs use the latest
    // steps and crew. Best-effort per workflow so one failure can't block.
    if (Array.isArray(workflows) && typeof MissionRunner !== 'undefined' && MissionRunner.upsertScheduledMission) {
      const slots = fleet.slot_assignments || {};
      for (const wf of workflows) {
        if (!wf || !wf.schedule || !wf.schedule.missionId || !wf.schedule.cron) continue;
        try {
          await MissionRunner.upsertScheduledMission({
            missionId: wf.schedule.missionId,
            title: `${fleet.name}: ${wf.title}`,
            plan: buildPlanFromShipWorkflow(wf, slots),
            spaceshipId: id,
            schedule: { cron: wf.schedule.cron, tz: wf.schedule.tz || 'UTC', enabled: wf.schedule.enabled !== false },
          });
        } catch (e) { /* leave the stored link; surfaced on next explicit save */ }
      }
    }
    _loadSpaceship(el, id);
    return true;
  }

  /* Open the schedule (cron builder) modal for the effective workflow at
     `wfIdx`. Scheduling forks the workflow onto the user ship and creates a
     persistent `missions` row that the pg_cron tick job fires on the cadence;
     editing/pausing/removing manage that same mission. Built fresh per open.
     Friendly Hourly/Daily/Weekly/Monthly presets plus a custom-cron escape;
     the form spec is stored alongside the cron so editing prefills cleanly. */
  function _openScheduleEditor(el, id, fleet, bp, wfIdx) {
    document.getElementById('modal-wf-schedule')?.remove();
    const list = effectiveWorkflows(fleet, bp);
    const wf = list[wfIdx];
    if (!wf) return;

    const browserTz = (() => {
      try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; }
    })();
    const existing = (wf.schedule && wf.schedule.cron) ? wf.schedule : null;

    // Pro-only scheduling: opening the cron builder to author a NEW schedule
    // shows the upgrade prompt for free users instead. Existing schedules stay
    // openable so a downgraded user can pause or remove them.
    // MissionRunner.upsertScheduledMission is the backstop; the pg_cron
    // tick_mission_schedules job is the server-side authority.
    if (!existing && typeof Subscription !== 'undefined' && Subscription.isPro && !Subscription.isPro()) {
      if (typeof UpgradeModal !== 'undefined' && UpgradeModal.open) UpgradeModal.open();
      else if (typeof Notify !== 'undefined') Notify.send({ title: 'NICE Pro required', message: 'Upgrade to run missions automatically on a schedule.', type: 'warning' });
      return;
    }

    const spec = Object.assign({ freq: 'daily', minute: 0, hour: 9, dow: 1, dom: 1, cron: '' }, (existing && existing.spec) || {});
    const tz0 = (existing && existing.tz) || browserTz;

    const freqOptions = [
      { value: 'hourly', label: 'Hourly' },
      { value: 'daily', label: 'Daily' },
      { value: 'weekly', label: 'Weekly' },
      { value: 'monthly', label: 'Monthly' },
      { value: 'custom', label: 'Custom cron' },
    ];
    const dowOptions = _DOW_NAMES.map((n, i) => ({ value: String(i), label: n }));
    const domOptions = Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: 'Day ' + (i + 1) }));

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.id = 'modal-wf-schedule';
    overlay.innerHTML = `
      <div class="modal-box wfs-box">
        <div class="modal-hdr">
          <h3 class="modal-title">${existing ? 'Edit schedule' : 'Schedule workflow'}</h3>
          <button class="modal-close" id="wfs-close" aria-label="Close">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-x"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <p class="wfs-intro">NICE runs <strong>${_esc(wf.title || 'this workflow')}</strong> automatically on this cadence, even while you're offline. Scheduled runs are a NICE Pro perk.</p>
          <div class="wfs-row">
            <label>Frequency</label>
            ${CSelect.html('wfs-freq', 'Frequency', freqOptions, spec.freq)}
          </div>
          <div class="wfs-row" id="wfs-row-time">
            <label for="wfs-time">Time</label>
            <input type="time" id="wfs-time" value="${_pad2(spec.hour)}:${_pad2(spec.minute)}" />
          </div>
          <div class="wfs-row" id="wfs-row-minute">
            <label for="wfs-minute">At minute</label>
            <input type="number" id="wfs-minute" min="0" max="59" value="${_clampInt(spec.minute, 0, 59, 0)}" />
          </div>
          <div class="wfs-row" id="wfs-row-dow">
            <label>Day of week</label>
            ${CSelect.html('wfs-dow', 'Day of week', dowOptions, String(_clampInt(spec.dow, 0, 6, 1)))}
          </div>
          <div class="wfs-row" id="wfs-row-dom">
            <label>Day of month</label>
            ${CSelect.html('wfs-dom', 'Day of month', domOptions, String(_clampInt(spec.dom, 1, 28, 1)))}
          </div>
          <div class="wfs-row" id="wfs-row-cron">
            <label for="wfs-cron">Cron (minute hour dom month dow)</label>
            <input type="text" id="wfs-cron" placeholder="0 9 * * 1-5" value="${_esc(spec.cron || '')}" />
          </div>
          <div class="wfs-row">
            <label for="wfs-tz">Timezone</label>
            <input type="text" id="wfs-tz" placeholder="America/Los_Angeles" value="${_esc(tz0)}" />
          </div>
          <div class="wfs-preview" id="wfs-preview"></div>
          <div class="auth-error" id="wfs-error"></div>
          <div class="wfs-actions">
            ${existing ? '<button type="button" class="btn btn-xs wfs-danger" id="wfs-remove">Remove</button>' : ''}
            ${existing ? `<button type="button" class="btn btn-xs" id="wfs-pause">${existing.enabled === false ? 'Resume' : 'Pause'}</button>` : ''}
            <span class="wfs-actions-spacer"></span>
            <button type="button" class="btn btn-xs" id="wfs-cancel">Cancel</button>
            <button type="button" class="btn btn-xs btn-primary" id="wfs-save">${existing ? 'Save schedule' : 'Schedule'}</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const errEl = overlay.querySelector('#wfs-error');
    const previewEl = overlay.querySelector('#wfs-preview');
    const close = () => overlay.remove();

    const readSpec = () => {
      const freq = document.getElementById('wfs-freq').dataset.value;
      const t = (overlay.querySelector('#wfs-time').value || '09:00').split(':');
      const hour = _clampInt(t[0], 0, 23, 9);
      const timeMin = _clampInt(t[1], 0, 59, 0);
      const minute = (freq === 'hourly') ? _clampInt(overlay.querySelector('#wfs-minute').value, 0, 59, 0) : timeMin;
      return {
        freq,
        minute, hour,
        dow: _clampInt(document.getElementById('wfs-dow').dataset.value, 0, 6, 1),
        dom: _clampInt(document.getElementById('wfs-dom').dataset.value, 1, 28, 1),
        cron: overlay.querySelector('#wfs-cron').value,
      };
    };

    const syncRows = (freq) => {
      const show = (sel, on) => { const r = overlay.querySelector(sel); if (r) r.hidden = !on; };
      show('#wfs-row-time', freq === 'daily' || freq === 'weekly' || freq === 'monthly');
      show('#wfs-row-minute', freq === 'hourly');
      show('#wfs-row-dow', freq === 'weekly');
      show('#wfs-row-dom', freq === 'monthly');
      show('#wfs-row-cron', freq === 'custom');
    };

    const refresh = () => {
      const s = readSpec();
      syncRows(s.freq);
      const cron = buildCron(s);
      const tz = overlay.querySelector('#wfs-tz').value.trim() || 'UTC';
      previewEl.innerHTML = `<span class="wfs-preview-label">${_esc(describeSchedule(s, tz))}</span><span class="wfs-preview-cron">cron: ${_esc(cron || '—')}</span>`;
    };

    CSelect.mount('wfs-freq', refresh);
    CSelect.mount('wfs-dow', refresh);
    CSelect.mount('wfs-dom', refresh);
    overlay.querySelectorAll('#wfs-time, #wfs-minute, #wfs-cron, #wfs-tz').forEach(inp => inp.addEventListener('input', refresh));
    refresh();

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#wfs-close').addEventListener('click', close);
    overlay.querySelector('#wfs-cancel').addEventListener('click', close);

    // Build the override list with `wf`'s schedule field set to `nextSchedule`
    // (or removed when null), forking from the catalog on first schedule.
    const persistSchedule = async (nextSchedule, missionId) => {
      const next = JSON.parse(JSON.stringify(list));
      if (next[wfIdx]) {
        if (nextSchedule) next[wfIdx].schedule = nextSchedule;
        else delete next[wfIdx].schedule;
      }
      return _persistWorkflows(el, id, fleet, next);
    };

    overlay.querySelector('#wfs-save').addEventListener('click', async () => {
      const s = readSpec();
      const cron = buildCron(s);
      const tz = overlay.querySelector('#wfs-tz').value.trim() || 'UTC';
      if (cron.split(/\s+/).filter(Boolean).length !== 5) {
        errEl.textContent = 'Enter a valid 5-field cron expression.';
        return;
      }
      const slots = fleet.slot_assignments || {};
      if (!Object.values(slots).some(Boolean)) {
        errEl.textContent = 'Dock at least one crew member before scheduling.';
        return;
      }
      if (typeof MissionRunner === 'undefined' || !MissionRunner.upsertScheduledMission) {
        errEl.textContent = 'Scheduling is unavailable right now.';
        return;
      }
      errEl.textContent = '';
      const saveBtn = overlay.querySelector('#wfs-save');
      saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
      try {
        const enabled = existing ? (existing.enabled !== false) : true;
        const missionId = await MissionRunner.upsertScheduledMission({
          missionId: existing && existing.missionId,
          title: `${fleet.name}: ${wf.title}`,
          plan: buildPlanFromShipWorkflow(wf, slots),
          spaceshipId: id,
          schedule: { cron, tz, enabled },
        });
        const nextSchedule = { cron, tz, enabled, missionId, spec: s, label: describeSchedule(s, tz) };
        const ok = await persistSchedule(nextSchedule);
        if (ok) {
          close();
          if (typeof Notify !== 'undefined') Notify.send({ title: existing ? 'Schedule updated' : 'Workflow scheduled', message: describeSchedule(s, tz), type: 'success' });
        } else { saveBtn.disabled = false; saveBtn.textContent = existing ? 'Save schedule' : 'Schedule'; }
      } catch (err) {
        errEl.textContent = err.message || 'Could not save the schedule.';
        saveBtn.disabled = false; saveBtn.textContent = existing ? 'Save schedule' : 'Schedule';
      }
    });

    if (existing) {
      overlay.querySelector('#wfs-pause')?.addEventListener('click', async () => {
        const enabled = existing.enabled === false; // paused → resume (true); active → pause (false)
        try {
          await MissionRunner.upsertScheduledMission({
            missionId: existing.missionId,
            title: `${fleet.name}: ${wf.title}`,
            plan: buildPlanFromShipWorkflow(wf, fleet.slot_assignments || {}),
            spaceshipId: id,
            schedule: { cron: existing.cron, tz: existing.tz || 'UTC', enabled },
          });
          await persistSchedule(Object.assign({}, existing, { enabled }));
          close();
          if (typeof Notify !== 'undefined') Notify.send({ title: enabled ? 'Schedule resumed' : 'Schedule paused', message: wf.title, type: 'success' });
        } catch (err) {
          errEl.textContent = err.message || 'Could not update the schedule.';
        }
      });
      overlay.querySelector('#wfs-remove')?.addEventListener('click', async () => {
        if (!window.confirm('Remove this schedule? The workflow stays; it just stops running automatically.')) return;
        try {
          if (MissionRunner.unscheduleMission) await MissionRunner.unscheduleMission(existing.missionId);
          await persistSchedule(null);
          close();
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Schedule removed', message: wf.title, type: 'success' });
        } catch (err) {
          errEl.textContent = err.message || 'Could not remove the schedule.';
        }
      });
    }
  }

  function _initSlotDnD(el, id, fleet, allAgents, agentMap, spaceshipClass) {
    // Drag start on inventory cards
    el.querySelectorAll('.computing-inv-card[draggable="true"]').forEach(card => {
      card.addEventListener('dragstart', (e) => {
        _draggedAgentId = card.dataset.agentId;
        _draggedAgentRarity = card.dataset.rarity;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', _draggedAgentId);
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        el.querySelectorAll('.ship-slot').forEach(s => s.classList.remove('drag-valid', 'drag-invalid'));
        _draggedAgentId = null;
        _draggedAgentRarity = null;
      });
    });

    // Drop targets on slots
    el.querySelectorAll('.ship-slot').forEach(slot => {
      slot.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!_draggedAgentRarity) return;
        const maxRarity = slot.dataset.maxRarity;
        const valid = typeof Gamification !== 'undefined' ? Gamification.canSlotAccept(maxRarity, _draggedAgentRarity) : true;
        slot.classList.toggle('drag-valid', valid);
        slot.classList.toggle('drag-invalid', !valid);
        e.dataTransfer.dropEffect = valid ? 'move' : 'none';
      });

      slot.addEventListener('dragleave', () => {
        slot.classList.remove('drag-valid', 'drag-invalid');
      });

      slot.addEventListener('drop', (e) => {
        e.preventDefault();
        slot.classList.remove('drag-valid', 'drag-invalid');
        if (!_draggedAgentId || !_draggedAgentRarity) return;

        const maxRarity = slot.dataset.maxRarity;
        const valid = typeof Gamification !== 'undefined' ? Gamification.canSlotAccept(maxRarity, _draggedAgentRarity) : true;

        if (!valid) {
          slot.classList.add('drag-invalid');
          setTimeout(() => slot.classList.remove('drag-invalid'), 400);
          if (typeof Notify !== 'undefined') {
            Notify.send({ title: 'Incompatible Slot', message: `This slot accepts ${maxRarity} or lower rarity agents.`, type: 'system' });
          }
          return;
        }

        _assignAgentToSlot(el, id, fleet, slot.dataset.slotId, _draggedAgentId, allAgents, agentMap, spaceshipClass);
      });
    });
  }

  async function _assignAgentToSlot(el, id, fleet, slotId, agentId, allAgents, agentMap, spaceshipClass) {
    // Remove agent from any other slot first
    const assignments = { ...(fleet.slots || fleet.slot_assignments || {}) };
    const vacatedSlots = [];
    for (const sid of Object.keys(assignments)) {
      if (assignments[sid] === agentId && sid !== String(slotId)) {
        assignments[sid] = null;
        vacatedSlots.push(sid);
      }
    }
    assignments[slotId] = agentId;
    fleet.slots = assignments;
    fleet.slot_assignments = assignments;
    fleet.agent_ids = Object.values(assignments).filter(Boolean);

    // Persist locally first so re-render picks up changes
    const spaceships = State.get('spaceships') || [];
    let localShip = spaceships.find(f => f.id === id);
    if (localShip) {
      localShip.slots = assignments; localShip.slot_assignments = assignments; localShip.agent_ids = fleet.agent_ids;
    } else {
      // Fleet not in state yet — add it
      const copy = { ...fleet, slots: assignments, slot_assignments: assignments, agent_ids: fleet.agent_ids };
      spaceships.push(copy);
    }
    State.set('spaceships', spaceships);
    Blueprints.saveShipState(id, fleet);

    if (typeof ShipSlots !== 'undefined') {
      try {
        await ShipSlots.setSlot(id, slotId, agentId);
        for (const sid of vacatedSlots) {
          await ShipSlots.setSlot(id, sid, null);
        }
      } catch(e) { /* local state already updated */ }
    }

    // Gamification
    if (typeof Gamification !== 'undefined') {
      Gamification.addXP('dock_agent');
      Gamification.unlockAchievement('first-dock-slot');
      const agent = agentMap[agentId];
      if (agent) {
        const rarity = Gamification.calcAgentRarity(agent);
        if (rarity.name === 'Legendary') Gamification.unlockAchievement('legendary-captain');
      }
      // Only unlocked slots count — a class-gated empty slot can never be
      // filled at this rank, so it must not block the "all filled" reward.
      const _unlockedForFill = spaceshipClass.slots.filter(s => !_isSlotLocked(s));
      const allFilled = _unlockedForFill.length > 0 && _unlockedForFill.every(s => assignments[s.id]);
      if (allFilled) {
        Gamification.addXP('fill_all_slots');
        Gamification.unlockAchievement('full-ship');
      }
    }

    // Auto-deploy when all UNLOCKED slots are filled (locked slots can't be
    // filled at this rank, so they must not gate auto-deploy).
    const _unlockedForDeploy = spaceshipClass.slots.filter(s => !_isSlotLocked(s));
    const allSlotsFilled = _unlockedForDeploy.length > 0 && _unlockedForDeploy.every(s => assignments[s.id]);
    if (allSlotsFilled && fleet.status !== 'deployed') {
      fleet.status = 'deployed';
      const spaceships2 = State.get('spaceships') || [];
      const ls = spaceships2.find(f => f.id === id);
      if (ls) { ls.status = 'deployed'; State.set('spaceships', spaceships2); }
      Blueprints.saveShipState(id, fleet);
      try { await SB.db('user_spaceships').update(id, { status: 'deployed' }); } catch(e) {}
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Spaceship Launched', message: `${fleet.name || 'Spaceship'} is fully staffed and deployed!`, type: 'fleet_deployed' });
      }
      if (typeof Gamification !== 'undefined') Gamification.addXP('launch_spaceship');
    }

    _loadSpaceship(el, id);
  }

  async function _removeAgentFromSlot(el, id, fleet, slotId, allAgents, agentMap, spaceshipClass) {
    const assignments = { ...(fleet.slots || fleet.slot_assignments || {}) };
    assignments[slotId] = null;
    fleet.slots = assignments;
    fleet.slot_assignments = assignments;
    fleet.agent_ids = Object.values(assignments).filter(Boolean);

    // Auto-dock when a slot is emptied
    if (fleet.status === 'deployed') {
      fleet.status = 'docked';
    }

    // Persist locally first so re-render picks up changes
    const spaceships = State.get('spaceships') || [];
    let localShip = spaceships.find(f => f.id === id);
    if (localShip) {
      localShip.slots = assignments; localShip.slot_assignments = assignments; localShip.agent_ids = fleet.agent_ids;
      localShip.status = fleet.status;
    } else {
      spaceships.push({ ...fleet, slots: assignments, slot_assignments: assignments, agent_ids: fleet.agent_ids });
    }
    State.set('spaceships', spaceships);
    Blueprints.saveShipState(id, fleet);

    if (typeof ShipSlots !== 'undefined') {
      try { await ShipSlots.setSlot(id, slotId, null); } catch(e) {}
    }
    try {
      await SB.db('user_spaceships').update(id, { status: fleet.status });
    } catch(e) { /* local state already updated */ }

    if (typeof Gamification !== 'undefined') Gamification.addXP('undock_agent');
    if (typeof Notify !== 'undefined') {
      Notify.send({ title: 'Spaceship Docked', message: `${fleet.name || 'Spaceship'} has been docked — slot emptied.`, type: 'system' });
    }
    _loadSpaceship(el, id);
  }

  function _roleColorFromAgent(a) {
    if (typeof CardRenderer !== 'undefined') return CardRenderer.roleColor(a?.role);
    const colors = { Research:'#6366f1', Code:'#06b6d4', Data:'#f59e0b', Content:'#ec4899', Ops:'#22c55e', Custom:'#8b5cf6', Marketing:'#e11d48', Sales:'#f97316', Support:'#8b5cf6', Engineering:'#06b6d4', Analytics:'#f59e0b', Automation:'#14b8a6', Legal:'#64748b' };
    return colors[a?.role] || '#6366f1';
  }

  function destroy() {
    if (_channel) { SB.realtime.unsubscribe(_channel); _channel = null; }
    _draggedAgentId = null;
    _draggedAgentRarity = null;
  }

  return { title, render, destroy, buildPlanFromShipWorkflow, effectiveWorkflows, isWorkflowsCustomized, buildCron, describeSchedule };
})();
