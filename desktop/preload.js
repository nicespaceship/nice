/**
 * NICE Desktop — Preload Script
 * Exposes safe APIs to the renderer process via contextBridge.
 */

const { contextBridge, ipcRenderer } = require('electron');

async function call(channel, ...args) {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (r && r.ok) return r.value;
  // A plain object, not an Error: the context bridge copies only an Error's
  // message, and callers need the code (EOUTSIDE, ENOMATCH, ...).
  const e = (r && r.error) || {};
  throw { code: e.code || 'EUNKNOWN', message: e.message || 'Desktop host error', ...(Number.isInteger(e.status) ? { status: e.status } : {}) };
}

contextBridge.exposeInMainWorld('NiceDesktop', {
  // Platform info
  platform: process.platform,
  isDesktop: true,

  // Notification bridge
  notify: (title, body) => {
    ipcRenderer.send('desktop-notify', { title, body });
  },

  // App version (passed in by main.js: a sandboxed preload cannot require files)
  version: (process.argv.find(a => a.startsWith('--nice-version=')) || '').split('=')[1] || '',

  // Code: one folder the user picked, its files and a shell. Every call
  // resolves to its value or rejects with { code, message }.
  code: {
    openFolder: () => call('code:open-folder'),
    recent: () => call('code:recent'),
    openRecent: (id) => call('code:open-recent', id),
    forgetRecent: (id) => call('code:forget-recent', id),
    revealRecent: (id) => call('code:reveal-recent', id),
    workspace: () => call('code:workspace'),
    /** Resolves to { content, lineEndings: 'crlf'|'lf'|'mixed', … }; a CRLF file's content comes back with LF. */
    read: (path, opts) => call('code:read', path, opts),
    /** opts.overwrite replaces an existing file that is not exact UTF-8 text, which is otherwise refused (EENCODING). Over a CRLF file, LF is written as CRLF unless opts.lineEndings is 'keep'. */
    write: (path, content, opts) => call('code:write', path, content, opts),
    edit: (path, oldText, newText, opts) => call('code:edit', path, oldText, newText, opts),
    list: (path) => call('code:list', path),
    search: (pattern, opts) => call('code:search', pattern, opts),
    /** opts.tag, a string or a number (anything else is EINVAL), comes back on every event of this run. */
    run: (command, opts) => call('code:run', command, opts),
    kill: (id) => call('code:kill', id),
    /** Call off a run by its tag before it has an id; it then never starts. */
    cancel: (tag) => call('code:cancel', tag),
    /** Live output of running commands: fn({ id, tag, stream: 'start'|'stdout'|'stderr', data, truncated? }), `tag` as passed to run() as a string of at most 200 characters (or null). Returns an unsubscribe. */
    onRunData: (fn) => {
      const listener = (_e, d) => fn(d);
      ipcRenderer.on('code:run-data', listener);
      return () => ipcRenderer.removeListener('code:run-data', listener);
    },
  },

  // Models on the user's own API keys. The keys stay in the main process:
  // the page learns only which providers have one.
  llm: {
    /** [{ id, label, hasKey }] */
    providers: () => call('llm:providers'),
    /** Checks the key with the provider, then saves it. Resolves to [{ id, label }], the provider's models. */
    setKey: (provider, key) => call('llm:set-key', provider, key),
    clearKey: (provider) => call('llm:clear-key', provider),
    models: (provider) => call('llm:models', provider),
    /** A nice-ai-shaped request with model 'byo:<provider>:<model>'; resolves to a nice-ai-shaped reply. */
    chat: (body) => call('llm:chat', body),
  },

  // Code's browser: one web page per window, shared by the user and the
  // agent, drawn by the desktop app over the spot place() names. The page in
  // it can't reach NICE. Calls resolve to the browser's state,
  // { url, title, host, loading, canGoBack, canGoForward, status, error },
  // unless they say otherwise.
  browser: {
    /** The state, or null before the browser is first used. */
    state: () => call('browser:state'),
    /** Bounds in CSS pixels of NICE's page ({ x, y, width, height }), or null to hide it. */
    place: (bounds) => call('browser:place', bounds),
    /** opts.expectHost: refuse unless the address is on this host:port. */
    open: (url, opts) => call('browser:open', url, opts),
    back: () => call('browser:back'),
    forward: () => call('browser:forward'),
    reload: () => call('browser:reload'),
    stop: () => call('browser:stop'),
    /** { url, title, text, textCut, elements: [{ ref, role, name, href?, value?, placeholder?, checked? }], moreElements, scroll, status } */
    read: () => call('browser:read'),
    /** opts.expectHost here, in type() and in key(): refuse unless the page is on this host:port when the input goes in. */
    click: (ref, opts) => call('browser:click', ref, opts),
    /** Types into the element with this ref (or wherever focus is, for null). opts: { clear, submit, expectHost }. */
    type: (ref, text, opts) => call('browser:type', ref, text, opts),
    /** Space-separated keys: "Enter", "Tab Tab", "ctrl+a". */
    key: (keys, opts) => call('browser:key', keys, opts),
    /** 'up' or 'down'; resolves to { y, height, view }. */
    scroll: (direction) => call('browser:scroll', direction),
    /** The visible page: { url, title, width, height, dataUrl } (a JPEG data URL). */
    screenshot: () => call('browser:screenshot'),
    /** [{ level, message, source, line }], the page's console since it loaded. */
    console: () => call('browser:console'),
    /** fn(state) on every change. Returns an unsubscribe. */
    onState: (fn) => {
      const listener = (_e, s) => fn(s);
      ipcRenderer.on('browser:state', listener);
      return () => ipcRenderer.removeListener('browser:state', listener);
    },
  },

  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
});
