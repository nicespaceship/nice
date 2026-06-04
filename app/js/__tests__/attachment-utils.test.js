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

describe('AttachmentUtils.buildUserContent', () => {
  const img = { kind: 'image', name: 'a.png', dataUrl: 'data:image/png;base64,AAA' };
  const pdf = { kind: 'pdf', name: 'd.pdf', dataUrl: 'data:application/pdf;base64,BBB' };
  const vid = { kind: 'video', name: 'v.mp4', dataUrl: 'data:video/mp4;base64,CCC' };
  const txt = { kind: 'text', name: 'notes.md', text: 'hello from file' };

  it('returns the plain text string when there are no attachments', () => {
    expect(AttachmentUtils.buildUserContent('hi', [])).toBe('hi');
    expect(AttachmentUtils.buildUserContent('hi', null)).toBe('hi');
    expect(AttachmentUtils.buildUserContent('hi', undefined)).toBe('hi');
  });

  it('applies the wrap function to plain text', () => {
    const wrap = (t) => '<<' + t + '>>';
    expect(AttachmentUtils.buildUserContent('hi', [], wrap)).toBe('<<hi>>');
  });

  it('inlines a text-file attachment as a fenced block and stays a string', () => {
    const out = AttachmentUtils.buildUserContent('see file', [txt]);
    expect(typeof out).toBe('string');
    expect(out).toContain('Attached file `notes.md`:');
    expect(out).toContain('```\nhello from file\n```');
    expect(out).toContain('see file');
  });

  it('returns a parts array with an image_url part for an image', () => {
    const out = AttachmentUtils.buildUserContent('look', [img]);
    expect(Array.isArray(out)).toBe(true);
    expect(out[0]).toEqual({ type: 'text', text: 'look' });
    expect(out[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } });
  });

  it('omits the text part when there is no prose, only media', () => {
    const out = AttachmentUtils.buildUserContent('', [img]);
    expect(out).toEqual([{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } }]);
  });

  it('maps pdf to a document part and video to a media part', () => {
    expect(AttachmentUtils.buildUserContent('', [pdf])).toEqual([
      { type: 'document', document: { url: 'data:application/pdf;base64,BBB', name: 'd.pdf' } },
    ]);
    expect(AttachmentUtils.buildUserContent('', [vid])).toEqual([
      { type: 'media', media: { url: 'data:video/mp4;base64,CCC', name: 'v.mp4' } },
    ]);
  });

  it('merges an inlined text file with prose into the text part alongside media', () => {
    const out = AttachmentUtils.buildUserContent('prose', [txt, img]);
    expect(Array.isArray(out)).toBe(true);
    expect(out[0].type).toBe('text');
    expect(out[0].text).toContain('Attached file `notes.md`:');
    expect(out[0].text).toContain('prose');
    expect(out[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } });
  });

  it('applies wrap to the merged text part when media is present', () => {
    const wrap = (t) => '<<' + t + '>>';
    const out = AttachmentUtils.buildUserContent('p', [img], wrap);
    expect(out[0]).toEqual({ type: 'text', text: '<<p>>' });
  });

  it('infers image kind for a legacy attachment with only a dataUrl', () => {
    const out = AttachmentUtils.buildUserContent('', [{ dataUrl: 'data:image/png;base64,ZZZ' }]);
    expect(out).toEqual([{ type: 'image_url', image_url: { url: 'data:image/png;base64,ZZZ' } }]);
  });
});
