/**
 * Tests for the client-side publishToCommunity / unpublishFromCommunity
 * wrappers after Stage C1.
 *
 * publishToCommunity is now a thin wrapper around the community-submit
 * edge function — the entire gate stack (ownership check, re-publish
 * detection, rate limit, secret scan, schema validation, insert with
 * rollback) runs server-side so a compromised client can't bypass it.
 *
 * These tests cover:
 *   - the functions.invoke call shape
 *   - the success response unpacking
 *   - error-code → friendly-message mapping
 *   - client-side guards that short-circuit before hitting the network
 *   - unpublishFromCommunity (still client-side, unchanged)
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
let code = readFileSync(resolve(__dir, '../lib/blueprint-store.js'), 'utf-8');
code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
eval(code);

/** Build an SB mock whose functions.invoke returns a configurable response. */
function invokeMock({ data = null, error = null } = {}) {
  const calls = [];
  return {
    calls,
    client: {
      functions: {
        invoke: (fn, opts) => {
          calls.push({ fn, body: opts && opts.body });
          return Promise.resolve({ data, error });
        },
      },
      from() {
        // delete/update paths used by unpublishFromCommunity
        const api = {
          _filters: {},
          eq(col, val) { this._filters[col] = val; return this; },
          delete() { return this; },
          select() { return this; },
          maybeSingle() { return Promise.resolve({ data: null, error: null }); },
          then(resolve) { resolve({ error: null }); },
        };
        return api;
      },
    },
  };
}

describe('BlueprintStore.publishToCommunity — client wrapper', () => {
  beforeEach(() => {
    globalThis.State._reset();
    globalThis.State.set('user', { id: 'user-A' });
  });

  it('rejects unauthenticated callers before any network write', async () => {
    globalThis.State._reset();
    const mock = invokeMock();
    globalThis.SB = mock;

    await expect(BlueprintStore.publishToCommunity({ type: 'agent', id: 'a1' }))
      .rejects.toThrow('Sign in to publish');
    expect(mock.calls.length).toBe(0);
  });

  it('rejects missing entity id before any network call', async () => {
    const mock = invokeMock();
    globalThis.SB = mock;

    await expect(BlueprintStore.publishToCommunity({ type: 'agent' }))
      .rejects.toThrow('Missing entity id');
    expect(mock.calls.length).toBe(0);
  });

  it('invokes community-submit with the expected body shape', async () => {
    const mock = invokeMock({
      data: {
        blueprint: { id: 'a1', name: 'Bot' },
        listing:   { id: 'l1', status: 'pending_review' },
        content_hash: 'abc123',
      },
    });
    globalThis.SB = mock;

    const result = await BlueprintStore.publishToCommunity(
      { type: 'agent', id: 'a1' },
      { title: 'Custom', description: 'Desc', tags: ['x', 'y'] }
    );

    expect(mock.calls.length).toBe(1);
    expect(mock.calls[0].fn).toBe('community-submit');
    expect(mock.calls[0].body).toEqual({
      entity_id:   'a1',
      entity_type: 'agent',
      title:       'Custom',
      description: 'Desc',
      tags:        ['x', 'y'],
    });
    expect(result.blueprint.id).toBe('a1');
    expect(result.listing.status).toBe('pending_review');
    expect(result.content_hash).toBe('abc123');
  });

  it('normalizes ship type through the invoke body', async () => {
    const mock = invokeMock({ data: { blueprint: {}, listing: {}, content_hash: 'h' } });
    globalThis.SB = mock;

    await BlueprintStore.publishToCommunity({ type: 'spaceship', id: 'ship-1' });
    expect(mock.calls[0].body.entity_type).toBe('spaceship');

    // Any other type coerces to 'agent' (defensive)
    await BlueprintStore.publishToCommunity({ type: 'something_weird', id: 'a2' });
    expect(mock.calls[1].body.entity_type).toBe('agent');
  });

  it('maps secret_detected to an actionable message', async () => {
    const mock = invokeMock({
      data: {
        error: 'secret_detected',
        pattern: 'openai_api_key',
        message: 'Your submission appears to contain a credential (openai api key). Remove it and try again.',
      },
    });
    globalThis.SB = mock;

    await expect(BlueprintStore.publishToCommunity({ type: 'agent', id: 'a1' }))
      .rejects.toThrow(/credential/i);
  });

  it('maps schema_invalid with the field path', async () => {
    const mock = invokeMock({
      data: {
        error: 'schema_invalid',
        field: 'config.temperature',
        message: 'config.temperature: Must be a number between 0 and 2',
      },
    });
    globalThis.SB = mock;

    await expect(BlueprintStore.publishToCommunity({ type: 'agent', id: 'a1' }))
      .rejects.toThrow(/temperature/);
  });

  it('maps not_owner to the friendly ownership message', async () => {
    const mock = invokeMock({ data: { error: 'not_owner' } });
    globalThis.SB = mock;
    await expect(BlueprintStore.publishToCommunity({ type: 'agent', id: 'a1' }))
      .rejects.toThrow(/you created/);
  });

  it('maps already_published to the unpublish-first message', async () => {
    const mock = invokeMock({ data: { error: 'already_published' } });
    globalThis.SB = mock;
    await expect(BlueprintStore.publishToCommunity({ type: 'agent', id: 'a1' }))
      .rejects.toThrow(/unpublish first/);
  });

  it('maps rate_limited to the 5-per-day message', async () => {
    const mock = invokeMock({ data: { error: 'rate_limited' } });
    globalThis.SB = mock;
    await expect(BlueprintStore.publishToCommunity({ type: 'agent', id: 'a1' }))
      .rejects.toThrow(/5 per day/);
  });

  it('surfaces transport errors with the server message when available', async () => {
    // Older supabase-js versions surface the body in data alongside error
    const mock = invokeMock({
      error: new Error('Non-2xx from function'),
      data: { error: 'secret_detected', message: 'Remove your API key' },
    });
    globalThis.SB = mock;
    await expect(BlueprintStore.publishToCommunity({ type: 'agent', id: 'a1' }))
      .rejects.toThrow('Remove your API key');
  });

  it('falls back to the transport error message when no body is available', async () => {
    const mock = invokeMock({ error: new Error('Network down'), data: null });
    globalThis.SB = mock;
    await expect(BlueprintStore.publishToCommunity({ type: 'agent', id: 'a1' }))
      .rejects.toThrow('Network down');
  });
});

describe('BlueprintStore.unpublishFromCommunity', () => {
  beforeEach(() => {
    globalThis.State._reset();
    globalThis.State.set('user', { id: 'user-A' });
  });

  it('throws on unauthenticated callers', async () => {
    globalThis.State._reset();
    globalThis.SB = invokeMock();
    await expect(BlueprintStore.unpublishFromCommunity('bp-1'))
      .rejects.toThrow('Sign in to unpublish');
  });

  it('throws when the blueprint id is missing', async () => {
    globalThis.SB = invokeMock();
    await expect(BlueprintStore.unpublishFromCommunity())
      .rejects.toThrow('Missing blueprint id');
  });
});
