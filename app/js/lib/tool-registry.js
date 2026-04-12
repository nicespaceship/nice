/* ═══════════════════════════════════════════════════════════════════
   NICE — Tool Registry
   Registry of tools that agents can use during execution.
   Each tool has: id, name, description, execute(input), schema.
   Supports name/alias resolution so blueprints can reference tools by
   human-readable label (e.g. "Web Search" → "web-search").
═══════════════════════════════════════════════════════════════════ */

const ToolRegistry = (() => {

  const _tools = new Map();
  const _aliases = new Map(); // normalized name → tool id

  /* ── Normalize a label for fuzzy lookup ── */
  function _normalize(str) {
    if (!str || typeof str !== 'string') return '';
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  /* ── Register a tool ── */
  function register(tool) {
    if (!tool || !tool.id || !tool.name || typeof tool.execute !== 'function') {
      console.warn('[ToolRegistry] Invalid tool — must have id, name, execute:', tool);
      return false;
    }
    _tools.set(tool.id, {
      id:          tool.id,
      name:        tool.name,
      description: tool.description || '',
      schema:      tool.schema || {},
      execute:     tool.execute,
    });
    // Auto-alias on the display name so "Web Search" resolves to "web-search".
    // First-registration wins — later tools registering the same display name
    // (e.g. browser-search also named "Web Search") do not clobber the alias.
    // Explicit registerAlias() calls always override.
    const nameKey = _normalize(tool.name);
    if (nameKey && !_aliases.has(nameKey)) _aliases.set(nameKey, tool.id);
    // Always allow the bare id to resolve to itself
    const idKey = _normalize(tool.id);
    if (idKey && !_aliases.has(idKey)) _aliases.set(idKey, tool.id);
    return true;
  }

  /* ── Register an alias so blueprints can reference tools by friendly label ── */
  function registerAlias(alias, toolId) {
    if (!alias || !toolId) return false;
    _aliases.set(_normalize(alias), toolId);
    return true;
  }

  /* ── Get a tool by exact id ── */
  function get(id) {
    return _tools.get(id) || null;
  }

  /* ── Resolve a tool by id, display name, or alias ── */
  function resolve(nameOrId) {
    if (!nameOrId || typeof nameOrId !== 'string') return null;
    // 1. Direct id hit
    const direct = _tools.get(nameOrId);
    if (direct) return direct;
    // 2. Alias / normalized name lookup
    const normalized = _normalize(nameOrId);
    const aliasedId = _aliases.get(normalized);
    if (aliasedId) return _tools.get(aliasedId) || null;
    // 3. Try normalized id match (in case blueprint stores "Web-Search")
    for (const [id, tool] of _tools) {
      if (_normalize(id) === normalized) return tool;
    }
    return null;
  }

  /* ── Remove a tool by id ── */
  function deregister(id) {
    if (!id) return false;
    const existed = _tools.delete(id);
    // Clean up aliases pointing to this tool
    for (const [alias, targetId] of _aliases) {
      if (targetId === id) _aliases.delete(alias);
    }
    return existed;
  }

  /* ── List all registered tools ── */
  function list() {
    return Array.from(_tools.values());
  }

  /* ── Execute a tool by id, alias, or display name ── */
  async function execute(toolId, input) {
    const tool = resolve(toolId);
    if (!tool) throw new Error('Tool not found: ' + toolId);
    try {
      return await tool.execute(input);
    } catch (err) {
      throw new Error('Tool "' + toolId + '" failed: ' + (err.message || err));
    }
  }

  /* ── Get schemas for all tools (for inclusion in LLM system prompts) ── */
  function getSchemas() {
    const schemas = [];
    _tools.forEach(t => {
      schemas.push({
        id:          t.id,
        name:        t.name,
        description: t.description,
        schema:      t.schema,
      });
    });
    return schemas;
  }

  /* ═══ Built-in Tools ═══ */

  /* ── web-search: Real search via browser-proxy → DuckDuckGo ── */
  register({
    id:          'web-search',
    name:        'Web Search',
    description: 'Searches the web for information using DuckDuckGo. Returns real search results with titles, URLs, and snippets.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        limit: { type: 'number', description: 'Max number of results (default 5)' },
      },
      required: ['query'],
    },
    execute: async (input) => {
      if (typeof SB === 'undefined' || !SB.client) {
        throw new Error('Supabase not available — sign in to search the web');
      }
      const supabaseUrl = SB.client.supabaseUrl || SB.client._supabaseUrl || '';
      if (!supabaseUrl) throw new Error('Supabase URL not configured');
      const searchUrl = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(input.query);
      const res = await fetch(supabaseUrl + '/functions/v1/browser-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: searchUrl }),
      });
      if (!res.ok) throw new Error('Search failed (' + res.status + ')');
      const page = await res.json();
      if (page.error) throw new Error(page.error);
      // Extract results from the page text
      const limit = input.limit || 5;
      const lines = (page.text || '').split('\n').filter(l => l.trim().length > 10);
      const links = (page.links || [])
        .filter(l => !l.includes('duckduckgo.com') && !l.includes('duck.co'))
        .slice(0, limit);
      const content = lines.slice(0, limit * 4).join('\n');
      return 'Search results for "' + input.query + '":\n\n' + content +
        '\n\nTop Links:\n' + links.map(function(l, i) { return (i + 1) + '. ' + l; }).join('\n');
    },
  });

  /* ── code-gen: Generate code via LLM ── */
  register({
    id:          'code-gen',
    name:        'Code Generator',
    description: 'Generates code based on a prompt and optional language specification.',
    schema: {
      type: 'object',
      properties: {
        prompt:   { type: 'string', description: 'What code to generate' },
        language: { type: 'string', description: 'Target programming language (e.g. javascript, python)' },
      },
      required: ['prompt'],
    },
    execute: async (input) => {
      if (typeof SB === 'undefined' || !SB.functions) {
        throw new Error('Supabase functions not available');
      }
      const lang = input.language || 'javascript';
      const { data, error } = await SB.functions.invoke('nice-ai', {
        body: {
          messages: [{ role: 'user', content: `Generate ${lang} code for: ${input.prompt}\n\nReturn only the code, no explanation.` }],
          systemPrompt: `You are a ${lang} code generator. Output clean, production-ready code.`,
          config: { model: 'claude-haiku-4-5-20251001', max_tokens: 2048 },
        },
      });
      if (error) throw new Error(typeof error === 'string' ? error : error.message || 'Code generation failed');
      return data;
    },
  });

  /* ── data-transform: Parse and transform CSV/JSON data (client-side) ── */
  register({
    id:          'data-transform',
    name:        'Data Transform',
    description: 'Parses and transforms CSV or JSON data. Supports parse, filter, aggregate, and sort operations.',
    schema: {
      type: 'object',
      properties: {
        data:      { type: 'string', description: 'Raw CSV or JSON string to process' },
        format:    { type: 'string', enum: ['csv', 'json'], description: 'Input format (csv or json)' },
        operation: { type: 'string', enum: ['parse', 'filter', 'aggregate', 'sort'], description: 'Operation to perform' },
        field:     { type: 'string', description: 'Field name for filter/aggregate/sort operations' },
        value:     { type: 'string', description: 'Value to filter by (for filter operation)' },
        agg:       { type: 'string', enum: ['sum', 'avg', 'count', 'min', 'max'], description: 'Aggregation function (for aggregate operation)' },
        order:     { type: 'string', enum: ['asc', 'desc'], description: 'Sort order (for sort operation)' },
      },
      required: ['data'],
    },
    execute: async (input) => {
      let rows;

      // Parse input
      const format = input.format || (input.data.trim().startsWith('[') || input.data.trim().startsWith('{') ? 'json' : 'csv');

      if (format === 'csv') {
        rows = _parseCSV(input.data);
      } else {
        try {
          const parsed = JSON.parse(input.data);
          rows = Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
          throw new Error('Invalid JSON data: ' + e.message);
        }
      }

      const op = input.operation || 'parse';

      if (op === 'parse') {
        return { rows, count: rows.length };
      }

      if (op === 'filter') {
        if (!input.field) throw new Error('filter requires a "field" parameter');
        const filtered = rows.filter(r => String(r[input.field]) === String(input.value));
        return { rows: filtered, count: filtered.length };
      }

      if (op === 'aggregate') {
        if (!input.field) throw new Error('aggregate requires a "field" parameter');
        const fn = input.agg || 'count';
        const vals = rows.map(r => parseFloat(r[input.field])).filter(v => !isNaN(v));
        let result;
        if (fn === 'sum')   result = vals.reduce((a, b) => a + b, 0);
        if (fn === 'avg')   result = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        if (fn === 'count') result = vals.length;
        if (fn === 'min')   result = vals.length ? Math.min(...vals) : null;
        if (fn === 'max')   result = vals.length ? Math.max(...vals) : null;
        return { field: input.field, operation: fn, result };
      }

      if (op === 'sort') {
        if (!input.field) throw new Error('sort requires a "field" parameter');
        const order = input.order || 'asc';
        const sorted = [...rows].sort((a, b) => {
          const va = a[input.field], vb = b[input.field];
          const na = parseFloat(va), nb = parseFloat(vb);
          if (!isNaN(na) && !isNaN(nb)) return order === 'asc' ? na - nb : nb - na;
          return order === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
        });
        return { rows: sorted, count: sorted.length };
      }

      return { rows, count: rows.length };
    },
  });

  /* ── summarize: Summarize text via edge function ── */
  register({
    id:          'summarize',
    name:        'Summarizer',
    description: 'Summarizes long text into concise bullet points or a short paragraph.',
    schema: {
      type: 'object',
      properties: {
        text:   { type: 'string', description: 'The text to summarize' },
        style:  { type: 'string', enum: ['bullets', 'paragraph'], description: 'Summary style (default: paragraph)' },
        length: { type: 'string', enum: ['short', 'medium', 'long'], description: 'Summary length (default: short)' },
      },
      required: ['text'],
    },
    execute: async (input) => {
      if (typeof SB === 'undefined' || !SB.functions) {
        throw new Error('Supabase functions not available');
      }
      const style = input.style || 'paragraph';
      const len = input.length || 'short';
      const { data, error } = await SB.functions.invoke('nice-ai', {
        body: {
          messages: [{ role: 'user', content: `Summarize the following text as a ${len} ${style}:\n\n${input.text}` }],
          systemPrompt: 'You are a summarization assistant. Be concise and accurate.',
          config: { model: 'claude-haiku-4-5-20251001', max_tokens: 1024 },
        },
      });
      if (error) throw new Error(typeof error === 'string' ? error : error.message || 'Summarization failed');
      return data;
    },
  });

  /* ── calculator: Evaluate math expressions (client-side, safe eval) ── */
  register({
    id:          'calculator',
    name:        'Calculator',
    description: 'Evaluates mathematical expressions safely. Supports basic arithmetic, exponents, parentheses, and common math functions.',
    schema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Math expression to evaluate (e.g. "2 + 3 * 4", "sqrt(144)", "PI * 5^2")' },
      },
      required: ['expression'],
    },
    execute: async (input) => {
      const expr = input.expression;
      if (!expr || typeof expr !== 'string') throw new Error('Expression is required');
      return { expression: expr, result: _safeEval(expr) };
    },
  });

  /* ═══ Internal Helpers ═══ */

  /* ── Safe math evaluator (no arbitrary JS execution) ── */
  function _safeEval(expr) {
    // Whitelist: digits, operators, parentheses, dots, commas, whitespace, math function names
    const sanitized = expr
      .replace(/\^/g, '**')                          // caret to exponent
      .replace(/PI/gi, String(Math.PI))
      .replace(/E(?![a-z])/gi, String(Math.E))
      .replace(/sqrt/gi, 'Math.sqrt')
      .replace(/abs/gi, 'Math.abs')
      .replace(/ceil/gi, 'Math.ceil')
      .replace(/floor/gi, 'Math.floor')
      .replace(/round/gi, 'Math.round')
      .replace(/log10/gi, 'Math.log10')
      .replace(/log2/gi, 'Math.log2')
      .replace(/log/gi, 'Math.log')
      .replace(/sin/gi, 'Math.sin')
      .replace(/cos/gi, 'Math.cos')
      .replace(/tan/gi, 'Math.tan')
      .replace(/pow/gi, 'Math.pow')
      .replace(/min/gi, 'Math.min')
      .replace(/max/gi, 'Math.max');

    // Validate: only allow safe characters after substitution
    if (/[^0-9+\-*/().,%\s\w]/.test(sanitized)) {
      throw new Error('Invalid characters in expression');
    }
    // Block anything that looks like assignment, function declaration, or property access beyond Math
    if (/(?:function|=>|var |let |const |class |import |export |require|eval|new )/i.test(sanitized)) {
      throw new Error('Expression contains disallowed keywords');
    }

    try {
      const fn = new Function('return (' + sanitized + ')');
      const result = fn();
      if (typeof result !== 'number' || !isFinite(result)) {
        throw new Error('Expression did not evaluate to a finite number');
      }
      return result;
    } catch (e) {
      throw new Error('Failed to evaluate expression: ' + e.message);
    }
  }

  /* ── Simple CSV parser ── */
  function _parseCSV(csv) {
    const lines = csv.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      if (vals.length !== headers.length) continue;
      const row = {};
      headers.forEach((h, j) => { row[h] = vals[j]; });
      rows.push(row);
    }
    return rows;
  }

  /* ═══ Core Primitives ═══
     Universally-useful tools that don't require external auth.
     MCP-gated tools (Gmail, Slack, Jira, etc.) come from McpBridge.
  ═══ */

  /* ── fetch-url: HTTP GET via browser-proxy edge function ── */
  register({
    id:          'fetch-url',
    name:        'Fetch URL',
    description: 'Fetches the contents of a web page or API endpoint and returns cleaned text with links and metadata.',
    schema: {
      type: 'object',
      properties: {
        url:      { type: 'string', description: 'Full URL to fetch (must include https://)' },
        selector: { type: 'string', description: 'Optional CSS selector to extract a specific region of the page' },
      },
      required: ['url'],
    },
    execute: async (input) => {
      if (!input || !input.url) throw new Error('url is required');
      if (typeof SB === 'undefined' || !SB.client) {
        throw new Error('Supabase not available — sign in to fetch URLs');
      }
      const supabaseUrl = SB.client.supabaseUrl || SB.client._supabaseUrl || '';
      if (!supabaseUrl) throw new Error('Supabase URL not configured');
      const res = await fetch(supabaseUrl + '/functions/v1/browser-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: input.url, selector: input.selector || undefined }),
      });
      if (!res.ok) throw new Error('fetch-url ' + res.status + ': ' + (await res.text()));
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    },
  });

  /* ── current-time: Return current time / date in various formats ── */
  register({
    id:          'current-time',
    name:        'Current Time',
    description: 'Returns the current date and time. Use this whenever you need to know "now" — do not guess the date.',
    schema: {
      type: 'object',
      properties: {
        timezone: { type: 'string', description: 'IANA timezone name (e.g. America/Los_Angeles). Defaults to UTC.' },
        format:   { type: 'string', enum: ['iso', 'unix', 'human'], description: 'Output format (default iso)' },
      },
    },
    execute: async (input) => {
      const now = new Date();
      const fmt = (input && input.format) || 'iso';
      const tz = (input && input.timezone) || 'UTC';
      if (fmt === 'unix') return { unix: Math.floor(now.getTime() / 1000), iso: now.toISOString() };
      if (fmt === 'human') {
        try {
          return { human: new Intl.DateTimeFormat('en-US', {
            timeZone: tz, dateStyle: 'full', timeStyle: 'long',
          }).format(now), iso: now.toISOString() };
        } catch (e) {
          return { human: now.toString(), iso: now.toISOString() };
        }
      }
      return { iso: now.toISOString(), unix: Math.floor(now.getTime() / 1000) };
    },
  });

  /* ── parse-json: Safely parse a JSON string ── */
  register({
    id:          'parse-json',
    name:        'Parse JSON',
    description: 'Parses a JSON string into a structured object. Returns { parsed } or { error } if invalid.',
    schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The JSON string to parse' },
      },
      required: ['text'],
    },
    execute: async (input) => {
      if (!input || typeof input.text !== 'string') throw new Error('text is required');
      try {
        return { parsed: JSON.parse(input.text) };
      } catch (e) {
        return { error: 'Invalid JSON: ' + e.message };
      }
    },
  });

  /* ── extract-regex: Extract matches from text with a regex ── */
  register({
    id:          'extract-regex',
    name:        'Extract Regex',
    description: 'Extracts matches from text using a regular expression. Returns an array of matches (with capture groups).',
    schema: {
      type: 'object',
      properties: {
        text:    { type: 'string', description: 'The text to search' },
        pattern: { type: 'string', description: 'A JavaScript regex pattern (no leading/trailing slashes)' },
        flags:   { type: 'string', description: 'Regex flags, e.g. "gi" (default "g")' },
      },
      required: ['text', 'pattern'],
    },
    execute: async (input) => {
      if (!input || !input.text || !input.pattern) throw new Error('text and pattern are required');
      const flags = input.flags && /^[gimsuy]+$/.test(input.flags) ? input.flags : 'g';
      let re;
      try {
        re = new RegExp(input.pattern, flags.includes('g') ? flags : flags + 'g');
      } catch (e) {
        throw new Error('Invalid regex: ' + e.message);
      }
      const matches = [];
      let m;
      let guard = 0;
      while ((m = re.exec(input.text)) !== null && guard++ < 1000) {
        matches.push({ match: m[0], groups: m.slice(1), index: m.index });
        if (m.index === re.lastIndex) re.lastIndex++;
      }
      return { count: matches.length, matches };
    },
  });

  /* ── format-date: Format a date string or timestamp ── */
  register({
    id:          'format-date',
    name:        'Format Date',
    description: 'Formats a date (ISO string or unix timestamp) into a human-readable string using locale and timezone.',
    schema: {
      type: 'object',
      properties: {
        date:     { type: 'string', description: 'ISO date string or unix timestamp (string or number)' },
        locale:   { type: 'string', description: 'BCP 47 locale (default en-US)' },
        timezone: { type: 'string', description: 'IANA timezone name (default UTC)' },
        style:    { type: 'string', enum: ['short', 'medium', 'long', 'full'], description: 'Date style (default medium)' },
      },
      required: ['date'],
    },
    execute: async (input) => {
      if (!input || input.date === undefined) throw new Error('date is required');
      let d;
      if (typeof input.date === 'number' || /^\d+$/.test(String(input.date))) {
        const n = Number(input.date);
        d = new Date(n < 1e12 ? n * 1000 : n); // seconds vs ms
      } else {
        d = new Date(input.date);
      }
      if (isNaN(d.getTime())) throw new Error('Invalid date: ' + input.date);
      const locale = input.locale || 'en-US';
      const tz = input.timezone || 'UTC';
      const style = input.style || 'medium';
      try {
        const fmt = new Intl.DateTimeFormat(locale, {
          timeZone: tz, dateStyle: style, timeStyle: style,
        });
        return { formatted: fmt.format(d), iso: d.toISOString() };
      } catch (e) {
        return { formatted: d.toString(), iso: d.toISOString() };
      }
    },
  });

  /* ── delegate: Invoke another agent by role or name ── */
  register({
    id:          'delegate',
    name:        'Delegate to Agent',
    description: 'Delegate a subtask to another agent on the same spaceship by role (e.g. "Research", "Content") or by name. The other agent executes the subtask and returns the result.',
    schema: {
      type: 'object',
      properties: {
        role:   { type: 'string', description: 'Role of the agent to delegate to (e.g. "Research", "Engineering", "Content", "Marketing")' },
        name:   { type: 'string', description: 'Exact name of the agent (alternative to role)' },
        task:   { type: 'string', description: 'The subtask to delegate — be specific about what output you need' },
      },
      required: ['task'],
    },
    execute: async (input) => {
      if (!input || !input.task) throw new Error('task is required');
      const agents = (typeof State !== 'undefined' ? State.get('agents') : null) || [];
      if (!agents.length) throw new Error('No agents available to delegate to');

      // Find target agent by name or role
      let target = null;
      if (input.name) {
        target = agents.find(a => (a.name || '').toLowerCase() === input.name.toLowerCase());
      }
      if (!target && input.role) {
        target = agents.find(a => {
          const r = (a.config?.role || a.role || a.category || '').toLowerCase();
          return r === input.role.toLowerCase();
        });
      }
      if (!target) {
        // Fallback: pick the first agent with a matching keyword in name
        const keyword = (input.role || input.name || '').toLowerCase();
        target = agents.find(a => (a.name || '').toLowerCase().includes(keyword));
      }
      if (!target) throw new Error('No agent found matching role "' + (input.role || '') + '" or name "' + (input.name || '') + '"');

      // Build a minimal blueprint for the delegate
      const bp = {
        id: target.id,
        name: target.name,
        config: target.config || { role: target.role || 'General', tools: [], llm_engine: 'gemini-2.5-flash' },
        description: target.description || '',
        flavor: '',
      };

      // Execute via ShipLog (single-shot, no nested tool loops to prevent runaway)
      if (typeof ShipLog !== 'undefined') {
        const result = await ShipLog.execute('delegation', bp, input.task);
        return result ? result.content : 'No response from delegate agent.';
      }

      throw new Error('ShipLog not available for delegation');
    },
  });

  /* ═══ Alias Registrations ═══
     Map human-readable labels used by blueprints to actual tool ids.
     Auto-normalized lookup also handles case and spacing variants, but
     explicit aliases cover labels that don't share the tool's display name.
  ═══ */
  // Web search variants
  registerAlias('web search',       'web-search');
  registerAlias('search',           'web-search');
  registerAlias('google search',    'web-search');
  registerAlias('google',           'web-search');
  registerAlias('scraping',         'web-search');
  // Summarize variants
  registerAlias('summary gen',      'summarize');
  registerAlias('summary',          'summarize');
  registerAlias('text summary',     'summarize');
  // Calculator variants
  registerAlias('math',             'calculator');
  registerAlias('compute',          'calculator');
  // Code-gen variants
  registerAlias('code review',      'code-gen');
  registerAlias('code',             'code-gen');
  registerAlias('actions builder',  'code-gen');
  // Data transform variants
  registerAlias('analytics',        'data-transform');
  registerAlias('data',             'data-transform');
  registerAlias('database',         'data-transform');
  registerAlias('query',            'data-transform');
  // Fetch URL variants
  registerAlias('http',             'fetch-url');
  registerAlias('http request',     'fetch-url');
  registerAlias('browser',          'fetch-url');
  registerAlias('repo analytics',   'fetch-url');
  // Time variants
  registerAlias('now',              'current-time');
  registerAlias('datetime',         'current-time');
  registerAlias('clock',            'current-time');

  // Delegate variants
  registerAlias('hand off',         'delegate');
  registerAlias('assign',           'delegate');
  registerAlias('ask agent',        'delegate');

  return { register, registerAlias, deregister, get, resolve, list, execute, getSchemas };
})();
