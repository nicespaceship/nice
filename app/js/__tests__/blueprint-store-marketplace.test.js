/**
 * Verifies that the marketplace action helpers in blueprint-store.js talk
 * to Supabase via the right server-authoritative paths after Stage B1:
 *   - rateMarketplaceListing upserts into marketplace_reviews and re-reads
 *     the listing aggregate (no client-side math anymore — a DB trigger
 *     maintains rating / rating_count).
 *   - incrementMarketplaceDownloads calls the increment_listing_download
 *     RPC instead of fetch-then-write.
 */
import { describe, it, expect, beforeEach } from 'vitest';

globalThis.BlueprintsView = {
  SEED: [{ id: 'sa1', name: 'Test', rarity: 'Common' }],
  SPACESHIP_SEED: [],
};

// Load BlueprintStore into globals
const { readFileSync } = await import('fs');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
const __dir = dirname(fileURLToPath(import.meta.url));
let code = readFileSync(resolve(__dir, '../lib/blueprint-store.js'), 'utf-8');
code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
eval(code);

/** Build a fresh SB.client mock that records every call. */
function makeMockClient({ listing, aggregateAfter } = {}) {
  const calls = { from: [], rpc: [] };
  return {
    calls,
    client: {
      from(table) {
        const chain = {
          _table: table,
          _filters: {},
          _payload: null,
          _opts: null,
          _mode: null,
          select(_cols) { this._mode = this._mode || 'select'; return this; },
          eq(col, val) { this._filters[col] = val; return this; },
          upsert(payload, opts) {
            calls.from.push({ table, op: 'upsert', payload, opts });
            return { error: null };
          },
          maybeSingle() {
            calls.from.push({ table, op: 'select', filters: { ...this._filters } });
            if (table === 'marketplace_listings' && this._filters.id === 'L1') {
              // First read (author check), then a second read post-upsert
              const isSecond = calls.from.filter(c => c.table === 'marketplace_listings').length >= 2;
              return { data: isSecond ? aggregateAfter : listing, error: null };
            }
            return { data: null, error: null };
          },
        };
        return chain;
      },
      rpc(fn, args) {
        calls.rpc.push({ fn, args });
        return Promise.resolve({ data: 1, error: null });
      },
    },
  };
}

describe('BlueprintStore — marketplace action helpers', () => {
  beforeEach(() => {
    globalThis.State._reset();
    globalThis.State.set('user', { id: 'user-1' });
  });

  it('rateMarketplaceListing upserts the review and re-reads the aggregate', async () => {
    const mock = makeMockClient({
      listing: { id: 'L1', author_id: 'other-author' },
      aggregateAfter: { rating: 4.5, rating_count: 2 },
    });
    globalThis.SB = mock;

    const result = await BlueprintStore.rateMarketplaceListing('L1', 5);

    expect(result).toEqual({ rating: 4.5, rating_count: 2 });

    // Exactly one upsert, and it hit marketplace_reviews with onConflict
    const upserts = mock.calls.from.filter(c => c.op === 'upsert');
    expect(upserts.length).toBe(1);
    expect(upserts[0].table).toBe('marketplace_reviews');
    expect(upserts[0].payload).toEqual({ listing_id: 'L1', user_id: 'user-1', rating: 5 });
    expect(upserts[0].opts).toEqual({ onConflict: 'listing_id,user_id' });

    // Two listing reads: one before (author check), one after (aggregate)
    const listingReads = mock.calls.from.filter(c => c.table === 'marketplace_listings');
    expect(listingReads.length).toBe(2);

    // No client-side update to listings — aggregate is server-maintained now
    const listingUpserts = mock.calls.from.filter(c => c.table === 'marketplace_listings' && c.op === 'upsert');
    expect(listingUpserts.length).toBe(0);
  });

  it('rateMarketplaceListing rejects self-review before any network write', async () => {
    const mock = makeMockClient({
      listing: { id: 'L1', author_id: 'user-1' }, // author = same user
    });
    globalThis.SB = mock;

    await expect(BlueprintStore.rateMarketplaceListing('L1', 5))
      .rejects.toThrow("can't rate your own listing");

    const upserts = mock.calls.from.filter(c => c.op === 'upsert');
    expect(upserts.length).toBe(0); // no review written
  });

  it('rateMarketplaceListing throws if unauthenticated', async () => {
    globalThis.State._reset(); // no user
    globalThis.SB = makeMockClient();

    await expect(BlueprintStore.rateMarketplaceListing('L1', 5))
      .rejects.toThrow('Sign in to rate');
  });

  it('incrementMarketplaceDownloads calls the RPC, not fetch-then-write', async () => {
    const mock = makeMockClient();
    globalThis.SB = mock;

    await BlueprintStore.incrementMarketplaceDownloads('L1');

    expect(mock.calls.rpc).toEqual([
      { fn: 'increment_listing_download', args: { p_listing_id: 'L1' } },
    ]);
    // Zero fetches or writes to marketplace_listings
    expect(mock.calls.from.length).toBe(0);
  });

  it('incrementMarketplaceDownloads swallows errors (fire-and-forget)', async () => {
    globalThis.SB = {
      client: {
        rpc: () => Promise.reject(new Error('network dead')),
      },
    };
    // Must not throw
    await expect(BlueprintStore.incrementMarketplaceDownloads('L1')).resolves.toBeUndefined();
  });
});
