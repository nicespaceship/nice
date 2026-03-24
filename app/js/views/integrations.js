/* ═══════════════════════════════════════════════════════════════════
   NICE — Integrations View
   Combined API keys + MCP server connections management.
   Rendered as a tab inside Security, or standalone via #/integrations.
═══════════════════════════════════════════════════════════════════ */

const IntegrationsView = (() => {
  const title = 'Integrations';
  const _esc = typeof Utils !== 'undefined' ? Utils.esc : (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const _timeAgo = typeof Utils !== 'undefined' ? Utils.timeAgo : () => '';

  /* ── API Service Catalog ──────────────────────────────────────── */
  const API_CATALOG = [
    { id:'stripe',    name:'Stripe',    desc:'Payments, invoices, customers',   icon:'wallet' },
    { id:'openai',    name:'OpenAI',    desc:'GPT, DALL-E, Whisper APIs',       icon:'cpu' },
    { id:'anthropic', name:'Anthropic', desc:'Claude API, completions',         icon:'cpu' },
    { id:'twilio',    name:'Twilio',    desc:'SMS, voice, messaging',           icon:'chat' },
    { id:'sendgrid',  name:'SendGrid',  desc:'Transactional & marketing email', icon:'mail' },
    { id:'github',    name:'GitHub',    desc:'Repos, Actions, API access',      icon:'code' },
    { id:'aws',       name:'AWS',       desc:'S3, Lambda, SES, and more',       icon:'cloud' },
    { id:'custom',    name:'Custom',    desc:'Add any API key manually',        icon:'plus' },
  ];

  /* ── MCP Server Catalog ───────────────────────────────────────── */
  const MCP_CATALOG = [
    { id:'google',   name:'Google Workspace', desc:'Gmail, Drive, Calendar, Docs',  icon:'mail',      tools:['gmail','drive','calendar','docs'],          transport:'streamable-http', auth:'oauth' },
    { id:'slack',    name:'Slack',            desc:'Channels, DMs, threads',        icon:'chat',      tools:['channels','messages','threads'],             transport:'streamable-http', auth:'oauth' },
    { id:'github',   name:'GitHub',           desc:'Repos, PRs, Issues, Actions',   icon:'code',      tools:['repos','pull_requests','issues','actions'],  transport:'streamable-http', auth:'oauth' },
    { id:'notion',   name:'Notion',           desc:'Pages, databases, blocks',      icon:'file',      tools:['pages','databases','search'],                transport:'streamable-http', auth:'oauth' },
    { id:'stripe',   name:'Stripe',           desc:'Payments, invoices, customers', icon:'wallet',    tools:['payments','invoices','customers','products'], transport:'streamable-http', auth:'api_key' },
    { id:'supabase', name:'Supabase',         desc:'Database, auth, storage, edge', icon:'database',  tools:['sql','auth','storage','edge_functions'],     transport:'streamable-http', auth:'api_key' },
    { id:'figma',    name:'Figma',            desc:'Designs, components, comments', icon:'palette',   tools:['files','components','comments','variables'], transport:'streamable-http', auth:'oauth' },
    { id:'linear',   name:'Linear',           desc:'Issues, projects, cycles',      icon:'target',    tools:['issues','projects','cycles','teams'],        transport:'streamable-http', auth:'oauth' },
    { id:'jira',     name:'Jira',             desc:'Issues, sprints, boards',       icon:'clipboard', tools:['issues','sprints','boards','projects'],      transport:'streamable-http', auth:'oauth' },
  ];

  /* ── Demo seed data ───────────────────────────────────────────── */
  function _seedApiConnections() {
    return [
      { id:'ac1', service:'stripe',  status:'active', masked:'sk_live_...4242', spaceship_ids:['ship-1'], created_at:new Date(Date.now() - 604800000).toISOString(), last_used:new Date(Date.now() - 3600000).toISOString() },
      { id:'ac2', service:'openai',  status:'active', masked:'sk-...q8Xm',     spaceship_ids:['ship-1','ship-2'], created_at:new Date(Date.now() - 1209600000).toISOString(), last_used:new Date(Date.now() - 7200000).toISOString() },
    ];
  }
  function _seedMcpConnections() {
    return [
      { id:'mc1', name:'Google Workspace', server_url:'https://mcp.google.com/workspace', transport:'streamable-http', auth_type:'oauth', available_tools:['gmail','drive','calendar','docs'], status:'connected', catalog_id:'google', created_at:new Date(Date.now() - 604800000).toISOString() },
      { id:'mc2', name:'GitHub', server_url:'https://mcp.github.com', transport:'streamable-http', auth_type:'oauth', available_tools:['repos','pull_requests','issues','actions'], status:'connected', catalog_id:'github', created_at:new Date(Date.now() - 1209600000).toISOString() },
    ];
  }

  /* ── Render ───────────────────────────────────────────────────── */
  function render(el) {
    const apis = State.get('api_connections') || _loadApis();
    const mcps = State.get('mcp_connections') || _loadMcps();
    const totalTools = mcps.reduce((sum, c) => sum + (c.available_tools || []).length, 0);

    el.innerHTML = `
      <div class="integrations-wrap">
        <!-- Stats Bar -->
        <div class="integrations-stats">
          <div class="intg-stat">
            <span class="intg-stat-num">${apis.length}</span>
            <span class="intg-stat-label">APIs</span>
          </div>
          <div class="intg-stat">
            <span class="intg-stat-num">${mcps.length}</span>
            <span class="intg-stat-label">MCPs</span>
          </div>
          <div class="intg-stat">
            <span class="intg-stat-num">${totalTools}</span>
            <span class="intg-stat-label">Tools</span>
          </div>
          <div class="intg-stat">
            <span class="status-dot dot-g"></span>
            <span class="intg-stat-num">${apis.filter(a => a.status === 'active').length + mcps.filter(m => m.status === 'connected').length}</span>
            <span class="intg-stat-label">Online</span>
          </div>
        </div>

        <!-- ═══ MCP Servers Section ═══ -->
        <div class="integrations-section">
          <div class="integrations-section-header">
            <h3 class="integrations-section-title">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-cpu"/></svg>
              MCP Servers
            </h3>
            <p class="integrations-section-desc">Connect MCP servers so all your agents can use their tools.</p>
          </div>
          <div class="mcp-catalog-grid" id="intg-mcp-grid">
            ${MCP_CATALOG.map(mcp => {
              const conn = mcps.find(c => c.catalog_id === mcp.id);
              const connected = !!conn;
              return `
                <div class="mcp-catalog-card ${connected ? 'mcp-catalog-card--connected' : ''}">
                  <div class="mcp-catalog-top">
                    <div class="mcp-catalog-icon">
                      <svg class="icon icon-md" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-${mcp.icon}"/></svg>
                    </div>
                    <div class="mcp-catalog-info">
                      <span class="mcp-catalog-name">${mcp.name}</span>
                      <span class="mcp-catalog-desc">${mcp.desc}</span>
                    </div>
                  </div>
                  <div class="mcp-catalog-tools">
                    ${mcp.tools.map(t => `<span class="mcp-tool-pill">${t}</span>`).join('')}
                  </div>
                  <div class="mcp-catalog-footer">
                    <span class="mcp-catalog-transport mono">${mcp.transport}</span>
                    ${connected
                      ? `<button class="btn btn-sm mcp-disconnect-btn" data-catalog-id="${mcp.id}" data-conn-id="${conn.id}">
                          <span class="status-dot dot-g"></span> Connected
                        </button>`
                      : `<button class="btn btn-sm btn-primary mcp-connect-btn" data-catalog-id="${mcp.id}">Connect</button>`
                    }
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          <div style="margin-top:12px">
            <button class="btn btn-sm" id="btn-add-custom-mcp">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-plus"/></svg>
              Add Custom MCP
            </button>
          </div>
        </div>

        <!-- ═══ API Keys Section ═══ -->
        <div class="integrations-section">
          <div class="integrations-section-header">
            <h3 class="integrations-section-title">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-code"/></svg>
              API Keys
            </h3>
            <p class="integrations-section-desc">Direct API key integrations. Keys are encrypted and stored in the Vault.</p>
          </div>
          <div class="api-catalog-grid" id="intg-api-grid">
            ${API_CATALOG.map(svc => {
              const conn = apis.find(c => c.service === svc.id);
              const connected = !!conn;
              return `
                <div class="api-catalog-card ${connected ? 'api-catalog-card--connected' : ''}" data-service="${svc.id}">
                  <div class="api-catalog-icon">
                    <svg class="icon icon-md" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-${svc.icon}"/></svg>
                  </div>
                  <div class="api-catalog-info">
                    <span class="api-catalog-name">${svc.name}</span>
                    <span class="api-catalog-desc">${svc.desc}</span>
                  </div>
                  <div class="api-catalog-action">
                    ${connected
                      ? `<button class="btn btn-sm api-disconnect-btn" data-service="${svc.id}" data-conn-id="${conn.id}">Disconnect</button>`
                      : `<button class="btn btn-sm btn-primary api-connect-btn" data-service="${svc.id}">Connect</button>`
                    }
                  </div>
                  ${connected ? `<span class="api-catalog-status"><span class="status-dot dot-g"></span> Active</span>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- Add API Modal -->
      <div class="modal-overlay" id="modal-add-api">
        <div class="modal-box">
          <div class="modal-hdr">
            <h3 class="modal-title">Connect API</h3>
            <button class="modal-close" id="close-api-modal" aria-label="Close">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-x"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <form id="api-connect-form" class="auth-form">
              <div class="auth-field">
                <label for="api-service-name">Service</label>
                <input type="text" id="api-service-name" readonly />
              </div>
              <div class="auth-field">
                <label for="api-key-input">API Key</label>
                <input type="password" id="api-key-input" required placeholder="Enter your API key..." />
              </div>
              <input type="hidden" id="api-service-id" />
              <div class="auth-error" id="api-error"></div>
              <button type="submit" class="auth-submit">Connect API</button>
            </form>
          </div>
        </div>
      </div>

      <!-- Custom MCP Modal -->
      <div class="modal-overlay" id="modal-add-mcp">
        <div class="modal-box">
          <div class="modal-hdr">
            <h3 class="modal-title">Add Custom MCP Server</h3>
            <button class="modal-close" id="close-mcp-modal" aria-label="Close">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-x"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <form id="mcp-custom-form" class="auth-form">
              <div class="auth-field">
                <label for="mcp-name">Server Name</label>
                <input type="text" id="mcp-name" required placeholder="e.g. My Custom MCP" />
              </div>
              <div class="auth-field">
                <label for="mcp-url">Server URL</label>
                <input type="url" id="mcp-url" required placeholder="https://mcp.example.com" />
              </div>
              <div class="auth-field">
                <label for="mcp-transport">Transport</label>
                <select id="mcp-transport" class="filter-select builder-select">
                  <option value="streamable-http">Streamable HTTP</option>
                  <option value="sse">SSE (Server-Sent Events)</option>
                  <option value="stdio">Stdio</option>
                </select>
              </div>
              <div class="auth-field">
                <label for="mcp-auth">Authentication</label>
                <select id="mcp-auth" class="filter-select builder-select">
                  <option value="none">None</option>
                  <option value="api_key">API Key</option>
                  <option value="oauth">OAuth</option>
                  <option value="bearer">Bearer Token</option>
                </select>
              </div>
              <div class="auth-error" id="mcp-error"></div>
              <button type="submit" class="auth-submit">Connect Server</button>
            </form>
          </div>
        </div>
      </div>
    `;

    _bindEvents(el);
  }

  /* ── Data Loading ─────────────────────────────────────────────── */
  function _loadApis() {
    const user = State.get('user');
    if (!user) return [];
    SB.db('api_connections').list({ userId: user.id }).then(rows => {
      if (rows && rows.length) State.set('api_connections', rows);
    }).catch(() => {});
    const seed = _seedApiConnections();
    State.set('api_connections', seed);
    return seed;
  }

  function _loadMcps() {
    const user = State.get('user');
    if (!user) return [];
    SB.db('mcp_connections').list({ userId: user.id }).then(rows => {
      if (rows && rows.length) State.set('mcp_connections', rows);
    }).catch(() => {});
    const seed = _seedMcpConnections();
    State.set('mcp_connections', seed);
    return seed;
  }

  /* ── Events ───────────────────────────────────────────────────── */
  function _bindEvents(el) {
    // MCP connect/disconnect
    el.querySelectorAll('.mcp-connect-btn').forEach(btn => {
      btn.addEventListener('click', () => _connectMcp(btn.dataset.catalogId, el));
    });
    el.querySelectorAll('.mcp-disconnect-btn').forEach(btn => {
      btn.addEventListener('click', () => _disconnectMcp(btn.dataset.connId, el));
    });

    // API connect/disconnect
    el.querySelectorAll('.api-connect-btn').forEach(btn => {
      btn.addEventListener('click', () => _openApiModal(btn.dataset.service));
    });
    el.querySelectorAll('.api-disconnect-btn').forEach(btn => {
      btn.addEventListener('click', () => _disconnectApi(btn.dataset.connId, el));
    });

    // Custom MCP modal
    document.getElementById('btn-add-custom-mcp')?.addEventListener('click', () => {
      document.getElementById('modal-add-mcp')?.classList.add('open');
    });
    document.getElementById('close-mcp-modal')?.addEventListener('click', () => {
      document.getElementById('modal-add-mcp')?.classList.remove('open');
      document.getElementById('mcp-custom-form')?.reset();
    });
    document.getElementById('modal-add-mcp')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-add-mcp') { e.target.classList.remove('open'); document.getElementById('mcp-custom-form')?.reset(); }
    });
    document.getElementById('mcp-custom-form')?.addEventListener('submit', (e) => _addCustomMcp(e, el));

    // API modal
    document.getElementById('close-api-modal')?.addEventListener('click', () => {
      document.getElementById('modal-add-api')?.classList.remove('open');
    });
    document.getElementById('modal-add-api')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-add-api') e.target.classList.remove('open');
    });
    document.getElementById('api-connect-form')?.addEventListener('submit', (e) => _connectApi(e, el));
  }

  /* ── MCP Actions ──────────────────────────────────────────────── */
  function _connectMcp(catalogId, el) {
    const catalog = MCP_CATALOG.find(m => m.id === catalogId);
    if (!catalog) return;
    const conns = State.get('mcp_connections') || [];
    if (conns.find(c => c.catalog_id === catalogId)) return;

    const conn = {
      id: 'mc-' + Date.now(), name: catalog.name,
      server_url: `https://mcp.${catalogId}.com`, transport: catalog.transport,
      auth_type: catalog.auth, available_tools: catalog.tools,
      status: 'connected', catalog_id: catalogId, created_at: new Date().toISOString(),
    };
    conns.push(conn);
    State.set('mcp_connections', conns);

    const user = State.get('user');
    if (user) {
      SB.db('mcp_connections').create({
        user_id: user.id, spaceship_id: 'account', name: catalog.name,
        server_url: conn.server_url, transport: catalog.transport,
        auth_type: catalog.auth, available_tools: catalog.tools, status: 'connected',
      }).catch(() => {});
    }
    render(el);
    if (typeof Notify !== 'undefined') Notify.send({ title: 'MCP Connected', message: `${catalog.name} is now available to all your agents.`, type: 'system' });
  }

  function _disconnectMcp(connId, el) {
    if (!confirm('Disconnect this MCP? All agents will lose access to its tools.')) return;
    let conns = State.get('mcp_connections') || [];
    conns = conns.filter(c => c.id !== connId);
    State.set('mcp_connections', conns);
    if (!connId.startsWith('mc')) SB.db('mcp_connections').remove(connId).catch(() => {});
    render(el);
    if (typeof Notify !== 'undefined') Notify.send({ title: 'MCP Disconnected', message: 'Connection removed.', type: 'system' });
  }

  function _addCustomMcp(e, el) {
    e.preventDefault();
    const errEl = document.getElementById('mcp-error');
    const name = document.getElementById('mcp-name').value.trim();
    const url = document.getElementById('mcp-url').value.trim();
    const transport = document.getElementById('mcp-transport').value;
    const auth = document.getElementById('mcp-auth').value;
    if (!name || !url) { errEl.textContent = 'Name and URL are required.'; return; }

    const conn = {
      id: 'mc-' + Date.now(), name, server_url: url, transport, auth_type: auth,
      available_tools: [], status: 'connected', catalog_id: null, created_at: new Date().toISOString(),
    };
    const conns = State.get('mcp_connections') || [];
    conns.push(conn);
    State.set('mcp_connections', conns);
    const user = State.get('user');
    if (user) {
      SB.db('mcp_connections').create({ user_id: user.id, spaceship_id: 'account', name, server_url: url, transport, auth_type: auth, available_tools: [], status: 'connected' }).catch(() => {});
    }
    document.getElementById('modal-add-mcp')?.classList.remove('open');
    document.getElementById('mcp-custom-form')?.reset();
    render(el);
    if (typeof Notify !== 'undefined') Notify.send({ title: 'Custom MCP Connected', message: `${name} is now available to all your agents.`, type: 'system' });
  }

  /* ── API Actions ──────────────────────────────────────────────── */
  function _openApiModal(serviceId) {
    const svc = API_CATALOG.find(s => s.id === serviceId);
    if (!svc) return;
    document.getElementById('api-service-name').value = svc.name;
    document.getElementById('api-service-id').value = serviceId;
    document.getElementById('api-key-input').value = '';
    document.getElementById('api-error').textContent = '';
    document.getElementById('modal-add-api')?.classList.add('open');
  }

  function _connectApi(e, el) {
    e.preventDefault();
    const serviceId = document.getElementById('api-service-id').value;
    const apiKey = document.getElementById('api-key-input').value.trim();
    const errEl = document.getElementById('api-error');
    if (!apiKey) { errEl.textContent = 'API key is required.'; return; }

    const masked = apiKey.slice(0, 6) + '...' + apiKey.slice(-4);
    const conn = {
      id: 'ac-' + Date.now(), service: serviceId, status: 'active', masked,
      spaceship_ids: [], created_at: new Date().toISOString(), last_used: new Date().toISOString(),
    };
    const apis = State.get('api_connections') || [];
    const filtered = apis.filter(c => c.service !== serviceId);
    filtered.push(conn);
    State.set('api_connections', filtered);

    const user = State.get('user');
    if (user) {
      SB.db('api_connections').create({ user_id: user.id, service: serviceId, spaceship_ids: [], status: 'active', config: { masked } }).catch(() => {});
    }
    document.getElementById('modal-add-api')?.classList.remove('open');
    render(el);
    if (typeof Notify !== 'undefined') Notify.send({ title: 'API Connected', message: `${serviceId} API connected.`, type: 'system' });
  }

  function _disconnectApi(connId, el) {
    if (!confirm('Disconnect this API? Agents using it will lose access.')) return;
    let apis = State.get('api_connections') || [];
    apis = apis.filter(c => c.id !== connId);
    State.set('api_connections', apis);
    if (!connId.startsWith('ac')) SB.db('api_connections').remove(connId).catch(() => {});
    render(el);
    if (typeof Notify !== 'undefined') Notify.send({ title: 'API Disconnected', message: 'Connection removed.', type: 'system' });
  }

  return { title, render, API_CATALOG, MCP_CATALOG };
})();
