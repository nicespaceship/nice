/* ═══════════════════════════════════════════════════════════════════
   NICE — Workflow Builder
   Visual node-based agent pipeline editor with execution engine.
   Workflows persist to Supabase user_workflows table with
   localStorage fallback.
═══════════════════════════════════════════════════════════════════ */

/* ── List View ── */
const WorkflowsView = (() => {
  const title = 'Workflows';
  const _esc = Utils.esc;
  const _timeAgo = Utils.timeAgo;
  const STORAGE_KEY = 'nice-workflows';
  let _migrated = false;

  function render(el) {
    const user = State.get('user');
    if (!user) return _authPrompt(el, 'workflows');

    // Migrate localStorage workflows to DB on first load
    if (!_migrated) {
      _migrateWorkflows(user);
      _migrated = true;
    }

    _loadAndRender(el);
  }

  async function _loadAndRender(el) {
    const workflows = await _getAll();

    el.innerHTML = `
      <div class="wf-wrap">
        <div class="log-header">
          <div>
            <h1 class="log-title">Workflows</h1>
            <p class="log-sub">Visual agent pipelines &mdash; ${workflows.length} workflow${workflows.length !== 1 ? 's' : ''}</p>
          </div>
          <button class="btn btn-sm btn-primary" id="wf-new">+ New Workflow</button>
        </div>

        <div class="wf-list">
          ${workflows.length === 0 ? `
            <div class="app-empty">
              <h2>No Workflows Yet</h2>
              <p>Create your first agent pipeline to automate multi-step processes.</p>
            </div>
          ` : workflows.map(wf => `
            <a href="#/workflows/${wf.id}" class="wf-card">
              <div class="wf-card-top">
                <span class="wf-card-name">${_esc(wf.name)}</span>
                <span class="wf-card-count">${(wf.nodes || []).length} nodes</span>
              </div>
              <div class="wf-card-meta">
                <span class="wf-card-date">${_timeAgo(wf.created || wf.created_at)}</span>
                <span class="wf-card-conns">${(wf.connections || []).length} connections</span>
              </div>
              ${wf.trigger && wf.trigger.type !== 'manual' ? `
                <div class="wf-card-trigger">
                  <span class="wf-trigger-badge">${_triggerLabel(wf.trigger.type)}</span>
                </div>
              ` : ''}
              <button class="btn btn-xs btn-danger wf-del-btn" data-id="${wf.id}">&times;</button>
            </a>
          `).join('')}
        </div>
      </div>
    `;

    document.getElementById('wf-new')?.addEventListener('click', async () => {
      const wf = await _createWorkflow();
      Router.navigate('#/workflows/' + wf.id);
    });

    el.querySelectorAll('.wf-del-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.id;
        if (!confirm('Delete this workflow?')) return;
        await _deleteWorkflow(id);
        _loadAndRender(el);
      });
    });
  }

  function _triggerLabel(type) {
    const labels = {
      manual: 'Manual',
      scheduled: 'Scheduled',
      on_mission_complete: 'On Mission Complete',
      on_agent_idle: 'On Agent Idle',
    };
    return labels[type] || type;
  }

  async function _getAll() {
    // Try Supabase first, fall back to localStorage
    try {
      if (typeof SB !== 'undefined' && SB.isReady()) {
        const user = State.get('user');
        if (user) {
          const data = await SB.db('user_workflows').list({ userId: user.id });
          if (Array.isArray(data) && data.length >= 0) {
            // Parse JSON fields if stored as strings
            return data.map(wf => ({
              ...wf,
              nodes: typeof wf.nodes === 'string' ? JSON.parse(wf.nodes) : (wf.nodes || []),
              connections: typeof wf.connections === 'string' ? JSON.parse(wf.connections) : (wf.connections || []),
              trigger: typeof wf.trigger === 'string' ? JSON.parse(wf.trigger) : (wf.trigger || { type: 'manual' }),
            }));
          }
        }
      }
    } catch (err) {
      console.warn('[Workflows] DB read failed, using localStorage:', err.message);
    }

    // Fallback to localStorage
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  }

  async function _createWorkflow() {
    const wf = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: 'Workflow ' + ((await _getAll()).length + 1),
      nodes: [],
      connections: [],
      trigger: { type: 'manual' },
      created: new Date().toISOString(),
    };

    try {
      if (typeof SB !== 'undefined' && SB.isReady()) {
        const user = State.get('user');
        if (user) {
          const saved = await SB.db('user_workflows').create({
            user_id: user.id,
            id: wf.id,
            name: wf.name,
            nodes: JSON.stringify(wf.nodes),
            connections: JSON.stringify(wf.connections),
            trigger: JSON.stringify(wf.trigger),
          });
          if (saved) {
            if (typeof Gamification !== 'undefined') Gamification.addXP('create_workflow');
            return saved;
          }
        }
      }
    } catch (err) {
      console.warn('[Workflows] DB create failed, using localStorage:', err.message);
    }

    // Fallback to localStorage
    const workflows = _getLocalAll();
    workflows.push(wf);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows));
    if (typeof Gamification !== 'undefined') Gamification.addXP('create_workflow');
    return wf;
  }

  async function _deleteWorkflow(id) {
    try {
      if (typeof SB !== 'undefined' && SB.isReady()) {
        await SB.db('user_workflows').remove(id);
        return;
      }
    } catch (err) {
      console.warn('[Workflows] DB delete failed, using localStorage:', err.message);
    }

    const workflows = _getLocalAll().filter(w => w.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows));
  }

  function _getLocalAll() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  }

  async function _migrateWorkflows(user) {
    if (!user) return;
    const local = _getLocalAll();
    if (!local.length) return;

    try {
      if (typeof SB !== 'undefined' && SB.isReady()) {
        for (const wf of local) {
          await SB.db('user_workflows').create({
            user_id: user.id,
            id: wf.id,
            name: wf.name,
            nodes: JSON.stringify(wf.nodes || []),
            connections: JSON.stringify(wf.connections || []),
            trigger: JSON.stringify(wf.trigger || { type: 'manual' }),
          });
        }
        // Clear localStorage after successful migration
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      console.warn('[Workflows] Migration failed:', err.message);
    }
  }

  return { title, render };
})();

