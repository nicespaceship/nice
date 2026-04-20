/* ═══════════════════════════════════════════════════════════════════
   NICE — Core Voice
   Single source of truth for theme-pluggable text-to-speech. Each theme
   declares its voice on its `THEMES` entry:

     { id:'jarvis', voice: { provider, voice, speed, label } }

   `provider` and `voice` are forwarded to the `nice-tts` edge function
   which resolves them to a backend voice ID (ElevenLabs etc.). Themes
   without a registered voice are silent — `getConfig()` returns null
   and `canSpeak()` is false.

   Mute state is persisted per-theme in localStorage so toggling
   J.A.R.V.I.S. off doesn't also mute future themed voices.

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
      return state[id] === true;
    } catch { return false; }
  }

  function toggleMute() {
    const id = _activeThemeId();
    if (!getConfig()) return;
    let state = {};
    try { state = JSON.parse(localStorage.getItem(_muteKey()) || '{}'); } catch {}
    state[id] = !state[id];
    localStorage.setItem(_muteKey(), JSON.stringify(state));
    if (state[id]) stop();
  }

  function canSpeak() { return !!getConfig() && !isMuted(); }

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
        body: JSON.stringify({ text, provider: tv.provider, voice: tv.voice, speed: tv.speed, voice_settings: tv.settings }),
      });

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

  return { getConfig, isMuted, toggleMute, canSpeak, isSpeaking, speak, stop };
})();
