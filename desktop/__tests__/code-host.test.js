// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { Workspace, _globToRegExp, limits } = require('../code-host.js');

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
  ws.killAll();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const code = async (p) => { try { await p; return null; } catch (e) { return e.code; } };

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

  it('flags the disk root and the home folder as too broad', () => {
    expect(Workspace.isBroad(os.homedir())).toBe(true);
    expect(Workspace.isBroad(path.parse(root).root)).toBe(true);
    expect(Workspace.isBroad(root)).toBe(false);
  });

  it('accepts absolute paths inside and a NUL byte never', async () => {
    expect((await ws.readFile(path.join(root, 'README.md'))).content).toBe('# Hello\n');
    expect(await code(ws.readFile('README.md\0.txt'))).toBe('EINVAL');
  });
});

describe('files', () => {
  it('reads a slice of lines, counting a trailing newline as no extra line', async () => {
    const r = await ws.readFile('src/a.js', { offset: 1, limit: 1 });
    expect(r).toMatchObject({ path: path.join('src', 'a.js'), content: 'const b = 2;', startLine: 2, endLine: 2, totalLines: 3 });
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
    expect(capped.truncated).toBe(true);
  });

  it('refuses a bad pattern or glob with EINVAL', async () => {
    expect(await code(ws.search('('))).toBe('EINVAL');
  });

  it('stops a pattern that backtracks badly instead of freezing', async () => {
    fs.writeFileSync(path.join(root, 'evil.txt'), 'a'.repeat(40) + '!');
    const t0 = Date.now();
    expect(await code(ws.search('^(a+)+$', { timeoutMs: 500 }))).toBe('ETIMEOUT');
    expect(Date.now() - t0).toBeLessThan(3000);
  }, 10000);

  it('turns globs into anchored patterns', () => {
    expect(_globToRegExp('*.js').test('a.js')).toBe(true);
    expect(_globToRegExp('*.js').test('src/a.js')).toBe(false);
    expect(_globToRegExp('src/**/*.js').test('src/x/y/a.js')).toBe(true);
    expect(_globToRegExp('*.{js,ts}').test('a.ts')).toBe(true);
    expect(_globToRegExp('{*.js,*.ts}').test('a.ts')).toBe(true);
  });
});

describe.skipIf(process.platform === 'win32')('commands', () => {
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
    expect(r.stdout.length).toBe(limits.MAX_OUTPUT_CHARS);
    expect(r.stdoutTruncated).toBe(true);
    expect(streamed).toBe(limits.MAX_OUTPUT_CHARS);
    expect(marked).toBe(true);
  });

  it('refuses a working folder outside the workspace', async () => {
    expect(await code(ws.run('pwd', { cwd: '..' }))).toBe('EOUTSIDE');
  });
});
