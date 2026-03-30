/* ═══════════════════════════════════════════════════════════════════
   TronGameView — Lightcycle Snake Game (The Grid theme exclusive)
   Classic snake mechanics with TRON aesthetics.
   Arrow/WASD to steer, collect energy, avoid your own trail.
═══════════════════════════════════════════════════════════════════ */

const TronGameView = (() => {
  const title = 'Light Cycle';
  const GRID = 20;          // grid cells per axis (bigger cells = more visible)
  const TICK_MS = 130;       // ms per game tick (slightly slower for playability)
  const HS_KEY = 'nice-tron-highscore';

  let _el = null;
  let _cvs = null;
  let _ctx = null;
  let _raf = null;
  let _tickTimer = null;
  let _running = false;
  let _gameOver = false;

  // Game state
  let _dir = { x: 1, y: 0 };
  let _nextDir = { x: 1, y: 0 };
  let _trail = [];           // [{x,y}, ...] — head is last element
  let _energy = { x: 0, y: 0 };
  let _score = 0;
  let _highScore = 0;
  let _cellW = 0;
  let _cellH = 0;

  // Touch support
  let _touchStart = null;

  /* ── Render ── */
  function render(el) {
    _el = el;
    _highScore = parseInt(localStorage.getItem(HS_KEY) || '0', 10);

    el.innerHTML = `
      <div class="tron-game-wrap">
        <div class="tron-game-hud">
          <span class="tron-hud-label">SCORE</span>
          <span class="tron-hud-value" id="tron-score">0</span>
          <span class="tron-hud-sep">|</span>
          <span class="tron-hud-label">HIGH</span>
          <span class="tron-hud-value" id="tron-high">${_highScore}</span>
        </div>
        <div class="tron-game-arena">
          <canvas id="tron-canvas"></canvas>
          <div class="tron-overlay" id="tron-overlay">
            <div class="tron-overlay-title">LIGHT CYCLE</div>
            <div class="tron-overlay-sub">Arrow keys or WASD to steer</div>
            <button class="tron-start-btn" id="tron-start">ENTER THE GRID</button>
          </div>
          <div class="tron-gameover" id="tron-gameover" style="display:none">
            <div class="tron-go-title">DEREZZED</div>
            <div class="tron-go-score">SCORE: <span id="tron-final-score">0</span></div>
            <button class="tron-start-btn" id="tron-restart">REREZ</button>
          </div>
        </div>
      </div>
    `;

    _cvs = document.getElementById('tron-canvas');
    _ctx = _cvs.getContext('2d');

    _resize();
    _drawGrid();

    // Bind events
    document.getElementById('tron-start')?.addEventListener('click', _startGame);
    document.getElementById('tron-restart')?.addEventListener('click', _startGame);
    window.addEventListener('keydown', _onKey);
    window.addEventListener('resize', _resize);

    // Touch controls
    _cvs.addEventListener('touchstart', _onTouchStart, { passive: true });
    _cvs.addEventListener('touchend', _onTouchEnd, { passive: true });
  }

  function destroy() {
    _stop();
    window.removeEventListener('keydown', _onKey);
    window.removeEventListener('resize', _resize);
    if (_cvs) {
      _cvs.removeEventListener('touchstart', _onTouchStart);
      _cvs.removeEventListener('touchend', _onTouchEnd);
    }
    _el = null; _cvs = null; _ctx = null;
  }

  /* ── Game Loop ── */
  function _startGame() {
    document.getElementById('tron-overlay').style.display = 'none';
    document.getElementById('tron-gameover').style.display = 'none';

    _score = 0;
    _dir = { x: 1, y: 0 };
    _nextDir = { x: 1, y: 0 };
    _gameOver = false;
    _running = true;

    // Start in center with length 4
    const cx = Math.floor(GRID / 2);
    const cy = Math.floor(GRID / 2);
    _trail = [
      { x: cx - 3, y: cy },
      { x: cx - 2, y: cy },
      { x: cx - 1, y: cy },
      { x: cx, y: cy },
    ];

    _spawnEnergy();
    _updateHUD();

    _stop();
    _tickTimer = setInterval(_tick, TICK_MS);
    _raf = requestAnimationFrame(_draw);
  }

  function _stop() {
    if (_tickTimer) { clearInterval(_tickTimer); _tickTimer = null; }
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
    _running = false;
  }

  function _tick() {
    if (_gameOver || !_running) return;

    // Apply direction
    _dir = { ..._nextDir };

    // Move head
    const head = _trail[_trail.length - 1];
    const nx = head.x + _dir.x;
    const ny = head.y + _dir.y;

    // Wall collision
    if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) {
      _endGame();
      return;
    }

    // Self collision
    if (_trail.some(t => t.x === nx && t.y === ny)) {
      _endGame();
      return;
    }

    _trail.push({ x: nx, y: ny });

    // Energy pickup
    if (nx === _energy.x && ny === _energy.y) {
      _score += 10;
      _updateHUD();
      _spawnEnergy();
      // Don't remove tail — trail grows
    } else {
      _trail.shift(); // Remove tail
    }
  }

  function _endGame() {
    _gameOver = true;
    _stop();

    if (_score > _highScore) {
      _highScore = _score;
      localStorage.setItem(HS_KEY, String(_highScore));
    }

    document.getElementById('tron-final-score').textContent = _score;
    document.getElementById('tron-high').textContent = _highScore;
    document.getElementById('tron-gameover').style.display = '';

    // Award XP
    if (typeof Gamification !== 'undefined') {
      Gamification.addXP('play_game');
    }

    // Final draw
    _drawFrame();
  }

  /* ── Rendering ── */
  function _draw() {
    if (!_running) return;
    _drawFrame();
    _raf = requestAnimationFrame(_draw);
  }

  function _drawFrame() {
    if (!_ctx || !_cvs) return;
    const W = _cvs.width;
    const H = _cvs.height;

    // Clear
    _ctx.fillStyle = '#010509';
    _ctx.fillRect(0, 0, W, H);

    // Grid lines
    _ctx.strokeStyle = 'rgba(0,229,255,0.12)';
    _ctx.lineWidth = 1;
    for (let i = 0; i <= GRID; i++) {
      const x = i * _cellW;
      const y = i * _cellH;
      _ctx.beginPath(); _ctx.moveTo(x, 0); _ctx.lineTo(x, H); _ctx.stroke();
      _ctx.beginPath(); _ctx.moveTo(0, y); _ctx.lineTo(W, y); _ctx.stroke();
    }

    // Trail — gradient from dim to bright
    const len = _trail.length;
    for (let i = 0; i < len; i++) {
      const t = _trail[i];
      const age = i / len; // 0 = oldest, 1 = newest

      if (i === len - 1) {
        // Head — bright white with strong glow
        _ctx.fillStyle = '#ffffff';
        _ctx.shadowColor = '#00e5ff';
        _ctx.shadowBlur = 18;
        _ctx.fillRect(t.x * _cellW, t.y * _cellH, _cellW, _cellH);
        _ctx.shadowBlur = 0;
        // Extra glow ring around head
        _ctx.strokeStyle = 'rgba(0,229,255,0.6)';
        _ctx.lineWidth = 2;
        _ctx.strokeRect(t.x * _cellW - 1, t.y * _cellH - 1, _cellW + 2, _cellH + 2);
      } else {
        // Trail body — solid cyan, fading with age
        const alpha = 0.3 + age * 0.6;
        _ctx.fillStyle = `rgba(0,229,255,${alpha})`;
        _ctx.fillRect(t.x * _cellW, t.y * _cellH, _cellW, _cellH);
      }
    }

    // Trail glow line connecting segments
    if (len > 1) {
      _ctx.strokeStyle = 'rgba(0,229,255,0.5)';
      _ctx.lineWidth = 3;
      _ctx.shadowColor = '#00e5ff';
      _ctx.shadowBlur = 10;
      _ctx.beginPath();
      _ctx.moveTo(_trail[0].x * _cellW + _cellW / 2, _trail[0].y * _cellH + _cellH / 2);
      for (let i = 1; i < len; i++) {
        _ctx.lineTo(_trail[i].x * _cellW + _cellW / 2, _trail[i].y * _cellH + _cellH / 2);
      }
      _ctx.stroke();
      _ctx.shadowBlur = 0;
    }

    // Energy pickup — pulsing glow
    const pulse = 0.7 + Math.sin(Date.now() / 150) * 0.3;
    _ctx.fillStyle = `rgba(0,229,255,${pulse})`;
    _ctx.shadowColor = '#00e5ff';
    _ctx.shadowBlur = 24 * pulse;
    _ctx.fillRect(
      _energy.x * _cellW + 1, _energy.y * _cellH + 1,
      _cellW - 2, _cellH - 2
    );
    // Inner bright core
    _ctx.fillStyle = `rgba(255,255,255,${pulse * 0.9})`;
    _ctx.fillRect(
      _energy.x * _cellW + _cellW * 0.2, _energy.y * _cellH + _cellH * 0.2,
      _cellW * 0.6, _cellH * 0.6
    );
    // Outer glow ring
    _ctx.strokeStyle = `rgba(0,229,255,${pulse * 0.5})`;
    _ctx.lineWidth = 2;
    _ctx.strokeRect(
      _energy.x * _cellW - 2, _energy.y * _cellH - 2,
      _cellW + 4, _cellH + 4
    );
    _ctx.shadowBlur = 0;

    // Game over flash
    if (_gameOver) {
      // Flash the head red
      const head = _trail[_trail.length - 1];
      _ctx.fillStyle = 'rgba(255,50,50,0.8)';
      _ctx.shadowColor = '#ff3333';
      _ctx.shadowBlur = 20;
      _ctx.fillRect(head.x * _cellW, head.y * _cellH, _cellW, _cellH);
      _ctx.shadowBlur = 0;
    }
  }

  function _drawGrid() {
    if (!_ctx || !_cvs) return;
    _ctx.fillStyle = '#010509';
    _ctx.fillRect(0, 0, _cvs.width, _cvs.height);
    _ctx.strokeStyle = 'rgba(0,229,255,0.12)';
    _ctx.lineWidth = 1;
    for (let i = 0; i <= GRID; i++) {
      const x = i * _cellW;
      const y = i * _cellH;
      _ctx.beginPath(); _ctx.moveTo(x, 0); _ctx.lineTo(x, _cvs.height); _ctx.stroke();
      _ctx.beginPath(); _ctx.moveTo(0, y); _ctx.lineTo(_cvs.width, y); _ctx.stroke();
    }
  }

  /* ── Helpers ── */
  function _resize() {
    if (!_cvs || !_el) return;
    const arena = _cvs.parentElement;
    if (!arena) return;
    const rect = arena.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height - 4);
    _cvs.width = size;
    _cvs.height = size;
    _cvs.style.width = size + 'px';
    _cvs.style.height = size + 'px';
    _cellW = size / GRID;
    _cellH = size / GRID;
    if (!_running) _drawGrid();
  }

  function _spawnEnergy() {
    let pos;
    do {
      pos = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
    } while (_trail.some(t => t.x === pos.x && t.y === pos.y));
    _energy = pos;
  }

  function _updateHUD() {
    const scoreEl = document.getElementById('tron-score');
    if (scoreEl) scoreEl.textContent = _score;
  }

  /* ── Input ── */
  function _onKey(e) {
    if (!_running) return;
    const key = e.key;
    // Prevent reversing into yourself
    if ((key === 'ArrowUp' || key === 'w' || key === 'W') && _dir.y !== 1) {
      _nextDir = { x: 0, y: -1 }; e.preventDefault();
    } else if ((key === 'ArrowDown' || key === 's' || key === 'S') && _dir.y !== -1) {
      _nextDir = { x: 0, y: 1 }; e.preventDefault();
    } else if ((key === 'ArrowLeft' || key === 'a' || key === 'A') && _dir.x !== 1) {
      _nextDir = { x: -1, y: 0 }; e.preventDefault();
    } else if ((key === 'ArrowRight' || key === 'd' || key === 'D') && _dir.x !== -1) {
      _nextDir = { x: 1, y: 0 }; e.preventDefault();
    }
  }

  function _onTouchStart(e) {
    const t = e.touches[0];
    _touchStart = { x: t.clientX, y: t.clientY };
  }

  function _onTouchEnd(e) {
    if (!_touchStart || !_running) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - _touchStart.x;
    const dy = t.clientY - _touchStart.y;
    _touchStart = null;

    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return; // Too small

    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal swipe
      if (dx > 0 && _dir.x !== -1) _nextDir = { x: 1, y: 0 };
      else if (dx < 0 && _dir.x !== 1) _nextDir = { x: -1, y: 0 };
    } else {
      // Vertical swipe
      if (dy > 0 && _dir.y !== -1) _nextDir = { x: 0, y: 1 };
      else if (dy < 0 && _dir.y !== 1) _nextDir = { x: 0, y: -1 };
    }
  }

  return { title, render, destroy };
})();
