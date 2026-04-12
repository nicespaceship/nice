#!/usr/bin/env node
/**
 * NICE Build Script
 * Concatenates all IIFE modules in load order and minifies via esbuild.
 * Output: app/js/nice.bundle.min.js
 *
 * Usage: node scripts/build.js
 */
const { readFileSync, writeFileSync, mkdirSync } = require('fs');
const { resolve } = require('path');
const esbuild = require('esbuild');

const ROOT = resolve(__dirname, '..');

// Script load order (matches app/index.html <script> tags)
const SCRIPTS = [
  'app/js/lib/state.js',
  'app/js/lib/utils.js',
  'app/js/lib/skin.js',
  'app/js/lib/rate-limiter.js',
  'app/js/lib/supabase.js',
  'app/js/lib/offline-queue.js',
  'app/js/lib/router.js',
  'app/js/lib/blueprint-utils.js',
  'app/js/lib/card-renderer.js',
  'app/js/views/home.js',
  'app/js/views/profile.js',
  'app/js/views/alerts.js',
  'app/js/views/agents.js',
  'app/js/views/agent-builder.js',
  'app/js/views/spaceship-builder.js',
  'app/js/views/missions.js',
  'app/js/views/spaceships.js',
  'app/js/views/dock-view.js',
  'app/js/views/schematic.js',
  'app/js/views/blueprints.js',
  'app/js/views/analytics.js',
  'app/js/views/cost.js',
  'app/js/views/vault.js',
  'app/js/views/integrations.js',
  'app/js/views/security.js',
  'app/js/views/settings.js',
  'app/js/views/wallet.js',
  'app/js/views/audit-log.js',
  'app/js/views/theme-creator.js',
  'app/js/views/workflows.js',
  'app/js/lib/preview-panel.js',
  'app/js/views/prompt-panel.js',
  'app/js/views/log-view.js',
  'app/js/views/ship-log-view.js',
  'app/js/lib/audit-log.js',
  'app/js/lib/data-io.js',
  'app/js/lib/activity-feed.js',
  'app/js/lib/quick-notes.js',
  'app/js/lib/favorites.js',
  'app/js/lib/notify.js',
  'app/js/lib/message-bar.js',
  'app/js/lib/gamification.js',
  'app/js/lib/command-palette.js',
  'app/js/lib/keyboard.js',
  'app/js/lib/blueprint-store.js',
  'app/js/lib/llm-config.js',
  'app/js/lib/model-intel.js',
  'app/js/lib/prompt-builder.js',
  'app/js/lib/agent-memory.js',
  'app/js/lib/quality-gate.js',
  'app/js/lib/ship-templates.js',
  'app/js/lib/tool-registry.js',
  'app/js/lib/browser-tools.js',
  'app/js/lib/mcp-bridge.js',
  'app/js/lib/agent-executor.js',
  'app/js/lib/ship-log.js',
  'app/js/lib/ship-behaviors.js',
  'app/js/lib/mission-router.js',
  'app/js/lib/mission-runner.js',
  'app/js/lib/mission-scheduler.js',
  'app/js/lib/workflow-engine.js',
  'app/js/lib/subscription.js',
  'app/js/lib/upgrade-modal.js',
  'app/js/lib/setup-wizard.js',
  'app/js/lib/ship-setup-wizard.js',
  'app/js/lib/crew-designer.js',
  'app/js/lib/content-queue.js',
  'app/js/lib/media-tools.js',
  'app/js/lib/virtual-fs.js',
  'app/js/views/engineering.js',
  'app/js/lib/auth-modal.js',
  'app/js/nice.js',
];

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
