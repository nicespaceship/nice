/**
 * OAuth signup terms gate. #884 made the terms checkbox required on both
 * email signup forms, but the OAuth buttons are type="button" and never
 * trigger the form's native validation — a Google/Microsoft/GitHub signup
 * used to sail past the checkbox on both surfaces. These tests pin the
 * handler-level guard: OAuth from the signup tab requires the checkbox,
 * OAuth from the sign-in tab is untouched.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));

const signInWithOAuth = vi.fn(async () => ({ error: null }));

globalThis.Utils = {
  esc: (s) => String(s ?? ''),
  timeAgo: () => 'just now',
  KEYS: { voiceSample: 'nice-voice-sample', avatarUrl: 'nice-avatar-url', ephemeralSession: 'nice-ephem' },
};
globalThis.State = { get: () => null, set: () => {}, on: () => {}, off: () => {}, onScoped: () => {}, _reset: () => {} };
globalThis.SB = {
  client: { auth: { signInWithOAuth, resetPasswordForEmail: vi.fn(), updateUser: vi.fn() } },
  isReady: () => true,
  auth: { signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), getUser: vi.fn() },
  db: () => ({ list: async () => [], create: async () => ({}), update: async () => ({}), get: async () => null }),
};
globalThis.Router = { navigate: vi.fn(), on: () => {}, path: () => '/', hashQuery: () => ({}) };
globalThis.Notify = { send: vi.fn(), show: vi.fn() };
globalThis.Subscription = { getCurrentPlan: () => 'free', getPlanTier: () => ({ label: 'Free' }) };
globalThis.Gamification = { renderRankBadge: () => '', renderResourceBar: () => '', renderAchievementGallery: () => '' };
globalThis.AuditLog = { log: () => {} };

function loadScriptGlobal(rel) {
  let code = readFileSync(resolve(__dirname_local, '..', rel), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

loadScriptGlobal('views/profile.js');
loadScriptGlobal('lib/auth-modal.js');

describe('ProfileView._handleOAuth — signup terms gate', () => {
  beforeEach(() => {
    signInWithOAuth.mockClear();
    document.body.innerHTML = `
      <div class="auth-error" id="si-error"></div>
      <input type="checkbox" id="su-accept" required />
      <div class="auth-error" id="su-error"></div>
    `;
  });

  it('blocks OAuth from the signup tab when terms are unchecked', async () => {
    await ProfileView._handleOAuth('google', true);
    expect(signInWithOAuth).not.toHaveBeenCalled();
    expect(document.getElementById('su-error').textContent).toMatch(/Terms of Service/);
  });

  it('shows the block on the signup error element, not the sign-in one', async () => {
    await ProfileView._handleOAuth('azure', true);
    expect(document.getElementById('si-error').textContent).toBe('');
    expect(document.getElementById('su-error').textContent).not.toBe('');
  });

  it('proceeds from the signup tab once terms are checked', async () => {
    document.getElementById('su-accept').checked = true;
    await ProfileView._handleOAuth('github', true);
    expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'github' })
    );
    expect(document.getElementById('su-error').textContent).toBe('');
  });

  it('blocks when the checkbox is missing from the DOM (fail closed)', async () => {
    document.getElementById('su-accept').remove();
    await ProfileView._handleOAuth('google', true);
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });

  it('leaves the sign-in tab untouched — no checkbox required', async () => {
    document.getElementById('su-accept').checked = false;
    await ProfileView._handleOAuth('google');
    expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' })
    );
  });
});

describe('AuthModal — signup terms gate', () => {
  beforeEach(() => {
    signInWithOAuth.mockClear();
    document.body.innerHTML = '';
    AuthModal.close();
    AuthModal.open();
  });

  it('blocks Google signup when terms are unchecked', async () => {
    document.getElementById('am-google-btn-su').click();
    await Promise.resolve();
    expect(signInWithOAuth).not.toHaveBeenCalled();
    expect(document.getElementById('am-su-error').textContent).toMatch(/Terms of Service/);
    expect(document.getElementById('am-si-error').textContent).toBe('');
  });

  it('blocks GitHub signup when terms are unchecked', async () => {
    document.getElementById('am-github-btn-su').click();
    await Promise.resolve();
    expect(signInWithOAuth).not.toHaveBeenCalled();
    expect(document.getElementById('am-su-error').textContent).toMatch(/Terms of Service/);
  });

  it('proceeds with Google signup once terms are checked', async () => {
    document.getElementById('am-su-accept').checked = true;
    document.getElementById('am-google-btn-su').click();
    await vi.waitFor(() => expect(signInWithOAuth).toHaveBeenCalled());
    expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' })
    );
  });

  it('sign-in tab OAuth needs no checkbox', async () => {
    document.getElementById('am-google-btn').click();
    await vi.waitFor(() => expect(signInWithOAuth).toHaveBeenCalled());
  });
});

describe('sign-in tab implied-consent note', () => {
  it('AuthModal renders the note in the sign-in form only', () => {
    document.body.innerHTML = '';
    AuthModal.close();
    AuthModal.open();
    const signin = document.getElementById('am-form-signin');
    const signup = document.getElementById('am-form-signup');
    expect(signin.querySelector('.auth-consent-note')?.textContent).toMatch(/By continuing, you agree/);
    expect(signin.querySelectorAll('.auth-consent-note a')).toHaveLength(2);
    expect(signup.querySelector('.auth-consent-note')).toBeNull();
    AuthModal.close();
  });

  it('ProfileView auth surface renders the note in the sign-in form only', () => {
    const el = document.createElement('div');
    ProfileView.render(el);
    const signin = el.querySelector('#form-signin');
    const signup = el.querySelector('#form-signup');
    expect(signin.querySelector('.auth-consent-note')?.textContent).toMatch(/By continuing, you agree/);
    expect(signin.querySelectorAll('.auth-consent-note a')).toHaveLength(2);
    expect(signup.querySelector('.auth-consent-note')).toBeNull();
  });
});
