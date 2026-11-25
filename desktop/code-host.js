/**
 * NICE Desktop — Code host
 *
 * The file and shell work behind Code, in plain Node so it can be tested
 * without Electron. main.js wires it to IPC; the renderer reaches it only
 * through preload.js (window.NiceDesktop.code).
 *
 * Files. Every path is resolved inside one workspace folder the user picked
 * with the native folder dialog. A path that leaves it, directly or through
 * a symlink (dangling ones included), is refused. Reads and edits open the
 * file without following a symlink at the last step, and writes go to a
 * temporary file renamed into place, so they never write through one.
 * Nothing is written inside a .git folder. A file that is not exact UTF-8
 * text is not replaced from text unless the caller says overwrite.
 *
 * Commands are one-shot. Each runs in its own process group with the
 * workspace as its working directory, no stdin, a timeout that ends in
 * SIGKILL, and output capped to its start and its end. When the command
 * ends, whatever it left running in that group (`cmd &`, nohup) is stopped
 * too: SIGTERM, then SIGKILL. A process that leaves the group (setsid, a
 * daemon that detaches itself) is out of reach.
 *
 * Searches run in a worker thread with a time limit, so a pathological
 * pattern cannot stall the app; one that runs out of time returns what it
 * found so far.
 */

'use strict';

const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');
const { Worker } = require('worker_threads');

const MAX_READ_BYTES = 2 * 1024 * 1024;   // files larger than this are refused
const MAX_WRITE_BYTES = 10 * 1024 * 1024; // content larger than this is refused
const MAX_LINE_CHARS = 2000;              // longer lines come back cut, with a marker
const MAX_OUTPUT_CHARS = 30000;           // per stream, per command
const DEFAULT_TIMEOUT_MS = 120000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 600000;
const KILL_GRACE_MS = 2000;               // SIGTERM, then SIGKILL after this
const CLOSE_GRACE_MS = 500;               // after exit, wait this long for output to drain
const MAX_LIST_ENTRIES = 1000;
const MAX_SEARCH_MATCHES = 200;
const MAX_SEARCH_MATCHES_CAP = 1000;
const SEARCH_TIMEOUT_MS = 10000;
const MIN_SEARCH_TIMEOUT_MS = 100;
const MAX_SEARCH_TIMEOUT_MS = 60000;
const SEARCH_MAX_FILES = 20000;
const MAX_SEARCHES = 4;                   // running at once, per workspace
const PATH_LOOKUP_TIMEOUT_MS = 5000;
const PATH_START = '__NICE_PATH_START__';
const PATH_END = '__NICE_PATH_END__';
const SKIP_DIRS = ['.git', 'node_modules', '.hg', '.svn', 'dist', 'build', '.next', '.cache', 'coverage'];
const POSIX_SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const INTERACTIVE_SHELLS = new Set(['bash', 'zsh']);
const O_NOFOLLOW = fs.constants.O_NOFOLLOW || 0;
const O_NONBLOCK = fs.constants.O_NONBLOCK || 0;

let _nextRunId = 1;     // unique across workspaces, so ids never collide
let _loginPath = null;  // PATH from the user's login shell, read once
let _pathLookup = null; // the lookup in flight, shared by runs that start together

class CodeHostError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const _stopped = () => new CodeHostError('ESTOPPED', 'Stopped: the page reloaded or the folder changed.');
const _unref = (t) => (t && t.unref ? t.unref() : t);

/* A finite positive number clamped to [min, max]; null, NaN, Infinity,
   negatives and non-numbers get the default. */
function _num(v, dflt, min, max) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return dflt;
  return Math.min(Math.max(min, Math.floor(v)), max);
}

