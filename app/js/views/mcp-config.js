/* ═══════════════════════════════════════════════════════════════════
   NICE — MCP Config View
   Manage MCP server connections at the account level.
   All agents across all spaceships can access connected MCPs.
   Rendered as a tab inside the Security view.
═══════════════════════════════════════════════════════════════════ */

const McpConfigView = (() => {
  const _esc = typeof Utils !== 'undefined' ? Utils.esc : (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const _timeAgo = typeof Utils !== 'undefined' ? Utils.timeAgo : () => '';

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
  function _seedConnections() {
    return [
      { id:'mc1', name:'Google Workspace', server_url:'https://mcp.google.com/workspace', transport:'streamable-http', auth_type:'oauth', available_tools:['gmail','drive','calendar','docs'], status:'connected', catalog_id:'google', created_at:new Date(Date.now() - 604800000).toISOString() },
      { id:'mc2', name:'GitHub', server_url:'https://mcp.github.com', transport:'streamable-http', auth_type:'oauth', available_tools:['repos','pull_requests','issues','actions'], status:'connected', catalog_id:'github', created_at:new Date(Date.now() - 1209600000).toISOString() },
    ];
  }

  /* ── Render ───────────────────────────────────────────────────── */
  function render(el) {
    const conns = State.get('mcp_connections') || _loadConnections();

    el.innerHTML = `
      <div class="mcp-config-wrap">
        <!-- Header -->
        <div class="mcp-config-header">
          <div>
            <h3 class="mcp-config-title">MCP Connections</h3>
            <p class="mcp-config-sub">Connect MCP servers to your account. All agents across every spaceship can access these tools.</p>
          </div>
        </div>

        <!-- Stats -->
        <div class="mcp-config-stats">
          <div class="mcp-stat">
            <span class="mcp-stat-num">${conns.length}</span>
            <span class="mcp-stat-label">Connected</span>
          </div>
          <div class="mcp-stat">
            <span class="mcp-stat-num">${conns.reduce((sum, c) => sum + (c.available_tools || []).length, 0)}</span>
            <span class="mcp-stat-label">Tools Available</span>
          </div>
          <div class="mcp-stat">
            <span class="status-dot ${conns.some(c => c.status === 'error') ? 'dot-r' : 'dot-g'}"></span>
            <span class="mcp-stat-num">${conns.filter(c => c.status === 'connected').length}</span>
            <span class="mcp-stat-label">Online</span>
          </div>
        </div>

        <!-- MCP Catalog -->
        <div class="mcp-config-section">
          <h4 class="mcp-config-section-title">Available MCPs</h4>
          <div class="mcp-catalog-grid" id="mcp-catalog-grid">
            ${MCP_CATALOG.map(mcp => {
              const conn = conns.find(c => c.catalog_id === mcp.id);
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
        </div>

        <!-- Custom MCP -->
        <div class="mcp-config-section">
          <h4 class="mcp-config-section-title">Custom MCP Server</h4>
          <p class="text-muted" style="margin:0 0 12px;font-size:.78rem">Connect any MCP-compatible server by URL.</p>
          <button class="btn btn-sm" id="btn-add-custom-mcp">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-plus"/></svg>
            Add Custom MCP
          </button>
        </div>

        <!-- Active Connections -->
        ${conns.length ? `
        <div class="mcp-config-section">
          <h4 class="mcp-config-section-title">Active Connections</h4>
          <div class="mcp-connections-list" id="mcp-connections-list">
            ${conns.map(c => _renderConnectionRow(c)).join('')}
          </div>
        </div>
        ` : ''}
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

  function _renderConnectionRow(c) {
    const catalogEntry = MCP_CATALOG.find(m => m.id === c.catalog_id);
    const icon = catalogEntry ? catalogEntry.icon : 'cpu';
    const toolCount = (c.available_tools || []).length;
    const dot = c.status === 'connected' ? 'dot-g' : c.status === 'error' ? 'dot-r' : 'dot-a';

    return `
      <div class="mcp-conn-row" data-conn-id="${c.id}">
        <div class="mcp-conn-icon">
          <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-${icon}"/></svg>
        </div>
        <div class="mcp-conn-info">
          <span class="mcp-conn-name">${_esc(c.name)}</span>
          <span class="mcp-conn-url mono">${_esc(c.server_url || '')}</span>
        </div>
        <div class="mcp-conn-tools">
          <span class="mcp-tool-count">${toolCount} tool${toolCount !== 1 ? 's' : ''}</span>
        </div>
        <div class="mcp-conn-meta">
          <span class="status-dot ${dot}"></span>
          <span class="mcp-conn-status">${c.status}</span>
        </div>
        <button class="agent-action-btn mcp-remove-btn" data-conn-id="${c.id}" title="Disconnect">
          <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-x"/></svg>
        </button>
      </div>
    `;
  }

  /* ── Data ──────────────────────────────────────────────────────── */
  function _loadConnections() {
    const user = State.get('user');
    if (!user) return [];

    SB.db('mcp_connections').list({ userId: user.id }).then(rows => {
      if (rows && rows.length) {
        State.set('mcp_connections', rows);
      }
    }).catch(() => {});

    const seed = _seedConnections();
    State.set('mcp_connections', seed);
    return seed;
  }

  /* ── Events ───────────────────────────────────────────────────── */
  function _bindEvents(el) {
    // Catalog connect
    el.querySelectorAll('.mcp-connect-btn').forEach(btn => {
      btn.addEventListener('click', () => _connectCatalogMcp(btn.dataset.catalogId, el));
    });

    // Catalog disconnect
    el.querySelectorAll('.mcp-disconnect-btn').forEach(btn => {
      btn.addEventListener('click', () => _disconnect(btn.dataset.connId, el));
    });

    // List remove
    el.querySelectorAll('.mcp-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => _disconnect(btn.dataset.connId, el));
    });

    // Custom MCP modal
    document.getElementById('btn-add-custom-mcp')?.addEventListener('click', () => {
      document.getElementById('modal-add-mcp')?.classList.add('open');
    });
    document.getElementById('close-mcp-modal')?.addEventListener('click', _closeMcpModal);
    document.getElementById('modal-add-mcp')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-add-mcp') _closeMcpModal();
    });

    // Custom form
    document.getElementById('mcp-custom-form')?.addEventListener('submit', (e) => _addCustomMcp(e, el));
  }

  function _closeMcpModal() {
    document.getElementById('modal-add-mcp')?.classList.remove('open');
    document.getElementById('mcp-custom-form')?.reset();
  }

  function _connectCatalogMcp(catalogId, el) {
    const catalog = MCP_CATALOG.find(m => m.id === catalogId);
    if (!catalog) return;

    // Check if already connected
    const conns = State.get('mcp_connections') || [];
    if (conns.find(c => c.catalog_id === catalogId)) return;

    const conn = {
      id: 'mc-' + Date.now(),
      name: catalog.name,
      server_url: `https://mcp.${catalogId}.com`,
      transport: catalog.transport,
      auth_type: catalog.auth,
      available_tools: catalog.tools,
      status: 'connected',
      catalog_id: catalogId,
      created_at: new Date().toISOString(),
    };

    conns.push(conn);
    State.set('mcp_connections', conns);

    // Try saving to Supabase
    const user = State.get('user');
    if (user) {
      SB.db('mcp_connections').create({
        user_id: user.id,
        spaceship_id: 'account',
        name: catalog.name,
        server_url: conn.server_url,
        transport: catalog.transport,
        auth_type: catalog.auth,
        available_tools: catalog.tools,
        status: 'connected',
      }).catch(() => {});
    }

    render(el);

    if (typeof Notify !== 'undefined') {
      Notify.send({ title: 'MCP Connected', message: `${catalog.name} is now available to all your agents.`, type: 'system' });
    }
  }

  async function _addCustomMcp(e, el) {
    e.preventDefault();
    const errEl = document.getElementById('mcp-error');
    const name = document.getElementById('mcp-name').value.trim();
    const url = document.getElementById('mcp-url').value.trim();
    const transport = document.getElementById('mcp-transport').value;
    const auth = document.getElementById('mcp-auth').value;

    if (!name || !url) {
      errEl.textContent = 'Name and URL are required.';
      return;
    }

    const conn = {
      id: 'mc-' + Date.now(),
      name,
      server_url: url,
      transport,
      auth_type: auth,
      available_tools: [],
      status: 'connected',
      catalog_id: null,
      created_at: new Date().toISOString(),
    };

    const connections = State.get('mcp_connections') || [];
    connections.push(conn);
    State.set('mcp_connections', connections);

    const user = State.get('user');
    if (user) {
      SB.db('mcp_connections').create({
        user_id: user.id,
        spaceship_id: 'account',
        name, server_url: url, transport, auth_type: auth,
        available_tools: [], status: 'connected',
      }).catch(() => {});
    }

    _closeMcpModal();
    render(el);

    if (typeof Notify !== 'undefined') {
      Notify.send({ title: 'Custom MCP Connected', message: `${name} is now available to all your agents.`, type: 'system' });
    }
  }

  async function _disconnect(connId, el) {
    if (!confirm('Disconnect this MCP? All agents will lose access to its tools.')) return;

    let connections = State.get('mcp_connections') || [];
    connections = connections.filter(c => c.id !== connId);
    State.set('mcp_connections', connections);

    if (!connId.startsWith('mc')) {
      SB.db('mcp_connections').remove(connId).catch(() => {});
    }

    render(el);

    if (typeof Notify !== 'undefined') {
      Notify.send({ title: 'MCP Disconnected', message: 'MCP connection removed.', type: 'system' });
    }
  }

  return { render, MCP_CATALOG };
})();
