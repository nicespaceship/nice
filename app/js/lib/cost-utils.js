/* ═══════════════════════════════════════════════════════════════════
   NICE — Cost Utilities (SSOT)
   Shared spend/usage plumbing for the Cost Tracker (cost.js) and the
   Operations analytics view (analytics.js): mission attribution, the
   fuel_usage data load, the budget read, and token formatting. Both
   views render differently but pull their data through here, so the
   numbers can't drift apart.

   Mission attribution lives here because `fuel_usage` logs carry no
   mission FK, so spend is correlated to missions by nearest timestamp.
   That logic originally landed only in cost.js, so the Operations "Cost
   by Mission" table kept an old ±24h window that matched each log against
   every same-agent mission that day — an N-mission day showed N× the real
   spend, and the two views disagreed. Both now call this helper.
═══════════════════════════════════════════════════════════════════ */

const CostUtils = (() => {
  /** Attribute each usage log to exactly ONE mission — the same-agent
      mission whose `created_at` is nearest in time. Returns a map
      `{ [missionId]: { tokens, cost } }` covering every mission passed in
      (missions with no matched log get zeros). A log whose agent has no
      mission in the set is dropped, since there is no mission to bill it to.
      @param {Array} missions - rows with { id, agent_id, created_at }
      @param {Array} logs     - fuel_usage rows with { agent_id, created_at, tokens_used, amount }
      @returns {Object<string,{tokens:number,cost:number}>} */
  function attributeLogsToMissions(missions, logs) {
    const acc = {};
    (missions || []).forEach((m) => { acc[m.id] = { tokens: 0, cost: 0 }; });
    (logs || []).forEach((l) => {
      const lt = new Date(l.created_at).getTime();
      let best = null;
      let bestDelta = Infinity;
      (missions || []).forEach((m) => {
        if (m.agent_id !== l.agent_id) return;
        const d = Math.abs(lt - new Date(m.created_at).getTime());
        if (d < bestDelta) { bestDelta = d; best = m; }
      });
      if (best) {
        acc[best.id].tokens += (l.tokens_used || 0);
        acc[best.id].cost += (l.amount || 0);
      }
    });
    return acc;
  }

  /** Read the spend budget from localStorage, falling back to the default
      ceiling/alert. Shared so both views agree on the same default. */
  function getBudget() {
    const saved = localStorage.getItem(Utils.KEYS.budget);
    if (saved) { try { return JSON.parse(saved); } catch (e) {} }
    return { limit: 50, alert: 80 };
  }

  /** Compact token count: 1.2M / 3.4k / 850. */
  function formatTokens(n) {
    if (!n) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  /** Month-to-date spend summary shared by both cost views. Filters logs to
      the current calendar month, totals spend, and derives budget
      remaining/percentage plus a naive linear month-end projection
      (average daily spend so far × days in month). Returns the budget too so
      callers don't re-read it. `now` is injectable for tests; it defaults to
      the current date. Both views render these numbers differently but must
      compute them identically — hence the SSOT. */
  function computeSpendSummary(logs, now) {
    const budget = getBudget();
    now = now || new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const monthLogs = (logs || []).filter((l) => new Date(l.created_at).getTime() >= monthStart);
    const totalSpend = monthLogs.reduce((s, l) => s + (l.amount || 0), 0);
    const remaining = Math.max(0, budget.limit - totalSpend);
    const pct = budget.limit > 0 ? Math.min(100, (totalSpend / budget.limit) * 100) : 0;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const avgDaily = dayOfMonth > 0 ? totalSpend / dayOfMonth : 0;
    const projectedMonth = avgDaily * daysInMonth;
    return { budget, monthStart, totalSpend, remaining, pct, daysInMonth, dayOfMonth, avgDaily, projectedMonth };
  }

  /** Fetch + normalize the data both cost views render. Prefers the cached
      agents/missions in State, falls back to Supabase, then maps raw
      fuel_usage rows into the cost-log shape the views expect. Writes the
      refreshed agents/missions back to State. Returns { agents, tasks,
      costLogs }; never throws — a failed fetch yields empty cost logs and
      an honest empty state rather than fabricated spend. */
  async function loadCostData(user) {
    let agents = State.get('agents') || [];
    let tasks = State.get('missions') || [];
    let costLogs = [];
    try {
      const [a, t, logs] = await Promise.all([
        agents.length ? agents : SB.db('user_agents').list({ userId: user.id }).catch(() => []),
        tasks.length ? tasks : SB.db('mission_runs').list({ userId: user.id }).catch(() => []),
        SB.db('fuel_usage').list({ userId: user.id, orderBy: 'created_at' }).catch(() => []),
      ]);
      agents = Array.isArray(a) ? a : agents;
      tasks = Array.isArray(t) ? t : tasks;
      costLogs = Array.isArray(logs) ? logs : [];
      State.set('agents', agents);
      State.set('missions', tasks);
    } catch (e) {}

    costLogs = costLogs.map((u) => ({
      id:          u.id,
      agent_id:    u.agent_id,
      model:       u.model || 'unknown',
      tokens_used: (u.input_tokens || 0) + (u.output_tokens || 0),
      amount:      parseFloat(u.fuel_cost) || 0,
      created_at:  u.created_at,
    }));

    return { agents, tasks, costLogs };
  }

  return { attributeLogsToMissions, getBudget, formatTokens, computeSpendSummary, loadCostData };
})();

// Expose for tests / Node consumers
if (typeof module !== 'undefined' && module.exports) module.exports = CostUtils;
