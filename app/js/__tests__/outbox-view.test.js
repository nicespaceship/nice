/**
 * OutboxView (#/outbox): results waiting for the user's OK, approved work
 * and rejected work, as a list beside the open item, plus a week view.
 * Runs on the real ContentQueue (setup.js) so approvals take the same path
 * as the app: runs in review go to MissionRunner, local drafts don't.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
function load(rel) {
  let code = readFileSync(resolve(__dir, '..', rel), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

globalThis.Blueprints = { getUserShips: () => [{ id: 'ship-1', name: 'Sunrise Bakery' }] };
globalThis.Notify = { send: vi.fn() };
globalThis.NICE = { openModal: vi.fn() };
globalThis.MissionRunner = {
  isResumableGate: (run) => !!run.gate,
  approveRun: vi.fn(async () => ({ resumed: false, persisted: true })),
  rejectRun: vi.fn(async () => ({ persisted: true })),
};

load('views/outbox.js');

const realSB = globalThis.SB;
const now = new Date();
const iso = (daysAgo) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 10).toISOString();
const ITEMS = () => [
  { id: 'run-1', status: 'review', approval_status: 'draft', content_type: 'email', title: 'Thursday pick-up emails', agent_name: 'Front Desk', spaceship_id: 'ship-1', result: 'Hi Priya, your order is ready.', created_at: iso(0) },
  { id: 'run-2', status: 'review', approval_status: 'draft', content_type: 'report', title: 'Weekly sales', agent_name: 'Books', result: '**Up 4%**', created_at: iso(0), gate: true },
  { id: 'draft-1', approval_status: 'approved', content_type: 'social', title: 'Lemon tart post', agent_name: 'Social', result: 'Lemon tarts are back.', created_at: iso(1), reviewed_at: iso(0) },
  { id: 'draft-2', approval_status: 'rejected', content_type: 'social', title: 'Old promo', result: 'No.', created_at: iso(2) },
];

const flush = () => new Promise(r => setTimeout(r, 0));
let el;

function rows() { return [...el.querySelectorAll('.ob-row b')].map(b => b.textContent); }
function click(sel) { el.querySelector(sel).click(); }

beforeEach(() => {
  OutboxView.destroy();
  globalThis.SB = { ...realSB, isReady: () => false };
  vi.clearAllMocks();
  vi.spyOn(ContentQueue, 'load').mockImplementation(async () => State.get('content-queue') || []);
  State.set('user', { id: 'u1' });
  State.set('content-queue', ITEMS());
  history.replaceState(null, '', '#/outbox');
  document.body.innerHTML = '<div id="app-view"></div>';
  el = document.getElementById('app-view');
});
afterEach(() => {
  vi.restoreAllMocks();
  globalThis.SB = realSB;
});

describe('OutboxView', () => {
  it('asks a signed-out visitor to sign in', () => {
    State.set('user', null);
    OutboxView.render(el);
    expect(el.querySelector('.ob-signin')).not.toBeNull();
    expect(el.querySelector('.ob-row')).toBeNull();
    click('[data-ob="signin"]');
    expect(NICE.openModal).toHaveBeenCalledWith('modal-auth');
  });

  it('waits for sign-in to resolve, then keeps a linked item until the queue loads', async () => {
    State.set('user', undefined);
    State.set('content-queue', []);
    history.replaceState(null, '', '#/outbox?item=run-2');
    OutboxView.render(el);
    expect(el.querySelector('.ob-signin')).toBeNull();
    expect(el.querySelector('.ob-empty').textContent).toBe('Loading…');
    ContentQueue.load.mockImplementation(async () => { State.set('content-queue', ITEMS()); return ITEMS(); });
    State.set('user', { id: 'u1' });
    await flush();
    expect(el.querySelector('.ob-detail').dataset.id).toBe('run-2');
    expect(location.hash).toBe('#/outbox?item=run-2');
  });

  it('lists what needs the user, counts every tab and opens the first item', async () => {
    OutboxView.render(el);
    await flush();
    expect(rows()).toEqual(['Thursday pick-up emails', 'Weekly sales']);
    const tabs = [...el.querySelectorAll('.ob-tab')].map(t => t.textContent.trim());
    expect(tabs).toEqual(['Needs you2', 'Approved1', 'Rejected1']);
    const detail = el.querySelector('.ob-detail');
    expect(detail.dataset.id).toBe('run-1');
    expect(detail.querySelector('.ob-byline').textContent).toBe('Email · Front Desk · Sunrise Bakery');
    expect(detail.querySelector('.ob-doc').textContent).toContain('your order is ready');
    expect(detail.querySelector('.ob-run-link').getAttribute('href')).toBe('#/missions/run-1');
  });

  it('opens a row and records it in the address', async () => {
    OutboxView.render(el);
    await flush();
    el.querySelectorAll('.ob-row')[1].click();
    expect(el.querySelector('.ob-detail').dataset.id).toBe('run-2');
    expect(location.hash).toBe('#/outbox?item=run-2');
    expect(el.querySelectorAll('.ob-row')[1].getAttribute('aria-current')).toBe('true');
  });

  it('says when approving lets a paused crew continue', async () => {
    history.replaceState(null, '', '#/outbox?item=run-2');
    OutboxView.render(el);
    await flush();
    expect(el.querySelector('[data-ob="approve"]').textContent).toBe('Approve and continue');
    expect(el.querySelector('.ob-note')).not.toBeNull();
  });

  it('approves a run through MissionRunner and moves on to the next one', async () => {
    OutboxView.render(el);
    await flush();
    click('[data-ob="approve"]');
    await flush();
    expect(MissionRunner.approveRun).toHaveBeenCalledWith(expect.objectContaining({ id: 'run-1' }));
    expect(rows()).toEqual(['Weekly sales']);
    expect(el.querySelector('.ob-detail').dataset.id).toBe('run-2');
    expect(Notify.send).toHaveBeenCalledWith(expect.objectContaining({ title: 'Approved' }));
  });

  it('keeps the item waiting and says so when a rejection fails to save', async () => {
    MissionRunner.rejectRun.mockResolvedValueOnce({ persisted: false });
    OutboxView.render(el);
    await flush();
    click('[data-ob="reject"]');
    await flush();
    expect(Notify.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    expect(rows()).toEqual(['Thursday pick-up emails', 'Weekly sales']);
  });

  it('edits the text in place and saves it', async () => {
    OutboxView.render(el);
    await flush();
    click('[data-ob="edit"]');
    const box = el.querySelector('#ob-edit');
    expect(box.value).toBe('Hi Priya, your order is ready.');
    box.value = 'Hi Priya, see you Thursday.';
    click('[data-ob="save"]');
    await flush();
    expect(el.querySelector('#ob-edit')).toBeNull();
    expect(el.querySelector('.ob-doc').textContent).toContain('see you Thursday');
    expect(el.querySelector('.ob-meta').textContent).toContain('Edited by you');
  });

  it('offers copy on approved work and explains publishing is not live yet', async () => {
    history.replaceState(null, '', '#/outbox?tab=approved');
    OutboxView.render(el);
    await flush();
    expect(rows()).toEqual(['Lemon tart post']);
    expect(el.querySelector('.ob-acts .btn-primary').dataset.ob).toBe('copy');
    expect(el.querySelector('[data-ob="publish"]')).toBeNull();
    expect(el.querySelector('.ob-hint').textContent).toContain('arrives with the social integrations');
    expect(el.querySelector('[data-ob="export"]')).not.toBeNull();
    // Local drafts have no run to open.
    expect(el.querySelector('.ob-run-link')).toBeNull();
  });

  it('filters by type once there is more than one kind of item', async () => {
    OutboxView.render(el);
    await flush();
    const types = [...el.querySelectorAll('.ob-type')].map(b => b.textContent);
    expect(types).toEqual(['All', 'Social posts', 'Emails', 'Reports']);
    el.querySelector('.ob-type[data-type="report"]').click();
    expect(rows()).toEqual(['Weekly sales']);
  });

  it('shows an empty state for a tab with nothing in it', async () => {
    State.set('content-queue', []);
    OutboxView.render(el);
    await flush();
    expect(el.querySelector('.ob-empty b').textContent).toBe('Nothing needs you right now');
  });

  it('lays the week out by day and saves a drag to another day', async () => {
    const reschedule = vi.spyOn(ContentQueue, 'reschedule').mockResolvedValue();
    history.replaceState(null, '', '#/outbox?view=week');
    OutboxView.render(el);
    await flush();
    expect(el.querySelectorAll('.ob-day')).toHaveLength(7);
    const today = el.querySelector('.ob-day.is-today');
    expect([...today.querySelectorAll('.ob-pill')].map(p => p.dataset.id)).toEqual(['run-1', 'run-2']);

    const target = [...el.querySelectorAll('.ob-day')].find(d => d !== today);
    const data = { value: '', setData(_t, v) { this.value = v; }, getData() { return this.value; } };
    const drag = (type, node) => {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      ev.dataTransfer = data;
      node.dispatchEvent(ev);
    };
    drag('dragstart', today.querySelector('.ob-pill'));
    drag('dragover', target);
    expect(target.classList.contains('is-over')).toBe(true);
    drag('drop', target);
    const [y, m, d] = target.dataset.day.split('-').map(Number);
    expect(reschedule).toHaveBeenCalledWith('run-1', new Date(y, m - 1, d, 9).toISOString());
  });

  it('keeps quotes in a title inside its attribute', async () => {
    const title = 'x" onmouseover="window.__pwned=1" data-x="';
    State.set('content-queue', [{ id: 'evil', status: 'review', approval_status: 'draft', title, result: 'Hi' }]);
    OutboxView.render(el);
    await flush();
    const detail = el.querySelector('.ob-detail');
    expect(detail.hasAttribute('onmouseover')).toBe(false);
    expect(detail.getAttribute('aria-label')).toBe(title);
  });

  it('only treats a run still in review as a paused crew', async () => {
    State.set('content-queue', [{ id: 'run-x', status: 'completed', approval_status: 'draft', gate: true, title: 'Stale gate', result: 'x' }]);
    OutboxView.render(el);
    await flush();
    expect(el.querySelector('[data-ob="approve"]').textContent).toBe('Approve');
    expect(el.querySelector('.ob-note')).toBeNull();
  });

  it('moves on as soon as a paused crew is approved, without offering Edit', async () => {
    let finish;
    MissionRunner.isResumableGate = (run) => !!run.gate;
    MissionRunner.approveRun.mockImplementationOnce(() => new Promise(r => { finish = r; }));
    history.replaceState(null, '', '#/outbox?item=run-2');
    OutboxView.render(el);
    await flush();
    expect(el.querySelector('[data-ob="edit"]')).toBeNull();
    click('[data-ob="approve"]');
    await flush();
    expect(rows()).toEqual(['Thursday pick-up emails']);
    expect(el.querySelector('.ob-detail').dataset.id).toBe('run-1');
    finish({ resumed: true, persisted: true });
  });

  it('leaves the address alone if the user moved on before an approval finished', async () => {
    let finish;
    MissionRunner.approveRun.mockImplementationOnce(() => new Promise(r => { finish = r; }));
    OutboxView.render(el);
    await flush();
    click('[data-ob="approve"]');
    await flush();
    OutboxView.destroy();
    history.replaceState(null, '', '#/chat');
    finish({ resumed: false, persisted: true });
    await flush();
    expect(location.hash).toBe('#/chat');
  });

  it('moves an item to another day from its date field', async () => {
    const reschedule = vi.spyOn(ContentQueue, 'reschedule').mockResolvedValue();
    OutboxView.render(el);
    await flush();
    const field = el.querySelector('#ob-day');
    field.value = '2026-11-03';
    field.dispatchEvent(new Event('change', { bubbles: true }));
    expect(reschedule).toHaveBeenCalledWith('run-1', new Date(2026, 10, 3, 9).toISOString());
  });

  it('labels weeks inside one month, across months and across years', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const label = async (when) => {
      vi.setSystemTime(when);
      history.replaceState(null, '', '#/outbox?view=week');
      OutboxView.render(el);
      await flush();
      return el.querySelector('.ob-week-nav h2').textContent;
    };
    expect(await label(new Date(2026, 10, 4, 12))).toBe('Nov 2 – 8, 2026');
    expect(await label(new Date(2026, 9, 28, 12))).toBe('Oct 26 – Nov 1, 2026');
    expect(await label(new Date(2026, 11, 30, 12))).toBe('Dec 28, 2026 – Jan 3, 2027');
    vi.useRealTimers();
  });

  it('gives an opened item its own history entry on a phone', async () => {
    window.matchMedia = () => ({ matches: false });
    const push = vi.spyOn(history, 'pushState');
    const back = vi.spyOn(history, 'back').mockImplementation(() => {});
    OutboxView.render(el);
    await flush();
    expect(el.querySelector('.ob-detail')).toBeNull();
    el.querySelectorAll('.ob-row')[1].click();
    expect(push).toHaveBeenCalledWith(null, '', '#/outbox?item=run-2');
    expect(el.querySelector('.ob-layout').classList.contains('has-sel')).toBe(true);
    click('[data-ob="back"]');
    expect(back).toHaveBeenCalled();
    delete window.matchMedia;
  });

  it('opens an item from the week in the list', async () => {
    history.replaceState(null, '', '#/outbox?view=week');
    OutboxView.render(el);
    await flush();
    el.querySelector('.ob-pill[data-id="run-2"]').click();
    expect(el.querySelector('.ob-week')).toBeNull();
    expect(el.querySelector('.ob-detail').dataset.id).toBe('run-2');
  });
});
