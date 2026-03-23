#!/usr/bin/env node
/**
 * NICE Dev Server — lightweight HTTP server with live reload via WebSocket.
 * Usage: node scripts/dev-server.js
 * Serves project root on http://localhost:3000
 * Watches app/js/ and app/css/ for changes and triggers browser reload.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws') || {};

const PORT = process.env.PORT || 3000;
const ROOT = path.resolve(__dirname, '..');
const WATCH_DIRS = ['app/js', 'app/css'];

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

const RELOAD_SCRIPT = `<script>(function(){var ws=new WebSocket('ws://'+location.hostname+':${PORT + 1}');ws.onmessage=function(e){if(e.data==='reload')location.reload();};})()</script>`;

// HTTP server
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath.endsWith('/')) urlPath += 'index.html';

  const filePath = path.join(ROOT, urlPath);
  const ext = path.extname(filePath).toLowerCase();

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Try .html extension
      const htmlPath = filePath + '.html';
      if (!ext && fs.existsSync(htmlPath)) {
        return fs.readFile(htmlPath, (e2, d2) => {
          if (e2) { res.writeHead(404); res.end('Not found'); return; }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(d2.toString().replace('</body>', RELOAD_SCRIPT + '</body>'));
        });
      }
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const contentType = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });

    // Inject reload script into HTML
    if (ext === '.html') {
      res.end(data.toString().replace('</body>', RELOAD_SCRIPT + '</body>'));
    } else {
      res.end(data);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[dev-server] http://localhost:${PORT}`);
  console.log(`[dev-server] Watching: ${WATCH_DIRS.join(', ')}`);
});

// WebSocket server for reload notifications
let wss;
try {
  wss = new WebSocketServer({ port: PORT + 1 });
} catch {
  // ws module not installed — use polling fallback message
  console.log('[dev-server] WebSocket (ws) module not found. Install with: npm i -D ws');
  console.log('[dev-server] Live reload disabled, serving files only.');
  wss = null;
}

function notifyClients() {
  if (!wss) return;
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send('reload');
  });
}

// Watch directories for changes
let debounce = null;
WATCH_DIRS.forEach(dir => {
  const absDir = path.join(ROOT, dir);
  if (!fs.existsSync(absDir)) return;
  fs.watch(absDir, { recursive: true }, (event, filename) => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      console.log(`[dev-server] ${filename} changed — reloading`);
      notifyClients();
    }, 150);
  });
});
