/* ═══════════════════════════════════════════════════════════════════
   NICE — Integrations View
   Combined API keys + MCP server connections management.
   Rendered as a tab inside Security, or standalone via #/integrations.
═══════════════════════════════════════════════════════════════════ */

const IntegrationsView = (() => {
  const title = 'Integrations';
  const _esc = typeof Utils !== 'undefined' ? Utils.esc : (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* ── MCP Server Catalog ───────────────────────────────────────── */
  const MCP_CATALOG = [
    /* Productivity & Workspace */
    { id:'google',       name:'Google Workspace',  desc:'Gmail, Drive, Calendar, Docs',       icon:'mail',      tools:['gmail','drive','calendar','docs'],            transport:'streamable-http', auth:'oauth',   cat:'workspace' },
    { id:'slack',        name:'Slack',             desc:'Channels, DMs, threads',             icon:'chat',      tools:['channels','messages','threads'],              transport:'streamable-http', auth:'oauth',   cat:'workspace' },
    { id:'notion',       name:'Notion',            desc:'Pages, databases, blocks',           icon:'file',      tools:['pages','databases','search'],                 transport:'streamable-http', auth:'oauth',   cat:'workspace' },
    { id:'confluence',   name:'Confluence',        desc:'Wiki, documentation, spaces',        icon:'file',      tools:['pages','spaces','search','comments'],         transport:'streamable-http', auth:'oauth',   cat:'workspace' },
    { id:'ms-teams',     name:'Microsoft Teams',   desc:'Chat, channels, meetings',           icon:'chat',      tools:['messages','channels','teams','meetings'],     transport:'streamable-http', auth:'oauth',   cat:'workspace' },
    { id:'sharepoint',   name:'SharePoint',        desc:'Sites, documents, lists',            icon:'file',      tools:['sites','documents','lists','search'],         transport:'streamable-http', auth:'oauth',   cat:'workspace' },
    { id:'onedrive',     name:'OneDrive',          desc:'Files, folders, sharing',            icon:'file',      tools:['files','folders','sharing','search'],          transport:'streamable-http', auth:'oauth',   cat:'workspace' },
    { id:'box',          name:'Box',               desc:'Secure cloud content management',    icon:'file',      tools:['files','folders','metadata','search'],         transport:'streamable-http', auth:'oauth',   cat:'workspace' },
    /* Code & DevOps */
    { id:'github',       name:'GitHub',            desc:'Repos, PRs, Issues, Actions',        icon:'code',      tools:['repos','pull_requests','issues','actions'],   transport:'streamable-http', auth:'oauth',   cat:'dev' },
    { id:'gitlab',       name:'GitLab',            desc:'Repos, merge requests, CI/CD',       icon:'code',      tools:['repos','merge_requests','pipelines','issues'],transport:'streamable-http', auth:'oauth',   cat:'dev' },
    { id:'bitbucket',    name:'Bitbucket',         desc:'Repos, PRs, Pipelines',              icon:'code',      tools:['repos','pull_requests','pipelines'],          transport:'streamable-http', auth:'oauth',   cat:'dev' },
    { id:'azure-devops', name:'Azure DevOps',      desc:'Boards, repos, pipelines',           icon:'code',      tools:['work_items','repos','pipelines','boards'],    transport:'streamable-http', auth:'oauth',   cat:'dev' },
    { id:'vercel',       name:'Vercel',            desc:'Deployments, domains, logs',          icon:'cloud',     tools:['deployments','projects','domains','logs'],    transport:'streamable-http', auth:'api_key', cat:'dev' },
    { id:'sentry',       name:'Sentry',            desc:'Errors, performance, releases',      icon:'alert',     tools:['issues','events','releases','performance'],   transport:'streamable-http', auth:'api_key', cat:'dev' },
    /* Data & Databases */
    { id:'supabase',     name:'Supabase',          desc:'Database, auth, storage, edge',      icon:'database',  tools:['sql','auth','storage','edge_functions'],      transport:'streamable-http', auth:'api_key', cat:'data' },
    { id:'stripe',       name:'Stripe',            desc:'Payments, invoices, customers',      icon:'wallet',    tools:['payments','invoices','customers','products'], transport:'streamable-http', auth:'api_key', cat:'data' },
    { id:'snowflake',    name:'Snowflake',         desc:'Data warehouse queries, stages',     icon:'database',  tools:['sql','stages','tasks','streams'],             transport:'streamable-http', auth:'api_key', cat:'data' },
    { id:'bigquery',     name:'BigQuery',          desc:'Serverless analytics, datasets',     icon:'database',  tools:['sql','datasets','tables','jobs'],             transport:'streamable-http', auth:'oauth',   cat:'data' },
    { id:'pinecone',     name:'Pinecone',          desc:'Vector search, embeddings, RAG',     icon:'database',  tools:['upsert','query','delete','describe'],         transport:'streamable-http', auth:'api_key', cat:'data' },
    { id:'weaviate',     name:'Weaviate',          desc:'Vector DB, semantic search',         icon:'database',  tools:['objects','search','schema','batch'],           transport:'streamable-http', auth:'api_key', cat:'data' },
    { id:'elasticsearch',name:'Elasticsearch',     desc:'Full-text search, analytics',        icon:'database',  tools:['search','index','aggregate','mappings'],       transport:'streamable-http', auth:'api_key', cat:'data' },
    /* Design */
    { id:'figma',        name:'Figma',             desc:'Designs, components, variables',     icon:'palette',   tools:['files','components','comments','variables'],  transport:'streamable-http', auth:'oauth',   cat:'design' },
    /* Project Management */
    { id:'linear',       name:'Linear',            desc:'Issues, projects, cycles, teams',    icon:'target',    tools:['issues','projects','cycles','teams'],         transport:'streamable-http', auth:'oauth',   cat:'pm' },
    { id:'jira',         name:'Jira',              desc:'Issues, sprints, boards, projects',  icon:'clipboard', tools:['issues','sprints','boards','projects'],       transport:'streamable-http', auth:'oauth',   cat:'pm' },
    { id:'asana',        name:'Asana',             desc:'Tasks, projects, portfolios',        icon:'clipboard', tools:['tasks','projects','sections','portfolios'],   transport:'streamable-http', auth:'oauth',   cat:'pm' },
    /* CRM & Support */
    { id:'salesforce',   name:'Salesforce',        desc:'CRM, leads, accounts, reports',      icon:'target',    tools:['leads','accounts','opportunities','reports'], transport:'streamable-http', auth:'oauth',   cat:'crm' },
    { id:'hubspot',      name:'HubSpot',           desc:'CRM, contacts, deals, marketing',    icon:'target',    tools:['contacts','deals','companies','marketing'],   transport:'streamable-http', auth:'oauth',   cat:'crm' },
    { id:'zendesk',      name:'Zendesk',           desc:'Tickets, users, knowledge base',     icon:'clipboard', tools:['tickets','users','articles','search'],        transport:'streamable-http', auth:'oauth',   cat:'crm' },
    { id:'intercom',     name:'Intercom',          desc:'Conversations, contacts, articles',  icon:'chat',      tools:['conversations','contacts','articles','tags'], transport:'streamable-http', auth:'api_key', cat:'crm' },
    /* Monitoring & Observability */
    { id:'datadog',      name:'Datadog',           desc:'Metrics, logs, traces, dashboards',  icon:'chart',     tools:['metrics','logs','monitors','dashboards'],     transport:'streamable-http', auth:'api_key', cat:'ops' },
    { id:'pagerduty',    name:'PagerDuty',         desc:'Incidents, escalations, on-call',    icon:'alert',     tools:['incidents','services','schedules','alerts'],  transport:'streamable-http', auth:'api_key', cat:'ops' },
    /* Communication */
    { id:'discord',      name:'Discord',           desc:'Guilds, channels, messages, bots',   icon:'chat',      tools:['messages','channels','guilds','members'],     transport:'streamable-http', auth:'api_key', cat:'comms' },
    { id:'telegram',     name:'Telegram',          desc:'Messages, groups, bot commands',     icon:'chat',      tools:['messages','groups','bot_commands','files'],   transport:'streamable-http', auth:'api_key', cat:'comms' },
    /* Automation */
    { id:'zapier',       name:'Zapier',            desc:'Triggers, actions, 5000+ apps',      icon:'zap',       tools:['triggers','actions','zaps','search'],         transport:'streamable-http', auth:'api_key', cat:'auto' },
    { id:'make',         name:'Make',              desc:'Scenarios, modules, data stores',    icon:'zap',       tools:['scenarios','modules','connections','hooks'],   transport:'streamable-http', auth:'api_key', cat:'auto' },
  ];

  /* ── Demo seed data ───────────────────────────────────────────── */
  function _seedMcpConnections() {
    const sbUrl = typeof SB !== 'undefined' ? SB.url : 'https://zacllshbgmnwsmliteqx.supabase.co';
    return [
      {
        id: 'mc-gmail', name: 'Gmail', catalog_id: 'google-gmail',
        server_url: sbUrl + '/functions/v1/gmail-mcp',
        transport: 'json-rpc', auth_type: 'oauth',
        available_tools: ['gmail_search_messages', 'gmail_read_message', 'gmail_list_labels'],
        tool_definitions: {
          gmail_search_messages: { description: 'Search Gmail messages using query syntax (is:unread, from:, subject:, has:attachment)', inputSchema: { type:'object', properties: { q:{type:'string',description:'Gmail search query'}, maxResults:{type:'number',description:'Max results (1-20)'} } } },
          gmail_read_message: { description: 'Read the full content of a Gmail message by ID', inputSchema: { type:'object', properties: { messageId:{type:'string',description:'Message ID from search'} }, required:['messageId'] } },
          gmail_list_labels: { description: 'List all Gmail labels', inputSchema: { type:'object', properties:{} } },
        },
        status: 'disconnected', created_at: new Date().toISOString(),
      },
      {
        id: 'mc-calendar', name: 'Google Calendar', catalog_id: 'google-calendar',
        server_url: sbUrl + '/functions/v1/calendar-mcp',
        transport: 'json-rpc', auth_type: 'oauth',
        available_tools: ['calendar_list_events', 'calendar_get_event', 'calendar_list_calendars'],
        tool_definitions: {
          calendar_list_events: { description: 'List calendar events within a time range', inputSchema: { type:'object', properties: { timeMin:{type:'string'}, timeMax:{type:'string'}, maxResults:{type:'number'} } } },
          calendar_get_event: { description: 'Get details of a specific calendar event', inputSchema: { type:'object', properties: { eventId:{type:'string'} }, required:['eventId'] } },
          calendar_list_calendars: { description: 'List all calendars', inputSchema: { type:'object', properties:{} } },
        },
        status: 'disconnected', created_at: new Date().toISOString(),
      },
      {
        id: 'mc-drive', name: 'Google Drive', catalog_id: 'google-drive',
        server_url: sbUrl + '/functions/v1/drive-mcp',
        transport: 'json-rpc', auth_type: 'oauth',
        available_tools: ['drive_search_files', 'drive_get_file', 'drive_read_file'],
        tool_definitions: {
          drive_search_files: { description: 'Search files in Google Drive by name or content', inputSchema: { type:'object', properties: { q:{type:'string',description:'Search query'}, maxResults:{type:'number'} } } },
          drive_get_file: { description: 'Get metadata of a specific file', inputSchema: { type:'object', properties: { fileId:{type:'string'} }, required:['fileId'] } },
          drive_read_file: { description: 'Read the text content of a file', inputSchema: { type:'object', properties: { fileId:{type:'string'} }, required:['fileId'] } },
        },
        status: 'disconnected', created_at: new Date().toISOString(),
      },
    ];
  }

  /* ── OAuth Return Handler ─────────────────────────────────────── */
  let _oauthHandled = false;
  function _handleOAuthReturn() {
    if (_oauthHandled) return;
    // Check for google_connected param in both URL search and hash
    const hashParts = window.location.hash.split('?');
    const params = new URLSearchParams(hashParts[1] || window.location.search || '');
    if (params.get('google_connected') === 'true') {
      _oauthHandled = true;
      // Reload MCP connections from DB
      _loadMcps();
      // Show success notification
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Google Connected', message: 'Your Google account is now linked. Agents can access Gmail, Calendar, and Drive.', type: 'system' });
      }
      // Clean URL — remove the query param
      const cleanHash = hashParts[0] || '#/security';
      history.replaceState(null, '', cleanHash);
    }
  }

  /* ── Render ───────────────────────────────────────────────────── */
  function render(el) {
    // Handle OAuth return redirect
    _handleOAuthReturn(el);

    const mcps = State.get('mcp_connections') || _loadMcps();
    const totalTools = mcps.reduce((sum, c) => sum + (c.available_tools || []).length, 0);

    /* Derive unique categories */
    const mcpCats = [...new Set(MCP_CATALOG.map(m => m.cat))];
    const catLabels = { llm:'LLM', payments:'Payments', cloud:'Cloud', comms:'Comms', data:'Data', crm:'CRM', dev:'DevOps', auto:'Automation', other:'Other', workspace:'Workspace', design:'Design', pm:'Project Mgmt', ops:'Monitoring' };

    el.innerHTML = `
      <div class="integrations-wrap">
        <!-- Stats Bar -->
        <div class="integrations-stats">
          <div class="intg-stat">
            <span class="intg-stat-num">${mcps.length}</span>
            <span class="intg-stat-label">Connections</span>
          </div>
          <div class="intg-stat">
            <span class="intg-stat-num">${totalTools}</span>
            <span class="intg-stat-label">Tools</span>
          </div>
          <div class="intg-stat">
            <span class="status-dot dot-g"></span>
            <span class="intg-stat-num">${mcps.filter(m => m.status === 'connected').length}</span>
            <span class="intg-stat-label">Online</span>
          </div>
        </div>

        <!-- ═══ MCP Servers Section ═══ -->
        <div class="integrations-section">
          <div class="intg-toolbar">
            <div class="search-box" style="flex:1;max-width:280px">
              <svg class="icon icon-sm search-icon" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-search"/></svg>
              <input type="text" class="search-input" id="intg-mcp-search" placeholder="Search MCP servers..." style="width:100%">
            </div>
            <div class="intg-filters" id="intg-mcp-filters">
              <button class="bp-rarity-btn active" data-cat="all">All</button>
              ${mcpCats.map(c => `<button class="bp-rarity-btn" data-cat="${c}">${catLabels[c] || c}</button>`).join('')}
            </div>
            <div class="intg-view-toggle">
              <button class="bp-rarity-btn active" data-view="grid" id="mcp-view-grid" title="Grid view">
                <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
              </button>
              <button class="bp-rarity-btn" data-view="list" id="mcp-view-list" title="List view">
                <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
              </button>
            </div>
          </div>
          <div class="mcp-catalog-grid" id="intg-mcp-grid">
            ${_renderMcpCards(MCP_CATALOG, mcps, 'grid')}
          </div>
          <div style="margin-top:12px">
            <button class="btn btn-sm" id="btn-add-custom-mcp">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-plus"/></svg>
              Add Custom MCP
            </button>
          </div>
        </div>

        <!-- AI Models moved to separate tab -->

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

    _bindEvents(el, null, mcps);

    // AI Models moved to separate tab in SecurityView
  }

  /* ── Card Renderers ──────────────────────────────────────────── */
  function _renderMcpCards(catalog, mcps, viewMode) {
    return catalog.map(mcp => {
      const conn = mcps.find(c => c.catalog_id === mcp.id);
      const connected = !!conn;
      if (viewMode === 'list') {
        return `<div class="intg-list-row ${connected ? 'intg-list-row--connected' : ''}" data-cat="${mcp.cat}">
          <div class="intg-list-icon"><svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-${mcp.icon}"/></svg></div>
          <span class="intg-list-name">${mcp.name}</span>
          <span class="intg-list-desc">${mcp.desc}</span>
          <span class="intg-list-cat mono">${mcp.cat}</span>
          <span class="intg-list-transport mono">${mcp.transport}</span>
          ${connected
            ? `<button class="btn btn-xs mcp-disconnect-btn" data-catalog-id="${mcp.id}" data-conn-id="${conn.id}"><span class="status-dot dot-g"></span> Connected</button>`
            : `<button class="btn btn-xs btn-primary mcp-connect-btn" data-catalog-id="${mcp.id}">Connect</button>`
          }
        </div>`;
      }
      return `<div class="mcp-catalog-card ${connected ? 'mcp-catalog-card--connected' : ''}" data-cat="${mcp.cat}">
        <div class="mcp-catalog-top">
          <div class="mcp-catalog-icon"><svg class="icon icon-md" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-${mcp.icon}"/></svg></div>
          <div class="mcp-catalog-info">
            <span class="mcp-catalog-name">${mcp.name}</span>
            <span class="mcp-catalog-desc">${mcp.desc}</span>
          </div>
        </div>
        <div class="mcp-catalog-tools">${mcp.tools.map(t => `<span class="mcp-tool-pill">${t}</span>`).join('')}</div>
        <div class="mcp-catalog-footer">
          <span class="mcp-catalog-transport mono">${mcp.transport}</span>
          ${connected
            ? `<button class="btn btn-sm mcp-disconnect-btn" data-catalog-id="${mcp.id}" data-conn-id="${conn.id}"><span class="status-dot dot-g"></span> Connected</button>`
            : `<button class="btn btn-sm btn-primary mcp-connect-btn" data-catalog-id="${mcp.id}">Connect</button>`
          }
        </div>
      </div>`;
    }).join('');
  }

  /* ── Filter & View Logic ─────────────────────────────────────── */
  let _mcpView = 'grid', _mcpCat = 'all', _mcpQ = '';

  function _applyFilters(section, el, apis, mcps) {
    if (section === 'mcp' || section === 'both') {
      let filtered = MCP_CATALOG;
      if (_mcpCat !== 'all') filtered = filtered.filter(m => m.cat === _mcpCat);
      if (_mcpQ) filtered = filtered.filter(m => (m.name + ' ' + m.desc).toLowerCase().includes(_mcpQ));
      const grid = el.querySelector('#intg-mcp-grid');
      if (grid) {
        grid.className = _mcpView === 'list' ? 'intg-list-container' : 'mcp-catalog-grid';
        grid.innerHTML = _renderMcpCards(filtered, mcps, _mcpView);
      }
    }
  }

  /* ── Data Loading ─────────────────────────────────────────────── */
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
  function _bindEvents(el, _unused, mcps) {
    // Delegate connect/disconnect clicks
    el.addEventListener('click', (e) => {
      const mcpConn = e.target.closest('.mcp-connect-btn');
      if (mcpConn) return _connectMcp(mcpConn.dataset.catalogId, el);
      const mcpDisc = e.target.closest('.mcp-disconnect-btn');
      if (mcpDisc) return _disconnectMcp(mcpDisc.dataset.connId, el);
    });

    // MCP search
    document.getElementById('intg-mcp-search')?.addEventListener('input', (e) => {
      _mcpQ = e.target.value.toLowerCase().trim();
      _applyFilters('mcp', el, [], mcps);
    });

    // MCP category filter pills
    document.getElementById('intg-mcp-filters')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.bp-rarity-btn');
      if (!btn) return;
      _mcpCat = btn.dataset.cat;
      el.querySelectorAll('#intg-mcp-filters .bp-rarity-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === _mcpCat));
      _applyFilters('mcp', el, [], mcps);
    });

    // View toggle (grid/list)
    document.getElementById('mcp-view-grid')?.addEventListener('click', () => { _mcpView = 'grid'; _toggleViewBtns('mcp', el); _applyFilters('mcp', el, apis, mcps); });
    document.getElementById('mcp-view-list')?.addEventListener('click', () => { _mcpView = 'list'; _toggleViewBtns('mcp', el); _applyFilters('mcp', el, apis, mcps); });
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

  }

  function _toggleViewBtns(section, el) {
    el.querySelector(`#${section}-view-grid`)?.classList.toggle('active', _mcpView === 'grid');
    el.querySelector(`#${section}-view-list`)?.classList.toggle('active', _mcpView === 'list');
  }

  /* ── MCP Actions ──────────────────────────────────────────────── */

  /** Google OAuth base URL for the edge function */
  const GOOGLE_OAUTH_URL = (typeof SB !== 'undefined' && SB.client?.supabaseUrl)
    ? `${SB.client.supabaseUrl}/functions/v1/google-oauth`
    : 'https://zacllshbgmnwsmliteqx.supabase.co/functions/v1/google-oauth';

  function _connectMcp(catalogId, el) {
    const catalog = MCP_CATALOG.find(m => m.id === catalogId);
    if (!catalog) return;
    const conns = State.get('mcp_connections') || [];
    if (conns.find(c => c.catalog_id === catalogId || c.name === catalog.name)) return;

    // OAuth-based connections: redirect to OAuth flow
    if (catalog.auth === 'oauth' && catalogId === 'google') {
      return _initiateGoogleOAuth();
    }

    // Standard connections (API key / bearer / none)
    const conn = {
      id: 'mc-' + Date.now(), name: catalog.name,
      server_url: `https://mcp.${catalogId}.com`, transport: catalog.transport,
      auth_type: catalog.auth, available_tools: catalog.tools,
      status: 'connected', catalog_id: catalogId, created_at: new Date().toISOString(),
    };
    State.set('mcp_connections', [...conns, conn]);

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

  /** Initiate Google OAuth flow — redirects to Google consent screen */
  function _initiateGoogleOAuth() {
    const user = State.get('user');
    if (!user) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Sign In Required', message: 'Please sign in to connect Google services.', type: 'error' });
      return;
    }

    const redirectUrl = window.location.origin + '/app/#/security';
    const authUrl = `${GOOGLE_OAUTH_URL}/authorize`
      + `?user_id=${encodeURIComponent(user.id)}`
      + `&redirect_url=${encodeURIComponent(redirectUrl)}`;

    // Redirect to Google OAuth
    window.location.href = authUrl;
  }

  function _disconnectMcp(connId, el) {
    if (!confirm('Disconnect this MCP? All agents will lose access to its tools.')) return;
    let conns = State.get('mcp_connections') || [];
    conns = conns.filter(c => c.id !== connId);
    State.set('mcp_connections', conns);
    if (connId.includes('-')) SB.db('mcp_connections').remove(connId).catch(() => {});
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
    State.set('mcp_connections', [...conns, conn]);
    const user = State.get('user');
    if (user) {
      SB.db('mcp_connections').create({ user_id: user.id, spaceship_id: 'account', name, server_url: url, transport, auth_type: auth, available_tools: [], status: 'connected' }).catch(() => {});
    }
    document.getElementById('modal-add-mcp')?.classList.remove('open');
    document.getElementById('mcp-custom-form')?.reset();
    render(el);
    if (typeof Notify !== 'undefined') Notify.send({ title: 'Custom MCP Connected', message: `${name} is now available to all your agents.`, type: 'system' });
  }

  return { title, render, MCP_CATALOG };
})();
