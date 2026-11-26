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
afterEach(() => { delete window.NiceDesktop; });

describe('CodeTools', () => {
  it('registers its six tools once, with edits, writes and commands as side effects', () => {
    expect(CodeTools.register()).toBe(true);
    expect(CodeTools.IDS).toEqual(['code-read', 'code-list', 'code-search', 'code-edit', 'code-write', 'code-run']);
    const side = CodeTools.IDS.filter(id => ToolRegistry.resolve(id).sideEffect);
    expect(side).toEqual(['code-edit', 'code-write', 'code-run']);
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
