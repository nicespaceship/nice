/**
 * Tests for ConsentPrompt (app/js/lib/consent-prompt.js) — the NICE-1 Phase 0
 * training-data consent ask. Covers the SSOT consent write and the maybeShow
 * guards (already-prompted, already-consented, fresh render). Uses the shared
 * State/localStorage harness from setup.js; only adds the DOM bits it lacks.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── DOM bits setup.js doesn't provide ───────────────────────────────────────
function makeEl() {
  return {
    className: '', innerHTML: '',
    _l: {},
    setAttribute() {},
    classList: { _s: new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);}, contains(c){return this._s.has(c);} },
    addEventListener(ev, fn) { (this._l[ev] ||= []).push(fn); },
    appendChild(c) { return c; },
    querySelector() { return makeEl(); },
    remove() {},
  };
}
let createdEls = [];
globalThis.document = {
  body: makeEl(),
  createElement: () => { const el = makeEl(); createdEls.push(el); return el; },
  querySelector: () => null, // no .wizard-overlay present
  addEventListener() {},
  removeEventListener() {},
};
globalThis.requestAnimationFrame = (fn) => fn();

// ── Load the module under test ──────────────────────────────────────────────
const { readFileSync } = await import('fs');
const { resolve, dirname } = await import('path');
const { fileURLToPath } = await import('url');
const __dir = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(resolve(__dir, '../lib/consent-prompt.js'), 'utf-8')
  .replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
eval(code);

let updateSpy;
let profileMock;

beforeEach(() => {
  // setup.js's beforeEach has already reset State + localStorage by now.
  createdEls = [];
  updateSpy = vi.fn(() => Promise.resolve({}));
  profileMock = { training_consent: false, training_consent_version: null };
  globalThis.SB = {
    isReady: () => true,
    db: () => ({
      update: (...args) => updateSpy(...args),
      get: () => Promise.resolve(profileMock),
    }),
  };
  State.set('user', { id: 'user-1' });
});

describe('ConsentPrompt.setConsent', () => {
  it('writes consent on with timestamp + version', async () => {
    const ok = await ConsentPrompt.setConsent(true);
    expect(ok).toBe(true);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [id, changes] = updateSpy.mock.calls[0];
    expect(id).toBe('user-1');
    expect(changes.training_consent).toBe(true);
    expect(changes.training_consent_version).toBe(ConsentPrompt.VERSION);
    expect(typeof changes.training_consent_at).toBe('string');
  });

  it('records the answer version even when turning consent off', async () => {
    await ConsentPrompt.setConsent(false);
    const [, changes] = updateSpy.mock.calls[0];
    expect(changes.training_consent).toBe(false);
    // Version marks "answered at this version" regardless of yes/no, so the
    // prompt is not re-shown on other devices after a decline.
    expect(changes.training_consent_version).toBe(ConsentPrompt.VERSION);
  });

  it('returns false (no write) when there is no signed-in user', async () => {
    State.set('user', null);
    const ok = await ConsentPrompt.setConsent(true);
    expect(ok).toBe(false);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

describe('ConsentPrompt.maybeShow', () => {
  it('does not render when already prompted at this version', async () => {
    localStorage.setItem('nice-consent-prompted', ConsentPrompt.VERSION);
    await ConsentPrompt.maybeShow();
    expect(createdEls.length).toBe(0);
  });

  it('skips and marks prompted when the user has already consented', async () => {
    profileMock = { training_consent: true, training_consent_version: ConsentPrompt.VERSION };
    await ConsentPrompt.maybeShow();
    expect(createdEls.length).toBe(0);
    expect(localStorage.getItem('nice-consent-prompted')).toBe(ConsentPrompt.VERSION);
  });

  it('renders the prompt for a fresh, un-consented user', async () => {
    await ConsentPrompt.maybeShow();
    expect(createdEls.length).toBe(1);
    expect(createdEls[0].className).toBe('consent-modal-overlay');
  });

  it('does nothing when no user is signed in', async () => {
    State.set('user', null);
    await ConsentPrompt.maybeShow();
    expect(createdEls.length).toBe(0);
  });

  it('does not render when SB is not ready (cannot persist)', async () => {
    globalThis.SB = { isReady: () => false, db: () => ({ get: () => Promise.resolve(profileMock) }) };
    await ConsentPrompt.maybeShow();
    expect(createdEls.length).toBe(0);
  });

  it('does not render when the profile read fails (no valid session)', async () => {
    globalThis.SB = { isReady: () => true, db: () => ({ get: () => Promise.reject(new Error('rls')) }) };
    await ConsentPrompt.maybeShow();
    expect(createdEls.length).toBe(0);
  });
});
