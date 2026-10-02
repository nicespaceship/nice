/**
 * Settings → Danger Zone → "Sign out of all devices".
 *
 * Every other sign-out in NICE ends only this device's session. This button is
 * the one deliberate way to end them all, so it must ask first, call
 * NICE.signOut with global scope, and recover cleanly when that fails.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installViewMocks, loadModule, mountView } from './helpers/view-harness.js';

const mocks = installViewMocks();
loadModule('views/settings.js');

const USER = { id: 'u1', email: 'founder@nicespaceship.com' };
const mount = (user = USER) => mountView(SettingsView, { state: { user } });
const button = () => document.getElementById('btn-signout-everywhere');
const click = async (el) => {
  el.click();
  await new Promise((r) => setTimeout(r)); // flush the async handler
};

beforeEach(() => {
  vi.stubGlobal('NICE', { signOut: vi.fn().mockResolvedValue(undefined) });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SettingsView — sign out of all devices', () => {
  it('appears only for a signed-in user', async () => {
    // Signed out, Settings renders the shared sign-in prompt instead of the page.
    vi.stubGlobal('_authPrompt', vi.fn());
    await mount(null);
    expect(_authPrompt).toHaveBeenCalled();
    expect(button()).toBeNull();
  });

  it('does nothing when the user cancels the confirmation', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    await mount();
    await click(button());
    expect(confirm).toHaveBeenCalled();
    expect(NICE.signOut).not.toHaveBeenCalled();
  });

  it('ends every session on the account when confirmed', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    await mount();
    await click(button());
    expect(NICE.signOut).toHaveBeenCalledWith({ scope: 'global' });
  });

  it('reports a failure and re-enables the button', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    NICE.signOut.mockRejectedValue(new Error('Network down'));
    await mount();
    await click(button());
    expect(button().disabled).toBe(false);
    expect(mocks.Notify.send).toHaveBeenCalledWith(expect.objectContaining({ title: 'Sign out failed', message: 'Network down' }));
  });
});
