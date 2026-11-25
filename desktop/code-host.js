/**
 * NICE Desktop — Code host
 *
 * The file and shell work behind Code, in plain Node so it can be tested
 * without Electron. main.js wires it to IPC; the renderer reaches it only
 * through preload.js (window.NiceDesktop.code).
 *
 * Every path is resolved inside one workspace folder the user picked with
 * the native folder dialog. A path that leaves it, directly or through a
 * symlink (dangling ones included), is refused, and writes never follow a
 * symlink. Commands run with the workspace as their working directory,
 * with no stdin, a timeout that ends in SIGKILL, and capped output.
 * Searches run in a worker thread with a time limit, so a pathological
 * pattern cannot stall the app.
 */

'use strict';

const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { Worker } = require('worker_threads');

const MAX_READ_BYTES = 2 * 1024 * 1024;   // files larger than this are refused
const MAX_LINE_CHARS = 2000;              // longer lines come back cut, with a marker
const MAX_OUTPUT_CHARS = 30000;           // per stream, per command
const DEFAULT_TIMEOUT_MS = 120000;
const MAX_TIMEOUT_MS = 600000;
const KILL_GRACE_MS = 2000;               // SIGTERM, then SIGKILL after this
const CLOSE_GRACE_MS = 500;               // after exit, wait this long for output to drain
const MAX_LIST_ENTRIES = 1000;
const MAX_SEARCH_MATCHES = 200;
const SEARCH_TIMEOUT_MS = 10000;
const SEARCH_MAX_FILES = 20000;
const SKIP_DIRS = ['.git', 'node_modules', '.hg', '.svn', 'dist', 'build', '.next', '.cache', 'coverage'];
const POSIX_SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const O_NOFOLLOW = fs.constants.O_NOFOLLOW || 0;

let _nextRunId = 1;     // unique across workspaces, so ids never collide
let _loginPath = null;  // PATH from the user's login shell, read once

class CodeHostError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function _isInside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
}

/* Real path of `p`: the deepest part that exists, resolved, with the rest
   appended, so a new file inside a symlinked folder is judged by where it
   really lands. A symlink that exists but points nowhere is refused: a
   write through it would create its target, wherever that is. */
async function _realish(p) {
  let head = p;
  const tail = [];
  for (;;) {
    try {
      const real = await fsp.realpath(head);
      return tail.length ? path.join(real, ...tail.reverse()) : real;
    } catch (e) {
      if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') throw e;
      let st = null;
      try { st = await fsp.lstat(head); } catch { /* really missing */ }
      if (st && st.isSymbolicLink()) throw new CodeHostError('ELINK', 'Path goes through a symlink that points nowhere: ' + head);
      const parent = path.dirname(head);
      if (parent === head) return p;
      tail.push(path.basename(head));
      head = parent;
    }
  }
}

function _shell() {
  if (process.platform === 'win32') return { file: process.env.ComSpec || 'cmd.exe', args: (c) => ['/d', '/s', '/c', '"' + c + '"'], verbatim: true };
  const user = process.env.SHELL || '';
  const file = POSIX_SHELLS.has(path.basename(user)) ? user : (process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh');
  return { file, args: (c) => ['-c', c], verbatim: false };
}

/* An app opened from the Finder gets a bare PATH (/usr/bin:/bin:…), so
   Homebrew's node, npm and git are missing. Ask the login shell once. */
function _commandPath() {
  if (_loginPath !== null) return Promise.resolve(_loginPath);
  if (process.platform === 'win32') return Promise.resolve((_loginPath = process.env.PATH || ''));
  const sh = _shell();
  return new Promise((resolve) => {
    execFile(sh.file, ['-l', '-c', 'printf %s "$PATH"'], { timeout: 5000, env: process.env }, (err, stdout) => {
      _loginPath = (!err && stdout && stdout.trim()) ? stdout.trim() : (process.env.PATH || '');
      resolve(_loginPath);
    });
  });
}

/* Commands get the user's environment minus what only matters to the app
   itself (Electron and Node switches that would change how tools run). */
function _commandEnv(pathVar) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('ELECTRON_') || k === 'NODE_OPTIONS' || k.startsWith('npm_')) continue;
    env[k] = v;
  }
  env.PATH = pathVar;
  return env;
}

class Workspace {
  constructor(root) {
    this.root = root;
    this._procs = new Map();
  }

