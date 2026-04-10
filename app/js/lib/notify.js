/* ═══════════════════════════════════════════════════════════════════
   NICE — Notification Manager
   Push notification + in-app notification support.
═══════════════════════════════════════════════════════════════════ */

const Notify = (() => {
  let _permission = 'default';
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
  function send({ title, message, type = 'system', undo }) {
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

    // In-app notification (configurable duration)
    const duration = (settings.toastDuration || 5) * 1000;
    _showToast(title, message, type, duration, undo);

    // Store to Supabase
    const user = State.get('user');
    if (user && typeof SB !== 'undefined' && SB.db) {
      SB.db('notifications').create({
        user_id: user.id,
        type,
        title,
        message,
        read: false,
      }).catch(() => {});
    }

    // Update badge
    _updateBadge();
  }

  function _showToast(title, message, type, duration = 5000, undoCallback) {
    const colors = {
      agent_error: '#ef4444', task_complete: '#22c55e', task_failed: '#ef4444',
      fleet_deployed: '#6366f1', budget_alert: '#f59e0b', system: 'var(--accent)',
    };
    const color = colors[type] || 'var(--accent)';

    const toast = document.createElement('div');
    toast.className = 'notify-toast';
    toast.innerHTML = `
      <div class="notify-toast-bar" style="background:${color}"></div>
      <div class="notify-toast-body">
        <strong class="notify-toast-title">${_esc(title)}</strong>
        <span class="notify-toast-msg">${_esc(message)}</span>
      </div>
      ${undoCallback ? '<button class="toast-undo">Undo</button>' : ''}
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

    // Auto dismiss after configured duration
    const timer = setTimeout(() => _dismiss(toast), duration);

    toast.querySelector('.notify-toast-close')?.addEventListener('click', () => {
      clearTimeout(timer);
      _dismiss(toast);
    });

    if (undoCallback) {
      toast.querySelector('.toast-undo')?.addEventListener('click', () => {
        clearTimeout(timer);
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
    const unread = notifs.filter(n => !n.read).length + 1; // +1 for the new one
    const badge = document.getElementById('bell-badge');
    if (badge) {
      badge.textContent = unread;
      badge.style.display = unread > 0 ? '' : 'none';
    }
    const hudBadge = document.getElementById('hud-alert-badge');
    if (hudBadge) {
      hudBadge.textContent = unread;
      hudBadge.style.display = unread > 0 ? '' : 'none';
    }
    const tabBadge = document.getElementById('tab-alert-badge');
    if (tabBadge) {
      tabBadge.textContent = unread;
      tabBadge.style.display = unread > 0 ? '' : 'none';
    }
    // App Badge API (PWA installed)
    if ('setAppBadge' in navigator) {
      if (unread > 0) {
        navigator.setAppBadge(unread).catch(() => {});
      } else {
        navigator.clearAppBadge().catch(() => {});
      }
    }
  }

  const _esc = Utils.esc;

  /**
   * Subscribe to push notifications via the service worker.
   * Stores the subscription endpoint in the user's profile.
   * @returns {Promise<PushSubscription|null>}
   */
  async function subscribePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    const granted = await requestPermission();
    if (!granted) return null;

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

  return { init, requestPermission, send, subscribePush };
})();
