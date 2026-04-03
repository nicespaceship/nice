/* NICE SPACESHIP — Theme Lite (dark/light toggle) */
const ThemeLite = (() => {
  const KEY = 'ns-community-theme';

  const DARK = {
    '--bg':'#09090b','--bg2':'#18181b','--bg-alt':'#18181b','--surface':'#18181b',
    '--surface2':'#27272a','--border':'#3f3f46','--border-hi':'#71717a',
    '--accent':'#e0e7ff','--accent2':'#a5b4fc','--text':'#fafafa',
    '--text-muted':'#a1a1aa','--text-dim':'#3f3f46',
    '--glow':'0 0 0 1px rgba(224,231,255,0.06)',
    '--panel-bg':'rgba(24,24,27,0.75)','--panel-border':'#3f3f46',
    '--nav-bg':'rgba(9,9,11,0.92)',
  };

  const LIGHT = {
    '--bg':'#f5f5f5','--bg2':'#ebebeb','--bg-alt':'#ffffff','--surface':'#ffffff',
    '--surface2':'#fafafa','--border':'#e0e0e0','--border-hi':'#0078d4',
    '--accent':'#0078d4','--accent2':'#107c10','--text':'#1a1a1a',
    '--text-muted':'#6b6b6b','--text-dim':'#999999',
    '--glow':'none',
    '--panel-bg':'#ffffff','--panel-border':'#e0e0e0',
    '--nav-bg':'rgba(255,255,255,0.95)',
  };

  function set(mode) {
    const colors = mode === 'light' ? LIGHT : DARK;
    const el = document.documentElement;
    Object.entries(colors).forEach(([k, v]) => el.style.setProperty(k, v));
    el.setAttribute('data-mode', mode);
    try { localStorage.setItem(KEY, mode); } catch {}
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = mode === 'light' ? 'Dark' : 'Light';
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
