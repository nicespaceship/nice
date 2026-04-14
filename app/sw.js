/* ═══════════════════════════════════════════════════════════════════
   NICE — Service Worker (auto-versioned by CI)
   Precaches all app assets for full offline support.
   Network-first for JS/CSS (always fresh), cache-first for static.
   Includes offline fallback page, periodic sync, Badge API support.
   Bump CACHE_VERSION to force a full cache refresh on deploy.
═══════════════════════════════════════════════════════════════════ */

// AUTO-STAMPED by CI — do not edit manually. Bumped on each deploy.
const CACHE_VERSION = 39;
const CACHE_NAME = `nice-v${CACHE_VERSION}`;
const DATA_CACHE = `nice-v${CACHE_VERSION}-data`;

const PRECACHE_ASSETS = [
  '/app/',
  '/app/index.html',
  '/app/manifest.json',
  '/app/icons/icon-192.png',
  '/app/icons/icon-512.png',
  '/public/css/theme.css',
  '/app/css/app.css',
  // Lib modules
  '/app/js/lib/state.js',
  '/app/js/lib/supabase.js',
  '/app/js/lib/router.js',
  '/app/js/lib/notify.js',
  '/app/js/lib/gamification.js',
  '/app/js/lib/command-palette.js',
  '/app/js/lib/keyboard.js',
  '/app/js/lib/audit-log.js',
  '/app/js/lib/data-io.js',
  '/app/js/lib/activity-feed.js',
  '/app/js/lib/quick-notes.js',
  '/app/js/lib/favorites.js',
  '/app/js/lib/ship-log.js',
  '/app/js/lib/llm-config.js',
  '/app/js/lib/mission-runner.js',
  '/app/js/lib/auth-modal.js',
  '/app/js/lib/blueprint-store.js',
  '/app/js/lib/message-bar.js',
  // View modules
  '/app/js/views/home.js',
  '/app/js/views/profile.js',
  '/app/js/views/agents.js',
  '/app/js/views/agent-builder.js',
  '/app/js/views/spaceship-builder.js',
  '/app/js/views/missions.js',
  '/app/js/views/spaceships.js',
  '/app/js/views/blueprints.js',
  '/app/js/views/analytics.js',
  '/app/js/views/cost.js',
  '/app/js/views/vault.js',
  '/app/js/views/settings.js',
  '/app/js/views/audit-log.js',
  '/app/js/views/theme-creator.js',
  '/app/js/views/workflows.js',
  '/app/js/views/prompt-panel.js',
  '/app/js/views/alerts.js',
  '/app/js/views/wallet.js',
  '/app/js/views/security.js',
  '/app/js/views/log-view.js',
  '/app/js/views/dock-view.js',
  '/app/js/views/ship-log-view.js',
  // Main orchestrator
  '/app/js/nice.js',
];

// Offline fallback HTML
const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NICE — Offline</title>
<style>
  body{background:#080808;color:#f0f0f0;font-family:'Inter',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center}
  .wrap{max-width:420px;padding:40px 24px}
  h1{font-size:2rem;margin:0 0 12px}
  p{color:#888;margin:0 0 24px;line-height:1.6}
  .btn{display:inline-block;padding:10px 24px;border:1px solid #fff;color:#fff;text-decoration:none;border-radius:4px;font-size:.9rem;cursor:pointer;background:none}
  .btn:hover{background:#fff;color:#080808}
  .icon{font-size:3rem;margin-bottom:16px}
</style>
</head>
<body>
<div class="wrap">
  <div class="icon">📡</div>
  <h1>You're Offline</h1>
  <p>NICE needs an internet connection for this page. Your cached data is still available — try navigating to a previously visited page.</p>
  <a href="/app/" class="btn">Go to Dashboard</a>
</div>
</body>
</html>`;

// Install — precache all app assets + offline page
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Cache offline page
        cache.put('/app/offline.html', new Response(OFFLINE_HTML, {
          headers: { 'Content-Type': 'text/html' }
        }));
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate — purge ALL old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== DATA_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - Supabase API: network-first with data cache fallback
// - JS/CSS files: network-first (fresh code, offline fallback)
// - Navigation requests: network-first with offline fallback page
// - Everything else: stale-while-revalidate
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Supabase API calls: network-first with cached data fallback
  if (url.hostname.includes('supabase')) {
    e.respondWith(
      fetch(e.request).then(resp => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(DATA_CACHE).then(cache => cache.put(e.request, clone));
        }
        return resp;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Skip other external requests
  if (url.hostname !== location.hostname) return;

  const isCodeAsset = url.pathname.endsWith('.js') || url.pathname.endsWith('.css');
  const isNavigation = e.request.mode === 'navigate';

  if (isNavigation) {
    // Navigation requests: network-first with offline fallback
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          if (resp && resp.status === 200) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return resp;
        })
        .catch(() =>
          caches.match(e.request)
            .then(cached => cached || caches.match('/app/offline.html'))
        )
    );
  } else if (isCodeAsset) {
    // Network-first for JS/CSS — always get fresh code
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          if (resp && resp.status === 200) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return resp;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    // Stale-while-revalidate for HTML, images, fonts
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fetched = fetch(e.request).then(resp => {
          if (resp && resp.status === 200) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return resp;
        }).catch(() => cached);

        return cached || fetched;
      })
    );
  }
});

// Background sync — notify clients when back online
self.addEventListener('sync', e => {
  if (e.tag === 'nice-sync-queue') {
    e.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SYNC_READY' }));
      })
    );
  }
});

// Periodic background sync (12h interval)
self.addEventListener('periodicsync', e => {
  if (e.tag === 'nice-sync') {
    e.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ type: 'PERIODIC_SYNC' }));
      })
    );
  }
});

// Push notification support (placeholder for future)
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : { title: 'NICE', body: 'New activity' };
  e.waitUntil(
    self.registration.showNotification(data.title || 'NICE', {
      body: data.body || 'You have new activity.',
      icon: '/app/icons/icon-192.png',
      badge: '/app/icons/icon-192.png',
      tag: 'nice-notification',
    })
  );
});

// Notification click — focus or open NICE
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const niceClient = clients.find(c => c.url.includes('/app/'));
      if (niceClient) {
        return niceClient.focus();
      }
      return self.clients.openWindow('/app/');
    })
  );
});
