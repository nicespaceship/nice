/* ═══════════════════════════════════════════════════════════════════
   NICE — Crew Generator
   AI-powered agent generation for spaceships.
   Calls nice-ai to generate a custom crew based on spaceship context,
   then saves agents to user_agents and assigns to slots.
═══════════════════════════════════════════════════════════════════ */

const CrewGenerator = (() => {

  const VALID_TOOLS = [
    'Web Search','Email','Calendar','Spreadsheet','Database','API Call',
    'File Read','File Write','Code Exec','Slack','GitHub','Image Gen',
    'PDF Parse','Web Scrape','Shell','Memory Store'
  ];

  const VALID_ROLES = ['Research','Code','Data','Content','Ops','Sales','Support','Custom'];

  const SYSTEM_PROMPT = `You are NICE, an AI crew architect. Your job is to design a team of AI agents that will run a business autonomously.

Rules:
- Return ONLY a valid JSON array — no markdown, no explanation, no code fences.
- Each agent must have: "name" (string), "role" (one of: Research, Code, Data, Content, Ops, Sales, Support, Custom), "description" (1-2 sentences about what this agent does), "tools" (array of tool names).
- Valid tools: Web Search, Email, Calendar, Spreadsheet, Database, API Call, File Read, File Write, Code Exec, Slack, GitHub, Image Gen, PDF Parse, Web Scrape, Shell, Memory Store.
- Each agent must have a distinct responsibility — no overlap.
- Names should be professional, specific to the business, and memorable.
- Descriptions should explain what the agent automates for THIS specific business.`;

  /**
   * Generate a crew of agents for a spaceship.
   * @param {Object} spaceship - { name, category, description, tags, slotCount }
   * @returns {Promise<Object>} { agents: Array<{name, role, description, tools}>, error?: string }
   */
  async function generate(spaceship) {
    const slotCount = spaceship.slotCount || 6;
    const userPrompt = [
      'Business: ' + (spaceship.name || 'Unnamed'),
      'Category: ' + (spaceship.category || 'General'),
      'Description: ' + (spaceship.description || 'A new business'),
      spaceship.tags && spaceship.tags.length ? 'Tags: ' + spaceship.tags.join(', ') : '',
      '',
      'Generate exactly ' + slotCount + ' specialized AI agents for this business.',
    ].filter(Boolean).join('\n');

    try {
      const { data, error } = await SB.functions.invoke('nice-ai', {
        body: {
          model: 'gemini-2.5-flash',
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
          max_tokens: 2048,
          temperature: 0.7,
        },
      });

      if (error) return { agents: [], error: error.message || 'LLM call failed' };

      // Extract text from response (handles both string and array formats)
      let text = '';
      if (typeof data.content === 'string') text = data.content;
      else if (Array.isArray(data.content)) text = data.content.map(c => c.text || '').join('');
      else if (data.text) text = data.text;

      const agents = _parseAgents(text, slotCount);
      if (!agents.length) return { agents: [], error: 'Failed to parse agent response' };

      return { agents };
    } catch (e) {
      return { agents: [], error: e.message || 'Network error' };
    }
  }

  /**
   * Save generated agents to Supabase and assign to spaceship slots.
   * @param {string} spaceshipId - ID of the spaceship
   * @param {Array} agents - Array of agent configs from generate()
   * @param {Object} spaceship - Spaceship data (for State updates)
   * @returns {Promise<Object>} { savedAgents, slotAssignments, error? }
   */
  async function saveAndAssign(spaceshipId, agents, spaceship) {
    const user = State.get('user');
    if (!user) return { savedAgents: [], slotAssignments: {}, error: 'Not signed in' };

    const savedAgents = [];
    const slotAssignments = {};
    const stateAgents = State.get('agents') || [];

    for (var i = 0; i < agents.length; i++) {
      var agent = agents[i];
      try {
        var row = {
          user_id: user.id,
          name: agent.name,
          status: 'idle',
          config: {
            role: agent.role || 'Custom',
            type: 'Specialist',
            tools: agent.tools || [],
            memory: false,
            temperature: 0.7,
          },
        };

        var created = await SB.db('user_agents').create(row);
        if (!created || !created.id) continue;

        savedAgents.push(created);
        slotAssignments[String(i)] = created.id;

        // Add to State
        stateAgents.push({
          id: created.id, name: agent.name, type: 'agent',
          category: agent.role || 'Custom', rarity: 'Common',
          status: 'idle', description: agent.description || '',
          config: row.config,
          metadata: { agentType: 'Specialist' },
          created_at: created.created_at || new Date().toISOString(),
        });

        // Activate in BlueprintStore
        if (typeof BlueprintStore !== 'undefined') {
          BlueprintStore.activateAgent(created.id);
        }
      } catch (e) {
        console.warn('[CrewGenerator] Failed to save agent:', agent.name, e.message);
      }
    }

    State.set('agents', stateAgents);

    // Update spaceship slots
    if (Object.keys(slotAssignments).length) {
      try {
        var slotsData = spaceship.slots || {};
        slotsData.slot_assignments = slotAssignments;
        slotsData.stats = { crew: String(savedAgents.length), slots: String(agents.length) };
        await SB.db('user_spaceships').update(spaceshipId, { slots: slotsData });

        // Update State
        var ships = State.get('spaceships') || [];
        var ship = ships.find(function(s) { return s.id === spaceshipId; });
        if (ship) {
          ship.config = ship.config || {};
          ship.config.slot_assignments = slotAssignments;
          ship.stats = slotsData.stats;
          State.set('spaceships', ships);
        }

        // Save ship state in BlueprintStore
        if (typeof BlueprintStore !== 'undefined') {
          BlueprintStore.saveShipState(spaceshipId, {
            slot_assignments: slotAssignments,
            status: 'deployed',
            agent_ids: savedAgents.map(function(a) { return a.id; }),
          });
        }
      } catch (e) {
        console.warn('[CrewGenerator] Failed to update spaceship slots:', e.message);
      }
    }

    // XP for creating agents
    if (typeof Gamification !== 'undefined') {
      savedAgents.forEach(function() { Gamification.addXP('create_agent'); });
    }

    return { savedAgents, slotAssignments };
  }

  /** Parse LLM text response into agent array */
  function _parseAgents(text, expectedCount) {
    if (!text) return [];

    // Strip markdown code fences if present
    var cleaned = text.replace(/```json?\s*/gi, '').replace(/```\s*/g, '').trim();

    // Try direct JSON parse
    try {
      var parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return _validateAgents(parsed, expectedCount);
    } catch (e) { /* fall through */ }

    // Try extracting JSON array from text
    var match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        var extracted = JSON.parse(match[0]);
        if (Array.isArray(extracted)) return _validateAgents(extracted, expectedCount);
      } catch (e) { /* fall through */ }
    }

    return [];
  }

  /** Validate and clean agent array */
  function _validateAgents(agents, expectedCount) {
    return agents
      .filter(function(a) { return a && typeof a.name === 'string' && a.name.trim(); })
      .slice(0, expectedCount)
      .map(function(a) {
        return {
          name: a.name.trim().slice(0, 40),
          role: VALID_ROLES.includes(a.role) ? a.role : 'Custom',
          description: (a.description || '').slice(0, 200),
          tools: (a.tools || []).filter(function(t) { return VALID_TOOLS.includes(t); }),
        };
      });
  }

  return { generate, saveAndAssign };
})();
