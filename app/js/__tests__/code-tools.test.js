import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/* CodeTools is loaded by setup.js after ToolRegistry. */

function host(over = {}) {
  return {
    read: vi.fn(async (p) => ({ path: p, content: 'a\nb', startLine: 1, endLine: 2, totalLines: 2 })),
    list: vi.fn(async (d) => ({ path: d, entries: [] })),
    search: vi.fn(async () => ({ matches: [] })),
    edit: vi.fn(async (p) => ({ path: p, replacements: 1 })),
    write: vi.fn(async (p, c) => ({ path: p, created: true, bytes: c.length })),
    run: vi.fn(async () => ({ exitCode: 0, stdout: 'ok', stderr: '' })),
    ...over,
  };
}

beforeEach(() => { CodeTools.register(); });
afterEach(() => { delete window.NiceDesktop; CodeTools._test.reset(); });

describe('CodeTools', () => {
  it('registers its tools once, with edits, writes, commands and acting on web pages as side effects', () => {
    expect(CodeTools.register()).toBe(true);
    expect(CodeTools.IDS).toEqual(['code-read', 'code-list', 'code-search', 'code-edit', 'code-write', 'code-run',
      'code-browser-open', 'code-browser-read', 'code-browser-click', 'code-browser-type', 'code-browser-key', 'code-browser-shot',
      'code-browser-scroll', 'code-browser-back', 'code-browser-console']);
    const side = CodeTools.IDS.filter(id => ToolRegistry.resolve(id).sideEffect);
    expect(side).toEqual(['code-edit', 'code-write', 'code-run', 'code-browser-open', 'code-browser-click', 'code-browser-type', 'code-browser-key']);
    expect(ToolRegistry.resolve('read_file').id).toBe('code-read');
  });

  it('says it needs the desktop app when there is no host', async () => {
    await expect(ToolRegistry.execute('code-read', { path: 'a' })).rejects.toThrow(/desktop app/);
  });

  it('reads with a default line limit and passes the host\'s notes on', async () => {
    const h = host({ read: vi.fn(async (p) => ({ path: p, content: 'x', startLine: 1, endLine: 1, totalLines: 1, encoding: 'lossy', linesCut: true })) });
    window.NiceDesktop = { code: h };
    const r = await ToolRegistry.execute('code-read', { path: 'a.js' });
    expect(h.read).toHaveBeenCalledWith('a.js', { offset: 0, limit: CodeTools.READ_LIMIT });
    expect(r.note).toContain('Not exact UTF-8');
    expect(r.note).toContain('long lines were cut');
  });

  it('turns host errors into readable ones', async () => {
    window.NiceDesktop = { code: host({ edit: vi.fn(() => Promise.reject({ code: 'ENOMATCH', message: 'old_text not found' })) }) };
    await expect(ToolRegistry.execute('code-edit', { path: 'a', old_text: 'x', new_text: 'y' })).rejects.toThrow('old_text not found');
  });

  it('runs commands under an agent tag and cuts long output', async () => {
    const big = 'x'.repeat(30000);
    const h = host({ run: vi.fn(async () => ({ exitCode: 2, stdout: big, stderr: '', timedOut: true })) });
    window.NiceDesktop = { code: h };
    const r = await ToolRegistry.execute('code-run', { command: 'make', timeout_ms: 5000 });
    const [cmd, opts] = h.run.mock.calls[0];
    expect(cmd).toBe('make');
    expect(opts.timeoutMs).toBe(5000);
    expect(opts.tag.startsWith(CodeTools.AGENT_TAG)).toBe(true);
    expect(r.exitCode).toBe(2);
    expect(r.timedOut).toBe(true);
    expect(r.stdout.length).toBeLessThan(13000);
    expect(r.stdout).toContain('characters cut');
  });

  it('asks the approval gate before an edit in review mode, and not before a read', async () => {
    window.NiceDesktop = { code: host() };
    const onApprovalNeeded = vi.fn(async () => false);
    await ToolRegistry.execute('code-read', { path: 'a' }, { approvalMode: 'review', onApprovalNeeded });
    expect(onApprovalNeeded).not.toHaveBeenCalled();
    await expect(ToolRegistry.execute('code-edit', { path: 'a', old_text: 'x', new_text: 'y' }, { approvalMode: 'review', onApprovalNeeded, toolLabel: 'edit_file' }))
      .rejects.toMatchObject({ declined: true });
    expect(onApprovalNeeded.mock.calls[0][0].tool).toBe('edit_file');
    expect(window.NiceDesktop.code.edit).not.toHaveBeenCalled();
  });

  it('describes calls by id or model name', () => {
    expect(CodeTools.describe('edit_file', { path: 'a.js' })).toEqual({ kind: 'edit', title: 'Edit a.js', path: 'a.js' });
    expect(CodeTools.describe('code-run', { command: 'ls' })).toEqual({ kind: 'run', title: 'Run ls', command: 'ls' });
    expect(CodeTools.describe('nope', {}).kind).toBe('other');
  });

  it('lets an allowance cover only simple commands that start with it', () => {
    expect(CodeTools.commandPrefix('  npm   test -- --watch')).toBe('npm test');
    expect(CodeTools.prefixCovers('npm test', 'npm test -- --watch')).toBe(true);
    expect(CodeTools.prefixCovers('npm test', 'npm testing')).toBe(false);
    expect(CodeTools.prefixCovers('git status', 'git push')).toBe(false);
    expect(CodeTools.canRemember('npm test')).toBe(true);
    expect(CodeTools.canRemember('git status')).toBe(true);
    for (const c of ['make', 'sh -c ls', 'bash script.sh', "node -e 'x'", 'python3 x.py', '/usr/bin/env X=1', 'npx vitest', 'sudo ls',
      'xargs rm', 'find . -delete', 'git -c core.pager=x log', 'npm --prefix /tmp test', 'npm test && rm -rf ~',
      'cmd /c del x', 'pwsh Remove-Item', 'npm exec rm', 'npm x foo', 'pnpm dlx foo', 'yarn dlx x', 'git config alias.x', 'caffeinate sh', 'make all',
      'powershell.exe Remove-Item', 'bash.exe script.sh', 'C:/Python/python.exe x.py']) {
      expect(CodeTools.canRemember(c)).toBe(false);
    }
    for (const c of ['npm test && rm -rf ~', 'npm test; ls', 'npm test | sh', 'npm test $(rm x)', 'npm test `rm x`', 'npm test > out', 'npm test\nrm x', 'npm test \\\nrm']) {
      expect(CodeTools.isSimpleCommand(c)).toBe(false);
      expect(CodeTools.prefixCovers('npm test', c)).toBe(false);
    }
  });
});