  static async open(dir) {
    if (typeof dir !== 'string' || !dir) throw new CodeHostError('EINVAL', 'No folder given.');
    const real = await fsp.realpath(path.resolve(dir));
    const st = await fsp.stat(real);
    if (!st.isDirectory()) throw new CodeHostError('ENOTDIR', 'Not a folder: ' + dir);
    return new Workspace(real);
  }

  /** True for folders too broad to hand to an agent without asking: the disk root or the home folder. */
  static isBroad(dir) {
    const p = path.resolve(dir);
    return p === path.parse(p).root || p === os.homedir();
  }

  /** Absolute path for `p` (relative to the workspace, or absolute inside it). */
  async resolve(p) {
    if (typeof p !== 'string') throw new CodeHostError('EINVAL', 'Path must be a string.');
    if (p.includes('\0')) throw new CodeHostError('EINVAL', 'Path contains a NUL byte.');
    const abs = path.resolve(this.root, p || '.');
    if (!_isInside(this.root, abs)) throw new CodeHostError('EOUTSIDE', 'Path is outside the workspace: ' + p);
    const real = await _realish(abs);
    if (!_isInside(this.root, real)) throw new CodeHostError('EOUTSIDE', 'Path leads outside the workspace: ' + p);
    return real;
  }

  rel(abs) {
    return path.relative(this.root, abs) || '.';
  }

  async _readText(abs, p) {
    const st = await fsp.stat(abs);
    if (st.isDirectory()) throw new CodeHostError('EISDIR', 'Is a folder: ' + p);
    if (!st.isFile()) throw new CodeHostError('ENOTFILE', 'Not a regular file: ' + p);
    if (st.size > MAX_READ_BYTES) throw new CodeHostError('ETOOBIG', `File is ${st.size} bytes; the limit is ${MAX_READ_BYTES}.`);
    const buf = await fsp.readFile(abs);
    if (buf.includes(0)) throw new CodeHostError('EBINARY', 'Binary file: ' + p);
    const text = buf.toString('utf8');
    return { text, exact: Buffer.from(text, 'utf8').equals(buf), mode: st.mode };
  }

  /* Write without following a symlink at the last step, via a temporary
     file renamed into place so a failed write never leaves half a file. */
  async _writeText(abs, content, mode) {
    const dir = path.dirname(abs);
    const tmp = path.join(dir, '.' + path.basename(abs) + '.nice-' + process.pid + '-' + Date.now() + '.tmp');
    const fh = await fsp.open(tmp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW, mode || 0o666);
    try {
      await fh.writeFile(content, 'utf8');
    } finally {
      await fh.close();
    }
    try {
      await fsp.rename(tmp, abs);
    } catch (e) {
      await fsp.unlink(tmp).catch(() => {});
      throw e;
    }
  }

  async readFile(p, { offset = 0, limit = 0 } = {}) {
    const abs = await this.resolve(p);
    const { text } = await this._readText(abs, p);
    const lines = text.split('\n');
    const endsWithNewline = lines.length > 1 && lines[lines.length - 1] === '';
    if (endsWithNewline) lines.pop();
    const start = Math.max(0, offset | 0);
    const end = limit > 0 ? Math.min(lines.length, start + (limit | 0)) : lines.length;
    let cut = false;
    const slice = lines.slice(start, end).map((l) => {
      if (l.length <= MAX_LINE_CHARS) return l;
      cut = true;
      return l.slice(0, MAX_LINE_CHARS) + ' … [line cut at ' + MAX_LINE_CHARS + ' characters]';
    });
    // The content is exactly the lines asked for, with the file's final newline when they reach the end.
    const content = slice.join('\n') + (endsWithNewline && end === lines.length && slice.length ? '\n' : '');
    return { path: this.rel(abs), content, totalLines: lines.length, startLine: start + 1, endLine: end, linesCut: cut };
  }

