/* ═══════════════════════════════════════════════════════════════════
   NICE — Integrations View
   Combined API keys + MCP server connections management.
   Rendered as a tab inside Security, or standalone via #/integrations.
═══════════════════════════════════════════════════════════════════ */

const IntegrationsView = (() => {
  const title = 'Integrations';
  const _esc = Utils.esc;

  /* ── MCP Server Catalog ───────────────────────────────────────── */
  /* Umbrella catalog entries map to per-service mcp_connections rows
     (e.g. the 'google' card matches google-gmail / google-calendar /
     google-drive rows written by the google-oauth callback). */
  const MCP_CATALOG = [
    { id:'google',    name:'Google Workspace', desc:'Gmail, Drive, Calendar — read & write',                    icon:'mail', tools:['gmail_search','gmail_read','gmail_send','gmail_draft','drive_search','drive_read','calendar_list','calendar_create','calendar_update'], transport:'streamable-http', auth:'oauth', cat:'workspace' },
    { id:'microsoft', name:'Microsoft 365',    desc:'Outlook, Calendar, Contacts, OneDrive — read & write',     icon:'mail', tools:['outlook_search_messages','outlook_send_message','outlook_create_draft','calendar_ms_list_events','calendar_ms_create_event','contacts_ms_search','onedrive_search_files','onedrive_read_file','onedrive_upload_file'], transport:'streamable-http', auth:'oauth', cat:'workspace' },
  ];

  /* Exact match on catalog_id, then umbrella-prefix fallback so
     per-service rows resolve to the umbrella card. */
  function _matchConnection(catalogId, mcps) {
    const exact = mcps.find(c => c.catalog_id === catalogId);
    if (exact) return exact;
    return mcps.find(c => c.catalog_id && c.catalog_id.startsWith(catalogId + '-'));
  }

  /* ── Demo seed data ───────────────────────────────────────────── */
  function _seedMcpConnections() {
    const sbUrl = typeof SB !== 'undefined' ? SB.url : 'https://zacllshbgmnwsmliteqx.supabase.co';
    return [
      {
        id: 'mc-gmail', name: 'Gmail', catalog_id: 'google-gmail',
        server_url: sbUrl + '/functions/v1/gmail-mcp',
        transport: 'json-rpc', auth_type: 'oauth',
        available_tools: ['gmail_search_messages', 'gmail_read_message', 'gmail_list_labels', 'gmail_send_message', 'gmail_create_draft', 'gmail_reply_message'],
        tool_definitions: {
          gmail_search_messages: { description: 'Search Gmail messages using query syntax (is:unread, from:, subject:, has:attachment)', inputSchema: { type:'object', properties: { q:{type:'string',description:'Gmail search query'}, maxResults:{type:'number',description:'Max results (1-20)'} } } },
          gmail_read_message: { description: 'Read the full content of a Gmail message by ID', inputSchema: { type:'object', properties: { messageId:{type:'string',description:'Message ID from search'} }, required:['messageId'] } },
          gmail_list_labels: { description: 'List all Gmail labels', inputSchema: { type:'object', properties:{} } },
          gmail_send_message: { description: 'Send an email message', inputSchema: { type:'object', properties: { to:{type:'string',description:'Recipient email address'}, subject:{type:'string',description:'Email subject'}, body:{type:'string',description:'Email body (plain text or HTML)'}, cc:{type:'string',description:'CC recipients (comma-separated)'}, bcc:{type:'string',description:'BCC recipients (comma-separated)'} }, required:['to','subject','body'] } },
          gmail_create_draft: { description: 'Create an email draft without sending', inputSchema: { type:'object', properties: { to:{type:'string',description:'Recipient email'}, subject:{type:'string',description:'Subject line'}, body:{type:'string',description:'Draft body'} }, required:['subject','body'] } },
          gmail_reply_message: { description: 'Reply to an existing email thread', inputSchema: { type:'object', properties: { messageId:{type:'string',description:'ID of message to reply to'}, body:{type:'string',description:'Reply body'}, replyAll:{type:'boolean',description:'Reply to all recipients'} }, required:['messageId','body'] } },
        },
        status: 'disconnected', created_at: new Date().toISOString(),
      },
      {
        id: 'mc-calendar', name: 'Google Calendar', catalog_id: 'google-calendar',
        server_url: sbUrl + '/functions/v1/calendar-mcp',
        transport: 'json-rpc', auth_type: 'oauth',
        available_tools: ['calendar_list_events', 'calendar_get_event', 'calendar_list_calendars', 'calendar_create_event', 'calendar_update_event', 'calendar_delete_event'],
        tool_definitions: {
          calendar_list_events: { description: 'List calendar events within a time range', inputSchema: { type:'object', properties: { timeMin:{type:'string'}, timeMax:{type:'string'}, maxResults:{type:'number'} } } },
          calendar_get_event: { description: 'Get details of a specific calendar event', inputSchema: { type:'object', properties: { eventId:{type:'string'} }, required:['eventId'] } },
          calendar_list_calendars: { description: 'List all calendars', inputSchema: { type:'object', properties:{} } },
          calendar_create_event: { description: 'Create a new calendar event', inputSchema: { type:'object', properties: { summary:{type:'string',description:'Event title'}, start:{type:'string',description:'Start time (ISO 8601)'}, end:{type:'string',description:'End time (ISO 8601)'}, description:{type:'string',description:'Event description'}, location:{type:'string',description:'Event location'}, attendees:{type:'array',items:{type:'string'},description:'Attendee emails'} }, required:['summary','start','end'] } },
          calendar_update_event: { description: 'Update an existing calendar event', inputSchema: { type:'object', properties: { eventId:{type:'string'}, summary:{type:'string'}, start:{type:'string'}, end:{type:'string'}, description:{type:'string'}, location:{type:'string'} }, required:['eventId'] } },
          calendar_delete_event: { description: 'Delete a calendar event', inputSchema: { type:'object', properties: { eventId:{type:'string'} }, required:['eventId'] } },
        },
        status: 'disconnected', created_at: new Date().toISOString(),
      },
      {
        id: 'mc-drive', name: 'Google Drive', catalog_id: 'google-drive',
        server_url: sbUrl + '/functions/v1/drive-mcp',
        transport: 'json-rpc', auth_type: 'oauth',
        available_tools: ['drive_search_files', 'drive_get_file', 'drive_read_file', 'drive_create_file', 'drive_update_file', 'drive_upload_file'],
        tool_definitions: {
          drive_search_files: { description: 'Search files in Google Drive by name or content', inputSchema: { type:'object', properties: { q:{type:'string',description:'Search query'}, maxResults:{type:'number'} } } },
          drive_get_file: { description: 'Get metadata of a specific file', inputSchema: { type:'object', properties: { fileId:{type:'string'} }, required:['fileId'] } },
          drive_read_file: { description: 'Read the text content of a file', inputSchema: { type:'object', properties: { fileId:{type:'string'} }, required:['fileId'] } },
          drive_create_file: { description: 'Create a new file in Google Drive', inputSchema: { type:'object', properties: { name:{type:'string',description:'File name'}, content:{type:'string',description:'File content (text)'}, mimeType:{type:'string',description:'MIME type (default: text/plain)'}, folderId:{type:'string',description:'Parent folder ID'} }, required:['name','content'] } },
          drive_update_file: { description: 'Update the content of an existing file', inputSchema: { type:'object', properties: { fileId:{type:'string'}, content:{type:'string',description:'New file content'} }, required:['fileId','content'] } },
          drive_upload_file: { description: 'Upload a file to Google Drive', inputSchema: { type:'object', properties: { name:{type:'string',description:'File name'}, content:{type:'string',description:'Base64-encoded file content'}, mimeType:{type:'string',description:'MIME type'}, folderId:{type:'string',description:'Parent folder ID'} }, required:['name','content','mimeType'] } },
        },
        status: 'disconnected', created_at: new Date().toISOString(),
      },
      {
        id: 'mc-social', name: 'Social Media', catalog_id: 'buffer',
        server_url: sbUrl + '/functions/v1/social-mcp',
        transport: 'json-rpc', auth_type: 'oauth',
        available_tools: ['social_list_queued', 'social_create_post', 'social_publish_post', 'social_schedule_post', 'social_get_analytics', 'social_list_platforms'],
        tool_definitions: {
          social_list_queued: { description: 'List approved content from the outbox queue', inputSchema: { type:'object', properties: { status:{type:'string'}, limit:{type:'number'} } } },
          social_create_post: { description: 'Draft a social media post for review', inputSchema: { type:'object', properties: { content:{type:'string'}, platforms:{type:'array',items:{type:'string'}}, title:{type:'string'} }, required:['content'] } },
          social_publish_post: { description: 'Publish an approved post to a platform', inputSchema: { type:'object', properties: { post_id:{type:'string'}, platform:{type:'string'} }, required:['post_id','platform'] } },
          social_schedule_post: { description: 'Schedule a post for future publishing', inputSchema: { type:'object', properties: { post_id:{type:'string'}, platform:{type:'string'}, scheduled_at:{type:'string'} }, required:['post_id','platform','scheduled_at'] } },
          social_get_analytics: { description: 'Get engagement metrics for published posts', inputSchema: { type:'object', properties: { platform:{type:'string'} }, required:['platform'] } },
          social_list_platforms: { description: 'List available social platforms and connection status', inputSchema: { type:'object', properties:{} } },
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
    if (params.get('microsoft_connected') === 'true') {
      _oauthHandled = true;
      _loadMcps();
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Microsoft 365 Connected', message: 'Your Microsoft account is now linked. Agents can access Outlook, Calendar, Contacts, and OneDrive.', type: 'system' });
      }
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
  function _renderActionButton(mcp, conn, size) {
    const sizeCls = size === 'xs' ? 'btn-xs' : 'btn-sm';
    if (mcp.comingSoon) {
      return `<button class="btn ${sizeCls}" disabled>Coming soon</button>`;
    }
    if (conn) {
      return `<button class="btn ${sizeCls} mcp-disconnect-btn" data-catalog-id="${mcp.id}" data-conn-id="${conn.id}"><span class="status-dot dot-g"></span> Connected</button>`;
    }
    return `<button class="btn ${sizeCls} btn-primary mcp-connect-btn" data-catalog-id="${mcp.id}">Connect</button>`;
  }

  function _renderMcpCards(catalog, mcps, viewMode) {
    return catalog.map(mcp => {
      const conn = _matchConnection(mcp.id, mcps);
      const connected = !!conn;
      if (viewMode === 'list') {
        return `<div class="intg-list-row ${connected ? 'intg-list-row--connected' : ''}" data-cat="${mcp.cat}">
          <div class="intg-list-icon"><svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-${mcp.icon}"/></svg></div>
          <span class="intg-list-name">${mcp.name}</span>
          <span class="intg-list-desc">${mcp.desc}</span>
          <span class="intg-list-cat mono">${mcp.cat}</span>
          <span class="intg-list-transport mono">${mcp.transport}</span>
          ${_renderActionButton(mcp, conn, 'xs')}
        </div>`;
      }
      // When the MCP is connected we have real tool IDs from the
      // server — render those with read/write badges. Otherwise fall
      // back to the catalog preview list.
      const realTools = connected ? (conn.available_tools || []) : [];
      const toolPills = connected && realTools.length
        ? _renderToolPills(realTools)
        : mcp.tools.map(t => `<span class="mcp-tool-pill">${t}</span>`).join('');

      const scopeBadge = connected ? _renderScopeBadge(realTools) : '';

      return `<div class="mcp-catalog-card ${connected ? 'mcp-catalog-card--connected' : ''}" data-cat="${mcp.cat}">
        <div class="mcp-catalog-top">
          <div class="mcp-catalog-icon"><svg class="icon icon-md" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-${mcp.icon}"/></svg></div>
          <div class="mcp-catalog-info">
            <span class="mcp-catalog-name">${mcp.name}${scopeBadge}</span>
            <span class="mcp-catalog-desc">${mcp.desc}</span>
          </div>
        </div>
        <div class="mcp-catalog-tools">${toolPills}</div>
        <div class="mcp-catalog-footer">
          <span class="mcp-catalog-transport mono">${mcp.transport}</span>
          ${_renderActionButton(mcp, conn, 'sm')}
        </div>
      </div>`;
    }).join('');
  }

  /* ── Tool classification helpers ──────────────────────────────── */

  /** Classify a tool ID as 'read' or 'write' using the same patterns
      the agent-executor uses to decide which calls need approval. */
  function _classifyTool(toolId) {
    if (typeof AgentExecutor !== 'undefined' && AgentExecutor.classifyTool) {
      return AgentExecutor.classifyTool(toolId);
    }
    // Fallback — keep in sync with AgentExecutor.classifyTool
    const patterns = ['send', 'publish', 'post', 'create', 'delete',
      'update', 'write', 'upload', 'reply', 'archive', 'move',
      'rename', 'remove', 'drop', 'put', 'patch', 'insert',
      'destroy', 'revoke', 'cancel', 'schedule'];
    const n = String(toolId || '').toLowerCase();
    return patterns.some(p => n.includes(p)) ? 'write' : 'read';
  }

  /** Render the tool pill list with read/write coloring. */
  function _renderToolPills(tools) {
    return tools.map(t => {
      const kind = _classifyTool(t);
      return `<span class="mcp-tool-pill mcp-tool-pill--${kind}" title="${kind === 'write' ? 'Write / side-effect tool — needs approval when review mode is on' : 'Read-only tool'}">${t}</span>`;
    }).join('');
  }

  /** Derive a "Read only" / "Read + Write" badge from the tool set. */
  function _renderScopeBadge(tools) {
    if (!Array.isArray(tools) || !tools.length) return '';
    const hasWrite = tools.some(t => _classifyTool(t) === 'write');
    if (hasWrite) {
      return ' <span class="mcp-scope-badge mcp-scope-badge--write" title="This connection can make changes on your behalf">R+W</span>';
    }
    return ' <span class="mcp-scope-badge mcp-scope-badge--read" title="This connection can only read data">R</span>';
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

  /** Microsoft OAuth base URL for the edge function */
  const MICROSOFT_OAUTH_URL = (typeof SB !== 'undefined' && SB.client?.supabaseUrl)
    ? `${SB.client.supabaseUrl}/functions/v1/microsoft-oauth`
    : 'https://zacllshbgmnwsmliteqx.supabase.co/functions/v1/microsoft-oauth';

  function _connectMcp(catalogId, el) {
    const catalog = MCP_CATALOG.find(m => m.id === catalogId);
    if (!catalog) return;
    if (catalog.comingSoon) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Coming soon', message: `${catalog.name} integration is not available yet.`, type: 'system' });
      return;
    }
    const conns = State.get('mcp_connections') || [];
    if (_matchConnection(catalogId, conns) || conns.find(c => c.name === catalog.name)) return;

    // OAuth-based connections: redirect to OAuth flow
    if (catalog.auth === 'oauth' && catalogId === 'google') {
      return _initiateGoogleOAuth();
    }
    if (catalog.auth === 'oauth' && catalogId === 'microsoft') {
      return _initiateMicrosoftOAuth();
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
      // catalog_id is the SSOT key for matching DB rows against the
      // front-end catalog. Without it the card grid can't tell which
      // rows are already connected, and MissionComposer's per-template
      // gates (e.g. Inbox Captain needs google-gmail) look for a match
      // that never comes. Persist it on every create going forward;
      // legacy rows are backfilled in migration 20260423000007.
      SB.db('mcp_connections').create({
        user_id: user.id, spaceship_id: 'account', name: catalog.name,
        server_url: conn.server_url, transport: catalog.transport,
        auth_type: catalog.auth, available_tools: catalog.tools, status: 'connected',
        catalog_id: catalogId,
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

  /** Initiate Microsoft OAuth flow — redirects to Microsoft consent screen */
  function _initiateMicrosoftOAuth() {
    const user = State.get('user');
    if (!user) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Sign In Required', message: 'Please sign in to connect Microsoft 365.', type: 'error' });
      return;
    }

    const redirectUrl = window.location.origin + '/app/#/security';
    const authUrl = `${MICROSOFT_OAUTH_URL}/authorize`
      + `?user_id=${encodeURIComponent(user.id)}`
      + `&redirect_url=${encodeURIComponent(redirectUrl)}`;

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
