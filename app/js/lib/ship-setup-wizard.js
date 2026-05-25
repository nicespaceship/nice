/* ═══════════════════════════════════════════════════════════════════
   NICE — Orchestrator Setup Wizard
   3-step flow: Name → Agents → Deploy.
   AI Setup pre-fills from blueprint crew; Choose Agents for manual pick.
═══════════════════════════════════════════════════════════════════ */

const ShipSetupWizard = (() => {
  let _overlay = null;
  let _step = 0;
  let _blueprint = null;
  let _startStep = 0;
  let _onComplete = null;
  const _data = {
    shipName: '',
    classId: '',
    agentMode: '',
    slotAssignments: {},
    aiRec: null,
  };

  const RARITY_COLORS = BlueprintUtils.RARITY_COLORS;
  const STEP_LABELS = ['Name', 'Agents', 'Deploy'];
  const STEP_COUNT = 3;

  const _esc = Utils.esc;

  /* ── Open the wizard ── */
  function open(blueprint, opts) {
    if (_overlay) return;
    if (!blueprint) return;
    _blueprint = blueprint;
    _startStep = opts?.startStep || 0;
    _step = _startStep;
    _onComplete = opts?.onComplete || null;
    _data.shipName = opts?.shipName || blueprint.name || '';
    _data.classId = blueprint.class_id || '';
    _data.agentMode = 'auto';
    _data.slotAssignments = {};
    _data.aiRec = null;

    _overlay = document.createElement('div');
    _overlay.className = 'wizard-overlay';
    _overlay.innerHTML = `
      <div class="wizard-container">
        <button class="wizard-close" aria-label="Close">&times;</button>
        <div class="wizard-progress"></div>
        <div class="wizard-body"></div>
        <div class="wizard-actions"></div>
      </div>
    `;
    document.body.appendChild(_overlay);
    requestAnimationFrame(() => _overlay.classList.add('open'));

    _overlay.querySelector('.wizard-close').addEventListener('click', close);
    _overlay.addEventListener('click', (e) => { if (e.target === _overlay) close(); });
    document.addEventListener('keydown', _onKey);

    _showStep(_step);
  }

  function close() {
    if (!_overlay) return;
    document.removeEventListener('keydown', _onKey);
    _overlay.classList.remove('open');
    setTimeout(() => { _overlay?.remove(); _overlay = null; }, 200);
  }

  function _onKey(e) { if (e.key === 'Escape') close(); }

  /* ── Step rendering ── */
  function _showStep(n) {
    const renderers = [_renderStepName, _renderStepAgents, _renderStepDeploy];
    if (n < 0 || n >= renderers.length) n = 0;
    _step = n;
    if (!_overlay) return;
    const body = _overlay.querySelector('.wizard-body');
    const actions = _overlay.querySelector('.wizard-actions');
    const progress = _overlay.querySelector('.wizard-progress');

    progress.innerHTML = Array.from({ length: STEP_COUNT }, (_, i) =>
      `<span class="wizard-step-wrap${i === n ? ' active' : ''}${i < n ? ' done' : ''}">` +
        `<span class="wizard-dot">${i < n ? '✓' : i + 1}</span>` +
      `</span>`
    ).join('');

    renderers[n](body, actions);
  }

  /* ── Helpers ── */

  /** Delegate to BlueprintUtils (single source of truth) with inline fallback */
  const _bu = () => typeof BlueprintUtils !== 'undefined' ? BlueprintUtils : null;

  function _getSlotCount() {
    const bu = _bu();
    return bu ? bu.getSlotCount(_blueprint) : (parseInt(_blueprint?.stats?.slots, 10) || parseInt(_blueprint?.stats?.crew, 10) || 6);
  }

  function _getCrewDefs() {
    const bu = _bu();
    return bu ? bu.getCrewDefs(_blueprint) : (_blueprint?.metadata?.crew || _blueprint?.crew || _blueprint?.nodes || []);
  }

  function _getShipClass() {
    const bu = _bu();
    return bu ? bu.getSlotTemplate(_blueprint) : {
      id: 'dynamic', name: _blueprint?.name || 'Ship',
      slots: Array.from({ length: _getSlotCount() }, (_, i) => ({ id: i, maxRarity: 'Legendary', label: 'Agent ' + (i + 1) })),
    };
  }

  function _getAgentCatalog(opts) {
    // Prefer Blueprints (full 261 agents from DB) over small static SEED
    let pool;
    if (typeof Blueprints !== 'undefined' && Blueprints.listAgents) {
      const all = Blueprints.listAgents();
      if (all.length) pool = [...all];
    }
    if (!pool) {
      pool = (typeof BlueprintsView !== 'undefined' && BlueprintsView.SEED && BlueprintsView.SEED.length)
        ? [...BlueprintsView.SEED]
        : [];
    }
    // Auto-recommend paths pass { recommendable: true } to skip
    // power-user-only umbrellas (e.g. Replicate — BYO Replicate account,
    // billed to the user). Manual dropdowns keep the full catalog so a
    // user who explicitly wants Replicate can still pick it.
    if (opts && opts.recommendable) {
      pool = pool.filter(a => !(a && a.metadata && a.metadata.power_user_only));
    }
    return pool;
  }

  /** Ensure catalog is loaded before rendering dropdowns */
  async function _ensureCatalog() {
    if (typeof Blueprints !== 'undefined' && Blueprints.ensureCatalogLoaded) {
      await Blueprints.ensureCatalogLoaded();
    }
  }

  function _canSlot(slotMaxRarity, agentRarity) {
    return typeof Gamification !== 'undefined'
      ? Gamification.canSlotAccept(slotMaxRarity, agentRarity)
      : true;
  }

  function _agentRarity(agent) {
    return BlueprintUtils.getRarity(agent);
  }

  function _getCrewForClass() {
    const crew = _getCrewDefs();
    return crew.slice(0, _getSlotCount());
  }

  /** Whether a slot is locked behind a class gate the current user has
      not reached. Locked slots stay visible in the wizard so the user
      sees the growth ladder, but are never auto-assigned, never
      auto-created on deploy, and never persisted to user_ship_slots. */
  function _isSlotLocked(slot) {
    if (!slot || !slot.min_class) return false;
    if (typeof Gamification === 'undefined' || !Gamification.isClassUnlocked) return false;
    return !Gamification.isClassUnlocked(slot.min_class);
  }

  function _unlockRankName(minClass) {
    if (!minClass) return '';
    if (minClass === 'class-5') return 'NICE Pro';
    if (typeof Gamification !== 'undefined' && Gamification.getFirstRankForClass) {
      const r = Gamification.getFirstRankForClass(minClass);
      if (r && r.name) return r.name;
    }
    return minClass;
  }

  /* ═══════════════════════════════════════════════════════════════
     STEP 0 — Name Your Spaceship
  ═══════════════════════════════════════════════════════════════ */
  function _renderStepName(body, actions) {
    const sc = _getShipClass();
    const bpName = _blueprint.name || 'Orchestrator';
    body.innerHTML = `
      <h2 class="wizard-title">Name Your Spaceship</h2>
      <p class="wizard-subtitle">Give your <strong>${_esc(bpName)}</strong> a name — your business or project.</p>
      <input type="text" class="wizard-input" id="ship-wiz-name" placeholder="e.g. ${_esc(bpName)}" maxlength="60" value="${_esc(_data.shipName)}" autofocus>
      <div class="ship-wizard-bp-preview">
        <div>
          <div class="ship-wizard-bp-class">${_esc(bpName)}</div>
          <div class="ship-wizard-bp-slots">${sc.slots.length} agent slots available</div>
        </div>
      </div>
    `;

    const input = body.querySelector('#ship-wiz-name');
    input.addEventListener('input', () => { _data.shipName = input.value.trim(); });
    setTimeout(() => input.focus(), 50);

    actions.innerHTML = `
      <button class="btn btn-sm" id="ship-wiz-cancel">Cancel</button>
      <button class="btn btn-sm btn-primary" id="ship-wiz-next0">Next</button>
    `;
    actions.querySelector('#ship-wiz-cancel').addEventListener('click', close);
    actions.querySelector('#ship-wiz-next0').addEventListener('click', () => {
      _data.shipName = input.value.trim();
      if (_data.shipName.length < 2) {
        input.classList.add('wizard-shake');
        setTimeout(() => input.classList.remove('wizard-shake'), 500);
        return;
      }
      _showStep(1);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     STEP 1 — Assign Your Agents
  ═══════════════════════════════════════════════════════════════ */
  function _renderStepAgents(body, actions) {
    const sc = _getShipClass();
    const slotCount = sc.slots?.length || 0;
    const unlockedCount = (sc.slots || []).filter(s => !_isSlotLocked(s)).length;
    const lockedCount = slotCount - unlockedCount;
    const displayName = _data.shipName || _blueprint.name;
    const crew = _getCrewDefs();
    const hasCrewDefs = crew.length > 0;
    const slotCopy = lockedCount > 0
      ? `Fill ${unlockedCount} of ${slotCount} agent slots on <strong>${_esc(displayName)}</strong> (${lockedCount} unlock as you rank up)`
      : `Fill ${slotCount} agent slots on <strong>${_esc(displayName)}</strong>`;

    body.innerHTML = `
      <h2 class="wizard-title">Assign Your Agents</h2>
      <p class="wizard-subtitle">${slotCopy}</p>
      <div class="ship-wizard-mode-cards">
        <div class="ship-wizard-mode-card${_data.agentMode === 'auto' ? ' selected' : ''}" data-mode="auto">
          <div class="ship-wizard-mode-icon">&#10022;</div>
          <div class="ship-wizard-mode-label">AI Setup</div>
          <div class="ship-wizard-mode-hint">${hasCrewDefs ? 'Use the blueprint\'s recommended agents' : 'Let NICE pick the best agents for you'}</div>
        </div>
        <div class="ship-wizard-mode-card${_data.agentMode === 'manual' ? ' selected' : ''}" data-mode="manual">
          <div class="ship-wizard-mode-icon">&#9881;</div>
          <div class="ship-wizard-mode-label">Choose Agents</div>
          <div class="ship-wizard-mode-hint">Manually pick agents for each slot</div>
        </div>
      </div>
      <div id="ship-wiz-crew-content"></div>
    `;

    body.querySelectorAll('.ship-wizard-mode-card').forEach(card => {
      card.addEventListener('click', () => {
        body.querySelectorAll('.ship-wizard-mode-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        _data.agentMode = card.dataset.mode;
        _data.slotAssignments = {};
        const cc = body.querySelector('#ship-wiz-crew-content');
        if (_data.agentMode === 'auto') _renderAutoFill(cc);
        else if (_data.agentMode === 'manual') _renderManualCrew(cc);
      });
    });

    const cc = body.querySelector('#ship-wiz-crew-content');
    if (_data.agentMode === 'auto') _renderAutoFill(cc);
    else if (_data.agentMode === 'manual') _renderManualCrew(cc);

    actions.innerHTML = `
      <button class="btn btn-sm" id="ship-wiz-back2">&larr; Back</button>
      <button class="btn btn-sm btn-primary" id="ship-wiz-deploy">Deploy &rarr;</button>
    `;
    actions.querySelector('#ship-wiz-back2').addEventListener('click', () => _showStep(0));
    actions.querySelector('#ship-wiz-deploy').addEventListener('click', () => {
      if (!_data.agentMode) {
        body.querySelector('.ship-wizard-mode-cards').classList.add('wizard-shake');
        setTimeout(() => body.querySelector('.ship-wizard-mode-cards')?.classList.remove('wizard-shake'), 500);
        return;
      }
      const filled = Object.values(_data.slotAssignments).filter(Boolean).length;
      if (filled === 0) {
        const content = body.querySelector('#ship-wiz-crew-content');
        if (content) { content.classList.add('wizard-shake'); setTimeout(() => content.classList.remove('wizard-shake'), 500); }
        return;
      }
      _showStep(2);
    });
  }

  /* ── Render slot dropdowns (shared by both modes) ── */
  function _renderSlotDropdowns(container) {
    const sc = _getShipClass();
    const agents = _getAgentCatalog();
    const crew = _getCrewDefs();

    // Count unlocked / locked separately so the activation copy reads true.
    const totalSlots = sc.slots.length;
    const unlockedSlots = sc.slots.filter(s => !_isSlotLocked(s));
    const lockedCount = totalSlots - unlockedSlots.length;

    let html = '<div class="ship-wizard-slots">';
    for (let i = 0; i < sc.slots.length; i++) {
      const slot = sc.slots[i];

      if (_isSlotLocked(slot)) {
        // Surface the locked slot inline so the growth ladder is visible
        // from the wizard, but no dropdown — the slot can't be assigned
        // until the user reaches the gating rank.
        const rankName = _unlockRankName(slot.min_class);
        html += `<div class="ship-wizard-slot ship-wizard-slot-locked">
          <div class="ship-wizard-slot-info">
            <span class="ship-wizard-slot-label">${_esc(slot.label)}</span>
          </div>
          <div class="ship-wizard-slot-select">
            <span class="ship-wizard-slot-lock">Unlocks at ${_esc(rankName)}</span>
          </div>
        </div>`;
        continue;
      }

      // Ship rarity = max agent rarity the ship can accept
      const shipRarity = _blueprint.rarity || 'Common';
      const compatible = agents
        .filter(a => _canSlot(shipRarity, _agentRarity(a)))
        .sort((a, b) => {
          const ro = { Legendary: 4, Epic: 3, Rare: 2, Common: 1 };
          return (ro[_agentRarity(b)] || 0) - (ro[_agentRarity(a)] || 0);
        });

      // Check both index-based and slot.id-based assignments
      const currentVal = _data.slotAssignments[i] || _data.slotAssignments[slot.id] || '';
      // For auto-created crew, show their name as an option
      const crewMember = crew[i];
      const hasNewAgent = currentVal.startsWith?.('__new__');
      const newAgentName = hasNewAgent ? currentVal.replace('__new__', '') : '';

      html += `<div class="ship-wizard-slot">
        <div class="ship-wizard-slot-info">
          <span class="ship-wizard-slot-label">${_esc(slot.label)}</span>
        </div>
        <div class="ship-wizard-slot-select">
          <select data-slot="${i}">
            <option value="">— Select Agent —</option>
            ${hasNewAgent ? `<option value="${_esc(currentVal)}" selected>${_esc(newAgentName)} (Blueprint)</option>` : ''}
            ${compatible.map(a => {
              const r = _agentRarity(a);
              const sel = (!hasNewAgent && currentVal === a.id) ? 'selected' : '';
              return `<option value="${a.id}" ${sel}>${a.name} (${r})</option>`;
            }).join('')}
          </select>
        </div>
      </div>`;
    }
    html += '</div>';

    const filledCount = Object.values(_data.slotAssignments).filter(Boolean).length;
    const unfilled = unlockedSlots.length - filledCount;
    if (unfilled > 0) {
      html += `<div class="ship-wizard-analysis" style="margin-top:8px"><em>${unfilled} unfilled slot${unfilled > 1 ? 's' : ''} will be auto-created on deploy.</em></div>`;
    }
    if (lockedCount > 0) {
      html += `<div class="ship-wizard-analysis" style="margin-top:4px"><em>${lockedCount} more slot${lockedCount > 1 ? 's' : ''} unlock as you rank up.</em></div>`;
    }

    container.innerHTML = html;

    container.querySelectorAll('select').forEach(sel => {
      sel.addEventListener('change', () => {
        const slotId = parseInt(sel.dataset.slot, 10);
        _data.slotAssignments[slotId] = sel.value || null;
      });
    });
  }

  /* ── AI Setup: pre-fill then show dropdowns ── */
  async function _renderAutoFill(container) {
    container.innerHTML = '<p style="text-align:center;color:var(--text-muted)">Loading agents...</p>';
    await _ensureCatalog();

    const sc = _getShipClass();
    const crew = _getCrewDefs();

    // Use blueprint crew first (e.g. Picard, Riker, Worf for Enterprise; Neo, Trinity for The Matrix)
    // Skip locked slots — they can't be assigned at the user's current rank.
    if (crew.length > 0) {
      for (let i = 0; i < sc.slots.length; i++) {
        if (_isSlotLocked(sc.slots[i])) continue;
        const member = crew[i];
        if (member) {
          _data.slotAssignments[i] = `__new__${member.label || member.name || 'Agent ' + (i + 1)}`;
        }
      }
    }

    // Fill any remaining empty slots with best-match catalog agents
    _fallbackAssign();

    _renderSlotDropdowns(container);
  }

  /* ── Manual: empty dropdowns ── */
  async function _renderManualCrew(container) {
    container.innerHTML = '<p style="text-align:center;color:var(--text-muted)">Loading agents...</p>';
    await _ensureCatalog();
    _renderSlotDropdowns(container);
  }

  /* ── Fallback: match agents to slots by role/category ──
     If the blueprint declares crew_roles / crew_overrides, route through
     CrewMatcher (rarity-aware role matching + pinned overrides).
     Otherwise fall back to the legacy slot.label substring matcher,
     but pick the highest-rarity unused agent instead of the first
     alphabetical one — fixes the "every ship gets the same 6 A-named
     agents" bug for the 237 catalog ships that have no crew spec. */
  function _fallbackAssign() {
    const sc = _getShipClass();
    const agents = _getAgentCatalog({ recommendable: true });
    const shipRarity = _blueprint.rarity || 'Common';
    const cfg = _blueprint.config || {};
    const roles = Array.isArray(cfg.crew_roles) ? cfg.crew_roles : [];
    const overrides = (cfg.crew_overrides && typeof cfg.crew_overrides === 'object') ? cfg.crew_overrides : {};
    const hasSpec = roles.length > 0 || Object.keys(overrides).length > 0;

    if (hasSpec && typeof CrewMatcher !== 'undefined') {
      const next = CrewMatcher.assignCrew(
        { roles, overrides },
        {
          agents,
          slotCount: sc.slots.length,
          shipMaxRarity: shipRarity,
          canSlot: _canSlot,
          preassigned: _data.slotAssignments,
        }
      );
      for (let i = 0; i < sc.slots.length; i++) {
        if (_data.slotAssignments[i]) continue;
        if (_isSlotLocked(sc.slots[i])) continue;
        if (next[i]) _data.slotAssignments[i] = next[i];
      }
      return;
    }

    // Legacy path — improved: pick highest-rarity match, not first alphabetical
    const used = new Set(Object.values(_data.slotAssignments).filter(Boolean));
    const rarityRank = { Mythic: 5, Legendary: 4, Epic: 3, Rare: 2, Common: 1 };
    const rank = (a) => rarityRank[_agentRarity(a)] || 0;

    for (let i = 0; i < sc.slots.length; i++) {
      if (_data.slotAssignments[i]) continue;
      if (_isSlotLocked(sc.slots[i])) continue;

      const slot = sc.slots[i];
      const label = (slot.label || '').toLowerCase();
      let bestMatch = null, bestMatchRank = -1, bestMatchName = '';
      let bestAny = null, bestAnyRank = -1, bestAnyName = '';

      for (const a of agents) {
        if (used.has(a.id)) continue;
        if (!_canSlot(shipRarity, _agentRarity(a))) continue;
        const r = rank(a);
        const name = a.name || '';
        // Track best label-match candidate
        const cat = (a.category || a.config?.role || '').toLowerCase();
        const isMatch = label && (cat.includes(label) || name.toLowerCase().includes(label) || (cat && label.includes(cat)));
        if (isMatch && (r > bestMatchRank || (r === bestMatchRank && name < bestMatchName))) {
          bestMatch = a; bestMatchRank = r; bestMatchName = name;
        }
        // Track best any-fits candidate (used only if no match found)
        if (r > bestAnyRank || (r === bestAnyRank && name < bestAnyName)) {
          bestAny = a; bestAnyRank = r; bestAnyName = name;
        }
      }

      const pick = bestMatch || bestAny;
      if (pick) {
        _data.slotAssignments[i] = pick.id;
        used.add(pick.id);
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     STEP 2 — Deploy
  ═══════════════════════════════════════════════════════════════ */
  function _renderStepDeploy(body, actions) {
    body.innerHTML = `
      <div class="wizard-launching">
        <div class="wizard-spinner"></div>
        <h2 class="wizard-title">Deploying ${_esc(_data.shipName || _blueprint.name)}...</h2>
        <p id="ship-wiz-status">Activating orchestrator...</p>
      </div>
    `;
    actions.innerHTML = '';

    _deploy().then(() => {
      const sc = _getShipClass();
      const filledCount = Object.values(_data.slotAssignments).filter(Boolean).length;
      const agents = _getAgentCatalog();
      const crew = _getCrewDefs();
      const agentNames = Object.entries(_data.slotAssignments)
        .filter(([, v]) => v)
        .map(([idx, id]) => {
          const fromCatalog = agents.find(a => a.id === id);
          if (fromCatalog) return fromCatalog.name;
          const member = crew[parseInt(idx, 10)];
          if (member) return member.label;
          return id;
        })
        .join(', ');

      const unlockedTotal = sc.slots.filter(s => !_isSlotLocked(s)).length;
      const lockedTotal = sc.slots.length - unlockedTotal;
      const lockNote = lockedTotal > 0
        ? `<p class="wizard-subtitle">${lockedTotal} more station${lockedTotal > 1 ? 's' : ''} unlock as you rank up.</p>`
        : '';
      body.innerHTML = `
        <div class="wizard-success">
          <div class="wizard-success-icon"><svg width="48" height="48" viewBox="0 0 5000 5000" fill="currentColor"><path d="M2463.17,3633.17c348.87-33.89,529.56,395.76,262.71,618.71-179.73,150.16-459.24,78.58-546.6-137.16-85.98-212.33,54.43-459.26,283.89-481.55Z"/><path d="M3763.2,2905.2c246.91-17.2,431.6,227.75,353.89,461.89-87.4,263.37-443.86,323.54-610.74,100.57-168.07-224.56-21.82-543.04,256.85-562.46Z"/><path d="M2467.2,673.2c345.58-32.47,524.02,397,258.68,618.68-180.13,150.49-459.08,78.97-546.6-137.16-87.17-215.28,55.93-459.73,287.92-481.52Z"/><path d="M1203.18,2905.19c275.09-15.44,457.71,280.84,322.9,522.88-119.67,214.87-425.07,238.14-577.97,45.82-177.41-223.16-28.22-552.8,255.07-568.7Z"/><path d="M3537.4,2014.6c-177.73-177.72-114.08-485.01,120.51-574.69,274.93-105.11,544.87,148.19,461.85,429.85-73.68,249.96-398.06,329.14-582.35,144.85Z"/><path d="M1187.2,1409.2c279.69-26.25,476.07,269.48,341.49,517.49-117.32,216.2-419.09,243.76-576.57,55.2-178.93-214.25-41.59-546.72,235.08-572.68Z"/><path d="M2447.2,1853.2c550.99-42.77,908.61,573.22,585.69,1025.69-276.72,387.72-866.37,355.58-1097.57-60.2-228.12-410.24,44.43-929.2,511.88-965.49ZM2455.2,1953.2c-427.55,33.48-653.11,541.85-388.78,882.39,257.89,332.24,777.21,269.58,942.28-116.89,164.38-384.87-139.97-797.88-553.5-765.5Z"/><path d="M1272,2204v604c-33.72-4.09-66.28-4.09-100,0v-604c31.79,6.4,68.34,6.38,100,0Z"/><path d="M3836,2808c-34.42-3.47-65.53-5.37-100,0v-596c2.93-1.06,4.78,4,6,4h84c1.4,0,4.44-7.1,10,2v590Z"/><polygon points="3375.95 1580 2868.23 1291.66 2912.04 1203.99 3418.07 1491.98 3423.59 1497.98 3375.95 1580"/><polygon points="2139.99 1291.94 1637.96 1579.88 1588.37 1497.36 2086.75 1204.5 2095.49 1210.49 2139.99 1291.94"/><path d="M2139.98,3712.08c2.15,3.03-33.45,55.51-38.18,63.72-4.14,7.19-5.9,25.29-15.33,23.83l-494.1-289.2,43.94-82.16,11.78,1.54,491.88,282.27Z"/><path d="M3366,3424.08l45.38,82.85-3.37,11.08-492.12,280.28c-7.13-25.22-36.8-54.55-44.83-75.52-1.4-3.67-4.89-6.66-1.38-10.87l496.32-287.83Z"/><path d="M2483.19,2101.18c280.93-16.74,488.07,258.72,401.96,525.96-85.83,266.35-424.89,363.36-639.04,180.75-276.2-235.52-124.03-685.19,237.08-706.71Z"/></svg></div>
          <h2 class="wizard-title">${_esc(_data.shipName || _blueprint.name)} is Deployed!</h2>
          <p class="wizard-subtitle">${filledCount} of ${unlockedTotal} agent stations filled.</p>
          ${lockNote}
          ${typeof Gamification !== 'undefined' ? '<p class="wizard-xp">+25 XP earned!</p>' : ''}
          <div class="ship-wizard-analysis">
            <strong>Agents:</strong> ${_esc(agentNames)}<br>
            <strong>Blueprint:</strong> ${_esc(_blueprint.name)}
          </div>
        </div>
      `;
      actions.innerHTML = `
        <button class="btn btn-sm" id="ship-wiz-close">Close</button>
        <button class="btn btn-sm btn-primary" id="ship-wiz-view">View Spaceship Schematic</button>
      `;
      actions.querySelector('#ship-wiz-close').addEventListener('click', close);
      actions.querySelector('#ship-wiz-view').addEventListener('click', () => {
        close();
        const mcShipValue = 'bp-' + _blueprint.id;
        localStorage.setItem(Utils.KEYS.mcShip, mcShipValue);
        window.dispatchEvent(new StorageEvent('storage', { key: Utils.KEYS.mcShip, newValue: mcShipValue }));
        // Navigate to schematic — use temporary hash to force re-render
        location.hash = '#/_reload';
        setTimeout(() => { location.hash = '#/bridge?tab=schematic'; }, 50);
      });
    }).catch(err => {
      body.innerHTML = `
        <div class="wizard-success">
          <h2 class="wizard-title">Deployment Error</h2>
          <p class="wizard-subtitle">${_esc(err.message || 'Something went wrong.')}</p>
        </div>
      `;
      actions.innerHTML = `
        <button class="btn btn-sm" id="ship-wiz-retry">Try Again</button>
        <button class="btn btn-sm" onclick="ShipSetupWizard.close()">Close</button>
      `;
      actions.querySelector('#ship-wiz-retry')?.addEventListener('click', () => _showStep(1));
    });
  }

  async function _deploy() {
    const statusEl = document.getElementById('ship-wiz-status');
    const sc = _getShipClass();
    const crew = _getCrewDefs();

    // 1. Activate blueprint
    // Pass {force:true} so the rarity gate in activateShip doesn't silently
    // reject ships the user has already committed to via the wizard. The
    // card-level 🔒 lock has already prevented unauthorized users from
    // reaching this step; re-checking here only broke the state layers.
    if (statusEl) statusEl.textContent = 'Activating blueprint...';
    if (typeof Blueprints !== 'undefined') {
      const activated = Blueprints.activateShip(_blueprint.id, { force: true });
      if (!activated && !Blueprints.isShipActivated(_blueprint.id)) {
        console.warn('[ShipSetupWizard] activateShip returned false and ship is not activated; state layers may drift');
      }
    }
    await _wait(400);

    // 2. Save slot assignments
    // The wizard historically keyed ship state under `'bp-' + _blueprint.id`
    // to avoid collision with catalog entries. That convention meant the
    // wizard wrote to one id and activateShip wrote to another, leaving
    // `_activatedShipIds`, `_shipState`, and `State.spaceships` using three
    // different ids for the same ship. Use the catalog id directly so every
    // storage layer shares one canonical id.
    if (statusEl) statusEl.textContent = 'Assigning agents to stations...';
    // `let`, not const — the DB persist block below swaps this to the
    // user_spaceships UUID on success so downstream saveShipState /
    // State.spaceships writes share one canonical id with the DB row.
    let shipStateId = _blueprint.id;
    const agentIds = Object.values(_data.slotAssignments).filter(Boolean);
    if (typeof Blueprints !== 'undefined') {
      Blueprints.saveShipState(shipStateId, {
        slot_assignments: _data.slotAssignments,
        status: 'deployed',
        agent_ids: agentIds,
        name: _data.shipName,
        class_id: _data.classId,
      });
    }
    await _wait(400);

    // 3. Activate assigned agents (or create from definitions)
    if (statusEl) statusEl.textContent = 'Activating agents...';
    const resolvedAgentIds = [];
    if (typeof Blueprints !== 'undefined') {
      for (let i = 0; i < agentIds.length; i++) {
        const aid = agentIds[i];
        if (aid && aid.startsWith('__new__')) {
          const agentName = aid.replace('__new__', '');
          const crewMember = crew.find(n => n.label === agentName);
          let seedBp = null;
          if (typeof BlueprintsView !== 'undefined' && BlueprintsView.SEED) {
            seedBp = BlueprintsView.SEED.find(b => b.name === agentName);
          }

          let resolvedId;
          if (seedBp) {
            resolvedId = 'bp-' + seedBp.id;
            Blueprints.activateAgent(seedBp.id);
            if (typeof State !== 'undefined') {
              const agents = State.get('agents') || [];
              if (!agents.find(a => a.id === resolvedId)) {
                agents.push({
                  id: resolvedId, name: seedBp.name, role: seedBp.config?.role || seedBp.category,
                  category: seedBp.category, rarity: seedBp.rarity, status: 'idle',
                  blueprint_id: seedBp.id, config: seedBp.config, stats: seedBp.stats,
                  caps: seedBp.caps, flavor: seedBp.flavor, desc: seedBp.description,
                  description: seedBp.description, tags: seedBp.tags,
                });
                State.set('agents', agents);
              }
            }
          } else {
            // Resolve crew slot index so the synthetic blueprint_id can point
            // back at the right node inside _blueprint.metadata.crew on read.
            const crewSlotIdx = Object.entries(_data.slotAssignments).find(([, v]) => v === aid)?.[0];
            const crewBpId = _blueprint?.id ? `${_blueprint.id}-crew-${crewSlotIdx}` : null;
            // New-schema slots expose `agent_id` (the wired umbrella from
            // ship_slots.default_agent_id). Wire it as `capability_id` so the
            // runtime tool resolver inherits the umbrella's tools via Path 2
            // in agent-executor._buildExecContext. Without this, auto-created
            // slot agents ship with config.tools = [] and Path 1 short-circuits
            // to "no tools available" regardless of seed wiring.
            const defaultUmbrellaId = crewMember?.agent_id || null;
            const baseCfg = crewMember?.config
              || (defaultUmbrellaId
                    ? { role: agentName, type: 'Agent', llm_engine: 'claude-4-6-sonnet', capability_id: defaultUmbrellaId }
                    : { role: agentName, type: 'Agent', llm_engine: 'claude-4-6-sonnet', tools: [] });
            // For captain slots, ship_slots.default_agent_id IS a real
            // agent_blueprints UUID (the-<ship>-specialist). Override the
            // synthetic crewBpId so the top-level user_agents.blueprint_id
            // FK column resolves to the specialist row. Worker slots stay
            // on the synthetic id (tracked in config.blueprint_id only).
            const topBpId = (crewMember?.role === 'captain' && _isUuid(defaultUmbrellaId))
              ? defaultUmbrellaId
              : crewBpId;
            let newAgent = {
              id: `agent-${Date.now()}-${i}`,
              name: agentName,
              category: crewMember?.config?.agentRole || 'Ops',
              rarity: crewMember?.rarity || 'Common',
              blueprint_id: topBpId,
              config: crewBpId ? { ...baseCfg, blueprint_id: crewBpId } : baseCfg,
              stats: { spd: '3.0s', acc: '92%', cap: '5K', pwr: '75' },
              tags: [], activated: true,
              flavor: `Auto-created for ${_data.shipName || _blueprint.name}.`,
            };
            // Persist to user_agents so a localStorage wipe doesn't strand
            // the slot character with a dangling synthetic id. No-op on guest.
            newAgent = await _persistSlotAgent(newAgent);
            resolvedId = newAgent.id;
            Blueprints.activateAgent(newAgent.id);
            if (typeof State !== 'undefined') {
              const agents = State.get('agents') || [];
              agents.push(newAgent);
              State.set('agents', agents);
            }
            try {
              const stored = JSON.parse(localStorage.getItem(Utils.KEYS.customAgents) || '[]');
              stored.push(newAgent);
              localStorage.setItem(Utils.KEYS.customAgents, JSON.stringify(stored));
            } catch {}
          }

          resolvedAgentIds.push(resolvedId);
          const slotIdx = Object.entries(_data.slotAssignments).find(([, v]) => v === aid)?.[0];
          if (slotIdx !== undefined) _data.slotAssignments[parseInt(slotIdx, 10)] = resolvedId;
        } else if (aid) {
          if (!Blueprints.isAgentActivated(aid)) {
            Blueprints.activateAgent(aid);
          }
          resolvedAgentIds.push(aid);
        }
      }

      // Auto-create agents for unfilled slots — skip locked slots so the
      // user_ship_slots / user_agents rows only cover what the user can
      // actually access at their current rank.
      for (let i = 0; i < sc.slots.length; i++) {
        if (_data.slotAssignments[i]) continue;
        if (_isSlotLocked(sc.slots[i])) continue;
        const slot = sc.slots[i];
        const crewMember = crew[i];
        const agentName = crewMember?.label || `${slot.label} Agent`;
        const crewBpId = _blueprint?.id ? `${_blueprint.id}-crew-${i}` : null;
        // See the __new__ branch above — slot.default_agent_id surfaces here
        // as crewMember.agent_id and must wire to capability_id so the runtime
        // tool resolver inherits the umbrella's tools.
        const defaultUmbrellaId = crewMember?.agent_id || null;
        const baseCfg = crewMember?.config
          || (defaultUmbrellaId
                ? { role: slot.label, type: 'Agent', llm_engine: 'claude-4-6-sonnet', capability_id: defaultUmbrellaId }
                : { role: slot.label, type: 'Agent', llm_engine: 'claude-4-6-sonnet', tools: [] });
        // Captain-slot override: top-level FK gets the specialist UUID.
        // See the __new__ branch above for the rationale.
        const topBpId = (crewMember?.role === 'captain' && _isUuid(defaultUmbrellaId))
          ? defaultUmbrellaId
          : crewBpId;
        let newAgent = {
          id: `agent-${Date.now()}-auto-${i}`,
          name: agentName,
          category: crewMember?.config?.agentRole || slot.label,
          rarity: crewMember?.rarity || 'Common',
          blueprint_id: topBpId,
          config: crewBpId ? { ...baseCfg, blueprint_id: crewBpId } : baseCfg,
          stats: { spd: '3.0s', acc: '90%', cap: '3K', pwr: '70' },
          tags: [], activated: true,
          flavor: `Auto-created for ${slot.label} station.`,
        };
        // Same persistence pattern as the custom-slot branch above.
        newAgent = await _persistSlotAgent(newAgent);
        Blueprints.activateAgent(newAgent.id);
        if (typeof State !== 'undefined') {
          const agents = State.get('agents') || [];
          agents.push(newAgent);
          State.set('agents', agents);
        }
        try {
          const stored = JSON.parse(localStorage.getItem(Utils.KEYS.customAgents) || '[]');
          stored.push(newAgent);
          localStorage.setItem(Utils.KEYS.customAgents, JSON.stringify(stored));
        } catch {}
        _data.slotAssignments[i] = newAgent.id;
        resolvedAgentIds.push(newAgent.id);
      }
    }
    await _wait(300);

    // Persist to user_spaceships for cross-device durability.
    // Before this write the wizard only touched localStorage + State; a user
    // who deployed on desktop then opened the app on mobile saw an empty
    // fleet because _loadUserCreations found no row. Insert with the same
    // shape deployFromCatalog uses so the loader reconciles cleanly.
    const user = (typeof State !== 'undefined') ? State.get('user') : null;
    if (user && typeof SB !== 'undefined' && typeof SB.isReady === 'function' && SB.isReady()) {
      if (statusEl) statusEl.textContent = 'Saving to your fleet...';
      try {
        const dbShipRow = {
          user_id:      user.id,
          name:         _data.shipName || _blueprint.name,
          blueprint_id: _blueprint.id,
          rarity:       _blueprint.rarity || 'Common',
          category:     _blueprint.category || '',
          status:       'deployed',
          config: {
            crew:        _blueprint.crew || (_blueprint.metadata && _blueprint.metadata.crew) || [],
            agent_ids:   resolvedAgentIds,
            class_id:    _data.classId,
            caps:        _blueprint.caps || (_blueprint.metadata && _blueprint.metadata.caps) || [],
            description: _blueprint.description || '',
            flavor:      _blueprint.flavor || '',
            tags:        _blueprint.tags || [],
            stats:       _blueprint.stats || {},
          },
        };
        const { ship: created } = await Blueprints.findOrCreateActiveShip(_blueprint.id, () => dbShipRow);
        if (created && created.id && created.id !== shipStateId) {
          // Swap shipStateId to the DB UUID so every downstream layer
          // (_shipState, _activatedShipIds, State.spaceships) shares one
          // canonical id that matches what _loadUserCreations will resurrect
          // on the next sign-in. handoffShipId atomically evicts the stale
          // catalog-id entries from all three layers.
          if (typeof Blueprints !== 'undefined') {
            Blueprints.activateShip(created.id, { force: true });
            if (typeof Blueprints.handoffShipId === 'function') {
              Blueprints.handoffShipId(shipStateId, created.id);
            }
          }
          shipStateId = created.id;
        }
        // Slot assignments persist to user_ship_slots (Phase C.1 cut).
        // By this point all `__new__` placeholders have been resolved to
        // real user_agents UUIDs above, so the FK constraint is satisfied.
        if (created && created.id && typeof ShipSlots !== 'undefined') {
          await ShipSlots.setForShip(created.id, _data.slotAssignments);
        }
      } catch (e) {
        // Fall through with the local-only id. Wizard still completes on
        // this device; cross-device sync just won't work until the next
        // successful write (e.g. slot edit through SpaceshipDetailView).
        console.warn('[ShipSetupWizard] user_spaceships persist failed, local-only deployment:', e && e.message);
      }
    }

    // Re-save with resolved agent IDs
    if (resolvedAgentIds.length && typeof Blueprints !== 'undefined') {
      Blueprints.saveShipState(shipStateId, {
        slot_assignments: _data.slotAssignments,
        status: 'deployed',
        agent_ids: resolvedAgentIds,
        name: _data.shipName,
        class_id: _data.classId,
      });
    }

    // Update spaceships State
    if (typeof State !== 'undefined') {
      const spaceships = State.get('spaceships') || [];
      const existing = spaceships.find(s => s.id === shipStateId);
      const shipData = {
        id: shipStateId,
        name: _data.shipName || _blueprint.name,
        blueprint_id: _blueprint.id,
        class_id: _data.classId,
        status: 'deployed',
        slot_assignments: _data.slotAssignments,
        agent_ids: resolvedAgentIds,
        stats: _blueprint.stats,
        metadata: _blueprint.metadata,
        crew: _blueprint.crew || _blueprint.metadata?.crew || [],
        rarity: _blueprint.rarity,
        config: _blueprint.config,
        description: _blueprint.description,
        caps: _blueprint.caps || _blueprint.metadata?.caps || [],
        type: 'spaceship',
      };
      if (existing) Object.assign(existing, shipData);
      else spaceships.push(shipData);
      State.set('spaceships', spaceships);
    }

    // Award XP
    if (statusEl) statusEl.textContent = 'Finalizing deployment...';
    if (typeof Gamification !== 'undefined') {
      Gamification.addXP('activate_blueprint');
    }
    await _wait(300);

    // Audit log
    if (typeof AuditLog !== 'undefined') {
      AuditLog.log({ type: 'ship_setup_wizard', detail: `Deployed ${_data.shipName} (${_blueprint.name}) with ${resolvedAgentIds.length} agents` });
    }

    // Ship-theme auto-switch (e.g. Enterprise → LCARS)
    const shipName = (_data.shipName || _blueprint.name || '').toLowerCase();
    const shipId = (_blueprint.id || '').toLowerCase();
    if (shipName.includes('enterprise') || shipName.includes('ncc-1701') || shipId.includes('enterprise') || shipId.includes('ncc-1701')) {
      if (typeof Theme !== 'undefined') {
        Theme.set('lcars');
        if (typeof Notify !== 'undefined') Notify.send({ title: 'Theme Activated', message: 'LCARS interface engaged.', type: 'system' });
      }
    }
    if (shipName.includes('matrix') || shipId.includes('matrix')) {
      if (typeof Theme !== 'undefined') {
        Theme.set('matrix');
        if (typeof Notify !== 'undefined') Notify.send({ title: 'Theme Activated', message: 'Welcome to the Matrix.', type: 'system' });
      }
    }

    // Refresh + callback
    if (typeof BlueprintsView !== 'undefined' && BlueprintsView._applyFilters) {
      try { BlueprintsView._applyFilters(); } catch {}
    }
    if (_onComplete) try { _onComplete(); } catch {}
  }

  function _wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ── Persist a wizard-created slot character to user_agents ──
     Slot characters created here used to live ONLY in localStorage's
     `nice-custom-agents` with synthetic ids. A localStorage wipe
     stranded `slot_assignments` referencing dangling ids and broke
     every activated ship's dispatch chain (see Falcon dispatch session
     2026-05-07). Mirror the persistence pattern from setup-wizard.js
     and crew-generator.js so signed-in users get a durable Supabase
     row from the start; guests fall through to local-only. */
  // UUID v4 (and other RFC-4122 variants the DB uses for primary keys).
  // Used to decide whether agent.blueprint_id is safe to forward into the
  // user_agents.blueprint_id FK column. The wizard's worker-slot path
  // generates synthetic ids like `the-loft-crew-1` that aren't UUIDs and
  // would error the INSERT; the captain path passes the specialist UUID
  // and must be forwarded.
  //
  // The worker-slot NULL is intentional — those rows are slot characters
  // resolved through the parent ship's crew_overrides, not standalone
  // agents that warrant their own agent_blueprints row. Same pattern as
  // crew-generator.deployFromCatalog. The user-built standalone paths
  // (setup wizard, crew generator's saveAgents, crew designer) call
  // Blueprints.createPrivateAgent which writes the blueprint first.
  const _UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function _isUuid(s) { return typeof s === 'string' && _UUID_RE.test(s); }

  async function _persistSlotAgent(agent) {
    const userId = (typeof State !== 'undefined' && State.get('user') && State.get('user').id) || null;
    if (!userId || typeof SB === 'undefined' || !SB.isReady()) return agent;
    try {
      // Match the row shape used by crew-generator.js and consumed by
      // _loadUserCreations in blueprints.js — config JSONB carries
      // everything except (id, user_id, name, rarity, status, blueprint_id).
      const row = {
        user_id: userId,
        name: agent.name,
        rarity: agent.rarity || 'Common',
        status: agent.status || 'idle',
        config: agent.config || {},
      };
      if (_isUuid(agent.blueprint_id)) row.blueprint_id = agent.blueprint_id;
      const created = await SB.db('user_agents').create(row);
      if (created && created.id) {
        return Object.assign({}, agent, { id: created.id, supabase_id: created.id });
      }
    } catch (err) {
      console.warn('[ShipSetupWizard] user_agents create failed for', agent.name, '— falling back to local-only:', err.message);
    }
    return agent;
  }

  return { open, close, _persistSlotAgent, _isSlotLocked, _unlockRankName };
})();
