/**
 * NICE Desktop — search worker
 *
 * Runs a Workspace.search in its own thread so a pattern that backtracks
 * badly can be stopped (Workspace terminates the worker at its time limit)
 * instead of freezing the app.
 *
 * A file is opened without following a symlink at its last step, and a
 * folder is entered only after lstat says it is a folder. A folder swapped
 * for a symlink between that check and the read can still be followed;
 * only a process already running in the workspace can do that, and it
 * gains nothing it does not already have through run().
 *
 * Each match is posted on `port` as soon as it is found ({ type: 'match',
 * match }), so a search stopped at its time limit keeps every match before
 * the slow line, then { type: 'done', truncatedBy }. The counts go into the
 * shared `counts` array (slots in SEARCH_COUNT), current after every file,
 * so Workspace can read them while this thread is stuck in a pattern.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { workerData } = require('worker_threads');
const { _globToRegExp, SEARCH_COUNT } = require('./code-host');

const { root, start, pattern, ignoreCase, glob, cap, maxBytes, maxFiles, skipDirs, port } = workerData;
const counts = new Int32Array(workerData.counts);
const re = new RegExp(pattern, ignoreCase ? 'i' : '');
const nameRe = glob ? _globToRegExp(glob) : null;
// A search that starts inside a node_modules (or build, …) searches the folders of that name below it.
const startNames = new Set(path.relative(root, start).split(path.sep));
const skip = new Map(skipDirs.map((name, i) => [name, i]).filter(([name]) => !startNames.has(name)));
const O_NOFOLLOW = fs.constants.O_NOFOLLOW || 0;
const O_NONBLOCK = fs.constants.O_NONBLOCK || 0;
// Errors that mean the entry is gone or was swapped for a symlink: not counted as unreadable.
const GONE = new Set(['ENOENT', 'ELOOP', 'EMLINK']);
const SNIPPET_CHARS = 500;

let found = 0;
let truncatedBy = null;
const bump = (slot) => Atomics.add(counts, slot, 1);

/* The bytes of `full` if it is still a regular file within the size cap:
   opened without following a symlink at the last step and without
   blocking on a FIFO, then checked on the open handle. */
function readRegular(full) {
  let fd;
  try {
    fd = fs.openSync(full, fs.constants.O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
  } catch (e) {
    if (!GONE.has(e.code)) bump(SEARCH_COUNT.unreadable);
    return null;
  }
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile()) return null;
    if (st.size > maxBytes) { bump(SEARCH_COUNT.tooBig); return null; }
    const buf = Buffer.alloc(st.size);
    let off = 0;
    while (off < buf.length) {
      const n = fs.readSync(fd, buf, off, buf.length - off, off);
      if (!n) break;
      off += n;
    }
    return buf.subarray(0, off);
  } catch {
    bump(SEARCH_COUNT.unreadable);
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

const isHigh = (c) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c) => c >= 0xdc00 && c <= 0xdfff;

/* The line, or up to SNIPPET_CHARS of it centered on the match at `at`
   (a match longer than that from its start), never splitting a surrogate pair. */
function snippet(line, at, len) {
  if (line.length <= SNIPPET_CHARS) return line;
  let from = len >= SNIPPET_CHARS ? at : Math.floor(at + len / 2 - SNIPPET_CHARS / 2);
  from = Math.max(0, Math.min(from, line.length - SNIPPET_CHARS));
  let to = from + SNIPPET_CHARS;
  if (isLow(line.charCodeAt(from))) from++;
  if (isHigh(line.charCodeAt(to - 1))) to--;
  return line.slice(from, to);
}

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    if (!GONE.has(e.code)) bump(SEARCH_COUNT.unreadable);
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    if (truncatedBy) return;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (skip.has(e.name)) { bump(SEARCH_COUNT.dirs + skip.get(e.name)); continue; }
      // Checked again just before going in; see the header for what a racing swap can still do.
      let st;
      try {
        st = fs.lstatSync(full);
      } catch (err) {
        if (!GONE.has(err.code)) bump(SEARCH_COUNT.unreadable);
        continue;
      }
      if (st.isDirectory()) walk(full);
      continue;
    }
    if (!e.isFile()) continue;
    const rel = path.relative(root, full);
    if (nameRe && !nameRe.test(rel.split(path.sep).join('/')) && !nameRe.test(e.name)) continue;
    if (Atomics.load(counts, SEARCH_COUNT.files) >= maxFiles) { truncatedBy = 'files'; return; }
    const buf = readRegular(full);
    if (!buf) continue;
    if (buf.includes(0)) { bump(SEARCH_COUNT.binary); continue; }
    bump(SEARCH_COUNT.files);
    const lines = buf.toString('utf8').split(/\r?\n/);
    if (lines[lines.length - 1] === '') lines.pop();
    for (let i = 0; i < lines.length; i++) {
      const m = re.exec(lines[i]);
      if (!m) continue;
      if (found >= cap) { truncatedBy = 'matches'; return; }
      found++;
      port.postMessage({ type: 'match', match: { path: rel, line: i + 1, text: snippet(lines[i], m.index, m[0].length) } });
    }
  }
}

walk(start);
port.postMessage({ type: 'done', truncatedBy });
