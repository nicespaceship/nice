/**
 * NICE Desktop — Code's browser
 *
 * One web page per window that the Code agent and the user share: the user
 * sees it in the Browser tab of Code's panel, and the agent opens, reads and
 * acts on it through NiceDesktop.browser. It is an Electron WebContentsView
 * owned by this process, laid over the spot the page reserves for it.
 *
 * The page it shows is any website, so it is kept apart from NICE:
 *  - its own session (cookies, storage, cache), never NICE's;
 *  - no preload, sandboxed, no Node, so it cannot reach NiceDesktop;
 *  - http and https only: it cannot open nice://, file:, or anything else;
 *  - no permissions (camera, location, notifications, ...), no Bluetooth,
 *    USB, HID or serial device choosers, and no downloads;
 *  - new windows open in the same view instead.
 * The scripts that read and point at the page run in an isolated world, so
 * the site's own scripts cannot see or change them.
 *
 * Opening, clicking, typing and keys can carry the site (host:port) the user
 * approved them for, and are refused when the page is on another one by the
 * time they run. A click lands only when the element it is for is what sits
 * at that point, never an overlay or a frame on top of it.
 *
 * Its session persists, so sites stay signed in between runs of the app.
 */

const PARTITION = 'persist:nice-code-browser';
const WORLD_ID = 1717;                 // the isolated world NICE's reading scripts run in, inside the web page
const LOAD_TIMEOUT_MS = 30000;
const SCRIPT_TIMEOUT_MS = 10000;
const SETTLE_MS = 400;                 // after a click or key, how long to look for a navigation
const TEXT_MAX = 20000;                // characters of page text the agent gets per read
const ELEMENTS_MAX = 250;              // interactive elements listed per read
const CONSOLE_MAX = 200;
const DEFAULT_SIZE = { width: 1024, height: 768 };
const SHOW_WAIT_MS = 3000;             // how long input waits for the browser's first showing

// Addresses typed without a scheme that load over http: this machine.
// CodeTools.siteOf keeps the same rule, so a site is approved by the host
// it loads as.
const LOCAL_HOST = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|[a-z0-9-]+\.localhost)(:\d+)?$/i;

const _err = (code, message) => Object.assign(new Error(message), { code });

