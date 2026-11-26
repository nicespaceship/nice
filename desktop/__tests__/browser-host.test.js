// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';
import { EventEmitter } from 'events';

const require = createRequire(import.meta.url);
const B = require('../browser-host.js');
const { normalizeUrl, isWebUrl, hostOf, parseKey, cleanBounds, pageSnapshot, pageLocate, pageScroll, createBrowser } = B;

describe('normalizeUrl', () => {
  it('turns what people type into http(s) addresses', () => {
    expect(normalizeUrl('localhost:3000')).toBe('http://localhost:3000/');
    expect(normalizeUrl('127.0.0.1:8080/x')).toBe('http://127.0.0.1:8080/x');
    expect(normalizeUrl('app.localhost')).toBe('http://app.localhost/');
    expect(normalizeUrl('example.com/docs')).toBe('https://example.com/docs');
    expect(normalizeUrl('  https://example.com  ')).toBe('https://example.com/');
    expect(normalizeUrl('http://example.com:81/a?b=1#c')).toBe('http://example.com:81/a?b=1#c');
  });

  it('refuses anything that is not a plain web address', () => {
    for (const bad of ['file:///etc/hosts', 'nice://app/app/', 'javascript:alert(1)', 'data:text/html,hi', 'chrome://settings',
      'about:blank', 'ftp://example.com', 'https://user:pw@example.com', 'https://user@example.com', 'just words', 'hello', '', null]) {
      expect(normalizeUrl(bad)).toBeNull();
    }
  });

  it('knows a web URL and its host', () => {
    expect(isWebUrl('https://a.com')).toBe(true);
    expect(isWebUrl('file:///x')).toBe(false);
    expect(hostOf('http://localhost:3000/x')).toBe('localhost:3000');
    expect(hostOf('nice://app/app/')).toBe('');
  });
});

describe('parseKey', () => {
  it('reads key names and shortcuts', () => {
    expect(parseKey('Enter')).toEqual({ keyCode: 'Enter', modifiers: [], char: '\r' });
    expect(parseKey('ArrowDown')).toEqual({ keyCode: 'Down', modifiers: [], char: null });
    expect(parseKey('ctrl+a')).toEqual({ keyCode: 'a', modifiers: ['control'], char: null });
    expect(parseKey('Shift+Tab')).toEqual({ keyCode: 'Tab', modifiers: ['shift'], char: null });
    expect(parseKey('shift+a')).toEqual({ keyCode: 'a', modifiers: ['shift'], char: 'A' });
    expect(parseKey('cmd+shift+k').modifiers).toEqual(['meta', 'shift']);
    expect(parseKey('F5').keyCode).toBe('F5');
  });

  it('refuses keys it does not know', () => {
    for (const bad of ['', 'hyper+q', 'Enterr', 'ctrl+', 'F13']) expect(parseKey(bad)).toBeNull();
  });
});

describe('cdpKey', () => {
  it('gives the DevTools protocol the key, code, virtual key and modifier bits', () => {
    expect(B.cdpKey(parseKey('Enter'))).toMatchObject({ key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 0, text: '\r' });
    expect(B.cdpKey(parseKey('ArrowDown'))).toMatchObject({ key: 'ArrowDown', windowsVirtualKeyCode: 40, text: undefined });
    expect(B.cdpKey(parseKey('ctrl+shift+a'))).toMatchObject({ key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 10, text: undefined });
    expect(B.cdpKey(parseKey('7'))).toMatchObject({ code: 'Digit7', windowsVirtualKeyCode: 55, text: '7' });
    expect(B.cdpKey(parseKey('F5'))).toMatchObject({ windowsVirtualKeyCode: 116 });
  });
});

describe('cleanBounds', () => {
  it('rounds, scales by the page zoom and refuses empty or bad bounds', () => {
    expect(cleanBounds({ x: 10.4, y: 20.6, width: 300.2, height: 400 }, 1)).toEqual({ x: 10, y: 21, width: 300, height: 400 });
    expect(cleanBounds({ x: 10, y: 10, width: 100, height: 100 }, 1.5)).toEqual({ x: 15, y: 15, width: 150, height: 150 });
    expect(cleanBounds({ x: -5, y: 0, width: 10, height: 10 })).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    expect(cleanBounds({ x: 0, y: 0, width: 0, height: 10 })).toBeNull();
    expect(cleanBounds({ x: 'a', y: 0, width: 10, height: 10 })).toBeNull();
    expect(cleanBounds(null)).toBeNull();
  });
});

