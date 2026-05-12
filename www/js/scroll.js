/* NICE SPACESHIP — Smooth scroll + scroll-position broadcast
   Wraps Lenis when available (loaded from CDN). Falls back to native scroll.
   Disabled when prefers-reduced-motion or pointer:coarse (mobile). */
const Scroll = (() => {
  let lenis = null;
  let raf = null;
  let listeners = [];
  let lastY = 0;

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

  function _emit(y) {
    lastY = y;
    document.documentElement.style.setProperty('--scroll-y', y + 'px');
    for (const fn of listeners) fn(y);
  }

  let pending = false;
  function _nativeOnScroll() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      _emit(window.scrollY);
    });
  }

  function init() {
    const useLenis = !reducedMotion() && !isTouch() && typeof window.Lenis === 'function';

    if (useLenis) {
      lenis = new window.Lenis({
        duration: 1.15,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        wheelMultiplier: 1,
        touchMultiplier: 1.5,
      });
      lenis.on('scroll', ({ scroll }) => _emit(scroll));
      function tick(time) {
        lenis.raf(time);
        raf = requestAnimationFrame(tick);
      }
      raf = requestAnimationFrame(tick);
    } else {
      window.addEventListener('scroll', _nativeOnScroll, { passive: true });
      _emit(window.scrollY);
    }
  }

  function onScroll(fn) {
    listeners.push(fn);
    fn(lastY);
    return () => { listeners = listeners.filter(l => l !== fn); };
  }

  function scrollY() { return lastY; }

  function destroy() {
    if (raf) cancelAnimationFrame(raf);
    if (lenis) lenis.destroy();
    window.removeEventListener('scroll', _nativeOnScroll);
    lenis = null;
    listeners = [];
  }

  return { init, onScroll, scrollY, destroy };
})();
