/* ═══════════════════════════════════════════════════════════════════
   NICE — Core Reactor
   Single mount point for the centerpiece reactor that every theme can
   register a visual paint for. JARVIS (and any future themed core)
   provides its markup via THEMES[id].reactor.html(); CoreReactor owns
   the mount, the state machine, and the audio analyser pipeline.

   The element is appended directly to <body> so position:fixed resolves
   against the viewport — never against an ancestor's transform/filter
   containing block. CSS contract lives in public/css/theme.css under
   the existing `.jv-pp-reactor` rules; the class is kept on the element
   for backward compatibility while the rename to `.core-reactor` lands.
═══════════════════════════════════════════════════════════════════ */
const CoreReactor = (() => {
  const ID = 'jv-pp-reactor';
  let _audioCtx = null, _src = null, _analyser = null, _data = null, _rafId = null;

  function _el() { return document.getElementById(ID); }

  function _activeTheme() {
    if (typeof Theme === 'undefined' || !Theme.getTheme) return null;
    const id = (typeof Theme.current === 'function')
      ? Theme.current()
      : (document.documentElement.getAttribute('data-theme') || '');
    return Theme.getTheme(id);
  }

  function mount() {
    if (_el()) return _el();
    const el = document.createElement('div');
    el.id = ID;
    // Two classes during migration: `.core-reactor` is the theme-agnostic
    // hook future CSS targets; `.jv-pp-reactor` preserves the existing
    // JARVIS centering + opacity rules without a CSS rewrite in this PR.
    el.className = 'core-reactor jv-pp-reactor';
    el.setAttribute('aria-hidden', 'true');
    el.dataset.state = 'idle';
    document.body.appendChild(el);
    return el;
  }

  /**
   * Re-render the reactor markup from the active theme's `reactor.html()`.
   * Themes without a registered reactor leave the element empty (and CSS
   * hides it via `display:none` inheritance from `.jv-pp-reactor`).
   */
  function paint() {
    const el = mount();
    const theme = _activeTheme();
    const fn = theme && theme.reactor && theme.reactor.html;
    el.innerHTML = (typeof fn === 'function') ? fn() : '';
  }

  function setState(state) {
    document.documentElement.dataset.jvState = state;
    const el = _el();
    if (el) el.dataset.state = state;
  }

  function setVol(v) {
    const clamped = Math.max(0, Math.min(1, v));
    document.documentElement.style.setProperty('--jv-vol', clamped.toFixed(3));
  }

  /**
   * Wire an HTMLAudioElement's playback into the reactor. Creates a
   * MediaElementSource + AnalyserNode and starts an RAF loop that writes
   * `--jv-vol` from the speech-band frequency bins so the core breathes
   * in sync with the voice.
   */
  function attachAnalyser(audioEl) {
    // Defensive: if a previous analyser is still wired (caller forgot to
    // detach), tear it down first. Otherwise _src / _analyser would be
    // overwritten without `disconnect()`, leaving the prior nodes in the
    // audio graph + the prior rAF loop running against stale buffers.
    if (_src || _analyser || _rafId) detachAnalyser();
    try {
      if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (_audioCtx.state === 'suspended') _audioCtx.resume();
      _src = _audioCtx.createMediaElementSource(audioEl);
      _analyser = _audioCtx.createAnalyser();
      // 128 bins gives enough resolution for a visible EQ while staying cheap
      _analyser.fftSize = 256;
      _analyser.smoothingTimeConstant = 0.75;
      _src.connect(_analyser);
      _analyser.connect(_audioCtx.destination);
      _data = new Uint8Array(_analyser.frequencyBinCount);
      _loop();
    } catch (e) {
      // Some browsers block createMediaElementSource on autoplay-restricted
      // audio; fall through — the reactor still pulses via CSS keyframes.
    }
  }

  function detachAnalyser() {
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    try { _src && _src.disconnect(); } catch (e) {}
    try { _analyser && _analyser.disconnect(); } catch (e) {}
    _src = null; _analyser = null; _data = null;
    setVol(0);
    // Blank every EQ canvas so they don't hold the last frame
    document.querySelectorAll('.jv-eq-canvas').forEach(c => {
      const ctx = c.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, c.width, c.height);
    });
  }

  function _loop() {
    if (!_analyser || !_data) return;
    _analyser.getByteFrequencyData(_data);
    // Weight bins 2..17 — speech fundamentals + first harmonics — for vol
    let sum = 0, count = 0;
    const n = Math.min(18, _data.length);
    for (let i = 2; i < n; i++) { sum += _data[i]; count++; }
    const vol = count ? (sum / count / 255) : 0;
    // Gentle curve — mid-range voice should read as ~0.6, peaks ~1.0
    setVol(Math.min(1, vol * 1.6));
    // Draw the reactive EQ spectrum to every visible canvas
    document.querySelectorAll('.jv-eq-canvas').forEach(c => _renderEqBars(c, _data));
    _rafId = requestAnimationFrame(_loop);
  }

  /**
   * Draw N radial EQ bars. Each bar's length comes from a frequency bin of
   * the AnalyserNode; bars start at an inner radius (where the static conic
   * EQ sits) and extend outward, so the spectrum rises and lowers with
   * the voice.
   */
  function _renderEqBars(canvas, data) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H / 2;
    // Bar geometry — tuned to overlay the conic EQ's ring (radius ~130 CSS
    // in a 400 CSS / 800 internal canvas → 260 internal).
    const innerR = W * 0.325;
    const minLen = W * 0.012;
    const maxLen = W * 0.085;
    const barCount = 64;
    const step = (Math.PI * 2) / barCount;
    const bins = data.length;
    // Use bins 2..(bins/2) — skip DC/sub-bass and ultra-high; that's where
    // speech energy lives. Map evenly across bars.
    const binStart = 2;
    const binEnd = Math.floor(bins * 0.5);
    const binRange = binEnd - binStart;
    ctx.lineCap = 'round';
    for (let i = 0; i < barCount; i++) {
      // Mirror bars around the vertical axis so left/right show the same
      // spectrum (classic EQ symmetry). Index 0 is at top.
      const half = Math.min(i, barCount - i);
      const binIdx = binStart + Math.floor((half / (barCount / 2)) * binRange);
      const amp = (data[binIdx] || 0) / 255;
      const curved = Math.pow(amp, 0.7);
      const len = minLen + curved * maxLen;
      const angle = i * step - Math.PI / 2;
      const x1 = cx + Math.cos(angle) * innerR;
      const y1 = cy + Math.sin(angle) * innerR;
      const x2 = cx + Math.cos(angle) * (innerR + len);
      const y2 = cy + Math.sin(angle) * (innerR + len);
      ctx.lineWidth = W * 0.009;
      ctx.strokeStyle = 'rgba(0,229,255,' + (0.4 + curved * 0.55) + ')';
      ctx.shadowColor = 'rgba(0,229,255,0.7)';
      ctx.shadowBlur = 4 + curved * 14;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  function init() {
    mount();
    paint();
  }

  /**
   * Toggle reactor visibility globally. Default is hidden (see CSS base
   * rule on `.jv-pp-reactor`); views that want the reactor as their
   * centerpiece (Home / Schematic / SpaceshipDetail) opt in on render.
   * Router default-hides on every route change so there's no leakage.
   */
  function setVisible(visible) {
    document.documentElement.classList.toggle('reactor-visible', !!visible);
  }

  return { init, mount, paint, setState, setVol, attachAnalyser, detachAnalyser, setVisible };
})();
