/**
 * NICE Desktop — the nice:// scheme
 *
 * The desktop window loads NICE from nice://app/app/index.html instead of
 * file://. The page asks for /app/… and /public/… (its <base> is /app/),
 * which on file:// would point at the root of the disk; this scheme maps
 * them to the repo's own folders and nothing else. It also lets the page
 * carry a Content-Security-Policy, which file:// cannot, and avoids the
 * extra privileges Electron gives file:// pages.
 */

'use strict';

const path = require('path');

const SCHEME = 'nice';
const HOST = 'app';
const ORIGIN = `${SCHEME}://${HOST}`;
const SERVED_DIRS = ['app', 'public', 'assets'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
};

const crypto = require('crypto');

const SUPABASE_HOST = 'zacllshbgmnwsmliteqx.supabase.co';
const API_HOSTS = ['api.nicespaceship.ai', SUPABASE_HOST];

/* Only NICE's own scripts run: its files, plus the inline scripts written
   into the page it serves (allowed by hash, so a script injected later
   does not run), no eval, nothing from another origin. Styles may be
   inline (style attributes are everywhere). */
function cspFor(html) {
  const hashes = [];
  if (typeof html === 'string') {
    const re = /<script>([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(html))) hashes.push("'sha256-" + crypto.createHash('sha256').update(m[1], 'utf8').digest('base64') + "'");
  }
  const api = API_HOSTS.map(h => 'https://' + h).join(' ');
  const ws = API_HOSTS.map(h => 'wss://' + h).join(' ');
  return [
    "default-src 'self'",
    ["script-src 'self'", ...hashes].join(' '),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: " + api,
    "connect-src 'self' " + api + ' ' + ws,
    // The preview panel's browser shows outside sites. A different origin
    // cannot reach this page, and the frame has no popups or top navigation.
    // Agent HTML renders in a fully sandboxed srcdoc.
    "frame-src https:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

const CSP = cspFor('');

/**
 * The file behind a nice://app/… URL, or null when the URL is not one this
 * scheme serves (other host, outside the served folders, or malformed).
 */
function resolveAppRequest(url, root) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== SCHEME + ':' || u.host !== HOST) return null;
  let pathname;
  try { pathname = decodeURIComponent(u.pathname); } catch { return null; }
  if (pathname.includes('\0') || pathname.includes('\\')) return null;
  // Judged before normalizing: /app/..%2fassets/x.svg would otherwise land in another served folder.
  if (pathname.split('/').includes('..')) return null;
  const norm = path.posix.normalize(pathname);
  const parts = norm.split('/').filter(Boolean);
  if (!parts.length || !SERVED_DIRS.includes(parts[0]) || parts.includes('..')) return null;
  if (norm.endsWith('/')) parts.push('index.html');
  const file = path.join(root, ...parts);
  const rel = path.relative(root, file);
  if (!rel || rel.startsWith('..' + path.sep) || rel === '..' || path.isAbsolute(rel)) return null;
  const ext = path.extname(file).toLowerCase();
  return { file, mime: MIME[ext] || 'application/octet-stream', isDocument: ext === '.html' };
}

/**
 * True for NICE's own page and nothing else: nice://app/app/ or
 * nice://app/app/index.html, with any query or hash. main.js lets only
 * this page, in the main frame, call the Code bridge.
 */
function isAppPage(url) {
  let u;
  try { u = new URL(String(url)); } catch { return false; }
  if (u.protocol !== SCHEME + ':' || u.host !== HOST || u.username || u.password) return false;
  return u.pathname === '/app/' || u.pathname === '/app/index.html';
}

/**
 * True when a did-start-navigation (Electron's details object) replaces
 * NICE's page: a main-frame, cross-document navigation to nice://app/, as a
 * reload is. External links fire it too, though will-navigate cancels them
 * and the page stays, so they are not counted.
 */
function replacesAppPage(details) {
  if (!details || details.isMainFrame !== true || details.isSameDocument) return false;
  return String(details.url || '').startsWith(ORIGIN + '/');
}

module.exports = { SCHEME, HOST, ORIGIN, CSP, API_HOSTS, SERVED_DIRS, cspFor, resolveAppRequest, isAppPage, replacesAppPage };