/* A count from 0 up: anything that is not a finite positive number is 0. */
function _count(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
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

async function _readUpTo(fh, max) {
  const chunks = [];
  let total = 0;
  while (total < max) {
    const buf = Buffer.allocUnsafe(Math.min(256 * 1024, max - total));
    const { bytesRead } = await fh.read(buf, 0, buf.length, null);
    if (!bytesRead) break;
    chunks.push(buf.subarray(0, bytesRead));
    total += bytesRead;
  }
  return Buffer.concat(chunks, total);
}

/* The first `n` UTF-16 units of `s`, one fewer when the cut would split a surrogate pair. */
function _cutAt(s, n) {
  if (n <= 0) return '';
  if (s.length <= n) return s;
  const c = s.charCodeAt(n - 1);
  return s.slice(0, c >= 0xd800 && c <= 0xdbff ? n - 1 : n);
}

/* One output stream of a command. The result keeps all of it up to
   MAX_OUTPUT_CHARS; past that, its first and last halves with a marker
   between them saying how much was cut. Live output (onLive) is the first
   MAX_OUTPUT_CHARS characters, then one call with truncated set: the tail
   is only known at the end. */
function _capture(onLive) {
  const half = MAX_OUTPUT_CHARS / 2;
  let head = '';
  let tail = '';
  let total = 0;
  let headOpen = true;
  let live = 0;
  let liveOpen = true;
  const cut = () => total - head.length - tail.length;
  return {
    push(s) {
      total += s.length;
      if (liveOpen) {
        const part = _cutAt(s, MAX_OUTPUT_CHARS - live);
        live += part.length;
        if (part.length < s.length) liveOpen = false;
        if (part || !liveOpen) onLive(part, !liveOpen);
      }
      let rest = s;
      if (headOpen) {
        const part = _cutAt(s, half - head.length);
        head += part;
        rest = s.slice(part.length);
        if (rest) headOpen = false;
      }
      if (!rest) return;
      tail += rest;
      const room = MAX_OUTPUT_CHARS - head.length;
      if (tail.length > room) {
        let from = tail.length - room;
        const c = tail.charCodeAt(from);
        if (c >= 0xdc00 && c <= 0xdfff) from++;
        tail = tail.slice(from);
      }
    },
    text() {
      const n = cut();
      return n > 0 ? head + '\n… [' + n + ' characters cut] …\n' + tail : head + tail;
    },
    truncated() { return cut() > 0; },
  };
}

function _shell() {
  if (process.platform === 'win32') return { file: process.env.ComSpec || 'cmd.exe', args: (c) => ['/d', '/s', '/c', '"' + c + '"'], verbatim: true };
  const user = process.env.SHELL || '';
  const file = POSIX_SHELLS.has(path.basename(user)) ? user : (process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh');
  return { file, args: (c) => ['-c', c], verbatim: false };
}

/* The PATH printed between the markers; '' when they are not both there. */
function _parseLoginPath(out) {
  const s = String(out || '');
  const a = s.indexOf(PATH_START);
  if (a === -1) return '';
  const b = s.indexOf(PATH_END, a + PATH_START.length);
  return b === -1 ? '' : s.slice(a + PATH_START.length, b);
}

/* An app opened from the Finder gets a bare PATH (/usr/bin:/bin:…), so
   Homebrew's node, npm and git are missing. Ask the user's shell once, as
   an interactive login shell for zsh and bash so PATH additions in .zshrc
   and .bashrc count. A profile can print anything, so the PATH comes back
   between markers. The shell gets no stdin and its own session (no
   terminal to grab), and anything it leaves in its group is killed. */
function _commandPath() {
  if (_loginPath !== null) return Promise.resolve(_loginPath);
  if (process.platform === 'win32') return Promise.resolve((_loginPath = process.env.PATH || ''));
  if (_pathLookup) return _pathLookup;
  const sh = _shell();
  const flags = INTERACTIVE_SHELLS.has(path.basename(sh.file)) ? ['-l', '-i', '-c'] : ['-l', '-c'];
  const script = `printf '${PATH_START}%s${PATH_END}' "$PATH"`;
  _pathLookup = new Promise((resolve) => {
    let out = '';
    let child = null;
    let timer = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (child && child.pid > 1) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } }
      _loginPath = _parseLoginPath(out) || process.env.PATH || '';
      _pathLookup = null;
      resolve(_loginPath);
    };
    try {
      child = childProcess.spawn(sh.file, [...flags, script], { env: process.env, stdio: ['ignore', 'pipe', 'ignore'], detached: true });
    } catch {
      finish();
      return;
    }
    timer = setTimeout(finish, PATH_LOOKUP_TIMEOUT_MS);
    child.on('error', finish);
    child.on('close', finish);
    if (child.stdout) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (s) => {
        if (out.length < 1024 * 1024) out += s;
        const a = out.indexOf(PATH_START);
        if (a !== -1 && out.indexOf(PATH_END, a) !== -1) finish();
      });
    }
  });
  return _pathLookup;
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
    this._procs = new Map();    // run id → record, while the command runs or its process group lingers
    this._searches = new Set(); // searches from call to answer, each { stop }
    this._gen = 0;              // bumped by killAll: work that was on its way must not start after it
  }

  /** True while a command, a lingering process group or a search of this workspace is still around. */
  get busy() {
    return this._procs.size > 0 || this._searches.size > 0;
  }

  static async open(dir) {
    if (typeof dir !== 'string' || !dir) throw new CodeHostError('EINVAL', 'No folder given.');
    const real = await fsp.realpath(path.resolve(dir));
    const st = await fsp.stat(real);
    if (!st.isDirectory()) throw new CodeHostError('ENOTDIR', 'Not a folder: ' + dir);
    return new Workspace(real);
  }

  /**
   * Why a folder is too broad to hand to an agent without asking, judged by
   * its real path: 'disk' (a disk root), 'home' (the home folder),
   * 'above-home' (a folder that holds it, like /Users) or 'volume' (a
   * mounted volume's root, like /Volumes/Backup). null when it is none.
   */
  static async isBroad(dir) {
    const real = async (p) => { try { return await fsp.realpath(p); } catch { return path.resolve(p); } };
    const p = await real(path.resolve(String(dir)));
    const home = await real(os.homedir());
    if (p === path.parse(p).root) return 'disk';
    if (p === home) return 'home';
    if (_isInside(p, home)) return 'above-home';
    if (process.platform === 'darwin') {
      // Judged by name: macOS firmlinks make /Applications or /usr/local look like mount points.
      return p === '/Volumes' || path.dirname(p) === '/Volumes' ? 'volume' : null;
    }
    if (process.platform === 'win32') return null;
    try {
      const [a, b] = await Promise.all([fsp.stat(p), fsp.stat(path.dirname(p))]);
      if (a.dev !== b.dev) return 'volume';
    } catch { /* not judged */ }
    return null;
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

  /* Nothing is written inside a .git folder, at any depth: a hook or a
     config entry there turns into a command the next time git runs.
     Compared without case, as the Mac's disk does. */
  _refuseGit(abs, p) {
    const win = process.platform === 'win32';
    const hit = path.relative(this.root, abs).split(path.sep).some((s) => {
      const n = s.toLowerCase();
      return (win ? n.replace(/[. ]+$/, '') : n) === '.git';
    });
    if (hit) throw new CodeHostError('EPROTECTED', 'Code does not change files inside .git: ' + p);
  }

  /* Open `abs` for reading without following a symlink at the last step
     (one swapped in after resolve() is refused) and without blocking on a
     FIFO, then check the open handle, so what is read is what was checked.
     A process in the workspace can still race the folders on the way;
     that grants it nothing it does not already have through run(). */
  async _open(abs, p) {
    let fh;
    try {
      fh = await fsp.open(abs, fs.constants.O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
    } catch (e) {
      if (e.code === 'ELOOP' || e.code === 'EMLINK') throw new CodeHostError('ELINK', 'Path is a symlink: ' + p);
      throw e;
    }
    try {
      const st = await fh.stat();
      if (st.isDirectory()) throw new CodeHostError('EISDIR', 'Is a folder: ' + p);
      if (!st.isFile()) throw new CodeHostError('ENOTFILE', 'Not a regular file: ' + p);
      return { fh, st };
    } catch (e) {
      await fh.close();
      throw e;
    }
  }

  async _readText(abs, p) {
    const { fh, st } = await this._open(abs, p);
    try {
      const tooBig = (n) => new CodeHostError('ETOOBIG', `File is ${n} bytes; the limit is ${MAX_READ_BYTES}.`);
      if (st.size > MAX_READ_BYTES) throw tooBig(st.size);
      const buf = await _readUpTo(fh, MAX_READ_BYTES + 1);
      if (buf.length > MAX_READ_BYTES) throw tooBig(buf.length);
      if (buf.includes(0)) throw new CodeHostError('EBINARY', 'Binary file: ' + p);
      const text = buf.toString('utf8');
      return { text, exact: Buffer.from(text, 'utf8').equals(buf), mode: st.mode };
    } finally {
      await fh.close();
    }
  }

  /* Why an existing file cannot be replaced from text without losing bytes,
     or null when it is exact UTF-8 with no NUL. */
  async _notPlainText(abs, p) {
    const { fh, st } = await this._open(abs, p);
    try {
      if (st.size > MAX_WRITE_BYTES) return `it is over ${MAX_WRITE_BYTES} bytes, too large to check`;
      const buf = await _readUpTo(fh, MAX_WRITE_BYTES + 1);
      if (buf.length > MAX_WRITE_BYTES) return `it is over ${MAX_WRITE_BYTES} bytes, too large to check`;
      if (buf.includes(0)) return 'it contains NUL bytes';
      if (!Buffer.from(buf.toString('utf8'), 'utf8').equals(buf)) return 'it is not valid UTF-8';
      return null;
    } finally {
      await fh.close();
    }
  }

  /* Write via a temporary file renamed into place, so a failed write never
     leaves half a file and the rename replaces whatever sits at `abs` (a
     symlink swapped in included) instead of writing through it. An
     existing file must be writable, and keeps its permission bits, set
     with fchmod so the umask cannot drop any; setuid and setgid are not
     carried onto new content. Owner, extended attributes and Finder tags
     are not kept. */
  async _writeText(abs, content, mode, p) {
    const dir = path.dirname(abs);
    if (mode != null) {
      try {
        await fsp.access(abs, fs.constants.W_OK);
      } catch (e) {
        if (e.code === 'EACCES' || e.code === 'EPERM' || e.code === 'EROFS') throw new CodeHostError('EACCES', 'File is read-only: ' + p);
        throw e;
      }
    }
    const tmp = path.join(dir, '.nice-' + crypto.randomBytes(4).toString('hex') + '.tmp');
    const fh = await fsp.open(tmp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW, 0o666);
    let placed = false;
    try {
      try {
        await fh.writeFile(content, 'utf8');
        if (mode != null) await fh.chmod(mode & 0o777);
      } finally {
        await fh.close();
      }
      // The folder could have been swapped for a symlink since it was checked.
      if (!_isInside(this.root, await fsp.realpath(dir))) throw new CodeHostError('EOUTSIDE', 'Path leads outside the workspace: ' + p);
      await fsp.rename(tmp, abs);
      placed = true;
    } finally {
      if (!placed) await fsp.unlink(tmp).catch(() => {});
    }
  }

  /**
   * Lines `offset` (0-based) to `offset + limit` of a text file. `exact` is
   * false, and `encoding` 'lossy', when the file is not valid UTF-8: its bad
   * bytes come back as U+FFFD, so writing that text back needs overwrite.
   * Past the end, the content is empty and endLine is startLine - 1.
   */
  async readFile(p, { offset = 0, limit = 0 } = {}) {
    const abs = await this.resolve(p);
    const { text, exact } = await this._readText(abs, p);
    const lines = text === '' ? [] : text.split('\n');
    const endsWithNewline = lines.length > 1 && lines[lines.length - 1] === '';
    if (endsWithNewline) lines.pop();
    const total = lines.length;
    const start = Math.min(_count(offset), total);
    const want = _count(limit);
    const end = want > 0 ? Math.min(total, start + want) : total;
    let cut = false;
    const slice = lines.slice(start, end).map((l) => {
      if (l.length <= MAX_LINE_CHARS) return l;
      cut = true;
      return _cutAt(l, MAX_LINE_CHARS) + ' … [line cut at ' + MAX_LINE_CHARS + ' characters]';
    });
    // The content is exactly the lines asked for, with the file's final newline when they reach the end.
    const content = slice.join('\n') + (endsWithNewline && end === total && slice.length ? '\n' : '');
    return { path: this.rel(abs), content, encoding: exact ? 'utf8' : 'lossy', exact, totalLines: total, startLine: start + 1, endLine: end, linesCut: cut };
  }

  /**
   * Write `content` as UTF-8. An existing file that is not exact UTF-8 text
   * (it has NUL bytes or invalid sequences) is only replaced with overwrite.
   */
  async writeFile(p, content, { overwrite = false } = {}) {
    if (typeof content !== 'string') throw new CodeHostError('EINVAL', 'Content must be a string.');
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > MAX_WRITE_BYTES) throw new CodeHostError('ETOOBIG', `Content is ${bytes} bytes; the limit is ${MAX_WRITE_BYTES}.`);
    const abs = await this.resolve(p);
    this._refuseGit(abs, p);
    let existing = null;
    try {
      existing = await fsp.lstat(abs);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    if (existing) {
      if (existing.isDirectory()) throw new CodeHostError('EISDIR', 'Is a folder: ' + p);
      if (!existing.isFile()) throw new CodeHostError('ENOTFILE', 'Not a regular file: ' + p);
      const problem = overwrite === true ? null : await this._notPlainText(abs, p);
      if (problem) throw new CodeHostError('EENCODING', `Not replacing ${p}: ${problem}, so text written over it would lose bytes. Pass overwrite to replace it anyway.`);
    }
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    // The folders just made could have been swapped for a link: check again.
    if (!_isInside(this.root, await _realish(path.dirname(abs)))) throw new CodeHostError('EOUTSIDE', 'Path leads outside the workspace: ' + p);
    await this._writeText(abs, content, existing ? existing.mode : null, p);
    return { path: this.rel(abs), created: !existing, bytes };
  }

  /**
   * Replace `oldText` with `newText`. `oldText` must occur exactly once
   * unless replaceAll. Files that are not valid UTF-8 are refused rather
   * than rewritten. In a file whose every line ends in CRLF, line ends in
   * both texts become CRLF; a file with mixed line ends is matched as is.
   */
  async editFile(p, oldText, newText, { replaceAll = false } = {}) {
    if (typeof oldText !== 'string' || typeof newText !== 'string') throw new CodeHostError('EINVAL', 'Old and new text must be strings.');
    if (!oldText) throw new CodeHostError('EINVAL', 'Old text is empty.');
    if (oldText === newText) throw new CodeHostError('EINVAL', 'Old and new text are the same.');
    const abs = await this.resolve(p);
    this._refuseGit(abs, p);
    const { text: before, exact, mode } = await this._readText(abs, p);
    if (!exact) throw new CodeHostError('EENCODING', 'Not a UTF-8 text file; editing it would change bytes elsewhere: ' + p);
    let from = oldText;
    let to = newText;
    const lf = before.split('\n').length - 1;
    if (lf > 0 && lf === before.split('\r\n').length - 1) {
      from = oldText.replace(/\r?\n/g, '\r\n');
      to = newText.replace(/\r?\n/g, '\r\n');
      if (from === to) throw new CodeHostError('EINVAL', 'Old and new text are the same in this CRLF file.');
    }
    const count = before.split(from).length - 1;
    if (count === 0) throw new CodeHostError('ENOMATCH', 'Old text not found in ' + p);
    if (count > 1 && !replaceAll) throw new CodeHostError('EAMBIGUOUS', `Old text occurs ${count} times in ${p}; give more context or replace all.`);
    const after = replaceAll ? before.split(from).join(to) : before.replace(from, () => to);
    if (Buffer.byteLength(after) > MAX_READ_BYTES) throw new CodeHostError('ETOOBIG', 'The edited file would pass the size limit.');
    await this._writeText(abs, after, mode, p);
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
   * Runs in a worker thread; symlinks are not followed. The answer says
   * what was skipped (files over the size limit, binary files) and which
   * cap ended it early, if one did (truncatedBy 'matches', 'files' or
   * 'time'). At the time limit it returns what it found, with timedOut.
   */
  async search(pattern, { dir = '.', glob = '', ignoreCase = false, maxMatches, timeoutMs } = {}) {
    if (typeof pattern !== 'string' || !pattern) throw new CodeHostError('EINVAL', 'Search pattern is empty.');
    if (glob != null && typeof glob !== 'string') throw new CodeHostError('EINVAL', 'Glob must be a string.');
    try { new RegExp(pattern, ignoreCase ? 'i' : ''); } catch (e) { throw new CodeHostError('EINVAL', 'Bad pattern: ' + e.message); }
    if (glob) {
      try { _globToRegExp(glob); } catch { throw new CodeHostError('EINVAL', 'Bad glob: ' + glob); }
    }
    if (this._searches.size >= MAX_SEARCHES) throw new CodeHostError('EBUSY', `${MAX_SEARCHES} searches are already running; wait for one to finish.`);
    const cap = _num(maxMatches, MAX_SEARCH_MATCHES, 1, MAX_SEARCH_MATCHES_CAP);
    const limit = _num(timeoutMs, SEARCH_TIMEOUT_MS, MIN_SEARCH_TIMEOUT_MS, MAX_SEARCH_TIMEOUT_MS);
    const gen = this._gen;
    // Counted from the call; until its worker runs, killAll is caught by the generation check.
    const job = { stop: null };
    this._searches.add(job);
    try {
      const start = await this.resolve(dir == null ? '.' : dir);
      let st;
      try {
        st = await fsp.stat(start);
      } catch (e) {
        if (e.code === 'ENOENT') throw new CodeHostError('ENOENT', 'No such folder: ' + dir);
        throw e;
      }
      if (!st.isDirectory()) throw new CodeHostError('ENOTDIR', 'Not a folder: ' + dir);
      if (gen !== this._gen) throw _stopped();
      return await this._searchIn(job, start, { pattern, ignoreCase: !!ignoreCase, glob: glob || '', cap, limit });
    } finally {
      this._searches.delete(job);
    }
  }

  _searchIn(job, start, { pattern, ignoreCase, glob, cap, limit }) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(path.join(__dirname, 'search-worker.js'), {
        workerData: { root: this.root, start, pattern, ignoreCase, glob, cap, maxBytes: MAX_READ_BYTES, maxFiles: SEARCH_MAX_FILES, skipDirs: SKIP_DIRS },
      });
      const matches = [];
      let filesSearched = 0;
      let skipped = { tooBig: 0, binary: 0 };
      let done = false;
      const answer = (extra) => ({ matches, filesSearched, skipped, ...extra });
      const finish = (fn) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        job.stop = null;
        worker.terminate();
        fn();
      };
      const timer = setTimeout(() => finish(() => resolve(answer({ truncated: true, truncatedBy: 'time', timedOut: true }))), limit);
      job.stop = (err) => finish(() => reject(err));
      // The worker sends matches after each file that has some, then 'done'.
      worker.on('message', (m) => {
        if (done || !m) return;
        if (typeof m.filesSearched === 'number') filesSearched = m.filesSearched;
        if (m.skipped) skipped = m.skipped;
        if (Array.isArray(m.matches)) for (const x of m.matches) if (matches.length < cap) matches.push(x);
        if (m.type === 'done') finish(() => resolve(answer({ truncated: !!m.truncatedBy, truncatedBy: m.truncatedBy || null, timedOut: false })));
      });
      worker.once('error', (e) => finish(() => reject(new CodeHostError('ESEARCH', e.message))));
      worker.once('exit', (code) => finish(() => reject(new CodeHostError('ESEARCH', 'Search stopped (exit ' + code + ').'))));
    });
  }

  /**
   * Run a shell command in the workspace. Resolves when it exits, is
   * stopped, or times out; stoppedBackground says it left processes
   * running in the background, which were stopped.
   */
  async run(command, { timeoutMs, cwd = '.', onData = null } = {}) {
    if (typeof command !== 'string' || !command.trim()) throw new CodeHostError('EINVAL', 'Command is empty.');
    const timeout = _num(timeoutMs, DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);
    const gen = this._gen;
    const dir = await this.resolve(cwd == null ? '.' : cwd);
    const pathVar = await _commandPath();
    if (gen !== this._gen) throw _stopped();
    const sh = _shell();
    const win = process.platform === 'win32';
    const emit = (d) => {
      if (!onData) return;
      try { onData(d); } catch { /* the page is gone; the command still runs to its end */ }
    };
    return new Promise((resolve) => {
      const id = _nextRunId++;
      const rec = { id, child: null, pgid: 0, killed: false, settled: false, timer: null, killTimer: null };
      const live = (stream) => (data, truncated) => emit({ id, stream, data, ...(truncated ? { truncated: true } : {}) });
      const stdout = _capture(live('stdout'));
      const stderr = _capture(live('stderr'));
      let timedOut = false;
      let exitCode = null;
      let exitSignal = null;
      const settle = (error) => {
        if (rec.settled) return;
        rec.settled = true;
        clearTimeout(rec.timer);
        // Whatever the command left running in its group is stopped with it.
        const lingering = this._groupAlive(rec);
        if (lingering) this._stop(rec);
        else this._untrack(rec);
        resolve({
          id, exitCode, signal: exitSignal, timedOut, killed: rec.killed,
          stoppedBackground: lingering && !rec.killed && !timedOut,
          error: error || null,
          stdout: stdout.text(), stderr: stderr.text(),
          stdoutTruncated: stdout.truncated(), stderrTruncated: stderr.truncated(),
        });
      };
      let child;
      try {
        child = childProcess.spawn(sh.file, sh.args(command), {
          cwd: dir,
          env: _commandEnv(pathVar),
          detached: !win,                  // its own process group, so the whole tree can be stopped
          windowsHide: true,
          windowsVerbatimArguments: sh.verbatim,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (e) {
        settle((e && e.message) || String(e));
        return;
      }
      rec.child = child;
      rec.pgid = !win && child.pid > 1 ? child.pid : 0;
      // Out of descriptors or processes, spawn reports through 'error' with no pid and no pipes.
      child.on('error', (e) => settle(e.message));
      if (child.pid) this._procs.set(id, rec);
      for (const [key, sink] of [['stdout', stdout], ['stderr', stderr]]) {
        if (!child[key]) continue;
        child[key].setEncoding('utf8');
        child[key].on('data', (s) => sink.push(s));
      }
      rec.timer = setTimeout(() => { timedOut = true; this._stop(rec); }, timeout);
      // A background process that keeps the output pipes open would hold
      // 'close' forever: settle shortly after the shell itself exits.
      child.on('exit', (code, signal) => {
        exitCode = code;
        exitSignal = signal || null;
        setTimeout(() => {
          if (rec.settled) return;
          if (child.stdout) child.stdout.destroy();
          if (child.stderr) child.stderr.destroy();
          settle();
        }, CLOSE_GRACE_MS);
      });
      child.on('close', () => settle());
      if (child.pid) emit({ id, stream: 'start', data: '' });
    });
  }

  /** Stop a running command by the id run() reported. */
  kill(id) {
    const rec = this._procs.get(id);
    if (!rec || rec.settled) return false;
    rec.killed = true;
    this._stop(rec);
    return true;
  }

  /**
   * Stop every command, lingering process group and search of this
   * workspace, and anything still on its way to starting. With hard, every
   * process group gets SIGKILL now, synchronously: for app quit, where a
   * timer would not live to fire.
   */
  killAll({ hard = false } = {}) {
    this._gen++;
    for (const job of [...this._searches]) if (job.stop) job.stop(_stopped());
    for (const rec of [...this._procs.values()]) {
      if (!rec.settled) rec.killed = true;
      if (hard) this._kill(rec);
      else this._stop(rec);
    }
  }

  _groupAlive(rec) {
    if (!(rec.pgid > 1)) return false;
    try { process.kill(-rec.pgid, 0); return true; } catch { return false; }
  }

  _untrack(rec) {
    clearTimeout(rec.timer);
    clearTimeout(rec.killTimer);
    rec.killTimer = null;
    this._procs.delete(rec.id);
  }

  _signal(rec, sig) {
    if (rec.pgid > 1) {
      try { process.kill(-rec.pgid, sig); return; } catch { /* group gone */ }
    }
    if (!rec.settled && rec.child) {
      try { rec.child.kill(sig); } catch { /* already gone */ }
    }
  }

  _taskkill(rec) {
    if (!rec.child || !rec.child.pid) return;
    try {
      childProcess.spawn('taskkill', ['/pid', String(rec.child.pid), '/t', '/f'], { windowsHide: true }).on('error', () => {});
    } catch { /* gone */ }
  }

  // SIGTERM the process group, then SIGKILL it after the grace period, even
  // when the shell has exited by then: members that ignore SIGTERM remain.
  _stop(rec) {
    if (process.platform === 'win32') return this._taskkill(rec);
    this._signal(rec, 'SIGTERM');
    if (!rec.killTimer) rec.killTimer = _unref(setTimeout(() => this._kill(rec), KILL_GRACE_MS));
  }

  // SIGKILL the process group now. A run that has settled stays tracked,
  // and is killed again, until its group is gone.
  _kill(rec) {
    clearTimeout(rec.killTimer);
    rec.killTimer = null;
    if (process.platform === 'win32') return this._taskkill(rec);
    if (rec.settled && !this._groupAlive(rec)) return this._untrack(rec);
    this._signal(rec, 'SIGKILL');
    if (rec.settled) rec.killTimer = _unref(setTimeout(() => this._kill(rec), KILL_GRACE_MS));
  }
}

// Glob over a relative path: `*.js`, `*.{js,ts}`, `**` across folders, and
// `**/` for zero or more whole folders.
function _globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { re += '(?:.*/)?'; i++; }
        else re += '.*';
      } else re += '[^/]*';
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

function _resetCommandPath() {
  _loginPath = null;
  _pathLookup = null;
}

module.exports = {
  Workspace, CodeHostError, serializeError, _globToRegExp, _parseLoginPath, _resetCommandPath,
  limits: { MAX_READ_BYTES, MAX_WRITE_BYTES, MAX_LINE_CHARS, MAX_OUTPUT_CHARS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS, KILL_GRACE_MS, MAX_SEARCH_MATCHES, SEARCH_TIMEOUT_MS, MAX_SEARCHES },
};