describe('page scripts', () => {
  beforeEach(() => {
    delete window.__niceRefs;
    document.body.innerHTML = `
      <h1>Docs</h1>
      <a href="/next">Next page</a>
      <button aria-label="Close dialog">x</button>
      <label>Email <input id="email" value="a@b.c"></label>
      <input type="password" id="pw" value="hunter2" placeholder="Password">
      <input type="checkbox" checked id="c"> <button disabled>Off</button>
      <button style="display:none">Hidden</button>
      <div contenteditable="true">Notes</div>`;
    // jsdom has no layout: give every element a box so it counts as visible.
    Element.prototype.getBoundingClientRect = function () { return { left: 10, top: 20, width: 100, height: 30, right: 110, bottom: 50 }; };
    Element.prototype.getClientRects = function () { return [this.getBoundingClientRect()]; };
    Element.prototype.scrollIntoView = function () {};
  });

  it('lists what can be used, with refs, and never a password', () => {
    const r = pageSnapshot({ textMax: 1000, elementsMax: 50 });
    const byName = Object.fromEntries(r.elements.map(e => [e.name, e]));
    expect(byName['Next page']).toMatchObject({ role: 'link', href: 'http://localhost:3000/next' });
    expect(byName['Close dialog'].role).toBe('button');
    expect(byName['Email']).toMatchObject({ role: 'textbox', value: 'a@b.c' });
    const pw = r.elements.find(e => e.placeholder === 'Password');
    expect(pw.value).toBe('••••');
    expect(JSON.stringify(r)).not.toContain('hunter2');
    expect(r.elements.find(e => e.role === 'checkbox').checked).toBe(true);
    expect(r.elements.some(e => e.name === 'Off' || e.name === 'Hidden')).toBe(false);
    expect(r.elements.find(e => e.name === 'Notes').role).toBe('textbox');
    expect(r.text).toContain('Docs');
  });

  it('keeps an element\'s ref across reads and cuts long text', () => {
    const a = pageSnapshot({});
    document.body.insertAdjacentHTML('beforeend', '<p>' + 'y'.repeat(50) + '</p>');
    const b = pageSnapshot({ textMax: 20 });
    expect(b.elements[0].ref).toBe(a.elements[0].ref);
    expect(b.text.length).toBe(20);
    expect(b.textCut).toBeGreaterThan(0);
  });

  it('caps the element list and counts the rest', () => {
    const r = pageSnapshot({ elementsMax: 2 });
    expect(r.elements).toHaveLength(2);
    expect(r.moreElements).toBeGreaterThan(0);
  });

  it('finds an element by ref, focuses it and selects its text', () => {
    const r = pageSnapshot({});
    const email = r.elements.find(e => e.name === 'Email');
    const at = pageLocate({ ref: email.ref, focus: true, select: true });
    expect(at).toMatchObject({ x: 60, y: 35 });
    expect(document.activeElement.id).toBe('email');
    expect(pageLocate({ ref: '999' })).toEqual({ error: 'ENOREF' });
    document.getElementById('email').remove();
    expect(pageLocate({ ref: email.ref })).toEqual({ error: 'EGONE' });
  });

  it('forgets refs when the document changes', () => {
    const r = pageSnapshot({});
    window.__niceRefsDoc = {};
    expect(pageLocate({ ref: r.elements[0].ref })).toEqual({ error: 'ENOREF' });
  });

  it('scrolls by most of a screen', () => {
    window.scrollBy = vi.fn();
    pageScroll({ direction: 'up' });
    expect(window.scrollBy).toHaveBeenCalledWith(0, -Math.round(window.innerHeight * 0.8));
  });
});

