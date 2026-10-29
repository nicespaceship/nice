import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

describe('ContentQueue.publish / schedule (gated until social-mcp ships)', () => {
  // Direct publish/schedule is gated behind PUBLISHING_ENABLED (false) because the
  // social-mcp edge function is not deployed. Both paths short-circuit to a single
  // "coming soon" result instead of calling the (404ing) function.
  it('publishTo returns one coming-soon result, not a per-platform fan-out', async () => {
    const result = await ContentQueue.publishTo('id1', ['buffer', 'x', 'linkedin']);
    expect(result).toHaveLength(1);
    expect(result[0].success).toBe(false);
    expect(result[0].comingSoon).toBe(true);
  });

  it('scheduleTo returns one coming-soon result', async () => {
    const result = await ContentQueue.scheduleTo('id1', ['buffer'], new Date().toISOString());
    expect(result).toHaveLength(1);
    expect(result[0].comingSoon).toBe(true);
  });

  it('publish and schedule report coming soon without hitting the network', async () => {
    const p = await ContentQueue.publish('id1', 'buffer');
    expect(p.success).toBe(false);
    expect(p.comingSoon).toBe(true);
    const s = await ContentQueue.schedule('id1', 'buffer', new Date().toISOString());
    expect(s.comingSoon).toBe(true);
  });
});

describe('ContentQueue approvals', () => {
  // Runs waiting in review belong to MissionRunner; local drafts don't.
  const realSB = globalThis.SB;
  beforeEach(() => {
    globalThis.SB = { ...realSB, isReady: () => false };
    globalThis.MissionRunner = {
      approveRun: vi.fn(async () => ({ resumed: false, persisted: true })),
      rejectRun: vi.fn(async () => ({ persisted: true })),
    };
    State.set('content-queue', [
      { id: 'run-1', status: 'review', approval_status: 'draft', title: 'Weekly report' },
      { id: 'draft-1', approval_status: 'draft', title: 'Local draft' },
    ]);
  });
  afterEach(() => {
    globalThis.SB = realSB;
    delete globalThis.MissionRunner;
  });
  const find = (id) => State.get('content-queue').find(i => i.id === id);

  it('approves a run in review through MissionRunner and completes it', async () => {
    const out = await ContentQueue.approve('run-1');
    expect(MissionRunner.approveRun).toHaveBeenCalledWith(expect.objectContaining({ id: 'run-1', status: 'review' }));
    expect(out).toEqual({ resumed: false });
    expect(find('run-1')).toMatchObject({ status: 'completed', approval_status: 'approved' });
    expect(ContentQueue.getCounts().draft).toBe(1);
  });

  it('drops a run that resumed after its gate until it lands in review again', async () => {
    MissionRunner.approveRun.mockResolvedValueOnce({ resumed: true, persisted: true });
    const out = await ContentQueue.approve('run-1');
    expect(out).toEqual({ resumed: true });
    expect(find('run-1')).toBeUndefined();
  });

  it('throws and leaves the run waiting when the approval did not save', async () => {
    MissionRunner.approveRun.mockResolvedValueOnce({ resumed: false, persisted: false });
    await expect(ContentQueue.approve('run-1')).rejects.toThrow('Could not save the approval');
    expect(find('run-1').approval_status).toBe('draft');
  });

  it('rejects a run in review through MissionRunner', async () => {
    await ContentQueue.reject('run-1');
    expect(MissionRunner.rejectRun).toHaveBeenCalledWith(expect.objectContaining({ id: 'run-1' }));
    expect(find('run-1')).toMatchObject({ status: 'failed', approval_status: 'rejected' });
  });

  it('takes a paused gate off the queue before the crew finishes the rest', async () => {
    let finish;
    MissionRunner.isResumableGate = () => true;
    MissionRunner.approveRun.mockImplementationOnce(() => new Promise(r => { finish = r; }));
    const pending = ContentQueue.approve('run-1');
    await Promise.resolve();
    expect(find('run-1')).toBeUndefined();
    finish({ resumed: true, persisted: true });
    expect(await pending).toEqual({ resumed: true });
  });

  it('reads the run itself before deciding, not the cached queue', async () => {
    // The cache still says completed; the run has since landed in review.
    State.set('content-queue', [{ id: 'run-9', status: 'completed', approval_status: 'draft' }]);
    const row = { id: 'run-9', status: 'review', approval_status: 'draft', metadata: {} };
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: row }) };
    globalThis.SB = { isReady: () => true, client: { from: () => q } };
    await ContentQueue.approve('run-9');
    expect(MissionRunner.approveRun).toHaveBeenCalledWith(row);
  });

  it('approves and rejects local drafts without MissionRunner', async () => {
    await ContentQueue.approve('draft-1');
    expect(find('draft-1').approval_status).toBe('approved');
    await ContentQueue.reject('draft-1');
    expect(find('draft-1').approval_status).toBe('rejected');
    expect(MissionRunner.approveRun).not.toHaveBeenCalled();
    expect(MissionRunner.rejectRun).not.toHaveBeenCalled();
  });
});

