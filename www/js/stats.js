/* NICE SPACESHIP — Live Stats Counter
   Pulls blueprints + missions from Supabase, counts up on load */
const Stats = (() => {
  const CACHE_KEY = 'ns-community-stats';

  // Static counts (update when new models/MCPs are added)
  const LLMS = 17;   // 10 text + 4 image + 2 video + 1 voice
  const MCPS = 12;   // Gmail, Calendar, Drive, HubSpot, Salesforce, Monday, Slack, Buffer, Analytics, Shopify, QuickBooks, Google Workspace

  function _animate(el, target) {
    if (!el) return;
    const suffix = '';
    const duration = 1800;
    const startTime = performance.now();
    function step(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(target * eased);
      el.textContent = current.toLocaleString() + (progress >= 1 ? suffix : '');
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function _display(data) {
    _animate(document.getElementById('stat-blueprints'), data.blueprints);
    _animate(document.getElementById('stat-llms'), data.llms);
    _animate(document.getElementById('stat-mcps'), data.mcps);
    _animate(document.getElementById('stat-missions'), data.missions);
  }

  async function load() {
    // Defaults
    let blueprints = 800;
    let missions = 0;

    // Try live Supabase fetch
    if (typeof SBLite !== 'undefined') {
      try {
        const rows = await SBLite.query('blueprints', { select: 'id', limit: 1000 });
        if (rows.length > 0) blueprints = rows.length;
        const tasks = await SBLite.query('tasks', { select: 'id', filters: ['status=eq.completed'], limit: 1000 });
        if (tasks.length > 0) missions = tasks.length;
      } catch {}
    }

    const data = { blueprints, llms: LLMS, mcps: MCPS, missions };

    // Cache
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}

    // Animate on scroll into view (or immediately if already visible)
    const bar = document.querySelector('.stats-bar');
    if (!bar) { _display(data); return; }

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        _display(data);
        observer.disconnect();
      }
    }, { threshold: 0.3 });
    observer.observe(bar);
  }

  return { load };
})();
