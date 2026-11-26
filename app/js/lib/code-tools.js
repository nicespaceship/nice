/* ═══════════════════════════════════════════════════════════════════
   NICE — CodeTools
   The Code agent's tools: read, list and search the open folder, edit and
   write files, run commands. Each calls the desktop host
   (window.NiceDesktop.code, see desktop/code-host.js), so they exist only
   in the desktop app. AgentExecutor runs a tool only for an agent given
   it, so no other agent can reach these.

   Reads, listings and searches run without asking. Edits, writes and
   commands are side effects: in review mode ToolRegistry asks the Code
   view first (its permission prompt), which can allow once, allow for the
   session, or deny.
═══════════════════════════════════════════════════════════════════ */

const CodeTools = (() => {
  const READ_LIMIT = 2000;          // lines per read unless the agent asks for a slice
  const OUTPUT_FOR_MODEL = 12000;   // characters of command output the model sees per stream

  // Commands the agent runs carry tags starting with this, so the Code view
  // can show their output and stop them.
  const AGENT_TAG = 'agent-';
  let _runSeq = 0;

  const host = () => (typeof window !== 'undefined' && window.NiceDesktop && window.NiceDesktop.code) || null;

  // Errors from the host are plain { code, message } objects (the context
  // bridge drops Error properties); give the model one readable line.
  function _fail(e) {
    const err = new Error((e && e.message) || String(e));
    if (e && e.code) err.code = e.code;
    throw err;
  }

  async function _call(fn) {
    const h = host();
    if (!h) throw new Error('Code runs in the NICE desktop app; there is no folder open here.');
    try { return await fn(h); } catch (e) { _fail(e); }
  }

  const _cut = (s, max) => {
    s = String(s || '');
    if (s.length <= max) return s;
    const half = Math.floor(max / 2);
    return s.slice(0, half) + '\n… [' + (s.length - max) + ' characters cut] …\n' + s.slice(-half);
  };

  const TOOLS = [
    {
      id: 'code-read',
      name: 'read_file',
      sideEffect: false,
      description: 'Read a text file in the open folder. Returns its content and line numbers. Read a file before editing it.',
      schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path relative to the open folder' },
          offset: { type: 'number', description: 'Line to start from, 0-based (optional)' },
          limit: { type: 'number', description: 'How many lines to read (optional, default ' + READ_LIMIT + ')' },
        },
        required: ['path'],
      },
      run: (h, input) => h.read(input.path, { offset: input.offset || 0, limit: input.limit || READ_LIMIT }).then(r => {
        const notes = [
          r.encoding === 'lossy' ? 'Not exact UTF-8: some bytes could not be shown. Do not rewrite this file with write_file.' : '',
          r.linesCut ? 'Some very long lines were cut.' : '',
        ].filter(Boolean);
        return {
          path: r.path, startLine: r.startLine, endLine: r.endLine, totalLines: r.totalLines,
          ...(notes.length ? { note: notes.join(' ') } : {}),
          content: r.content,
        };
      }),
    },
    {
      id: 'code-list',
      name: 'list_files',
      sideEffect: false,
      description: 'List the files and folders in a folder of the open folder.',
      schema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Folder path relative to the open folder (default: the folder itself)' } },
      },
      run: (h, input) => h.list(input.path || '.'),
    },
    {
      id: 'code-search',
      name: 'search_files',
      sideEffect: false,
      description: 'Search file contents in the open folder with a regular expression. Returns matching lines with their paths and line numbers.',
      schema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regular expression to look for' },
          path: { type: 'string', description: 'Folder to search in, relative to the open folder (optional)' },
          glob: { type: 'string', description: 'Only files matching this glob, e.g. "*.js" or "src/**/*.ts" (optional)' },
          ignore_case: { type: 'boolean', description: 'Case-insensitive (optional)' },
        },
        required: ['pattern'],
      },
      run: (h, input) => h.search(input.pattern, { dir: input.path || '.', glob: input.glob || '', ignoreCase: input.ignore_case === true }),
    },
    {
      id: 'code-edit',
      name: 'edit_file',
      sideEffect: true,
      description: 'Replace exact text in a file. old_text must appear exactly once unless replace_all is true; include enough surrounding lines to make it unique. Prefer this over write_file for changes to existing files.',
      schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path relative to the open folder' },
          old_text: { type: 'string', description: 'The exact text to replace' },
          new_text: { type: 'string', description: 'The text to put in its place' },
          replace_all: { type: 'boolean', description: 'Replace every occurrence (optional)' },
        },
        required: ['path', 'old_text', 'new_text'],
      },
      run: (h, input) => h.edit(input.path, input.old_text, input.new_text, { replaceAll: input.replace_all === true })
        .then(r => ({ path: r.path, replacements: r.replacements })),
    },
    {
      id: 'code-write',
      name: 'write_file',
      sideEffect: true,
      description: 'Create a file, or replace a whole file, with the given content. Folders are created as needed.',
      schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path relative to the open folder' },
          content: { type: 'string', description: 'The full file content' },
        },
        required: ['path', 'content'],
      },
      run: (h, input) => h.write(input.path, input.content).then(r => ({ path: r.path, created: r.created, bytes: r.bytes })),
    },
    {
      id: 'code-run',
      name: 'run_command',
      sideEffect: true,
      description: 'Run a shell command in the open folder and return its exit code and output. Commands are one-shot: no input, and anything left in the background stops when the command ends.',
      schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The command to run' },
          timeout_ms: { type: 'number', description: 'Time limit in milliseconds (optional, default 120000, max 600000)' },
        },
        required: ['command'],
      },
      run: (h, input) => h.run(input.command, { timeoutMs: input.timeout_ms, tag: AGENT_TAG + (++_runSeq) }).then(r => ({
        exitCode: r.exitCode,
        ...(r.timedOut ? { timedOut: true } : {}),
        ...(r.killed ? { stopped: true } : {}),
        ...(r.stoppedBackground ? { note: 'Background processes it left were stopped.' } : {}),
        ...(r.error ? { error: r.error } : {}),
        stdout: _cut(r.stdout, OUTPUT_FOR_MODEL),
        stderr: _cut(r.stderr, OUTPUT_FOR_MODEL),
      })),
    },
  ];

  const IDS = TOOLS.map(t => t.id);
  const _byKey = new Map();
  TOOLS.forEach(t => { _byKey.set(t.id, t); _byKey.set(t.name, t); });

  let _registered = false;
  function register() {
    if (_registered || typeof ToolRegistry === 'undefined') return _registered;
    TOOLS.forEach(t => ToolRegistry.register({
      id: t.id,
      name: t.name,
      description: t.description,
      schema: t.schema,
      sideEffect: t.sideEffect,
      execute: (input, ctx) => _call(h => t.run(h, input || {}, ctx)),
    }));
    _registered = true;
    return true;
  }

  /** The tool for an id or a model-facing name, or null. */
  function get(key) {
    return _byKey.get(key) || null;
  }

  /**
   * What a call does, in words for the conversation and the permission
   * prompt: { kind: 'read'|'list'|'search'|'edit'|'write'|'run', title, path?, command? }.
   */
  function describe(key, input) {
    const t = get(key);
    const i = input || {};
    if (!t) return { kind: 'other', title: String(key) };
    switch (t.id) {
      case 'code-read': return { kind: 'read', title: 'Read ' + (i.path || ''), path: i.path };
      case 'code-list': return { kind: 'list', title: 'Listed ' + (i.path || 'the folder'), path: i.path };
      case 'code-search': return { kind: 'search', title: 'Searched for ' + (i.pattern || '') + (i.glob ? ' in ' + i.glob : ''), path: i.path };
      case 'code-edit': return { kind: 'edit', title: 'Edit ' + (i.path || ''), path: i.path };
      case 'code-write': return { kind: 'write', title: 'Write ' + (i.path || ''), path: i.path };
      case 'code-run': return { kind: 'run', title: 'Run ' + (i.command || ''), command: i.command };
    }
    return { kind: 'other', title: t.name };
  }

  /** The words of a command that "always allow" remembers: its first two (e.g. "npm test", "git status"). */
  function commandPrefix(command) {
    return String(command || '').trim().split(/\s+/).slice(0, 2).join(' ');
  }

  /* First words whose allowance would run anything: shells, interpreters
     and wrappers that take a whole command as an argument. */
  const OPEN_ENDED = new Set(['sh', 'bash', 'zsh', 'fish', 'dash', 'ksh', 'csh', 'tcsh', 'env', 'sudo', 'doas', 'su',
    'xargs', 'eval', 'exec', 'command', 'builtin', 'nohup', 'time', 'timeout', 'nice', 'watch', 'ssh', 'osascript',
    'node', 'deno', 'bun', 'python', 'python2', 'python3', 'ruby', 'perl', 'php', 'lua', 'npx', 'pnpx', 'bunx', 'uvx',
    'find', 'awk', 'sed', 'open', 'cmd', 'powershell', 'pwsh', 'wsl', 'start', 'caffeinate', 'stdbuf', 'script',
    'arch', 'chroot', 'unbuffer', 'nsenter', 'flock', 'parallel', 'make']);
  // Subcommands that run other code or set what later runs: npm exec,
  // pnpm dlx, git config (a pager or "!" alias is a shell command).
  const OPEN_ENDED_PAIRS = new Set(['npm exec', 'npm x', 'pnpm exec', 'pnpm dlx', 'yarn exec', 'yarn dlx', 'bun x', 'bun exec',
    'git config', 'git -c', 'docker run', 'docker exec', 'kubectl exec']);

  /* A command "always allow" may cover: one program and its arguments, with
     no shell operators, so "npm test && rm -rf ~" is never covered by an
     allowance for "npm test". */
  function isSimpleCommand(command) {
    const c = String(command || '').trim();
    return !!c && !/[;&|`$<>\n\r(){}\\]/.test(c);
  }

  /* Whether "always allow" may be offered for this command: simple, two
     words at least, a program that does not run other code given to it,
     and a second word that is not a flag (so "git -c ..." or "npm --prefix"
     are asked about each time). */
  function canRemember(command) {
    if (!isSimpleCommand(command)) return false;
    const words = String(command).trim().split(/\s+/);
    if (words.length < 2) return false;
    const prog = words[0].split('/').pop().toLowerCase();
    if (OPEN_ENDED.has(prog) || /^python\d/.test(prog) || /[=*?\[\]~'"]/.test(words[0] + words[1])) return false;
    if (OPEN_ENDED_PAIRS.has(prog + ' ' + words[1].toLowerCase())) return false;
    // A flag, in its Unix or Windows form (cmd /c), is asked about each time.
    return !/^[-/]/.test(words[1]);
  }

  /** Whether an allowance for `prefix` covers `command`. */
  function prefixCovers(prefix, command) {
    if (!isSimpleCommand(command)) return false;
    const words = String(command).trim().split(/\s+/);
    const want = String(prefix).split(' ');
    return want.every((w, i) => words[i] === w);
  }

  return { IDS, TOOLS, AGENT_TAG, register, get, describe, commandPrefix, isSimpleCommand, canRemember, prefixCovers, READ_LIMIT };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CodeTools;
