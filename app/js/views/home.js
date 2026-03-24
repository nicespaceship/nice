/* ═══════════════════════════════════════════════════════════════════
   NICE — Home View (Chat Interface)
   Claude-style conversational home page. The chat IS the home page.
   Greeting + centered input + quick action pills → conversation feed.
═══════════════════════════════════════════════════════════════════ */

const HomeView = (() => {
  const title = 'NICE SPACESHIP';
  const _esc = typeof Utils !== 'undefined' ? Utils.esc : (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* ── Quick action pills ── */
  const PILLS = [
    { label: 'Research',  icon: 'search',    prefill: 'Research ' },
    { label: 'Mission',   icon: 'zap',       prefill: 'Run a mission to ' },
    { label: 'Code',      icon: 'code',      prefill: 'Write code that ' },
    { label: 'Analyze',   icon: 'analytics',  prefill: 'Analyze ' },
    { label: 'Agent',     icon: 'agent',     prefill: '@' },
    { label: 'Build',     icon: 'build',     prefill: 'Create a workflow to ' },
  ];

  /* ── Time-of-day greeting ── */
  function _greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function _userName() {
    const user = State.get('user');
    if (user?.user_metadata?.display_name) return user.user_metadata.display_name;
    if (user?.email) return user.email.split('@')[0];
    return 'Commander';
  }

  /* ── Render ── */
  function render(el) {
    // Tell PromptPanel to go inline (hide floating bar)
    if (typeof PromptPanel !== 'undefined') {
      PromptPanel.hide();
    }

    // Check if there are existing messages
    const hasMessages = _hasMessages();

    el.innerHTML = `
      <div class="chat-home" id="chat-home">
        ${hasMessages ? _renderConversation() : _renderEmptyGreeting()}
        <div class="chat-home-input-wrap" id="chat-home-input-wrap"></div>
        ${hasMessages ? '' : _renderPills()}
      </div>
    `;

    // Move PromptPanel input into our container
    _embedPromptInput(el);

    // Bind pill clicks
    el.querySelectorAll('.chat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = el.querySelector('#nice-ai-input') || document.querySelector('#nice-ai-input');
        if (input) {
          input.value = btn.dataset.prefill;
          input.focus();
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    });

    // Hide pills when typing, show when empty
    const pillsEl = el.querySelector('.chat-home-pills');
    const inputEl = el.querySelector('#nice-ai-input') || document.querySelector('#nice-ai-input');
    if (pillsEl && inputEl) {
      inputEl.addEventListener('input', () => {
        pillsEl.style.display = inputEl.value.trim() ? 'none' : '';
      });
    }

    // Bind new chat button
    el.querySelector('#chat-home-new')?.addEventListener('click', () => {
      try { localStorage.removeItem('nice-ai-messages'); } catch {}
      render(el);
    });

    // Scroll conversation to bottom
    const feed = el.querySelector('#chat-home-feed');
    if (feed) feed.scrollTop = feed.scrollHeight;
  }

  function _renderEmptyGreeting() {
    const greeting = _greeting();
    const name = _userName();
    return `
      <div class="chat-home-empty">
        <div class="chat-home-greeting">${greeting}, ${_esc(name)}</div>
      </div>
    `;
  }

  function _renderPills() {
    return `
      <div class="chat-home-pills">
        ${PILLS.map(p => `
          <button class="chat-pill" data-prefill="${_esc(p.prefill)}">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-${p.icon}"/></svg>
            ${p.label}
          </button>
        `).join('')}
      </div>
    `;
  }

  function _renderConversation() {
    let messages = [];
    try {
      const raw = localStorage.getItem('nice-ai-messages');
      messages = raw ? JSON.parse(raw) : [];
    } catch { messages = []; }

    const _md = typeof PromptPanel !== 'undefined' && PromptPanel._md ? PromptPanel._md : (t) => `<p>${_esc(t)}</p>`;

    let html = messages.map(m => {
      if (m.role === 'user') {
        return `<div class="monitor-user-msg"><div class="monitor-user-bubble">${_esc(m.text)}</div></div>`;
      } else if (m.role === 'system') {
        return `<div class="monitor-system-msg">${_esc(m.text)}</div>`;
      } else {
        const agentLabel = `<div class="monitor-card-agent">${_esc(m.agent || 'NICE')}</div>`;
        // Strip action tags for clean display
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
    try {
      const raw = localStorage.getItem('nice-ai-messages');
      const msgs = raw ? JSON.parse(raw) : [];
      return msgs.length > 0;
    } catch { return false; }
  }

  function _embedPromptInput(el) {
    const wrap = el.querySelector('#chat-home-input-wrap');
    if (!wrap) return;

    // Get the existing PromptPanel element and move it inline
    const panel = document.getElementById('nice-ai');
    if (panel) {
      // Clone the input area into our container (don't move — PromptPanel keeps reference)
      panel.style.display = '';
      panel.classList.add('nice-ai--inline');
      wrap.appendChild(panel);
    }
  }

  function destroy() {
    // Restore PromptPanel to its floating position
    const panel = document.getElementById('nice-ai');
    if (panel) {
      panel.classList.remove('nice-ai--inline');
      document.body.appendChild(panel);
      // Re-sync: show floating bar if on another route
      if (typeof PromptPanel !== 'undefined') {
        PromptPanel.show();
        PromptPanel.syncRoute();
      }
    }
  }

  return { title, render, destroy };
})();
