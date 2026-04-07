/* ─────────────────────────────────────────────────────────────────
   VIEW: TronView — TRON Light-Cycle Snake Game
   Easter egg inside The Grid theme. Classic snake mechanics
   reskinned as a light-cycle on the game grid.
───────────────────────────────────────────────────────────────── */
const TronView = (() => {
  const GRID = 32;         // 32x32 grid (smaller cells)
  const BASE_SPEED = 200;  // ms per tick — starts slow
  const MIN_SPEED = 60;    // fastest possible

  let _canvas, _ctx, _cell;
  let _snake, _dir, _nextDir, _food, _score, _hi, _alive, _timer, _el, _lives, _nextLifeAt;
  let _audioCtx, _soundOn = true;

  /* ── Synthesized TRON sounds (Web Audio API) ── */
  function _initAudio() {
    if (_audioCtx) return;
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  function _tone(freq, dur, type, vol, slide) {
    if (!_soundOn || !_audioCtx) return;
    const osc = _audioCtx.createOscillator();
    const gain = _audioCtx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, _audioCtx.currentTime);
    if (slide) osc.frequency.linearRampToValueAtTime(slide, _audioCtx.currentTime + dur);
    gain.gain.setValueAtTime(vol || 0.08, _audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + dur);
    osc.connect(gain).connect(_audioCtx.destination);
    osc.start(); osc.stop(_audioCtx.currentTime + dur);
  }

  function _sfxStart() {
    // Engine boot — rising sweep
    _tone(120, 0.3, 'sawtooth', 0.06, 400);
    setTimeout(() => _tone(400, 0.2, 'square', 0.05, 800), 200);
  }

  function _sfxTurn() {
    // Short blip
    _tone(600, 0.05, 'square', 0.04, 800);
  }

  function _sfxEat() {
    // Rising pickup
    _tone(500, 0.1, 'square', 0.06, 1200);
    setTimeout(() => _tone(900, 0.08, 'square', 0.04, 1400), 60);
  }

  function _sfxExtraLife() {
    // Ascending arpeggio
    _tone(600, 0.1, 'square', 0.06);
    setTimeout(() => _tone(800, 0.1, 'square', 0.06), 80);
    setTimeout(() => _tone(1000, 0.1, 'square', 0.06), 160);
    setTimeout(() => _tone(1200, 0.15, 'square', 0.07), 240);
  }

  function _sfxDeath() {
    // Crash buzz
    _tone(300, 0.15, 'sawtooth', 0.08, 80);
    setTimeout(() => _tone(150, 0.2, 'sawtooth', 0.06, 40), 100);
  }

  function _sfxDerez() {
    // Descending derez — glitchy decay
    _tone(800, 0.1, 'square', 0.07, 200);
    setTimeout(() => _tone(600, 0.15, 'sawtooth', 0.06, 100), 80);
    setTimeout(() => _tone(300, 0.2, 'sawtooth', 0.05, 60), 200);
    setTimeout(() => _tone(100, 0.4, 'sawtooth', 0.04, 30), 350);
  }

  function render(el) {
    _el = el;
    _hi = parseInt(localStorage.getItem('nice-tron-hi') || '0', 10);

    el.innerHTML = `
      <div class="tron-game" style="display:flex;flex-direction:column;align-items:center;padding:24px 0;gap:16px;">
        <div class="tron-hud" style="display:flex;gap:32px;font-family:'Orbitron',sans-serif;font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;">
          <div>Lives: <span id="tron-lives" style="color:#ef4444">3</span></div>
          <div>Score: <span id="tron-score" style="color:var(--accent,#18a0fb)">0</span></div>
          <div>Hi: <span id="tron-hi" style="color:var(--accent2,#0a6bc4)">${_hi}</span></div>
          <button id="tron-sound" style="background:none;border:1px solid var(--border,rgba(24,160,251,0.25));border-radius:3px;color:var(--accent,#18a0fb);font-family:'Orbitron',sans-serif;font-size:.6rem;padding:2px 8px;cursor:pointer;letter-spacing:.08em;">SFX ON</button>
        </div>
        <div style="position:relative;">
          <canvas id="tron-canvas" style="border:2px solid var(--accent,#18a0fb);border-radius:3px;display:block;box-shadow:0 0 20px rgba(24,160,251,0.15);"></canvas>
          <div id="tron-overlay" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(2,9,15,0.85);font-family:'Orbitron',sans-serif;color:var(--accent,#18a0fb);">
            <div style="font-size:1.4rem;letter-spacing:.15em;">TRON</div>
            <div style="font-size:.65rem;letter-spacing:.12em;color:var(--text-muted)">LIGHT-CYCLE</div>
            <button id="tron-start" class="btn" style="margin-top:8px;padding:8px 24px;font-family:'Orbitron',sans-serif;font-size:.7rem;letter-spacing:.1em;">ENTER THE GRID</button>
          </div>
        </div>
        <div style="font-size:.6rem;color:var(--text-muted);letter-spacing:.08em;font-family:'Orbitron',sans-serif;">ARROW KEYS / WASD</div>
      </div>
    `;

    _canvas = document.getElementById('tron-canvas');
    _ctx = _canvas.getContext('2d');
    _resize();
    _drawEmpty();

    document.getElementById('tron-start')?.addEventListener('click', _start);
    document.getElementById('tron-sound')?.addEventListener('click', () => {
      _soundOn = !_soundOn;
      const btn = document.getElementById('tron-sound');
      if (btn) btn.textContent = _soundOn ? 'SFX ON' : 'SFX OFF';
    });
    window.addEventListener('keydown', _onKey);
    window.addEventListener('resize', _resize);
  }

  function destroy() {
    clearInterval(_timer);
    window.removeEventListener('keydown', _onKey);
    window.removeEventListener('resize', _resize);
  }

  function _resize() {
    if (!_canvas || !_el) return;
    const maxW = Math.min(_el.clientWidth - 48, 500);
    const maxH = Math.min(window.innerHeight - 220, 500);
    const size = Math.min(maxW, maxH);
    _cell = Math.floor(size / GRID);
    const px = _cell * GRID;
    _canvas.width = px;
    _canvas.height = px;
    if (_alive) _draw();
    else _drawEmpty();
  }

  function _start() {
    // Require sign-in to play
    const user = typeof State !== 'undefined' ? State.get('user') : null;
    if (!user) {
      if (typeof AuthModal !== 'undefined') AuthModal.open();
      return;
    }
    _initAudio();
    _sfxStart();
    const overlay = document.getElementById('tron-overlay');
    if (overlay) overlay.style.display = 'none';
    _snake = [{ x: 16, y: 16 }, { x: 15, y: 16 }, { x: 14, y: 16 }];
    _dir = { x: 1, y: 0 };
    _nextDir = { x: 1, y: 0 };
    _score = 0;
    _lives = 3;
    _nextLifeAt = 100;
    _alive = true;
    _updateHUD();
    _spawnFood();
    clearInterval(_timer);
    _timer = setInterval(_tick, _speed());
  }

  function _respawn() {
    _snake = [{ x: 16, y: 16 }, { x: 15, y: 16 }, { x: 14, y: 16 }];
    _dir = { x: 1, y: 0 };
    _nextDir = { x: 1, y: 0 };
    _alive = true;
    _spawnFood();
    clearInterval(_timer);
    _timer = setInterval(_tick, _speed());
    _draw();
  }

  function _speed() {
    // Starts at 200ms, loses 5ms per food, floors at 60ms
    return Math.max(MIN_SPEED, BASE_SPEED - _score * 5);
  }

  function _spawnFood() {
    let pos;
    do {
      pos = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
    } while (_snake.some(s => s.x === pos.x && s.y === pos.y));
    _food = pos;
  }

  function _onKey(e) {
    if (!_alive && (e.key === 'Enter' || e.key === ' ')) { _start(); return; }
    const map = {
      ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
      w: { x: 0, y: -1 }, s: { x: 0, y: 1 },
      a: { x: -1, y: 0 }, d: { x: 1, y: 0 },
      W: { x: 0, y: -1 }, S: { x: 0, y: 1 },
      A: { x: -1, y: 0 }, D: { x: 1, y: 0 },
    };
    const nd = map[e.key];
    if (!nd) return;
    // Prevent reversing into self
    if (nd.x !== -_dir.x || nd.y !== -_dir.y) {
      if (nd.x !== _dir.x || nd.y !== _dir.y) _sfxTurn();
      _nextDir = nd;
    }
    e.preventDefault();
  }

  function _tick() {
    _dir = _nextDir;
    const head = { x: _snake[0].x + _dir.x, y: _snake[0].y + _dir.y };

    // Wall collision
    if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) { _gameOver(); return; }
    // Self collision
    if (_snake.some(s => s.x === head.x && s.y === head.y)) { _gameOver(); return; }

    _snake.unshift(head);

    if (head.x === _food.x && head.y === _food.y) {
      _score++;
      // Extra life every 100 points
      if (_score >= _nextLifeAt) {
        _lives++;
        _nextLifeAt += 100;
        _sfxExtraLife();
      } else {
        _sfxEat();
      }
      _updateHUD();
      _spawnFood();
      // Speed up
      clearInterval(_timer);
      _timer = setInterval(_tick, _speed());
    } else {
      _snake.pop();
    }

    _draw();
  }

  function _gameOver() {
    clearInterval(_timer);
    _lives--;
    _updateHUD();

    if (_lives > 0) {
      _sfxDeath();
      _alive = false;
      _draw();
      setTimeout(() => _respawn(), 800);
      return;
    }

    // Final death
    _sfxDerez();
    _alive = false;
    if (_score > _hi) {
      _hi = _score;
      localStorage.setItem('nice-tron-hi', String(_hi));
      const hiEl = document.getElementById('tron-hi');
      if (hiEl) hiEl.textContent = _hi;
    }
    if (_score >= 5 && typeof Gamification !== 'undefined') {
      Gamification.award('play_tron', _score);
    }
    _drawGameOver();
  }

  function _updateHUD() {
    const el = document.getElementById('tron-score');
    if (el) el.textContent = _score;
    const lv = document.getElementById('tron-lives');
    if (lv) lv.textContent = _lives;
  }

  function _drawEmpty() {
    if (!_ctx) return;
    const w = _canvas.width, h = _canvas.height;
    _ctx.fillStyle = '#020810';
    _ctx.fillRect(0, 0, w, h);
    _drawGrid();
  }

  function _drawGrid() {
    const w = _canvas.width, h = _canvas.height;
    _ctx.strokeStyle = 'rgba(24,160,251,0.08)';
    _ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID; i++) {
      const p = i * _cell;
      _ctx.beginPath(); _ctx.moveTo(p, 0); _ctx.lineTo(p, h); _ctx.stroke();
      _ctx.beginPath(); _ctx.moveTo(0, p); _ctx.lineTo(w, p); _ctx.stroke();
    }
  }

  function _draw() {
    if (!_ctx) return;
    const w = _canvas.width, h = _canvas.height;

    // Background
    _ctx.fillStyle = '#020810';
    _ctx.fillRect(0, 0, w, h);
    _drawGrid();

    // Snake light trail — solid connected line
    if (_snake.length > 1) {
      _ctx.shadowColor = 'rgba(24,160,251,0.6)';
      _ctx.shadowBlur = 6;
      _ctx.strokeStyle = 'rgba(24,160,251,0.85)';
      _ctx.lineWidth = Math.max(2, _cell * 0.4);
      _ctx.lineCap = 'round';
      _ctx.lineJoin = 'round';
      _ctx.beginPath();
      _ctx.moveTo(_snake[0].x * _cell + _cell / 2, _snake[0].y * _cell + _cell / 2);
      for (let i = 1; i < _snake.length; i++) {
        _ctx.lineTo(_snake[i].x * _cell + _cell / 2, _snake[i].y * _cell + _cell / 2);
      }
      _ctx.stroke();
      _ctx.shadowBlur = 0;
    }

    // Head — bright dot
    _ctx.shadowColor = 'rgba(200,240,255,0.8)';
    _ctx.shadowBlur = 10;
    _ctx.fillStyle = '#e0f0ff';
    _ctx.beginPath();
    _ctx.arc(_snake[0].x * _cell + _cell / 2, _snake[0].y * _cell + _cell / 2, Math.max(2, _cell * 0.3), 0, Math.PI * 2);
    _ctx.fill();
    _ctx.shadowBlur = 0;

    // Food — orange energy disc
    _ctx.shadowColor = 'rgba(239,68,68,0.8)';
    _ctx.shadowBlur = 10;
    _ctx.fillStyle = '#ef4444';
    _ctx.beginPath();
    _ctx.arc(_food.x * _cell + _cell / 2, _food.y * _cell + _cell / 2, Math.max(3, _cell * 0.35), 0, Math.PI * 2);
    _ctx.fill();

    // Inner glow on food
    _ctx.shadowBlur = 0;
    _ctx.fillStyle = 'rgba(255,120,60,0.5)';
    _ctx.beginPath();
    _ctx.arc(_food.x * _cell + _cell / 2, _food.y * _cell + _cell / 2, Math.max(1.5, _cell * 0.15), 0, Math.PI * 2);
    _ctx.fill();

    _ctx.shadowBlur = 0;
    _ctx.shadowColor = 'transparent';
  }

  function _drawGameOver() {
    if (!_ctx) return;
    _draw(); // draw final state

    const w = _canvas.width, h = _canvas.height;
    // Darken
    _ctx.fillStyle = 'rgba(2,8,16,0.8)';
    _ctx.fillRect(0, 0, w, h);

    // DEREZZED text
    _ctx.fillStyle = '#ef4444';
    _ctx.font = `bold ${Math.floor(_cell * 1.5)}px Orbitron, sans-serif`;
    _ctx.textAlign = 'center';
    _ctx.shadowColor = 'rgba(239,68,68,0.5)';
    _ctx.shadowBlur = 15;
    _ctx.fillText('DEREZZED', w / 2, h / 2 - 10);

    // Score
    _ctx.fillStyle = '#18a0fb';
    _ctx.font = `${Math.floor(_cell * 0.7)}px Orbitron, sans-serif`;
    _ctx.shadowColor = 'rgba(24,160,251,0.4)';
    _ctx.shadowBlur = 8;
    _ctx.fillText('SCORE: ' + _score, w / 2, h / 2 + 20);

    // Restart hint
    _ctx.fillStyle = 'rgba(24,160,251,0.5)';
    _ctx.font = `${Math.floor(_cell * 0.5)}px Orbitron, sans-serif`;
    _ctx.shadowBlur = 0;
    _ctx.fillText('PRESS ENTER TO REJOIN', w / 2, h / 2 + 45);

    _ctx.shadowBlur = 0;
    _ctx.shadowColor = 'transparent';
  }

  return { render, destroy };
})();
