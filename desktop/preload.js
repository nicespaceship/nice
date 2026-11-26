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

  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
});
