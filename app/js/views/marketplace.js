/* ═══════════════════════════════════════════════════════════════════
   NICE — Marketplace View
   Browse, publish, and install community blueprints.
   Route: #/marketplace
═══════════════════════════════════════════════════════════════════ */

const MarketplaceView = (() => {
  const _esc = typeof Utils !== 'undefined' ? Utils.esc : (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

  let _el = null;
  let _listings = [];
  let _filter = 'all';
  let _search = '';

  function render(el) {
    _el = el;
    el.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">Marketplace</h1>
        <p class="view-subtitle">Discover and share agent blueprints with the community</p>
      </div>

      <div class="mp-toolbar">
        <div class="mp-search-wrap">
          <input type="text" id="mp-search" class="form-input" placeholder="Search blueprints..." />
        </div>
        <div class="mp-filters">
          <button class="btn btn-xs mp-filter active" data-cat="all">All</button>
          <button class="btn btn-xs mp-filter" data-cat="agent">Agents</button>
          <button class="btn btn-xs mp-filter" data-cat="spaceship">Spaceships</button>
          <button class="btn btn-xs mp-filter" data-cat="workflow">Workflows</button>
        </div>
        <button class="btn btn-primary btn-xs" id="mp-publish-btn">+ Publish</button>
      </div>

      <div id="mp-grid" class="mp-grid">
        <div class="mp-loading">Loading marketplace...</div>
      </div>
    `;

    _loadListings();
    _bindEvents();
  }

  async function _loadListings() {
    try {
      if (typeof SB !== 'undefined' && SB.db) {
        const { data } = await SB.db('marketplace_listings').list({ order: { column: 'downloads', ascending: false }, limit: 50 });
        _listings = data || [];
      }
    } catch (e) {
      console.warn('[Marketplace] Load failed:', e.message);
    }

    // If no DB listings, show sample data
    if (!_listings.length) {
      _listings = _sampleListings();
    }
    _renderGrid();
  }

  function _renderGrid() {
    const grid = document.getElementById('mp-grid');
    if (!grid) return;

    let filtered = _listings;
    if (_filter !== 'all') filtered = filtered.filter(l => l.category === _filter);
    if (_search) filtered = filtered.filter(l => l.title.toLowerCase().includes(_search) || (l.description || '').toLowerCase().includes(_search));

    if (!filtered.length) {
      grid.innerHTML = '<div class="empty-state"><p>No blueprints found</p></div>';
      return;
    }

    grid.innerHTML = filtered.map(l => `
      <div class="mp-card" data-id="${_esc(l.id)}">
        <div class="mp-card-header">
          <span class="mp-card-cat">${_esc(l.category)}</span>
          <span class="mp-card-ver">v${_esc(l.version || '1.0')}</span>
        </div>
        <h3 class="mp-card-title">${_esc(l.title)}</h3>
        <p class="mp-card-desc">${_esc(l.description || '')}</p>
        <div class="mp-card-tags">${(l.tags || []).map(t => `<span class="mp-tag">${_esc(t)}</span>`).join('')}</div>
        <div class="mp-card-footer">
          <span class="mp-stat">⬇ ${l.downloads || 0}</span>
          <span class="mp-stat">★ ${(l.rating || 0).toFixed(1)}</span>
          <button class="btn btn-xs btn-primary mp-install-btn" data-id="${_esc(l.id)}">Install</button>
        </div>
      </div>
    `).join('');
  }

  function _bindEvents() {
    document.getElementById('mp-search')?.addEventListener('input', (e) => {
      _search = e.target.value.toLowerCase();
      _renderGrid();
    });

    _el?.addEventListener('click', (e) => {
      const filterBtn = e.target.closest('.mp-filter');
      if (filterBtn) {
        _el.querySelectorAll('.mp-filter').forEach(b => b.classList.remove('active'));
        filterBtn.classList.add('active');
        _filter = filterBtn.dataset.cat;
        _renderGrid();
        return;
      }

      const installBtn = e.target.closest('.mp-install-btn');
      if (installBtn) {
        const id = installBtn.dataset.id;
        if (typeof Notify !== 'undefined') Notify.send({ title: 'Blueprint Installed', message: 'Added to your collection.', type: 'success' });
        installBtn.textContent = '✓ Installed';
        installBtn.disabled = true;
      }

      if (e.target.id === 'mp-publish-btn') {
        if (typeof Notify !== 'undefined') Notify.send({ title: 'Coming Soon', message: 'Blueprint publishing will be available in the next update.', type: 'info' });
      }
    });
  }

  function _sampleListings() {
    return [
      { id: 'mp1', title: 'SEO Content Writer', description: 'Generates SEO-optimized blog posts with keyword research and meta descriptions.', category: 'agent', tags: ['content', 'seo', 'writing'], version: '2.1', downloads: 1247, rating: 4.7 },
      { id: 'mp2', title: 'Sales Pipeline Analyzer', description: 'Analyzes CRM data, scores leads, and generates weekly pipeline reports.', category: 'agent', tags: ['sales', 'analytics', 'crm'], version: '1.5', downloads: 892, rating: 4.5 },
      { id: 'mp3', title: 'DevOps Fleet', description: 'Full DevOps spaceship with CI/CD, monitoring, and incident response agents.', category: 'spaceship', tags: ['devops', 'infrastructure', 'monitoring'], version: '3.0', downloads: 2103, rating: 4.9 },
      { id: 'mp4', title: 'Customer Success Suite', description: 'Onboarding, support triage, NPS analysis, and churn prediction agents.', category: 'spaceship', tags: ['support', 'customer', 'analytics'], version: '1.8', downloads: 674, rating: 4.3 },
      { id: 'mp5', title: 'Research → Draft → Publish', description: 'Three-stage workflow: research a topic, draft content, format and publish.', category: 'workflow', tags: ['content', 'automation', 'publishing'], version: '1.2', downloads: 431, rating: 4.6 },
      { id: 'mp6', title: 'Code Review Agent', description: 'Reviews PRs for security, performance, and style issues. Integrates with GitHub.', category: 'agent', tags: ['code', 'review', 'github'], version: '2.3', downloads: 1893, rating: 4.8 },
      { id: 'mp7', title: 'Social Media Manager', description: 'Creates, schedules, and analyzes social media content across platforms.', category: 'agent', tags: ['social', 'marketing', 'content'], version: '1.4', downloads: 567, rating: 4.2 },
      { id: 'mp8', title: 'Legal Contract Reviewer', description: 'Analyzes contracts for risks, non-standard clauses, and compliance issues.', category: 'agent', tags: ['legal', 'compliance', 'contracts'], version: '1.1', downloads: 345, rating: 4.4 },
    ];
  }

  function destroy() { _el = null; _listings = []; }

  return { title: 'Marketplace', render, destroy };
})();
