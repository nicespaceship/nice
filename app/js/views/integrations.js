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
    { id:'google',    name:'Google Workspace', desc:'Gmail, Drive, Calendar — read & write',                    icon:'brand-google',    tools:['gmail_search','gmail_read','gmail_send','gmail_draft','drive_search','drive_read','calendar_list','calendar_create','calendar_update'], transport:'streamable-http', auth:'oauth', cat:'workspace' },
    { id:'microsoft', name:'Microsoft 365',    desc:'Outlook, Calendar, Contacts, OneDrive — read & write',     icon:'brand-microsoft', tools:['outlook_search_messages','outlook_send_message','outlook_create_draft','calendar_ms_list_events','calendar_ms_create_event','contacts_ms_search','onedrive_search_files','onedrive_read_file','onedrive_upload_file'], transport:'streamable-http', auth:'oauth', cat:'workspace' },
    { id:'hubspot',   name:'HubSpot',           desc:'CRM objects, properties, campaigns — read & write',          icon:'brand-hubspot',   tools:['search_crm_objects','get_crm_objects','manage_crm_objects','search_properties','get_properties','search_owners','get_organization_details','get_user_details','get_campaign_contacts_by_type','get_campaign_analytics','get_campaign_asset_metrics'], transport:'streamable-http', auth:'oauth', cat:'crm' },
    { id:'github',    name:'GitHub',            desc:'Repos, issues, pull requests, code, releases, Actions — read-only', icon:'brand-github', tools:['search_code','search_issues','search_pull_requests','search_repositories','search_users','get_commit','get_file_contents','get_label','get_latest_release','get_me','get_release_by_tag','get_tag','get_team_members','get_teams','issue_read','pull_request_read','list_branches','list_commits','list_issue_types','list_issues','list_pull_requests','list_releases','list_tags'], transport:'streamable-http', auth:'oauth', cat:'dev' },
    { id:'slack',     name:'Slack',             desc:'Messages, channels, threads, canvases, users — read-only',         icon:'brand-slack',  tools:['slack_search_public','slack_search_public_and_private','slack_search_channels','slack_search_users','slack_read_channel','slack_read_thread','slack_read_canvas','slack_read_user_profile'], transport:'streamable-http', auth:'oauth', cat:'comms' },
    { id:'linear',    name:'Linear',            desc:'Issues, projects, comments, teams, cycles, docs — read-only',      icon:'brand-linear', tools:['list_issues','get_issue','list_projects','get_project','list_teams','get_team','list_users','get_user','list_comments','list_cycles','list_milestones','get_milestone','list_documents','get_document','list_issue_labels','list_project_labels','list_issue_statuses','get_issue_status','get_attachment','extract_images','search_documentation'], transport:'streamable-http', auth:'oauth', cat:'pm' },
    { id:'notion',    name:'Notion',            desc:'Pages, databases, comments, teams, users — read-only',             icon:'brand-notion', tools:['notion-search','notion-fetch','notion-get-comments','notion-get-teams','notion-get-users'], transport:'streamable-http', auth:'oauth', cat:'docs' },
    { id:'stripe',    name:'Stripe',            desc:'Customers, payments, subscriptions, invoices, products — read-only', icon:'brand-stripe', tools:['list_customers','list_payment_intents','list_subscriptions','list_invoices','list_products','list_prices','list_coupons','list_disputes','retrieve_balance','get_stripe_account_info','fetch_stripe_resources','search_stripe_resources','search_stripe_documentation','stripe_api_details','stripe_api_search','stripe_integration_recommender'], transport:'streamable-http', auth:'oauth', cat:'payments' },
    { id:'atlassian', name:'Atlassian',         desc:'Jira issues, Confluence pages, Compass components — read-only',     icon:'brand-atlassian', tools:['searchJiraIssuesUsingJql','getJiraIssue','getVisibleJiraProjects','getTransitionsForJiraIssue','getIssueLinkTypes','getJiraIssueRemoteIssueLinks','getJiraIssueTypeMetaWithFields','getJiraProjectIssueTypesMetadata','lookupJiraAccountId','searchConfluenceUsingCql','getConfluencePage','getConfluenceSpaces','getPagesInConfluenceSpace','getConfluencePageDescendants','getConfluencePageFooterComments','getConfluencePageInlineComments','getConfluenceCommentChildren','searchAtlassian','fetchAtlassian','getTeamworkGraphContext','getTeamworkGraphObject','getCompassComponent','getCompassComponents','getCompassComponentActivityEvents','getCompassComponentLabels','getCompassComponentTypes','getCompassCustomFieldDefinitions','getCompassComponentsOwnedByMyTeams','atlassianUserInfo','getAccessibleAtlassianResources'], transport:'streamable-http', auth:'oauth', cat:'pm' },
    { id:'cloudflare',name:'Cloudflare',        desc:'Workers, KV, R2, D1, Hyperdrive — read-only (D1 query allows raw SQL)', icon:'brand-cloudflare', tools:['accounts_list','set_active_account','search_cloudflare_documentation','workers_list','workers_get_worker','workers_get_worker_code','kv_namespaces_list','kv_namespace_get','r2_buckets_list','r2_bucket_get','d1_databases_list','d1_database_get','d1_database_query','hyperdrive_configs_list','hyperdrive_config_get','migrate_pages_to_workers_guide'], transport:'streamable-http', auth:'oauth', cat:'dev' },
    { id:'cf-browser', name:'Cloudflare Browser',       desc:'Read web pages — HTML, Markdown, screenshots — billed to your Cloudflare account', icon:'brand-cloudflare', tools:['accounts_list','set_active_account','get_url_html_content','get_url_markdown','get_url_screenshot'], transport:'streamable-http', auth:'oauth', cat:'dev' },
    { id:'cf-observability', name:'Cloudflare Observability', desc:'Workers logs, metrics, field discovery — read-only debugging for production Workers', icon:'brand-cloudflare', tools:['accounts_list','set_active_account','query_worker_observability','observability_keys','observability_values'], transport:'streamable-http', auth:'oauth', cat:'dev' },
    { id:'cf-builds',  name:'Cloudflare Builds',        desc:'Workers Builds CI/CD — list builds, fetch details, pull logs — read-only',          icon:'brand-cloudflare', tools:['accounts_list','set_active_account','workers_builds_set_active_worker','workers_builds_list_builds','workers_builds_get_build','workers_builds_get_build_logs'], transport:'streamable-http', auth:'oauth', cat:'dev' },
    { id:'sentry',    name:'Sentry',            desc:'Issues, events, projects, releases, Seer analysis — read-only',     icon:'brand-sentry', tools:['find_organizations','find_projects','find_teams','find_releases','find_dsns','get_issue_details','get_event_details','get_trace_details','get_doc_url','search_issues','search_events','analyze_issue_with_seer','get_seer_run_state','whoami'], transport:'streamable-http', auth:'oauth', cat:'dev' },
    { id:'zapier',    name:'Zapier',            desc:'Discover and run any of 9,000+ Zapier-connected apps — actions you enable surface as tools', icon:'brand-zapier', tools:['discover_zapier_actions','enable_zapier_action','list_enabled_zapier_actions','execute_zapier_read_action'], transport:'streamable-http', auth:'none', cat:'automation' },
    { id:'airtable',  name:'Airtable',          desc:'Workspaces, bases, tables, records, comments — read-only',           icon:'brand-airtable', tools:['list_workspaces','list_bases','get_base_schema','list_tables','list_records','search_records','get_record','list_record_comments'], transport:'streamable-http', auth:'oauth', cat:'docs' },
    { id:'monday',    name:'monday.com',        desc:'Boards, items, sub-items, updates, documents — pending monday.com public-app review',           icon:'brand-monday', tools:['monday-list-boards','monday-get-board-groups','monday-list-items-in-groups','monday-list-subitems-in-items','monday-get-board-by-id','monday-get-item-by-id','monday-get-update','monday-list-documents','monday-get-document-content'], transport:'streamable-http', auth:'oauth', cat:'pm', comingSoon:true },
    { id:'klaviyo',   name:'Klaviyo',           desc:'Profiles, lists, segments, campaigns, flows, events, metrics — read-only', icon:'brand-klaviyo', tools:['get_profiles','get_profile','get_lists','get_list','get_segments','get_segment','get_campaigns','get_campaign','get_events','get_metrics','get_metric','get_flows','get_flow'], transport:'streamable-http', auth:'oauth', cat:'marketing' },
    { id:'miro',      name:'Miro',              desc:'Boards, items, connectors, tags, search — read-only',                icon:'brand-miro', tools:['list_boards','get_specific_board','list_items_on_board','get_specific_item','list_connectors_on_board','get_specific_connector','list_tags_on_board','get_tag','search_board_content'], transport:'streamable-http', auth:'oauth', cat:'design' },
    { id:'replicate', name:'Replicate',         desc:'Bring your own Replicate account — search and run thousands of open-source models (Flux, Stable Diffusion, Kling, Luma, Bark) billed to your Replicate account, not NICE', icon:'brand-replicate', tools:['search','search_docs','list_collections','get_collections','list_hardware','get_account','list_models','get_models','list_models_examples','get_models_readme','list_models_versions','get_models_versions','create_models','update_models','create_models_predictions','create_predictions','list_predictions','get_predictions','cancel_predictions','create_deployments','update_deployments','list_deployments','get_deployments','create_deployments_predictions','create_trainings','list_trainings','get_trainings','cancel_trainings'], transport:'streamable-http', auth:'oauth', cat:'media' },
    { id:'vercel',    name:'Vercel',            desc:'Deployments, projects, build & runtime logs — pending Vercel partner approval',  icon:'brand-vercel', tools:['list_teams','list_projects','get_project','list_deployments','get_deployment','get_deployment_build_logs','get_runtime_logs','search_documentation'], transport:'streamable-http', auth:'oauth', cat:'dev', comingSoon:true },
    { id:'asana',     name:'Asana',             desc:'Projects, tasks, sections, comments — pending Asana partner approval',           icon:'brand-asana', tools:['list_workspaces','list_projects','get_project','list_tasks','get_task','search_tasks'], transport:'streamable-http', auth:'oauth', cat:'pm', comingSoon:true },
    { id:'figma',     name:'Figma',             desc:'Files, frames, components, design tokens — pending Figma Dev Mode partner approval', icon:'brand-figma', tools:['list_files','get_file','get_node','get_components','search_files'], transport:'streamable-http', auth:'oauth', cat:'design', comingSoon:true },
    { id:'docusign',  name:'DocuSign',          desc:'Envelopes, templates, accounts, folders — pending DocuSign Partner Program enrollment', icon:'brand-docusign', tools:['list_envelopes','get_envelope','list_templates','get_template','list_accounts','list_folders','get_user_info'], transport:'streamable-http', auth:'oauth', cat:'docs', comingSoon:true },
  ];

  /* Exact match on catalog_id, then umbrella-prefix fallback so
     per-service rows resolve to the umbrella card. */
  function _matchConnection(catalogId, mcps) {
    const exact = mcps.find(c => c.catalog_id === catalogId);
    if (exact) return exact;
    return mcps.find(c => c.catalog_id && c.catalog_id.startsWith(catalogId + '-'));
  }

  // A persisted connection carries its Supabase row UUID as its id. Rows
  // created in-session before the next DB hydration keep a synthetic 'mc-…'
  // id, so a UUID is the signal that there is a server-side row to delete.
  function _isPersistedId(id) {
    return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  }

  // connIds with a delete in flight, so a double-click can't re-confirm.
  const _disconnecting = new Set();
  // catalog ids / custom-url keys with a create in flight, so a double-click
  // can't open a second insert while the first is unconfirmed.
  const _connecting = new Set();

  /* ── Demo seed data ───────────────────────────────────────────── */
  function _seedMcpConnections() {
    const sbUrl = (typeof SB !== 'undefined' && SB._url) ? SB._url : 'https://zacllshbgmnwsmliteqx.supabase.co';
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
  /* Lookup of `?<provider>_connected=true` params we may receive when
     the OAuth callback redirects back here. Adding a new provider is
     a single new row, not another duplicated if-block. */
  const OAUTH_RETURN_TOASTS = {
    google_connected:    { title: 'Google Connected',       message: 'Your Google account is now linked. Agents can access Gmail, Calendar, and Drive.' },
    microsoft_connected: { title: 'Microsoft 365 Connected', message: 'Your Microsoft account is now linked. Agents can access Outlook, Calendar, Contacts, and OneDrive.' },
    hubspot_connected:   { title: 'HubSpot Connected',      message: 'Your HubSpot account is now linked. Agents can read and update contacts, deals, and companies.' },
    github_connected:    { title: 'GitHub Connected',       message: 'Your GitHub account is now linked. Agents can read repos, issues, pull requests, and Actions.' },
    slack_connected:     { title: 'Slack Connected',        message: 'Your Slack workspace is now linked. Agents can read messages, channels, threads, canvases, and users.' },
    linear_connected:    { title: 'Linear Connected',       message: 'Your Linear workspace is now linked. Agents can read issues, projects, comments, teams, and cycles.' },
    notion_connected:    { title: 'Notion Connected',       message: 'Your Notion workspace is now linked. Agents can search and read pages, databases, blocks, and comments.' },
    stripe_connected:    { title: 'Stripe Connected',       message: 'Your Stripe account is now linked. Agents can read customers, charges, subscriptions, invoices, and products.' },
    atlassian_connected: { title: 'Atlassian Connected',    message: 'Your Atlassian site is now linked. Agents can search Jira issues, read Confluence pages, and pull Compass components.' },
    cloudflare_connected:{ title: 'Cloudflare Connected',   message: 'Your Cloudflare account is now linked. Agents can list Workers, KV, R2, D1, and Hyperdrive resources, and query D1 databases.' },
    cf_browser_connected:{ title: 'Cloudflare Browser Connected', message: 'Browser Rendering is now linked. Agents can fetch HTML, convert pages to Markdown, and capture screenshots from public URLs.' },
    cf_observability_connected:{ title: 'Cloudflare Observability Connected', message: 'Workers Observability is now linked. Agents can query logs, metrics, and field values for your Workers.' },
    cf_builds_connected:{ title: 'Cloudflare Builds Connected', message: 'Workers Builds is now linked. Agents can list builds, read build details, and fetch build logs for your Workers.' },
    sentry_connected:    { title: 'Sentry Connected',       message: 'Your Sentry organization is now linked. Agents can read issues, events, projects, releases, and run Seer analysis.' },
    zapier_connected:    { title: 'Zapier Connected',       message: 'Your Zapier MCP server is now linked. Visit mcp.zapier.com to enable specific actions across 9,000+ apps.' },
    airtable_connected:  { title: 'Airtable Connected',     message: 'Your Airtable workspace is now linked. Agents can list bases, read records, and search.' },
    monday_connected:    { title: 'monday.com Connected',   message: 'Your monday.com workspace is now linked. Agents can read boards, items, sub-items, updates, and documents.' },
    klaviyo_connected:   { title: 'Klaviyo Connected',      message: 'Your Klaviyo account is now linked. Agents can read profiles, lists, segments, campaigns, flows, and metrics.' },
    miro_connected:      { title: 'Miro Connected',         message: 'Your Miro account is now linked. Agents can read boards, items, connectors, and tags.' },
    replicate_connected: { title: 'Replicate Connected',    message: 'Your Replicate account is now linked. Agents can search models and generate images, video, and audio.' },
  };

  let _oauthHandled = false;
  function _handleOAuthReturn(el) {
    if (_oauthHandled) return;
    const hashParts = window.location.hash.split('?');
    const params = new URLSearchParams(hashParts[1] || window.location.search || '');

    let toast = null;
    for (const key of Object.keys(OAUTH_RETURN_TOASTS)) {
      if (params.get(key) === 'true') { toast = OAUTH_RETURN_TOASTS[key]; break; }
    }
    if (!toast) return;

    _oauthHandled = true;
    // Clean URL first so a re-render won't see the param a second time.
    const cleanHash = hashParts[0] || '#/security';
    history.replaceState(null, '', cleanHash);
    // Re-render the view once the async DB load completes — without this
    // the freshly-inserted mcp_connections row arrives AFTER render() has
    // already painted the cards from the seed, leaving the just-connected
    // service stuck on "Connect" until the user navigates away and back.
    _loadMcps((rows) => {
      if (!el || !document.contains(el)) return;
      if (!Array.isArray(rows) || rows.length === 0) return;
      render(el);
    });
    if (typeof Notify !== 'undefined') {
      Notify.send({ title: toast.title, message: toast.message, type: 'system' });
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
    const catLabels = { llm:'LLM', payments:'Payments', cloud:'Cloud', comms:'Comms', data:'Data', crm:'CRM', dev:'DevOps', auto:'Automation', other:'Other', workspace:'Workspace', design:'Design', pm:'Project Mgmt', ops:'Monitoring', media:'Media' };

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
          ${mcps.some(m => m.status === 'error') ? `<div class="intg-stat" title="Connections whose OAuth token was rejected by the provider — click Reconnect on the card to re-authorize">
            <span class="status-dot dot-r"></span>
            <span class="intg-stat-num">${mcps.filter(m => m.status === 'error').length}</span>
            <span class="intg-stat-label">Reconnect</span>
          </div>` : ''}
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

      <!-- Zapier Connect Modal -->
      <div class="modal-overlay" id="modal-zapier">
        <div class="modal-box">
          <div class="modal-hdr">
            <h3 class="modal-title">Connect Zapier</h3>
            <button class="modal-close" id="close-zapier-modal" aria-label="Close">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-x"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <form id="zapier-form" class="auth-form">
              <p class="auth-sub">Zapier gives each account its own MCP server URL. Visit <a href="https://mcp.zapier.com" target="_blank" rel="noopener">mcp.zapier.com</a>, create or open your MCP server, then copy its Server URL (it contains a private access token) and paste it below.</p>
              <div class="auth-field">
                <label for="zapier-url">MCP Server URL</label>
                <input type="url" id="zapier-url" required placeholder="https://mcp.zapier.com/api/v1/connect?token=..." />
              </div>
              <div class="auth-error" id="zapier-error"></div>
              <button type="submit" class="auth-submit">Connect Zapier</button>
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
    if (conn && conn.status === 'error') {
      const baseTip = 'The OAuth token for this connection was rejected by the provider. Click to re-authorize.';
      const tip = conn.last_error ? `${baseTip}\n\nGateway: ${conn.last_error}` : baseTip;
      return `<button class="btn ${sizeCls} btn-danger mcp-reconnect-btn" data-catalog-id="${mcp.id}" data-conn-id="${conn.id}" title="${_esc(tip)}"><span class="status-dot dot-r"></span> Reconnect</button>`;
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
      const errored = connected && conn.status === 'error';
      // OAuth tokens that the provider rejected — see _renderActionButton
      // for the Reconnect CTA. We add a card-level modifier so the visual
      // signal isn't button-only.
      const stateMod = errored ? 'mcp-catalog-card--error'
                       : connected ? 'mcp-catalog-card--connected' : '';
      const listMod  = errored ? 'intg-list-row--error'
                       : connected ? 'intg-list-row--connected' : '';
      const errorBadgeTip = errored && conn.last_error
        ? `OAuth token rejected — click Reconnect to re-authorize.\n\nGateway: ${conn.last_error}`
        : 'OAuth token rejected — click Reconnect to re-authorize';
      if (viewMode === 'list') {
        return `<div class="intg-list-row ${listMod}" data-cat="${mcp.cat}">
          <div class="intg-list-icon"><svg class="intg-list-icon-svg"><use href="#icon-${mcp.icon}"/></svg></div>
          <span class="intg-list-name">${mcp.name}${errored ? ` <span class="mcp-error-badge" title="${_esc(errorBadgeTip)}">Reconnect</span>` : ''}</span>
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
      const cardBadgeTip = errored && conn.last_error
        ? `OAuth token rejected by the provider — click Reconnect to re-authorize.\n\nGateway: ${conn.last_error}`
        : 'OAuth token rejected by the provider — click Reconnect to re-authorize';
      const errorBadge = errored
        ? ` <span class="mcp-error-badge" title="${_esc(cardBadgeTip)}">Reconnect</span>`
        : '';

      return `<div class="mcp-catalog-card ${stateMod}" data-cat="${mcp.cat}">
        <div class="mcp-catalog-top">
          <div class="mcp-catalog-icon"><svg class="mcp-catalog-icon-svg"><use href="#icon-${mcp.icon}"/></svg></div>
          <div class="mcp-catalog-info">
            <span class="mcp-catalog-name">${mcp.name}${errorBadge || scopeBadge}</span>
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
  /* `onAsyncLoad` fires once the DB fetch returns rows so callers
     (e.g. the OAuth-return handler) can re-render with real data.
     Sync return is the seed for the first paint. */
  function _loadMcps(onAsyncLoad) {
    const user = State.get('user');
    if (!user) return [];
    SB.db('mcp_connections').list({ userId: user.id }).then(rows => {
      if (rows && rows.length) {
        State.set('mcp_connections', rows);
        if (typeof onAsyncLoad === 'function') onAsyncLoad(rows);
      }
    }).catch(() => {});
    const seed = _seedMcpConnections();
    State.set('mcp_connections', seed);
    return seed;
  }

  /* ── Events ───────────────────────────────────────────────────── */
  function _bindEvents(el, _unused, mcps) {
    // Delegate connect/disconnect/reconnect clicks. Bind ONCE: render(el)
    // re-runs _bindEvents on the same el on every re-render (OAuth return,
    // connect, disconnect, custom/Zapier add) and el persists across them
    // (only its innerHTML is replaced), so re-adding the delegate each time
    // would stack listeners and fire the handler N times on a single click.
    // The handler reads ids off the clicked node and calls module fns, so a
    // once-bound delegate stays correct across re-renders.
    if (!el.dataset.intgDelegated) {
      el.dataset.intgDelegated = '1';
      el.addEventListener('click', (e) => {
        const mcpConn = e.target.closest('.mcp-connect-btn');
        if (mcpConn) return _connectMcp(mcpConn.dataset.catalogId, el);
        const mcpReconn = e.target.closest('.mcp-reconnect-btn');
        // Reconnect re-uses the same OAuth flow as Connect — the callback
        // upserts the existing row by user_id+catalog_id and resets status.
        if (mcpReconn) return _connectMcp(mcpReconn.dataset.catalogId, el, { reconnect: true });
        const mcpDisc = e.target.closest('.mcp-disconnect-btn');
        if (mcpDisc) return _disconnectMcp(mcpDisc.dataset.connId, el);
      });
    }

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
    document.getElementById('mcp-view-grid')?.addEventListener('click', () => { _mcpView = 'grid'; _toggleViewBtns('mcp', el); _applyFilters('mcp', el, [], mcps); });
    document.getElementById('mcp-view-list')?.addEventListener('click', () => { _mcpView = 'list'; _toggleViewBtns('mcp', el); _applyFilters('mcp', el, [], mcps); });
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

    // Zapier connect modal (paste-URL flow, not OAuth)
    document.getElementById('close-zapier-modal')?.addEventListener('click', () => {
      document.getElementById('modal-zapier')?.classList.remove('open');
      document.getElementById('zapier-form')?.reset();
    });
    document.getElementById('modal-zapier')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-zapier') { e.target.classList.remove('open'); document.getElementById('zapier-form')?.reset(); }
    });
    document.getElementById('zapier-form')?.addEventListener('submit', (e) => _connectZapier(e, el));

  }

  function _toggleViewBtns(section, el) {
    el.querySelector(`#${section}-view-grid`)?.classList.toggle('active', _mcpView === 'grid');
    el.querySelector(`#${section}-view-list`)?.classList.toggle('active', _mcpView === 'list');
  }

  /* ── MCP Actions ──────────────────────────────────────────────── */

  /** OAuth functions are served from the NICE custom domain.
   *  Keeps the URL the user sees during the redirect on api.nicespaceship.ai
   *  rather than the bare Supabase project host. The Supabase function URL
   *  still works as a fallback. */
  const NICE_API_BASE = 'https://api.nicespaceship.ai';
  const GOOGLE_OAUTH_URL    = `${NICE_API_BASE}/functions/v1/google-oauth`;
  const MICROSOFT_OAUTH_URL = `${NICE_API_BASE}/functions/v1/microsoft-oauth`;
  const HUBSPOT_OAUTH_URL   = `${NICE_API_BASE}/functions/v1/hubspot-oauth`;
  const GITHUB_OAUTH_URL    = `${NICE_API_BASE}/functions/v1/github-oauth`;
  const SLACK_OAUTH_URL     = `${NICE_API_BASE}/functions/v1/slack-oauth`;
  const LINEAR_OAUTH_URL    = `${NICE_API_BASE}/functions/v1/linear-oauth`;
  const NOTION_OAUTH_URL    = `${NICE_API_BASE}/functions/v1/notion-oauth`;
  const STRIPE_OAUTH_URL    = `${NICE_API_BASE}/functions/v1/stripe-oauth`;
  const ATLASSIAN_OAUTH_URL = `${NICE_API_BASE}/functions/v1/atlassian-oauth`;
  const CLOUDFLARE_OAUTH_URL = `${NICE_API_BASE}/functions/v1/cloudflare-oauth`;
  const CF_BROWSER_OAUTH_URL = `${NICE_API_BASE}/functions/v1/cf-browser-oauth`;
  const CF_OBSERVABILITY_OAUTH_URL = `${NICE_API_BASE}/functions/v1/cf-observability-oauth`;
  const CF_BUILDS_OAUTH_URL = `${NICE_API_BASE}/functions/v1/cf-builds-oauth`;
  const SENTRY_OAUTH_URL    = `${NICE_API_BASE}/functions/v1/sentry-oauth`;
  const AIRTABLE_OAUTH_URL  = `${NICE_API_BASE}/functions/v1/airtable-oauth`;
  const MONDAY_OAUTH_URL    = `${NICE_API_BASE}/functions/v1/monday-oauth`;
  const KLAVIYO_OAUTH_URL   = `${NICE_API_BASE}/functions/v1/klaviyo-oauth`;
  const MIRO_OAUTH_URL      = `${NICE_API_BASE}/functions/v1/miro-oauth`;
  const REPLICATE_OAUTH_URL = `${NICE_API_BASE}/functions/v1/replicate-oauth`;

  async function _connectMcp(catalogId, el, opts) {
    const catalog = MCP_CATALOG.find(m => m.id === catalogId);
    if (!catalog) return;
    if (catalog.comingSoon) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Coming soon', message: `${catalog.name} integration is not available yet.`, type: 'system' });
      return;
    }
    const conns = State.get('mcp_connections') || [];
    // Allow re-OAuth when an existing row is in error state (token rejected
    // by provider). The OAuth callbacks upsert by user_id+catalog_id and
    // reset status to 'connected', so re-running the same flow recovers
    // the row in place.
    const existing = _matchConnection(catalogId, conns) || conns.find(c => c.name === catalog.name);
    const isReconnect = !!(opts && opts.reconnect);
    if (existing && !isReconnect && existing.status !== 'error') return;

    // OAuth-based connections: redirect to OAuth flow
    if (catalog.auth === 'oauth' && catalogId === 'google') {
      return _initiateGoogleOAuth();
    }
    if (catalog.auth === 'oauth' && catalogId === 'microsoft') {
      return _initiateMicrosoftOAuth();
    }
    if (catalog.auth === 'oauth' && catalogId === 'hubspot') {
      return _initiateHubspotOAuth();
    }
    if (catalog.auth === 'oauth' && catalogId === 'github') {
      return _initiateGithubOAuth();
    }
    if (catalog.auth === 'oauth' && catalogId === 'slack') {
      return _initiateSlackOAuth();
    }
    if (catalog.auth === 'oauth' && catalogId === 'linear') {
      return _initiateLinearOAuth();
    }
    if (catalog.auth === 'oauth' && catalogId === 'notion') {
      return _initiateNotionOAuth();
    }
    if (catalog.auth === 'oauth' && catalogId === 'stripe') {
      return _initiateStripeOAuth();
    }
    if (catalog.auth === 'oauth' && catalogId === 'atlassian') {
      return _initiateAtlassianOAuth();
    }
    if (catalog.auth === 'oauth' && catalogId === 'cloudflare') {
      return _initiateCloudflareOAuth();
    }
    if (catalog.auth === 'oauth' && catalogId === 'cf-browser') {
      return _initiateCfBrowserOAuth();
    }
    if (catalog.auth === 'oauth' && catalogId === 'cf-observability') {
      return _initiateCfObservabilityOAuth();
    }
    if (catalog.auth === 'oauth' && catalogId === 'cf-builds') {
      return _initiateCfBuildsOAuth();
    }
    if (catalog.auth === 'oauth' && catalogId === 'sentry') {
      return _initiateSentryOAuth();
    }
    if (catalogId === 'zapier') {
      return _openZapierConnect();
    }
    if (catalog.auth === 'oauth' && catalogId === 'airtable') {
      return _initiateAirtableOAuth();
    }
    if (catalog.auth === 'oauth' && catalogId === 'monday') {
      return _initiateMondayOAuth();
    }
    if (catalog.auth === 'oauth' && catalogId === 'klaviyo') {
      return _initiateKlaviyoOAuth();
    }
    if (catalog.auth === 'oauth' && catalogId === 'miro') {
      return _initiateMiroOAuth();
    }
    if (catalog.auth === 'oauth' && catalogId === 'replicate') {
      return _initiateReplicateOAuth();
    }

    // Standard connections (API key / bearer / none)
    const serverUrl = `https://mcp.${catalogId}.com`;
    const user = State.get('user');

    const announce = (conn) => {
      State.set('mcp_connections', [...(State.get('mcp_connections') || []), conn]);
      render(el);
      if (typeof Notify !== 'undefined') Notify.send({ title: 'MCP Connected', message: `${catalog.name} is now available to all your agents.`, type: 'system' });
    };

    // No account to persist against: keep a local-only row. There is no DB
    // row, so no orphan is possible.
    if (!user) {
      announce({
        id: 'mc-' + Date.now(), name: catalog.name, server_url: serverUrl,
        transport: catalog.transport, auth_type: catalog.auth, available_tools: catalog.tools,
        status: 'connected', catalog_id: catalogId, created_at: new Date().toISOString(),
      });
      return;
    }

    // Persisted connection: await the insert and seed State from the returned
    // row so its id is the real Supabase UUID, not a synthetic 'mc-…'. State
    // and DB stay reconciled, so a later disconnect can target the row instead
    // of orphaning it server-side. catalog_id is the SSOT key matching DB rows
    // to catalog cards and to MissionComposer's per-template gates (e.g. Inbox
    // Captain needs google-gmail), so persist it on every create.
    if (_connecting.has(catalogId)) return;
    _connecting.add(catalogId);
    let row;
    try {
      row = await SB.db('mcp_connections').create({
        user_id: user.id, spaceship_id: 'account', name: catalog.name,
        server_url: serverUrl, transport: catalog.transport,
        auth_type: catalog.auth, available_tools: catalog.tools, status: 'connected',
        catalog_id: catalogId,
      });
    } catch (_) {
      // fall through to the failure toast below
    } finally {
      _connecting.delete(catalogId);
    }
    if (!row) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Connection failed', message: `Could not connect ${catalog.name}, please try again.`, type: 'error' });
      return;
    }
    announce(row);
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

  /** Initiate HubSpot OAuth flow — redirects to HubSpot consent screen */
  function _initiateHubspotOAuth() {
    const user = State.get('user');
    if (!user) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Sign In Required', message: 'Please sign in to connect HubSpot.', type: 'error' });
      return;
    }

    const redirectUrl = window.location.origin + '/app/#/security';
    const authUrl = `${HUBSPOT_OAUTH_URL}/authorize`
      + `?user_id=${encodeURIComponent(user.id)}`
      + `&redirect_url=${encodeURIComponent(redirectUrl)}`;

    window.location.href = authUrl;
  }

  /** Initiate GitHub OAuth flow — redirects to GitHub consent screen */
  function _initiateGithubOAuth() {
    const user = State.get('user');
    if (!user) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Sign In Required', message: 'Please sign in to connect GitHub.', type: 'error' });
      return;
    }

    const redirectUrl = window.location.origin + '/app/#/security';
    const authUrl = `${GITHUB_OAUTH_URL}/authorize`
      + `?user_id=${encodeURIComponent(user.id)}`
      + `&redirect_url=${encodeURIComponent(redirectUrl)}`;

    window.location.href = authUrl;
  }

  /** Initiate Slack OAuth flow — redirects to Slack consent screen */
  function _initiateSlackOAuth() {
    const user = State.get('user');
    if (!user) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Sign In Required', message: 'Please sign in to connect Slack.', type: 'error' });
      return;
    }

    const redirectUrl = window.location.origin + '/app/#/security';
    const authUrl = `${SLACK_OAUTH_URL}/authorize`
      + `?user_id=${encodeURIComponent(user.id)}`
      + `&redirect_url=${encodeURIComponent(redirectUrl)}`;

    window.location.href = authUrl;
  }

  /** Initiate Linear OAuth flow — redirects to Linear consent screen */
  function _initiateLinearOAuth() {
    const user = State.get('user');
    if (!user) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Sign In Required', message: 'Please sign in to connect Linear.', type: 'error' });
      return;
    }

    const redirectUrl = window.location.origin + '/app/#/security';
    const authUrl = `${LINEAR_OAUTH_URL}/authorize`
      + `?user_id=${encodeURIComponent(user.id)}`
      + `&redirect_url=${encodeURIComponent(redirectUrl)}`;

    window.location.href = authUrl;
  }

  /** Initiate Notion OAuth flow — redirects to Notion consent screen */
  function _initiateNotionOAuth() {
    const user = State.get('user');
    if (!user) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Sign In Required', message: 'Please sign in to connect Notion.', type: 'error' });
      return;
    }

    const redirectUrl = window.location.origin + '/app/#/security';
    const authUrl = `${NOTION_OAUTH_URL}/authorize`
      + `?user_id=${encodeURIComponent(user.id)}`
      + `&redirect_url=${encodeURIComponent(redirectUrl)}`;

    window.location.href = authUrl;
  }

  /** Initiate Stripe OAuth flow — redirects to Stripe consent screen */
  function _initiateStripeOAuth() {
    const user = State.get('user');
    if (!user) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Sign In Required', message: 'Please sign in to connect Stripe.', type: 'error' });
      return;
    }

    const redirectUrl = window.location.origin + '/app/#/security';
    const authUrl = `${STRIPE_OAUTH_URL}/authorize`
      + `?user_id=${encodeURIComponent(user.id)}`
      + `&redirect_url=${encodeURIComponent(redirectUrl)}`;

    window.location.href = authUrl;
  }

  /** Initiate Atlassian OAuth flow — redirects to Atlassian consent screen */
  function _initiateAtlassianOAuth() {
    const user = State.get('user');
    if (!user) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Sign In Required', message: 'Please sign in to connect Atlassian.', type: 'error' });
      return;
    }

    const redirectUrl = window.location.origin + '/app/#/security';
    const authUrl = `${ATLASSIAN_OAUTH_URL}/authorize`
      + `?user_id=${encodeURIComponent(user.id)}`
      + `&redirect_url=${encodeURIComponent(redirectUrl)}`;

    window.location.href = authUrl;
  }

  /** Initiate Cloudflare OAuth flow — redirects to Cloudflare consent screen */
  function _initiateCloudflareOAuth() {
    const user = State.get('user');
    if (!user) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Sign In Required', message: 'Please sign in to connect Cloudflare.', type: 'error' });
      return;
    }

    const redirectUrl = window.location.origin + '/app/#/security';
    const authUrl = `${CLOUDFLARE_OAUTH_URL}/authorize`
      + `?user_id=${encodeURIComponent(user.id)}`
      + `&redirect_url=${encodeURIComponent(redirectUrl)}`;

    window.location.href = authUrl;
  }

  function _initiateOAuthGeneric(name, baseUrl) {
    const user = State.get('user');
    if (!user) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Sign In Required', message: `Please sign in to connect ${name}.`, type: 'error' });
      return;
    }
    const redirectUrl = window.location.origin + '/app/#/security';
    window.location.href = `${baseUrl}/authorize?user_id=${encodeURIComponent(user.id)}&redirect_url=${encodeURIComponent(redirectUrl)}`;
  }

  function _initiateSentryOAuth()   { _initiateOAuthGeneric('Sentry',     SENTRY_OAUTH_URL); }
  function _initiateAirtableOAuth() { _initiateOAuthGeneric('Airtable',   AIRTABLE_OAUTH_URL); }
  function _initiateMondayOAuth()   { _initiateOAuthGeneric('monday.com', MONDAY_OAUTH_URL); }
  function _initiateKlaviyoOAuth()  { _initiateOAuthGeneric('Klaviyo',    KLAVIYO_OAUTH_URL); }
  function _initiateMiroOAuth()     { _initiateOAuthGeneric('Miro',       MIRO_OAUTH_URL); }
  function _initiateReplicateOAuth(){ _initiateOAuthGeneric('Replicate',  REPLICATE_OAUTH_URL); }
  function _initiateCfBrowserOAuth()       { _initiateOAuthGeneric('Cloudflare Browser',       CF_BROWSER_OAUTH_URL); }
  function _initiateCfObservabilityOAuth() { _initiateOAuthGeneric('Cloudflare Observability', CF_OBSERVABILITY_OAUTH_URL); }
  function _initiateCfBuildsOAuth()        { _initiateOAuthGeneric('Cloudflare Builds',        CF_BUILDS_OAUTH_URL); }

  async function _disconnectMcp(connId, el) {
    if (_disconnecting.has(connId)) return;
    if (!confirm('Disconnect this MCP? All agents will lose access to its tools.')) return;
    const conns = State.get('mcp_connections') || [];
    if (!conns.some(c => c.id === connId)) return;

    const drop = () => {
      State.set('mcp_connections', (State.get('mcp_connections') || []).filter(c => c.id !== connId));
      render(el);
      if (typeof Notify !== 'undefined') Notify.send({ title: 'MCP Disconnected', message: 'Connection removed.', type: 'system' });
    };

    // Local-only row (created in-session, never assigned a DB id): there is
    // nothing server-side to delete, so drop it from State directly.
    if (!_isPersistedId(connId)) { drop(); return; }

    // Persisted row: mcp-gateway loads this row's OAuth tokens server-side and
    // keeps invoking the provider until the row is gone. Await the delete and
    // claim "Disconnected" only once the DB confirms — a silently-failed write
    // must not leave a revoked-looking integration live for the agents.
    _disconnecting.add(connId);
    let ok = false;
    try {
      await SB.db('mcp_connections').remove(connId);
      ok = true;
    } catch (_) {
      // Leave the row in State so the card still reads "Connected" — the
      // truth server-side.
    } finally {
      _disconnecting.delete(connId);
    }
    if (!ok) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Disconnect failed', message: 'Could not disconnect. The integration is still active, please try again.', type: 'error' });
      return;
    }
    drop();
  }

  async function _addCustomMcp(e, el) {
    e.preventDefault();
    const errEl = document.getElementById('mcp-error');
    const name = document.getElementById('mcp-name').value.trim();
    const url = document.getElementById('mcp-url').value.trim();
    const transport = document.getElementById('mcp-transport').value;
    const auth = document.getElementById('mcp-auth').value;
    if (!name || !url) { errEl.textContent = 'Name and URL are required.'; return; }

    const finish = (conn) => {
      State.set('mcp_connections', [...(State.get('mcp_connections') || []), conn]);
      document.getElementById('modal-add-mcp')?.classList.remove('open');
      document.getElementById('mcp-custom-form')?.reset();
      render(el);
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Custom MCP Connected', message: `${name} is now available to all your agents.`, type: 'system' });
    };

    const user = State.get('user');
    if (!user) {
      finish({ id: 'mc-' + Date.now(), name, server_url: url, transport, auth_type: auth, available_tools: [], status: 'connected', catalog_id: null, created_at: new Date().toISOString() });
      return;
    }

    // Await the insert so the row enters State with its real Supabase UUID,
    // reconciled with the DB. A synthetic 'mc-…' id can't be matched back to
    // the row, so a same-session disconnect would orphan it server-side.
    const key = 'custom:' + url;
    if (_connecting.has(key)) return;
    _connecting.add(key);
    let row;
    try {
      row = await SB.db('mcp_connections').create({ user_id: user.id, spaceship_id: 'account', name, server_url: url, transport, auth_type: auth, available_tools: [], status: 'connected' });
    } catch (_) {
      // fall through to the inline error below
    } finally {
      _connecting.delete(key);
    }
    if (!row) {
      if (errEl) errEl.textContent = 'Could not save this connection. Please try again.';
      return;
    }
    finish(row);
  }

  function _openZapierConnect() {
    const user = State.get('user');
    if (!user) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Sign In Required', message: 'Please sign in to connect Zapier.', type: 'error' });
      return;
    }
    document.getElementById('zapier-form')?.reset();
    const errEl = document.getElementById('zapier-error');
    if (errEl) errEl.textContent = '';
    document.getElementById('modal-zapier')?.classList.add('open');
    setTimeout(() => document.getElementById('zapier-url')?.focus(), 50);
  }

  // Zapier issues each account a per-user MCP URL with the access token
  // embedded as a query param, not a standard OAuth grant. So the connection
  // is built from a pasted URL rather than the OAuth redirect every other
  // provider uses. auth_type is 'none' because the URL token is the
  // credential: the gateway sends no Authorization header and Zapier
  // authenticates the query param.
  async function _connectZapier(e, el) {
    e.preventDefault();
    const errEl = document.getElementById('zapier-error');
    const url = (document.getElementById('zapier-url')?.value || '').trim();
    let parsed;
    try { parsed = new URL(url); } catch (_) { if (errEl) errEl.textContent = 'Enter a valid URL.'; return; }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'mcp.zapier.com') {
      if (errEl) errEl.textContent = 'Paste the MCP Server URL from mcp.zapier.com. It should start with https://mcp.zapier.com/.';
      return;
    }

    const catalog = MCP_CATALOG.find(m => m.id === 'zapier');
    const existing = _matchConnection('zapier', State.get('mcp_connections') || []);
    const user = State.get('user');

    // Commit a connection object into State, replacing the existing Zapier row
    // in place (so the card stays one row) or appending a fresh one.
    const commit = (conn) => {
      const cur = State.get('mcp_connections') || [];
      State.set('mcp_connections', existing ? cur.map(c => (c.id === existing.id ? conn : c)) : [...cur, conn]);
      document.getElementById('modal-zapier')?.classList.remove('open');
      document.getElementById('zapier-form')?.reset();
      render(el);
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Zapier Connected', message: 'Your Zapier MCP server is now linked. Enable specific actions at mcp.zapier.com.', type: 'system' });
    };

    // Signed out: local-only row, no DB row to reconcile or orphan.
    if (!user) {
      commit(existing
        ? { ...existing, server_url: url, auth_type: 'none', status: 'connected', last_error: null, last_error_at: null }
        : { id: 'mc-' + Date.now(), name: 'Zapier', server_url: url, transport: catalog.transport, auth_type: 'none', available_tools: catalog.tools, status: 'connected', catalog_id: 'zapier', created_at: new Date().toISOString() });
      return;
    }

    // Await the write and seed State from the returned row so its id is the
    // real Supabase UUID. Updating in place only works when the existing row
    // is already persisted; an in-session mc- row has no DB counterpart yet,
    // so it must be created (and then replaces the mc- row, not duplicated).
    if (_connecting.has('zapier')) return;
    _connecting.add('zapier');
    let saved;
    try {
      if (existing && _isPersistedId(existing.id)) {
        saved = await SB.db('mcp_connections').update(existing.id, { server_url: url, auth_type: 'none', status: 'connected' });
      } else {
        saved = await SB.db('mcp_connections').create({
          user_id: user.id, spaceship_id: 'account', name: 'Zapier',
          server_url: url, transport: catalog.transport, auth_type: 'none',
          available_tools: catalog.tools, status: 'connected', catalog_id: 'zapier',
        });
      }
    } catch (_) {
      // fall through to the inline error below
    } finally {
      _connecting.delete('zapier');
    }
    if (!saved) {
      if (errEl) errEl.textContent = 'Could not save the connection. Please try again.';
      return;
    }
    commit(saved);
  }

  return { title, render, MCP_CATALOG, _isPersistedId, _disconnectMcp, _connectMcp, _addCustomMcp, _connectZapier };
})();
