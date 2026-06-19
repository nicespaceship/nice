/**
 * Roles tests — the SSOT for the role vocabulary that mission dispatch reads
 * to resolve a role slug → required capability tags. Two halves:
 *   - the synchronous SEED-backed getters (get / getRequiredTags / list), which
 *     must answer sensibly before init() resolves, and
 *   - init()'s DB load with its three fallbacks to SEED (offline, query error,
 *     empty/error result) — the robustness that keeps dispatch correct when
 *     Supabase is unreachable or the roles table drifts.
 *
 * init() memoizes via a module-private _loadPromise, so each scenario re-evals
 * the IIFE for a pristine instance (the standard trick for singleton modules).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(__dir, '../lib/roles.js'), 'utf-8')
  .replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');

// Re-run the IIFE to get a fresh _byKey / _ready / _loadPromise each test.
function freshRoles() {
  // eslint-disable-next-line no-eval
  eval(SRC);
  return globalThis.Roles;
}

// A Supabase stub whose roles query resolves via `orderImpl`.
const onlineSB = (orderImpl) => ({
  isReady: () => true,
  isOnline: () => true,
  client: { from: () => ({ select: () => ({ order: orderImpl }) }) },
});

let Roles;
beforeEach(() => { Roles = freshRoles(); });
afterEach(() => { delete globalThis.SB; });

describe('Roles — SEED + synchronous getters', () => {
  it('exposes all 17 seed roles sorted by sort_order', () => {
    const all = Roles.list();
    expect(all.length).toBe(17);
    expect(all[0].slug).toBe('captain');             // sort_order 0
    expect(all[all.length - 1].slug).toBe('support'); // sort_order 16
  });

  it('get() returns the row for a known slug and null otherwise', () => {
    expect(Roles.get('sales').label).toBe('Sales');
    expect(Roles.get('nope')).toBeNull();
    expect(Roles.get('')).toBeNull();
    expect(Roles.get(undefined)).toBeNull();
  });

  it('getRequiredTags returns the capability tags for a role', () => {
    expect(Roles.getRequiredTags('engineering')).toEqual(['code', 'issues', 'engineering']);
    expect(Roles.getRequiredTags('sales')).toEqual(['sales', 'crm']);
  });

  it('getRequiredTags returns [] for roles with no required tags', () => {
    expect(Roles.getRequiredTags('captain')).toEqual([]);
    expect(Roles.getRequiredTags('customer_success')).toEqual([]);
  });

  it('getRequiredTags returns [] for an unknown slug', () => {
    expect(Roles.getRequiredTags('made-up')).toEqual([]);
  });

  it('answers from SEED before init() runs (isReady false)', () => {
    expect(Roles.isReady()).toBe(false);
    expect(Roles.getRequiredTags('marketing')).toContain('marketing');
  });
});

describe('Roles.init — DB load + SEED fallbacks', () => {
  it('marks ready in seed-only mode when SB is offline', async () => {
    globalThis.SB = { isReady: () => true, isOnline: () => false };
    await Roles.init();
    expect(Roles.isReady()).toBe(true);
    expect(Roles.getRequiredTags('sales')).toEqual(['sales', 'crm']); // seed
  });

  it('replaces the seed with DB rows on a successful load', async () => {
    const order = vi.fn(async () => ({
      data: [{ slug: 'sales', label: 'Sales', required_capability_tags: ['crm-v2'], sort_order: 2 }],
      error: null,
    }));
    globalThis.SB = onlineSB(order);
    await Roles.init();
    expect(Roles.getRequiredTags('sales')).toEqual(['crm-v2']); // DB won
    expect(order).toHaveBeenCalledOnce();
    expect(Roles.isReady()).toBe(true);
  });

  it('keeps the seed when the DB returns an error field', async () => {
    const order = vi.fn(async () => ({ data: null, error: { message: 'denied' } }));
    globalThis.SB = onlineSB(order);
    await Roles.init();
    expect(order).toHaveBeenCalledOnce();           // the query ran…
    expect(Roles.getRequiredTags('sales')).toEqual(['sales', 'crm']); // …and SEED was kept anyway
    expect(Roles.isReady()).toBe(true);
  });

  it('keeps the seed when the DB returns no rows', async () => {
    const order = vi.fn(async () => ({ data: [], error: null }));
    globalThis.SB = onlineSB(order);
    await Roles.init();
    expect(order).toHaveBeenCalledOnce();
    expect(Roles.getRequiredTags('sales')).toEqual(['sales', 'crm']);
  });

  it('falls back to the seed without throwing when the query rejects', async () => {
    globalThis.SB = onlineSB(async () => { throw new Error('network down'); });
    await expect(Roles.init()).resolves.toBeUndefined();
    expect(Roles.getRequiredTags('sales')).toEqual(['sales', 'crm']);
    expect(Roles.isReady()).toBe(true);
  });

  it('is idempotent — concurrent init() calls hit the DB once', async () => {
    const order = vi.fn(async () => ({
      data: [{ slug: 'sales', required_capability_tags: ['x'], sort_order: 2 }],
      error: null,
    }));
    globalThis.SB = onlineSB(order);
    await Promise.all([Roles.init(), Roles.init(), Roles.init()]);
    expect(order).toHaveBeenCalledOnce();
  });
});
