/* ═══════════════════════════════════════════════════════════════════
   NICE — Spaceship Builder View
   No-code spaceship configuration: name, class, crew slots.
═══════════════════════════════════════════════════════════════════ */

const SpaceshipBuilderView = (() => {
  const title = 'Spaceship Builder';
  const _esc = Utils.esc;

  const CATEGORIES = ['Research','Analytics','Content','Engineering','Ops','Sales','Support','Legal','Marketing','Automation','Custom'];

  /** Slots are determined by XP rank via Gamification.getSlotTemplate() */
  function _getSlotConfig() {
    if (typeof Gamification !== 'undefined' && Gamification.getSlotTemplate) {
      const tpl = Gamification.getSlotTemplate();
      return {
        name: tpl.name || 'Spaceship',
        slots: tpl.slots.map(s => ({ max: s.maxRarity || 'Common', label: s.label || 'Crew ' + s.id }))
      };
    }
    return { name: 'Spaceship', slots: [{ max: 'Common', label: 'Bridge' }, { max: 'Common', label: 'Ops' }] };
  }

  const SLOT_COLORS = BlueprintUtils.RARITY_COLORS;

  function render(el) {
    const user = State.get('user');
    if (!user) return _authPrompt(el, 'the spaceship builder');

    const editId = new URLSearchParams(window.location.hash.split('?')[1] || '').get('edit');
    if (editId) {
      el.innerHTML = '<div class="loading-state"><p>Loading spaceship...</p></div>';
      _loadForEdit(el, editId);
    } else {
      _renderForm(el, null);
    }
  }

  async function _loadForEdit(el, id) {
    try {
      const ship = await SB.db('user_spaceships').get(id);
      _renderForm(el, ship);
    } catch (err) {
      el.innerHTML = `
        <div class="app-empty">
          <h2>Spaceship Not Found</h2>
          <p>${_esc(err.message)}</p>
          <div class="app-empty-acts"><a href="#/bridge?tab=spaceship" class="btn btn-sm">Back to Blueprints</a></div>
        </div>`;
    }
  }

  function _renderForm(el, ship) {
    const isEdit = !!ship;
    const slotConfig = _getSlotConfig();

    el.innerHTML = `
      <div class="builder-wrap">
        <div class="detail-back">
          <a href="#/bridge?tab=spaceship" class="btn btn-sm">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-arrow-left"/></svg>
            Back to Blueprints
          </a>
        </div>

        <div class="builder-header">
          <svg class="builder-header-icon" fill="currentColor" stroke="none" style="width:28px;height:28px"><use href="#icon-spaceship"/></svg>
          <div>
            <h2 class="builder-title">${isEdit ? 'Edit Spaceship' : 'Create New Spaceship'}</h2>
            <p class="builder-sub">Configure your spaceship's identity and crew assignments. Slots are determined by your rank (${slotConfig.slots.length} available).</p>
          </div>
          <div class="builder-header-actions">
            <button type="button" class="btn btn-sm" id="btn-view-md" title="View as text">View as Text</button>
            <button type="button" class="btn btn-sm" id="btn-import-md" title="Import blueprint from text">Import</button>
          </div>
        </div>

        <form id="builder-form" class="builder-form">
          <!-- IDENTITY -->
          <fieldset class="builder-section">
            <legend class="builder-legend">Identity</legend>
            <div class="builder-row">
              <div class="auth-field">
                <label for="sb-name">Name</label>
                <input type="text" id="sb-name" required maxlength="40" placeholder="e.g. AURORA, VANGUARD, NEXUS" value="${_esc(ship?.name || '')}" />
              </div>
              <div class="auth-field">
                <label for="sb-category">Category</label>
                <select id="sb-category" class="filter-select builder-select">
                  ${CATEGORIES.map(c => `<option value="${c}" ${ship?.category === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
              </div>
            </div>
          </fieldset>

          <!-- DETAILS -->
          <fieldset class="builder-section">
            <legend class="builder-legend">Details</legend>
            <div class="builder-row">
              <div class="auth-field" style="grid-column:1/-1">
                <label for="sb-desc">Description</label>
                <textarea id="sb-desc" rows="2" placeholder="What does this spaceship do?" style="width:100%;resize:vertical;background:var(--bg-alt);border:1px solid var(--border);color:var(--text);padding:8px;font-family:var(--font-b);font-size:.82rem">${_esc(ship?.description || ship?.desc || '')}</textarea>
              </div>
              <div class="auth-field">
                <label for="sb-flavor">Tagline</label>
                <input type="text" id="sb-flavor" maxlength="60" placeholder="e.g. Ship faster. Scale smarter." value="${_esc(ship?.flavor || '')}" />
              </div>
              <div class="auth-field">
                <label for="sb-tags">Tags</label>
                <input type="text" id="sb-tags" placeholder="Comma-separated: saas, startup, tech" value="${_esc((ship?.tags || []).join(', '))}" />
              </div>
            </div>
          </fieldset>

          <!-- CREW SLOTS -->
          <fieldset class="builder-section">
            <legend class="builder-legend">Agent Slots</legend>
            <p class="builder-hint">Assign activated agents to slots. Each slot has a maximum rarity requirement.</p>
            <div class="builder-slot-grid" id="sb-slots"></div>
            <p class="builder-hint" id="sb-slot-count" style="margin-top:8px"></p>
          </fieldset>

          <!-- ACTIONS -->
          <div class="builder-actions">
            <div class="auth-error" id="builder-error"></div>
            <button type="submit" class="btn btn-primary" id="builder-submit">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-check"/></svg>
              ${isEdit ? 'Save Changes' : 'Create Spaceship'}
            </button>
          </div>
        </form>

        <!-- Markdown Editor -->
        <div id="builder-md-editor" class="builder-md-editor" style="display:none">
          <div class="builder-md-toolbar">
            <button type="button" class="btn btn-sm" id="btn-md-back">Back to Form</button>
            <button type="button" class="btn btn-sm" id="btn-md-copy">Copy</button>
            <button type="button" class="btn btn-sm" id="btn-md-download">Download Blueprint</button>
          </div>
          <textarea id="builder-md-textarea" class="builder-md-textarea" spellcheck="false"></textarea>
          <div id="builder-md-status" class="builder-md-status"></div>
        </div>

        <!-- Import Modal -->
        <div id="builder-import-modal" class="builder-import-modal" style="display:none">
          <div class="builder-import-content">
            <h3>Import Spaceship Blueprint</h3>
            <textarea id="import-md-textarea" class="builder-md-textarea" spellcheck="false" placeholder="Paste blueprint text here..."></textarea>
            <div id="import-md-status" class="builder-md-status"></div>
            <div class="builder-actions-row">
              <button type="button" class="btn btn-primary" id="btn-import-confirm">Import</button>
              <button type="button" class="btn btn-sm" id="btn-import-cancel">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `;

    _renderSlots(ship?.slot_assignments || {});
    _bindForm(ship);
  }

  function _renderSlots(assignments) {
    const cls = _getSlotConfig();
    const grid = document.getElementById('sb-slots');
    const countEl = document.getElementById('sb-slot-count');
    if (!grid) return;

    // Get activated agents for dropdown
    const agents = (typeof BlueprintStore !== 'undefined' && BlueprintStore.getActivatedAgents)
      ? BlueprintStore.getActivatedAgents() : [];

    let assigned = 0;
    grid.innerHTML = cls.slots.map((slot, i) => {
      const agentId = assignments[i] || '';
      if (agentId) assigned++;
      const color = SLOT_COLORS[slot.max] || '#94a3b8';

      // Filter agents by rarity constraint — delegate to BlueprintUtils SSOT
      const eligible = agents.filter(a => {
        const r = a.rarity || 'Common';
        return BlueprintUtils.isRarityCompatible(r, slot.max);
      });

      return `
        <div class="builder-slot-card ${agentId ? 'builder-slot-assigned' : ''}">
          <div class="builder-slot-header">
            <span class="builder-slot-label">${slot.label}</span>
            <span class="builder-slot-rarity" style="color:${color};border-color:${color}">${slot.max}</span>
          </div>
          <select class="filter-select builder-select builder-slot-select" data-slot="${i}">
            <option value="">— Empty —</option>
            ${eligible.map(a => `<option value="${a.id}" ${agentId === a.id ? 'selected' : ''}>${_esc(a.name)} (${a.rarity || 'Common'})</option>`).join('')}
          </select>
        </div>`;
    }).join('');

    if (countEl) countEl.textContent = `${assigned}/${cls.slots.length} slots assigned`;
  }

  function _bindForm(ship) {
    const form = document.getElementById('builder-form');

    _bindSlotEvents();

    // Submit
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        _submitShip(ship);
      });
    }

    // ── Markdown toggle ──
    document.getElementById('btn-view-md')?.addEventListener('click', () => {
      const bp = _formToBlueprint(ship);
      const md = BlueprintMarkdown.serialize(bp);
      document.getElementById('builder-md-textarea').value = md;
      document.getElementById('builder-form').style.display = 'none';
      document.getElementById('builder-md-editor').style.display = '';
      _updateMdStatus('builder-md-status', md);
    });

    document.getElementById('btn-md-back')?.addEventListener('click', () => {
      const md = document.getElementById('builder-md-textarea').value;
      const v = BlueprintMarkdown.validate(md);
      if (v.valid) {
        const bp = BlueprintMarkdown.parse(md);
        _populateForm(bp);
      }
      document.getElementById('builder-md-editor').style.display = 'none';
      document.getElementById('builder-form').style.display = '';
    });

    document.getElementById('btn-md-copy')?.addEventListener('click', () => {
      navigator.clipboard.writeText(document.getElementById('builder-md-textarea').value).then(() => {
        if (typeof Notify !== 'undefined') Notify.send('Copied to clipboard', 'success');
      });
    });

    document.getElementById('btn-md-download')?.addEventListener('click', () => {
      const ta = document.getElementById('builder-md-textarea');
      const name = (document.getElementById('sb-name')?.value || 'spaceship').toLowerCase().replace(/\s+/g, '-');
      const blob = new Blob([ta.value], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name + '.md';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    document.getElementById('builder-md-textarea')?.addEventListener('input', _debounce(() => {
      _updateMdStatus('builder-md-status', document.getElementById('builder-md-textarea').value);
    }, 300));

    // ── Import modal ──
    document.getElementById('btn-import-md')?.addEventListener('click', () => {
      document.getElementById('import-md-textarea').value = '';
      document.getElementById('import-md-status').textContent = '';
      document.getElementById('builder-import-modal').style.display = '';
    });

    document.getElementById('btn-import-cancel')?.addEventListener('click', () => {
      document.getElementById('builder-import-modal').style.display = 'none';
    });

    document.getElementById('import-md-textarea')?.addEventListener('input', _debounce(() => {
      _updateMdStatus('import-md-status', document.getElementById('import-md-textarea').value);
    }, 300));

    document.getElementById('btn-import-confirm')?.addEventListener('click', () => {
      const md = document.getElementById('import-md-textarea').value;
      const v = BlueprintMarkdown.validate(md);
      if (!v.valid) {
        document.getElementById('import-md-status').textContent = v.errors.join('; ');
        return;
      }
      const bp = BlueprintMarkdown.parse(md);
      _populateForm(bp);
      document.getElementById('builder-import-modal').style.display = 'none';
      if (typeof Notify !== 'undefined') Notify.send('Blueprint imported', 'success');
    });
  }

  function _bindSlotEvents() {
    document.querySelectorAll('.builder-slot-select').forEach(sel => {
      sel.addEventListener('change', () => {
        sel.closest('.builder-slot-card')?.classList.toggle('builder-slot-assigned', !!sel.value);
        const cls = _getSlotConfig();
        const assigned = document.querySelectorAll('.builder-slot-select').length
          ? [...document.querySelectorAll('.builder-slot-select')].filter(s => s.value).length : 0;
        const countEl = document.getElementById('sb-slot-count');
        if (countEl) countEl.textContent = `${assigned}/${cls.slots.length} slots assigned`;
      });
    });
  }

  function _getSlotAssignments() {
    const assignments = {};
    document.querySelectorAll('.builder-slot-select').forEach(sel => {
      if (sel.value) assignments[sel.dataset.slot] = sel.value;
    });
    return assignments;
  }

  async function _submitShip(existingShip) {
    const errEl = document.getElementById('builder-error');
    const btn   = document.getElementById('builder-submit');
    errEl.textContent = '';
    btn.disabled = true;
    btn.textContent = existingShip ? 'Saving...' : 'Creating...';

    const user = State.get('user');
    const name     = document.getElementById('sb-name').value.trim();
    const category = document.getElementById('sb-category').value;
    const desc     = document.getElementById('sb-desc').value.trim();
    const flavor   = document.getElementById('sb-flavor').value.trim();
    const tags     = document.getElementById('sb-tags').value.split(',').map(t => t.trim()).filter(Boolean);
    const slots    = _getSlotAssignments();

    if (!name) {
      errEl.textContent = 'Ship name is required.';
      btn.disabled = false;
      btn.textContent = existingShip ? 'Save Changes' : 'Create Spaceship';
      return;
    }

    const cls = _getSlotConfig();
    const row = {
      name,
      status: existingShip?.status || 'standby',
      slots: {
        category,
        description: desc,
        flavor,
        tags,
        slot_assignments: slots,
        stats: { crew: String(Object.keys(slots).length), slots: String(cls.slots.length) },
        caps: [category + ' operations', cls.slots.length + ' agent slots'],
      },
    };

    try {
      if (existingShip) {
        await SB.db('user_spaceships').update(existingShip.id, row);
      } else {
        row.user_id = user.id;
        const created = await SB.db('user_spaceships').create(row);
        if (typeof Gamification !== 'undefined') {
          Gamification.addXP('launch_spaceship');
          Gamification.checkAchievements();
        }
        // Add to State so BlueprintStore can find it, then activate
        if (created?.id) {
          const shipObj = {
            id: created.id, name, category, description: desc, flavor, tags, type: 'spaceship',
            rarity: 'Common', status: 'standby',
            config: { slot_assignments: slots },
            stats: { crew: String(Object.keys(slots).length), slots: String(cls.slots.length) },
            metadata: { caps: [category + ' operations', cls.slots.length + ' agent slots'] },
          };
          const ships = State.get('spaceships') || [];
          ships.push(shipObj);
          State.set('spaceships', ships);
          if (typeof BlueprintStore !== 'undefined') BlueprintStore.activateShip(created.id);

          // Show crew setup choice (AI Auto Setup vs Manual vs Skip)
          _showSetupChoice(created.id, { name, category, description: desc, flavor, tags, slotCount: cls.slots.length, slots: row.slots });
          return;
        }
      }
      Router.navigate('#/bridge?tab=spaceship');
    } catch (err) {
      errEl.textContent = err.message || 'Failed to save spaceship.';
      btn.disabled = false;
      btn.textContent = existingShip ? 'Save Changes' : 'Create Spaceship';
    }
  }

  /** Show crew setup choice modal after spaceship creation */
  function _showSetupChoice(shipId, shipData) {
    // Remove any existing modal
    document.getElementById('crew-setup-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'crew-setup-modal';
    modal.className = 'builder-import-modal';
    modal.innerHTML = `
      <div class="crew-setup-content">
        <h2 class="crew-setup-title">${Utils.esc(shipData.name)} Created</h2>
        <p class="crew-setup-sub">How would you like to set up your crew?</p>

        <div class="crew-setup-options">
          <button class="crew-setup-option crew-setup-recommended" id="btn-ai-setup">
            <span class="crew-setup-icon">&#9733;</span>
            <span class="crew-setup-label">AI Auto Setup</span>
            <span class="crew-setup-desc">Let NICE design ${shipData.slotCount} agents tailored to your business</span>
          </button>
          <button class="crew-setup-option" id="btn-manual-setup">
            <span class="crew-setup-icon">&#9881;</span>
            <span class="crew-setup-label">Manual Setup</span>
            <span class="crew-setup-desc">Choose agents yourself from the blueprint catalog</span>
          </button>
          <button class="crew-setup-option" id="btn-skip-setup">
            <span class="crew-setup-icon">&#8594;</span>
            <span class="crew-setup-label">Skip for Now</span>
            <span class="crew-setup-desc">Set up crew later from the Schematic view</span>
          </button>
        </div>

        <div id="crew-setup-status" class="crew-setup-status" style="display:none">
          <div class="crew-setup-spinner"></div>
          <p id="crew-setup-msg">Generating your crew...</p>
        </div>
      </div>`;
    document.body.appendChild(modal);

    // AI Auto Setup
    document.getElementById('btn-ai-setup').addEventListener('click', async () => {
      const optionsEl = modal.querySelector('.crew-setup-options');
      const statusEl = document.getElementById('crew-setup-status');
      const msgEl = document.getElementById('crew-setup-msg');
      optionsEl.style.display = 'none';
      statusEl.style.display = '';
      msgEl.textContent = 'Analyzing your business...';

      try {
        // Generate agents via AI
        const result = await CrewGenerator.generate(shipData);
        if (result.error || !result.agents.length) {
          msgEl.textContent = result.error || 'Failed to generate agents. Try manual setup.';
          setTimeout(() => { optionsEl.style.display = ''; statusEl.style.display = 'none'; }, 2000);
          return;
        }

        msgEl.textContent = 'Creating ' + result.agents.length + ' agents...';

        // Save and assign
        const saved = await CrewGenerator.saveAndAssign(shipId, result.agents, { slots: shipData.slots || {} });
        if (!saved.savedAgents.length) {
          msgEl.textContent = 'Failed to save agents. Try manual setup.';
          setTimeout(() => { optionsEl.style.display = ''; statusEl.style.display = 'none'; }, 2000);
          return;
        }

        msgEl.textContent = saved.savedAgents.length + ' agents deployed!';
        if (typeof Notify !== 'undefined') {
          Notify.send(saved.savedAgents.length + ' agents created for ' + shipData.name, 'success');
        }

        setTimeout(() => {
          modal.remove();
          Router.navigate('#/bridge');
        }, 1200);
      } catch (e) {
        msgEl.textContent = 'Error: ' + (e.message || 'Unknown error');
        setTimeout(() => { optionsEl.style.display = ''; statusEl.style.display = 'none'; }, 2000);
      }
    });

    // Manual Setup → go to Bridge Blueprints/Agents tab
    document.getElementById('btn-manual-setup').addEventListener('click', () => {
      modal.remove();
      Router.navigate('#/bridge?tab=agent');
    });

    // Skip → go to Schematic
    document.getElementById('btn-skip-setup').addEventListener('click', () => {
      modal.remove();
      Router.navigate('#/bridge');
    });
  }

  function _debounce(fn, ms) { let t; return function() { clearTimeout(t); t = setTimeout(fn, ms); }; }

  /** Build a blueprint object from the current form state */
  function _formToBlueprint(ship) {
    const name     = document.getElementById('sb-name')?.value?.trim() || '';
    const category = document.getElementById('sb-category')?.value || '';
    const desc     = document.getElementById('sb-desc')?.value?.trim() || '';
    const flavor   = document.getElementById('sb-flavor')?.value?.trim() || '';
    const tags     = (document.getElementById('sb-tags')?.value || '').split(',').map(t => t.trim()).filter(Boolean);
    const slots    = _getSlotAssignments();
    const cls      = _getSlotConfig();

    return {
      type: 'spaceship',
      name: name,
      category: category,
      description: desc,
      flavor: flavor,
      tags: tags,
      rarity: ship?.rarity || '',
      serial_key: ship?.serial_key || '',
      config: { slot_assignments: slots },
      stats: { crew: String(Object.keys(slots).length), slots: String(cls.slots.length) },
      metadata: {
        recommended_class: ship?.metadata?.recommended_class || '',
        caps: ship?.metadata?.caps || [category + ' operations'],
        crew: Object.keys(slots).map(s => ({
          slot: parseInt(s, 10),
          role: cls.slots[parseInt(s, 10)]?.label || 'Crew ' + s,
          agent: slots[s],
        })),
      },
    };
  }

  /** Populate the form from a parsed blueprint */
  function _populateForm(bp) {
    const el = (id) => document.getElementById(id);
    if (el('sb-name')) el('sb-name').value = bp.name || '';
    if (el('sb-category')) el('sb-category').value = bp.category || 'Research';
    if (el('sb-desc')) el('sb-desc').value = bp.description || '';
    if (el('sb-flavor')) el('sb-flavor').value = bp.flavor || '';
    if (el('sb-tags')) el('sb-tags').value = (bp.tags || []).join(', ');

    // Re-render slots with imported assignments
    const assignments = (bp.config && bp.config.slot_assignments) || {};
    _renderSlots(assignments);
    _bindSlotEvents();
  }

  /** Show validation status for markdown textarea */
  function _updateMdStatus(elId, md) {
    const statusEl = document.getElementById(elId);
    if (!statusEl || !md) return;
    const v = BlueprintMarkdown.validate(md);
    if (!v.valid) {
      statusEl.textContent = v.errors.join('; ');
      statusEl.className = 'builder-md-status error';
    } else if (v.warnings.length) {
      statusEl.textContent = v.warnings.join('; ');
      statusEl.className = 'builder-md-status warn';
    } else {
      statusEl.textContent = 'Valid blueprint';
      statusEl.className = 'builder-md-status ok';
    }
  }

  return { title, render };
})();
