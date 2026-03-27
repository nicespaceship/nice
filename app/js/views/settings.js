/* ═══════════════════════════════════════════════════════════════════
   NICE — Settings View
   App preferences, notifications, and account settings.
═══════════════════════════════════════════════════════════════════ */

const SettingsView = (() => {
  const title = 'Settings';

  const DEFAULTS = {
    notifications: true,
    sound: false,
    autoRefresh: true,
    compactMode: false,
    defaultModel: 'claude-4',
    defaultTemp: 0.7,
    budgetAlert: 80,
  };

  function render(el) {
    const user = State.get('user');
    if (!user) return _authPrompt(el, 'settings');

    const settings = _getSettings();

    el.innerHTML = `
      <div class="settings-wrap">
        <h1 class="settings-title">Settings</h1>
        <p class="settings-sub">App preferences, notifications, and defaults.</p>

        <!-- Appearance -->
        <div class="settings-section settings-collapsible">
          <h3 class="settings-section-title settings-collapse-toggle" data-collapsed="true">
            <span>Appearance</span>
            <svg class="icon icon-sm settings-chevron" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
          </h3>
          <div class="settings-collapse-body" style="display:none" id="settings-theme-creator"></div>
        </div>

        <!-- Notifications -->
        <div class="settings-section">
          <h3 class="settings-section-title">Notifications</h3>
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-name">Push Notifications</span>
              <span class="settings-row-desc">Receive alerts for agent events, tasks, and budget.</span>
            </div>
            <label class="settings-switch">
              <input type="checkbox" id="set-notif" ${settings.notifications ? 'checked' : ''} />
              <span class="settings-slider"></span>
            </label>
          </div>
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-name">Sound Effects</span>
              <span class="settings-row-desc">Play sounds on task completion and errors.</span>
            </div>
            <label class="settings-switch">
              <input type="checkbox" id="set-sound" ${settings.sound ? 'checked' : ''} />
              <span class="settings-slider"></span>
            </label>
          </div>
        </div>

        <!-- Notification Categories -->
        <div class="settings-section">
          <h3 class="settings-section-title">Notification Categories</h3>
          ${[
            { key:'agent_error', label:'Agent Errors', desc:'Alerts when an agent encounters an error.' },
            { key:'task_complete', label:'Task Complete', desc:'When a task or blueprint setup finishes.' },
            { key:'task_failed', label:'Task Failed', desc:'When a task fails or times out.' },
            { key:'fleet_deployed', label:'Spaceship Launched', desc:'When a spaceship is deployed.' },
            { key:'budget_alert', label:'Budget Alerts', desc:'Spend threshold warnings.' },
            { key:'system', label:'System', desc:'General system notifications.' },
          ].map(cat => {
            const enabled = (settings.notifCategories || {})[cat.key] !== false;
            return `
              <div class="settings-row">
                <div class="settings-row-info">
                  <span class="settings-row-name">${cat.label}</span>
                  <span class="settings-row-desc">${cat.desc}</span>
                </div>
                <label class="settings-switch">
                  <input type="checkbox" class="set-notif-cat" data-cat="${cat.key}" ${enabled ? 'checked' : ''} />
                  <span class="settings-slider"></span>
                </label>
              </div>
            `;
          }).join('')}
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-name">Toast Duration</span>
              <span class="settings-row-desc">How long toast notifications stay visible.</span>
            </div>
            <select id="set-toast-duration" class="filter-select">
              ${[3,5,10].map(s => `<option value="${s}" ${(settings.toastDuration || 5) === s ? 'selected' : ''}>${s} seconds</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- Display -->
        <div class="settings-section">
          <h3 class="settings-section-title">Display</h3>
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-name">Auto-Refresh Data</span>
              <span class="settings-row-desc">Automatically refresh agent and task data via realtime.</span>
            </div>
            <label class="settings-switch">
              <input type="checkbox" id="set-refresh" ${settings.autoRefresh ? 'checked' : ''} />
              <span class="settings-slider"></span>
            </label>
          </div>
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-name">Compact Mode</span>
              <span class="settings-row-desc">Reduce spacing and use smaller cards for denser views.</span>
            </div>
            <label class="settings-switch">
              <input type="checkbox" id="set-compact" ${settings.compactMode ? 'checked' : ''} />
              <span class="settings-slider"></span>
            </label>
          </div>
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-name">High Contrast Mode</span>
              <span class="settings-row-desc">Increase contrast for better readability (WCAG AAA).</span>
            </div>
            <label class="settings-switch">
              <input type="checkbox" id="set-high-contrast" ${document.documentElement.getAttribute('data-contrast') === 'high' ? 'checked' : ''} />
              <span class="settings-slider"></span>
            </label>
          </div>
        </div>

        <!-- Agent Defaults -->
        <div class="settings-section">
          <h3 class="settings-section-title">Agent Defaults</h3>
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-name">Default Model</span>
              <span class="settings-row-desc">LLM engine for new agents.</span>
            </div>
            <select id="set-model" class="filter-select">
              ${(typeof _getAvailableModels === 'function' ? _getAvailableModels() : [
                { id: 'claude-4', label: 'Claude 4 Opus', available: true },
                { id: 'claude-3.5', label: 'Claude 3.5 Sonnet', available: true },
                { id: 'gpt-4o', label: 'GPT-4o', available: true },
                { id: 'gemini-2', label: 'Gemini 2', available: true },
              ]).map(m => `<option value="${m.id}" ${!m.available ? 'disabled' : ''} ${settings.defaultModel === m.id ? 'selected' : ''}>${m.label}${!m.available ? ' (no key)' : ''}</option>`).join('')}
            </select>
          </div>
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-name">Default Temperature</span>
              <span class="settings-row-desc">Creativity level for new agents.</span>
            </div>
            <div class="settings-range-group">
              <input type="range" id="set-temp" min="0" max="1" step="0.1" value="${settings.defaultTemp}" class="builder-range" />
              <span class="builder-range-val" id="set-temp-val">${settings.defaultTemp}</span>
            </div>
          </div>
        </div>

        <!-- Subscription -->
        <div class="settings-section">
          <h3 class="settings-section-title">Subscription</h3>
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-name">Current Plan</span>
              <span class="settings-row-desc" id="set-plan-name">Loading...</span>
            </div>
            <span class="settings-row-val" id="set-plan-badge" style="font-family:var(--font-m);font-size:.75rem;padding:4px 10px;border:1px solid var(--accent);border-radius:var(--radius);color:var(--accent);text-transform:uppercase;">—</span>
          </div>
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-name">Token Usage</span>
              <span class="settings-row-desc" id="set-token-desc">Tokens consumed vs. plan limit</span>
            </div>
            <div style="width:180px;">
              <div class="cost-budget-bar" style="height:8px;margin-bottom:4px;">
                <div class="cost-budget-fill" id="set-token-bar" style="width:0%"></div>
              </div>
              <span style="font-size:.68rem;color:var(--text-muted);" id="set-token-label">0 / 1,000</span>
            </div>
          </div>
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-name">Upgrade Plan</span>
              <span class="settings-row-desc">Get more tokens, agents, and spaceships.</span>
            </div>
            <button class="btn btn-sm btn-primary" id="btn-upgrade-plan">Upgrade</button>
          </div>
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-name">Billing History</span>
              <span class="settings-row-desc">View past token purchases.</span>
            </div>
            <div id="set-billing-history" style="font-size:.75rem;color:var(--text-muted);">Loading...</div>
          </div>
        </div>

        <!-- Billing & Tokens -->
        <div class="settings-section">
          <h3 class="settings-section-title">Billing & Tokens</h3>
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-name">Buy Tokens</span>
              <span class="settings-row-desc">Purchase tokens to power your AI agent missions.</span>
            </div>
            <button class="btn btn-sm btn-buy-tokens" id="btn-buy-tokens-settings">Buy Tokens</button>
          </div>
        </div>

        <!-- Budget -->
        <div class="settings-section">
          <h3 class="settings-section-title">Budget</h3>
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-name">Alert Threshold</span>
              <span class="settings-row-desc">Get notified when spend reaches this % of budget.</span>
            </div>
            <div class="settings-range-group">
              <input type="range" id="set-budget-alert" min="50" max="100" step="5" value="${settings.budgetAlert}" class="builder-range" />
              <span class="builder-range-val" id="set-budget-val">${settings.budgetAlert}%</span>
            </div>
          </div>
        </div>

        <!-- Shortcuts -->
        <div class="settings-section">
          <h3 class="settings-section-title">Shortcuts</h3>
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-name">Keyboard Shortcuts</span>
              <span class="settings-row-desc">View all available keyboard shortcuts.</span>
            </div>
            <button class="btn btn-sm" id="btn-show-shortcuts">View Shortcuts</button>
          </div>
        </div>

        <!-- Data Management -->
        <div class="settings-section">
          <h3 class="settings-section-title">Data Management</h3>
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-name">Export Data</span>
              <span class="settings-row-desc">Download all NICE settings, agents, and missions as JSON.</span>
            </div>
            <button class="btn btn-sm" id="btn-export-data">Export</button>
          </div>
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-name">Import Data</span>
              <span class="settings-row-desc">Restore NICE data from a previously exported JSON file.</span>
            </div>
            <label class="btn btn-sm" for="btn-import-file" style="cursor:pointer">Import</label>
            <input type="file" id="btn-import-file" accept=".json" style="display:none" />
          </div>
        </div>

        <!-- Danger Zone -->
        <div class="settings-section settings-danger">
          <h3 class="settings-section-title">Danger Zone</h3>
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-name">Reset All Settings</span>
              <span class="settings-row-desc">Restore all settings to defaults. This cannot be undone.</span>
            </div>
            <button class="btn btn-sm btn-danger" id="btn-reset-settings">Reset</button>
          </div>
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-row-name">Clear Local Data</span>
              <span class="settings-row-desc">Remove cached data from this device. Account data is preserved.</span>
            </div>
            <button class="btn btn-sm btn-danger" id="btn-clear-cache">Clear</button>
          </div>
        </div>
      </div>
    `;

    _bindEvents(el);
    _loadSubscriptionData();

    // Collapsible Appearance section — render Theme Creator on first expand
    let _tcRendered = false;
    el.querySelector('.settings-collapse-toggle')?.addEventListener('click', function() {
      const body = this.nextElementSibling;
      const collapsed = this.dataset.collapsed === 'true';
      this.dataset.collapsed = collapsed ? 'false' : 'true';
      body.style.display = collapsed ? '' : 'none';
      this.querySelector('.settings-chevron')?.classList.toggle('settings-chevron--open', collapsed);
      if (collapsed && !_tcRendered) {
        _tcRendered = true;
        const tcContainer = document.getElementById('settings-theme-creator');
        if (tcContainer && typeof ThemeCreatorView !== 'undefined') {
          ThemeCreatorView.render(tcContainer);
        }
      }
    });
  }

  function _getSettings() {
    const saved = localStorage.getItem('nice-settings');
    if (saved) {
      try { return { ...DEFAULTS, ...JSON.parse(saved) }; } catch(e) {}
    }
    return { ...DEFAULTS };
  }

  function _saveSettings(settings) {
    localStorage.setItem('nice-settings', JSON.stringify(settings));
  }

  function _bindEvents(el) {
    // Toggles
    ['set-notif', 'set-sound', 'set-refresh', 'set-compact'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', (e) => {
        const s = _getSettings();
        const key = { 'set-notif': 'notifications', 'set-sound': 'sound', 'set-refresh': 'autoRefresh', 'set-compact': 'compactMode' }[id];
        s[key] = e.target.checked;
        _saveSettings(s);
      });
    });

    // High contrast toggle (Step 54)
    document.getElementById('set-high-contrast')?.addEventListener('change', (e) => {
      if (e.target.checked) {
        document.documentElement.setAttribute('data-contrast', 'high');
        localStorage.setItem('nice-high-contrast', '1');
      } else {
        document.documentElement.removeAttribute('data-contrast');
        localStorage.removeItem('nice-high-contrast');
      }
    });

    // Notification category toggles
    document.querySelectorAll('.set-notif-cat').forEach(cb => {
      cb.addEventListener('change', () => {
        const s = _getSettings();
        if (!s.notifCategories) s.notifCategories = {};
        s.notifCategories[cb.dataset.cat] = cb.checked;
        _saveSettings(s);
      });
    });

    // Toast duration
    document.getElementById('set-toast-duration')?.addEventListener('change', (e) => {
      const s = _getSettings();
      s.toastDuration = parseInt(e.target.value, 10);
      _saveSettings(s);
    });

    // Model select
    document.getElementById('set-model')?.addEventListener('change', (e) => {
      const s = _getSettings();
      s.defaultModel = e.target.value;
      _saveSettings(s);
    });

    // Temperature slider
    document.getElementById('set-temp')?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      const label = document.getElementById('set-temp-val');
      if (label) label.textContent = val;
      const s = _getSettings();
      s.defaultTemp = val;
      _saveSettings(s);
    });

    // Budget alert slider
    document.getElementById('set-budget-alert')?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      const label = document.getElementById('set-budget-val');
      if (label) label.textContent = val + '%';
      const s = _getSettings();
      s.budgetAlert = val;
      _saveSettings(s);

      // Also update budget settings
      const budget = JSON.parse(localStorage.getItem('nice-budget') || '{"limit":50,"alert":80}');
      budget.alert = val;
      localStorage.setItem('nice-budget', JSON.stringify(budget));
    });

    // Reset
    document.getElementById('btn-reset-settings')?.addEventListener('click', () => {
      if (!confirm('Reset all settings to defaults?')) return;
      localStorage.removeItem('nice-settings');
      render(el);
    });

    // Buy Tokens — navigate to wallet
    document.getElementById('btn-buy-tokens-settings')?.addEventListener('click', () => {
      window.location.hash = '#/wallet';
    });

    // Show keyboard shortcuts
    document.getElementById('btn-show-shortcuts')?.addEventListener('click', () => {
      if (typeof Keyboard !== 'undefined') Keyboard.showHelp();
    });

    // Export data
    document.getElementById('btn-export-data')?.addEventListener('click', () => {
      if (typeof DataIO !== 'undefined') DataIO.exportData();
    });

    // Import data
    document.getElementById('btn-import-file')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file && typeof DataIO !== 'undefined') DataIO.importData(file);
      e.target.value = ''; // Reset for re-upload
    });

    // Clear cache
    document.getElementById('btn-clear-cache')?.addEventListener('click', () => {
      if (!confirm('Clear all cached data? This will not affect your account.')) return;
      ['nice-settings', 'nice-budget', 'ns-theme', 'ns-font'].forEach(k => localStorage.removeItem(k));
      State.set('agents', []);
      State.set('missions', []);
      State.set('spaceships', []);
      render(el);
    });
  }

  async function _loadSubscriptionData() {
    const user = State.get('user');
    if (!user) return;

    // Plan info — use Subscription module if available
    let plan = 'free';
    if (typeof Subscription !== 'undefined') {
      await Subscription.init();
      plan = Subscription.getCurrentPlan();
    }

    const tierLabels = { free:'Free', starpass:'Star Pass ($19/mo)' };

    const planNameEl = document.getElementById('set-plan-name');
    const planBadgeEl = document.getElementById('set-plan-badge');
    if (planNameEl) planNameEl.textContent = tierLabels[plan] || 'Free';
    if (planBadgeEl) {
      planBadgeEl.textContent = plan === 'starpass' ? 'STAR PASS' : 'FREE';
      const tierColors = { free:'#94a3b8', starpass:'#f59e0b' };
      const c = tierColors[plan] || '#94a3b8';
      planBadgeEl.style.color = c;
      planBadgeEl.style.borderColor = c;
    }

    // LLM connections
    const tokenLabel = document.getElementById('set-token-label');
    const tokenBar = document.getElementById('set-token-bar');
    const enabledMdls = State.get('enabled_models') || {};
    const connections = Object.keys(enabledMdls).filter(k => enabledMdls[k]).length;
    const totalModels = typeof VaultView !== 'undefined' && VaultView.MODEL_CATALOG ? VaultView.MODEL_CATALOG.length : 10;
    if (tokenLabel) tokenLabel.textContent = `${connections} of ${totalModels} AI models enabled`;
    if (tokenBar) {
      const pct = (connections / totalModels) * 100;
      tokenBar.style.width = pct + '%';
      tokenBar.className = 'cost-budget-fill';
    }

    // Billing history
    const historyEl = document.getElementById('set-billing-history');
    if (historyEl) {
      historyEl.textContent = 'No billing history yet.';
    }

    // Upgrade button — navigate to Wallet for plan management
    document.getElementById('btn-upgrade-plan')?.addEventListener('click', () => {
      if (typeof Router !== 'undefined') Router.navigate('#/wallet');
      else location.hash = '#/wallet';
    });
  }

  function destroy() {
    if (typeof ThemeCreatorView !== 'undefined' && ThemeCreatorView.destroy) {
      ThemeCreatorView.destroy();
    }
  }

  return { title, render, destroy };
})();
