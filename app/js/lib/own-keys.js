/* ═══════════════════════════════════════════════════════════════════
   NICE — OwnKeys (SSOT)
   Models on the user's own API keys, in the desktop app. The keys stay in
   the desktop app's main process (desktop/llm-host.js, reached through
   window.NiceDesktop.llm); the page learns only which providers have a key
   and what their models are.

   Ids are 'byo:<provider>:<model>'. Code offers every own-key model in its
   model menu. Space and the prompt panel's model menu offer the ones the
   user switches on in API keys ("In Space, chat and agents"), kept in
   Utils.KEYS.ownModels on this computer only, like the keys.

   OwnKeys.openKeys() is the API keys dialog, shared by Code and AI Models.
   Changes (a key saved or removed, the models loaded, a model switched on
   or off) fire OwnKeys.EVENT on document.
═══════════════════════════════════════════════════════════════════ */

const OwnKeys = (() => {
  const PREFIX = 'byo:';
  const EVENT = 'nice:own-keys';
  const _esc = (s) => Utils.esc(s);
  const _attr = (s) => Utils.escAttr(s);

  let _groups = new Map();      // provider id → { label, models: [{ id, label }], error }
  let _load = null;             // the load in flight
  let _returnTo = null;         // what gets focus back when the dialog closes
  let _paintSeq = 0;

  const _llm = () => (typeof window !== 'undefined' && window.NiceDesktop && window.NiceDesktop.llm) || null;
  const available = () => !!_llm();
  const isOwnKey = (id) => typeof id === 'string' && id.startsWith(PREFIX);
  const idFor = (provider, model) => PREFIX + provider + ':' + model;

  /** { provider, model } for an own-key id, or null. */
  function parse(id) {
    if (!isOwnKey(id)) return null;
    const rest = id.slice(PREFIX.length);
    const at = rest.indexOf(':');
    if (at <= 0 || at === rest.length - 1) return null;
    return { provider: rest.slice(0, at), model: rest.slice(at + 1) };
  }

  function _emit(kind) {
    if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent(EVENT, { detail: { kind } }));
  }

  /** The provider groups as last loaded: Map of provider id → { label, models, error }. */
  const groups = () => _groups;

  /* The models of every provider the user has a key for. A provider whose
     list does not load keeps its group with no models and the error (its
     key may have been revoked; API keys shows it). A failed read of the
     providers is not cached: the next call tries again. */
  function load(force) {
    const llm = _llm();
    if (!llm) return Promise.resolve(_groups);
    if (_load && !force) return _load;
    const run = (async () => {
      let providers = [];
      try { providers = await llm.providers(); }
      catch { if (_load === run) _load = null; return _groups; }
      const next = new Map();
      await Promise.all(providers.filter(p => p.hasKey).map(async (p) => {
        try { next.set(p.id, { label: p.label, models: await llm.models(p.id), error: null }); }
        catch (e) { next.set(p.id, { label: p.label, models: [], error: (e && e.message) || 'Could not list models.' }); }
      }));
      if (_load !== run) return _groups;
      // In the provider order the desktop app lists them.
      _groups = new Map(providers.filter(p => next.has(p.id)).map(p => [p.id, next.get(p.id)]));
      _emit('models');
      // An open API keys dialog shows the model counts and switches.
      if (document.getElementById('own-keys-dialog')) _paint();
      return _groups;
    })();
    _load = run;
    return run;
  }

  /** Every own-key model: [{ id, label, provider, providerLabel }]. */
  function models() {
    return [..._groups].flatMap(([p, g]) => g.models.map(m => ({ id: idFor(p, m.id), label: m.label || m.id, provider: p, providerLabel: g.label })));
  }

  function _find(id) {
    const p = parse(id);
    const g = p && _groups.get(p.provider);
    const m = g && g.models.find(x => x.id === p.model);
    return { p, g, m };
  }

  /** "GPT-5" for byo:openai:gpt-5, from the loaded list, else the model id. */
  function label(id) {
    const { p, m } = _find(id);
    return (m && (m.label || m.id)) || (p ? p.model : String(id));
  }

  /** "OpenAI (your key)". */
  function providerLabel(id) {
    const { p, g } = _find(id);
    return p ? (g ? g.label : p.provider) + ' (your key)' : '';
  }

  /* ── Switched on for Space, chat and agents ── */

  function _readOn() {
    try {
      const saved = JSON.parse(localStorage.getItem(Utils.KEYS.ownModels) || '[]');
      return Array.isArray(saved) ? saved.filter(isOwnKey) : [];
    } catch { return []; }
  }

  const isOn = (id) => _readOn().includes(id);

  function setOn(id, on) {
    if (!isOwnKey(id)) return;
    const now = _readOn().filter(x => x !== id);
    if (on) now.push(id);
    try { localStorage.setItem(Utils.KEYS.ownModels, JSON.stringify(now)); } catch { /* storage blocked */ }
    _emit('switched');
  }

  /** The switched-on models that can run now: their provider has a key and lists them. In switch-on order. */
  function switchedOn() {
    if (!available()) return [];
    const listed = new Set(models().map(m => m.id));
    return _readOn().filter(id => listed.has(id));
  }

  /** A nice-ai-shaped request ({ model: 'byo:…', messages, … }) answered by the desktop app. Rejects with { code, message }. */
  function chat(body) {
    const llm = _llm();
    if (!llm) return Promise.reject({ code: 'ENODESKTOP', message: 'Models on your own key run in the NICE desktop app.' });
    return llm.chat(body);
  }

  /* ── API keys dialog ─────────────────────────────────────────── */

  // On <body>, like the app's other dialogs: inside a view's grid the
  // overlay would not cover the page.
  async function openKeys(returnTo) {
    const llm = _llm();
    if (!llm || document.getElementById('own-keys-dialog')) return;
    _returnTo = returnTo || null;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-overlay open own-keys-overlay" id="own-keys-dialog">
        <div class="modal-box own-keys-box" role="dialog" aria-modal="true" aria-labelledby="own-keys-title" tabindex="-1">
          <div class="modal-hdr">
            <h2 class="modal-title" id="own-keys-title">API keys</h2>
            <button type="button" class="modal-close" id="own-keys-close" aria-label="Close"><svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><use href="#icon-x"/></svg></button>
          </div>
          <div class="modal-body">
            <p class="own-keys-intro">Use your own key with a model provider instead of a NICE account. NICE keeps each key encrypted on this computer and sends it only to that provider; the provider bills you. Code can use all of a provider's models; pick the ones you want in Space, chat and agents.</p>
            <div class="own-keys-list" id="own-keys-list"></div>
          </div>
        </div>
      </div>`);
    const dlg = document.getElementById('own-keys-dialog');
    dlg.addEventListener('click', (e) => { if (e.target === dlg) closeKeys(); });
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeKeys(); return; }
      if (e.key !== 'Tab') return;
      // Focus stays in the dialog.
      // A closed model list hides its checkboxes; its summary still takes focus.
      const f = [...dlg.querySelectorAll('button, input, summary')].filter(x => !x.disabled && (x.tagName === 'SUMMARY' || !x.closest('details:not([open])')));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    dlg.querySelector('#own-keys-close').addEventListener('click', closeKeys);
    // It belongs to the page it opened on: a route change closes it.
    window.addEventListener('hashchange', closeKeys);
    const list = dlg.querySelector('#own-keys-list');
    list.addEventListener('submit', _onSubmit);
    list.addEventListener('click', _onRemove);
    list.addEventListener('change', _onSwitch);
    await _paint(true);
  }

  function closeKeys() {
    window.removeEventListener('hashchange', closeKeys);
    const dlg = document.getElementById('own-keys-dialog');
    if (!dlg) return;
    dlg.remove();
    if (_returnTo && _returnTo.isConnected) _returnTo.focus();
    _returnTo = null;
  }

  function _modelsHTML(pid, g) {
    if (!g || !g.models.length) return '';
    const on = new Set(_readOn());
    const count = g.models.filter(m => on.has(idFor(pid, m.id))).length;
    return `<details class="own-key-models"${count ? ' open' : ''}>
        <summary>In Space, chat and agents: ${count} of ${g.models.length} models</summary>
        <div class="own-key-model-list">${g.models.map(m => {
          const id = idFor(pid, m.id);
          return `<label class="own-key-model"><input type="checkbox" data-model="${_attr(id)}"${on.has(id) ? ' checked' : ''}> <span>${_esc(m.label || m.id)}</span></label>`;
        }).join('')}</div>
      </details>`;
  }

  async function _paint(focusFirst) {
    const list = document.getElementById('own-keys-list');
    const llm = _llm();
    if (!list || !llm) return;
    const seq = ++_paintSeq;
    let providers;
    try { providers = await llm.providers(); }
    catch (e) { list.innerHTML = `<p class="own-keys-err">${_esc((e && e.message) || 'Could not read the saved keys.')}</p>`; return; }
    if (seq !== _paintSeq || !list.isConnected) return;
    // Open model lists stay open through a repaint, and focus stays where it
    // was (the same switch, or the same row's control), so Escape and Tab
    // keep working when a load lands while the dialog is open.
    const open = new Set([...list.querySelectorAll('.own-key-row')].filter(r => r.querySelector('details[open]')).map(r => r.dataset.provider));
    const active = list.contains(document.activeElement) ? document.activeElement : null;
    const was = active && { model: active.dataset.model || null, row: (active.closest('.own-key-row') || {}).dataset?.provider || null, summary: active.tagName === 'SUMMARY' };
    list.innerHTML = providers.map(p => {
      const g = _groups.get(p.id);
      const status = p.hasKey
        ? (g && g.error ? `<span class="status-dot dot-r" aria-hidden="true"></span>${_esc(g.error)}` : `<span class="status-dot dot-g" aria-hidden="true"></span>Key saved${g ? ', ' + g.models.length + ' models' : ''}`)
        : 'No key';
      return `<form class="own-key-row" data-provider="${_attr(p.id)}">
          <div class="own-key-hd"><span class="own-key-name" id="own-key-${_attr(p.id)}">${_esc(p.label)}</span><span class="own-key-status">${status}</span></div>
          ${p.hasKey
            ? `<div class="own-key-line"><button type="button" class="btn btn-sm" data-remove="${_attr(p.id)}" aria-describedby="own-key-${_attr(p.id)}">Remove key</button></div>${_modelsHTML(p.id, g)}`
            : `<div class="own-key-line">
                <input type="password" name="key" autocomplete="off" spellcheck="false" placeholder="Paste your ${_attr(p.label)} key" aria-labelledby="own-key-${_attr(p.id)}">
                <button type="submit" class="btn btn-sm">Save</button>
              </div>`}
          <p class="own-keys-err" role="alert"></p>
        </form>`;
    }).join('');
    open.forEach(pid => { const r = _row(pid); const d = r && r.querySelector('details'); if (d) d.open = true; });
    if (focusFirst) { const first = list.querySelector('input, button'); if (first) first.focus(); }
    else if (was) {
      const r = was.row ? _row(was.row) : null;
      const back = (was.model && [...list.querySelectorAll('input[data-model]')].find(x => x.dataset.model === was.model))
        || (r && was.summary && r.querySelector('summary'))
        || (r && r.querySelector('input, button'));
      if (back) back.focus(); else _holdFocus();
    }
  }

  // While the list repaints, focus waits on the dialog itself, so Escape
  // and Tab still work there.
  function _holdFocus() {
    const box = document.querySelector('#own-keys-dialog .own-keys-box');
    if (box) box.focus();
  }

  // By dataset, not a selector: a provider id never goes into one.
  const _row = (pid) => [...document.querySelectorAll('.own-key-row')].find(r => r.dataset.provider === pid) || null;

  async function _onSubmit(e) {
    e.preventDefault();
    const form = e.target.closest('.own-key-row');
    const llm = _llm();
    if (!form || !llm) return;
    const input = form.querySelector('input[name="key"]');
    const btn = form.querySelector('button[type="submit"]');
    const err = form.querySelector('.own-keys-err');
    if (!input || !btn) return;
    const key = input.value.trim();
    if (!key) { err.textContent = 'Paste a key first.'; input.focus(); return; }
    input.disabled = true; btn.disabled = true; btn.textContent = 'Checking…'; err.textContent = '';
    _holdFocus();
    try {
      await llm.setKey(form.dataset.provider, key);
      input.value = '';
      _emit('keys');
      await load(true);
      await _paint();
      const row = _row(form.dataset.provider);
      const b = row && row.querySelector('button');
      if (b) b.focus();
    } catch (ex) {
      input.disabled = false; btn.disabled = false; btn.textContent = 'Save';
      err.textContent = (ex && ex.message) || 'The key could not be saved.';
      input.focus();
    }
  }

  async function _onRemove(e) {
    const b = e.target.closest('[data-remove]');
    const llm = _llm();
    if (!b || !llm) return;
    _holdFocus();
    b.disabled = true;
    try { await llm.clearKey(b.dataset.remove); } catch { /* the repaint shows what is saved */ }
    _emit('keys');
    await load(true);
    await _paint();
    const row = _row(b.dataset.remove);
    const input = row && row.querySelector('input');
    if (input) input.focus();
  }

  function _onSwitch(e) {
    const box = e.target.closest('input[data-model]');
    if (!box) return;
    setOn(box.dataset.model, box.checked);
    const details = box.closest('details');
    const summary = details && details.querySelector('summary');
    if (summary) {
      const all = details.querySelectorAll('input[data-model]');
      summary.textContent = 'In Space, chat and agents: ' + [...all].filter(x => x.checked).length + ' of ' + all.length + ' models';
    }
  }

  function _reset() {
    if (typeof window !== 'undefined') window.removeEventListener('hashchange', closeKeys);
    _groups = new Map();
    _load = null;
    _returnTo = null;
    _paintSeq = 0;
    const dlg = typeof document !== 'undefined' && document.getElementById('own-keys-dialog');
    if (dlg) dlg.remove();
  }

  return {
    EVENT, PREFIX, available, isOwnKey, idFor, parse, load, groups, models, label, providerLabel,
    isOn, setOn, switchedOn, chat, openKeys, closeKeys,
    _test: { reset: _reset },
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OwnKeys;
