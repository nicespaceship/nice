import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installViewMocks, loadModule, mountView } from './helpers/view-harness.js';

const mocks = installViewMocks();
loadModule('views/code.js');

const tick = () => new Promise(r => setTimeout(r, 0));
const flush = async () => { for (let i = 0; i < 5; i++) await tick(); };

/* A fake window.NiceDesktop.code over an in-memory folder, shaped like
   desktop/preload.js: values resolve, failures reject with { code, message }. */
function fakeHost(files = {}) {
  let ws = null;
  const listeners = new Set();
  const fail = (code, message) => Promise.reject({ code, message });
  const host = {
    openFolder: vi.fn(async () => (ws = { root: '/Users/me/project', name: 'project' })),
    workspace: vi.fn(async () => ws),
    list: vi.fn(async (dir) => {
      const prefix = dir === '.' ? '' : dir + '/';
      const names = new Map();
      for (const p of Object.keys(files)) {
        if (!p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length).split('/');
        names.set(rest[0], rest.length > 1 ? 'dir' : 'file');
      }
      return { entries: [...names].map(([name, type]) => ({ name, type })).sort((a, b) => (a.type === 'dir' ? -1 : 1) - (b.type === 'dir' ? -1 : 1) || a.name.localeCompare(b.name)) };
    }),
    read: vi.fn(async (p) => {
      if (!(p in files)) return fail('ENOENT', 'No such file');
      if (files[p] === null) return fail('EBINARY', 'Binary file: ' + p);
      const lines = files[p].split('\n');
      return { path: p, content: files[p], totalLines: lines.length, startLine: 1, endLine: lines.length };
    }),
    run: vi.fn(async (command, opts) => {
      const id = 7;
      listeners.forEach(fn => fn({ id, tag: opts.tag, stream: 'start', data: '' }));
      listeners.forEach(fn => fn({ id, tag: opts.tag, stream: 'stdout', data: 'out of ' + command + '\n' }));
      listeners.forEach(fn => fn({ id, tag: 'someone-else', stream: 'stdout', data: 'NOT MINE\n' }));
      return { id, exitCode: command === 'false' ? 1 : 0, stdout: '', stderr: '', timedOut: false, killed: false };
    }),
    kill: vi.fn(async () => true),
    onRunData: vi.fn((fn) => { listeners.add(fn); return () => listeners.delete(fn); }),
  };
  return host;
}

beforeEach(() => {
  CodeView._test.reset();
  delete window.NiceDesktop;
});
afterEach(() => { delete window.NiceDesktop; delete globalThis.AgentExecutor; });

describe('CodeView on the website', () => {
  it('says Code runs in the desktop app', async () => {
    const { el } = await mountView(CodeView);
    expect(el.querySelector('.code-empty-title').textContent).toBe('Code runs in the NICE desktop app');
    expect(el.querySelector('.code-view')).toBeNull();
  });
});

