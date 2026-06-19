/**
 * SettingsView account-deletion gate tests.
 *
 * Account deletion is irreversible: the delete-account edge function deletes
 * the caller's own uid (FKs cascade personal rows / anonymize community
 * content). The client side is the last guard before that call, so this pins:
 *   - the type-to-confirm gate (button disabled until the input trims to
 *     exactly "DELETE"),
 *   - the submit handler's own re-check (a direct form submit with the wrong
 *     text never reaches the edge function),
 *   - the not-connected short-circuit,
 *   - the success teardown (invoke with the confirm body → signOut → wipe
 *     local state → sign the user out of State), and
 *   - error surfacing + button re-enable on failure.
 *
 * Ben owns the live end-to-end deletion test (a throwaway account); this unit
 * suite covers the client logic that decides whether that call fires at all.
 * Mounted via the view-harness; drives real DOM events. SB.auth is overridden
 * to the real object shape (the harness mocks it as a function, but the lib
 * and settings.js both treat SB.auth as an object with signOut()).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installViewMocks, loadModule, mountView } from './helpers/view-harness.js';

const mocks = installViewMocks();
loadModule('views/settings.js');

const USER = { id: 'u1', email: 'founder@nicespaceship.com' };

const els = () => ({
  modal:  document.getElementById('modal-delete-account'),
  input:  document.getElementById('delete-account-confirm'),
  btn:    document.getElementById('confirm-delete-account'),
  error:  document.getElementById('delete-account-error'),
  openBtn:document.getElementById('btn-delete-account'),
  cancel: document.getElementById('cancel-delete-account'),
  form:   document.getElementById('delete-account-form'),
});

const type = (input, val) => {
  input.value = val;
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
};
const submit = async (form) => {
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r)); // flush the async handler
};
const mount = () => mountView(SettingsView, { state: { user: USER } });

beforeEach(() => {
  mocks.SB.isReady = () => false; // most gate tests never touch the network
  mocks.SB.functions = { invoke: vi.fn().mockResolvedValue({ error: null }) };
  mocks.SB.auth = { signOut: vi.fn().mockResolvedValue({}) };
});
afterEach(() => {
  // Restore the shared SB mock so a later test can't inherit a prior spy.
  vi.unstubAllGlobals();
  mocks.SB.isReady = () => false;
  mocks.SB.functions = { invoke: vi.fn() };
  mocks.SB.auth = { signOut: vi.fn() };
});

describe('SettingsView — account-deletion confirm gate', () => {
  it('starts with the confirm button disabled', async () => {
    await mount();
    expect(els().btn.disabled).toBe(true);
  });

  it('enables the button only when the input is exactly DELETE', async () => {
    await mount();
    const { input, btn } = els();
    type(input, 'delete');  expect(btn.disabled).toBe(true);
    type(input, 'DELET');   expect(btn.disabled).toBe(true);
    type(input, 'DELETE');  expect(btn.disabled).toBe(false);
    type(input, '');        expect(btn.disabled).toBe(true);
  });

  it('trims surrounding whitespace before matching', async () => {
    await mount();
    const { input, btn } = els();
    type(input, '  DELETE  ');
    expect(btn.disabled).toBe(false);
  });

  it('opens the modal on the danger button and resets it on cancel', async () => {
    await mount();
    const { modal, input, btn, error, openBtn, cancel } = els();
    openBtn.click();
    expect(modal.classList.contains('open')).toBe(true);
    type(input, 'DELETE');
    error.textContent = 'stale error';
    cancel.click();
    expect(modal.classList.contains('open')).toBe(false);
    expect(input.value).toBe('');
    expect(btn.disabled).toBe(true);
    expect(error.textContent).toBe('');
  });
});

describe('SettingsView — account-deletion submit', () => {
  it('never calls the edge function when the confirmation text is wrong', async () => {
    await mount();
    const { input, form } = els();
    type(input, 'nope');
    await submit(form);
    expect(mocks.SB.functions.invoke).not.toHaveBeenCalled();
  });

  it('blocks deletion and reports it when SB is not connected', async () => {
    await mount();
    const { input, btn, error, form } = els();
    type(input, 'DELETE');
    await submit(form);
    expect(mocks.SB.functions.invoke).not.toHaveBeenCalled();
    expect(error.textContent).toBe('Not connected. Try again.');
    expect(btn.disabled).toBe(false);
  });

  it('invokes delete-account and tears down the session on success', async () => {
    mocks.SB.isReady = () => true;
    vi.stubGlobal('location', { href: '' });
    await mount();
    const { input, form } = els();
    type(input, 'DELETE');
    await submit(form);

    expect(mocks.SB.functions.invoke).toHaveBeenCalledWith('delete-account', { body: { confirm: 'DELETE' } });
    expect(mocks.SB.auth.signOut).toHaveBeenCalled();
    expect(mocks.State.get('user')).toBeNull();
    expect(mocks.Notify.send).toHaveBeenCalled();
    expect(location.href).toBe('/');
  });

  it('surfaces the edge-function error and re-enables the button', async () => {
    mocks.SB.isReady = () => true;
    mocks.SB.functions = { invoke: vi.fn().mockResolvedValue({ error: { message: 'Server exploded' } }) };
    await mount();
    const { input, btn, error, form } = els();
    type(input, 'DELETE');
    await submit(form);

    expect(error.textContent).toBe('Server exploded');
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('Delete my account');
    expect(mocks.SB.auth.signOut).not.toHaveBeenCalled();
    expect(mocks.State.get('user')).toEqual(USER); // session untouched on failure
  });

  it('shows a string error verbatim', async () => {
    mocks.SB.isReady = () => true;
    mocks.SB.functions = { invoke: vi.fn().mockResolvedValue({ error: 'rate limited' }) };
    await mount();
    const { input, error, form } = els();
    type(input, 'DELETE');
    await submit(form);
    expect(error.textContent).toBe('rate limited');
  });
});
