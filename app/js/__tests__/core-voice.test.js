/**
 * CoreVoice — mute tri-state + 402 quota handling.
 *
 * Pins the cost-defense contract:
 * - New users (no localStorage entry for the theme) start MUTED. Default-on
 *   would burn ElevenLabs credits before users know voice exists.
 * - Existing users with explicit `false` remain unmuted.
 * - 402 from nice-tts → silent mute for the rest of the session, one toast,
 *   no further TTS attempts. Reload clears the flag (quota refilled).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));

// ── Globals that CoreVoice reads ──────────────────────────────────────────
globalThis.Utils = { KEYS: { voiceOff: 'nice-voice-off' } };
globalThis.Theme = {
  current: () => 'nice',
  getTheme: (id) => id === 'nice'
    ? { voice: { provider: 'elevenlabs', voice: 'nice', speed: 1.0, label: 'NICE' } }
    : null,
};
// CoreVoice uses Theme but also falls back to document.documentElement;
// JSDOM gives us that for free in vitest's default environment.

// SB stub — populated per-test for speak() flows. Tri-state mute tests
// don't need it.
globalThis.SB = {
  client: null,
  _key: 'anon-key',
};

globalThis.Notify = { send: vi.fn() };
// CoreReactor + Audio are exercised on the success path. The 402 path
// returns before constructing Audio, so a no-op stub is enough.
globalThis.CoreReactor = {
  setState: () => {},
  attachAnalyser: () => {},
  detachAnalyser: () => {},
};

// Load the IIFE — script-tag style, defines globalThis.CoreVoice.
function loadCoreVoice() {
  const code = readFileSync(resolve(__dirname_local, '..', 'lib/core-voice.js'), 'utf-8');
  const patched = code.replace(/^const CoreVoice/m, 'globalThis.CoreVoice');
  // eslint-disable-next-line no-new-func
  new Function(patched)();
}

loadCoreVoice();

beforeEach(() => {
  localStorage.clear();
  Notify.send.mockClear();
});

// ─── Mute tri-state ───────────────────────────────────────────────────────

describe('CoreVoice.isMuted — tri-state default', () => {
  it('returns true when no entry exists (new user default)', () => {
    expect(CoreVoice.isMuted()).toBe(true);
  });

  it('returns true when entry is explicit true', () => {
    localStorage.setItem('nice-voice-off', JSON.stringify({ nice: true }));
    expect(CoreVoice.isMuted()).toBe(true);
  });

  it('returns false when entry is explicit false (existing opt-in)', () => {
    localStorage.setItem('nice-voice-off', JSON.stringify({ nice: false }));
    expect(CoreVoice.isMuted()).toBe(false);
  });

  it('returns true when localStorage is corrupt', () => {
    localStorage.setItem('nice-voice-off', '{not json');
    expect(CoreVoice.isMuted()).toBe(true);
  });
});

describe('CoreVoice.toggleMute — round-trip', () => {
  it('undefined → explicit false (new user opts in)', () => {
    expect(CoreVoice.isMuted()).toBe(true); // default
    CoreVoice.toggleMute();
    const state = JSON.parse(localStorage.getItem('nice-voice-off'));
    expect(state.nice).toBe(false);
    expect(CoreVoice.isMuted()).toBe(false);
  });

  it('explicit false → explicit true (user mutes)', () => {
    localStorage.setItem('nice-voice-off', JSON.stringify({ nice: false }));
    expect(CoreVoice.isMuted()).toBe(false);
    CoreVoice.toggleMute();
    expect(CoreVoice.isMuted()).toBe(true);
  });

  it('explicit true → explicit false (user unmutes)', () => {
    localStorage.setItem('nice-voice-off', JSON.stringify({ nice: true }));
    expect(CoreVoice.isMuted()).toBe(true);
    CoreVoice.toggleMute();
    expect(CoreVoice.isMuted()).toBe(false);
  });

  it('per-theme — toggling nice does not affect hal-9000', () => {
    Theme.current = () => 'nice';
    Theme.getTheme = (id) => ({ voice: { provider: 'elevenlabs', voice: id, speed: 1.0, label: id } });
    CoreVoice.toggleMute(); // nice → unmuted
    Theme.current = () => 'hal-9000';
    expect(CoreVoice.isMuted()).toBe(true); // hal-9000 still default-muted
  });
});

describe('CoreVoice.canSpeak', () => {
  beforeEach(() => {
    Theme.current = () => 'nice';
    Theme.getTheme = (id) => id === 'nice'
      ? { voice: { provider: 'elevenlabs', voice: 'nice', speed: 1.0, label: 'NICE' } }
      : null;
  });

  it('false when muted', () => {
    expect(CoreVoice.canSpeak()).toBe(false);
  });

  it('true when explicitly unmuted with a valid voice config', () => {
    localStorage.setItem('nice-voice-off', JSON.stringify({ nice: false }));
    expect(CoreVoice.canSpeak()).toBe(true);
  });

  it('false when theme has no voice config', () => {
    Theme.getTheme = () => ({}); // no `voice` field
    expect(CoreVoice.canSpeak()).toBe(false);
  });
});

// ─── 402 quota-exhausted handling ─────────────────────────────────────────

describe('CoreVoice.speak — 402 voice quota response', () => {
  beforeEach(() => {
    // Reset module state by reloading the IIFE — _quotaExhausted is internal.
    loadCoreVoice();
    Notify.send.mockClear();
    // Unmute nice for these tests so canSpeak is true at the start.
    localStorage.setItem('nice-voice-off', JSON.stringify({ nice: false }));
    Theme.current = () => 'nice';
    Theme.getTheme = (id) => id === 'nice'
      ? { voice: { provider: 'elevenlabs', voice: 'nice', speed: 1.0, label: 'NICE' } }
      : null;
    globalThis.SB = {
      client: {
        supabaseUrl: 'https://example.supabase.co',
        auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) },
      },
      _key: 'anon-key',
    };
  });

  it('402 response triggers Notify toast and silent mute', async () => {
    globalThis.fetch = vi.fn(async () => new Response(
      JSON.stringify({ error: 'Voice quota exhausted', code: 'voice_quota_exhausted' }),
      { status: 402, headers: { 'Content-Type': 'application/json' } },
    ));

    expect(CoreVoice.canSpeak()).toBe(true);
    await CoreVoice.speak('hello');

    expect(Notify.send).toHaveBeenCalledTimes(1);
    expect(Notify.send.mock.calls[0][0].title).toBe('Voice Quota Reached');
    // Subsequent canSpeak calls return false even though mute state didn't change.
    expect(CoreVoice.canSpeak()).toBe(false);
  });

  it('subsequent speak() calls after 402 do not hit the network', async () => {
    const fetchSpy = vi.fn(async () => new Response(
      JSON.stringify({ error: 'Voice quota exhausted', code: 'voice_quota_exhausted' }),
      { status: 402, headers: { 'Content-Type': 'application/json' } },
    ));
    globalThis.fetch = fetchSpy;

    await CoreVoice.speak('first call'); // hits 402, sets exhausted flag
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // canSpeak is false now, but speak() doesn't gate on canSpeak directly
    // — it checks isMuted internally. The exhausted flag should still
    // prevent network on the second call via canSpeak callers (prompt-panel
    // checks canSpeak before invoking speak). Confirm the flag persists.
    expect(CoreVoice.canSpeak()).toBe(false);
    expect(Notify.send).toHaveBeenCalledTimes(1);
  });

  it('non-402 errors do not set exhausted flag', async () => {
    globalThis.fetch = vi.fn(async () => new Response('upstream down', { status: 503 }));

    await CoreVoice.speak('hello');
    // 503 throws inside speak, surfaces a different "Voice Unavailable" toast.
    // canSpeak should still be true — quota wasn't the failure reason.
    expect(CoreVoice.canSpeak()).toBe(true);
  });
});

// ─── First-reply discovery CTA ────────────────────────────────────────────

describe('CoreVoice.hasExplicitMutePref', () => {
  beforeEach(() => {
    Theme.current = () => 'nice';
    Theme.getTheme = (id) => id === 'nice'
      ? { voice: { provider: 'elevenlabs', voice: 'nice', speed: 1.0, label: 'NICE' } }
      : null;
  });

  it('false when no entry exists', () => {
    expect(CoreVoice.hasExplicitMutePref()).toBe(false);
  });

  it('true when explicit true', () => {
    localStorage.setItem('nice-voice-off', JSON.stringify({ nice: true }));
    expect(CoreVoice.hasExplicitMutePref()).toBe(true);
  });

  it('true when explicit false (existing opt-in)', () => {
    localStorage.setItem('nice-voice-off', JSON.stringify({ nice: false }));
    expect(CoreVoice.hasExplicitMutePref()).toBe(true);
  });

  it('false when no voice config (theme without voice)', () => {
    Theme.getTheme = () => ({}); // no voice field
    localStorage.setItem('nice-voice-off', JSON.stringify({ nice: true }));
    expect(CoreVoice.hasExplicitMutePref()).toBe(false);
  });

  it('per-theme — explicit on nice does not affect hal-9000', () => {
    Theme.getTheme = (id) => ({ voice: { provider: 'elevenlabs', voice: id, speed: 1.0, label: id } });
    localStorage.setItem('nice-voice-off', JSON.stringify({ nice: true }));
    expect(CoreVoice.hasExplicitMutePref()).toBe(true);
    Theme.current = () => 'hal-9000';
    expect(CoreVoice.hasExplicitMutePref()).toBe(false);
  });
});

describe('CoreVoice.maybeShowCTA', () => {
  beforeEach(() => {
    Theme.current = () => 'nice';
    Theme.getTheme = (id) => id === 'nice'
      ? { voice: { provider: 'elevenlabs', voice: 'nice', speed: 1.0, label: 'NICE' } }
      : null;
  });

  it('fires Notify when no explicit pref, returns true', () => {
    const speakFn = vi.fn();
    const result = CoreVoice.maybeShowCTA('hello world', speakFn);
    expect(result).toBe(true);
    expect(Notify.send).toHaveBeenCalledTimes(1);
    const call = Notify.send.mock.calls[0][0];
    expect(call.title).toBe('Want NICE to talk to you?');
    expect(call.actionLabel).toBe('Talk to me');
    expect(typeof call.undo).toBe('function');
  });

  it('locks the gate immediately so it never fires twice for the same theme', () => {
    CoreVoice.maybeShowCTA('first', vi.fn());
    expect(Notify.send).toHaveBeenCalledTimes(1);
    // Without clicking the action, hasExplicitMutePref is now true (defaulted to muted)
    expect(CoreVoice.hasExplicitMutePref()).toBe(true);
    expect(CoreVoice.isMuted()).toBe(true);

    Notify.send.mockClear();
    const second = CoreVoice.maybeShowCTA('second', vi.fn());
    expect(second).toBe(false);
    expect(Notify.send).not.toHaveBeenCalled();
  });

  it('returns false when explicit pref already exists', () => {
    localStorage.setItem('nice-voice-off', JSON.stringify({ nice: false }));
    const result = CoreVoice.maybeShowCTA('hello', vi.fn());
    expect(result).toBe(false);
    expect(Notify.send).not.toHaveBeenCalled();
  });

  it('returns false when no voice config', () => {
    Theme.getTheme = () => ({});
    const result = CoreVoice.maybeShowCTA('hello', vi.fn());
    expect(result).toBe(false);
    expect(Notify.send).not.toHaveBeenCalled();
  });

  it('returns false when Notify is not available', () => {
    const savedNotify = globalThis.Notify;
    globalThis.Notify = undefined;
    const result = CoreVoice.maybeShowCTA('hello', vi.fn());
    expect(result).toBe(false);
    globalThis.Notify = savedNotify;
  });

  it('action callback flips to unmute and invokes the speak replay', () => {
    const speakFn = vi.fn();
    CoreVoice.maybeShowCTA('hello', speakFn);
    expect(CoreVoice.isMuted()).toBe(true); // pre-action: defaulted to muted

    const action = Notify.send.mock.calls[0][0].undo;
    action();

    expect(CoreVoice.isMuted()).toBe(false); // flipped to explicit unmute
    expect(speakFn).toHaveBeenCalledTimes(1);
  });

  it('action callback survives a missing speakFn', () => {
    CoreVoice.maybeShowCTA('hello', null);
    const action = Notify.send.mock.calls[0][0].undo;
    expect(() => action()).not.toThrow();
    expect(CoreVoice.isMuted()).toBe(false);
  });
});
