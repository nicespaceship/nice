/* ═══════════════════════════════════════════════════════════════════
   NICE — Vault View
   Store API keys, credentials, and secrets securely.
   Visual Certificate of Authenticity for agent blueprints.
═══════════════════════════════════════════════════════════════════ */

const VaultView = (() => {
  const title = 'Vault';
  const _esc = Utils.esc;
  const _timeAgo = Utils.timeAgo;

  function render(el) {
    const user = State.get('user');
    if (!user) return _authPrompt(el, 'the secure vault');

    el.innerHTML = `
      <div class="vault-wrap">
        <div class="vault-header">
          <div>
            <h1 class="vault-title">Secure Vault</h1>
            <p class="vault-sub">Store API keys, credentials, and secrets. Agents access what they need — nothing more.</p>
          </div>
          <button class="btn btn-primary btn-sm" id="btn-add-secret">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-plus"/></svg>
            Add Secret
          </button>
        </div>

        <!-- Vault Stats -->
        <div class="vault-stats">
          <div class="vault-stat">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-key"/></svg>
            <span class="vault-stat-num" id="vs-total">0</span>
            <span class="vault-stat-label">Secrets</span>
          </div>
          <div class="vault-stat">
            <span class="status-dot dot-g"></span>
            <span class="vault-stat-num" id="vs-active">0</span>
            <span class="vault-stat-label">Active</span>
          </div>
          <div class="vault-stat">
            <span class="status-dot dot-a"></span>
            <span class="vault-stat-num" id="vs-expired">0</span>
            <span class="vault-stat-label">Expiring</span>
          </div>
        </div>

        <!-- Agent Certificates -->
        <div class="vault-certs">
          <h3 class="vault-section-title">Agent Certificates</h3>
          <p class="vault-section-desc">Verify agent blueprint authenticity using the serial code.</p>
          <div class="cert-verify-bar">
            <input type="text" id="cert-serial-input" class="search-input" placeholder="XXXX-XXXX-XXXX-XXXX" maxlength="19" style="text-transform:uppercase;letter-spacing:2px;font-family:var(--font-m)" />
            <button class="btn btn-primary btn-sm" id="btn-verify-cert">&#9745; Verify</button>
          </div>
          <div id="cert-result"></div>
        </div>

        <!-- LLM Providers -->
        <div class="vault-providers">
          <h3 class="vault-section-title">LLM Providers</h3>
          <p class="vault-section-desc">Connect your AI provider accounts. Agents use these keys to run.</p>
          <div class="vault-provider-grid" id="vault-provider-grid"></div>
        </div>

        <!-- Secret List -->
        <div class="vault-list" id="vault-list">
          <div class="loading-state"><p>Loading secrets...</p></div>
        </div>
      </div>

      <!-- Add Secret Modal -->
      <div class="modal-overlay" id="modal-add-secret">
        <div class="modal-box">
          <div class="modal-hdr">
            <h3 class="modal-title">Add Secret</h3>
            <button class="modal-close" id="close-secret-modal" aria-label="Close">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-x"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <form id="secret-form" class="auth-form">
              <div class="auth-field">
                <label for="s-name">Secret Name</label>
                <input type="text" id="s-name" required placeholder="e.g. OPENAI_API_KEY" />
              </div>
              <div class="auth-field">
                <label for="s-service">Service</label>
                <select id="s-service" class="filter-select builder-select">
                  <option value="api_key">API Key</option>
                  <option value="oauth_token">OAuth Token</option>
                  <option value="database_url">Database URL</option>
                  <option value="webhook">Webhook Secret</option>
                  <option value="ssh_key">SSH Key</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div class="auth-field">
                <label for="s-value">Secret Value</label>
                <input type="password" id="s-value" required placeholder="Enter secret value..." />
              </div>
              <div class="auth-error" id="secret-error"></div>
              <button type="submit" class="auth-submit" id="secret-submit-btn">Save Secret</button>
            </form>
          </div>
        </div>
      </div>
    `;

    _loadSecrets();
    _bindEvents();
    _bindProviderEvents();
    _bindCertEvents();
  }

  /* ── Certificate Verification ───────────────────────────────── */

  function _bindCertEvents() {
    document.getElementById('btn-verify-cert')?.addEventListener('click', _verifyCert);
    document.getElementById('cert-serial-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') _verifyCert();
    });

    // Deep-link: #/vault?verify=SERIALCODE
    const hashParts = (window.location.hash || '').split('?');
    const params = new URLSearchParams(hashParts[1] || '');
    const autoVerify = params.get('verify');
    if (autoVerify) {
      const input = document.getElementById('cert-serial-input');
      if (input) { input.value = autoVerify; _verifyCert(); }
    }
  }

  function _verifyCert() {
    const input = document.getElementById('cert-serial-input');
    const resultEl = document.getElementById('cert-result');
    if (!input || !resultEl) return;

    const code = input.value.trim().toUpperCase().replace(/-/g, '');
    if (!code || code.length < 10) {
      resultEl.innerHTML = '<div class="cert-error">Enter a valid serial code.</div>';
      return;
    }

    // Format for display comparison (XXXX-XXXX-XXXX-XXXX)
    const formatted = code.replace(/(.{4})(?=.)/g, '$1-');

    // Search all agent blueprints for a matching serial
    const allBps = (typeof BlueprintStore !== 'undefined') ? BlueprintStore.listAgents()
      : (typeof BlueprintsView !== 'undefined' && BlueprintsView.SEED) ? BlueprintsView.SEED : [];
    let match = null;
    for (const bp of allBps) {
      const serial = BlueprintsView.serialHash(bp.id || bp.name);
      if (serial.code === formatted || serial.raw === code) { match = { bp, serial }; break; }
    }

    if (match) {
      _renderCertificate(resultEl, match.bp, match.serial);
    } else {
      resultEl.innerHTML = `
        <div class="cert-card cert-unverified">
          <div class="cert-badge cert-badge-fail">&#10007; UNVERIFIED</div>
          <p class="cert-msg">No registered agent matches serial <span class="mono">${_esc(code)}</span>.</p>
          <p class="cert-hint">Check for typos or verify the serial from the original blueprint card.</p>
        </div>`;
    }
  }

  function _renderCertificate(el, bp, serial) {
    const colors = (typeof BlueprintsView !== 'undefined' && BlueprintsView.categoryColors) ? BlueprintsView.categoryColors : {};
    const color = colors[bp.category] || '#6366f1';
    const avatar = BlueprintsView.avatarArt(bp.name, bp.category, serial);
    const rarityLabel = (bp.rarity || 'Common').toUpperCase();
    const now = new Date().toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });

    el.innerHTML = `
      <div class="cert-card cert-verified">
        <div class="cert-badge cert-badge-pass">&#10003; VERIFIED AUTHENTIC</div>

        <div class="cert-avatar">${avatar}</div>

        <div class="cert-details">
          <h3 class="cert-agent-name">${_esc(bp.name)}</h3>
          <div class="cert-meta">
            <span class="cert-tag" style="border-color:${color};color:${color}">${_esc(bp.category)}</span>
            <span class="cert-rarity">${rarityLabel}</span>
          </div>
          <div class="cert-serial mono">${serial.code}</div>
          <p class="cert-flavor">${_esc(bp.flavor || '')}</p>
        </div>

        <div class="cert-footer">
          <span>Verified ${now}</span>
          <span class="cert-issuer">Nice Spaceship\u2122 Certificate Authority</span>
        </div>
      </div>`;
  }

  /* ── Secrets ────────────────────────────────────────────────── */

  async function _loadSecrets() {
    const user = State.get('user');
    let secrets = [];

    try {
      secrets = await SB.db('vault_secrets').list({ userId: user.id }).catch(() => []);
    } catch(e) {}

    // Seed if empty
    if (!secrets.length) {
      secrets = _seedSecrets();
    }

    State.set('vault_secrets', secrets);
    _renderSecrets(secrets);
    _updateStats(secrets);
    _renderProviders(secrets);
  }

  function _seedSecrets() {
    return [
      { id:'vs1', name:'ANTHROPIC_API_KEY', service:'api_key', masked:'sk-ant-...q8Xm', status:'active', created_at:new Date(Date.now() - 604800000).toISOString(), last_used:new Date(Date.now() - 3600000).toISOString() },
      { id:'vs2', name:'SUPABASE_SERVICE_KEY', service:'api_key', masked:'eyJhbG...kZWY', status:'active', created_at:new Date(Date.now() - 1209600000).toISOString(), last_used:new Date(Date.now() - 7200000).toISOString() },
      { id:'vs3', name:'GITHUB_TOKEN', service:'oauth_token', masked:'ghp_...R4nD', status:'active', created_at:new Date(Date.now() - 2592000000).toISOString(), last_used:new Date(Date.now() - 86400000).toISOString() },
      { id:'vs4', name:'DATABASE_URL', service:'database_url', masked:'postgres://...prod', status:'active', created_at:new Date(Date.now() - 5184000000).toISOString(), last_used:new Date(Date.now() - 172800000).toISOString() },
      { id:'vs5', name:'STRIPE_SECRET', service:'api_key', masked:'sk_live_...9zKp', status:'expiring', created_at:new Date(Date.now() - 7776000000).toISOString(), last_used:new Date(Date.now() - 604800000).toISOString() },
    ];
  }

  function _renderSecrets(secrets) {
    const list = document.getElementById('vault-list');
    if (!list) return;

    if (!secrets.length) {
      list.innerHTML = `
        <div class="app-empty">
          <svg class="app-empty-icon" fill="none" stroke="currentColor" stroke-width="1.2"><use href="#icon-key"/></svg>
          <h2>Vault Empty</h2>
          <p>Add API keys, tokens, and credentials for your agents to use.</p>
          <div class="app-empty-acts">
            <button class="btn btn-primary btn-sm" onclick="document.getElementById('modal-add-secret').classList.add('open')">Add Secret</button>
          </div>
        </div>`;
      return;
    }

    list.innerHTML = secrets.map(s => {
      const dot = s.status === 'active' ? 'dot-g' : s.status === 'expiring' ? 'dot-a' : 'dot-r';
      const serviceLabel = s.service.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return `
        <div class="vault-row" data-id="${s.id}">
          <div class="vault-row-icon">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-key"/></svg>
          </div>
          <div class="vault-row-info">
            <span class="vault-row-name">${_esc(s.name)}</span>
            <span class="vault-row-service">${_esc(serviceLabel)}</span>
          </div>
          <div class="vault-row-masked mono">${_esc(s.masked)}</div>
          <div class="vault-row-meta">
            <span class="status-dot ${dot}"></span>
            <span class="vault-row-used">Used ${_timeAgo(s.last_used)}</span>
            <span class="vault-row-age ${_keyAgeDays(s.created_at) > 90 ? 'vault-age-warn' : ''}">Created ${_timeAgo(s.created_at)}</span>
          </div>
          <div class="vault-row-actions">
            <button class="agent-action-btn vault-rotate-btn" data-id="${s.id}" title="Rotate Key">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-refresh"/></svg>
            </button>
            <button class="agent-action-btn vault-delete-btn" data-id="${s.id}" title="Revoke">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-x"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Bind rotate
    list.querySelectorAll('.vault-rotate-btn').forEach(btn => {
      btn.addEventListener('click', () => _rotateSecret(btn.dataset.id));
    });

    // Bind delete
    list.querySelectorAll('.vault-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => _deleteSecret(btn.dataset.id));
    });
  }

  function _updateStats(secrets) {
    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('vs-total', secrets.length);
    el('vs-active', secrets.filter(s => s.status === 'active').length);
    el('vs-expired', secrets.filter(s => s.status === 'expiring').length);
  }

  async function _deleteSecret(id) {
    if (!confirm('Revoke this secret? Agents using it will lose access.')) return;
    let secrets = State.get('vault_secrets') || [];
    secrets = secrets.filter(s => s.id !== id);
    State.set('vault_secrets', secrets);
    _renderSecrets(secrets);
    _updateStats(secrets);
    if (!id.startsWith('vs')) {
      SB.db('vault_secrets').remove(id).catch(() => {});
    }
  }

  async function _addSecret(e) {
    e.preventDefault();
    const errEl = document.getElementById('secret-error');
    const btn = document.getElementById('secret-submit-btn');
    errEl.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const user = State.get('user');
    const name = document.getElementById('s-name').value.trim();
    const service = document.getElementById('s-service').value;
    const value = document.getElementById('s-value').value;

    if (!name || !value) {
      errEl.textContent = 'Name and value are required.';
      btn.disabled = false;
      btn.textContent = 'Save Secret';
      return;
    }

    const masked = value.slice(0, 6) + '...' + value.slice(-4);
    const secret = {
      name, service, masked, status: 'active',
      created_at: new Date().toISOString(),
      last_used: new Date().toISOString(),
    };

    try {
      const saved = await SB.db('vault_secrets').create({
        user_id: user.id,
        name, service, encrypted_value: value, // In production: encrypt client-side
      }).catch(() => null);

      secret.id = saved?.id || 'vs-' + Date.now();
      let secrets = State.get('vault_secrets') || [];
      secrets.unshift(secret);
      State.set('vault_secrets', secrets);
      _renderSecrets(secrets);
      _updateStats(secrets);
      document.getElementById('modal-add-secret')?.classList.remove('open');
      document.getElementById('secret-form')?.reset();
      const nameInput = document.getElementById('s-name');
      if (nameInput) nameInput.readOnly = false;
      _renderProviders(secrets);
    } catch(err) {
      errEl.textContent = err.message || 'Failed to save secret.';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Secret';
    }
  }

  function _renderProviders(secrets) {
    const grid = document.getElementById('vault-provider-grid');
    if (!grid || typeof LLM_PROVIDERS === 'undefined') return;

    grid.innerHTML = LLM_PROVIDERS.map(p => {
      const secret = secrets.find(s => s.name === p.vaultKey && s.status === 'active');
      const connected = !!secret;
      return `
        <div class="vault-provider-card ${connected ? 'connected' : ''}">
          <div class="vault-provider-hdr">
            <span class="vault-provider-icon">${p.icon}</span>
            <span class="vault-provider-name">${_esc(p.name)}</span>
          </div>
          <div class="vault-provider-status">
            <span class="status-dot ${connected ? 'dot-g' : 'dot-off'}"></span>
            <span>${connected ? 'Connected' : 'Not Connected'}</span>
          </div>
          ${connected
            ? `<button class="btn btn-sm vault-provider-disconnect" data-vault-key="${p.vaultKey}" data-secret-id="${secret.id}">Disconnect</button>`
            : `<button class="btn btn-sm btn-primary vault-provider-connect" data-vault-key="${p.vaultKey}" data-provider="${_esc(p.name)}">Connect</button>`
          }
        </div>
      `;
    }).join('');

    // Re-bind provider button events
    _bindProviderEvents();
  }

  function _bindProviderEvents() {
    // Connect buttons — open modal with pre-filled provider key name
    document.querySelectorAll('.vault-provider-connect').forEach(btn => {
      btn.addEventListener('click', () => {
        const nameInput = document.getElementById('s-name');
        const serviceSelect = document.getElementById('s-service');
        if (nameInput) {
          nameInput.value = btn.dataset.vaultKey;
          nameInput.readOnly = true;
        }
        if (serviceSelect) serviceSelect.value = 'api_key';
        document.getElementById('modal-add-secret')?.classList.add('open');
      });
    });

    // Disconnect buttons
    document.querySelectorAll('.vault-provider-disconnect').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm(`Disconnect ${btn.dataset.vaultKey}? Agents using this provider will lose access.`)) return;
        _deleteSecret(btn.dataset.secretId);
        // Re-render providers after deletion
        setTimeout(() => _renderProviders(State.get('vault_secrets') || []), 100);
      });
    });
  }

  function _bindEvents() {
    document.getElementById('btn-add-secret')?.addEventListener('click', () => {
      document.getElementById('modal-add-secret')?.classList.add('open');
    });
    document.getElementById('close-secret-modal')?.addEventListener('click', () => {
      document.getElementById('modal-add-secret')?.classList.remove('open');
      const nameInput = document.getElementById('s-name');
      if (nameInput) nameInput.readOnly = false;
    });
    document.getElementById('modal-add-secret')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-add-secret') {
        e.target.classList.remove('open');
        const nameInput = document.getElementById('s-name');
        if (nameInput) nameInput.readOnly = false;
      }
    });
    document.getElementById('secret-form')?.addEventListener('submit', _addSecret);
  }

  function _keyAgeDays(created_at) {
    if (!created_at) return 0;
    return Math.floor((Date.now() - new Date(created_at).getTime()) / 86400000);
  }

  async function _rotateSecret(id) {
    let secrets = State.get('vault_secrets') || [];
    const secret = secrets.find(s => s.id === id);
    if (!secret) return;

    const newValue = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    secret.masked = newValue.slice(0, 6) + '...' + newValue.slice(-4);
    secret.created_at = new Date().toISOString();
    secret.status = 'active';

    // Update in DB if not a seed secret
    if (!id.startsWith('vs')) {
      SB.db('vault_secrets').update(id, {
        encrypted_value: newValue,
      }).catch(() => {});
    }

    State.set('vault_secrets', secrets);
    _renderSecrets(secrets);
    _updateStats(secrets);
    _renderProviders(secrets);

    if (typeof Notify !== 'undefined') {
      Notify.send({ title: 'Key Rotated', message: `${secret.name} has been rotated successfully.`, type: 'system' });
    }
  }

  return { title, render };
})();
