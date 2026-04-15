import { describe, it, expect, beforeEach } from 'vitest';

// ContentQueue, State, and Utils are loaded globally by setup.js.
// setup.js also resets State + localStorage in its own beforeEach.

describe('ContentQueue.getPlatforms / getPlatform', () => {
  it('returns the canonical platform list in order', () => {
    const list = ContentQueue.getPlatforms();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(5);
    const ids = list.map(p => p.id);
    expect(ids).toEqual(['buffer', 'x', 'linkedin', 'instagram', 'facebook']);
    list.forEach(p => {
      expect(typeof p.id).toBe('string');
      expect(typeof p.label).toBe('string');
      expect(typeof p.icon).toBe('string');
      expect(typeof p.desc).toBe('string');
    });
  });

  it('returns a copy so callers cannot mutate the source list', () => {
    const a = ContentQueue.getPlatforms();
    a.push({ id: 'evil', label: 'Hacked', icon: '', desc: '' });
    const b = ContentQueue.getPlatforms();
    expect(b.find(p => p.id === 'evil')).toBeUndefined();
  });

  it('getPlatform returns a matching entry or null', () => {
    expect(ContentQueue.getPlatform('linkedin').label).toBe('LinkedIn');
    expect(ContentQueue.getPlatform('buffer').label).toBe('Buffer');
    expect(ContentQueue.getPlatform('unknown')).toBeNull();
    expect(ContentQueue.getPlatform('')).toBeNull();
  });
});

describe('ContentQueue.getCounts', () => {
  beforeEach(() => {
    State.set('content-queue', [
      { id: '1', approval_status: 'draft' },
      { id: '2', approval_status: 'draft' },
      { id: '3', approval_status: 'approved' },
      { id: '4', approval_status: 'rejected' },
      { id: '5', approval_status: 'scheduled' },
      { id: '6', approval_status: 'published' },
      { id: '7' /* no status — defaults to draft */ },
    ]);
  });

  it('counts each approval_status bucket correctly', () => {
    const counts = ContentQueue.getCounts();
    expect(counts.total).toBe(7);
    expect(counts.draft).toBe(3); // 2 explicit + 1 default
    expect(counts.approved).toBe(1);
    expect(counts.rejected).toBe(1);
    expect(counts.scheduled).toBe(1);
    expect(counts.published).toBe(1);
  });

  it('returns zero counts when the queue is empty', () => {
    State.set('content-queue', []);
    const counts = ContentQueue.getCounts();
    expect(counts.total).toBe(0);
    expect(counts.draft).toBe(0);
    expect(counts.approved).toBe(0);
  });

  it('tolerates a missing content-queue key', () => {
    // setup.js beforeEach already cleared state, so content-queue is undefined
    State.set('content-queue', undefined);
    const counts = ContentQueue.getCounts();
    expect(counts.total).toBe(0);
  });
});

describe('ContentQueue.publishTo / scheduleTo', () => {
  it('publishTo returns [] when given no platforms', async () => {
    const result = await ContentQueue.publishTo('id1', []);
    expect(result).toEqual([]);
  });

  it('publishTo returns [] when platforms arg is missing', async () => {
    const result = await ContentQueue.publishTo('id1');
    expect(result).toEqual([]);
  });

  it('scheduleTo returns an error when scheduledAt is missing', async () => {
    const result = await ContentQueue.scheduleTo('id1', ['buffer']);
    expect(result).toHaveLength(1);
    expect(result[0].success).toBe(false);
    expect(result[0].error).toContain('Missing');
  });

  it('scheduleTo returns [] when platforms list is empty', async () => {
    const result = await ContentQueue.scheduleTo('id1', [], new Date().toISOString());
    expect(result).toEqual([]);
  });
});
