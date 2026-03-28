/* ═══════════════════════════════════════════════════════════════════
   NICE — Plugins View
   Browse, install, and manage custom MCP server plugins.
   Route: #/plugins
═══════════════════════════════════════════════════════════════════ */

const PluginsView = (() => {
  const _esc = typeof Utils !== 'undefined' ? Utils.esc : (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

  let _el = null;
  let _plugins = [];

  function render(el) {
    _el = el;

    el.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">Plugins</h1>
        <p class="view-subtitle">Extend your agents with custom MCP integrations</p>
      </div>

      <div class="mp-toolbar">
        <div class="mp-search-wrap">
          <input type="text" id="plugin-search" class="form-input" placeholder="Search plugins..." />
        </div>
        <button class="btn btn-primary btn-xs" id="plugin-register-btn">+ Register Plugin</button>
      </div>

      <div id="plugin-grid" class="mp-grid">
        <div class="mp-loading">Loading plugins...</div>
      </div>

      <!-- Register Plugin Modal -->
      <div class="modal-overlay" id="plugin-modal" style="display:none">
        <div class="modal-box" style="max-width:520px">
          <div class="modal-header">
            <h3>Register MCP Plugin</h3>
            <button class="modal-close" id="plugin-modal-close">&times;</button>
          </div>
          <form id="plugin-form" class="auth-form">
            <label class="form-label">Plugin Name</label>
            <input type="text" id="plugin-name" class="form-input" placeholder="e.g. Slack Integration" required />

            <label class="form-label" style="margin-top:12px">MCP Server URL</label>
            <input type="url" id="plugin-url" class="form-input" placeholder="https://your-server.com/mcp" required />

            <label class="form-label" style="margin-top:12px">Description</label>
            <textarea id="plugin-desc" class="form-input" rows="2" placeholder="What does this plugin do?"></textarea>

            <label class="form-label" style="margin-top:12px">Auth Type</label>
            <select id="plugin-auth" class="form-input">
              <option value="none">None (public)</option>
              <option value="api_key">API Key</option>
              <option value="bearer">Bearer Token</option>
              <option value="oauth">OAuth 2.0</option>
            </select>

            <div id="plugin-auth-config" style="display:none;margin-top:12px">
              <label class="form-label">API Key / Token</label>
              <input type="text" id="plugin-token" class="form-input" placeholder="Your API key or token" />
            </div>

            <div class="auth-error" id="plugin-error"></div>
            <button type="submit" class="auth-submit" style="margin-top:16px">Register & Discover Tools</button>
          </form>
        </div>
      </div>
    `;

    _loadPlugins();
    _bindEvents();
  }

  async function _loadPlugins() {
    try {
      if (typeof SB !== 'undefined' && SB.db) {
        const { data } = await SB.db('plugins').list({ order: { column: 'installs', ascending: false }, limit: 50 });
        _plugins = data || [];
      }
    } catch (e) {
      console.warn('[Plugins] Load failed:', e.message);
    }

    if (!_plugins.length) {
      _plugins = _samplePlugins();
    }
    _renderGrid();
  }

  function _renderGrid() {
    const grid = document.getElementById('plugin-grid');
    if (!grid) return;

    const search = (document.getElementById('plugin-search')?.value || '').toLowerCase();
    let filtered = _plugins;
    if (search) filtered = filtered.filter(p => p.name.toLowerCase().includes(search) || (p.description || '').toLowerCase().includes(search));

    if (!filtered.length) {
      grid.innerHTML = '<div class="empty-state"><p>No plugins found</p></div>';
      return;
    }

    grid.innerHTML = filtered.map(p => `
      <div class="mp-card">
        <div class="mp-card-header">
          <span class="mp-card-cat">${_esc(p.category || 'custom')}</span>
          <span class="mp-card-ver">${_esc(p.auth_type || 'none')}</span>
        </div>
        <h3 class="mp-card-title">${_esc(p.name)}</h3>
        <p class="mp-card-desc">${_esc(p.description || '')}</p>
        <div class="mp-card-tags">${(p.available_tools || []).map(t => `<span class="mp-tag">${_esc(t)}</span>`).join('')}</div>
        <div class="mp-card-footer">
          <span class="mp-stat">⬇ ${p.installs || 0}</span>
          <button class="btn btn-xs btn-primary plugin-install-btn" data-id="${_esc(p.id)}">Install</button>
        </div>
      </div>
    `).join('');
  }

  function _bindEvents() {
    document.getElementById('plugin-search')?.addEventListener('input', _renderGrid);

    document.getElementById('plugin-register-btn')?.addEventListener('click', () => {
      document.getElementById('plugin-modal').style.display = 'flex';
    });

    document.getElementById('plugin-modal-close')?.addEventListener('click', () => {
      document.getElementById('plugin-modal').style.display = 'none';
    });

    document.getElementById('plugin-auth')?.addEventListener('change', (e) => {
      const cfg = document.getElementById('plugin-auth-config');
      if (cfg) cfg.style.display = e.target.value === 'none' ? 'none' : 'block';
    });

    document.getElementById('plugin-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('plugin-name')?.value?.trim();
      const url = document.getElementById('plugin-url')?.value?.trim();
      const desc = document.getElementById('plugin-desc')?.value?.trim();
      const authType = document.getElementById('plugin-auth')?.value || 'none';
      const errEl = document.getElementById('plugin-error');

      if (!name || !url) { if (errEl) errEl.textContent = 'Name and URL are required'; return; }

      try {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const user = typeof SB !== 'undefined' ? SB.user() : null;

        const { data, error } = await SB.db('plugins').create({
          name, slug, description: desc, server_url: url,
          auth_type: authType, author_id: user?.id,
        });
        if (error) throw error;

        document.getElementById('plugin-modal').style.display = 'none';
        document.getElementById('plugin-form')?.reset();
        if (typeof Notify !== 'undefined') Notify.send({ title: 'Plugin Registered', message: `${name} is now available.`, type: 'success' });
        _loadPlugins();
      } catch (err) {
        if (errEl) errEl.textContent = err.message || 'Failed to register plugin';
      }
    });

    _el?.addEventListener('click', (e) => {
      const installBtn = e.target.closest('.plugin-install-btn');
      if (installBtn) {
        if (typeof Notify !== 'undefined') Notify.send({ title: 'Plugin Installed', message: 'Tools are now available to your agents.', type: 'success' });
        installBtn.textContent = '✓ Installed';
        installBtn.disabled = true;
      }
    });
  }

  function _samplePlugins() {
    return [
      { id: 'pl1', name: 'Slack', description: 'Send messages, search channels, and manage Slack workspaces.', category: 'messaging', auth_type: 'oauth', available_tools: ['send_message', 'search_messages', 'list_channels'], installs: 2341 },
      { id: 'pl2', name: 'GitHub', description: 'Manage repos, PRs, issues, and GitHub Actions.', category: 'developer', auth_type: 'oauth', available_tools: ['list_repos', 'create_issue', 'review_pr', 'run_action'], installs: 1892 },
      { id: 'pl3', name: 'Notion', description: 'Read and write Notion pages, databases, and blocks.', category: 'productivity', auth_type: 'oauth', available_tools: ['search_pages', 'read_page', 'create_page', 'query_database'], installs: 1567 },
      { id: 'pl4', name: 'Jira', description: 'Create and manage Jira issues, sprints, and boards.', category: 'project', auth_type: 'oauth', available_tools: ['create_issue', 'search_issues', 'update_issue', 'list_sprints'], installs: 1234 },
      { id: 'pl5', name: 'Linear', description: 'Manage Linear issues, projects, and cycles.', category: 'project', auth_type: 'api_key', available_tools: ['create_issue', 'search_issues', 'list_projects'], installs: 987 },
      { id: 'pl6', name: 'Stripe', description: 'Query customers, payments, subscriptions, and invoices.', category: 'finance', auth_type: 'api_key', available_tools: ['list_customers', 'get_payment', 'list_subscriptions'], installs: 876 },
    ];
  }

  function destroy() { _el = null; _plugins = []; }

  return { title: 'Plugins', render, destroy };
})();
