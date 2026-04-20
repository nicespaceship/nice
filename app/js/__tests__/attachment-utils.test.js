import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));

beforeAll(() => {
  const code = readFileSync(resolve(__dirname_local, '..', 'lib/attachment-utils.js'), 'utf-8')
    .replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
});

const fakeFile = (name, type) => ({ name, type, size: 1 });

describe('AttachmentUtils.classify', () => {
  it('classifies images by MIME', () => {
    expect(AttachmentUtils.classify(fakeFile('a.png',  'image/png'))).toBe('image');
    expect(AttachmentUtils.classify(fakeFile('a.webp', 'image/webp'))).toBe('image');
    expect(AttachmentUtils.classify(fakeFile('a.jpg',  'image/jpeg'))).toBe('image');
    expect(AttachmentUtils.classify(fakeFile('a.gif',  'image/gif'))).toBe('image');
  });

  it('classifies PDFs by MIME or extension', () => {
    expect(AttachmentUtils.classify(fakeFile('doc.pdf', 'application/pdf'))).toBe('pdf');
    expect(AttachmentUtils.classify(fakeFile('doc.pdf', ''))).toBe('pdf');
  });

  it('classifies audio by MIME', () => {
    expect(AttachmentUtils.classify(fakeFile('c.mp3', 'audio/mpeg'))).toBe('audio');
    expect(AttachmentUtils.classify(fakeFile('c.wav', 'audio/wav'))).toBe('audio');
  });

  it('classifies video by MIME', () => {
    expect(AttachmentUtils.classify(fakeFile('v.mp4', 'video/mp4'))).toBe('video');
    expect(AttachmentUtils.classify(fakeFile('v.webm', 'video/webm'))).toBe('video');
  });

  it('classifies text by MIME prefix', () => {
    expect(AttachmentUtils.classify(fakeFile('notes.txt', 'text/plain'))).toBe('text');
    expect(AttachmentUtils.classify(fakeFile('main.js',   'text/javascript'))).toBe('text');
  });

  it('classifies text by MIME extras (JSON, YAML, etc.)', () => {
    expect(AttachmentUtils.classify(fakeFile('a.json', 'application/json'))).toBe('text');
    expect(AttachmentUtils.classify(fakeFile('a.yml',  'application/yaml'))).toBe('text');
    expect(AttachmentUtils.classify(fakeFile('a.rtf',  'application/rtf'))).toBe('text');
    expect(AttachmentUtils.classify(fakeFile('a.rtf',  'text/rtf'))).toBe('text');
  });

  it('falls back to extension when MIME is empty', () => {
    expect(AttachmentUtils.classify(fakeFile('notes.md', ''))).toBe('text');
    expect(AttachmentUtils.classify(fakeFile('clip.m4a', ''))).toBe('audio');
    expect(AttachmentUtils.classify(fakeFile('clip.mov', ''))).toBe('video');
  });

  it('falls back to extension when MIME is octet-stream', () => {
    expect(AttachmentUtils.classify(fakeFile('code.rs',   'application/octet-stream'))).toBe('text');
    expect(AttachmentUtils.classify(fakeFile('audio.opus','application/octet-stream'))).toBe('audio');
  });

  it('returns null for unsupported binaries', () => {
    expect(AttachmentUtils.classify(fakeFile('macro.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))).toBeNull();
    expect(AttachmentUtils.classify(fakeFile('archive.zip', 'application/zip'))).toBeNull();
    expect(AttachmentUtils.classify(fakeFile('unknown.xyz', ''))).toBeNull();
  });

  it('returns null for missing file', () => {
    expect(AttachmentUtils.classify(null)).toBeNull();
    expect(AttachmentUtils.classify(undefined)).toBeNull();
  });

  it('is case-insensitive on filename extensions', () => {
    expect(AttachmentUtils.classify(fakeFile('DOC.PDF', ''))).toBe('pdf');
    expect(AttachmentUtils.classify(fakeFile('Script.TS', ''))).toBe('text');
  });
});

describe('AttachmentUtils.maxBytes', () => {
  it('returns per-kind caps', () => {
    expect(AttachmentUtils.maxBytes('image')).toBe(5  * 1024 * 1024);
    expect(AttachmentUtils.maxBytes('pdf')).toBe  (10 * 1024 * 1024);
    expect(AttachmentUtils.maxBytes('text')).toBe (1  * 1024 * 1024);
    expect(AttachmentUtils.maxBytes('audio')).toBe(20 * 1024 * 1024);
    expect(AttachmentUtils.maxBytes('video')).toBe(20 * 1024 * 1024);
  });

  it('defaults to text cap for unknown kinds', () => {
    expect(AttachmentUtils.maxBytes('unknown')).toBe(1 * 1024 * 1024);
    expect(AttachmentUtils.maxBytes(null)).toBe     (1 * 1024 * 1024);
  });
});

describe('AttachmentUtils.requiredCapability', () => {
  it('maps each kind to its model-capability flag', () => {
    expect(AttachmentUtils.requiredCapability('image')).toBe('vision');
    expect(AttachmentUtils.requiredCapability('pdf')).toBe  ('pdf');
    expect(AttachmentUtils.requiredCapability('audio')).toBe('audio');
    expect(AttachmentUtils.requiredCapability('video')).toBe('video');
  });

  it('returns null for text (no capability required)', () => {
    expect(AttachmentUtils.requiredCapability('text')).toBeNull();
  });

  it('returns null for unknown kinds', () => {
    expect(AttachmentUtils.requiredCapability('unknown')).toBeNull();
  });
});

describe('AttachmentUtils constants', () => {
  it('MAX_COUNT is 4', () => {
    expect(AttachmentUtils.MAX_COUNT).toBe(4);
  });

  it('FALLBACK_MODEL is Gemini Flash', () => {
    expect(AttachmentUtils.FALLBACK_MODEL).toBe('gemini-2.5-flash');
  });

  it('CAPS is frozen', () => {
    expect(() => { AttachmentUtils.CAPS.image = 1; }).toThrow();
  });
});
