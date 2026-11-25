// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const cp = require('child_process');
const { EventEmitter } = require('events');
const { Workspace, runTag, _globToRegExp, _parseLoginPath, _resetCommandPath, limits } = require('../code-host.js');

let tmp, root, outside, ws;

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nice-code-')));
  root = path.join(tmp, 'project');
  outside = path.join(tmp, 'secret');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(root, 'src', 'a.js'), 'const a = 1;\nconst b = 2;\nconst a2 = 3;\n');
  fs.writeFileSync(path.join(root, 'README.md'), '# Hello\n');
  fs.writeFileSync(path.join(outside, 'key.txt'), 'top secret');
  ws = await Workspace.open(root);
});

afterEach(() => {
  vi.restoreAllMocks();
  ws.killAll({ hard: true });
  fs.rmSync(tmp, { recursive: true, force: true });
});

const code = async (p) => { try { await p; return null; } catch (e) { return e.code; } };
const codeOf = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const CLOSE_GRACE = 500;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
// Poll until `pid` (a negative pid is a process group) is gone, or `ms` passes.
const goneWithin = async (pid, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (!alive(pid)) return true; await sleep(50); }
  return !alive(pid);
};
const wellFormed = (s) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

describe('Workspace.open', () => {
  it('refuses a missing folder and a file', async () => {
    expect(await code(Workspace.open(path.join(tmp, 'nope')))).toBe('ENOENT');
    expect(await code(Workspace.open(path.join(root, 'README.md')))).toBe('ENOTDIR');
  });
});

