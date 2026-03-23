/* ═══════════════════════════════════════════════════════════════════
   NICE — Prompt Builder
   Builds rich system prompts from blueprint data.
   Single source of truth for blueprint → Claude identity mapping.
   Used by AgentExecutor (ReAct mode) and ShipLog (single-shot mode).
═══════════════════════════════════════════════════════════════════ */

const PromptBuilder = (() => {

  /**
   * Build a structured system prompt from a blueprint.
   * @param {Object} blueprint - Agent blueprint with TCG card data
   * @param {Object} [opts]
   *   - crewContext: { shipName, slotLabel } when agent runs as crew
   * @returns {string} System prompt (identity + capabilities, no ReAct/tool instructions)
   */
  function build(blueprint, opts) {
    if (!blueprint) return 'You are NICE AI, a general-purpose assistant. Provide helpful, concise responses.';
    opts = opts || {};

    const parts = [];

    // ── Identity ──
    const name = blueprint.name || 'NICE AI';
    const type = _agentType(blueprint);
    const article = /^[aeiou]/i.test(type) ? 'an' : 'a';
    parts.push('You are ' + name + ', ' + article + ' ' + type + '.');

    // ── Description ──
    const desc = blueprint.description || '';
    if (desc) parts.push(desc);

    // ── Domain ──
    const category = blueprint.category || '';
    if (category) parts.push('Domain: ' + category + '.');

    // ── Capabilities ──
    const caps = _getCaps(blueprint);
    if (caps.length) {
      parts.push('Capabilities:\n' + caps.map(function(c) { return '- ' + c; }).join('\n'));
    }

    // ── Tools (informational, not execution instructions) ──
    const tools = (blueprint.config && blueprint.config.tools) || [];
    if (tools.length) {
      parts.push('Tools available: ' + tools.join(', ') + '.');
    }

    // ── Operating Parameters ──
    const statsLine = _statsLine(blueprint.stats);
    if (statsLine) parts.push(statsLine);

    // ── Classification ──
    const rarity = blueprint.rarity || '';
    if (rarity) parts.push('Classification: ' + rarity + '.');

    // ── Crew Context ──
    if (opts.crewContext) {
      var cc = opts.crewContext;
      var shipPart = cc.shipName ? ' aboard ' + cc.shipName : '';
      var slotPart = cc.slotLabel ? 'You serve as ' + cc.slotLabel + shipPart + '.' : '';
      if (slotPart) {
        parts.push(slotPart + ' Coordinate with your fellow agents through the shared Ship\'s Log.');
      }
    }

    // ── Personality (flavor text — last, so it colors tone) ──
    var flavor = blueprint.flavor || '';
    if (flavor) parts.push(flavor);

    return parts.join('\n\n');
  }

  /* ── Extract best agent type string ── */
  function _agentType(bp) {
    if (bp.metadata && bp.metadata.agentType) return bp.metadata.agentType;
    if (bp.config && bp.config.type) return bp.config.type;
    if (bp.agentType) return bp.agentType;
    var role = (bp.config && bp.config.role) || 'General';
    return role + ' Agent';
  }

  /* ── Get capabilities from metadata or top-level ── */
  function _getCaps(bp) {
    if (bp.metadata && bp.metadata.caps && bp.metadata.caps.length) return bp.metadata.caps;
    if (bp.caps && bp.caps.length) return bp.caps;
    return [];
  }

  /* ── Build one-line stats summary ── */
  function _statsLine(stats) {
    if (!stats) return '';
    var parts = [];
    if (stats.acc) parts.push('Accuracy: ' + stats.acc);
    if (stats.cap) parts.push('Capacity: ' + stats.cap);
    if (stats.spd) parts.push('Speed: ' + stats.spd);
    if (!parts.length) return '';
    return 'Operating parameters: ' + parts.join(', ') + '.';
  }

  return { build };
})();
