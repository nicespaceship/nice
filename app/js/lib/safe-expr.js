/* ═══════════════════════════════════════════════════════════════════
   NICE — SafeExpr
   Small expression languages evaluated by a parser, never by eval or
   new Function. Expressions come from LLMs (the calculator tool) and
   from saved mission plans (workflow conditions), so they must not be
   able to reach anything but the values they are given.

   SafeExpr.arithmetic('PI * 5^2')       → 78.53…
     numbers (5, 1.5e-2), + - * / % ** ^ (power), parentheses, unary -,
     constants PI and E, functions sqrt abs ceil floor round log log2
     log10 sin cos tan pow min max (any case). Must give a finite number.

   SafeExpr.condition('result.length > 100 && !result.text.includes("error")', { result })
     literals (numbers, 'strings', "strings", true, false, null), the
     names in `scope`, members of plain scope objects, string .length and
     a few string methods (includes, startsWith, endsWith, indexOf,
     toLowerCase, toUpperCase, trim), ! && || == != === !== < <= > >=
     + - * / % **, parentheses. A boolean or number given as the whole
     expression counts as that value. Returns a boolean.
═══════════════════════════════════════════════════════════════════ */

const SafeExpr = (() => {
  // Long sums are fine (operator chains parse in a loop); nesting is what
  // costs, and MAX_DEPTH caps it.
  const MAX_LENGTH = { arithmetic: 10000, condition: 2000 };
  const MAX_DEPTH = 64;
  const MAX_STRING = 1000000;   // a condition cannot build strings past this

  const OPS = ['===', '!==', '**', '==', '!=', '<=', '>=', '&&', '||', '(', ')', ',', '.', '!', '<', '>', '+', '-', '*', '/', '%', '^'];
  const BINARY = {
    '||': 1, '&&': 2,
    '==': 3, '!=': 3, '===': 3, '!==': 3,
    '<': 4, '<=': 4, '>': 4, '>=': 4,
    '+': 5, '-': 5,
    '*': 6, '/': 6, '%': 6,
    '**': 7, '^': 7,
  };
  const UNARY_BP = 6.5; // tighter than * but looser than **, so -2^2 = -(2^2) = -4
  const MEMBER_BP = 9;

  const MATH_FNS = {
    sqrt: Math.sqrt, abs: Math.abs, ceil: Math.ceil, floor: Math.floor, round: Math.round,
    log: Math.log, log2: Math.log2, log10: Math.log10, sin: Math.sin, cos: Math.cos, tan: Math.tan,
    pow: Math.pow, min: Math.min, max: Math.max,
  };
  const MATH_CONSTS = { pi: Math.PI, e: Math.E };
  const STRING_METHODS = new Set(['includes', 'startsWith', 'endsWith', 'indexOf', 'toLowerCase', 'toUpperCase', 'trim']);

  function fail(msg) { throw new Error(msg); }

  function tokenize(src) {
    const tokens = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
        tokens.push({ t: 'num', v: Number(m[0]) });
        i += m[0].length;
        continue;
      }
      if (c === '"' || c === "'") {
        let s = '';
        let j = i + 1;
        for (; j < src.length && src[j] !== c; j++) {
          if (src[j] === '\\') {
            const n = src[++j];
            s += n === 'n' ? '\n' : n === 't' ? '\t' : (n === undefined ? '' : n);
          } else s += src[j];
        }
        if (j >= src.length) fail('Unclosed string');
        tokens.push({ t: 'str', v: s });
        i = j + 1;
        continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
        tokens.push({ t: 'id', v: m[0] });
        i += m[0].length;
        continue;
      }
      const op = OPS.find(o => src.startsWith(o, i));
      if (!op) fail('Unexpected character: ' + c);
      tokens.push({ t: 'op', v: op });
      i += op.length;
    }
    return tokens;
  }

  function parse(src, mode) {
    if (typeof src === 'number' || typeof src === 'boolean') src = String(src);
    if (typeof src !== 'string' || !src.trim()) fail('Expression is empty');
    if (src.length > MAX_LENGTH[mode]) fail('Expression is too long');
    const tokens = tokenize(src);
    let pos = 0;
    let depth = 0;
    const peek = () => tokens[pos];
    const isOp = (v) => tokens[pos] && tokens[pos].t === 'op' && tokens[pos].v === v;
    const expectOp = (v) => { if (!isOp(v)) fail('Expected "' + v + '"'); pos++; };

    function args() {
      const list = [];
      expectOp('(');
      if (!isOp(')')) {
        do { list.push(expr(0)); } while (isOp(',') && ++pos);
      }
      expectOp(')');
      return list;
    }

    function nud() {
      const tok = tokens[pos++];
      if (!tok) fail('Unexpected end of expression');
      if (tok.t === 'num') return { k: 'lit', v: tok.v };
      if (tok.t === 'str') {
        if (mode === 'arithmetic') fail('Strings are not allowed here');
        return { k: 'lit', v: tok.v };
      }
      if (tok.t === 'id') {
        if (mode === 'arithmetic') {
          const name = tok.v.toLowerCase();
          if (isOp('(')) {
            if (!Object.prototype.hasOwnProperty.call(MATH_FNS, name)) fail('Unknown function: ' + tok.v);
            return { k: 'fn', name, args: args() };
          }
          if (!Object.prototype.hasOwnProperty.call(MATH_CONSTS, name)) fail('Unknown name: ' + tok.v);
          return { k: 'lit', v: MATH_CONSTS[name] };
        }
        if (tok.v === 'true') return { k: 'lit', v: true };
        if (tok.v === 'false') return { k: 'lit', v: false };
        if (tok.v === 'null') return { k: 'lit', v: null };
        return { k: 'name', v: tok.v };
      }
      if (tok.v === '(') { const e = expr(0); expectOp(')'); return e; }
      if (tok.v === '-' || tok.v === '+' || (tok.v === '!' && mode !== 'arithmetic')) {
        return { k: 'unary', op: tok.v, a: expr(UNARY_BP) };
      }
      fail('Unexpected "' + tok.v + '"');
    }

    function expr(rbp) {
      if (++depth > MAX_DEPTH) fail('Expression is nested too deeply');
      let left = nud();
      for (;;) {
        const tok = peek();
        if (!tok || tok.t !== 'op') break;
        if (tok.v === '.' && mode !== 'arithmetic') {
          if (MEMBER_BP <= rbp) break;
          pos++;
          const prop = tokens[pos++];
          if (!prop || prop.t !== 'id') fail('Expected a name after "."');
          left = isOp('(') ? { k: 'call', obj: left, name: prop.v, args: args() } : { k: 'member', obj: left, name: prop.v };
          continue;
        }
        const bp = BINARY[tok.v];
        if (bp === undefined || bp <= rbp) break;
        if (mode === 'arithmetic' && !['+', '-', '*', '/', '%', '**', '^'].includes(tok.v)) fail('Operator not allowed: ' + tok.v);
        if (mode !== 'arithmetic' && tok.v === '^') fail('Operator not allowed: ^');
        pos++;
        // Power is right-associative (2^3^2 = 2^9): its right side binds one notch lower.
        const right = expr((tok.v === '**' || tok.v === '^') ? bp - 1 : bp);
        left = { k: 'bin', op: tok.v, a: left, b: right };
      }
      depth--;
      return left;
    }

    const ast = expr(0);
    if (pos < tokens.length) fail('Unexpected "' + tokens[pos].v + '"');
    return ast;
  }

  const isPlainObject = (o) => o !== null && typeof o === 'object' && Object.getPrototypeOf(o) === Object.prototype;

  function evaluate(node, scope) {
    switch (node.k) {
      case 'lit': return node.v;
      case 'name':
        if (!scope || !Object.prototype.hasOwnProperty.call(scope, node.v)) fail('Unknown name: ' + node.v);
        return scope[node.v];
      case 'member': {
        const obj = evaluate(node.obj, scope);
        if (typeof obj === 'string' && node.name === 'length') return obj.length;
        if (isPlainObject(obj) && Object.prototype.hasOwnProperty.call(obj, node.name)) {
          const v = obj[node.name];
          if (typeof v === 'function') fail('Not a value: ' + node.name);
          return v;
        }
        fail('Unknown property: ' + node.name);
        break;
      }
      case 'call': {
        const obj = evaluate(node.obj, scope);
        if (typeof obj !== 'string' || !STRING_METHODS.has(node.name)) fail('Unknown method: ' + node.name);
        const a = node.args.map(x => evaluate(x, scope));
        if (a.some(v => typeof v === 'object' && v !== null)) fail('Bad argument to ' + node.name);
        return String.prototype[node.name].apply(obj, a);
      }
      case 'fn': {
        const a = node.args.map(x => evaluate(x, scope));
        return MATH_FNS[node.name].apply(null, a);
      }
      case 'unary': {
        const v = evaluate(node.a, scope);
        if (node.op === '!') return !v;
        if (typeof v !== 'number') fail('"' + node.op + '" needs a number');
        return node.op === '-' ? -v : v;
      }
      case 'bin': {
        if (node.op === '&&') return evaluate(node.a, scope) && evaluate(node.b, scope);
        if (node.op === '||') return evaluate(node.a, scope) || evaluate(node.b, scope);
        const a = evaluate(node.a, scope);
        const b = evaluate(node.b, scope);
        if ((typeof a === 'object' && a !== null) || (typeof b === 'object' && b !== null)) fail('Cannot compare objects');
        switch (node.op) {
          case '==': return a == b;   // eslint-disable-line eqeqeq
          case '!=': return a != b;   // eslint-disable-line eqeqeq
          case '===': return a === b;
          case '!==': return a !== b;
          case '<': return a < b;
          case '<=': return a <= b;
          case '>': return a > b;
          case '>=': return a >= b;
          case '+': {
            const v = a + b;
            if (typeof v === 'string' && v.length > MAX_STRING) fail('String is too long');
            return v;
          }
          case '-': return a - b;
          case '*': return a * b;
          case '/': return a / b;
          case '%': return a % b;
          case '**': case '^': return a ** b;
        }
      }
    }
    fail('Bad expression');
  }

  function arithmetic(src) {
    const v = evaluate(parse(src, 'arithmetic'), null);
    if (typeof v !== 'number' || !isFinite(v)) fail('Expression did not evaluate to a finite number');
    return v;
  }

  function condition(src, scope) {
    return !!evaluate(parse(src, 'condition'), scope || {});
  }

  return { arithmetic, condition };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SafeExpr;
