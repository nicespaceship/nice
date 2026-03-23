import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Router unit tests
 * Tests route matching, param extraction, and path parsing logic.
 * Since Router is tightly DOM-coupled, we test the pure logic patterns.
 */

describe('Router route matching', () => {
  // Replicate Router's internal _match logic for unit testing
  function createMatcher() {
    const routes = [];

    function on(pattern, view) {
      const keys = [];
      const regex = new RegExp(
        '^' + pattern.replace(/:([^/]+)/g, (_m, key) => {
          keys.push(key);
          return '([^/]+)';
        }) + '$'
      );
      routes.push({ pattern, regex, keys, view });
    }

    function match(p) {
      for (const route of routes) {
        const m = p.match(route.regex);
        if (m) {
          const params = {};
          route.keys.forEach((key, i) => { params[key] = m[i + 1]; });
          return { view: route.view, params };
        }
      }
      return null;
    }

    return { on, match };
  }

  it('should match exact routes', () => {
    const r = createMatcher();
    const HomeView = { title: 'Home' };
    r.on('/', HomeView);
    const result = r.match('/');
    expect(result).not.toBeNull();
    expect(result.view).toBe(HomeView);
    expect(result.params).toEqual({});
  });

  it('should match routes with params', () => {
    const r = createMatcher();
    const DetailView = { title: 'Detail' };
    r.on('/agents/:id', DetailView);
    const result = r.match('/agents/abc-123');
    expect(result).not.toBeNull();
    expect(result.params.id).toBe('abc-123');
  });

  it('should return null for unmatched routes', () => {
    const r = createMatcher();
    r.on('/', { title: 'Home' });
    const result = r.match('/nonexistent');
    expect(result).toBeNull();
  });

  it('should match multi-param routes', () => {
    const r = createMatcher();
    const View = { title: 'Nested' };
    r.on('/org/:orgId/project/:projectId', View);
    const result = r.match('/org/foo/project/bar');
    expect(result).not.toBeNull();
    expect(result.params).toEqual({ orgId: 'foo', projectId: 'bar' });
  });

  it('should match first matching route', () => {
    const r = createMatcher();
    const ListV = { title: 'List' };
    const NewV = { title: 'New' };
    const DetailV = { title: 'Detail' };
    r.on('/agents', ListV);
    r.on('/agents/new', NewV);
    r.on('/agents/:id', DetailV);

    expect(r.match('/agents').view).toBe(ListV);
    expect(r.match('/agents/new').view).toBe(NewV);
    expect(r.match('/agents/xyz').view).toBe(DetailV);
  });

  it('should not match partial paths', () => {
    const r = createMatcher();
    r.on('/agents', { title: 'Agents' });
    expect(r.match('/agents/extra/path')).toBeNull();
    expect(r.match('/agentsfoo')).toBeNull();
  });
});

describe('Router path parsing', () => {
  // Updated to strip query params from hash path
  function parsePath(hash) {
    const raw = hash.replace(/^#/, '') || '/';
    return raw.split('?')[0] || '/';
  }

  it('should strip hash prefix', () => {
    expect(parsePath('#/')).toBe('/');
    expect(parsePath('#/agents')).toBe('/agents');
    expect(parsePath('#/agents/123')).toBe('/agents/123');
    expect(parsePath('')).toBe('/');
    expect(parsePath('#')).toBe('/');
  });

  it('should strip hash-level query params from path', () => {
    expect(parsePath('#/blueprints?bp=code-reviewer')).toBe('/blueprints');
    expect(parsePath('#/agents?sort=name&dir=asc')).toBe('/agents');
    expect(parsePath('#/?redirect=/agents')).toBe('/');
  });

  it('should extract first path segment', () => {
    function getSegment(p) {
      return '/' + (p.split('/')[1] || '');
    }
    expect(getSegment('/')).toBe('/');
    expect(getSegment('/agents')).toBe('/agents');
    expect(getSegment('/agents/123')).toBe('/agents');
    expect(getSegment('/workflows/abc')).toBe('/workflows');
  });
});

describe('Router query parsing', () => {
  // Replicate Router.query() logic for unit testing
  function parseQuery(search) {
    const params = {};
    const qs = search.replace(/^\?/, '');
    if (!qs) return params;
    qs.split('&').forEach(pair => {
      const [k, v] = pair.split('=');
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
    return params;
  }

  it('should parse simple query params', () => {
    expect(parseQuery('?ref=dashboard')).toEqual({ ref: 'dashboard' });
  });

  it('should parse multiple query params', () => {
    expect(parseQuery('?ref=dashboard&utm_source=twitter&utm_campaign=launch')).toEqual({
      ref: 'dashboard',
      utm_source: 'twitter',
      utm_campaign: 'launch',
    });
  });

  it('should handle empty query string', () => {
    expect(parseQuery('')).toEqual({});
    expect(parseQuery('?')).toEqual({});
  });

  it('should decode URI components', () => {
    expect(parseQuery('?ref=my%20page&name=hello%26world')).toEqual({
      ref: 'my page',
      name: 'hello&world',
    });
  });

  it('should handle params with no value', () => {
    expect(parseQuery('?debug')).toEqual({ debug: '' });
    expect(parseQuery('?debug&ref=home')).toEqual({ debug: '', ref: 'home' });
  });
});

describe('Router hashQuery parsing', () => {
  // Replicate Router.hashQuery() logic for unit testing
  function parseHashQuery(hash) {
    const params = {};
    const raw = hash.replace(/^#/, '');
    const idx = raw.indexOf('?');
    if (idx === -1) return params;
    const qs = raw.slice(idx + 1);
    qs.split('&').forEach(pair => {
      const [k, v] = pair.split('=');
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
    return params;
  }

  it('should parse hash-level query params', () => {
    expect(parseHashQuery('#/blueprints?bp=code-reviewer')).toEqual({ bp: 'code-reviewer' });
  });

  it('should parse multiple hash query params', () => {
    expect(parseHashQuery('#/agents?sort=name&dir=asc')).toEqual({ sort: 'name', dir: 'asc' });
  });

  it('should return empty for hash with no query', () => {
    expect(parseHashQuery('#/blueprints')).toEqual({});
    expect(parseHashQuery('#/')).toEqual({});
    expect(parseHashQuery('')).toEqual({});
  });

  it('should handle redirect param', () => {
    expect(parseHashQuery('#/?redirect=/agents/new')).toEqual({ redirect: '/agents/new' });
  });
});
