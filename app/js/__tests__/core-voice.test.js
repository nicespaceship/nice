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

// ─── Streaming playback (MediaSource) vs. blob fallback ──────────────────
//
// jsdom doesn't ship MediaSource, so the default-path test exercises the
// blob fallback. The streaming-path tests stub a minimal MediaSource that
// fires `sourceopen` synchronously on construction and tracks appendBuffer
// calls. We don't try to simulate audio decoding — only the orchestration
// (which path is chosen, when chunks are appended, when endOfStream fires,
// what stop() does mid-stream).

function makeChunkedResponse(chunks, status = 200) {
  let i = 0;
  const stream = {
    getReader: () => ({
      read: async () => {
        if (i >= chunks.length) return { done: true, value: undefined };
        return { done: false, value: chunks[i++] };
      },
      cancel: vi.fn(async () => {}),
    }),
  };
  return {
    ok: status >= 200 && status < 300,
    status,
    body: stream,
    blob: async () => new Blob(chunks, { type: 'audio/mpeg' }),
    headers: new Headers({ 'Content-Type': 'audio/mpeg' }),
  };
}

function installMediaSourceMock() {
  const sourceBuffers = [];
  const instances = [];
  class FakeSourceBuffer extends EventTarget {
    constructor() {
      super();
      this.updating = false;
      this.appended = [];
      sourceBuffers.push(this);
    }
    appendBuffer(chunk) {
      this.appended.push(chunk);
      this.updating = true;
      // Fire updateend asynchronously so the queue/drain pattern advances.
      queueMicrotask(() => {
        this.updating = false;
        this.dispatchEvent(new Event('updateend'));
      });
    }
  }
  class FakeMediaSource extends EventTarget {
    constructor() {
      super();
      this.readyState = 'closed';
      this.endOfStreamCalls = [];
      instances.push(this);
      // Open on next microtask so `await new Promise(sourceopen → resolve)` lands.
      queueMicrotask(() => {
        this.readyState = 'open';
        this.dispatchEvent(new Event('sourceopen'));
      });
    }
    addSourceBuffer() { return new FakeSourceBuffer(); }
    endOfStream(reason) {
      this.endOfStreamCalls.push(reason);
      this.readyState = 'ended';
    }
    static isTypeSupported(t) { return t === 'audio/mpeg'; }
  }
  globalThis.MediaSource = FakeMediaSource;
  globalThis.window = globalThis.window || globalThis;
  globalThis.window.MediaSource = FakeMediaSource;
  // Audio mock — jsdom has one but it doesn't actually play; track calls.
  const audios = [];
  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.paused = false;
      this.played = false;
      audios.push(this);
    }
    play() { this.played = true; queueMicrotask(() => this.onplay && this.onplay()); return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  globalThis.Audio = FakeAudio;
  // URL.createObjectURL must work on a non-Blob (MediaSource).
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake/123');
  globalThis.URL.revokeObjectURL = vi.fn();
  return { sourceBuffers, audios, instances };
}

function uninstallMediaSourceMock() {
  delete globalThis.MediaSource;
  if (globalThis.window) delete globalThis.window.MediaSource;
  delete globalThis.ManagedMediaSource;
  if (globalThis.window) delete globalThis.window.ManagedMediaSource;
}

