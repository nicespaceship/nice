/* ═══════════════════════════════════════════════════════════════════
   NICE — Favorites / Bookmarks
   Pin frequently-used views for quick sidebar access.
   Stored in localStorage with drag-to-reorder.
═══════════════════════════════════════════════════════════════════ */

const Favorites = (() => {
  const STORAGE_KEY = Utils.KEYS.favorites;
  const MAX_FAVORITES = 8;

  // Icon map for known routes
  const ICONS = {
    '/':             '#icon-home',
    '/missions':     '#icon-task',
    '/blueprints':   '#icon-blueprint',
    '/analytics':    '#icon-analytics',
    '/cost':         '#icon-dollar',
    '/comms':        '#icon-comms',
    '/vault':        '#icon-lock',
    '/profile':      '#icon-profile',
    '/settings':     '#icon-settings',
    '/log':          '#icon-log',
    '/theme-editor': '#icon-palette',
    '/theme-creator':'#icon-palette',
  };

  function _load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch { return []; }
  }

  function _save(favs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
  }

  function getAll() {
    return _load();
  }

  function add(path, label) {
    const favs = _load();
    if (favs.length >= MAX_FAVORITES) return false;
    if (favs.some(f => f.path === path)) return false;
    favs.push({ path, label, added: Date.now() });
    _save(favs);
    render();
    if (typeof Gamification !== 'undefined') Gamification.addXP('add_favorite', 3);
    return true;
  }

  function remove(path) {
    const favs = _load().filter(f => f.path !== path);
    _save(favs);
    render();
  }

  function isFavorite(path) {
    return _load().some(f => f.path === path);
  }

  function toggleCurrent() {
    const path = typeof Router !== 'undefined' ? Router.path() : '/';
    const title = document.getElementById('app-page-title')?.textContent || 'Page';
    if (isFavorite(path)) {
      remove(path);
    } else {
      add(path, title);
    }
  }

  function render() {
    const container = document.getElementById('sidebar-favorites');
    if (!container) return;

    const favs = _load();
    if (favs.length === 0) {
      container.innerHTML = '';
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    const currentPath = typeof Router !== 'undefined' ? Router.path() : '/';

    container.innerHTML = `
      <div class="side-divider"></div>
      <div class="fav-section-label">Favorites</div>
      ${favs.map(f => {
        const icon = ICONS[f.path] || '#icon-star';
        const active = f.path === currentPath ? ' active' : '';
        return `
          <a href="#${f.path}" class="side-link fav-link${active}" data-fav-path="${f.path}">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="${icon}"/></svg>
            <span>${_esc(f.label)}</span>
            <button class="fav-remove" data-remove="${f.path}" title="Remove favorite" aria-label="Remove ${_esc(f.label)} from favorites">&times;</button>
          </a>`;
      }).join('')}
    `;

    // Bind remove buttons
    container.querySelectorAll('.fav-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        remove(btn.dataset.remove);
      });
    });
  }

  const _esc = Utils.esc;

  function init() {
    render();

    // Update active state on navigation
    window.addEventListener('hashchange', () => {
      setTimeout(render, 50);
    });

    // Bind the star/favorite button in the header
    const btn = document.getElementById('btn-favorite');
    if (btn) {
      btn.addEventListener('click', () => {
        toggleCurrent();
        _updateFavButton();
      });
      // Set initial state
      window.addEventListener('hashchange', _updateFavButton);
      setTimeout(_updateFavButton, 100);
    }
  }

  function _updateFavButton() {
    const btn = document.getElementById('btn-favorite');
    if (!btn) return;
    const path = typeof Router !== 'undefined' ? Router.path() : '/';
    const isFav = isFavorite(path);
    btn.classList.toggle('active', isFav);
    btn.setAttribute('aria-label', isFav ? 'Remove from favorites' : 'Add to favorites');
    btn.title = isFav ? 'Remove from favorites' : 'Add to favorites';
  }

  /* ── Blueprint Favorites ── */
  const BP_KEY = 'nice-bp-favorites';

  function _loadBpFavs() {
    try { return JSON.parse(localStorage.getItem(BP_KEY)) || []; } catch { return []; }
  }

  function addBlueprint(bpId) {
    const favs = _loadBpFavs();
    if (favs.includes(bpId)) return false;
    favs.push(bpId);
    localStorage.setItem(BP_KEY, JSON.stringify(favs));
    if (typeof Gamification !== 'undefined') Gamification.addXP('add_favorite', 3);
    return true;
  }

  function removeBlueprint(bpId) {
    const favs = _loadBpFavs().filter(id => id !== bpId);
    localStorage.setItem(BP_KEY, JSON.stringify(favs));
  }

  function isBlueprintFavorite(bpId) {
    return _loadBpFavs().includes(bpId);
  }

  function getBlueprintFavorites() {
    return _loadBpFavs();
  }

  return { init, add, remove, isFavorite, toggleCurrent, getAll, render, addBlueprint, removeBlueprint, isBlueprintFavorite, getBlueprintFavorites };
})();
