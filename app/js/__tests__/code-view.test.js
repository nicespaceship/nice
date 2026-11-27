import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { installViewMocks, loadModule, mountView } from './helpers/view-harness.js';

const mocks = installViewMocks();
loadModule('views/code.js');

const tick = () => new Promise(r => setTimeout(r, 0));
const flush = async () => { for (let i = 0; i < 5; i++) await tick(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/* A fake window.NiceDesktop.code over an in-memory folder, shaped like
   desktop/preload.js: values resolve, failures reject with { code, message }.
   `links` are paths listed as symlinks, `truncated` the folders whose
   listing says more entries were left out. */
function fakeHost(files = {}, { ws: folder, links = [], truncated = [] } = {}) {
  let ws = null;
  const listeners = new Set();
  const fail = (code, message) => Promise.reject({ code, message });
  const host = {
    openFolder: vi.fn(async () => (ws = folder || { root: '/Users/me/project', name: 'project' })),
    workspace: vi.fn(async () => ws),
    list: vi.fn(async (dir) => {
      if (dir in files) return fail('ENOTDIR', 'Not a folder: ' + dir);
      const prefix = dir === '.' ? '' : dir + '/';
      const names = new Map();
      for (const p of Object.keys(files)) {
        if (!p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length).split('/');
        names.set(rest[0], links.includes(prefix + rest[0]) ? 'link' : rest.length > 1 ? 'dir' : 'file');
      }
      const entries = [...names].map(([name, type]) => ({ name, type })).sort((a, b) => (a.type === 'dir' ? -1 : 1) - (b.type === 'dir' ? -1 : 1) || a.name.localeCompare(b.name));
      return { path: dir, entries, truncated: truncated.includes(dir) };
    }),
    read: vi.fn(async (p) => {
      if (!(p in files)) return fail('ENOENT', 'No such file');
      if (files[p] === null) return fail('EBINARY', 'Binary file: ' + p);
      const lines = files[p].split('\n');
      return { path: p, content: files[p], totalLines: lines.length, startLine: 1, endLine: lines.length };
    }),
    run: vi.fn(async (command, opts) => {
      const id = 7;
      host.emit({ id, tag: opts.tag, stream: 'start', data: '' });
      host.emit({ id, tag: opts.tag, stream: 'stdout', data: 'out of ' + command + '\n' });
      host.emit({ id, tag: 'someone-else', stream: 'stdout', data: 'NOT MINE\n' });
      return { id, exitCode: command === 'false' ? 1 : 0, stdout: '', stderr: '', timedOut: false, killed: false };
    }),
    kill: vi.fn(async () => true),
    cancel: vi.fn(async () => true),
    onRunData: vi.fn((fn) => { listeners.add(fn); return () => listeners.delete(fn); }),
    emit: (d) => listeners.forEach(fn => fn(d)),
  };
  return host;
}

async function openWorkspace(files, opts, mountOpts) {
  const host = fakeHost(files, opts);
  window.NiceDesktop = { code: host };
  await host.openFolder();
  const { el } = await mountView(CodeView, mountOpts);
  await flush();
  return { host, el };
}

const submitPrompt = (el, text) => {
  if (text !== undefined) el.querySelector('#code-input').value = text;
  el.querySelector('#code-prompt').dispatchEvent(new Event('submit', { cancelable: true }));
};
const runCommand = (el, cmd) => {
  el.querySelector('#code-term-input').value = cmd;
  el.querySelector('#code-term-form').dispatchEvent(new Event('submit', { cancelable: true }));
};
const rowFor = (el, path) => [...el.querySelectorAll('.code-tree-row')].find(r => CodeView._test.pathOf(r) === path);
const termOut = (el) => el.querySelector('#code-term-out').textContent;
const termKey = (el, key, init = {}) => el.querySelector('#code-term-input').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
const sendLabel = (el) => el.querySelector('#code-send').getAttribute('aria-label');

/* A model whose reply comes back when the test says so. */
function slowModel() {
  const reply = deferred();
  const send = vi.fn(() => reply.promise);
  globalThis.AgentExecutor = { converse: vi.fn(() => ({ send })) };
  return { reply, send, opts: () => AgentExecutor.converse.mock.calls[0][1] };
}

beforeEach(() => {
  CodeView._test.reset();
  OwnKeys._test.reset();
  delete window.NiceDesktop;
});
afterEach(() => { delete window.NiceDesktop; delete globalThis.AgentExecutor; delete globalThis.LLM_MODELS; });

describe('CodeView on the website', () => {
  it('says Code runs in the desktop app and asks before it changes anything', async () => {
    const { el } = await mountView(CodeView);
    expect(el.querySelector('.code-empty-title').textContent).toBe('Code runs in the NICE desktop app');
    const text = el.querySelector('.code-empty-text').textContent;
    expect(text).toContain('asking you first');
    expect(text).not.toContain('—');
    expect(el.querySelector('.code-view')).toBeNull();
  });
});

describe('CodeView in the desktop app', () => {
  it('asks for a folder, then shows the conversation and the panel', async () => {
    const host = fakeHost({ 'README.md': '# Hi' });
    window.NiceDesktop = { code: host };
    const { el } = await mountView(CodeView);
    expect(el.querySelector('.code-empty-title').textContent).toBe('Open a folder');
    expect(el.querySelector('.code-empty-text').textContent).toContain('asks before it edits');
    el.querySelector('#code-open-folder').click();
    await flush();
    expect(host.openFolder).toHaveBeenCalled();
    expect(el.querySelector('.code-folder span').textContent).toBe('project');
    expect(el.querySelector('#code-input').getAttribute('placeholder')).toContain('project');
    expect(el.querySelector('.code-panel')).not.toBeNull();
  });

  it('opens a recent folder by id, starts a fresh conversation and tells the sidebar', async () => {
    const { host, el } = await openWorkspace({ 'README.md': '# Hi' });
    host.openRecent = vi.fn(async () => ({ root: '/Users/me/other', name: 'other' }));
    const heard = vi.fn();
    document.addEventListener(CodeView.FOLDER_EVENT, heard);
    try {
      const ws = await CodeView.openRecent('rid-1');
      await flush();
      expect(host.openRecent).toHaveBeenCalledWith('rid-1');
      expect(ws.name).toBe('other');
      expect(el.querySelector('.code-folder span').textContent).toBe('other');
      expect(heard).toHaveBeenCalledTimes(1);
      host.openRecent = vi.fn(async () => Promise.reject({ code: 'ENOENT', message: 'other is not there any more.' }));
      expect(await CodeView.openRecent('rid-1')).toBeNull();
      expect(el.querySelector('.code-folder span').textContent).toBe('other');
      expect(heard).toHaveBeenCalledTimes(2);
    } finally {
      document.removeEventListener(CodeView.FOLDER_EVENT, heard);
    }
  });

  it('browses the folder and opens a file', async () => {
    const { el } = await openWorkspace({ 'src/a.js': 'const a = 1;', 'README.md': '# Hi', 'img.png': null });
    const rows = () => [...el.querySelectorAll('.code-tree-row')].map(r => r.textContent.trim());
    expect(rows()).toEqual(['src', 'img.png', 'README.md']);
    rowFor(el, 'src').click();
    await flush();
    expect(rows()).toEqual(['src', 'a.js', 'img.png', 'README.md']);
    rowFor(el, 'src/a.js').click();
    await flush();
    expect(el.querySelector('.code-file-path').textContent).toBe('src/a.js');
    expect(el.querySelector('.code-file-body').textContent).toBe('const a = 1;');
    el.querySelector('#code-file-back').click();
    await flush();
    rowFor(el, 'img.png').click();
    await flush();
    expect(el.querySelector('.code-tree-err').textContent).toBe('This is a binary file.');
  });

  it('shows file contents as text, never markup', async () => {
    const { el } = await openWorkspace({ 'x.html': '<img src=x onerror=alert(1)>' });
    rowFor(el, 'x.html').click();
    await flush();
    expect(el.querySelector('.code-file-body img')).toBeNull();
    expect(el.querySelector('.code-file-body').textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('keeps quotes and angle brackets in host names out of the markup', async () => {
    const evilFile = 'x" onmouseover="alert(1)" data-x="<b>.js';
    const evilDir = "d\"ir' onfocus='alert(2)";
    const ws = { root: '/Users/me/my "proj" <x>', name: 'my "proj" <x>' };
    globalThis.LLM_MODELS = [{ id: 'm"1', label: 'M <1>' }];
    const { el } = await openWorkspace(
      { [evilFile]: 'a', [evilDir + '/inner.txt']: 'b' },
      { ws },
      { state: { enabled_models: { 'm"1': true } } },
    );
    const fileRow = rowFor(el, evilFile);
    const dirRow = rowFor(el, evilDir);
    expect(fileRow.getAttributeNames().sort()).toEqual(['class', 'data-row', 'data-type', 'style', 'type']);
    expect(dirRow.getAttributeNames().sort()).toEqual(['aria-expanded', 'class', 'data-row', 'data-type', 'style', 'type']);
    expect(fileRow.dataset.type).toBe('file');
    expect(fileRow.querySelector('.code-tree-name').textContent).toBe(evilFile);
    expect(el.querySelector('[onmouseover], [onfocus], [data-x], b')).toBeNull();

    const folderBtn = el.querySelector('#code-change-folder');
    expect(folderBtn.getAttribute('title')).toBe(ws.root);
    expect(folderBtn.textContent.trim()).toBe(ws.name);
    expect(el.querySelector('#code-input').getAttribute('placeholder')).toBe('Ask Code to do something in ' + ws.name);
    const option = el.querySelector('#code-model option');
    expect(option.value).toBe('m"1');
    expect(option.textContent).toBe('M <1>');

    dirRow.click();
    await flush();
    expect(rowFor(el, evilDir + '/inner.txt')).toBeTruthy();
    expect(el.querySelector('[onmouseover], [onfocus], [data-x], b')).toBeNull();

    el.querySelector('#code-tab-terminal').click();
    expect(el.querySelector('#code-term-input').getAttribute('placeholder')).toBe('Run a command in ' + ws.name);
  });

  it('lists symlinks with their own icon, as a folder when they list and as a file when not', async () => {
    const { host, el } = await openWorkspace(
      { 'lib/x.js': '1', 'notes.txt': 'hello', 'a.txt': '' },
      { links: ['lib', 'notes.txt'] },
    );
    const lib = rowFor(el, 'lib');
    expect(lib.dataset.type).toBe('link');
    expect(lib.querySelector('use').getAttribute('href')).toBe('#icon-external');
    expect(lib.hasAttribute('aria-expanded')).toBe(false);

    lib.click();
    await flush();
    expect(host.list).toHaveBeenCalledWith('lib');
    expect(rowFor(el, 'lib').getAttribute('aria-expanded')).toBe('true');
    expect(rowFor(el, 'lib/x.js')).toBeTruthy();
    rowFor(el, 'lib').click();
    await flush();
    expect(rowFor(el, 'lib').getAttribute('aria-expanded')).toBe('false');
    expect(rowFor(el, 'lib/x.js')).toBeUndefined();

    rowFor(el, 'notes.txt').click();
    await flush();
    expect(host.list).toHaveBeenCalledWith('notes.txt');
    expect(host.read).toHaveBeenCalledWith('notes.txt', expect.anything());
    expect(el.querySelector('.code-file-body').textContent).toBe('hello');
  });

  it('keeps an open linked folder open after Refresh, and closes it once the link stops listing', async () => {
    const { host, el } = await openWorkspace({ 'lib/x.js': '1', 'a.txt': '' }, { links: ['lib'] });
    rowFor(el, 'lib').click();
    await flush();
    expect(rowFor(el, 'lib/x.js')).toBeTruthy();

    el.querySelector('#code-refresh-files').click();
    await flush();
    expect(rowFor(el, 'lib').getAttribute('aria-expanded')).toBe('true');
    expect(rowFor(el, 'lib/x.js')).toBeTruthy();
    expect(host.list.mock.calls.filter(c => c[0] === 'lib')).toHaveLength(2);

    host.list.mockImplementation(async (dir) => {
      if (dir === 'lib') throw { code: 'ENOTDIR', message: 'Not a folder: lib' };
      return { path: dir, entries: [{ name: 'lib', type: 'link' }, { name: 'a.txt', type: 'file' }], truncated: false };
    });
    el.querySelector('#code-refresh-files').click();
    await flush();
    expect(rowFor(el, 'lib').hasAttribute('aria-expanded')).toBe(false);
    expect(rowFor(el, 'lib/x.js')).toBeUndefined();
    expect(el.querySelector('.code-tree-err')).toBeNull();
  });

  it('opens the file a row names even when the name has a carriage return', async () => {
    // HTML parsing turns \r into \n, so a path read back from an attribute
    // would name the decoy (macOS writes "Icon\r" into folders).
    const { host, el } = await openWorkspace({
      'a\rb.txt': 'REAL CR FILE',
      'a\nb.txt': 'DECOY LF FILE',
      'Icon\r': '',
      'd\rx/inner.txt': 'inside',
    });
    rowFor(el, 'a\rb.txt').click();
    await flush();
    expect(host.read).toHaveBeenLastCalledWith('a\rb.txt', expect.anything());
    expect(el.querySelector('.code-file-body').textContent).toBe('REAL CR FILE');
    el.querySelector('#code-file-back').click();
    await flush();

    rowFor(el, 'Icon\r').click();
    await flush();
    expect(host.read).toHaveBeenLastCalledWith('Icon\r', expect.anything());
    expect(el.querySelector('.code-tree-err')).toBeNull();
    el.querySelector('#code-file-back').click();
    await flush();

    rowFor(el, 'd\rx').click();
    await flush();
    expect(rowFor(el, 'd\rx').getAttribute('aria-expanded')).toBe('true');
    rowFor(el, 'd\rx/inner.txt').click();
    await flush();
    expect(el.querySelector('.code-file-body').textContent).toBe('inside');
  });

  it('says when a folder listing was cut short', async () => {
    const { el } = await openWorkspace({ 'a.txt': '', 'b.txt': '', 'src/c.js': '' }, { truncated: ['.'] });
    const more = el.querySelectorAll('.code-tree-more');
    expect(more).toHaveLength(1);
    expect(more[0].textContent).toBe('Only the first 3 items are shown.');
    rowFor(el, 'src').click();
    await flush();
    expect(el.querySelectorAll('.code-tree-more')).toHaveLength(1);
  });

  it('keeps the tree, the file viewer and the terminal out of the page\'s live region', async () => {
    const { el } = await openWorkspace({ 'a.txt': 'hello' });
    const body = el.querySelector('#code-panel-body');
    // #app-view is aria-live=polite, and the panel repaints whole trees,
    // files of up to 2000 lines and terminal output.
    expect(body.getAttribute('aria-live')).toBe('off');
    expect(rowFor(el, 'a.txt').closest('[aria-live]')).toBe(body);
    rowFor(el, 'a.txt').click();
    await flush();
    expect(el.querySelector('.code-file-body').closest('[aria-live]')).toBe(body);
    el.querySelector('#code-tab-terminal').click();
    expect(el.querySelector('#code-term-out').closest('[aria-live]')).toBe(body);
    expect(el.querySelector('#code-thread').getAttribute('aria-live')).toBe('polite');
  });

  it('puts focus back on the row it was on after a folder opens or closes', async () => {
    const { el } = await openWorkspace({ 'src/a.js': '', 'README.md': '' });
    rowFor(el, 'src').focus();
    rowFor(el, 'src').click();
    await flush();
    expect(rowFor(el, 'src').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(rowFor(el, 'src'));
    rowFor(el, 'src').click();
    await flush();
    expect(rowFor(el, 'src').getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(rowFor(el, 'src'));
  });

  it('keeps focus on Refresh, and falls back to it when the focused row is gone', async () => {
    const { host, el } = await openWorkspace({ 'a.txt': '', 'b.txt': '' });
    const refresh = () => el.querySelector('#code-refresh-files');
    refresh().focus();
    refresh().click();
    await flush();
    expect(document.activeElement).toBe(refresh());

    rowFor(el, 'b.txt').focus();
    host.list.mockImplementation(async (dir) => ({ path: dir, entries: [{ name: 'a.txt', type: 'file' }], truncated: false }));
    refresh().click();
    await flush();
    expect(rowFor(el, 'b.txt')).toBeUndefined();
    expect(document.activeElement).toBe(refresh());
  });

  it('moves focus to Back when a focused row opens a file, and to that row on the way back', async () => {
    const { el } = await openWorkspace({ 'src/a.js': '', 'README.md': '# Hi' });
    rowFor(el, 'README.md').focus();
    rowFor(el, 'README.md').click();
    await flush();
    expect(document.activeElement).toBe(el.querySelector('#code-file-back'));
    el.querySelector('#code-file-back').click();
    await flush();
    expect(document.activeElement).toBe(rowFor(el, 'README.md'));
  });

  it('leaves focus where it is when it was outside the panel during a repaint', async () => {
    const { el } = await openWorkspace({ 'src/a.js': '' });
    const input = el.querySelector('#code-input');
    input.focus();
    rowFor(el, 'src').click();
    await flush();
    expect(rowFor(el, 'src/a.js')).toBeTruthy();
    expect(document.activeElement).toBe(input);
  });

  it('runs terminal commands, showing only its own output and the exit code', async () => {
    const { host, el } = await openWorkspace({ 'README.md': '' });
    el.querySelector('.code-panel-tab[data-tab="terminal"]').click();
    await flush();
    runCommand(el, 'false');
    await flush();
    const out = el.querySelector('#code-term-out').textContent;
    expect(out).toContain('$ false');
    expect(out).toContain('out of false');
    expect(out).toContain('Exit code 1');
    expect(out).not.toContain('NOT MINE');
    expect(host.run).toHaveBeenCalledWith('false', expect.objectContaining({ tag: expect.stringMatching(/^term-/) }));
    // #app-view is aria-live=polite; the output repaints on every chunk.
    expect(el.querySelector('#code-term-out').closest('[aria-live]').getAttribute('aria-live')).toBe('off');
  });

  it('shows Stop while a command runs and kills it', async () => {
    const { host, el } = await openWorkspace({ a: '' });
    const done = deferred();
    host.run.mockImplementationOnce((cmd, opts) => {
      host.emit({ id: 5, tag: opts.tag, stream: 'start', data: '' });
      return done.promise;
    });
    el.querySelector('#code-tab-terminal').click();
    const stop = () => el.querySelector('#code-term-stop');
    expect(stop().hidden).toBe(true);
    runCommand(el, 'sleep 10');
    await flush();
    expect(stop().hidden).toBe(false);
    stop().click();
    expect(host.kill).toHaveBeenCalledWith(5);
    done.resolve({ id: 5, exitCode: null, killed: true, timedOut: false });
    await flush();
    expect(stop().hidden).toBe(true);
    expect(el.querySelector('#code-term-out').textContent).toContain('Stopped.');
  });

  for (const [how, press] of [
    ['Stop', (el) => el.querySelector('#code-term-stop').click()],
    ['Ctrl+C', (el) => termKey(el, 'c', { ctrlKey: true })],
  ]) {
    it(`kills a command stopped with ${how} before the host gave it an id, once the id comes`, async () => {
      const { host, el } = await openWorkspace({ a: '' });
      const done = deferred();
      let tag = null;
      host.run.mockImplementationOnce((cmd, opts) => { tag = opts.tag; return done.promise; });
      el.querySelector('#code-tab-terminal').click();
      runCommand(el, 'sleep 2; echo finished');
      await flush();
      press(el);
      expect(host.kill).not.toHaveBeenCalled();
      // Called off by its tag, so the host never spawns it if it has not yet.
      expect(host.cancel).toHaveBeenCalledWith(tag);
      expect(el.querySelector('#code-term-stop').hidden).toBe(false);
      expect(termOut(el)).toContain('$ sleep 2; echo finished');

      host.emit({ id: 12, tag, stream: 'start', data: '' });
      expect(host.kill).toHaveBeenCalledTimes(1);
      expect(host.kill).toHaveBeenCalledWith(12);
      host.emit({ id: 12, tag, stream: 'stdout', data: 'partial\n' });
      expect(termOut(el)).toContain('partial');
      expect(el.querySelector('#code-term-stop').hidden).toBe(false);

      done.resolve({ id: 12, exitCode: null, killed: true, timedOut: false });
      await flush();
      expect(termOut(el)).toContain('Stopped.');
      expect(el.querySelector('#code-term-stop').hidden).toBe(true);
    });
  }

  it('says Stopping… from the press, before the host gave the command an id', async () => {
    const { host, el } = await openWorkspace({ a: '' });
    const done = deferred();
    let tag = null;
    host.run.mockImplementationOnce((cmd, opts) => { tag = opts.tag; return done.promise; });
    el.querySelector('#code-tab-terminal').click();
    runCommand(el, 'sleep 2');
    await flush();
    const stop = () => el.querySelector('#code-term-stop');
    expect(stop().textContent).toBe('Stop');
    stop().click();
    expect(stop().textContent).toBe('Stopping…');
    expect(stop().getAttribute('aria-disabled')).toBe('true');
    stop().click();
    termKey(el, 'c', { ctrlKey: true });

    // A visit to Files and back draws the terminal again, still stopping.
    el.querySelector('#code-tab-files').click();
    el.querySelector('#code-tab-terminal').click();
    expect(stop().textContent).toBe('Stopping…');

    host.emit({ id: 3, tag, stream: 'start', data: '' });
    expect(host.kill).toHaveBeenCalledTimes(1);
    done.resolve({ id: 3, exitCode: null, killed: true, timedOut: false });
    await flush();
    expect(stop().hidden).toBe(true);
    expect(stop().textContent).toBe('Stop');
    expect(stop().hasAttribute('aria-disabled')).toBe(false);
  });

  it('says Stopping… for a command that has an id, and moves focus to the command line when Stop goes', async () => {
    const { host, el } = await openWorkspace({ a: '' });
    const done = deferred();
    host.run.mockImplementationOnce((cmd, opts) => {
      host.emit({ id: 5, tag: opts.tag, stream: 'start', data: '' });
      return done.promise;
    });
    el.querySelector('#code-tab-terminal').click();
    runCommand(el, 'sleep 10');
    await flush();
    const stop = el.querySelector('#code-term-stop');
    stop.focus();
    stop.click();
    expect(host.kill).toHaveBeenCalledWith(5);
    expect(stop.textContent).toBe('Stopping…');
    stop.click();
    expect(host.kill).toHaveBeenCalledTimes(1);
    done.resolve({ id: 5, exitCode: null, killed: true, timedOut: false });
    await flush();
    expect(stop.hidden).toBe(true);
    expect(document.activeElement).toBe(el.querySelector('#code-term-input'));
  });

  it('kills a running command on Ctrl+C', async () => {
    const { host, el } = await openWorkspace({ a: '' });
    host.run.mockImplementationOnce((cmd, opts) => {
      host.emit({ id: 5, tag: opts.tag, stream: 'start', data: '' });
      return new Promise(() => {});
    });
    el.querySelector('#code-tab-terminal').click();
    termKey(el, 'c', { ctrlKey: true });
    expect(host.kill).not.toHaveBeenCalled();
    runCommand(el, 'sleep 10');
    await flush();
    termKey(el, 'c');
    expect(host.kill).not.toHaveBeenCalled();
    termKey(el, 'c', { ctrlKey: true });
    expect(host.kill).toHaveBeenCalledWith(5);
  });

  it('keeps the terminal at the bottom only while the user is there', async () => {
    const { host, el } = await openWorkspace({ a: '' });
    let tag = null;
    host.run.mockImplementationOnce((cmd, opts) => {
      tag = opts.tag;
      host.emit({ id: 3, tag, stream: 'start', data: '' });
      return new Promise(() => {});
    });
    el.querySelector('#code-tab-terminal').click();
    const out = el.querySelector('#code-term-out');
    // jsdom has no layout: 10px per character, a 100px box, and a
    // scrollTop clamped the way a browser clamps it.
    let top = 0;
    const max = () => Math.max(0, out.textContent.length * 10 - 100);
    Object.defineProperty(out, 'clientHeight', { configurable: true, get: () => 100 });
    Object.defineProperty(out, 'scrollHeight', { configurable: true, get: () => out.textContent.length * 10 });
    Object.defineProperty(out, 'scrollTop', { configurable: true, get: () => top, set: (v) => { top = Math.max(0, Math.min(v, max())); } });

    runCommand(el, 'npm test');
    await flush();
    expect(out.scrollTop).toBe(max());
    host.emit({ id: 3, tag, stream: 'stdout', data: 'line one\n' });
    expect(out.scrollTop).toBe(max());

    out.scrollTop = 0;
    host.emit({ id: 3, tag, stream: 'stdout', data: 'line two\n' });
    expect(out.textContent).toContain('line two');
    expect(out.scrollTop).toBe(0);

    out.scrollTop = max();
    host.emit({ id: 3, tag, stream: 'stdout', data: 'line three\n' });
    expect(out.scrollTop).toBe(max());
  });

  it('walks back and forth through earlier commands with the arrow keys', async () => {
    const { el } = await openWorkspace({ a: '' });
    el.querySelector('#code-tab-terminal').click();
    runCommand(el, 'echo one');
    await flush();
    runCommand(el, 'echo two');
    await flush();
    const input = el.querySelector('#code-term-input');
    const seen = [];
    for (const key of ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown']) {
      termKey(el, key);
      seen.push(input.value);
    }
    expect(seen).toEqual(['echo two', 'echo one', 'echo one', 'echo two', '']);
  });

  it("empties the terminal on 'clear' without running it", async () => {
    const { host, el } = await openWorkspace({ a: '' });
    el.querySelector('#code-tab-terminal').click();
    runCommand(el, 'echo hi');
    await flush();
    expect(termOut(el)).toContain('out of echo hi');
    runCommand(el, 'clear');
    await flush();
    expect(termOut(el)).toBe('');
    expect(host.run).toHaveBeenCalledTimes(1);
    termKey(el, 'ArrowUp');
    expect(el.querySelector('#code-term-input').value).toBe('clear');
  });

  it('refuses a second command while one is still running', async () => {
    const { host, el } = await openWorkspace({ a: '' });
    const done = deferred();
    host.run.mockImplementationOnce((cmd, opts) => {
      host.emit({ id: 4, tag: opts.tag, stream: 'start', data: '' });
      return done.promise;
    });
    el.querySelector('#code-tab-terminal').click();
    runCommand(el, 'sleep 10');
    await flush();
    runCommand(el, 'ls');
    await flush();
    expect(host.run).toHaveBeenCalledTimes(1);
    expect(termOut(el)).toContain('A command is still running. Stop it first.');
    expect(el.querySelector('#code-term-input').value).toBe('ls');

    done.resolve({ id: 4, exitCode: 0, killed: false, timedOut: false });
    await flush();
    runCommand(el, 'ls');
    await flush();
    expect(host.run).toHaveBeenLastCalledWith('ls', expect.anything());
  });

  it('remembers the panel tab and can close it', async () => {
    const { el } = await openWorkspace({ a: '' });
    el.querySelector('.code-panel-tab[data-tab="terminal"]').click();
    expect(JSON.parse(localStorage.getItem(Utils.KEYS.codePanel))).toEqual({ open: true, tab: 'terminal' });
    expect(Utils.KEYS.codePanel).toBe('nice-code-panel');
    el.querySelector('#code-panel-close').click();
    expect(el.querySelector('.code-view').classList.contains('code-panel-closed')).toBe(true);
    el.querySelector('[data-panel="files"]').click();
    expect(el.querySelector('.code-view').classList.contains('code-panel-closed')).toBe(false);
  });

  it('makes the panel tabs a tablist and the header buttons toggles', async () => {
    const { el } = await openWorkspace({ a: '' });
    const tablist = el.querySelector('[role="tablist"]');
    const [files, terminal] = tablist.querySelectorAll('[role="tab"]');
    const body = el.querySelector('#code-panel-body');
    const pressed = () => [...el.querySelectorAll('[data-panel]')].map(b => b.getAttribute('aria-pressed'));
    expect([...tablist.children].map(c => c.getAttribute('role'))).toEqual(['tab', 'tab']);
    expect(tablist.contains(el.querySelector('#code-panel-close'))).toBe(false);
    expect(body.getAttribute('role')).toBe('tabpanel');
    expect(files.getAttribute('aria-controls')).toBe('code-panel-body');
    expect(terminal.getAttribute('aria-controls')).toBe('code-panel-body');
    expect([files.getAttribute('aria-selected'), terminal.getAttribute('aria-selected')]).toEqual(['true', 'false']);
    expect([files.tabIndex, terminal.tabIndex]).toEqual([0, -1]);
    expect(body.getAttribute('aria-labelledby')).toBe('code-tab-files');
    expect(pressed()).toEqual(['true', 'false']);

    files.focus();
    files.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(terminal.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(terminal);
    expect(body.getAttribute('aria-labelledby')).toBe('code-tab-terminal');
    expect(el.querySelector('#code-term-out')).not.toBeNull();
    expect(pressed()).toEqual(['false', 'true']);
    terminal.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(files);
    expect(files.getAttribute('aria-selected')).toBe('true');
    files.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(terminal);
    terminal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(files);

    el.querySelector('#code-panel-close').click();
    expect(pressed()).toEqual(['false', 'false']);
    expect(document.activeElement).toBe(el.querySelector('[data-panel="files"]'));
  });

  it('does not let a file read that ends after a switch to Terminal replace the terminal', async () => {
    const { host, el } = await openWorkspace({ 'a.js': 'x' });
    const read = deferred();
    host.read.mockImplementationOnce(() => read.promise);
    rowFor(el, 'a.js').click();
    el.querySelector('#code-tab-terminal').click();
    read.resolve({ path: 'a.js', content: 'x', totalLines: 1, endLine: 1 });
    await flush();
    expect(el.querySelector('#code-term-out')).not.toBeNull();
    expect(el.querySelector('.code-file-body')).toBeNull();
    el.querySelector('#code-tab-files').click();
    await flush();
    expect(el.querySelector('.code-file-path').textContent).toBe('a.js');
  });

  it('drops terminal output and file reads from the folder it left, and leaves its command to the host', async () => {
    const { host, el } = await openWorkspace({ 'a.js': 'x' });
    const read = deferred();
    host.read.mockImplementationOnce(() => read.promise);
    rowFor(el, 'a.js').click();

    el.querySelector('#code-tab-terminal').click();
    const done = deferred();
    let oldTag = null;
    host.run.mockImplementationOnce((cmd, opts) => {
      oldTag = opts.tag;
      host.emit({ id: 9, tag: opts.tag, stream: 'start', data: '' });
      return done.promise;
    });
    runCommand(el, 'npm test');
    await flush();

    host.openFolder.mockImplementationOnce(async () => ({ root: '/Users/me/other', name: 'other' }));
    el.querySelector('#code-change-folder').click();
    await flush();
    // By now the kill would reach the new folder's workspace; main.js stops
    // the old one's commands when the folder changes.
    expect(host.kill).not.toHaveBeenCalled();
    expect(el.querySelector('#code-term-out').textContent).toBe('');
    expect(el.querySelector('#code-term-stop').hidden).toBe(true);

    host.emit({ id: 9, tag: oldTag, stream: 'stdout', data: 'old output\n' });
    done.resolve({ id: 9, exitCode: 1, killed: false, timedOut: false });
    read.resolve({ path: 'a.js', content: 'x', totalLines: 1, endLine: 1 });
    await flush();
    expect(el.querySelector('#code-term-out').textContent).toBe('');
    el.querySelector('#code-tab-files').click();
    await flush();
    expect(el.querySelector('.code-file-body')).toBeNull();
  });

  it('asks a signed-out user to sign in instead of calling a model', async () => {
    globalThis.AgentExecutor = { converse: vi.fn() };
    const { el } = await openWorkspace({ a: '' });
    submitPrompt(el, 'hello');
    await flush();
    expect(AgentExecutor.converse).not.toHaveBeenCalled();
    const note = el.querySelector('.code-msg-note').textContent;
    expect(note).toContain('Sign in');
    expect(note).toContain("NICE's hosted models");
    expect(note).toContain('your own API key');
  });

  it('sends a signed-in prompt to the chosen model and shows the reply', async () => {
    const send = vi.fn(async () => ({ text: 'Here is **the** answer', done: true }));
    globalThis.PromptPanel = { _md: (t) => t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') };
    globalThis.AgentExecutor = { converse: vi.fn(() => ({ send })) };
    const { el } = await openWorkspace({ a: '' }, {}, { state: { user: { id: 'u1' } } });
    submitPrompt(el, 'what is this?');
    await flush();
    const [bp, opts] = AgentExecutor.converse.mock.calls[0];
    expect(bp.config.llm_engine).toBe('gemini-2-5-flash');
    expect(bp.config.system_prompt).toContain('"project"');
    expect(opts.tools).toEqual(CodeTools.IDS);
    expect(opts.approvalMode).toBe('review');
    expect(opts.keepToolTurns).toBe(true);
    expect(opts.maxSteps).toBeGreaterThan(1);
    expect(ToolRegistry.resolve('code-edit')).toBeTruthy();
    expect(send).toHaveBeenCalledWith('what is this?');
    expect(el.querySelector('.code-msg-user').textContent).toBe('what is this?');
    expect(el.querySelector('.code-msg-assistant strong').textContent).toBe('the');
    delete globalThis.PromptPanel;
    expect(sendLabel(el)).toBe('Send');
  });

  it('appends new messages to a log region instead of repainting the thread', async () => {
    const model = slowModel();
    const { el } = await openWorkspace({ a: '' }, {}, { state: { user: { id: 'u1' } } });
    const thread = el.querySelector('#code-thread');
    expect(thread.getAttribute('role')).toBe('log');
    expect(thread.getAttribute('aria-live')).toBe('polite');
    submitPrompt(el, 'hi');
    await flush();
    const userMsg = el.querySelector('.code-msg-user');
    expect(el.querySelector('.code-msg-working').textContent).toBe('Working…');
    model.reply.resolve({ text: 'hello', done: true });
    await flush();
    expect(el.querySelector('.code-msg-user')).toBe(userMsg);
    expect([...thread.children].map(c => c.className)).toEqual(['code-msg code-msg-user', 'code-msg code-msg-assistant']);
  });

  it('shows Stop and the working line again when the view comes back mid-reply', async () => {
    const model = slowModel();
    const first = await openWorkspace({ a: '' }, {}, { state: { user: { id: 'u1' } } });
    submitPrompt(first.el, 'hi');
    await flush();
    expect(sendLabel(first.el)).toBe('Stop');
    CodeView.destroy();

    const { el } = await mountView(CodeView);
    await flush();
    expect(sendLabel(el)).toBe('Stop');
    expect(el.querySelector('#code-send').classList.contains('is-busy')).toBe(true);
    expect(el.querySelector('.code-msg-working').textContent).toBe('Working…');
    expect(el.querySelector('.code-msg-user').textContent).toBe('hi');

    model.reply.resolve({ text: 'done', done: true });
    await flush();
    expect(el.querySelector('.code-msg-assistant').textContent).toBe('done');
    expect(el.querySelector('.code-msg-working')).toBeNull();
    expect(sendLabel(el)).toBe('Send');
  });

  it('says it is stopping at once and drops the reply that comes back after Stop', async () => {
    const model = slowModel();
    const { el } = await openWorkspace({ a: '' }, {}, { state: { user: { id: 'u1' } } });
    submitPrompt(el, 'hi');
    await flush();
    expect(model.opts().shouldStop()).toBe(false);
    submitPrompt(el);
    expect(sendLabel(el)).toBe('Stopping');
    expect(model.opts().shouldStop()).toBe(true);

    model.reply.resolve({ text: 'late answer', done: true });
    await flush();
    expect(el.querySelector('.code-msg-assistant')).toBeNull();
    const notes = [...el.querySelectorAll('.code-msg-note')].map(n => n.textContent);
    expect(notes).toEqual(['Stopped.']);
    expect(sendLabel(el)).toBe('Send');
  });

  it('says while stopping that the reply will be dropped and when a new message can go', async () => {
    const model = slowModel();
    const { el } = await openWorkspace({ a: '' }, {}, { state: { user: { id: 'u1' } } });
    const send = el.querySelector('#code-send');
    const input = el.querySelector('#code-input');
    const enter = () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    submitPrompt(el, 'hi');
    await flush();
    expect(send.hasAttribute('aria-disabled')).toBe(false);
    submitPrompt(el);
    const working = el.querySelector('.code-msg-working').textContent;
    expect(working).toMatch(/^Stopping\./);
    expect(working).toContain('drops the reply when it arrives');
    expect(working).toContain('send a new message');
    expect(working).not.toContain('—');
    expect(send.getAttribute('aria-disabled')).toBe('true');

    // converse holds one history, so the next turn waits for the stopped one.
    input.value = 'next';
    enter();
    await flush();
    expect(model.send).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('next');

    model.reply.resolve({ text: 'late answer', done: true });
    await flush();
    expect(send.hasAttribute('aria-disabled')).toBe(false);
    model.send.mockResolvedValueOnce({ text: 'second answer', done: true });
    enter();
    await flush();
    expect(model.send).toHaveBeenLastCalledWith('next');
    expect(el.querySelector('.code-msg-assistant').textContent).toBe('second answer');
  });

  it('sends with the model picked in the prompt bar, also after the conversation started', async () => {
    globalThis.LLM_MODELS = [{ id: 'm1', label: 'One' }, { id: 'm2', label: 'Two' }];
    const send = vi.fn(async () => ({ text: 'ok', done: true }));
    globalThis.AgentExecutor = { converse: vi.fn(() => ({ send })) };
    const { el } = await openWorkspace({ a: '' }, {}, { state: { user: { id: 'u1' }, enabled_models: { m1: true, m2: true } } });
    submitPrompt(el, 'one');
    await flush();
    const bp = AgentExecutor.converse.mock.calls[0][0];
    expect(bp.config.llm_engine).toBe('m1');

    const select = el.querySelector('#code-model');
    select.value = 'm2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(localStorage.getItem(Utils.KEYS.codeModel)).toBe('m2');
    submitPrompt(el, 'two');
    await flush();
    // Taken when the next message goes, never in the middle of a turn.
    expect(bp.config.llm_engine).toBe('m2');
    expect(AgentExecutor.converse).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenLastCalledWith('two');
  });

  it('drops a reply that arrives after the folder changed', async () => {
    const model = slowModel();
    const { host, el } = await openWorkspace({ a: '' }, {}, { state: { user: { id: 'u1' } } });
    submitPrompt(el, 'hi');
    await flush();
    host.openFolder.mockImplementationOnce(async () => ({ root: '/Users/me/other', name: 'other' }));
    el.querySelector('#code-change-folder').click();
    await flush();
    expect(el.querySelector('.code-folder span').textContent).toBe('other');
    expect(sendLabel(el)).toBe('Send');
    expect(model.opts().shouldStop()).toBe(true);

    model.reply.resolve({ text: 'old answer', done: true });
    await flush();
    expect(el.querySelector('.code-msg-assistant')).toBeNull();
    expect(el.querySelector('.code-msg-note')).toBeNull();
    expect(el.querySelector('.code-thread-empty').textContent).toContain('other');
  });

  it('starts clean after a reset, even mid-reply', async () => {
    slowModel();
    const first = await openWorkspace({ a: '' }, {}, { state: { user: { id: 'u1' } } });
    submitPrompt(first.el, 'hi');
    await flush();
    first.el.querySelector('#code-tab-terminal').click();
    CodeView._test.reset();
    expect(localStorage.getItem(Utils.KEYS.codePanel)).toBeNull();

    const { el } = await openWorkspace({ a: '' });
    expect(sendLabel(el)).toBe('Send');
    expect(el.querySelector('.code-msg-working')).toBeNull();
    expect(el.querySelector('.code-thread-empty')).not.toBeNull();
    expect(el.querySelector('#code-tab-files').getAttribute('aria-selected')).toBe('true');
  });
});

/* The layout itself is checked in the desktop app; these pin the rules of
   app.css it depends on, read through jsdom's CSS parser. */
describe('Code CSS', () => {
  const sheet = (() => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../css/app.css'), 'utf8');
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    const rules = [...style.sheet.cssRules];
    style.remove();
    return rules;
  })();
  const squash = (t) => t.replace(/\s+/g, '');
  // The last rule for `selector`, at the top level or inside `media`.
  const rule = (selector, media) => {
    const pool = media
      ? sheet.filter(r => r.media && squash(r.media.mediaText) === squash(media)).flatMap(r => [...r.cssRules])
      : sheet;
    return pool.filter(r => r.selectorText === selector).pop();
  };
  const LANDSCAPE = '(max-height:500px) and (orientation:landscape)';

  it('keeps focus scrolled into view clear of the sticky Refresh bar', () => {
    const foot = rule('.code-tree-foot').style;
    expect(foot.getPropertyValue('position')).toBe('sticky');
    expect(foot.getPropertyValue('height')).toMatch(/^var\(--[\w-]+\)$/);
    const scroller = rule('.code-panel-body:has(> .code-tree-foot)');
    expect(scroller.style.getPropertyValue('scroll-padding-bottom')).toBe(foot.getPropertyValue('height'));
  });

  it('stops the view at the top of the landscape tab bar on phones', () => {
    const tabbar = rule('.app-tabbar', LANDSCAPE).style.getPropertyValue('height');
    const inset = rule('.app-main:has(.code-view)', '(max-width:768px) and ' + LANDSCAPE).style.getPropertyValue('padding-bottom');
    expect(tabbar).toBe('52px');
    expect(inset).toBe(tabbar);
  });

  it('leaves the chat the wider column in a 568px short landscape window', () => {
    const cols = rule('.code-view', LANDSCAPE).style.getPropertyValue('grid-template-columns');
    const [, min, pct] = cols.match(/minmax\(0,\s*1fr\)\s+minmax\((\d+)px,\s*(\d+)%\)/);
    const panel = Math.max(Number(min), 568 * Number(pct) / 100);
    expect(568 - panel).toBeGreaterThan(panel);
  });
});

describe('CodeView agent tools', () => {
  const ask = (el) => el.querySelector('.code-ask');
  const click = (el, answer) => ask(el).querySelector(`[data-answer="${answer}"]`).click();
  async function started(files = { 'a.js': 'x' }) {
    const model = slowModel();
    const { host, el } = await openWorkspace(files, {}, { state: { user: { id: 'u1' } } });
    submitPrompt(el, 'go');
    await flush();
    return { model, host, el, opts: model.opts() };
  }
  const edit = { tool: 'edit_file', input: { path: 'a.js', old_text: 'x', new_text: 'y' } };
  const run = (command) => ({ tool: 'run_command', input: { command } });

  it('asks before an edit, shows the change, and runs it on Allow', async () => {
    const { el, opts } = await started();
    const answer = opts.onApprovalNeeded(edit);
    await flush();
    expect(ask(el).textContent).toContain('Allow Code to edit');
    expect(ask(el).querySelector('code').textContent).toBe('a.js');
    expect(ask(el).querySelector('.code-diff-del').textContent).toBe('- x');
    expect(ask(el).querySelector('.code-diff-add').textContent).toBe('+ y');
    expect(document.activeElement).toBe(ask(el).querySelector('[data-answer="once"]'));
    expect(el.querySelector('.code-msg-working').textContent).toContain('Waiting for your answer');
    click(el, 'once');
    await expect(answer).resolves.toBe(true);
    expect(ask(el)).toBeNull();
    // Allow once: the next edit asks again.
    opts.onApprovalNeeded(edit);
    await flush();
    expect(ask(el)).not.toBeNull();
  });

  it('turns a call down on Deny or Escape', async () => {
    const { el, opts } = await started();
    const first = opts.onApprovalNeeded(edit);
    await flush();
    click(el, 'deny');
    await expect(first).resolves.toBe(false);
    const second = opts.onApprovalNeeded(run('ls'));
    await flush();
    ask(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await expect(second).resolves.toBe(false);
  });

  it('allows the rest of the session\'s edits after Allow all edits', async () => {
    const { el, opts } = await started();
    const first = opts.onApprovalNeeded(edit);
    await flush();
    click(el, 'always');
    await expect(first).resolves.toBe(true);
    await expect(opts.onApprovalNeeded({ tool: 'write_file', input: { path: 'b.js', content: 'z' } })).resolves.toBe(true);
    expect(ask(el)).toBeNull();
    // Commands still ask.
    opts.onApprovalNeeded(run('ls'));
    await flush();
    expect(ask(el).textContent).toContain('run this command');
  });

  it('remembers a command prefix, but never for a command with shell operators', async () => {
    const { el, opts } = await started();
    const first = opts.onApprovalNeeded(run('npm test'));
    await flush();
    expect(ask(el).querySelector('[data-answer="always"]').textContent).toBe('Always allow npm test');
    click(el, 'always');
    await expect(first).resolves.toBe(true);
    await expect(opts.onApprovalNeeded(run('npm test -- --watch'))).resolves.toBe(true);

    const chained = opts.onApprovalNeeded(run('npm test && rm -rf ~'));
    await flush();
    expect(ask(el)).not.toBeNull();
    expect(ask(el).querySelector('[data-answer="always"]')).toBeNull();
    expect(ask(el).querySelector('code').textContent).toBe('$ npm test && rm -rf ~');
    click(el, 'deny');
    await expect(chained).resolves.toBe(false);
  });

  it('follows the permission mode, and a mode change answers a waiting prompt', async () => {
    const { el, opts } = await started();
    const mode = el.querySelector('#code-mode');
    const setMode = (v) => { mode.value = v; mode.dispatchEvent(new Event('change', { bubbles: true })); };
    const waiting = opts.onApprovalNeeded(edit);
    await flush();
    setMode('edits');
    await expect(waiting).resolves.toBe(true);
    await expect(opts.onApprovalNeeded(edit)).resolves.toBe(true);
    const cmd = opts.onApprovalNeeded(run('ls'));
    await flush();
    expect(ask(el)).not.toBeNull();
    setMode('bypass');
    await expect(cmd).resolves.toBe(true);
    await expect(opts.onApprovalNeeded(run('rm -rf build'))).resolves.toBe(true);
  });

  it('answers a waiting prompt no on Stop', async () => {
    const { el, opts } = await started();
    const waiting = opts.onApprovalNeeded(edit);
    await flush();
    submitPrompt(el);
    await expect(waiting).resolves.toBe(false);
    expect(ask(el)).toBeNull();
    expect(opts.shouldStop()).toBe(true);
  });

  it('draws a waiting prompt again when the view comes back', async () => {
    const { opts } = await started();
    const waiting = opts.onApprovalNeeded(edit);
    await flush();
    CodeView.destroy();
    const { el } = await mountView(CodeView);
    await flush();
    expect(ask(el)).not.toBeNull();
    expect(el.querySelector('#code-thread').lastElementChild.classList.contains('code-msg-working')).toBe(true);
    click(el, 'once');
    await expect(waiting).resolves.toBe(true);
  });

  it('offers no Always allow for a shell or interpreter', async () => {
    const { el, opts } = await started();
    const waiting = opts.onApprovalNeeded(run("sh -c 'ls'"));
    await flush();
    expect(ask(el).querySelector('[data-answer="always"]')).toBeNull();
    click(el, 'once');
    await expect(waiting).resolves.toBe(true);
    const again = opts.onApprovalNeeded(run("sh -c 'rm -rf ~'"));
    await flush();
    expect(ask(el)).not.toBeNull();
    click(el, 'deny');
    await expect(again).resolves.toBe(false);
  });

  it('goes back to Ask before edits when the folder changes', async () => {
    const { host, el } = await started();
    const mode = el.querySelector('#code-mode');
    mode.value = 'bypass';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    host.openFolder.mockResolvedValueOnce({ root: '/Users/me/other', name: 'other' });
    el.querySelector('#code-change-folder').click();
    await flush();
    expect(el.querySelector('#code-mode').value).toBe('ask');
    globalThis.AgentExecutor.converse.mockClear();
    submitPrompt(el, 'again');
    await flush();
    AgentExecutor.converse.mock.calls[0][1].onApprovalNeeded(edit);
    await flush();
    expect(ask(el)).not.toBeNull();
  });

  it('clears allowances and answers no when the folder changes', async () => {
    const { host, el, opts } = await started();
    const first = opts.onApprovalNeeded(edit);
    await flush();
    click(el, 'always');
    await first;
    const waiting = opts.onApprovalNeeded(run('ls'));
    await flush();
    host.openFolder.mockResolvedValueOnce({ root: '/Users/me/other', name: 'other' });
    el.querySelector('#code-change-folder').click();
    await flush();
    await expect(waiting).resolves.toBe(false);
    // The old conversation's gate refuses everything now.
    await expect(opts.onApprovalNeeded(edit)).resolves.toBe(false);

    globalThis.AgentExecutor.converse.mockClear();
    submitPrompt(el, 'again');
    await flush();
    const next = AgentExecutor.converse.mock.calls[0][1];
    next.onApprovalNeeded(edit);
    await flush();
    expect(ask(el)).not.toBeNull();
  });

  it('shows each tool call as a step line with its result', async () => {
    const { el, opts } = await started();
    opts.onStep({ action: 'read_file', actionInput: { path: 'a.js' }, thought: 'Reading it first.', observation: JSON.stringify({ path: 'a.js', content: 'x' }) });
    opts.onStep({ action: 'run_command', actionInput: { command: 'npm test' }, thought: 'Reading it first.', observation: JSON.stringify({ exitCode: 1, stdout: 'FAIL', stderr: '' }) });
    opts.onStep({ action: 'edit_file', actionInput: { path: 'a.js' }, thought: '', observation: 'Action blocked — user declined approval.' });
    opts.onStep({ action: 'run_command', actionInput: { command: 'ls' }, thought: '', observation: 'Stopped: the chat moved on before this ran.' });
    const steps = [...el.querySelectorAll('.code-step')];
    expect(steps.map(s => s.querySelector('.code-step-title').textContent)).toEqual(['Read a.js', 'Run npm test', 'Denied: Edit a.js', 'Not run: Run ls']);
    expect(steps[0].querySelector('.code-step-out').textContent).toBe('x');
    expect(steps[1].querySelector('.code-step-out').textContent).toBe('FAIL\nExit code 1');
    expect(steps[2].querySelector('.dot-r')).not.toBeNull();
    expect(steps[0].querySelector('.dot-g')).not.toBeNull();
    expect(steps[1].querySelector('.dot-r')).not.toBeNull();
    // The agent's text before its calls shows once.
    expect([...el.querySelectorAll('.code-msg-assistant')].map(m => m.textContent)).toEqual(['Reading it first.']);
  });

  it('lists the folder again after an edit lands', async () => {
    const { host, opts } = await started();
    const before = host.list.mock.calls.length;
    opts.onStep({ action: 'write_file', actionInput: { path: 'b.js' }, thought: '', observation: JSON.stringify({ path: 'b.js', created: true }) });
    await flush();
    expect(host.list.mock.calls.length).toBeGreaterThan(before);
  });

  it('shows a running command\'s output and stops it on Stop', async () => {
    const { host, el } = await started();
    host.emit({ id: 41, tag: CodeTools.AGENT_TAG + '9', stream: 'start', data: '' });
    host.emit({ id: 41, tag: CodeTools.AGENT_TAG + '9', stream: 'stdout', data: 'building\n' });
    const out = el.querySelector('.code-working-out');
    expect(out.hidden).toBe(false);
    expect(out.textContent).toBe('building');
    el.querySelector('#code-tab-terminal').click();
    expect(termOut(el)).not.toContain('building');
    submitPrompt(el);
    expect(host.kill).toHaveBeenCalledWith(41);
    // One that starts after Stop is stopped at once.
    host.emit({ id: 42, tag: CodeTools.AGENT_TAG + '10', stream: 'start', data: '' });
    expect(host.kill).toHaveBeenCalledWith(42);
  });
});

describe('CodeView on your own API keys', () => {
  function fakeLlm({ keys = {}, models = { anthropic: [{ id: 'claude-x', label: 'Claude X' }] } } = {}) {
    const saved = { ...keys };
    return {
      saved,
      providers: vi.fn(async () => [
        { id: 'anthropic', label: 'Anthropic', hasKey: !!saved.anthropic },
        { id: 'openai', label: 'OpenAI', hasKey: !!saved.openai },
      ]),
      models: vi.fn(async (p) => models[p] || []),
      setKey: vi.fn(async (p, k) => {
        if (k === 'bad-key-123') throw { code: 'EKEY', message: 'Anthropic refused the key.' };
        saved[p] = true;
        return models[p] || [];
      }),
      clearKey: vi.fn(async (p) => { delete saved[p]; return true; }),
    };
  }
  async function openWithKeys(llm, mountOpts) {
    const host = fakeHost({ a: '' });
    window.NiceDesktop = { code: host, llm };
    await host.openFolder();
    const { el } = await mountView(CodeView, mountOpts);
    await flush();
    return el;
  }
  const options = (el) => [...el.querySelectorAll('#code-model optgroup')].map(g => [g.label, [...g.querySelectorAll('option')].map(o => o.value)]);

  it('lists the models of each provider with a key under NICE\'s', async () => {
    const el = await openWithKeys(fakeLlm({ keys: { anthropic: true } }));
    expect(options(el)).toEqual([['NICE', ['gemini-2-5-flash']], ['Anthropic (your key)', ['byo:anthropic:claude-x']]]);
  });

  it('chats on an own-key model without a NICE account', async () => {
    const send = vi.fn(async () => ({ text: 'hi', done: true }));
    globalThis.AgentExecutor = { converse: vi.fn(() => ({ send })) };
    const el = await openWithKeys(fakeLlm({ keys: { anthropic: true } }));
    const select = el.querySelector('#code-model');
    select.value = 'byo:anthropic:claude-x';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    submitPrompt(el, 'hello');
    await flush();
    expect(AgentExecutor.converse.mock.calls[0][0].config.llm_engine).toBe('byo:anthropic:claude-x');
    expect(el.querySelector('.code-msg-assistant').textContent).toBe('hi');
    // The pick is kept for next time.
    expect(localStorage.getItem(Utils.KEYS.codeModel)).toBe('byo:anthropic:claude-x');
  });

  it('adds a key, then offers its models, and never shows the key again', async () => {
    const llm = fakeLlm();
    const el = await openWithKeys(llm);
    el.querySelector('#code-keys').click();
    await flush();
    const dlg = document.getElementById('own-keys-dialog');
    expect(dlg.querySelector('[role="dialog"]').getAttribute('aria-modal')).toBe('true');
    const row = () => document.querySelector('.own-key-row[data-provider="anthropic"]');
    const input = row().querySelector('input');
    expect(input.type).toBe('password');
    expect(document.activeElement).toBe(input);
    input.value = 'sk-ant-secret-999';
    row().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(llm.setKey).toHaveBeenCalledWith('anthropic', 'sk-ant-secret-999');
    expect(row().querySelector('.own-key-status').textContent).toContain('Key saved, 1 models');
    expect(document.body.innerHTML).not.toContain('sk-ant-secret-999');
    expect(options(el).map(g => g[0])).toContain('Anthropic (your key)');
  });

  it('says why a key was not saved', async () => {
    const llm = fakeLlm();
    const el = await openWithKeys(llm);
    el.querySelector('#code-keys').click();
    await flush();
    const row = document.querySelector('.own-key-row[data-provider="anthropic"]');
    row.querySelector('input').value = 'bad-key-123';
    row.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(row.querySelector('.own-keys-err').textContent).toBe('Anthropic refused the key.');
    expect(row.querySelector('input').disabled).toBe(false);
    expect(llm.saved.anthropic).toBeUndefined();
  });

  it('removes a key and its models', async () => {
    const llm = fakeLlm({ keys: { anthropic: true } });
    const el = await openWithKeys(llm);
    el.querySelector('#code-keys').click();
    await flush();
    document.querySelector('[data-remove="anthropic"]').click();
    await flush();
    expect(llm.clearKey).toHaveBeenCalledWith('anthropic');
    expect(options(el)).toEqual([['NICE', ['gemini-2-5-flash']]]);
    expect(document.querySelector('.own-key-row[data-provider="anthropic"] input')).not.toBeNull();
  });

  it('closes on Escape and gives focus back to the key button', async () => {
    const el = await openWithKeys(fakeLlm());
    const btn = el.querySelector('#code-keys');
    btn.focus();
    btn.click();
    await flush();
    document.getElementById('own-keys-dialog').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('own-keys-dialog')).toBeNull();
    expect(document.activeElement).toBe(btn);
  });
});

describe('CodeView browser', () => {
  /* A fake window.NiceDesktop.browser shaped like desktop/preload.js. */
  function fakeBrowser() {
    let st = null;
    const listeners = new Set();
    const b = {
      state: vi.fn(async () => st),
      place: vi.fn(async () => true),
      open: vi.fn(async (u) => {
        const url = u.startsWith('http') ? u : 'http://' + u + '/';
        st = { url, title: 'Page', host: new URL(url).host, loading: false, canGoBack: !!st, canGoForward: false, status: 200, error: null };
        b.emit(st);
        return st;
      }),
      back: vi.fn(async () => st), forward: vi.fn(async () => st), reload: vi.fn(async () => st), stop: vi.fn(async () => st),
      onState: vi.fn((fn) => { listeners.add(fn); return () => listeners.delete(fn); }),
      emit: (s) => { st = s; listeners.forEach(fn => fn(s)); },
    };
    return b;
  }
  const ask = (el) => el.querySelector('.code-ask');
  const click = (el, answer) => ask(el).querySelector(`[data-answer="${answer}"]`).click();
  let raf;
  beforeEach(() => {
    raf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  });
  afterEach(() => {
    CodeView._test.reset();
    globalThis.requestAnimationFrame = raf;
    delete globalThis.cancelAnimationFrame;
  });

  async function withBrowser({ agent } = {}) {
    const br = fakeBrowser();
    const code = fakeHost({ 'a.js': 'x' });
    window.NiceDesktop = { code, browser: br };
    await code.openFolder();
    const model = agent ? slowModel() : null;
    const { el } = await mountView(CodeView, agent ? { state: { user: { id: 'u1' } } } : undefined);
    await flush();
    if (agent) { submitPrompt(el, 'go'); await flush(); }
    return { br, el, opts: model && model.opts() };
  }
  const showTab = async (el) => { el.querySelector('#code-tab-browser').click(); await flush(); };
  const viewport = (el) => el.querySelector('#code-browser-view');

  it('has no Browser tab on a desktop app without one', async () => {
    const { el } = await openWorkspace({ 'a.js': 'x' });
    expect(el.querySelector('#code-tab-browser')).toBeNull();
    expect(el.querySelector('[data-panel="browser"]')).toBeNull();
  });

  it('opens what the user types in the address bar and follows the page', async () => {
    const { br, el } = await withBrowser();
    await showTab(el);
    expect(el.querySelector('#code-browser-empty').textContent).toContain('Nothing is open');
    const input = el.querySelector('#code-browser-url');
    input.value = 'localhost:3000';
    input.dispatchEvent(new Event('input'));
    el.querySelector('#code-browser-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(br.open).toHaveBeenCalledWith('localhost:3000');
    expect(input.value).toBe('http://localhost:3000/');
    expect(el.querySelector('#code-browser-empty').textContent).toBe('');
    br.emit({ url: 'http://localhost:3000/next', title: 'Next', host: 'localhost:3000', canGoBack: true, canGoForward: false });
    expect(input.value).toBe('http://localhost:3000/next');
    expect(el.querySelector('[data-nav="back"]').getAttribute('aria-disabled')).toBe('false');
    expect(el.querySelector('[data-nav="forward"]').getAttribute('aria-disabled')).toBe('true');
    el.querySelector('[data-nav="back"]').click();
    expect(br.back).toHaveBeenCalled();
  });

  it('keeps what the user is typing when the page changes', async () => {
    const { br, el } = await withBrowser();
    await showTab(el);
    await br.open('localhost:3000');
    const input = el.querySelector('#code-browser-url');
    input.value = 'exam';
    input.dispatchEvent(new Event('input'));
    br.emit({ url: 'http://localhost:3000/b', title: 'B', host: 'localhost:3000' });
    expect(input.value).toBe('exam');
  });

  it('says when a page did not open', async () => {
    const { br, el } = await withBrowser();
    br.open.mockRejectedValueOnce({ code: 'EINVAL', message: 'Code\'s browser opens http and https addresses only.' });
    await showTab(el);
    el.querySelector('#code-browser-url').value = 'file:///x';
    el.querySelector('#code-browser-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(el.querySelector('#code-browser-empty').textContent).toContain('http and https addresses only');
  });

  it('places the browser over the viewport while the tab shows a page, and hides it otherwise', async () => {
    const { br, el } = await withBrowser();
    await showTab(el);
    await br.open('localhost:3000');
    el.querySelector('.code-panel').getBoundingClientRect = () => ({ left: 400, top: 60, right: 1024, bottom: 768 });
    // Clipped to the window (jsdom's is 1024 wide).
    viewport(el).getBoundingClientRect = () => ({ left: 800, top: 120, width: 400, height: 600 });
    await flush();
    expect(br.place).toHaveBeenLastCalledWith({ x: 800, y: 120, width: 224, height: 600 });
    const calls = br.place.mock.calls.length;
    await flush();
    expect(br.place.mock.calls.length).toBe(calls);
    // Moved without resizing.
    viewport(el).getBoundingClientRect = () => ({ left: 600, top: 120, width: 400, height: 600 });
    await flush();
    expect(br.place).toHaveBeenLastCalledWith({ x: 600, y: 120, width: 400, height: 600 });
    // A dialog over the page hides it, and it comes back after.
    const dlg = document.createElement('div');
    dlg.className = 'modal-overlay open';
    document.body.appendChild(dlg);
    await flush();
    expect(br.place).toHaveBeenLastCalledWith(null);
    dlg.remove();
    await flush();
    expect(br.place).toHaveBeenLastCalledWith({ x: 600, y: 120, width: 400, height: 600 });
    el.querySelector('#code-tab-files').click();
    await flush();
    expect(br.place).toHaveBeenLastCalledWith(null);
    el.querySelector('#code-tab-browser').click();
    await flush();
    el.querySelector('.code-panel').getBoundingClientRect = () => ({ left: 400, top: 60, right: 1024, bottom: 768 });
    viewport(el).getBoundingClientRect = () => ({ left: 600, top: 120, width: 400, height: 600 });
    await flush();
    expect(br.place).toHaveBeenLastCalledWith({ x: 600, y: 120, width: 400, height: 600 });
    CodeView.destroy();
    await flush();
    expect(br.place).toHaveBeenLastCalledWith(null);
  });

  it('shows a screenshot in its step line, and only an image the browser made', async () => {
    const { el, opts } = await withBrowser({ agent: true });
    opts.onStep({ action: 'browser_screenshot', actionInput: {}, observation: JSON.stringify({ url: 'http://localhost:3000/', title: 'App' }), images: ['data:image/jpeg;base64,QUJD'] });
    opts.onStep({ action: 'browser_screenshot', actionInput: {}, observation: '{}', images: ['javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4='] });
    const steps = el.querySelectorAll('.code-step');
    const img = steps[0].querySelector('img.code-step-shot');
    expect(img.getAttribute('src')).toBe('data:image/jpeg;base64,QUJD');
    expect(img.getAttribute('alt')).toBe('Screenshot: App');
    expect(steps[0].open).toBe(true);
    expect(steps[1].querySelector('img')).toBeNull();
  });

  it('hides the browser under any modal dialog that shows, and under anything over its viewport', async () => {
    const { br, el } = await withBrowser();
    await showTab(el);
    await br.open('localhost:3000');
    el.querySelector('.code-panel').getBoundingClientRect = () => ({ left: 400, top: 60, right: 1024, bottom: 768 });
    viewport(el).getBoundingClientRect = () => ({ left: 600, top: 120, width: 400, height: 600 });
    await flush();
    const shown = { x: 600, y: 120, width: 400, height: 600 };
    expect(br.place).toHaveBeenLastCalledWith(shown);
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    modal.getClientRects = () => [{}];
    document.body.appendChild(modal);
    await flush();
    expect(br.place).toHaveBeenLastCalledWith(null);
    modal.remove();
    await flush();
    expect(br.place).toHaveBeenLastCalledWith(shown);
    for (const cls of ['auth-modal-overlay open', 'upgrade-modal-overlay open']) {
      const o = document.createElement('div');
      o.className = cls;
      document.body.appendChild(o);
      await flush();
      expect(br.place).toHaveBeenLastCalledWith(null);
      o.remove();
      await flush();
    }
    const cover = document.createElement('div');
    document.body.appendChild(cover);
    document.elementFromPoint = () => cover;
    try {
      await flush();
      expect(br.place).toHaveBeenLastCalledWith(null);
      document.elementFromPoint = () => viewport(el);
      await flush();
      expect(br.place).toHaveBeenLastCalledWith(shown);
    } finally { delete document.elementFromPoint; cover.remove(); }
  });

  it('binds each approval to the site the page is on, under Always allow and Bypass too', async () => {
    const { br, el, opts } = await withBrowser({ agent: true });
    await br.open('example.com');
    const input = { ref: '2' };
    const waiting = opts.onApprovalNeeded({ tool: 'browser_click', input });
    await flush();
    click(el, 'always');
    await expect(waiting).resolves.toBe(true);
    window.NiceDesktop.browser = { ...br, click: vi.fn(async () => ({})) };
    await ToolRegistry.execute('code-browser-click', input, { approvalMode: 'review', onApprovalNeeded: async () => true });
    expect(window.NiceDesktop.browser.click).toHaveBeenCalledWith('2', { expectHost: 'example.com' });
    window.NiceDesktop.browser = br;
    const mode = el.querySelector('#code-mode');
    mode.value = 'bypass'; mode.dispatchEvent(new Event('change', { bubbles: true }));
    const open = { url: 'localhost:3000' };
    await expect(opts.onApprovalNeeded({ tool: 'browser_open', input: open })).resolves.toBe(true);
    const spy = vi.spyOn(br, 'open');
    await ToolRegistry.execute('code-browser-open', open, {});
    expect(spy).toHaveBeenLastCalledWith('localhost:3000', { expectHost: 'localhost:3000' });
  });

  it('asks before opening a page, brings the Browser tab up, and remembers a site', async () => {
    const { br, el, opts } = await withBrowser({ agent: true });
    const first = opts.onApprovalNeeded({ tool: 'browser_open', input: { url: 'localhost:3000/login' } });
    await flush();
    expect(el.querySelector('#code-tab-browser').getAttribute('aria-selected')).toBe('true');
    expect(ask(el).textContent).toContain('Allow Code to open this page?');
    expect(ask(el).querySelector('code').textContent).toBe('localhost:3000/login');
    expect(ask(el).querySelector('[data-answer="always"]').textContent).toBe('Always allow localhost:3000');
    click(el, 'always');
    await expect(first).resolves.toBe(true);
    await br.open('localhost:3000');
    await expect(opts.onApprovalNeeded({ tool: 'browser_open', input: { url: 'http://localhost:3000/other' } })).resolves.toBe(true);
    await expect(opts.onApprovalNeeded({ tool: 'browser_click', input: { ref: '2' } })).resolves.toBe(true);
    // Another site asks.
    const other = opts.onApprovalNeeded({ tool: 'browser_open', input: { url: 'example.com' } });
    await flush();
    expect(ask(el).querySelector('[data-answer="always"]').textContent).toBe('Always allow example.com');
    click(el, 'deny');
    await expect(other).resolves.toBe(false);
  });

  it('asks before typing on a page, naming the site, the field and the text', async () => {
    const { br, el, opts } = await withBrowser({ agent: true });
    await br.open('example.com');
    const waiting = opts.onApprovalNeeded({ tool: 'browser_type', input: { ref: '3', text: 'hello <b>', clear: true, submit: true } });
    await flush();
    expect(ask(el).querySelector('.code-ask-q').textContent).toBe('Allow Code to type on example.com?');
    expect(ask(el).textContent).toContain('Into [3]');
    expect(ask(el).querySelector('pre code').textContent).toBe('hello <b>');
    expect(ask(el).textContent).toContain('Replaces what the field holds. Then presses Enter.');
    click(el, 'once');
    await expect(waiting).resolves.toBe(true);
  });

  it('leaves websites out of Edit automatically, and lets Bypass cover them', async () => {
    const { el, opts } = await withBrowser({ agent: true });
    const mode = el.querySelector('#code-mode');
    mode.value = 'edits'; mode.dispatchEvent(new Event('change', { bubbles: true }));
    const waiting = opts.onApprovalNeeded({ tool: 'browser_open', input: { url: 'example.com' } });
    await flush();
    expect(ask(el)).not.toBeNull();
    mode.value = 'bypass'; mode.dispatchEvent(new Event('change', { bubbles: true }));
    await expect(waiting).resolves.toBe(true);
  });

  it('forgets allowed sites when the folder changes', async () => {
    const { el, opts } = await withBrowser({ agent: true });
    const first = opts.onApprovalNeeded({ tool: 'browser_open', input: { url: 'example.com' } });
    await flush();
    click(el, 'always');
    await first;
    window.NiceDesktop.code.openFolder.mockResolvedValueOnce({ root: '/Users/me/other', name: 'other' });
    el.querySelector('#code-change-folder').click();
    await flush();
    const model = slowModel();
    submitPrompt(el, 'again');
    await flush();
    const again = model.opts().onApprovalNeeded({ tool: 'browser_open', input: { url: 'example.com' } });
    await flush();
    expect(ask(el)).not.toBeNull();
    click(el, 'deny');
    await again;
  });
});
