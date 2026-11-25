import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// _authPrompt is a top-level function in agents.js shared by several views.
// Load just that function, the way a <script> tag publishes it.
const HERE = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(HERE, '../views/agents.js'), 'utf-8');
const found = src.match(/^function _authPrompt\([^)]*\) \{[\s\S]*?^\}/m);
if (!found) throw new Error('_authPrompt not found at column 0 in views/agents.js');
(0, eval)(found[0] + '\nglobalThis._authPrompt = _authPrompt;');

describe('_authPrompt', () => {
  let el;
  beforeEach(() => {
    el = document.createElement('div');
    globalThis.AuthModal = { open: vi.fn() };
  });
  afterEach(() => { delete globalThis.AuthModal; });

  it('opens the sign-in modal for a feature name with an apostrophe', () => {
    _authPrompt(el, "the captain's log");
    expect(el.querySelector('p').textContent).toBe("Sign in to access the captain's log.");
    const btn = el.querySelector('button');
    expect(btn.textContent).toBe('Sign In');
    expect(btn.getAttribute('onclick')).toBeNull();
    btn.click();
    expect(AuthModal.open).toHaveBeenCalledWith("Sign in to access the captain's log");
  });

  it('shows markup in the feature name as text', () => {
    _authPrompt(el, '<img src=x>');
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('p').textContent).toBe('Sign in to access <img src=x>.');
  });

  it('links to the profile page when there is no sign-in modal', () => {
    delete globalThis.AuthModal;
    _authPrompt(el, 'settings');
    expect(el.querySelector('a[href="#/profile"]').textContent).toBe('Sign In');
  });
});
