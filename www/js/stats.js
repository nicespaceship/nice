/* NICE SPACESHIP — Live Stats Counter */
const Stats = (() => {
  const CACHE_KEY = 'ns-site-stats';
  const CACHE_TTL = 60000; // 1 minute

  function _animate(el, target) {
    const start = parseInt(el.textContent.replace(/,/g, ''), 10) || 0;
    const duration = 1200;
    const startTime = performance.now();
    function step(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const current = Math.round(start + (target - start) * eased);
      el.textContent = current.toLocaleString();
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  async function load() {
    // Show cached values instantly
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      if (cached.blueprints) _display(cached);
    } catch {}

    // Fetch fresh data
    if (typeof SBLite === 'undefined') return;
    const [blueprints, missions] = await Promise.all([
      SBLite.count('blueprints', 'type=neq.special'),
      SBLite.count('tasks', 'status=eq.completed'),
    ]);

    const data = { blueprints, missions, models: 10, providers: 6, ts: Date.now() };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
    _display(data);
  }

  function _display(data) {
    const els = {
      'stat-blueprints': data.blueprints || 800,
      'stat-missions': data.missions || 0,
      'stat-models': data.models || 10,
      'stat-providers': data.providers || 6,
    };
    Object.entries(els).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) _animate(el, val);
    });
  }

  return { load };
})();