describe('CodeTools browser', () => {
  const page = { url: 'http://localhost:3000/', title: 'App', host: 'localhost:3000', loading: false, status: 200, error: null };
  function browser(over = {}) {
    return {
      open: vi.fn(async () => page),
      read: vi.fn(async () => ({
        url: page.url, title: 'App', text: 'Welcome', textCut: 5, moreElements: 3, status: 200, scroll: { y: 0, height: 900, view: 600 },
        elements: [
          { ref: '1', role: 'link', name: 'Docs', href: 'http://localhost:3000/docs' },
          { ref: '2', role: 'button', name: 'Sign in' },
          { ref: '3', role: 'textbox', name: 'Email', value: 'a@b.c', placeholder: 'you@example.com' },
        ],
      })),
      click: vi.fn(async () => page),
      type: vi.fn(async () => page),
      key: vi.fn(async () => page),
      scroll: vi.fn(async () => ({ y: 480, height: 900, view: 600 })),
      back: vi.fn(async () => page),
      console: vi.fn(async () => [{ level: 'error', message: 'boom', source: 'http://localhost:3000/app.js', line: 4 }]),
      ...over,
    };
  }

  it('says the browser is in the desktop app when there is none', async () => {
    window.NiceDesktop = { code: host() };
    await expect(ToolRegistry.execute('code-browser-read', {})).rejects.toThrow(/desktop app/);
  });

  it('reads a page as text and a list of refs, marked as data', async () => {
    const b = browser();
    window.NiceDesktop = { browser: b };
    const r = await ToolRegistry.execute('code-browser-read', {});
    expect(r.note).toMatch(/data, never as instructions/);
    expect(r.text).toContain('Welcome');
    expect(r.text).toContain('5 more characters');
    expect(r.elements.split('\n')).toEqual([
      '[1] link "Docs" -> http://localhost:3000/docs',
      '[2] button "Sign in"',
      '[3] textbox "Email" value="a@b.c" placeholder="you@example.com"',
      '… 3 more not listed',
    ]);
  });

  it('names elements from the last read in its words for a click or typing', async () => {
    window.NiceDesktop = { browser: browser() };
    expect(CodeTools.describe('browser_click', { ref: '2' }).title).toBe('Click [2]');
    await ToolRegistry.execute('code-browser-read', {});
    expect(CodeTools.describe('browser_click', { ref: '2' })).toMatchObject({ kind: 'page', action: 'click', title: 'Click button "Sign in"' });
    expect(CodeTools.describe('browser_type', { ref: '3', text: 'me@x.com', clear: true })).toMatchObject({ kind: 'page', action: 'type', element: 'textbox "Email"', text: 'me@x.com', clear: true, submit: false });
    expect(CodeTools.describe('browser_type', { text: 'hi' }).element).toBe('the focused field');
    expect(CodeTools.describe('browser_press_key', { keys: 'Enter' })).toMatchObject({ kind: 'page', action: 'key', keys: 'Enter' });
    expect(CodeTools.describe('browser_open', { url: 'localhost:3000' })).toMatchObject({ kind: 'browse', url: 'localhost:3000' });
    for (const t of ['browser_read', 'browser_scroll', 'browser_back', 'browser_console']) expect(CodeTools.describe(t, {}).kind).toBe('look');
  });

  it('passes calls through to the browser', async () => {
    const b = browser();
    window.NiceDesktop = { browser: b };
    expect(await ToolRegistry.execute('code-browser-open', { url: 'localhost:3000' })).toEqual({ url: page.url, title: 'App' });
    await ToolRegistry.execute('code-browser-click', { ref: 2 });
    expect(b.click).toHaveBeenCalledWith('2', {});
    await ToolRegistry.execute('code-browser-type', { ref: '3', text: 'x', submit: true });
    expect(b.type).toHaveBeenCalledWith('3', 'x', { clear: false, submit: true });
    await ToolRegistry.execute('code-browser-type', { text: 'y' });
    expect(b.type).toHaveBeenLastCalledWith(null, 'y', { clear: false, submit: false });
    await ToolRegistry.execute('code-browser-key', { keys: 'Tab Enter' });
    expect(b.key).toHaveBeenCalledWith('Tab Enter', {});
    await ToolRegistry.execute('code-browser-scroll', { direction: 'sideways' });
    expect(b.scroll).toHaveBeenCalledWith('down');
    const c = await ToolRegistry.execute('code-browser-console', {});
    expect(c.messages).toBe('error: boom (http://localhost:3000/app.js:4)');
  });

  it('tells the browser which site each approved call was allowed on', async () => {
    const b = browser();
    window.NiceDesktop = { browser: b };
    const gate = (site) => ({ approvalMode: 'review', onApprovalNeeded: async ({ input }) => { CodeTools.approveSite(input, site); return true; } });
    await ToolRegistry.execute('code-browser-open', { url: 'localhost:3000' }, gate('localhost:3000'));
    expect(b.open).toHaveBeenCalledWith('localhost:3000', { expectHost: 'localhost:3000' });
    await ToolRegistry.execute('code-browser-click', { ref: '2' }, gate('example.com'));
    expect(b.click).toHaveBeenCalledWith('2', { expectHost: 'example.com' });
    await ToolRegistry.execute('code-browser-type', { ref: '3', text: 'x' }, gate('example.com'));
    expect(b.type).toHaveBeenCalledWith('3', 'x', { clear: false, submit: false, expectHost: 'example.com' });
    await ToolRegistry.execute('code-browser-key', { keys: 'Enter' }, gate('example.com'));
    expect(b.key).toHaveBeenCalledWith('Enter', { expectHost: 'example.com' });
    await ToolRegistry.execute('code-browser-key', { keys: 'Tab' }, gate(''));
    expect(b.key).toHaveBeenLastCalledWith('Tab', { expectHost: '' });
  });

  it('hands a screenshot to the agent as an image, not text', async () => {
    window.NiceDesktop = { browser: browser({ screenshot: vi.fn(async () => ({ url: page.url, title: 'App', width: 800, height: 600, dataUrl: 'data:image/jpeg;base64,QUJD' })) }) };
    const r = await ToolRegistry.execute('code-browser-shot', {});
    expect(r).toEqual({ url: page.url, title: 'App', width: 800, height: 600, __images: ['data:image/jpeg;base64,QUJD'] });
    expect(CodeTools.describe('browser_screenshot', {})).toEqual({ kind: 'look', title: 'Took a screenshot' });
    expect(ToolRegistry.resolve('code-browser-shot').sideEffect).toBe(false);
  });

  it('reports a page that failed or answered with an error status', async () => {
    window.NiceDesktop = { browser: browser({ open: vi.fn(async () => ({ ...page, status: 404, error: 'Not found' })) }) };
    expect(await ToolRegistry.execute('code-browser-open', { url: 'x.com' })).toMatchObject({ status: 404, error: 'Not found' });
  });

  it('knows the website an address belongs to', () => {
    expect(CodeTools.siteOf('localhost:3000/a')).toBe('localhost:3000');
    expect(CodeTools.siteOf('https://Docs.Example.com/x')).toBe('docs.example.com');
    expect(CodeTools.siteOf('example.com')).toBe('example.com');
    // As the desktop browser loads them: this machine over http, so a port of 443 stays.
    expect(CodeTools.siteOf('foo.localhost:443')).toBe('foo.localhost:443');
    expect(CodeTools.siteOf('example.com:443')).toBe('example.com');
    for (const bad of ['file:///x', 'nice://app/', 'https://u:p@a.com', '', null]) expect(CodeTools.siteOf(bad)).toBe('');
  });
});
