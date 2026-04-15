/* ═══════════════════════════════════════════════════════════════════
   NICE — Community Blueprint Marketplace
   Route: #/marketplace

   Browse community-submitted blueprints, install them into your
   fleet, rate them, and publish your own custom blueprints.

   Data model (all live, RLS-enabled):
     - marketplace_listings  : author_id, blueprint_id, title, desc,
                               category ('agent'|'spaceship'), tags,
                               downloads, rating, rating_count, status
     - marketplace_reviews   : listing_id, user_id, rating (1-5), comment
     - blueprints            : the underlying catalog row referenced
                               by listing.blueprint_id (a user-submitted
                               entry has creator_id = author_id and
                               is_public = true)

   The install flow clones the referenced catalog blueprint into the
   user's own fleet via BlueprintStore.activateAgent / activateShip,
   which already handles rarity gating, persistence, and realtime
   sync — marketplace just delegates to it.
═══════════════════════════════════════════════════════════════════ */

const MarketplaceView = (() => {
  const title = 'Marketplace';
  const _esc = Utils.esc;

  const CATEGORIES = ['all', 'agent', 'spaceship'];
  const SORTS = [
    { id: 'top',     label: 'Top rated',   column: 'rating',     desc: true },
    { id: 'popular', label: 'Most installed', column: 'downloads', desc: true },
    { id: 'new',     label: 'Newest',      column: 'created_at', desc: true },
  ];

  /* ── View state (persists across tab switches within a session) ── */
  let _activeTab   = 'browse';    // 'browse' | 'submit'
  let _sort        = 'top';
  let _category    = 'all';
  let _listings    = [];
  let _loading     = false;
  let _el          = null;
  let _myReviews   = {};          // { listing_id: { rating, comment } }

  /* ══════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════ */
  function render(el) {
    _el = el;

    // Read tab from URL (?tab=submit)
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    _activeTab = params.get('tab') === 'submit' ? 'submit' : 'browse';

    el.innerHTML = `
      <div class="mk-wrap">
        <div class="mk-header">
          <h1 class="mk-title">Marketplace</h1>
          <p class="mk-sub">Community-built blueprints. Install, rate, or publish your own.</p>
        </div>

        <div class="mk-tabs">
          <button class="mk-tab${_activeTab === 'browse' ? ' active' : ''}" data-mk-tab="browse">Browse</button>
          <button class="mk-tab${_activeTab === 'submit' ? ' active' : ''}" data-mk-tab="submit">Publish</button>
        </div>

        <div class="mk-body" id="mk-body"></div>
      </div>
    `;

    el.querySelector('.mk-tabs').addEventListener('click', e => {
      const btn = e.target.closest('[data-mk-tab]');
      if (!btn || btn.dataset.mkTab === _activeTab) return;
      _activeTab = btn.dataset.mkTab;
      const suffix = _activeTab === 'submit' ? '?tab=submit' : '';
      history.replaceState(null, '', '#/marketplace' + suffix);
      el.querySelectorAll('.mk-tab').forEach(t => t.classList.toggle('active', t.dataset.mkTab === _activeTab));
      _renderActiveTab();
    });

    _renderActiveTab();
  }

  function _renderActiveTab() {
    const body = document.getElementById('mk-body');
    if (!body) return;
    body.innerHTML = '';
    if (_activeTab === 'submit') {
      _renderSubmitTab(body);
    } else {
      _renderBrowseTab(body);
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     BROWSE TAB
  ══════════════════════════════════════════════════════════════════ */
  async function _renderBrowseTab(el) {
    el.innerHTML = `
      <div class="mk-toolbar">
        <div class="mk-filters">
          <select id="mk-sort" class="mk-select">
            ${SORTS.map(s => `<option value="${s.id}"${_sort === s.id ? ' selected' : ''}>${_esc(s.label)}</option>`).join('')}
          </select>
          <select id="mk-category" class="mk-select">
            ${CATEGORIES.map(c => `<option value="${c}"${_category === c ? ' selected' : ''}>${_esc(c === 'all' ? 'All types' : c.charAt(0).toUpperCase() + c.slice(1) + 's')}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-sm" id="mk-refresh" title="Refresh">↻ Refresh</button>
      </div>
      <div id="mk-listings" class="mk-listings">
        <div class="mk-loading">Loading marketplace…</div>
      </div>
    `;

    document.getElementById('mk-sort')?.addEventListener('change', e => {
      _sort = e.target.value;
      _fetchAndRenderListings();
    });
    document.getElementById('mk-category')?.addEventListener('change', e => {
      _category = e.target.value;
      _fetchAndRenderListings();
    });
    document.getElementById('mk-refresh')?.addEventListener('click', _fetchAndRenderListings);

    await _fetchAndRenderListings();
  }

  async function _fetchAndRenderListings() {
    if (_loading) return;
    _loading = true;

    const container = document.getElementById('mk-listings');
    if (container) container.innerHTML = '<div class="mk-loading">Loading marketplace…</div>';

    try {
      if (typeof SB === 'undefined' || !SB.isReady()) {
        _listings = [];
      } else {
        const sortDef = SORTS.find(s => s.id === _sort) || SORTS[0];
        let query = SB.client
          .from('marketplace_listings')
          .select('id, blueprint_id, author_id, title, description, category, tags, version, downloads, rating, rating_count, created_at, updated_at')
          .eq('status', 'published')
          .order(sortDef.column, { ascending: !sortDef.desc })
          .limit(50);

        if (_category !== 'all') query = query.eq('category', _category);

        const { data, error } = await query;
        if (error) throw error;
        _listings = data || [];

        // Load the current user's own reviews so we can show their rating
        // inline on each card and let them update it without duplicating rows.
        const user = State.get('user');
        if (user && _listings.length) {
          const listingIds = _listings.map(l => l.id);
          const { data: reviews } = await SB.client
            .from('marketplace_reviews')
            .select('listing_id, rating, comment')
            .eq('user_id', user.id)
            .in('listing_id', listingIds);
          _myReviews = {};
          (reviews || []).forEach(r => { _myReviews[r.listing_id] = r; });
        }
      }
    } catch (err) {
      console.warn('[Marketplace] Fetch failed:', err && err.message);
      _listings = [];
    } finally {
      _loading = false;
    }

    _renderListingsDom();
  }

  function _renderListingsDom() {
    const container = document.getElementById('mk-listings');
    if (!container) return;

    if (!_listings.length) {
      container.innerHTML = `
        <div class="mk-empty">
          <h3>No listings yet</h3>
          <p>The marketplace is empty${_category !== 'all' ? ' for this category' : ''}. Be the first to publish one.</p>
          <button class="btn btn-sm btn-primary" id="mk-empty-publish">Publish a blueprint →</button>
        </div>
      `;
      document.getElementById('mk-empty-publish')?.addEventListener('click', () => {
        _activeTab = 'submit';
        history.replaceState(null, '', '#/marketplace?tab=submit');
        _el.querySelectorAll('.mk-tab').forEach(t => t.classList.toggle('active', t.dataset.mkTab === _activeTab));
        _renderActiveTab();
      });
      return;
    }

    container.innerHTML = _listings.map(_renderListingCard).join('');

    // Wire up per-card handlers
    container.querySelectorAll('[data-mk-install]').forEach(btn => {
      btn.addEventListener('click', () => _installListing(btn.dataset.mkInstall));
    });
    container.querySelectorAll('[data-mk-rate]').forEach(btn => {
      btn.addEventListener('click', () => {
        const listingId = btn.dataset.mkRate;
        const rating = parseInt(btn.dataset.mkRating, 10);
        _rateListing(listingId, rating);
      });
    });
  }

  function _renderListingCard(listing) {
    const myRating = (_myReviews[listing.id] || {}).rating || 0;
    const rating = Number(listing.rating || 0);
    const ratingCount = listing.rating_count || 0;
    const tags = Array.isArray(listing.tags) ? listing.tags : [];
    const categoryBadge = (listing.category || 'agent').toUpperCase();

    return `
      <div class="mk-card" data-listing="${_esc(listing.id)}">
        <div class="mk-card-top">
          <span class="mk-category">${_esc(categoryBadge)}</span>
          <span class="mk-rating" title="Average of ${ratingCount} rating${ratingCount === 1 ? '' : 's'}">
            ${_starRow(rating, false)}
            <span class="mk-rating-num">${rating.toFixed(1)}</span>
          </span>
        </div>
        <h3 class="mk-card-title">${_esc(listing.title || 'Untitled')}</h3>
        <p class="mk-card-desc">${_esc((listing.description || '').slice(0, 180))}</p>
        ${tags.length ? `
          <div class="mk-tags">
            ${tags.slice(0, 5).map(t => `<span class="mk-tag">${_esc(t)}</span>`).join('')}
          </div>
        ` : ''}
        <div class="mk-meta">
          <span class="mk-meta-item" title="Installs">↓ ${(listing.downloads || 0).toLocaleString()}</span>
          <span class="mk-meta-item" title="Version">v${_esc(listing.version || '1.0.0')}</span>
        </div>
        <div class="mk-card-actions">
          <button class="btn btn-xs btn-primary" data-mk-install="${_esc(listing.id)}" data-mk-blueprint="${_esc(listing.blueprint_id || '')}" data-mk-category="${_esc(listing.category || 'agent')}">
            Install
          </button>
          <div class="mk-your-rating" title="Your rating">
            ${[1, 2, 3, 4, 5].map(n => `
              <button class="mk-star-btn${n <= myRating ? ' on' : ''}" data-mk-rate="${_esc(listing.id)}" data-mk-rating="${n}" aria-label="Rate ${n} star${n === 1 ? '' : 's'}">★</button>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function _starRow(value, interactive) {
    // Value is 0–5 float. Render filled / half / empty stars.
    const full = Math.floor(value);
    const half = value - full >= 0.5;
    let html = '';
    for (let i = 1; i <= 5; i++) {
      if (i <= full) html += '<span class="mk-star on">★</span>';
      else if (i === full + 1 && half) html += '<span class="mk-star half">★</span>';
      else html += '<span class="mk-star">★</span>';
    }
    return html;
  }

  /* ══════════════════════════════════════════════════════════════════
     INSTALL FLOW
     Delegates to BlueprintStore so rarity gates + persistence + realtime
     sync all work for free. Also bumps the listing's downloads counter
     and re-renders that one card so the user sees immediate feedback.
  ══════════════════════════════════════════════════════════════════ */
  async function _installListing(listingId) {
    const listing = _listings.find(l => l.id === listingId);
    if (!listing || !listing.blueprint_id) {
      _toast('This listing is missing its blueprint — cannot install.', 'error');
      return;
    }

    const user = State.get('user');
    if (!user) {
      _toast('Sign in to install marketplace listings.', 'warning');
      if (typeof AuthModal !== 'undefined' && AuthModal.show) AuthModal.show();
      return;
    }

    // Delegate to BlueprintStore for the actual activation
    try {
      let ok;
      if (listing.category === 'spaceship') {
        ok = typeof BlueprintStore !== 'undefined' && BlueprintStore.activateShip
          ? BlueprintStore.activateShip(listing.blueprint_id)
          : false;
      } else {
        ok = typeof BlueprintStore !== 'undefined' && BlueprintStore.activateAgent
          ? BlueprintStore.activateAgent(listing.blueprint_id)
          : false;
      }

      if (ok === false) {
        // activate* returns false when blocked (rarity gate). Notify already fired.
        return;
      }
    } catch (err) {
      _toast('Install failed: ' + (err && err.message || 'unknown error'), 'error');
      return;
    }

    // Bump the downloads counter (best-effort, non-blocking)
    try {
      await SB.client
        .from('marketplace_listings')
        .update({ downloads: (listing.downloads || 0) + 1 })
        .eq('id', listing.id);
      listing.downloads = (listing.downloads || 0) + 1;
    } catch { /* non-critical */ }

    _toast('Installed "' + (listing.title || 'blueprint') + '"', 'success');
    _renderListingsDom();
  }

  /* ══════════════════════════════════════════════════════════════════
     RATE FLOW
     Upserts a marketplace_reviews row for the current user and then
     recomputes the listing's running average + count on the client so
     the card updates instantly. (The authoritative aggregate is
     recomputed server-side on subsequent fetches.)
  ══════════════════════════════════════════════════════════════════ */
  async function _rateListing(listingId, rating) {
    const listing = _listings.find(l => l.id === listingId);
    if (!listing) return;

    const user = State.get('user');
    if (!user) {
      _toast('Sign in to rate listings.', 'warning');
      if (typeof AuthModal !== 'undefined' && AuthModal.show) AuthModal.show();
      return;
    }
    if (user.id === listing.author_id) {
      _toast("You can't rate your own listing.", 'warning');
      return;
    }

    const previous = _myReviews[listingId];
    const wasNew = !previous;

    try {
      if (wasNew) {
        await SB.client
          .from('marketplace_reviews')
          .insert({ listing_id: listingId, user_id: user.id, rating: rating });
      } else {
        await SB.client
          .from('marketplace_reviews')
          .update({ rating: rating })
          .eq('listing_id', listingId)
          .eq('user_id', user.id);
      }
    } catch (err) {
      _toast('Rating failed: ' + (err && err.message || 'unknown'), 'error');
      return;
    }

    // Recompute running average locally for instant feedback
    const count = listing.rating_count || 0;
    const prevAvg = Number(listing.rating || 0);
    if (wasNew) {
      const newCount = count + 1;
      listing.rating_count = newCount;
      listing.rating = (prevAvg * count + rating) / newCount;
    } else {
      // Rating was updated — subtract the old rating and add the new
      const oldRating = previous.rating || 0;
      if (count > 0) {
        listing.rating = (prevAvg * count - oldRating + rating) / count;
      }
    }
    _myReviews[listingId] = { rating: rating, comment: previous ? previous.comment : null };

    // Persist the new running average back to the listing. This is a
    // soft write — if it races with another user's rating, the next
    // fetch will pick up the authoritative value.
    try {
      await SB.client
        .from('marketplace_listings')
        .update({ rating: listing.rating, rating_count: listing.rating_count })
        .eq('id', listingId);
    } catch { /* non-critical */ }

    _toast('Rated ' + rating + ' star' + (rating === 1 ? '' : 's'), 'success');
    _renderListingsDom();
  }

  /* ══════════════════════════════════════════════════════════════════
     SUBMIT TAB — publish one of the user's custom blueprints
  ══════════════════════════════════════════════════════════════════ */
  async function _renderSubmitTab(el) {
    const user = State.get('user');
    if (!user) {
      el.innerHTML = `
        <div class="mk-empty">
          <h3>Sign in to publish</h3>
          <p>You need an account to publish blueprints to the marketplace.</p>
          <button class="btn btn-sm btn-primary" id="mk-sign-in">Sign in</button>
        </div>
      `;
      document.getElementById('mk-sign-in')?.addEventListener('click', () => {
        if (typeof AuthModal !== 'undefined' && AuthModal.show) AuthModal.show();
      });
      return;
    }

    el.innerHTML = `
      <div class="mk-submit">
        <p class="mk-submit-intro">
          Pick one of your custom blueprints and publish it. Other pilots will
          be able to install it into their fleet and rate it.
        </p>
        <div id="mk-submit-candidates" class="mk-submit-candidates">
          <div class="mk-loading">Loading your blueprints…</div>
        </div>
      </div>
    `;

    let candidates = [];
    try {
      const { data, error } = await SB.client
        .from('blueprints')
        .select('id, type, name, description, tags, category, rarity')
        .eq('creator_id', user.id)
        .eq('is_public', true)
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      candidates = data || [];
    } catch (err) {
      console.warn('[Marketplace] Candidate fetch failed:', err && err.message);
    }

    // Exclude any blueprint that already has a published listing authored
    // by this user so the same thing can't appear twice.
    try {
      const { data: existing } = await SB.client
        .from('marketplace_listings')
        .select('blueprint_id')
        .eq('author_id', user.id)
        .eq('status', 'published');
      const taken = new Set((existing || []).map(l => l.blueprint_id));
      candidates = candidates.filter(c => !taken.has(c.id));
    } catch { /* non-critical */ }

    const container = document.getElementById('mk-submit-candidates');
    if (!container) return;

    if (!candidates.length) {
      container.innerHTML = `
        <div class="mk-empty">
          <h3>No eligible blueprints</h3>
          <p>You haven't created any public custom blueprints yet, or all of them are already published. Head to the Bridge to build one, then come back here to publish it.</p>
          <a href="#/bridge" class="btn btn-sm">Go to Bridge</a>
        </div>
      `;
      return;
    }

    container.innerHTML = candidates.map(bp => `
      <div class="mk-submit-card" data-bp="${_esc(bp.id)}">
        <div class="mk-submit-card-head">
          <span class="mk-category">${_esc((bp.type || 'agent').toUpperCase())}</span>
          <h3 class="mk-submit-card-title">${_esc(bp.name || 'Untitled')}</h3>
        </div>
        <p class="mk-submit-card-desc">${_esc((bp.description || '').slice(0, 140))}</p>
        <form class="mk-submit-form" data-bp-form="${_esc(bp.id)}">
          <label class="mk-submit-label">
            Title
            <input type="text" name="title" value="${_esc(bp.name || '')}" required maxlength="80" />
          </label>
          <label class="mk-submit-label">
            Short description
            <textarea name="description" rows="2" maxlength="400" required>${_esc(bp.description || '')}</textarea>
          </label>
          <label class="mk-submit-label">
            Tags (comma separated)
            <input type="text" name="tags" value="${_esc((bp.tags || []).join(', '))}" maxlength="120" />
          </label>
          <button type="submit" class="btn btn-xs btn-primary">Publish</button>
        </form>
      </div>
    `).join('');

    container.querySelectorAll('form[data-bp-form]').forEach(form => {
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const bpId = form.dataset.bpForm;
        const bp = candidates.find(c => c.id === bpId);
        if (!bp) return;
        const fd = new FormData(form);
        const tags = String(fd.get('tags') || '').split(',').map(t => t.trim()).filter(Boolean);
        const payload = {
          blueprint_id: bp.id,
          author_id:    user.id,
          title:        String(fd.get('title') || '').trim(),
          description:  String(fd.get('description') || '').trim(),
          category:     bp.type === 'spaceship' ? 'spaceship' : 'agent',
          tags:         tags,
          version:      '1.0.0',
          status:       'published',
        };

        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Publishing…'; }

        try {
          const { error } = await SB.client.from('marketplace_listings').insert(payload);
          if (error) throw error;
          _toast('Published "' + payload.title + '" to the marketplace', 'success');
          // Switch over to the Browse tab so they see their listing
          _activeTab = 'browse';
          history.replaceState(null, '', '#/marketplace');
          _el.querySelectorAll('.mk-tab').forEach(t => t.classList.toggle('active', t.dataset.mkTab === _activeTab));
          _renderActiveTab();
        } catch (err) {
          _toast('Publish failed: ' + (err && err.message || 'unknown'), 'error');
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Publish'; }
        }
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     UTIL
  ══════════════════════════════════════════════════════════════════ */
  function _toast(msg, type) {
    if (typeof Notify !== 'undefined' && Notify.send) {
      Notify.send({ title: 'Marketplace', message: msg, type: type || 'info' });
    } else {
      console.log('[Marketplace]', msg);
    }
  }

  return {
    title: title,
    render: render,
    // Exposed for testing — the rating math is non-trivial enough that
    // it deserves a unit test, and pulling it out of the closure lets
    // the test reach it without touching the DOM.
    _recomputeRating: function(prevAvg, prevCount, oldRating, newRating) {
      if (oldRating == null) {
        // First rating from this user
        const count = prevCount + 1;
        return { rating: (prevAvg * prevCount + newRating) / count, rating_count: count };
      }
      // Updated rating — same count, adjusted average
      if (prevCount <= 0) return { rating: prevAvg, rating_count: prevCount };
      return {
        rating: (prevAvg * prevCount - oldRating + newRating) / prevCount,
        rating_count: prevCount,
      };
    },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = MarketplaceView;
