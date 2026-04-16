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
    // Guest mode: allow building agents without sign-in (saves to localStorage)

    // Check if editing an existing agent (via query param)
    const editId = new URLSearchParams(window.location.hash.split('?')[1] || '').get('edit');

    if (editId) {
      el.innerHTML = `<div class="loading-state"><p>Loading agent...</p></div>`;
      _loadForEdit(el, editId);
    } else {
      _renderForm(el, null);
      // Check for imported blueprint from Bridge
      const importJson = sessionStorage.getItem(Utils.KEYS.importBp);
      if (importJson) {
        sessionStorage.removeItem(Utils.KEYS.importBp);
        try { const bp = JSON.parse(importJson); if (bp.type === 'agent' || !bp.type) _populateForm(bp); } catch(e) {}
      }
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

  /* ── Helpers for schema/examples editors ── */
  function _serializeSchema(schema) {
    if (!schema || typeof schema !== 'object') return '';
    try { return JSON.stringify(schema, null, 2); } catch { return ''; }
  }
  function _exampleRowHTML(input, output) {
    return `
      <div class="b-example-pair">
        <textarea class="b-ex-input" rows="2" placeholder="Input">${_esc(input || '')}</textarea>
        <textarea class="b-ex-output" rows="2" placeholder="Output">${_esc(output || '')}</textarea>
        <button type="button" class="btn btn-sm b-ex-remove" aria-label="Remove example">×</button>
      </div>`;
  }
  function _renderExampleRows(examples) {
    if (!Array.isArray(examples) || !examples.length) return _exampleRowHTML('', '');
    return examples.slice(0, 3).map(ex => {
      const input  = ex.input  !== undefined ? ex.input  : ex.in;
      const output = ex.output !== undefined ? ex.output : ex.out;
      const inStr  = typeof input  === 'string' ? input  : (input  != null ? JSON.stringify(input,  null, 2) : '');
      const outStr = typeof output === 'string' ? output : (output != null ? JSON.stringify(output, null, 2) : '');
      return _exampleRowHTML(inStr, outStr);
    }).join('');
  }
  function _readExamplesFromForm() {
    const rows = document.querySelectorAll('#b-examples .b-example-pair');
    const out = [];
    rows.forEach(row => {
      const input  = (row.querySelector('.b-ex-input')?.value  || '').trim();
      const output = (row.querySelector('.b-ex-output')?.value || '').trim();
      if (input && output) out.push({ input, output });
    });
    return out;
  }
  function _readSchemaFromForm() {
    const raw = (document.getElementById('b-output-schema')?.value || '').trim();
    const status = document.getElementById('b-output-schema-status');
    if (!raw) { if (status) status.classList.remove('error'); return null; }
    try {
      const parsed = JSON.parse(raw);
      if (status) { status.textContent = 'Valid JSON.'; status.classList.remove('error'); }
      return (parsed && typeof parsed === 'object') ? parsed : null;
    } catch (e) {
      if (status) {
        status.textContent = 'Invalid JSON: ' + e.message;
        status.classList.add('error');
      }
      return null;
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
          <div class="builder-header-actions">
            <button type="button" class="btn btn-sm" id="btn-view-md" title="View as text">View as Text</button>
            <button type="button" class="btn btn-sm" id="btn-import-md" title="Import blueprint from text">Import</button>
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
            <div class="auth-field">
              <label for="b-description">Description</label>
              <input type="text" id="b-description" maxlength="200" placeholder="One-line summary of what this agent does" value="${_esc(agent?.description || config.description || '')}" />
              <p class="builder-hint">Surfaces in cards and the system prompt.</p>
            </div>
          </fieldset>

          <!-- BEHAVIOR -->
          <fieldset class="builder-section">
            <legend class="builder-legend">Behavior</legend>
            <div class="auth-field">
              <label for="b-instructions">Instructions</label>
              <textarea id="b-instructions" rows="4" maxlength="2000" placeholder="Persona, tone, rules. e.g. &quot;Be concise. Cite sources. Never speculate.&quot;">${_esc(agent?.flavor || config.flavor || '')}</textarea>
              <p class="builder-hint">Free-form behavior guidance. Appended last in the system prompt to color tone.</p>
            </div>
            <div class="auth-field">
              <label for="b-skills">Skills</label>
              <input type="text" id="b-skills" maxlength="500" placeholder="e.g. competitive analysis, SQL, technical writing" value="${_esc((config.caps || agent?.metadata?.caps || agent?.caps || []).join(', '))}" />
              <p class="builder-hint">Comma-separated capabilities. Distinct from tools — these describe what the agent can do.</p>
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
                ${_getAvailableModels().filter(m => m.enabled).length === 0 ? '<p class="builder-hint"><a href="#/security?tab=models">Enable a model</a> to run missions.</p>' : ''}
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

          <!-- ADVANCED -->
          <details class="builder-section builder-advanced" ${(config.persona || agent?.tags?.length || config.tags?.length || config.model_profile) ? 'open' : ''}>
            <summary class="builder-legend">Advanced</summary>
            <p class="builder-hint" style="margin-top:8px">Persona, search, and sampling overrides.</p>
            <div class="auth-field">
              <label for="b-tone">Tone</label>
              <input type="text" id="b-tone" maxlength="120" placeholder="e.g. dry and concise · warm and encouraging · clinical" value="${_esc(config.persona?.tone || agent?.persona?.tone || '')}" />
              <p class="builder-hint">Short phrase. Joins the system prompt as <code>Tone: …</code>.</p>
            </div>
            <div class="auth-field">
              <label for="b-constraints">Constraints</label>
              <textarea id="b-constraints" rows="3" maxlength="1000" placeholder="One rule per line. e.g.&#10;Never invent statistics&#10;Always cite the source URL">${_esc((config.persona?.constraints || agent?.persona?.constraints || []).join('\n'))}</textarea>
              <p class="builder-hint">Hard rules. One per line. Renders as a bullet list in the system prompt.</p>
            </div>
            <div class="builder-row">
              <div class="auth-field">
                <label for="b-tags">Tags</label>
                <input type="text" id="b-tags" maxlength="200" placeholder="e.g. research, b2b, q1-launch" value="${_esc((agent?.tags || config.tags || []).join(', '))}" />
                <p class="builder-hint">Search keywords. Comma-separated.</p>
              </div>
              <div class="auth-field">
                <label for="b-max-tokens">Max output tokens</label>
                <input type="number" id="b-max-tokens" min="256" max="32000" step="128" placeholder="auto" value="${config.model_profile?.max_output_tokens || ''}" />
                <p class="builder-hint">Hard cap on response length. Leave blank to derive from stats.</p>
              </div>
            </div>
          </details>

          <!-- SCHEMA & EVALS -->
          <details class="builder-section builder-advanced" ${(config.output_schema || agent?.output_schema || config.example_io?.length || agent?.example_io?.length || config.eval_criteria?.length || agent?.eval_criteria?.length) ? 'open' : ''}>
            <summary class="builder-legend">Schema &amp; Evals</summary>
            <p class="builder-hint" style="margin-top:8px">Structured output, few-shot examples, and quality criteria. Power-user fields — leave empty for free-form agents.</p>
            <div class="auth-field">
              <label for="b-output-schema">Output schema (JSON)</label>
              <textarea id="b-output-schema" rows="4" placeholder='{ "title": "string", "summary": "string", "tags": "string[]" }' spellcheck="false">${_esc(_serializeSchema(config.output_schema || agent?.output_schema))}</textarea>
              <p class="builder-hint" id="b-output-schema-status">JSON Schema or shorthand <code>{ field: "type" }</code>. Tells the agent to respond with this shape.</p>
            </div>
            <div class="auth-field">
              <label>Example I/O</label>
              <p class="builder-hint" style="margin-bottom:8px">Few-shot pairs. Cap of 3 — extras are dropped from the prompt.</p>
              <div id="b-examples">
                ${_renderExampleRows(config.example_io || agent?.example_io || [])}
              </div>
              <button type="button" class="btn btn-sm" id="b-example-add">+ Add example</button>
            </div>
            <div class="auth-field">
              <label for="b-eval-criteria">Eval criteria</label>
              <textarea id="b-eval-criteria" rows="3" maxlength="1000" placeholder="One criterion per line. e.g.&#10;Cites at least one source&#10;Stays under 200 words">${_esc((config.eval_criteria || agent?.eval_criteria || []).join('\n'))}</textarea>
              <p class="builder-hint">How output quality is judged. Renders as a bullet rubric in the system prompt.</p>
            </div>
          </details>

          <!-- ACTIONS -->
          <div class="builder-actions">
            <div class="builder-rarity-preview" id="builder-rarity-preview"></div>
            <div class="auth-error" id="builder-error"></div>
            <button type="submit" class="btn btn-primary" id="builder-submit">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-check"/></svg>
              ${isEdit ? 'Save Changes' : 'Create Agent'}
            </button>
          </div>
        </form>

        <!-- Markdown Editor (hidden by default) -->
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
            <h3>Import Agent Blueprint</h3>
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
        _updateRarityPreview();
      });
    });

    // Example I/O — add / remove rows (cap at 3, matching prompt cap)
    document.getElementById('b-example-add')?.addEventListener('click', () => {
      const wrap = document.getElementById('b-examples');
      if (!wrap) return;
      if (wrap.querySelectorAll('.b-example-pair').length >= 3) return;
      wrap.insertAdjacentHTML('beforeend', _exampleRowHTML('', ''));
    });
    document.getElementById('b-examples')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.b-ex-remove');
      if (!btn) return;
      const row = btn.closest('.b-example-pair');
      const wrap = document.getElementById('b-examples');
      // Always keep one empty row visible so the editor doesn't collapse to nothing
      if (wrap && wrap.querySelectorAll('.b-example-pair').length <= 1) {
        row.querySelector('.b-ex-input').value = '';
        row.querySelector('.b-ex-output').value = '';
      } else {
        row.remove();
      }
    });

    // Output schema — live JSON validation
    document.getElementById('b-output-schema')?.addEventListener('input', _debounce(_readSchemaFromForm, 250));

    // Live rarity preview — update on any form change
    ['b-model', 'b-type', 'b-role'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', _updateRarityPreview);
    });
    if (tempSlider) tempSlider.addEventListener('input', _updateRarityPreview);
    if (memoryBtn) memoryBtn.addEventListener('click', () => setTimeout(_updateRarityPreview, 10));
    _updateRarityPreview(); // initial render

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
      localStorage.setItem(Utils.KEYS.agentTemplates, JSON.stringify(templates));
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

    // ── Markdown toggle ──
    document.getElementById('btn-view-md')?.addEventListener('click', () => {
      const bp = _formToBlueprint(agent);
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
      const ta = document.getElementById('builder-md-textarea');
      navigator.clipboard.writeText(ta.value).then(() => {
        if (typeof Notify !== 'undefined') Notify.send('Copied to clipboard', 'success');
      });
    });

    document.getElementById('btn-md-download')?.addEventListener('click', () => {
      const ta = document.getElementById('builder-md-textarea');
      const name = (document.getElementById('b-name')?.value || 'agent').toLowerCase().replace(/\s+/g, '-');
      const blob = new Blob([ta.value], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name + '.md';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    // Live validation in md editor
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

  function _getTemplates() {
    try { return JSON.parse(localStorage.getItem(Utils.KEYS.agentTemplates) || '[]'); }
    catch { return []; }
  }

  function _updateRarityPreview() {
    const el = document.getElementById('builder-rarity-preview');
    if (!el) return;
    const model = document.getElementById('b-model')?.value || 'nice-auto';
    const type = document.getElementById('b-type')?.value || 'Specialist';
    const temp = parseFloat(document.getElementById('b-temp')?.value ?? 0.7);
    const memory = document.getElementById('b-memory')?.dataset.val === '1';
    const tools = [...document.querySelectorAll('#b-tools input:checked')].map(cb => cb.value);
    const info = BlueprintUtils.getRarityInfo({ config: { tools, memory, temperature: temp }, llm_engine: model, type });
    el.innerHTML = `<span class="rarity-badge rarity-${info.name.toLowerCase()}" style="border-color:${info.color}">${info.name}</span>`;
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
    const description  = (document.getElementById('b-description')?.value || '').trim();
    const instructions = (document.getElementById('b-instructions')?.value || '').trim();
    const skills = (document.getElementById('b-skills')?.value || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    const tone = (document.getElementById('b-tone')?.value || '').trim();
    const constraints = (document.getElementById('b-constraints')?.value || '')
      .split('\n').map(s => s.trim()).filter(Boolean);
    const tags = (document.getElementById('b-tags')?.value || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    const maxTokensRaw = (document.getElementById('b-max-tokens')?.value || '').trim();
    const maxTokens = maxTokensRaw ? parseInt(maxTokensRaw, 10) : null;
    const outputSchema = _readSchemaFromForm();
    const exampleIO = _readExamplesFromForm();
    const evalCriteria = (document.getElementById('b-eval-criteria')?.value || '')
      .split('\n').map(s => s.trim()).filter(Boolean);

    if (!name) {
      errEl.textContent = 'Agent name is required.';
      btn.disabled = false;
      btn.textContent = existingAgent ? 'Save Changes' : 'Create Agent';
      return;
    }
    if (!role) {
      errEl.textContent = 'Please select a role.';
      btn.disabled = false;
      btn.textContent = existingAgent ? 'Save Changes' : 'Create Agent';
      return;
    }
    if (!model) {
      errEl.textContent = 'Please select a model.';
      btn.disabled = false;
      btn.textContent = existingAgent ? 'Save Changes' : 'Create Agent';
      return;
    }
    // Reject save if the user typed something into Output Schema that
    // didn't parse as JSON — silently dropping their work would be worse.
    const rawSchema = (document.getElementById('b-output-schema')?.value || '').trim();
    if (rawSchema && !outputSchema) {
      errEl.textContent = 'Output schema is not valid JSON. Fix or clear it before saving.';
      btn.disabled = false;
      btn.textContent = existingAgent ? 'Save Changes' : 'Create Agent';
      return;
    }

    // Persona — only attach when there's actually content (avoids
    // littering the config with empty objects on minimal agents).
    const persona = {};
    if (tone) persona.tone = tone;
    if (constraints.length) persona.constraints = constraints;
    // model_profile — only set when the user overrode the stat-derived
    // envelope (LLMConfig falls back to stats when absent).
    const modelProfile = {};
    if (maxTokens && maxTokens > 0) modelProfile.max_output_tokens = maxTokens;

    const row = {
      name,
      role,
      type,
      status: existingAgent?.status || 'idle',
      // user_agents has no top-level columns for llm_engine, description,
      // flavor, caps, tags, persona, model_profile, output_schema,
      // example_io, or eval_criteria — they live inside the config JSONB
      // (matches setup-wizard / crew-designer inserts). Loader surfaces
      // them back to top-level on State.agents items.
      config: {
        tools, memory, temperature: temp,
        llm_engine: model,
        description,
        flavor: instructions,
        caps: skills,
        tags,
        ...(outputSchema ? { output_schema: outputSchema } : {}),
        ...(exampleIO.length ? { example_io: exampleIO } : {}),
        ...(evalCriteria.length ? { eval_criteria: evalCriteria } : {}),
        ...(Object.keys(persona).length ? { persona } : {}),
        ...(Object.keys(modelProfile).length ? { model_profile: modelProfile } : {}),
      },
      rarity: BlueprintUtils.getRarity({ config: { tools, memory, temperature: temp }, llm_engine: model, type }),
    };

    try {
      if (user && typeof SB !== 'undefined' && SB.isReady()) {
        // Authenticated: save to Supabase
        if (existingAgent) {
          await SB.db('user_agents').update(existingAgent.id, row);
        } else {
          row.user_id = user.id;
          await SB.db('user_agents').create(row);
        }
      } else {
        // Guest mode: save to localStorage
        const guestId = 'guest-agent-' + Date.now();
        row.id = existingAgent?.id || guestId;
        row._guest = true;
        const custom = JSON.parse(localStorage.getItem(Utils.KEYS.customAgents) || '[]');
        const idx = custom.findIndex(a => a.id === row.id);
        if (idx >= 0) custom[idx] = row; else custom.push(row);
        localStorage.setItem(Utils.KEYS.customAgents, JSON.stringify(custom));
        // Add to State
        const agents = State.get('agents') || [];
        const si = agents.findIndex(a => a.id === row.id);
        if (si >= 0) agents[si] = row; else agents.push(row);
        State.set('agents', agents);
        if (typeof BlueprintStore !== 'undefined') BlueprintStore.activateAgent(row.id);
      }
      if (typeof Gamification !== 'undefined' && !existingAgent) {
        Gamification.addXP('create_agent');
        Gamification.checkAchievements();
      }
      Router.navigate('#/bridge/agents');
    } catch (err) {
      errEl.textContent = err.message || 'Failed to save agent.';
      btn.disabled = false;
      btn.textContent = existingAgent ? 'Save Changes' : 'Create Agent';
    }
  }

  function _debounce(fn, ms) { let t; return function() { clearTimeout(t); t = setTimeout(fn, ms); }; }

  /** Build a blueprint object from the current form state */
  function _formToBlueprint(agent) {
    const name  = document.getElementById('b-name')?.value?.trim() || '';
    const role  = document.getElementById('b-role')?.value || 'Research';
    const type  = document.getElementById('b-type')?.value || 'Specialist';
    const model = document.getElementById('b-model')?.value || 'nice-auto';
    const temp  = parseFloat(document.getElementById('b-temp')?.value ?? 0.7);
    const memory = document.getElementById('b-memory')?.dataset?.val === '1';
    const tools = [...document.querySelectorAll('#b-tools input:checked')].map(cb => cb.value);
    const description  = (document.getElementById('b-description')?.value || '').trim();
    const instructions = (document.getElementById('b-instructions')?.value || '').trim();
    const skills = (document.getElementById('b-skills')?.value || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    const tone = (document.getElementById('b-tone')?.value || '').trim();
    const constraints = (document.getElementById('b-constraints')?.value || '')
      .split('\n').map(s => s.trim()).filter(Boolean);
    const tags = (document.getElementById('b-tags')?.value || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    const maxTokensRaw = (document.getElementById('b-max-tokens')?.value || '').trim();
    const maxTokens = maxTokensRaw ? parseInt(maxTokensRaw, 10) : null;
    const outputSchema = _readSchemaFromForm();
    const exampleIO = _readExamplesFromForm();
    const evalCriteria = (document.getElementById('b-eval-criteria')?.value || '')
      .split('\n').map(s => s.trim()).filter(Boolean);

    const persona = {};
    if (tone) persona.tone = tone;
    if (constraints.length) persona.constraints = constraints;
    const modelProfile = {};
    if (maxTokens && maxTokens > 0) modelProfile.max_output_tokens = maxTokens;

    return {
      type: 'agent',
      name: name,
      category: role,
      config: {
        role: role,
        type: type,
        llm_engine: model,
        temperature: temp,
        memory: memory,
        tools: tools,
        description: description,
        flavor: instructions,
        caps: skills,
        tags: tags,
        ...(outputSchema ? { output_schema: outputSchema } : {}),
        ...(exampleIO.length ? { example_io: exampleIO } : {}),
        ...(evalCriteria.length ? { eval_criteria: evalCriteria } : {}),
        ...(Object.keys(persona).length ? { persona } : {}),
        ...(Object.keys(modelProfile).length ? { model_profile: modelProfile } : {}),
      },
      stats: {},
      metadata: { agentType: type, caps: skills },
      description: description || agent?.description || '',
      flavor: instructions || agent?.flavor || '',
      tags: tags.length ? tags : (agent?.tags || []),
      rarity: agent?.rarity || 'Common',
      serial_key: agent?.serial_key || '',
    };
  }

  /** Populate the form from a parsed blueprint */
  function _populateForm(bp) {
    const cfg = bp.config || {};
    const el = (id) => document.getElementById(id);
    if (el('b-name')) el('b-name').value = bp.name || '';
    if (el('b-role')) el('b-role').value = cfg.role || bp.category || 'Research';
    if (el('b-type')) el('b-type').value = cfg.type || 'Specialist';
    if (el('b-model')) el('b-model').value = cfg.llm_engine || 'nice-auto';
    if (el('b-temp')) {
      el('b-temp').value = cfg.temperature ?? 0.7;
      const tempVal = el('b-temp-val');
      if (tempVal) tempVal.textContent = cfg.temperature ?? 0.7;
    }
    const memBtn = el('b-memory');
    if (memBtn) {
      memBtn.dataset.val = cfg.memory ? '1' : '0';
      memBtn.classList.toggle('on', !!cfg.memory);
      const lbl = memBtn.querySelector('.builder-toggle-label');
      if (lbl) lbl.textContent = cfg.memory ? 'ON' : 'OFF';
    }
    const tools = cfg.tools || [];
    document.querySelectorAll('#b-tools input[type="checkbox"]').forEach(cb => {
      cb.checked = tools.includes(cb.value);
      cb.parentElement.classList.toggle('selected', cb.checked);
    });
    if (el('b-description')) el('b-description').value = bp.description || cfg.description || '';
    if (el('b-instructions')) el('b-instructions').value = bp.flavor || cfg.flavor || '';
    if (el('b-skills')) {
      const caps = cfg.caps || (bp.metadata && bp.metadata.caps) || bp.caps || [];
      el('b-skills').value = caps.join(', ');
    }
    const persona = cfg.persona || bp.persona || {};
    if (el('b-tone')) el('b-tone').value = persona.tone || '';
    if (el('b-constraints')) el('b-constraints').value = (persona.constraints || []).join('\n');
    if (el('b-tags')) el('b-tags').value = (bp.tags || cfg.tags || []).join(', ');
    if (el('b-max-tokens')) {
      const mp = cfg.model_profile || bp.model_profile || {};
      el('b-max-tokens').value = mp.max_output_tokens || '';
    }
    if (el('b-output-schema')) el('b-output-schema').value = _serializeSchema(cfg.output_schema || bp.output_schema);
    const examplesEl = document.getElementById('b-examples');
    if (examplesEl) examplesEl.innerHTML = _renderExampleRows(cfg.example_io || bp.example_io || []);
    if (el('b-eval-criteria')) el('b-eval-criteria').value = (cfg.eval_criteria || bp.eval_criteria || []).join('\n');
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

/* ── LLM Provider / Model Registry (backwards-compatible aliases from MODEL_CATALOG) ── */
const LLM_PROVIDERS = [...new Set((typeof VaultView !== 'undefined' ? VaultView.MODEL_CATALOG : []).map(m => m.provider))].map(p => {
  const model = VaultView.MODEL_CATALOG.find(m => m.provider === p);
  return { id: p.toLowerCase().replace(/\s/g, ''), name: p, icon: model?.icon || '🤖', color: '#666', url: '' };
});

const LLM_MODELS = (typeof VaultView !== 'undefined' ? VaultView.MODEL_CATALOG : []).map(m => ({
  id: m.id, label: m.name, provider: m.provider.toLowerCase().replace(/\s/g, '')
}));

function _getConnectedProviders() {
  // New system: NICE provides all models, so all providers are "connected"
  return LLM_PROVIDERS;
}

function _getAvailableModels() {
  const enabled = State.get('enabled_models') || {};
  return LLM_MODELS.map(m => ({ ...m, available: true, enabled: !!enabled[m.id] }));
}
