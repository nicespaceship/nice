/* ═══════════════════════════════════════════════════════════════════
   NICE — Teams View
   Create teams, invite members, manage shared spaceships and token pools.
   Route: #/teams
═══════════════════════════════════════════════════════════════════ */

const TeamsView = (() => {
  const _esc = typeof Utils !== 'undefined' ? Utils.esc : (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

  let _el = null;
  let _teams = [];

  function render(el) {
    _el = el;
    const user = typeof SB !== 'undefined' ? SB.user() : null;
    if (!user) {
      el.innerHTML = '<div class="auth-gate"><h2>Sign In Required</h2><p>Sign in to manage teams.</p><button class="btn btn-primary" onclick="if(typeof AuthModal!==\'undefined\')AuthModal.open()">Sign In</button></div>';
      return;
    }

    el.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">Teams</h1>
        <p class="view-subtitle">Collaborate with shared spaceships and token pools</p>
      </div>

      <div class="teams-toolbar">
        <button class="btn btn-primary btn-xs" id="teams-create-btn">+ Create Team</button>
      </div>

      <div id="teams-list" class="teams-list">
        <div class="mp-loading">Loading teams...</div>
      </div>

      <!-- Create Team Modal -->
      <div class="modal-overlay" id="teams-modal" style="display:none">
        <div class="modal-box" style="max-width:480px">
          <div class="modal-header">
            <h3>Create Team</h3>
            <button class="modal-close" id="teams-modal-close">&times;</button>
          </div>
          <form id="teams-form" class="auth-form">
            <label class="form-label">Team Name</label>
            <input type="text" id="team-name" class="form-input" placeholder="e.g. Engineering" required />
            <label class="form-label" style="margin-top:12px">Invite Members (emails, comma-separated)</label>
            <textarea id="team-invites" class="form-input" rows="3" placeholder="alice@example.com, bob@example.com"></textarea>
            <div class="auth-error" id="team-error"></div>
            <button type="submit" class="auth-submit" style="margin-top:16px">Create Team</button>
          </form>
        </div>
      </div>
    `;

    _loadTeams();
    _bindEvents();
  }

  async function _loadTeams() {
    try {
      if (typeof SB !== 'undefined' && SB.db) {
        const { data } = await SB.db('teams').list({ limit: 20 });
        _teams = data || [];
      }
    } catch (e) {
      console.warn('[Teams] Load failed:', e.message);
    }

    _renderList();
  }

  function _renderList() {
    const list = document.getElementById('teams-list');
    if (!list) return;

    if (!_teams.length) {
      list.innerHTML = `
        <div class="empty-state">
          <h3>No teams yet</h3>
          <p>Create a team to share spaceships and token pools with your crew.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = _teams.map(t => `
      <div class="team-card">
        <div class="team-card-header">
          <h3 class="team-card-name">${_esc(t.name)}</h3>
          <span class="mp-card-cat">${_esc(t.plan || 'free')}</span>
        </div>
        <div class="team-card-meta">
          <span>Members: ${t.member_count || 1}</span>
          <span>Tokens: ${(t.token_balance || 0).toLocaleString()}</span>
        </div>
        <div class="team-card-actions">
          <button class="btn btn-xs" data-team="${_esc(t.id)}">Manage</button>
          <button class="btn btn-xs" data-invite="${_esc(t.id)}">Invite</button>
        </div>
      </div>
    `).join('');
  }

  function _bindEvents() {
    document.getElementById('teams-create-btn')?.addEventListener('click', () => {
      document.getElementById('teams-modal').style.display = 'flex';
    });

    document.getElementById('teams-modal-close')?.addEventListener('click', () => {
      document.getElementById('teams-modal').style.display = 'none';
    });

    document.getElementById('teams-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('team-name')?.value?.trim();
      const invites = document.getElementById('team-invites')?.value?.trim();
      const errEl = document.getElementById('team-error');
      if (!name) { if (errEl) errEl.textContent = 'Team name is required'; return; }

      try {
        const user = SB.user();
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const { data, error } = await SB.db('teams').create({ name, slug, owner_id: user.id });
        if (error) throw error;

        // Create owner membership
        if (data?.id) {
          await SB.db('team_members').create({ team_id: data.id, user_id: user.id, role: 'owner' });

          // Send invites
          if (invites) {
            const emails = invites.split(',').map(e => e.trim()).filter(Boolean);
            for (const email of emails) {
              await SB.db('team_invites').create({ team_id: data.id, email, invited_by: user.id });
            }
          }
        }

        document.getElementById('teams-modal').style.display = 'none';
        document.getElementById('teams-form')?.reset();
        if (typeof Notify !== 'undefined') Notify.send({ title: 'Team Created', message: `${name} is ready.`, type: 'success' });
        _loadTeams();
      } catch (err) {
        if (errEl) errEl.textContent = err.message || 'Failed to create team';
      }
    });
  }

  function destroy() { _el = null; _teams = []; }

  return { title: 'Teams', render, destroy };
})();
