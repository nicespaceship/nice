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
});
