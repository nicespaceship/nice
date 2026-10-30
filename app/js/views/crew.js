/* ═══════════════════════════════════════════════════════════════════
   NICE — Crew (#/crew, #/crew?ship=<id>)
   One spaceship's crew as a table of cards. Each card shows who the agent
   is, the model it runs on (the frame takes that provider's color), the
   tools it works through, what it is doing right now, its latest exchange,
   and a box to message it directly. Beside the cards: the ship's recent
   runs, and a bar for any run waiting on the user's review.

   Reuses existing machinery rather than adding paths:
     crew     — Blueprints.getShipCrew (same resolution as the Schematic)
     status   — AgentActivity (emitted by AgentExecutor)
     messages — ShipLog entries for the ship, filtered per agent
     sending  — PromptPanel.sendToAgent (the agent-with-tools chat tier)
     review   — MissionRunner.approveRun / rejectRun
   The Schematic stays reachable as the Diagram (#/bridge?tab=schematic).
═══════════════════════════════════════════════════════════════════ */

const CrewView = (() => {
  const title = 'Crew';
  const _esc = Utils.esc;
  const _WATCH = ['spaceships', 'agents', 'user'];
  const _LOG_EVENTS = ['mission_start', 'turn_start', 'final_answer'];
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
    const st = (typeof AgentActivity !== 'undefined') ? AgentActivity.getState(agent.id) : 'idle';
    if (st === 'active') return { s: 'active', text: 'Working…' };
    if (st === 'recent') return { s: 'recent', text: 'Just finished' };
    return { s: 'idle', text: 'Ready' };
  }

  // The agent's latest exchange in this ship: requests to it and its final
  // answers, newest last. Tool chatter is left out.
  async function _recentMessages(agent) {
    if (!_shipId || typeof ShipLog === 'undefined' || !ShipLog.getEntries) return [];
    let entries = [];
    try { entries = await ShipLog.getEntries(_shipId, 80); } catch { return []; }
    return (entries || []).filter(e => {
      const md = e.metadata || {};
      const mine = e.agent_id === agent.id || md.agent_blueprint_id === agent.id;
      return mine && _LOG_EVENTS.includes(md.event) && (e.role === 'user' || e.role === 'agent');
    }).slice(-2);
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
          <b>Open station</b>
          ${role ? `<span>${_esc(role)}</span>` : ''}
        </div>`;
    }
    const name = BlueprintUtils.crewIdentity(slot, agent) || agent.name || 'Agent';
    const modelId = _modelId(agent);
    const tools = BlueprintUtils.capabilityLabel(agent);
    const status = _statusOf(agent);
    const first = String(name).split(/\s+/)[0];
    return `
      <article class="crew-card" style="--crew-c:${_esc(_modelColor(modelId))}" data-slot="${index}" aria-label="${_esc(name)}">
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
        <div class="crew-log" id="crew-log-${index}" aria-live="polite"></div>
        <form class="crew-compose" data-slot="${index}">
          <label class="sr-only" for="crew-msg-${index}">Message ${_esc(name)}</label>
          <input type="text" id="crew-msg-${index}" autocomplete="off" placeholder="Message ${_esc(first)}…">
          <button type="submit" class="crew-send" aria-label="Send to ${_esc(name)}">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-5 16-3-6.5z"/><path d="M12 13.5 20 4"/></svg>
          </button>
        </form>
      </article>`;
  }

  function _emptyHTML() {
    return `
      <div class="crew-wrap">
        <div class="widget-card crew-empty">
          <h1>No spaceship yet</h1>
          <p>A spaceship is a crew of AI agents built for one kind of business. Pick one from Blueprints and its crew shows up here.</p>
          <div class="crew-empty-acts">
            <a class="btn btn-primary btn-sm" href="#/blueprints?tab=spaceship">Find a spaceship</a>
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
    _shipId = Blueprints.getCurrentShipId();
    _bind();
    if (!_shipId) { el.innerHTML = _emptyHTML(); return; }

    const ship = Blueprints.getUserShips().find(s => String(s.id) === String(_shipId)) || {};
    const shipName = ship.name || 'Spaceship';
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
            <p class="crew-eyebrow">Spaceship</p>
            <h1>${_esc(shipName)}</h1>
            <p>${_esc(staffed.length + (staffed.length === 1 ? ' agent' : ' agents') + ' on ' + models.size + (models.size === 1 ? ' model' : ' models') + (open ? ', ' + open + (open === 1 ? ' open station' : ' open stations') : ''))}</p>
          </div>
          <div class="crew-head-acts">
            <a class="btn btn-sm" href="#/bridge?tab=missions">${_esc(missionsLabel)}</a>
            <a class="btn btn-sm" href="#/bridge?tab=schematic">Diagram</a>
          </div>
        </header>
        <div id="crew-review"></div>
        <div class="crew-layout">
          <section class="crew-cards" aria-label="Crew">
            ${_crew.map(_cardHTML).join('')}
          </section>
          <aside class="widget-card crew-runs" aria-labelledby="crew-runs-title">
            <h2 id="crew-runs-title">Recent runs</h2>
            <div id="crew-runlog"></div>
          </aside>
        </div>
      </div>`;

    _wire();
    _crew.forEach(m => { if (m.agent) _renderLog(m); });
    _subscribeRuns();
    _loadRuns();
  }

  async function _renderLog(member) {
    const box = _el && _el.querySelector('#crew-log-' + member.index);
    if (!box) return;
    const msgs = await _recentMessages(member.agent);
    if (!box.isConnected) return;
    const name = BlueprintUtils.crewIdentity(member.slot, member.agent) || member.agent.name;
    box.innerHTML = msgs.length
      ? msgs.map(e => `<p class="crew-msg crew-msg-${e.role === 'user' ? 'you' : 'agent'}"><b>${e.role === 'user' ? 'You' : _esc(name)}</b>${_esc(String(e.content || '').slice(0, 280))}</p>`).join('')
      : '<p class="crew-log-empty">No messages yet.</p>';
  }

  function _renderRunlog() {
    const box = _el && _el.querySelector('#crew-runlog');
    if (!box) return;
    if (_runsState === 'signed-out') {
      box.innerHTML = `<p class="crew-runs-empty">Sign in to see your crew's runs.</p><button type="button" class="btn btn-sm btn-primary" data-crew-action="signin">Sign in</button>`;
      return;
    }
    if (_runsState === 'loading' && !_runs.length) { box.innerHTML = '<p class="crew-runs-empty">Loading runs…</p>'; return; }
    if (!_runs.length) {
      box.innerHTML = `<p class="crew-runs-empty">Runs show up here when the crew works. Message the crew below to start one.</p>`;
      return;
    }
    box.innerHTML = `<ol class="crew-runlist">${_runs.map(r => `
      <li>
        <a class="crew-run" href="#/missions/${encodeURIComponent(r.id)}">
          <span class="crew-run-title">${_esc(r.title || 'Untitled run')}</span>
          <span class="crew-run-meta"><span class="crew-run-state" data-s="${_esc(r.status || '')}">${_esc(_RUN_LABELS[r.status] || r.status || '')}</span><time>${_esc(Utils.timeAgo ? Utils.timeAgo(r.created_at) : '')}</time></span>
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
          <button type="button" class="btn btn-sm btn-primary" data-crew-action="approve" data-run="${_esc(r.id)}">Approve</button>
          <button type="button" class="btn btn-sm" data-crew-action="reject" data-run="${_esc(r.id)}">Reject</button>
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
      if (status.s !== 'active') _renderLog(m);
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
        const sent = (typeof PromptPanel !== 'undefined' && PromptPanel.sendToAgent)
          ? PromptPanel.sendToAgent(member.agent, text) : false;
        if (sent) input.value = '';
        else if (typeof Notify !== 'undefined') Notify.send({ title: 'Still sending', message: 'Wait for the current reply, then send again.', type: 'system' });
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
    const run = _runs.find(r => String(r.id) === btn.dataset.run);
    if (!run || typeof MissionRunner === 'undefined') return;
    btn.closest('.crew-review-acts')?.querySelectorAll('button').forEach(b => { b.disabled = true; });
    const mission = Terminology.label('mission');
    try {
      if (action === 'approve') {
        const out = await MissionRunner.approveRun(run);
        if (typeof Notify !== 'undefined') {
          Notify.send(out.resumed
            ? { title: `${mission} continues`, message: 'The crew picked up after your approval.', type: 'success' }
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
    _bound = false;
    _el = null;
    _crew = [];
    _runs = [];
    _runsState = 'idle';
  }

  return { title, render, destroy };
})();
