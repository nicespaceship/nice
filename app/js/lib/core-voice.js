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
   All themes currently set turbo explicitly — v3 is on hold pending
   the streaming-endpoint rollout (its first-byte latency is too long
   for non-streaming playback). Edge function allowlists the value,
   so an unknown string falls back to turbo silently. The free-tier
   gate further forces turbo regardless of what the client sends.

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
═══════════════════════════════════════════════════════════════════ */
const CoreVoice = (() => {
  let _audio = null;
  let _blobUrl = null;
  let _abort = null;
  let _endHook = null;
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
      if (_abort !== abortCtrl) return; // superseded during getSession()
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

      const blob = await res.blob();
      if (_abort !== abortCtrl) return; // superseded after fetch resolved
      _blobUrl = URL.createObjectURL(blob);
      _audio = new Audio(_blobUrl);
      _audio.onplay = () => {
        if (typeof CoreReactor !== 'undefined') {
          CoreReactor.setState('speaking');
          CoreReactor.attachAnalyser(_audio);
        }
        if (opts && opts.onStart) { try { opts.onStart(); } catch {} }
      };
      const finish = () => {
        if (typeof CoreReactor !== 'undefined') CoreReactor.detachAnalyser();
        _cleanup();
        const hook = _endHook; _endHook = null;
        if (hook) { try { hook(); } catch {} }
      };
      _audio.onended = finish;
      _audio.onerror = finish;
      // play() returns a Promise that rejects if playback is interrupted
      // mid-flight — happens every time a streaming message triggers a
      // new speak() and stop() revokes the prior blob URL. The onerror
      // handler already covers cleanup; suppressing the rejection keeps
      // it from surfacing as an "Async Error" toast. Autoplay blocks land
      // here too — silent-fail is the right UX for best-effort voice.
      _audio.play().catch(() => { /* suppressed — see above */ });
    } catch (err) {
      _cleanup();
      if (err.name === 'AbortError') return;
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Voice Unavailable', message: 'Could not reach voice service.', type: 'system' });
      }
    }
  }

  function stop() {
    if (_abort) { _abort.abort(); _abort = null; }
    if (_audio) { _audio.pause(); _audio.src = ''; }
    if (typeof CoreReactor !== 'undefined') CoreReactor.detachAnalyser();
    _cleanup();
  }

  function _cleanup() {
    if (_blobUrl) { URL.revokeObjectURL(_blobUrl); _blobUrl = null; }
    _audio = null;
    _abort = null;
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
    // unmute if they accept.
    _writeMute(true);
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
    return true;
  }

  return { getConfig, isMuted, toggleMute, canSpeak, isSpeaking, speak, stop, hasExplicitMutePref, maybeShowCTA };
})();
