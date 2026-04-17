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

        <section class="moderation-reviewer-status" id="mod-reviewer-status">
          <div class="loading-state"><p>Checking reviewer status\u2026</p></div>
        </section>

        <section class="moderation-section">
          <h3 class="moderation-section-title">Pending review</h3>
          <div id="mod-queue" class="moderation-queue">
            <div class="loading-state"><p>Loading pending reviews\u2026</p></div>
          </div>
        </section>

        <section class="moderation-section">
          <div class="moderation-section-header">
            <h3 class="moderation-section-title">Recent decisions</h3>
            <button class="btn btn-sm" id="mod-recent-refresh">Refresh</button>
          </div>
          <div id="mod-recent" class="moderation-recent">
            <div class="loading-state"><p>Loading recent decisions\u2026</p></div>
          </div>
        </section>
      </div>
    `;

    document.getElementById('mod-refresh')?.addEventListener('click', () => {
      _loadReviewerStatus();
      _loadQueue();
      _loadRecentDecisions();
    });
    document.getElementById('mod-recent-refresh')?.addEventListener('click', _loadRecentDecisions);
    _loadReviewerStatus();
    _loadQueue();
    _loadRecentDecisions();
  }

  /* ── Reviewer status + kill switches ───────────────────────────── */

  async function _loadReviewerStatus() {
    const container = document.getElementById('mod-reviewer-status');
    if (!container) return;
    try {
      const { data, error } = await SB.client.rpc('admin_reviewer_status');
      if (error) throw error;
      const row = Array.isArray(data) && data[0] ? data[0] : null;
      if (!row) throw new Error('admin_reviewer_status returned no row');
      container.innerHTML = _renderReviewerStatus(row);
      _bindReviewerControls(row);
    } catch (err) {
      container.innerHTML = `
        <div class="app-empty" style="padding:12px 16px">
          <p class="text-muted">Couldn't load reviewer status: ${_esc(err.message || 'unknown error')}</p>
        </div>`;
    }
  }

  function _renderReviewerStatus(row) {
    const { armed, endpoint_set, key_preview, key_updated_at } = row;
    const pausedBadge = armed
      ? `<span class="moderation-badge moderation-badge-armed">AUTO-REVIEW ARMED</span>`
      : `<span class="moderation-badge moderation-badge-paused">AUTO-REVIEW PAUSED</span>`;
    const keyInfo = key_preview
      ? `<div class="moderation-kv"><span class="kv-label">Service key</span><span class="kv-val mono">${_esc(key_preview)}</span></div>`
      : `<div class="moderation-kv"><span class="kv-label">Service key</span><span class="kv-val text-muted">— not set —</span></div>`;
    const endpointRow = `<div class="moderation-kv"><span class="kv-label">Endpoint URL</span><span class="kv-val">${endpoint_set ? 'configured' : '<span class="text-muted">not set</span>'}</span></div>`;
    const updatedRow = key_updated_at
      ? `<div class="moderation-kv"><span class="kv-label">Key updated</span><span class="kv-val">${new Date(key_updated_at).toLocaleString()}</span></div>`
      : '';
    const actions = armed
      ? `<button class="btn btn-sm btn-danger" data-action="pause-reviewer">Pause reviewer</button>
         <button class="btn btn-sm btn-danger" data-action="rollback-auto" title="Flag every auto-approval in the last N hours">Rollback auto-approvals\u2026</button>`
      : `<button class="btn btn-sm btn-primary" data-action="resume-reviewer">Resume reviewer\u2026</button>
         <button class="btn btn-sm btn-danger" data-action="rollback-auto" title="Flag every auto-approval in the last N hours">Rollback auto-approvals\u2026</button>`;

    return `
      <div class="moderation-status-card">
        <div class="moderation-status-head">
          ${pausedBadge}
          <div class="moderation-status-actions">${actions}</div>
        </div>
        <div class="moderation-status-body">
          ${endpointRow}
          ${keyInfo}
          ${updatedRow}
          ${armed
            ? '<p class="text-muted" style="font-size:.78rem;margin:8px 0 0">New pending_review submissions auto-fire the reviewer agent. Decisions land via community_decision within seconds.</p>'
            : '<p class="text-muted" style="font-size:.78rem;margin:8px 0 0">Auto-review is off. New pending_review submissions queue here for manual approval / rejection.</p>'}
        </div>
        <div class="moderation-status-error" data-role="error" hidden></div>
      </div>`;
  }

  function _bindReviewerControls(_currentRow) {
    const container = document.getElementById('mod-reviewer-status');
    if (!container) return;
    const errEl = container.querySelector('[data-role="error"]');
    const showError = (msg) => { if (errEl) { errEl.textContent = msg; errEl.hidden = false; } };

    container.querySelector('[data-action="pause-reviewer"]')?.addEventListener('click', async (e) => {
      if (!window.confirm('Pause auto-review? New submissions will queue here for manual decisions until you resume.')) return;
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Pausing\u2026';
      try {
        const { error } = await SB.client.rpc('admin_pause_reviewer');
        if (error) throw error;
        if (typeof Notify !== 'undefined') Notify.send({ title: 'Reviewer paused', message: 'Submissions queue here until resumed.', type: 'system' });
        _loadReviewerStatus();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Pause reviewer';
        showError(err.message || 'Pause failed');
      }
    });

    container.querySelector('[data-action="resume-reviewer"]')?.addEventListener('click', async () => {
      const key = window.prompt('Paste the service-role key from Supabase Studio \u2192 Settings \u2192 API:\n\n(It starts with `eyJ\u2026` and has two dots.)');
      if (!key || !key.trim()) return;
      try {
        const { error } = await SB.client.rpc('admin_resume_reviewer', { p_service_key: key.trim() });
        if (error) throw error;
        if (typeof Notify !== 'undefined') Notify.send({ title: 'Reviewer resumed', message: 'New submissions will auto-review within seconds.', type: 'system' });
        _loadReviewerStatus();
      } catch (err) {
        showError(err.message || 'Resume failed');
      }
    });

    container.querySelector('[data-action="rollback-auto"]')?.addEventListener('click', async () => {
      const raw = window.prompt(
        'Rollback auto-approvals from the last how many hours? (1-168)\n\n' +
        'Only listings approved by the reviewer agent are affected.\n' +
        'Your manual approvals and already-flagged listings are untouched.',
        '24'
      );
      if (!raw) return;
      const hours = parseInt(raw, 10);
      if (isNaN(hours) || hours < 1 || hours > 168) {
        showError('Enter a number between 1 and 168');
        return;
      }
      if (!window.confirm(
        `Flag every auto-approval from the last ${hours} hour${hours === 1 ? '' : 's'}?\n\n` +
        `Flagged listings disappear from the community library and surface in your queue for re-review.`
      )) return;
      try {
        const { data, error } = await SB.client.rpc('admin_rollback_auto_approvals', { p_hours: hours });
        if (error) throw error;
        const row = Array.isArray(data) && data[0] ? data[0] : null;
        const count = row?.affected_count ?? 0;
        if (typeof Notify !== 'undefined') {
          Notify.send({
            title: count > 0 ? `Rolled back ${count} listing${count === 1 ? '' : 's'}` : 'No matching auto-approvals',
            message: count > 0
              ? `Flagged and hidden from the community library. Re-review them in the queue.`
              : `Nothing to roll back in the last ${hours}h window.`,
            type: 'system',
          });
        }
        _loadQueue();
        _loadRecentDecisions();
      } catch (err) {
        showError(err.message || 'Rollback failed');
      }
    });
  }


  /* ── Recent decisions ──────────────────────────────────────────── */

  async function _loadRecentDecisions() {
    const container = document.getElementById('mod-recent');
    if (!container) return;
    container.innerHTML = `<div class="loading-state"><p>Loading recent decisions\u2026</p></div>`;
    try {
      const { data, error } = await SB.client.rpc('admin_recent_decisions', { p_limit: 20 });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      if (!rows.length) {
        container.innerHTML = `<p class="text-muted" style="padding:12px 16px;font-size:.82rem">No decisions yet \u2014 every review will show up here once it lands.</p>`;
        return;
      }
      container.innerHTML = rows.map(_renderRecentRow).join('');
      _bindRecentOverrides();
    } catch (err) {
      container.innerHTML = `<p class="text-muted" style="padding:12px 16px;font-size:.82rem">Couldn't load: ${_esc(err.message || 'unknown error')}</p>`;
    }
  }

  function _renderRecentRow(row) {
    const reviewed = new Date(row.reviewed_at);
    const ageMin = Math.max(1, Math.round((Date.now() - reviewed.getTime()) / 60000));
    const ageLabel = ageMin < 60 ? `${ageMin}m ago`
                   : ageMin < 1440 ? `${Math.round(ageMin / 60)}h ago`
                   : `${Math.round(ageMin / 1440)}d ago`;
    const statusBadge = row.status === 'published' ? 'moderation-badge-approved'
                      : row.status === 'rejected'  ? 'moderation-badge-rejected'
                      : row.status === 'flagged'   ? 'moderation-badge-paused'
                      : 'moderation-badge-default';
    const actorBadge = row.was_automated
      ? '<span class="moderation-actor moderation-actor-auto">auto</span>'
      : '<span class="moderation-actor moderation-actor-manual">admin</span>';
    const safetyJson = _esc(JSON.stringify(row.safety_scores || {}, null, 2));
    const notesLine = row.review_notes
      ? `<div class="moderation-recent-notes"><strong>Notes:</strong> ${_esc(row.review_notes)}</div>`
      : '';

    // Per-status override buttons. Each transitions to exactly one
    // target status via the matching admin_* RPC. Status not listed
    // (e.g. 'removed', 'pending_review') gets no override — those are
    // either terminal or belong to the queue section, not recent.
    let overrides = '';
    if (row.status === 'flagged') {
      overrides = `<button class="btn btn-sm" data-action="restore-flagged">Restore to published</button>`;
    } else if (row.status === 'published') {
      overrides = `<button class="btn btn-sm btn-danger" data-action="unpublish-listing">Unpublish\u2026</button>`;
    } else if (row.status === 'rejected') {
      overrides = `<button class="btn btn-sm" data-action="reopen-rejection">Re-open for re-review</button>`;
    }

    return `
      <article class="moderation-recent-row" data-listing-id="${_esc(row.listing_id)}">
        <header class="moderation-recent-head">
          <div>
            <span class="moderation-badge ${statusBadge}">${_esc(row.status)}</span>
            ${actorBadge}
            <span class="moderation-recent-title">${_esc(row.title || '(untitled)')}</span>
          </div>
          <div class="moderation-recent-meta">
            <span class="moderation-recent-policy mono">${_esc(row.policy_version || '\u2014')}</span>
            <span class="moderation-recent-age">${ageLabel}</span>
          </div>
        </header>
        ${notesLine}
        <div class="moderation-recent-author text-muted" style="font-size:.78rem">by ${_esc(row.author_email || row.blueprint_id || 'unknown')}</div>
        ${overrides ? `<div class="moderation-recent-overrides">${overrides}</div>` : ''}
        <details class="moderation-recent-audit">
          <summary>Full audit (safety_scores)</summary>
          <pre>${safetyJson}</pre>
        </details>
        <div class="moderation-recent-error" data-role="error" hidden></div>
      </article>`;
  }

  /**
   * Bind click handlers on every recent-decisions row's override button.
   * Called after _renderRecentRow populates the list. Each transition
   * maps to a specific admin_* RPC with matching confirm / prompt UX.
   */
  function _bindRecentOverrides() {
    document.querySelectorAll('.moderation-recent-row').forEach(row => {
      const listingId = row.dataset.listingId;
      const errEl = row.querySelector('[data-role="error"]');
      const showError = (msg) => { if (errEl) { errEl.textContent = msg; errEl.hidden = false; } };

      row.querySelector('[data-action="restore-flagged"]')?.addEventListener('click', async (e) => {
        if (!window.confirm('Un-flag and republish this listing?\n\nIt will be public in the community library again.')) return;
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Restoring\u2026';
        try {
          const { error } = await SB.client.rpc('admin_restore_flagged', { p_listing_id: listingId, p_notes: null });
          if (error) throw error;
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Restored', message: 'Listing is public again.', type: 'system' });
          _loadRecentDecisions();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Restore to published';
          showError(err.message || 'Restore failed');
        }
      });

      row.querySelector('[data-action="unpublish-listing"]')?.addEventListener('click', async (e) => {
        const reason = window.prompt('Reason for unpublishing (the author sees this):');
        if (!reason || !reason.trim()) return;
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Unpublishing\u2026';
        try {
          const { error } = await SB.client.rpc('admin_unpublish_listing', { p_listing_id: listingId, p_reason: reason.trim() });
          if (error) throw error;
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Unpublished', message: 'Listing is flagged and hidden from the library.', type: 'system' });
          _loadRecentDecisions();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Unpublish\u2026';
          showError(err.message || 'Unpublish failed');
        }
      });

      row.querySelector('[data-action="reopen-rejection"]')?.addEventListener('click', async (e) => {
        if (!window.confirm('Re-open this rejection for another review?\n\nIt moves back into the pending queue. The author gets a second chance without having to resubmit.')) return;
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Re-opening\u2026';
        try {
          const { error } = await SB.client.rpc('admin_reopen_rejection', { p_listing_id: listingId, p_notes: null });
          if (error) throw error;
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Re-opened', message: 'Listing is back in the pending queue.', type: 'system' });
          _loadQueue();
          _loadRecentDecisions();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Re-open for re-review';
          showError(err.message || 'Re-open failed');
        }
      });
    });
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
