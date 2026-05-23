/* ═══════════════════════════════════════════════════════════════════
   NICE — CSelect (custom dropdown component)

   Replacement for native <select> that we can actually style. Native
   <select> popups on macOS/iOS draw at the OS font size and ignore CSS
   — the reason the recurring "dropdown got huge again" reports kept
   landing. See feedback_native_select_macos.md.

   API:
     CSelect.html(id, ariaLabel, options, value)   — emit the markup
     CSelect.mount(id, onChange)                   — bind events
     CSelect.set(id, value)                        — programmatic update

   Originally lived as private helpers inside BlueprintsView; extracted
   2026-05-23 so Operations / Outbox / Missions / etc. can use it too.
═══════════════════════════════════════════════════════════════════ */

const CSelect = (() => {
  const _esc = (s) => (typeof Utils !== 'undefined' && Utils.esc) ? Utils.esc(s) : String(s == null ? '' : s);

  function html(id, ariaLabel, options, value) {
    const current = options.find(o => o.value === value) || options[0];
    const opts = options.map(o =>
      `<button type="button" class="bp-cselect-option" role="option" data-value="${_esc(o.value)}" aria-selected="${o.value === value}">${_esc(o.label)}</button>`
    ).join('');
    return `<div id="${id}" class="bp-cselect" data-value="${_esc(value)}">
      <button type="button" class="bp-cselect-trigger" aria-haspopup="listbox" aria-expanded="false" aria-label="${_esc(ariaLabel)}">
        <span class="bp-cselect-label">${_esc(current.label)}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4.5l3 3 3-3"/></svg>
      </button>
      <div class="bp-cselect-menu" role="listbox" aria-label="${_esc(ariaLabel)}" hidden>${opts}</div>
    </div>`;
  }

  function set(id, value) {
    const root = document.getElementById(id);
    if (!root) return;
    root.dataset.value = value;
    const opt = root.querySelector(`.bp-cselect-option[data-value="${CSS.escape(value)}"]`);
    root.querySelectorAll('.bp-cselect-option').forEach(o => o.setAttribute('aria-selected', String(o === opt)));
    const label = root.querySelector('.bp-cselect-label');
    if (label && opt) label.textContent = opt.textContent;
  }

  function mount(id, onChange) {
    const root = document.getElementById(id);
    if (!root || root._cselectBound) return;
    root._cselectBound = true;
    const trigger = root.querySelector('.bp-cselect-trigger');
    const menu = root.querySelector('.bp-cselect-menu');
    const labelEl = root.querySelector('.bp-cselect-label');
    const opts = () => [...menu.querySelectorAll('.bp-cselect-option')];

    const reposition = () => {
      const r = trigger.getBoundingClientRect();
      const vw = window.innerWidth;
      const menuW = Math.max(r.width, menu.offsetWidth || r.width);
      menu.style.top = (r.bottom + 4) + 'px';
      menu.style.minWidth = r.width + 'px';
      if (r.left + menuW > vw - 8) { menu.style.left = 'auto'; menu.style.right = Math.max(8, vw - r.right) + 'px'; }
      else { menu.style.right = 'auto'; menu.style.left = r.left + 'px'; }
    };
    const hide = () => { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
    const show = () => {
      reposition();
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      (opts().find(o => o.getAttribute('aria-selected') === 'true') || opts()[0])?.focus();
    };

    trigger.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden ? show() : hide(); });
    trigger.addEventListener('keydown', (e) => { if (['ArrowDown', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show(); } });

    // Document/window listeners self-remove once the root leaves the DOM
    // (the view re-renders via innerHTML), so re-renders never stack leaks.
    const onDocClick = (e) => { if (!root.isConnected) return document.removeEventListener('click', onDocClick); if (!menu.hidden && !root.contains(e.target)) hide(); };
    const onKey = (e) => {
      if (!root.isConnected) return document.removeEventListener('keydown', onKey);
      if (menu.hidden) return;
      if (e.key === 'Escape') { hide(); trigger.focus(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const list = opts(); const i = list.indexOf(document.activeElement);
        list[e.key === 'ArrowDown' ? Math.min(list.length - 1, i + 1) : Math.max(0, i - 1)]?.focus();
      }
    };
    const onReflow = () => {
      if (!root.isConnected) { window.removeEventListener('scroll', onReflow, true); window.removeEventListener('resize', onReflow); return; }
      if (!menu.hidden) reposition();
    };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onReflow, true);
    window.addEventListener('resize', onReflow);

    opts().forEach(opt => {
      opt.addEventListener('click', () => {
        const v = opt.dataset.value;
        if (root.dataset.value !== v) {
          root.dataset.value = v;
          labelEl.textContent = opt.textContent;
          opts().forEach(o => o.setAttribute('aria-selected', String(o === opt)));
          onChange(v);
        }
        hide();
        trigger.focus();
      });
    });
  }

  return { html, mount, set };
})();
