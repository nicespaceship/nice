/* NICE SPACESHIP — Blueprint Grid Background
   Animated blueprint-style grid with drifting intersections and line pulses */
const BlueprintGrid = (() => {
  let canvas, ctx, w, h, raf, time = 0;
  let intersections = [], linePulses = [];
  const GRID = 56;
  const PULSE_COUNT = 20;

  const C = {
    grid: 'rgba(165,180,252,',
    node: 'rgba(165,180,252,',
    pulse: 'rgba(224,231,255,',
  };

  function makeIntersection(x, y) {
    return {
      x, y,
      baseX: x, baseY: y,
      r: Math.random() * 2 + 1,
      phase: Math.random() * Math.PI * 2,
      driftX: (Math.random() - 0.5) * 0.15,
      driftY: (Math.random() - 0.5) * 0.15,
      glow: Math.random() > 0.7,
    };
  }

  function makeLinePulse() {
    const horizontal = Math.random() > 0.5;
    if (horizontal) {
      const row = Math.floor(Math.random() * Math.ceil(h / GRID)) * GRID;
      return { x: -20, y: row, vx: Math.random() * 0.6 + 0.3, vy: 0, horizontal: true, size: Math.random() * 60 + 30 };
    } else {
      const col = Math.floor(Math.random() * Math.ceil(w / GRID)) * GRID;
      return { x: col, y: -20, vx: 0, vy: Math.random() * 0.6 + 0.3, horizontal: false, size: Math.random() * 60 + 30 };
    }
  }

  function init() {
    canvas = document.getElementById('blueprint-grid-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);

    // create intersections at grid points
    for (let x = 0; x <= w + GRID; x += GRID) {
      for (let y = 0; y <= h + GRID; y += GRID) {
        if (Math.random() > 0.4) {
          intersections.push(makeIntersection(x, y));
        }
      }
    }

    linePulses = Array.from({ length: PULSE_COUNT }, makeLinePulse);
    loop();
  }

  function resize() {
    const section = canvas.parentElement;
    w = canvas.width = section.offsetWidth;
    h = canvas.height = section.offsetHeight;
  }

  function loop() {
    time += 0.005;
    ctx.clearRect(0, 0, w, h);


    // ── grid lines ──
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= w; x += GRID) {
      const wobble = Math.sin(time + x * 0.01) * 1.5;
      ctx.beginPath(); ctx.moveTo(x + wobble, 0); ctx.lineTo(x + wobble, h);
      ctx.strokeStyle = C.grid + '0.04)'; ctx.stroke();
    }
    for (let y = 0; y <= h; y += GRID) {
      const wobble = Math.cos(time + y * 0.01) * 1.5;
      ctx.beginPath(); ctx.moveTo(0, y + wobble); ctx.lineTo(w, y + wobble);
      ctx.strokeStyle = C.grid + '0.04)'; ctx.stroke();
    }

    // ── intersection nodes ──
    for (const n of intersections) {
      n.x = n.baseX + Math.sin(time * 0.8 + n.phase) * 3;
      n.y = n.baseY + Math.cos(time * 0.6 + n.phase) * 3;

      if (n.glow) {
        const pulse = Math.sin(time * 1.5 + n.phase) * 0.5 + 0.5;
        const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 8 + pulse * 4);
        grad.addColorStop(0, C.node + (0.12 + pulse * 0.08) + ')');
        grad.addColorStop(1, C.node + '0)');
        ctx.beginPath();
        ctx.arc(n.x, n.y, 8 + pulse * 4, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = C.node + '0.12)';
      ctx.fill();
    }


    // ── line pulses traveling along grid ──
    for (let i = 0; i < linePulses.length; i++) {
      const p = linePulses[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.x > w + 40 || p.y > h + 40) { linePulses[i] = makeLinePulse(); continue; }
      if (p.horizontal) {
        const grad = ctx.createLinearGradient(p.x - p.size, p.y, p.x, p.y);
        grad.addColorStop(0, C.pulse + '0)');
        grad.addColorStop(0.4, C.pulse + '0.25)');
        grad.addColorStop(1, C.pulse + '0.4)');
        ctx.beginPath(); ctx.moveTo(p.x - p.size, p.y); ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = grad; ctx.lineWidth = 1.5; ctx.stroke();
        // dot head
        ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = C.pulse + '0.5)'; ctx.fill();
      } else {
        const grad = ctx.createLinearGradient(p.x, p.y - p.size, p.x, p.y);
        grad.addColorStop(0, C.pulse + '0)');
        grad.addColorStop(0.4, C.pulse + '0.25)');
        grad.addColorStop(1, C.pulse + '0.4)');
        ctx.beginPath(); ctx.moveTo(p.x, p.y - p.size); ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = grad; ctx.lineWidth = 1.5; ctx.stroke();
        // dot head
        ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = C.pulse + '0.5)'; ctx.fill();
      }
    }

    // ── blueprint corner markers at some intersections ──
    for (const n of intersections) {
      if (!n.glow) continue;
      const s = 4;
      ctx.strokeStyle = C.node + '0.08)';
      ctx.lineWidth = 0.5;
      // top-left corner
      ctx.beginPath();
      ctx.moveTo(n.x - s, n.y - s + 2); ctx.lineTo(n.x - s, n.y - s); ctx.lineTo(n.x - s + 2, n.y - s);
      ctx.stroke();
      // bottom-right corner
      ctx.beginPath();
      ctx.moveTo(n.x + s, n.y + s - 2); ctx.lineTo(n.x + s, n.y + s); ctx.lineTo(n.x + s - 2, n.y + s);
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
