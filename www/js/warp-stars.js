/* NICE SPACESHIP — Warp Starfield (forward motion) */
const WarpStars = (() => {
  let canvas, ctx, w, h, raf;
  let stars = [];
  const COUNT = 200;
  const SPEED = 0.15;
  const cx = () => w / 2;
  const cy = () => h / 2;

  function makeStar(fromCenter) {
    const angle = Math.random() * Math.PI * 2;
    const dist = fromCenter ? Math.random() * 20 : Math.random() * Math.max(w, h) * 0.7;
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      z: fromCenter ? 0.01 : Math.random(),
      pz: 0,
      speed: Math.random() * 0.004 + 0.002,
    };
  }

  function init() {
    canvas = document.getElementById('warp-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    stars = Array.from({ length: COUNT }, () => makeStar(false));
    loop();
  }

  function resize() {
    const section = canvas.parentElement;
    w = canvas.width = section.offsetWidth;
    h = canvas.height = section.offsetHeight;
  }

  function _bgFade() {
    // walk up looking for an opaque background; many sections inherit from
    // body and report rgba(0,0,0,0), which would slowly darken the canvas.
    let el = canvas.parentElement;
    while (el) {
      const cs = getComputedStyle(el).backgroundColor;
      const m = cs.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (m) {
        const a = m[4] === undefined ? 1 : parseFloat(m[4]);
        if (a > 0.5) return `rgba(${m[1]},${m[2]},${m[3]},0.28)`;
      }
      el = el.parentElement;
    }
    return 'rgba(255,255,255,0.28)';
  }

  function loop() {
    // fade trail instead of clear for streak effect
    ctx.fillStyle = _bgFade();
    ctx.fillRect(0, 0, w, h);

    const centerX = cx();
    const centerY = cy();

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      s.pz = s.z;
      s.z += s.speed * SPEED;

      if (s.z > 1) {
        stars[i] = makeStar(true);
        continue;
      }

      // project from center
      const scale = 1 / (1 - s.z);
      const sx = centerX + s.x * scale;
      const sy = centerY + s.y * scale;

      // previous position for streak
      const pScale = 1 / (1 - s.pz);
      const psx = centerX + s.x * pScale;
      const psy = centerY + s.y * pScale;

      // off screen check
      if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) {
        stars[i] = makeStar(true);
        continue;
      }

      const alpha = Math.min(s.z * 0.7, 0.32);
      const size = Math.max(s.z * 2, 0.3);

      // draw streak — Sapphire
      ctx.beginPath();
      ctx.moveTo(psx, psy);
      ctx.lineTo(sx, sy);
      ctx.strokeStyle = 'rgba(15,82,186,' + alpha + ')';
      ctx.lineWidth = size;
      ctx.stroke();

      // bright head
      ctx.beginPath();
      ctx.arc(sx, sy, size * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(24,98,206,' + Math.min(alpha + 0.1, 0.4) + ')';
      ctx.fill();
    }

    raf = requestAnimationFrame(loop);
  }

  function destroy() {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  }

  return { init, destroy };
})();
