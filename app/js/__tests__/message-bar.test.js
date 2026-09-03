/**
 * MessageBar tests — the AI communications ticker under the app header. The
 * module is a stateful singleton (`_messages` array, `_expanded` flag, and a
 * 30s `_refreshInterval`), so re-eval the source per test for a pristine
 * instance (the RateLimiter/Roles pattern). Fake timers freeze the clock and
 * let the refresh-interval + teardown paths be exercised deterministically.
 *
 * Privates stay private through the const→global rewrite, so behaviour is
 * asserted through the public API (init/push/destroy) plus the rendered DOM:
 * the `.msg-bar-track` ticker and the `.msg-bar-feed` expanded list.
 *
 * Utils (esc/timeAgo), State (mock), and AuditLog (real, seedable via .log())
 * all come from setup.js, which clears localStorage + resets State each test.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { readFileSync } = await import('fs');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(__dir, '../lib/message-bar.js'), 'utf-8')
  .replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');

const BASE = 1_700_000_000_000; // frozen "now"

/** Mount the header scaffold MessageBar renders into. */
function mountBar() {
  document.body.innerHTML = `
    <div id="nice-msg-bar">
      <button id="msg-bar-toggle" aria-expanded="false"></button>
      <div class="msg-bar-track"></div>
      <div class="msg-bar-feed"></div>
    </div>`;
}

const bar = () => document.getElementById('nice-msg-bar');
const track = () => document.querySelector('.msg-bar-track');
const feed = () => document.querySelector('.msg-bar-feed');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BASE);
  document.body.innerHTML = '';
  delete globalThis.ActivityFeed;
  eval(SRC); // fresh globalThis.MessageBar: empty _messages, _expanded=false
});
afterEach(() => {
  MessageBar.destroy();
  vi.useRealTimers();
  delete globalThis.ActivityFeed;
});

describe('MessageBar.init — guards', () => {
  it('does not throw when the bar element is absent', () => {
    expect(() => MessageBar.init()).not.toThrow();
  });

  it('does not throw when the track is missing inside the bar', () => {
    document.body.innerHTML = '<div id="nice-msg-bar"></div>';
    expect(() => MessageBar.init()).not.toThrow();
  });
});

describe('MessageBar._collectMessages (via rendered ticker)', () => {
  it('renders the welcome line with the display name', () => {
    mountBar();
    State.set('user', { user_metadata: { display_name: 'Zaphod' } });
    MessageBar.init();
    expect(track().innerHTML).toContain('Welcome back, Zaphod.');
  });

  it('falls back to the email local-part when no display name', () => {
    mountBar();
    State.set('user', { email: 'trillian@heart.gold' });
    MessageBar.init();
    expect(track().innerHTML).toContain('Welcome back, trillian.');
  });

  it("falls back to 'Pilot' when there is no user", () => {
    mountBar();
    MessageBar.init();
    expect(track().innerHTML).toContain('Welcome back, Pilot.');
  });

  it('always appends the two system-status lines', () => {
    mountBar();
    MessageBar.init();
    expect(track().innerHTML).toContain('All subsystems nominal');
    expect(track().innerHTML).toContain('standing by for mission assignments');
  });

  it('collects at most 6 notifications from State', () => {
    mountBar();
    const notifs = Array.from({ length: 8 }, (_, i) => ({ title: `notif-${i}`, message: 'm' }));
    State.set('notifications', notifs);
    MessageBar.init();
    const html = track().innerHTML;
    for (let i = 0; i < 6; i++) expect(html).toContain(`notif-${i}`);
    expect(html).not.toContain('notif-6');
    expect(html).not.toContain('notif-7');
  });

  it('uses the message when a notification has no title', () => {
    mountBar();
    State.set('notifications', [{ message: 'bare body only' }]);
    MessageBar.init();
    expect(track().innerHTML).toContain('bare body only');
  });

  it('maps a known notification type to its icon', () => {
    mountBar();
    State.set('notifications', [{ message: 'spend alert', type: 'budget_alert' }]);
    MessageBar.init();
    expect(track().innerHTML).toContain('#icon-dollar');
  });

  it('collects at most 5 audit-log entries, newest first', () => {
    mountBar();
    for (let i = 0; i < 7; i++) AuditLog.log('task_complete', { description: `audit-${i}` });
    MessageBar.init();
    const html = track().innerHTML;
    expect(html).toContain('audit-6'); // newest
    expect(html).toContain('audit-2'); // 5th newest
    expect(html).not.toContain('audit-1');
    expect(html).not.toContain('audit-0');
  });

  it('falls back to "<action> event" for an audit entry with no description', () => {
    mountBar();
    AuditLog.log('fleet_deployed', {});
    MessageBar.init();
    expect(track().innerHTML).toContain('fleet_deployed event');
  });

  it('collects at most 5 ActivityFeed events when the feed is present', () => {
    mountBar();
    globalThis.ActivityFeed = {
      getEvents: (n) => Array.from({ length: n }, (_, i) => ({
        description: `act-${i}`, type: 'agent', timestamp: BASE,
      })),
    };
    MessageBar.init();
    const html = track().innerHTML;
    expect(html).toContain('act-0');
    expect(html).toContain('act-4');
    // getEvents is asked for exactly 5; nothing beyond that is rendered.
    expect(html).not.toContain('act-5');
  });
});