describe('paths stay inside the workspace', () => {
  it('refuses .. and absolute paths outside', async () => {
    expect(await code(ws.readFile('../secret/key.txt'))).toBe('EOUTSIDE');
    expect(await code(ws.readFile(path.join(outside, 'key.txt')))).toBe('EOUTSIDE');
    expect(await code(ws.writeFile('../escape.txt', 'x'))).toBe('EOUTSIDE');
    expect(fs.existsSync(path.join(tmp, 'escape.txt'))).toBe(false);
  });

  it('refuses a symlink that points outside, for reads and for new files under it', async () => {
    fs.symlinkSync(outside, path.join(root, 'link'));
    expect(await code(ws.readFile('link/key.txt'))).toBe('EOUTSIDE');
    expect(await code(ws.writeFile('link/new.txt', 'x'))).toBe('EOUTSIDE');
    expect(fs.existsSync(path.join(outside, 'new.txt'))).toBe(false);
  });

  it('refuses a dangling symlink, absolute or relative, so a write cannot create its target', async () => {
    fs.symlinkSync(path.join(outside, 'planted.txt'), path.join(root, 'notes.md'));
    fs.symlinkSync('../secret/rel.txt', path.join(root, 'rel.md'));
    expect(await code(ws.writeFile('notes.md', 'PWNED'))).toBe('ELINK');
    expect(await code(ws.writeFile('rel.md', 'PWNED'))).toBe('ELINK');
    expect(await code(ws.editFile('notes.md', 'a', 'b'))).toBe('ELINK');
    expect(fs.existsSync(path.join(outside, 'planted.txt'))).toBe(false);
    expect(fs.existsSync(path.join(outside, 'rel.txt'))).toBe(false);
  });

  it('allows names that only start with two dots', async () => {
    fs.writeFileSync(path.join(root, '..foo'), 'ok');
    expect((await ws.readFile('..foo')).content).toBe('ok');
  });

  it('flags the disk root, the home folder and the folders that hold it as too broad', async () => {
    expect(await Workspace.isBroad(os.homedir())).toBe('home');
    expect(await Workspace.isBroad(path.dirname(os.homedir()))).toBe(path.dirname(os.homedir()) === path.parse(os.homedir()).root ? 'disk' : 'above-home');
    expect(await Workspace.isBroad(path.parse(root).root)).toBe('disk');
    expect(await Workspace.isBroad(root)).toBe(null);
  });

  it.skipIf(process.platform === 'win32')('judges a folder by its real path, so a link to home or / is still broad', async () => {
    fs.symlinkSync(os.homedir(), path.join(tmp, 'h'));
    fs.symlinkSync('/', path.join(tmp, 'disk'));
    expect(await Workspace.isBroad(path.join(tmp, 'h'))).toBe('home');
    expect(await Workspace.isBroad(path.join(tmp, 'disk'))).toBe('disk');
  });

  it.skipIf(process.platform !== 'darwin' || !fs.existsSync(path.join('/System/Volumes/Data', os.homedir())))('flags the macOS firmlink paths to home, the folders above it and the data volume', async () => {
    const data = '/System/Volumes/Data';
    expect(await Workspace.isBroad(path.join(data, os.homedir()))).toBe('home');
    expect(await Workspace.isBroad(path.join(data, path.dirname(os.homedir())))).toBe('above-home');
    expect(await Workspace.isBroad(data)).toBe('disk');
    expect(await Workspace.isBroad(path.join(data, os.homedir(), 'nice-code-test-missing'))).toBe(null);
  });

  it.skipIf(process.platform === 'win32')('flags a folder on another device than its parent as a volume, wherever it is mounted', async () => {
    const vol = path.join(tmp, 'vol');
    fs.mkdirSync(vol);
    const realStat = fs.promises.stat;
    vi.spyOn(fs.promises, 'stat').mockImplementation(async (p, ...rest) => {
      const st = await realStat.call(fs.promises, p, ...rest);
      if (String(p) !== vol) return st;
      return Object.assign(Object.create(Object.getPrototypeOf(st)), st, { dev: typeof st.dev === 'bigint' ? st.dev + 1n : st.dev + 1 });
    });
    expect(await Workspace.isBroad(vol)).toBe('volume');
    expect(await Workspace.isBroad(root)).toBe(null);
  });

  it.skipIf(process.platform !== 'darwin' || !fs.existsSync('/Volumes'))('flags every volume under /Volumes, Macintosh HD as the disk', async () => {
    for (const name of fs.readdirSync('/Volumes')) {
      const p = path.join('/Volumes', name);
      const real = (() => { try { return fs.realpathSync(p); } catch { return p; } })();
      expect(await Workspace.isBroad(p), p).toBe(real === '/' ? 'disk' : 'volume');
    }
  });

  it.skipIf(process.platform !== 'darwin' || !fs.existsSync('/System/Volumes/Data/Volumes'))('flags a mounted volume reached through the data volume, /System/Volumes/Data/Volumes/<name>', async () => {
    const parentDev = fs.statSync('/Volumes').dev;
    for (const name of fs.readdirSync('/Volumes')) {
      const p = path.join('/System/Volumes/Data/Volumes', name);
      let st;
      try { st = fs.statSync(p); } catch { continue; }
      const real = fs.realpathSync(p);
      if (real !== '/' && st.dev === parentDev) continue; // a leftover folder, not a mount
      expect(await Workspace.isBroad(p), p).toBe(real === '/' ? 'disk' : 'volume');
    }
  });

  it.skipIf(process.platform === 'win32')('still judges a folder when one of the folders it is compared with does not answer', async () => {
    // `alias` stands for a second path to home (a bind mount or firmlink), and the folder above home hangs.
    const alias = path.join(tmp, 'alias');
    fs.mkdirSync(alias);
    const slow = path.dirname(os.homedir());
    const realStat = fs.promises.stat;
    vi.spyOn(fs.promises, 'stat').mockImplementation((p, ...rest) => {
      if (String(p) === slow) return new Promise(() => {});
      return realStat.call(fs.promises, String(p) === alias ? os.homedir() : p, ...rest);
    });
    const t0 = Date.now();
    expect(await Workspace.isBroad(alias)).toBe('home');
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it.skipIf(process.platform !== 'darwin')('asks none of the volumes under /Volumes when judging a folder', async () => {
    const asked = [];
    const realStat = fs.promises.stat;
    const realReaddir = fs.promises.readdir;
    vi.spyOn(fs.promises, 'stat').mockImplementation((p, ...rest) => { asked.push(String(p)); return realStat.call(fs.promises, p, ...rest); });
    vi.spyOn(fs.promises, 'readdir').mockImplementation((p, ...rest) => { asked.push(String(p)); return realReaddir.call(fs.promises, p, ...rest); });
    expect(await Workspace.isBroad(root)).toBe(null);
    expect(asked.filter((q) => q === '/Volumes' || q.startsWith('/Volumes/'))).toEqual([]);
  });

  it('accepts absolute paths inside and a NUL byte never', async () => {
    expect((await ws.readFile(path.join(root, 'README.md'))).content).toBe('# Hello\n');
    expect(await code(ws.readFile('README.md\0.txt'))).toBe('EINVAL');
  });
});

describe('files', () => {
  it('reads a slice of lines, counting a trailing newline as no extra line', async () => {
    const r = await ws.readFile('src/a.js', { offset: 1, limit: 1 });
    expect(r).toMatchObject({ path: path.join('src', 'a.js'), content: 'const b = 2;', startLine: 2, endLine: 2, totalLines: 3, encoding: 'utf8', exact: true });
  });

  it('takes numeric strings for the offset and limit, and replaceAll only as true or \'true\'', async () => {
    expect(await ws.readFile('src/a.js', { offset: '1', limit: '1' })).toMatchObject({ content: 'const b = 2;', startLine: 2, endLine: 2 });
    expect(await ws.readFile('src/a.js', { offset: ' 2 ', limit: 'x' })).toMatchObject({ content: 'const a2 = 3;\n', startLine: 3 });
    expect(await code(ws.editFile('src/a.js', 'const', 'let', { replaceAll: 'false' }))).toBe('EAMBIGUOUS');
    expect(await code(ws.editFile('src/a.js', 'const', 'let', { replaceAll: 1 }))).toBe('EAMBIGUOUS');
    expect((await ws.editFile('src/a.js', 'const', 'let', { replaceAll: 'true' })).replacements).toBe(3);
  });

  it('keeps line numbers consistent at the edges', async () => {
    expect(await ws.readFile('src/a.js', { offset: 10 })).toMatchObject({ content: '', startLine: 4, endLine: 3, totalLines: 3 });
    expect(await ws.readFile('src/a.js', { offset: 2, limit: 5 })).toMatchObject({ content: 'const a2 = 3;\n', startLine: 3, endLine: 3 });
    expect(await ws.readFile('src/a.js', { offset: 2 ** 32 + 1, limit: 1 })).toMatchObject({ content: '', startLine: 4, endLine: 3 });
    expect(await ws.readFile('src/a.js', { offset: -5, limit: NaN })).toMatchObject({ startLine: 1, endLine: 3 });
    fs.writeFileSync(path.join(root, 'empty.txt'), '');
    expect(await ws.readFile('empty.txt')).toMatchObject({ content: '', totalLines: 0, startLine: 1, endLine: 0 });
  });

  it('cuts very long lines', async () => {
    fs.writeFileSync(path.join(root, 'min.js'), 'x'.repeat(limits.MAX_LINE_CHARS + 10));
    const r = await ws.readFile('min.js');
    expect(r.linesCut).toBe(true);
    expect(r.content.length).toBeLessThan(limits.MAX_LINE_CHARS + 100);
  });

  it('refuses binary and oversized files', async () => {
    fs.writeFileSync(path.join(root, 'bin'), Buffer.from([1, 0, 2]));
    expect(await code(ws.readFile('bin'))).toBe('EBINARY');
    fs.writeFileSync(path.join(root, 'big'), 'x'.repeat(limits.MAX_READ_BYTES + 1));
    expect(await code(ws.readFile('big'))).toBe('ETOOBIG');
  });

  it('says when a file is not exact UTF-8, and will not write its lossy text back without overwrite', async () => {
    const latin1 = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]);
    fs.writeFileSync(path.join(root, 'latin1.txt'), latin1);
    const r = await ws.readFile('latin1.txt');
    expect(r).toMatchObject({ exact: false, encoding: 'lossy' });
    expect(await code(ws.writeFile('latin1.txt', r.content))).toBe('EENCODING');
    expect(fs.readFileSync(path.join(root, 'latin1.txt')).equals(latin1)).toBe(true);
    expect(await ws.writeFile('latin1.txt', 'café\n', { overwrite: true })).toMatchObject({ created: false });
    expect(fs.readFileSync(path.join(root, 'latin1.txt'), 'utf8')).toBe('café\n');
  });

  it('will not write text over a file with NUL bytes without overwrite', async () => {
    const bin = Buffer.from([0x89, 0x50, 0x00, 0x01]);
    fs.writeFileSync(path.join(root, 'logo.png'), bin);
    expect(await code(ws.writeFile('logo.png', 'oops'))).toBe('EENCODING');
    expect(fs.readFileSync(path.join(root, 'logo.png')).equals(bin)).toBe(true);
  });

  it('refuses content over the write limit', async () => {
    expect(await code(ws.writeFile('huge.txt', 'x'.repeat(limits.MAX_WRITE_BYTES + 1)))).toBe('ETOOBIG');
    expect(fs.existsSync(path.join(root, 'huge.txt'))).toBe(false);
  });

  it('refuses to write or edit inside .git at any depth, but reads there', async () => {
    fs.mkdirSync(path.join(root, '.git', 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(root, '.git', 'config'), '[core]\n');
    fs.mkdirSync(path.join(root, 'vendor', 'lib', '.git'), { recursive: true });
    expect(await code(ws.writeFile('.git/hooks/pre-commit', '#!/bin/sh\necho hi'))).toBe('EPROTECTED');
    expect(await code(ws.writeFile('vendor/lib/.git/config', 'x'))).toBe('EPROTECTED');
    expect(await code(ws.writeFile('.GIT/hooks/post-checkout', 'x'))).toBe('EPROTECTED');
    expect(await code(ws.writeFile('sub/.git', 'gitdir: /elsewhere'))).toBe('EPROTECTED');
    expect(await code(ws.editFile('.git/config', '[core]', '[core]\n\thooksPath = /tmp'))).toBe('EPROTECTED');
    expect(fs.existsSync(path.join(root, '.git', 'hooks', 'pre-commit'))).toBe(false);
    expect((await ws.readFile('.git/config')).content).toBe('[core]\n');
    expect(await ws.writeFile('.gitignore', 'node_modules\n')).toMatchObject({ created: true });
  });

  it.skipIf(process.platform === 'win32')('refuses to write through a symlink to .git', async () => {
    fs.mkdirSync(path.join(root, '.git', 'hooks'), { recursive: true });
    fs.symlinkSync(path.join(root, '.git', 'hooks'), path.join(root, 'hooks'));
    expect(await code(ws.writeFile('hooks/pre-push', 'x'))).toBe('EPROTECTED');
  });

  it.skipIf(process.platform === 'win32')('refuses .git paths as asked for and git directories of other names, but reads there', async () => {
    const gitdir = (d) => {
      for (const sub of ['objects', 'refs', 'hooks']) fs.mkdirSync(path.join(d, sub), { recursive: true });
      fs.writeFileSync(path.join(d, 'HEAD'), 'ref: refs/heads/main\n');
      fs.writeFileSync(path.join(d, 'config'), '[core]\n');
    };
    // Android's repo tool: app/.git holds symlinks into .repo, lib/.git is one.
    const app = path.join(root, '.repo', 'projects', 'app.git');
    gitdir(app);
    gitdir(path.join(root, '.repo', 'projects', 'lib.git'));
    fs.mkdirSync(path.join(root, 'app', '.git'), { recursive: true });
    fs.symlinkSync('../../.repo/projects/app.git/config', path.join(root, 'app', '.git', 'config'));
    fs.symlinkSync('../../.repo/projects/app.git/hooks', path.join(root, 'app', '.git', 'hooks'));
    fs.mkdirSync(path.join(root, 'lib'));
    fs.symlinkSync('../.repo/projects/lib.git', path.join(root, 'lib', '.git'));
    fs.symlinkSync('.repo/projects/lib.git/config', path.join(root, 'cfg'));
    for (const p of ['app/.git/config', 'app/.git/hooks/pre-commit', 'lib/.git/config', '.repo/projects/lib.git/config', '.repo/projects/lib.git/hooks/post-checkout', 'cfg']) {
      expect(await code(ws.writeFile(p, '[core]\n\tfsmonitor = touch /tmp/x\n')), p).toBe('EPROTECTED');
    }
    expect(await code(ws.editFile('app/.git/config', '[core]', '[core]\n\thooksPath = /tmp'))).toBe('EPROTECTED');
    expect(fs.readFileSync(path.join(app, 'config'), 'utf8')).toBe('[core]\n');
    expect(fs.existsSync(path.join(app, 'hooks', 'pre-commit'))).toBe(false);
    expect((await ws.readFile('app/.git/config')).content).toBe('[core]\n');
    expect(await ws.writeFile('app/main.c', 'int main;\n')).toMatchObject({ created: true });
  });

  it('writes files with long names (the temporary name stays short)', async () => {
    const name = 'a'.repeat(251) + '.md';
    expect(await ws.writeFile(name, 'one\n')).toMatchObject({ created: true });
    await ws.editFile(name, 'one', 'two');
    expect(fs.readFileSync(path.join(root, name), 'utf8')).toBe('two\n');
  });

  it('removes the temporary file when the write itself fails', async () => {
    const probe = await fs.promises.open(path.join(root, 'README.md'), 'r');
    const proto = Object.getPrototypeOf(probe);
    await probe.close();
    vi.spyOn(proto, 'writeFile').mockRejectedValueOnce(Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' }));
    expect(await code(ws.writeFile('README.md', 'new'))).toBe('ENOSPC');
    expect(fs.readdirSync(root).filter(n => n.includes('.nice-'))).toEqual([]);
    expect(fs.readFileSync(path.join(root, 'README.md'), 'utf8')).toBe('# Hello\n');
  });

  it.skipIf(process.platform === 'win32' || (process.getuid && process.getuid() === 0))('refuses to replace a read-only file', async () => {
    fs.chmodSync(path.join(root, 'README.md'), 0o444);
    expect(await code(ws.writeFile('README.md', 'x'))).toBe('EACCES');
    expect(await code(ws.editFile('README.md', 'Hello', 'Bye'))).toBe('EACCES');
    expect(fs.readFileSync(path.join(root, 'README.md'), 'utf8')).toBe('# Hello\n');
  });

  it.skipIf(process.platform === 'win32')('keeps permission bits the umask would drop', async () => {
    fs.chmodSync(path.join(root, 'README.md'), 0o666);
    await ws.writeFile('README.md', 'x');
    expect(fs.statSync(path.join(root, 'README.md')).mode & 0o777).toBe(0o666);
  });

  it.skipIf(process.platform === 'win32')('does not follow a symlink swapped in after the path was checked', async () => {
    fs.symlinkSync(path.join(outside, 'key.txt'), path.join(root, 'swapped'));
    ws.resolve = async () => path.join(root, 'swapped');
    expect(await code(ws.readFile('README.md'))).toBe('ELINK');
    expect(await code(ws.editFile('README.md', 'top', 'TOP'))).toBe('ELINK');
    expect(fs.readFileSync(path.join(outside, 'key.txt'), 'utf8')).toBe('top secret');
  });

  it.skipIf(process.platform === 'win32')('checks the folder again before the rename, so a folder swapped for a link is refused', async () => {
    fs.mkdirSync(path.join(root, 'sub'));
    const realOpen = fs.promises.open;
    vi.spyOn(fs.promises, 'open').mockImplementation(async (p, ...rest) => {
      const fh = await realOpen.call(fs.promises, p, ...rest);
      if (String(p).includes('.nice-')) {
        fs.renameSync(path.join(root, 'sub'), path.join(root, 'sub-moved'));
        fs.symlinkSync(outside, path.join(root, 'sub'));
      }
      return fh;
    });
    expect(await code(ws.writeFile('sub/f.txt', 'x'))).toBe('EOUTSIDE');
    expect(fs.existsSync(path.join(outside, 'f.txt'))).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('removes a failed write\'s temporary file only by a path that still names it', async () => {
    fs.mkdirSync(path.join(root, 'sub'));
    const realOpen = fs.promises.open;
    let tmpName = null;
    vi.spyOn(fs.promises, 'open').mockImplementation(async (p, ...rest) => {
      const fh = await realOpen.call(fs.promises, p, ...rest);
      if (String(p).includes('.nice-')) {
        tmpName = path.basename(String(p));
        fs.renameSync(path.join(root, 'sub'), path.join(root, 'sub-moved'));
        fs.symlinkSync(outside, path.join(root, 'sub'));
        fs.writeFileSync(path.join(outside, tmpName), 'not ours');
      }
      return fh;
    });
    expect(await code(ws.writeFile('sub/f.txt', 'x'))).toBe('EOUTSIDE');
    expect(fs.readFileSync(path.join(outside, tmpName), 'utf8')).toBe('not ours');
    // Only Linux can say where the moved folder went; on a Mac its temporary file stays there.
    if (process.platform === 'linux') expect(fs.readdirSync(path.join(root, 'sub-moved'))).toEqual([]);
  });

  it.skipIf(process.platform === 'win32')('makes missing folders one at a time, so a folder swapped for a link gets none made outside', async () => {
    fs.mkdirSync(path.join(root, 'sub'));
    const resolve = ws.resolve.bind(ws);
    ws.resolve = async (q) => {
      const real = await resolve(q);
      fs.renameSync(path.join(root, 'sub'), path.join(root, 'sub-moved'));
      fs.symlinkSync(outside, path.join(root, 'sub'));
      return real;
    };
    expect(await code(ws.writeFile('sub/new/deep/f.txt', 'x'))).toBe('EOUTSIDE');
    expect(fs.readdirSync(outside)).toEqual(['key.txt']);
  });

  it('retries a rename that Windows refuses for a moment, and only on Windows', async () => {
    const realRename = fs.promises.rename;
    const busy = () => Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
    const spy = vi.spyOn(fs.promises, 'rename');
    spy.mockRejectedValueOnce(busy()).mockRejectedValueOnce(busy()).mockImplementation((a, b) => realRename.call(fs.promises, a, b));
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
    try {
      expect(await ws.writeFile('README.md', 'windows')).toMatchObject({ created: false });
    } finally {
      Object.defineProperty(process, 'platform', platform);
    }
    expect(spy).toHaveBeenCalledTimes(3);
    expect(read('README.md')).toBe('windows');
    if (process.platform === 'win32') return;
    spy.mockReset();
    spy.mockRejectedValueOnce(busy()).mockImplementation((a, b) => realRename.call(fs.promises, a, b));
    expect(await code(ws.writeFile('README.md', 'posix'))).toBe('EBUSY');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(fs.readdirSync(root).filter(n => n.includes('.nice-'))).toEqual([]);
  });

  it('writes new files, making folders, and overwrites', async () => {
    expect(await ws.writeFile('new/dir/f.txt', 'hi')).toMatchObject({ created: true, bytes: 2 });
    expect(await ws.writeFile('new/dir/f.txt', 'hello')).toMatchObject({ created: false });
    expect(fs.readFileSync(path.join(root, 'new/dir/f.txt'), 'utf8')).toBe('hello');
  });

  it('edits only a unique match unless told to replace all', async () => {
    expect(await code(ws.editFile('src/a.js', 'const', 'let'))).toBe('EAMBIGUOUS');
    expect(await code(ws.editFile('src/a.js', 'nope', 'x'))).toBe('ENOMATCH');
    const one = await ws.editFile('src/a.js', 'const b', 'let b');
    expect(one.replacements).toBe(1);
    expect(one.after).toContain('let b = 2;');
    const all = await ws.editFile('src/a.js', 'const', 'var', { replaceAll: true });
    expect(all.replacements).toBe(2);
    expect(fs.readFileSync(path.join(root, 'src/a.js'), 'utf8')).toBe('var a = 1;\nlet b = 2;\nvar a2 = 3;\n');
  });

  it('refuses to edit files that are not UTF-8 or contain NUL, leaving them untouched', async () => {
    const latin1 = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a, 0x66, 0x6f, 0x6f, 0x0a]);
    fs.writeFileSync(path.join(root, 'latin1.txt'), latin1);
    expect(await code(ws.editFile('latin1.txt', 'foo', 'bar'))).toBe('EENCODING');
    expect(fs.readFileSync(path.join(root, 'latin1.txt')).equals(latin1)).toBe(true);
    fs.writeFileSync(path.join(root, 'nul.txt'), Buffer.from('foo\0bar'));
    expect(await code(ws.editFile('nul.txt', 'foo', 'baz'))).toBe('EBINARY');
  });

  it('edits CRLF files with LF text and keeps CRLF', async () => {
    fs.writeFileSync(path.join(root, 'crlf.txt'), 'one\r\ntwo\r\nthree\r\n');
    await ws.editFile('crlf.txt', 'one\ntwo', 'uno\ndos');
    expect(fs.readFileSync(path.join(root, 'crlf.txt'), 'utf8')).toBe('uno\r\ndos\r\nthree\r\n');
  });

  it('gives multi-line new text CRLF in a CRLF file, from one-line old text or old text that has CR', async () => {
    fs.writeFileSync(path.join(root, 'crlf.txt'), 'one\r\ntwo\r\nthree\r\n');
    await ws.editFile('crlf.txt', 'one', 'uno\nuno bis');
    expect(fs.readFileSync(path.join(root, 'crlf.txt'), 'utf8')).toBe('uno\r\nuno bis\r\ntwo\r\nthree\r\n');
    await ws.editFile('crlf.txt', 'two\r\nthree', 'dos\ntres');
    expect(fs.readFileSync(path.join(root, 'crlf.txt'), 'utf8')).toBe('uno\r\nuno bis\r\ndos\r\ntres\r\n');
  });

  it('keeps CRLF when old text ends in the CR of a line end and new text does not', async () => {
    fs.writeFileSync(path.join(root, 'crlf.txt'), 'one\r\ntwo\r\nthree\r\n');
    await ws.editFile('crlf.txt', 'two\r', 'TWO');
    expect(read('crlf.txt')).toBe('one\r\nTWO\r\nthree\r\n');
    await ws.editFile('crlf.txt', 'one\r\nTWO\r', 'ONE\nTWO');
    expect(read('crlf.txt')).toBe('ONE\r\nTWO\r\nthree\r\n');
    await ws.editFile('crlf.txt', 'three\r', 'THREE\n');
    expect(read('crlf.txt')).toBe('ONE\r\nTWO\r\nTHREE\r\n\r\n');
  });

  it('treats a file with a few stray LFs as CRLF, and writes no bare LF into it', async () => {
    const nine = Array.from({ length: 9 }, (_, i) => `l${i}\r\n`).join('');
    fs.writeFileSync(path.join(root, 'mostly.txt'), nine + 'last\n');
    await ws.editFile('mostly.txt', 'l0\nl1', 'L0\nL1');
    expect(read('mostly.txt').startsWith('L0\r\nL1\r\nl2\r\n')).toBe(true);
    await ws.editFile('mostly.txt', 'last\n', 'LAST\nmore\n');
    expect(read('mostly.txt').endsWith('l8\r\nLAST\r\nmore\r\n')).toBe(true);
    await ws.editFile('mostly.txt', 'l5\r', 'five');
    expect(read('mostly.txt')).toContain('l4\r\nfive\r\nl6\r\n');
  });

  it('leaves a file with a real mix of line ends as it is, and says so when nothing matches', async () => {
    fs.writeFileSync(path.join(root, 'mixed.txt'), 'a\r\nb\nc\n');
    expect(await code(ws.editFile('mixed.txt', 'a\nb', 'x'))).toBe('ENOMATCH');
    await expect(ws.editFile('mixed.txt', 'a\nb', 'x')).rejects.toThrow(/mix of CRLF and LF/);
    await ws.editFile('mixed.txt', 'b\nc', 'B\nC');
    expect(read('mixed.txt')).toBe('a\r\nB\nC\n');
  });

  it('reads a CRLF file with LF line ends and says which line ends a file has', async () => {
    fs.writeFileSync(path.join(root, 'crlf.txt'), 'one\r\ntwo\r\nthree\r\n');
    expect(await ws.readFile('crlf.txt')).toMatchObject({ content: 'one\ntwo\nthree\n', lineEndings: 'crlf', totalLines: 3 });
    expect((await ws.readFile('crlf.txt', { offset: 1, limit: 1 })).content).toBe('two');
    expect((await ws.readFile('src/a.js')).lineEndings).toBe('lf');
    fs.writeFileSync(path.join(root, 'mixed.txt'), 'a\r\nb\n');
    expect(await ws.readFile('mixed.txt')).toMatchObject({ content: 'a\r\nb\n', lineEndings: 'mixed' });
  });

  it('writes CRLF over a CRLF file unless told to keep the line ends given', async () => {
    fs.writeFileSync(path.join(root, 'crlf.txt'), 'a\r\nb\r\n');
    const { content } = await ws.readFile('crlf.txt');
    expect(await ws.writeFile('crlf.txt', content)).toMatchObject({ convertedToCrlf: true, bytes: 6 });
    expect(read('crlf.txt')).toBe('a\r\nb\r\n');
    await ws.writeFile('crlf.txt', 'x\ny\r\nz');
    expect(read('crlf.txt')).toBe('x\r\ny\r\nz');
    expect(await ws.writeFile('crlf.txt', 'p\nq\n', { lineEndings: 'keep' })).toMatchObject({ convertedToCrlf: false });
    expect(read('crlf.txt')).toBe('p\nq\n');
    expect(await ws.writeFile('fresh.txt', 'n\n')).toMatchObject({ convertedToCrlf: false });
    expect(read('fresh.txt')).toBe('n\n');
    await ws.writeFile('README.md', 'lf\nfile\n');
    expect(read('README.md')).toBe('lf\nfile\n');
  });

  it.skipIf(process.platform === 'win32' || (process.getuid && process.getuid() === 0))('replaces a file it can write but not read only with overwrite', async () => {
    const f = path.join(root, 'wo.txt');
    fs.writeFileSync(f, 'x');
    fs.chmodSync(f, 0o200);
    try {
      expect(await code(ws.writeFile('wo.txt', 'y'))).toBe('EACCES');
      await expect(ws.writeFile('wo.txt', 'y')).rejects.toThrow(/cannot be read.*Pass overwrite/);
      expect(await ws.writeFile('wo.txt', 'y', { overwrite: true })).toEqual({ path: 'wo.txt', created: false, bytes: 1, convertedToCrlf: false });
      expect(fs.statSync(f).mode & 0o777).toBe(0o200);
    } finally {
      fs.chmodSync(f, 0o600);
    }
    expect(read('wo.txt')).toBe('y');
  });

  it('reads files with a lone CR (CR CR LF included) as mixed, as they are, and writes them back unchanged', async () => {
    for (const [name, body] of [['crcrlf.txt', 'a\r\r\nb\r\n'], ['cr.txt', 'a\rb\rc\r'], ['crthen.txt', 'x\ry\r\nz\r\n'], ['crcrlf-only.txt', 'a\r\r\n']]) {
      fs.writeFileSync(path.join(root, name), body);
      const r = await ws.readFile(name);
      expect(r, name).toMatchObject({ content: body, lineEndings: 'mixed' });
      expect(await ws.writeFile(name, r.content), name).toMatchObject({ convertedToCrlf: false });
      expect(read(name), name).toBe(body);
    }
    await expect(ws.editFile('cr.txt', 'a\nb', 'x')).rejects.toThrow(/its lines end in lone CR,/);
  });

  it('judges the line ends of a file that is not UTF-8 by its bytes, so overwrite keeps its CRLF', async () => {
    fs.writeFileSync(path.join(root, 'w1252.txt'), Buffer.from('caf\xe9\r\nline2\r\n', 'latin1'));
    const r = await ws.readFile('w1252.txt');
    expect(r).toMatchObject({ content: 'caf\ufffd\nline2\n', lineEndings: 'crlf', exact: false, encoding: 'lossy' });
    expect(await code(ws.writeFile('w1252.txt', r.content))).toBe('EENCODING');
    expect(await ws.writeFile('w1252.txt', r.content.replace('line2', 'LINE2'), { overwrite: true })).toMatchObject({ convertedToCrlf: true });
    expect(read('w1252.txt')).toBe('caf\ufffd\r\nLINE2\r\n');
    // One with a lone CR is mixed, and overwrite leaves its line ends as they come.
    fs.writeFileSync(path.join(root, 'w1252-mixed.txt'), Buffer.from('caf\xe9\r\r\nx\r\n', 'latin1'));
    const m = await ws.readFile('w1252-mixed.txt');
    expect(m).toMatchObject({ content: 'caf\ufffd\r\r\nx\r\n', lineEndings: 'mixed' });
    expect(await ws.writeFile('w1252-mixed.txt', m.content, { overwrite: true })).toMatchObject({ convertedToCrlf: false });
    expect(read('w1252-mixed.txt')).toBe('caf\ufffd\r\r\nx\r\n');
  });

  it('keeps the file mode on edit and leaves no temporary files', async () => {
    fs.chmodSync(path.join(root, 'README.md'), 0o755);
    await ws.editFile('README.md', 'Hello', 'Hi');
    expect(fs.statSync(path.join(root, 'README.md')).mode & 0o777).toBe(0o755);
    expect(fs.readdirSync(root).filter(n => n.includes('.nice-'))).toEqual([]);
  });

  it.skipIf(process.platform === 'win32')('refuses to read or write a FIFO', async () => {
    require('child_process').execFileSync('mkfifo', [path.join(root, 'pipe')]);
    expect(await code(ws.readFile('pipe'))).toBe('ENOTFILE');
    expect(await code(ws.writeFile('pipe', 'x'))).toBe('ENOTFILE');
  });

  it('keeps $ patterns in the new text literal', async () => {
    await ws.editFile('README.md', 'Hello', '$& and $1');
    expect(fs.readFileSync(path.join(root, 'README.md'), 'utf8')).toBe('# $& and $1\n');
  });

  it('lists folders first', async () => {
    const r = await ws.listDir('.');
    expect(r.entries.map(e => e.name)).toEqual(['src', 'README.md']);
    expect(r.entries[0].type).toBe('dir');
  });
});

describe('search', () => {
  it('finds matching lines with paths and line numbers, skipping node_modules', async () => {
    fs.mkdirSync(path.join(root, 'node_modules'));
    fs.writeFileSync(path.join(root, 'node_modules', 'x.js'), 'const a = 9;');
    const r = await ws.search('const a');
    expect(r.matches.map(m => `${m.path}:${m.line}`)).toEqual([path.join('src', 'a.js') + ':1', path.join('src', 'a.js') + ':3']);
  });

  it('filters by glob and caps matches', async () => {
    expect((await ws.search('Hello', { glob: '*.js' })).matches).toHaveLength(0);
    expect((await ws.search('Hello', { glob: '*.md' })).matches).toHaveLength(1);
    const capped = await ws.search('const', { maxMatches: 1 });
    expect(capped.matches).toHaveLength(1);
    expect(capped).toMatchObject({ truncated: true, truncatedBy: 'matches', timedOut: false });
  });

  it('takes null and odd options as the defaults', async () => {
    const r = await ws.search('const', { maxMatches: null, timeoutMs: null, glob: null, dir: null });
    expect(r.matches).toHaveLength(3);
    expect(r).toMatchObject({ truncated: false, truncatedBy: null });
    expect((await ws.search('const', { maxMatches: Infinity, timeoutMs: NaN })).matches).toHaveLength(3);
  });

  it('refuses a file or a missing folder as the place to search', async () => {
    expect(await code(ws.search('x', { dir: 'README.md' }))).toBe('ENOTDIR');
    expect(await code(ws.search('x', { dir: 'nope' }))).toBe('ENOENT');
  });

  it('splits CRLF lines, so $ works, and reports no line past the end', async () => {
    fs.writeFileSync(path.join(root, 'crlf.txt'), 'one\r\ntwo\r\n');
    expect((await ws.search('two$', { glob: '*.txt' })).matches).toEqual([{ path: 'crlf.txt', line: 2, text: 'two' }]);
    fs.writeFileSync(path.join(root, 'end.txt'), 'a\n');
    expect((await ws.search('^$', { glob: 'end.txt' })).matches).toEqual([]);
  });

  it('says what it skipped', async () => {
    fs.writeFileSync(path.join(root, 'big.log'), 'needle\n' + 'x'.repeat(limits.MAX_READ_BYTES));
    fs.writeFileSync(path.join(root, 'bin.dat'), Buffer.from('needle\0'));
    fs.writeFileSync(path.join(root, 'ok.txt'), 'needle\n');
    const r = await ws.search('needle');
    expect(r.matches.map(m => m.path)).toEqual(['ok.txt']);
    expect(r.skipped).toEqual({ tooBig: 1, binary: 1, unreadable: 0, dirs: {} });
  });

  it('skips node_modules and build folders unless the search starts inside one, and says which it skipped', async () => {
    fs.mkdirSync(path.join(root, 'node_modules', 'pkg', 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(root, 'node_modules', 'x.js'), 'needle');
    fs.writeFileSync(path.join(root, 'node_modules', 'pkg', 'node_modules', 'y.js'), 'needle');
    fs.mkdirSync(path.join(root, 'src', 'build'));
    fs.writeFileSync(path.join(root, 'src', 'build', 'z.js'), 'needle');
    const top = await ws.search('needle');
    expect(top.matches).toEqual([]);
    expect(top.skipped.dirs).toEqual({ node_modules: 1, build: 1 });
    const inside = await ws.search('needle', { dir: 'node_modules' });
    expect(inside.matches.map(m => m.path).sort()).toEqual([path.join('node_modules', 'pkg', 'node_modules', 'y.js'), path.join('node_modules', 'x.js')].sort());
    expect(inside.skipped.dirs).toEqual({});
    expect((await ws.search('needle', { dir: 'src/build' })).matches.map(m => m.path)).toEqual([path.join('src', 'build', 'z.js')]);
  });

  it.skipIf(process.platform === 'win32' || (process.getuid && process.getuid() === 0))('counts unreadable folders and files, and refuses a start folder it cannot read', async () => {
    fs.mkdirSync(path.join(root, 'locked'));
    fs.writeFileSync(path.join(root, 'locked', 'f.txt'), 'needle');
    fs.writeFileSync(path.join(root, 'secret.txt'), 'needle');
    fs.chmodSync(path.join(root, 'locked'), 0);
    fs.chmodSync(path.join(root, 'secret.txt'), 0);
    try {
      const r = await ws.search('needle');
      expect(r.matches).toEqual([]);
      expect(r.skipped.unreadable).toBe(2);
      expect(await code(ws.search('needle', { dir: 'locked' }))).toBe('EACCES');
    } finally {
      fs.chmodSync(path.join(root, 'locked'), 0o755);
      fs.chmodSync(path.join(root, 'secret.txt'), 0o644);
    }
  });

  it('shows the part of a long line around the match', async () => {
    fs.writeFileSync(path.join(root, 'min.js'), 'x'.repeat(1000) + 'needle' + 'y'.repeat(1000) + '\n' + 'z'.repeat(600) + '\u{1F600}'.repeat(300) + 'pin\n');
    const [first, second] = (await ws.search('needle|pin')).matches;
    expect(first.text).toContain('needle');
    expect(first.text).toHaveLength(500);
    expect(second.text.endsWith('pin')).toBe(true);
    expect(wellFormed(second.text)).toBe(true);
    expect(second.text.length).toBeLessThanOrEqual(500);
  });

  it('takes numeric strings for its limits, 0 as the minimum, Infinity as the cap, and ignoreCase only as true or \'true\'', async () => {
    fs.writeFileSync(path.join(root, 'hits.txt'), 'hit\n'.repeat(300) + 'HIT\n');
    expect((await ws.search('hit', { maxMatches: '5' })).matches).toHaveLength(5);
    expect((await ws.search('hit', { maxMatches: Infinity })).matches).toHaveLength(300);
    expect((await ws.search('hit', { maxMatches: 0 })).matches).toHaveLength(1);
    expect((await ws.search('HIT', { ignoreCase: 'false' })).matches).toHaveLength(1);
    expect((await ws.search('HIT', { ignoreCase: 1 })).matches).toHaveLength(1);
    expect((await ws.search('HIT', { ignoreCase: 'true', maxMatches: 1000 })).matches).toHaveLength(301);
    fs.writeFileSync(path.join(root, 'evil.txt'), 'a'.repeat(40) + '!');
    for (const timeoutMs of [0, '200']) {
      const t0 = Date.now();
      const r = await ws.search('^(a+)+$', { timeoutMs });
      expect(r.timedOut, String(timeoutMs)).toBe(true);
      expect(Date.now() - t0).toBeLessThan(1500);
    }
  }, 15000);

  it('limits searches running at once', async () => {
    fs.writeFileSync(path.join(root, 'evil.txt'), 'a'.repeat(40) + '!');
    const running = [];
    for (let i = 0; i < limits.MAX_SEARCHES; i++) running.push(ws.search('^(a+)+$', { timeoutMs: 5000 }).catch(e => e));
    expect(await code(ws.search('x'))).toBe('EBUSY');
    ws.killAll();
    for (const e of await Promise.all(running)) expect(e.code).toBe('ESTOPPED');
    expect((await ws.search('const')).matches).toHaveLength(3);
  }, 10000);

  it('stops a search that has not started yet, or is running, on killAll', async () => {
    const early = ws.search('const');
    ws.killAll();
    expect(await code(early)).toBe('ESTOPPED');
    fs.writeFileSync(path.join(root, 'evil.txt'), 'a'.repeat(40) + '!');
    const t0 = Date.now();
    const running = ws.search('^(a+)+$', { timeoutMs: 8000 });
    await sleep(200);
    ws.killAll();
    expect(await code(running)).toBe('ESTOPPED');
    expect(Date.now() - t0).toBeLessThan(2000);
  }, 10000);

  it('refuses a bad pattern or glob with EINVAL', async () => {
    expect(await code(ws.search('('))).toBe('EINVAL');
  });

  it('stops a pattern that backtracks badly, keeping the matches found before it', async () => {
    fs.writeFileSync(path.join(root, 'a.txt'), 'aaaa\n');
    fs.writeFileSync(path.join(root, 'evil.txt'), 'a'.repeat(40) + '!');
    const t0 = Date.now();
    const r = await ws.search('^(a+)+$', { timeoutMs: 500 });
    expect(r).toMatchObject({ timedOut: true, truncated: true, truncatedBy: 'time' });
    expect(r.matches).toEqual([{ path: 'a.txt', line: 1, text: 'aaaa' }]);
    expect(Date.now() - t0).toBeLessThan(3000);
  }, 10000);

  it('keeps the matches before a slow line in the same file, and the counts so far', async () => {
    for (let i = 0; i < 300; i++) fs.writeFileSync(path.join(root, `f${String(i).padStart(3, '0')}.txt`), 'nothing here\n');
    fs.writeFileSync(path.join(root, 'zz.txt'), 'aaaa\nhitline\n' + 'a'.repeat(40) + '!');
    const r = await ws.search('^(a+)+$', { timeoutMs: 1000 });
    expect(r).toMatchObject({ timedOut: true, truncatedBy: 'time' });
    expect(r.matches).toEqual([{ path: 'zz.txt', line: 1, text: 'aaaa' }]);
    // The 300 files, README.md, src/a.js, and zz.txt itself.
    expect(r.filesSearched).toBe(303);
  }, 10000);

  it('finds files with ** globs at any depth and nowhere else', async () => {
    for (const f of ['a.js', 'b.js', 'banana.js', 'src/a.js', 'src/test.js', 'src/mytest.js', 'src/deep/test.js', 'src/deep/latest.js', 'lib/x.md']) {
      fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
      fs.writeFileSync(path.join(root, f), 'needle\n');
    }
    const paths = async (glob) => (await ws.search('needle', { glob })).matches.map(m => m.path.split(path.sep).join('/')).sort();
    expect(await paths('**/a.js')).toEqual(['a.js', 'src/a.js']);
    expect(await paths('src/**/test.js')).toEqual(['src/deep/test.js', 'src/test.js']);
    expect(await paths('{src/**/test.js,lib/*}')).toEqual(['lib/x.md', 'src/deep/test.js', 'src/test.js']);
    // A glob with no slash is also tried against the bare file name.
    expect(await paths('[ab].js')).toEqual(['a.js', 'b.js', 'src/a.js']);
    expect(await paths('src/[!a]*.js')).toEqual(['src/mytest.js', 'src/test.js']);
  });

  it('turns globs into anchored patterns', () => {
    expect(_globToRegExp('*.js').test('a.js')).toBe(true);
    expect(_globToRegExp('*.js').test('src/a.js')).toBe(false);
    expect(_globToRegExp('src/**/*.js').test('src/x/y/a.js')).toBe(true);
    expect(_globToRegExp('src/**/*.js').test('src/x/a.js')).toBe(true);
    expect(_globToRegExp('src/**/*.js').test('src/a.js')).toBe(true);
    expect(_globToRegExp('src/**/*.js').test('srcx/a.js')).toBe(false);
    expect(_globToRegExp('**/*.md').test('README.md')).toBe(true);
    expect(_globToRegExp('src/**').test('src/x/a.js')).toBe(true);
    expect(_globToRegExp('*.{js,ts}').test('a.ts')).toBe(true);
    expect(_globToRegExp('{*.js,*.ts}').test('a.ts')).toBe(true);
  });

  it('turns ** inside braces and character classes into patterns', () => {
    const g = _globToRegExp('{src/**/test.js,lib/*}');
    for (const ok of ['src/test.js', 'src/a/b/test.js', 'lib/x']) expect(g.test(ok), ok).toBe(true);
    for (const no of ['lib/x/y', 'src/mytest.js', 'test.js']) expect(g.test(no), no).toBe(false);
    expect(_globToRegExp('[ab].js').test('a.js')).toBe(true);
    expect(_globToRegExp('[ab].js').test('c.js')).toBe(false);
    expect(_globToRegExp('[!a].js').test('b.js')).toBe(true);
    expect(_globToRegExp('[!a].js').test('a.js')).toBe(false);
    expect(_globToRegExp('[a-c]x').test('bx')).toBe(true);
    expect(_globToRegExp('[a-c]x').test('dx')).toBe(false);
    expect(_globToRegExp('a[!b]c').test('a/c')).toBe(false);
    expect(_globToRegExp('a[/]c').test('a/c')).toBe(false);
    expect(_globToRegExp('[]x].md').test('].md')).toBe(true);
    expect(_globToRegExp('{a,{b,c}}.md').test('c.md')).toBe(true);
    expect(_globToRegExp('{a,[bc]}.md').test('b.md')).toBe(true);
    expect(_globToRegExp('x[.md').test('x[.md')).toBe(true);
    expect(_globToRegExp('{a,b.md').test('{a,b.md')).toBe(true);
  });

  it('lets a class take a } before a brace does, and leaves a brace nothing closes literal, commas included', () => {
    // The class [b}] swallows the }, so the { before it closes nothing.
    expect(_globToRegExp('{a,[b}]').test('{a,b')).toBe(true);
    expect(_globToRegExp('{a,[b}]').test('a')).toBe(false);
    const g = _globToRegExp('{{x,{a,b},y}');
    for (const ok of ['{x', '{a', '{b', '{y']) expect(g.test(ok), ok).toBe(true);
    for (const no of ['x', 'a', '{{x']) expect(g.test(no), no).toBe(false);
    expect(_globToRegExp('{a,{b,c}').test('{a,c')).toBe(true);
    expect(_globToRegExp('{a,{b,c}').test('a')).toBe(false);
  });

  it('refuses a glob over the length limit at once, and reads one at the limit in linear time', async () => {
    const t0 = performance.now();
    const err = await ws.search('x', { glob: '{['.repeat(2500) }).then(() => null, (e) => e);
    expect(err && err.code).toBe('EINVAL');
    expect(err.message).toMatch(new RegExp('limit is ' + limits.MAX_GLOB_CHARS));
    expect(performance.now() - t0).toBeLessThan(50);
    const n = limits.MAX_GLOB_CHARS;
    for (const g of ['{['.repeat(n / 2), '[{'.repeat(n / 2), '{'.repeat(n), '{,'.repeat(n / 2), '['.repeat(n), '{'.repeat(n / 2) + '}'.repeat(n / 2), '{[!]'.repeat(n / 4)]) {
      expect(g.length).toBe(n);
      const t = performance.now();
      _globToRegExp(g);
      expect(performance.now() - t, g.slice(0, 8)).toBeLessThan(50);
    }
    expect(codeOf(() => _globToRegExp('a'.repeat(n + 1)))).toBe('EINVAL');
  });
});

describe('the login shell PATH', () => {
  it('reads the PATH between its markers, whatever the profile prints', () => {
    expect(_parseLoginPath('Welcome!\n__NICE_PATH_START__/opt/homebrew/bin:/usr/bin__NICE_PATH_END__bye\n')).toBe('/opt/homebrew/bin:/usr/bin');
    expect(_parseLoginPath('/usr/bin:/bin')).toBe('');
    expect(_parseLoginPath('__NICE_PATH_START__/usr/bin')).toBe('');
  });

  it.skipIf(process.platform === 'win32')('asks an interactive login shell once and gives commands its PATH', async () => {
    const bin = path.join(tmp, 'shellbin');
    fs.mkdirSync(bin);
    const fake = path.join(bin, 'zsh');
    fs.writeFileSync(fake, [
      '#!/bin/sh',
      'case "$*" in',
      '  *__NICE_PATH_START__*) printf "%s\\n" "$@" > "$(dirname "$0")/args"; echo "motd noise"; printf "__NICE_PATH_START__%s__NICE_PATH_END__" "/fake/bin:/usr/bin:/bin"; echo trailing ;;',
      '  *) exec /bin/sh "$@" ;;',
      'esac',
      '',
    ].join('\n'));
    fs.chmodSync(fake, 0o755);
    const saved = process.env.SHELL;
    try {
      process.env.SHELL = fake;
      _resetCommandPath();
      const r = await ws.run('printf %s "$PATH"');
      expect(r.stdout).toBe('/fake/bin:/usr/bin:/bin');
      const args = fs.readFileSync(path.join(bin, 'args'), 'utf8').split('\n');
      expect(args.slice(0, 3)).toEqual(['-l', '-i', '-c']);
    } finally {
      process.env.SHELL = saved;
      _resetCommandPath();
    }
  }, 15000);

  // A fake zsh: `lookup` (sh lines, with $d its folder) answers the PATH lookup; anything else runs in sh.
  const fakeShell = (lookup) => {
    const bin = path.join(tmp, 'shellbin');
    fs.mkdirSync(bin, { recursive: true });
    const fake = path.join(bin, 'zsh');
    fs.writeFileSync(fake, ['#!/bin/sh', 'd="$(dirname "$0")"', 'case "$*" in', '  *__NICE_PATH_START__*)', ...lookup, '    ;;', '  *) exec /bin/sh "$@" ;;', 'esac', ''].join('\n'));
    fs.chmodSync(fake, 0o755);
    return { bin, fake };
  };
  const withShell = async (fake, fn) => {
    const saved = process.env.SHELL;
    try {
      process.env.SHELL = fake;
      _resetCommandPath();
      await fn();
    } finally {
      process.env.SHELL = saved;
      _resetCommandPath();
    }
  };
  const pathNow = async () => (await ws.run('printf %s "$PATH"')).stdout;
  const PRINT = (p) => `    printf "__NICE_PATH_START__%s__NICE_PATH_END__" "${p}"`;

  it.skipIf(process.platform === 'win32')('asks again as a plain login shell when the interactive one prints no PATH', async () => {
    const { bin, fake } = fakeShell([
      '    echo "$1 $2" >> "$d/calls"',
      '    [ "$2" = -i ] && exit 0',
      PRINT('/login/bin:/usr/bin:/bin'),
    ]);
    await withShell(fake, async () => {
      expect(await pathNow()).toBe('/login/bin:/usr/bin:/bin');
      expect(fs.readFileSync(path.join(bin, 'calls'), 'utf8').trim().split('\n')).toEqual(['-l -i', '-l -c']);
    });
  }, 15000);

  it.skipIf(process.platform === 'win32')('keeps only a lookup that worked, and tries a failed one again a minute later', async () => {
    const { bin, fake } = fakeShell([
      '    echo x >> "$d/calls"',
      '    [ -f "$d/ok" ] || exit 1',
      PRINT('/ok/bin:/usr/bin:/bin'),
    ]);
    const calls = () => fs.readFileSync(path.join(bin, 'calls'), 'utf8').trim().split('\n').length;
    await withShell(fake, async () => {
      expect(await pathNow()).toBe(process.env.PATH);
      expect(calls()).toBe(2);
      expect(await pathNow()).toBe(process.env.PATH);
      expect(calls()).toBe(2);
      fs.writeFileSync(path.join(bin, 'ok'), '');
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + limits.PATH_RETRY_MS[0] + 1000);
      expect(await pathNow()).toBe('/ok/bin:/usr/bin:/bin');
      expect(calls()).toBe(3);
      expect(await pathNow()).toBe('/ok/bin:/usr/bin:/bin');
      expect(calls()).toBe(3);
    });
  }, 20000);

  it.skipIf(process.platform === 'win32')('backs off a lookup that keeps failing: a minute, then 5, then every 30', async () => {
    const { bin, fake } = fakeShell(['    echo x >> "$d/calls"', '    exit 1']);
    // Each failed lookup asks twice: as an interactive login shell, then as a plain one.
    const lookups = () => fs.readFileSync(path.join(bin, 'calls'), 'utf8').trim().split('\n').length / 2;
    const MIN = 60000;
    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    await withShell(fake, async () => {
      const after = async (ms) => { now += ms; await pathNow(); return lookups(); };
      expect(await after(0)).toBe(1);
      expect(await after(MIN)).toBe(2);
      expect(await after(MIN)).toBe(2);
      expect(await after(4 * MIN)).toBe(3);
      expect(await after(29 * MIN)).toBe(3);
      expect(await after(MIN)).toBe(4);
      expect(await after(29 * MIN)).toBe(4);
      expect(await after(MIN)).toBe(5);
    });
    expect(limits.PATH_RETRY_MS).toEqual([MIN, 5 * MIN, 30 * MIN]);
  }, 30000);

  it.skipIf(process.platform === 'win32')('sends what the lookup shell leaves behind SIGTERM, and SIGKILL only after the grace period', async () => {
    const { bin, fake } = fakeShell([
      `    ( trap 'echo done > "$d/termed"; exit 0' TERM; : > "$d/trapped"; while :; do sleep 0.1; done ) >/dev/null 2>&1 &`,
      `    sh -c 'trap "" TERM; echo $$ > "$1/stubborn"; exec sleep 30' sh "$d" >/dev/null 2>&1 &`,
      '    while [ ! -s "$d/stubborn" ] || [ ! -f "$d/trapped" ]; do sleep 0.05; done',
      PRINT('/fake/bin:/usr/bin:/bin'),
    ]);
    await withShell(fake, async () => {
      expect(await pathNow()).toBe('/fake/bin:/usr/bin:/bin');
      await sleep(1000);
      expect(fs.existsSync(path.join(bin, 'termed'))).toBe(true);
      const pid = Number(fs.readFileSync(path.join(bin, 'stubborn'), 'utf8'));
      expect(alive(pid)).toBe(true);
      expect(await goneWithin(pid, limits.KILL_GRACE_MS + 1500)).toBe(true);
    });
  }, 15000);
});

describe('run tags', () => {
  it('takes strings and finite numbers, back as strings of at most 200 code points', () => {
    expect(runTag(null)).toBe(null);
    expect(runTag(undefined)).toBe(null);
    expect(runTag('term-1')).toBe('term-1');
    expect(runTag(123)).toBe('123');
    const t = runTag('a'.repeat(199) + '\u{1F600}' + 'b'.repeat(10));
    expect([...t]).toHaveLength(limits.MAX_TAG_CHARS);
    expect(t.endsWith('\u{1F600}')).toBe(true);
    expect(wellFormed(t)).toBe(true);
  });

  it('refuses anything else with EINVAL', () => {
    for (const bad of [{}, [], true, NaN, Infinity, () => 1, Symbol('x')]) expect(codeOf(() => runTag(bad)), String(typeof bad)).toBe('EINVAL');
  });
});

describe.skipIf(process.platform === 'win32')('commands', () => {
  // The first run asks the login shell for its PATH; do that once, outside any test's time limit.
  beforeAll(async () => {
    const warm = await Workspace.open(os.tmpdir());
    await warm.run('true');
  }, 20000);

  it('runs in the workspace and reports output and exit code', async () => {
    const r = await ws.run('pwd; echo oops >&2; exit 3');
    expect(r.stdout.trim()).toBe(root);
    expect(r.stderr.trim()).toBe('oops');
    expect(r.exitCode).toBe(3);
    expect(r.timedOut).toBe(false);
  });

  it('streams output as it arrives', async () => {
    const seen = [];
    await ws.run('echo one; echo two', { onData: (d) => seen.push(d.stream) });
    expect(seen[0]).toBe('start');
    expect(seen).toContain('stdout');
  });

  it('does not spawn a run whose shouldStart says no', async () => {
    const marker = path.join(root, 'ran.txt');
    expect(await code(ws.run('touch ran.txt', { shouldStart: () => false }))).toBe('ESTOPPED');
    expect(fs.existsSync(marker)).toBe(false);
    await ws.run('touch ran.txt', { shouldStart: () => true });
    expect(fs.existsSync(marker)).toBe(true);
  });

  it('closes stdin, so a command waiting for input ends at once', async () => {
    const t0 = Date.now();
    const r = await ws.run('cat');
    expect(r.exitCode).toBe(0);
    expect(Date.now() - t0).toBeLessThan(1500);
  });

  it('kills a command that ignores SIGTERM after the grace period', async () => {
    const t0 = Date.now();
    const r = await ws.run("trap '' TERM; sleep 8", { timeoutMs: 1000 });
    expect(r.timedOut).toBe(true);
    expect(Date.now() - t0).toBeLessThan(1000 + limits.KILL_GRACE_MS + 2000);
  }, 15000);

  it('does not wait on a background process that keeps the output open', async () => {
    const t0 = Date.now();
    const r = await ws.run('(sleep 6 &) ; echo started');
    expect(r.stdout).toContain('started');
    expect(Date.now() - t0).toBeLessThan(3000);
  }, 10000);

  it('stops what a command leaves in the background when it ends, and says so', async () => {
    const r = await ws.run('sleep 30 & echo $!');
    const pid = Number(r.stdout.trim());
    expect(pid).toBeGreaterThan(1);
    expect(r.stoppedBackground).toBe(true);
    expect(await goneWithin(pid, 1500)).toBe(true);
    const plain = await ws.run('echo hi');
    expect(plain.stoppedBackground).toBe(false);
  }, 10000);

  it('kills a background process that ignores SIGTERM after the command exits', async () => {
    // The trap is set inside the job: zsh does not pass an ignored TERM on to `&` jobs.
    const r = await ws.run(`sh -c 'trap "" TERM; exec sleep 30' & echo $!`);
    const pid = Number(r.stdout.trim());
    expect(r.stoppedBackground).toBe(true);
    await sleep(1000);
    expect(alive(pid)).toBe(true);
    expect(await goneWithin(pid, limits.KILL_GRACE_MS + 1500)).toBe(true);
  }, 10000);

  it('SIGKILLs the whole group after a kill even when the shell has already exited', async () => {
    let id;
    let out = '';
    const p = ws.run("(trap '' TERM; sleep 30) & echo $$; sleep 30", { onData: (d) => { id = d.id; if (d.stream === 'stdout') out += d.data; } });
    while (!out.trim()) await sleep(20);
    const pgid = Number(out.trim());
    const t0 = Date.now();
    expect(ws.kill(id)).toBe(true);
    const r = await p;
    expect(r.killed).toBe(true);
    expect(await goneWithin(-pgid, limits.KILL_GRACE_MS + 1500)).toBe(true);
    expect(Date.now() - t0).toBeGreaterThan(limits.KILL_GRACE_MS - 500);
  }, 10000);

  it('kills every group at once with killAll({ hard: true })', async () => {
    let out = '';
    const p = ws.run("trap '' TERM; echo $$; sleep 30", { onData: (d) => { if (d.stream === 'stdout') out += d.data; } });
    while (!out.trim()) await sleep(20);
    const pgid = Number(out.trim());
    ws.killAll({ hard: true });
    expect(await goneWithin(-pgid, 500)).toBe(true);
    expect((await p).killed).toBe(true);
    await sleep(CLOSE_GRACE + 100);
    expect(ws.busy).toBe(false);
  }, 10000);

  it('does not start a command that was on its way when killAll ran', async () => {
    const p = ws.run('echo started > started.txt');
    ws.killAll();
    expect(await code(p)).toBe('ESTOPPED');
    await sleep(200);
    expect(fs.existsSync(path.join(root, 'started.txt'))).toBe(false);
    expect((await ws.run('echo ok')).stdout).toBe('ok\n');
  });

  it('takes null, NaN, Infinity, negative and huge timeouts as the default or the cap, not 1 s', async () => {
    const odd = [null, NaN, Infinity, -5, 'x', 1e12];
    const rs = await Promise.all(odd.map(t => ws.run('sleep 1.3; echo done', { timeoutMs: t })));
    for (const r of rs) {
      expect(r.timedOut).toBe(false);
      expect(r.stdout).toBe('done\n');
    }
  }, 10000);

  it('takes a numeric string timeout, and 0 as the minimum', async () => {
    for (const timeoutMs of ['1000', 0]) {
      const t0 = Date.now();
      const r = await ws.run('sleep 5', { timeoutMs });
      expect(r.timedOut, String(timeoutMs)).toBe(true);
      expect(Date.now() - t0).toBeLessThan(limits.MIN_TIMEOUT_MS + limits.KILL_GRACE_MS + 1000);
    }
  }, 15000);

  it('answers with an error when spawn throws, instead of throwing', async () => {
    vi.spyOn(cp, 'spawn').mockImplementationOnce(() => { throw Object.assign(new Error('spawn EMFILE'), { code: 'EMFILE' }); });
    const r = await ws.run('echo hi');
    expect(r).toMatchObject({ error: 'spawn EMFILE', exitCode: null, stdout: '' });
    expect(ws.busy).toBe(false);
  });

  it('answers with an error when spawn fails with no pipes', async () => {
    vi.spyOn(cp, 'spawn').mockImplementationOnce(() => {
      const child = new EventEmitter();
      child.stdout = null;
      child.stderr = null;
      process.nextTick(() => child.emit('error', Object.assign(new Error('spawn ENFILE'), { code: 'ENFILE' })));
      return child;
    });
    const r = await ws.run('echo hi');
    expect(r.error).toBe('spawn ENFILE');
    expect(ws.busy).toBe(false);
  });

  it('decodes multi-byte characters split across chunks', async () => {
    const r = await ws.run(`node -e "process.stdout.write('\\u2713'.repeat(25000))"`);
    expect(r.stdout).not.toContain('\uFFFD');
  });

  it('runs without the app\'s Node switches', async () => {
    process.env.NODE_OPTIONS = '--max-old-space-size=64';
    try {
      const r = await ws.run('printf %s "${NODE_OPTIONS:-none}"');
      expect(r.stdout).toBe('none');
    } finally { delete process.env.NODE_OPTIONS; }
  });

  it('gives every run a new id, across workspaces', async () => {
    const other = await Workspace.open(outside);
    const a = await ws.run('true');
    const b = await other.run('true');
    expect(b.id).not.toBe(a.id);
  });

  it('stops a command at its timeout, with its children', async () => {
    const r = await ws.run('sleep 5 & sleep 5; echo never', { timeoutMs: 1000 });
    expect(r.timedOut).toBe(true);
    expect(r.stdout).toBe('');
  }, 10000);

  it('can be killed by id', async () => {
    let id;
    const p = ws.run('sleep 5', { onData: (d) => { id = d.id; } });
    await new Promise(r => setTimeout(r, 100));
    expect(ws.kill(id)).toBe(true);
    const r = await p;
    expect(r.killed).toBe(true);
    expect(ws.kill(id)).toBe(false);
  }, 10000);

  it('caps long output and stops streaming it past the cap', async () => {
    let streamed = 0;
    let marked = false;
    const r = await ws.run(`node -e "process.stdout.write('x'.repeat(${limits.MAX_OUTPUT_CHARS * 3}))"`, {
      onData: (d) => { if (d.stream === 'stdout') { streamed += d.data.length; if (d.truncated) marked = true; } },
    });
    expect(r.stdout.replace(/\n… \[\d+ characters cut\] …\n/, '').length).toBe(limits.MAX_OUTPUT_CHARS);
    expect(r.stdout).toContain(`[${limits.MAX_OUTPUT_CHARS * 2} characters cut]`);
    expect(r.stdoutTruncated).toBe(true);
    expect(streamed).toBe(limits.MAX_OUTPUT_CHARS);
    expect(marked).toBe(true);
  });

  it('keeps the start and the end of long output', async () => {
    const n = limits.MAX_OUTPUT_CHARS;
    const r = await ws.run(`node -e "process.stdout.write('A'.repeat(${n}) + 'B'.repeat(${n}))"`);
    const half = n / 2;
    expect(r.stdout.startsWith('A'.repeat(half) + '\n… [')).toBe(true);
    expect(r.stdout.endsWith('] …\n' + 'B'.repeat(half))).toBe(true);
    expect(r.stdout).toContain(`[${n} characters cut]`);
    const short = await ws.run(`node -e "process.stdout.write('A'.repeat(${n - 10}))"`);
    expect(short.stdout).toBe('A'.repeat(n - 10));
    expect(short.stdoutTruncated).toBe(false);
  });

  it('never cuts a surrogate pair in two', async () => {
    let streamed = '';
    const r = await ws.run(`node -e "process.stdout.write('x' + '\\u{1F600}'.repeat(${limits.MAX_OUTPUT_CHARS}) + 'y')"`, {
      onData: (d) => { if (d.stream === 'stdout') streamed += d.data; },
    });
    expect(r.stdoutTruncated).toBe(true);
    expect(wellFormed(r.stdout)).toBe(true);
    expect(wellFormed(streamed)).toBe(true);
    expect(r.stdout.endsWith('\u{1F600}y')).toBe(true);
  });

  it('refuses a working folder outside the workspace', async () => {
    expect(await code(ws.run('pwd', { cwd: '..' }))).toBe('EOUTSIDE');
  });
});
