/* ═══════════════════════════════════════════════════════════════════
   NICE — Hash Router
   SPA routing with param extraction and view lifecycle.
═══════════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} RouterModule
 * @property {function(string, Object): void} on — Register a route pattern with a view object
 * @property {function(string): void} navigate — Navigate to a hash path programmatically
 * @property {function(): string} path — Get the current hash path (without query params)
 * @property {function(): Object.<string,string>} query — Parse query params from window.location.search
 * @property {function(): Object.<string,string>} hashQuery — Parse query params after the hash path
 * @property {function(HTMLElement): void} init — Start the router, rendering into the given container element
 */

const Router = (() => {
  const _routes = [];
  let _currentView = null;
  let _el = null;

  /* Register a route: Router.on('/agents/:id', AgentDetailView) */
  function on(pattern, view) {
    const keys = [];
    const regex = new RegExp(
      '^' + pattern.replace(/:([^/]+)/g, (_m, key) => {
        keys.push(key);
        return '([^/]+)';
      }) + '$'
    );
    _routes.push({ pattern, regex, keys, view });
  }

  /* Navigate programmatically */
  function navigate(path) {
    window.location.hash = path;
  }

  /* Get current path (strip leading # and any query params after hash path) */
  function path() {
    const raw = window.location.hash.replace(/^#/, '') || '/';
    return raw.split('?')[0] || '/';
  }

  /* Parse query string from window.location.search (e.g. ?ref=dashboard&utm_source=twitter) */
  function query() {
    const params = {};
    const qs = window.location.search.replace(/^\?/, '');
    if (!qs) return params;
    qs.split('&').forEach(pair => {
      const [k, v] = pair.split('=');
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
    return params;
  }

  /* Parse query params after hash path (e.g. #/bridge?bp=code-reviewer) */
  function hashQuery() {
    const params = {};
    const hash = window.location.hash.replace(/^#/, '');
    const idx = hash.indexOf('?');
    if (idx === -1) return params;
    const qs = hash.slice(idx + 1);
    qs.split('&').forEach(pair => {
      const [k, v] = pair.split('=');
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
    return params;
  }

  /* Match current hash to a route */
  function _match(p) {
    for (const route of _routes) {
      const m = p.match(route.regex);
      if (m) {
        const params = {};
        route.keys.forEach((key, i) => { try { params[key] = decodeURIComponent(m[i + 1]); } catch { params[key] = m[i + 1]; } });
        return { view: route.view, params };
      }
    }
    return null;
  }

  /* Render the matched view */
  function _render() {
    const p = path();
    const match = _match(p);

    if (!match) {
      _el.innerHTML = `<div class="app-empty"><h2>Page Not Found</h2><p>No view for <code>${p}</code></p></div>`;
      return;
    }

    // Teardown previous view safely
    if (_currentView && _currentView.destroy) {
      try { _currentView.destroy(); } catch(e) { console.error('[NICE] View destroy error:', e); }
    }
    // Clean up any scoped State subscriptions from the previous view
    if (typeof State !== 'undefined' && State.destroyScoped) {
      State.destroyScoped();
    }

    _currentView = match.view;

    // Update page title in header
    const title = match.view.title || 'NICE';
    const titleEl = document.getElementById('app-page-title');
    if (titleEl) titleEl.textContent = title;
    document.title = `${title} — NICE`;

    // Announce route change to screen readers
    const announcer = document.getElementById('sr-announcer');
    if (announcer) announcer.textContent = 'Navigated to ' + title;

    // Update active states in sidebar + tab bar
    _updateNav(p);

    // Audit log: record navigation
    if (typeof AuditLog !== 'undefined') {
      AuditLog.log('navigation', { path: p, description: 'Navigated to ' + title });
    }

    // Render new view with error boundary + transition
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasContent = _el.children.length > 0;

    // Clean up view-specific state from previous render
    _el.classList.remove('view-no-scroll');
    document.getElementById('app-fixed-tabs')?.replaceChildren();

    if (reducedMotion || !hasContent) {
      // Instant swap (first render or reduced motion)
      _el.innerHTML = '';
      try {
        if (match.view.render) match.view.render(_el, match.params);
      } catch (err) {
        console.error('[NICE] View render error on ' + p + ':', err);
        _el.innerHTML = _renderError(p, err);
      }
    } else {
      // Animated transition
      _el.classList.add('view-exit');
      setTimeout(() => {
        _el.innerHTML = '';
        _el.classList.remove('view-exit');
        try {
          if (match.view.render) match.view.render(_el, match.params);
        } catch (err) {
          console.error('[NICE] View render error on ' + p + ':', err);
          _el.innerHTML = _renderError(p, err);
        }
        requestAnimationFrame(() => {
          _el.classList.add('view-enter');
          setTimeout(() => _el.classList.remove('view-enter'), 200);
        });
      }, 120);
    }
  }

  function _renderError(path, err) {
    // Log render error to DB (non-blocking)
    try {
      if (typeof SB !== 'undefined' && SB.isReady()) {
        const user = typeof State !== 'undefined' ? State.get('user') : null;
        SB.db('error_log').create({
          user_id: user ? user.id : null,
          message: ('View render error: ' + (err.message || err)).slice(0, 500),
          source: 'router._renderError',
          stack: (err.stack || '').slice(0, 2000),
          url: location.href.slice(0, 200),
          user_agent: navigator.userAgent.slice(0, 200),
        }).catch(() => {});
      }
    } catch { /* don't recurse */ }

    const _e = (s) => { const t = document.createElement('div'); t.textContent = String(s); return t.innerHTML; };
    return '<div class="err-boundary">' +
      '<div class="err-boundary-icon">\u26A0</div>' +
      '<h2 class="err-boundary-title">Something went wrong</h2>' +
      '<p class="err-boundary-msg">Failed to render <code>' + _e(path) + '</code></p>' +
      '<pre class="err-boundary-detail">' + _e(err.message || err) + '</pre>' +
      '<div class="err-boundary-actions">' +
        '<button class="btn btn-sm btn-primary" onclick="Router.navigate(\'' + _e(path).replace(/'/g, "&#39;") + '\')">Retry</button>' +
        '<button class="btn btn-sm" onclick="location.reload()">Reload</button>' +
        '<a href="#/" class="btn btn-sm">Go Home</a>' +
      '</div>' +
    '</div>';
  }

  /* Update active link in sidebar and tab bar */
  function _updateNav(p) {
    // Sidebar links
    document.querySelectorAll('.side-link').forEach(a => {
      const href = (a.getAttribute('href') || '').replace('#', '');
      a.classList.toggle('active', href === p || (p.startsWith(href + '/') && href !== '/'));
    });

    // Tab bar tabs — match by first path segment
    const seg = '/' + (p.split('/')[1] || '');
    document.querySelectorAll('.app-tabbar .tab').forEach(a => {
      const href = (a.getAttribute('href') || '').replace('#', '');
      a.classList.toggle('active', href === p || href === seg);
    });
  }

  /* Re-render the current view (e.g. after a theme change so any
     theme-specific DOM the previous view rendered gets rebuilt fresh). */
  function refresh() {
    if (_el) _render();
  }

  /* Start listening */
  function init(containerEl) {
    _el = containerEl;
    window.addEventListener('hashchange', _render);
    // path() normalizes empty hash to '/', so we don't force '#/' onto the URL
    // on first load — that was cosmetically polluting the address bar.
    _render();
  }

  return { on, navigate, path, query, hashQuery, init, refresh };
})();
