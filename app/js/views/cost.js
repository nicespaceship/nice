/* ═══════════════════════════════════════════════════════════════════
   NICE — Cost Tracker View
   Per-agent cost tracking with budget caps and alerts.
═══════════════════════════════════════════════════════════════════ */

const CostView = (() => {
  const title = 'Cost Tracker';
  const _esc = Utils.esc;
  const _timeAgo = Utils.timeAgo;

  const MODEL_COSTS = {
    'claude-4':            { input: 15.00, output: 75.00 },
    'claude-3.5-sonnet':   { input: 3.00,  output: 15.00 },
    'gpt-4o':              { input: 5.00,  output: 15.00 },
    'gemini-2':            { input: 3.50,  output: 10.50 },
    'llama-3':             { input: 0.00,  output: 0.00  },
  };

  function render(el) {
    const user = State.get('user');
    if (!user) return _authPrompt(el, 'the cost tracker');

    el.innerHTML = `
      <div class="cost-wrap">
        <div class="cost-header">
          <div>
            <h1 class="cost-title">Cost Tracker</h1>
            <p class="cost-sub">Per-agent cost tracking with live spend and budget caps.</p>
          </div>
          <button class="btn btn-sm" id="btn-budget">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-settings"/></svg>
            Budget Settings
          </button>
        </div>

        <!-- Budget Overview -->
        <div class="cost-overview" id="cost-overview">
          <div class="cost-ov-card cost-ov-spend">
            <span class="cost-ov-label">Total Spend</span>
            <span class="cost-ov-num" id="co-spend">$0.00</span>
            <span class="cost-ov-sub" id="co-spend-period">This month</span>
          </div>
          <div class="cost-ov-card">
            <span class="cost-ov-label">Monthly Budget</span>
            <span class="cost-ov-num" id="co-budget">$50.00</span>
            <span class="cost-ov-sub">Configurable</span>
          </div>
          <div class="cost-ov-card">
            <span class="cost-ov-label">Remaining</span>
            <span class="cost-ov-num" id="co-remaining">$50.00</span>
            <div class="cost-budget-bar">
              <div class="cost-budget-fill" id="co-bar" style="width:0%"></div>
            </div>
          </div>
          <div class="cost-ov-card">
            <span class="cost-ov-label">Avg / Day</span>
            <span class="cost-ov-num" id="co-daily">$0.00</span>
            <span class="cost-ov-sub" id="co-daily-trend">—</span>
          </div>
        </div>

        <!-- Spend Chart -->
        <div class="cost-chart-panel">
          <h3 class="cost-section-title">Daily Spend</h3>
          <div class="cost-chart-box">
            <canvas id="chart-cost" width="600" height="180"></canvas>
          </div>
        </div>

        <!-- Per-Agent Breakdown -->
        <div class="cost-section">
          <h3 class="cost-section-title">Per-Agent Breakdown</h3>
          <div id="cost-agent-table" class="cost-table-wrap">
            <div class="loading-state"><p>Loading...</p></div>
          </div>
        </div>

        <!-- Cost by Mission (Step 48) -->
        <div class="cost-section">
          <h3 class="cost-section-title">Cost by Mission</h3>
          <div id="cost-by-mission" class="cost-table-wrap">
            <div class="loading-state"><p>Loading...</p></div>
          </div>
        </div>

        <!-- Recent Transactions -->
        <div class="cost-section">
          <h3 class="cost-section-title">Recent Transactions</h3>
          <div id="cost-log" class="cost-log">
            <div class="loading-state"><p>Loading...</p></div>
          </div>
        </div>

        <!-- Purchase History -->
        <div class="cost-section">
          <h3 class="cost-section-title">Purchase History</h3>
          <div id="cost-purchases">
            <div class="loading-state"><p>Loading...</p></div>
          </div>
        </div>
      </div>

      <!-- Budget Settings Modal -->
      <div class="modal-overlay" id="modal-budget">
        <div class="modal-box">
          <div class="modal-hdr">
            <h3 class="modal-title">Budget Settings</h3>
            <button class="modal-close" id="close-budget-modal" aria-label="Close">
              <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-x"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <form id="budget-form" class="auth-form">
              <div class="auth-field">
                <label for="b-limit">Monthly Budget ($)</label>
                <input type="number" id="b-limit" min="0" step="5" value="50" placeholder="50" />
              </div>
              <div class="auth-field">
                <label for="b-alert">Alert Threshold (%)</label>
                <input type="number" id="b-alert" min="0" max="100" step="5" value="80" placeholder="80" />
              </div>
              <button type="submit" class="auth-submit">Save Budget</button>
            </form>
          </div>
        </div>
      </div>
    `;

    _loadBudget();
    _loadCosts();
    _loadPurchaseHistory();
    _bindEvents();
  }

  function _loadBudget() {
    const saved = localStorage.getItem('nice-budget');
    if (saved) {
      try {
        const b = JSON.parse(saved);
        document.getElementById('b-limit').value = b.limit || 50;
        document.getElementById('b-alert').value = b.alert || 80;
      } catch(e) {}
    }
  }

  function _getBudget() {
    const saved = localStorage.getItem('nice-budget');
    if (saved) {
      try { return JSON.parse(saved); } catch(e) {}
    }
    return { limit: 50, alert: 80 };
  }

  async function _loadCosts() {
    const user = State.get('user');
    let agents = State.get('agents') || [];
    let tasks = State.get('missions') || [];
    let costLogs = [];

    // Fetch fresh data
    try {
      const [a, t, logs] = await Promise.all([
        agents.length ? agents : SB.db('user_agents').list({ userId: user.id }).catch(() => []),
        tasks.length ? tasks : SB.db('tasks').list({ userId: user.id }).catch(() => []),
        SB.db('fuel_usage').list({ userId: user.id, orderBy: 'created_at' }).catch(() => []),
      ]);
      agents = Array.isArray(a) ? a : agents;
      tasks = Array.isArray(t) ? t : tasks;
      costLogs = Array.isArray(logs) ? logs : [];
      State.set('agents', agents);
      State.set('missions', tasks);
    } catch(e) {}

    // Map fuel_usage rows to cost log format
    costLogs = costLogs.map(u => ({
      id:          u.id,
      agent_id:    u.agent_id,
      model:       u.model || 'unknown',
      tokens_used: (u.input_tokens || 0) + (u.output_tokens || 0),
      amount:      parseFloat(u.fuel_cost) || 0,
      created_at:  u.created_at,
    }));

    // If no real logs, generate estimates from tasks + agent models
    if (!costLogs.length && tasks.length) {
      costLogs = _estimateCosts(tasks, agents);
    }

    _updateOverview(costLogs);
    _drawCostChart(costLogs);
    _renderAgentBreakdown(agents, costLogs);
    _renderCostByMission(agents, tasks, costLogs);
    _renderLog(costLogs, agents);
  }

  function _estimateCosts(tasks, agents) {
    const agentMap = {};
    agents.forEach(a => { agentMap[a.id] = a; });

    return tasks.filter(t => t.status === 'completed' || t.status === 'running').map(t => {
      const agent = agentMap[t.agent_id];
      const model = agent?.llm_engine || 'claude-4';
      const rates = MODEL_COSTS[model] || MODEL_COSTS['claude-4'];
      const tokens = 800 + Math.floor(Math.random() * 3200); // Simulated
      const cost = ((tokens / 1000000) * rates.input) + ((tokens * 0.3 / 1000000) * rates.output);
      return {
        id: 'est-' + t.id,
        agent_id: t.agent_id,
        model,
        tokens_used: tokens,
        amount: Math.round(cost * 10000) / 10000,
        created_at: t.created_at,
      };
    });
  }

  function _updateOverview(logs) {
    const budget = _getBudget();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const monthLogs = logs.filter(l => new Date(l.created_at).getTime() >= monthStart);
    const totalSpend = monthLogs.reduce((s, l) => s + (l.amount || 0), 0);
    const remaining = Math.max(0, budget.limit - totalSpend);
    const pct = budget.limit > 0 ? Math.min(100, (totalSpend / budget.limit) * 100) : 0;

    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const avgDaily = dayOfMonth > 0 ? totalSpend / dayOfMonth : 0;
    const projectedMonth = avgDaily * daysInMonth;

    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('co-spend', '$' + totalSpend.toFixed(2));
    el('co-budget', '$' + budget.limit.toFixed(2));
    el('co-remaining', '$' + remaining.toFixed(2));
    el('co-daily', '$' + avgDaily.toFixed(2));
    el('co-daily-trend', projectedMonth > budget.limit ? 'Over budget pace' : 'On track');

    // Budget bar
    const bar = document.getElementById('co-bar');
    if (bar) {
      bar.style.width = pct + '%';
      bar.className = 'cost-budget-fill' + (pct >= 90 ? ' bar-danger' : pct >= 70 ? ' bar-warn' : '');
    }

    // Alert check
    if (pct >= budget.alert) {
      const trendEl = document.getElementById('co-daily-trend');
      if (trendEl) trendEl.style.color = '#ef4444';
    }
  }

  function _drawCostChart(logs) {
    const canvas = document.getElementById('chart-cost');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;

    // Last 14 days
    const days = 14;
    const buckets = Array(days).fill(0);
    const labels = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      labels.push(m[d.getMonth()] + ' ' + d.getDate());
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const dayEnd = dayStart + 86400000;
      buckets[days - 1 - i] = logs
        .filter(l => { const ts = new Date(l.created_at).getTime(); return ts >= dayStart && ts < dayEnd; })
        .reduce((s, l) => s + (l.amount || 0), 0);
    }

    const max = Math.max(...buckets, 0.01);
    const pad = { top: 10, right: 10, bottom: 30, left: 42 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;

    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue('--accent').trim() || '#6366f1';
    const border = styles.getPropertyValue('--border').trim() || '#333';
    const textDim = styles.getPropertyValue('--text-dim').trim() || '#666';

    ctx.clearRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = border;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    }

    // Y-axis
    ctx.fillStyle = textDim;
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = (max * (4 - i) / 4).toFixed(2);
      ctx.fillText('$' + val, pad.left - 6, pad.top + (chartH / 4) * i + 3);
    }

    // Area + line
    const points = buckets.map((v, i) => ({
      x: pad.left + (chartW / (days - 1)) * i,
      y: pad.top + chartH - (v / max) * chartH,
    }));

    // Fill area
    ctx.beginPath();
    ctx.moveTo(points[0].x, pad.top + chartH);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, pad.top + chartH);
    ctx.closePath();
    ctx.fillStyle = accent + '18';
    ctx.fill();

    // Line
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Dots
    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
    });

    // X-axis
    ctx.fillStyle = textDim;
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i < days; i += 2) {
      ctx.fillText(labels[i], points[i].x, H - 8);
    }
  }

  function _renderAgentBreakdown(agents, logs) {
    const wrap = document.getElementById('cost-agent-table');
    if (!wrap) return;

    if (!agents.length) {
      wrap.innerHTML = '<p class="text-muted" style="font-size:.82rem;padding:12px">No agents yet.</p>';
      return;
    }

    const rows = agents.map(a => {
      const agentLogs = logs.filter(l => l.agent_id === a.id);
      const total = agentLogs.reduce((s, l) => s + (l.amount || 0), 0);
      const tokens = agentLogs.reduce((s, l) => s + (l.tokens_used || 0), 0);
      const model = a.llm_engine || 'claude-4';
      return { agent: a, total, tokens, model, count: agentLogs.length };
    }).sort((a, b) => b.total - a.total);

    wrap.innerHTML = `
      <table class="ana-table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Model</th>
            <th>Missions</th>
            <th>Tokens</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>
                <a href="#/bridge/agents/${r.agent.id}" class="ana-agent-link">
                  <span class="status-dot ${r.agent.status === 'active' ? 'dot-g' : 'dot-a'}"></span>
                  ${_esc(r.agent.name)}
                </a>
              </td>
              <td class="mono" style="font-size:.68rem">${_esc(r.model)}</td>
              <td>${r.count}</td>
              <td>${_formatTokens(r.tokens)}</td>
              <td class="hl">$${r.total.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  /* ── Step 48: Cost by Mission ── */
  function _renderCostByMission(agents, tasks, logs) {
    const wrap = document.getElementById('cost-by-mission');
    if (!wrap) return;
    if (!tasks.length) {
      wrap.innerHTML = '<p class="text-muted" style="font-size:.82rem;padding:12px">No missions yet.</p>';
      return;
    }

    const agentMap = {};
    agents.forEach(a => { agentMap[a.id] = a; });

    // Group cost logs by agent, cross-reference with tasks
    const rows = tasks
      .filter(t => t.status === 'completed' || t.status === 'running')
      .map(t => {
        const agent = agentMap[t.agent_id];
        const agentName = agent ? agent.name : 'Unassigned';
        const missionLogs = logs.filter(l => l.agent_id === t.agent_id && Math.abs(new Date(l.created_at).getTime() - new Date(t.created_at).getTime()) < 86400000);
        const tokens = missionLogs.reduce((s, l) => s + (l.tokens_used || 0), 0);
        const cost = missionLogs.reduce((s, l) => s + (l.amount || 0), 0);
        return { title: t.title, agentName, tokens, cost };
      })
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 20);

    // Calculate per-agent totals
    const agentTotals = {};
    rows.forEach(r => {
      if (!agentTotals[r.agentName]) agentTotals[r.agentName] = 0;
      agentTotals[r.agentName] += r.cost;
    });

    wrap.innerHTML = `
      <table class="ana-table">
        <thead>
          <tr><th>Mission</th><th>Agent</th><th>LLM Tokens</th><th>Token Cost</th></tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${_esc(r.title)}</td>
              <td>${_esc(r.agentName)}</td>
              <td>${_formatTokens(r.tokens)}</td>
              <td class="hl">$${r.cost.toFixed(4)}</td>
            </tr>
          `).join('')}
          <tr style="border-top:2px solid var(--border);font-weight:600">
            <td colspan="3">Total by Agent</td>
            <td>${Object.entries(agentTotals).map(([n, c]) => _esc(n) + ': $' + c.toFixed(2)).join(', ')}</td>
          </tr>
        </tbody>
      </table>
    `;
  }

  function _renderLog(logs, agents) {
    const wrap = document.getElementById('cost-log');
    if (!wrap) return;

    const agentMap = {};
    agents.forEach(a => { agentMap[a.id] = a; });

    const recent = logs.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 15);

    if (!recent.length) {
      wrap.innerHTML = '<p class="text-muted" style="font-size:.82rem;padding:12px">No cost data yet. Complete a mission to see costs.</p>';
      return;
    }

    wrap.innerHTML = recent.map(l => {
      const agent = agentMap[l.agent_id];
      return `
        <div class="cost-log-row">
          <span class="cost-log-agent">${_esc(agent?.name || 'Unknown')}</span>
          <span class="cost-log-model mono">${_esc(l.model)}</span>
          <span class="cost-log-tokens">${_formatTokens(l.tokens_used)} tokens</span>
          <span class="cost-log-amount">$${(l.amount || 0).toFixed(4)}</span>
          <span class="cost-log-time">${_timeAgo(l.created_at)}</span>
        </div>
      `;
    }).join('');
  }

  function _formatTokens(n) {
    if (!n) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  async function _loadPurchaseHistory() {
    const wrap = document.getElementById('cost-purchases');
    if (!wrap) return;

    const user = State.get('user');
    if (!user) {
      wrap.innerHTML = '<p class="text-muted" style="font-size:.82rem;padding:12px">Sign in to view purchase history.</p>';
      return;
    }

    try {
      if (typeof SB !== 'undefined' && SB.isReady()) {
        const purchases = await SB.db('fuel_purchases').list({ userId: user.id });
        if (Array.isArray(purchases) && purchases.length) {
          wrap.innerHTML = `
            <table class="ana-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Tokens Received</th>
                  <th>Method</th>
                </tr>
              </thead>
              <tbody>
                ${purchases.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(p => `
                  <tr>
                    <td>${new Date(p.created_at).toLocaleDateString()}</td>
                    <td class="hl">$${(p.amount || 0).toFixed(2)}</td>
                    <td>${(p.fuel_amount || 0).toLocaleString()} tokens</td>
                    <td class="mono" style="font-size:.68rem">${_esc(p.payment_method || 'card')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;
          return;
        }
      }
    } catch (err) {
      console.warn('[Cost] Failed to load purchase history:', err.message);
    }

    wrap.innerHTML = '<p class="text-muted" style="font-size:.82rem;padding:12px">No token purchases yet. Buy tokens to power your AI agents.</p>';
  }

  function _bindEvents() {
    document.getElementById('btn-budget')?.addEventListener('click', () => {
      document.getElementById('modal-budget')?.classList.add('open');
    });
    document.getElementById('close-budget-modal')?.addEventListener('click', () => {
      document.getElementById('modal-budget')?.classList.remove('open');
    });
    document.getElementById('modal-budget')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-budget') e.target.classList.remove('open');
    });

    document.getElementById('budget-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const limit = parseFloat(document.getElementById('b-limit').value) || 50;
      const alert = parseInt(document.getElementById('b-alert').value, 10) || 80;
      localStorage.setItem('nice-budget', JSON.stringify({ limit, alert }));
      document.getElementById('modal-budget')?.classList.remove('open');
      _loadCosts();
    });
  }

  return { title, render };
})();
