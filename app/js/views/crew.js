/* ═══════════════════════════════════════════════════════════════════
   NICE — Crew (#/crew, #/crew?ship=<id>)
   One project's (spaceship's) crew as a table of cards. Each card is that
   agent's own chat window: who the agent is, the model it runs on (the
   frame takes that provider's color), the tools it works through, what it
   is doing right now, its conversation, and a box to message it. Cards
   answer on their own and at the same time. Beside the cards: the ship's
   recent runs, and a bar for any run waiting on the user's review.

   Reuses existing machinery rather than adding paths:
     crew     — Blueprints.getShipCrew (same resolution as the Schematic)
     status   — AgentActivity (emitted by AgentExecutor)
     messages — ShipLog entries for the ship, filtered per agent, then the
                exchanges sent from the card since this view opened
     sending  — AgentExecutor.converse per card (the agent-with-tools chat
                tier: ship_log is the only record, no mission_runs row)
     review   — MissionRunner.approveRun / rejectRun
   The Schematic stays reachable as the Diagram (#/bridge?tab=schematic).
═══════════════════════════════════════════════════════════════════ */

const CrewView = (() => {
  // The crew noun follows the theme: "team" in the default look.
  const _crewWord = (cap) => Terminology.label('crew', { lowercase: !cap });

  const _esc = Utils.esc;
  const _WATCH = ['spaceships', 'agents', 'user'];
  const _ASK_EVENTS = ['mission_start', 'turn_start'];
  const _REPLY_EVENTS = ['final_answer', 'turn_error', 'turn_stopped', 'max_steps_reached'];
  const _HISTORY = 20;          // exchanges kept per card
  const _LOG_LIMIT = 200;       // ship_log rows read per refresh
  const _RUN_LABELS = {
    queued: 'Queued', running: 'Running', review: 'Waiting for you',
    completed: 'Done', failed: 'Failed', cancelled: 'Cancelled',
  };

  let _el = null;
  let _shipId = null;
  let _crew = [];
  let _runs = [];
  let _runsState = 'idle'; // idle | loading | ready | signed-out
  let _channel = null;
  let _unsubActivity = null;
  let _bound = false;
  let _binding = false;

  // Each card's conversation. _logs holds what ShipLog has for the agent;
  // _session what was sent from the card since this view opened: its
  // exchanges, the AgentExecutor conversation that keeps the context, and
  // the turn in flight. Once the log holds a sent exchange (same request,
  // newer than the newest row the log had at the first send), the session's
  // copy takes its place, so nothing shows twice and nothing done elsewhere
  // in the meantime is hidden. Only server timestamps are compared. _gen
  // fences work that lands after the view is gone or the ship changed.
  const _logs = new Map();       // agentId → exchanges
  const _session = new Map();    // agentId → { cutoff, exchanges, convo, live }
  const _expanded = new Set();   // agentIds showing the whole conversation
  let _logNewest = -Infinity;    // newest created_at in the last log read
  let _gen = 0;
  let _approvalSeq = 0;
  let _logRead = null;           // the read in flight, shared by a burst of refreshes
  let _logAgain = false;

  /* ── Data ── */

  function _shipFromHash() {
    const qs = (location.hash || '').split('?')[1] || '';
    return new URLSearchParams(qs).get('ship');
  }

  function _modelId(agent) {
    try {
      const cfg = (typeof LLMConfig !== 'undefined' && LLMConfig.forBlueprint) ? LLMConfig.forBlueprint(agent) : null;
      if (cfg && cfg.model) return cfg.model;
    } catch { /* fall through to the free default */ }
    return 'gemini-2-5-flash';
  }

  function _modelName(id) {
    const m = (typeof ModelCatalog !== 'undefined') ? ModelCatalog.getById(id) : null;
    return m ? m.name : BlueprintUtils.humanizeModelShort(id);
  }

  function _modelColor(id) {
    return (typeof ModelCatalog !== 'undefined' && ModelCatalog.providerColor) ? ModelCatalog.providerColor(id) : 'var(--border)';
  }

  function _statusOf(agent) {
    if (agent.status === 'error' || agent.status === 'offline') return { s: 'error', text: 'Needs attention' };
    // A turn sent from the card: its own state, ahead of AgentActivity.
    const live = (_session.get(agent.id) || {}).live;
    if (live) return { s: 'active', text: live.approval ? 'Waiting for you' : live.stop ? 'Stopping…' : 'Working…' };
    const st = (typeof AgentActivity !== 'undefined') ? AgentActivity.getState(agent.id) : 'idle';
    if (st === 'active') return { s: 'active', text: 'Working…' };
    if (st === 'recent') return { s: 'recent', text: 'Just finished' };
    return { s: 'idle', text: 'Ready' };
  }

  // Requests to the agent and its answers in this ship, oldest first, as
  // exchanges { ask, reply }. Tool rows are left out.
  function _exchanges(entries, agentId) {
    const out = [];
    for (const e of entries || []) {
      const md = e.metadata || {};
      if (e.agent_id !== agentId && md.agent_blueprint_id !== agentId) continue;
      const ts = Date.parse(e.created_at) || 0;
      if (e.role === 'user' && _ASK_EVENTS.includes(md.event)) {
        out.push({ ask: { text: String(e.content || ''), ts }, reply: null });
      } else if (e.role === 'agent' && _REPLY_EVENTS.includes(md.event)) {
        const reply = { text: String(e.content || ''), ts, error: md.event === 'turn_error', stopped: md.event === 'turn_stopped' };
        const last = out[out.length - 1];
        if (last && !last.reply) last.reply = reply;
        else out.push({ ask: null, reply });
      }
    }
    return out.slice(-_HISTORY);
  }

  // The ship's log as exchanges per agent, or null when the read failed.
  async function _readLogs(shipId) {
    if (!shipId || typeof ShipLog === 'undefined' || !ShipLog.getEntries) return null;
    let entries;
    try { entries = await ShipLog.getEntries(shipId, _LOG_LIMIT); } catch { return null; }
    let newest = -Infinity;
    for (const e of entries || []) {
      const t = Date.parse(e.created_at);
      if (t > newest) newest = t;
    }
    return { entries: entries || [], newest };
  }

  function _thread(agentId) {
    const s = _session.get(agentId);
    const log = _logs.get(agentId) || [];
    if (!s) return log;
    // Newest first on both sides, so a repeated request ("hi") pairs with
    // its latest log row, never an older one.
    const pending = s.exchanges.slice();
    const out = log.slice();
    for (let j = out.length - 1; j >= 0 && pending.length; j--) {
      const x = out[j];
      if (!x.ask || !(x.ask.ts > s.cutoff)) continue;
      let i = -1;
      for (let k = pending.length - 1; k >= 0; k--) if (pending[k].ask && pending[k].ask.text === x.ask.text) { i = k; break; }
      if (i >= 0) out[j] = pending.splice(i, 1)[0];
    }
    return out.concat(pending).slice(-_HISTORY);
  }

  async function _loadRuns() {
    const user = State.get('user');
    if (!user || !user.id) { _runs = []; _runsState = 'signed-out'; _renderRunlog(); _renderReview(); return; }
    _runsState = 'loading';
    _renderRunlog();
    try {
      _runs = await SB.db('mission_runs').list({ userId: user.id, spaceship_id: _shipId, orderBy: 'created_at', limit: 8 });
    } catch { _runs = []; }
    _runsState = 'ready';
    _renderRunlog();
    _renderReview();
  }

  /* ── Render ── */

  function _cardHTML(member) {
    const { index, slot, agent } = member;
    const role = BlueprintUtils.crewRoleLabel(slot);
    if (!agent) {
      return `
        <div class="crew-card crew-card-open">
          <span class="crew-open-mark" aria-hidden="true">+</span>
          <b>${Terminology.pick('Open role', 'Open station')}</b>
          ${role ? `<span>${_esc(role)}</span>` : ''}
        </div>`;
    }
    const name = BlueprintUtils.crewIdentity(slot, agent) || agent.name || 'Agent';
    const modelId = _modelId(agent);
    const tools = BlueprintUtils.capabilityLabel(agent);
    const status = _statusOf(agent);
    const first = String(name).split(/\s+/)[0];
    return `
      <article class="crew-card${_isOpen(agent.id) ? ' is-open' : ''}" style="--crew-c:${Utils.escAttr(_modelColor(modelId))}" data-slot="${index}" data-agent="${Utils.escAttr(agent.id)}" aria-label="${Utils.escAttr(name)}"${_liveOf(agent.id) ? ' aria-busy="true"' : ''}>
        <header class="crew-card-top">
          <span class="crew-avatar" aria-hidden="true">${_esc(Utils.initials(name))}</span>
          <span class="crew-card-names">
            <h3>${_esc(name)}</h3>
            ${role ? `<span>${_esc(role)}</span>` : ''}
          </span>
        </header>
        <div class="crew-card-meta">
          <span class="crew-model"><i aria-hidden="true"></i>${_esc(_modelName(modelId))}</span>
          ${tools ? `<span class="crew-tools">${_esc(tools)}</span>` : ''}
        </div>
        <div class="crew-status" data-s="${status.s}" id="crew-status-${index}">
          <span class="crew-status-dot" aria-hidden="true"></span><span>${_esc(status.text)}</span>
        </div>
        <div class="crew-chat" id="crew-chat-${index}">${_chatHTML(member)}</div>
        <p class="sr-only" id="crew-say-${index}" aria-live="polite"></p>
        <form class="crew-compose" data-slot="${index}">
          <label class="sr-only" for="crew-msg-${index}">Message ${_esc(name)}</label>
          <input type="text" id="crew-msg-${index}" autocomplete="off" placeholder="Message ${Utils.escAttr(first)}…">
          ${_sendButtonHTML(member)}
        </form>
      </article>`;
  }

  const SEND_ICON = '<svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-5 16-3-6.5z"/><path d="M12 13.5 20 4"/></svg>';
  const STOP_ICON = '<svg class="icon icon-sm" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

  const _liveOf = (agentId) => (_session.get(agentId) || {}).live || null;
  const _isOpen = (agentId) => _expanded.has(agentId) && _thread(agentId).length > 1;
  // The card that shows this agent now: slots can move under a running turn.
  const _memberOf = (agentId) => _crew.find(m => m.agent && m.agent.id === agentId) || null;

  function _nameOf(member) {
    return BlueprintUtils.crewIdentity(member.slot, member.agent) || member.agent.name || 'Agent';
  }

  // Send, or Stop while the card's turn is running.
  function _sendButtonHTML(member) {
    const live = (_session.get(member.agent.id) || {}).live;
    const name = _nameOf(member);
    if (live) {
      const label = live.stop ? 'Stopping' : 'Stop ' + name;
      return `<button type="button" class="crew-send is-busy" data-crew-action="stop" data-slot="${member.index}" aria-label="${Utils.escAttr(label)}"${live.stop ? ' disabled' : ''}>${STOP_ICON}</button>`;
    }
    return `<button type="submit" class="crew-send" aria-label="Send to ${Utils.escAttr(name)}">${SEND_ICON}</button>`;
  }

  function _md(text) {
    const md = (typeof PromptPanel !== 'undefined' && PromptPanel._md) ? PromptPanel._md : null;
    return md ? md(text) : `<p>${_esc(text)}</p>`;
  }

  function _replyHTML(reply, name) {
    if (reply.stopped) return `<div class="crew-reply is-note"><b>${_esc(name)}</b><p>Stopped.</p></div>`;
    return `<div class="crew-reply${reply.error ? ' is-error' : ''}"><b>${_esc(name)}</b>${reply.error ? `<p>${_esc(reply.text)}</p>` : _md(reply.text)}</div>`;
  }

  function _approvalHTML(member, approval) {
    const a = approval.action || {};
    const tool = a.toolLabel || a.tool || 'a tool';
    let input = '';
    try { input = JSON.stringify(a.input || {}); } catch { input = ''; }
    return `
      <div class="crew-approval" role="group" aria-label="${Utils.escAttr(_nameOf(member) + ' needs your approval')}">
        <p><b>${_esc(_nameOf(member))}</b> wants to use ${_esc(tool)}.</p>
        ${input && input !== '{}' ? `<code>${_esc(input.slice(0, 200))}</code>` : ''}
        <div class="crew-approval-acts">
          <button type="button" class="btn btn-sm btn-primary" data-crew-action="allow" data-slot="${member.index}" data-token="${approval.token}">Approve</button>
          <button type="button" class="btn btn-sm" data-crew-action="deny" data-slot="${member.index}" data-token="${approval.token}">Deny</button>
        </div>
      </div>`;
  }

  // The card's conversation: the latest exchange, or all of them once the
  // card is opened, then the turn in flight and any approval it waits on.
  function _chatHTML(member) {
    const id = member.agent.id;
    const name = _nameOf(member);
    const thread = _thread(id);
    const live = (_session.get(id) || {}).live;
    const open = _isOpen(id);
    const shown = open ? thread : thread.slice(-1);
    const exHTML = shown.map((x, i) => {
      const last = i === shown.length - 1;
      const reply = x.reply ? _replyHTML(x.reply, name)
        : (last && live) ? `<p class="crew-wait">${live.stop ? 'Stopping…' : 'Working…'}${live.step && !live.stop ? ' ' + _esc(live.step) : ''}</p>` : '';
      return `<div class="crew-ex">${x.ask ? `<p class="crew-ask"><b>You</b>${_esc(x.ask.text)}</p>` : ''}${reply}</div>`;
    }).join('');
    const body = thread.length ? exHTML : '<p class="crew-log-empty">No messages yet.</p>';
    const more = thread.length > 1
      ? `<button type="button" class="crew-more" data-crew-action="expand" data-slot="${member.index}" aria-expanded="${open}" aria-controls="crew-log-${member.index}">${open ? 'Show less' : 'Show all'}</button>`
      : '';
    return `
      <div class="crew-log${open ? ' is-open' : ''}" id="crew-log-${member.index}">${body}</div>
      ${live && live.approval ? _approvalHTML(member, live.approval) : ''}
      ${more ? `<div class="crew-chat-foot">${more}</div>` : ''}`;
  }

  // Repaints one agent's card: its conversation, send button and status.
  // The typed message stays, and focus on the send button follows it.
  function _paint(agentId) {
    const member = _memberOf(agentId);
    if (!_el || !member) return;
    const card = [..._el.querySelectorAll('.crew-card[data-agent]')].find(c => c.dataset.agent === String(agentId));
    if (!card) return;
    card.classList.toggle('is-open', _isOpen(agentId));
    if (_liveOf(agentId)) card.setAttribute('aria-busy', 'true'); else card.removeAttribute('aria-busy');
    const chat = card.querySelector('.crew-chat');
    if (chat) chat.innerHTML = _chatHTML(member);
    const btn = card.querySelector('.crew-send');
    if (btn) {
      const hadFocus = document.activeElement === btn;
      btn.outerHTML = _sendButtonHTML(member);
      if (hadFocus) {
        const next = card.querySelector('.crew-send');
        if (next && !next.disabled) next.focus(); else card.querySelector('.crew-compose input')?.focus();
      }
    }
    const node = card.querySelector('.crew-status');
    if (node) {
      const status = _statusOf(member.agent);
      node.dataset.s = status.s;
      node.lastElementChild.textContent = status.text;
    }
  }

  // One line for screen readers when a turn ends; the live node is never
  // replaced, so the announcement is heard.
  function _say(agentId, text) {
    const member = _memberOf(agentId);
    const node = member && _el && _el.querySelector('#crew-say-' + member.index);
    if (node) node.textContent = text;
  }

  function _stepLabel(step) {
    const tool = step && step.action;
    return tool ? `Using ${tool}.` : '';
  }

  // One message from a card: the agent's own conversation, kept per card so
  // follow-ups carry the context. Cards run at the same time; each waits for
  // its own turn to finish before it takes another message. Returns '' when
  // sent, else why not ('busy' or 'unavailable').
  function _send(member, text) {
    const agent = member.agent;
    const id = agent.id;
    if (typeof AgentExecutor === 'undefined' || !AgentExecutor.converse) return 'unavailable';
    let s = _session.get(id);
    if (!s) { s = { cutoff: _logNewest, exchanges: [], convo: null, live: null }; _session.set(id, s); }
    if (s.live) return 'busy';
    const gen = _gen;
    const ex = { ask: { text, ts: Date.now() }, reply: null };
    s.exchanges.push(ex);
    s.live = { step: '', approval: null, stop: false };
    if (!s.convo) {
      const approvalMode = (typeof ShipBehaviors !== 'undefined' && ShipBehaviors.getBehaviors)
        ? ShipBehaviors.getBehaviors(_shipId).approvalMode : null;
      s.convo = AgentExecutor.converse(agent, {
        tools: agent.config && agent.config.tools,
        spaceshipId: _shipId,
        approvalMode,
        onStep: (step) => {
          if (gen !== _gen || !s.live) return;
          s.live.step = _stepLabel(step);
          _paint(id);
        },
        onApprovalNeeded: (action) => _askApproval(id, s, gen, action),
        shouldStop: () => gen !== _gen || !!(s.live && s.live.stop),
      });
    }
    _paint(id);
    const name = _nameOf(member);
    s.convo.send(text).then((r) => {
      if (gen !== _gen) return;
      ex.reply = r && r.stopped
        ? { text: '', ts: Date.now(), stopped: true }
        : { text: (r && r.text) || '', ts: Date.now(), error: !!(r && r.error) };
    }).catch((err) => {
      if (gen !== _gen) return;
      ex.reply = { text: (err && err.message) || 'The agent could not answer. Try again.', ts: Date.now(), error: true };
      s.convo = null;
    }).finally(() => {
      if (gen !== _gen) return;
      if (s.live && s.live.approval) s.live.approval.resolve(false);
      s.live = null;
      _paint(id);
      const r = ex.reply || {};
      _say(id, r.stopped ? `${name} stopped.` : r.error ? `${name} could not answer: ${String(r.text).replace(/^Error:\s*/, '')}` : `${name} replied.`);
    });
    return '';
  }

  function _askApproval(agentId, s, gen, action) {
    if (gen !== _gen || !s.live || s.live.stop) return Promise.resolve(false);
    return new Promise((resolve) => {
      s.live.approval = { action, resolve, token: ++_approvalSeq };
      _paint(agentId);
      const m = _memberOf(agentId);
      if (m) _say(agentId, `${_nameOf(m)} needs your approval.`);
    });
  }

  function _answerApproval(agentId, token, ok) {
    const s = _session.get(agentId);
    const a = s && s.live && s.live.approval;
    if (!a || String(a.token) !== String(token)) return;
    s.live.approval = null;
    a.resolve(ok);
    _paint(agentId);
  }

  function _stop(agentId) {
    const s = _session.get(agentId);
    if (!s || !s.live || s.live.stop) return;
    s.live.stop = true;
    if (s.live.approval) { const a = s.live.approval; s.live.approval = null; a.resolve(false); }
    _paint(agentId);
  }

  function _emptyHTML() {
    const ship = _esc(Terminology.label('spaceship', { lowercase: true }));
    const a = Terminology.article('spaceship');
    return `
      <div class="crew-wrap">
        <div class="widget-card crew-empty">
          <h1>No ${ship} yet</h1>
          <p>${a === 'an' ? 'An' : 'A'} ${ship} gives you a ${_esc(_crewWord())} of AI agents built for one kind of business. Pick one from Blueprints and its ${_esc(_crewWord())} shows up here.</p>
          <div class="crew-empty-acts">
            <a class="btn btn-primary btn-sm" href="#/blueprints?tab=spaceship">Choose ${a} ${ship}</a>
            <a class="btn btn-sm" href="#/space">Ask anything instead</a>
          </div>
        </div>
      </div>`;
  }

  function render(el) {
    _el = el;
    const fromHash = _shipFromHash();
    if (fromHash) {
      localStorage.setItem(Utils.KEYS.mcShip, fromHash);
      window.dispatchEvent(new StorageEvent('storage', { key: Utils.KEYS.mcShip, newValue: fromHash }));
    }
    const shipBefore = _shipId;
    _shipId = Blueprints.getCurrentShipId();
    if (shipBefore && String(shipBefore) !== String(_shipId)) _resetChats();
    _bind();
    if (!_shipId) { el.innerHTML = _emptyHTML(); return; }

    const ship = Blueprints.getUserShips().find(s => String(s.id) === String(_shipId)) || {};
    const shipNoun = Terminology.label('spaceship');
    const shipName = ship.name || shipNoun;
    _crew = Blueprints.getShipCrew(_shipId);
    const staffed = _crew.filter(m => m.agent);
    const models = new Set(staffed.map(m => _modelId(m.agent)));
    const missionsLabel = Terminology.label('mission', { plural: true });
    const open = _crew.length - staffed.length;

    el.innerHTML = `
      <div class="crew-wrap">
        <header class="crew-head">
          <span class="crew-ship-mark" aria-hidden="true">${_esc(Utils.initials(shipName))}</span>
          <div class="crew-head-text">
            <p class="crew-eyebrow">${_esc(shipNoun)}</p>
            <h1>${_esc(shipName)}</h1>
            <p>${_esc(staffed.length + (staffed.length === 1 ? ' agent' : ' agents') + ' on ' + models.size + (models.size === 1 ? ' model' : ' models') + (open ? ', ' + open + (open === 1 ? Terminology.pick(' open role', ' open station') : Terminology.pick(' open roles', ' open stations')) : ''))}</p>
          </div>
          <div class="crew-head-acts">
            <a class="btn btn-sm" href="#/bridge?tab=missions">${_esc(missionsLabel)}</a>
            <a class="btn btn-sm" href="#/bridge?tab=schematic">Diagram</a>
          </div>
        </header>
        <div id="crew-review"></div>
        <div class="crew-layout">
          <section class="crew-cards" aria-label="${Utils.escAttr(_crewWord(true))}">
            ${_crew.map(_cardHTML).join('')}
          </section>
          <aside class="widget-card crew-runs" aria-labelledby="crew-runs-title">
            <h2 id="crew-runs-title">Recent runs</h2>
            <div id="crew-runlog"></div>
          </aside>
        </div>
      </div>`;

    _wire();
    _refreshChats();
    _subscribeRuns();
    _loadRuns();
  }

  // Reads the ship's log again and repaints every card. A burst of calls
  // (several cards finishing together) shares one read plus one more after
  // it, and a read that comes back after the ship changed is dropped.
  async function _refreshChats() {
    if (_logRead) { _logAgain = true; return _logRead; }
    const gen = _gen;
    const shipId = _shipId;
    _logRead = (async () => {
      const got = await _readLogs(shipId);
      if (gen !== _gen || String(shipId) !== String(_shipId) || !_el) return;
      if (got) {
        _logNewest = got.newest;
        _crew.forEach(m => { if (m.agent) _logs.set(m.agent.id, _exchanges(got.entries, m.agent.id)); });
      }
      _crew.forEach(m => { if (m.agent) _paint(m.agent.id); });
    })();
    try { await _logRead; } finally { _logRead = null; }
    // The follow-up reads whatever ship is on screen now, even a new one.
    if (_logAgain) { _logAgain = false; return _refreshChats(); }
  }

  function _resetChats() {
    _gen++;
    _logNewest = -Infinity;
    for (const s of _session.values()) {
      if (s.live && s.live.approval) s.live.approval.resolve(false);
    }
    _session.clear();
    _logs.clear();
    _expanded.clear();
  }

  function _renderRunlog() {
    const box = _el && _el.querySelector('#crew-runlog');
    if (!box) return;
    if (_runsState === 'signed-out') {
      box.innerHTML = `<p class="crew-runs-empty">Sign in to see your ${_esc(_crewWord())}'s runs.</p><button type="button" class="btn btn-sm btn-primary" data-crew-action="signin">Sign in</button>`;
      return;
    }
    if (_runsState === 'loading' && !_runs.length) { box.innerHTML = '<p class="crew-runs-empty">Loading runs…</p>'; return; }
    if (!_runs.length) {
      box.innerHTML = `<p class="crew-runs-empty">Runs show up here when the ${_esc(_crewWord())} works. Message the ${_esc(_crewWord())} below to start one.</p>`;
      return;
    }
    box.innerHTML = `<ol class="crew-runlist">${_runs.map(r => `
      <li>
        <a class="crew-run" href="#/missions/${encodeURIComponent(r.id)}">
          <span class="crew-run-title">${_esc(r.title || 'Untitled run')}</span>
          <span class="crew-run-meta"><span class="crew-run-state" data-s="${Utils.escAttr(r.status || '')}">${_esc(_RUN_LABELS[r.status] || r.status || '')}</span><time>${_esc(Utils.timeAgo ? Utils.timeAgo(r.created_at) : '')}</time></span>
        </a>
      </li>`).join('')}</ol>`;
  }

  function _renderReview() {
    const box = _el && _el.querySelector('#crew-review');
    if (!box) return;
    const waiting = _runs.filter(r => r.status === 'review');
    box.innerHTML = waiting.map(r => `
      <div class="crew-review" role="status">
        <span class="crew-review-dot" aria-hidden="true"></span>
        <p><b>${_esc(r.title || 'A run')}</b> is waiting for your review.</p>
        <div class="crew-review-acts">
          <button type="button" class="btn btn-sm btn-primary" data-crew-action="approve" data-run="${Utils.escAttr(r.id)}">Approve</button>
          <button type="button" class="btn btn-sm" data-crew-action="reject" data-run="${Utils.escAttr(r.id)}">Reject</button>
          <a class="btn btn-sm" href="#/missions/${encodeURIComponent(r.id)}">Review</a>
        </div>
      </div>`).join('');
  }

  function _updateStatus(agentId) {
    _crew.forEach(m => {
      if (!m.agent || m.agent.id !== agentId) return;
      const node = _el && _el.querySelector('#crew-status-' + m.index);
      if (!node) return;
      const status = _statusOf(m.agent);
      node.dataset.s = status.s;
      node.lastElementChild.textContent = status.text;
      if (status.s !== 'active') _refreshChats();
    });
  }

  /* ── Events ── */

  function _wire() {
    _el.querySelectorAll('.crew-compose').forEach(form => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const member = _crew[Number(form.dataset.slot)];
        const input = form.querySelector('input');
        const text = input.value.trim();
        if (!member || !member.agent || !text) return;
        if (!State.get('user') && !String(_modelId(member.agent)).startsWith('byo:')) {
          if (typeof NICE !== 'undefined' && NICE.openModal) NICE.openModal('modal-auth');
          return;
        }
        const why = _send(member, text);
        if (!why) input.value = '';
        else if (why === 'busy' && typeof Notify !== 'undefined') Notify.send({ title: 'Still answering', message: 'Wait for the reply on this card, or stop it, then send again.', type: 'system' });
      });
    });
    _el.addEventListener('click', _onClick);
  }

  async function _onClick(e) {
    const btn = e.target.closest('[data-crew-action]');
    if (!btn) return;
    const action = btn.dataset.crewAction;
    if (action === 'signin') {
      if (typeof NICE !== 'undefined' && NICE.openModal) NICE.openModal('modal-auth');
      return;
    }
    const member = btn.dataset.slot != null ? _crew[Number(btn.dataset.slot)] : null;
    if (member && member.agent) {
      const id = member.agent.id;
      if (action === 'expand') {
        if (_expanded.has(id)) _expanded.delete(id); else _expanded.add(id);
        _paint(id);
        _el.querySelector(`.crew-card[data-slot="${member.index}"] .crew-more`)?.focus();
        return;
      }
      if (action === 'stop') {
        _stop(id);
        // The Stop button turns disabled; keep the keyboard on the card.
        _el.querySelector(`.crew-card[data-slot="${member.index}"] .crew-compose input`)?.focus();
        return;
      }
      if (action === 'allow' || action === 'deny') { _answerApproval(id, btn.dataset.token, action === 'allow'); return; }
    }
    const run = _runs.find(r => String(r.id) === btn.dataset.run);
    if (!run || typeof MissionRunner === 'undefined') return;
    btn.closest('.crew-review-acts')?.querySelectorAll('button').forEach(b => { b.disabled = true; });
    const mission = Terminology.label('mission');
    try {
      if (action === 'approve') {
        const out = await MissionRunner.approveRun(run);
        if (typeof Notify !== 'undefined') {
          Notify.send(out.resumed
            ? { title: `${mission} continues`, message: `The ${_crewWord()} picked up after your approval.`, type: 'success' }
            : { title: `${mission} approved`, message: `${run.title || 'The run'} is done.`, type: 'success' });
        }
      } else if (action === 'reject') {
        await MissionRunner.rejectRun(run);
        if (typeof Notify !== 'undefined') Notify.send({ title: `${mission} rejected`, message: `You can run the ${mission.toLowerCase()} again.`, type: 'system' });
      }
    } catch (err) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Could not continue', message: err?.message || 'Try again from the review page.', type: 'error' });
    }
    _loadRuns();
  }

  function _subscribeRuns() {
    _unsubscribeRuns();
    if (!State.get('user') || typeof SB === 'undefined' || !SB.realtime) return;
    _channel = SB.realtime.subscribe('mission_runs', (payload) => {
      const row = payload && (payload.new || payload.old);
      if (row && String(row.spaceship_id) === String(_shipId)) _loadRuns();
    });
  }

  function _unsubscribeRuns() {
    if (_channel && typeof SB !== 'undefined' && SB.realtime) SB.realtime.unsubscribe(_channel);
    _channel = null;
  }

  // State.on fires immediately for keys that already hold data; _binding
  // swallows those calls so the first render isn't repeated per key.
  function _bind() {
    if (_bound) return;
    _bound = true;
    _binding = true;
    _WATCH.forEach(k => State.on(k, _rerender));
    _binding = false;
    if (typeof AgentActivity !== 'undefined' && AgentActivity.subscribe) {
      _unsubActivity = AgentActivity.subscribe((agentId) => _updateStatus(agentId));
    }
  }

  function _rerender() {
    if (_binding) return;
    // A message typed into a card survives only within one render; skip
    // the refresh while the user is typing in this view.
    if (_el && _el.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    if (_el && _el.isConnected && _el.querySelector('.crew-wrap')) render(_el);
  }

  function destroy() {
    _WATCH.forEach(k => State.off(k, _rerender));
    if (_unsubActivity) { _unsubActivity(); _unsubActivity = null; }
    _unsubscribeRuns();
    if (_el) _el.removeEventListener('click', _onClick);
    _resetChats();
    _bound = false;
    _el = null;
    _crew = [];
    _runs = [];
    _runsState = 'idle';
  }

  return { get title() { return _crewWord(true); }, render, destroy };
})();
