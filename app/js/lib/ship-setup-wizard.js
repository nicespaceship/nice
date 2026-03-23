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

  const RARITY_COLORS = { Common:'#94a3b8', Rare:'#6366f1', Epic:'#a855f7', Legendary:'#f59e0b', Mythic:'#ff2d55' };
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
      `<span class="wizard-dot${i === n ? ' active' : ''}${i < n ? ' done' : ''}">${i < n ? '✓' : STEP_LABELS[i]}</span>`
    ).join('');

    renderers[n](body, actions);
  }

  /* ── Helpers ── */
  function _getShipClass() {
    const crewCount = parseInt(_blueprint?.stats?.crew, 10) || 0;
    const slotCount = crewCount > 0 ? crewCount : (typeof Gamification !== 'undefined' ? Gamification.getMaxSlots() : 5);
    return typeof Gamification !== 'undefined'
      ? Gamification.getSlotTemplate(slotCount)
      : { id: 'dynamic', slots: Array.from({ length: slotCount }, function(_, i) { return { id: i, maxRarity: 'Rare', label: 'Agent ' + i }; }), name: 'Ship' };
  }

  function _getAgentCatalog() {
    let agents = [];
    if (typeof BlueprintsView !== 'undefined' && BlueprintsView.SEED) agents = [...BlueprintsView.SEED];
    return agents;
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
    const crew = _blueprint.crew || _blueprint.nodes || [];
    const sc = _getShipClass();
    return crew.slice(0, sc.slots.length);
  }

  /* ═══════════════════════════════════════════════════════════════
     STEP 0 — Name Your Orchestrator
  ═══════════════════════════════════════════════════════════════ */
  function _renderStepName(body, actions) {
    const sc = _getShipClass();
    const bpName = _blueprint.name || 'Orchestrator';
    body.innerHTML = `
      <h2 class="wizard-title">Name Your Orchestrator</h2>
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
    const crew = _blueprint.crew || _blueprint.nodes || [];
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
    const crew = _blueprint.crew || _blueprint.nodes || [];

    let html = '<div class="ship-wizard-slots">';
    for (let i = 0; i < sc.slots.length; i++) {
      const slot = sc.slots[i];
      const compatible = agents
        .filter(a => _canSlot(slot.maxRarity, _agentRarity(a)))
        .sort((a, b) => {
          const ro = { Legendary: 4, Epic: 3, Rare: 2, Common: 1 };
          return (ro[_agentRarity(b)] || 0) - (ro[_agentRarity(a)] || 0);
        });

      // Check both index-based and slot.id-based assignments
      const currentVal = _data.slotAssignments[i] || _data.slotAssignments[slot.id] || '';
      const rarityColor = RARITY_COLORS[slot.maxRarity] || '#888';

      // For auto-created crew, show their name as an option
      const crewMember = crew[i];
      const hasNewAgent = currentVal.startsWith?.('__new__');
      const newAgentName = hasNewAgent ? currentVal.replace('__new__', '') : '';

      html += `<div class="ship-wizard-slot">
        <div class="ship-wizard-slot-info">
          <span class="ship-wizard-slot-label">${_esc(slot.label)}</span>
          <span class="ship-wizard-slot-rarity" style="color:${rarityColor}">${slot.maxRarity}</span>
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
  function _renderAutoFill(container) {
    const sc = _getShipClass();
    const crew = _blueprint.crew || _blueprint.nodes || [];

    if (crew.length > 0) {
      for (let i = 0; i < sc.slots.length; i++) {
        const crewMember = crew[i];
        if (crewMember) {
          _data.slotAssignments[i] = `__new__${crewMember.label}`;
        }
      }
    } else {
      _fallbackAssign();
    }

    _renderSlotDropdowns(container);
  }

  /* ── Manual: empty dropdowns ── */
  function _renderManualCrew(container) {
    _renderSlotDropdowns(container);
  }

  /* ── Fallback: match agents to slots by role/category ── */
  function _fallbackAssign() {
    const sc = _getShipClass();
    const agents = _getAgentCatalog();
    const used = new Set();

    for (let i = 0; i < sc.slots.length; i++) {
      const slot = sc.slots[i];
      const label = (slot.label || '').toLowerCase();
      const match = agents.find(a => {
        if (used.has(a.id)) return false;
        if (!_canSlot(slot.maxRarity, _agentRarity(a))) return false;
        const cat = (a.category || a.config?.role || '').toLowerCase();
        const name = (a.name || '').toLowerCase();
        return cat.includes(label) || name.includes(label) || label.includes(cat);
      });
      if (match) {
        _data.slotAssignments[i] = match.id;
        used.add(match.id);
      } else {
        // No role match — just pick the next compatible agent
        const any = agents.find(a => {
          if (used.has(a.id)) return false;
          return _canSlot(slot.maxRarity, _agentRarity(a));
        });
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
      const crew = _blueprint.crew || _blueprint.nodes || [];
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
          <div class="wizard-success-icon">&#128640;</div>
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
        <button class="btn btn-sm btn-primary" id="ship-wiz-view">View Orchestrator</button>
      `;
      actions.querySelector('#ship-wiz-close').addEventListener('click', close);
      actions.querySelector('#ship-wiz-view').addEventListener('click', () => {
        close();
        localStorage.setItem('nice-mc-ship', 'bp-' + _blueprint.id);
        if (typeof Router !== 'undefined') Router.navigate('#/');
        else location.hash = '#/';
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
    const crew = _blueprint.crew || _blueprint.nodes || [];

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

    // Refresh + callback
    if (typeof BlueprintsView !== 'undefined' && BlueprintsView._applyFilters) {
      try { BlueprintsView._applyFilters(); } catch {}
    }
    if (_onComplete) try { _onComplete(); } catch {}
  }

  function _wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  return { open, close };
})();
