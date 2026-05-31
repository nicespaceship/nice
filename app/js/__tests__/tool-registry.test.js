import { describe, it, expect } from 'vitest';

describe('ToolRegistry', () => {
  describe('core API', () => {
    it('exposes register, resolve, get, list, execute, getSchemas', () => {
      expect(typeof ToolRegistry.register).toBe('function');
      expect(typeof ToolRegistry.resolve).toBe('function');
      expect(typeof ToolRegistry.get).toBe('function');
      expect(typeof ToolRegistry.list).toBe('function');
      expect(typeof ToolRegistry.execute).toBe('function');
      expect(typeof ToolRegistry.getSchemas).toBe('function');
      expect(typeof ToolRegistry.registerAlias).toBe('function');
    });

    it('registers built-in tools on load', () => {
      const ids = ToolRegistry.list().map(t => t.id);
      expect(ids).toContain('web-search');
      expect(ids).toContain('code-gen');
      expect(ids).toContain('data-transform');
      expect(ids).toContain('summarize');
      expect(ids).toContain('calculator');
    });

    it('registers new primitives: fetch-url, current-time, parse-json, extract-regex, format-date', () => {
      const ids = ToolRegistry.list().map(t => t.id);
      expect(ids).toContain('fetch-url');
      expect(ids).toContain('current-time');
      expect(ids).toContain('parse-json');
      expect(ids).toContain('extract-regex');
      expect(ids).toContain('format-date');
    });
  });

  describe('resolve', () => {
    it('returns null for empty or invalid input', () => {
      expect(ToolRegistry.resolve('')).toBeNull();
      expect(ToolRegistry.resolve(null)).toBeNull();
      expect(ToolRegistry.resolve(undefined)).toBeNull();
      expect(ToolRegistry.resolve(42)).toBeNull();
    });

    it('resolves by exact id', () => {
      const tool = ToolRegistry.resolve('web-search');
      expect(tool).toBeTruthy();
      expect(tool.id).toBe('web-search');
    });

    it('resolves by display name', () => {
      expect(ToolRegistry.resolve('Web Search')?.id).toBe('web-search');
      expect(ToolRegistry.resolve('Summarizer')?.id).toBe('summarize');
      expect(ToolRegistry.resolve('Calculator')?.id).toBe('calculator');
    });

    it('resolves case-insensitively', () => {
      expect(ToolRegistry.resolve('WEB SEARCH')?.id).toBe('web-search');
      expect(ToolRegistry.resolve('summarize')?.id).toBe('summarize');
      expect(ToolRegistry.resolve('Summarize')?.id).toBe('summarize');
    });

    it('resolves aliases registered for common blueprint labels', () => {
      expect(ToolRegistry.resolve('Analytics')?.id).toBe('data-transform');
      expect(ToolRegistry.resolve('Database')?.id).toBe('data-transform');
      expect(ToolRegistry.resolve('Code Review')?.id).toBe('code-gen');
      expect(ToolRegistry.resolve('Scraping')?.id).toBe('web-search');
      expect(ToolRegistry.resolve('HTTP')?.id).toBe('fetch-url');
    });

    it('returns null for unknown tool names', () => {
      expect(ToolRegistry.resolve('totally-nonexistent-tool')).toBeNull();
    });
  });

  describe('registerAlias', () => {
    it('adds a custom alias resolvable via resolve()', () => {
      ToolRegistry.registerAlias('Laser Beam', 'calculator');
      expect(ToolRegistry.resolve('Laser Beam')?.id).toBe('calculator');
      expect(ToolRegistry.resolve('laser-beam')?.id).toBe('calculator');
    });

    it('rejects empty alias or target', () => {
      expect(ToolRegistry.registerAlias('', 'calculator')).toBe(false);
      expect(ToolRegistry.registerAlias('x', '')).toBe(false);
    });
  });

  describe('primitive execution', () => {
    it('current-time returns ISO and unix timestamp', async () => {
      const result = await ToolRegistry.execute('current-time', {});
      expect(result.iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(typeof result.unix).toBe('number');
    });

    it('parse-json parses valid JSON', async () => {
      const result = await ToolRegistry.execute('parse-json', { text: '{"a":1,"b":[2,3]}' });
      expect(result.parsed).toEqual({ a: 1, b: [2, 3] });
    });

    it('parse-json returns error for invalid JSON', async () => {
      const result = await ToolRegistry.execute('parse-json', { text: 'not-json' });
      expect(result.error).toMatch(/Invalid JSON/);
    });

    it('extract-regex pulls matches with capture groups', async () => {
      const result = await ToolRegistry.execute('extract-regex', {
        text: 'Order #123 placed. Order #456 shipped.',
        pattern: 'Order #(\\d+)',
      });
      expect(result.count).toBe(2);
      expect(result.matches[0].groups).toEqual(['123']);
      expect(result.matches[1].groups).toEqual(['456']);
    });

    it('format-date formats an ISO date', async () => {
      const result = await ToolRegistry.execute('format-date', {
        date: '2026-04-09T12:00:00Z',
        timezone: 'UTC',
        style: 'medium',
      });
      expect(result.iso).toBe('2026-04-09T12:00:00.000Z');
      expect(typeof result.formatted).toBe('string');
    });

    it('calculator evaluates arithmetic', async () => {
      const result = await ToolRegistry.execute('calculator', { expression: '2 + 3 * 4' });
      expect(result.result).toBe(14);
    });

    it('data-transform parses JSON data', async () => {
      const result = await ToolRegistry.execute('data-transform', {
        data: '[{"a":1},{"a":2},{"a":3}]',
        format: 'json',
        operation: 'aggregate',
        field: 'a',
        agg: 'sum',
      });
      expect(result.result).toBe(6);
    });
  });

  describe('deregister', () => {
    it('exposes deregister function', () => {
      expect(typeof ToolRegistry.deregister).toBe('function');
    });

    it('removes a registered tool by id', () => {
      ToolRegistry.register({
        id: 'test-ephemeral',
        name: 'Ephemeral Tool',
        description: 'Test tool to be removed',
        execute: async () => 'ok',
      });
      expect(ToolRegistry.get('test-ephemeral')).toBeTruthy();
      const removed = ToolRegistry.deregister('test-ephemeral');
      expect(removed).toBe(true);
      expect(ToolRegistry.get('test-ephemeral')).toBeNull();
    });

    it('returns false for non-existent tool', () => {
      expect(ToolRegistry.deregister('does-not-exist')).toBe(false);
    });

    it('cleans up aliases pointing to deregistered tool', () => {
      ToolRegistry.register({
        id: 'test-alias-cleanup',
        name: 'Alias Cleanup Test',
        description: 'Test',
        execute: async () => 'ok',
      });
      ToolRegistry.registerAlias('cleanup-alias', 'test-alias-cleanup');
      expect(ToolRegistry.resolve('cleanup-alias')?.id).toBe('test-alias-cleanup');
      ToolRegistry.deregister('test-alias-cleanup');
      expect(ToolRegistry.resolve('cleanup-alias')).toBeNull();
    });
  });

  describe('delegate tool', () => {
    it('registers delegate tool with correct schema', () => {
      const tool = ToolRegistry.get('delegate');
      expect(tool).toBeTruthy();
      expect(tool.name).toBe('Delegate to Agent');
      expect(tool.schema.required).toContain('task');
    });

    it('resolves delegate aliases', () => {
      expect(ToolRegistry.resolve('hand off')?.id).toBe('delegate');
      expect(ToolRegistry.resolve('assign')?.id).toBe('delegate');
      expect(ToolRegistry.resolve('ask agent')?.id).toBe('delegate');
    });
  });

  describe('execute via alias', () => {
    it('executes a tool when called by display name', async () => {
      const result = await ToolRegistry.execute('Calculator', { expression: '10 / 2' });
      expect(result.result).toBe(5);
    });

    it('throws a clear error for unknown tool', async () => {
      await expect(ToolRegistry.execute('nonexistent', {}))
        .rejects.toThrow(/Tool not found/);
    });
  });

  describe('command shape — surfaces + sideEffect', () => {
    it('exposes the isSideEffect predicate', () => {
      expect(typeof ToolRegistry.isSideEffect).toBe('function');
      expect(ToolRegistry.isSideEffect('gmail_send_message')).toBe(true);
      expect(ToolRegistry.isSideEffect('gmail_search_messages')).toBe(false);
      expect(ToolRegistry.isSideEffect('')).toBe(false);
      expect(ToolRegistry.isSideEffect(null)).toBe(false);
    });

    it('defaults surfaces to agent-only when omitted', () => {
      ToolRegistry.register({ id: 'surf-default', name: 'Surf Default', execute: async () => 'ok' });
      expect(ToolRegistry.get('surf-default').surfaces).toEqual(['agent']);
      ToolRegistry.deregister('surf-default');
    });

    it('honors an explicit surfaces list', () => {
      ToolRegistry.register({ id: 'surf-human', name: 'Surf Human', surfaces: ['human', 'agent'], execute: async () => 'ok' });
      expect(ToolRegistry.get('surf-human').surfaces).toEqual(['human', 'agent']);
      ToolRegistry.deregister('surf-human');
    });

    it('infers sideEffect from the command name', () => {
      ToolRegistry.register({ id: 'infer-write', name: 'create something', execute: async () => 'ok' });
      ToolRegistry.register({ id: 'infer-read', name: 'lookup something', execute: async () => 'ok' });
      expect(ToolRegistry.get('infer-write').sideEffect).toBe(true);
      expect(ToolRegistry.get('infer-read').sideEffect).toBe(false);
      ToolRegistry.deregister('infer-write');
      ToolRegistry.deregister('infer-read');
    });

    it('lets an explicit sideEffect flag override the inference', () => {
      ToolRegistry.register({ id: 'infer-override', name: 'create something', sideEffect: false, execute: async () => 'ok' });
      expect(ToolRegistry.get('infer-override').sideEffect).toBe(false);
      ToolRegistry.deregister('infer-override');
    });
  });

  describe('approval gate in dispatch', () => {
    // The Phase 0 exit gate: a side-effecting command invoked OUTSIDE
    // AgentExecutor (i.e. straight through the bus) triggers the same approval
    // prompt the agent path shows.
    it('prompts for approval and blocks a declined side-effect command', async () => {
      const calls = [];
      ToolRegistry.register({
        id: 'gate-send', name: 'send-thing',
        execute: async () => { calls.push(1); return { ok: true }; },
      });
      const seen = [];
      await expect(
        ToolRegistry.execute('gate-send', { to: 'x' }, {
          approvalMode: 'review',
          onApprovalNeeded: (a) => { seen.push(a.tool); return Promise.resolve(false); },
        }),
      ).rejects.toMatchObject({ declined: true });
      expect(seen).toEqual(['send-thing']);
      expect(calls.length).toBe(0); // never executed
      ToolRegistry.deregister('gate-send');
    });

    it('executes a side-effect command once approved', async () => {
      const calls = [];
      ToolRegistry.register({
        id: 'gate-send-ok', name: 'send-thing-ok',
        execute: async () => { calls.push(1); return { ok: true }; },
      });
      const result = await ToolRegistry.execute('gate-send-ok', { to: 'x' }, {
        approvalMode: 'review',
        onApprovalNeeded: () => Promise.resolve(true),
      });
      expect(result).toEqual({ ok: true });
      expect(calls.length).toBe(1);
      ToolRegistry.deregister('gate-send-ok');
    });

    it('does not gate when no review context is passed (2-arg form)', async () => {
      const calls = [];
      ToolRegistry.register({
        id: 'gate-noprompt', name: 'send-thing-noprompt',
        execute: async () => { calls.push(1); return { ok: true }; },
      });
      const result = await ToolRegistry.execute('gate-noprompt', { to: 'x' });
      expect(result).toEqual({ ok: true });
      expect(calls.length).toBe(1);
      ToolRegistry.deregister('gate-noprompt');
    });

    it('does not gate a read-only command even in review mode', async () => {
      let prompted = false;
      const result = await ToolRegistry.execute('calculator', { expression: '6 * 7' }, {
        approvalMode: 'review',
        onApprovalNeeded: () => { prompted = true; return Promise.resolve(false); },
      });
      expect(result.result).toBe(42);
      expect(prompted).toBe(false);
    });
  });
});