describe('ContentQueue.load', () => {
  const realSB = globalThis.SB;
  afterEach(() => { globalThis.SB = realSB; });

  it('keeps runs in review or decided, and leaves out runs with nothing to approve', async () => {
    const rows = [
      { id: 'a', status: 'review', approval_status: 'draft', created_at: '2026-10-28T10:00:00Z' },
      { id: 'b', status: 'running', approval_status: 'draft', created_at: '2026-10-28T11:00:00Z' },
      { id: 'c', status: 'completed', approval_status: 'approved', created_at: '2026-10-28T12:00:00Z' },
      // A resumed gate that failed keeps its old approval_status.
      { id: 'd', status: 'failed', approval_status: 'draft', created_at: '2026-10-28T13:00:00Z' },
      { id: 'e', status: 'cancelled', approval_status: 'draft', created_at: '2026-10-28T14:00:00Z' },
      { id: 'f', status: 'failed', approval_status: 'rejected', created_at: '2026-10-28T09:00:00Z' },
    ];
    const q = { select: () => q, eq: () => q, not: () => q, order: () => q, limit: async () => ({ data: rows }) };
    globalThis.SB = { isReady: () => true, client: { from: () => q } };
    State.set('user', { id: 'u1' });
    const out = await ContentQueue.load();
    expect(out.map(i => i.id)).toEqual(['a', 'c', 'f']);
    expect(State.get('content-queue')).toBe(out);
  });

  it('drops a load that finishes after the user signed out', async () => {
    let finish;
    const q = { select: () => q, eq: () => q, not: () => q, order: () => q, limit: () => new Promise(r => { finish = r; }) };
    globalThis.SB = { isReady: () => true, client: { from: () => q } };
    State.set('user', { id: 'u1' });
    State.set('content-queue', []);
    const pending = ContentQueue.load();
    State.set('user', null);
    finish({ data: [{ id: 'a', status: 'review', approval_status: 'draft' }] });
    expect(await pending).toEqual([]);
    expect(State.get('content-queue')).toEqual([]);
  });
});

describe('ContentQueue.watch', () => {
  const realSB = globalThis.SB;
  afterEach(() => {
    ContentQueue.unwatch();
    globalThis.SB = realSB;
    vi.useRealTimers();
  });

  it('reloads when a run with an approval state changes, not on progress ticks', () => {
    vi.useFakeTimers();
    let onChange;
    const realtime = { subscribe: vi.fn((table, fn) => { onChange = fn; return 'chan'; }), unsubscribe: vi.fn() };
    const q = { select: () => q, eq: () => q, not: () => q, order: () => q, limit: async () => ({ data: [] }) };
    const from = vi.fn(() => q);
    globalThis.SB = { isReady: () => true, client: { from }, realtime };
    State.set('user', { id: 'u1' });

    ContentQueue.watch();
    expect(realtime.subscribe).toHaveBeenCalledWith('mission_runs', expect.any(Function));
    onChange({ eventType: 'UPDATE', new: { id: 'x', approval_status: null, progress: 40 } });
    // A resumed gate keeps its approval_status while the crew works.
    onChange({ eventType: 'UPDATE', new: { id: 'y', status: 'running', approval_status: 'draft', progress: 60 } });
    vi.advanceTimersByTime(1000);
    expect(from).not.toHaveBeenCalled();

    onChange({ eventType: 'UPDATE', new: { id: 'x', approval_status: 'draft' } });
    onChange({ eventType: 'UPDATE', new: { id: 'x', approval_status: 'draft' } });
    vi.advanceTimersByTime(1000);
    expect(from).toHaveBeenCalledTimes(1);

    ContentQueue.unwatch();
    expect(realtime.unsubscribe).toHaveBeenCalledWith('chan');
  });
});

describe('ContentQueue.reschedule', () => {
  const realSB = globalThis.SB;
  afterEach(() => { globalThis.SB = realSB; });

  it('saves the new day on the run and in the queue', async () => {
    const update = vi.fn(async () => ({}));
    globalThis.SB = { isReady: () => true, db: () => ({ update }) };
    State.set('content-queue', [{ id: 'run-1', metadata: { model_used: 'grok-4-3' } }]);
    await ContentQueue.reschedule('run-1', '2026-10-30T16:00:00.000Z');
    const metadata = { model_used: 'grok-4-3', scheduled_for: '2026-10-30T16:00:00.000Z' };
    expect(update).toHaveBeenCalledWith('run-1', { metadata });
    expect(State.get('content-queue')[0].metadata).toEqual(metadata);
  });
});

describe('ContentQueue.renderMarkdown', () => {
  const md = ContentQueue.renderMarkdown;

  it('keeps list items together and paragraphs apart', () => {
    expect(md('## This week\n- Sales up 4%\n- Croissants sold out\n\nSee you Monday.'))
      .toBe('<h3>This week</h3><ul><li>Sales up 4%</li><li>Croissants sold out</li></ul><p>See you Monday.</p>');
  });

  it('keeps line breaks inside a paragraph and numbers ordered lists', () => {
    expect(md('Hi Priya,\nYour order is ready.\n\n1. Buns\n2. Tart'))
      .toBe('<p>Hi Priya,<br>Your order is ready.</p><ol><li>Buns</li><li>Tart</li></ol>');
  });

  it('does not join separate lists into one', () => {
    expect(md('- a\n\nMiddle\n\n- b')).toBe('<ul><li>a</li></ul><p>Middle</p><ul><li>b</li></ul>');
  });

  it('formats inline marks and leaves code blocks as written', () => {
    expect(md('**Bold**, *soft* and `code`')).toBe('<p><strong>Bold</strong>, <em>soft</em> and <code>code</code></p>');
    expect(md('```\n- not a list\n**raw**\n```')).toBe('<pre><code>- not a list\n**raw**</code></pre>');
  });

  it('reads Windows line endings and keeps marks inside link urls', () => {
    expect(md('## Title\r\n- one\r\n- two')).toBe('<h3>Title</h3><ul><li>one</li><li>two</li></ul>');
    expect(md('[docs](https://example.com/a*b*c)')).toBe('<p><a href="https://example.com/a*b*c" target="_blank" rel="noopener">docs</a></p>');
  });

  it('escapes HTML and refuses script links', () => {
    expect(md('<img src=x onerror=alert(1)>')).not.toContain('<img');
    expect(md('[click](javascript:alert(1))')).not.toContain('javascript:');
  });
});
