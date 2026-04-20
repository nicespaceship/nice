/**
 * Tests for the Stage B4 moderation helpers:
 *   - reportCommunityBlueprint writes one row to community_reports,
 *     validates reason, and translates the two common failure codes
 *     (UNIQUE violation / RLS rejection) into friendly messages.
 *   - publishToCommunity now calls the check_publish_rate_limit RPC
 *     and throws before touching the DB when the caller is out of
 *     budget.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

globalThis.BlueprintsView = {
  SEED: [{ id: 'sa1', name: 'Seed', rarity: 'Common' }],
  SPACESHIP_SEED: [],
};

const { readFileSync } = await import('fs');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
const __dir = dirname(fileURLToPath(import.meta.url));
let code = readFileSync(resolve(__dir, '../lib/blueprints.js'), 'utf-8');
code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
eval(code);

/** PostgREST-shape mock: reader map + insert recording + configurable RPC. */
function makeMock({ readers = {}, insertErrors = {}, rpcResponse = {} } = {}) {
  const calls = { inserts: [], rpc: [], deletes: [] };
  return {
    calls,
    client: {
      from(table) {
        const state = { filters: {} };
        const api = {
          select() { return api; },
          eq(col, val) { state.filters[col] = val; return api; },
          maybeSingle() {
            const reader = readers[table];
            return Promise.resolve({ data: reader ? reader({ ...state.filters }) : null, error: null });
          },
          insert(payload) {
            calls.inserts.push({ table, payload });
            const err = insertErrors[table];
            // Return a thenable so both `await insert()` and
            // `insert().select().maybeSingle()` shapes resolve correctly.
            const data = err ? null : Object.assign({ id: 'rep-1' }, payload);
            const result = { data, error: err || null };
            const thenable = Promise.resolve(result);
            thenable.select = () => ({ maybeSingle: () => Promise.resolve(result) });
            return thenable;
          },
          delete() {
            const delApi = { _filters: {}, eq(col, val) { this._filters[col] = val; return this; }, then(r) { calls.deletes.push({ table, filters: { ...this._filters } }); r({ error: null }); } };
            return delApi;
          },
        };
        return api;
      },
      rpc(fn, args) {
        calls.rpc.push({ fn, args });
        if (rpcResponse[fn] !== undefined) {
          return Promise.resolve({ data: rpcResponse[fn], error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
    },
  };
}

describe('Blueprints.reportCommunityBlueprint', () => {
  beforeEach(() => {
    globalThis.State._reset();
    globalThis.State.set('user', { id: 'reporter-X' });
  });

  it('rejects unauthenticated callers', async () => {
    globalThis.State._reset();
    globalThis.SB = makeMock();
    await expect(Blueprints.reportCommunityBlueprint('bp-1', { reason: 'spam' }))
      .rejects.toThrow('Sign in to report');
  });

  it('rejects unknown reasons', async () => {
    globalThis.SB = makeMock();
    await expect(Blueprints.reportCommunityBlueprint('bp-1', { reason: 'whatever' }))
      .rejects.toThrow('Pick a reason');
    await expect(Blueprints.reportCommunityBlueprint('bp-1', {}))
      .rejects.toThrow('Pick a reason');
  });

  it('writes one community_reports row with the expected shape', async () => {
    const mock = makeMock();
    globalThis.SB = mock;

    const result = await Blueprints.reportCommunityBlueprint('bp-1', {
      reason: 'offensive',
      details: 'nsfw images',
    });

    expect(result).toEqual({ ok: true });
    const report = mock.calls.inserts.find(c => c.table === 'community_reports');
    expect(report).toBeDefined();
    expect(report.payload).toEqual({
      blueprint_id: 'bp-1',
      reporter_id:  'reporter-X',
      reason:       'offensive',
      details:      'nsfw images',
    });
  });

  it('truncates overlong details to 1000 chars', async () => {
    const mock = makeMock();
    globalThis.SB = mock;
    const longDetails = 'x'.repeat(5000);
    await Blueprints.reportCommunityBlueprint('bp-1', { reason: 'spam', details: longDetails });
    const report = mock.calls.inserts.find(c => c.table === 'community_reports');
    expect(report.payload.details.length).toBe(1000);
  });

  it('translates UNIQUE violation into a friendly duplicate message', async () => {
    const mock = makeMock({ insertErrors: { community_reports: { code: '23505', message: 'duplicate key' } } });
    globalThis.SB = mock;
    await expect(Blueprints.reportCommunityBlueprint('bp-1', { reason: 'spam' }))
      .rejects.toThrow("already reported");
  });

  it('translates RLS rejection into a clean self-report message', async () => {
    const mock = makeMock({ insertErrors: { community_reports: { code: '42501', message: 'row-level security' } } });
    globalThis.SB = mock;
    await expect(Blueprints.reportCommunityBlueprint('bp-1', { reason: 'spam' }))
      .rejects.toThrow("your own blueprint");
  });
});

// Rate-limit enforcement moved server-side in Stage C1 — the
// community-submit edge function calls check_publish_rate_limit before
// any write. Client-side tests for publishToCommunity now live in
// blueprints-publish.test.js; see the `rate_limited` error-mapping
// case there for the caller-visible behavior.
