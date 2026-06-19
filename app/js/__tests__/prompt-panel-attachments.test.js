/**
 * PromptPanel attachment-staging pipeline tests — the multimodal launch
 * surface. _stageAttachment() runs the gate stack: classify → reject
 * unsupported → reject oversized → cap at MAX_COUNT → soft-fallback to a
 * capable model → read → stage + render. _onModelSelectChange() is the guard
 * that blocks switching to a model that can't read what's already staged.
 *
 * Mounted via the narrow _buildDOM() seam (init() pulls CoreReactor + six
 * _populate* helpers, too coupled for a unit mount). The model <select> is
 * populated by hand since _populateModelDropdown reads live entitlements.
 * Each test re-mounts and destroy()s for a clean _pendingAttachments — which
 * is exactly the teardown behavior this PR also fixes.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installViewMocks, loadModule } from './helpers/view-harness.js';

const mocks = installViewMocks();
loadModule('lib/attachment-utils.js');
loadModule('views/prompt-panel.js');

// _buildDOM()/destroy() touch these centerpiece modules (CoreReactor.init,
// _ttsStop → CoreVoice.stop + CoreReactor.setState); inert stubs keep the
// mount/teardown path from throwing in the harness.
globalThis.CoreReactor = { init() {}, setState() {} };
globalThis.CoreVoice = { stop() {}, isSpeaking: () => false, isMuted: () => false };

const CATALOG = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', vision: true,  pdf: true,  audio: true, video: true },
  { id: 'grok',             label: 'Grok',             vision: false, pdf: false, audio: false, video: false },
  { id: 'gpt-5-mini',       label: 'GPT-5 Mini',       vision: true,  pdf: false },
];

const pngFile = (name = 'a.png', size) => {
  const f = new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });
  if (size != null) Object.defineProperty(f, 'size', { value: size });
  return f;
};
const rawFile = (name, type) => new File([new Uint8Array([1, 2, 3])], name, { type });
const chipCount = () => document.querySelectorAll('.nice-ai-attach-chip').length;

function mount() {
  PromptPanel._buildDOM();
  const sel = document.getElementById('nice-ai-model');
  sel.innerHTML = `
    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
    <option value="grok">Grok</option>
    <option value="gpt-5-mini">GPT-5 Mini</option>`;
  sel.value = 'gemini-2.5-flash';
  return sel;
}

let sel;
beforeEach(() => {
  PromptPanel.destroy();             // reset module state (incl. _pendingAttachments)
  globalThis.LLM_MODELS = CATALOG.map((m) => ({ ...m }));
  sel = mount();
});
afterEach(() => {
  delete globalThis.LLM_MODELS;
  PromptPanel.destroy();
});

describe('PromptPanel._stageAttachment — gate stack', () => {
  it('stages a valid image on a vision-capable model and renders one chip', async () => {
    await PromptPanel._stageAttachment(pngFile());
    expect(chipCount()).toBe(1);
    expect(sel.value).toBe('gemini-2.5-flash'); // no switch needed
  });

  it('rejects an unsupported file type with a warning and no chip', async () => {
    await PromptPanel._stageAttachment(rawFile('virus.exe', 'application/x-msdownload'));
    expect(chipCount()).toBe(0);
    expect(mocks.Notify.send).toHaveBeenCalledWith(expect.objectContaining({ title: 'Unsupported file' }));
  });

  it('rejects an oversized file with a warning and no chip', async () => {
    await PromptPanel._stageAttachment(pngFile('huge.png', 99 * 1024 * 1024));
    expect(chipCount()).toBe(0);
    expect(mocks.Notify.send).toHaveBeenCalledWith(expect.objectContaining({ title: 'File too large' }));
  });

  it('caps staged attachments at MAX_COUNT (4)', async () => {
    for (let i = 0; i < 5; i++) await PromptPanel._stageAttachment(pngFile('img' + i + '.png'));
    expect(chipCount()).toBe(4);
  });
});

describe('PromptPanel._stageAttachment — soft-fallback', () => {
  it('auto-switches to Gemini Flash when the selected model cannot read the file', async () => {
    sel.value = 'grok'; // text-only, no vision
    await PromptPanel._stageAttachment(pngFile());
    expect(sel.value).toBe('gemini-2.5-flash'); // switched to a vision-capable model
    expect(chipCount()).toBe(1);                // and the image still staged
    expect(mocks.Notify.send).toHaveBeenCalledWith(expect.objectContaining({ title: 'Switched to Gemini 2.5 Flash' }));
  });

  it('does not switch when the selected model already supports the file', async () => {
    sel.value = 'gpt-5-mini'; // has vision
    await PromptPanel._stageAttachment(pngFile());
    expect(sel.value).toBe('gpt-5-mini');
    expect(chipCount()).toBe(1);
  });
});

describe('PromptPanel._onModelSelectChange — guard', () => {
  it('reverts a switch to a model that cannot read a staged attachment', async () => {
    await PromptPanel._stageAttachment(pngFile());     // stage an image (needs vision)
    PromptPanel._onModelSelectChange();                // accept current model → snapshots last-good
    sel.value = 'grok';                                // try switching to a vision-less model
    PromptPanel._onModelSelectChange();
    expect(sel.value).toBe('gemini-2.5-flash');        // reverted
    expect(mocks.Notify.send).toHaveBeenCalledWith(expect.objectContaining({ title: "Can't switch model" }));
  });

  it('allows switching between two models that both support the staged file', async () => {
    await PromptPanel._stageAttachment(pngFile());     // image needs vision
    PromptPanel._onModelSelectChange();
    sel.value = 'gpt-5-mini';                          // also has vision
    PromptPanel._onModelSelectChange();
    expect(sel.value).toBe('gpt-5-mini');              // not reverted
  });
});

describe('PromptPanel.destroy — clears staged attachments', () => {
  it('drops pending attachments so they do not survive into a rebuilt panel', async () => {
    await PromptPanel._stageAttachment(pngFile('first.png'));
    expect(chipCount()).toBe(1);
    PromptPanel.destroy();
    sel = mount();
    await PromptPanel._stageAttachment(pngFile('second.png'));
    expect(chipCount()).toBe(1); // only the new one — the first did not carry over
  });
});
