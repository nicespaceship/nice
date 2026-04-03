/* ═══════════════════════════════════════════════════════════════════
   NICE — Gamification Engine
   Crew ranks, XP, spaceship health, ship classes.
═══════════════════════════════════════════════════════════════════ */

const Gamification = (() => {
  const STORAGE_KEY = Utils.KEYS.xp;

  /** Safe localStorage write — catches QuotaExceededError */
  function _store(key, val) {
    try { localStorage.setItem(key, val); }
    catch (e) { console.warn('[Gamification] localStorage write failed:', key, e.name); }
  }

  /* ── Crew Ranks (slots = max crew slots unlocked at this rank) ── */
  const RANKS = [
    { name: 'Ensign',            xp: 0,       badge: '⬡',     slots: 6,  classId: 'class-1', maxRarity: 'Common' },
    { name: 'Lieutenant JG',     xp: 10000,   badge: '⬡⬡',    slots: 6,  classId: 'class-1', maxRarity: 'Common' },
    { name: 'Lieutenant',        xp: 25000,   badge: '⬡⬡⬡',   slots: 8,  classId: 'class-2', maxRarity: 'Rare' },
    { name: 'Lt Commander',      xp: 50000,   badge: '⬡⬡⬡⬡',  slots: 8,  classId: 'class-2', maxRarity: 'Rare' },
    { name: 'Commander',         xp: 100000,  badge: '★',      slots: 10, classId: 'class-3', maxRarity: 'Epic' },
    { name: 'Captain',           xp: 200000,  badge: '★★',     slots: 12, classId: 'class-4', maxRarity: 'Legendary' },
    { name: 'Fleet Captain',     xp: 350000,  badge: '★★★',    slots: 12, classId: 'class-4', maxRarity: 'Legendary' },
    { name: 'Commodore',         xp: 500000,  badge: '✦',      slots: 12, classId: 'class-4', maxRarity: 'Legendary' },
    { name: 'Rear Admiral',      xp: 750000,  badge: '✦✦',     slots: 12, classId: 'class-4', maxRarity: 'Legendary' },
    { name: 'Vice Admiral',      xp: 1000000, badge: '✦✦✦',    slots: 12, classId: 'class-4', maxRarity: 'Legendary' },
    { name: 'Admiral',           xp: 1500000, badge: '✦✦✦✦',   slots: 12, classId: 'class-4', maxRarity: 'Legendary' },
    { name: 'Fleet Admiral',     xp: 2500000, badge: '✦✦✦✦✦',  slots: 12, classId: 'class-5', maxRarity: 'Mythic' },
    // Fleet Admiral is the only rank that can activate Mythic blueprints
  ];

  /* ── XP Rewards ── */
  const XP_ACTIONS = {
    create_agent:       20,
    complete_mission:   15,
    launch_spaceship:   25,
    activate_blueprint: 10,
    chat_agent:          5,
    send_broadcast:      5,
    shared_mission:     30,
    export_data:          5,
    view_log:             5,
    create_workflow:      20,
    run_workflow:         15,
    dock_agent:           10,
    use_notes:             2,
    add_favorite:          3,
    undock_agent:           5,
    fill_all_slots:        30,
    visit_station:          5,
    run_diagnostics:       15,
    request_dock:          10,
    complete_wizard:       25,
    upgrade_spaceship:     50,
    create_station:        60,
    install_blueprint:     15,
    connect_provider:      10,
    model_intel_milestone: 10,
  };

  /* ── Streak Multipliers ── */
  const STREAK_MULTIPLIERS = [
    { minDays: 30, multiplier: 2.0 },
    { minDays: 14, multiplier: 1.75 },
    { minDays:  7, multiplier: 1.5 },
    { minDays:  3, multiplier: 1.25 },
    { minDays:  1, multiplier: 1.0 },
  ];

  /* ── Mission Priority XP Scaling ── */
  const PRIORITY_MULTIPLIERS = {
    critical: 2.0,
    high:     1.5,
    medium:   1.0,
    low:      0.75,
  };

  /* ── Ship Classes (count-based classification by active agents) ── */

  /* ── Agent Rarity System ── */
  const MODEL_TIERS = {
    'claude-4': 4, 'claude-4-opus': 4, 'gpt-4o': 4, 'grok-3': 4, 'mistral-large': 4,
    'claude-4-sonnet': 3, 'claude-3.5': 3, 'claude-3.5-sonnet': 3, 'gemini-2': 3, 'codestral': 3,
    'gemini-2-flash': 2, 'gemini-1.5-pro': 2, 'grok-3-mini': 2,
    'gpt-4o-mini': 1,
    'sonar-pro': 3, 'sonar': 2,
    'deepseek-chat': 3, 'deepseek-reasoner': 4,
    'nice-auto': 3,
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

  const RARITY_THRESHOLDS = [
    { name: 'Mythic',    min: 14, color: '#ff2d55' },
    { name: 'Legendary', min: 10, color: '#f59e0b' },
    { name: 'Epic',      min: 7,  color: '#a855f7' },
    { name: 'Rare',      min: 4,  color: '#6366f1' },
    { name: 'Common',    min: 0,  color: '#94a3b8' },
  ];

  const RARITY_ORDER = { Common: 0, Rare: 1, Epic: 2, Legendary: 3, Mythic: 4 };

  function calcAgentRarity(agent) {
    if (!agent) return { name: 'Common', min: 0, color: '#94a3b8', score: 0 };
    const config = agent.config || {};
    let score = 0;

    // Tool count (0-4 pts)
    const toolCount = (config.tools || []).length;
    score += toolCount === 0 ? 0 : Math.min(4, Math.ceil(toolCount / 2));

    // Model tier (1-4 pts) — check both top-level and config
    const llm = agent.llm_engine || config.llm_engine || '';
    score += MODEL_TIERS[llm] || 1;

    // Agent type (1-3 pts) — check both top-level and config
    const agentType = agent.type || config.type || '';
    score += TYPE_SCORES[agentType] || 1;

    // Memory (+1)
    if (config.memory) score += 1;

    // Temperature tuning (+1 if non-default)
    if (config.temperature !== undefined && config.temperature !== 0.7) score += 1;

    for (const r of RARITY_THRESHOLDS) {
      if (score >= r.min) return { ...r, score };
    }
    return { ...RARITY_THRESHOLDS[RARITY_THRESHOLDS.length - 1], score };
  }

  /* ── Slot labels & builder — delegate to BlueprintUtils (single source of truth) ── */
  var SLOT_LABELS = (typeof BlueprintUtils !== 'undefined' && BlueprintUtils.SLOT_LABELS)
    ? BlueprintUtils.SLOT_LABELS
    : ['Bridge', 'Command', 'Tactical', 'Intel', 'Analytics', 'Operations', 'Comms', 'Science', 'Engineering', 'Support', 'Logistics', 'Creative'];

  function _buildSlots(count, maxRarity) {
    if (typeof BlueprintUtils !== 'undefined' && BlueprintUtils.buildSlots) return BlueprintUtils.buildSlots(count, maxRarity);
    return Array.from({ length: count }, function(_, i) {
      return { id: i, maxRarity: maxRarity, label: SLOT_LABELS[i] || 'Agent ' + i };
    });
  }

  /* ── Spaceship Classes (5-tier progression model) ── */
  const SPACESHIP_CLASSES = [
    {
      id: 'class-1', maxRarity: 'Common', xpRequired: 0,
      slots: _buildSlots(6, 'Common'),
    },
    {
      id: 'class-2', maxRarity: 'Rare', xpRequired: 25000,
      slots: _buildSlots(8, 'Rare'),
    },
    {
      id: 'class-3', maxRarity: 'Epic', xpRequired: 100000,
      slots: _buildSlots(10, 'Epic'),
    },
    {
      id: 'class-4', maxRarity: 'Legendary', xpRequired: 200000,
      slots: _buildSlots(12, 'Legendary'),
    },
    {
      id: 'class-5', maxRarity: 'Mythic', xpRequired: 0, subscription: true,
      slots: _buildSlots(24, 'Mythic'), // Unlimited — subscription only
    },
  ];

  function canSlotAccept(slotMaxRarity, agentRarity) {
    return (RARITY_ORDER[agentRarity] || 0) <= (RARITY_ORDER[slotMaxRarity] || 0);
  }

  /** Check if user's current rank allows activating a given rarity */
  function isRarityUnlocked(rarity) {
    var rank = getRank();
    var maxOrder = RARITY_ORDER[rank.maxRarity || 'Common'] || 0;
    // Subscription unlocks Legendary (not Mythic — Mythic requires Fleet Admiral)
    if (typeof Subscription !== 'undefined' && Subscription.isActive && Subscription.isActive()) {
      maxOrder = Math.max(maxOrder, RARITY_ORDER['Legendary'] || 4);
    }
    return (RARITY_ORDER[rarity] || 0) <= maxOrder;
  }

  /** Get the current class based on XP rank + subscription */
  function getCurrentClass() {
    // Subscription = Class 5
    if (typeof Subscription !== 'undefined' && Subscription.isActive && Subscription.isActive()) {
      return SPACESHIP_CLASSES.find(function(c) { return c.id === 'class-5'; }) || SPACESHIP_CLASSES[4];
    }
    var rank = getRank();
    var classId = rank.classId || 'class-1';
    return SPACESHIP_CLASSES.find(function(c) { return c.id === classId; }) || SPACESHIP_CLASSES[0];
  }

  /** Get max slots for current XP rank. Subscription = unlimited. */
  function getMaxSlots() {
    // Subscription override = unlimited
    if (typeof Subscription !== 'undefined' && Subscription.isActive && Subscription.isActive()) {
      return 99;
    }
    var rank = getRank();
    return rank.slots || 6;
  }

  /** Generate a slot template for N slots (dynamic, no class dependency).
   *  Free tier: 6 Common slots. Subscription: 12 Legendary slots.
   *  Mythic is never a builder option — it must be earned through evolution. */
  function getSlotTemplate(slotCount) {
    var isSub = typeof Subscription !== 'undefined' && Subscription.isActive && Subscription.isActive();
    slotCount = slotCount || (isSub ? 12 : getMaxSlots());
    var maxRarity = isSub ? 'Legendary' : 'Common';
    var slots = [];
    for (var i = 0; i < slotCount; i++) {
      slots.push({ id: i, maxRarity: maxRarity, label: SLOT_LABELS[i] || 'Agent ' + (i + 1) });
    }
    return { id: 'dynamic', name: 'Spaceship', slots: slots };
  }

  /** Backward-compatible: returns class template or dynamic slots. */
  function getSpaceshipClass(classId) {
    // If classId matches an old class, return template for backward compat
    var match = SPACESHIP_CLASSES.find(function(c) { return c.id === classId; });
    if (match) return match;
    // Otherwise generate dynamic slots based on XP rank
    return getSlotTemplate();
  }

  function renderRarityBadge(rarityName) {
    const r = RARITY_THRESHOLDS.find(t => t.name === rarityName) || RARITY_THRESHOLDS[3];
    return `<span class="rarity-badge rarity-${r.name.toLowerCase()}">${r.name}</span>`;
  }

  /* ─── XP Management ─── */

  function getXP() {
    return parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
  }

  function getStreakMultiplier() {
    const streak = getStreak();
    for (const tier of STREAK_MULTIPLIERS) {
      if (streak >= tier.minDays) return tier.multiplier;
    }
    return 1.0;
  }

  function addXP(action) {
    const baseAmount = XP_ACTIONS[action] || 0;
    if (!baseAmount) return 0;

    // Apply streak multiplier
    const multiplier = getStreakMultiplier();
    const amount = Math.round(baseAmount * multiplier);

    const current = getXP();
    const newXP = current + amount;
    const oldRank = getRank(current);
    _store(STORAGE_KEY, String(newXP));

    // Sync to DB
    _syncXPtoDB(newXP);

    // Update streak
    _updateStreak();

    // Check for rank up
    const newRank = getRank(newXP);
    if (newRank.name !== oldRank.name) {
      _showRankUpOverlay(newRank);
    }

    return amount;
  }

  function getMissionXP(mission) {
    const base = XP_ACTIONS.complete_mission || 15;
    const priority = (mission && mission.priority) || 'medium';
    const priorityMult = PRIORITY_MULTIPLIERS[priority] || 1.0;
    const streakMult = getStreakMultiplier();
    return Math.round(base * priorityMult * streakMult);
  }

  function addMissionXP(mission) {
    const amount = getMissionXP(mission);
    if (!amount) return 0;
    const current = getXP();
    const newXP = current + amount;
    const oldRank = getRank(current);
    _store(STORAGE_KEY, String(newXP));
    _syncXPtoDB(newXP);
    _updateStreak();
    const newRank = getRank(newXP);
    if (newRank.name !== oldRank.name) {
      _showRankUpOverlay(newRank);
    }
    return amount;
  }

  /* ── DB sync helpers ── */
  async function _syncXPtoDB(xp) {
    if (typeof SB === 'undefined' || typeof SB.isReady !== 'function' || !SB.isReady()) return;
    const user = typeof State !== 'undefined' ? State.get('user') : null;
    if (!user) return;
    try { await SB.db('user_stats').update(user.id, { xp }); } catch { /* non-critical */ }
  }

  async function _syncAchievementsToDB(achievements) {
    if (typeof SB === 'undefined' || typeof SB.isReady !== 'function' || !SB.isReady()) return;
    const user = typeof State !== 'undefined' ? State.get('user') : null;
    if (!user) return;
    try { await SB.db('user_stats').update(user.id, { achievements: JSON.stringify(achievements) }); } catch { /* non-critical */ }
  }

  async function initFromDB() {
    // Migrate legacy achievement IDs
    try {
      const raw = localStorage.getItem('nice-achievements');
      if (raw) {
        const migrated = raw.replace(/first-robot/g, 'first-agent').replace(/robot-army/g, 'agent-army');
        if (migrated !== raw) _store('nice-achievements', migrated);
      }
    } catch {}

    if (typeof SB === 'undefined' || typeof SB.isReady !== 'function' || !SB.isReady()) return;
    const user = typeof State !== 'undefined' ? State.get('user') : null;
    if (!user) return;
    try {
      const stats = await SB.db('user_stats').get(user.id);
      if (!stats) return;
      // Merge XP: take the higher value
      const localXP = getXP();
      const dbXP = stats.xp || 0;
      if (dbXP > localXP) _store(STORAGE_KEY, String(dbXP));
      else if (localXP > dbXP) _syncXPtoDB(localXP);
      // Merge achievements: union of both sets
      const localAch = getUnlockedAchievements();
      let dbAch = [];
      try { dbAch = typeof stats.achievements === 'string' ? JSON.parse(stats.achievements) : (stats.achievements || []); } catch {}
      const merged = _mergeAchievements(localAch, dbAch);
      _store(ACH_STORAGE, JSON.stringify(merged));
      if (merged.length !== dbAch.length) _syncAchievementsToDB(merged);
    } catch { /* non-critical */ }
  }

  function _mergeAchievements(a, b) {
    const map = new Map();
    (a || []).forEach(x => map.set(x.id, x));
    (b || []).forEach(x => { if (!map.has(x.id)) map.set(x.id, x); });
    return Array.from(map.values());
  }

  function _skinnedRanks() {
    const skinNames = typeof Skin !== 'undefined' && Skin.list('ranks');
    if (!skinNames || skinNames.length !== RANKS.length) return RANKS;
    return RANKS.map((r, i) => ({ ...r, name: skinNames[i] }));
  }

  function getRank(xp) {
    if (xp === undefined) xp = getXP();
    const ranks = _skinnedRanks();
    let rank = ranks[0];
    for (const r of ranks) {
      if (xp >= r.xp) rank = r;
    }
    return rank;
  }

  function getNextRank(xp) {
    if (xp === undefined) xp = getXP();
    const ranks = _skinnedRanks();
    for (const r of ranks) {
      if (xp < r.xp) return r;
    }
    return null; // Max rank
  }

  function getRankProgress(xp) {
    if (xp === undefined) xp = getXP();
    const current = getRank(xp);
    const next = getNextRank(xp);
    if (!next) return 100; // Max rank
    const range = next.xp - current.xp;
    const progress = xp - current.xp;
    return Math.round((progress / range) * 100);
  }

  /* ─── Ship Class ─── */


  /* ─── Spaceship Health ─── */

  function getSpaceshipHealth(spaceship, agents, missions) {
    agents = agents || [];
    missions = missions || [];
    const memberIds = spaceship.agent_ids || [];
    const members = agents.filter(r => memberIds.includes(r.id));
    const shipMissions = missions.filter(m => memberIds.includes(m.agent_id));

    // Hull: based on error rate of agents (100 = no errors)
    const errorAgents = members.filter(r => r.status === 'error').length;
    const hull = members.length > 0
      ? Math.round(((members.length - errorAgents) / members.length) * 100)
      : 100;

    // Tokens: derived from remaining budget (simplified)
    const budget = JSON.parse(localStorage.getItem('nice-budget') || '{"limit":50,"alert":80}');
    const tokens = Math.max(0, Math.min(100, 100 - (budget.alert || 80) + 20));

    // Shield: % of completed missions
    const completed = shipMissions.filter(m => m.status === 'completed').length;
    const total = shipMissions.length;
    const shield = total > 0 ? Math.round((completed / total) * 100) : 100;

    return { hull, tokens, shield };
  }

  /* ─── Render Helpers ─── */

  function renderRankBadge(compact) {
    const xp = getXP();
    const rank = getRank(xp);
    const next = getNextRank(xp);
    const pct = getRankProgress(xp);

    if (compact) {
      return `
        <div class="rank-badge-compact">
          <span class="rank-icon">${rank.badge}</span>
          <span class="rank-name">${rank.name}</span>
        </div>`;
    }

    return `
      <div class="rank-card">
        <div class="rank-card-top">
          <span class="rank-icon-lg">${rank.badge}</span>
          <div class="rank-card-info">
            <span class="rank-card-name">${rank.name}</span>
            <span class="rank-card-xp">${xp} XP</span>
          </div>
        </div>
        <div class="rank-progress">
          <div class="rank-progress-bar" style="width:${pct}%"></div>
        </div>
        <span class="rank-progress-label">${next ? `${next.xp - xp} XP to ${next.name}` : 'Max Rank'}</span>
      </div>`;
  }

  function renderHealthBars(health) {
    return `
      <div class="health-bars">
        <div class="health-bar-row">
          <span class="health-label">Hull</span>
          <div class="health-bar"><div class="health-fill hull" style="width:${health.hull}%"></div></div>
          <span class="health-val">${health.hull}%</span>
        </div>
        <div class="health-bar-row">
          <span class="health-label">Tokens</span>
          <div class="health-bar"><div class="health-fill tokens" style="width:${health.tokens}%"></div></div>
          <span class="health-val">${health.tokens}%</span>
        </div>
        <div class="health-bar-row">
          <span class="health-label">Shield</span>
          <div class="health-bar"><div class="health-fill shield" style="width:${health.shield}%"></div></div>
          <span class="health-val">${health.shield}%</span>
        </div>
      </div>`;
  }

  function renderShipClassBadge(agentCount) {
    const cls = getCurrentClass();
    return `<span class="ship-class-badge">${cls.id} (${cls.maxRarity})</span>`;
  }

  /* ─── Achievements ─── */

  const ACH_STORAGE = 'nice-achievements';
  const ACHIEVEMENTS = [
    { id: 'first-agent',        name: 'First Agent',        desc: 'Create your first agent',           icon: 'bot' },
    { id: 'agent-army',         name: 'Agent Army',         desc: 'Have 5+ agents',                    icon: '🦾' },
    { id: 'first-mission',      name: 'First Mission',      desc: 'Complete 1 mission',                icon: 'target' },
    { id: 'mission-streak',     name: 'Mission Streak',     desc: 'Complete 5 missions',               icon: '🔥' },
    { id: 'first-spaceship',    name: 'First Spaceship',    desc: 'Create your first spaceship',       icon: 'rocket' },
    { id: 'fleet-admiral',      name: 'Fleet Admiral',      desc: 'Have 3+ spaceships',                icon: '⭐' },
    { id: 'blueprint-collector',name: 'Blueprint Collector', desc: 'Activate 3 blueprints',             icon: '📘' },
    { id: 'rank-captain',       name: "Captain's Chair",    desc: 'Reach Captain rank',                icon: '💺' },
    { id: 'rank-admiral',       name: "Admiral's Bridge",   desc: 'Reach Admiral rank',                icon: '🌟' },
    { id: 'station-founder',    name: 'Station Founder',    desc: 'Create a Space Station',            icon: '🏗️' },
    { id: 'data-exporter',     name: 'Data Archivist',     desc: 'Export your NICE data',              icon: 'save' },
    { id: 'workflow-creator',  name: 'Pipeline Engineer',  desc: 'Create a workflow pipeline',         icon: '🔧' },
    { id: 'first-dock-slot',   name: 'First Dock',         desc: 'Dock an agent into a ship slot',     icon: '🔌' },
    { id: 'full-ship',         name: 'Full Squad',         desc: 'Fill all slots on a spaceship',      icon: '🛸' },
    { id: 'legendary-captain', name: 'Legendary Captain',  desc: 'Dock a Legendary agent',             icon: '👑' },
    { id: 'station-visitor',   name: 'Station Hopper',     desc: 'Visit 3 different stations',         icon: '🛰️' },
    { id: 'diagnostics-run',   name: 'Ship Doctor',        desc: 'Run a diagnostics scan',             icon: '🩺' },
    { id: 'mission-control-setup', name: 'Bridge', desc: 'Fill all schematic slots on any ship', icon: '🎛️' },
    { id: 'wizard-complete',       name: 'Guided Launch',  desc: 'Complete the Setup Wizard',             icon: '🧙' },
    { id: 'first-deployment',      name: 'First Launch',   desc: 'Deploy your first spaceship crew',      icon: '🚀' },
    { id: 'streak-7',             name: 'Week Warrior',   desc: 'Maintain a 7-day streak',               icon: '🔥' },
    { id: 'streak-14',            name: 'Fortnight Force', desc: 'Maintain a 14-day streak',             icon: '💪' },
    { id: 'streak-30',            name: 'Monthly Legend',  desc: 'Maintain a 30-day streak',             icon: '🏅' },
  ];

  function getUnlockedAchievements() {
    try {
      return JSON.parse(localStorage.getItem(ACH_STORAGE) || '[]');
    } catch { return []; }
  }

  function unlockAchievement(id) {
    const unlocked = getUnlockedAchievements();
    if (unlocked.find(a => a.id === id)) return false;
    const ach = ACHIEVEMENTS.find(a => a.id === id);
    if (!ach) return false;
    unlocked.push({ id, unlockedAt: new Date().toISOString() });
    _store(ACH_STORAGE, JSON.stringify(unlocked));
    _syncAchievementsToDB(unlocked);
    _showAchievementUnlock(ach);
    return true;
  }

  function checkAchievements() {
    const agents = State.get('agents') || [];
    const missions = State.get('missions') || [];
    const spaceships = State.get('spaceships') || [];
    const xp = getXP();
    const rank = getRank(xp);

    if (agents.length >= 1) unlockAchievement('first-agent');
    if (agents.length >= 5) unlockAchievement('agent-army');
    const completed = missions.filter(m => m.status === 'completed').length;
    if (completed >= 1) unlockAchievement('first-mission');
    if (completed >= 5) unlockAchievement('mission-streak');
    if (spaceships.length >= 1) unlockAchievement('first-spaceship');
    if (spaceships.length >= 3) unlockAchievement('fleet-admiral');
    if (rank.xp >= 200000) unlockAchievement('rank-captain');   // Captain+
    if (rank.xp >= 1500000) unlockAchievement('rank-admiral'); // Admiral+

    // Streak achievements
    const streak = getStreak();
    if (streak >= 7)  unlockAchievement('streak-7');
    if (streak >= 14) unlockAchievement('streak-14');
    if (streak >= 30) unlockAchievement('streak-30');
  }

  function renderAchievementGallery() {
    const unlocked = getUnlockedAchievements();
    const unlockedIds = new Set(unlocked.map(a => a.id));

    return ACHIEVEMENTS.map(ach => {
      const isUnlocked = unlockedIds.has(ach.id);
      const meta = unlocked.find(a => a.id === ach.id);
      return `
        <div class="ach-card ${isUnlocked ? 'unlocked' : 'locked'}">
          <span class="ach-icon">${ach.icon}</span>
          <div class="ach-info">
            <span class="ach-name">${ach.name}</span>
            <span class="ach-desc">${ach.desc}</span>
            ${isUnlocked && meta ? `<span class="ach-date">${_toStardate(meta.unlockedAt)}</span>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  /* ─── Resources ─── */

  function getResources() {
    const agents = State.get('agents') || [];
    const missions = State.get('missions') || [];
    const budget = JSON.parse(localStorage.getItem('nice-budget') || '{"limit":50,"alert":80}');

    // Tokens — derived from remaining budget (100 = fully funded)
    const tokens = Math.max(0, Math.min(100, 100 - (budget.alert || 80) + 20));

    // Power — derived from active agent count (each active agent = 20 power, max 100)
    const activeAgents = agents.filter(r => r.status === 'active').length;
    const power = Math.min(100, activeAgents * 20);

    // Credits — derived from completed missions (each = 10 credits)
    const completed = missions.filter(m => m.status === 'completed').length;
    const credits = completed * 10;

    return { tokens, power, credits };
  }

  function renderResourceBar() {
    const res = getResources();
    const tokenWarning = res.tokens < 20 ? ' res-warning' : '';
    return `
      <div class="res-bar">
        <div class="res-item${tokenWarning}" title="Tokens: ${res.tokens}%">
          <span class="res-icon">🪙</span><span class="res-val">${res.tokens}</span>
        </div>
        <div class="res-item" title="Power: ${res.power}%">
          <span class="res-icon">⚡</span><span class="res-val">${res.power}</span>
        </div>
        <div class="res-item" title="Credits: ${res.credits}">
          <span class="res-icon">💎</span><span class="res-val">${res.credits}</span>
        </div>
      </div>`;
  }

  /* ─── Captain's Log (Stardate formatting) ─── */

  function _toStardate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const year = d.getFullYear();
    const dayOfYear = Math.floor((d - new Date(year, 0, 0)) / 86400000);
    return `SD ${year}.${String(dayOfYear).padStart(3, '0')}`;
  }

  function formatLogEntry(item) {
    const stardate = _toStardate(item.time);
    let verb = item.type === 'mission' ? 'Mission logged' : 'Agent status';
    if (item.status === 'completed') verb = 'Mission accomplished';
    else if (item.status === 'running') verb = 'Mission in progress';
    else if (item.status === 'failed') verb = 'Mission failed';
    else if (item.status === 'queued') verb = 'Mission queued';
    else if (item.type === 'agent' && item.status === 'active') verb = 'Agent operational';
    else if (item.type === 'agent' && item.status === 'idle') verb = 'Agent standing by';
    else if (item.type === 'agent' && item.status === 'error') verb = 'Agent malfunction';
    return { stardate, verb };
  }

  /* ─── Confetti Burst ─── */

  function _spawnConfetti(container) {
    const colors = ['var(--accent)', 'var(--accent2)', '#ffd700', '#ff6b6b', '#4ecdc4', '#a78bfa'];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 40; i++) {
      const p = document.createElement('span');
      p.className = 'confetti-particle';
      p.style.cssText = `
        --x: ${(Math.random() - 0.5) * 600}px;
        --y: ${-200 - Math.random() * 400}px;
        --r: ${Math.random() * 720 - 360}deg;
        --d: ${0.6 + Math.random() * 0.8}s;
        background: ${colors[i % colors.length]};
        left: 50%; top: 50%;
      `;
      frag.appendChild(p);
    }
    container.appendChild(frag);
  }

  /* ─── Achievement Unlock Overlay ─── */

  function _showAchievementUnlock(ach) {
    if (typeof Notify !== 'undefined') {
      Notify.send({ title: 'Achievement Unlocked!', message: `${ach.icon} ${ach.name}`, type: 'system' });
    }

    // Count unlocked for progress
    const unlocked = getUnlockedAchievements();
    const total = ACHIEVEMENTS.length;
    const pct = Math.round((unlocked.length / total) * 100);

    const overlay = document.createElement('div');
    overlay.className = 'achievement-unlock';
    overlay.innerHTML = `
      <div class="achievement-unlock-card">
        <div class="achievement-unlock-icon">${ach.icon}</div>
        <h3>Achievement Unlocked!</h3>
        <p class="ach-title">${ach.name}</p>
        <p class="ach-desc">${ach.desc}</p>
        <div class="ach-progress">
          <div class="ach-progress-bar" style="width:${pct}%"></div>
          <span class="ach-progress-label">${unlocked.length}/${total} achievements</span>
        </div>
      </div>
    `;
    _spawnConfetti(overlay.querySelector('.achievement-unlock-card'));
    document.body.appendChild(overlay);
    overlay.addEventListener('click', () => overlay.remove());
    setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 4000);
  }

  /* ─── Rank-Up Ceremony Overlay ─── */

  function _showRankUpOverlay(newRank) {
    if (typeof Notify !== 'undefined') {
      Notify.send({
        title: 'Rank Up!',
        message: `You've been promoted to ${newRank.name}! ${newRank.badge}`,
        type: 'system',
      });
    }

    // Build unlock description
    const unlocks = [];
    if (newRank.slots) unlocks.push(`${newRank.slots} crew slots`);
    if (newRank.maxRarity) unlocks.push(`${newRank.maxRarity} blueprints`);
    const unlockText = unlocks.length ? `Unlocked: ${unlocks.join(' · ')}` : '';

    // Next rank progress
    const currentXP = getXP();
    const rankIdx = RANKS.findIndex(r => r.name === newRank.name);
    const nextRank = RANKS[rankIdx + 1];
    let progressHTML = '';
    if (nextRank) {
      const pct = Math.min(100, Math.round(((currentXP - newRank.xp) / (nextRank.xp - newRank.xp)) * 100));
      progressHTML = `
        <div class="rankup-progress">
          <div class="rankup-progress-bar" style="width:${pct}%"></div>
          <span class="rankup-progress-label">Next: ${nextRank.badge} ${nextRank.name}</span>
        </div>`;
    }

    const overlay = document.createElement('div');
    overlay.className = 'rankup-overlay';
    overlay.innerHTML = `
      <div class="rankup-card">
        <div class="rankup-badge">${newRank.badge}</div>
        <h2>Rank Up!</h2>
        <h3>${newRank.name}</h3>
        ${unlockText ? `<p class="rankup-unlocks">${unlockText}</p>` : ''}
        <p class="rankup-congrats">Congratulations, you've been promoted!</p>
        ${progressHTML}
      </div>
    `;
    _spawnConfetti(overlay.querySelector('.rankup-card'));
    document.body.appendChild(overlay);
    overlay.addEventListener('click', () => overlay.remove());
    setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 5000);
  }

  /* ─── Agent Progression ─── */

  const AGENT_STATS_KEY = Utils.KEYS.agentStats;

  function _getAgentStats() {
    try { return JSON.parse(localStorage.getItem(AGENT_STATS_KEY) || '{}'); } catch(e) { return {}; }
  }

  function _saveAgentStats(stats) {
    _store(AGENT_STATS_KEY, JSON.stringify(stats));
  }

  function recordAgentMission(agentId, opts) {
    if (!agentId) return null;
    const stats = _getAgentStats();
    if (!stats[agentId]) {
      stats[agentId] = {
        missions_completed: 0,
        missions_succeeded: 0,
        tokens_consumed: 0,
        tools_used: [],
        first_active: new Date().toISOString().slice(0, 10),
        last_active: null,
        active_days: 0,
        streak: 0,
        last_streak_date: null,
      };
    }
    const s = stats[agentId];
    s.missions_completed++;
    if (opts?.success !== false) s.missions_succeeded++;
    if (opts?.tokens) s.tokens_consumed += opts.tokens;
    if (opts?.tools) {
      opts.tools.forEach(t => { if (!s.tools_used.includes(t)) s.tools_used.push(t); });
    }

    // Track active days & streak
    const today = new Date().toISOString().slice(0, 10);
    if (s.last_active !== today) {
      s.active_days++;
      if (s.last_streak_date) {
        const lastDate = new Date(s.last_streak_date);
        const todayDate = new Date(today);
        const diffDays = Math.round((todayDate - lastDate) / 86400000);
        s.streak = diffDays === 1 ? s.streak + 1 : 1;
      } else {
        s.streak = 1;
      }
      s.last_streak_date = today;
      s.last_active = today;
    }

    _saveAgentStats(stats);
    return s;
  }

  function getAgentStats(agentId) {
    if (!agentId) return null;
    const stats = _getAgentStats();
    return stats[agentId] || null;
  }

  function checkAgentMilestone(agentId, agent) {
    const s = getAgentStats(agentId);
    if (!s) return null;

    const successRate = s.missions_completed > 0 ? (s.missions_succeeded / s.missions_completed) * 100 : 0;
    const daysActive = s.active_days;

    const epicReqs = {
      missions: { current: s.missions_completed, target: 25, met: s.missions_completed >= 25 },
      success_rate: { current: Math.round(successRate), target: 80, met: successRate >= 80 && s.missions_completed >= 10 },
      days_active: { current: daysActive, target: 14, met: daysActive >= 14 },
      tools_used: { current: s.tools_used.length, target: 3, met: s.tools_used.length >= 3 },
      tokens: { current: s.tokens_consumed, target: 500, met: s.tokens_consumed >= 500 },
    };

    const legendaryReqs = {
      missions: { current: s.missions_completed, target: 100, met: s.missions_completed >= 100 },
      success_rate: { current: Math.round(successRate), target: 90, met: successRate >= 90 && s.missions_completed >= 50 },
      days_active: { current: daysActive, target: 60, met: daysActive >= 60 },
      streak: { current: s.streak, target: 7, met: s.streak >= 7 },
      tokens: { current: s.tokens_consumed, target: 5000, met: s.tokens_consumed >= 5000 },
    };

    const mythicReqs = {
      missions: { current: s.missions_completed, target: 500, met: s.missions_completed >= 500 },
      success_rate: { current: Math.round(successRate), target: 95, met: successRate >= 95 && s.missions_completed >= 250 },
      days_active: { current: daysActive, target: 180, met: daysActive >= 180 },
      streak: { current: s.streak, target: 30, met: s.streak >= 30 },
      tokens: { current: s.tokens_consumed, target: 50000, met: s.tokens_consumed >= 50000 },
    };

    const epicMet = Object.values(epicReqs).every(r => r.met);
    const legendaryMet = Object.values(legendaryReqs).every(r => r.met);
    const mythicMet = legendaryMet && Object.values(mythicReqs).every(r => r.met);

    let earnedRarity = null;
    if (mythicMet) earnedRarity = 'Mythic';
    else if (legendaryMet) earnedRarity = 'Legendary';
    else if (epicMet) earnedRarity = 'Epic';

    return {
      current: s,
      successRate: Math.round(successRate),
      epicReqs,
      legendaryReqs,
      mythicReqs,
      epicMet,
      legendaryMet,
      mythicMet,
      earnedRarity,
    };
  }

  function getAgentProgression(agentId) {
    const s = getAgentStats(agentId);
    if (!s) return { level: 0, progress: 0, nextMilestone: 'Epic', reqs: null };

    const milestone = checkAgentMilestone(agentId);
    if (!milestone) return { level: 0, progress: 0, nextMilestone: 'Epic', reqs: null };

    if (milestone.mythicMet) {
      return { level: 3, progress: 100, nextMilestone: null, reqs: milestone.mythicReqs };
    }
    if (milestone.legendaryMet) {
      const reqs = milestone.mythicReqs;
      const progress = Math.round(Object.values(reqs).filter(r => r.met).length / Object.values(reqs).length * 100);
      return { level: 2, progress, nextMilestone: 'Mythic', reqs };
    }
    if (milestone.epicMet) {
      const reqs = milestone.legendaryReqs;
      const progress = Math.round(Object.values(reqs).filter(r => r.met).length / Object.values(reqs).length * 100);
      return { level: 1, progress, nextMilestone: 'Legendary', reqs };
    }
    const reqs = milestone.epicReqs;
    const progress = Math.round(Object.values(reqs).filter(r => r.met).length / Object.values(reqs).length * 100);
    return { level: 0, progress, nextMilestone: 'Epic', reqs };
  }

  /* ─── Streak Tracking ─── */

  function _updateStreak() {
    const today = new Date().toDateString();
    const lastActive = localStorage.getItem('nice-last-active');

    if (lastActive === today) return; // Already counted today

    const yesterday = new Date(Date.now() - 86400000).toDateString();
    let streak = parseInt(localStorage.getItem('nice-streak') || '0', 10);

    if (lastActive === yesterday) {
      streak += 1;
    } else {
      streak = 1;
    }

    _store('nice-streak', String(streak));
    _store('nice-last-active', today);
  }

  function getStreak() {
    const lastActive = localStorage.getItem('nice-last-active');
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    // If last active was neither today nor yesterday, streak is broken
    if (lastActive !== today && lastActive !== yesterday) return 0;
    return parseInt(localStorage.getItem('nice-streak') || '0', 10);
  }

  return {
    initFromDB, getXP, addXP, getRank, getNextRank, getRankProgress,
    getSpaceshipHealth,
    renderRankBadge, renderHealthBars, renderShipClassBadge,
    getUnlockedAchievements, unlockAchievement, checkAchievements, renderAchievementGallery,
    getResources, renderResourceBar,
    formatLogEntry, _toStardate,
    calcAgentRarity, canSlotAccept, isRarityUnlocked, getCurrentClass, getSpaceshipClass, getMaxSlots, getSlotTemplate, renderRarityBadge,
    getStreak, getStreakMultiplier,
    getMissionXP, addMissionXP,
    recordAgentMission, getAgentStats, checkAgentMilestone, getAgentProgression,
    RANKS, XP_ACTIONS, ACHIEVEMENTS, STREAK_MULTIPLIERS, PRIORITY_MULTIPLIERS,
    RARITY_THRESHOLDS, RARITY_ORDER, SPACESHIP_CLASSES, SLOT_LABELS,
  };
})();
