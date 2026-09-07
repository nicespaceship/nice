/* ═══════════════════════════════════════════════════════════════════
   NICE — Analytics View
   Operations intel: missions, agent performance, cost tracking,
   commander progress. Consolidates the former Cost Tracker tab.
═══════════════════════════════════════════════════════════════════ */

const AnalyticsView = (() => {
  const title = 'Operations';
  const _esc = Utils.esc;
  const _timeAgo = Utils.timeAgo;


  let _el = null;

  // Range select + Export Report for the shared #bridge-subnav. Events bind in
  // _bindEvents() via global ids, so living outside the view body works.
  function getToolbarActions() {
    // Range picker + inline KPI chips + pill-style export, all locked to
    // the universal 26px Bridge subnav height. The chips start with em-dash
    // placeholders; _updateMissionStats fills them once data loads.
    const rangeSelect = CSelect.html('ana-range', 'Date range', [
      { value: '7',  label: 'Last 7 Days' },
      { value: '30', label: 'Last 30 Days' },
      { value: '90', label: 'Last 90 Days' },
    ], '7');
    return `
      ${rangeSelect}
      <span class="ana-kpi"><span class="ana-kpi-label">Total</span><span class="ana-kpi-val" id="ana-kpi-total">—</span></span>
      <span class="ana-kpi"><span class="ana-kpi-label">Success</span><span class="ana-kpi-val ana-kpi-val--hl" id="ana-kpi-success">—</span></span>
      <span class="ana-kpi"><span class="ana-kpi-label">Avg</span><span class="ana-kpi-val" id="ana-kpi-avg">—</span></span>
      <span class="ana-kpi"><span class="ana-kpi-label">Running</span><span class="ana-kpi-val" id="ana-kpi-running">—</span></span>
      <button class="btn btn-primary btn-sm" id="ana-export-pdf">Export report</button>`;
  }

  function render(el) {
    _el = el;
    const user = State.get('user');
    if (!user) return _authPrompt(el, 'operations');

    el.innerHTML = `
      <div class="ana-wrap">
        <!-- Range picker, KPI chips (Total / Success / Avg / Running), and
             Export Report all render in the shared #bridge-subnav (see
             getToolbarActions). The Mission Operations section therefore
             opens directly to the charts — no redundant title + KPI grid. -->
        <!-- ═══ 1. Mission Operations ═══ -->
        <div class="ana-section">
          <div class="ana-charts">
            <div class="ana-chart-panel">
              <h3 class="ana-chart-title">Missions Per Day</h3>
              <div class="ana-chart-box">
                <canvas id="chart-tasks" width="500" height="200"></canvas>
              </div>
            </div>
            <div class="ana-chart-panel">
              <h3 class="ana-chart-title">Status Distribution</h3>
              <div class="ana-chart-box ana-chart-donut-box">
                <canvas id="chart-status" width="200" height="200"></canvas>
                <div class="ana-donut-legend" id="donut-legend"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ 2. Agent Performance ═══ -->
        <div class="ana-section">
          <h3 class="ana-section-title">Agent Performance</h3>
          <div class="ana-table-wrap" id="ana-agent-table"></div>
        </div>

        <!-- ═══ 3. Cost Tracking ═══ -->
        <div class="ana-section">
          <div class="ana-section-header">
            <h3 class="ana-section-title">Cost &amp; Tokens</h3>
            <button class="btn btn-sm" id="btn-budget">Budget Settings</button>
          </div>
          <div class="ana-stats" id="ana-cost-overview"></div>
          <div class="ana-chart-panel">
            <h3 class="ana-chart-title">Daily Spend (14 days)</h3>
            <div class="ana-chart-box">
              <canvas id="chart-cost" width="600" height="180"></canvas>
            </div>
          </div>
          <div class="ana-table-wrap" id="ana-cost-agents"></div>
          <div class="ana-table-wrap" id="ana-cost-missions"></div>
          <div id="ana-cost-log"></div>
          <div class="ana-table-wrap" id="ana-purchases"></div>
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

    _bindEvents();
    _loadAll();
  }

  function _bindEvents() {
    // Range selector is the custom .bp-cselect (CSS-styleable, unlike native
    // <select> which the OS draws at system font size and clips at our height).
    CSelect.mount('ana-range', _loadMissions);
    document.getElementById('ana-export-pdf')?.addEventListener('click', _exportReport);

    // Budget modal
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
      localStorage.setItem(Utils.KEYS.budget, JSON.stringify({ limit, alert }));
      document.getElementById('modal-budget')?.classList.remove('open');
      _loadCosts();
    });
  }

  /* ════════════════════════════════════════════════════════════════
     Data Loading
  ════════════════════════════════════════════════════════════════ */

  function _loadAll() {
    _loadMissions();
    _loadCosts();
  }

  /* ════════════════════════════════════════════════════════════════
     1. Mission Operations
  ════════════════════════════════════════════════════════════════ */

  function _loadMissions() {
    // .bp-cselect stores its current value in data-value (not .value, since
    // it's a styled <div>, not a native <select>).
    const range = parseInt(document.getElementById('ana-range')?.dataset.value || '7', 10);
    const agents = State.get('agents') || [];
    const tasks = State.get('missions') || [];

    const cutoff = Date.now() - (range * 86400000);
    const filtered = tasks.filter(t => new Date(t.created_at).getTime() >= cutoff);

    _updateMissionStats(filtered, agents);
    requestAnimationFrame(() => {
      _drawBarChart(filtered, range);
      _drawDonutChart(filtered);
    });
    _renderAgentTable(agents, filtered);
  }

  function _updateMissionStats(tasks) {
    // Patches the inline KPI chips that getToolbarActions emitted into the
    // shared #bridge-subnav. Bail if the subnav hasn't rendered (e.g. an
    // auth-gated render of an empty view).
    const totalEl   = document.getElementById('ana-kpi-total');
    const successEl = document.getElementById('ana-kpi-success');
    const avgEl     = document.getElementById('ana-kpi-avg');
    const runningEl = document.getElementById('ana-kpi-running');
    if (!totalEl) return;

    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const failed = tasks.filter(t => t.status === 'failed').length;
    const running = tasks.filter(t => t.status === 'running').length;
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    const completedTasks = tasks.filter(t => t.status === 'completed' && t.created_at);
    let avgTime = '\u2014';
    if (completedTasks.length > 0) {
      const durations = completedTasks.map(t => {
        const end = (t.metadata && t.metadata.completed_at) ? new Date(t.metadata.completed_at).getTime() : (t.updated_at ? new Date(t.updated_at).getTime() : 0);
        const start = new Date(t.created_at).getTime();
        return end > start ? end - start : 0;
      }).filter(d => d > 0);
      if (durations.length) {
        const avgMs = durations.reduce((a, b) => a + b, 0) / durations.length;
        if (avgMs < 60000) avgTime = Math.round(avgMs / 1000) + 's';
        else if (avgMs < 3600000) avgTime = (avgMs / 60000).toFixed(1) + 'm';
        else avgTime = (avgMs / 3600000).toFixed(1) + 'h';
      }
    }

    totalEl.textContent = total;
    successEl.textContent = successRate + '%';
    avgEl.textContent = avgTime;
    // Running gets a "\u00b7 N failed" tail when there are failures so the failure
    // count doesn't lose its own slot. Kept tight; the chip stays one line.
    if (failed > 0) {
      runningEl.innerHTML = `${running} <span class="ana-kpi-fail">\u00b7 ${failed} failed</span>`;
    } else {
      runningEl.textContent = running;
    }
    runningEl.classList.toggle('ana-kpi-val--bad', failed > 0);
  }

  /* ════════════════════════════════════════════════════════════════
     Charts
  ════════════════════════════════════════════════════════════════ */

  function _drawBarChart(tasks, range) {
    const canvas = document.getElementById('chart-tasks');
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

    const days = Math.min(range, 14);
    const buckets = Array(days).fill(0);
    const labels = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      labels.push(_shortDate(d));
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const dayEnd = dayStart + 86400000;
      buckets[days - 1 - i] = tasks.filter(t => {
        const ts = new Date(t.created_at).getTime();
        return ts >= dayStart && ts < dayEnd;
      }).length;
    }

    const max = Math.max(...buckets, 1);
    const pad = { top: 10, right: 10, bottom: 30, left: 36 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;
    const barW = Math.max(4, (chartW / days) - 4);

    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue('--accent').trim() || '#6366f1';
    const border = styles.getPropertyValue('--border').trim() || '#333';
    const textDim = styles.getPropertyValue('--text-dim').trim() || '#666';

    ctx.clearRect(0, 0, W, H);

    ctx.strokeStyle = border;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
    }

    ctx.fillStyle = textDim;
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = Math.round(max * (4 - i) / 4);
      const y = pad.top + (chartH / 4) * i;
      ctx.fillText(val, pad.left - 6, y + 3);
    }

    ctx.fillStyle = accent;
    for (let i = 0; i < days; i++) {
      const x = pad.left + (chartW / days) * i + ((chartW / days) - barW) / 2;
      const barH = (buckets[i] / max) * chartH;
      const y = pad.top + chartH - barH;
      _roundRect(ctx, x, y, barW, barH, 2);
      ctx.fill();
    }

    ctx.fillStyle = textDim;
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    const step = days > 7 ? 2 : 1;
    for (let i = 0; i < days; i += step) {
      const x = pad.left + (chartW / days) * i + (chartW / days) / 2;
      ctx.fillText(labels[i], x, H - 8);
    }
  }

  function _drawDonutChart(tasks) {
    const canvas = document.getElementById('chart-status');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    canvas.width = 200 * dpr;
    canvas.height = 200 * dpr;
    canvas.style.width = '200px';
    canvas.style.height = '200px';
    ctx.scale(dpr, dpr);

    const cx = 100, cy = 100, r = 70, lineWidth = 18;
    const slices = [
      { label: 'Completed', count: tasks.filter(t => t.status === 'completed').length, color: '#22c55e' },
      { label: 'Running',   count: tasks.filter(t => t.status === 'running').length,   color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6366f1' },
      { label: 'Queued',    count: tasks.filter(t => t.status === 'queued').length,    color: '#f59e0b' },
      { label: 'Failed',    count: tasks.filter(t => t.status === 'failed').length,    color: '#ef4444' },
    ];

    const total = slices.reduce((s, sl) => s + sl.count, 0) || 1;
    let startAngle = -Math.PI / 2;

    ctx.clearRect(0, 0, 200, 200);

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#333';
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    slices.forEach(sl => {
      if (sl.count === 0) return;
      const angle = (sl.count / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, startAngle + angle);
      ctx.strokeStyle = sl.color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'butt';
      ctx.stroke();
      startAngle += angle;
    });

    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#fff';
    ctx.fillStyle = textColor;
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(total === 1 && tasks.length === 0 ? '0' : tasks.length, cx, cy - 8);
    const dimColor = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#888';
    ctx.fillStyle = dimColor;
    ctx.font = '9px monospace';
    ctx.fillText('Missions', cx, cy + 12);

    const legend = document.getElementById('donut-legend');
    if (legend) {
      legend.innerHTML = slices.map(sl => `
        <div class="ana-legend-item">
          <span class="ana-legend-dot" style="background:${sl.color}"></span>
          <span class="ana-legend-label">${sl.label}</span>
          <span class="ana-legend-val">${sl.count}</span>
        </div>
      `).join('');
    }
  }

  /* ════════════════════════════════════════════════════════════════
     2. Agent Performance Table
  ════════════════════════════════════════════════════════════════ */

  function _renderAgentTable(agents, tasks) {
    const wrap = document.getElementById('ana-agent-table');
    if (!wrap) return;

    if (!agents.length) {
      wrap.innerHTML = '<p class="text-muted" style="font-size:.82rem;padding:12px">No agents added yet. Visit the <a href="#/bridge">Blueprint Catalog</a> to get started.</p>';
      return;
    }

    const rows = agents.map(a => {
      const agentTasks = tasks.filter(t => t.agent_id === a.id);
      const total = agentTasks.length;
      const completed = agentTasks.filter(t => t.status === 'completed').length;
      const failed = agentTasks.filter(t => t.status === 'failed').length;
      const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
      return { agent: a, total, completed, failed, rate };
    }).sort((a, b) => b.total - a.total).slice(0, 20);

    wrap.innerHTML = `
      <table class="ana-table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Status</th>
            <th>Missions</th>
            <th>Completed</th>
            <th>Failed</th>
            <th>Success</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>
                <a href="#/bridge/agents/${r.agent.id}" class="ana-agent-link">${_esc(r.agent.name)}</a>
              </td>
              <td><span class="status-dot ${r.agent.status === 'active' ? 'dot-g' : r.agent.status === 'error' ? 'dot-r' : 'dot-a'}"></span> ${r.agent.status || 'idle'}</td>
              <td>${r.total}</td>
              <td>${r.completed}</td>
              <td>${r.failed > 0 ? '<span style="color:#ef4444">' + r.failed + '</span>' : r.failed}</td>
              <td>
                <span class="ana-rate ${r.rate >= 80 ? 'rate-good' : r.rate >= 50 ? 'rate-ok' : r.total === 0 ? '' : 'rate-bad'}">${r.total > 0 ? r.rate + '%' : '\u2014'}</span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  /* ════════════════════════════════════════════════════════════════
     3. Cost Tracking (merged from CostView)
  ════════════════════════════════════════════════════════════════ */

  async function _loadCosts() {
    // Fetch + normalize is shared with cost.js via CostUtils; this view owns
    // only its render dispatch, budget form, and purchase history.
    const { agents, tasks, costLogs } = await CostUtils.loadCostData(State.get('user'));

    const budget = CostUtils.getBudget();
    const bLimit = document.getElementById('b-limit');
    const bAlert = document.getElementById('b-alert');
    if (bLimit) bLimit.value = budget.limit;
    if (bAlert) bAlert.value = budget.alert;

    _renderCostOverview(costLogs);
    requestAnimationFrame(() => _drawCostChart(costLogs));
    _renderCostAgents(agents, costLogs);
    _renderCostMissions(agents, tasks, costLogs);
    _renderCostLog(costLogs, agents);
    _loadPurchaseHistory();
  }

  function _renderCostOverview(logs) {
    const el = document.getElementById('ana-cost-overview');
    if (!el) return;

    const { budget, totalSpend, remaining, pct, avgDaily, projectedMonth } = CostUtils.computeSpendSummary(logs);
    const overBudget = projectedMonth > budget.limit;
    const barClass = pct >= 90 ? ' bar-danger' : pct >= 70 ? ' bar-warn' : '';

    // Token forecast — real Standard-pool balance (TokenConfig SSOT). The old
    // code read State.get('tokens'), a key nothing ever writes (the balance
    // lives under State.token_balance.pools), so this always showed —/∞.
    // Free-tier users have no pool and run unlimited Gemini Flash, so their
    // runway is genuinely ∞.
    const pools = (State.get('token_balance') || {}).pools || {};
    // Runway from the REAL per-message pool-token debit (TokenConfig weights
    // over actual fuel_usage logs), not a flat per-mission guess. SSOT in
    // CostUtils so it's unit-tested and stays consistent with the cost math.
    const { balance: tokenBalance, daysLeft, warning: tokenWarning } = CostUtils.computeRunway(logs, pools, { pool: 'standard' });

    el.innerHTML = `
      <div class="ana-stat-card">
        <span class="ana-stat-num hl">${CostUtils.formatCost(totalSpend)}</span>
        <span class="ana-stat-label">Monthly Spend</span>
      </div>
      <div class="ana-stat-card">
        <span class="ana-stat-num">${CostUtils.formatCost(remaining)}</span>
        <span class="ana-stat-label">Budget Remaining</span>
        <div class="cost-budget-bar" style="margin-top:6px">
          <div class="cost-budget-fill${barClass}" style="width:${pct}%"></div>
        </div>
      </div>
      <div class="ana-stat-card">
        <span class="ana-stat-num${overBudget ? ' rate-bad' : ''}">${CostUtils.formatCost(avgDaily)}</span>
        <span class="ana-stat-label">Avg / Day</span>
      </div>
      <div class="ana-stat-card">
        <span class="ana-stat-num">${tokenBalance || '\u2014'}</span>
        <span class="ana-stat-label">Tokens</span>
      </div>
      <div class="ana-stat-card">
        <span class="ana-stat-num ${tokenWarning ? 'token-warning' : ''}">${daysLeft === Infinity ? '\u221E' : (daysLeft == null ? '\u2014' : daysLeft + 'd')}</span>
        <span class="ana-stat-label">Token Runway</span>
      </div>
    `;
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

    const days = 14;
    const buckets = Array(days).fill(0);
    const labels = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      labels.push(_shortDate(d));
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const dayEnd = dayStart + 86400000;
      buckets[days - 1 - i] = logs
        .filter(l => { const ts = new Date(l.created_at).getTime(); return ts >= dayStart && ts < dayEnd; })
        .reduce((s, l) => s + (l.amount || 0), 0);
    }

    const max = Math.max(...buckets, 0.01);
    // Axis ticks: enough decimals that the four steps stay distinct for
    // sub-dollar COGS — a flat 2-decimal axis collapses to "$0.01, $0.01,
    // $0.00, $0.00". Wider left pad fits the longer small-value labels.
    const tickDecimals = max >= 1 ? 2 : max >= 0.1 ? 3 : 4;
    const pad = { top: 10, right: 10, bottom: 30, left: 48 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;

    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue('--accent').trim() || '#6366f1';
    const border = styles.getPropertyValue('--border').trim() || '#333';
    const textDim = styles.getPropertyValue('--text-dim').trim() || '#666';

    ctx.clearRect(0, 0, W, H);

    ctx.strokeStyle = border;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    }

    ctx.fillStyle = textDim;
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = (max * (4 - i) / 4).toFixed(tickDecimals);
      ctx.fillText('$' + val, pad.left - 6, pad.top + (chartH / 4) * i + 3);
    }

    const points = buckets.map((v, i) => ({
      x: pad.left + (chartW / (days - 1)) * i,
      y: pad.top + chartH - (v / max) * chartH,
    }));

    ctx.beginPath();
    ctx.moveTo(points[0].x, pad.top + chartH);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, pad.top + chartH);
    ctx.closePath();
    ctx.fillStyle = accent + '18';
    ctx.fill();

    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();

    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
    });

    ctx.fillStyle = textDim;
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i < days; i += 2) {
      ctx.fillText(labels[i], points[i].x, H - 8);
    }
  }

  function _renderCostAgents(agents, logs) {
    const wrap = document.getElementById('ana-cost-agents');
    if (!wrap) return;

    if (!agents.length) {
      wrap.innerHTML = '<p class="text-muted" style="font-size:.82rem;padding:12px">No agents yet.</p>';
      return;
    }

    const rows = agents.map(a => {
      const agentLogs = logs.filter(l => l.agent_id === a.id);
      const total = agentLogs.reduce((s, l) => s + (l.amount || 0), 0);
      const tokens = agentLogs.reduce((s, l) => s + (l.tokens_used || 0), 0);
      const model = a.llm_engine || 'claude-4-6-sonnet';
      return { agent: a, total, tokens, model, count: agentLogs.length };
    }).sort((a, b) => b.total - a.total);

    wrap.innerHTML = `
      <h4 class="ana-sub-title">Cost by Agent</h4>
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
              <td>${CostUtils.formatTokens(r.tokens)}</td>
              <td class="hl">${CostUtils.formatCost(r.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function _renderCostMissions(agents, tasks, logs) {
    const wrap = document.getElementById('ana-cost-missions');
    if (!wrap) return;
    if (!tasks.length) {
      wrap.innerHTML = '';
      return;
    }

    const agentMap = {};
    agents.forEach(a => { agentMap[a.id] = a; });

    // Attribute each cost log to exactly ONE mission — nearest same-agent
    // mission by time — via the shared SSOT (CostUtils), the same helper the
    // Cost Tracker uses. The old ±24h window matched a log against every
    // same-agent mission that day, so a multi-mission day showed N× the real
    // spend here and disagreed with the Cost Tracker.
    const missions = tasks.filter(t => t.status === 'completed' || t.status === 'running');
    const acc = CostUtils.attributeLogsToMissions(missions, logs);
    const rows = missions
      .map(m => {
        const agent = agentMap[m.agent_id];
        return { title: m.title, agentName: agent ? agent.name : 'Unassigned', tokens: acc[m.id].tokens, cost: acc[m.id].cost };
      })
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);

    if (!rows.length) { wrap.innerHTML = ''; return; }

    wrap.innerHTML = `
      <h4 class="ana-sub-title">Cost by Mission</h4>
      <table class="ana-table">
        <thead>
          <tr><th>Mission</th><th>Agent</th><th>Tokens</th><th>Cost</th></tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${_esc(r.title)}</td>
              <td>${_esc(r.agentName)}</td>
              <td>${CostUtils.formatTokens(r.tokens)}</td>
              <td class="hl">${CostUtils.formatCost(r.cost)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function _renderCostLog(logs, agents) {
    const wrap = document.getElementById('ana-cost-log');
    if (!wrap) return;

    const agentMap = {};
    agents.forEach(a => { agentMap[a.id] = a; });

    const recent = logs.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10);

    if (!recent.length) {
      wrap.innerHTML = '<p class="text-muted" style="font-size:.82rem;padding:12px">No cost data yet. Complete a mission to see costs.</p>';
      return;
    }

    wrap.innerHTML = `
      <h4 class="ana-sub-title">Recent Transactions</h4>
      <div class="cost-log">
        ${recent.map(l => {
          const agent = agentMap[l.agent_id];
          return `
            <div class="cost-log-row">
              <span class="cost-log-agent">${_esc(agent?.name || 'Unknown')}</span>
              <span class="cost-log-model mono">${_esc(l.model)}</span>
              <span class="cost-log-tokens">${CostUtils.formatTokens(l.tokens_used)} tokens</span>
              <span class="cost-log-amount">${CostUtils.formatCost(l.amount)}</span>
              <span class="cost-log-time">${_timeAgo(l.created_at)}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  async function _loadPurchaseHistory() {
    const wrap = document.getElementById('ana-purchases');
    if (!wrap) return;

    const user = State.get('user');
    if (!user) return;

    try {
      if (typeof SB !== 'undefined' && SB.isReady()) {
        // Token-credit ledger: top-ups, subscription grants, refunds. Per-call
        // debits live in fuel_usage (the spend tables above), not here.
        const { data, error } = await SB.client
          .from('token_transactions')
          .select('type, pool, amount, created_at')
          .in('type', ['topup', 'subscription_grant', 'refund'])
          .order('created_at', { ascending: false })
          .limit(50);
        if (!error && Array.isArray(data) && data.length) {
          const typeLabel = { topup: 'Top-up', subscription_grant: 'Subscription grant', refund: 'Refund' };
          const poolLabel = { standard: 'Standard', claude: 'Claude', premium: 'Premium' };
          wrap.innerHTML = `
            <h4 class="ana-sub-title">Purchase History</h4>
            <table class="ana-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Tokens</th>
                  <th>Pool</th>
                </tr>
              </thead>
              <tbody>
                ${data.map(tx => `
                  <tr>
                    <td>${new Date(tx.created_at).toLocaleDateString()}</td>
                    <td>${typeLabel[tx.type] || _esc(tx.type)}</td>
                    <td class="hl">${(tx.amount || 0).toLocaleString()}</td>
                    <td>${poolLabel[tx.pool] || _esc(tx.pool || '—')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `;
          return;
        }
      }
    } catch (err) {
      console.warn('[Analytics] Failed to load purchase history:', err.message);
    }

    wrap.innerHTML = '';
  }

  /* ════════════════════════════════════════════════════════════════
     Utilities
  ════════════════════════════════════════════════════════════════ */

  function _shortDate(d) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return m[d.getMonth()] + ' ' + d.getDate();
  }

  function _roundRect(ctx, x, y, w, h, r) {
    if (h < 1) return;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }


  /* ════════════════════════════════════════════════════════════════
     Export Report
  ════════════════════════════════════════════════════════════════ */

  function _exportReport() {
    const tasks = State.get('missions') || [];
    const agents = State.get('agents') || [];
    const spaceships = State.get('spaceships') || [];
    const completed = tasks.filter(t => t.status === 'completed').length;
    const failed = tasks.filter(t => t.status === 'failed').length;
    const total = tasks.length;
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    let report = 'NICE Operations Report\n';
    report += '============================\n';
    report += 'Generated: ' + new Date().toLocaleString() + '\n\n';
    report += 'Overview\n--------\n';
    report += 'Total Agents: ' + agents.length + '\n';
    report += 'Active: ' + agents.filter(a => a.status === 'active').length + '\n';
    report += 'Spaceships: ' + spaceships.length + '\n';
    report += 'Deployed: ' + spaceships.filter(s => s.status === 'deployed').length + '\n\n';
    report += 'Missions\n--------\n';
    report += 'Total: ' + total + '\n';
    report += 'Completed: ' + completed + '\n';
    report += 'Failed: ' + failed + '\n';
    report += 'Success Rate: ' + successRate + '%\n\n';
    report += 'Per-Agent Breakdown\n-------------------\n';
    agents.forEach(a => {
      const at = tasks.filter(t => t.agent_id === a.id);
      const ac = at.filter(t => t.status === 'completed').length;
      if (at.length > 0) report += a.name + ': ' + at.length + ' missions, ' + ac + ' completed\n';
    });

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nice-operations-report.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  return { title, render, getToolbarActions, _renderCostOverview };
})();
