/* NICE SPACESHIP — Theme toggle. Light is default; user choice persists.
   Uses event delegation so it doesn't matter whether the toggle button
   has mounted yet — Nav.render() can run after init() with no race. */
const ThemeLite = (() => {
  const KEY = 'nicespaceship-theme';

  function _readSaved() {
    try { return localStorage.getItem(KEY); } catch { return null; }
  }

  function _save(theme) {
    try { localStorage.setItem(KEY, theme); } catch {}
  }

  function _syncIcon(theme) {
    const icon = document.querySelector('#theme-toggle i');
    if (icon) icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  }

  function _apply(theme) {
    document.body.setAttribute('data-theme', theme);
    _syncIcon(theme);
  }

  function init() {
    const saved = _readSaved();
    _apply(saved === 'dark' ? 'dark' : 'light');
    document.addEventListener('click', (e) => {
      if (e.target.closest('#theme-toggle')) toggle();
    });
  }

  function toggle() {
    const next = (document.body.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
    _apply(next);
    _save(next);
  }

  function current() {
    return document.body.getAttribute('data-theme') || 'light';
  }

  function set(theme) { _apply(theme); _save(theme); }

  return { init, set, toggle, current };
})();
