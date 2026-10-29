import { describe, it, expect } from 'vitest';

// Utils is loaded globally by setup.js.

describe('Utils.toStardate', () => {
  it('formats a timestamp as SD <year>.<day-of-year>', () => {
    expect(Utils.toStardate(new Date(2026, 0, 1, 12).toISOString())).toBe('SD 2026.001');
    expect(Utils.toStardate(new Date(2026, 9, 28, 12).toISOString())).toBe('SD 2026.301');
  });

  it('returns an empty string for a missing timestamp', () => {
    expect(Utils.toStardate(null)).toBe('');
  });
});
