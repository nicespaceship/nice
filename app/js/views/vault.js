/* ═══════════════════════════════════════════════════════════════════
   NICE — Vault View
   Connect LLM providers and verify agent blueprint certificates.
═══════════════════════════════════════════════════════════════════ */

const VaultView = (() => {
  const title = 'Vault';
  const _esc = Utils.esc;

  function render(el) {
    // Hydrate from localStorage if not yet in state
    if (!State.get('llm_connections')) {
      try { State.set('llm_connections', JSON.parse(localStorage.getItem('nice-llm-connections') || '{}')); } catch { State.set('llm_connections', {}); }
    }
    const connections = State.get('llm_connections') || {};
    const connectedCount = Object.values(connections).filter(Boolean).length;

    el.innerHTML = `
      <div class="vault-wrap">
        <!-- LLM Connections -->
        <div class="vault-providers">
          <h3 class="vault-section-title">LLM Connections</h3>
          <p class="vault-section-desc">Connect your AI provider accounts. Agents use these to run missions.</p>
          <div class="vault-provider-grid" id="vault-provider-grid"></div>
        </div>

        <!-- Vault Stats -->
        <div class="vault-stats">
          <div class="vault-stat">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-integrations"/></svg>
            <span class="vault-stat-num">${connectedCount}/${typeof LLM_PROVIDERS !== 'undefined' ? LLM_PROVIDERS.length : 0}</span>
            <span class="vault-stat-label">Connected</span>
          </div>
          <div class="vault-stat">
            <span class="status-dot ${connectedCount > 0 ? 'dot-g' : 'dot-r'}"></span>
            <span class="vault-stat-num">${connectedCount > 0 ? 'Ready' : 'No Providers'}</span>
            <span class="vault-stat-label">Fleet Status</span>
          </div>
        </div>

      </div>
    `;

    _renderProviders();
  }

  /* ── LLM Provider Connections ─────────────────────────────── */

  function _renderProviders() {
    const grid = document.getElementById('vault-provider-grid');
    if (!grid || typeof LLM_PROVIDERS === 'undefined') return;

    const connections = State.get('llm_connections') || {};

    grid.innerHTML = LLM_PROVIDERS.map(p => {
      const connected = !!connections[p.id];
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
            ? `<button class="btn btn-sm vault-provider-disconnect" data-provider="${p.id}">Disconnect</button>`
            : `<button class="btn btn-sm btn-primary vault-provider-connect" data-provider="${p.id}">Connect</button>`
          }
        </div>
      `;
    }).join('');

    _bindProviderEvents();
  }

  function _bindProviderEvents() {
    document.querySelectorAll('.vault-provider-connect').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.provider;
        const provider = LLM_PROVIDERS.find(p => p.id === id);
        if (!provider) return;

        // Verify connection by sending a test request to llm-proxy
        const btn2 = document.querySelector(`.vault-provider-connect[data-provider="${id}"]`);
        if (btn2) { btn2.disabled = true; btn2.textContent = 'Verifying...'; }

        const testModels = { anthropic: 'claude-4-sonnet', openai: 'gpt-4o-mini', google: 'gemini-2-flash', mistral: 'mistral-large', xai: 'grok-3-mini', perplexity: 'sonar', deepseek: 'deepseek-chat', meta: 'llama-4-scout' };
        const testModel = testModels[id] || 'claude-4-sonnet';

        try {
          if (typeof SB === 'undefined' || !SB.functions) throw new Error('Not signed in');
          const { data, error } = await SB.functions.invoke('llm-proxy', {
            body: { model: testModel, messages: [{ role: 'user', content: 'Reply with OK' }], temperature: 0, max_tokens: 10 },
          });
          if (error) throw new Error(typeof error === 'string' ? error : error.message || 'Connection failed');
          if (!data || data.error) throw new Error(data?.error || 'No response from provider');

          // Success — mark connected
          const connections = State.get('llm_connections') || {};
          connections[id] = { connected_at: new Date().toISOString(), model: testModel };
          State.set('llm_connections', connections);
          localStorage.setItem('nice-llm-connections', JSON.stringify(connections));

          _renderProviders();
          _updateStats();

          if (typeof Notify !== 'undefined') {
            Notify.send({ title: 'Provider Connected', message: `${provider.name} verified and connected.`, type: 'system' });
          }
          if (typeof AuditLog !== 'undefined') {
            AuditLog.log({ action: 'connect_provider', target: provider.name });
          }
          if (typeof Gamification !== 'undefined') {
            Gamification.addXP('connect_provider');
          }
        } catch (err) {
          console.warn('[Vault] Connection test failed:', err.message);
          if (typeof Notify !== 'undefined') {
            Notify.send({ title: 'Connection Failed', message: `${provider.name}: ${err.message}`, type: 'error' });
          }
          _renderProviders(); // re-render to reset button state
        }
      });
    });

    document.querySelectorAll('.vault-provider-disconnect').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.provider;
        const provider = LLM_PROVIDERS.find(p => p.id === id);
        if (!provider) return;
        if (!confirm(`Disconnect ${provider.name}? Agents using this provider will lose access.`)) return;

        const connections = State.get('llm_connections') || {};
        delete connections[id];
        State.set('llm_connections', connections);
        localStorage.setItem('nice-llm-connections', JSON.stringify(connections));

        _renderProviders();
        _updateStats();

        if (typeof Notify !== 'undefined') {
          Notify.send({ title: 'Provider Disconnected', message: `${provider.name} has been disconnected.`, type: 'system' });
        }
        if (typeof AuditLog !== 'undefined') {
          AuditLog.log({ action: 'disconnect_provider', target: provider.name });
        }
      });
    });
  }

  function _updateStats() {
    const connections = State.get('llm_connections') || {};
    const count = Object.values(connections).filter(Boolean).length;
    const nums = document.querySelectorAll('.vault-stat-num');
    if (nums[0]) nums[0].textContent = `${count}/${LLM_PROVIDERS.length}`;
    if (nums[1]) nums[1].textContent = count > 0 ? 'Ready' : 'No Providers';
    const dots = document.querySelectorAll('.vault-stats .status-dot');
    if (dots[0]) { dots[0].classList.toggle('dot-g', count > 0); dots[0].classList.toggle('dot-r', count === 0); }
  }

  return { title, render };
})();
