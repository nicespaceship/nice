/**
 * Tests for the CommunityPublish UI helper (app/js/lib/community-publish.js).
 * Covers the DOM-free surface: isPublished, renderActionButton, and the
 * modal / confirm flows wired to the Stage B2 BlueprintStore helpers.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// jsdom is not configured globally for this project, so we install a tiny
// DOM stub before loading the module. Only the APIs CommunityPublish uses
// are stubbed; keeping this minimal avoids pulling in jsdom as a dep.
function installDomStub() {
  const elements = new Map();
  const makeEl = (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      className: '',
      id: '',
      innerHTML: '',
      _children: [],
      _listeners: {},
      _parent: null,
      classList: {
        _set: new Set(),
        add(c) { this._set.add(c); },
        remove(c) { this._set.delete(c); },
        contains(c) { return this._set.has(c); },
      },
      addEventListener(ev, fn) { (this._listeners[ev] ||= []).push(fn); },
      appendChild(child) { this._children.push(child); child._parent = this; return child; },
      querySelector(sel) {
        // Very small selector matcher: #id only
        if (sel.startsWith('#')) {
          const id = sel.slice(1);
          const found = (function find(node) {
            if (node.id === id) return node;
            for (const c of node._children || []) {
              const hit = find(c);
              if (hit) return hit;
            }
            return null;
          })(this);
          return found;
        }
        return null;
      },
      focus() {},
      cloneNode() { return makeEl(this.tagName.toLowerCase()); },
      get parentNode() { return this._parent; },
    };
    return el;
  };
  const doc = {
    body: makeEl('body'),
    createElement: (tag) => makeEl(tag),
    getElementById: (id) => elements.get(id) || null,
    contains(node) { return this.body._children.includes(node); },
  };
  globalThis.document = doc;
  globalThis.window = { confirm: () => true };
  globalThis.setTimeout = (fn) => { try { fn(); } catch {} };
  return { doc, elements };
}

installDomStub();

globalThis.Utils = { esc: (s) => String(s ?? '') };
globalThis.Notify = { _sent: [], send(args) { this._sent.push(args); } };

// Fresh BlueprintStore mock per test
let bpStoreMock;
globalThis.BlueprintStore = {
  publishToCommunity: (...args) => bpStoreMock.publish(...args),
  unpublishFromCommunity: (...args) => bpStoreMock.unpublish(...args),
};

// SB mock for isPublished lookups
let sbMock;
globalThis.SB = {
  get client() { return sbMock?.client; },
};

// Load the module under test
const { readFileSync } = await import('fs');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
const __dir = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(resolve(__dir, '../lib/community-publish.js'), 'utf-8')
  .replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
eval(code);

/** Build a mock SB.client whose marketplace_listings read returns the
 *  provided listing row (or null). All other tables resolve to null. */
function listingMock(listing) {
  return {
    client: {
      from(table) {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: table === 'marketplace_listings' ? listing : null }),
        };
      },
    },
  };
}

describe('CommunityPublish.getSubmissionState', () => {
  beforeEach(() => { Notify._sent = []; });

  it('returns the listing row for a submitted entity', async () => {
    sbMock = listingMock({ status: 'pending_review', review_notes: null, reviewed_at: null });
    const state = await CommunityPublish.getSubmissionState('agent-1');
    expect(state).toEqual({ status: 'pending_review', review_notes: null, reviewed_at: null });
  });

  it('returns null when no listing exists', async () => {
    sbMock = listingMock(null);
    expect(await CommunityPublish.getSubmissionState('agent-1')).toBeNull();
  });

  it('swallows errors and returns null', async () => {
    sbMock = {
      client: {
        from() {
          return {
            select() { return this; },
            eq() { return this; },
            maybeSingle: async () => { throw new Error('boom'); },
          };
        },
      },
    };
    expect(await CommunityPublish.getSubmissionState('agent-1')).toBeNull();
  });
});

describe('CommunityPublish.isPublished (back-compat)', () => {
  beforeEach(() => { Notify._sent = []; });

  it('returns true only when the listing status is published', async () => {
    sbMock = listingMock({ status: 'published' });
    expect(await CommunityPublish.isPublished('agent-1')).toBe(true);
  });

  it('returns false while the listing is pending review', async () => {
    sbMock = listingMock({ status: 'pending_review' });
    expect(await CommunityPublish.isPublished('agent-1')).toBe(false);
  });

  it('returns false when no listing exists', async () => {
    sbMock = listingMock(null);
    expect(await CommunityPublish.isPublished('agent-1')).toBe(false);
  });

  it('swallows errors and returns false (worst case: UNIQUE blocks the publish)', async () => {
    sbMock = {
      client: {
        from() {
          return {
            select() { return this; },
            eq() { return this; },
            maybeSingle: async () => { throw new Error('boom'); },
          };
        },
      },
    };
    expect(await CommunityPublish.isPublished('agent-1')).toBe(false);
  });

  it('returns false when SB is not connected', async () => {
    sbMock = null;
    expect(await CommunityPublish.isPublished('agent-1')).toBe(false);
  });
});

