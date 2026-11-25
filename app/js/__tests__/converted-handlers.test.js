import { describe, it, expect, vi, beforeEach } from 'vitest';
import { installViewMocks, loadModule, mountView } from './helpers/view-harness.js';

// The inline on*= handlers these views had are now listeners (the desktop
// app's CSP refuses inline handlers). These tests click through them.
installViewMocks();
loadModule('views/profile.js');

const flush = () => new Promise(r => setTimeout(r, 0));

describe('ProfileView sign-in card', () => {
  beforeEach(() => {
    globalThis.SB.client = { auth: { signInWithOAuth: vi.fn(async () => ({ error: null })) } };
  });

  it('switches between sign in and sign up', async () => {
    const { el } = await mountView(ProfileView);
    el.querySelector('.auth-tab[data-tab="signup"]').click();
    expect(el.querySelector('#form-signup').style.display).toBe('');
    expect(el.querySelector('#form-signin').style.display).toBe('none');
    el.querySelector('.auth-tab[data-tab="signin"]').click();
    expect(el.querySelector('#form-signin').style.display).toBe('');
  });

  it('starts OAuth for the provider on the button, and asks for the terms on sign up', async () => {
    const { el } = await mountView(ProfileView);
    el.querySelector('#form-signin [data-oauth="github"]').click();
    await flush();
    expect(SB.client.auth.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ provider: 'github' }));
    SB.client.auth.signInWithOAuth.mockClear();
    el.querySelector('#form-signup [data-oauth="google"]').click();
    await flush();
    expect(SB.client.auth.signInWithOAuth).not.toHaveBeenCalled();
    expect(el.querySelector('#su-error').textContent).toMatch(/accept the Terms/);
  });

  it('submits the sign-in form through its listener without leaving the page', async () => {
    const { el } = await mountView(ProfileView);
    el.querySelector('#si-email').value = 'a@b.co';
    el.querySelector('#si-pass').value = 'secret1234';
    const ev = new Event('submit', { cancelable: true, bubbles: true });
    el.querySelector('#form-signin').dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});

describe('Router error page', () => {
  it('Retry draws the failed route again', async () => {
    window.matchMedia = window.matchMedia || (() => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    loadModule('lib/router.js');
    const el = document.createElement('div');
    document.body.appendChild(el);
    let calls = 0;
    Router.on('/boom', { title: 'Boom', render: () => { calls++; if (calls === 1) throw new Error('first time'); } });
    window.location.hash = '#/boom';
    await new Promise(r => setTimeout(r, 20));   // let that hashchange pass before the router listens
    Router.init(el);
    expect(el.querySelector('.err-boundary')).not.toBeNull();
    el.querySelector('[data-err-action="retry"]').click();
    await new Promise(r => setTimeout(r, 400));
    expect(calls).toBe(2);
    expect(el.querySelector('.err-boundary')).toBeNull();
  });
});
