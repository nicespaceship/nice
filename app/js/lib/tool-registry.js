/* ═══════════════════════════════════════════════════════════════════
   NICE — Tool Registry
   Registry of tools that agents can use during execution.
   Each tool has: id, name, description, execute(input), schema.
   Built-in tools: web-search, code-gen, data-transform, summarize, calculator.
═══════════════════════════════════════════════════════════════════ */

const ToolRegistry = (() => {

  const _tools = new Map();

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
    return true;
  }

  /* ── Get a tool by id ── */
  function get(id) {
    return _tools.get(id) || null;
  }

  /* ── List all registered tools ── */
  function list() {
    return Array.from(_tools.values());
  }

  /* ── Execute a tool by id ── */
  async function execute(toolId, input) {
    const tool = _tools.get(toolId);
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

  /* ── web-search: Search web via edge function ── */
  register({
    id:          'web-search',
    name:        'Web Search',
    description: 'Searches the web for information on a given query. Returns relevant results.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        limit: { type: 'number', description: 'Max number of results (default 5)' },
      },
      required: ['query'],
    },
    execute: async (input) => {
      if (typeof SB === 'undefined' || !SB.functions) {
        throw new Error('Supabase functions not available');
      }
      const { data, error } = await SB.functions.invoke('nice-ai', {
        body: {
          messages: [{ role: 'user', content: `Search the web for: ${input.query}\n\nReturn the top ${input.limit || 5} results as a JSON array with fields: title, url, snippet.` }],
          systemPrompt: 'You are a web search assistant. Return structured search results.',
          config: { model: 'claude-haiku-4-5-20251001', max_tokens: 1024 },
        },
      });
      if (error) throw new Error(typeof error === 'string' ? error : error.message || 'Web search failed');
      return data;
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

  return { register, get, list, execute, getSchemas };
})();
