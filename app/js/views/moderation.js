/* ═══════════════════════════════════════════════════════════════════
   NICE — Moderation View
   ───────────────────────────────────────────────────────────────────
   Admin-only queue for community submissions at status='pending_review'.
   Route: #/moderation. Gated server-side via admin_list_pending_reviews
   + admin_approve_listing + admin_reject_listing RPCs; the client also
   checks State.user.is_admin to avoid rendering the surface to
   non-admins, but the RPCs are the actual security boundary.
═══════════════════════════════════════════════════════════════════ */

const ModerationView = (() => {
  const title = 'Moderation';
  const _esc = Utils.esc;

  let _userSub = null;

  function render(el) {
    const draw = (user) => {
      if (!user) {
        el.innerHTML = _notSignedIn();
        return;
      }
      // is_admin is populated by _loadAdminFlag in nice.js AFTER the auth
      // callback fires. Until that resolves the flag is undefined; treat
      // that as "loading" rather than "not authorized" so we don't flash
      // the denied screen for admins during the first paint.
      if (user.is_admin === undefined) {
        el.innerHTML = `<div class="loading-state"><p>Checking admin status\u2026</p></div>`;
        return;
      }
      if (!user.is_admin) {
        el.innerHTML = _notAuthorized();
        return;
      }
      _renderQueueShell(el);
    };

    // Initial paint
    draw(State.get('user'));

    // Re-draw when the user state changes (covers the admin-flag async
    // landing after the first render). Clean up the prior subscription
    // if render() is called twice on the same view mount.
    if (_userSub) State.off('user', _userSub);
    _userSub = (user) => draw(user);
    State.on('user', _userSub);
  }

  function _renderQueueShell(el) {

    el.innerHTML = `
      <div class="moderation-wrap">
        <div class="detail-back">
          <a href="#/" class="btn btn-sm">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-arrow-left"/></svg>
            Back to dashboard
          </a>
          <button class="btn btn-sm" id="mod-refresh">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-refresh"/></svg>
            Refresh
          </button>
        </div>

        <div class="detail-header">
          <div class="detail-header-info">
            <h2 class="detail-name">Moderation Queue</h2>
            <p class="text-muted" style="font-size:.82rem;margin:4px 0 0">
              Community submissions awaiting review. Approve to publish to the community library; reject with a reason so the author can edit and resubmit.
            </p>
          </div>
        </div>

        <div id="mod-queue" class="moderation-queue">
          <div class="loading-state"><p>Loading pending reviews…</p></div>
        </div>
      </div>
    `;

    document.getElementById('mod-refresh')?.addEventListener('click', () => _loadQueue());
    _loadQueue();
  }

  async function _loadQueue() {
    const container = document.getElementById('mod-queue');
    if (!container) return;
    container.innerHTML = '<div class="loading-state"><p>Loading pending reviews…</p></div>';

    try {
      const { data, error } = await SB.client.rpc('admin_list_pending_reviews');
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      if (!rows.length) {
        container.innerHTML = `
          <div class="app-empty" style="margin:40px 0">
            <h3>Queue is clear</h3>
            <p class="text-muted">No submissions are waiting for review right now.</p>
          </div>`;
        return;
      }
      container.innerHTML = rows.map(_renderRow).join('');
      _bindRowActions();
    } catch (err) {
      container.innerHTML = `
        <div class="app-empty" style="margin:40px 0">
          <h3>Couldn't load the queue</h3>
          <p class="text-muted">${_esc(err.message || 'Unknown error')}</p>
          <p class="text-muted" style="font-size:.78rem">If you see <code>42501</code> your admin flag may have been revoked. Check profiles.is_admin.</p>
        </div>`;
    }
  }

  function _renderRow(row) {
    const created = new Date(row.listing_created);
    const ageMin = Math.max(1, Math.round((Date.now() - created.getTime()) / 60000));
    const ageLabel = ageMin < 60
      ? `${ageMin}m ago`
      : ageMin < 1440
      ? `${Math.round(ageMin / 60)}h ago`
      : `${Math.round(ageMin / 1440)}d ago`;

    const tags = Array.isArray(row.listing_tags) ? row.listing_tags : [];
    const cfg = row.blueprint_config || {};
    const systemPromptSnippet = typeof cfg.system_prompt === 'string'
      ? cfg.system_prompt.slice(0, 400) + (cfg.system_prompt.length > 400 ? '…' : '')
      : '';

    return `
      <article class="moderation-row" data-listing-id="${_esc(row.listing_id)}">
        <header class="moderation-row-hdr">
          <div>
            <h3 class="moderation-row-title">${_esc(row.title || row.blueprint_name || 'Untitled')}</h3>
            <div class="moderation-row-meta">
              <span class="moderation-type">${_esc(row.blueprint_type || 'agent')}</span>
              <span class="moderation-category">${_esc(row.blueprint_category || '')}</span>
              <span class="moderation-age" title="${_esc(created.toISOString())}">${ageLabel}</span>
              <span class="moderation-hash" title="Content SHA-256 — remains stable across admin review" style="font-family:var(--font-m)">${_esc((row.content_hash || '').slice(0, 10))}</span>
            </div>
            <div class="moderation-row-author">by <span class="mono">${_esc(row.author_email || row.author_id || 'unknown')}</span></div>
          </div>
          <div class="moderation-row-actions">
            <button class="btn btn-sm btn-primary" data-action="approve">Approve</button>
            <button class="btn btn-sm btn-danger"  data-action="reject">Reject…</button>
          </div>
        </header>

        <section class="moderation-row-body">
          ${row.description ? `<p class="moderation-description">${_esc(row.description)}</p>` : ''}
          ${row.blueprint_flavor ? `<p class="moderation-flavor">${_esc(row.blueprint_flavor)}</p>` : ''}
          ${tags.length ? `<div class="moderation-tags">${tags.map(t => `<span class="tag">${_esc(t)}</span>`).join('')}</div>` : ''}
          ${systemPromptSnippet
            ? `<details class="moderation-prompt"><summary>System prompt (${cfg.system_prompt.length} chars)</summary><pre>${_esc(systemPromptSnippet)}</pre></details>`
            : ''}
          <details class="moderation-config">
            <summary>Full config JSON</summary>
            <pre>${_esc(JSON.stringify(cfg, null, 2))}</pre>
          </details>
        </section>

        <div class="moderation-row-error" data-role="error" hidden></div>
      </article>`;
  }

  function _bindRowActions() {
    document.querySelectorAll('.moderation-row').forEach(row => {
      const id = row.dataset.listingId;
      const errEl = row.querySelector('[data-role="error"]');
      const showError = (msg) => {
        if (!errEl) return;
        errEl.textContent = msg;
        errEl.hidden = false;
      };
      row.querySelector('[data-action="approve"]')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Approving…';
        try {
          const { error } = await SB.client.rpc('admin_approve_listing', { p_listing_id: id });
          if (error) throw error;
          if (typeof Notify !== 'undefined') {
            Notify.send({ title: 'Approved', message: 'Listing is now live in the community library.', type: 'system' });
          }
          row.remove();
          _maybeShowEmpty();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Approve';
          showError(err.message || 'Approve failed.');
        }
      });

      row.querySelector('[data-action="reject"]')?.addEventListener('click', (e) => {
        const btn = e.currentTarget;
        const reason = window.prompt('Rejection reason (the author sees this):\n\nPick the most specific section of the community policy violated. Keep it under 300 characters.');
        if (!reason || !reason.trim()) return;
        btn.disabled = true;
        btn.textContent = 'Rejecting…';
        SB.client.rpc('admin_reject_listing', { p_listing_id: id, p_reason: reason.trim() })
          .then(({ error }) => {
            if (error) throw error;
            if (typeof Notify !== 'undefined') {
              Notify.send({ title: 'Rejected', message: 'Author has been notified with your reason.', type: 'system' });
            }
            row.remove();
            _maybeShowEmpty();
          })
          .catch(err => {
            btn.disabled = false;
            btn.textContent = 'Reject…';
            showError(err.message || 'Reject failed.');
          });
      });
    });
  }

  function _maybeShowEmpty() {
    const container = document.getElementById('mod-queue');
    if (container && !container.querySelector('.moderation-row')) {
      container.innerHTML = `
        <div class="app-empty" style="margin:40px 0">
          <h3>Queue is clear</h3>
          <p class="text-muted">Nice work — every pending submission is resolved.</p>
        </div>`;
    }
  }

  function _notSignedIn() {
    return `
      <div class="app-empty" style="margin:40px 0">
        <h2>Sign in</h2>
        <p class="text-muted">The moderation queue is available only to admins.</p>
        <div class="app-empty-acts">
          <a href="#/" class="btn btn-sm">Back to dashboard</a>
        </div>
      </div>`;
  }

  function _notAuthorized() {
    return `
      <div class="app-empty" style="margin:40px 0">
        <h2>Not authorized</h2>
        <p class="text-muted">Moderation actions require an admin account. If you think this is an error, check your profile <code>is_admin</code> flag.</p>
        <div class="app-empty-acts">
          <a href="#/" class="btn btn-sm">Back to dashboard</a>
        </div>
      </div>`;
  }

  return { title, render };
})();
