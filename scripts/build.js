#!/usr/bin/env node
/**
 * NICE Build Script
 * Concatenates all IIFE modules in load order and minifies via esbuild.
 * Output: app/js/nice.bundle.min.js
 *
 * Usage: node scripts/build.js
 */
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('fs');
const { resolve } = require('path');
const esbuild = require('esbuild');

const ROOT = resolve(__dirname, '..');

// Load order is derived from app/index.html, which is the single source of
// truth for it. This used to be a hand-maintained copy and drifted: 30
// modules — terminology, stripe-config, roles, core-voice among them — had
// fallen out of the bundle without anything failing, because the bundle is
// only exercised by CI's size gate, not served.
const INDEX = readFileSync(resolve(ROOT, 'app/index.html'), 'utf-8');
const SCRIPTS = [...INDEX.matchAll(/<script[^>]+src="\.\/(js\/[^"?]+)/g)]
  .map(m => 'app/' + m[1]);

if (SCRIPTS.length < 50) {
  throw new Error(`Only ${SCRIPTS.length} scripts parsed from app/index.html — the ` +
    'selector likely broke. Refusing to build a silently truncated bundle.');
}
for (const f of SCRIPTS) {
  if (!existsSync(resolve(ROOT, f))) throw new Error(`Listed in index.html but missing: ${f}`);
}

// Concatenate
const combined = SCRIPTS.map(f => {
  const path = resolve(ROOT, f);
  return `/* === ${f} === */\n${readFileSync(path, 'utf-8')}`;
}).join('\n\n');

// Write unminified bundle
const outDir = resolve(ROOT, 'app/js');
const bundlePath = resolve(outDir, 'nice.bundle.js');
writeFileSync(bundlePath, combined);

// Minify with esbuild
const result = esbuild.buildSync({
  stdin: { contents: combined, loader: 'js' },
  write: false,
  minify: true,
  target: 'es2020',
  charset: 'utf8',
});

const minPath = resolve(outDir, 'nice.bundle.min.js');
writeFileSync(minPath, result.outputFiles[0].text);

const origSize = Buffer.byteLength(combined);
const minSize = result.outputFiles[0].text.length;
const pct = ((1 - minSize / origSize) * 100).toFixed(1);

console.log(`✓ ${SCRIPTS.length} scripts bundled`);
console.log(`  ${(origSize / 1024).toFixed(0)}KB → ${(minSize / 1024).toFixed(0)}KB (${pct}% reduction)`);
console.log(`  ${bundlePath}`);
console.log(`  ${minPath}`);
