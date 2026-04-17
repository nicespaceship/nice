/**
 * Tests for publishToCommunity / unpublishFromCommunity — the Stage B2
 * action helpers that hoist a user-built row in user_agents or
 * user_spaceships into a community blueprints snapshot + listing.
 *
 * We mock SB.client's from() with a small in-memory table router so we
 * can assert the exact INSERT payloads (field hoisting, ship agent-ID
 * stripping, rollback semantics) without touching Supabase.
 */
import { describe, it, expect, beforeEach } from 'vitest';

globalThis.BlueprintsView = {
  SEED: [{ id: 'sa1', name: 'Seed', rarity: 'Common' }],
  SPACESHIP_SEED: [],
};

const { readFileSync } = await import('fs');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
const __dir = dirname(fileURLToPath(import.meta.url));
let code = readFileSync(resolve(__dir, '../lib/blueprint-store.js'), 'utf-8');
code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
eval(code);

/**
 * Chainable PostgREST-shaped mock. Records every insert/delete and routes
 * reads to whatever the per-test `readers` map returns.
 *
 *   calls.inserts  — [{ table, payload }]
 *   calls.deletes  — [{ table, filters }]
 *   readers        — { [table]: (filters) => data | null }
 */
function makeMock({ readers = {}, insertErrors = {} } = {}) {
  const calls = { inserts: [], deletes: [] };
  function chain(table) {
    const state = { filters: {} };
    const api = {
      select() { return api; },
      eq(col, val) { state.filters[col] = val; return api; },
      maybeSingle() {
        const reader = readers[table];
        const data = reader ? reader({ ...state.filters }) : null;
        return Promise.resolve({ data, error: null });
      },
      insert(payload) {
        calls.inserts.push({ table, payload });
        const err = insertErrors[table];
        if (err) return {
          select() { return { maybeSingle: () => Promise.resolve({ data: null, error: err }) }; },
        };
        return {
          select() {
            return { maybeSingle: () => Promise.resolve({ data: { id: payload.id || 'generated-id', ...payload }, error: null }) };
          },
        };
      },
      delete() {
        const delApi = {
          _filters: {},
          eq(col, val) { this._filters[col] = val; return this; },
          then(resolve) { calls.deletes.push({ table, filters: { ...this._filters } }); resolve({ error: null }); },
        };
        return delApi;
      },
    };
    return api;
  }
  return {
    calls,
    client: { from: chain },
  };
}

