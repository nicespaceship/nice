/* ═══════════════════════════════════════════════════════════════════
   NICE — Agents View
   Agent list with search/filter, CRUD, and detail sub-view.
═══════════════════════════════════════════════════════════════════ */

/* ── Agent List ── */
const AgentsView = (() => {
  const title = 'Agents';
  const _esc = Utils.esc;
  const _timeAgo = Utils.timeAgo;
  let _channel = null;
  let _viewMode = localStorage.getItem(Utils.KEYS.agentsView) || 'full';

  const _AGENT_VIEW_MODES = [
    { id: 'full',    icon: '&#9638;',       tip: 'Gallery' },
    { id: 'grid',    icon: '&#9638;&#9638;', tip: 'Grid' },
    { id: 'compact', icon: '&#9776;',       tip: 'Compact' },
    { id: 'mini',    icon: '&#11816;',      tip: 'Mini' },
  ];

  const ROLES  = ['Research','Code','Data','Content','Ops','Custom'];
  const STATUS = ['active','idle','paused','error'];

  function render(el) {
    const user = State.get('user');
    _viewMode = localStorage.getItem(Utils.KEYS.agentsView) || 'full';

    el.innerHTML = `
      <div class="agents-wrap">
        <div class="view-topbar">
          <div class="view-topbar-l">
            <div class="search-box">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-search"/></svg>
              <input type="text" id="agent-search" class="search-input" placeholder="Search agents..." aria-label="Search agents" />
            </div>
            <select id="agent-filter" class="filter-select" aria-label="Filter agents by status">
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="idle">Idle</option>
              <option value="paused">Paused</option>
              <option value="error">Error</option>
            </select>
          </div>
          <div class="agents-view-modes" id="agents-view-modes">
            ${_AGENT_VIEW_MODES.map(m => `<button class="mc-dock-view-btn${_viewMode === m.id ? ' active' : ''}" data-view-mode="${m.id}" title="${m.tip}" aria-label="${m.tip} view">${m.icon}</button>`).join('')}
          </div>
          <button class="btn btn-sm" id="btn-import-soul" title="Import Agent Key">Import Agent Key</button>
          <a href="#/bridge" class="btn btn-sm">Blueprint Catalog</a>
          <a href="#/bridge/agents/new" class="btn btn-primary btn-sm">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-plus"/></svg>
            New Agent
          </a>
        </div>
        <div id="agents-list" class="agents-grid agents-view-${_viewMode}">
          ${_skeletonCards(6)}
        </div>
      </div>

      <!-- Share Agent Modal -->
      <div class="modal-overlay" id="modal-share-agent">
        <div class="modal-box" style="max-width:460px">
          <div class="modal-hdr">
            <h3 class="modal-title">Share Agent</h3>
            <button class="modal-close" id="close-share-agent" aria-label="Close">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-x"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="auth-field">
              <label for="share-email">Recipient Email</label>
              <input type="email" id="share-email" placeholder="colleague@example.com" required />
            </div>
            <div class="auth-error" id="share-error"></div>
            <button class="auth-submit" id="share-submit">Share Agent</button>
            <div style="border-top:1px solid var(--border);margin:16px 0;padding-top:16px">
              <label style="font-size:.8rem;color:var(--text-muted);display:block;margin-bottom:8px">Soul Key &mdash; share the blueprint DNA</label>
              <div style="display:flex;gap:8px">
                <input type="text" id="share-soul-key" readonly style="flex:1;font-family:var(--font-m);font-size:.7rem;padding:8px;background:var(--bg-alt);border:1px solid var(--border);border-radius:6px;color:var(--text);cursor:text" />
                <button class="btn btn-sm" id="share-soul-copy" title="Copy Soul Key" style="white-space:nowrap">Copy</button>
              </div>
            </div>
            <div style="border-top:1px solid var(--border);margin:16px 0;padding-top:16px">
              <label style="font-size:.8rem;color:var(--text-muted);display:block;margin-bottom:8px">Share Link &mdash; anyone with the link can import (expires 30 days)</label>
              <div style="display:flex;gap:8px">
                <input type="text" id="share-link-url" readonly placeholder="Click Generate to create a share link" style="flex:1;font-family:var(--font-m);font-size:.7rem;padding:8px;background:var(--bg-alt);border:1px solid var(--border);border-radius:6px;color:var(--text);cursor:text" />
                <button class="btn btn-sm" id="share-link-gen" style="white-space:nowrap">Generate</button>
                <button class="btn btn-sm" id="share-link-copy" title="Copy Link" style="white-space:nowrap;display:none">Copy</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Import Soul Key Modal -->
      <div class="modal-overlay" id="modal-import-soul">
        <div class="modal-box" style="max-width:460px">
          <div class="modal-hdr">
            <h3 class="modal-title">Import Soul Key</h3>
            <button class="modal-close" id="close-import-soul" aria-label="Close">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-x"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="auth-field">
              <label for="import-soul-input">Paste a Soul Key to reconstruct an agent blueprint</label>
              <input type="text" id="import-soul-input" placeholder="NICE-SK-..." style="font-family:var(--font-m);font-size:.75rem" />
            </div>
            <div id="import-soul-preview" style="display:none;margin:12px 0;padding:12px;background:var(--bg-alt);border:1px solid var(--border);border-radius:8px;font-size:.8rem"></div>
            <div class="auth-error" id="import-soul-error"></div>
            <button class="auth-submit" id="import-soul-submit" disabled>Import Agent</button>
          </div>
        </div>
      </div>
    `;

    _loadAgents(el);
    _bindSearch();
    _bindViewModes();
    _bindShareModal();
    _subscribeRealtime();
    _compareIds = [];
  }

  async function _loadAgents() {
    // Primary source: terminal-activated blueprints
    const bpAgents = BlueprintStore.getActivatedAgents();
    let customAgents = [];
    // Also load custom-built agents from Supabase (Agent Builder only)
    try {
      if (typeof SB !== 'undefined' && SB.db) {
        const res = await Promise.race([
          SB.db('user_agents').list(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))
        ]);
        if (Array.isArray(res)) {
          // Only include agents flagged as custom-built (not bulk-seeded DB records)
          customAgents = res.filter(a => a.source === 'builder' || a.imported_via || a._custom);
        }
      }
    } catch(e) { /* timeout or offline — show blueprint agents only */ }
    // Merge: activated blueprints + custom-built agents (no duplicates)
    const bpIds = new Set(bpAgents.map(a => a.id));
    const merged = [...bpAgents, ...customAgents.filter(a => !bpIds.has(a.id))];
    State.set('agents', merged);
    _renderList(merged);
    if (typeof Gamification !== 'undefined') Gamification.checkAchievements();
  }


  function _renderList(agents) {
    const list = document.getElementById('agents-list');
    if (!list) return;

    if (!agents || agents.length === 0) {
      list.innerHTML = `
        <div class="app-empty">
          <svg class="app-empty-icon" fill="none" stroke="currentColor" stroke-width="1.2"><use href="#icon-agent"/></svg>
          <h2>No Agents Yet</h2>
          <p>Create your first agent to start automating missions.</p>
          <div class="app-empty-acts">
            <a href="#/bridge?tab=agent" class="btn btn-primary btn-sm">Browse Agent Blueprints</a>
            <a href="#/bridge/agents/new" class="btn btn-sm">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-plus"/></svg>
              Create Agent
            </a>
          </div>
        </div>
      `;
      return;
    }

    list.innerHTML = agents.map(a => _agentCard(a)).join('');

    // Bind card actions
    // Card click → detail view
    list.querySelectorAll('.agent-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.c-btn')) return;
        if (e.target.closest('.agent-action-btn')) return;
        Router.navigate('#/bridge/agents/' + card.dataset.id);
      });
    });

    // NICE button → prefill prompt
    list.querySelectorAll('.bp-nice-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = btn.dataset.name;
        if (typeof PromptPanel !== 'undefined') {
          PromptPanel.show();
          PromptPanel.prefill('@' + name + ' ');
          const input = document.querySelector('#nice-ai-input');
          if (input) input.focus();
        }
      });
    });

    // Deactivate button → confirm then remove from activated agents
    list.querySelectorAll('.bp-deploy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const bpId = btn.dataset.id;
        const name = btn.closest('.tcg-card')?.querySelector('.tcg-name-bar span')?.textContent || 'this agent';
        const doDeactivate = () => {
          BlueprintStore.deactivateAgent(bpId);
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Agent Removed', message: 'Blueprint removed from your roster.', type: 'info' });
          _loadAgents();
        };
        if (typeof BlueprintsView !== 'undefined' && BlueprintsView.confirmDeactivate) {
          BlueprintsView.confirmDeactivate(name, doDeactivate);
        } else { doDeactivate(); }
      });
    });
  }

  function _agentCard(a) {
    // Use full blueprint data so card is EXACT match of Blueprint Catalog
    const bpId = a.blueprint_id || (a.id?.startsWith('bp-') ? a.id.slice(3) : null);
    const fullBp = bpId && typeof BlueprintStore !== 'undefined' && BlueprintStore.getAgent ? BlueprintStore.getAgent(bpId) : null;
    const bp = Object.assign({}, fullBp || {}, a);

    if (typeof CardRenderer !== 'undefined') {
      const serial = CardRenderer.serialHash(bp.id || bp.name);
      const _AIB = CardRenderer.AGENT_ICON_BTN || '';

      // Exact same action buttons as Blueprint Catalog
      const actions = `<button class="c-btn bp-nice-btn" data-id="${bp.id}" data-name="${_esc(bp.name)}" data-type="agent" aria-label="Message ${_esc(bp.name)}" title="Message ${_esc(bp.name)}">Message</button>
          <button class="c-btn bp-deploy-btn bp-activated" data-id="${bpId || bp.id}">Remove</button>`;

      return CardRenderer.render('agent', 'full', bp, { actions, clickClass: 'agent-card bp-card-clickable' });
    }

    // Fallback (no CardRenderer)
    const rarity = BlueprintUtils.getRarityInfo(a);
    const config = a.config || {};
    const perfStats = `<div class="agent-perf-stats"><span>${avgSpeed} spd</span><span>${successRate} acc</span></div>`;
    const initials = (a.name || 'RB').slice(0, 2).toUpperCase();
    const rc = typeof CardRenderer !== 'undefined' ? CardRenderer.roleColor(a.role) : _roleColor(a.role);
    return `
      <div class="agent-card agent-card-${rarity.name.toLowerCase()}" data-id="${a.id}" data-status="${a.status}" data-rarity="${rarity.name}" draggable="true">
        <label class="agent-compare-label" title="Select for comparison"><input type="checkbox" class="agent-compare-cb" data-id="${a.id}" /></label>
        <div class="agent-card-hdr">
          <div class="agent-avatar" style="background:${rc}">${_esc(initials)}</div>
          <div class="agent-card-info">
            <div class="agent-card-name">${_esc(a.name)}</div>
            <div class="agent-card-role">${_esc(a.role || 'Agent')}</div>
          </div>
          ${typeof Gamification !== 'undefined' ? Gamification.renderRarityBadge(rarity.name) : ''}
          ${(() => { const prog = typeof Gamification !== 'undefined' ? Gamification.getAgentProgression(a.id) : null; return prog && prog.reqs ? `<span class="agent-prog-badge" title="${prog.progress}% to ${prog.nextMilestone || 'Max'}">${prog.progress}%</span>` : ''; })()}
          <div class="status-dot ${dotClass}"></div>
        </div>
        <div class="agent-card-meta">
          <span class="agent-tag">${_esc(a.llm_engine || 'claude-4')}</span>
          <span class="agent-tag">${_esc(a.type || 'Specialist')}</span>
          <span class="agent-tag status-tag-${a.status}">${_esc(a.status)}</span>
          ${busyBadge}
        </div>
        ${config.tools && config.tools.length ? `<div class="agent-card-tools">${config.tools.slice(0,3).map(t => `<span class="agent-tool-tag">${_esc(t)}</span>`).join('')}${config.tools.length > 3 ? `<span class="agent-tool-tag">+${config.tools.length - 3}</span>` : ''}</div>` : ''}
        ${perfStats}
        <div class="agent-card-actions">
          <button class="agent-action-btn agent-toggle-btn" data-id="${a.id}" data-status="${toggleTarget}" title="${toggleLabel}">${toggleLabel}</button>
          <button class="agent-action-btn agent-share-btn" data-id="${a.id}" data-name="${_esc(a.name)}" title="Share">Share</button>
          ${a.forked_from || a._shared ? `<button class="agent-action-btn agent-fork-btn" data-id="${a.id}" data-name="${_esc(a.name)}" title="Fork">Fork</button>` : ''}
          <button class="agent-action-btn agent-delete-btn" data-id="${a.id}" data-name="${_esc(a.name)}" title="Delete">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-x"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  function _bindSearch() {
    const search = document.getElementById('agent-search');
    const filter = document.getElementById('agent-filter');
    if (search) search.addEventListener('input', _applyFilters);
    if (filter) filter.addEventListener('change', _applyFilters);
  }

  function _applyFilters() {
    const q = (document.getElementById('agent-search')?.value || '').toLowerCase();
    const f = document.getElementById('agent-filter')?.value || '';
    let agents = State.get('agents') || [];
    if (q) agents = agents.filter(a => a.name.toLowerCase().includes(q) || (a.role || '').toLowerCase().includes(q));
    if (f) agents = agents.filter(a => a.status === f);
    _renderList(agents);
  }

  function _subscribeRealtime() {
    _channel = SB.realtime.subscribe('user_agents', (payload) => {
      _loadAgents();
    });
  }

  function destroy() {
    if (_channel) { SB.realtime.unsubscribe(_channel); _channel = null; }
  }

  function _roleColor(role) {
    const colors = { Research:'#6366f1', Code:'#06b6d4', Data:'#f59e0b', Content:'#ec4899', Ops:'#22c55e', Custom:'#8b5cf6' };
    return colors[role] || 'var(--accent)';
  }

  /* ── Tabs: My Agents / Shared with Me ── */
  let _activeTab = 'mine';

  function _bindViewModes() {
    document.getElementById('agents-view-modes')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-view-mode]');
      if (!btn) return;
      _viewMode = btn.dataset.viewMode;
      localStorage.setItem(Utils.KEYS.agentsView, _viewMode);
      // Update active button
      document.querySelectorAll('#agents-view-modes .mc-dock-view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Update grid class and re-render
      const list = document.getElementById('agents-list');
      if (list) {
        list.className = 'agents-grid agents-view-' + _viewMode;
      }
      const agents = State.get('agents') || [];
      _renderList(agents);
    });
  }

  async function _loadSharedAgents() {
    const user = State.get('user');
    if (!user) return;
    const list = document.getElementById('agents-list');
    if (list) list.innerHTML = _skeletonCards(4);

    let agents = [];
    try {
      const shares = await SB.db('user_shared_agents').list({ shared_with_email: user.email });
      if (shares && shares.length) {
        for (const share of shares) {
          try {
            const agent = await SB.db('user_agents').get(share.agent_id);
            if (agent) {
              agent._shared = true;
              agent._share_permissions = share.permissions || 'view';
              agents.push(agent);
            }
          } catch { /* skip unavailable agents */ }
        }
      }
    } catch (err) {
      console.warn('Failed to load shared agents:', err.message);
    }

    _renderList(agents);
  }

  /* ── Share Modal ── */
  let _shareAgentId = null;

  /* ── Soul Key: encode/decode agent blueprint DNA ── */
  function _generateSoulKey(agent) {
    const soul = {
      n: agent.name,
      r: agent.role || '',
      t: agent.type || '',
      m: agent.llm_engine || 'claude-4',
      tp: agent.config?.temperature ?? 0.7,
      mm: agent.config?.memory !== false ? 1 : 0,
      tl: (agent.config?.tools || []),
    };
    const json = JSON.stringify(soul);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    // Format: NICE-SK-<base64>-<checksum4>
    let hash = 0;
    for (let i = 0; i < json.length; i++) { hash = ((hash << 5) - hash + json.charCodeAt(i)) | 0; }
    const check = Math.abs(hash).toString(36).slice(0, 4).toUpperCase().padStart(4, '0');
    return 'NICE-SK-' + b64 + '-' + check;
  }

  function _decodeSoulKey(key) {
    if (!key || !key.startsWith('NICE-SK-')) return null;
    try {
      const parts = key.slice(8); // remove "NICE-SK-"
      const lastDash = parts.lastIndexOf('-');
      const b64 = lastDash > 0 ? parts.slice(0, lastDash) : parts;
      const json = decodeURIComponent(escape(atob(b64)));
      const soul = JSON.parse(json);
      return {
        name: soul.n || 'Unnamed Agent',
        role: soul.r || 'General',
        type: soul.t || 'Specialist',
        llm_engine: soul.m || 'claude-4',
        config: {
          temperature: soul.tp ?? 0.7,
          memory: soul.mm !== 0,
          tools: soul.tl || [],
        },
      };
    } catch (e) { return null; }
  }

  function _bindShareModal() {
    document.getElementById('close-share-agent')?.addEventListener('click', () => {
      document.getElementById('modal-share-agent')?.classList.remove('open');
    });
    document.getElementById('modal-share-agent')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-share-agent') e.target.classList.remove('open');
    });
    document.getElementById('share-submit')?.addEventListener('click', _submitShare);

    // Copy Soul Key
    document.getElementById('share-soul-copy')?.addEventListener('click', () => {
      const keyInput = document.getElementById('share-soul-key');
      if (keyInput?.value) {
        navigator.clipboard.writeText(keyInput.value).then(() => {
          const btn = document.getElementById('share-soul-copy');
          if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 2000); }
        });
      }
    });

    // Generate Share Link
    document.getElementById('share-link-gen')?.addEventListener('click', async () => {
      if (!_shareAgentId) return;
      const genBtn = document.getElementById('share-link-gen');
      const urlInput = document.getElementById('share-link-url');
      const copyBtn = document.getElementById('share-link-copy');
      if (genBtn) genBtn.textContent = 'Generating…';
      try {
        const code = await BlueprintStore.shareBlueprint(_shareAgentId, 'agent');
        const shareUrl = `${location.origin}/app/#/share/${code}`;
        if (urlInput) urlInput.value = shareUrl;
        if (copyBtn) copyBtn.style.display = '';
        if (genBtn) genBtn.style.display = 'none';
      } catch (err) {
        if (urlInput) urlInput.value = '';
        if (genBtn) genBtn.textContent = 'Generate';
        const errEl = document.getElementById('share-error');
        if (errEl) errEl.textContent = err.message || 'Failed to generate link.';
      }
    });
    document.getElementById('share-link-copy')?.addEventListener('click', () => {
      const urlInput = document.getElementById('share-link-url');
      if (urlInput?.value) {
        navigator.clipboard.writeText(urlInput.value).then(() => {
          const btn = document.getElementById('share-link-copy');
          if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 2000); }
        });
      }
    });

    // Import Soul Key modal
    document.getElementById('btn-import-soul')?.addEventListener('click', () => {
      document.getElementById('import-soul-input').value = '';
      document.getElementById('import-soul-preview').style.display = 'none';
      document.getElementById('import-soul-error').textContent = '';
      document.getElementById('import-soul-submit').disabled = true;
      document.getElementById('modal-import-soul')?.classList.add('open');
    });
    document.getElementById('close-import-soul')?.addEventListener('click', () => {
      document.getElementById('modal-import-soul')?.classList.remove('open');
    });
    document.getElementById('modal-import-soul')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-import-soul') e.target.classList.remove('open');
    });

    // Live preview on paste/type
    document.getElementById('import-soul-input')?.addEventListener('input', () => {
      const val = (document.getElementById('import-soul-input')?.value || '').trim();
      const preview = document.getElementById('import-soul-preview');
      const errEl = document.getElementById('import-soul-error');
      const btn = document.getElementById('import-soul-submit');
      const decoded = _decodeSoulKey(val);
      if (!val) { preview.style.display = 'none'; errEl.textContent = ''; btn.disabled = true; return; }
      if (!decoded) { preview.style.display = 'none'; errEl.textContent = 'Invalid Soul Key format.'; btn.disabled = true; return; }
      errEl.textContent = '';
      btn.disabled = false;
      preview.style.display = 'block';
      preview.innerHTML = `
        <div style="font-weight:600;margin-bottom:6px">${_esc(decoded.name)}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;font-size:.75rem;color:var(--text-muted)">
          <span>Role: ${_esc(decoded.role)}</span>
          <span>&bull;</span>
          <span>Type: ${_esc(decoded.type)}</span>
          <span>&bull;</span>
          <span>Model: ${_esc(decoded.llm_engine)}</span>
        </div>
        ${decoded.config.tools.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">${decoded.config.tools.map(t => `<span class="agent-tool-tag">${_esc(t)}</span>`).join('')}</div>` : ''}
      `;
    });

    // Submit import
    document.getElementById('import-soul-submit')?.addEventListener('click', _importSoulKey);
  }

  async function _submitShare() {
    const email = (document.getElementById('share-email')?.value || '').trim();
    const errEl = document.getElementById('share-error');
    if (!email || !email.includes('@')) {
      if (errEl) errEl.textContent = 'Please enter a valid email address.';
      return;
    }
    const user = State.get('user');
    if (!user || !_shareAgentId) return;

    try {
      await SB.db('user_shared_agents').create({
        agent_id: _shareAgentId,
        shared_by: user.id,
        shared_with_email: email,
        permissions: 'view',
      });
      document.getElementById('modal-share-agent')?.classList.remove('open');
      if (typeof Notify !== 'undefined') {
        const agent = (State.get('agents') || []).find(a => a.id === _shareAgentId);
        Notify.send({ title: 'Agent Shared', message: `${agent ? agent.name : 'Agent'} shared with ${email}.`, type: 'system' });
      }
    } catch (err) {
      console.warn('Share failed:', err.message);
      if (errEl) errEl.textContent = err.message || 'Failed to share agent.';
    }
  }

  /* ── Import Soul Key ── */
  async function _importSoulKey() {
    const val = (document.getElementById('import-soul-input')?.value || '').trim();
    const errEl = document.getElementById('import-soul-error');
    const decoded = _decodeSoulKey(val);
    if (!decoded) { if (errEl) errEl.textContent = 'Invalid Soul Key.'; return; }

    const user = State.get('user');
    if (!user) { if (errEl) errEl.textContent = 'Sign in required.'; return; }

    try {
      await SB.db('user_agents').create({
        user_id: user.id,
        name: decoded.name,
        role: decoded.role,
        type: decoded.type,
        status: 'idle',
        llm_engine: decoded.llm_engine,
        config: decoded.config,
        imported_via: 'soul_key',
      });
      document.getElementById('modal-import-soul')?.classList.remove('open');
      if (typeof Gamification !== 'undefined') {
        Gamification.addXP('create_agent');
        Gamification.checkAchievements();
      }
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Soul Key Imported', message: `${decoded.name} has been imported from Soul Key.`, type: 'system' });
      }
      _loadAgents();
    } catch (err) {
      if (errEl) errEl.textContent = err.message || 'Failed to import agent.';
    }
  }

  return { title, render, destroy, ROLES, STATUS };
})();

/* ── Agent Detail ── */
const AgentDetailView = (() => {
  const title = 'Agent Detail';
  const _esc = Utils.esc;
  const _timeAgo = Utils.timeAgo;
  let _channel = null;

  function _resolveAutoHint(agent) {
    const bpId = agent.blueprint_id || agent.id;
    if (typeof ModelIntel === 'undefined') return '';
    const enabled = State.get('enabled_models') || {};
    const connected = Object.keys(enabled).filter(k => enabled[k]);
    const best = ModelIntel.bestModel(bpId, connected);
    if (!best) return '';
    const models = typeof LLM_MODELS !== 'undefined' ? LLM_MODELS : [];
    const label = models.find(m => m.id === best)?.label || best;
    return ' → ' + _esc(label);
  }

  function render(el, params) {
    const user = State.get('user');

    el.innerHTML = `<div class="loading-state"><p>Loading agent...</p></div>`;
    _loadAgent(el, params.id);
  }

  async function _loadAgent(el, id) {
    try {
      let agent;
      try {
        agent = await SB.db('user_agents').get(id);
      } catch(e) {
        agent = (State.get('agents') || []).find(a => a.id === id);
      }
      // Fallback: BlueprintStore catalog (handles bp- prefix IDs)
      if (!agent && typeof BlueprintStore !== 'undefined') {
        agent = BlueprintStore.getAgent(id) || BlueprintStore.getAgent(id.replace(/^bp-/, ''));
      }
      if (!agent) throw new Error('Agent not found');
      const config = agent.config || {};
      const dotClass = agent.status === 'active' ? 'dot-g dot-pulse' : agent.status === 'error' ? 'dot-r' : agent.status === 'paused' ? 'dot-a' : 'dot-g';
      const initials = (agent.name || 'AG').slice(0, 2).toUpperCase();

      // Load missions for this agent
      let missions = [];
      try { missions = await SB.db('tasks').list({ agentId: agent.id, orderBy: 'created_at', limit: 10 }); } catch(e) {}

      el.innerHTML = `
        <div class="detail-wrap">
          <div class="detail-back">
            <a href="#/bridge/agents" class="btn btn-sm">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-arrow-left"/></svg>
              Back to Agents
            </a>
            <a href="#/bridge/agents/new?edit=${id}" class="btn btn-sm">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-build"/></svg>
              Edit
            </a>
            <button class="btn btn-sm" id="btn-save-template" data-id="${id}">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-blueprint"/></svg>
              Save as Template
            </button>
            <button class="btn btn-sm" id="btn-copy-md" data-id="${id}">Copy Blueprint</button>
          </div>

          <div class="detail-header">
            <div class="agent-avatar agent-avatar-lg" style="background:${_roleColor(agent.role)}">${_esc(initials)}</div>
            <div class="detail-header-info">
              <h2 class="detail-name">${_esc(agent.name)}</h2>
              <div class="detail-meta-row">
                <span class="status-dot ${dotClass}"></span>
                <span class="detail-status">${_esc(agent.status)}</span>
                <span class="agent-tag">${_esc(agent.role || 'Agent')}</span>
                <span class="agent-tag">${agent.llm_engine === 'nice-auto' ? 'NICE Auto' : _esc(agent.llm_engine || 'claude-4')}</span>
              </div>
            </div>
          </div>

          <div class="detail-grid">
            <div class="detail-section">
              <h3 class="detail-section-title">Configuration</h3>
              <div class="detail-kv">
                <div class="detail-kv-row"><span class="kv-label">Type</span><span class="kv-val">${_esc(agent.type || 'Specialist')}</span></div>
                <div class="detail-kv-row"><span class="kv-label">Model</span><span class="kv-val mono">${agent.llm_engine === 'nice-auto' ? 'NICE Auto' + _resolveAutoHint(agent) : _esc(agent.llm_engine || 'claude-4')}</span></div>
                <div class="detail-kv-row"><span class="kv-label">Temperature</span><span class="kv-val">${config.temperature ?? 0.7}</span></div>
                <div class="detail-kv-row"><span class="kv-label">Memory</span><span class="kv-val">${config.memory ? 'Enabled' : 'Disabled'}</span></div>
              </div>
            </div>

            <div class="detail-section">
              <h3 class="detail-section-title">Tools</h3>
              <div class="agent-tools-list">
                ${config.tools && config.tools.length
                  ? config.tools.map(t => `<span class="agent-tool-tag">${_esc(t)}</span>`).join('')
                  : '<span class="text-muted">No tools configured</span>'}
              </div>
            </div>

            <div class="detail-section">
              <h3 class="detail-section-title">Capabilities</h3>
              <div class="agent-caps-list">
                ${(agent.caps || agent.metadata?.caps || []).length
                  ? (agent.caps || agent.metadata?.caps || []).map(c => `<div class="agent-cap-item">&#9670; ${_esc(c)}</div>`).join('')
                  : '<span class="text-muted">No capabilities listed</span>'}
              </div>
            </div>
          </div>

          ${(() => {
            if (typeof Gamification === 'undefined') return '';
            const prog = Gamification.getAgentProgression(agent.id);
            if (!prog || !prog.reqs) return '';
            const reqEntries = Object.entries(prog.reqs);
            return `
          <div class="detail-section">
            <h3 class="detail-section-title">Progression ${prog.nextMilestone ? '&mdash; ' + prog.progress + '% to ' + prog.nextMilestone : '&mdash; Max Reached'}</h3>
            <div class="agent-prog-bar"><div class="agent-prog-fill" style="width:${prog.progress}%"></div></div>
            <div class="agent-milestone-grid">
              ${reqEntries.map(function(pair) { var key = pair[0]; var r = pair[1]; return '<div class="agent-milestone-item' + (r.met ? ' met' : '') + '"><span class="agent-milestone-label">' + key.replace(/_/g, ' ') + '</span><span class="agent-milestone-val">' + r.current + ' / ' + r.target + '</span></div>'; }).join('')}
            </div>
          </div>`;
          })()}

          <div class="detail-section">
            <h3 class="detail-section-title">Recent Missions</h3>
            ${missions.length ? `
              <div class="task-mini-list">
                ${missions.map(t => `
                  <div class="task-mini-row">
                    <span class="task-status-badge badge-${t.status}">${t.status}</span>
                    <span class="task-mini-title">${_esc(t.title)}</span>
                    <span class="task-mini-time">${_timeAgo(t.created_at)}</span>
                  </div>
                `).join('')}
              </div>
            ` : '<p class="text-muted" style="font-size:.82rem">No missions assigned yet.</p>'}
          </div>

        </div>
      `;

      // Save as template
      document.getElementById('btn-save-template')?.addEventListener('click', () => {
        const name = prompt('Template name:', agent.name + ' Template');
        if (!name) return;
        const templates = JSON.parse(localStorage.getItem(Utils.KEYS.agentTemplates) || '[]');
        templates.push({
          id: 'tmpl-' + Date.now(),
          name: name.trim(),
          role: agent.role,
          type: agent.type,
          llm_engine: agent.llm_engine,
          config: { ...(agent.config || {}) },
          created_at: new Date().toISOString()
        });
        localStorage.setItem(Utils.KEYS.agentTemplates, JSON.stringify(templates));
        if (typeof Notify !== 'undefined') {
          Notify.send({ title: 'Template Saved', message: '"' + name.trim() + '" saved to templates.', type: 'system' });
        }
      });

      // Copy as Markdown
      document.getElementById('btn-copy-md')?.addEventListener('click', () => {
        const bp = Object.assign({}, agent, { type: 'agent' });
        if (!bp.metadata) bp.metadata = {};
        if (bp.role) bp.config = Object.assign({ role: bp.role }, bp.config || {});
        const md = BlueprintMarkdown.serialize(bp);
        navigator.clipboard.writeText(md).then(() => {
          if (typeof Notify !== 'undefined') Notify.send('Blueprint copied to clipboard', 'success');
        });
      });

      _channel = SB.realtime.subscribe('user_agents', (payload) => {
        if (payload.new?.id === id || payload.old?.id === id) _loadAgent(el, id);
      });
    } catch (err) {
      el.innerHTML = `
        <div class="app-empty">
          <h2>Agent Not Found</h2>
          <p>${_esc(err.message)}</p>
          <div class="app-empty-acts"><a href="#/bridge/agents" class="btn btn-sm">Back to Agents</a></div>
        </div>
      `;
    }
  }

  function _roleColor(role) {
    const colors = { Research:'#6366f1', Code:'#06b6d4', Data:'#f59e0b', Content:'#ec4899', Ops:'#22c55e', Custom:'#8b5cf6' };
    return colors[role] || 'var(--accent)';
  }


  function destroy() {
    if (_channel) { SB.realtime.unsubscribe(_channel); _channel = null; }
  }

  return { title, render, destroy };
})();

function _authPrompt(el, feature) {
  const useModal = typeof AuthModal !== 'undefined';
  el.innerHTML = `
    <div class="app-empty">
      <svg class="app-empty-icon" fill="none" stroke="currentColor" stroke-width="1.2"><use href="#icon-profile"/></svg>
      <h2>Sign In Required</h2>
      <p>Sign in to access ${feature}.</p>
      <div class="app-empty-acts">
        ${useModal
          ? '<button class="btn btn-primary btn-sm" onclick="AuthModal.open(\'Sign in to access ' + feature + '\')">Sign In</button>'
          : '<a href="#/profile" class="btn btn-primary btn-sm">Sign In</a>'}
      </div>
    </div>
  `;
}

/* ── Skeleton Loading Helpers (global) ── */
function _skeletonCards(count) {
  const card = `<div class="skeleton-card">
    <div class="skeleton-row"><div class="skeleton-avatar"></div><div style="flex:1"><div class="skeleton-line sk-title"></div></div></div>
    <div class="skeleton-line sk-sub"></div>
    <div class="skeleton-line sk-bar"></div>
    <div class="skeleton-row"><div class="skeleton-line sk-badge"></div><div class="skeleton-line sk-badge"></div></div>
  </div>`;
  return `<div class="skeleton-grid">${card.repeat(count || 4)}</div>`;
}


