/* NICE SPACESHIP — Theme Lite (dark/light toggle, brutalist) */
const ThemeLite = (() => {
  const KEY = 'ns-community-theme';

  const DARK = {
    '--bg':'#0a0a0a','--bg2':'#111','--bg-alt':'#0a0a0a',
    '--surface':'transparent','--border':'#333','--border-hi':'#555',
    '--accent':'#00ff41','--accent2':'#00cc33',
    '--text':'#e0e0e0','--text-muted':'#888','--text-dim':'#444',
    '--nav-bg':'rgba(10,10,10,0.95)',
    '--color-success':'#00ff41','--color-error':'#ff3d00',
  };

  const LIGHT = {
    '--bg':'#fafafa','--bg2':'#f0f0f0','--bg-alt':'#ffffff',
    '--surface':'transparent','--border':'#ccc','--border-hi':'#999',
    '--accent':'#0a0a0a','--accent2':'#333',
    '--text':'#0a0a0a','--text-muted':'#666','--text-dim':'#aaa',
    '--nav-bg':'rgba(250,250,250,0.95)',
    '--color-success':'#0a0a0a','--color-error':'#cc0000',
  };

  function set(mode) {
    const colors = mode === 'light' ? LIGHT : DARK;
    const el = document.documentElement;
    Object.entries(colors).forEach(([k, v]) => el.style.setProperty(k, v));
    el.setAttribute('data-mode', mode);
    try { localStorage.setItem(KEY, mode); } catch {}
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = mode === 'light' ? '[ DARK ]' : '[ LIGHT ]';
  }

  function toggle() {
    const current = document.documentElement.getAttribute('data-mode') || 'dark';
    set(current === 'dark' ? 'light' : 'dark');
  }

  function init() {
    const saved = localStorage.getItem(KEY) || 'dark';
    set(saved);
  }

  return { init, set, toggle };
})();
