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
- Return ONLY a valid JSON array. No markdown, no explanation, no code fences.
- Each agent must have: "name" (string), "role" (one of: Research, Code, Data, Content, Ops, Sales, Support, Custom), "description" (1-2 sentences about what this agent does), "tools" (array of tool names), "system_prompt" (string).
- Valid tools: Web Search, Email, Calendar, Spreadsheet, Database, API Call, File Read, File Write, Code Exec, Slack, GitHub, Image Gen, PDF Parse, Web Scrape, Shell, Memory Store.
- Each agent must have a distinct responsibility, with no overlap.
- Names should be professional, specific to the business, and memorable.
- Descriptions should explain what the agent automates for THIS specific business.
- The "system_prompt" is the agent's operating instructions, written in the second person ("You are..."), 3 to 6 sentences. State who the agent is, exactly what it does for THIS business, how it works, and what it prioritizes. This prompt drives the agent at run time, so make it concrete and specific to the business, never generic.`;

  /**
   * Generate a crew of agents for a spaceship.
   * @param {Object} spaceship - { name, category, description, tags, slotCount }
   * @returns {Promise<Object>} { agents: Array<{name, role, description, tools, system_prompt}>, error?: string }
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

    // Scale the token ceiling with the crew size. Each agent now carries a full
    // system_prompt, so a 12-slot ship needs far more than the old flat 2048 or
    // the JSON array truncates mid-agent and fails to parse.
    const maxTokens = Math.min(8192, Math.max(4096, slotCount * 400));

    // Gemini Flash occasionally wraps the array in prose or truncates on the
    // first pass. One retry turns most transient parse failures into a success
    // instead of surfacing an error over an already-created ship.
    let lastErr = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { data, error } = await SB.functions.invoke('nice-ai', {
          body: {
            model: 'gemini-2.5-flash',
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userPrompt }],
            max_tokens: maxTokens,
            temperature: 0.7,
          },
        });

        if (error) { lastErr = error.message || 'LLM call failed'; continue; }

        // Extract text from response (handles both string and array formats)
        let text = '';
        if (typeof data.content === 'string') text = data.content;
        else if (Array.isArray(data.content)) text = data.content.map(c => c.text || '').join('');
        else if (data.text) text = data.text;

        const agents = _parseAgents(text, slotCount);
        if (agents.length) return { agents };
        lastErr = 'Failed to parse agent response';
      } catch (e) {
        lastErr = e.message || 'Network error';
      }
    }
    return { agents: [], error: lastErr || 'Failed to generate crew' };
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
        // Blueprints.createPrivateAgent writes the agent_blueprints row
        // first so user_agents.blueprint_id is set at creation. Before
        // this, the generated crew landed with NULL blueprint_id and the
        // edit/fork path had no template to hydrate from.
        var result = await Blueprints.createPrivateAgent({
          name: agent.name,
          role: agent.role || 'Custom',
          type: 'Specialist',
          tools: agent.tools || [],
          description: agent.description || '',
          // The model now returns a per-agent system_prompt; fall back to a
          // synthesized one so an agent is never saved as a behaviorless shell
          // (the cause of the empty crew rows from earlier auto-setup runs).
          system_prompt: agent.system_prompt || _fallbackPrompt(agent, spaceship),
          memory: false,
          temperature: 0.7,
          source: 'crew_generator',
        }, user);
        var created = (result && result.agent) || null;
        if (!created || !created.id) continue;
        var row = { config: created.config };

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

        // Activate in Blueprints
        if (typeof Blueprints !== 'undefined') {
          Blueprints.activateAgent(created.id);
        }
      } catch (e) {
        console.warn('[CrewGenerator] Failed to save agent:', agent.name, e.message);
      }
    }

    State.set('agents', stateAgents);

    // Update spaceship slots
    if (Object.keys(slotAssignments).length) {
      try {
        if (typeof ShipSlots !== 'undefined') {
          await ShipSlots.setForShip(spaceshipId, slotAssignments);
        }

        // Update State (in-memory stats; persisted config stays untouched —
        // the user_spaceships row's config was set when the ship was created).
        var stats = { crew: String(savedAgents.length), slots: String(agents.length) };
        var ships = State.get('spaceships') || [];
        var ship = ships.find(function(s) { return s.id === spaceshipId; });
        if (ship) {
          ship.config = ship.config || {};
          ship.config.slot_assignments = slotAssignments;
          ship.stats = stats;
          State.set('spaceships', ships);
        }

        // Save ship state in Blueprints
        if (typeof Blueprints !== 'undefined') {
          Blueprints.saveShipState(spaceshipId, {
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

  /**
   * Deploy a catalog blueprint ship with its full crew.
   * Creates all agents from the blueprint's crew definitions,
   * saves the ship to user_spaceships, and activates everything.
   * @param {string} blueprintId - Seed catalog ship ID (e.g. 'ship-46')
   * @returns {Promise<Object>} { shipId, agents[], error? }
   */
  async function deployFromCatalog(blueprintId) {
    var user = State.get('user');
    if (!user) return { error: 'Not signed in' };

    var bp = typeof Blueprints !== 'undefined'
      ? (Blueprints.getSpaceship(blueprintId) || Blueprints.getSpaceship('bp-' + blueprintId))
      : null;
    if (!bp) return { error: 'Blueprint not found: ' + blueprintId };

    var catalogCrew = bp.metadata?.crew || bp.crew || [];
    if (!catalogCrew.length) return { error: 'No crew defined in blueprint' };

    var slotAssignments = {};
    var savedAgents = [];
    var stateAgents = State.get('agents') || [];
    var agentCrewData = [];

    // Create all agents from catalog crew. Persist the full catalog node
    // config (system_prompt, tools, llm_engine, role_type, etc.) so the
    // activated copy starts in lockstep with the catalog, plus a synthetic
    // blueprint_id of the form "<shipBlueprintId>-crew-<i>" so the live
    // resolver can rehydrate edits to the ship's crew_overrides on read.
    //
    // NOTE: top-level user_agents.blueprint_id INTENTIONALLY stays NULL on
    // this path — these are slot characters tied to a ship's crew_overrides,
    // not standalone agents with their own agent_blueprints row. The
    // synthetic crewBpId is stored only inside config.blueprint_id (jsonb)
    // and the resolver uses it to look up the per-slot config on the parent
    // ship. Don't "fix" this by adding a blueprint_id at the column level —
    // it would either FK-error (synthetic id isn't a UUID) or invent an
    // agent_blueprints row that duplicates ship-side state. Different from
    // setup-wizard / crew-generator's saveAgents / crew-designer which DO
    // create real agent_blueprints rows via Blueprints.createPrivateAgent.
    for (var i = 0; i < catalogCrew.length; i++) {
      var c = catalogCrew[i];
      var agentName = c.label || c.name || 'Agent ' + (i + 1);
      var nodeCfg = c.config || {};
      var agentRole = nodeCfg.agentRole || 'Ops';
      var crewBpId = blueprintId + '-crew-' + i;

      try {
        var row = {
          user_id: user.id,
          name: agentName,
          rarity: c.rarity || bp.rarity || 'Common',
          status: 'idle',
          config: Object.assign(
            { type: 'Specialist', memory: false, temperature: 0.7 },
            nodeCfg,
            { role: agentRole, blueprint_id: crewBpId }
          ),
        };
        var created = await SB.db('user_agents').create(row);
        if (!created || !created.id) continue;

        savedAgents.push(created);
        slotAssignments[String(i)] = created.id;
        agentCrewData.push({ name: agentName, role: agentRole, agent_id: created.id });

        stateAgents.push({
          id: created.id, name: agentName, type: 'agent',
          category: agentRole, rarity: c.rarity || bp.rarity || 'Common',
          status: 'idle', config: row.config,
          blueprint_id: crewBpId,
          metadata: { agentType: 'Specialist' },
          created_at: created.created_at || new Date().toISOString(),
        });

        if (typeof Blueprints !== 'undefined') Blueprints.activateAgent(created.id);
      } catch (e) {
        console.warn('[CrewGenerator] Failed to create agent:', agentName, e.message);
      }
    }

    State.set('agents', stateAgents);

    // Create the spaceship in user_spaceships. Slot assignments are
    // persisted separately via ShipSlots.setForShip after the row exists.
    var totalSlots = parseInt(bp.stats?.slots || '12', 10);
    var shipRow = {
      user_id: user.id,
      name: bp.name,
      blueprint_id: blueprintId,
      status: 'active',
      config: {
        crew: agentCrewData,
        category: bp.category || '',
        description: bp.description || '',
        flavor: bp.flavor || '',
        tags: bp.tags || [],
        rarity: bp.rarity || 'Legendary',
        stats: { crew: String(savedAgents.length), slots: String(totalSlots) },
        caps: bp.metadata?.caps || bp.caps || [],
      },
    };

    try {
      var foaResult = await Blueprints.findOrCreateActiveShip(blueprintId, function() { return shipRow; });
      var shipCreated = foaResult.ship;
      if (!shipCreated || !shipCreated.id) return { error: 'Failed to create ship' };
      if (typeof ShipSlots !== 'undefined' && Object.keys(slotAssignments).length) {
        await ShipSlots.setForShip(shipCreated.id, slotAssignments);
      }

      // Add to State
      var stateShips = State.get('spaceships') || [];
      stateShips.push({
        id: shipCreated.id, name: bp.name, type: 'spaceship',
        category: bp.category, description: bp.description,
        flavor: bp.flavor, tags: bp.tags,
        rarity: bp.rarity, status: 'active',
        config: { slot_assignments: slotAssignments },
        stats: bp.stats, metadata: bp.metadata,
        blueprint_id: blueprintId,
        created_at: shipCreated.created_at,
      });
      State.set('spaceships', stateShips);

      // Activate and save ship state
      if (typeof Blueprints !== 'undefined') {
        Blueprints.activateShip(shipCreated.id);
        Blueprints.saveShipState(shipCreated.id, {
          slot_assignments: slotAssignments,
          status: 'deployed',
          agent_ids: savedAgents.map(function(a) { return a.id; }),
        });
      }

      if (typeof Gamification !== 'undefined') {
        Gamification.addXP('launch_spaceship');
        savedAgents.forEach(function() { Gamification.addXP('create_agent'); });
      }

      return { shipId: shipCreated.id, agents: savedAgents };
    } catch (e) {
      return { error: e.message || 'Failed to deploy ship' };
    }
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
          system_prompt: (a.system_prompt || a.systemPrompt || a.instructions || '').toString().slice(0, 2000),
        };
      });
  }

  /** Synthesize a minimal operating prompt when the model omits system_prompt,
      so an auto-generated agent is never saved as a behaviorless shell. */
  function _fallbackPrompt(agent, spaceship) {
    var biz = (spaceship && spaceship.name) ? spaceship.name : 'this business';
    var who = (agent && agent.name) ? agent.name : 'an agent';
    var role = (agent && agent.role) ? agent.role : 'operations';
    var what = (agent && agent.description) ? (' ' + agent.description) : '';
    return 'You are ' + who + ', the ' + role + ' specialist for ' + biz + '.' + what
      + ' Work autonomously within this responsibility, stay specific to ' + biz
      + ', and ask for input only when a real decision needs the operator.';
  }

  return { generate, saveAndAssign, deployFromCatalog };
})();
