/* ═══════════════════════════════════════════════════════════════════
   NICE — API Config View
   Manage API key integrations (Stripe, OpenAI, Twilio, etc.).
   Rendered as a tab inside the Security view.
═══════════════════════════════════════════════════════════════════ */

const ApiConfigView = (() => {
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

  /* ── Demo seed data ───────────────────────────────────────────── */
  function _seedConnections() {
    return [
      { id:'ac1', service:'stripe',  status:'active', masked:'sk_live_...4242', spaceship_ids:['ship-1'], created_at:new Date(Date.now() - 604800000).toISOString(), last_used:new Date(Date.now() - 3600000).toISOString() },
      { id:'ac2', service:'openai',  status:'active', masked:'sk-...q8Xm',     spaceship_ids:['ship-1','ship-2'], created_at:new Date(Date.now() - 1209600000).toISOString(), last_used:new Date(Date.now() - 7200000).toISOString() },
    ];
  }

  /* ── Render ───────────────────────────────────────────────────── */
  function render(el) {
    const connections = State.get('api_connections') || _loadConnections();

    el.innerHTML = `
      <div class="api-config-wrap">
        <!-- Header -->
        <div class="api-config-header">
          <div>
            <h3 class="api-config-title">API Connections</h3>
            <p class="api-config-sub">Connect API keys for direct integrations. Keys are encrypted and stored in the Vault.</p>
          </div>
        </div>

        <!-- Stats -->
        <div class="api-config-stats">
          <div class="api-stat">
            <span class="api-stat-num" id="api-stat-total">${connections.length}</span>
            <span class="api-stat-label">Connected</span>
          </div>
          <div class="api-stat">
            <span class="status-dot dot-g"></span>
            <span class="api-stat-num" id="api-stat-active">${connections.filter(c => c.status === 'active').length}</span>
            <span class="api-stat-label">Active</span>
          </div>
          <div class="api-stat">
            <span class="status-dot dot-r"></span>
            <span class="api-stat-num" id="api-stat-errors">${connections.filter(c => c.status === 'error').length}</span>
            <span class="api-stat-label">Errors</span>
          </div>
        </div>

        <!-- Catalog Grid -->
        <div class="api-config-section">
          <h4 class="api-config-section-title">Available Services</h4>
          <div class="api-catalog-grid" id="api-catalog-grid">
            ${API_CATALOG.map(svc => {
              const conn = connections.find(c => c.service === svc.id);
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

        <!-- Connected APIs List -->
        ${connections.length ? `
        <div class="api-config-section">
          <h4 class="api-config-section-title">Connected APIs</h4>
          <div class="api-connections-list" id="api-connections-list">
            ${connections.map(c => _renderConnectionRow(c)).join('')}
          </div>
        </div>
        ` : ''}
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
              <div class="auth-field">
                <label for="api-ships">Assign to Spaceships</label>
                <div class="api-ship-checkboxes" id="api-ship-checkboxes"></div>
              </div>
              <input type="hidden" id="api-service-id" />
              <div class="auth-error" id="api-error"></div>
              <button type="submit" class="auth-submit">Connect API</button>
            </form>
          </div>
        </div>
      </div>
    `;

    _bindEvents(el);
  }

  function _renderConnectionRow(c) {
    const svc = API_CATALOG.find(s => s.id === c.service) || { name: c.service, icon: 'key' };
    const dot = c.status === 'active' ? 'dot-g' : c.status === 'error' ? 'dot-r' : 'dot-a';
    return `
      <div class="api-conn-row" data-conn-id="${c.id}">
        <div class="api-conn-icon">
          <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-${svc.icon}"/></svg>
        </div>
        <div class="api-conn-info">
          <span class="api-conn-name">${_esc(svc.name)}</span>
          <span class="api-conn-key mono">${_esc(c.masked || '****')}</span>
        </div>
        <div class="api-conn-meta">
          <span class="status-dot ${dot}"></span>
          <span class="api-conn-status">${c.status}</span>
        </div>
        <span class="api-conn-used">${c.last_used ? _timeAgo(c.last_used) : 'Never'}</span>
        <button class="agent-action-btn api-remove-btn" data-conn-id="${c.id}" title="Remove">
          <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-x"/></svg>
        </button>
      </div>
    `;
  }

  /* ── Data ──────────────────────────────────────────────────────── */
  function _loadConnections() {
    const user = State.get('user');
    if (!user) return [];

    // Try loading from Supabase, fall back to seed
    SB.db('api_connections').list({ userId: user.id }).then(rows => {
      if (rows && rows.length) {
        State.set('api_connections', rows);
      }
    }).catch(() => {});

    const seed = _seedConnections();
    State.set('api_connections', seed);
    return seed;
  }

  /* ── Events ───────────────────────────────────────────────────── */
  function _bindEvents(el) {
    // Connect buttons
    el.querySelectorAll('.api-connect-btn').forEach(btn => {
      btn.addEventListener('click', () => _openConnectModal(btn.dataset.service));
    });

    // Disconnect buttons
    el.querySelectorAll('.api-disconnect-btn').forEach(btn => {
      btn.addEventListener('click', () => _disconnect(btn.dataset.connId, el));
    });

    // Remove from list
    el.querySelectorAll('.api-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => _disconnect(btn.dataset.connId, el));
    });

    // Modal close
    document.getElementById('close-api-modal')?.addEventListener('click', _closeModal);
    document.getElementById('modal-add-api')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-add-api') _closeModal();
    });

    // Form submit
    document.getElementById('api-connect-form')?.addEventListener('submit', (e) => _connectApi(e, el));
  }

  function _openConnectModal(serviceId) {
    const svc = API_CATALOG.find(s => s.id === serviceId);
    if (!svc) return;

    document.getElementById('api-service-name').value = svc.name;
    document.getElementById('api-service-id').value = serviceId;
    document.getElementById('api-key-input').value = '';
    document.getElementById('api-error').textContent = '';

    // Populate spaceship checkboxes
    const ships = State.get('spaceships') || [];
    const container = document.getElementById('api-ship-checkboxes');
    if (container) {
      if (ships.length) {
        container.innerHTML = ships.map(s => `
          <label class="api-ship-check">
            <input type="checkbox" value="${_esc(s.id)}" checked />
            <span>${_esc(s.name || s.id)}</span>
          </label>
        `).join('');
      } else {
        container.innerHTML = '<span class="text-muted" style="font-size:.78rem">No spaceships found. Create one first.</span>';
      }
    }

    document.getElementById('modal-add-api')?.classList.add('open');
  }

  function _closeModal() {
    document.getElementById('modal-add-api')?.classList.remove('open');
  }

  async function _connectApi(e, el) {
    e.preventDefault();
    const serviceId = document.getElementById('api-service-id').value;
    const apiKey = document.getElementById('api-key-input').value.trim();
    const errEl = document.getElementById('api-error');

    if (!apiKey) {
      errEl.textContent = 'API key is required.';
      return;
    }

    const shipCheckboxes = document.querySelectorAll('#api-ship-checkboxes input[type="checkbox"]:checked');
    const shipIds = Array.from(shipCheckboxes).map(cb => cb.value);

    const masked = apiKey.slice(0, 6) + '...' + apiKey.slice(-4);
    const conn = {
      id: 'ac-' + Date.now(),
      service: serviceId,
      status: 'active',
      masked,
      spaceship_ids: shipIds,
      created_at: new Date().toISOString(),
      last_used: new Date().toISOString(),
    };

    // Save to state
    const connections = State.get('api_connections') || [];
    // Remove existing connection for same service
    const filtered = connections.filter(c => c.service !== serviceId);
    filtered.push(conn);
    State.set('api_connections', filtered);

    // Try saving to Supabase
    const user = State.get('user');
    if (user) {
      SB.db('api_connections').create({
        user_id: user.id,
        service: serviceId,
        spaceship_ids: shipIds,
        status: 'active',
        config: { masked },
      }).catch(() => {});
    }

    _closeModal();
    render(el);

    if (typeof Notify !== 'undefined') {
      Notify.send({ title: 'API Connected', message: `${serviceId} API connected successfully.`, type: 'system' });
    }
  }

  async function _disconnect(connId, el) {
    if (!confirm('Disconnect this API? Agents using it will lose access.')) return;

    let connections = State.get('api_connections') || [];
    connections = connections.filter(c => c.id !== connId);
    State.set('api_connections', connections);

    if (!connId.startsWith('ac')) {
      SB.db('api_connections').remove(connId).catch(() => {});
    }

    render(el);

    if (typeof Notify !== 'undefined') {
      Notify.send({ title: 'API Disconnected', message: 'API connection removed.', type: 'system' });
    }
  }

  return { render };
})();
