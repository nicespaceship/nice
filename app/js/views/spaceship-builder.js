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
        name: tpl.name || 'Ship',
        slots: tpl.slots.map(s => ({ max: s.maxRarity || 'Epic', label: s.label || 'Crew ' + s.id }))
      };
    }
    return { name: 'Ship', slots: [{ max: 'Mythic', label: 'Bridge' }, { max: 'Legendary', label: 'Ops' }] };
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
        </div>

        <form id="builder-form" class="builder-form">
          <!-- IDENTITY -->
          <fieldset class="builder-section">
            <legend class="builder-legend">Identity</legend>
            <div class="builder-row">
              <div class="auth-field">
                <label for="sb-name">Ship Name</label>
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
            <legend class="builder-legend">Crew Slots</legend>
            <p class="builder-hint">Assign activated agents to crew positions. Each slot has a maximum rarity requirement.</p>
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

    const rarityOrder = { Common: 0, Rare: 1, Epic: 2, Legendary: 3 };

    let assigned = 0;
    grid.innerHTML = cls.slots.map((slot, i) => {
      const agentId = assignments[i] || '';
      if (agentId) assigned++;
      const color = SLOT_COLORS[slot.max] || '#94a3b8';

      // Filter agents by rarity constraint
      const eligible = agents.filter(a => {
        const r = a.rarity || 'Common';
        return (rarityOrder[r] || 0) <= (rarityOrder[slot.max] || 0);
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
      category,
      description: desc,
      flavor,
      tags,
      slot_assignments: slots,
      status: existingShip?.status || 'standby',
      stats: { crew: String(Object.keys(slots).length), slots: String(cls.slots.length) },
      caps: [category + ' operations', cls.slots.length + ' crew slots'],
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
        // Auto-activate the new ship
        if (created?.id && typeof BlueprintStore !== 'undefined') {
          BlueprintStore.activateShip(created.id);
        }
      }
      Router.navigate('#/bridge?tab=spaceship');
    } catch (err) {
      errEl.textContent = err.message || 'Failed to save spaceship.';
      btn.disabled = false;
      btn.textContent = existingShip ? 'Save Changes' : 'Create Spaceship';
    }
  }

  return { title, render };
})();
