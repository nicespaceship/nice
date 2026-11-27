'use strict';
/**
 * Code's recent folders, kept by the desktop app so the page never names a
 * path. A folder joins the list only once it has been opened through the
 * native folder dialog; the page gets each entry's id, name and path, and
 * reopens one by its id. Saved as JSON in the app's data folder, newest
 * first, at most MAX entries.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX = 20;

function createRecentFolders({ file, now = () => Date.now() }) {
  let entries = null;

  function _load() {
    if (entries) return entries;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      entries = (Array.isArray(data) ? data : []).filter(e =>
        e && typeof e.id === 'string' && typeof e.root === 'string' && path.isAbsolute(e.root));
    } catch {
      entries = [];
    }
    return entries;
  }

  function _save() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(entries), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  const _view = (e) => ({ id: e.id, root: e.root, name: path.basename(e.root) || e.root, openedAt: e.openedAt });

  return {
    /** Every entry, newest first. */
    list() {
      return _load().map(_view);
    },
    /** The entry for an id, or null. */
    get(id) {
      const e = _load().find(x => x.id === id);
      return e ? _view(e) : null;
    },
    /** Puts a folder (its real path) at the top, keeping its id if it was already listed. */
    add(root) {
      const list = _load();
      const had = list.find(x => x.root === root);
      const entry = { id: had ? had.id : crypto.randomUUID(), root, openedAt: now() };
      entries = [entry, ...list.filter(x => x.root !== root)].slice(0, MAX);
      _save();
      return _view(entry);
    },
    /** Takes an entry off the list; the folder itself is untouched. */
    remove(id) {
      const list = _load();
      const next = list.filter(x => x.id !== id);
      if (next.length === list.length) return false;
      entries = next;
      _save();
      return true;
    },
  };
}

module.exports = { createRecentFolders, MAX };
