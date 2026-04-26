/* ═══════════════════════════════════════════════════════════════════
   NICE — Core Voice
   Single source of truth for theme-pluggable text-to-speech. Each theme
   declares its voice on its `THEMES` entry:

     { id:'jarvis', voice: { provider, voice, speed, model?, label } }

   `provider` and `voice` are forwarded to the `nice-tts` edge function
   which resolves them to a backend voice ID (ElevenLabs etc.). Themes
   without a registered voice are silent — `getConfig()` returns null
   and `canSpeak()` is false.

   `model` is optional and ElevenLabs-only — when set on a theme, the
   edge function uses that model_id instead of the default
   `eleven_turbo_v2_5`. Allowlisted: turbo_v2_5, multilingual_v2, v3.
   v3 is now usable thanks to the streaming endpoint (PR landing here);
   per-theme opt-in is a one-line `model:` change in nice.js. The
   free-tier gate forces turbo regardless of what the client sends.

   Mute state is persisted per-theme in localStorage so toggling
   J.A.R.V.I.S. off doesn't also mute future themed voices.

   New users start MUTED — `isMuted()` defaults to true when no entry
   exists for the active theme. TTS is the most expensive thing NICE
   ships per character; default-on would burn ElevenLabs credits before
   users even know voice exists. Users either discover the speaker
   toggle in the prompt panel themselves OR see the first-reply CTA
   ("Want NICE to talk to you?") fired by `maybeShowCTA` on the first
   eligible reply. The CTA fires at most once per theme — opening it
   writes the explicit-mute pref so the gate flips regardless of which
   button the user takes. Existing users with explicit `false` entries
   are unaffected by both paths.

   Coupling: on play, drives the centerpiece via CoreReactor.setState
   ('speaking') + attachAnalyser. The post-end state (idle vs streaming
   while the LLM keeps producing text) is the caller's responsibility —
   pass `opts.onEnd` to `speak()` and apply your own state there.

   Playback path: nice-tts hits the ElevenLabs streaming endpoint and
   returns chunked audio/mpeg. CoreVoice plays it progressively via
   MediaSource where supported (Chrome/Firefox/Edge — big v3 latency
   win) and falls back to the buffered-blob path on Safari where MSE
   for audio/mpeg has historically been unreliable. Both paths share
   the same lifecycle hooks (CoreReactor wiring, onStart/onEnd, abort).
═══════════════════════════════════════════════════════════════════ */
const CoreVoice = (() => {
  let _audio = null;
  let _blobUrl = null;
  let _abort = null;
  let _endHook = null;
  let _mediaSource = null;
  let _reader = null;
  // Set true after the edge function returns 402 (voice quota exhausted).
  // Skips further TTS calls until the next page load — avoids hammering the
  // pool-check endpoint with requests we know will fail. Quota refills with
  // billing cycle / top-up; reload picks up the new balance.
  let _quotaExhausted = false;

  function getConfig() {
    if (typeof Theme === 'undefined' || !Theme.getTheme) return null;
    const id = (typeof Theme.current === 'function')
      ? Theme.current()
      : (document.documentElement.getAttribute('data-theme') || '');
    const t = Theme.getTheme(id);
    return (t && t.voice) ? t.voice : null;
  }

  function _activeThemeId() {
    return (typeof Theme !== 'undefined' && typeof Theme.current === 'function')
      ? Theme.current()
      : (document.documentElement.getAttribute('data-theme') || '');
  }

  function _muteKey() {
    return (typeof Utils !== 'undefined' && Utils.KEYS && Utils.KEYS.voiceOff) || 'nice-voice-off';
  }

  function isMuted() {
    if (!getConfig()) return true;
    const id = _activeThemeId();
    try {
      const state = JSON.parse(localStorage.getItem(_muteKey()) || '{}');
      // Tri-state: explicit `true` = muted, explicit `false` = unmuted,
      // undefined = default-muted for new users (cost defense). Existing
      // users with an explicit `false` entry from before this change keep
      // their preference.
      return state[id] !== false;
    } catch { return true; }
  }

  function toggleMute() {
    const id = _activeThemeId();
    if (!getConfig()) return;
    let state = {};
    try { state = JSON.parse(localStorage.getItem(_muteKey()) || '{}'); } catch {}
    // Compute next state from isMuted() rather than `!state[id]` so the
    // tri-state default-muted logic round-trips: undefined → toggle ON,
    // explicit true → toggle OFF, explicit false → toggle ON.
    const nextMuted = !isMuted();
    state[id] = nextMuted;
    localStorage.setItem(_muteKey(), JSON.stringify(state));
    if (nextMuted) stop();
  }

  function canSpeak() { return !!getConfig() && !isMuted() && !_quotaExhausted; }

  function isSpeaking() { return !!_audio && !_audio.paused; }

  // Detect the best available progressive-playback path for audio/mpeg.
  // Returns 'managed' (Safari iOS 17.1+), 'standard' (Chrome/Firefox/Edge),
  // or null (fall back to buffered blob playback).
  function _pickStreamPath() {
    if (typeof window === 'undefined') return null;
    try {
      if ('ManagedMediaSource' in window
          && typeof window.ManagedMediaSource.isTypeSupported === 'function'
          && window.ManagedMediaSource.isTypeSupported('audio/mpeg')) {
        return 'managed';
      }
      if ('MediaSource' in window
          && typeof window.MediaSource.isTypeSupported === 'function'
          && window.MediaSource.isTypeSupported('audio/mpeg')) {
        return 'standard';
      }
    } catch {}
    return null;
  }

  function _wireAudioLifecycle(audio, abortCtrl, opts) {
    audio.onplay = () => {
      if (typeof CoreReactor !== 'undefined') {
        CoreReactor.setState('speaking');
        CoreReactor.attachAnalyser(audio);
      }
      if (opts && opts.onStart) { try { opts.onStart(); } catch {} }
    };
    const finish = () => {
      // Guard against finish firing for a superseded call after a newer
      // speak() has taken over _audio / _abort.
      if (_abort && _abort !== abortCtrl) return;
      if (typeof CoreReactor !== 'undefined') CoreReactor.detachAnalyser();
      _cleanup();
      const hook = _endHook; _endHook = null;
      if (hook) { try { hook(); } catch {} }
    };
    audio.onended = finish;
    audio.onerror = finish;
  }

  /**
   * Fetch a TTS clip from the `nice-tts` edge function and play it.
   * Cancels any in-flight clip first. `opts.onStart` fires on audio
   * play; `opts.onEnd` fires on natural end, error, OR explicit stop().
   */
  async function speak(text, opts) {
    const tv = getConfig();
    if (!text || !tv || isMuted()) return;
    if (typeof SB === 'undefined' || !SB.client) return;
    const c = SB.client;
    const supabaseUrl = c.supabaseUrl || c._supabaseUrl;
    if (!supabaseUrl) return;

    stop();
    _endHook = (opts && opts.onEnd) || null;
    // Capture our controller locally so this call's fetch uses OUR signal,
    // not whatever a later speak() overwrites `_abort` with. Also used as a
    // generation token — if `_abort` has changed by the time async work
    // resumes, a newer speak() has superseded us and we must bail before
    // clobbering the newer call's state.
    const abortCtrl = new AbortController();
    _abort = abortCtrl;
    const signal = abortCtrl.signal;

    try {
      const session = (await c.auth.getSession())?.data?.session;
      if (_abort !== abortCtrl) return;
      const res = await fetch(supabaseUrl + '/functions/v1/nice-tts', {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          'apikey': SB._key,
          ...(session ? { 'Authorization': 'Bearer ' + session.access_token } : {}),
        },
        body: JSON.stringify({ text, provider: tv.provider, voice: tv.voice, speed: tv.speed, model: tv.model, voice_settings: tv.settings }),
      });

      // 402 = voice quota exhausted. nice-tts returns
      // { error, code:'voice_quota_exhausted', pool, cost, remaining }.
      // Silently mute the rest of the session (one toast, no retries) and
      // bail. Reload after quota top-up clears the flag.
      if (res.status === 402) {
        _quotaExhausted = true;
        if (typeof Notify !== 'undefined' && Notify.send) {
          Notify.send({
            title: 'Voice Quota Reached',
            message: 'You’ve used your monthly voice allowance. Top up tokens or wait for the next cycle.',
            type: 'system',
          });
        }
        _cleanup();
        return;
      }
      if (!res.ok) throw new Error('TTS ' + res.status);
      if (_abort !== abortCtrl) return;

      const path = _pickStreamPath();
      if (path && res.body && typeof res.body.getReader === 'function') {
        await _playStreaming(res, abortCtrl, opts, path);
      } else {
        await _playBlob(res, abortCtrl, opts);
      }
    } catch (err) {
      _cleanup();
      if (err && err.name === 'AbortError') return;
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Voice Unavailable', message: 'Could not reach voice service.', type: 'system' });
      }
    }
  }

  // Progressive playback via MediaSource. Audio starts playing as soon as
  // the browser has decoded the first frame, which is much faster than
  // buffering the full clip — especially for v3 (1s+ TTFB savings).
  async function _playStreaming(res, abortCtrl, opts, path) {
    const Mse = path === 'managed' ? window.ManagedMediaSource : window.MediaSource;
    const mse = new Mse();
    _mediaSource = mse;
    _blobUrl = URL.createObjectURL(mse);
    _audio = new Audio(_blobUrl);
    // ManagedMediaSource (Safari) requires disableRemotePlayback = true
    // to opt out of AirPlay-style remote handoff that doesn't support MSE.
    if (path === 'managed') {
      try { _audio.disableRemotePlayback = true; } catch {}
    }
    _wireAudioLifecycle(_audio, abortCtrl, opts);

    // Wait for the MediaSource to open before adding the source buffer.
    await new Promise((resolve, reject) => {
      const onOpen = () => { mse.removeEventListener('error', onError); resolve(); };
      const onError = (e) => { mse.removeEventListener('sourceopen', onOpen); reject(e); };
      mse.addEventListener('sourceopen', onOpen, { once: true });
      mse.addEventListener('error', onError, { once: true });
    });
    if (_abort !== abortCtrl) return;

    // isTypeSupported gated this; if addSourceBuffer still throws the
    // browser is in a bad state — surface to the outer catch which fires
    // "Voice Unavailable" instead of trying to re-stream into a blob.
    const sb = mse.addSourceBuffer('audio/mpeg');

    // Append chunks serially. SourceBuffer.appendBuffer is async — the
    // next append must wait for the prior 'updateend' or it throws
    // InvalidStateError. Queue + drain pattern handles bursty reads.
    const queue = [];
    let appending = false;
    let readerDone = false;

    const tryEndOfStream = () => {
      if (_abort !== abortCtrl) return;
      if (!readerDone || appending || queue.length > 0) return;
      if (mse.readyState !== 'open') return;
      try { mse.endOfStream(); } catch {}
    };

    const pump = () => {
      if (appending || queue.length === 0) return;
      if (_abort !== abortCtrl) return;
      if (sb.updating) return;
      appending = true;
      const chunk = queue.shift();
      try {
        sb.appendBuffer(chunk);
      } catch (e) {
        appending = false;
        console.warn('[NICE] CoreVoice MSE appendBuffer error:', e);
      }
    };

    sb.addEventListener('updateend', () => {
      appending = false;
      if (queue.length > 0) pump();
      else tryEndOfStream();
    });

    // play() is fine to call before any data arrives — Audio waits for
    // canplay automatically. Suppress autoplay-block + interrupt rejections
    // (covered by onerror handler).
    _audio.play().catch(() => { /* see blob path comment */ });

    const reader = res.body.getReader();
    _reader = reader;
    try {
      while (true) {
        const r = await reader.read();
        if (_abort !== abortCtrl) return;
        if (r.done) {
          readerDone = true;
          tryEndOfStream();
          break;
        }
        queue.push(r.value);
        pump();
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      // Body stream errored mid-play. Mark the source as decode-failed
      // so the audio element fires onerror and the lifecycle finishes.
      try { if (mse.readyState === 'open') mse.endOfStream('decode'); } catch {}
    } finally {
      _reader = null;
    }
  }

  // Fallback playback: buffer the whole response into a blob, then play.
  // Used on browsers without MediaSource for audio/mpeg (Safari < 17.1
  // and any environment without MSE). Same UX as before this PR.
  async function _playBlob(res, abortCtrl, opts) {
    const blob = await res.blob();
    if (_abort !== abortCtrl) return;
    _blobUrl = URL.createObjectURL(blob);
    _audio = new Audio(_blobUrl);
    _wireAudioLifecycle(_audio, abortCtrl, opts);
    // play() returns a Promise that rejects if playback is interrupted
    // mid-flight — happens every time a streaming message triggers a
    // new speak() and stop() revokes the prior blob URL. The onerror
    // handler already covers cleanup; suppressing the rejection keeps
    // it from surfacing as an "Async Error" toast. Autoplay blocks land
    // here too — silent-fail is the right UX for best-effort voice.
    _audio.play().catch(() => { /* suppressed — see above */ });
  }

  function stop() {
    if (_abort) { _abort.abort(); _abort = null; }
    if (_reader) { try { _reader.cancel(); } catch {} _reader = null; }
    if (_audio) { _audio.pause(); _audio.src = ''; }
    if (typeof CoreReactor !== 'undefined') CoreReactor.detachAnalyser();
    _cleanup();
  }

  function _cleanup() {
    if (_mediaSource) {
      // Closing an open MediaSource frees its decoder + buffers immediately;
      // leaving it open until GC keeps the audio pipeline pinned.
      try {
        if (_mediaSource.readyState === 'open') _mediaSource.endOfStream();
      } catch {}
      _mediaSource = null;
    }
    if (_blobUrl) { URL.revokeObjectURL(_blobUrl); _blobUrl = null; }
    _audio = null;
    _abort = null;
    _reader = null;
  }

  /* ── First-reply discovery CTA ──
     Voice is default-muted for new users (#294 cost defense). Without a
     prompt, users never discover the speaker toggle exists. This shows a
     one-time toast on the first eligible reply: "Want NICE to talk to
     you?" with a Talk-to-me action that flips to unmute and replays the
     reply via the supplied speakFn.

     Trigger gate: voice config exists (theme is voice-capable) AND no
     explicit mute preference yet for this theme. Fires once per theme —
     opening the CTA writes the explicit-mute pref so the gate flips,
     regardless of which button the user takes (or doesn't take). The
     speaker toggle in prompt-panel always remains as the manual escape
     hatch. */
  function hasExplicitMutePref() {
    if (!getConfig()) return false;
    const id = _activeThemeId();
    try {
      const state = JSON.parse(localStorage.getItem(_muteKey()) || '{}');
      return Object.prototype.hasOwnProperty.call(state, id);
    } catch { return false; }
  }

  function _writeMute(value) {
    const id = _activeThemeId();
    let state = {};
    try { state = JSON.parse(localStorage.getItem(_muteKey()) || '{}'); } catch {}
    state[id] = value;
    try { localStorage.setItem(_muteKey(), JSON.stringify(state)); } catch {}
  }

  function maybeShowCTA(text, speakFn) {
    if (!getConfig()) return false;
    if (hasExplicitMutePref()) return false;
    if (typeof Notify === 'undefined' || typeof Notify.send !== 'function') return false;
    const tv = getConfig();
    // Lock in the gate immediately — whether or not the user clicks, we
    // don't want to nag them again. Action callback below flips back to
    // unmute if they accept (Pro path only).
    _writeMute(true);

    const isPro = (typeof Subscription !== 'undefined' && typeof Subscription.isPro === 'function')
      ? Subscription.isPro()
      : false;

    if (isPro) {
      // Pro path — flip to unmute and replay via the supplied speakFn.
      Notify.send({
        title: 'Want NICE to talk to you?',
        message: `Hear replies aloud in the ${tv.label || 'current'} voice. You can mute anytime via the speaker toggle.`,
        type: 'system',
        actionLabel: 'Talk to me',
        // Persistent: this is a one-shot discovery CTA. A 5s auto-dismiss
        // means most users miss it entirely (caught during the #296 smoke
        // test). Toast stays until manual close or action click.
        persistent: true,
        undo: () => {
          _writeMute(false);
          if (typeof speakFn === 'function') {
            try { speakFn(); } catch (e) { console.error('[NICE] CTA speak callback error:', e); }
          }
        },
      });
    } else {
      // Free path — voice has no allowance on free tier. Unmuting would
      // 402 on the very next reply ("Voice Quota Reached") and leave the
      // user stuck with a feature they can't use. Branch the CTA to an
      // upgrade prompt instead. Mute stays locked; if they upgrade and
      // want voice, the speaker toggle in the prompt panel is still the
      // discoverable manual escape hatch.
      Notify.send({
        title: 'Voice is a NICE Pro feature',
        message: `Upgrade to hear replies in the ${tv.label || 'current'} voice.`,
        type: 'system',
        actionLabel: 'Upgrade',
        persistent: true,
        undo: () => {
          if (typeof UpgradeModal !== 'undefined' && typeof UpgradeModal.open === 'function') {
            try { UpgradeModal.open(); } catch (e) { console.error('[NICE] CTA upgrade callback error:', e); }
          }
        },
      });
    }
    return true;
  }

  return { getConfig, isMuted, toggleMute, canSpeak, isSpeaking, speak, stop, hasExplicitMutePref, maybeShowCTA };
})();
