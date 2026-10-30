/* ═══════════════════════════════════════════════════════════════════
   NICE — Blueprint Utils
   Single source of truth for deriving crew, slots, and class data
   from any blueprint object. Every module calls these instead of
   implementing its own fallback chains.
═══════════════════════════════════════════════════════════════════ */

const BlueprintUtils = (() => {

  /** Rarity color map — single source of truth for all card/badge/slot coloring */
  const RARITY_COLORS = {
    Common: '#94a3b8', Rare: '#b6dff9', Epic: '#a855f7',
    Legendary: '#f59e0b', Mythic: '#ff2d55',
  };

  /** Category/role color map — single source of truth for card art and badges */
  const CATEGORY_COLORS = {
    Research:'#6366f1', Analytics:'#f59e0b', Content:'#ec4899', Engineering:'#06b6d4',
    Ops:'#22c55e', Sales:'#f97316', Support:'#8b5cf6', Legal:'#64748b',
    Marketing:'#e11d48', Automation:'#14b8a6', Hospitality:'#06b6d4', Professional:'#64748b',
    Retail:'#f97316', Code:'#06b6d4', Data:'#f59e0b', Custom:'#8b5cf6',
  };

  /** Status colors for missions */
  const STATUS_COLORS = { queued:'#f59e0b', running:'#6366f1', completed:'#22c55e', failed:'#ef4444' };

  /**
   * Get the color for a rarity level.
   * @param {string} rarity
   * @returns {string} hex color
   */
  function getRarityColor(rarity) {
    const r = (rarity || 'Common');
    const key = r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
    return RARITY_COLORS[key] || RARITY_COLORS.Common;
  }

  /**
   * Pick a readable text color for a solid background via WCAG relative
   * luminance. White stays unless its contrast on the fill drops below 3:1
   * (the large/bold-text floor), where near-black is returned instead. Keeps
   * every rarity/category hue while fixing pale fills (Rare #b6dff9,
   * Legendary #f59e0b) where white text reads too soft.
   * @param {string} bgHex - solid background as #rrggbb
   * @returns {string} '#fff' or '#0a0a0a'
   */
  function contrastText(bgHex) {
    if (typeof bgHex !== 'string' || bgHex[0] !== '#' || bgHex.length < 7) return '#fff';
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * lin(parseInt(bgHex.slice(1, 3), 16))
            + 0.7152 * lin(parseInt(bgHex.slice(3, 5), 16))
            + 0.0722 * lin(parseInt(bgHex.slice(5, 7), 16));
    return (1.05 / (L + 0.05)) >= 3 ? '#fff' : '#0a0a0a';
  }

  /**
   * Get the crew definition array from a blueprint.
   * Priority: metadata.crew → crew → nodes → []
   * @param {object} bp - blueprint or ship object
   * @returns {Array} crew member definitions
   */
  function getCrewDefs(bp) {
    if (!bp) return [];
    return bp.metadata?.crew || bp.crew || bp.nodes || [];
  }

  /**
   * Get the max slot count for a blueprint.
   * Priority: stats.slots → stats.crew → metadata.crew.length → crew/nodes.length → config.crew_size → fallback
   * This is the number the card displays and the wizard uses.
   * @param {object} bp - blueprint or ship object
   * @param {number} [fallback=6] - default if nothing found
   * @returns {number}
   */
  function getSlotCount(bp, fallback) {
    if (!bp) return fallback || 6;
    const fromStats = parseInt(bp.stats?.slots, 10) || parseInt(bp.stats?.crew, 10) || 0;
    if (fromStats > 0) return fromStats;
    const crewDefs = getCrewDefs(bp);
    if (crewDefs.length > 0) return crewDefs.length;
    const fromConfig = parseInt(bp.config?.crew_size, 10) || 0;
    if (fromConfig > 0) return fromConfig;
    return fallback || 6;
  }

  /**
   * Get filled agent count from a ship state or blueprint.
   * @param {object} bp - blueprint, ship instance, or state
   * @returns {number}
   */
  function getFilledCount(bp) {
    if (!bp) return 0;
    const ids = bp.agent_ids || [];
    if (ids.length > 0) return ids.length;
    const members = bp._members || [];
    if (members.length > 0) return members.length;
    return parseInt(bp.stats?.crew, 10) || 0;
  }

  /**
   * Build a slot template array (used by wizard, schematic, dock).
   * Each slot has { id, label, maxRarity }.
   * Labels come from crew defs when available.
   * @param {object} bp - blueprint
   * @returns {{ id: string, name: string, slots: Array }}
   */
  function getSlotTemplate(bp) {
    const count = getSlotCount(bp);
    const crewDefs = getCrewDefs(bp);
    return {
      id: 'dynamic',
      name: bp?.name || 'Ship',
      slots: Array.from({ length: count }, function(_, i) {
        const member = crewDefs[i];
        return {
          id: i,
          maxRarity: member?.rarity || 'Legendary',
          label: member?.label || member?.name || ('Agent ' + (i + 1)),
          role: member?.role || member?.role_type || null,
          title: member?.title || null,
          min_class: member?.min_class || 'class-1',
        };
      }),
    };
  }

  /**
   * Normalize a class_id from any source (handles both snake_case and camelCase).
   * @param {object} bp - blueprint
   * @returns {string}
   */
  function getClassId(bp) {
    if (!bp) return 'class-1';
    return bp.class_id || bp.classId || 'class-1';
  }

  /* ── Computed agent rarity ──
     Agents without a stored rarity get one scored from their config.
     MODEL_TIERS keys mirror MODEL_CATALOG ids; calcAgentRarity
     canonicalizes llm_engine via LLMConfig first, so legacy aliases like
     'claude-4' resolve to 'claude-4-6-sonnet' (tier 4). Stale ids
     ('gpt-4o', 'claude-3.5') miss the table and score as tier 1.
     `nice-auto` is a sentinel LLMConfig does not canonicalize away, so it
     gets its own mid tier. */
  const MODEL_TIERS = {
    'claude-4-7-opus':   4, 'claude-4-6-sonnet': 4, 'gpt-5-4-pro': 4, 'openai-o3': 4,
    'gemini-2-5-pro':    3, 'grok-4-3': 3, 'kimi-k2-6': 3,
    'gpt-5-mini':        2, 'gpt-oss-120b': 2, 'deepseek-v4-flash': 2, 'nemotron-3-super': 2,
    'gemini-2-5-flash':  1,
    'nice-auto':         3,
  };

  const TYPE_SCORES = {
    // Broad / general-purpose agents
    General: 3, Generalist: 3, 'Intelligence Agent': 3, 'Knowledge Agent': 3,
    'Analytics Agent': 3, 'BI Agent': 3, 'Data Science Agent': 3, 'Architecture Agent': 3,
    // Hybrid / multi-capability agents
    Hybrid: 2, 'Operations Agent': 2, 'DevOps Agent': 2, 'Data Engineer': 2,
    'Brand Agent': 2, 'CRM Agent': 2, 'Content Agent': 2,
    // Specialist agents
    Specialist: 1, 'Automation Agent': 1, 'Social Agent': 1, 'Copywriter': 1,
    'Refund Agent': 1, 'CS Agent': 1, 'Lead Agent': 1, 'Outbound Agent': 1,
    'Scheduler': 1, 'Proposal Agent': 1, 'QA Agent': 1, 'Docs Agent': 1,
    'Expense Agent': 1, 'Pricing Agent': 1,
  };

  /* Score floors, highest first. The max reachable score is 13, so a
     computed rarity never lands on Mythic; Mythic only comes from a
     stored rarity. */
  const RARITY_THRESHOLDS = [
    { name: 'Mythic',    min: 14 },
    { name: 'Legendary', min: 10 },
    { name: 'Epic',      min: 7 },
    { name: 'Rare',      min: 4 },
    { name: 'Common',    min: 0 },
  ];

  /**
   * Score an agent's rarity from its tools, model tier, type, memory and
   * temperature tuning.
   * @param {object} agent
   * @returns {{ name: string, color: string, score: number }}
   */
  function calcAgentRarity(agent) {
    if (!agent) return { name: 'Common', color: RARITY_COLORS.Common, score: 0 };
    const config = agent.config || {};
    let score = 0;

    // Tool count (0-4 pts)
    const toolCount = (config.tools || []).length;
    score += toolCount === 0 ? 0 : Math.min(4, Math.ceil(toolCount / 2));

    // Model tier (1-4 pts)
    const rawLlm = agent.llm_engine || config.llm_engine || '';
    const llm = (typeof LLMConfig !== 'undefined' && LLMConfig.canonicalize)
      ? LLMConfig.canonicalize(rawLlm)
      : rawLlm;
    score += MODEL_TIERS[llm] || 1;

    // Agent type (1-3 pts), top-level or config
    score += TYPE_SCORES[agent.type || config.type || ''] || 1;

    // Memory (+1)
    if (config.memory) score += 1;

    // Temperature tuning (+1 if non-default)
    if (config.temperature !== undefined && config.temperature !== 0.7) score += 1;

    const tier = RARITY_THRESHOLDS.find(t => score >= t.min) || RARITY_THRESHOLDS[RARITY_THRESHOLDS.length - 1];
    return { name: tier.name, color: RARITY_COLORS[tier.name], score };
  }

  /**
   * Get the rarity of a blueprint (normalized to title case).
   * Priority: bp.rarity → calcAgentRarity() → 'Common'
   * This is the single source of truth — all views should call this
   * instead of implementing their own rarity fallback chain.
   * @param {object} bp
   * @returns {string}
   */
  function getRarity(bp) {
    if (!bp) return 'Common';
    if (bp.rarity) {
      const r = bp.rarity;
      return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
    }
    return calcAgentRarity(bp).name;
  }

  /**
   * Get rarity info object { name, color } for a blueprint.
   * Single source of truth for rarity + color together.
   * @param {object} bp
   * @returns {{ name: string, color: string }}
   */
  function getRarityInfo(bp) {
    const name = getRarity(bp);
    return { name, color: RARITY_COLORS[name] || RARITY_COLORS.Common };
  }

  /** Slot labels — used by the spaceship builder and card-renderer for dynamic slot generation */
  const SLOT_LABELS = ['Bridge', 'Command', 'Tactical', 'Intel', 'Analytics', 'Operations', 'Comms', 'Science', 'Engineering', 'Support', 'Logistics', 'Creative'];

  /** Most crew slots a spaceship holds (crew designer cap, builder roster size). */
  const MAX_SHIP_SLOTS = 12;

  /** Ship class definitions — card art layouts keyed by class_id */
  const SHIP_CLASSES = {
    'class-1': { name: 'Scout',       slots: _buildClassSlots(6, 'Common') },
    'class-2': { name: 'Frigate',     slots: _buildClassSlots(8, 'Rare') },
    'class-3': { name: 'Cruiser',     slots: _buildClassSlots(10, 'Epic') },
    'class-4': { name: 'Dreadnought', slots: _buildClassSlots(12, 'Legendary') },
    'class-5': { name: 'Flagship',    slots: _buildClassSlots(24, 'Legendary') },
    // The default class reads the spaceship noun per theme ("Project").
    'slot-6':  { get name() { return Terminology.label('spaceship'); }, slots: _buildClassSlots(6, 'Common') },
  };

  function _buildClassSlots(count, maxRarity) {
    return Array.from({ length: count }, function(_, i) {
      return { id: i, max: maxRarity, maxRarity: maxRarity, label: SLOT_LABELS[i] || 'Agent ' + (i + 1) };
    });
  }

  /* ── Model id humanizer ──
     Turns LLM ids into display-ready names. `humanizeModel` returns the
     full product name ("Claude Opus 4.7") — used in drawers, detail
     panels, anywhere with horizontal room. `humanizeModelShort` returns
     a compact pill-friendly variant ("Claude Opus") — used on mission
     cards, badges, status pills, and other tight layouts. Both fall
     back to a kebab-case → Title Case transform for ids not listed. */
  const _MODEL_NAMES = {
    'nice-auto':                   'NICE Auto',
    'gemini-2.5-flash':            'Gemini 2.5 Flash',
    'gemini-2-5-flash':            'Gemini 2.5 Flash',
    'gemini-2.5-pro':              'Gemini 2.5 Pro',
    'gemini-2-5-pro':              'Gemini 2.5 Pro',
    'gemini-2.0-flash-lite':       'Gemini 2.0 Lite',
    'claude-haiku-4-5-20251001':   'Claude Haiku 4.5',
    'claude-haiku-4-5':            'Claude Haiku 4.5',
    'claude-sonnet-4-6':           'Claude Sonnet 4.6',
    'claude-4-6-sonnet':           'Claude Sonnet 4.6',
    'claude-sonnet-4-20250514':    'Claude Sonnet 4',
    'claude-opus-4-7':             'Claude Opus 4.7',
    'claude-4-7-opus':             'Claude Opus 4.7',
    'claude-opus-4':               'Claude Opus 4',
    'gpt-5.2':                     'GPT-5.2',
    'gpt-5-mini':                  'GPT-5 Mini',
    'gpt-5-4-pro':                 'GPT-5.4 Pro',
    'openai-o3':                   'OpenAI o3',
    'gpt-4o':                      'GPT-4o',
    'grok-4':                      'Grok 4',
    'grok-4-1-fast':               'Grok 4.1 Fast',
    'grok-4-3':                    'Grok 4.3',
    'llama-4-scout':               'Llama 4 Scout',
    'gpt-oss-120b':                'GPT-OSS 120B',
    'deepseek-v4-flash':           'DeepSeek V4 Flash',
    'kimi-k2-6':                   'Kimi K2.6',
    'nemotron-3-super':            'Nemotron 3 Super',
  };
  const _MODEL_SHORT_NAMES = {
    'nice-auto':                   'NICE Auto',
    'gemini-2.5-flash':            'Gemini Flash',
    'gemini-2-5-flash':            'Gemini Flash',
    'gemini-2.5-pro':              'Gemini Pro',
    'gemini-2-5-pro':              'Gemini Pro',
    'gemini-2.0-flash-lite':       'Gemini Lite',
    'claude-haiku-4-5-20251001':   'Claude Haiku',
    'claude-haiku-4-5':            'Claude Haiku',
    'claude-sonnet-4-6':           'Claude Sonnet',
    'claude-4-6-sonnet':           'Claude Sonnet',
    'claude-opus-4-6':             'Claude Opus',
    'claude-4-7-opus':             'Claude Opus',
    'gpt-5.2':                     'GPT-5.2',
    'gpt-5-mini':                  'GPT-5 Mini',
    'gpt-5-4-pro':                 'GPT-5.4 Pro',
    'openai-o3':                   'o3',
    'grok-4':                      'Grok 4',
    'grok-4-1-fast':               'Grok Fast',
    'grok-4-3':                    'Grok 4.3',
    'llama-4-scout':               'Llama Scout',
    'gpt-oss-120b':                'GPT-OSS',
    'deepseek-v4-flash':           'DeepSeek',
    'kimi-k2-6':                   'Kimi',
    'nemotron-3-super':            'Nemotron',
  };
  function humanizeModel(id) {
    if (!id || typeof id !== 'string') return '';
    if (_MODEL_NAMES[id]) return _MODEL_NAMES[id];
    // Generic fallback: kebab-case → Title Case, leaving numbers + dots intact
    return id.split('-').map(function(part) {
      if (/^\d/.test(part)) return part; // keep version segments as-is
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join(' ');
  }
  function humanizeModelShort(id) {
    if (!id || typeof id !== 'string') return '';
    return _MODEL_SHORT_NAMES[id] || humanizeModel(id);
  }

  /* ── Crew labels (shared by the crew view and the Schematic) ── */

  // True for the synthetic "Agent N" / "Slot N" labels getSlotTemplate emits
  // for dynamic ships with no crew defs. Themed + business ships always carry
  // a real crew label (a persona or job title) and must win over the assigned
  // umbrella agent's name; generic ships fall back to the assignee.
  function isGenericSlotLabel(l) {
    return !l || /^(agent|slot)\s*\d+$/i.test(String(l).trim());
  }

  // The crew identity a slot displays: its designated label (persona / job
  // title) when meaningful, else the assigned agent's name.
  function crewIdentity(slot, agent) {
    if (slot && !isGenericSlotLabel(slot.label)) return slot.label;
    return agent ? (agent.name || 'Agent') : null;
  }

  // Executive title → position. "Navigator · USS Enterprise" → "Navigator".
  // The ship name is redundant when you're viewing that ship.
  function positionLabel(title) {
    if (!title) return '';
    return String(title).split('·')[0].trim();
  }

  // Map a raw slot label to the role vocabulary. Strips naval/org-chart
  // suffixes and normalises to the business-function name.
  function roleLabel(raw) {
    if (!raw) return '';
    const s = String(raw).trim()
      .replace(/\s+(officer|specialist|lead|manager|director|chief|head|senior|junior)$/i, '')
      .trim();
    const lc = s.toLowerCase();
    if (lc === 'captain' || lc === 'commander' || lc === 'admiral' || lc === 'co') return 'Captain';
    if (lc.includes('comm') || lc.includes('message') || lc.includes('contact')) return 'Communications';
    if (lc.includes('sales') || lc.includes('deal') || lc.includes('revenue') || lc.includes('tactical')) return 'Sales';
    if (lc.includes('market') || lc.includes('brand') || lc.includes('content') || lc.includes('growth')) return 'Marketing';
    if (lc.includes('engineer') || lc.includes('dev') || lc.includes('tech') || lc.includes('code')) return 'Engineering';
    if (lc.includes('ops') || lc.includes('operat') || lc.includes('project')) return 'Operations';
    if (lc.includes('product') || lc.includes('roadmap')) return 'Product';
    if (lc.includes('success') || lc.includes('support') || lc.includes('customer')) return 'Customer Success';
    if (lc.includes('finance') || lc.includes('billing') || lc.includes('account')) return 'Finance';
    if (lc.includes('analyt') || lc.includes('data') || lc.includes('insight') || lc.includes('intel')) return 'Analytics';
    if (lc.includes('design') || lc.includes('ux') || lc.includes('creative')) return 'Design';
    if (lc.includes('legal') || lc.includes('compliance') || lc.includes('contract')) return 'Legal';
    if (lc.includes('security') || lc.includes('infosec') || lc.includes('audit')) return 'Security';
    if (lc.includes('people') || lc.includes('hr') || lc.includes('hiri') || lc.includes('recruit')) return 'People';
    if (lc.includes('research') || lc.includes('intel') || lc.includes('recon')) return 'Research';
    // Preserve the original label if it doesn't map cleanly
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // The line a crew member shows under its name: the position from the
  // slot title when there is one, else the role.
  function crewRoleLabel(slot) {
    if (!slot) return '';
    return positionLabel(slot.title) || roleLabel(slot.role || slot.label || '');
  }

  // Friendly name for the tool family an agent works through ("Google
  // Workspace", "HubSpot", ...). Agents bound to a capability have no
  // config.tools of their own, so resolve through the umbrella blueprint to
  // match what AgentExecutor loads at runtime.
  function capabilityLabel(bp) {
    if (!bp) return null;
    let tools = (bp.config && bp.config.tools) || [];
    let umbrellaName = null;
    if (bp.config && bp.config.capability_id && typeof Blueprints !== 'undefined') {
      const capId = bp.config.capability_id;
      // getCapability is strict (returns null for kind='character'); fall
      // through to getAgent for the character-kind umbrellas that hold the
      // real catalog (HubSpot Agent, GitHub Agent, etc.).
      const cap = (Blueprints.getCapability && Blueprints.getCapability(capId))
               || (Blueprints.getAgent && Blueprints.getAgent(capId))
               || null;
      if (cap) {
        if (!tools.length && cap.config && Array.isArray(cap.config.tools)) {
          tools = cap.config.tools;
        }
        if (cap.name) umbrellaName = String(cap.name).replace(/\s+agent$/i, '').trim() || null;
      }
    }
    const t = tools[0] || '';
    if (t.includes('hubspot'))                               return 'HubSpot';
    if (t.includes('gmail') || t.includes('calendar') || t.includes('drive')) return 'Google Workspace';
    if (t.includes('outlook') || t.includes('microsoft') || t.includes('sharepoint')) return 'Microsoft 365';
    if (t.includes('slack'))                                 return 'Slack';
    if (t.includes('linear'))                                return 'Linear';
    if (t.includes('github'))                                return 'GitHub';
    if (t.includes('notion'))                                return 'Notion';
    if (t.includes('stripe'))                                return 'Stripe';
    if (t.includes('generate-image') || t.includes('generate-video')) return 'Media';
    if (t.includes('browser') || t.includes('web-search'))  return 'Web';
    // Prefer the umbrella's brand name ("GitHub Agent" → "GitHub") over a
    // generic type/role fallback — only reached when the prefix-matcher
    // above doesn't recognise the first tool name.
    if (umbrellaName) return umbrellaName;
    if (!tools.length) return null;
    return (bp.config && (bp.config.type || bp.config.role)) || null;
  }

  return { getCrewDefs, getSlotCount, getFilledCount, getSlotTemplate, getClassId, getRarity, getRarityInfo, getRarityColor, calcAgentRarity, contrastText, humanizeModel, humanizeModelShort, isGenericSlotLabel, crewIdentity, positionLabel, roleLabel, crewRoleLabel, capabilityLabel, RARITY_COLORS, CATEGORY_COLORS, STATUS_COLORS, SLOT_LABELS, MAX_SHIP_SLOTS, SHIP_CLASSES };
})();
