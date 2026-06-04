import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Notify is loaded globally by setup.js

describe('Notify', () => {
  beforeEach(() => {
    localStorage.clear();
    // Clean up any toast containers
    document.getElementById('notify-container')?.remove();
  });

  it('should be defined with expected methods', () => {
    expect(globalThis.Notify).toBeDefined();
    expect(typeof Notify.init).toBe('function');
    expect(typeof Notify.send).toBe('function');
    expect(typeof Notify.requestPermission).toBe('function');
  });

  it('should show toast on send', () => {
    Notify.send({ title: 'Test', message: 'Hello', type: 'system' });
    const container = document.getElementById('notify-container');
    expect(container).toBeTruthy();
    const toasts = container.querySelectorAll('.notify-toast');
    expect(toasts.length).toBe(1);
    expect(toasts[0].querySelector('.notify-toast-title').textContent).toBe('Test');
    expect(toasts[0].querySelector('.notify-toast-msg').textContent).toBe('Hello');
  });

  it('should stack multiple toasts', () => {
    Notify.send({ title: 'First', message: 'msg1', type: 'system' });
    Notify.send({ title: 'Second', message: 'msg2', type: 'system' });
    const container = document.getElementById('notify-container');
    expect(container.querySelectorAll('.notify-toast').length).toBe(2);
  });

  it('should respect notifications=false in settings', () => {
    localStorage.setItem('nice-settings', JSON.stringify({ notifications: false }));
    Notify.send({ title: 'Suppressed', message: 'nope', type: 'system' });
    const container = document.getElementById('notify-container');
    expect(container).toBeNull();
  });

  it('should respect per-category disabling', () => {
    localStorage.setItem('nice-settings', JSON.stringify({
      notifCategories: { agent_error: false }
    }));
    // agent_error disabled - should not show
    Notify.send({ title: 'Error', message: 'blocked', type: 'agent_error' });
    const container = document.getElementById('notify-container');
    expect(container).toBeNull();

    // system not disabled - should show
    Notify.send({ title: 'System', message: 'allowed', type: 'system' });
    const container2 = document.getElementById('notify-container');
    expect(container2).toBeTruthy();
  });

  it('should use correct color for different types', () => {
    Notify.send({ title: 'OK', message: 'done', type: 'task_complete' });
    const bar = document.querySelector('.notify-toast-bar');
    // jsdom normalizes hex colors to rgb format
    expect(bar.style.background).toBe('rgb(34, 197, 94)');
  });

  it('should XSS-escape title and message', () => {
    Notify.send({ title: '<script>alert(1)</script>', message: '<img onerror=alert(1)>', type: 'system' });
    const title = document.querySelector('.notify-toast-title');
    expect(title.textContent).toBe('<script>alert(1)</script>');
    // innerHTML should be escaped
    expect(title.innerHTML).not.toContain('<script>');
  });

  it('should handle null/undefined message gracefully', () => {
    Notify.send({ title: 'Null test', message: null, type: 'system' });
    const msg = document.querySelector('.notify-toast-msg');
    expect(msg.textContent).toBe('');
  });

  it('close button should add dismiss class', () => {
    Notify.send({ title: 'Close Test', message: 'click me', type: 'system' });
    const closeBtn = document.querySelector('.notify-toast-close');
    expect(closeBtn).toBeTruthy();
    closeBtn.click();
    const toast = document.querySelector('.notify-toast');
    expect(toast.classList.contains('dismiss')).toBe(true);
  });

  it('init should not throw', () => {
    expect(() => Notify.init()).not.toThrow();
  });

  it('should render undo button when undo callback is provided', () => {
    const undoFn = vi.fn();
    Notify.send({ title: 'Undo Test', message: 'undoable', type: 'system', undo: undoFn });
    const undoBtn = document.querySelector('.toast-undo');
    expect(undoBtn).toBeTruthy();
    expect(undoBtn.textContent).toBe('Undo');
  });

  it('should call undo callback when undo button is clicked', () => {
    const undoFn = vi.fn();
    Notify.send({ title: 'Undo Click', message: 'click undo', type: 'system', undo: undoFn });
    const undoBtn = document.querySelector('.toast-undo');
    undoBtn.click();
    expect(undoFn).toHaveBeenCalledOnce();
  });

  it('should dismiss toast after undo button is clicked', () => {
    const undoFn = vi.fn();
    Notify.send({ title: 'Undo Dismiss', message: 'dismiss', type: 'system', undo: undoFn });
    const undoBtn = document.querySelector('.toast-undo');
    undoBtn.click();
    const toast = document.querySelector('.notify-toast');
    expect(toast.classList.contains('dismiss')).toBe(true);
  });

  it('should not render undo button when no undo callback is provided', () => {
    Notify.send({ title: 'No Undo', message: 'none', type: 'system' });
    const undoBtn = document.querySelector('.toast-undo');
    expect(undoBtn).toBeNull();
  });
});

