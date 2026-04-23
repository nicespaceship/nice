/**
 * ProfileView voice-sample storage helpers. The Drafter agent reads
 * Utils.KEYS.voiceSample via WorkflowEngine._resolvePersonaContext —
 * these tests pin down the contract on the write side so the two
 * modules can evolve independently without the integration drifting.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));

// Minimal globals — ProfileView references Utils, State, SB, Router,
// Notify, Subscription, Gamification. We don't render the full profile
// here, just call the exposed _readVoiceSample / _saveVoiceSample
// helpers, so only Utils + a blank Notify are needed.
globalThis.Utils = {
  esc: (s) => String(s ?? ''),
  timeAgo: () => 'just now',
  KEYS: { voiceSample: 'nice-voice-sample', avatarUrl: 'nice-avatar-url', ephemeralSession: 'nice-ephem' },
};
globalThis.State = {
  get: () => null, set: () => {}, on: () => {}, off: () => {},
  _reset: () => {},
};
globalThis.SB = {
  client: null, isReady: () => false,
  auth: { signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), getUser: vi.fn() },
  db: () => ({ list: async () => [], create: async () => ({}), update: async () => ({}), get: async () => null }),
};
globalThis.Router = { navigate: vi.fn(), on: () => {}, path: () => '/' };
globalThis.Notify = { send: vi.fn(), show: vi.fn() };
globalThis.Subscription = { getCurrentPlan: () => 'free', getPlanTier: () => ({ label: 'Free' }) };
globalThis.Gamification = { renderRankBadge: () => '', renderResourceBar: () => '', renderAchievementGallery: () => '' };
globalThis.AuditLog = { log: () => {} };

function loadViewGlobal(rel) {
  let code = readFileSync(resolve(__dirname_local, '..', rel), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}

loadViewGlobal('views/profile.js');

describe('ProfileView — voice sample storage', () => {
  beforeEach(() => {
    try { localStorage.removeItem('nice-voice-sample'); } catch {}
  });

  it('_readVoiceSample returns empty string when nothing is stored', () => {
    expect(ProfileView._readVoiceSample()).toBe('');
  });

  it('_saveVoiceSample persists trimmed content and _readVoiceSample reads it back', () => {
    const ok = ProfileView._saveVoiceSample('   short and direct, no filler.   \n');
    expect(ok).toBe(true);
    expect(ProfileView._readVoiceSample()).toBe('short and direct, no filler.');
  });

  it('_saveVoiceSample with empty input clears the key', () => {
    ProfileView._saveVoiceSample('seed content');
    expect(ProfileView._readVoiceSample()).toBe('seed content');
    ProfileView._saveVoiceSample('');
    expect(ProfileView._readVoiceSample()).toBe('');
  });

  it('_saveVoiceSample with only whitespace also clears the key', () => {
    ProfileView._saveVoiceSample('seed');
    ProfileView._saveVoiceSample('   \n\t  ');
    expect(ProfileView._readVoiceSample()).toBe('');
  });

  it('uses Utils.KEYS.voiceSample as the localStorage key (SSOT contract)', () => {
    ProfileView._saveVoiceSample('testing ssot');
    expect(localStorage.getItem(Utils.KEYS.voiceSample)).toBe('testing ssot');
  });

  it('_saveVoiceSample returns false gracefully when localStorage throws', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => { throw new Error('storage unavailable'); },
    });
    const ok = ProfileView._saveVoiceSample('boom');
    expect(ok).toBe(false);
    Object.defineProperty(globalThis, 'localStorage', original);
  });
});
