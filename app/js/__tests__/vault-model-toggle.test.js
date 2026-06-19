/**
 * VaultView (AI Models) tests — the "toggle models like TV channels" core UX.
 * NICE is the LLM provider; users flip which models are active and that drives
 * `enabled_models` everywhere downstream (incl. the prompt-panel capability
 * gate). The view had no coverage.
 *
 * Mounted via the view-harness as a Pro user (so premium toggles render
 * enabled). Tests drive real checkbox change events — no production seams, no
 * behavior change. The catalog/free-vs-premium split is resolved from the real
 * ModelCatalog + TokenConfig rather than hardcoded, so it tracks the catalog.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { installViewMocks, loadModule, mountView } from './helpers/view-harness.js';

const __dir = dirname(fileURLToPath(import.meta.url));

const mocks = installViewMocks();

// model-catalog.js is a UMD module (not the `const X = (()=>{})()` pattern the
// harness promotes), so load it via its CommonJS branch to get the real
// catalog — ids that TokenConfig.isFreeModel/poolFor actually agree with.
const _mcMod = { exports: {} };
new Function('module', 'exports', readFileSync(resolve(__dir, '../lib/model-catalog.js'), 'utf-8'))(_mcMod, _mcMod.exports);
globalThis.ModelCatalog = _mcMod.exports;

loadModule('views/vault.js');

const paidModel = () => ModelCatalog.MODEL_CATALOG.find((m) => !TokenConfig.isFreeModel(m.id));
const freeModel = () => ModelCatalog.MODEL_CATALOG.find((m) => TokenConfig.isFreeModel(m.id));
const toggleFor = (el, id) => el.querySelector(`.vault-toggle input[data-model="${id}"]`);
const fireChange = (cb, checked) => {
  cb.checked = checked;
  cb.dispatchEvent(new window.Event('change', { bubbles: true }));
};

beforeEach(() => {
  // Pro so paid-model toggles render enabled (not locked).
  globalThis.Subscription = { isPro: () => true, getAddons: () => ['claude', 'premium'] };
});
afterEach(() => { delete globalThis.Subscription; });

const mount = () => mountView(VaultView, { state: { enabled_models: {}, token_balance: { pools: {} } } });

describe('VaultView render', () => {
  it('renders the model selector with model cards', async () => {
    const { el } = await mount();
    expect(el.querySelector('.vault-wrap')).toBeTruthy();
    expect(el.querySelectorAll('.vault-model-card').length).toBeGreaterThan(0);
  });

  it('renders a free model as on and locked (its toggle is disabled)', async () => {
    const { el } = await mount();
    const cb = toggleFor(el, freeModel().id);
    expect(cb).toBeTruthy();
    expect(cb.disabled).toBe(true); // free = always available, can't be toggled off
    expect(cb.checked).toBe(true);
  });
});

describe('VaultView model toggle', () => {
  // The per-model grid renders inside the Advanced section (collapsed/`hidden`
  // by default); listeners bind at render time regardless of visibility, and
  // dispatchEvent ignores it, so we never need to open the section.
  it('enables a paid model and persists it to state + localStorage', async () => {
    const { el } = await mount();
    const id = paidModel().id;
    const cb = toggleFor(el, id);
    expect(cb.disabled).toBe(false); // available as Pro
    fireChange(cb, true);

    expect(mocks.State.get('enabled_models')[id]).toBe(true);
    expect(JSON.parse(localStorage.getItem(Utils.KEYS.enabledModels))[id]).toBe(true);
    expect(mocks.Notify.send).toHaveBeenCalledWith(expect.objectContaining({ title: 'Model Enabled' }));
  });

  it('disables a paid model', async () => {
    const { el } = await mount();
    const id = paidModel().id;
    const cb = toggleFor(el, id);
    fireChange(cb, true);
    fireChange(cb, false);

    expect(mocks.State.get('enabled_models')[id]).toBe(false);
    expect(mocks.Notify.send).toHaveBeenCalledWith(expect.objectContaining({ title: 'Model Disabled' }));
  });

  it('marks the model card active in sync with the toggle', async () => {
    const { el } = await mount();
    const cb = toggleFor(el, paidModel().id);
    fireChange(cb, true);
    expect(cb.closest('.vault-model-card').classList.contains('active')).toBe(true);
    fireChange(cb, false);
    expect(cb.closest('.vault-model-card').classList.contains('active')).toBe(false);
  });

  it('ignores toggles on a free model (always on, never written to state)', async () => {
    const { el } = await mount();
    const id = freeModel().id;
    toggleFor(el, id).dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(mocks.State.get('enabled_models')[id]).toBeUndefined();
  });
});
