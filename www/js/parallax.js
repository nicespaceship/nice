/* NICE SPACESHIP — Parallax transforms driven by Scroll module
   Element opt-in via [data-parallax] attribute.
   data-parallax = speed multiplier (positive = scrolls slower, negative = scrolls faster).
   Optional data-parallax-axis = "y" (default) or "x".
   Optional data-parallax-rotate = degrees per 1000px of scroll. */
const Parallax = (() => {
  let items = [];
  let raf = null;
  let pending = false;
  let lastY = 0;

  function _collect() {
    const els = document.querySelectorAll('[data-parallax]');
    items = Array.from(els).map(el => {
      const rect = el.getBoundingClientRect();
      const docTop = rect.top + window.scrollY;
      return {
        el,
        speed: parseFloat(el.dataset.parallax) || 0.3,
        axis: el.dataset.parallaxAxis || 'y',
        rotate: parseFloat(el.dataset.parallaxRotate) || 0,
        docTop,
      };
    });
  }

  function _apply() {
    pending = false;
    const vh = window.innerHeight;
    for (const it of items) {
      // anchor parallax to element's position relative to viewport center —
      // gives a localised effect instead of a global drift.
      const elCenter = it.docTop - lastY + (it.el.offsetHeight / 2);
      const delta = (vh / 2 - elCenter) * it.speed;
      let t;
      if (it.axis === 'x') t = `translate3d(${delta}px, 0, 0)`;
      else t = `translate3d(0, ${delta}px, 0)`;
      if (it.rotate) t += ` rotate(${(lastY / 1000) * it.rotate}deg)`;
      it.el.style.transform = t;
    }
  }

  function _onScroll(y) {
    lastY = y;
    if (!pending) {
      pending = true;
      raf = requestAnimationFrame(_apply);
    }
  }

  function init() {
    _collect();
    if (window.Scroll && typeof window.Scroll.onScroll === 'function') {
      window.Scroll.onScroll(_onScroll);
    } else {
      window.addEventListener('scroll', () => _onScroll(window.scrollY), { passive: true });
      _onScroll(window.scrollY);
    }
    window.addEventListener('resize', () => { _collect(); _apply(); });
  }

  function refresh() { _collect(); _apply(); }

  return { init, refresh };
})();
