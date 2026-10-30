/* ═══════════════════════════════════════════════════════════════════
   NICE — Home (#/)
   The landing. Leads with anything waiting on the user (results to review,
   failed runs, crew trouble), then their spaceships, then the two
   ways to start: chat with a model, or find a spaceship in the Library.
   Counts come from AlertCounts so Home, the sidebar badges and the Bridge
   tabs always agree.
═══════════════════════════════════════════════════════════════════ */

const HomeView = (() => {
  const title = 'Home';
  const _esc = Utils.esc;
  const _WATCH = ['spaceships', 'missions', 'agents', 'content-queue', 'user'];
  let _el = null;

  function _greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function _name() {
    const user = State.get('user');
    if (user?.user_metadata?.display_name) return user.user_metadata.display_name;
    if (user?.email) return user.email.split('@')[0];
    const theme = (typeof Theme !== 'undefined' && Theme.getTheme) ? Theme.getTheme(Theme.current()) : null;
    return theme?.persona?.callsign || 'Commander';
  }

  function _count(key) {
    return (typeof AlertCounts !== 'undefined') ? AlertCounts.count(key) : 0;
  }

  function _plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  // Each item states what is waiting and opens the place to act on it.
  function _needs() {
    const missionWord = Terminology.label('mission', { lowercase: true });
    const items = [];
    const waiting = _count('outbox');
    if (waiting) items.push({ text: `${_plural(waiting, 'result', 'results')} waiting for your review`, cta: 'Review', href: '#/outbox' });
    const failed = _count('missions');
    if (failed) items.push({ text: `${_plural(failed, missionWord + ' run', missionWord + ' runs')} failed`, cta: 'See why', href: '#/bridge?tab=missions' });
    const crew = _count('schematic');
    if (crew) items.push({ text: `${_plural(crew, 'crew problem', 'crew problems')} to check`, cta: 'Check crew', href: '#/crew' });
    return items;
  }

  function _ships() {
    return (typeof Blueprints !== 'undefined' && Blueprints.getUserShips) ? Blueprints.getUserShips() : [];
  }

  function _status(needs, ships) {
    if (needs.length) return 'Here is what needs you.';
    if (ships.length) return 'Nothing needs you right now.';
    return 'Start with a chat, or put a spaceship to work for your business.';
  }

  function render(el) {
    _el = el;
    const needs = _needs();
    const ships = _ships();
    const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

    const needsHTML = needs.length ? `
      <section class="home-needs" aria-label="Needs you">
        ${needs.map(n => `
          <a class="widget-card home-need" href="${n.href}">
            <span class="home-need-dot" aria-hidden="true"></span>
            <span class="home-need-text">${_esc(n.text)}</span>
            <span class="home-need-cta">${_esc(n.cta)}</span>
          </a>`).join('')}
      </section>` : '';

    const shipsHTML = ships.length ? `
      <div class="home-ships">
        ${ships.map(s => {
          const name = s.name || 'Spaceship';
          const cat = typeof s.category === 'string' ? s.category.trim() : '';
          const meta = cat && cat.toLowerCase() !== name.toLowerCase() ? cat : 'Spaceship';
          return `
          <a class="widget-card home-ship" href="#/crew?ship=${encodeURIComponent(s.id)}">
            <b class="home-ship-mark" aria-hidden="true">${_esc(Utils.initials(name))}</b>
            <span class="home-ship-text">
              <span class="home-ship-name">${_esc(name)}</span>
              <span class="home-ship-meta">${_esc(meta)}</span>
            </span>
            <span class="home-ship-cta">Open crew</span>
          </a>`;
        }).join('')}
      </div>` : `
      <div class="widget-card home-empty">
        <p>A spaceship is a crew of AI agents built for one kind of business. Pick one, and its crew gets to work on your ${_esc(Terminology.label('mission', { plural: true, lowercase: true }))}.</p>
        <a class="btn btn-primary btn-sm" href="#/library?tab=spaceship">Find a spaceship</a>
      </div>`;

    el.innerHTML = `
      <div class="home-wrap">
        <header class="home-head">
          <p class="home-eyebrow">${_esc(today)}</p>
          <h1 class="home-title">${_esc(_greeting())}, ${_esc(_name())}.</h1>
          <p class="home-sub">${_esc(_status(needs, ships))}</p>
        </header>
        ${needsHTML}
        <section class="home-section" aria-labelledby="home-ships-title">
          <div class="home-section-head">
            <h2 id="home-ships-title">Your spaceships</h2>
            ${ships.length ? '<a class="btn btn-sm" href="#/library?tab=spaceship">New spaceship</a>' : ''}
          </div>
          ${shipsHTML}
        </section>
        <section class="home-starts" aria-label="Start something">
          <a class="widget-card home-start" href="#/chat">
            <span class="home-start-ico" aria-hidden="true"><svg class="icon" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-chat"/></svg></span>
            <span class="home-start-text"><b>Ask anything</b><span>Chat with any model. No crew needed.</span></span>
          </a>
          <a class="widget-card home-start" href="#/library">
            <span class="home-start-ico" aria-hidden="true"><svg class="icon" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><use href="#icon-library"/></svg></span>
            <span class="home-start-text"><b>Browse the Library</b><span>Spaceships and agents for your kind of business.</span></span>
          </a>
        </section>
      </div>`;

    _bind();
  }

  // State.on fires immediately for keys that already hold data; _binding
  // swallows those calls so the first render isn't repeated per key.
  let _bound = false;
  let _binding = false;
  function _bind() {
    if (_bound) return;
    _bound = true;
    _binding = true;
    _WATCH.forEach(k => State.on(k, _rerender));
    _binding = false;
  }

  function _rerender() {
    if (_binding) return;
    if (_el && _el.isConnected && _el.querySelector('.home-wrap')) render(_el);
  }

  function destroy() {
    _WATCH.forEach(k => State.off(k, _rerender));
    _bound = false;
    _el = null;
  }

  return { title, render, destroy };
})();
