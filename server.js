const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const MIME = {
  '.html':  'text/html; charset=utf-8',
  '.css':   'text/css',
  '.js':    'application/javascript',
  '.svg':   'image/svg+xml',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.ico':   'image/x-icon',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.json':  'application/json',
  '.txt':   'text/plain',
};

const ROOT = __dirname;

http.createServer((req, res) => {
  let p = decodeURIComponent(url.parse(req.url).pathname);
  let filePath = path.join(ROOT, p);

  // Serve index.html for directory requests
  if (!path.extname(filePath)) {
    const tryIndex = path.join(filePath, 'index.html');
    filePath = fs.existsSync(tryIndex) ? tryIndex : filePath + '.html';
  }

  // SPA fallback for /app/ routes
  if (!fs.existsSync(filePath) && p.startsWith('/app/')) {
    filePath = path.join(ROOT, 'app', 'index.html');
  }

  // Community site fallback: /css/*, /js/*, /assets/* → community/*
  if (!fs.existsSync(filePath)) {
    const communityPath = path.join(ROOT, 'community', p);
    if (fs.existsSync(communityPath)) filePath = communityPath;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found: ' + p);
    }
    const ext  = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`Static server running → http://localhost:${PORT}`);
});
