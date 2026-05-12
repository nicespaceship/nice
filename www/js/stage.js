/* nicespaceship.com — Home scroll-stage controller.
   Manages the fixed NICE constellation icon, reveal-on-scroll for stops,
   and the side timeline's active state. Same pattern as benduffey.com. */
const HomeStage = (() => {
  let wrap = null;
  let items = [];
  let sections = [];
  let ticking = false;

  function _onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      const vh = window.innerHeight;

      // Past the intro: shrink + lift the icon.
      const compact = y > vh * 0.45;
      wrap.classList.toggle('is-compact', compact);

      // Active timeline section — last stop whose top has passed the probe line.
      let activeId = sections[0]?.id;
      const probe = vh * 0.45;
      for (const s of sections) {
        if (s.getBoundingClientRect().top <= probe) activeId = s.id;
      }
      for (const it of items) {
        it.classList.toggle('is-active', it.dataset.section === activeId);
      }

      ticking = false;
    });
  }

  function init() {
    wrap = document.querySelector('.home-mark-wrap');
    items = Array.from(document.querySelectorAll('.home-timeline-item'));
    sections = Array.from(document.querySelectorAll('.home-stop'));
    if (!wrap || !items.length || !sections.length) return;

    // Reveal stops as they intersect.
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) e.target.classList.add('is-visible');
      }
    }, { threshold: 0.15 });
    sections.forEach((s) => io.observe(s));

    // Smooth-scroll on timeline click.
    items.forEach((it) => {
      it.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.getElementById(it.dataset.section);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    window.addEventListener('scroll', _onScroll, { passive: true });
    _onScroll();
  }

  return { init };
})();
