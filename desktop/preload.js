/**
 * NICE Desktop — Preload Script
 * Exposes safe APIs to the renderer process via contextBridge.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('NiceDesktop', {
  // Platform info
  platform: process.platform,
  isDesktop: true,

  // Notification bridge
  notify: (title, body) => {
    ipcRenderer.send('desktop-notify', { title, body });
  },

  // App version
  version: require('./package.json').version,

  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
});
