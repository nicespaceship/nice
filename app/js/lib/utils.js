/* ═══════════════════════════════════════════════════════════════════
   NICE — Utils
   Shared utility functions: HTML escaping, time formatting.
═══════════════════════════════════════════════════════════════════ */

const Utils = (() => {
  function esc(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function timeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }

  /** Render an SVG icon from the sprite. Usage: Utils.icon('lock') or Utils.icon('lock', 'icon-lg') */
  function icon(name, cls) {
    return `<svg class="icon ${cls || 'icon-sm'}" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-${name}"/></svg>`;
  }

  return { esc, timeAgo, icon };
})();
