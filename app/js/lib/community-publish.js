/* ═══════════════════════════════════════════════════════════════════
   NICE — Community Publish
   ───────────────────────────────────────────────────────────────────
   UI helpers on top of BlueprintStore.publishToCommunity /
   unpublishFromCommunity. Owns the publish modal, the published-state
   check, and the unpublish confirm flow so AgentDetailView and
   SpaceshipDetailView share one implementation.

   Entity shape: { type: 'agent' | 'spaceship', id, name, description?,
   tags?, flavor? } — enough to prefill the modal from whatever the
   detail view already has in hand.
═══════════════════════════════════════════════════════════════════ */

const CommunityPublish = (() => {
  const _esc = (typeof Utils !== 'undefined' && Utils.esc) ? Utils.esc : (s => String(s ?? ''));
  let _modalEl = null;

  /**
   * Fetch the current submission state for an entity. Returns the
   * marketplace_listings row sidecar (status + review_notes + timestamps)
   * or null if the entity was never submitted. Swallows errors and
   * returns null — worst case the UI shows the Submit button against
   * a queued entity, which the DB UNIQUE blocks with a clean error.
   *
   * Submission state drives the button rendering in renderActionButton:
   *   null             → "Submit for review"
   *   pending_review   → "Pending review" (disabled)
   *   published        → "Unpublish"
   *   rejected         → "Edit and resubmit" + author-facing reason
   *   flagged          → "Under moderator review" (disabled)
   *   unlisted/removed → "Submit for review" (treated as not-published)
   */
  async function getSubmissionState(entityId) {
    if (!entityId || typeof SB === 'undefined' || !SB?.client) return null;
    try {
      const { data } = await SB.client
        .from('marketplace_listings')
        .select('status, review_notes, reviewed_at')
        .eq('blueprint_id', entityId)
        .maybeSingle();
      return data || null;
    } catch { return null; }
  }

  /**
   * Back-compat shim for callers still using the old boolean check.
   * True only when the listing is actually publicly visible.
   */
  async function isPublished(entityId) {
    const state = await getSubmissionState(entityId);
    return !!state && state.status === 'published';
  }

  /**
   * Mount the modal DOM lazily on first use. Re-used across every
   * publish action — one set of elements, reset between opens.
   */
  function _ensureModal() {
    if (_modalEl && document.body.contains(_modalEl)) return _modalEl;
    const el = document.createElement('div');
    el.className = 'modal-overlay';
    el.id = 'modal-community-publish';
    el.innerHTML = `
      <div class="modal-box" style="max-width:520px">
        <div class="modal-hdr">
          <h3 class="modal-title">Publish to community</h3>
          <button class="modal-close" id="cp-close" aria-label="Close">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-x"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <p style="font-size:.82rem;color:var(--text-muted);margin:0 0 16px">
            Share this blueprint with the community library. Others will be able to browse,
            rate, and install it. You can unpublish at any time.
          </p>
          <div class="auth-field">
            <label for="cp-title">Title</label>
            <input type="text" id="cp-title" maxlength="80" required />
          </div>
          <div class="auth-field">
            <label for="cp-desc">Description</label>
            <textarea id="cp-desc" rows="4" maxlength="2000" placeholder="What does this do? When should someone use it?"
              style="width:100%;resize:vertical;background:var(--bg-alt);border:1px solid var(--border);color:var(--text);padding:8px;font-family:var(--font-b);font-size:.82rem;border-radius:6px"></textarea>
          </div>
          <div class="auth-field">
            <label for="cp-tags">Tags (comma-separated)</label>
            <input type="text" id="cp-tags" placeholder="research, data, automation" />
          </div>
          <div class="auth-error" id="cp-error"></div>
          <button class="auth-submit" id="cp-submit">Publish</button>
        </div>
      </div>`;
    document.body.appendChild(el);

    // Click overlay → close. Clicks on the modal-box itself don't bubble here.
    el.addEventListener('click', (e) => {
      if (e.target === el) close();
    });
    el.querySelector('#cp-close').addEventListener('click', close);

    _modalEl = el;
    return el;
  }

  function close() {
    if (_modalEl) _modalEl.classList.remove('open');
  }

  /**
   * Open the publish modal for a given entity. Calls onSuccess with the
   * { blueprint, listing } result once published. Callers pass
   * entity = { type, id, name, description?, tags?, flavor? }.
   */
  function openPublishModal(entity, { onSuccess } = {}) {
    if (!entity || !entity.id) return;
    const el = _ensureModal();
    el.classList.add('open');

    // Prefill from entity data
    const titleInput = el.querySelector('#cp-title');
    const descInput  = el.querySelector('#cp-desc');
    const tagsInput  = el.querySelector('#cp-tags');
    const errEl      = el.querySelector('#cp-error');
    const submitBtn  = el.querySelector('#cp-submit');

    titleInput.value = (entity.name || '').slice(0, 80);
    descInput.value  = entity.description || '';
    tagsInput.value  = Array.isArray(entity.tags) ? entity.tags.join(', ') : (entity.tags || '');
    errEl.textContent = '';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Publish';

    // Fresh handler per open so we can close over the right entity + callback.
    // Replace-child to nuke the previous listener rather than stacking them.
    const freshBtn = submitBtn.cloneNode(true);
    submitBtn.parentNode.replaceChild(freshBtn, submitBtn);

    freshBtn.addEventListener('click', async () => {
      const title = titleInput.value.trim();
      const description = descInput.value.trim();
      const tags = tagsInput.value.split(',').map(t => t.trim()).filter(Boolean);
      if (!title) {
        errEl.textContent = 'Title is required.';
        return;
      }
      errEl.textContent = '';
      freshBtn.disabled = true;
      freshBtn.textContent = 'Publishing…';

      try {
        const result = await BlueprintStore.publishToCommunity(
          { type: entity.type, id: entity.id },
          { title, description, tags }
        );
        close();
        if (typeof Notify !== 'undefined') {
          Notify.send({
            title: 'Published to community',
            message: `"${title}" is now available in the community library.`,
            type: 'system',
          });
        }
        if (typeof onSuccess === 'function') onSuccess(result);
      } catch (err) {
        errEl.textContent = err.message || 'Publish failed.';
        freshBtn.disabled = false;
        freshBtn.textContent = 'Publish';
      }
    });

    // Focus the title for quick edits
    setTimeout(() => titleInput.focus(), 50);
  }

  /**
   * Ask the user to confirm, then unpublish. Uses a plain window.confirm —
   * unpublishing is fully reversible (re-publish re-inserts both rows) and
   * leaves the source user_agents / user_spaceships row untouched, so the
   * heavy "type the blueprint name" confirm the catalog uses for
   * deactivation would be out of proportion.
   */
  function confirmUnpublish(entity, { onSuccess } = {}) {
    if (!entity || !entity.id) return;
    const label = entity.name || 'this blueprint';

    if (!window.confirm(`Remove "${label}" from the community library? You can re-publish anytime.`)) return;

    (async () => {
      try {
        await BlueprintStore.unpublishFromCommunity(entity.id);
        if (typeof Notify !== 'undefined') {
          Notify.send({
            title: 'Unpublished',
            message: `"${label}" has been removed from the community library.`,
            type: 'system',
          });
        }
        if (typeof onSuccess === 'function') onSuccess();
      } catch (err) {
        if (typeof Notify !== 'undefined') {
          Notify.send({
            title: 'Unpublish failed',
            message: err.message || 'Try again in a moment.',
            type: 'agent_error',
          });
        }
      }
    })();
  }

  /**
   * Render the submission-state action button for a detail view's
   * action bar. Accepts either the submission-state row from
   * getSubmissionState (preferred) or a boolean for back-compat.
   * Caller delegates click handling on a stable id.
   */
  function renderActionButton(stateOrBool) {
    // Back-compat: boolean true means "published", false means no state
    const state = typeof stateOrBool === 'boolean'
      ? (stateOrBool ? { status: 'published' } : null)
      : stateOrBool;
    const status = state && state.status;

    // No listing (never submitted, or withdrawn/removed) → offer submit
    if (!state || status === 'unlisted' || status === 'removed') {
      return `
        <button class="btn btn-sm" data-action="community-publish" title="Submit this blueprint for community review">
          <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-share"/></svg>
          Submit for review
        </button>`;
    }

    if (status === 'pending_review') {
      return `
        <button class="btn btn-sm" data-action="community-withdraw" title="Withdraw this submission">
          <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-alert"/></svg>
          Pending review — withdraw
        </button>`;
    }

    if (status === 'published') {
      return `
        <button class="btn btn-sm btn-danger" data-action="community-unpublish" title="Remove from community library">
          <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-x"/></svg>
          Unpublish
        </button>`;
    }

    if (status === 'rejected') {
      const reasonAttr = state.review_notes
        ? ` data-reason="${_esc(state.review_notes).replace(/"/g, '&quot;')}"`
        : '';
      return `
        <button class="btn btn-sm btn-danger" data-action="community-rejected"${reasonAttr} title="See rejection reason and resubmit">
          <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-alert"/></svg>
          Rejected — see reason
        </button>`;
    }

    if (status === 'flagged') {
      return `
        <button class="btn btn-sm btn-danger" disabled title="This listing was flagged by community reports and is under moderator review">
          <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-alert"/></svg>
          Under moderator review
        </button>`;
    }

    // Unknown status — fall back to offering submit
    return `
      <button class="btn btn-sm" data-action="community-publish" title="Submit this blueprint for community review">
        <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-share"/></svg>
        Submit for review
      </button>`;
  }

  return {
    isPublished,
    getSubmissionState,
    openPublishModal,
    confirmUnpublish,
    renderActionButton,
    close,
  };
})();
