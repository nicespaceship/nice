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
 * file without following a symlink at the last step. Writes make missing
 * folders one at a time, checking where each one really is before making
 * the next, and go to a temporary file renamed into place, so they never
 * write through a symlink. Nothing is written inside a git directory. A
 * file that is not exact UTF-8 text is not replaced from text unless the
 * caller says overwrite. A file whose lines all end in CRLF reads with LF
 * line ends, and writes put CRLF back whatever its encoding (edits take
 * only exact UTF-8 files); one with a lone CR anywhere (CR CR LF included)
 * is never converted.
 *
 * Commands are one-shot. Each runs with the workspace as its working
 * directory, no stdin, a timeout that ends in SIGKILL, and output capped to
 * its start and its end. On macOS and Linux each runs in its own process
 * group: when the command ends, whatever it left running in that group
 * (`cmd &`, nohup) is stopped too, SIGTERM then SIGKILL, and quitting the
 * app kills every group. A process that leaves the group (setsid, a daemon
 * that detaches itself) is out of reach. Process groups are POSIX only for
 * now: on Windows a command's tree is stopped with taskkill /t while its
 * shell runs, and what it started in the background (start /b) outlives
 * the command, a kill and quitting the app.
 *
 * Searches run in a worker thread with a time limit, so a pathological
 * pattern cannot stall the app; one that runs out of time returns every
 * match found before it, and its counts.
 *
 * Options arrive as a model's tool call sends them: a number may also be a
 * numeric string ('50'), and a flag is on only for true or 'true'.
 */

'use strict';

const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');
const { Worker, MessageChannel, receiveMessageOnPort } = require('worker_threads');

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
const MAX_GLOB_CHARS = 1000;
const MAX_SEARCHES = 4;                   // running at once, per workspace
const PATH_LOOKUP_TIMEOUT_MS = 5000;
// After a lookup fails it is tried again after a minute, then 5, then every 30.
const PATH_RETRY_MS = Object.freeze([60000, 300000, 1800000]);
const PATH_START = '__NICE_PATH_START__';
const PATH_END = '__NICE_PATH_END__';
const SKIP_DIRS = ['.git', 'node_modules', '.hg', '.svn', 'dist', 'build', '.next', '.cache', 'coverage'];
// Where the search worker keeps its counts in the shared array: one slot
// each, then one per SKIP_DIRS name (folders of that name skipped).
const SEARCH_COUNT = { files: 0, tooBig: 1, binary: 2, unreadable: 3, dirs: 4 };
const MAX_TAG_CHARS = 200;                // code points
const RENAME_TRIES = 3;                   // on Windows, where another program can hold the file for a moment
const RENAME_RETRY_MS = 50;
const POSIX_SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const INTERACTIVE_SHELLS = new Set(['bash', 'zsh']);
const O_NOFOLLOW = fs.constants.O_NOFOLLOW || 0;
const O_NONBLOCK = fs.constants.O_NONBLOCK || 0;
// The data volume behind macOS's firmlinks: /Users and /System/Volumes/Data/Users are one folder.
const MAC_DATA_VOLUME = '/System/Volumes/Data';
const BROAD_STAT_TIMEOUT_MS = 500;        // isBroad: each folder it looks at, on its own

let _nextRunId = 1;     // unique across workspaces, so ids never collide
let _loginPath = null;  // PATH from the user's login shell, once a lookup has worked
let _pathLookup = null; // the lookup in flight, shared by runs that start together
let _pathFailedAt = 0;  // when the last lookup failed
let _pathFailures = 0;  // lookups failed in a row

class CodeHostError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const _stopped = () => new CodeHostError('ESTOPPED', 'Stopped: the page reloaded or the folder changed.');
const _unref = (t) => (t && t.unref ? t.unref() : t);
const _flag = (v) => v === true || v === 'true';

/* `v` as a number: a number as it is, a decimal string ('50', ' 1.5e3 ')
   parsed, anything else NaN. */
function _toNum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^\s*[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*$/i.test(v)) return Number(v);
  return NaN;
}

/* A limit clamped to [min, max]: 0 is the minimum and Infinity the
   maximum; null, NaN, negatives and anything that is not a number or a
   numeric string get the default. */
function _num(v, dflt, min, max) {
  const n = _toNum(v);
  if (Number.isNaN(n) || n < 0) return dflt;
  if (n === Infinity) return max;
  return Math.min(Math.max(min, Math.floor(n)), max);
}

/* A line offset or count from 0 up, from a number or a numeric string;
   anything else, negatives and Infinity included, is 0. */