describe('CodeView in the desktop app', () => {
  it('asks for a folder, then shows the conversation and the panel', async () => {
    const host = fakeHost({ 'README.md': '# Hi' });
    window.NiceDesktop = { code: host };
    const { el } = await mountView(CodeView);
    expect(el.querySelector('.code-empty-title').textContent).toBe('Open a folder');
    el.querySelector('#code-open-folder').click();
    await flush();
    expect(host.openFolder).toHaveBeenCalled();
    expect(el.querySelector('.code-folder span').textContent).toBe('project');
    expect(el.querySelector('#code-input').getAttribute('placeholder')).toContain('project');
    expect(el.querySelector('.code-panel')).not.toBeNull();
  });

  it('browses the folder and opens a file', async () => {
    const host = fakeHost({ 'src/a.js': 'const a = 1;', 'README.md': '# Hi', 'img.png': null });
    window.NiceDesktop = { code: host };
    await host.openFolder();
    const { el } = await mountView(CodeView);
    await flush();
    const rows = () => [...el.querySelectorAll('.code-tree-row')].map(r => r.textContent.trim());
    expect(rows()).toEqual(['src', 'img.png', 'README.md']);
    el.querySelector('.code-tree-row[data-path="src"]').click();
    await flush();
    expect(rows()).toEqual(['src', 'a.js', 'img.png', 'README.md']);
    el.querySelector('.code-tree-row[data-path="src/a.js"]').click();
    await flush();
    expect(el.querySelector('.code-file-path').textContent).toBe('src/a.js');
    expect(el.querySelector('.code-file-body').textContent).toBe('const a = 1;');
    el.querySelector('#code-file-back').click();
    await flush();
    el.querySelector('.code-tree-row[data-path="img.png"]').click();
    await flush();
    expect(el.querySelector('.code-tree-err').textContent).toBe('This is a binary file.');
  });

  it('shows file contents as text, never markup', async () => {
    const host = fakeHost({ 'x.html': '<img src=x onerror=alert(1)>' });
    window.NiceDesktop = { code: host };
    await host.openFolder();
    const { el } = await mountView(CodeView);
    await flush();
    el.querySelector('.code-tree-row[data-path="x.html"]').click();
    await flush();
    expect(el.querySelector('.code-file-body img')).toBeNull();
    expect(el.querySelector('.code-file-body').textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('runs terminal commands, showing only its own output and the exit code', async () => {
    const host = fakeHost({ 'README.md': '' });
    window.NiceDesktop = { code: host };
    await host.openFolder();
    const { el } = await mountView(CodeView);
    await flush();
    el.querySelector('.code-panel-tab[data-tab="terminal"]').click();
    await flush();
    const input = el.querySelector('#code-term-input');
    input.value = 'false';
    el.querySelector('#code-term-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    const out = el.querySelector('#code-term-out').textContent;
    expect(out).toContain('$ false');
    expect(out).toContain('out of false');
    expect(out).toContain('Exit code 1');
    expect(out).not.toContain('NOT MINE');
    expect(host.run).toHaveBeenCalledWith('false', expect.objectContaining({ tag: expect.stringMatching(/^term-/) }));
  });

  it('remembers the panel tab and can close it', async () => {
    const host = fakeHost({ 'a': '' });
    window.NiceDesktop = { code: host };
    await host.openFolder();
    const { el } = await mountView(CodeView);
    await flush();
    el.querySelector('.code-panel-tab[data-tab="terminal"]').click();
    expect(JSON.parse(localStorage.getItem('nice-code-panel'))).toEqual({ open: true, tab: 'terminal' });
    el.querySelector('#code-panel-close').click();
    expect(el.querySelector('.code-view').classList.contains('code-panel-closed')).toBe(true);
    el.querySelector('[data-panel="files"]').click();
    expect(el.querySelector('.code-view').classList.contains('code-panel-closed')).toBe(false);
  });

  it('asks a signed-out user to sign in instead of calling a model', async () => {
    const host = fakeHost({ 'a': '' });
    window.NiceDesktop = { code: host };
    globalThis.AgentExecutor = { converse: vi.fn() };
    await host.openFolder();
    const { el } = await mountView(CodeView);
    await flush();
    el.querySelector('#code-input').value = 'hello';
    el.querySelector('#code-prompt').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(AgentExecutor.converse).not.toHaveBeenCalled();
    expect(el.querySelector('.code-msg-note').textContent).toContain('Sign in');
  });

  it('sends a signed-in prompt to the chosen model and shows the reply', async () => {
    const host = fakeHost({ 'a': '' });
    window.NiceDesktop = { code: host };
    const send = vi.fn(async () => ({ text: 'Here is **the** answer', done: true }));
    globalThis.PromptPanel = { _md: (t) => t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') };
    globalThis.AgentExecutor = { converse: vi.fn(() => ({ send })) };
    await host.openFolder();
    const { el } = await mountView(CodeView, { state: { user: { id: 'u1' } } });
    await flush();
    el.querySelector('#code-input').value = 'what is this?';
    el.querySelector('#code-prompt').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    const [bp, opts] = AgentExecutor.converse.mock.calls[0];
    expect(bp.config.llm_engine).toBe('gemini-2-5-flash');
    expect(bp.config.system_prompt).toContain('"project"');
    expect(opts.tools).toEqual([]);
    expect(send).toHaveBeenCalledWith('what is this?');
    expect(el.querySelector('.code-msg-user').textContent).toBe('what is this?');
    expect(el.querySelector('.code-msg-assistant strong').textContent).toBe('the');
    delete globalThis.PromptPanel;
    expect(el.querySelector('#code-send').getAttribute('aria-label')).toBe('Send');
  });
});
