/**
 * NICE Desktop — Electron Main Process
 * Lightweight wrapper loading the NICE web app locally.
 */

const { app, BrowserWindow, Tray, Menu, Notification, nativeImage, protocol, session, shell, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const AppProtocol = require('./app-protocol');
const { Workspace, serializeError, runTag } = require('./code-host');

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

  // Commands started by a page stop when that page goes away: a reload, a
  // crash or the window closing. The open folder stays open. A link to
  // another site also starts a navigation, but will-navigate cancels it and
  // the page stays, so its commands keep running.
  const contents = mainWindow.webContents;
  const contentsId = contents.id;
  AppProtocol.stopWhenPageGoes(contents, () => { const ws = workspaces.get(contentsId); if (ws) ws.killAll(); });

  // Show when ready (prevents white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    const ws = workspaces.get(contentsId);
    if (ws) _retire(ws);
    workspaces.delete(contentsId);
    mainWindow = null;
  });
}

/* ── Code bridge ──
   One workspace per window, opened only through the native folder dialog.
   Each call answers { ok, value } or { ok:false, error:{ code, message } },
   and only NICE's own page (the main frame on nice://app/app/) may call. */
const workspaces = new Map();
// Workspaces no window holds any more whose processes are still being
// stopped, so quitting can still kill them.
const retired = new Set();

function _retire(ws) {
  ws.killAll();
  for (const r of retired) if (!r.busy) retired.delete(r);
  if (ws.busy) retired.add(ws);
}

// The SIGKILL that follows a SIGTERM runs on a timer, which dies with the
// app: on quit every process group gets SIGKILL at once instead.
function _killEverything() {
  for (const ws of [...workspaces.values(), ...retired]) ws.killAll({ hard: true });
}

function _fromApp(event) {
  const frame = event.senderFrame;
  return !!frame && frame === event.sender.mainFrame && AppProtocol.isAppPage(frame.url);
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!_fromApp(event)) return { ok: false, error: { code: 'EFORBIDDEN', message: 'Not allowed from this page.' } };
    try {
      return { ok: true, value: await fn(event, ...args) };
    } catch (e) {
      return { ok: false, error: serializeError(e) };
    }
  });
}

function _workspace(event) {
  const ws = workspaces.get(event.sender.id);
  if (!ws) throw Object.assign(new Error('No folder is open. Open one first.'), { code: 'ENOWORKSPACE' });
  return ws;
}

const _describe = (ws) => ws ? { root: ws.root, name: path.basename(ws.root) || ws.root } : null;

handle('code:open-folder', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const pick = await dialog.showOpenDialog(win, { title: 'Open a folder for Code', properties: ['openDirectory', 'createDirectory'] });
  if (pick.canceled || !pick.filePaths[0]) return null;
  const dir = pick.filePaths[0];
  // Judged by the real path: /Volumes/Macintosh HD is the whole disk.
  const broad = await Workspace.isBroad(dir);
  if (broad) {
    const what = { disk: 'your whole disk', home: 'your whole home folder', 'above-home': 'the folder that holds your home folder', volume: 'a whole drive' }[broad] || 'a folder this broad';
    const ok = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Choose another folder', 'Open anyway'],
      defaultId: 0,
      cancelId: 0,
      message: 'Give Code ' + what + '?',
      detail: 'Code can read and change every file inside the folder you open, and run commands there. A project folder is safer.',
    });
    if (ok.response !== 1) return null;
  }
  const ws = await Workspace.open(dir);
  const old = workspaces.get(event.sender.id);
  if (old) _retire(old);
  workspaces.set(event.sender.id, ws);
  return _describe(ws);
});
handle('code:workspace', (event) => _describe(workspaces.get(event.sender.id)));
handle('code:read', (event, p, opts) => _workspace(event).readFile(p, opts || {}));
handle('code:write', (event, p, content, opts) => {
  const o = opts || {};
  return _workspace(event).writeFile(p, content, { overwrite: o.overwrite, lineEndings: o.lineEndings });
});
handle('code:edit', (event, p, oldText, newText, opts) => _workspace(event).editFile(p, oldText, newText, opts || {}));
handle('code:list', (event, p) => _workspace(event).listDir(p || '.'));
handle('code:search', (event, pattern, opts) => _workspace(event).search(pattern, opts || {}));
// Tags the page called off before their run had an id, per page.
const cancelledTags = new Map();
const _cancelled = (sender) => {
  if (!cancelledTags.has(sender.id)) cancelledTags.set(sender.id, new Set());
  return cancelledTags.get(sender.id);
};

handle('code:run', (event, command, opts) => {
  const sender = event.sender;
  const o = opts || {};
  const tag = runTag(o.tag);
  return _workspace(event).run(command, {
    timeoutMs: o.timeoutMs,
    cwd: o.cwd,
    shouldStart: () => !(tag != null && _cancelled(sender).delete(tag)),
    // `tag` comes back on every event so the page can tell its runs apart.
    onData: (d) => { if (!sender.isDestroyed()) sender.send('code:run-data', { ...d, tag }); },
  });
});
handle('code:kill', (event, id) => _workspace(event).kill(id));
handle('code:cancel', (event, tag) => {
  const t = runTag(tag);
  if (t == null) return false;
  const set = _cancelled(event.sender);
  set.add(t);
  if (set.size > 100) set.delete(set.values().next().value);
  return true;
});

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

app.on('before-quit', _killEverything);
app.on('will-quit', _killEverything);

app.on('window-all-closed', () => {
  // Keep running in tray on macOS
  if (process.platform !== 'darwin') app.quit();
});

// Auto-updater placeholder
// const { autoUpdater } = require('electron-updater');
// app.on('ready', () => autoUpdater.checkForUpdatesAndNotify());
