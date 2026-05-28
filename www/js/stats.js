/* NICE SPACESHIP — Live Stats Counter
   Pulls blueprints + missions from Supabase, counts up on load */
const Stats = (() => {
  const CACHE_KEY = 'ns-community-stats';

  // Static counts (update when new models/MCPs are added)
  // SSOT for MCPS: app/js/views/integrations.js INTEGRATIONS_CATALOG (count entries without comingSoon:true)
  const LLMS = 10;   // MODEL_CATALOG: Gemini ×2, GPT-5 ×4 (mini, Pro, Codex, o3), Claude ×2, Llama, Grok
  const MCPS = 19;   // Wired umbrellas: Google, Microsoft, HubSpot, GitHub, Slack, Linear, Notion, Stripe, Atlassian, Cloudflare ×4, Sentry, Zapier, Airtable, Klaviyo, Miro, Replicate

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
    // Defaults — match the catalog floor so the bar never shows 0
    // even when Supabase blocks the anon read or the fetch fails.
    let blueprints = 500;
    let missions = 0;

    // Try live Supabase fetch.
    // Legacy `blueprints` table dropped 2026-05-24 — sum the two new tables.
    if (typeof SBLite !== 'undefined') {
      try {
        const [agents, ships, runs] = await Promise.all([
          SBLite.query('agent_blueprints',     { select: 'id', limit: 2000 }),
          SBLite.query('spaceship_blueprints', { select: 'id', limit: 2000 }),
          SBLite.query('mission_runs', { select: 'id', filters: ['status=eq.completed'], limit: 2000 }),
        ]);
        const total = (agents?.length || 0) + (ships?.length || 0);
        if (total > 0) blueprints = total;
        if (runs?.length > 0) missions = runs.length;
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
