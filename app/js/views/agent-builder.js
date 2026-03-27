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
                  <option value="nice-auto" ${(!agent?.llm_engine || agent?.llm_engine === 'nice-auto') ? 'selected' : ''}>NICE Auto (recommended)</option>
                  ${_getAvailableModels().map(m => `<option value="${m.id}" ${!m.available ? 'disabled' : ''} ${agent?.llm_engine === m.id ? 'selected' : ''}>${m.label}${!m.available ? ' (not connected)' : ''}</option>`).join('')}
                </select>
                <p class="builder-hint" id="auto-model-hint" ${(!agent?.llm_engine || agent?.llm_engine === 'nice-auto') ? '' : 'style="display:none"'}>NICE Auto selects the best model based on mission history.</p>
                ${_getConnectedProviders().length === 0 ? '<p class="builder-hint"><a href="#/security?tab=vault">Connect an LLM provider in the Vault</a> to run missions.</p>' : ''}
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

    // Model dropdown — toggle NICE Auto hint
    document.getElementById('b-model')?.addEventListener('change', (e) => {
      const hint = document.getElementById('auto-model-hint');
      if (hint) hint.style.display = e.target.value === 'nice-auto' ? '' : 'none';
    });

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
  { id: 'anthropic',  name: 'Anthropic',  icon: '🟣', color: '#d97706', url: 'https://console.anthropic.com' },
  { id: 'deepseek',   name: 'DeepSeek',   icon: '🧠', color: '#4f46e5', url: 'https://platform.deepseek.com' },
  { id: 'google',     name: 'Google AI',   icon: '🔵', color: '#4285f4', url: 'https://aistudio.google.dev' },
  { id: 'meta',       name: 'Meta AI',     icon: '🦙', color: '#0668E1', url: 'https://llama.developer.meta.com' },
  { id: 'mistral',    name: 'Mistral',     icon: '🟠', color: '#f97316', url: 'https://console.mistral.ai' },
  { id: 'openai',     name: 'OpenAI',      icon: '🟢', color: '#10a37f', url: 'https://platform.openai.com' },
  { id: 'perplexity', name: 'Perplexity',  icon: '🔍', color: '#20b2aa', url: 'https://www.perplexity.ai/settings/api' },
  { id: 'xai',        name: 'xAI',         icon: '⚪', color: '#e5e7eb', url: 'https://console.x.ai' },
];

const LLM_MODELS = [
  { id: 'claude-4-opus',     label: 'Claude Opus 4',     provider: 'anthropic' },
  { id: 'claude-4-sonnet',   label: 'Claude Sonnet 4',   provider: 'anthropic' },
  { id: 'deepseek-chat',     label: 'DeepSeek V3',       provider: 'deepseek' },
  { id: 'deepseek-reasoner', label: 'DeepSeek R1',       provider: 'deepseek' },
  { id: 'gemini-2',          label: 'Gemini 2',          provider: 'google' },
  { id: 'gemini-2-flash',    label: 'Gemini 2 Flash',    provider: 'google' },
  { id: 'llama-4-maverick',  label: 'Llama 4 Maverick',  provider: 'meta' },
  { id: 'llama-4-scout',     label: 'Llama 4 Scout',     provider: 'meta' },
  { id: 'mistral-large',     label: 'Mistral Large',     provider: 'mistral' },
  { id: 'codestral',         label: 'Codestral',         provider: 'mistral' },
  { id: 'gpt-4o',            label: 'GPT-4o',            provider: 'openai' },
  { id: 'gpt-4o-mini',       label: 'GPT-4o Mini',       provider: 'openai' },
  { id: 'sonar-pro',         label: 'Sonar Pro',         provider: 'perplexity' },
  { id: 'sonar',             label: 'Sonar',             provider: 'perplexity' },
  { id: 'grok-3',            label: 'Grok 3',            provider: 'xai' },
  { id: 'grok-3-mini',       label: 'Grok 3 Mini',       provider: 'xai' },
];

function _getConnectedProviders() {
  const connections = State.get('llm_connections') || {};
  return LLM_PROVIDERS.filter(p => connections[p.id]);
}

function _getAvailableModels() {
  const connected = _getConnectedProviders().map(p => p.id);
  return LLM_MODELS.map(m => ({ ...m, available: connected.includes(m.provider) }));
}