/* Stand-ins for Electron's WebContentsView, its webContents and session. */
function fakes() {
  const views = [];
  class FakeContents extends EventEmitter {
    constructor() {
      super();
      this.url = '';
      this.loading = false;
      this.inputs = [];
      this.typed = [];
      this.scripts = [];
      this.closed = false;
      this.navigationHistory = { canGoBack: () => false, canGoForward: () => false, goBack: vi.fn(), goForward: vi.fn() };
      this.answer = (code) => (code.includes('pageLocate') ? { x: 5, y: 5, vw: 100, vh: 100 } : code.includes('pageSnapshot') ? { url: this.url, title: 't', text: 'hi', elements: [], moreElements: 0 } : true);
    }
    isDestroyed() { return this.closed; }
    getURL() { return this.url; }
    getTitle() { return 'Title'; }
    isLoading() { return this.loading; }
    loadURL(u) { this.url = u; this.emit('did-navigate', {}, u, 200); return Promise.resolve(); }
    setWindowOpenHandler(fn) { this.openHandler = fn; }
    executeJavaScriptInIsolatedWorld(id, scripts) { this.scripts.push({ id, code: scripts[0].code }); return Promise.resolve(this.answer(scripts[0].code)); }
    sendInputEvent(e) { this.inputs.push(e); }
    insertText(t) { this.typed.push(t); return Promise.resolve(); }
    reload() {}
    stop() {}
    close() { this.closed = true; }
  }
  class WebContentsView {
    constructor(opts) { this.opts = opts; this.webContents = new FakeContents(); this.visible = null; this.bounds = null; views.push(this); }
    setBounds(b) { this.bounds = b; }
    setVisible(v) { this.visible = v; }
  }
  const ses = new EventEmitter();
  ses.setPermissionRequestHandler = vi.fn((fn) => { ses.request = fn; });
  ses.setPermissionCheckHandler = vi.fn((fn) => { ses.check = fn; });
  const session = { fromPartition: vi.fn(() => ses) };
  const win = { contentView: { addChildView: vi.fn(), removeChildView: vi.fn() } };
  const notify = vi.fn();
  return { views, WebContentsView, session, ses, win, notify };
}

describe('pageLocate hit test', () => {
  beforeEach(() => {
    delete window.__niceRefs;
    document.body.innerHTML = '<button id="go">Next</button><div id="banner">Accept cookies</div><label id="l">Name <input id="name"></label><iframe id="f"></iframe>';
    Element.prototype.getBoundingClientRect = function () { return { left: 10, top: 20, width: 100, height: 30 }; };
    Element.prototype.getClientRects = function () { return [this.getBoundingClientRect()]; };
    Element.prototype.scrollIntoView = function () {};
  });
  const refOf = (id) => pageSnapshot({}).elements.find(e => window.__niceRefs.get(e.ref).id === id).ref;

  it('refuses a click that would land on something covering the element', () => {
    const ref = refOf('go');
    document.elementFromPoint = () => document.getElementById('banner');
    expect(pageLocate({ ref, hitTest: true })).toEqual({ error: 'EOBSCURED', by: 'Accept cookies' });
    document.elementFromPoint = () => document.getElementById('f');
    expect(pageLocate({ ref, hitTest: true })).toEqual({ error: 'EOBSCURED', by: 'a frame from another page' });
    document.elementFromPoint = () => document.getElementById('go');
    expect(pageLocate({ ref, hitTest: true }).x).toBe(60);
  });

  it('lets a click on a field\'s label through', () => {
    const ref = refOf('name');
    document.elementFromPoint = () => document.getElementById('l');
    expect(pageLocate({ ref, hitTest: true }).error).toBeUndefined();
  });
});

