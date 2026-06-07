/* ═══════════════════════════════════════════════════════════════════
   NICE — Cost Utilities (SSOT)
   Shared spend/usage attribution for the Cost Tracker (cost.js) and the
   Operations analytics view (analytics.js). `fuel_usage` logs carry no
   mission FK, so spend is correlated to missions by nearest timestamp.

   Keeping this in ONE place is the fix for a real divergence: the
   nearest-by-time attribution originally landed only in cost.js, so the
   Operations "Cost by Mission" table kept an old ±24h window that matched
   each log against every same-agent mission that day — an N-mission day
   showed N× the real spend, and the two views disagreed. Both now call
   this helper, so they can't drift again.
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

  return { attributeLogsToMissions };
})();

// Expose for tests / Node consumers
if (typeof module !== 'undefined' && module.exports) module.exports = CostUtils;