describe('Notify — notification store + PWA badge', () => {
  beforeEach(() => {
    localStorage.clear();
    document.getElementById('notify-container')?.remove();
    State.set('notifications', []);
  });

  it('send() records the notification in State so Alerts/MessageBar/badge can read it', () => {
    Notify.send({ title: 'Hi', message: 'there', type: 'system' });
    const notifs = State.get('notifications');
    expect(notifs.length).toBe(1);
    expect(notifs[0]).toMatchObject({ title: 'Hi', message: 'there', type: 'system', read: false });
    expect(notifs[0].id).toBeTruthy();
  });

  it('prepends newest-first and marks unread by default', () => {
    Notify.send({ title: 'First', message: '1', type: 'system' });
    Notify.send({ title: 'Second', message: '2', type: 'system' });
    const notifs = State.get('notifications');
    expect(notifs[0].title).toBe('Second');
    expect(notifs.filter(n => !n.read).length).toBe(2);
  });

  it('does not record a notification that settings suppress', () => {
    localStorage.setItem('nice-settings', JSON.stringify({ notifications: false }));
    Notify.send({ title: 'Nope', message: 'x', type: 'system' });
    expect((State.get('notifications') || []).length).toBe(0);
  });

  it('updateBadge sets the badge to the true unread count and clears at zero (no phantom +1)', () => {
    const setBadge = vi.fn(() => Promise.resolve());
    const clearBadge = vi.fn(() => Promise.resolve());
    navigator.setAppBadge = setBadge;
    navigator.clearAppBadge = clearBadge;
    try {
      State.set('notifications', [{ read: false }, { read: false }, { read: true }]);
      Notify.updateBadge();
      expect(setBadge).toHaveBeenLastCalledWith(2);

      State.set('notifications', [{ read: true }, { read: true }]);
      Notify.updateBadge();
      expect(clearBadge).toHaveBeenCalled();
    } finally {
      delete navigator.setAppBadge;
      delete navigator.clearAppBadge;
    }
  });
});

describe('Notify — persistence (DB load + durable mark-read)', () => {
  let origDb;
  beforeEach(() => {
    localStorage.clear();
    document.getElementById('notify-container')?.remove();
    State.set('notifications', []);
    State.set('user', null);
    origDb = SB.db;
  });
  afterEach(() => { SB.db = origDb; });

  it('load() hydrates the store from Supabase and sets the badge to the unread count', async () => {
    const rows = [
      { id: 'r1', type: 'system', title: 'A', message: '1', read: false, created_at: '2026-06-04T00:00:00Z' },
      { id: 'r2', type: 'system', title: 'B', message: '2', read: true,  created_at: '2026-06-03T00:00:00Z' },
    ];
    SB.db = () => ({ list: async () => rows, create: async () => ({}), update: async () => ({}) });
    const setBadge = vi.fn(() => Promise.resolve());
    navigator.setAppBadge = setBadge;
    try {
      await Notify.load({ id: 'u1' });
      expect(State.get('notifications')).toEqual(rows);
      expect(setBadge).toHaveBeenLastCalledWith(1);
    } finally { delete navigator.setAppBadge; }
  });

  it('load() no-ops without a user and does not clobber the store', async () => {
    State.set('notifications', [{ id: 'x', read: false }]);
    await Notify.load(null);
    expect(State.get('notifications')).toEqual([{ id: 'x', read: false }]);
  });

  it('markRead() marks one read in State and persists that row to Supabase', () => {
    State.set('user', { id: 'u1' });
    State.set('notifications', [
      { id: 'r1', read: false, title: 'a', message: '', type: 'system', created_at: '' },
      { id: 'r2', read: false, title: 'b', message: '', type: 'system', created_at: '' },
    ]);
    const update = vi.fn(async () => ({}));
    SB.db = () => ({ list: async () => [], create: async () => ({}), update });
    Notify.markRead('r1');
    const notifs = State.get('notifications');
    expect(notifs.find(n => n.id === 'r1').read).toBe(true);
    expect(notifs.find(n => n.id === 'r2').read).toBe(false);
    expect(update).toHaveBeenCalledWith('r1', { read: true });
  });

  it('markAllRead() marks every unread row and persists only those that changed', () => {
    State.set('user', { id: 'u1' });
    State.set('notifications', [
      { id: 'r1', read: false }, { id: 'r2', read: true }, { id: 'r3', read: false },
    ]);
    const update = vi.fn(async () => ({}));
    SB.db = () => ({ list: async () => [], create: async () => ({}), update });
    Notify.markAllRead();
    expect(State.get('notifications').every(n => n.read)).toBe(true);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith('r1', { read: true });
    expect(update).toHaveBeenCalledWith('r3', { read: true });
  });

  it('mark-read without a user updates State + badge but skips the DB call', () => {
    State.set('notifications', [{ id: 'r1', read: false }]);
    let called = false;
    SB.db = () => ({ list: async () => [], create: async () => ({}), update: async () => { called = true; return {}; } });
    Notify.markRead('r1');
    expect(State.get('notifications')[0].read).toBe(true);
    expect(called).toBe(false);
  });

  it('send() reconciles the optimistic client id with the server row id', async () => {
    State.set('user', { id: 'u1' });
    SB.db = () => ({
      list: async () => [],
      create: async () => ({ id: 'server-uuid', type: 'system', title: 'Hi', message: 'there', read: false }),
      update: async () => ({}),
    });
    Notify.send({ title: 'Hi', message: 'there', type: 'system' });
    const before = State.get('notifications')[0];
    expect(before.id).toBeTruthy();
    expect(before.id).not.toBe('server-uuid');
    // let the create() promise + its .then reconciliation flush
    await Promise.resolve(); await Promise.resolve();
    expect(State.get('notifications')[0].id).toBe('server-uuid');
  });
});