describe('createBrowser', () => {
  let f, b;
  beforeEach(() => {
    B._resetSession();
    f = fakes();
    b = createBrowser({ win: f.win, WebContentsView: f.WebContentsView, session: f.session, notify: f.notify, zoom: () => 1 });
  });

  it('makes nothing until it is used, then a sandboxed page in its own session', async () => {
    expect(b.state().url).toBe('');
    expect(f.views).toHaveLength(0);
    await b.open('localhost:3000');
    const [v] = f.views;
    expect(f.session.fromPartition).toHaveBeenCalledWith(B.PARTITION);
    expect(v.opts.webPreferences).toMatchObject({ sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true });
    expect(v.opts.webPreferences.preload).toBeUndefined();
    expect(v.visible).toBe(false);
    expect(b.state()).toMatchObject({ url: 'http://localhost:3000/', host: 'localhost:3000', status: 200 });
    expect(f.notify).toHaveBeenCalled();
  });

  it('refuses permissions and downloads in its session', async () => {
    await b.open('example.com');
    const cb = vi.fn();
    f.ses.request(null, 'media', cb);
    expect(cb).toHaveBeenCalledWith(false);
    expect(f.ses.check()).toBe(false);
    const item = { cancel: vi.fn() };
    const e = { preventDefault: vi.fn() };
    f.ses.emit('will-download', e, item);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(item.cancel).toHaveBeenCalled();
  });

  it('refuses to open or be sent anywhere but http and https', async () => {
    await expect(b.open('file:///etc/passwd')).rejects.toMatchObject({ code: 'EINVAL' });
    await b.open('example.com');
    const c = f.views[0].webContents;
    for (const ev of ['will-navigate', 'will-redirect']) {
      const bad = { preventDefault: vi.fn() };
      c.emit(ev, bad, 'nice://app/app/');
      expect(bad.preventDefault).toHaveBeenCalled();
      const ok = { preventDefault: vi.fn() };
      c.emit(ev, ok, 'https://example.com/b');
      expect(ok.preventDefault).not.toHaveBeenCalled();
    }
    const att = { preventDefault: vi.fn() };
    c.emit('will-attach-webview', att);
    expect(att.preventDefault).toHaveBeenCalled();
  });

  it('opens new windows in the same view, and never other schemes', async () => {
    await b.open('example.com');
    const c = f.views[0].webContents;
    expect(c.openHandler({ url: 'file:///x' })).toEqual({ action: 'deny' });
    expect(c.openHandler({ url: 'https://example.com/pop' })).toEqual({ action: 'deny' });
    await new Promise(r => setImmediate(r));
    expect(c.url).toBe('https://example.com/pop');
  });

  it('shows itself where the page says, and hides on null', async () => {
    expect(b.place({ x: 10, y: 20, width: 300, height: 200 })).toBe(true);
    const v = f.views[0];
    expect(v.bounds).toEqual({ x: 10, y: 20, width: 300, height: 200 });
    expect(v.visible).toBe(true);
    expect(b.place(null)).toBe(false);
    expect(v.visible).toBe(false);
  });

  it('waits for its first showing before it clicks', async () => {
    vi.useFakeTimers();
    try {
      await b.open('example.com');
      const clicked = b.click('1').catch(e => e);
      await vi.advanceTimersByTimeAsync(3100);
      expect(await clicked).toMatchObject({ code: 'EHIDDEN' });
      const later = b.click('1');
      await vi.advanceTimersByTimeAsync(100);
      b.place({ x: 0, y: 0, width: 100, height: 100 });
      await vi.advanceTimersByTimeAsync(1000);
      await later;
      const c = f.views[0].webContents;
      expect(c.inputs.map(i => i.type)).toEqual(['mouseMove', 'mouseDown', 'mouseUp']);
    } finally { vi.useRealTimers(); }
  });

  it('refuses to act once the page is on another site than the one allowed', async () => {
    await b.open('example.com');
    b.place({ x: 0, y: 0, width: 100, height: 100 });
    const c = f.views[0].webContents;
    c.url = 'https://evil.test/';
    await expect(b.click('1', { expectHost: 'example.com' })).rejects.toMatchObject({ code: 'ESITE' });
    await expect(b.type(null, 'secret', { expectHost: 'example.com' })).rejects.toMatchObject({ code: 'ESITE' });
    await expect(b.key('Enter', { expectHost: 'example.com' })).rejects.toMatchObject({ code: 'ESITE' });
    expect(c.inputs).toEqual([]);
    expect(c.typed).toEqual([]);
    // The page moves between finding the element and the click.
    c.url = 'https://example.com/';
    const answer = c.answer;
    c.answer = (code) => { if (code.includes('pageLocate')) c.url = 'https://evil.test/'; return answer(code); };
    await expect(b.click('1', { expectHost: 'example.com' })).rejects.toMatchObject({ code: 'ESITE' });
    expect(c.inputs).toEqual([]);
    await expect(b.open('evil.test', { expectHost: 'example.com' })).rejects.toMatchObject({ code: 'ESITE' });
    // An approval whose site could not be read binds to no site, and is refused.
    await expect(b.key('Enter', { expectHost: '' })).rejects.toMatchObject({ code: 'ESITE' });
  });

  it('sends input through the DevTools protocol when it can attach', async () => {
    await b.open('example.com');
    b.place({ x: 0, y: 0, width: 100, height: 100 });
    const c = f.views[0].webContents;
    const sent = [];
    let attached = false;
    c.debugger = { isAttached: () => attached, attach: vi.fn(() => { attached = true; }), sendCommand: vi.fn(async (m, p) => { sent.push([m, p]); }) };
    await b.click('1');
    expect(c.debugger.attach).toHaveBeenCalledWith('1.3');
    expect(sent.map(([m, p]) => m + ':' + p.type)).toEqual(['Input.dispatchMouseEvent:mouseMoved', 'Input.dispatchMouseEvent:mousePressed', 'Input.dispatchMouseEvent:mouseReleased']);
    expect(c.inputs).toEqual([]);
    sent.length = 0;
    await b.type(null, 'hi', { submit: true });
    expect(sent[0]).toEqual(['Input.insertText', { text: 'hi' }]);
    expect(sent.slice(1).map(([, p]) => p.type + ':' + p.key)).toEqual(['keyDown:Enter', 'keyUp:Enter']);
    expect(sent[1][1]).toMatchObject({ windowsVirtualKeyCode: 13, text: '\r' });
    expect(c.debugger.attach).toHaveBeenCalledTimes(1);
  });

  it('turns down device choosers and Bluetooth', async () => {
    await b.open('example.com');
    const pick = (ev, ...args) => { const e = { preventDefault: vi.fn() }; const cb = vi.fn(); f.ses.emit(ev, e, ...args, cb); return { e, cb }; };
    let r = pick('select-hid-device', {});
    expect(r.e.preventDefault).toHaveBeenCalled(); expect(r.cb).toHaveBeenCalledWith(null);
    r = pick('select-usb-device', {});
    expect(r.cb).toHaveBeenCalledWith();
    r = pick('select-serial-port', [], {});
    expect(r.cb).toHaveBeenCalledWith('');
    const e = { preventDefault: vi.fn() }; const cb = vi.fn();
    f.views[0].webContents.emit('select-bluetooth-device', e, [{ deviceId: 'x' }], cb);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith('');
  });

  it('runs its scripts in an isolated world', async () => {
    await b.open('example.com');
    await b.read();
    const c = f.views[0].webContents;
    expect(c.scripts[0].id).toBe(B.WORLD_ID);
    expect(c.scripts[0].code).toContain('pageSnapshot');
  });

  it('types and presses keys as input events', async () => {
    await b.open('example.com');
    b.place({ x: 0, y: 0, width: 100, height: 100 });
    const c = f.views[0].webContents;
    await b.type('3', 'hello', { clear: true, submit: true });
    expect(c.typed).toEqual(['hello']);
    expect(c.inputs.filter(i => i.type === 'char').map(i => i.keyCode)).toEqual(['\r']);
    c.inputs.length = 0;
    await b.key('Tab ctrl+a');
    expect(c.inputs.map(i => i.type + ':' + i.keyCode)).toEqual(['keyDown:Tab', 'keyUp:Tab', 'keyDown:a', 'keyUp:a']);
    await expect(b.key('hyper+q')).rejects.toMatchObject({ code: 'EINVAL' });
  });

  it('says when there is no page or no such element', async () => {
    await expect(b.read()).rejects.toMatchObject({ code: 'ENOPAGE' });
    await b.open('example.com');
    b.place({ x: 0, y: 0, width: 100, height: 100 });
    f.views[0].webContents.answer = () => ({ error: 'ENOREF' });
    await expect(b.click('9')).rejects.toMatchObject({ code: 'ENOREF' });
  });

  it('keeps the page\'s console, and starts it over on a new page', async () => {
    await b.open('example.com');
    const c = f.views[0].webContents;
    c.emit('console-message', {}, 3, 'boom', 7, 'https://example.com/a.js');
    expect(b.console()).toEqual([{ level: 'error', message: 'boom', source: 'https://example.com/a.js', line: 7 }]);
    c.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
    expect(b.console()).toEqual([]);
  });

  it('closes its page when destroyed', async () => {
    await b.open('example.com');
    const v = f.views[0];
    b.destroy();
    expect(f.win.contentView.removeChildView).toHaveBeenCalledWith(v);
    expect(v.webContents.closed).toBe(true);
    await expect(b.open('example.com')).rejects.toMatchObject({ code: 'EGONE' });
  });
});