  async writeFile(p, content) {
    if (typeof content !== 'string') throw new CodeHostError('EINVAL', 'Content must be a string.');
    const abs = await this.resolve(p);
    let existed = false;
    let mode;
    try {
      const st = await fsp.lstat(abs);
      if (st.isDirectory()) throw new CodeHostError('EISDIR', 'Is a folder: ' + p);
      if (!st.isFile()) throw new CodeHostError('ENOTFILE', 'Not a regular file: ' + p);
      existed = true;
      mode = st.mode & 0o7777;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    // The folders just made could have been swapped for a link: check again.
    if (!_isInside(this.root, await _realish(path.dirname(abs)))) throw new CodeHostError('EOUTSIDE', 'Path leads outside the workspace: ' + p);
    await this._writeText(abs, content, mode);
    return { path: this.rel(abs), created: !existed, bytes: Buffer.byteLength(content) };
  }

  /**
   * Replace `oldText` with `newText`. `oldText` must occur exactly once
   * unless replaceAll. Files that are not valid UTF-8 are refused rather
   * than rewritten. In a CRLF file, LF line ends in both texts match CRLF.
   */
  async editFile(p, oldText, newText, { replaceAll = false } = {}) {
    if (typeof oldText !== 'string' || typeof newText !== 'string') throw new CodeHostError('EINVAL', 'Old and new text must be strings.');
    if (!oldText) throw new CodeHostError('EINVAL', 'Old text is empty.');
    if (oldText === newText) throw new CodeHostError('EINVAL', 'Old and new text are the same.');
    const abs = await this.resolve(p);
    const { text: before, exact, mode } = await this._readText(abs, p);
    if (!exact) throw new CodeHostError('EENCODING', 'Not a UTF-8 text file; editing it would change bytes elsewhere: ' + p);
    let from = oldText;
    let to = newText;
    let count = before.split(from).length - 1;
    if (count === 0 && before.includes('\r\n') && from.includes('\n') && !from.includes('\r\n')) {
      from = oldText.replace(/\n/g, '\r\n');
      to = newText.replace(/\r?\n/g, '\r\n');
      count = before.split(from).length - 1;
    }
    if (count === 0) throw new CodeHostError('ENOMATCH', 'Old text not found in ' + p);
    if (count > 1 && !replaceAll) throw new CodeHostError('EAMBIGUOUS', `Old text occurs ${count} times in ${p}; give more context or replace all.`);
    const after = replaceAll ? before.split(from).join(to) : before.replace(from, () => to);
    if (Buffer.byteLength(after) > MAX_READ_BYTES) throw new CodeHostError('ETOOBIG', 'The edited file would pass the size limit.');
    await this._writeText(abs, after, mode & 0o7777);
    return { path: this.rel(abs), replacements: replaceAll ? count : 1, before, after };
  }

  async listDir(p = '.') {
    const abs = await this.resolve(p);
    const entries = await fsp.readdir(abs, { withFileTypes: true });
    entries.sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name));
    const out = entries.slice(0, MAX_LIST_ENTRIES).map(e => ({
      name: e.name,
      type: e.isDirectory() ? 'dir' : e.isSymbolicLink() ? 'link' : 'file',
    }));
    return { path: this.rel(abs), entries: out, truncated: entries.length > MAX_LIST_ENTRIES };
  }

  /**
   * Lines matching `pattern` (a regular expression) in files under `dir`.
   * Runs in a worker thread that is stopped after `timeoutMs`; symlinks
   * are not followed.
   */
  async search(pattern, { dir = '.', glob = '', ignoreCase = false, maxMatches = MAX_SEARCH_MATCHES, timeoutMs = SEARCH_TIMEOUT_MS } = {}) {
    if (typeof pattern !== 'string' || !pattern) throw new CodeHostError('EINVAL', 'Search pattern is empty.');
    try { new RegExp(pattern, ignoreCase ? 'i' : ''); } catch (e) { throw new CodeHostError('EINVAL', 'Bad pattern: ' + e.message); }
    if (glob) {
      try { _globToRegExp(glob); } catch (e) { throw new CodeHostError('EINVAL', 'Bad glob: ' + glob); }
    }
    const start = await this.resolve(dir);
    const cap = Math.min(Math.max(1, maxMatches | 0), 1000);
    const limit = Math.min(Math.max(100, timeoutMs | 0), 60000);
    return new Promise((resolve, reject) => {
      const worker = new Worker(path.join(__dirname, 'search-worker.js'), {
        workerData: { root: this.root, start, pattern, ignoreCase, glob, cap, maxBytes: MAX_READ_BYTES, maxFiles: SEARCH_MAX_FILES, skipDirs: SKIP_DIRS },
      });
      let done = false;
      const finish = (fn) => { if (done) return; done = true; clearTimeout(timer); worker.terminate(); fn(); };
      const timer = setTimeout(() => finish(() => reject(new CodeHostError('ETIMEOUT', `Search stopped after ${limit} ms. Try a simpler pattern or a smaller folder.`))), limit);
      worker.once('message', (r) => finish(() => resolve(r)));
      worker.once('error', (e) => finish(() => reject(new CodeHostError('ESEARCH', e.message))));
      worker.once('exit', (code) => finish(() => reject(new CodeHostError('ESEARCH', 'Search stopped (exit ' + code + ').'))));
    });
  }

  /** Run a shell command in the workspace. Resolves when it exits, is stopped, or times out. */
  async run(command, { timeoutMs = DEFAULT_TIMEOUT_MS, cwd = '.', onData = null } = {}) {
    if (typeof command !== 'string' || !command.trim()) throw new CodeHostError('EINVAL', 'Command is empty.');
    const timeout = Math.min(Math.max(1000, timeoutMs | 0), MAX_TIMEOUT_MS);
    const dir = await this.resolve(cwd);
    const pathVar = await _commandPath();
    const sh = _shell();
    const win = process.platform === 'win32';
    return new Promise((resolve) => {
      const id = _nextRunId++;
      const child = spawn(sh.file, sh.args(command), {
        cwd: dir,
        env: _commandEnv(pathVar),
        detached: !win,                  // its own process group, so the whole tree can be stopped
        windowsHide: true,
        windowsVerbatimArguments: sh.verbatim,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const rec = { child, killed: false, timer: null };
      this._procs.set(id, rec);
      const out = { stdout: '', stderr: '', stdoutTruncated: false, stderrTruncated: false };
      const take = (key) => (s) => {
        const room = MAX_OUTPUT_CHARS - out[key].length;
        if (room <= 0) {
          if (!out[key + 'Truncated'] && onData) onData({ id, stream: key, data: '', truncated: true });
          out[key + 'Truncated'] = true;
          return;
        }
        const part = s.length > room ? s.slice(0, room) : s;
        if (s.length > room) out[key + 'Truncated'] = true;
        out[key] += part;
        if (onData) onData({ id, stream: key, data: part, ...(s.length > room ? { truncated: true } : {}) });
      };
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', take('stdout'));
      child.stderr.on('data', take('stderr'));
      let timedOut = false;
      rec.timer = setTimeout(() => { timedOut = true; this._stop(rec); }, timeout);
      let settled = false;
      let exitCode = null;
      let exitSignal = null;
      const settle = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(rec.timer);
        clearTimeout(rec.killTimer);
        this._procs.delete(id);
        resolve({ id, exitCode, signal: exitSignal, timedOut, killed: rec.killed, error: error || null, ...out });
      };
      child.on('error', (e) => settle(e.message));
      // A background process that keeps the output pipes open would hold
      // 'close' forever: settle shortly after the shell itself exits.
      child.on('exit', (code, signal) => {
        exitCode = code;
        exitSignal = signal || null;
        setTimeout(() => {
          if (settled) return;
          child.stdout.destroy();
          child.stderr.destroy();
          settle();
        }, CLOSE_GRACE_MS);
      });
      child.on('close', () => settle());
      if (onData) onData({ id, stream: 'start', data: '' });
    });
  }

  /** Stop a running command by the id run() reported. */
  kill(id) {
    const rec = this._procs.get(id);
    if (!rec) return false;
    rec.killed = true;
    this._stop(rec);
    return true;
  }

  killAll() {
    for (const id of [...this._procs.keys()]) this.kill(id);
  }

  // SIGTERM the process group, then SIGKILL it if it is still there.
  _stop(rec) {
    const { child } = rec;
    if (process.platform === 'win32') {
      try { spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }); } catch { /* gone */ }
      return;
    }
    const signal = (sig) => {
      try { process.kill(-child.pid, sig); } catch {
        try { child.kill(sig); } catch { /* already gone */ }
      }
    };
    signal('SIGTERM');
    clearTimeout(rec.killTimer);
    rec.killTimer = setTimeout(() => signal('SIGKILL'), KILL_GRACE_MS);
  }
}

// Glob over a relative path: `*.js`, `*.{js,ts}`, and `**` across folders.
function _globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') i++; }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const close = glob.indexOf('}', i);
      if (close === -1) { re += '\\{'; continue; }
      re += '(' + glob.slice(i + 1, close).split(',').map(s => s.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')).join('|') + ')';
      i = close;
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}

/** Plain object safe to send over IPC. */
function serializeError(e) {
  return { code: (e && e.code) || 'EUNKNOWN', message: (e && e.message) || String(e) };
}

module.exports = {
  Workspace, CodeHostError, serializeError, _globToRegExp,
  limits: { MAX_READ_BYTES, MAX_LINE_CHARS, MAX_OUTPUT_CHARS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS, KILL_GRACE_MS, MAX_SEARCH_MATCHES, SEARCH_TIMEOUT_MS },
};
