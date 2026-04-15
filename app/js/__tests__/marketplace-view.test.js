import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));

// MarketplaceView depends on Utils (already loaded by setup.js) but has
// its own optional deps on SB / State / BlueprintStore / Notify. We only
// test the pure recomputeRating helper here, so loading the file into
// the global scope is enough — no runtime calls are made.
beforeAll(() => {
  const absPath = resolve(__dirname_local, '..', 'views/marketplace.js');
  let code = readFileSync(absPath, 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
});

describe('MarketplaceView._recomputeRating', () => {
  it('adds a first-ever rating to a listing with no ratings', () => {
    const result = MarketplaceView._recomputeRating(0, 0, null, 5);
    expect(result.rating).toBe(5);
    expect(result.rating_count).toBe(1);
  });

  it('adds a new rating to a listing that already has some', () => {
    // 3 ratings averaging 4.0, a new 5-star review comes in
    const result = MarketplaceView._recomputeRating(4.0, 3, null, 5);
    expect(result.rating_count).toBe(4);
    expect(result.rating).toBeCloseTo(4.25, 4); // (4*3 + 5) / 4 = 4.25
  });

  it('updates an existing rating without changing the count', () => {
    // 4 ratings averaging 4.25, the current user changes their old 3 to a 5
    const result = MarketplaceView._recomputeRating(4.25, 4, 3, 5);
    expect(result.rating_count).toBe(4);
    expect(result.rating).toBeCloseTo(4.75, 4); // (4.25*4 - 3 + 5) / 4 = 4.75
  });

  it('is stable when the user re-submits the same rating', () => {
    const result = MarketplaceView._recomputeRating(4.0, 5, 4, 4);
    expect(result.rating_count).toBe(5);
    expect(result.rating).toBeCloseTo(4.0, 4); // average doesn't change
  });

  it('handles a one-star downgrade', () => {
    // 2 ratings of 5 each = 5.0 avg. User updates their 5 to a 1.
    const result = MarketplaceView._recomputeRating(5.0, 2, 5, 1);
    expect(result.rating_count).toBe(2);
    expect(result.rating).toBeCloseTo(3.0, 4); // (5*2 - 5 + 1) / 2 = 3.0
  });

  it('guards against a zero previous count when updating', () => {
    // Shouldn't happen in practice, but make sure it doesn't divide by zero
    const result = MarketplaceView._recomputeRating(0, 0, 3, 5);
    expect(result.rating).toBe(0);
    expect(result.rating_count).toBe(0);
  });
});