describe('CommunityPublish.renderActionButton', () => {
  it('renders Submit for review when no listing exists', () => {
    const html = CommunityPublish.renderActionButton(null);
    expect(html).toContain('community-publish');
    expect(html).toContain('Submit for review');
    expect(html).not.toContain('Unpublish');
    expect(html).not.toContain('disabled');
  });

  it('renders a withdraw button for pending_review', () => {
    const html = CommunityPublish.renderActionButton({ status: 'pending_review' });
    expect(html).toContain('community-withdraw');
    expect(html).toContain('Pending review');
  });

  it('renders Unpublish for published', () => {
    const html = CommunityPublish.renderActionButton({ status: 'published' });
    expect(html).toContain('community-unpublish');
    expect(html).toContain('Unpublish');
    expect(html).toContain('btn-danger');
  });

  it('renders Rejected with reason attribute', () => {
    const html = CommunityPublish.renderActionButton({
      status: 'rejected',
      review_notes: 'Contains trademarked names',
    });
    expect(html).toContain('community-rejected');
    expect(html).toContain('Rejected');
    expect(html).toContain('Contains trademarked names');
  });

  it('renders a disabled button for flagged listings', () => {
    const html = CommunityPublish.renderActionButton({ status: 'flagged' });
    expect(html).toContain('Under moderator review');
    expect(html).toContain('disabled');
  });

  it('back-compat: boolean true renders Unpublish, false renders Submit', () => {
    expect(CommunityPublish.renderActionButton(true)).toContain('Unpublish');
    expect(CommunityPublish.renderActionButton(false)).toContain('Submit for review');
  });

  it('unknown statuses fall back to Submit for review', () => {
    const html = CommunityPublish.renderActionButton({ status: 'unknown-future-state' });
    expect(html).toContain('community-publish');
    expect(html).toContain('Submit for review');
  });
});

describe('CommunityPublish.confirmUnpublish', () => {
  beforeEach(() => { Notify._sent = []; });

  it('calls BlueprintStore.unpublishFromCommunity and fires onSuccess', async () => {
    bpStoreMock = {
      unpublish: vi.fn(async () => ({ ok: true })),
    };
    globalThis.window.confirm = () => true;
    const onSuccess = vi.fn();

    CommunityPublish.confirmUnpublish(
      { type: 'agent', id: 'agent-1', name: 'Research Bot' },
      { onSuccess }
    );
    // Fire the microtask queue so the async delete settles.
    await new Promise(r => setTimeout(r, 0));

    expect(bpStoreMock.unpublish).toHaveBeenCalledWith('agent-1');
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(Notify._sent[0].title).toBe('Unpublished');
  });

  it('does nothing when the user cancels the confirm prompt', async () => {
    bpStoreMock = { unpublish: vi.fn() };
    globalThis.window.confirm = () => false;
    const onSuccess = vi.fn();

    CommunityPublish.confirmUnpublish(
      { type: 'agent', id: 'agent-1', name: 'Bot' },
      { onSuccess }
    );
    await new Promise(r => setTimeout(r, 0));

    expect(bpStoreMock.unpublish).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('surfaces errors via Notify when unpublish fails', async () => {
    bpStoreMock = {
      unpublish: vi.fn(async () => { throw new Error('network dead'); }),
    };
    globalThis.window.confirm = () => true;

    CommunityPublish.confirmUnpublish(
      { type: 'agent', id: 'agent-1', name: 'Bot' },
      { onSuccess: () => {} }
    );
    await new Promise(r => setTimeout(r, 0));

    const errNotify = Notify._sent.find(n => n.title === 'Unpublish failed');
    expect(errNotify).toBeDefined();
    expect(errNotify.type).toBe('agent_error');
  });

  it('bails early on missing entity id', () => {
    bpStoreMock = { unpublish: vi.fn() };
    globalThis.window.confirm = () => true;
    CommunityPublish.confirmUnpublish(null);
    CommunityPublish.confirmUnpublish({ id: '' });
    expect(bpStoreMock.unpublish).not.toHaveBeenCalled();
  });
});