/** True for an http or https URL. */
function isWebUrl(url) {
  try { const u = new URL(String(url)); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}

/**
 * What the user or the agent typed, as a URL to load, or null.
 * "localhost:3000" becomes http://localhost:3000/, "example.com/docs"
 * https://example.com/docs. Only http and https, and never a URL with a
 * user name or password in it.
 */
function normalizeUrl(raw) {
  let s = String(raw == null ? '' : raw).trim();
  if (!s || /\s/.test(s)) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    const hostPart = s.split(/[/?#]/)[0];
    if (LOCAL_HOST.test(hostPart)) s = 'http://' + s;
    else if (/^[^/?#]+\.[a-z]{2,}(:\d+)?$/i.test(hostPart) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(hostPart)) s = 'https://' + s;
    else return null;
  }
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password || !u.hostname) return null;
  return u.href;
}

/** The host (with any port) of a web URL, or ''. */
function hostOf(url) {
  try { const u = new URL(String(url)); return (u.protocol === 'http:' || u.protocol === 'https:') ? u.host : ''; } catch { return ''; }
}

const KEY_NAMES = {
  enter: 'Enter', return: 'Enter', tab: 'Tab', escape: 'Escape', esc: 'Escape', backspace: 'Backspace',
  delete: 'Delete', space: 'Space', up: 'Up', down: 'Down', left: 'Left', right: 'Right',
  arrowup: 'Up', arrowdown: 'Down', arrowleft: 'Left', arrowright: 'Right',
  home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown',
};
// For the DevTools protocol's key events: the DOM key name, the Windows
// virtual key code Chromium matches on, and the modifier bits.
const CDP_KEYS = {
  Enter: ['Enter', 13], Tab: ['Tab', 9], Escape: ['Escape', 27], Backspace: ['Backspace', 8], Delete: ['Delete', 46],
  Space: [' ', 32], Up: ['ArrowUp', 38], Down: ['ArrowDown', 40], Left: ['ArrowLeft', 37], Right: ['ArrowRight', 39],
  Home: ['Home', 36], End: ['End', 35], PageUp: ['PageUp', 33], PageDown: ['PageDown', 34],
};
const CDP_MODIFIER_BITS = { alt: 1, control: 2, meta: 4, shift: 8 };

/** A parseKey result as { key, code, windowsVirtualKeyCode, modifiers, text } for Input.dispatchKeyEvent. */
function cdpKey(k) {
  let key, vk;
  if (CDP_KEYS[k.keyCode]) [key, vk] = CDP_KEYS[k.keyCode];
  else if (/^F\d+$/.test(k.keyCode)) { key = k.keyCode; vk = 111 + Number(k.keyCode.slice(1)); }
  else { key = k.keyCode; vk = k.keyCode.toUpperCase().charCodeAt(0); }
  const mods = k.modifiers.reduce((n, m) => n | (CDP_MODIFIER_BITS[m] || 0), 0);
  const code = /^[a-z]$/i.test(key) ? 'Key' + key.toUpperCase() : /^\d$/.test(key) ? 'Digit' + key : key === ' ' ? 'Space' : key;
  return { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mods, text: k.char || undefined };
}

const MODIFIERS = { ctrl: 'control', control: 'control', shift: 'shift', alt: 'alt', option: 'alt', cmd: 'meta', command: 'meta', meta: 'meta', super: 'meta' };

/**
 * "Enter", "ctrl+a", "Shift+Tab" → { keyCode, modifiers, char } for
 * webContents.sendInputEvent, or null for something it does not know.
 * `char` is the text a key types (a letter, a space, Enter's \r), sent as a
 * char event so forms submit and fields fill as if typed.
 */
function parseKey(spec) {
  const parts = String(spec || '').trim().split('+').map(p => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const modifiers = [];
  for (const p of parts.slice(0, -1)) {
    const m = MODIFIERS[p.toLowerCase()];
    if (!m) return null;
    if (!modifiers.includes(m)) modifiers.push(m);
  }
  const last = parts[parts.length - 1];
  const named = KEY_NAMES[last.toLowerCase()];
  const fn = /^f([1-9]|1[0-2])$/i.test(last) ? last.toUpperCase() : null;
  let keyCode, char = null;
  if (named) { keyCode = named; char = named === 'Enter' ? '\r' : named === 'Space' ? ' ' : null; }
  else if (fn) keyCode = fn;
  else if (last.length === 1) { keyCode = last; char = last; }
  else return null;
  // A shortcut (ctrl+a) types nothing; shift alone still types its key.
  if (modifiers.some(m => m !== 'shift')) char = null;
  return { keyCode, modifiers, char };
}

/* ── Scripts run in the page's isolated world ──
   Written as functions so tests can run them in jsdom; the host sends their
   source. Refs live in a Map in the isolated world: the page's scripts
   cannot see it, and a new document starts it empty. */

function pageSnapshot(opts) {
  const o = opts || {};
  const W = window;
  if (!W.__niceRefs || W.__niceRefsDoc !== document) { W.__niceRefs = new Map(); W.__niceRefsDoc = document; W.__niceRefSeq = 0; W.__niceRefOf = new WeakMap(); }
  const refs = W.__niceRefs;
  const SEL = 'a[href], button, input, select, textarea, summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="combobox"], [role="textbox"], [contenteditable=""], [contenteditable="true"], [onclick], [tabindex]:not([tabindex="-1"])';
  const editable = (el) => !!el.isContentEditable || ['', 'true', 'plaintext-only'].includes(el.getAttribute('contenteditable'));
  const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 && r.height <= 0 && el.getClientRects().length === 0) return false;
    const cs = W.getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const labelOf = (el) => {
    const aria = el.getAttribute('aria-label');
    if (aria) return aria;
    const by = el.getAttribute('aria-labelledby');
    if (by) { const t = by.split(/\s+/).map(id => { const x = document.getElementById(id); return x ? x.textContent : ''; }).join(' '); if (t.trim()) return t; }
    if (el.labels && el.labels.length) return el.labels[0].textContent;
    if (el.tagName === 'INPUT' && /^(submit|button|reset)$/i.test(el.type)) return el.value;
    const img = el.querySelector('img[alt]');
    if (img && !el.textContent.trim()) return img.getAttribute('alt');
    return el.textContent || el.getAttribute('title') || el.getAttribute('placeholder') || el.getAttribute('name') || '';
  };
  const roleOf = (el) => {
    const r = el.getAttribute('role');
    if (r) return r;
    const t = el.tagName.toLowerCase();
    if (t === 'a') return 'link';
    if (t === 'input') { const ty = (el.type || 'text').toLowerCase(); return ty === 'checkbox' || ty === 'radio' ? ty : /^(submit|button|reset|image)$/.test(ty) ? 'button' : 'textbox'; }
    if (t === 'textarea') return 'textbox';
    if (t === 'select') return 'combobox';
    if (t === 'summary') return 'button';
    if (editable(el)) return 'textbox';
    return t === 'button' ? 'button' : 'clickable';
  };
  const elements = [];
  let more = 0;
  for (const el of document.querySelectorAll(SEL)) {
    if (el.disabled || !visible(el)) continue;
    if (elements.length >= (o.elementsMax || 250)) { more++; continue; }
    let ref = W.__niceRefOf.get(el);
    if (!ref) { ref = String(++W.__niceRefSeq); W.__niceRefOf.set(el, ref); refs.set(ref, el); }
    const role = roleOf(el);
    const item = { ref, role, name: clip(labelOf(el), 80) };
    if (role === 'link') item.href = clip(el.href, 200);
    if (role === 'textbox' || role === 'combobox') {
      const v = editable(el) ? el.textContent : el.value;
      if (v) item.value = clip(el.type === 'password' ? '••••' : v, 80);
      if (el.getAttribute('placeholder')) item.placeholder = clip(el.getAttribute('placeholder'), 60);
    }
    if (role === 'checkbox' || role === 'radio') item.checked = !!el.checked || el.getAttribute('aria-checked') === 'true';
    elements.push(item);
  }
  const body = document.body;
  let text = body ? (body.innerText || body.textContent || '') : '';
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const max = o.textMax || 20000;
  const cut = text.length > max;
  return {
    url: location.href, title: document.title,
    text: cut ? text.slice(0, max) : text, textCut: cut ? text.length - max : 0,
    elements, moreElements: more,
    scroll: { y: Math.round(W.scrollY), height: Math.round(document.documentElement.scrollHeight), view: Math.round(W.innerHeight) },
  };
}

// Finds a ref from the last read, scrolls it into view and says where its
// middle is, for a click. `focus` also focuses it; `select` selects what it
// holds, so typed text replaces it.
function pageLocate(args) {
  const W = window;
  const refs = (W.__niceRefsDoc === document && W.__niceRefs) || null;
  const el = refs && refs.get(String(args.ref));
  if (!el) return { error: 'ENOREF' };
  if (!el.isConnected) return { error: 'EGONE' };
  el.scrollIntoView({ block: 'center', inline: 'center' });
  const r = el.getBoundingClientRect();
  if (args.hitTest) {
    // What a click at the middle would land on. It counts when that is the
    // element, something inside it, or a label for it.
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    const ok = hit && (hit === el || el.contains(hit) || (hit.closest && hit.closest('label') && hit.closest('label').control === el));
    if (!ok) {
      const what = !hit ? 'nothing' : hit.tagName === 'IFRAME' ? 'a frame from another page' : (hit.getAttribute('aria-label') || (hit.textContent || '').trim() || hit.tagName.toLowerCase()).replace(/\s+/g, ' ').slice(0, 60);
      return { error: 'EOBSCURED', by: what };
    }
  }
  if (args.focus && typeof el.focus === 'function') el.focus();
  if (args.select) {
    if (typeof el.select === 'function') el.select();
    else if (el.isContentEditable) { const range = document.createRange(); range.selectNodeContents(el); const s = W.getSelection(); s.removeAllRanges(); s.addRange(range); }
  }
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: r.width, h: r.height, vw: W.innerWidth, vh: W.innerHeight };
}

function pageScroll(args) {
  const W = window;
  const dy = (args.direction === 'up' ? -1 : 1) * Math.round(W.innerHeight * 0.8);
  W.scrollBy(0, dy);
  return { y: Math.round(W.scrollY), height: Math.round(document.documentElement.scrollHeight), view: Math.round(W.innerHeight) };
}

const _script = (fn, arg) => '(' + fn.toString() + ')(' + JSON.stringify(arg || {}) + ')';

function _withTimeout(promise, ms, what) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, reject) => { t = setTimeout(() => reject(_err('ETIMEDOUT', what + ' took too long. The page may be showing a dialog or still loading.')), ms); }),
  ]).finally(() => clearTimeout(t));
}

