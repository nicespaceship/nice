import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(resolve(here, '..', 'lib/preview-panel.js'), 'utf-8')
  .replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
eval(code);

describe('PreviewPanel agent output', () => {
  beforeEach(() => {
    window.__ran = 0;
    document.body.innerHTML = `
      <div id="preview-panel">
        <div class="preview-iframe-wrap"><iframe id="preview-iframe"></iframe></div>
        <div id="preview-output" style="display:none"></div>
      </div>`;
  });

  it("renders a reply's HTML in a frame with every sandbox permission off", () => {
    const html = '<h1>Launch page</h1><img src="x" onerror="window.__ran++"><script>window.__ran++</script>';
    expect(PreviewPanel.detectAndOpen(html)).toBe(true);
    const output = document.getElementById('preview-output');
    const frame = output.querySelector('iframe.preview-output-frame');
    expect(frame).toBeTruthy();
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toBe(html);
    expect(output.children.length).toBe(1);
    expect(output.querySelector('img, script, h1')).toBeNull();
    expect(window.__ran).toBe(0);
  });

  it('replaces the previous output instead of stacking it', () => {
    PreviewPanel.showOutput('<p>first</p>');
    PreviewPanel.showOutput('<p>second</p>');
    const frames = document.querySelectorAll('#preview-output iframe');
    expect(frames.length).toBe(1);
    expect(frames[0].getAttribute('srcdoc')).toBe('<p>second</p>');
  });
});
