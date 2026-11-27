// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { createRecentFolders, MAX } = require('../recent-folders.js');

let tmp, file, clock;
const make = () => createRecentFolders({ file, now: () => ++clock });
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nice-recent-')); file = path.join(tmp, 'sub', 'recent.json'); clock = 0; });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('recent folders', () => {
  it('starts empty when there is no file', () => {
    expect(make().list()).toEqual([]);
  });

  it('puts the newest folder first and keeps an id when a folder comes back', () => {
    const r = make();
    const a = r.add('/work/alpha');
    r.add('/work/beta');
    const again = r.add('/work/alpha');
    expect(again.id).toBe(a.id);
    expect(r.list().map(e => e.name)).toEqual(['alpha', 'beta']);
    expect(r.list()[0]).toMatchObject({ root: '/work/alpha', openedAt: 3 });
  });

  it('saves to disk, private to the user, and reads it back', () => {
    const a = make().add('/work/alpha');
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    const r2 = make();
    expect(r2.get(a.id)).toMatchObject({ id: a.id, root: '/work/alpha', name: 'alpha' });
  });

  it('keeps at most MAX folders', () => {
    const r = make();
    for (let i = 0; i < MAX + 3; i++) r.add('/work/f' + i);
    const list = r.list();
    expect(list).toHaveLength(MAX);
    expect(list[0].name).toBe('f' + (MAX + 2));
  });

  it('removes by id and leaves unknown ids alone', () => {
    const r = make();
    const a = r.add('/work/alpha');
    r.add('/work/beta');
    expect(r.remove('nope')).toBe(false);
    expect(r.remove(a.id)).toBe(true);
    expect(r.get(a.id)).toBeNull();
    expect(make().list().map(e => e.name)).toEqual(['beta']);
  });

  it('ignores a damaged file and entries that are not absolute paths', () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{not json');
    expect(make().list()).toEqual([]);
    fs.writeFileSync(file, JSON.stringify([{ id: 'x', root: 'relative/dir' }, { id: 'y', root: '/ok' }, null, { root: '/no-id' }]));
    expect(make().list().map(e => e.id)).toEqual(['y']);
  });

  it('names a disk root by its path', () => {
    expect(make().add('/').name).toBe('/');
  });
});
