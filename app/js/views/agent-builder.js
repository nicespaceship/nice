/* ═══════════════════════════════════════════════════════════════════
   NICE — Agent Builder View
   No-code agent configuration: name, role, model, tools, memory.
═══════════════════════════════════════════════════════════════════ */

const AgentBuilderView = (() => {
  const title = 'Agent Builder';
  const _esc = Utils.esc;

  /* Models now sourced from global LLM_MODELS — see bottom of file */

  const TOOLS = [
    'Web Search','File Read','File Write','Code Exec','Database','API Call',
    'Email','Slack','GitHub','Calendar','Spreadsheet','Image Gen',
    'PDF Parse','Web Scrape','Shell','Memory Store'
  ];

  const ROLES  = ['Research','Code','Data','Content','Ops','Custom'];
  const TYPES  = ['Specialist','General','Hybrid'];

  function render(el, params) {
    const user = State.get('user');
    if (!user) return _authPrompt(el, 'the agent builder');

    // Check if editing an existing agent (via query param)
    const editId = new URLSearchParams(window.location.hash.split('?')[1] || '').get('edit');

    if (editId) {
      el.innerHTML = `<div class="loading-state"><p>Loading agent...</p></div>`;
      _loadForEdit(el, editId);
    } else {
      _renderForm(el, null);
    }
  }

  async function _loadForEdit(el, id) {
    try {
      const agent = await SB.db('user_agents').get(id);
      _renderForm(el, agent);
    } catch (err) {
      el.innerHTML = `
        <div class="app-empty">
          <h2>Agent Not Found</h2>
          <p>${_esc(err.message)}</p>
          <div class="app-empty-acts"><a href="#/bridge/agents" class="btn btn-sm">Back to Agents</a></div>
        </div>
      `;
    }
  }

  function _renderForm(el, agent) {
    const isEdit = !!agent;
    const config = agent?.config || {};
    const selectedTools = config.tools || [];

    el.innerHTML = `
      <div class="builder-wrap">
        <div class="detail-back">
          <a href="#/bridge/agents" class="btn btn-sm">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-arrow-left"/></svg>
            Back to Agents
          </a>
        </div>

        <div class="builder-header">
          <svg class="builder-header-icon" fill="none" stroke="currentColor" stroke-width="1.2"><use href="#icon-build"/></svg>
          <div>
            <h2 class="builder-title">${isEdit ? 'Edit Agent' : 'Create New Agent'}</h2>
            <p class="builder-sub">Configure your agent's identity, engine, and capabilities.</p>
          </div>
        </div>

        ${!isEdit ? (() => {
          const tmpls = _getTemplates();
          return tmpls.length ? `
            <div class="builder-template-row">
              <label class="builder-template-label">Load Template</label>
              <select id="b-template" class="filter-select builder-select">
                <option value="">Start from scratch</option>
                ${tmpls.map(t => '<option value="' + t.id + '">' + _esc(t.name) + ' (' + _esc(t.role || 'Agent') + ')</option>').join('')}
              </select>
              <button class="btn btn-sm" id="btn-delete-template" type="button">Delete</button>
            </div>
          ` : '';
        })() : ''}

        <form id="builder-form" class="builder-form">
          <!-- IDENTITY -->
          <fieldset class="builder-section">
            <legend class="builder-legend">Identity</legend>
            <div class="builder-row">
              <div class="auth-field">
                <label for="b-name">Agent Name</label>
                <input type="text" id="b-name" required maxlength="40" placeholder="e.g. NOVA, ATLAS, CIPHER" value="${_esc(agent?.name || '')}" />
              </div>
              <div class="auth-field">
                <label for="b-role">Role</label>
                <select id="b-role" class="filter-select builder-select">
                  ${ROLES.map(r => `<option value="${r}" ${agent?.role === r ? 'selected' : ''}>${r}</option>`).join('')}
                </select>
              </div>
              <div class="auth-field">
                <label for="b-type">Type</label>
                <select id="b-type" class="filter-select builder-select">
                  ${TYPES.map(t => `<option value="${t}" ${agent?.type === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
              </div>
            </div>
          </fieldset>

          <!-- ENGINE -->
          <fieldset class="builder-section">
            <legend class="builder-legend">Engine</legend>
            <div class="builder-row">
              <div class="auth-field">
                <label for="b-model">LLM Model</label>
                <select id="b-model" class="filter-select builder-select">
                  ${_getAvailableModels().map(m => `<option value="${m.id}" ${!m.available ? 'disabled' : ''} ${agent?.llm_engine === m.id ? 'selected' : ''}>${m.label}${!m.available ? ' (no key)' : ''}</option>`).join('')}
                </select>
                ${_getConnectedProviders().length === 0 ? '<p class="builder-hint">No LLM providers connected. <a href="#/vault">Add API keys in the Vault</a>.</p>' : ''}
              </div>
              <div class="auth-field">
                <label for="b-temp">Temperature</label>
                <input type="range" id="b-temp" min="0" max="1" step="0.1" value="${config.temperature ?? 0.7}" class="builder-range" />
                <span class="builder-range-val" id="b-temp-val">${config.temperature ?? 0.7}</span>
              </div>
              <div class="auth-field builder-toggle-field">
                <label>Memory</label>
                <button type="button" class="builder-toggle ${config.memory ? 'on' : ''}" id="b-memory" data-val="${config.memory ? '1' : '0'}">
                  <span class="builder-toggle-knob"></span>
                  <span class="builder-toggle-label">${config.memory ? 'ON' : 'OFF'}</span>
                </button>
              </div>
            </div>
          </fieldset>

          <!-- TOOLS -->
          <fieldset class="builder-section">
            <legend class="builder-legend">Tools</legend>
            <p class="builder-hint">Select the tools this agent can access.</p>
            <div class="builder-tools-grid" id="b-tools">
              ${TOOLS.map(t => `
                <label class="builder-tool-chip ${selectedTools.includes(t) ? 'selected' : ''}">
                  <input type="checkbox" value="${t}" ${selectedTools.includes(t) ? 'checked' : ''} />
                  ${t}
                </label>
              `).join('')}
            </div>
          </fieldset>

          <!-- ACTIONS -->
          <div class="builder-actions">
            <div class="auth-error" id="builder-error"></div>
            <button type="submit" class="btn btn-primary" id="builder-submit">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-check"/></svg>
              ${isEdit ? 'Save Changes' : 'Create Agent'}
            </button>
          </div>
        </form>
      </div>
    `;

    _bindForm(agent);
  }

  function _bindForm(agent) {
    const form = document.getElementById('builder-form');
    const tempSlider = document.getElementById('b-temp');
    const tempVal = document.getElementById('b-temp-val');
    const memoryBtn = document.getElementById('b-memory');

    // Temperature slider
    if (tempSlider && tempVal) {
      tempSlider.addEventListener('input', () => { tempVal.textContent = tempSlider.value; });
    }

    // Memory toggle
    if (memoryBtn) {
      memoryBtn.addEventListener('click', () => {
        const isOn = memoryBtn.dataset.val === '1';
        memoryBtn.dataset.val = isOn ? '0' : '1';
        memoryBtn.classList.toggle('on', !isOn);
        memoryBtn.querySelector('.builder-toggle-label').textContent = isOn ? 'OFF' : 'ON';
      });
    }

    // Tool chip selection
    document.querySelectorAll('.builder-tool-chip input').forEach(cb => {
      cb.addEventListener('change', () => {
        cb.parentElement.classList.toggle('selected', cb.checked);
      });
    });

    // Template loading
    document.getElementById('b-template')?.addEventListener('change', (e) => {
      const templates = _getTemplates();
      const tmpl = templates.find(t => t.id === e.target.value);
      if (!tmpl) return;
      document.getElementById('b-name').value = '';
      document.getElementById('b-role').value = tmpl.role || 'Research';
      document.getElementById('b-type').value = tmpl.type || 'Specialist';
      document.getElementById('b-model').value = tmpl.llm_engine || 'claude-4';
      document.getElementById('b-temp').value = tmpl.config?.temperature ?? 0.7;
      if (tempVal) tempVal.textContent = tmpl.config?.temperature ?? 0.7;
      if (memoryBtn) {
        memoryBtn.dataset.val = tmpl.config?.memory ? '1' : '0';
        memoryBtn.classList.toggle('on', !!tmpl.config?.memory);
        memoryBtn.querySelector('.builder-toggle-label').textContent = tmpl.config?.memory ? 'ON' : 'OFF';
      }
      const tools = tmpl.config?.tools || [];
      document.querySelectorAll('#b-tools input[type="checkbox"]').forEach(cb => {
        cb.checked = tools.includes(cb.value);
        cb.parentElement.classList.toggle('selected', cb.checked);
      });
    });

    // Template delete
    document.getElementById('btn-delete-template')?.addEventListener('click', () => {
      const sel = document.getElementById('b-template');
      if (!sel || !sel.value) return;
      const templates = _getTemplates().filter(t => t.id !== sel.value);
      localStorage.setItem('nice-agent-templates', JSON.stringify(templates));
      sel.querySelector('option[value="' + sel.value + '"]')?.remove();
      sel.value = '';
    });

    // Submit
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        _submitAgent(agent);
      });
    }
  }

  function _getTemplates() {
    try { return JSON.parse(localStorage.getItem('nice-agent-templates') || '[]'); }
    catch { return []; }
  }

  async function _submitAgent(existingAgent) {
    const errEl = document.getElementById('builder-error');
    const btn   = document.getElementById('builder-submit');
    errEl.textContent = '';
    btn.disabled = true;
    btn.textContent = existingAgent ? 'Saving...' : 'Creating...';

    const user = State.get('user');
    const name  = document.getElementById('b-name').value.trim();
    const role  = document.getElementById('b-role').value;
    const type  = document.getElementById('b-type').value;
    const model = document.getElementById('b-model').value;
    const temp  = parseFloat(document.getElementById('b-temp').value);
    const memory = document.getElementById('b-memory').dataset.val === '1';
    const tools = [...document.querySelectorAll('#b-tools input:checked')].map(cb => cb.value);

    if (!name) {
      errEl.textContent = 'Agent name is required.';
      btn.disabled = false;
      btn.textContent = existingAgent ? 'Save Changes' : 'Create Agent';
      return;
    }

    const row = {
      name,
      role,
      type,
      llm_engine: model,
      status: existingAgent?.status || 'idle',
      config: { tools, memory, temperature: temp },
    };

    try {
      if (existingAgent) {
        await SB.db('user_agents').update(existingAgent.id, row);
      } else {
        row.user_id = user.id;
        await SB.db('user_agents').create(row);
        if (typeof Gamification !== 'undefined') {
          Gamification.addXP('create_agent');
          Gamification.checkAchievements();
        }
      }
      Router.navigate('#/bridge/agents');
    } catch (err) {
      errEl.textContent = err.message || 'Failed to save agent.';
      btn.disabled = false;
      btn.textContent = existingAgent ? 'Save Changes' : 'Create Agent';
    }
  }

  return { title, render };
})();

/* ── LLM Provider / Model Registry (shared across views) ── */
const LLM_PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', vaultKey: 'ANTHROPIC_API_KEY', icon: '🟣', color: '#d97706' },
  { id: 'openai',    name: 'OpenAI',    vaultKey: 'OPENAI_API_KEY',    icon: '🟢', color: '#10a37f' },
  { id: 'google',    name: 'Google AI',  vaultKey: 'GOOGLE_AI_KEY',     icon: '🔵', color: '#4285f4' },
];

const LLM_MODELS = [
  { id: 'claude-4',        label: 'Claude 4 Opus',     provider: 'anthropic' },
  { id: 'claude-3.5',      label: 'Claude 3.5 Sonnet', provider: 'anthropic' },
  { id: 'gpt-4o',          label: 'GPT-4o',            provider: 'openai' },
  { id: 'gpt-4o-mini',     label: 'GPT-4o Mini',       provider: 'openai' },
  { id: 'gemini-2',        label: 'Gemini 2',          provider: 'google' },
  { id: 'gemini-1.5-pro',  label: 'Gemini 1.5 Pro',    provider: 'google' },
];

function _getConnectedProviders() {
  const secrets = State.get('vault_secrets') || [];
  return LLM_PROVIDERS.filter(p =>
    secrets.some(s => s.name === p.vaultKey && s.status === 'active')
  );
}

function _getAvailableModels() {
  const connected = _getConnectedProviders().map(p => p.id);
  return LLM_MODELS.map(m => ({ ...m, available: connected.includes(m.provider) }));
}