const _sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Clamps bounds the page sends: whole, non-negative pixels, or null. */
function cleanBounds(b, zoom) {
  if (!b || typeof b !== 'object') return null;
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const n = (v) => Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v) * z)) : NaN;
  const out = { x: n(b.x), y: n(b.y), width: n(b.width), height: n(b.height) };
  if (Object.values(out).some(Number.isNaN) || out.width < 1 || out.height < 1) return null;
  return out;
}

let _sessionReady = null;
function _guestSession(session) {
  if (_sessionReady) return _sessionReady;
  const ses = session.fromPartition(PARTITION);
  ses.setPermissionRequestHandler((wc, permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  if (typeof ses.setDevicePermissionHandler === 'function') ses.setDevicePermissionHandler(() => false);
  ses.on('will-download', (e, item) => { e.preventDefault(); try { item.cancel(); } catch {} });
  // Device choosers answer "none chosen".
  ses.on('select-hid-device', (e, details, callback) => { e.preventDefault(); callback(null); });
  ses.on('select-usb-device', (e, details, callback) => { e.preventDefault(); callback(); });
  ses.on('select-serial-port', (e, ports, wc, callback) => { e.preventDefault(); callback(''); });
  _sessionReady = ses;
  return ses;
}

/**
 * The browser for one window. `win` is its BrowserWindow, `notify(state)`
 * tells the page what changed; Electron's WebContentsView and session come
 * in so tests can stand in for them.
 */
function createBrowser({ win, WebContentsView, session, notify, zoom }) {
  let view = null;
  let shown = false;
  let lastBounds = null;
  let lastStatus = null;
  let lastError = null;
  const consoleLines = [];
  let destroyed = false;
  let everShown = false;           // a view takes input only once it has been on screen

  const wc = () => view && view.webContents;

  function state() {
    const c = wc();
    if (!c || c.isDestroyed()) return { url: '', title: '', host: '', loading: false, canGoBack: false, canGoForward: false, status: null, error: null };
    const url = c.getURL();
    const h = c.navigationHistory || c;
    return {
      url: isWebUrl(url) ? url : '',
      title: c.getTitle(),
      host: hostOf(url),
      loading: c.isLoading(),
      canGoBack: typeof h.canGoBack === 'function' ? h.canGoBack() : false,
      canGoForward: typeof h.canGoForward === 'function' ? h.canGoForward() : false,
      status: lastStatus,
      error: lastError,
    };
  }

  const _tell = () => { if (!destroyed) notify(state()); };

  function ensure() {
    if (destroyed) throw _err('EGONE', 'The browser closed.');
    if (view && !view.webContents.isDestroyed()) return view;
    // A view whose page crashed for good is replaced, not stacked under the new one.
    if (view) { try { win.contentView.removeChildView(view); } catch {} }
    everShown = false;
    view = new WebContentsView({
      webPreferences: {
        session: _guestSession(session),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        backgroundThrottling: false,
        safeDialogs: true,
        spellcheck: false,
        webviewTag: false,
        // No device APIs at all: on macOS a page starting a Bluetooth scan
        // aborts the whole app when the build has no Bluetooth usage string.
        disableBlinkFeatures: 'WebBluetooth,WebUSB,WebHID,Serial',
      },
    });
    const c = view.webContents;
    const guard = (e, url) => { if (!isWebUrl(url)) e.preventDefault(); };
    c.on('will-navigate', (e, url) => guard(e, (e && e.url) || url));
    c.on('will-redirect', (e, url) => guard(e, (e && e.url) || url));
    c.on('will-frame-navigate', (e) => { if (e && e.url && !isWebUrl(e.url) && !/^(about:|data:|blob:)/.test(e.url)) e.preventDefault(); });
    c.setWindowOpenHandler(({ url }) => {
      if (isWebUrl(url)) setImmediate(() => { if (!c.isDestroyed()) c.loadURL(url).catch(() => {}); });
      return { action: 'deny' };
    });
    c.on('will-attach-webview', (e) => e.preventDefault());
    c.on('did-start-navigation', (details) => {
      if (details && details.isMainFrame && !details.isSameDocument) { lastError = null; consoleLines.length = 0; }
    });
    c.on('did-navigate', (e, url, code) => { lastStatus = Number.isInteger(code) ? code : null; _tell(); });
    c.on('did-fail-load', (e, code, desc, url, isMainFrame) => {
      if (isMainFrame && code !== -3) { lastError = desc || 'The page did not load.'; _tell(); }
    });
    ['did-navigate-in-page', 'page-title-updated', 'did-start-loading', 'did-stop-loading'].forEach(ev => c.on(ev, _tell));
    c.on('render-process-gone', () => { lastError = 'The page crashed.'; _tell(); });
    c.on('console-message', (e, level, message, line, sourceId) => {
      const m = (e && e.message) || message;
      const lv = (e && e.level) || ['debug', 'info', 'warning', 'error'][level] || 'info';
      consoleLines.push({ level: lv, message: String(m).slice(0, 2000), source: String((e && e.sourceId) || sourceId || '').slice(0, 300), line: (e && e.lineNumber) || line || 0 });
      if (consoleLines.length > CONSOLE_MAX) consoleLines.shift();
    });
    // Without a listener Electron picks the first Bluetooth device on its
    // own; with one that answers '', the page's request fails.
    c.on('select-bluetooth-device', (e, devices, callback) => { e.preventDefault(); callback(''); });
    win.contentView.addChildView(view);
    view.setBounds({ x: 0, y: 0, ...DEFAULT_SIZE });
    view.setVisible(false);
    return view;
  }

  // Hidden, the page keeps the size it was last shown at, and still takes
  // input, so the agent can click on it while the user looks at another
  // tab. A view that has never been shown takes no input, though, so
  // clicks, typing and keys wait for the first showing (the Code view
  // brings the Browser tab up whenever the agent opens or acts on a page).
  function _park() {
    view.setVisible(false);
  }

  async function _whenShownOnce() {
    const start = Date.now();
    while (!everShown && !destroyed && Date.now() - start < SHOW_WAIT_MS) await _sleep(40);
    if (!everShown) throw _err('EHIDDEN', 'The browser has not been on screen yet, so it cannot take clicks or typing. Open the Browser tab in Code\'s panel and try again.');
  }

  /** Where the page wants the browser drawn, in CSS pixels, or null to hide it. */
  function place(bounds) {
    const b = cleanBounds(bounds, zoom ? zoom() : 1);
    if (!b) {
      shown = false;
      if (view && !view.webContents.isDestroyed()) _park();
      return false;
    }
    lastBounds = b;
    ensure();
    view.setBounds(b);
    view.setVisible(true);
    shown = true;
    everShown = true;
    return true;
  }

  async function _waitLoaded(ms) {
    const c = wc();
    const start = Date.now();
    while (c && !c.isDestroyed() && c.isLoading() && Date.now() - start < ms) await _sleep(50);
  }

  async function open(raw, opts) {
    const url = normalizeUrl(raw);
    if (!url) throw _err('EINVAL', 'Code\'s browser opens http and https addresses only.');
    const expectHost = opts && opts.expectHost;
    if (expectHost != null && hostOf(url).toLowerCase() !== String(expectHost).toLowerCase()) {
      throw _err('ESITE', url + ' is not on ' + expectHost + ', which this was allowed for.');
    }
    ensure();
    const c = wc();
    lastError = null;
    try {
      await _withTimeout(c.loadURL(url), LOAD_TIMEOUT_MS, 'Loading ' + url);
    } catch (e) {
      // ERR_ABORTED: a redirect or a newer navigation took over; the page that
      // ends up loading is what counts.
      if (!/ERR_ABORTED|\(-3\)/.test(String(e && e.message)) && e.code !== 'ETIMEDOUT') {
        lastError = String((e && e.message) || e).replace(/^Error:\s*/, '');
      }
      if (e.code === 'ETIMEDOUT') lastError = 'The page is still loading after ' + (LOAD_TIMEOUT_MS / 1000) + ' seconds.';
    }
    _tell();
    return state();
  }

  function _nav(fn) {
    const c = wc();
    if (!c || c.isDestroyed()) return state();
    const h = c.navigationHistory || c;
    fn(c, h);
    return state();
  }
  const back = () => _nav((c, h) => { if (h.canGoBack()) h.goBack(); });
  const forward = () => _nav((c, h) => { if (h.canGoForward()) h.goForward(); });
  const reload = () => _nav((c) => c.reload());
  const stop = () => _nav((c) => c.stop());

  function _page() {
    const c = wc();
    if (!c || c.isDestroyed() || !isWebUrl(c.getURL())) throw _err('ENOPAGE', 'No page is open. Open one with browser_open first.');
    return c;
  }

  // An action approved for one site runs only while the page is still on it.
  function _onSite(c, expectHost) {
    if (expectHost == null) return;
    const now = hostOf(c.getURL()).toLowerCase();
    if (now !== String(expectHost).toLowerCase()) {
      throw _err('ESITE', 'The page is on ' + (now || 'no website') + ' now, not ' + expectHost + ', which this was allowed for. Nothing was done; read the page and try again.');
    }
  }

  function _run(fn, arg, what) {
    const c = _page();
    return _withTimeout(c.executeJavaScriptInIsolatedWorld(WORLD_ID, [{ code: _script(fn, arg) }]), SCRIPT_TIMEOUT_MS, what);
  }

  async function read() {
    _page();
    await _waitLoaded(5000);
    const r = await _run(pageSnapshot, { textMax: TEXT_MAX, elementsMax: ELEMENTS_MAX }, 'Reading the page');
    return { ...r, status: lastStatus, ...(lastError ? { error: lastError } : {}) };
  }

  async function _locate(ref, extra) {
    const r = await _run(pageLocate, { ref: String(ref), ...extra }, 'Finding the element');
    if (!r || r.error === 'ENOREF') throw _err('ENOREF', 'There is no element ' + ref + ' on this page. Read the page again for fresh refs.');
    if (r.error === 'EGONE') throw _err('EGONE', 'Element ' + ref + ' is no longer on the page. Read the page again.');
    if (r.error === 'EOBSCURED') throw _err('EOBSCURED', 'Element ' + ref + ' is covered by ' + r.by + ', so a click would land on that instead. Nothing was clicked; deal with what covers it first (a banner or dialog), then read the page again.');
    return r;
  }

  async function _settle() {
    await _sleep(SETTLE_MS);
    await _waitLoaded(LOAD_TIMEOUT_MS / 3);
    _tell();
    return state();
  }

  // Input goes in through the DevTools protocol where it can: unlike
  // sendInputEvent, it reaches the page while NICE's window is not the
  // focused one (the user working in another app while the agent clicks).
  function _cdp(c) {
    const d = c.debugger;
    if (!d) return null;
    try { if (!d.isAttached()) d.attach('1.3'); return d; } catch { return null; }
  }

  async function _mouse(c, x, y) {
    const d = _cdp(c);
    if (d) {
      await d.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
      await d.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      await d.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
      return;
    }
    c.sendInputEvent({ type: 'mouseMove', x, y });
    c.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    c.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
  }

  async function _insert(c, text) {
    const d = _cdp(c);
    if (d) return d.sendCommand('Input.insertText', { text });
    return c.insertText(text);
  }

  async function click(ref, opts) {
    const expectHost = opts && opts.expectHost;
    const c = _page();
    _onSite(c, expectHost);
    await _whenShownOnce();
    const at = await _locate(ref, { hitTest: true });
    if (at.x < 0 || at.y < 0 || at.x >= at.vw || at.y >= at.vh) throw _err('EOFFSCREEN', 'Element ' + ref + ' is outside the visible page and could not be scrolled into view.');
    _onSite(c, expectHost);
    await _mouse(c, at.x, at.y);
    return _settle();
  }

  async function _key(c, spec, expectHost) {
    _onSite(c, expectHost);
    const k = parseKey(spec);
    if (!k) throw _err('EINVAL', 'Unknown key: ' + spec + '. Use names like Enter, Tab, Escape, ArrowDown or ctrl+a.');
    const d = _cdp(c);
    if (d) {
      const e = cdpKey(k);
      await d.sendCommand('Input.dispatchKeyEvent', { ...e, type: e.text ? 'keyDown' : 'rawKeyDown' });
      await d.sendCommand('Input.dispatchKeyEvent', { ...e, type: 'keyUp', text: undefined });
      return;
    }
    c.sendInputEvent({ type: 'keyDown', keyCode: k.keyCode, modifiers: k.modifiers });
    if (k.char) c.sendInputEvent({ type: 'char', keyCode: k.char, modifiers: k.modifiers });
    c.sendInputEvent({ type: 'keyUp', keyCode: k.keyCode, modifiers: k.modifiers });
  }

  async function type(ref, text, opts) {
    const o = opts || {};
    const c = _page();
    if (typeof text !== 'string') throw _err('EINVAL', 'Text to type must be a string.');
    _onSite(c, o.expectHost);
    await _whenShownOnce();
    if (ref != null && ref !== '') {
      const at = await _locate(ref, { focus: true, select: !!o.clear, hitTest: !o.clear });
      if (!o.clear && at.x >= 0 && at.y >= 0 && at.x < at.vw && at.y < at.vh) {
        _onSite(c, o.expectHost);
        await _mouse(c, at.x, at.y);
        await _sleep(50);
        // A click puts the caret where it landed; typing goes at the end.
        await _run(function (a) { const el = window.__niceRefs.get(a.ref); if (el && typeof el.setSelectionRange === 'function' && typeof el.value === 'string') { try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {} } return true; }, { ref: String(ref) }, 'Placing the caret');
      }
    }
    _onSite(c, o.expectHost);
    if (text) await _insert(c, text);
    if (o.submit) await _key(c, 'Enter', o.expectHost);
    return _settle();
  }

  async function key(spec, opts) {
    const expectHost = opts && opts.expectHost;
    const c = _page();
    const specs = String(spec || '').trim().split(/\s+/).filter(Boolean);
    if (!specs.length || specs.length > 20) throw _err('EINVAL', 'Give one to twenty keys, separated by spaces.');
    for (const s of specs) if (!parseKey(s)) throw _err('EINVAL', 'Unknown key: ' + s + '. Use names like Enter, Tab, Escape, ArrowDown or ctrl+a.');
    await _whenShownOnce();
    for (const s of specs) await _key(c, s, expectHost);
    return _settle();
  }

  async function scroll(direction) {
    _page();
    const r = await _run(pageScroll, { direction: direction === 'up' ? 'up' : 'down' }, 'Scrolling');
    return r;
  }

  function consoleMessages() {
    _page();
    return consoleLines.slice();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (!view) return;
    try { win.contentView.removeChildView(view); } catch {}
    try { if (!view.webContents.isDestroyed()) view.webContents.close(); } catch {}
    view = null;
  }

  return {
    state, place, open, back, forward, reload, stop, read, click, type, key, scroll,
    console: consoleMessages, destroy,
    get shown() { return shown; }, get bounds() { return lastBounds; },
  };
}

module.exports = {
  PARTITION, WORLD_ID, createBrowser, normalizeUrl, isWebUrl, hostOf, parseKey, cdpKey, cleanBounds,
  pageSnapshot, pageLocate, pageScroll,
  _resetSession: () => { _sessionReady = null; },
};
