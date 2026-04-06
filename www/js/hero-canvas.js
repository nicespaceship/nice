/* NICE SPACESHIP — Hero Canvas Animation
   Neural intelligence network with traveling neurons */
const HeroCanvas = (() => {
  let canvas, ctx, w, h, raf;
  let stars = [], nodes = [], pulses = [];
  const STAR_COUNT = 160;
  const NODE_COUNT = 24;
  const PULSE_COUNT = 18;

  /* ── palette (matches app theme) ── */
  const C = {
    star: 'rgba(224,231,255,',       // accent
    node: 'rgba(165,180,252,',       // accent2
    line: 'rgba(165,180,252,',       // accent2
    pulse: 'rgba(165,180,252,',      // accent2
    grid: 'rgba(63,63,70,0.08)',     // border dim
  };

  /* ── star ── */
  function makeStar() {
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.2 + 0.2,
      a: Math.random() * 0.4 + 0.05,
      twinkle: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.004 + 0.001,
    };
  }

  /* ── node (neural network point) ── */
  function makeNode() {
    const cx = Math.random() * w * 1.1 - w * 0.05;
    const cy = Math.random() * h * 1.1 - h * 0.05;
    const orbitR = Math.random() * 40 + 8;
    const angle = Math.random() * Math.PI * 2;
    return {
      cx, cy, orbitR, angle,
      speed: (Math.random() * 0.0002 + 0.00005) * (Math.random() > 0.5 ? 1 : -1),
      r: Math.random() * 2.5 + 1.5,
      glow: Math.random() * 10 + 6,
      x: 0, y: 0,
    };
  }

  /* ── neuron pulse traveling between nodes ── */
  function makePulse() {
    const a = Math.floor(Math.random() * NODE_COUNT);
    let b = Math.floor(Math.random() * NODE_COUNT);
    if (b === a) b = (a + 1) % NODE_COUNT;
    return {
      from: a, to: b,
      t: Math.random(),  // start at random position along path
      speed: Math.random() * 0.002 + 0.001,
      size: Math.random() * 1.5 + 1,
      trail: [],
    };
  }

  /* ── init ── */
  function init() {
    canvas = document.getElementById('hero-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    stars = Array.from({ length: STAR_COUNT }, makeStar);
    nodes = Array.from({ length: NODE_COUNT }, makeNode);
    pulses = Array.from({ length: PULSE_COUNT }, makePulse);
    loop();
  }

  function resize() {
    const hero = canvas.parentElement;
    w = canvas.width = hero.offsetWidth;
    h = canvas.height = hero.offsetHeight;
  }

  /* ── find closest N nodes to a given node ── */
  function getNeighbors(idx, count) {
    const n = nodes[idx];
    const dists = nodes.map((other, i) => {
      if (i === idx) return { i, d: Infinity };
      const dx = n.x - other.x, dy = n.y - other.y;
      return { i, d: Math.sqrt(dx * dx + dy * dy) };
    });
    dists.sort((a, b) => a.d - b.d);
    return dists.slice(0, count);
  }

  /* ── render loop ── */
  function loop() {
    ctx.clearRect(0, 0, w, h);

    // ── subtle grid ──
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 0.5;
    const gridSize = 80;
    for (let x = gridSize; x < w; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = gridSize; y < h; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // ── stars (slow twinkle) ──
    for (const s of stars) {
      s.twinkle += s.speed;
      const flicker = Math.sin(s.twinkle) * 0.3 + 0.7;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = C.star + (s.a * flicker) + ')';
      ctx.fill();
    }

    // ── update node positions (very slow drift) ──
    for (const n of nodes) {
      n.angle += n.speed;
      n.x = n.cx + Math.cos(n.angle) * n.orbitR;
      n.y = n.cy + Math.sin(n.angle) * n.orbitR * 0.6;
    }

    // ── draw neural network connections ──
    for (let i = 0; i < nodes.length; i++) {
      const neighbors = getNeighbors(i, 3);
      for (const nb of neighbors) {
        if (nb.d > 350) continue;
        if (nb.i < i) continue; // avoid drawing twice
        const alpha = (1 - nb.d / 350) * 0.1;
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[nb.i].x, nodes[nb.i].y);
        ctx.strokeStyle = C.line + alpha + ')';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }

    // ── draw traveling neurons (pulses with trails) ──
    for (let i = 0; i < pulses.length; i++) {
      const p = pulses[i];
      p.t += p.speed;

      if (p.t > 1) {
        // neuron arrived — pick a new path from the destination node
        const oldTo = p.to;
        const neighbors = getNeighbors(oldTo, 4);
        const validNeighbors = neighbors.filter(nb => nb.d < 400 && nb.i !== p.from);
        const next = validNeighbors.length > 0
          ? validNeighbors[Math.floor(Math.random() * validNeighbors.length)].i
          : Math.floor(Math.random() * NODE_COUNT);
        p.from = oldTo;
        p.to = next;
        p.t = 0;
        p.trail = [];
        continue;
      }

      const n1 = nodes[p.from], n2 = nodes[p.to];
      const px = n1.x + (n2.x - n1.x) * p.t;
      const py = n1.y + (n2.y - n1.y) * p.t;

      // store trail
      p.trail.push({ x: px, y: py });
      if (p.trail.length > 12) p.trail.shift();

      // draw trail
      for (let t = 0; t < p.trail.length; t++) {
        const trailAlpha = (t / p.trail.length) * 0.4;
        const trailSize = p.size * (t / p.trail.length) * 0.6;
        ctx.beginPath();
        ctx.arc(p.trail[t].x, p.trail[t].y, trailSize, 0, Math.PI * 2);
        ctx.fillStyle = C.pulse + trailAlpha + ')';
        ctx.fill();
      }

      // draw neuron head
      const alpha = Math.sin(p.t * Math.PI) * 0.7 + 0.3;
      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);
      ctx.fillStyle = C.pulse + alpha + ')';
      ctx.fill();
      // glow
      ctx.beginPath();
      ctx.arc(px, py, p.size + 4, 0, Math.PI * 2);
      ctx.fillStyle = C.pulse + (alpha * 0.15) + ')';
      ctx.fill();
    }

    // ── draw nodes ──
    for (const n of nodes) {
      // outer glow
      const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.glow);
      grad.addColorStop(0, C.node + '0.2)');
      grad.addColorStop(1, C.node + '0)');
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.glow, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      // core
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = C.node + '0.6)';
      ctx.fill();
      // outer ring
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = C.node + '0.12)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // ── subtle central aura ──
    const auraGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.45);
    auraGrad.addColorStop(0, 'rgba(165,180,252,0.025)');
    auraGrad.addColorStop(1, 'rgba(165,180,252,0)');
    ctx.fillStyle = auraGrad;
    ctx.fillRect(0, 0, w, h);

    raf = requestAnimationFrame(loop);
  }

  function destroy() {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  }

  return { init, destroy };
})();
