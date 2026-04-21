/* ═══════════════════════════════════════════════════════════════════
   BrowserTools — Agent-controlled browser via ToolRegistry
   Fetches pages via browser-proxy edge function, shows in PreviewPanel.
   ═══════════════════════════════════════════════════════════════════ */
const BrowserTools = (() => {

  /* ── State ── */
  let _currentUrl = '';
  let _currentPage = null; // { title, text, links, headings, meta, status, url }
  let _history = [];
  let _historyIndex = -1;
  let _pageCache = {};
  let _initialized = false;

  /* ── Config ── */
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /* ── Core fetch ── */
  async function _fetchPage(url, opts = {}) {
    // Check cache
    const cached = _pageCache[url];
    if (cached && Date.now() - cached._ts < CACHE_TTL && !opts.noCache) {
      return cached;
    }

    if (typeof SB === 'undefined' || !SB.client) {
      throw new Error('Supabase not available — sign in to use browser tools');
    }

    const supabaseUrl = SB.client.supabaseUrl || SB.client._supabaseUrl || '';
    if (!supabaseUrl) throw new Error('Supabase URL not configured');

    const { data: { session } } = await SB.client.auth.getSession();
    if (!session?.access_token) throw new Error('Sign in to use browser tools');

    const res = await fetch(`${supabaseUrl}/functions/v1/browser-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ url, selector: opts.selector || undefined })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Browser proxy error (${res.status}): ${err}`);
    }

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    data._ts = Date.now();
    _pageCache[url] = data;
    return data;
  }

  /* ── Navigation ── */
  function _navigate(url) {
    _currentUrl = url;
    // Add to history
    if (_historyIndex < _history.length - 1) {
      _history = _history.slice(0, _historyIndex + 1);
    }
    _history.push(url);
    _historyIndex = _history.length - 1;

    // Show in PreviewPanel
    if (typeof PreviewPanel !== 'undefined') {
      PreviewPanel.loadURL(url);
      if (!PreviewPanel.isOpen()) PreviewPanel.open(url);
    }

    // Update URL bar if it exists
    const urlBar = document.getElementById('browser-url-bar');
    if (urlBar) urlBar.value = url;
  }

  /* ── Tool registration ── */
  function init() {
    if (_initialized) return;
    if (typeof ToolRegistry === 'undefined') {
      console.warn('[BrowserTools] ToolRegistry not available');
      return;
    }

    /* ── browser-navigate ── */
    ToolRegistry.register({
      id: 'browser-navigate',
      name: 'Navigate to URL',
      description: 'Load a web page in the browser. Returns the page title, headings, and text content. Use this to visit websites, read articles, check competitor pages, etc.',
      schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The full URL to navigate to (include https://)' }
        },
        required: ['url']
      },
      execute: async ({ url }) => {
        // Ensure https
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        _navigate(url);
        const page = await _fetchPage(url);
        _currentPage = page;
        const headings = (page.headings || []).map(h => '  ' + '#'.repeat(h.level) + ' ' + h.text).join('\n');
        return `Navigated to: ${page.url}\nTitle: ${page.title}\nStatus: ${page.status}\n${page.meta?.description ? 'Description: ' + page.meta.description + '\n' : ''}${headings ? '\nPage Structure:\n' + headings + '\n' : ''}\nContent:\n${page.text}`;
      }
    });

    /* ── browser-read ── */
    ToolRegistry.register({
      id: 'browser-read',
      name: 'Read Current Page',
      description: 'Read the text content of the current page. Use after browser-navigate to re-read or get updated content.',
      schema: { type: 'object', properties: {} },
      execute: async () => {
        if (!_currentUrl) return 'No page loaded. Use browser-navigate first.';
        const page = await _fetchPage(_currentUrl);
        _currentPage = page;
        return `Current page: ${page.url}\nTitle: ${page.title}\n\n${page.text}`;
      }
    });

    /* ── browser-extract ── */
    ToolRegistry.register({
      id: 'browser-extract',
      name: 'Extract from Page',
      description: 'Extract specific content from the current page using a CSS selector (e.g., ".pricing", "#features", "h2") or search for text containing a keyword.',
      schema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector (.class, #id, or tag name) to extract specific elements' },
          keyword: { type: 'string', description: 'Search for lines containing this keyword (alternative to selector)' }
        }
      },
      execute: async ({ selector, keyword }) => {
        if (!_currentUrl) return 'No page loaded. Use browser-navigate first.';

        if (selector) {
          const page = await _fetchPage(_currentUrl, { selector, noCache: true });
          return page.text || 'No content found matching selector: ' + selector;
        }

        if (keyword) {
          if (!_currentPage) return 'No page content cached. Use browser-navigate first.';
          const lines = _currentPage.text.split('\n')
            .filter(l => l.toLowerCase().includes(keyword.toLowerCase()))
            .slice(0, 30);
          return lines.length
            ? `Found ${lines.length} matches for "${keyword}":\n\n${lines.join('\n')}`
            : `No matches found for "${keyword}" on the current page.`;
        }

        return 'Provide either a "selector" or "keyword" parameter.';
      }
    });

    /* ── browser-links ── */
    ToolRegistry.register({
      id: 'browser-links',
      name: 'Get Page Links',
      description: 'Get all links from the current page. Useful for finding navigation, resources, or related pages.',
      schema: { type: 'object', properties: {} },
      execute: async () => {
        if (!_currentPage) return 'No page loaded. Use browser-navigate first.';
        const links = _currentPage.links || [];
        return links.length
          ? `Found ${links.length} links on ${_currentPage.url}:\n\n${links.map((l, i) => `${i + 1}. ${l}`).join('\n')}`
          : 'No external links found on this page.';
      }
    });

    /* ── browser-search ── */
    ToolRegistry.register({
      id: 'browser-search',
      name: 'Web Search',
      description: 'Search the web using DuckDuckGo. Returns search results with titles and URLs. Use this to find pages before navigating to them.',
      schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' }
        },
        required: ['query']
      },
      execute: async ({ query }) => {
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const page = await _fetchPage(searchUrl, { noCache: true });
        // DuckDuckGo results are in the text
        const results = page.text.split('\n')
          .filter(l => l.trim().length > 10)
          .slice(0, 20)
          .join('\n');
        const links = (page.links || [])
          .filter(l => !l.includes('duckduckgo.com') && !l.includes('duck.co'))
          .slice(0, 10);
        return `Search results for "${query}":\n\n${results}\n\nTop Links:\n${links.map((l, i) => `${i + 1}. ${l}`).join('\n')}`;
      }
    });

    /* ── browser-back ── */
    ToolRegistry.register({
      id: 'browser-back',
      name: 'Go Back',
      description: 'Navigate back to the previous page in browser history.',
      schema: { type: 'object', properties: {} },
      execute: async () => {
        if (_historyIndex <= 0) return 'No previous page in history.';
        _historyIndex--;
        const url = _history[_historyIndex];
        _currentUrl = url;
        if (typeof PreviewPanel !== 'undefined') PreviewPanel.loadURL(url);
        const page = await _fetchPage(url);
        _currentPage = page;
        return `Went back to: ${page.title} (${page.url})`;
      }
    });

    _initialized = true;
    if (typeof AuditLog !== 'undefined') AuditLog.log('Browser tools registered');
  }

  /* ── Public API ── */
  function getCurrentUrl() { return _currentUrl; }
  function getCurrentPage() { return _currentPage; }
  function getHistory() { return [..._history]; }
  function clearCache() { _pageCache = {}; }

  // Auto-init when ToolRegistry is available
  if (typeof ToolRegistry !== 'undefined') init();

  return { init, getCurrentUrl, getCurrentPage, getHistory, clearCache };
})();
