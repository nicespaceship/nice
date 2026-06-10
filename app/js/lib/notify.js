/* ═══════════════════════════════════════════════════════════════════
   NICE — Notification Manager
   Push notification + in-app notification support.
═══════════════════════════════════════════════════════════════════ */

const Notify = (() => {
  let _permission = 'default';
  let _rtChannel = null;
  const VAPID_PUBLIC = 'BFdbPvnALg_WEzURfuiqMbt5bjww9PpxqkHAZgo3t96UCHkiGJts9E--oz5vOfes7htXQwpq-JeW_1fq0qDRLL0';

  function init() {
    if ('Notification' in window) {
      _permission = Notification.permission;
    }
  }

  /**
   * Request push notification permission.
   * @returns {Promise<boolean>} true if granted
   */
  async function requestPermission() {
    if (!('Notification' in window)) return false;
    const result = await Notification.requestPermission();
    _permission = result;
    return result === 'granted';
  }

  /**
   * Send a push notification (if permitted) and store in-app.
   * @param {Object} opts
   * @param {string} opts.title
   * @param {string} opts.message
   * @param {string} opts.type - one of: agent_error, task_complete, task_failed, fleet_deployed, budget_alert, system
   */
  function send({ title, message, type = 'system', undo, actionLabel, persistent }) {
    // Check settings
    const settings = JSON.parse(localStorage.getItem(Utils.KEYS.settings) || '{}');
    if (settings.notifications === false) return;

    // Check per-category settings
    const categories = settings.notifCategories || {};
    if (categories[type] === false) return;

    // Browser push notification
    if (_permission === 'granted') {
      try {
        new Notification(title, {
          body: message,
          icon: '/app/icons/icon-192.png',
          badge: '/app/icons/icon-192.png',
          tag: type,
        });
      } catch(e) { /* mobile may not support constructor */ }
    }

    // In-app notification. `persistent: true` skips the auto-dismiss timer
    // — for one-shot critical messages (e.g. discovery CTAs) where a 5s
    // toast that the user might miss isn't acceptable. Only manual close
    // (X button or action click) dismisses it.
    const duration = (settings.toastDuration || 5) * 1000;
    _showToast(title, message, type, duration, undo, actionLabel, persistent);

    // Record in the in-memory store the Alerts page, MessageBar, and the PWA
    // badge all read. send() is the producer; without it that store stays empty
    // and those surfaces never light up. Durable history still goes to Supabase.
    const clientId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'n-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const notif = {
      id: clientId,
      type, title, message, read: false,
      created_at: new Date().toISOString(),
    };
    State.set('notifications', [notif, ...(State.get('notifications') || [])].slice(0, 50));

    // Store to Supabase, then reconcile the optimistic client id with the
    // server row id. Without this, a later mark-read can't target the row
    // (the client id matches nothing), so read-state for notifications created
    // this session would never persist and the badge would re-light on reload.
    const user = State.get('user');
    if (user && typeof SB !== 'undefined' && SB.db) {
      SB.db('notifications').create({
        user_id: user.id,
        type,
        title,
        message,
        read: false,
      }).then(row => {
        if (row && row.id && row.id !== clientId) {
          const list = State.get('notifications') || [];
          const m = list.find(x => x.id === clientId);
          if (m) { m.id = row.id; State.set('notifications', list); }
        }
      }).catch(() => {});
    }

    // Update badge
    _updateBadge();
  }

  function _showToast(title, message, type, duration = 5000, undoCallback, actionLabel, persistent) {
    const colors = {
      agent_error: '#ef4444', task_complete: '#22c55e', task_failed: '#ef4444',
      fleet_deployed: '#6366f1', budget_alert: '#f59e0b', system: 'var(--accent)',
    };
    const color = colors[type] || 'var(--accent)';

    // Theme-aware voice — let the active theme rewrite title/message so
    // toasts inherit the theme's personality (e.g. "Installed" →
    // "Protocol engaged, sir." under J.A.R.V.I.S.). No-op when no theme
    // owns a label map.
    if (typeof Theme !== 'undefined' && typeof Theme.rewrite === 'function') {
      title = Theme.rewrite(title);
      message = Theme.rewrite(message);
    }

    const toast = document.createElement('div');
    toast.className = 'notify-toast';
    toast.innerHTML = `
      <div class="notify-toast-bar" style="background:${color}"></div>
      <div class="notify-toast-body">
        <strong class="notify-toast-title">${_esc(title)}</strong>
        <span class="notify-toast-msg">${_esc(message)}</span>
      </div>
      ${undoCallback ? `<button class="toast-undo">${_esc(actionLabel || 'Undo')}</button>` : ''}
      <button class="notify-toast-close" aria-label="Close">&times;</button>
    `;

    // Find or create container
    let container = document.getElementById('notify-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notify-container';
      container.className = 'notify-container';
      document.body.appendChild(container);
    }

    container.appendChild(toast);

    // Auto dismiss after configured duration unless persistent. Persistent
    // toasts only go away on manual close (X) or action click — used for
    // one-shot critical messages where missing the toast would defeat the
    // point (discovery CTAs, must-acknowledge prompts).
    const timer = persistent ? null : setTimeout(() => _dismiss(toast), duration);
    const cancelTimer = () => { if (timer) clearTimeout(timer); };

    toast.querySelector('.notify-toast-close')?.addEventListener('click', () => {
      cancelTimer();
      _dismiss(toast);
    });

    if (undoCallback) {
      toast.querySelector('.toast-undo')?.addEventListener('click', () => {
        cancelTimer();
        try { undoCallback(); } catch(e) { console.error('[NICE] Undo callback error:', e); }
        _dismiss(toast);
      });
    }
  }

  function _dismiss(toast) {
    toast.classList.add('dismiss');
    setTimeout(() => toast.remove(), 300);
  }

  function _updateBadge() {
    const notifs = State.get('notifications') || [];
    const unread = notifs.filter(n => !n.read).length;
    // New notifications surface as toasts (above) and on the PWA app badge.
    // The count tracks State 'notifications', kept current by send() and by the
    // Alerts page's mark-read, and clears when nothing is unread.
    if ('setAppBadge' in navigator) {
      if (unread > 0) {
        navigator.setAppBadge(unread).catch(() => {});
      } else {
        navigator.clearAppBadge().catch(() => {});
      }
    }
  }

  /**
   * Hydrate the in-app notification store from Supabase at sign-in so the
   * Alerts page and the PWA app badge survive a reload. Without this, State
   * 'notifications' only ever held what send() produced during the current
   * session — the badge reset to zero and Alerts went empty on every refresh.
   * @param {Object} [user] - the signed-in user; falls back to State.user
   */
  async function load(user) {
    user = user || (typeof State !== 'undefined' && State.get('user'));
    if (!user || typeof SB === 'undefined' || !SB.db) return;
    try {
      const rows = await SB.db('notifications').list({
        userId: user.id, orderBy: 'created_at', asc: false, limit: 50,
      });
      if (Array.isArray(rows)) {
        State.set('notifications', rows);
        _updateBadge();
      }
    } catch (e) { /* best-effort; the session-only store still works */ }
    // Go live: stream inserts/updates so the badge and Alerts stay current
    // across tabs and devices without a reload. Runs even if the hydrate
    // above failed.
    _subscribeRealtime(user);
  }

  // Subscribe to realtime changes on the notifications table for this user.
  // RLS scopes delivery server-side; the user_id check is defense-in-depth.
  // Tears down any prior channel first so re-auth never leaks a subscription.
  function _subscribeRealtime(user) {
    if (typeof SB === 'undefined' || !SB.realtime || !SB.realtime.subscribe) return;
    _teardownRealtime();
    const uid = user && user.id;
    _rtChannel = SB.realtime.subscribe('notifications', (payload) => {
      const row = payload && payload.new;
      if (!row || !row.id) return;
      if (uid && row.user_id && row.user_id !== uid) return;
      const evt = payload.eventType || payload.type;
      if (evt === 'UPDATE') _applyRemoteUpdate(row);
      else _applyRemoteInsert(row);
    });
  }

  // A new row arrived. Skip if we already have it (reconciled in send() or a
  // prior event). If it echoes our own optimistic insert whose client id has
  // not reconciled yet, adopt the server id in place instead of duplicating.
  function _applyRemoteInsert(row) {
    const list = State.get('notifications') || [];
    if (list.some(n => n.id === row.id)) return;
    const rowT = new Date(row.created_at || Date.now()).getTime();
    const echo = list.find(n =>
      n.type === row.type && n.title === row.title && n.message === row.message &&
      Math.abs(new Date(n.created_at).getTime() - rowT) < 15000);
    if (echo) { echo.id = row.id; State.set('notifications', list); _updateBadge(); return; }
    State.set('notifications', [row, ...list].slice(0, 50));
    _updateBadge();
  }

  // A row changed elsewhere (e.g. marked read in another tab). Sync read-state
  // for rows we already hold; ignore updates to rows outside our window.
  function _applyRemoteUpdate(row) {
    const list = State.get('notifications') || [];
    const n = list.find(x => x.id === row.id);
    if (!n || n.read === row.read) return;
    n.read = row.read;
    State.set('notifications', list);
    _updateBadge();
  }

  function _teardownRealtime() {
    if (_rtChannel && typeof SB !== 'undefined' && SB.realtime && SB.realtime.unsubscribe) {
      SB.realtime.unsubscribe(_rtChannel);
    }
    _rtChannel = null;
  }

  /** Mark one notification read in State + Supabase and refresh the badge. */
  function markRead(id) {
    const notifs = State.get('notifications') || [];
    const n = notifs.find(x => x.id === id);
    if (!n || n.read) return;
    n.read = true;
    State.set('notifications', notifs);
    _updateBadge();
    _persistRead([id]);
  }

  /** Mark every notification read in State + Supabase and refresh the badge. */
  function markAllRead() {
    const notifs = State.get('notifications') || [];
    const ids = notifs.filter(n => !n.read).map(n => n.id);
    if (!ids.length) return;
    notifs.forEach(n => { n.read = true; });
    State.set('notifications', notifs);
    _updateBadge();
    _persistRead(ids);
  }

  // Best-effort persist of read-state. Rows created this session reconcile
  // their id in send(); an id that never reconciled (offline insert) simply
  // matches no row and the update no-ops. Bounded by the 50-row store cap.
  function _persistRead(ids) {
    const user = State.get('user');
    if (!user || typeof SB === 'undefined' || !SB.db) return;
    ids.forEach(id => SB.db('notifications').update(id, { read: true }).catch(() => {}));
  }

  const _esc = Utils.esc;

  /**
   * Subscribe to push notifications via the service worker.
   * Stores the subscription endpoint in the user's profile.
   * @returns {Promise<PushSubscription|null>}
   */
  async function subscribePush({ interactive = false } = {}) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return null;
    // Only prompt for permission in response to a user gesture (interactive).
    // On auto-calls (e.g. auth refresh) just (re)subscribe when permission is
    // already granted, so we never trip the browser's "permission requested
    // without a user gesture" rule, which silently blocks the prompt anyway.
    if (Notification.permission !== 'granted') {
      if (!interactive) return null;
      const granted = await requestPermission();
      if (!granted) return null;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: _urlBase64ToUint8Array(VAPID_PUBLIC),
        });
      }
      // Store subscription in user profile
      const user = State.get('user');
      if (user && SB.isReady()) {
        await SB.db('profiles').update(user.id, {
          push_subscription: JSON.stringify(sub.toJSON()),
        }).catch(() => {});
      }
      return sub;
    } catch (e) {
      console.warn('Push subscribe failed:', e);
      return null;
    }
  }

  function _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  return { init, requestPermission, send, load, markRead, markAllRead, teardownRealtime: _teardownRealtime, subscribePush, updateBadge: _updateBadge };
})();