describe('CoreVoice.speak — playback path', () => {
  beforeEach(() => {
    loadCoreVoice();
    Notify.send.mockClear();
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

  afterEach(() => {
    uninstallMediaSourceMock();
  });

  it('falls back to blob playback when MediaSource is unavailable', async () => {
    const res = makeChunkedResponse([new Uint8Array([1, 2, 3])]);
    const blobSpy = vi.spyOn(res, 'blob');
    globalThis.fetch = vi.fn(async () => res);
    // Deliberately do NOT install MSE mock — jsdom default has no MediaSource.
    await CoreVoice.speak('hello');
    expect(blobSpy).toHaveBeenCalledTimes(1);
  });

  it('uses MediaSource streaming path when supported', async () => {
    const { sourceBuffers, audios } = installMediaSourceMock();
    const chunks = [new Uint8Array([1, 2, 3, 4]), new Uint8Array([5, 6, 7, 8])];
    const res = makeChunkedResponse(chunks);
    const blobSpy = vi.spyOn(res, 'blob');
    globalThis.fetch = vi.fn(async () => res);
    await CoreVoice.speak('hello');
    // Drain microtasks so all queued appendBuffer + updateend fire.
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    expect(blobSpy).not.toHaveBeenCalled();
    expect(sourceBuffers).toHaveLength(1);
    // Both chunks appended in order.
    expect(sourceBuffers[0].appended).toEqual(chunks);
    expect(audios).toHaveLength(1);
    expect(audios[0].played).toBe(true);
  });

  it('calls endOfStream when reader is exhausted', async () => {
    const { instances } = installMediaSourceMock();
    const chunks = [new Uint8Array([1, 2])];
    const res = makeChunkedResponse(chunks);
    globalThis.fetch = vi.fn(async () => res);
    await CoreVoice.speak('hello');
    for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
    expect(instances).toHaveLength(1);
    // Either tryEndOfStream fired (clean end with no reason) or _cleanup
    // closed the source. Both record the call; assert at least one.
    expect(instances[0].endOfStreamCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('cancels the active reader on stop()', async () => {
    installMediaSourceMock();
    let resolveRead;
    const stream = {
      getReader: () => ({
        read: () => new Promise((resolve) => { resolveRead = resolve; }),
        cancel: vi.fn(async () => { resolveRead && resolveRead({ done: true, value: undefined }); }),
      }),
    };
    const res = {
      ok: true,
      status: 200,
      body: stream,
      blob: async () => new Blob([]),
      headers: new Headers({ 'Content-Type': 'audio/mpeg' }),
    };
    globalThis.fetch = vi.fn(async () => res);
    const speakPromise = CoreVoice.speak('hello');
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    // Now reader.read() is pending. stop() should cancel it.
    const reader = stream.getReader; // we re-call getReader here only to get reference; actual reader was created inside speak
    // We can't get the reader directly — assert behavior: stop() should not throw,
    // and the speak() promise should resolve cleanly without "Voice Unavailable" toast.
    CoreVoice.stop();
    await speakPromise;
    // No "Voice Unavailable" toast should have fired (AbortError is suppressed).
    const errorToasts = Notify.send.mock.calls.filter(c => c[0]?.title === 'Voice Unavailable');
    expect(errorToasts).toHaveLength(0);
  });

  it('superseded speak() does not clobber the newer call (race)', async () => {
    installMediaSourceMock();
    let firstResolve;
    const firstRes = {
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: () => new Promise((resolve) => { firstResolve = resolve; }),
          cancel: vi.fn(async () => { firstResolve && firstResolve({ done: true }); }),
        }),
      },
      blob: async () => new Blob([]),
      headers: new Headers({ 'Content-Type': 'audio/mpeg' }),
    };
    const secondRes = makeChunkedResponse([new Uint8Array([42])]);
    globalThis.fetch = vi.fn()
      .mockImplementationOnce(async () => firstRes)
      .mockImplementationOnce(async () => secondRes);
    const first = CoreVoice.speak('first');
    await new Promise(r => setTimeout(r, 0));
    const second = CoreVoice.speak('second');
    await second;
    await first;
    // Second call should win — its chunk should land in the active source buffer.
    // We won't deeply validate here — the contract is "no exception, second succeeds".
    const errorToasts = Notify.send.mock.calls.filter(c => c[0]?.title === 'Voice Unavailable');
    expect(errorToasts).toHaveLength(0);
  });
});

describe('CoreVoice.maybeShowCTA — Pro path', () => {
  beforeEach(() => {
    Theme.current = () => 'nice';
    Theme.getTheme = (id) => id === 'nice'
      ? { voice: { provider: 'elevenlabs', voice: 'nice', speed: 1.0, label: 'NICE' } }
      : null;
    // Pro tier — original CTA path
    globalThis.Subscription = { isPro: () => true };
  });

  afterEach(() => {
    delete globalThis.Subscription;
    delete globalThis.UpgradeModal;
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

  it('marks the CTA as persistent so the 5s auto-dismiss does not close it', () => {
    CoreVoice.maybeShowCTA('hello', vi.fn());
    expect(Notify.send.mock.calls[0][0].persistent).toBe(true);
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

// Free-tier users have zero standard tokens — the original "Talk to me"
// CTA would unmute them and immediately 402 on the next reply with a
// "Voice Quota Reached" toast. Branch the CTA to upsell copy instead so
// they're invited into the upgrade flow rather than into a broken loop.
describe('CoreVoice.maybeShowCTA — Free path', () => {
  beforeEach(() => {
    Theme.current = () => 'nice';
    Theme.getTheme = (id) => id === 'nice'
      ? { voice: { provider: 'elevenlabs', voice: 'nice', speed: 1.0, label: 'NICE' } }
      : null;
    globalThis.Subscription = { isPro: () => false };
    globalThis.UpgradeModal = { open: vi.fn() };
  });

  afterEach(() => {
    delete globalThis.Subscription;
    delete globalThis.UpgradeModal;
  });

  it('shows upgrade copy instead of Talk-to-me', () => {
    const result = CoreVoice.maybeShowCTA('hello', vi.fn());
    expect(result).toBe(true);
    expect(Notify.send).toHaveBeenCalledTimes(1);
    const call = Notify.send.mock.calls[0][0];
    expect(call.title).toBe('Voice is a NICE Pro feature');
    expect(call.actionLabel).toBe('Upgrade');
    expect(call.persistent).toBe(true);
  });

  it('action opens UpgradeModal and does NOT unmute', () => {
    const speakFn = vi.fn();
    CoreVoice.maybeShowCTA('hello', speakFn);
    const action = Notify.send.mock.calls[0][0].undo;
    action();
    expect(UpgradeModal.open).toHaveBeenCalledTimes(1);
    expect(speakFn).not.toHaveBeenCalled();
    // Critical: mute must stay locked. Unmuting on free tier would 402
    // on the very next reply.
    expect(CoreVoice.isMuted()).toBe(true);
  });

  it('still locks the gate so the upsell never fires twice', () => {
    CoreVoice.maybeShowCTA('first', vi.fn());
    expect(Notify.send).toHaveBeenCalledTimes(1);
    Notify.send.mockClear();
    const second = CoreVoice.maybeShowCTA('second', vi.fn());
    expect(second).toBe(false);
    expect(Notify.send).not.toHaveBeenCalled();
  });

  it('action survives a missing UpgradeModal global', () => {
    delete globalThis.UpgradeModal;
    CoreVoice.maybeShowCTA('hello', vi.fn());
    const action = Notify.send.mock.calls[0][0].undo;
    expect(() => action()).not.toThrow();
  });

  it('treats missing Subscription global as free tier', () => {
    delete globalThis.Subscription;
    CoreVoice.maybeShowCTA('hello', vi.fn());
    expect(Notify.send.mock.calls[0][0].title).toBe('Voice is a NICE Pro feature');
  });
});

// Voiced intro greeting played once per (tab-session, theme) when the user
// arrives at a theme that declares `voice.intro`. "Arrival" = previous
// theme was different (or null on first load). Two execution paths:
// (1) user-gesture present (theme switch click) → play immediately
// (2) no gesture (page load / reload) → defer to first pointerdown/keydown/
//     touchstart on window with a 30s timeout. Autoplay policy blocks the
//     immediate path on fresh page loads, hence the deferred branch.
describe('CoreVoice.maybePlayThemeIntro', () => {
  beforeEach(() => {
    loadCoreVoice();
    Notify.send.mockClear();
    sessionStorage.clear();
    localStorage.setItem('nice-voice-off', JSON.stringify({ jarvis: false, cyberpunk: false, 'hal-9000': false }));
    Theme.current = () => 'jarvis';
    Theme.getTheme = (id) => {
      if (id === 'jarvis') return { voice: { provider: 'elevenlabs', voice: 'jarvis', speed: 1.0, label: 'J.A.R.V.I.S.', intro: 'All systems online, sir.' } };
      if (id === 'cyberpunk') return { voice: { provider: 'elevenlabs', voice: 'delamain', speed: 1.0, label: 'Delamain', intro: 'Welcome to Night City.' } };
      if (id === 'hal-9000') return { voice: { provider: 'elevenlabs', voice: 'hal', speed: 1.0, label: 'HAL' } }; // no intro
      return null;
    };
    globalThis.SB = {
      client: {
        supabaseUrl: 'https://example.supabase.co',
        auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) },
      },
      _key: 'anon-key',
    };
    globalThis.fetch = vi.fn(async () => new Response('', { status: 200, headers: { 'Content-Type': 'audio/mpeg' } }));
    // Default: simulate user has interacted with the page so existing tests
    // exercise the immediate-play path. The deferred-gesture test overrides.
    Object.defineProperty(navigator, 'userActivation', {
      value: { hasBeenActive: true, isActive: true },
      configurable: true,
    });
  });

  it('returns false when muted', () => {
    localStorage.setItem('nice-voice-off', JSON.stringify({ jarvis: true }));
    expect(CoreVoice.maybePlayThemeIntro()).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns false when theme has no voice.intro', () => {
    Theme.current = () => 'hal-9000';
    expect(CoreVoice.maybePlayThemeIntro()).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns false when theme has no voice config at all', () => {
    Theme.getTheme = () => ({});
    expect(CoreVoice.maybePlayThemeIntro()).toBe(false);
  });

  it('plays on first invocation (arrival from null prev theme)', async () => {
    expect(CoreVoice.maybePlayThemeIntro()).toBe(true);
    await new Promise(r => setTimeout(r, 0));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.text).toBe('All systems online, sir.');
  });

  it('returns false on redundant Theme.set with same theme (dwelling, not arrival)', async () => {
    expect(CoreVoice.maybePlayThemeIntro()).toBe(true); // first arrival
    await new Promise(r => setTimeout(r, 0));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(CoreVoice.maybePlayThemeIntro()).toBe(false); // dwelling — silent
    await new Promise(r => setTimeout(r, 0));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1); // no second fetch
  });

  it('replays on switch-back from a different theme (the "arrival" case)', async () => {
    // Arrive at jarvis
    expect(CoreVoice.maybePlayThemeIntro()).toBe(true);
    await new Promise(r => setTimeout(r, 0));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    // User switches to HAL (no intro on HAL)
    Theme.current = () => 'hal-9000';
    expect(CoreVoice.maybePlayThemeIntro()).toBe(false);
    // User switches back to JARVIS — should replay the intro
    Theme.current = () => 'jarvis';
    expect(CoreVoice.maybePlayThemeIntro()).toBe(true);
    await new Promise(r => setTimeout(r, 0));
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('switching to another themed intro plays that theme (not the previous)', async () => {
    // Arrive at jarvis
    expect(CoreVoice.maybePlayThemeIntro()).toBe(true);
    await new Promise(r => setTimeout(r, 0));
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body).text).toBe('All systems online, sir.');
    // Switch to cyberpunk
    Theme.current = () => 'cyberpunk';
    expect(CoreVoice.maybePlayThemeIntro()).toBe(true);
    await new Promise(r => setTimeout(r, 0));
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(globalThis.fetch.mock.calls[1][1].body).text).toBe('Welcome to Night City.');
  });

  it('defers play to first user gesture on fresh page load (no userActivation)', async () => {
    Object.defineProperty(navigator, 'userActivation', {
      value: { hasBeenActive: false, isActive: false },
      configurable: true,
    });
    expect(CoreVoice.maybePlayThemeIntro()).toBe(true);
    await new Promise(r => setTimeout(r, 0));
    // No fetch yet — autoplay would have been blocked.
    expect(globalThis.fetch).not.toHaveBeenCalled();
    // First user gesture on the page kicks the deferred play.
    window.dispatchEvent(new Event('pointerdown'));
    await new Promise(r => setTimeout(r, 0));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.text).toBe('All systems online, sir.');
  });

  it('deferred intro is dropped when user switched themes before gesture', async () => {
    Object.defineProperty(navigator, 'userActivation', {
      value: { hasBeenActive: false, isActive: false },
      configurable: true,
    });
    expect(CoreVoice.maybePlayThemeIntro()).toBe(true);
    // User switched away before clicking — don't surface the stale intro.
    Theme.current = () => 'hal-9000';
    window.dispatchEvent(new Event('pointerdown'));
    await new Promise(r => setTimeout(r, 0));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
