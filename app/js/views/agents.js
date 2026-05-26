/* ═══════════════════════════════════════════════════════════════════
   NICE — Agent Detail View
   Single-agent detail page (#/bridge/agents/:id). The list and CRUD
   surfaces now live under BlueprintsView's Agents sub-tab.
═══════════════════════════════════════════════════════════════════ */

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
      // Fallback: Blueprints catalog (handles bp- prefix IDs)
      if (!agent && typeof Blueprints !== 'undefined') {
        agent = Blueprints.getAgent(id) || Blueprints.getAgent(id.replace(/^bp-/, ''));
      }
      if (!agent) throw new Error('Agent not found');
      const config = agent.config || {};
      const dotClass = agent.status === 'active' ? 'dot-g dot-pulse' : agent.status === 'error' ? 'dot-r' : agent.status === 'paused' ? 'dot-a' : 'dot-g';
      const initials = (agent.name || 'AG').slice(0, 2).toUpperCase();

      // Community publish button is only meaningful for user-built agents
      // the current user owns. Catalog rows fall back to Blueprints
      // and carry no user_id; those never show the button.
      const _user = State.get('user');
      const _canPublish = !!(_user && agent.user_id && agent.user_id === _user.id);

      // Load missions for this agent
      let missions = [];
      try { missions = await SB.db('mission_runs').list({ agentId: agent.id, orderBy: 'created_at', limit: 10 }); } catch(e) {}

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
            ${_canPublish ? '<span id="community-publish-slot"></span>' : ''}
          </div>

          <div class="detail-header">
            <div class="agent-avatar agent-avatar-lg" style="background:${_roleColor(agent.role)}">${_esc(initials)}</div>
            <div class="detail-header-info">
              <h2 class="detail-name">${_esc(agent.name)}</h2>
              <div class="detail-meta-row">
                <span class="status-dot ${dotClass}"></span>
                <span class="detail-status">${_esc(Utils.titleCase(agent.status))}</span>
                <span class="agent-tag">${_esc(agent.role || 'Agent')}</span>
                <span class="agent-tag">${agent.llm_engine === 'nice-auto' ? 'NICE Auto' : _esc(agent.llm_engine || 'gemini-2-5-flash')}</span>
              </div>
            </div>
          </div>

          <div class="detail-grid">
            <div class="detail-section">
              <h3 class="detail-section-title">Configuration</h3>
              <div class="detail-kv">
                <div class="detail-kv-row"><span class="kv-label">Type</span><span class="kv-val">${_esc(agent.type || 'Specialist')}</span></div>
                <div class="detail-kv-row"><span class="kv-label">Model</span><span class="kv-val mono">${agent.llm_engine === 'nice-auto' ? 'NICE Auto' + _resolveAutoHint(agent) : _esc(agent.llm_engine || 'gemini-2-5-flash')}</span></div>
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

          ${(() => {
            if (typeof AgentMemory === 'undefined') return '';
            const mem = AgentMemory.getMemory(agentId);
            if (!mem) return '';
            const hasFacts = mem.facts && mem.facts.length;
            const hasSuccess = mem.successPatterns && mem.successPatterns.length;
            const hasFailure = mem.failurePatterns && mem.failurePatterns.length;
            const hasContext = mem.context && Object.keys(mem.context).length;
            if (!hasFacts && !hasSuccess && !hasFailure && !hasContext) {
              return `
                <div class="detail-section">
                  <h3 class="detail-section-title">Agent Memory</h3>
                  <p class="text-muted" style="font-size:.82rem">No learned facts yet. Memory builds as this agent completes missions.</p>
                </div>`;
            }
            let memHtml = '<div class="detail-section"><h3 class="detail-section-title">Agent Memory</h3>';
            if (hasContext) {
              memHtml += '<div class="mem-group"><div class="mem-group-label">Business Context</div>';
              Object.entries(mem.context).forEach(([k, v]) => {
                memHtml += '<div class="mem-fact"><span class="mem-key">' + _esc(k) + ':</span> ' + _esc(String(v)) + '</div>';
              });
              memHtml += '</div>';
            }
            if (hasFacts) {
              memHtml += '<div class="mem-group"><div class="mem-group-label">Learned Facts <span class="mem-count">' + mem.facts.length + '</span></div>';
              mem.facts.slice(-10).reverse().forEach(f => {
                memHtml += '<div class="mem-fact">' + _esc(f) + '</div>';
              });
              memHtml += '</div>';
            }
            if (hasSuccess) {
              memHtml += '<div class="mem-group"><div class="mem-group-label">What Worked <span class="mem-count">' + mem.successPatterns.length + '</span></div>';
              mem.successPatterns.slice(-5).reverse().forEach(s => {
                memHtml += '<div class="mem-fact mem-success">"' + _esc(s.task) + '" — ' + _esc(s.result || s.approach).substring(0, 80) + '</div>';
              });
              memHtml += '</div>';
            }
            if (hasFailure) {
              memHtml += '<div class="mem-group"><div class="mem-group-label">What to Avoid <span class="mem-count">' + mem.failurePatterns.length + '</span></div>';
              mem.failurePatterns.slice(-5).reverse().forEach(f => {
                memHtml += '<div class="mem-fact mem-failure">"' + _esc(f.task) + '" — ' + _esc(f.reason).substring(0, 80) + '</div>';
              });
              memHtml += '</div>';
            }
            memHtml += '<button class="btn btn-xs" id="btn-clear-memory" style="margin-top:8px">Clear Memory</button>';
            memHtml += '</div>';
            return memHtml;
          })()}

          <div id="agent-workspace"></div>

        </div>
      `;

      // Render agent workspace (VirtualFS)
      (() => {
        if (typeof VirtualFS === 'undefined') return;
        const wsEl = document.getElementById('agent-workspace');
        if (!wsEl) return;
        const projectId = 'agent-' + agentId;
        const project = VirtualFS.getProject(projectId);
        if (!project) {
          wsEl.innerHTML = `
            <div class="detail-section">
              <h3 class="detail-section-title">Workspace</h3>
              <p class="text-muted" style="font-size:.82rem">No files yet. Agents create files here during missions.</p>
              <button class="btn btn-xs" id="btn-create-workspace">Initialize Workspace</button>
            </div>`;
          document.getElementById('btn-create-workspace')?.addEventListener('click', () => {
            VirtualFS.createProject(projectId, agent.name + ' Workspace');
            render(el, params);
          });
        } else {
          const files = VirtualFS.listFiles(projectId);
          const fileListHtml = files.length
            ? files.map(f => {
                const content = VirtualFS.getFile(projectId, f);
                const size = content ? content.length : 0;
                const sizeStr = size > 1024 ? (size / 1024).toFixed(1) + ' KB' : size + ' B';
                return '<div class="ws-file"><span class="ws-file-name">' + _esc(f) + '</span><span class="ws-file-size">' + sizeStr + '</span></div>';
              }).join('')
            : '<p class="text-muted" style="font-size:.82rem">Workspace is empty.</p>';
          wsEl.innerHTML = `
            <div class="detail-section">
              <h3 class="detail-section-title">Workspace <span style="font-size:.68rem;color:var(--text-muted);font-weight:400">${files.length} file${files.length !== 1 ? 's' : ''}</span></h3>
              <div class="ws-file-list">${fileListHtml}</div>
            </div>`;
        }
      })();

      // Clear agent memory
      document.getElementById('btn-clear-memory')?.addEventListener('click', () => {
        if (typeof AgentMemory !== 'undefined') {
          AgentMemory.clear(agentId);
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Memory Cleared', message: agent.name + ' memory reset.', type: 'system' });
          render(el, params);
        }
      });

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

      // Community publish button — async render based on published state.
      // Hosts a single slot that renders as either "Publish" or "Unpublish"
      // depending on whether a community blueprints row exists for this id.
      if (_canPublish && typeof CommunityPublish !== 'undefined') {
        const slot = document.getElementById('community-publish-slot');
        const renderSlot = async () => {
          if (!slot) return;
          const state = await CommunityPublish.getSubmissionState(agent.id);
          slot.innerHTML = CommunityPublish.renderActionButton(state);
        };
        renderSlot();
        // Delegated click handler survives button re-renders
        slot?.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-action]');
          if (!btn) return;
          const entity = {
            type: 'agent',
            id: agent.id,
            name: agent.name,
            description: agent.config?.description || agent.description,
            tags: agent.config?.tags || agent.tags,
          };
          const action = btn.dataset.action;
          if (action === 'community-publish') {
            CommunityPublish.openPublishModal(entity, { onSuccess: renderSlot });
          } else if (action === 'community-unpublish' || action === 'community-withdraw') {
            // Both end up at the same RPC — the row (listing + community
            // blueprint) is removed regardless of whether it was already
            // published or still pending review. Copy varies only in the
            // confirm prompt shown to the user.
            CommunityPublish.confirmUnpublish(entity, { onSuccess: renderSlot });
          } else if (action === 'community-rejected') {
            const reason = btn.dataset.reason || 'No reason given.';
            if (typeof Notify !== 'undefined') {
              Notify.send({
                title: 'Submission rejected',
                message: reason + ' — edit your blueprint and resubmit when ready.',
                type: 'agent_error',
              });
            }
            // After acknowledging, let the user resubmit by clearing the
            // rejected listing and opening the publish modal fresh.
            CommunityPublish.confirmUnpublish(entity, {
              onSuccess: () => CommunityPublish.openPublishModal(entity, { onSuccess: renderSlot }),
            });
          }
        });
      }

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


