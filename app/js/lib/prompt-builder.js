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

    // ── Output Schema (structured output contract) ──
    var outputSchema = (blueprint.config && blueprint.config.output_schema) || blueprint.output_schema;
    var schemaSection = _renderOutputSchema(outputSchema);
    if (schemaSection) parts.push(schemaSection);

    // ── Example I/O (few-shot prime) ──
    var exampleIO = (blueprint.config && blueprint.config.example_io) || blueprint.example_io;
    var exampleSection = _renderExamples(exampleIO);
    if (exampleSection) parts.push(exampleSection);

    // ── Eval Criteria (how quality is judged) ──
    var evalCriteria = (blueprint.config && blueprint.config.eval_criteria) || blueprint.eval_criteria;
    if (Array.isArray(evalCriteria) && evalCriteria.length) {
      parts.push('Quality criteria (your output will be judged against these):\n' +
        evalCriteria.map(function(c) { return '- ' + c; }).join('\n'));
    }

    // ── Structured Persona (if defined) ──
    var persona = (blueprint.config && blueprint.config.persona) || blueprint.persona;
    if (persona) {
      var personaParts = [];
      if (persona.personality) personaParts.push('Personality: ' + persona.personality);
      if (persona.expertise && persona.expertise.length) personaParts.push('Expertise: ' + persona.expertise.join(', '));
      if (persona.tone) personaParts.push('Tone: ' + persona.tone);
      if (persona.constraints && persona.constraints.length) {
        personaParts.push('Constraints:\n' + persona.constraints.map(function(c) { return '- ' + c; }).join('\n'));
      }
      if (personaParts.length) parts.push(personaParts.join('\n'));
    }

    // ── Agent Memory (learned context) ──
    if (typeof AgentMemory !== 'undefined') {
      var agentId = blueprint.id || blueprint.name;
      var memoryContext = AgentMemory.buildPromptContext(agentId);
      if (memoryContext) parts.push(memoryContext);
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

  /* ── Render an output schema into a prompt section ──
     Accepts either a JSON Schema object (with "properties") or a flat
     { field: "type" } shape that blueprint authors prefer for brevity. ── */
  function _renderOutputSchema(schema) {
    if (!schema || typeof schema !== 'object') return '';
    var lines = [];
    var props = (schema.properties && typeof schema.properties === 'object') ? schema.properties : schema;
    var keys = Object.keys(props);
    if (!keys.length) return '';
    keys.forEach(function(key) {
      var val = props[key];
      if (val && typeof val === 'object') {
        var type = val.type || 'any';
        var desc = val.description ? ' — ' + val.description : '';
        lines.push('- ' + key + ' (' + type + ')' + desc);
      } else {
        // Flat shape: { subject: "string", body: "string" }
        lines.push('- ' + key + ' (' + String(val) + ')');
      }
    });
    var header = schema.description
      ? 'Output format — ' + schema.description + ':'
      : 'Output format. Respond with a JSON object matching this shape:';
    return header + '\n' + lines.join('\n');
  }

  /* ── Render few-shot examples into a prompt section ── */
  function _renderExamples(examples) {
    if (!Array.isArray(examples) || !examples.length) return '';
    var blocks = [];
    // Cap at 3 examples to keep the prompt tight.
    examples.slice(0, 3).forEach(function(ex, i) {
      if (!ex || typeof ex !== 'object') return;
      var input = ex.input !== undefined ? ex.input : ex.in;
      var output = ex.output !== undefined ? ex.output : ex.out;
      if (input === undefined || output === undefined) return;
      var inStr = typeof input === 'string' ? input : JSON.stringify(input, null, 2);
      var outStr = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
      blocks.push('Example ' + (i + 1) + ':\nInput: ' + inStr + '\nOutput: ' + outStr);
    });
    if (!blocks.length) return '';
    return blocks.join('\n\n');
  }

  return { build };
})();
