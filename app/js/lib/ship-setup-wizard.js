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
    _data.agentMode = '';
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

  function _getAgentCatalog() {
    // Prefer BlueprintStore (full 261 agents from DB) over small static SEED
    if (typeof BlueprintStore !== 'undefined' && BlueprintStore.listAgents) {
      const all = BlueprintStore.listAgents();
      if (all.length) return [...all];
    }
    if (typeof BlueprintsView !== 'undefined' && BlueprintsView.SEED && BlueprintsView.SEED.length) return [...BlueprintsView.SEED];
    return [];
  }

  /** Ensure catalog is loaded before rendering dropdowns */
  async function _ensureCatalog() {
    if (typeof BlueprintStore !== 'undefined' && BlueprintStore.ensureCatalogLoaded) {
      await BlueprintStore.ensureCatalogLoaded();
    }
  }

  function _canSlot(slotMaxRarity, agentRarity) {
    return typeof Gamification !== 'undefined'
      ? Gamification.canSlotAccept(slotMaxRarity, agentRarity)
      : true;
  }

  function _agentRarity(agent) {
    if (agent.rarity) return agent.rarity;
    if (typeof Gamification !== 'undefined') return Gamification.calcAgentRarity(agent);
    return 'Common';
  }

  function _getCrewForClass() {
    const crew = _getCrewDefs();
    return crew.slice(0, _getSlotCount());
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
    const displayName = _data.shipName || _blueprint.name;
    const crew = _getCrewDefs();
    const hasCrewDefs = crew.length > 0;

    body.innerHTML = `
      <h2 class="wizard-title">Assign Your Agents</h2>
      <p class="wizard-subtitle">Fill ${slotCount} agent slots on <strong>${_esc(displayName)}</strong></p>
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

    let html = '<div class="ship-wizard-slots">';
    for (let i = 0; i < sc.slots.length; i++) {
      const slot = sc.slots[i];
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
    const unfilled = sc.slots.length - filledCount;
    if (unfilled > 0) {
      html += `<div class="ship-wizard-analysis" style="margin-top:8px"><em>${unfilled} unfilled slot${unfilled > 1 ? 's' : ''} will be auto-created on deploy.</em></div>`;
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
    if (crew.length > 0) {
      for (let i = 0; i < sc.slots.length; i++) {
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

  /* ── Fallback: match agents to slots by role/category ── */
  function _fallbackAssign() {
    const sc = _getShipClass();
    const agents = _getAgentCatalog();
    const shipRarity = _blueprint.rarity || 'Common';
    const used = new Set();

    for (let i = 0; i < sc.slots.length; i++) {
      // Skip slots that already have assignments (e.g. from blueprint crew)
      if (_data.slotAssignments[i]) continue;

      const slot = sc.slots[i];
      const label = (slot.label || '').toLowerCase();
      const match = agents.find(a => {
        if (used.has(a.id)) return false;
        if (!_canSlot(shipRarity, _agentRarity(a))) return false;
        const cat = (a.category || a.config?.role || '').toLowerCase();
        const name = (a.name || '').toLowerCase();
        return cat.includes(label) || name.includes(label) || label.includes(cat);
      });
      if (match) {
        _data.slotAssignments[i] = match.id;
        used.add(match.id);
      } else {
        const any = agents.find(a => !used.has(a.id) && _canSlot(shipRarity, _agentRarity(a)));
        if (any) {
          _data.slotAssignments[i] = any.id;
          used.add(any.id);
        }
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

      body.innerHTML = `
        <div class="wizard-success">
          <div class="wizard-success-icon"><svg width="48" height="48" viewBox="0 0 1240.37 1240.21" fill="currentColor"><path d="M962.08,762.91c-3.6,3.81-23,22.39-23.4,25.12s1.65,9.46,1.81,12.8c6.2,134.27-22.47,251.36-96.57,363.41-10.14,15.32-44.07,64.4-57.7,72.3-10.64,6.16-17.08,4.1-26.74-2.68l-205.91-206.08-2.61-1.47c-13.79,3.14-27.33,7.97-41.2,10.78-12.14,2.46-39.23,7.32-50.52,5.02-5.43-1.11-8.8-8.83-13.02-7.63-56.83,48.42-130.21,76.33-203.49,88.59-23.32,3.9-79.67,11.72-100.43,4.99-28.92-9.37-32.15-31.74-31.74-58.17,1.36-87.99,28.47-185.28,80.14-256.85,2.24-3.1,15.39-18.18,15.71-19.38.7-2.69-7.89-8.08-8.8-14.88-1.33-9.98,3.07-34.86,5.18-45.64,2.91-14.86,7.64-29.47,11.6-44.06L6.97,481.35c-6.58-10.16-9.77-14.46-3.86-25.92,4.89-9.48,28.96-27.24,38.49-34.51,113.03-86.2,243.65-127.64,386.44-121.64,5.01.21,23.34,2.94,26.44,1.52,117.49-117.68,260.78-215.29,420.81-265.18,95.99-29.93,217.05-45.19,316.54-29.13,13.03,2.1,32.43,2.67,37.16,16.84,5.97,17.89,9.64,56.02,10.55,75.45,12,255.12-107.2,483.74-277.46,664.12ZM842.3,261.63c-101.28,8.13-152.88,125.4-90.22,205.62,56.08,71.8,169.37,61.28,211.94-18.9,46.73-88.01-22.45-194.69-121.72-186.72ZM276.84,862.98c-1.02-.92-3.11-5.35-5.37-4.22-.87.43-8.43,11.31-9.79,13.25-32.97,47.21-49,105.67-56.19,162.31,1.77,1.77,42.17-6.13,48.04-7.46,31.2-7.03,64.74-18.77,92.63-34.37,4.52-2.53,34.5-21.3,35.27-23.8.34-1.12-.09-2.12-.89-2.92-35.52-32.96-67.86-70.35-103.71-102.79Z"/></svg></div>
          <h2 class="wizard-title">${_esc(_data.shipName || _blueprint.name)} is Deployed!</h2>
          <p class="wizard-subtitle">${filledCount} of ${sc.slots.length} agent stations filled.</p>
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
        localStorage.setItem('nice-mc-ship', 'bp-' + _blueprint.id);
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
    if (statusEl) statusEl.textContent = 'Activating blueprint...';
    if (typeof BlueprintStore !== 'undefined') {
      BlueprintStore.activateShip(_blueprint.id);
    }
    await _wait(400);

    // 2. Save slot assignments
    if (statusEl) statusEl.textContent = 'Assigning agents to stations...';
    const shipStateId = 'bp-' + _blueprint.id;
    const agentIds = Object.values(_data.slotAssignments).filter(Boolean);
    if (typeof BlueprintStore !== 'undefined') {
      BlueprintStore.saveShipState(shipStateId, {
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
    if (typeof BlueprintStore !== 'undefined') {
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
            BlueprintStore.activateAgent(seedBp.id);
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
            const newAgent = {
              id: `agent-${Date.now()}-${i}`,
              name: agentName,
              category: crewMember?.config?.agentRole || 'Ops',
              rarity: crewMember?.rarity || 'Common',
              config: crewMember?.config || { role: agentName, type: 'Agent', llm_engine: 'claude-4', tools: [] },
              stats: { spd: '3.0s', acc: '92%', cap: '5K', pwr: '75' },
              tags: [], activated: true,
              flavor: `Auto-created for ${_data.shipName || _blueprint.name}.`,
            };
            resolvedId = newAgent.id;
            BlueprintStore.activateAgent(newAgent.id);
            if (typeof State !== 'undefined') {
              const agents = State.get('agents') || [];
              agents.push(newAgent);
              State.set('agents', agents);
            }
            try {
              const stored = JSON.parse(localStorage.getItem('nice-custom-agents') || '[]');
              stored.push(newAgent);
              localStorage.setItem('nice-custom-agents', JSON.stringify(stored));
            } catch {}
          }

          resolvedAgentIds.push(resolvedId);
          const slotIdx = Object.entries(_data.slotAssignments).find(([, v]) => v === aid)?.[0];
          if (slotIdx !== undefined) _data.slotAssignments[parseInt(slotIdx, 10)] = resolvedId;
        } else if (aid) {
          if (!BlueprintStore.isAgentActivated(aid)) {
            BlueprintStore.activateAgent(aid);
          }
          resolvedAgentIds.push(aid);
        }
      }

      // Auto-create agents for unfilled slots
      for (let i = 0; i < sc.slots.length; i++) {
        if (_data.slotAssignments[i]) continue;
        const slot = sc.slots[i];
        const crewMember = crew[i];
        const agentName = crewMember?.label || `${slot.label} Agent`;
        const newAgent = {
          id: `agent-${Date.now()}-auto-${i}`,
          name: agentName,
          category: crewMember?.config?.agentRole || slot.label,
          rarity: crewMember?.rarity || 'Common',
          config: crewMember?.config || { role: slot.label, type: 'Agent', llm_engine: 'claude-4', tools: [] },
          stats: { spd: '3.0s', acc: '90%', cap: '3K', pwr: '70' },
          tags: [], activated: true,
          flavor: `Auto-created for ${slot.label} station.`,
        };
        BlueprintStore.activateAgent(newAgent.id);
        if (typeof State !== 'undefined') {
          const agents = State.get('agents') || [];
          agents.push(newAgent);
          State.set('agents', agents);
        }
        try {
          const stored = JSON.parse(localStorage.getItem('nice-custom-agents') || '[]');
          stored.push(newAgent);
          localStorage.setItem('nice-custom-agents', JSON.stringify(stored));
        } catch {}
        _data.slotAssignments[i] = newAgent.id;
        resolvedAgentIds.push(newAgent.id);
      }
    }
    await _wait(300);

    // Re-save with resolved agent IDs
    if (resolvedAgentIds.length && typeof BlueprintStore !== 'undefined') {
      BlueprintStore.saveShipState(shipStateId, {
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

  return { open, close };
})();
