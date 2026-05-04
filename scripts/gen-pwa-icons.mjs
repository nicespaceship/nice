import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SVG_PATH = path.join(ROOT, 'app/icons/icon.svg');
const ICONS_DIR = path.join(ROOT, 'app/icons');

const TARGETS = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
];

const svg = await fs.readFile(SVG_PATH, 'utf8');
const browser = await chromium.launch();
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
const page = await ctx.newPage();

for (const { name, size } of TARGETS) {
  const html = `<!DOCTYPE html><html><head><style>html,body{margin:0;padding:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style></head><body>${svg.replace(/<svg([^>]*)>/, `<svg$1 width="${size}" height="${size}">`)}</body></html>`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html, { waitUntil: 'load' });
  const out = path.join(ICONS_DIR, name);
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  const stat = await fs.stat(out);
  console.log(`wrote ${name} ${size}x${size} (${stat.size} bytes)`);
}

await browser.close();
