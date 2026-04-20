/* ═══════════════════════════════════════════════════════════════════
   NICE — Log View
   Combined missions + operations + audit log in a 3-tab wrapper.
═══════════════════════════════════════════════════════════════════ */

const LogView = (() => {
  const title = 'Log';
  let _activeTab = 'missions';

  function render(el) {
    // Guest mode: show local logs without auth

    // Detect tab from hash params
    const hash = location.hash || '';
    const tabParam = new URLSearchParams(hash.split('?')[1] || '').get('tab');
    if (tabParam && ['missions', 'operations', 'log'].includes(tabParam)) {
      _activeTab = tabParam;
    }

    el.innerHTML = `
      <div class="log-view-wrap">
        <div class="log-view-tabs">
          <button class="log-view-tab ${_activeTab === 'missions' ? 'active' : ''}" data-tab="missions">Missions</button>
          <button class="log-view-tab ${_activeTab === 'operations' ? 'active' : ''}" data-tab="operations">Operations</button>
          <button class="log-view-tab ${_activeTab === 'log' ? 'active' : ''}" data-tab="log">Log</button>
        </div>
        <div class="log-view-content" id="log-view-content"></div>
      </div>
    `;

    // Tab click handlers
    el.querySelectorAll('.log-view-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        _activeTab = btn.dataset.tab;
        el.querySelectorAll('.log-view-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        history.replaceState(null, '', '#/log?tab=' + _activeTab);
        _renderActiveTab();
      });
    });

    _renderActiveTab();
  }

  function _renderActiveTab() {
    const container = document.getElementById('log-view-content');
    if (!container) return;

    switch (_activeTab) {
      case 'missions':
        if (typeof MissionsView !== 'undefined') MissionsView.render(container);
        else container.innerHTML = '<p class="text-muted">Missions not available.</p>';
        break;
      case 'operations':
        _renderOperationsTab(container);
        break;
      case 'log':
        if (typeof AuditLogView !== 'undefined') AuditLogView.render(container);
        else container.innerHTML = '<p class="text-muted">Log not available.</p>';
        break;
    }
  }

  function _renderOperationsTab(container) {
    // Stats strip at top
    const xp = typeof Gamification !== 'undefined' && Gamification.getXP ? Gamification.getXP() : 0;
    const rank = typeof Gamification !== 'undefined' && Gamification.getRank ? (Gamification.getRank()?.name || 'Ensign') : 'Ensign';
    const tokens = typeof Gamification !== 'undefined' && Gamification.getResources ? (Gamification.getResources()?.tokens || 0) : 0;
    const agentCount = typeof Blueprints !== 'undefined' ? Blueprints.getActivatedAgentIds().length : 0;
    const shipCount = typeof Blueprints !== 'undefined' ? Blueprints.getActivatedShipIds().length : 0;

    const statsHTML = `<div class="mc-stats-strip">
      <div class="mc-stat-card"><span class="mc-stat-label">Rank</span><span class="mc-stat-value">${rank}</span></div>
      <div class="mc-stat-card"><span class="mc-stat-label">XP</span><span class="mc-stat-value">${xp.toLocaleString()}</span></div>
      <div class="mc-stat-card"><span class="mc-stat-label">Tokens</span><span class="mc-stat-value">${tokens}</span></div>
      <div class="mc-stat-card"><span class="mc-stat-label">Agents</span><span class="mc-stat-value">${agentCount}</span></div>
      <div class="mc-stat-card"><span class="mc-stat-label">Ships</span><span class="mc-stat-value">${shipCount}</span></div>
    </div>`;

    container.innerHTML = '<div id="log-ops-content"></div>';
    const opsContainer = document.getElementById('log-ops-content');
    if (opsContainer && typeof AnalyticsView !== 'undefined') {
      AnalyticsView.render(opsContainer);
      const header = opsContainer.querySelector('.log-header');
      if (header) header.insertAdjacentHTML('afterend', statsHTML);
    }
  }

  function _authPrompt(el, viewName) {
    el.innerHTML = `<div class="auth-gate"><h2>Sign in to view ${viewName}</h2><p>Create an account or sign in to access this feature.</p><button class="btn btn-primary" onclick="NICE.openModal('modal-auth')">Sign In</button></div>`;
  }

  function destroy() {}

  return { title, render, destroy };
})();
