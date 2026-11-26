/**
 * NICE Desktop — Electron Main Process
 * Lightweight wrapper loading the NICE web app locally.
 */

const { app, BrowserWindow, Tray, Menu, Notification, nativeImage, protocol, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const AppProtocol = require('./app-protocol');

// The repo root: nice://app/app/… and nice://app/public/… are served from here.
const ROOT = path.join(__dirname, '..');

// Must run before the app is ready: nice:// behaves like https (a real
// origin for storage, fetch and the CSP) instead of an opaque file page.
protocol.registerSchemesAsPrivileged([
  { scheme: AppProtocol.SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const SITE_ORIGIN = 'https://nicespaceship.ai';
const APP_PAGE = AppProtocol.ORIGIN + '/app/';
// Links NICE opens in the user's own apps: the web, mail and phone.
const EXTERNAL = /^(https?|mailto|tel):/i;

// Only NICE's own page, its main frame, gets a permission, and only these:
// the microphone (dictation), notifications, and writing to the clipboard.
function _allowed(permission, { url, isMainFrame, mediaTypes } = {}) {
  if (!isMainFrame || !String(url || '').startsWith(APP_PAGE)) return false;
  if (permission === 'media') return Array.isArray(mediaTypes) && mediaTypes.length > 0 && mediaTypes.every(t => t === 'audio');
  return permission === 'notifications' || permission === 'clipboard-sanitized-write';
}

function serveApp() {
  protocol.handle(AppProtocol.SCHEME, async (request) => {
    const url = new URL(request.url);
    // nice://app/ itself (where location.href = '/' lands) is the app.
    if (url.host === AppProtocol.HOST && (url.pathname === '/' || url.pathname === '')) {
      return new Response(null, { status: 302, headers: { location: APP_PAGE, 'content-security-policy': AppProtocol.CSP } });
    }
    const hit = AppProtocol.resolveAppRequest(request.url, ROOT);
    const notFound = () => new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'content-security-policy': AppProtocol.CSP } });
    if (!hit) return notFound();
    try {
      const body = await fs.promises.readFile(hit.file);
      const csp = hit.isDocument ? AppProtocol.cspFor(body.toString('utf8')) : AppProtocol.CSP;
      return new Response(body, { headers: { 'content-type': hit.mime, 'x-content-type-options': 'nosniff', 'content-security-policy': csp } });
    } catch {
      return notFound();
    }
  });

  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(_allowed(permission, { url: details && details.requestingUrl, isMainFrame: details && details.isMainFrame, mediaTypes: details && details.mediaTypes }));
  });
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin, details) => {
    const url = (details && (details.requestingUrl || details.embeddingOrigin)) || requestingOrigin;
    const mediaTypes = details && details.mediaType ? [details.mediaType] : undefined;
    return _allowed(permission, { url: String(url || '').startsWith(AppProtocol.ORIGIN) ? APP_PAGE : url, isMainFrame: !details || details.isMainFrame !== false, mediaTypes });
  });

  // NICE's edge functions allow the website's origin by name. The desktop
  // page's origin is nice://app, so answer for it the same way, only on
  // NICE's own API hosts. A page in the preview frame gains nothing: its
  // own origin still does not match.
  ses.webRequest.onHeadersReceived({ urls: AppProtocol.API_HOSTS.map(h => 'https://' + h + '/*') }, (details, callback) => {
    const headers = details.responseHeaders || {};
    const key = Object.keys(headers).find(k => k.toLowerCase() === 'access-control-allow-origin');
    if (key && headers[key] && headers[key][0] === SITE_ORIGIN) headers[key] = [AppProtocol.ORIGIN];
    callback({ responseHeaders: headers });
  });
}

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
      sandbox: true,
      additionalArguments: ['--nice-version=' + require('./package.json').version],
    },
    titleBarStyle: 'hiddenInset', // macOS native title bar
    show: false,
  });

  // Load NICE through nice:// (see app-protocol.js)
  // /app/ (not /app/index.html): the page's links resolve against <base href="/app/">,
  // so loading /app/ keeps in-app links as hash changes from the first click.
  mainWindow.loadURL(APP_PAGE);

  // The window only ever shows NICE's own pages; web links open in the
  // user's browser.
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(AppProtocol.ORIGIN + '/')) {
      e.preventDefault();
      if (EXTERNAL.test(url)) shell.openExternal(url);
    }
  });
  // Only NICE's own page can open windows: the preview frame has no
  // allow-popups and agent HTML no permissions at all.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (EXTERNAL.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

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
  // Sanitize hash to prevent JS injection via executeJavaScript
  const safeHash = hash.replace(/[^#/\w-]/g, '');
  mainWindow.webContents.executeJavaScript(`window.location.hash = ${JSON.stringify(safeHash)};`);
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
  serveApp();
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
