/* ═══════════════════════════════════════════════════════════════════
   NICE — Integrations View
   Combined API keys + MCP server connections management.
   Rendered as a tab inside Security, or standalone via #/integrations.
═══════════════════════════════════════════════════════════════════ */

const IntegrationsView = (() => {
  const title = 'Integrations';
  const _esc = typeof Utils !== 'undefined' ? Utils.esc : (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* ── API Service Catalog ──────────────────────────────────────── */
  const API_CATALOG = [
    /* LLM Providers */
    { id:'openai',      name:'OpenAI',         desc:'GPT, DALL-E, Whisper APIs',         icon:'cpu',       cat:'llm' },
    { id:'anthropic',   name:'Anthropic',      desc:'Claude API, completions',            icon:'cpu',       cat:'llm' },
    { id:'google-ai',   name:'Google AI',      desc:'Gemini, PaLM, Vertex AI',            icon:'cpu',       cat:'llm' },
    { id:'groq',        name:'Groq',           desc:'Ultra-fast LLM inference',            icon:'cpu',       cat:'llm' },
    { id:'mistral',     name:'Mistral AI',     desc:'Open-weight models, cost-effective',  icon:'cpu',       cat:'llm' },
    { id:'cohere',      name:'Cohere',         desc:'Enterprise NLP, embeddings, RAG',     icon:'cpu',       cat:'llm' },
    { id:'together',    name:'Together AI',    desc:'Open source model hosting',           icon:'cpu',       cat:'llm' },
    { id:'huggingface', name:'Hugging Face',   desc:'Inference API, 1000s of models',      icon:'cpu',       cat:'llm' },
    /* Payments & Billing */
    { id:'stripe',      name:'Stripe',         desc:'Payments, invoices, customers',       icon:'wallet',    cat:'payments' },
    { id:'paypal',      name:'PayPal',         desc:'Payments, checkout, transfers',       icon:'wallet',    cat:'payments' },
    { id:'square',      name:'Square',         desc:'Point-of-sale, payments',             icon:'wallet',    cat:'payments' },
    /* Cloud & Infrastructure */
    { id:'aws',         name:'AWS',            desc:'S3, Lambda, SES, and more',           icon:'cloud',     cat:'cloud' },
    { id:'gcp',         name:'Google Cloud',   desc:'GCS, Cloud Functions, BigQuery',      icon:'cloud',     cat:'cloud' },
    { id:'azure',       name:'Azure',          desc:'Blob Storage, Functions, Cosmos DB',  icon:'cloud',     cat:'cloud' },
    { id:'vercel',      name:'Vercel',         desc:'Deployments, serverless, edge',       icon:'cloud',     cat:'cloud' },
    /* Communication */
    { id:'twilio',      name:'Twilio',         desc:'SMS, voice, messaging',               icon:'chat',      cat:'comms' },
    { id:'sendgrid',    name:'SendGrid',       desc:'Transactional & marketing email',     icon:'mail',      cat:'comms' },
    { id:'discord',     name:'Discord',        desc:'Bots, webhooks, community',           icon:'chat',      cat:'comms' },
    { id:'telegram',    name:'Telegram',       desc:'Bot API, messaging automation',       icon:'chat',      cat:'comms' },
    { id:'whatsapp',    name:'WhatsApp',       desc:'Business API, customer engagement',   icon:'chat',      cat:'comms' },
    /* Data & Vector DBs */
    { id:'pinecone',    name:'Pinecone',       desc:'Managed vector database for RAG',     icon:'database',  cat:'data' },
    { id:'weaviate',    name:'Weaviate',       desc:'Vector search, semantic queries',     icon:'database',  cat:'data' },
    { id:'snowflake',   name:'Snowflake',      desc:'Cloud data warehouse',                icon:'database',  cat:'data' },
    { id:'bigquery',    name:'BigQuery',       desc:'Serverless data warehouse',           icon:'database',  cat:'data' },
    { id:'mongodb',     name:'MongoDB',        desc:'Document database, Atlas cloud',      icon:'database',  cat:'data' },
    { id:'postgres',    name:'PostgreSQL',     desc:'Direct PostgreSQL connections',        icon:'database',  cat:'data' },
    { id:'elasticsearch',name:'Elasticsearch', desc:'Full-text search & analytics',        icon:'database',  cat:'data' },
    /* CRM & Business */
    { id:'salesforce',  name:'Salesforce',     desc:'CRM, leads, deals, reporting',        icon:'target',    cat:'crm' },
    { id:'hubspot',     name:'HubSpot',        desc:'CRM, marketing automation',           icon:'target',    cat:'crm' },
    { id:'zendesk',     name:'Zendesk',        desc:'Support tickets, customer service',   icon:'clipboard', cat:'crm' },
    { id:'intercom',    name:'Intercom',       desc:'Customer messaging platform',         icon:'chat',      cat:'crm' },
    { id:'pipedrive',   name:'Pipedrive',      desc:'Sales pipeline management',           icon:'target',    cat:'crm' },
    /* DevOps & Code */
    { id:'github',      name:'GitHub',         desc:'Repos, Actions, API access',          icon:'code',      cat:'dev' },
    { id:'gitlab',      name:'GitLab',         desc:'Git platform, CI/CD pipelines',       icon:'code',      cat:'dev' },
    { id:'bitbucket',   name:'Bitbucket',      desc:'Atlassian git, Pipelines',            icon:'code',      cat:'dev' },
    { id:'sentry',      name:'Sentry',         desc:'Error tracking, performance',         icon:'alert',     cat:'dev' },
    { id:'datadog',     name:'Datadog',        desc:'Metrics, logs, APM',                  icon:'chart',     cat:'dev' },
    { id:'pagerduty',   name:'PagerDuty',      desc:'Incident management, alerting',       icon:'alert',     cat:'dev' },
    /* Automation */
    { id:'zapier',      name:'Zapier',         desc:'Connect 5000+ apps, workflows',       icon:'zap',       cat:'auto' },
    { id:'make',        name:'Make',           desc:'Visual workflow automation',           icon:'zap',       cat:'auto' },
    /* Custom */
    { id:'custom',      name:'Custom',         desc:'Add any API key manually',            icon:'plus',      cat:'other' },
  ];

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

    /* Derive unique categories */
    const mcpCats = [...new Set(MCP_CATALOG.map(m => m.cat))];
    const apiCats = [...new Set(API_CATALOG.map(a => a.cat))];
    const catLabels = { llm:'LLM', payments:'Payments', cloud:'Cloud', comms:'Comms', data:'Data', crm:'CRM', dev:'DevOps', auto:'Automation', other:'Other', workspace:'Workspace', design:'Design', pm:'Project Mgmt', ops:'Monitoring' };

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

        <!-- ═══ API Keys Section ═══ -->
        <div class="integrations-section">
          <div class="integrations-section-header">
            <h3 class="integrations-section-title">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-code"/></svg>
              API Keys
            </h3>
            <p class="integrations-section-desc">Direct API key integrations. Keys are encrypted and stored in the Vault.</p>
          </div>
          <div class="intg-toolbar">
            <div class="search-box" style="flex:1;max-width:280px">
              <svg class="icon icon-sm search-icon" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-search"/></svg>
              <input type="text" class="search-input" id="intg-api-search" placeholder="Search APIs..." style="width:100%">
            </div>
            <div class="intg-filters" id="intg-api-filters">
              <button class="bp-rarity-btn active" data-cat="all">All</button>
              ${apiCats.map(c => `<button class="bp-rarity-btn" data-cat="${c}">${catLabels[c] || c}</button>`).join('')}
            </div>
            <div class="intg-view-toggle">
              <button class="bp-rarity-btn active" data-view="grid" id="api-view-grid" title="Grid view">
                <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
              </button>
              <button class="bp-rarity-btn" data-view="list" id="api-view-list" title="List view">
                <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
              </button>
            </div>
          </div>
          <div class="api-catalog-grid" id="intg-api-grid">
            ${_renderApiCards(API_CATALOG, apis, 'grid')}
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

    _bindEvents(el, apis, mcps);
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

  function _renderApiCards(catalog, apis, viewMode) {
    return catalog.map(svc => {
      const conn = apis.find(c => c.service === svc.id);
      const connected = !!conn;
      if (viewMode === 'list') {
        return `<div class="intg-list-row ${connected ? 'intg-list-row--connected' : ''}" data-service="${svc.id}" data-cat="${svc.cat}">
          <div class="intg-list-icon"><svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-${svc.icon}"/></svg></div>
          <span class="intg-list-name">${svc.name}</span>
          <span class="intg-list-desc">${svc.desc}</span>
          <span class="intg-list-cat mono">${svc.cat}</span>
          ${connected
            ? `<button class="btn btn-xs api-disconnect-btn" data-service="${svc.id}" data-conn-id="${conn.id}">Disconnect</button>`
            : `<button class="btn btn-xs btn-primary api-connect-btn" data-service="${svc.id}">Connect</button>`
          }
          ${connected ? `<span class="status-dot dot-g"></span>` : ''}
        </div>`;
      }
      return `<div class="api-catalog-card ${connected ? 'api-catalog-card--connected' : ''}" data-service="${svc.id}" data-cat="${svc.cat}">
        <div class="api-catalog-icon"><svg class="icon icon-md" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-${svc.icon}"/></svg></div>
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
      </div>`;
    }).join('');
  }

  /* ── Filter & View Logic ─────────────────────────────────────── */
  let _mcpView = 'grid', _apiView = 'grid', _mcpCat = 'all', _apiCat = 'all', _mcpQ = '', _apiQ = '';

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
    if (section === 'api' || section === 'both') {
      let filtered = API_CATALOG;
      if (_apiCat !== 'all') filtered = filtered.filter(a => a.cat === _apiCat);
      if (_apiQ) filtered = filtered.filter(a => (a.name + ' ' + a.desc).toLowerCase().includes(_apiQ));
      const grid = el.querySelector('#intg-api-grid');
      if (grid) {
        grid.className = _apiView === 'list' ? 'intg-list-container' : 'api-catalog-grid';
        grid.innerHTML = _renderApiCards(filtered, apis, _apiView);
      }
    }
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
  function _bindEvents(el, apis, mcps) {
    // Delegate connect/disconnect clicks (works for both grid and list)
    el.addEventListener('click', (e) => {
      const mcpConn = e.target.closest('.mcp-connect-btn');
      if (mcpConn) return _connectMcp(mcpConn.dataset.catalogId, el);
      const mcpDisc = e.target.closest('.mcp-disconnect-btn');
      if (mcpDisc) return _disconnectMcp(mcpDisc.dataset.connId, el);
      const apiConn = e.target.closest('.api-connect-btn');
      if (apiConn) return _openApiModal(apiConn.dataset.service);
      const apiDisc = e.target.closest('.api-disconnect-btn');
      if (apiDisc) return _disconnectApi(apiDisc.dataset.connId, el);
    });

    // Search inputs
    document.getElementById('intg-mcp-search')?.addEventListener('input', (e) => {
      _mcpQ = e.target.value.toLowerCase().trim();
      _applyFilters('mcp', el, apis, mcps);
    });
    document.getElementById('intg-api-search')?.addEventListener('input', (e) => {
      _apiQ = e.target.value.toLowerCase().trim();
      _applyFilters('api', el, apis, mcps);
    });

    // Category filter pills
    document.getElementById('intg-mcp-filters')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.bp-rarity-btn');
      if (!btn) return;
      _mcpCat = btn.dataset.cat;
      el.querySelectorAll('#intg-mcp-filters .bp-rarity-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === _mcpCat));
      _applyFilters('mcp', el, apis, mcps);
    });
    document.getElementById('intg-api-filters')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.bp-rarity-btn');
      if (!btn) return;
      _apiCat = btn.dataset.cat;
      el.querySelectorAll('#intg-api-filters .bp-rarity-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === _apiCat));
      _applyFilters('api', el, apis, mcps);
    });

    // View toggle (grid/list)
    document.getElementById('mcp-view-grid')?.addEventListener('click', () => { _mcpView = 'grid'; _toggleViewBtns('mcp', el); _applyFilters('mcp', el, apis, mcps); });
    document.getElementById('mcp-view-list')?.addEventListener('click', () => { _mcpView = 'list'; _toggleViewBtns('mcp', el); _applyFilters('mcp', el, apis, mcps); });
    document.getElementById('api-view-grid')?.addEventListener('click', () => { _apiView = 'grid'; _toggleViewBtns('api', el); _applyFilters('api', el, apis, mcps); });
    document.getElementById('api-view-list')?.addEventListener('click', () => { _apiView = 'list'; _toggleViewBtns('api', el); _applyFilters('api', el, apis, mcps); });

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

  function _toggleViewBtns(section, el) {
    const view = section === 'mcp' ? _mcpView : _apiView;
    el.querySelector(`#${section}-view-grid`)?.classList.toggle('active', view === 'grid');
    el.querySelector(`#${section}-view-list`)?.classList.toggle('active', view === 'list');
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
    if (connId.includes('-')) SB.db('api_connections').remove(connId).catch(() => {});
    render(el);
    if (typeof Notify !== 'undefined') Notify.send({ title: 'API Disconnected', message: 'Connection removed.', type: 'system' });
  }

  return { title, render, API_CATALOG, MCP_CATALOG };
})();