describe('BlueprintStore.publishToCommunity', () => {
  beforeEach(() => {
    globalThis.State._reset();
    globalThis.State.set('user', { id: 'user-A' });
  });

  it('rejects unauthenticated callers before any network write', async () => {
    globalThis.State._reset();
    const mock = makeMock();
    globalThis.SB = mock;

    await expect(BlueprintStore.publishToCommunity({ type: 'agent', id: 'agent-1' }))
      .rejects.toThrow('Sign in to publish');
    expect(mock.calls.inserts.length).toBe(0);
  });

  it('rejects when the source row is owned by someone else', async () => {
    const mock = makeMock({
      readers: {
        // ownership filter { id: 'agent-1', user_id: 'user-A' } returns nothing
        user_agents: () => null,
      },
    });
    globalThis.SB = mock;

    await expect(BlueprintStore.publishToCommunity({ type: 'agent', id: 'agent-1' }))
      .rejects.toThrow('only publish things you created');
    expect(mock.calls.inserts.length).toBe(0);
  });

  it('rejects re-publish attempts with a friendly error', async () => {
    const mock = makeMock({
      readers: {
        user_agents: () => ({ id: 'agent-1', name: 'A', user_id: 'user-A', config: {}, rarity: 'Common' }),
        blueprints: () => ({ id: 'agent-1' }), // already in community
      },
    });
    globalThis.SB = mock;

    await expect(BlueprintStore.publishToCommunity({ type: 'agent', id: 'agent-1' }))
      .rejects.toThrow('Already published');
    expect(mock.calls.inserts.length).toBe(0);
  });

  it('hoists config fields and writes both rows for an agent publish', async () => {
    const mock = makeMock({
      readers: {
        user_agents: () => ({
          id: 'agent-uuid-1',
          name: 'Research Bot',
          user_id: 'user-A',
          category: 'Research',
          rarity: 'Rare',
          config: {
            role: 'Research',
            description: 'Does research',
            flavor: 'Fast and clean',
            tags: ['research', 'web'],
            tools: ['browse', 'search'],
            temperature: 0.7,
            _guest: true, // should be stripped
          },
        }),
        blueprints: () => null, // not already published
      },
    });
    globalThis.SB = mock;

    const result = await BlueprintStore.publishToCommunity(
      { type: 'agent', id: 'agent-uuid-1' },
      { title: 'Custom Title', tags: ['curated'] }
    );

    // Blueprint INSERT shape
    const bpInsert = mock.calls.inserts.find(c => c.table === 'blueprints');
    expect(bpInsert).toBeDefined();
    expect(bpInsert.payload.id).toBe('agent-uuid-1');
    expect(bpInsert.payload.type).toBe('agent');
    expect(bpInsert.payload.name).toBe('Custom Title');
    expect(bpInsert.payload.description).toBe('Does research');
    expect(bpInsert.payload.flavor).toBe('Fast and clean');
    expect(bpInsert.payload.tags).toEqual(['curated']);
    expect(bpInsert.payload.scope).toBe('community');
    expect(bpInsert.payload.is_public).toBe(true);
    expect(bpInsert.payload.creator_id).toBe('user-A');
    expect(bpInsert.payload.rarity).toBe('Rare');
    expect(bpInsert.payload.category).toBe('Research');
    // config snapshot: hoisted fields gone, internals gone, runtime bits kept
    expect(bpInsert.payload.config.description).toBeUndefined();
    expect(bpInsert.payload.config.flavor).toBeUndefined();
    expect(bpInsert.payload.config.tags).toBeUndefined();
    expect(bpInsert.payload.config._guest).toBeUndefined();
    expect(bpInsert.payload.config.tools).toEqual(['browse', 'search']);
    expect(bpInsert.payload.config.temperature).toBe(0.7);

    // Listing INSERT shape
    const listingInsert = mock.calls.inserts.find(c => c.table === 'marketplace_listings');
    expect(listingInsert).toBeDefined();
    expect(listingInsert.payload.blueprint_id).toBe('agent-uuid-1');
    expect(listingInsert.payload.author_id).toBe('user-A');
    expect(listingInsert.payload.title).toBe('Custom Title');
    expect(listingInsert.payload.category).toBe('agent');
    // Submissions enter the queue as pending_review — the reviewer
    // pipeline is what flips them to 'published' or 'rejected'.
    expect(listingInsert.payload.status).toBe('pending_review');
    expect(listingInsert.payload.tags).toEqual(['curated']);

    expect(result.blueprint).toBeDefined();
    expect(result.listing).toBeDefined();
  });

  it('strips user-specific agent IDs from ship slot_assignments', async () => {
    const mock = makeMock({
      readers: {
        user_spaceships: () => ({
          id: 'ship-uuid-1',
          name: 'My Flagship',
          user_id: 'user-A',
          category: 'Analytics',
          rarity: 'Epic',
          config: {
            description: 'Data ops ship',
            tags: ['data'],
            slot_assignments: {
              0: 'agent-private-uuid-aaa',
              1: 'agent-private-uuid-bbb',
              2: 'agent-private-uuid-ccc',
            },
            stats: { crew: '3', slots: '6' },
            caps: ['Analytics operations'],
          },
        }),
        blueprints: () => null,
      },
    });
    globalThis.SB = mock;

    await BlueprintStore.publishToCommunity({ type: 'spaceship', id: 'ship-uuid-1' });

    const bpInsert = mock.calls.inserts.find(c => c.table === 'blueprints');
    expect(bpInsert.payload.type).toBe('spaceship');
    // Agent UUIDs stripped
    expect(bpInsert.payload.config.slot_assignments).toBeUndefined();
    // Slot shape preserved
    expect(bpInsert.payload.config.slot_placeholders).toEqual([
      { slot: 0 }, { slot: 1 }, { slot: 2 },
    ]);
    // Non-identifying ship data preserved
    expect(bpInsert.payload.config.stats).toEqual({ crew: '3', slots: '6' });
    expect(bpInsert.payload.config.caps).toEqual(['Analytics operations']);
    // Verify no private agent UUIDs leaked anywhere in the blueprint payload
    const serialized = JSON.stringify(bpInsert.payload);
    expect(serialized).not.toContain('agent-private-uuid-aaa');
    expect(serialized).not.toContain('agent-private-uuid-bbb');
    expect(serialized).not.toContain('agent-private-uuid-ccc');
  });

  it('rolls back the blueprint insert if the listing insert fails', async () => {
    const mock = makeMock({
      readers: {
        user_agents: () => ({ id: 'agent-1', name: 'A', user_id: 'user-A', rarity: 'Common', config: {} }),
        blueprints: () => null,
      },
      insertErrors: {
        marketplace_listings: new Error('simulated listing failure'),
      },
    });
    globalThis.SB = mock;

    await expect(BlueprintStore.publishToCommunity({ type: 'agent', id: 'agent-1' }))
      .rejects.toThrow('simulated listing failure');

    // Both inserts attempted, blueprint rollback issued
    expect(mock.calls.inserts.filter(c => c.table === 'blueprints').length).toBe(1);
    expect(mock.calls.inserts.filter(c => c.table === 'marketplace_listings').length).toBe(1);
    const bpDelete = mock.calls.deletes.find(c => c.table === 'blueprints');
    expect(bpDelete).toBeDefined();
    expect(bpDelete.filters.id).toBe('agent-1');
  });

  it('truncates over-long title, description, and flavor', async () => {
    const longTitle = 'T'.repeat(200);
    const longDesc  = 'D'.repeat(5000);
    const longFlavor = 'F'.repeat(500);
    const mock = makeMock({
      readers: {
        user_agents: () => ({
          id: 'agent-1', name: longTitle, user_id: 'user-A', rarity: 'Common',
          config: { description: longDesc, flavor: longFlavor, tags: [] },
        }),
        blueprints: () => null,
      },
    });
    globalThis.SB = mock;

    await BlueprintStore.publishToCommunity({ type: 'agent', id: 'agent-1' });

    const bpInsert = mock.calls.inserts.find(c => c.table === 'blueprints');
    expect(bpInsert.payload.name.length).toBe(80);
    expect(bpInsert.payload.description.length).toBe(2000);
    expect(bpInsert.payload.flavor.length).toBe(200);
    const listingInsert = mock.calls.inserts.find(c => c.table === 'marketplace_listings');
    expect(listingInsert.payload.description.length).toBe(400);
  });
});

describe('BlueprintStore.unpublishFromCommunity', () => {
  beforeEach(() => {
    globalThis.State._reset();
    globalThis.State.set('user', { id: 'user-A' });
  });

  it('deletes both the listing and the community blueprint, scoped to the caller', async () => {
    const mock = makeMock();
    globalThis.SB = mock;

    await BlueprintStore.unpublishFromCommunity('agent-uuid-1');

    const listingDel = mock.calls.deletes.find(c => c.table === 'marketplace_listings');
    expect(listingDel.filters).toEqual({ blueprint_id: 'agent-uuid-1', author_id: 'user-A' });

    const bpDel = mock.calls.deletes.find(c => c.table === 'blueprints');
    expect(bpDel.filters).toEqual({ id: 'agent-uuid-1', scope: 'community', creator_id: 'user-A' });
  });

  it('throws on unauthenticated calls', async () => {
    globalThis.State._reset();
    globalThis.SB = makeMock();

    await expect(BlueprintStore.unpublishFromCommunity('bp-1'))
      .rejects.toThrow('Sign in to unpublish');
  });
});