function _count(v) {
  const n = _toNum(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/* How a file's bytes end its lines, counted on the bytes so it works for
   any ASCII-compatible encoding, UTF-8 or not: crlf, lf (an LF with no CR
   before it) and cr (a CR with no LF after it). kind is 'crlf' when every
   LF has a CR before it and no CR is alone, 'lf' when there is no CR at
   all, and 'mixed' otherwise: CR CR LF and lone CRs included. mostlyCrlf
   when at least 90% of the LFs have a CR, a CRLF file with a few stray LFs,
   which edits treat as CRLF. */
function _lineEnds(buf) {
  let crlf = 0;
  let lf = 0;
  let cr = 0;
  for (let i = buf.indexOf(0x0a); i !== -1; i = buf.indexOf(0x0a, i + 1)) {
    if (i > 0 && buf[i - 1] === 0x0d) crlf++;
    else lf++;
  }
  for (let i = buf.indexOf(0x0d); i !== -1; i = buf.indexOf(0x0d, i + 1)) cr++;
  cr -= crlf;
  const kind = cr ? 'mixed' : !crlf ? 'lf' : !lf ? 'crlf' : 'mixed';
  return { kind, crlf, lf, cr, mostlyCrlf: crlf > 0 && crlf >= 0.9 * (crlf + lf) };
}

/* Where any of `forms` occurs in `text`, left to right, never overlapping:
   [{ at, len }]. */
function _occurrences(text, forms) {
  const hits = [];
  for (const f of forms) for (let i = text.indexOf(f); i !== -1; i = text.indexOf(f, i + f.length)) hits.push({ at: i, len: f.length });
  hits.sort((a, b) => a.at - b.at || b.len - a.len);
  const out = [];
  let end = 0;
  for (const h of hits) if (h.at >= end) { out.push(h); end = h.at + h.len; }
  return out;
}

/* A run's tag as it goes back to the page with its output: a string or a
   finite number, as a string of at most MAX_TAG_CHARS code points; null
   when there is none. */
function runTag(v) {
  if (v == null) return null;
  if (typeof v !== 'string' && !(typeof v === 'number' && Number.isFinite(v))) throw new CodeHostError('EINVAL', 'A tag must be a string or a number.');
  const s = String(v);
  if (s.length <= MAX_TAG_CHARS) return s;
  let out = '';
  let n = 0;
  for (const ch of s) {
    if (n++ === MAX_TAG_CHARS) break;
    out += ch;
  }
  return out;
}

async function _rename(from, to) {
  for (let i = 1; ; i++) {
    try {
      return await fsp.rename(from, to);
    } catch (e) {
      const busy = e.code === 'EPERM' || e.code === 'EACCES' || e.code === 'EBUSY';
      if (process.platform !== 'win32' || !busy || i >= RENAME_TRIES) throw e;
      await new Promise((r) => setTimeout(r, RENAME_RETRY_MS));
    }
  }
}

/* Where the open file `fh` is now, read from the handle; only Linux says. */
async function _whereNow(fh) {
  if (process.platform !== 'linux') return null;
  try { return await fsp.readlink('/proc/self/fd/' + fh.fd); } catch { return null; }
}

/* `promise`'s value, or `fallback` when it fails or takes longer than `ms`. */
function _within(promise, ms, fallback) {
  let timer = null;
  return Promise.race([
    Promise.resolve(promise).catch(() => fallback),
    new Promise((r) => { timer = _unref(setTimeout(() => r(fallback), ms)); }),
  ]).finally(() => clearTimeout(timer));
}

/* A folder git uses as its directory under another name than .git: a bare
   repository, or one a .git symlink points to. */
async function _isGitDir(dir) {
  const st = (n) => fsp.stat(path.join(dir, n)).catch(() => null);
  const [head, objects, refs] = await Promise.all([st('HEAD'), st('objects'), st('refs')]);
  return !!(head && head.isFile() && objects && objects.isDirectory() && refs && refs.isDirectory());
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
   Homebrew's node, npm and git are missing. Ask the user's shell, as an
   interactive login shell for zsh and bash so PATH additions in .zshrc and
   .bashrc count, and as a plain login shell when that prints nothing (an
   rc file that execs another shell or tmux never reaches the printf). The
   answer is kept once a lookup works. After one fails, commands get the
   app's PATH, and the lookup, which can hold a run up to twice
   PATH_LOOKUP_TIMEOUT_MS, is tried again after a minute, then 5 minutes,
   then every 30. */
function _commandPath() {
  if (_loginPath !== null) return Promise.resolve(_loginPath);
  if (process.platform === 'win32') return Promise.resolve((_loginPath = process.env.PATH || ''));
  if (_pathLookup) return _pathLookup;
  if (_pathFailures) {
    const wait = PATH_RETRY_MS[Math.min(_pathFailures, PATH_RETRY_MS.length) - 1];
    if (Date.now() - _pathFailedAt < wait) return Promise.resolve(process.env.PATH || '');
  }
  const sh = _shell();
  const interactive = INTERACTIVE_SHELLS.has(path.basename(sh.file));
  _pathLookup = (async () => {
    let found = await _askShellPath(sh.file, interactive ? ['-l', '-i', '-c'] : ['-l', '-c']);
    if (!found && interactive) found = await _askShellPath(sh.file, ['-l', '-c']);
    if (found) _loginPath = found;
    else {
      _pathFailedAt = Date.now();
      _pathFailures++;
    }
    _pathLookup = null;
    return found || process.env.PATH || '';
  })();
  return _pathLookup;
}

/* One lookup: the PATH the shell prints between markers (a profile can
   print anything around them), or '' when they do not come in time. The
   shell gets no stdin and its own session (no terminal to grab). */
function _askShellPath(file, flags) {
  const script = `printf '${PATH_START}%s${PATH_END}' "$PATH"`;
  return new Promise((resolve) => {
    let out = '';
    let child = null;
    let timer = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (child && child.pid > 1) _endGroup(child.pid);
      resolve(_parseLoginPath(out));
    };
    try {
      child = childProcess.spawn(file, [...flags, script], { env: process.env, stdio: ['ignore', 'pipe', 'ignore'], detached: true });
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
}

/* What the lookup shell left in its group, a job an rc file started in the
   background, say: SIGTERM so it can clean up (a lock file, a half-written
   cache), and SIGKILL only if the group is still there after the grace
   period. */
function _endGroup(pgid) {
  try { process.kill(-pgid, 'SIGTERM'); } catch { return; }
  _unref(setTimeout(() => {
    try { process.kill(-pgid, 0); } catch { return; }
    try { process.kill(-pgid, 'SIGKILL'); } catch { /* gone */ }
  }, KILL_GRACE_MS));
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
   * its real path and by the folder itself: 'disk' (a disk root), 'home'
   * (the home folder), 'above-home' (a folder that holds it, like /Users)
   * or 'volume' (a mounted volume's root, like /Volumes/Backup). null when
   * it is none.
   */
  static async isBroad(dir) {
    const real = async (p) => { try { return await fsp.realpath(p); } catch { return path.resolve(p); } };
    const p = await real(path.resolve(String(dir)));
    const home = await real(os.homedir());
    if (p === path.parse(p).root) return 'disk';
    if (p === home) return 'home';
    if (_isInside(p, home)) return 'above-home';
    const darwin = process.platform === 'darwin';
    if (darwin && (p === '/Volumes' || path.dirname(p) === '/Volumes')) return 'volume';
    // Each folder gets its own time limit: a network folder that takes long
    // to answer is left out, and the rest still count.
    const stats = new Map();
    const stat = (q) => {
      if (!stats.has(q)) stats.set(q, _within(fsp.stat(q, { bigint: true }), BROAD_STAT_TIMEOUT_MS, null));
      return stats.get(q);
    };
    const idOf = (st) => (st && st.ino ? st.dev + ':' + st.ino : null);
    // realpath keeps a second path to the same folder, a macOS firmlink
    // (/System/Volumes/Data/Users is /Users) or a bind mount, so compare the
    // folder itself with home, the folders above it and the Mac's data volume.
    const known = [[home, 'home']];
    for (let a = home; a !== path.dirname(a);) {
      a = path.dirname(a);
      known.push([a, a === path.parse(a).root ? 'disk' : 'above-home']);
    }
    if (darwin) known.push([MAC_DATA_VOLUME, 'disk']);
    const [self, ...others] = await Promise.all([p, ...known.map(([q]) => q)].map(stat));
    const id = idOf(self);
    if (id) {
      const hit = others.findIndex((st) => idOf(st) === id);
      if (hit !== -1) return known[hit][1];
    }
    if (process.platform === 'win32' || !self) return null;
    // A volume mounted anywhere else: its root is on another device than
    // its parent. That also covers a volume under /Volumes reached by
    // another path (/System/Volumes/Data/Volumes/Backup), so the volumes
    // there are not each asked: one that does not answer would hold a
    // thread of the app's file pool.
    const parent = await stat(path.dirname(p));
    if (!parent || self.dev === parent.dev) return null;
    if (darwin) {
      // On a Mac whose system and data volumes have their own devices,
      // /Applications or /usr/local sits on the data volume under / on the
      // system volume: a firmlink, not a mount point.
      const [data, sys] = await Promise.all([stat(MAC_DATA_VOLUME), stat('/')]);
      if (data && sys && self.dev === data.dev && parent.dev === sys.dev) return null;
    }
    return 'volume';
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

  /* Nothing is written inside a git directory, at any depth: a hook or a
     config entry there turns into a command the next time git runs.
     Refused when the path as asked for or its real path (`abs`) has a .git
     folder in it, compared without case as the Mac's disk does, and when
     the real path lies in a git directory named otherwise (a bare
     repository, or the one a symlinked .git points to, as Android's repo
     tool lays out). */
  async _refuseGit(abs, p) {
    const win = process.platform === 'win32';
    const named = (q) => path.relative(this.root, q).split(path.sep).some((s) => {
      const n = s.toLowerCase();
      return (win ? n.replace(/[. ]+$/, '') : n) === '.git';
    });
    let hit = named(path.resolve(this.root, p || '.')) || named(abs);
    for (let d = path.dirname(abs); !hit && d !== this.root && _isInside(this.root, d); d = path.dirname(d)) {
      hit = await _isGitDir(d);
    }
    if (hit) throw new CodeHostError('EPROTECTED', 'Code does not change files inside a git directory: ' + p);
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
      return { text, exact: Buffer.from(text, 'utf8').equals(buf), ends: _lineEnds(buf), mode: st.mode };
    } finally {
      await fh.close();
    }
  }

  /* An existing file about to be replaced from text: why that would lose
     bytes (problem, null when it is exact UTF-8 with no NUL) and, when it
     has no NUL and is not too large to check, how its bytes end its lines,
     valid UTF-8 or not. */
  async _inspect(abs, p) {
    const { fh, st } = await this._open(abs, p);
    try {
      const big = { problem: `it is over ${MAX_WRITE_BYTES} bytes, too large to check`, lineEnds: null };
      if (st.size > MAX_WRITE_BYTES) return big;
      const buf = await _readUpTo(fh, MAX_WRITE_BYTES + 1);
      if (buf.length > MAX_WRITE_BYTES) return big;
      if (buf.includes(0)) return { problem: 'it contains NUL bytes', lineEnds: null };
      const lineEnds = _lineEnds(buf).kind;
      if (!Buffer.from(buf.toString('utf8'), 'utf8').equals(buf)) return { problem: 'it is not valid UTF-8', lineEnds };
      return { problem: null, lineEnds };
    } finally {
      await fh.close();
    }
  }

  /* Make the missing folders of `dir` (a real path inside the workspace)
     one at a time from the workspace down, each checked for where it
     really is before the next is made inside it, so a folder swapped for a
     symlink cannot have folders made outside. Returns the folder's real
     path. */
  async _makeFolders(dir, p) {
    let cur = this.root;
    for (const name of path.relative(this.root, dir).split(path.sep).filter(Boolean)) {
      const next = path.join(cur, name);
      try {
        cur = await fsp.realpath(next);
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
        await fsp.mkdir(next).catch((m) => { if (m.code !== 'EEXIST') throw m; });
        cur = await fsp.realpath(next);
      }
      if (!_isInside(this.root, cur)) throw new CodeHostError('EOUTSIDE', 'Path leads outside the workspace: ' + p);
    }
    return cur;
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
    let id = null;
    let now = null;
    let placed = false;
    try {
      try {
        id = await fh.stat({ bigint: true });
        await fh.writeFile(content, 'utf8');
        if (mode != null) await fh.chmod(mode & 0o777);
        // The folder could have been swapped for a symlink since it was checked.
        if (!_isInside(this.root, await fsp.realpath(dir))) throw new CodeHostError('EOUTSIDE', 'Path leads outside the workspace: ' + p);
      } finally {
        now = await _whereNow(fh);
        await fh.close();
      }
      await _rename(tmp, abs);
      placed = true;
    } finally {
      if (!placed) await this._dropTemp([tmp, now], id);
    }
  }

  /* Remove a failed write's temporary file, by a path only while it still
     names that same file: after a folder was swapped for a symlink, the
     path it was made at points somewhere else. Linux also says where the
     file is now. On a Mac a temporary file whose folder was moved away
     stays where the folder went; only a process in the workspace can move
     it, and that process already has a shell (run()). */
  async _dropTemp(places, id) {
    for (const q of places) {
      if (!q) continue;
      try {
        if (id) {
          const st = await fsp.lstat(q, { bigint: true });
          if (st.dev !== id.dev || st.ino !== id.ino) continue;
        } else if (!_isInside(this.root, await fsp.realpath(path.dirname(q)))) continue;
        await fsp.unlink(q);
        return;
      } catch { /* not there */ }
    }
  }

  /**
   * Lines `offset` (0-based) to `offset + limit` of a text file; limit 0
   * reads to the end. `exact` is false, and `encoding` 'lossy', when the
   * file is not valid UTF-8: its bad bytes come back as U+FFFD, so writing
   * that text back needs overwrite. Past the end, the content is empty and
   * endLine is startLine - 1. lineEndings is 'crlf' when every line ends in
   * CRLF and no CR stands alone, valid UTF-8 or not: the content then comes
   * back with LF, and writeFile and editFile put CRLF back. 'mixed' (some
   * CRLF and some LF, or any lone CR, CR CR LF included) comes back as it
   * is, CRs included, and writeFile leaves its line ends alone.
   */
  async readFile(p, { offset = 0, limit = 0 } = {}) {
    const abs = await this.resolve(p);
    const { text: raw, exact, ends } = await this._readText(abs, p);
    const lineEndings = ends.kind;
    const text = lineEndings === 'crlf' ? raw.replace(/\r\n/g, '\n') : raw;
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
    return { path: this.rel(abs), content, encoding: exact ? 'utf8' : 'lossy', exact, lineEndings, totalLines: total, startLine: start + 1, endLine: end, linesCut: cut };
  }

  /**
   * Write `content` as UTF-8. An existing file that is not exact UTF-8 text
   * (it has NUL bytes or invalid sequences) is only replaced with overwrite,
   * as is one that cannot be read to check it (write-only). Over a file
   * whose every line ends in CRLF (readFile's 'crlf', valid UTF-8 or not),
   * LF line ends are written as CRLF (convertedToCrlf) unless lineEndings
   * is 'keep'.
   */
  async writeFile(p, content, { overwrite = false, lineEndings = null } = {}) {
    if (typeof content !== 'string') throw new CodeHostError('EINVAL', 'Content must be a string.');
    const tooBig = (n) => new CodeHostError('ETOOBIG', `Content is ${n} bytes; the limit is ${MAX_WRITE_BYTES}.`);
    if (Buffer.byteLength(content, 'utf8') > MAX_WRITE_BYTES) throw tooBig(Buffer.byteLength(content, 'utf8'));
    const abs = await this.resolve(p);
    await this._refuseGit(abs, p);
    let existing = null;
    try {
      existing = await fsp.lstat(abs);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    let text = content;
    if (existing) {
      if (existing.isDirectory()) throw new CodeHostError('EISDIR', 'Is a folder: ' + p);
      if (!existing.isFile()) throw new CodeHostError('ENOTFILE', 'Not a regular file: ' + p);
      let checked;
      try {
        checked = await this._inspect(abs, p);
      } catch (e) {
        if (e.code !== 'EACCES' && e.code !== 'EPERM') throw e;
        if (!_flag(overwrite)) throw new CodeHostError('EACCES', `Not replacing ${p}: it cannot be read, so it cannot be checked first. Pass overwrite to replace it anyway.`);
        checked = { problem: null, lineEnds: null };
      }
      const { problem, lineEnds } = checked;
      if (problem && !_flag(overwrite)) throw new CodeHostError('EENCODING', `Not replacing ${p}: ${problem}, so text written over it would lose bytes. Pass overwrite to replace it anyway.`);
      if (lineEnds === 'crlf' && lineEndings !== 'keep') text = content.replace(/\r?\n/g, '\r\n');
    }
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes > MAX_WRITE_BYTES) throw tooBig(bytes);
    const dir = await this._makeFolders(path.dirname(abs), p);
    const target = path.join(dir, path.basename(abs));
    if (target !== abs) await this._refuseGit(target, p);
    await this._writeText(target, text, existing ? existing.mode : null, p);
    return { path: this.rel(target), created: !existing, bytes, convertedToCrlf: text !== content };
  }

  /**
   * Replace `oldText` with `newText`. `oldText` must occur exactly once
   * unless replaceAll. Files that are not valid UTF-8 are refused rather
   * than rewritten. In a CRLF file, or one at least 90% CRLF with a few
   * stray LFs, both texts are taken with CRLF line ends (oldText is also
   * tried as it is), and old text that ends in the CR of a line end keeps
   * that line end CRLF, so no bare LF goes into a CRLF line. A file with a
   * real mix of line ends is matched as it is.
   */
  async editFile(p, oldText, newText, { replaceAll = false } = {}) {
    if (typeof oldText !== 'string' || typeof newText !== 'string') throw new CodeHostError('EINVAL', 'Old and new text must be strings.');
    if (!oldText) throw new CodeHostError('EINVAL', 'Old text is empty.');
    if (oldText === newText) throw new CodeHostError('EINVAL', 'Old and new text are the same.');
    const abs = await this.resolve(p);
    await this._refuseGit(abs, p);
    const { text: before, exact, ends, mode } = await this._readText(abs, p);
    if (!exact) throw new CodeHostError('EENCODING', 'Not a UTF-8 text file; editing it would change bytes elsewhere: ' + p);
    let forms = [oldText];
    let to = newText;
    if (ends.mostlyCrlf) {
      const crlf = oldText.replace(/\r?\n/g, '\r\n');
      forms = crlf === oldText ? [oldText] : [crlf, oldText];
      to = newText.replace(/\r?\n/g, '\r\n');
    }
    const hits = _occurrences(before, forms);
    if (!hits.length) {
      const names = [ends.crlf && 'CRLF', ends.lf && 'LF', ends.cr && 'lone CR'].filter(Boolean);
      const which = names.length > 1 ? 'a mix of ' + names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
      const hint = ends.kind === 'mixed' && !ends.mostlyCrlf ? ` (its lines end in ${which}, so match them as they are)` : '';
      throw new CodeHostError('ENOMATCH', 'Old text not found in ' + p + hint);
    }
    const all = _flag(replaceAll);
    if (hits.length > 1 && !all) throw new CodeHostError('EAMBIGUOUS', `Old text occurs ${hits.length} times in ${p}; give more context or replace all.`);
    let after = '';
    let at = 0;
    for (const h of all ? hits : hits.slice(0, 1)) {
      const end = h.at + h.len;
      const keepCr = ends.mostlyCrlf && before[end - 1] === '\r' && before[end] === '\n' && !to.endsWith('\r');
      after += before.slice(at, h.at) + to + (keepCr ? '\r' : '');
      at = end;
    }
    after += before.slice(at);
    if (after === before) throw new CodeHostError('EINVAL', 'The edit changes nothing.');
    if (Buffer.byteLength(after) > MAX_READ_BYTES) throw new CodeHostError('ETOOBIG', 'The edited file would pass the size limit.');
    await this._writeText(abs, after, mode, p);
    return { path: this.rel(abs), replacements: all ? hits.length : 1, before, after };
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
   * Runs in a worker thread (see search-worker.js for how it treats
   * symlinks). Each match's text is its line, or the 500 characters around
   * the first match in a longer one. Folders named in SKIP_DIRS
   * (node_modules, .git, build, dist, …) are skipped unless the search
   * starts inside one of that name. The answer says what was skipped
   * (skipped: tooBig and binary files, unreadable files and folders, and
   * dirs, the skipped folder names with how many of each) and which cap
   * ended it early, if one did (truncatedBy 'matches', 'files' or 'time').
   * At the time limit it returns every match found before it, with
   * timedOut and the counts so far.
   */
  async search(pattern, { dir = '.', glob = '', ignoreCase = false, maxMatches, timeoutMs } = {}) {
    if (typeof pattern !== 'string' || !pattern) throw new CodeHostError('EINVAL', 'Search pattern is empty.');
    if (glob != null && typeof glob !== 'string') throw new CodeHostError('EINVAL', 'Glob must be a string.');
    const icase = _flag(ignoreCase);
    try { new RegExp(pattern, icase ? 'i' : ''); } catch (e) { throw new CodeHostError('EINVAL', 'Bad pattern: ' + e.message); }
    if (glob) {
      try { _globToRegExp(glob); } catch (e) { throw e instanceof CodeHostError ? e : new CodeHostError('EINVAL', 'Bad glob: ' + glob); }
    }
    if (this._searches.size >= MAX_SEARCHES) throw new CodeHostError('EBUSY', `${MAX_SEARCHES} searches are already running; wait for one to finish.`);
    const cap = _num(maxMatches, MAX_SEARCH_MATCHES, 1, MAX_SEARCH_MATCHES_CAP);
    const limit = _num(timeoutMs, SEARCH_TIMEOUT_MS, MIN_SEARCH_TIMEOUT_MS, MAX_SEARCH_TIMEOUT_MS);
    const gen = this._gen;
    // Counted from the call; until its worker runs, killAll is caught by the generation check.
    const job = { stop: null };
    this._searches.add(job);
    try {
      const shown = dir == null ? '.' : dir;
      const start = await this.resolve(shown);
      let st;
      try {
        st = await fsp.stat(start);
      } catch (e) {
        if (e.code === 'ENOENT') throw new CodeHostError('ENOENT', 'No such folder: ' + shown);
        throw e;
      }
      if (!st.isDirectory()) throw new CodeHostError('ENOTDIR', 'Not a folder: ' + shown);
      try {
        await (await fsp.opendir(start)).close();
      } catch (e) {
        if (e.code === 'EACCES' || e.code === 'EPERM') throw new CodeHostError('EACCES', 'Cannot read folder: ' + shown);
        throw e;
      }
      if (gen !== this._gen) throw _stopped();
      return await this._searchIn(job, start, { pattern, ignoreCase: icase, glob: glob || '', cap, limit });
    } finally {
      this._searches.delete(job);
    }
  }

  _searchIn(job, start, { pattern, ignoreCase, glob, cap, limit }) {
    return new Promise((resolve, reject) => {
      // The worker keeps its counts here, current after every file, so they
      // can be read even while it is stuck in a pattern.
      const counts = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * (SEARCH_COUNT.dirs + SKIP_DIRS.length)));
      const { port1, port2 } = new MessageChannel();
      const worker = new Worker(path.join(__dirname, 'search-worker.js'), {
        workerData: { root: this.root, start, pattern, ignoreCase, glob, cap, maxBytes: MAX_READ_BYTES, maxFiles: SEARCH_MAX_FILES, skipDirs: SKIP_DIRS, counts: counts.buffer, port: port2 },
        transferList: [port2],
      });
      const matches = [];
      let done = false;
      const answer = (extra) => {
        const n = (i) => Atomics.load(counts, i);
        const dirs = {};
        SKIP_DIRS.forEach((name, i) => { if (n(SEARCH_COUNT.dirs + i)) dirs[name] = n(SEARCH_COUNT.dirs + i); });
        const skipped = { tooBig: n(SEARCH_COUNT.tooBig), binary: n(SEARCH_COUNT.binary), unreadable: n(SEARCH_COUNT.unreadable), dirs };
        return { matches, filesSearched: n(SEARCH_COUNT.files), skipped, ...extra };
      };
      const finish = (fn) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        job.stop = null;
        port1.close();
        worker.terminate();
        fn();
      };
      // The worker posts each match as it finds it, then 'done'.
      const onMessage = (m) => {
        if (done || !m) return;
        if (m.type === 'match') { if (matches.length < cap) matches.push(m.match); }
        else if (m.type === 'done') finish(() => resolve(answer({ truncated: !!m.truncatedBy, truncatedBy: m.truncatedBy || null, timedOut: false })));
      };
      // Messages posted just before the time limit or the worker's exit can still be queued.
      const drain = () => { for (let r; !done && (r = receiveMessageOnPort(port1));) onMessage(r.message); };
      port1.on('message', onMessage);
      const timer = setTimeout(() => {
        drain();
        finish(() => resolve(answer({ truncated: true, truncatedBy: 'time', timedOut: true })));
      }, limit);
      job.stop = (err) => finish(() => reject(err));
      worker.once('error', (e) => finish(() => reject(new CodeHostError('ESEARCH', e.message))));
      worker.once('exit', (code) => {
        drain();
        finish(() => reject(new CodeHostError('ESEARCH', 'Search stopped (exit ' + code + ').')));
      });
    });
  }

  /**
   * Run a shell command in the workspace. Resolves when it exits, is
   * stopped, or times out; stoppedBackground says it left processes
   * running in the background, which were stopped.
   */
  async run(command, { timeoutMs, cwd = '.', onData = null, shouldStart = null } = {}) {
    if (typeof command !== 'string' || !command.trim()) throw new CodeHostError('EINVAL', 'Command is empty.');
    const timeout = _num(timeoutMs, DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);
    const gen = this._gen;
    const dir = await this.resolve(cwd == null ? '.' : cwd);
    const pathVar = await _commandPath();
    if (gen !== this._gen) throw _stopped();
    // The page can call a run off before it has an id (Stop pressed while the
    // PATH lookup is still running): then it never spawns.
    if (shouldStart && !shouldStart()) throw new CodeHostError('ESTOPPED', 'Stopped before it started.');
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

/**
 * A glob over a path relative to the workspace, as an anchored RegExp:
 * `*` and `?` within one folder name, `**` across folders, `**\/` for zero
 * or more whole folders, `[ab]`, `[a-z]` and `[!a]` for one character (never
 * a slash), and `{a,b}` for alternatives, which can hold any of these,
 * braces included. A `[` or `{` that nothing closes is a literal character.
 * search() also tests a glob against the bare file name, so one with no
 * slash (`*.js`) matches at any depth. A glob over MAX_GLOB_CHARS is
 * refused; any other is read in time linear in its length, since search()
 * reads it on the main process before its worker starts.
 */
function _globToRegExp(glob) {
  const g = String(glob);
  if (g.length > MAX_GLOB_CHARS) throw new CodeHostError('EINVAL', `Glob is ${g.length} characters; the limit is ${MAX_GLOB_CHARS}.`);
  const marks = _globMarks(g);
  return new RegExp('^' + _globSource(g, marks, 0, g.length) + '$');
}

/* One pass over the glob, left to right: the `]` that closes each `[` that
   opens a class (a `]` right after `[` or `[!` is part of the class, and
   inside a class `{`, `}` and `,` are plain characters) and, with a stack,
   the `}` that closes each `{` and the commas that split it (those of
   braces inside it excluded). A `{` left open at the end closes nothing:
   its commas are literal too. */
function _globMarks(g) {
  const n = g.length;
  const nextBracket = new Int32Array(n + 1).fill(-1); // the first `]` at or after each index
  for (let k = n - 1; k >= 0; k--) nextBracket[k] = g[k] === ']' ? k : nextBracket[k + 1];
  const classEnd = new Map();
  const braceEnd = new Map();
  const commas = new Map();
  const open = [];
  for (let i = 0; i < n; i++) {
    const c = g[i];
    if (c === '[') {
      let j = i + 1;
      if (g[j] === '!' || g[j] === '^') j++;
      if (g[j] === ']') j++;
      const k = nextBracket[j];
      if (k !== -1) { classEnd.set(i, k); i = k; }
    } else if (c === '{') {
      open.push(i);
      commas.set(i, []);
    } else if (c === '}') {
      if (open.length) braceEnd.set(open.pop(), i);
    } else if (c === ',' && open.length) commas.get(open[open.length - 1]).push(i);
  }
  return { classEnd, braceEnd, commas };
}

/* The pattern for g[from, to), which holds whole classes and braces only. */
function _globSource(g, marks, from, to) {
  let re = '';
  for (let i = from; i < to; i++) {
    const c = g[i];
    if (c === '*') {
      if (i + 1 < to && g[i + 1] === '*') {
        i++;
        if (i + 1 < to && g[i + 1] === '/') { re += '(?:.*/)?'; i++; }
        else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '[' && marks.classEnd.has(i)) {
      const close = marks.classEnd.get(i);
      let body = g.slice(i + 1, close);
      const negated = body[0] === '!' || body[0] === '^';
      if (negated) body = body.slice(1);
      body = body.replace(/[\\\][^]/g, '\\$&');
      re += negated ? '[^/' + body + ']' : '(?!/)[' + body + ']';
      i = close;
    } else if (c === '{' && marks.braceEnd.has(i)) {
      const close = marks.braceEnd.get(i);
      const cuts = [i, ...marks.commas.get(i), close];
      const alts = [];
      for (let k = 1; k < cuts.length; k++) alts.push(_globSource(g, marks, cuts[k - 1] + 1, cuts[k]));
      re += '(?:' + alts.join('|') + ')';
      i = close;
    } else re += c.replace(/[.+^$()|[\]\\{}]/g, '\\$&');
  }
  return re;
}

/** Plain object safe to send over IPC. */
function serializeError(e) {
  return { code: (e && e.code) || 'EUNKNOWN', message: (e && e.message) || String(e) };
}

function _resetCommandPath() {
  _loginPath = null;
  _pathLookup = null;
  _pathFailedAt = 0;
  _pathFailures = 0;
}

module.exports = {
  Workspace, CodeHostError, serializeError, runTag, _globToRegExp, _parseLoginPath, _resetCommandPath, SEARCH_COUNT,
  limits: { MAX_READ_BYTES, MAX_WRITE_BYTES, MAX_LINE_CHARS, MAX_OUTPUT_CHARS, DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS, KILL_GRACE_MS, MAX_SEARCH_MATCHES, MAX_SEARCH_MATCHES_CAP, SEARCH_TIMEOUT_MS, MIN_SEARCH_TIMEOUT_MS, MAX_SEARCHES, MAX_TAG_CHARS, MAX_GLOB_CHARS, PATH_RETRY_MS },
};
