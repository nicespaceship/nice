/* ═══════════════════════════════════════════════════════════════════
   NICE — Security View
   AI & Agent security management — permissions, threats, compliance.
   Includes Vault tab for secrets/credentials management.
═══════════════════════════════════════════════════════════════════ */

const SecurityView = (() => {
  const title = 'Security';

  let _activeTab = 'overview';
  const LS_KEY = 'nice-security-checklist';

  /* ── Demo threat events ─────────────────────────────────────── */
  const DEMO_THREATS = [
    { ts: Date.now() - 180000, severity:'low',    msg:'Agent "Scout-7" accessed /api/data within rate limit' },
    { ts: Date.now() - 420000, severity:'medium', msg:'Failed auth attempt from unknown IP 203.0.113.42' },
    { ts: Date.now() - 900000, severity:'low',    msg:'Token rotation completed for integration "Stripe"' },
    { ts: Date.now() - 1800000,severity:'high',   msg:'Agent "Crawler-X" exceeded rate limit (120 req/min)' },
    { ts: Date.now() - 3600000,severity:'medium', msg:'Unusual data export volume detected — Agent "Analyst-3"' },
    { ts: Date.now() - 5400000,severity:'low',    msg:'New device login from macOS Sequoia / Chrome 131' },
    { ts: Date.now() - 7200000,severity:'high',   msg:'Agent "Builder-1" attempted unauthorized write to production DB' },
    { ts: Date.now() - 9000000,severity:'low',    msg:'Compliance checklist updated — score improved to B+' },
  ];

  /* ── Compliance checklist items ─────────────────────────────── */
  const CHECKLIST_ITEMS = [
    { id:'keys-rotated',      label:'API keys rotated within 90 days',      category:'Secrets' },
    { id:'scoped-perms',      label:'All agents have scoped permissions',   category:'Access' },
    { id:'audit-logging',     label:'Audit logging enabled',                category:'Monitoring' },
    { id:'encryption-rest',   label:'Data encrypted at rest',               category:'Data' },
    { id:'no-hardcoded',      label:'No hardcoded secrets in codebase',     category:'Secrets' },
    { id:'mfa-admin',         label:'MFA enabled for admin operations',     category:'Access' },
    { id:'sandbox-enforced',  label:'Agent sandboxing enforced',            category:'Access' },
    { id:'pii-policies',     label:'PII handling policies defined',        category:'Data' },
    { id:'retention-set',     label:'Data retention policy configured',     category:'Data' },
    { id:'backup-verified',   label:'Backups verified within 30 days',     category:'Data' },
  ];

  /* ── Access policy presets ──────────────────────────────────── */
  const POLICIES = [
    { id:'ip-allowlist',   label:'IP Allowlisting',           icon:'lock',    desc:'Restrict agent access to approved IP ranges.',      enabled:true },
    { id:'mfa-enforce',    label:'MFA for Sensitive Ops',     icon:'lock',    desc:'Require multi-factor auth for destructive actions.', enabled:true },
    { id:'token-rotation', label:'Token Rotation (90 days)',  icon:'key',     desc:'Auto-rotate API keys and tokens on schedule.',      enabled:false },
    { id:'sandbox-mode',   label:'Agent Sandboxing',          icon:'lock',    desc:'Run agents in isolated environments by default.',    enabled:true },
    { id:'max-sessions',   label:'Max Concurrent Sessions',   icon:'profile', desc:'Limit agents to 3 concurrent sessions each.',       enabled:false },
    { id:'data-export',    label:'Data Export Approval',      icon:'analytics',desc:'Require approval before agents export bulk data.', enabled:true },
  ];

  /* ── Helpers ────────────────────────────────────────────────── */
  function _getChecklist() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
  }
  function _saveChecklist(data) {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  }
  function _computeScore(checklist) {
    const total = CHECKLIST_ITEMS.length;
    const checked = CHECKLIST_ITEMS.filter(c => checklist[c.id]).length;
    return Math.round((checked / total) * 100);
  }
  function _scoreGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 50) return 'D';
    return 'F';
  }
  function _scoreColor(score) {
    if (score >= 80) return 'var(--accent)';
    if (score >= 60) return '#e8a32e';
    return '#e74c3c';
  }
  function _sevColor(sev) {
    if (sev === 'high')   return '#e74c3c';
    if (sev === 'medium') return '#e8a32e';
    return 'var(--text-muted)';
  }
  const _timeAgo = Utils.timeAgo;

  function _authPrompt(el, area) {
    el.innerHTML = `
      <div class="empty-state">
        <svg class="icon icon-xl" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-lock"/></svg>
        <h2>Sign in to access ${area}</h2>
        <p class="text-muted">Authentication is required to manage security settings.</p>
        <button class="btn btn-primary" onclick="location.hash='#/profile'">Sign In</button>
      </div>`;
  }

  /* ── Render ─────────────────────────────────────────────────── */
  function render(el, params) {

    // Support ?tab= from redirect or direct nav
    const hashParts = (window.location.hash || '').split('?');
    const urlParams = new URLSearchParams(hashParts[1] || '');
    const tabParam = urlParams.get('tab');
    if (tabParam && ['overview','vault','integrations'].includes(tabParam)) _activeTab = tabParam;

    el.innerHTML = `
      <div class="security-wrap">
        <!-- Tabs -->
        <div class="security-tabs">
          <button class="security-tab ${_activeTab === 'overview' ? 'security-tab--active' : ''}" data-sec-tab="overview">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-lock"/></svg>
            Security
          </button>
          <button class="security-tab ${_activeTab === 'vault' ? 'security-tab--active' : ''}" data-sec-tab="vault">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-key"/></svg>
            Vault
          </button>
          <button class="security-tab ${_activeTab === 'integrations' ? 'security-tab--active' : ''}" data-sec-tab="integrations">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-integrations"/></svg>
            Integrations
          </button>
        </div>

        <!-- Tab Content -->
        <div class="security-tab-content" id="sec-tab-content"></div>
      </div>`;

    // Bind tab switching
    el.querySelectorAll('.security-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        _activeTab = btn.dataset.secTab;
        el.querySelectorAll('.security-tab').forEach(t => t.classList.remove('security-tab--active'));
        btn.classList.add('security-tab--active');
        history.replaceState(null, '', '#/security?tab=' + _activeTab);
        _renderTabContent(el);
      });
    });

    _renderTabContent(el);
  }

  function _renderTabContent(el) {
    const container = el.querySelector('#sec-tab-content');
    if (!container) return;
    switch (_activeTab) {
      case 'vault':
        if (typeof VaultView !== 'undefined') VaultView.render(container);
        else container.innerHTML = '<p class="text-muted">Vault module not loaded.</p>';
        break;
      case 'integrations':
        if (typeof IntegrationsView !== 'undefined') IntegrationsView.render(container);
        else container.innerHTML = '<p class="text-muted">Integrations module not loaded.</p>';
        break;
      default:
        _renderOverviewTab(container);
    }
  }

  function _renderOverviewTab(container) {
    const checklist = _getChecklist();
    const score = _computeScore(checklist);
    const grade = _scoreGrade(score);
    const color = _scoreColor(score);
    const agents = State.get('agents') || [];
    const circumference = 2 * Math.PI * 54;
    const dashOffset = circumference - (score / 100) * circumference;

    container.innerHTML = `
        <div class="security-header-stats">
          <div class="security-stats">
            <div class="security-stat">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-lock"/></svg>
              <span class="security-stat-num">${POLICIES.filter(p => p.enabled).length}/${POLICIES.length}</span>
              <span class="security-stat-label">Policies Active</span>
            </div>
            <div class="security-stat">
              <span class="status-dot dot-g"></span>
              <span class="security-stat-num">${agents.length}</span>
              <span class="security-stat-label">Agents Monitored</span>
            </div>
            <div class="security-stat">
              <span class="status-dot ${DEMO_THREATS.filter(t=>t.severity==='high').length ? 'dot-r' : 'dot-g'}"></span>
              <span class="security-stat-num">${DEMO_THREATS.filter(t=>t.severity==='high').length}</span>
              <span class="security-stat-label">High Threats</span>
            </div>
          </div>
        </div>

        <!-- Security Score -->
        <div class="security-score-section">
          <div class="security-score-ring">
            <svg viewBox="0 0 120 120" class="score-svg">
              <circle cx="60" cy="60" r="54" fill="none" stroke="var(--border)" stroke-width="8"/>
              <circle cx="60" cy="60" r="54" fill="none" stroke="${color}" stroke-width="8"
                      stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
                      stroke-linecap="round" transform="rotate(-90 60 60)" class="score-arc"/>
            </svg>
            <div class="score-label">
              <span class="score-grade" style="color:${color}">${grade}</span>
              <span class="score-num">${score}/100</span>
            </div>
          </div>
          <div class="security-score-detail">
            <h3 class="security-section-title">Security Posture</h3>
            <p class="text-muted" style="margin:4px 0 12px">Score based on compliance checklist completion.</p>
            <div class="score-breakdown">
              <span class="score-tag" style="background:${score >= 90 ? 'var(--accent)' : 'var(--border)'}; color:${score >= 90 ? '#fff' : 'var(--text)'}">A — Excellent (90+)</span>
              <span class="score-tag" style="background:${score >= 80 && score < 90 ? '#e8a32e' : 'var(--border)'}; color:${score >= 80 && score < 90 ? '#fff' : 'var(--text)'}">B — Good (80-89)</span>
              <span class="score-tag" style="background:${score >= 70 && score < 80 ? '#e8a32e' : 'var(--border)'}; color:${score >= 70 && score < 80 ? '#fff' : 'var(--text)'}">C — Fair (70-79)</span>
              <span class="score-tag" style="background:${score < 70 ? '#e74c3c' : 'var(--border)'}; color:${score < 70 ? '#fff' : 'var(--text)'}">D/F — Needs Work (&lt;70)</span>
            </div>
          </div>
        </div>

        <!-- Agent Permissions -->
        <div class="security-section">
          <h3 class="security-section-title">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-agent"/></svg>
            Agent Permissions
          </h3>
          <p class="text-muted" style="margin:0 0 12px">Control what each agent can access and do.</p>
          <div class="intg-toolbar">
            <div class="search-box" style="flex:1;max-width:260px">
              <svg class="icon icon-sm search-icon" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-search"/></svg>
              <input type="text" class="search-input" id="sec-agent-search" placeholder="Search agents..." style="width:100%">
            </div>
            <div class="bp-rarity-filters">
              <button class="bp-rarity-btn active" data-status="all" id="sec-status-all">All</button>
              <button class="bp-rarity-btn" data-status="active" id="sec-status-active">Active</button>
              <button class="bp-rarity-btn" data-status="idle" id="sec-status-idle">Idle</button>
            </div>
          </div>
          <div class="security-grid" id="sec-agent-grid">
            ${agents.length ? agents.map(a => `
              <div class="security-card">
                <div class="security-card-header">
                  <strong>${a.name || 'Unnamed Agent'}</strong>
                  <span class="badge badge-sm ${a.status === 'active' ? 'badge-ok' : 'badge-warn'}">${a.status || 'idle'}</span>
                </div>
                <div class="security-card-body">
                  <div class="perm-row"><span class="perm-label">Data Scope</span><span class="perm-val">Read-only</span></div>
                  <div class="perm-row"><span class="perm-label">Tool Access</span><span class="perm-val">Execute</span></div>
                  <div class="perm-row"><span class="perm-label">Rate Limit</span><span class="perm-val">60 req/min</span></div>
                  <div class="perm-row"><span class="perm-label">Auto-Revoke</span><span class="perm-val">30 days</span></div>
                </div>
              </div>
            `).join('') : `
              <div class="security-card security-card-empty">
                <p class="text-muted">No agents found. Create agents in the <a href="#/bridge/agents">Agents</a> view to manage permissions.</p>
              </div>
            `}
          </div>
        </div>

        <!-- Access Policies -->
        <div class="security-section">
          <h3 class="security-section-title">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-lock"/></svg>
            Access Policies
          </h3>
          <p class="text-muted" style="margin:0 0 12px">Enforce security rules across your agent fleet.</p>
          <div class="security-grid" id="sec-policy-grid">
            ${POLICIES.map(p => `
              <div class="security-card">
                <div class="security-card-header">
                  <span style="display:flex;align-items:center;gap:6px">
                    <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-${p.icon}"/></svg>
                    <strong>${p.label}</strong>
                  </span>
                  <label class="toggle-switch" aria-label="Toggle ${p.label}">
                    <input type="checkbox" class="policy-toggle" data-policy="${p.id}" ${p.enabled ? 'checked' : ''}/>
                    <span class="toggle-slider"></span>
                  </label>
                </div>
                <p class="text-muted" style="margin:6px 0 0;font-size:.82rem">${p.desc}</p>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Threat Monitor -->
        <div class="security-section">
          <h3 class="security-section-title">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-monitor"/></svg>
            Threat Monitor
          </h3>
          <p class="text-muted" style="margin:0 0 12px">Recent security events across your fleet.</p>
          <div class="security-events" id="sec-events">
            ${DEMO_THREATS.map(t => `
              <div class="security-event">
                <span class="sev-dot" style="background:${_sevColor(t.severity)}" title="${t.severity}"></span>
                <span class="event-msg">${t.msg}</span>
                <span class="event-time">${_timeAgo(t.ts)}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Compliance Checklist -->
        <div class="security-section">
          <h3 class="security-section-title">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-task"/></svg>
            Compliance Checklist
          </h3>
          <p class="text-muted" style="margin:0 0 12px">Complete these items to improve your security score.</p>
          <div class="security-checklist" id="sec-checklist">
            ${CHECKLIST_ITEMS.map(c => `
              <label class="checklist-item">
                <input type="checkbox" class="checklist-toggle" data-check="${c.id}" ${checklist[c.id] ? 'checked' : ''}/>
                <span class="checklist-label">${c.label}</span>
                <span class="badge badge-sm">${c.category}</span>
              </label>
            `).join('')}
          </div>
        </div>

        <!-- Data Protection -->
        <div class="security-section">
          <h3 class="security-section-title">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-key"/></svg>
            Data Protection
          </h3>
          <p class="text-muted" style="margin:0 0 12px">Encryption, PII handling, and data retention status.</p>
          <div class="security-grid">
            <div class="security-card">
              <div class="security-card-header"><strong>Encryption at Rest</strong><span class="badge badge-sm badge-ok">Active</span></div>
              <p class="text-muted" style="margin:6px 0 0;font-size:.82rem">AES-256 encryption on all stored secrets and agent data.</p>
            </div>
            <div class="security-card">
              <div class="security-card-header"><strong>Encryption in Transit</strong><span class="badge badge-sm badge-ok">Active</span></div>
              <p class="text-muted" style="margin:6px 0 0;font-size:.82rem">TLS 1.3 enforced on all API and agent communications.</p>
            </div>
            <div class="security-card">
              <div class="security-card-header"><strong>PII Handling</strong><span class="badge badge-sm badge-warn">Review</span></div>
              <p class="text-muted" style="margin:6px 0 0;font-size:.82rem">Agents flag PII before processing. Manual review required for sensitive fields.</p>
            </div>
            <div class="security-card">
              <div class="security-card-header"><strong>Data Retention</strong><span class="badge badge-sm badge-ok">90 Days</span></div>
              <p class="text-muted" style="margin:6px 0 0;font-size:.82rem">Agent logs and transient data auto-purged after 90 days.</p>
            </div>
          </div>
        </div>

        <!-- Export Data -->
        <div class="security-section">
          <h3 class="security-section-title">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export Data
          </h3>
          <p class="text-muted" style="margin:0 0 12px">Download all your NICE data as a JSON backup file.</p>
          <button class="btn btn-sm" id="sec-export-data">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export All Data
          </button>
        </div>`;

    _bindOverviewEvents(container);
  }

  /* ── Event binding ──────────────────────────────────────────── */
  function _bindOverviewEvents(el) {
    // Compliance checklist toggles → update score
    el.querySelectorAll('.checklist-toggle').forEach(cb => {
      cb.addEventListener('change', () => {
        const checklist = _getChecklist();
        checklist[cb.dataset.check] = cb.checked;
        _saveChecklist(checklist);
        _updateScore(el, checklist);
      });
    });

    // Policy toggles (optimistic UI)
    el.querySelectorAll('.policy-toggle').forEach(cb => {
      cb.addEventListener('change', () => {
        const p = POLICIES.find(x => x.id === cb.dataset.policy);
        if (p) p.enabled = cb.checked;
        // Update stats
        const statNum = el.querySelector('.security-stats .security-stat:first-child .security-stat-num');
        if (statNum) statNum.textContent = `${POLICIES.filter(x=>x.enabled).length}/${POLICIES.length}`;
      });
    });

    // Export Data button
    el.querySelector('#sec-export-data')?.addEventListener('click', () => {
      if (typeof DataIO !== 'undefined' && DataIO.exportAll) {
        DataIO.exportAll();
      } else {
        if (typeof Notify !== 'undefined') Notify.send({ title: 'Export', message: 'Data export module not available.', type: 'error' });
      }
    });
  }

  function _updateScore(el, checklist) {
    const score = _computeScore(checklist);
    const grade = _scoreGrade(score);
    const color = _scoreColor(score);
    const circumference = 2 * Math.PI * 54;
    const dashOffset = circumference - (score / 100) * circumference;

    const arc = el.querySelector('.score-arc');
    const gradeEl = el.querySelector('.score-grade');
    const numEl = el.querySelector('.score-num');
    if (arc) {
      arc.setAttribute('stroke', color);
      arc.setAttribute('stroke-dashoffset', dashOffset);
    }
    if (gradeEl) { gradeEl.textContent = grade; gradeEl.style.color = color; }
    if (numEl) numEl.textContent = `${score}/100`;

    // Update breakdown tags
    const tags = el.querySelectorAll('.score-tag');
    if (tags.length >= 4) {
      tags[0].style.background = score >= 90 ? 'var(--accent)' : 'var(--border)';
      tags[0].style.color = score >= 90 ? '#fff' : 'var(--text)';
      tags[1].style.background = score >= 80 && score < 90 ? '#e8a32e' : 'var(--border)';
      tags[1].style.color = score >= 80 && score < 90 ? '#fff' : 'var(--text)';
      tags[2].style.background = score >= 70 && score < 80 ? '#e8a32e' : 'var(--border)';
      tags[2].style.color = score >= 70 && score < 80 ? '#fff' : 'var(--text)';
      tags[3].style.background = score < 70 ? '#e74c3c' : 'var(--border)';
      tags[3].style.color = score < 70 ? '#fff' : 'var(--text)';
    }
  }

  return { title, render };
})();
