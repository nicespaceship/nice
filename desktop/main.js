/**
 * NICE Desktop — Electron Main Process
 * Lightweight wrapper loading the NICE web app locally.
 */

const { app, BrowserWindow, Tray, Menu, Notification, nativeImage } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'NICE — Mission Control',
    backgroundColor: '#080808',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: 'hiddenInset', // macOS native title bar
    show: false,
  });

  // Load local app
  mainWindow.loadFile(path.join(__dirname, '..', 'app', 'index.html'));

  // Show when ready (prevents white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  // Use a simple 16x16 tray icon (placeholder)
  const iconPath = path.join(__dirname, '..', 'app', 'icons', 'icon-192.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open NICE', click: () => { if (mainWindow) mainWindow.show(); else createWindow(); } },
    { type: 'separator' },
    { label: 'Status: Online', enabled: false },
    { type: 'separator' },
    { label: 'New Agent', click: () => navigateTo('#/blueprints/agents/new') },
    { label: 'Missions', click: () => navigateTo('#/missions') },
    { label: 'Workflows', click: () => navigateTo('#/workflows') },
    { type: 'separator' },
    { label: 'Quit NICE', click: () => app.quit() },
  ]);

  tray.setToolTip('NICE — Mission Control');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.focus() : mainWindow.show();
    } else {
      createWindow();
    }
  });
}

function navigateTo(hash) {
  if (!mainWindow) createWindow();
  mainWindow.show();
  mainWindow.webContents.executeJavaScript(`window.location.hash = '${hash}';`);
}

// Desktop notifications bridge
function showDesktopNotification(title, body) {
  if (Notification.isSupported()) {
    const notif = new Notification({ title, body });
    notif.show();
    notif.on('click', () => {
      if (mainWindow) mainWindow.show();
    });
  }
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Keep running in tray on macOS
  if (process.platform !== 'darwin') app.quit();
});

// Auto-updater placeholder
// const { autoUpdater } = require('electron-updater');
// app.on('ready', () => autoUpdater.checkForUpdatesAndNotify());
