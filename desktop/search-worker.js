/**
 * NICE Desktop — search worker
 *
 * Runs a Workspace.search in its own thread so a pattern that backtracks
 * badly can be stopped (Workspace terminates the worker at its time limit)
 * instead of freezing the app. Symlinks are not followed, not even one
 * swapped in after the folder was listed.
 *
 * Messages: { type: 'matches', matches, filesSearched, skipped } after each
 * file that has matches, so a search stopped at its time limit still
 * returns what it found, then { type: 'done', filesSearched, skipped,
 * truncatedBy }.
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
const O_NOFOLLOW = fs.constants.O_NOFOLLOW || 0;
const O_NONBLOCK = fs.constants.O_NONBLOCK || 0;

let found = 0;
let filesSearched = 0;
const skipped = { tooBig: 0, binary: 0 };
let truncatedBy = null;

/* The bytes of `full` if it is still a regular file within the size cap:
   opened without following a symlink at the last step and without
   blocking on a FIFO, then checked on the open handle. */
function readRegular(full) {
  let fd;
  try { fd = fs.openSync(full, fs.constants.O_RDONLY | O_NOFOLLOW | O_NONBLOCK); } catch { return null; }
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile()) return null;
    if (st.size > maxBytes) { skipped.tooBig++; return null; }
    const buf = Buffer.alloc(st.size);
    let off = 0;
    while (off < buf.length) {
      const n = fs.readSync(fd, buf, off, buf.length - off, off);
      if (!n) break;
      off += n;
    }
    return buf.subarray(0, off);
  } catch {
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

function snippet(line) {
  if (line.length <= 500) return line;
  const c = line.charCodeAt(499);
  return line.slice(0, c >= 0xd800 && c <= 0xdbff ? 499 : 500);
}

function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    if (truncatedBy) return;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (skip.has(e.name)) continue;
      // Checked again just before going in: a folder swapped for a symlink since readdir is not followed.
      let st;
      try { st = fs.lstatSync(full); } catch { continue; }
      if (st.isDirectory()) walk(full);
      continue;
    }
    if (!e.isFile()) continue;
    const rel = path.relative(root, full);
    if (nameRe && !nameRe.test(rel.split(path.sep).join('/')) && !nameRe.test(e.name)) continue;
    if (filesSearched >= maxFiles) { truncatedBy = 'files'; return; }
    const buf = readRegular(full);
    if (!buf) continue;
    if (buf.includes(0)) { skipped.binary++; continue; }
    filesSearched++;
    const lines = buf.toString('utf8').split(/\r?\n/);
    if (lines[lines.length - 1] === '') lines.pop();
    const batch = [];
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i])) continue;
      if (found >= cap) { truncatedBy = 'matches'; break; }
      batch.push({ path: rel, line: i + 1, text: snippet(lines[i]) });
      found++;
    }
    if (batch.length) parentPort.postMessage({ type: 'matches', matches: batch, filesSearched, skipped });
  }
}

walk(start);
parentPort.postMessage({ type: 'done', filesSearched, skipped, truncatedBy });
