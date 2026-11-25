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
  throw { code: (r && r.error && r.error.code) || 'EUNKNOWN', message: (r && r.error && r.error.message) || 'Code host error' };
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
    read: (path, opts) => call('code:read', path, opts),
    write: (path, content) => call('code:write', path, content),
    edit: (path, oldText, newText, opts) => call('code:edit', path, oldText, newText, opts),
    list: (path) => call('code:list', path),
    search: (pattern, opts) => call('code:search', pattern, opts),
    run: (command, opts) => call('code:run', command, opts),
    kill: (id) => call('code:kill', id),
    /** Live output of running commands: fn({ id, tag, stream: 'start'|'stdout'|'stderr', data, truncated? }), `tag` as passed to run(). Returns an unsubscribe. */
    onRunData: (fn) => {
      const listener = (_e, d) => fn(d);
      ipcRenderer.on('code:run-data', listener);
      return () => ipcRenderer.removeListener('code:run-data', listener);
    },
  },

  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
});
