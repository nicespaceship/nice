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

  /**
   * Get the rarity of a blueprint (normalized to title case).
   * Priority: bp.rarity → Gamification.calcAgentRarity() → 'Common'
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
    if (typeof Gamification !== 'undefined') {
      const calc = Gamification.calcAgentRarity(bp);
      return calc?.name || 'Common';
    }
    return 'Common';
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

  /** Slot labels — used by gamification and card-renderer for dynamic slot generation */
  const SLOT_LABELS = ['Bridge', 'Command', 'Tactical', 'Intel', 'Analytics', 'Operations', 'Comms', 'Science', 'Engineering', 'Support', 'Logistics', 'Creative'];

  /** Ship class definitions — single source of truth for both card art and gamification */
  const SHIP_CLASSES = {
    'class-1': { name: 'Scout',       slots: _buildClassSlots(6, 'Common') },
    'class-2': { name: 'Frigate',     slots: _buildClassSlots(8, 'Rare') },
    'class-3': { name: 'Cruiser',     slots: _buildClassSlots(10, 'Epic') },
    'class-4': { name: 'Dreadnought', slots: _buildClassSlots(12, 'Legendary') },
    'class-5': { name: 'Flagship',    slots: _buildClassSlots(24, 'Legendary') },
    'slot-6':  { name: 'Spaceship',   slots: _buildClassSlots(6, 'Common') },
  };

  function _buildClassSlots(count, maxRarity) {
    return Array.from({ length: count }, function(_, i) {
      return { id: i, max: maxRarity, maxRarity: maxRarity, label: SLOT_LABELS[i] || 'Agent ' + (i + 1) };
    });
  }

  /** Build slot array for a specific count (used by gamification for XP-gated classes) */
  function buildSlots(count, maxRarity) { return _buildClassSlots(count, maxRarity); }

  return { getCrewDefs, getSlotCount, getFilledCount, getSlotTemplate, getClassId, getRarity, getRarityInfo, getRarityColor, buildSlots, RARITY_COLORS, CATEGORY_COLORS, STATUS_COLORS, SLOT_LABELS, SHIP_CLASSES };
})();
