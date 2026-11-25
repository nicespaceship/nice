import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
const rowFor = (el, path) => [...el.querySelectorAll('.code-tree-row')].find(r => r.dataset.path === path);
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
  delete window.NiceDesktop;
});
afterEach(() => { delete window.NiceDesktop; delete globalThis.AgentExecutor; delete globalThis.LLM_MODELS; });

describe('CodeView on the website', () => {
  it('says Code runs in the desktop app, without promising file edits', async () => {
    const { el } = await mountView(CodeView);
    expect(el.querySelector('.code-empty-title').textContent).toBe('Code runs in the NICE desktop app');
    const text = el.querySelector('.code-empty-text').textContent;
    expect(text).not.toMatch(/edits files/);
    expect(text).toContain("can't open or change files yet");
    expect(el.querySelector('.code-view')).toBeNull();
  });
});

describe('CodeView in the desktop app', () => {
  it('asks for a folder, then shows the conversation and the panel', async () => {
    const host = fakeHost({ 'README.md': '# Hi' });
    window.NiceDesktop = { code: host };
    const { el } = await mountView(CodeView);
    expect(el.querySelector('.code-empty-title').textContent).toBe('Open a folder');
    expect(el.querySelector('.code-empty-text').textContent).toContain("can't open or change files yet");
    el.querySelector('#code-open-folder').click();
    await flush();
    expect(host.openFolder).toHaveBeenCalled();
    expect(el.querySelector('.code-folder span').textContent).toBe('project');
    expect(el.querySelector('#code-input').getAttribute('placeholder')).toContain('project');
    expect(el.querySelector('.code-panel')).not.toBeNull();
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
    expect(fileRow.getAttributeNames().sort()).toEqual(['class', 'data-path', 'data-type', 'style', 'type']);
    expect(dirRow.getAttributeNames().sort()).toEqual(['aria-expanded', 'class', 'data-path', 'data-type', 'style', 'type']);
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

  it('says when a folder listing was cut short', async () => {
    const { el } = await openWorkspace({ 'a.txt': '', 'b.txt': '', 'src/c.js': '' }, { truncated: ['.'] });
    const more = el.querySelectorAll('.code-tree-more');
    expect(more).toHaveLength(1);
    expect(more[0].textContent).toBe('Only the first 3 items are shown.');
    rowFor(el, 'src').click();
    await flush();
    expect(el.querySelectorAll('.code-tree-more')).toHaveLength(1);
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
    expect(el.querySelector('#code-term-out').hasAttribute('aria-live')).toBe(false);
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

  it('drops terminal output and file reads from the folder it left, and kills its command', async () => {
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
    expect(host.kill).toHaveBeenCalledWith(9);
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

  it('kills a command left behind before its id arrived, once it does', async () => {
    const { host, el } = await openWorkspace({ a: '' });
    let oldTag = null;
    host.run.mockImplementationOnce((cmd, opts) => { oldTag = opts.tag; return new Promise(() => {}); });
    el.querySelector('#code-tab-terminal').click();
    runCommand(el, 'sleep 10');
    await flush();
    host.openFolder.mockImplementationOnce(async () => ({ root: '/Users/me/other', name: 'other' }));
    el.querySelector('#code-change-folder').click();
    await flush();
    expect(host.kill).not.toHaveBeenCalled();
    host.emit({ id: 11, tag: oldTag, stream: 'start', data: '' });
    expect(host.kill).toHaveBeenCalledWith(11);
  });

  it('asks a signed-out user to sign in instead of calling a model', async () => {
    globalThis.AgentExecutor = { converse: vi.fn() };
    const { el } = await openWorkspace({ a: '' });
    submitPrompt(el, 'hello');
    await flush();
    expect(AgentExecutor.converse).not.toHaveBeenCalled();
    expect(el.querySelector('.code-msg-note').textContent).toContain('Sign in');
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
    expect(opts.tools).toEqual([]);
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
    expect(el.querySelector('.code-msg-working').textContent).toBe('Stopping…');
    expect(model.opts().shouldStop()).toBe(true);

    model.reply.resolve({ text: 'late answer', done: true });
    await flush();
    expect(el.querySelector('.code-msg-assistant')).toBeNull();
    const notes = [...el.querySelectorAll('.code-msg-note')].map(n => n.textContent);
    expect(notes).toEqual(['Stopped.']);
    expect(sendLabel(el)).toBe('Send');
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
