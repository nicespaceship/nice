/* nicespaceship.com — Home scroll-stage controller.
   Manages the fixed NICE constellation icon, reveal-on-scroll for stops,
   the side timeline's active state, AND drives per-section stage
   choreography by writing `data-stage` onto .home-mark-wrap. The intro
   `data-anim="constellation"` is set inline in HTML so the reveal fires
   on first paint. */
const HomeStage = (() => {
  let wrap = null;
  let items = [];
  let sections = [];
  let ticking = false;
  let currentStage = null;

  // Order matters — sets a known list for body class swapping.
  // `site` is the conclusion stop after Launch; the persistent card
  // fades out, the original site header reappears, and the page
  // reads like the real nicespaceship.com home.
  const STAGES = ['intro', 'mission', 'platform', 'how', 'inside', 'launch', 'site'];

  function _setStage(name) {
    if (name === currentStage) return;
    currentStage = name;
    wrap.setAttribute('data-stage', name);
    // Also stamp body so non-mark-wrap elements (cascade, output-icons)
    // can toggle visibility per stage.
    for (const s of STAGES) document.body.classList.remove('stage-' + s);
    document.body.classList.add('stage-' + name);
  }

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

      // Drive stage choreography from the active section ID.
      if (activeId && STAGES.includes(activeId)) _setStage(activeId);

      ticking = false;
    });
  }

  function init() {
    wrap = document.querySelector('.home-mark-wrap');
    items = Array.from(document.querySelectorAll('.home-timeline-item'));
    sections = Array.from(document.querySelectorAll('.home-stop'));
    if (!wrap || !items.length || !sections.length) return;

    // Make sure the intro constellation reveal plays on first paint.
    // (Also set inline in HTML, but keep this defensive.)
    if (!wrap.getAttribute('data-anim')) {
      wrap.setAttribute('data-anim', 'constellation');
    }
    _setStage('intro');

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
