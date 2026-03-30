/* ─────────────────────────────────────────────────────────────────
   MODULE: Theme Effects — Canvas background effects for premium themes
   Registers: glitch, digital-rain, lcars effects
   Theme definitions now live in THEMES array (nice.js SSOT).
───────────────────────────────────────────────────────────────── */
(() => {
  // Effects register on Theme (SSOT) via Skin.registerEffect (compat bridge)
  const reg = (typeof Theme !== 'undefined' && Theme.registerEffect)
    ? Theme.registerEffect
    : (typeof Skin !== 'undefined' && Skin.registerEffect)
      ? Skin.registerEffect
      : () => {};

  /* ══════════════════════════════════════════════════════════════
     EFFECT: Glitch (Cyberpunk)
  ══════════════════════════════════════════════════════════════ */
  reg('glitch', (canvas) => {
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    let raf;
    let tick = 0;
    function draw() {
      tick++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (tick % 4 === 0) {
        const numLines = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < numLines; i++) {
          const y = Math.random() * canvas.height;
          const h = 1 + Math.random() * 3;
          const w = 30 + Math.random() * 200;
          const x = Math.random() * canvas.width;
          ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,45,111,0.15)' : 'rgba(0,255,245,0.12)';
          ctx.fillRect(x, y, w, h);
        }
      }
      if (tick % 60 < 3) {
        for (let y = 0; y < canvas.height; y += 4) {
          ctx.fillStyle = 'rgba(0,255,245,0.03)';
          ctx.fillRect(0, y, canvas.width, 1);
        }
      }
      for (let i = 0; i < 8; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,45,111,0.2)' : 'rgba(0,255,245,0.2)';
        ctx.fillRect(x, y, 2 + Math.random() * 4, 2);
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    const onResize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  });

  /* ══════════════════════════════════════════════════════════════
     EFFECT: Digital Rain (Matrix)
  ══════════════════════════════════════════════════════════════ */
  reg('digital-rain', (canvas) => {
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF';
    const fontSize = 14;
    const columns = Math.floor(canvas.width / fontSize);
    const drops = new Array(columns).fill(0).map(() => Math.random() * -100);
    const speeds = new Array(columns).fill(0).map(() => 0.3 + Math.random() * 0.7);
    let raf;
    function draw() {
      ctx.fillStyle = 'rgba(0,6,0,0.12)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < columns; i++) {
        const char = CHARS[Math.floor(Math.random() * CHARS.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;
        ctx.fillStyle = '#aaffaa';
        ctx.font = fontSize + 'px "Fira Code", monospace';
        ctx.globalAlpha = 0.9;
        ctx.fillText(char, x, y);
        ctx.fillStyle = '#00ff41';
        ctx.globalAlpha = 0.15;
        for (let t = 1; t < 6; t++) {
          const tc = CHARS[Math.floor(Math.random() * CHARS.length)];
          ctx.fillText(tc, x, y - t * fontSize);
        }
        ctx.globalAlpha = 1;
        drops[i] += speeds[i];
        if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    const onResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const newCols = Math.floor(canvas.width / fontSize);
      drops.length = newCols;
      speeds.length = newCols;
      for (let i = 0; i < newCols; i++) {
        if (drops[i] === undefined) { drops[i] = Math.random() * -100; speeds[i] = 0.3 + Math.random() * 0.7; }
      }
    };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  });

  /* ══════════════════════════════════════════════════════════════
     EFFECT: LCARS Data Stream (Star Trek)
  ══════════════════════════════════════════════════════════════ */
  reg('lcars', (canvas) => {
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const COLORS = ['#ff9966', '#cc6699', '#9999cc', '#cc99cc', '#ffcc99', '#6688cc', '#cc6666'];
    const readouts = [];
    for (let i = 0; i < 30; i++) {
      readouts.push({
        x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        num: Math.floor(Math.random() * 99999).toString().padStart(2 + Math.floor(Math.random() * 4), '0'),
        alpha: Math.random() * 0.3, da: 0.003 + Math.random() * 0.005, fadeDir: 1,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: 9 + Math.floor(Math.random() * 5), life: Math.floor(Math.random() * 300),
      });
    }
    const bars = [];
    for (let i = 0; i < 4; i++) {
      bars.push({
        y: Math.random() * canvas.height, speed: 0.3 + Math.random() * 0.6,
        width: 40 + Math.random() * 160, height: 2 + Math.random() * 4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        x: Math.random() * canvas.width, dir: Math.random() > 0.5 ? 1 : -1,
      });
    }
    let raf, tick = 0;
    function draw() {
      tick++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      bars.forEach(b => {
        b.x += b.speed * b.dir;
        if (b.x > canvas.width + b.width) { b.x = -b.width; b.y = Math.random() * canvas.height; }
        if (b.x < -b.width) { b.x = canvas.width + b.width; b.y = Math.random() * canvas.height; }
        ctx.fillStyle = b.color;
        ctx.globalAlpha = 0.08;
        const r = b.height / 2;
        ctx.beginPath();
        ctx.moveTo(b.x + r, b.y);
        ctx.lineTo(b.x + b.width - r, b.y);
        ctx.arc(b.x + b.width - r, b.y + r, r, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(b.x + r, b.y + b.height);
        ctx.arc(b.x + r, b.y + r, r, Math.PI / 2, -Math.PI / 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });
      ctx.font = '12px "Share Tech Mono", monospace';
      readouts.forEach(r => {
        r.life++;
        r.alpha += r.da * r.fadeDir;
        if (r.alpha >= 0.25) r.fadeDir = -1;
        if (r.alpha <= 0) {
          r.fadeDir = 1; r.alpha = 0;
          r.x = Math.random() * canvas.width; r.y = Math.random() * canvas.height;
          r.num = Math.floor(Math.random() * 99999).toString().padStart(2 + Math.floor(Math.random() * 4), '0');
          r.color = COLORS[Math.floor(Math.random() * COLORS.length)];
        }
        ctx.globalAlpha = Math.max(0, r.alpha);
        ctx.fillStyle = r.color;
        ctx.font = r.size + 'px "Share Tech Mono", monospace';
        ctx.fillText(r.num, r.x, r.y);
      });
      ctx.globalAlpha = 1;
      if (tick % 180 < 2) {
        const pulseY = (tick * 1.5) % canvas.height;
        const grad = ctx.createLinearGradient(0, pulseY - 20, 0, pulseY + 20);
        grad.addColorStop(0, 'rgba(255,153,102,0)');
        grad.addColorStop(0.5, 'rgba(255,153,102,0.06)');
        grad.addColorStop(1, 'rgba(255,153,102,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, pulseY - 20, canvas.width, 40);
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    const onResize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  });

})();
