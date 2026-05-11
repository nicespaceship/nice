/* NICE SPACESHIP — Reveal-on-scroll
   Element opt-in via [data-reveal] attribute.
   Adds .is-revealed when the element first enters the viewport.
   data-reveal-delay = ms (optional). data-reveal-stagger on a parent
   sets a per-child delay step (children must also have data-reveal). */
const Reveal = (() => {
  let observer = null;

  function _setStagger() {
    document.querySelectorAll('[data-reveal-stagger]').forEach(parent => {
      const step = parseInt(parent.dataset.revealStagger, 10) || 80;
      const children = parent.querySelectorAll('[data-reveal]');
      children.forEach((c, i) => {
        if (!c.dataset.revealDelay) c.dataset.revealDelay = String(i * step);
      });
    });
  }

  function _onIntersect(entries) {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target;
      const delay = parseInt(el.dataset.revealDelay, 10) || 0;
      if (delay) {
        setTimeout(() => el.classList.add('is-revealed'), delay);
      } else {
        el.classList.add('is-revealed');
      }
      observer.unobserve(el);
    }
  }

  function init() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('[data-reveal]').forEach(el => el.classList.add('is-revealed'));
      return;
    }

    _setStagger();

    observer = new IntersectionObserver(_onIntersect, {
      root: null,
      rootMargin: '0px 0px -10% 0px',
      threshold: 0.05,
    });

    document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));
  }

  function refresh() {
    if (!observer) return;
    document.querySelectorAll('[data-reveal]:not(.is-revealed)').forEach(el => observer.observe(el));
  }

  return { init, refresh };
})();
