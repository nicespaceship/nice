/* ═══════════════════════════════════════════════════════════════════
   NICE — Cockpit (Home)
   Reactor centerpiece + top-level NICE conversation. Prompt panel
   docks globally. Schematic stays at #/bridge?tab=schematic for
   visual ship layout + per-agent editing.
═══════════════════════════════════════════════════════════════════ */

const HomeView = (() => {
  const title = 'NICE SPACESHIP';
  const _esc = Utils.esc;

  function _greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function _activeTheme() {
    if (typeof Theme === 'undefined') return null;
    const id = (typeof Theme.current === 'function') ? Theme.current() : null;
    return id && typeof Theme.getTheme === 'function' ? Theme.getTheme(id) : null;
  }

  function _userName() {
    const user = State.get('user');
    if (user?.user_metadata?.display_name) return user.user_metadata.display_name;
    if (user?.email) return user.email.split('@')[0];
    return _activeTheme()?.persona?.callsign || 'Commander';
  }

  let _themeChangeBound = false;
  let _lastEl = null;

  function render(el) {
    _lastEl = el;
    const hasMessages = _hasMessages();

    el.innerHTML = `
      <div class="chat-home" id="chat-home">
        ${hasMessages ? _renderConversation() : _renderEmptyGreeting()}
      </div>
    `;

    if (typeof CoreReactor !== 'undefined') CoreReactor.setVisible(true);
    el.classList.toggle('view-no-scroll', !hasMessages);

    el.querySelector('#chat-home-new')?.addEventListener('click', () => {
      try { localStorage.removeItem(Utils.KEYS.aiMessages); } catch {}
      render(el);
    });

    el.querySelectorAll('.chat-home-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.dataset.prompt || btn.textContent.trim();
        if (typeof PromptPanel !== 'undefined' && PromptPanel.prefill) PromptPanel.prefill(text);
      });
    });

    if (!_themeChangeBound) {
      _themeChangeBound = true;
      document.addEventListener('nice:theme-change', () => {
        if (_lastEl && !_hasMessages()) render(_lastEl);
      });
    }

    const feed = el.querySelector('#chat-home-feed');
    if (feed) feed.scrollTop = feed.scrollHeight;
  }

  function _renderEmptyGreeting() {
    const chips = _activeTheme()?.chips || [];
    const chipsHtml = chips.length
      ? `<div class="chat-home-chips">${chips.map(c => `<button class="chat-home-chip" data-prompt="${_esc(c)}">${_esc(c)}</button>`).join('')}</div>`
      : '';
    return `
      <div class="chat-home-empty">
        <div class="chat-home-greeting">${_greeting()}, ${_esc(_userName())}</div>
        ${chipsHtml}
      </div>
    `;
  }

  function _renderConversation() {
    let messages = [];
    // Gate on auth session — see Utils.hasAuthSession. Without this, an
    // anonymous visit on a shared browser would render the previous
    // account's chat history straight from localStorage (observed
    // 2026-05-05). PromptPanel has its own gate; this is HomeView's.
    if (Utils.hasAuthSession()) {
      try {
        const raw = localStorage.getItem(Utils.KEYS.aiMessages);
        messages = raw ? JSON.parse(raw) : [];
      } catch { messages = []; }
    }

    const _md = typeof PromptPanel !== 'undefined' && PromptPanel._md ? PromptPanel._md : (t) => `<p>${_esc(t)}</p>`;

    let html = messages.map(m => {
      if (m.role === 'user') {
        return `<div class="monitor-user-msg"><div class="monitor-user-bubble">${_esc(m.text)}</div></div>`;
      } else if (m.role === 'system') {
        return `<div class="monitor-system-msg">${_esc(m.text)}</div>`;
      } else {
        const agentLabel = `<div class="monitor-card-agent">${_esc(m.agent || 'NICE')}</div>`;
        let text = m.text || '';
        text = text.replace(/\[ACTION:\s*.+?\s*\|\s*.+?\s*\]/g, '').replace(/\[THEME:\s*.+?\s*\]/gi, '').replace(/\[EXEC:\s*\w+\s*(?:\|.*?)?\s*\]/g, '').trim();
        const time = m.ts ? new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        return `<div class="monitor-card">${agentLabel}<div class="monitor-card-text">${_md(text)}</div><div class="monitor-card-meta">${time}</div></div>`;
      }
    }).join('');

    return `
      <div class="chat-home-conv">
        <button class="chat-home-new-btn" id="chat-home-new" title="New conversation">
          <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-plus"/></svg>
          New Chat
        </button>
        <div class="chat-home-feed" id="chat-home-feed">${html}</div>
      </div>
    `;
  }

  function _hasMessages() {
    if (!Utils.hasAuthSession()) return false;
    try {
      const raw = localStorage.getItem(Utils.KEYS.aiMessages);
      const msgs = raw ? JSON.parse(raw) : [];
      return msgs.length > 0;
    } catch { return false; }
  }

  function destroy() {
    // No cleanup needed — PromptPanel is always floating
  }

  return { title, render, destroy };
})();
