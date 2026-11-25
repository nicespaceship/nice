/**
 * NICE Desktop — search worker
 *
 * Runs a Workspace.search in its own thread so a pattern that backtracks
 * badly can be stopped (Workspace terminates the worker at its time limit)
 * instead of freezing the app. Symlinks are not followed.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { parentPort, workerData } = require('worker_threads');
const { _globToRegExp } = require('./code-host');

const { root, start, pattern, ignoreCase, glob, cap, maxBytes, maxFiles, skipDirs } = workerData;
const re = new RegExp(pattern, ignoreCase ? 'i' : '');
const nameRe = glob ? _globToRegExp(glob) : null;
const skip = new Set(skipDirs);

const matches = [];
let filesSearched = 0;
let truncated = false;

function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    if (truncated) return;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!skip.has(e.name)) walk(full);
      continue;
    }
    if (!e.isFile()) continue;
    const rel = path.relative(root, full);
    if (nameRe && !nameRe.test(rel.split(path.sep).join('/')) && !nameRe.test(e.name)) continue;
    if (filesSearched >= maxFiles) { truncated = true; return; }
    let buf;
    try {
      if (fs.statSync(full).size > maxBytes) continue;
      buf = fs.readFileSync(full);
    } catch { continue; }
    if (buf.includes(0)) continue;
    filesSearched++;
    const lines = buf.toString('utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i])) continue;
      if (matches.length >= cap) { truncated = true; return; }
      matches.push({ path: rel, line: i + 1, text: lines[i].slice(0, 500) });
    }
  }
}

walk(start);
parentPort.postMessage({ matches, filesSearched, truncated });
