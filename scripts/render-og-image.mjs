#!/usr/bin/env node
/**
 * Rasterise assets/og-image.svg → assets/og-image.png (1200×630).
 *
 * Social platforms (Facebook, LinkedIn, X, Slack, iMessage) do not render
 * SVG og:image targets — a link preview pointing at an SVG comes back blank.
 * The card art is authored as SVG; this renders the PNG the crawlers need.
 *
 * Re-run after editing assets/og-image.svg:  node scripts/render-og-image.mjs
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WIDTH = 1200;
const HEIGHT = 630;

const svg = readFileSync(resolve(ROOT, 'assets/og-image.svg'), 'utf-8');

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
});
await page.setContent(
  `<!doctype html><html><body style="margin:0;padding:0;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden">${svg}</body></html>`,
  { waitUntil: 'load' },
);
await page.evaluate(() => document.fonts.ready);
const out = resolve(ROOT, 'assets/og-image.png');
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
await browser.close();

console.log(`✓ ${WIDTH}×${HEIGHT} → assets/og-image.png`);
