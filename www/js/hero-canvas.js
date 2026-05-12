/* NICE SPACESHIP — Hero Canvas Animation
   Neural intelligence network with traveling neurons */
const HeroCanvas = (() => {
  let canvas, ctx, w, h, raf;
  let stars = [], nodes = [], pulses = [];
  const STAR_COUNT = 160;
  const NODE_COUNT = 24;
  const PULSE_COUNT = 18;

  /* ── palette — Sapphire on light (matches brand kit Phase 2a/3) ── */
  const C = {
    star: 'rgba(15,82,186,',         // Sapphire core
    node: 'rgba(15,82,186,',         // Sapphire
    line: 'rgba(15,82,186,',         // Sapphire
    pulse: 'rgba(24,98,206,',        // Sapphire hover (lighter)
    grid: 'rgba(15,82,186,0.04)',    // very dim Sapphire
  };

  /* ── Mythic RGB cycle for the still nodes ──
     Same palette as mythic-rgb-border + the chromatic card backdrops.
     Each node's color is offset by its index so the hue rolls around
     the ring instead of all 24 changing in lockstep. */
  const RGB_PALETTE = [
    [255, 45, 85],   // ff2d55
    [255, 107, 45],  // ff6b2d
    [255, 211, 45],  // ffd32d
    [45, 255, 107],  // 2dff6b
    [45, 159, 255],  // 2d9fff
    [168, 45, 255],  // a82dff
  ];
  let colorPhase = 0;
  const PHASE_SPEED = 0.0008; // full cycle ≈ 21 seconds at 60fps

  function rgbAt(t) {
    const n = RGB_PALETTE.length;
    const f = ((t % 1) + 1) % 1 * n;
    const i = Math.floor(f) % n;
    const j = (i + 1) % n;
    const k = f - Math.floor(f);
    const a = RGB_PALETTE[i], b = RGB_PALETTE[j];
    return [
      Math.round(a[0] + (b[0] - a[0]) * k),
      Math.round(a[1] + (b[1] - a[1]) * k),
      Math.round(a[2] + (b[2] - a[2]) * k),
    ];
  }

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

  /* ── node (neural network point) ──
     Symmetric concentric-ring layout, mirroring the NICE schematic language.
     8 inner + 16 outer = 24 nodes total (matches NODE_COUNT). Each node drifts
     in a small orbit around its ring position so the lattice still breathes. */
  const INNER_RING = 8;
  function makeNode(idx) {
    const isInner = idx < INNER_RING;
    const i = isInner ? idx : idx - INNER_RING;
    const count = isInner ? INNER_RING : NODE_COUNT - INNER_RING;
    const baseR = Math.min(w, h);
    const radius = isInner ? baseR * 0.42 : baseR * 0.62;
    // Rotate the outer ring by half a step so it interleaves with the inner —
    // gives a richer, more web-like topology when neighbours pair up.
    const offset = isInner ? 0 : Math.PI / count;
    const ringAngle = (i / count) * Math.PI * 2 + offset;
    return {
      cx: w / 2 + Math.cos(ringAngle) * radius,
      cy: h / 2 + Math.sin(ringAngle) * radius,
      orbitR: 10 + Math.random() * 6,
      angle: Math.random() * Math.PI * 2,
      speed: (Math.random() * 0.0002 + 0.00005) * (Math.random() > 0.5 ? 1 : -1),
      r: isInner ? 2.5 : 2,
      glow: isInner ? 10 : 8,
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
    nodes = Array.from({ length: NODE_COUNT }, (_, i) => makeNode(i));
    pulses = Array.from({ length: PULSE_COUNT }, makePulse);
    loop();
  }

  function resize() {
    const hero = canvas.parentElement;
    w = canvas.width = hero.offsetWidth;
    h = canvas.height = hero.offsetHeight;
    // Stars and nodes use absolute coordinates baked in at creation —
    // a viewport resize would leave them clustered in the old bounds.
    if (stars.length) stars = Array.from({ length: STAR_COUNT }, makeStar);
    if (nodes.length) nodes = Array.from({ length: NODE_COUNT }, (_, i) => makeNode(i));
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
    colorPhase = (colorPhase + PHASE_SPEED) % 1;

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
      // bump alpha for visibility on light bg
      ctx.fillStyle = C.star + (s.a * flicker * 1.6) + ')';
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
        const alpha = (1 - nb.d / 350) * 0.18;
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

    // ── draw nodes (RGB cycle, offset per index so the hue rolls round) ──
    for (let ni = 0; ni < nodes.length; ni++) {
      const n = nodes[ni];
      const [r, g, b] = rgbAt(colorPhase + ni / nodes.length);
      const prefix = 'rgba(' + r + ',' + g + ',' + b + ',';
      // outer glow
      const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.glow);
      grad.addColorStop(0, prefix + '0.32)');
      grad.addColorStop(1, prefix + '0)');
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.glow, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      // core
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = prefix + '0.95)';
      ctx.fill();
      // outer ring
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = prefix + '0.24)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    raf = requestAnimationFrame(loop);
  }

  function destroy() {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  }

  return { init, destroy };
})();
