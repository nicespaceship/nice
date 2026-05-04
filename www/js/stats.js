/* NICE SPACESHIP — Live Stats Counter
   Pulls blueprints + missions from Supabase, counts up on load */
const Stats = (() => {
  const CACHE_KEY = 'ns-community-stats';

  // Static counts (update when new models/MCPs are added)
  const LLMS = 10;   // MODEL_CATALOG: Gemini ×2, GPT-5 ×4 (mini, Pro, Codex, o3), Claude ×2, Llama, Grok
  const MCPS = 2;    // Live edge functions: Google Workspace (gmail/calendar/drive), Microsoft 365

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
        const rows = await SBLite.query('blueprints', { select: 'id', limit: 2000 });
        if (rows.length > 0) blueprints = rows.length;
        const runs = await SBLite.query('mission_runs', { select: 'id', filters: ['status=eq.completed'], limit: 2000 });
        if (runs.length > 0) missions = runs.length;
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
