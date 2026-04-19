/* ═══════════════════════════════════════════════════════════════════
   NICE — Call Mode
   Hands-free JARVIS conversation: mic stays open for the full call,
   VAD detects end-of-speech to auto-send, TTS plays reply, loop
   repeats. Full barge-in: voice activity during thinking or speaking
   cuts the prior turn immediately.

   Owns: full-screen overlay, mic stream + AudioContext + VAD analyser,
   SpeechRecognition transcript layers, turn lifecycle, reactor state
   sync. Dependencies (LLM call, system prompt, message persistence,
   TTS playback) are injected via `init(deps)` so the module stays
   decoupled from the prompt panel internals.

   JARVIS-only: `isAvailable()` requires the active theme to be 'jarvis'
   AND SpeechRecognition support. The toolbar button is hidden otherwise.
═══════════════════════════════════════════════════════════════════ */
const CallMode = (() => {
  /* ── State ── */
  let _active = false;
  let _phase = 'idle';            // 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking'
  let _overlay = null;
  let _stream = null;
  let _audioCtx = null;
  let _analyser = null;
  let _vadData = null;
  let _vadRaf = null;
  let _voiceActive = false;
  let _silenceSince = 0;
  let _speechStart = 0;
  let _recognition = null;
  /* Transcript is built from three layers so interim results REPLACE prior
     interim (not accumulate), while finalized text persists across the
     auto-restarts the browser does when it stops hearing speech.
       committed = finals from prior recognition sessions this turn
       sessionFinal = finals from the current recognition session
       sessionInterim = latest interim from the current session (replaces itself)
     Display + commit = committed + sessionFinal + sessionInterim. */
  let _committedFinal = '';
  let _sessionFinal = '';
  let _sessionInterim = '';
  let _abortCtrl = null;          // aborts in-flight LLM call on end/barge-in
  let _deps = null;               // injected dependencies (see init)

  /* ── VAD tuning constants ── */
  const RMS_THRESHOLD = 0.030;    // base threshold above quiet-room noise
  const RMS_BARGE_MULT = 1.5;     // require stronger signal to interrupt TTS
  const SILENCE_MS = 1200;        // silence before auto-send
  const SPEECH_MIN_MS = 250;      // minimum speech to avoid spurious sends

  /* ── Public API ── */
  function isActive() { return _active; }

  function isAvailable() {
    const theme = document.documentElement.getAttribute('data-theme');
    return theme === 'jarvis' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function syncButton() {
    const btn = _deps && _deps.panelEl && _deps.panelEl.querySelector('#nice-ai-call');
    if (!btn) return;
    btn.style.display = isAvailable() ? '' : 'none';
    btn.classList.toggle('active', _active);
  }

  /**
   * Initialise Call Mode. Required deps:
   *   panelEl            — the prompt panel root (to find #nice-ai-call)
   *   requestReply(text, opts) → Promise<{text}>
   *                       — sends the LLM request, supports onChunk +
   *                         abortSignal + systemOverride + modelOverride
   *   buildSystemPrompt() → string  — base persona prompt; we append the
   *                         voice-mode constraints
   *   pushMessage(msg)   — persists a {role,text,agent?,ts} chat record
   *   speakReply(text, { onEnd }) — hand off TTS playback, fire onEnd
   *                         after natural end / error / stop
   *   stopTts()          — halt any in-flight TTS
   *   beforeEnter()      — host-side cleanup before a call starts (stop
   *                         regular mic, cancel auto-arm, etc.)
   */
  function init(deps) {
    _deps = deps;
    _ensureOverlay();
    _bindButton();
  }

  function destroy() {
    if (_active) end('Module destroyed.');
  }

  async function enter() {
    if (_active) return;
    const user = (typeof State !== 'undefined' && State.get) ? State.get('user') : null;
    if (!user) {
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Sign in required', message: 'Call Mode needs an account to stream voice.', type: 'system' });
      }
      return;
    }
    // Pre-flight mic permission check. Browsers do NOT re-prompt once an
    // origin is in `denied` state, so getUserMedia would silently throw
    // NotAllowedError without ever showing a dialog. Surface an actionable
    // toast instead of flashing the connecting overlay only to bail.
    const blocked = await _isMicBlocked();
    if (blocked) {
      if (typeof Notify !== 'undefined') {
        Notify.send({
          title: 'Microphone blocked',
          message: 'Click the lock icon in the address bar, set Microphone to "Allow", then reload.',
          type: 'system',
        });
      }
      return;
    }
    if (_deps && _deps.beforeEnter) _deps.beforeEnter();

    _active = true;
    document.documentElement.classList.add('nice-call-mode');
    syncButton();
    _setPhase('connecting');
    _setCaption('user', '');
    _setCaption('assistant', '');

    const ok = await _startMic();
    if (!ok) return; // end() already ran with an error message
    _startRecognition();
    _setPhase('listening');
  }

  /**
   * Returns true when the origin's microphone permission is in `denied`
   * state — browsers won't re-prompt from this state. Returns false when
   * the state is `prompt` or `granted` (or when the Permissions API is
   * unavailable, since older browsers fall through to the getUserMedia
   * dialog directly).
   */
  async function _isMicBlocked() {
    try {
      if (!navigator.permissions || !navigator.permissions.query) return false;
      const status = await navigator.permissions.query({ name: 'microphone' });
      return status.state === 'denied';
    } catch { return false; }
  }

  function end(reason) {
    if (!_active && !_overlay) return;
    _active = false;
    if (_abortCtrl) { try { _abortCtrl.abort(); } catch {} _abortCtrl = null; }
    if (_deps && _deps.stopTts) _deps.stopTts();
    _stopRecognition();
    _stopMic();
    document.documentElement.classList.remove('nice-call-mode');
    _setPhase('idle');
    syncButton();
    if (reason && typeof Notify !== 'undefined' && /denied|unavailable|failed/i.test(reason)) {
      Notify.send({ title: 'Call Mode', message: reason, type: 'system' });
    }
  }

  /* ── Overlay markup + button binding ── */
  function _ensureOverlay() {
    if (document.getElementById('nice-ai-call-overlay')) {
      _overlay = document.getElementById('nice-ai-call-overlay');
      return;
    }
    const co = document.createElement('div');
    co.id = 'nice-ai-call-overlay';
    co.className = 'nice-ai-call';
    co.setAttribute('aria-hidden', 'true');
    co.innerHTML = ''
      + '<div class="nice-ai-call-backdrop"></div>'
      + '<div class="nice-ai-call-inner">'
      +   '<div class="nice-ai-call-status" id="nice-ai-call-status">Connecting…</div>'
      +   '<div class="nice-ai-call-caption nice-ai-call-user" id="nice-ai-call-user-caption"></div>'
      +   '<div class="nice-ai-call-reactor-slot" aria-hidden="true"></div>'
      +   '<div class="nice-ai-call-caption nice-ai-call-assistant" id="nice-ai-call-assistant-caption"></div>'
      +   '<div class="nice-ai-call-controls">'
      +     '<button class="nice-ai-call-end" id="nice-ai-call-end" aria-label="End call" title="End call (Esc)">'
      +       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-3.07-3.51"/><line x1="22" y1="2" x2="2" y2="22"/></svg>'
      +       '<span>End</span>'
      +     '</button>'
      +   '</div>'
      + '</div>';
    document.body.appendChild(co);
    _overlay = co;
  }

  function _bindButton() {
    const trigger = _deps && _deps.panelEl && _deps.panelEl.querySelector('#nice-ai-call');
    if (trigger) {
      trigger.addEventListener('click', () => {
        if (_active) end('User ended call.');
        else enter();
      });
    }
    const endBtn = document.getElementById('nice-ai-call-end');
    if (endBtn) endBtn.addEventListener('click', () => end('User ended call.'));
  }

  /* ── Phase + caption ── */
  function _setPhase(phase) {
    _phase = phase;
    if (_overlay) _overlay.dataset.phase = phase;
    const statusEl = document.getElementById('nice-ai-call-status');
    if (statusEl) {
      statusEl.textContent = (
        phase === 'listening' ? 'Listening…' :
        phase === 'thinking'  ? 'Thinking…' :
        phase === 'speaking'  ? 'Speaking' :
        phase === 'connecting'? 'Connecting…' :
        'Call ended'
      );
    }
    // Drive the reactor so the centerpiece reacts to the call loop
    if (typeof CoreReactor !== 'undefined') {
      CoreReactor.setState(phase === 'speaking' ? 'speaking' : phase === 'thinking' ? 'streaming' : 'idle');
    }
  }

  function _setCaption(which, text) {
    const el = document.getElementById(which === 'user' ? 'nice-ai-call-user-caption' : 'nice-ai-call-assistant-caption');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('empty', !text);
  }

  /* ── Mic + VAD ── */
  async function _startMic() {
    try {
      _stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
    } catch (e) {
      // Fallback path — the pre-flight check in enter() catches `denied`
      // upstream, but a race (user revokes mid-call) or unsupported
      // Permissions API can still land here. Mirror the actionable copy
      // so the toast tells the user how to recover.
      end(
        e && e.name === 'NotAllowedError'
          ? 'Microphone blocked. Click the lock icon in the address bar, set Microphone to "Allow", then reload.'
          : 'Microphone unavailable. Check that no other app is using it.'
      );
      return false;
    }
    try {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = _audioCtx.createMediaStreamSource(_stream);
      _analyser = _audioCtx.createAnalyser();
      _analyser.fftSize = 1024;
      _analyser.smoothingTimeConstant = 0.2;
      src.connect(_analyser);
      _vadData = new Float32Array(_analyser.fftSize);
      _voiceActive = false;
      _silenceSince = 0;
      _speechStart = 0;
      _vadLoop();
      return true;
    } catch {
      end('Audio engine failed to start.');
      return false;
    }
  }

  function _stopMic() {
    if (_vadRaf) { cancelAnimationFrame(_vadRaf); _vadRaf = null; }
    try { _analyser && _analyser.disconnect(); } catch {}
    _analyser = null;
    _vadData = null;
    if (_audioCtx) { _audioCtx.close().catch(() => {}); _audioCtx = null; }
    if (_stream) { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
    _voiceActive = false;
    _silenceSince = 0;
    _speechStart = 0;
  }

  function _vadLoop() {
    if (!_analyser || !_vadData) return;
    _analyser.getFloatTimeDomainData(_vadData);
    let sum = 0;
    for (let i = 0; i < _vadData.length; i++) sum += _vadData[i] * _vadData[i];
    const rms = Math.sqrt(sum / _vadData.length);
    const now = performance.now();

    // Barge-in during thinking: user interrupts before JARVIS starts
    // speaking. Abort the in-flight LLM request and swap to a fresh
    // listening turn — the user changed their mind. Higher threshold
    // so keyboard / mouse clicks don't falsely trigger.
    if (_phase === 'thinking' && rms > RMS_THRESHOLD * RMS_BARGE_MULT) {
      if (_abortCtrl) { try { _abortCtrl.abort(); } catch {} _abortCtrl = null; }
      _setCaption('assistant', '');
      _resetTranscript();
      _speechStart = now;
      _voiceActive = true;
      _silenceSince = 0;
      _setPhase('listening');
      if (_recognition) { try { _recognition.stop(); } catch {} }
      else _ensureRecognitionRunning();
      _vadRaf = requestAnimationFrame(_vadLoop);
      return;
    }

    // Barge-in while JARVIS is speaking → kill TTS, switch to listening
    if (_phase === 'speaking' && rms > RMS_THRESHOLD * RMS_BARGE_MULT) {
      if (_deps && _deps.stopTts) _deps.stopTts();
      _setCaption('assistant', '');
      _setPhase('listening');
      _resetTranscript();
      _speechStart = now;
      _voiceActive = true;
      _silenceSince = 0;
      if (_recognition) { try { _recognition.stop(); } catch {} }
      else _ensureRecognitionRunning();
      _vadRaf = requestAnimationFrame(_vadLoop);
      return;
    }

    if (_phase === 'listening') {
      if (rms > RMS_THRESHOLD) {
        if (!_voiceActive) { _voiceActive = true; _speechStart = now; }
        _silenceSince = 0;
      } else if (_voiceActive) {
        if (!_silenceSince) _silenceSince = now;
        const spoke = _speechStart && (_silenceSince - _speechStart) >= SPEECH_MIN_MS;
        if (spoke && (now - _silenceSince) >= SILENCE_MS) {
          _voiceActive = false;
          _silenceSince = 0;
          _speechStart = 0;
          _commitTurn();
        }
      }
    }

    _vadRaf = requestAnimationFrame(_vadLoop);
  }

  /* ── Speech recognition ── */
  function _startRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { end('Voice recognition unavailable.'); return; }
    _stopRecognition();
    _recognition = new SR();
    _recognition.lang = 'en-US';
    _recognition.interimResults = true;
    _recognition.continuous = true;
    _committedFinal = '';
    _sessionFinal = '';
    _sessionInterim = '';

    _recognition.onresult = (event) => {
      if (!_active) return;
      // Walk the full results list — event.results contains both finalized
      // and interim portions. Partition by isFinal so interim REPLACES
      // itself on each event instead of accumulating. resultIndex is not
      // safe for this partitioning; it only signals which index changed
      // in THIS event.
      let sf = '', si = '';
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        const t = r[0].transcript;
        if (r.isFinal) sf += t; else si += t;
      }
      _sessionFinal = sf;
      _sessionInterim = si;
      if (_phase === 'listening') {
        _setCaption('user', _liveTranscript());
      }
    };

    _recognition.onend = () => {
      // Promote the current session's finals to committed, so the next
      // (auto-restarted) session starts with a clean results list but we
      // keep what the user already said.
      if (_sessionFinal) {
        _committedFinal = (_committedFinal ? _committedFinal + ' ' : '') + _sessionFinal.trim();
      }
      _sessionFinal = '';
      _sessionInterim = '';
      if (_active) {
        try { _recognition && _recognition.start(); } catch {}
      }
    };

    _recognition.onerror = (e) => {
      if (!_active) return;
      if (e.error === 'not-allowed') end('Microphone access denied.');
      // 'no-speech' / 'aborted' are recoverable — onend restarts
    };

    try { _recognition.start(); } catch {}
  }

  function _liveTranscript() {
    const parts = [];
    if (_committedFinal) parts.push(_committedFinal);
    if (_sessionFinal) parts.push(_sessionFinal.trim());
    if (_sessionInterim) parts.push(_sessionInterim.trim());
    return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  function _ensureRecognitionRunning() {
    if (!_active) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (!_recognition) { _startRecognition(); return; }
    try { _recognition.start(); } catch { /* already running */ }
  }

  function _stopRecognition() {
    if (_recognition) {
      try { _recognition.onend = null; _recognition.onresult = null; _recognition.onerror = null; } catch {}
      try { _recognition.stop(); } catch {}
      _recognition = null;
    }
    _committedFinal = '';
    _sessionFinal = '';
    _sessionInterim = '';
  }

  function _resetTranscript() {
    _committedFinal = '';
    _sessionFinal = '';
    _sessionInterim = '';
  }

  /* ── Turn commit ── */
  async function _commitTurn() {
    const text = _liveTranscript();
    _resetTranscript();
    if (!text || text.length < 2) return;
    // Recycle the recognition session so event.results starts empty for
    // the next turn — otherwise the just-committed results persist and
    // the next onresult re-includes them as final text.
    if (_active && _recognition) {
      try { _recognition.stop(); } catch {}
      // onend will restart the session, firing fresh (empty) event.results
    }
    _setPhase('thinking');
    _setCaption('user', text);
    _setCaption('assistant', '');

    if (_deps && _deps.pushMessage) {
      _deps.pushMessage({ role: 'user', text, ts: Date.now() });
    }

    let replyText = '';
    _abortCtrl = new AbortController();
    try {
      const result = await _deps.requestReply(text, {
        onChunk: (chunk) => {
          if (!_active) return;
          replyText += chunk;
          _setCaption('assistant', replyText);
        },
        systemOverride: _buildSystemPrompt(),
        modelOverride: 'gemini-2.5-flash',
        abortSignal: _abortCtrl.signal,
      });
      if (result && result.text) replyText = result.text;
    } catch (err) {
      if (err && err.name === 'AbortError') return; // barge-in or call end
      replyText = 'My apologies — the line went quiet. Shall we try again?';
      if (_active) _setCaption('assistant', replyText);
    }
    _abortCtrl = null;
    if (!_active) return;

    if (replyText && _deps && _deps.pushMessage) {
      _deps.pushMessage({ role: 'assistant', text: replyText, agent: 'J.A.R.V.I.S.', ts: Date.now() });
    }

    if (!replyText || (typeof CoreVoice !== 'undefined' && !CoreVoice.canSpeak())) {
      // No voice → skip speaking, loop back to listening
      _setPhase('listening');
      return;
    }

    _setPhase('speaking');
    _deps.speakReply(replyText, {
      onEnd: () => {
        if (!_active) return;
        _setCaption('assistant', '');
        _setPhase('listening');
      },
    });
  }

  function _buildSystemPrompt() {
    const base = (_deps && _deps.buildSystemPrompt) ? _deps.buildSystemPrompt() : '';
    return base + '\n\nCONVERSATION MODE (VOICE): You are on a live voice call. ' +
      'Reply in ≤3 short sentences. Plain prose only — no markdown, no code blocks, no lists, no URLs. ' +
      'Write exactly as you would speak, so the reply can be read aloud. If the user asks for code or long output, acknowledge briefly and offer to send the details to the monitor.';
  }

  return { init, destroy, enter, end, isActive, isAvailable, syncButton };
})();