/* ── Detail / Editor View ── */
const WorkflowDetailView = (() => {
  const title = 'Workflow Editor';
  const _esc = Utils.esc;
  const _timeAgo = Utils.timeAgo;
  const STORAGE_KEY = 'nice-workflows';
  let _wf = null;
  let _selectedNode = null;
  let _connecting = null; // {fromId}
  let _dragging = null;   // {nodeId, offsetX, offsetY}
  let _canvasEl = null;
  let _runHistory = [];

  const NODE_TYPES = [
    { type: 'agent',     label: 'Agent',     icon: 'bot', color: 'var(--accent)' },
    { type: 'condition', label: 'Condition',  icon: '❓', color: '#f59e0b' },
    { type: 'branch',    label: 'Branch',     icon: '🔀', color: '#f59e0b' },
    { type: 'delay',     label: 'Delay',      icon: 'timer', color: '#6366f1' },
    { type: 'output',    label: 'Output',     icon: '📤', color: '#22c55e' },
    { type: 'loop',      label: 'Loop',       icon: 'repeat', color: '#06b6d4' },
    { type: 'webhook',   label: 'Webhook',    icon: 'globe', color: '#8b5cf6' },
  ];

  const TRIGGER_TYPES = [
    { type: 'manual',             label: 'Manual' },
    { type: 'scheduled',          label: 'Scheduled' },
    { type: 'on_mission_complete', label: 'On Mission Complete' },
    { type: 'on_agent_idle',      label: 'On Agent Idle' },
  ];

  let _presenceChannel = null;

  async function render(el, params) {
    const id = params?.id;
    _wf = await _getWorkflow(id);
    if (!_wf) {
      el.innerHTML = '<div class="app-empty"><h2>Workflow Not Found</h2><a href="#/workflows" class="btn btn-sm">Back</a></div>';
      return;
    }

    // Ensure trigger exists
    if (!_wf.trigger) _wf.trigger = { type: 'manual' };

    // Load run history
    await _loadRunHistory();

    // Track presence for collaborative editing
    _trackWorkflowPresence(id);

    el.innerHTML = `
      <div class="wfe-wrap">
        <div class="wfe-toolbar">
          <a href="#/workflows" class="btn btn-xs">&larr; Back</a>
          <input type="text" class="wfe-name-input" id="wfe-name" value="${_esc(_wf.name)}" />
          <div id="wfe-collab-indicator" class="wfe-collab-indicator" style="font-size:.72rem;color:var(--accent);margin-left:8px"></div>
          <div class="wfe-toolbar-right">
            <select class="filter-select" id="wfe-trigger" title="Trigger type" style="font-size:.72rem;padding:4px 8px;">
              ${TRIGGER_TYPES.map(t => `<option value="${t.type}" ${_wf.trigger.type === t.type ? 'selected' : ''}>${t.label}</option>`).join('')}
            </select>
            ${_wf.trigger.type === 'scheduled' ? `
              <input type="text" class="filter-input" id="wfe-cron" placeholder="*/5 * * * *" value="${_esc(_wf.trigger.config?.cron || '')}" style="width:120px;font-size:.72rem;padding:4px 8px;" title="Cron expression" />
            ` : ''}
            <button class="btn btn-xs btn-primary" id="wfe-run" title="Run Workflow">&#9654; Run</button>
            <button class="btn btn-xs" id="wfe-save" title="Save">Save</button>
          </div>
        </div>

        <div class="wfe-layout">
          <!-- Node palette -->
          <div class="wfe-palette">
            <h3 class="wfe-palette-title">Nodes</h3>
            ${NODE_TYPES.map(nt => `
              <button class="wfe-palette-btn" data-type="${nt.type}" title="Add ${nt.label}">
                <span class="wfe-palette-icon">${nt.icon}</span>
                <span>${nt.label}</span>
              </button>
            `).join('')}
            <hr class="wfe-sep"/>
            <h3 class="wfe-palette-title">Tools</h3>
            <button class="btn btn-xs wfe-tool-btn" id="wfe-clear" title="Clear all nodes">Clear All</button>
          </div>

          <!-- Canvas -->
          <div class="wfe-canvas-wrap" id="wfe-canvas-wrap">
            <canvas id="wfe-canvas" class="wfe-canvas"></canvas>
            <div class="wfe-nodes" id="wfe-nodes"></div>
          </div>

          <!-- Properties panel -->
          <div class="wfe-props" id="wfe-props">
            <h3 class="wfe-palette-title">Properties</h3>
            <div id="wfe-props-content">
              <p class="wfe-props-empty">Select a node to edit its properties.</p>
            </div>
          </div>
        </div>

        <!-- Run History -->
        <div class="wfe-history" style="margin-top:24px;">
          <h3 class="wfe-palette-title" style="padding:0 0 12px;">Run History</h3>
          <div id="wfe-run-history">
            ${_renderRunHistory()}
          </div>
        </div>
      </div>
    `;

    _canvasEl = document.getElementById('wfe-canvas');
    _renderNodes();
    _drawConnections();
    _bindEditorEvents(el);
  }

  function _bindEditorEvents(el) {
    // Palette: add nodes
    el.querySelectorAll('.wfe-palette-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        _addNode(type);
      });
    });

    // Name input
    document.getElementById('wfe-name')?.addEventListener('input', (e) => {
      _wf.name = e.target.value;
    });

    // Trigger selector
    document.getElementById('wfe-trigger')?.addEventListener('change', (e) => {
      _wf.trigger = { type: e.target.value, config: {} };
      // Re-render toolbar to show/hide cron input
      const toolbarRight = document.querySelector('.wfe-toolbar-right');
      if (toolbarRight && e.target.value === 'scheduled') {
        // Insert cron input if not present
        if (!document.getElementById('wfe-cron')) {
          const cronInput = document.createElement('input');
          cronInput.type = 'text';
          cronInput.className = 'filter-input';
          cronInput.id = 'wfe-cron';
          cronInput.placeholder = '*/5 * * * *';
          cronInput.style.cssText = 'width:120px;font-size:.72rem;padding:4px 8px;';
          cronInput.title = 'Cron expression';
          cronInput.addEventListener('input', (ev) => {
            if (!_wf.trigger.config) _wf.trigger.config = {};
            _wf.trigger.config.cron = ev.target.value;
          });
          e.target.after(cronInput);
        }
      } else {
        document.getElementById('wfe-cron')?.remove();
      }
    });

    // Cron input
    document.getElementById('wfe-cron')?.addEventListener('input', (e) => {
      if (!_wf.trigger.config) _wf.trigger.config = {};
      _wf.trigger.config.cron = e.target.value;
    });

    // Save
    document.getElementById('wfe-save')?.addEventListener('click', async () => {
      await _saveWorkflow();
      Notify.send({ title: 'Saved', message: 'Workflow saved.', type: 'system' });
    });

    // Run
    document.getElementById('wfe-run')?.addEventListener('click', _runWorkflow);

    // Clear
    document.getElementById('wfe-clear')?.addEventListener('click', () => {
      if (!confirm('Clear all nodes?')) return;
      _wf.nodes = [];
      _wf.connections = [];
      _selectedNode = null;
      _renderNodes();
      _drawConnections();
      _renderProps();
    });

    // Canvas click — deselect
    document.getElementById('wfe-canvas-wrap')?.addEventListener('click', (e) => {
      if (e.target.id === 'wfe-canvas' || e.target.id === 'wfe-canvas-wrap') {
        _selectedNode = null;
        _connecting = null;
        _renderNodes();
        _renderProps();
      }
    });

    // Resize observer for canvas
    const wrap = document.getElementById('wfe-canvas-wrap');
    if (wrap && _canvasEl) {
      const ro = new ResizeObserver(() => {
        _canvasEl.width = wrap.clientWidth;
        _canvasEl.height = wrap.clientHeight;
        _drawConnections();
      });
      ro.observe(wrap);
    }

    // Run history expand/collapse
    _bindRunHistoryEvents();
  }

  function _addNode(type) {
    const ntDef = NODE_TYPES.find(n => n.type === type);
    const node = {
      id: 'n-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
      type,
      label: ntDef?.label || type,
      x: 80 + Math.random() * 200,
      y: 60 + (_wf.nodes.length * 90) % 400,
      config: _defaultConfig(type),
    };
    _wf.nodes.push(node);
    _selectedNode = node.id;
    _renderNodes();
    _drawConnections();
    _renderProps();
  }

  function _defaultConfig(type) {
    switch (type) {
      case 'agent':     return { agentId: '', prompt: 'Process input data' };
      case 'condition': return { expression: 'result.success === true' };
      case 'branch':    return { conditions: [{ expression: 'result.success === true', targetNodeId: '' }] };
      case 'delay':     return { ms: 1000 };
      case 'output':    return { format: 'json' };
      case 'loop':      return { iterateOver: 'lines', maxIterations: 10 };
      case 'webhook':   return { url: '', method: 'POST', body: '' };
      default:          return {};
    }
  }

  function _renderNodes() {
    const container = document.getElementById('wfe-nodes');
    if (!container) return;

    container.innerHTML = _wf.nodes.map(node => {
      const ntDef = NODE_TYPES.find(n => n.type === node.type);
      const isSelected = _selectedNode === node.id;
      const isConnecting = _connecting?.fromId === node.id;
      return `
        <div class="wfe-node ${isSelected ? 'selected' : ''} ${isConnecting ? 'connecting' : ''}"
             data-id="${node.id}" style="left:${node.x}px;top:${node.y}px"
             draggable="false">
          <div class="wfe-node-header" style="border-color:${ntDef?.color || 'var(--accent)'}">
            <span class="wfe-node-icon">${ntDef?.icon || '?'}</span>
            <span class="wfe-node-label">${_esc(node.label)}</span>
          </div>
          <div class="wfe-node-ports">
            <span class="wfe-port wfe-port-in" data-id="${node.id}" data-dir="in" title="Input"></span>
            <span class="wfe-port wfe-port-out" data-id="${node.id}" data-dir="out" title="Output (click to connect)"></span>
          </div>
        </div>
      `;
    }).join('');

    // Node drag
    container.querySelectorAll('.wfe-node').forEach(nodeEl => {
      const header = nodeEl.querySelector('.wfe-node-header');
      header.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const nodeId = nodeEl.dataset.id;
        const node = _wf.nodes.find(n => n.id === nodeId);
        if (!node) return;
        _selectedNode = nodeId;
        _renderProps();
        const rect = nodeEl.parentElement.getBoundingClientRect();
        _dragging = {
          nodeId,
          offsetX: e.clientX - node.x - rect.left,
          offsetY: e.clientY - node.y - rect.top,
          rect,
        };
        nodeEl.classList.add('selected');

        const onMove = (ev) => {
          node.x = Math.max(0, ev.clientX - _dragging.offsetX - _dragging.rect.left);
          node.y = Math.max(0, ev.clientY - _dragging.offsetY - _dragging.rect.top);
          nodeEl.style.left = node.x + 'px';
          nodeEl.style.top = node.y + 'px';
          _drawConnections();
        };
        const onUp = () => {
          _dragging = null;
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      // Click to select
      nodeEl.addEventListener('click', (e) => {
        if (e.target.classList.contains('wfe-port')) return;
        _selectedNode = nodeEl.dataset.id;
        _renderNodes();
        _renderProps();
      });
    });

    // Port click — connect
    container.querySelectorAll('.wfe-port-out').forEach(port => {
      port.addEventListener('click', (e) => {
        e.stopPropagation();
        _connecting = { fromId: port.dataset.id };
        _renderNodes();
      });
    });

    container.querySelectorAll('.wfe-port-in').forEach(port => {
      port.addEventListener('click', (e) => {
        e.stopPropagation();
        if (_connecting && _connecting.fromId !== port.dataset.id) {
          // Check for duplicate
          const exists = _wf.connections.find(c => c.from === _connecting.fromId && c.to === port.dataset.id);
          if (!exists) {
            _wf.connections.push({ from: _connecting.fromId, to: port.dataset.id });
            _drawConnections();
          }
        }
        _connecting = null;
        _renderNodes();
      });
    });
  }

  function _drawConnections() {
    if (!_canvasEl) return;
    const wrap = document.getElementById('wfe-canvas-wrap');
    if (!wrap) return;
    _canvasEl.width = wrap.clientWidth;
    _canvasEl.height = wrap.clientHeight;
    const ctx = _canvasEl.getContext('2d');
    ctx.clearRect(0, 0, _canvasEl.width, _canvasEl.height);

    _wf.connections.forEach(conn => {
      const fromNode = _wf.nodes.find(n => n.id === conn.from);
      const toNode = _wf.nodes.find(n => n.id === conn.to);
      if (!fromNode || !toNode) return;

      const x1 = fromNode.x + 120; // right port
      const y1 = fromNode.y + 32;
      const x2 = toNode.x;          // left port
      const y2 = toNode.y + 32;

      ctx.beginPath();
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#fff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5;
      const cp = Math.abs(x2 - x1) * 0.5;
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(x1 + cp, y1, x2 - cp, y2, x2, y2);
      ctx.stroke();

      // Arrowhead
      ctx.globalAlpha = 0.7;
      const angle = Math.atan2(y2 - (y2 - 10), x2 - (x2 - 10));
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - 8 * Math.cos(angle - 0.4), y2 - 8 * Math.sin(angle - 0.4));
      ctx.lineTo(x2 - 8 * Math.cos(angle + 0.4), y2 - 8 * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  function _renderProps() {
    const content = document.getElementById('wfe-props-content');
    if (!content) return;

    if (!_selectedNode) {
      content.innerHTML = '<p class="wfe-props-empty">Select a node to edit its properties.</p>';
      return;
    }

    const node = _wf.nodes.find(n => n.id === _selectedNode);
    if (!node) return;

    const ntDef = NODE_TYPES.find(n => n.type === node.type);
    let configHTML = '';

    if (node.type === 'agent') {
      const agents = State.get('agents') || [];
      configHTML = `
        <div class="wfe-field">
          <label>Agent</label>
          <select class="tc-select" id="wfe-cfg-agent">
            <option value="">Select agent...</option>
            ${agents.map(a => `<option value="${a.id}" ${node.config.agentId === a.id ? 'selected' : ''}>${_esc(a.name)}</option>`).join('')}
          </select>
        </div>
        <div class="wfe-field">
          <label>Prompt</label>
          <textarea class="wfe-textarea" id="wfe-cfg-prompt">${_esc(node.config.prompt || '')}</textarea>
        </div>`;
    } else if (node.type === 'condition') {
      configHTML = `
        <div class="wfe-field">
          <label>Expression</label>
          <input type="text" class="filter-input" id="wfe-cfg-expr" value="${_esc(node.config.expression || '')}" />
        </div>`;
    } else if (node.type === 'branch') {
      const conditions = node.config.conditions || [];
      configHTML = `
        <div class="wfe-field">
          <label>Branch Conditions</label>
          ${conditions.map((cond, i) => `
            <div style="margin-bottom:8px;padding:8px;border:1px solid var(--border);border-radius:var(--radius);">
              <label style="font-size:.7rem;">Expression ${i + 1}</label>
              <input type="text" class="filter-input wfe-branch-expr" data-idx="${i}" value="${_esc(cond.expression || '')}" style="margin-bottom:4px;" />
              <label style="font-size:.7rem;">Target Node ID</label>
              <select class="tc-select wfe-branch-target" data-idx="${i}">
                <option value="">Select target...</option>
                ${_wf.nodes.filter(n => n.id !== node.id).map(n => `<option value="${n.id}" ${cond.targetNodeId === n.id ? 'selected' : ''}>${_esc(n.label)} (${n.id})</option>`).join('')}
              </select>
            </div>
          `).join('')}
          <button class="btn btn-xs" id="wfe-add-branch">+ Add Condition</button>
        </div>`;
    } else if (node.type === 'delay') {
      configHTML = `
        <div class="wfe-field">
          <label>Delay (ms)</label>
          <input type="number" class="filter-input" id="wfe-cfg-delay" value="${node.config.ms || 1000}" min="0" step="100" />
        </div>`;
    } else if (node.type === 'output') {
      configHTML = `
        <div class="wfe-field">
          <label>Format</label>
          <select class="tc-select" id="wfe-cfg-format">
            <option value="json" ${node.config.format === 'json' ? 'selected' : ''}>JSON</option>
            <option value="text" ${node.config.format === 'text' ? 'selected' : ''}>Text</option>
            <option value="csv" ${node.config.format === 'csv' ? 'selected' : ''}>CSV</option>
          </select>
        </div>`;
    } else if (node.type === 'loop') {
      configHTML = `
        <div class="wfe-field">
          <label>Iterate Over</label>
          <select class="tc-select" id="wfe-cfg-loop-type">
            <option value="lines" ${node.config.iterateOver === 'lines' ? 'selected' : ''}>Lines</option>
            <option value="json_array" ${node.config.iterateOver === 'json_array' ? 'selected' : ''}>JSON Array</option>
          </select>
        </div>
        <div class="wfe-field">
          <label>Max Iterations</label>
          <input type="number" class="filter-input" id="wfe-cfg-loop-max" value="${node.config.maxIterations || 10}" min="1" max="100" />
        </div>`;
    } else if (node.type === 'webhook') {
      configHTML = `
        <div class="wfe-field">
          <label>URL</label>
          <input type="text" class="filter-input" id="wfe-cfg-webhook-url" value="${_esc(node.config.url || '')}" placeholder="https://..." />
        </div>
        <div class="wfe-field">
          <label>Method</label>
          <select class="tc-select" id="wfe-cfg-webhook-method">
            <option value="GET" ${node.config.method === 'GET' ? 'selected' : ''}>GET</option>
            <option value="POST" ${node.config.method === 'POST' ? 'selected' : ''}>POST</option>
            <option value="PUT" ${node.config.method === 'PUT' ? 'selected' : ''}>PUT</option>
          </select>
        </div>`;
    }

    content.innerHTML = `
      <div class="wfe-props-inner">
        <div class="wfe-props-type">${ntDef?.icon || ''} ${ntDef?.label || node.type}</div>
        <div class="wfe-field">
          <label>Label</label>
          <input type="text" class="filter-input" id="wfe-cfg-label" value="${_esc(node.label)}" />
        </div>
        ${configHTML}
        <div class="wfe-props-actions">
          <button class="btn btn-xs" id="wfe-disconnect">Disconnect</button>
          <button class="btn btn-xs btn-danger" id="wfe-delete-node">Delete</button>
        </div>
      </div>
    `;

    // Bind prop events
    document.getElementById('wfe-cfg-label')?.addEventListener('input', (e) => { node.label = e.target.value; _renderNodes(); });
    document.getElementById('wfe-cfg-agent')?.addEventListener('change', (e) => { node.config.agentId = e.target.value; });
    document.getElementById('wfe-cfg-prompt')?.addEventListener('input', (e) => { node.config.prompt = e.target.value; });
    document.getElementById('wfe-cfg-expr')?.addEventListener('input', (e) => { node.config.expression = e.target.value; });
    document.getElementById('wfe-cfg-delay')?.addEventListener('input', (e) => { node.config.ms = parseInt(e.target.value) || 0; });
    document.getElementById('wfe-cfg-format')?.addEventListener('change', (e) => { node.config.format = e.target.value; });
    document.getElementById('wfe-cfg-loop-type')?.addEventListener('change', (e) => { node.config.iterateOver = e.target.value; });
    document.getElementById('wfe-cfg-loop-max')?.addEventListener('input', (e) => { node.config.maxIterations = parseInt(e.target.value) || 10; });
    document.getElementById('wfe-cfg-webhook-url')?.addEventListener('input', (e) => { node.config.url = e.target.value; });
    document.getElementById('wfe-cfg-webhook-method')?.addEventListener('change', (e) => { node.config.method = e.target.value; });

    // Branch condition bindings
    document.querySelectorAll('.wfe-branch-expr').forEach(input => {
      input.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.idx);
        if (node.config.conditions[idx]) node.config.conditions[idx].expression = e.target.value;
      });
    });
    document.querySelectorAll('.wfe-branch-target').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx);
        if (node.config.conditions[idx]) node.config.conditions[idx].targetNodeId = e.target.value;
      });
    });
    document.getElementById('wfe-add-branch')?.addEventListener('click', () => {
      if (!node.config.conditions) node.config.conditions = [];
      node.config.conditions.push({ expression: 'result.success === true', targetNodeId: '' });
      _renderProps();
    });

    document.getElementById('wfe-disconnect')?.addEventListener('click', () => {
      _wf.connections = _wf.connections.filter(c => c.from !== node.id && c.to !== node.id);
      _drawConnections();
    });

    document.getElementById('wfe-delete-node')?.addEventListener('click', () => {
      _wf.nodes = _wf.nodes.filter(n => n.id !== node.id);
      _wf.connections = _wf.connections.filter(c => c.from !== node.id && c.to !== node.id);
      _selectedNode = null;
      _renderNodes();
      _drawConnections();
      _renderProps();
    });
  }

  /* ── Workflow Execution via WorkflowEngine ── */
  async function _runWorkflow() {
    if (!_wf.nodes.length) {
      Notify.send({ title: 'Empty', message: 'Add nodes before running.', type: 'system' });
      return;
    }
    if (typeof Gamification !== 'undefined') Gamification.addXP('run_workflow');

    const runBtn = document.getElementById('wfe-run');
    if (runBtn) { runBtn.disabled = true; runBtn.textContent = '⏳ Running...'; }

    // Use WorkflowEngine if available, else fall back to inline execution
    if (typeof WorkflowEngine !== 'undefined') {
      try {
        const result = await WorkflowEngine.execute(_wf, {
          onNodeStart: (node) => {
            const nodeEl = document.querySelector(`.wfe-node[data-id="${node.id}"]`);
            if (nodeEl) nodeEl.classList.add('running');
          },
          onNodeComplete: (node, res) => {
            const nodeEl = document.querySelector(`.wfe-node[data-id="${node.id}"]`);
            if (nodeEl) { nodeEl.classList.remove('running'); nodeEl.classList.add('completed'); }

            if (typeof ActivityFeed !== 'undefined') {
              const ntDef = NODE_TYPES.find(n => n.type === node.type);
              const preview = (res || '').slice(0, 80);
              ActivityFeed.push(ntDef?.icon || 'cog', `${node.label}: ${preview || 'done'}`, 'workflow');
            }
          },
          onError: (node, err) => {
            const nodeEl = document.querySelector(`.wfe-node[data-id="${node.id}"]`);
            if (nodeEl) { nodeEl.classList.remove('running'); nodeEl.classList.add('wfe-error'); }
          },
        });

        if (result.finalOutput) {
          Notify.send({ title: 'Workflow Output', message: result.finalOutput.slice(0, 200), type: 'system' });
        }

        Notify.send({
          title: result.status === 'completed' ? 'Workflow Complete' : 'Workflow Failed',
          message: `${result.nodeResults.size} nodes executed in ${result.duration}ms.`,
          type: 'system',
        });

        // Refresh run history
        await _loadRunHistory();
        const historyEl = document.getElementById('wfe-run-history');
        if (historyEl) { historyEl.innerHTML = _renderRunHistory(); _bindRunHistoryEvents(); }
      } catch (err) {
        Notify.send({ title: 'Workflow Error', message: err.message || 'Unknown error', type: 'system' });
      }
    } else {
      // Fallback: inline execution (legacy)
      await _runWorkflowInline();
    }

    setTimeout(() => {
      document.querySelectorAll('.wfe-node.completed, .wfe-node.wfe-skipped, .wfe-node.wfe-error').forEach(n => {
        n.classList.remove('completed', 'wfe-skipped', 'wfe-error');
      });
    }, 3000);

    if (runBtn) { runBtn.disabled = false; runBtn.textContent = '▶ Run'; }
  }

  /* ── Legacy inline execution (fallback) ── */
  async function _runWorkflowInline() {
    const order = _topoSort();
    const results = {};
    let halted = false;

    for (const nodeId of order) {
      if (halted) break;
      const node = _wf.nodes.find(n => n.id === nodeId);
      if (!node) continue;
      const nodeEl = document.querySelector(`.wfe-node[data-id="${nodeId}"]`);
      if (nodeEl) nodeEl.classList.add('running');

      const parentIds = _wf.connections.filter(c => c.to === nodeId).map(c => c.from);
      const input = parentIds.map(pid => results[pid] || '').filter(Boolean).join('\n\n');

      try {
        if (node.type === 'agent') {
          const agentId = node.config.agentId;
          const prompt = node.config.prompt || input || node.label;
          let agent = null;
          if (agentId) agent = (State.get('agents') || []).find(a => a.id === agentId);
          const spaceships = State.get('spaceships') || [];
          const shipId = spaceships.length ? spaceships[0].id : 'workflow-' + _wf.id;

          if (typeof ShipLog !== 'undefined') {
            const result = await ShipLog.execute(shipId, agent, input ? `${prompt}\n\nContext:\n${input}` : prompt);
            results[nodeId] = result ? result.content : 'No response';
          } else {
            results[nodeId] = 'ShipLog not available';
          }
        } else if (node.type === 'condition') {
          const expr = node.config.expression || 'true';
          try {
            const result = { text: input, length: input.length, success: input.length > 0 };
            const pass = new Function('result', `return !!(${expr})`)(result);
            if (!pass) {
              results[nodeId] = '';
              if (nodeEl) { nodeEl.classList.remove('running'); nodeEl.classList.add('wfe-skipped'); }
              continue;
            }
            results[nodeId] = input;
          } catch { results[nodeId] = input; }
        } else if (node.type === 'delay') {
          await new Promise(r => setTimeout(r, node.config.ms || 500));
          results[nodeId] = input;
        } else if (node.type === 'output') {
          const format = node.config.format || 'text';
          if (format === 'json') {
            try { results[nodeId] = JSON.stringify({ output: input }, null, 2); }
            catch { results[nodeId] = input; }
          } else if (format === 'csv') {
            results[nodeId] = input.split('\n').join(',');
          } else {
            results[nodeId] = input;
          }
        } else {
          results[nodeId] = input;
        }
      } catch (err) {
        results[nodeId] = 'Error: ' + (err.message || 'Unknown');
        if (nodeEl) nodeEl.classList.add('wfe-error');
      }

      if (nodeEl) { nodeEl.classList.remove('running'); nodeEl.classList.add('completed'); }
    }

    const outputNodes = _wf.nodes.filter(n => n.type === 'output');
    if (outputNodes.length) {
      const finalOutput = outputNodes.map(n => results[n.id] || '').filter(Boolean).join('\n---\n');
      if (finalOutput) {
        Notify.send({ title: 'Workflow Output', message: finalOutput.slice(0, 200), type: 'system' });
      }
    }

    Notify.send({ title: 'Workflow Complete', message: `${order.length} nodes executed.`, type: 'system' });
  }

  function _topoSort() {
    const visited = new Set();
    const order = [];
    const adj = {};
    _wf.nodes.forEach(n => { adj[n.id] = []; });
    _wf.connections.forEach(c => { if (adj[c.from]) adj[c.from].push(c.to); });

    function dfs(id) {
      if (visited.has(id)) return;
      visited.add(id);
      (adj[id] || []).forEach(next => dfs(next));
      order.unshift(id);
    }
    _wf.nodes.forEach(n => dfs(n.id));
    return order;
  }

  /* ── Run History ── */
  async function _loadRunHistory() {
    _runHistory = [];
    if (typeof SB === 'undefined' || !SB.isReady() || !_wf) return;

    try {
      const user = State.get('user');
      if (!user) return;
      const runs = await SB.db('workflow_runs').list({
        userId: user.id,
        orderBy: 'started_at',
      });
      if (Array.isArray(runs)) {
        _runHistory = runs
          .filter(r => r.workflow_id === _wf.id)
          .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))
          .slice(0, 20);
      }
    } catch (err) {
      console.warn('[Workflows] Failed to load run history:', err.message);
    }
  }

  function _renderRunHistory() {
    if (!_runHistory.length) {
      return '<p style="font-size:.82rem;color:var(--text-muted);padding:8px;">No runs yet. Click Run to execute this workflow.</p>';
    }

    return _runHistory.map((run, i) => {
      const statusClass = run.status === 'completed' ? 'dot-g' : 'dot-r';
      const dur = run.duration_ms ? `${run.duration_ms}ms` : '—';
      let nodeResultsHtml = '';
      try {
        const nr = typeof run.node_results === 'string' ? JSON.parse(run.node_results) : (run.node_results || {});
        nodeResultsHtml = Object.entries(nr).map(([nodeId, result]) => {
          const preview = (result || '').slice(0, 120);
          return `<div style="padding:4px 8px;font-size:.72rem;border-bottom:1px solid var(--border);"><strong>${nodeId}:</strong> ${_esc(preview)}</div>`;
        }).join('');
      } catch { /* ignore */ }

      return `
        <div class="wfe-run-entry" style="border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px;">
          <div class="wfe-run-header" data-idx="${i}" style="padding:8px 12px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <span class="status-dot ${statusClass}"></span>
              <span style="font-size:.78rem;font-weight:500;">${run.status}</span>
              <span style="font-size:.7rem;color:var(--text-muted);margin-left:8px;">${_timeAgo(run.started_at)}</span>
            </div>
            <span style="font-size:.7rem;color:var(--text-muted);">${dur}</span>
          </div>
          <div class="wfe-run-details" id="wfe-run-detail-${i}" style="display:none;max-height:200px;overflow:auto;background:var(--bg-alt);border-top:1px solid var(--border);">
            ${nodeResultsHtml || '<p style="padding:8px;font-size:.72rem;color:var(--text-muted);">No node results.</p>'}
          </div>
        </div>
      `;
    }).join('');
  }

  function _bindRunHistoryEvents() {
    document.querySelectorAll('.wfe-run-header').forEach(header => {
      header.addEventListener('click', () => {
        const idx = header.dataset.idx;
        const detail = document.getElementById('wfe-run-detail-' + idx);
        if (detail) {
          detail.style.display = detail.style.display === 'none' ? '' : 'none';
        }
      });
    });
  }

  /* ── Data Helpers (Supabase with localStorage fallback) ── */
  async function _getWorkflow(id) {
    // Try Supabase first
    try {
      if (typeof SB !== 'undefined' && SB.isReady()) {
        const user = State.get('user');
        if (user) {
          const data = await SB.db('user_workflows').list({ userId: user.id });
          if (Array.isArray(data)) {
            const wf = data.find(w => w.id === id);
            if (wf) {
              return {
                ...wf,
                nodes: typeof wf.nodes === 'string' ? JSON.parse(wf.nodes) : (wf.nodes || []),
                connections: typeof wf.connections === 'string' ? JSON.parse(wf.connections) : (wf.connections || []),
                trigger: typeof wf.trigger === 'string' ? JSON.parse(wf.trigger) : (wf.trigger || { type: 'manual' }),
              };
            }
          }
        }
      }
    } catch (err) {
      console.warn('[Workflows] DB get failed, using localStorage:', err.message);
    }

    // Fallback
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return all.find(w => w.id === id) || null;
    } catch { return null; }
  }

  async function _saveWorkflow() {
    if (!_wf) return;

    // Try Supabase first
    try {
      if (typeof SB !== 'undefined' && SB.isReady()) {
        const user = State.get('user');
        if (user) {
          await SB.db('user_workflows').update(_wf.id, {
            name: _wf.name,
            nodes: JSON.stringify(_wf.nodes),
            connections: JSON.stringify(_wf.connections),
            trigger: JSON.stringify(_wf.trigger || { type: 'manual' }),
          });
          return;
        }
      }
    } catch (err) {
      console.warn('[Workflows] DB save failed, using localStorage:', err.message);
    }

    // Fallback
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      const idx = all.findIndex(w => w.id === _wf.id);
      if (idx >= 0) all[idx] = _wf; else all.push(_wf);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
      console.error('[Workflow] Save failed:', e);
    }
  }

  /* ── Step 38: Collaborative editing presence ── */
  function _trackWorkflowPresence(workflowId) {
    if (typeof SB === 'undefined' || !SB.realtime) return;
    // Clean up any previous channel
    if (_presenceChannel) {
      try { SB.realtime.unsubscribe(_presenceChannel); } catch (_e) { /* ignore */ }
      _presenceChannel = null;
    }

    const user = State.get('user');
    if (!user) return;

    const displayName = user.user_metadata?.display_name || user.email || 'Unknown';

    try {
      _presenceChannel = SB.client
        .channel('workflow-edit-' + workflowId, { config: { presence: { key: user.id } } });

      _presenceChannel
        .on('presence', { event: 'sync' }, () => {
          const state = _presenceChannel.presenceState();
          const others = [];
          for (const key of Object.keys(state)) {
            if (key === user.id) continue;
            const entries = state[key];
            if (entries && entries.length) others.push(entries[0].display_name || 'Someone');
          }
          const indicator = document.getElementById('wfe-collab-indicator');
          if (!indicator) return;
          if (others.length === 0) {
            indicator.textContent = '';
          } else if (others.length === 1) {
            indicator.textContent = 'Being edited by ' + others[0];
          } else {
            indicator.textContent = 'Being edited by ' + others.join(', ');
          }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await _presenceChannel.track({ display_name: displayName, view: 'workflow-editor' });
          }
        });
    } catch (e) {
      console.warn('[WorkflowDetail] Presence tracking failed:', e.message || e);
    }
  }

  function destroy() {
    // Auto-save on leave
    if (_wf) _saveWorkflow();
    _selectedNode = null;
    _connecting = null;
    _dragging = null;
    // Clean up presence channel
    if (_presenceChannel) {
      try { SB.realtime.unsubscribe(_presenceChannel); } catch (_e) { /* ignore */ }
      _presenceChannel = null;
    }
  }

  return { title, render, destroy };
})();