describe('MessageBar ticker rendering', () => {
  it('duplicates the item list for seamless infinite scroll', () => {
    mountBar();
    State.set('user', { user_metadata: { display_name: 'Marvin' } });
    MessageBar.init();
    const hits = (track().innerHTML.match(/Welcome back, Marvin\./g) || []).length;
    expect(hits).toBe(2);
  });

  it('floors the animation duration at 30s for a short feed', () => {
    mountBar();
    MessageBar.init(); // welcome + 2 system = 3 messages → max(30, 24) = 30
    expect(track().style.animationDuration).toBe('30s');
  });

  it('scales the animation duration with the message count', () => {
    mountBar();
    State.set('notifications', Array.from({ length: 10 }, (_, i) => ({ message: `n${i}` })));
    MessageBar.init(); // welcome(1) + notifs(6) + system(2) = 9 → 9 * 8 = 72
    expect(track().style.animationDuration).toBe('72s');
  });
});

describe('MessageBar.push', () => {
  it('prepends a message into the ticker', () => {
    mountBar();
    MessageBar.init();
    MessageBar.push({ text: 'incoming transmission' });
    expect(track().innerHTML).toContain('incoming transmission');
  });

  it('ignores a push with no text', () => {
    mountBar();
    MessageBar.init();
    const before = track().querySelectorAll('.msg-bar-item').length;
    MessageBar.push(null);
    MessageBar.push({});
    MessageBar.push({ icon: '#icon-x' });
    expect(track().querySelectorAll('.msg-bar-item').length).toBe(before);
  });

  it('applies default route and icon when omitted', () => {
    mountBar();
    MessageBar.init();
    MessageBar.push({ text: 'defaulted message' });
    const item = track().querySelector('.msg-bar-item');
    expect(item.getAttribute('href')).toBe('#/alerts');
    expect(item.innerHTML).toContain('#icon-comms');
  });

  it('caps the buffer at 20 messages, dropping the oldest', () => {
    mountBar();
    MessageBar.init();
    for (let i = 0; i < 25; i++) MessageBar.push({ text: `cap-${i}` });
    const html = track().innerHTML;
    expect(html).toContain('cap-24'); // newest survives
    expect(html).toContain('cap-5');  // 20th-newest survives
    expect(html).not.toContain('cap-4'); // trimmed
    expect(html).not.toContain('cap-0'); // trimmed
  });

  it('does not throw when pushing before a bar is mounted', () => {
    expect(() => MessageBar.push({ text: 'no DOM yet' })).not.toThrow();
  });
});

describe('MessageBar toggle / expanded feed', () => {
  it('expands on toggle-button click and renders the feed', () => {
    mountBar();
    MessageBar.init();
    document.getElementById('msg-bar-toggle').click();
    expect(bar().classList.contains('expanded')).toBe(true);
    expect(document.getElementById('msg-bar-toggle').getAttribute('aria-expanded')).toBe('true');
    expect(feed().querySelectorAll('.msg-bar-feed-item').length).toBeGreaterThan(0);
  });

  it('collapses on a second toggle', () => {
    mountBar();
    MessageBar.init();
    const btn = document.getElementById('msg-bar-toggle');
    btn.click();
    btn.click();
    expect(bar().classList.contains('expanded')).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('caps the expanded feed at 12 items', () => {
    mountBar();
    // Each source self-caps (6 notifs + 5 audit), so draw from several to clear
    // 12 collected: welcome(1) + notifs(6) + audit(5) + system(2) = 14.
    State.set('notifications', Array.from({ length: 6 }, (_, i) => ({ message: `n${i}` })));
    for (let i = 0; i < 5; i++) AuditLog.log('task_complete', { description: `a${i}` });
    MessageBar.init();
    document.getElementById('msg-bar-toggle').click();
    expect(feed().querySelectorAll('.msg-bar-feed-item').length).toBe(12);
  });

  it('collapses when a feed item is clicked', () => {
    mountBar();
    MessageBar.init();
    const btn = document.getElementById('msg-bar-toggle');
    btn.click();
    const item = feed().querySelector('.msg-bar-feed-item');
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(bar().classList.contains('expanded')).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('re-renders the expanded feed (not the ticker) on push while expanded', () => {
    mountBar();
    MessageBar.init();
    document.getElementById('msg-bar-toggle').click();
    MessageBar.push({ text: 'live feed entry' });
    expect(feed().innerHTML).toContain('live feed entry');
  });
});

describe('MessageBar refresh + lifecycle', () => {
  it('re-renders when State notifications change', () => {
    mountBar();
    MessageBar.init();
    State.set('notifications', [{ message: 'state-driven update' }]);
    expect(track().innerHTML).toContain('state-driven update');
  });

  it('refreshes from sources on the 30s interval', () => {
    mountBar();
    MessageBar.init();
    expect(track().innerHTML).not.toContain('interval-only');
    AuditLog.log('task_complete', { description: 'interval-only' }); // does not notify the bar
    vi.advanceTimersByTime(30000);
    expect(track().innerHTML).toContain('interval-only');
  });

  it('stops refreshing after destroy()', () => {
    mountBar();
    MessageBar.init();
    MessageBar.destroy();
    AuditLog.log('task_complete', { description: 'post-destroy' });
    vi.advanceTimersByTime(60000);
    expect(track().innerHTML).not.toContain('post-destroy');
  });

  it('destroy() is safe to call without init and is idempotent', () => {
    expect(() => { MessageBar.destroy(); MessageBar.destroy(); }).not.toThrow();
  });
});
