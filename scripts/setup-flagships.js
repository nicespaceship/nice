/**
 * NICE™ Flagship Setup Script
 *
 * Activates the Enterprise (NCC-1701-D) and Star Destroyer (Executor),
 * assigns their full 12-agent crews, and creates 10 real missions.
 *
 * Usage: paste into browser console on the NICE app, or load via <script>.
 *   - Requires: Blueprints, State, SB, Gamification globals
 *   - Safe to run multiple times (idempotent activations)
 */
(async function setupFlagships() {
  'use strict';

  const log = (msg) => console.log(`[NICE Setup] ${msg}`);

  if (typeof Blueprints === 'undefined') { console.error('[NICE Setup] Blueprints not loaded'); return; }
  if (typeof State === 'undefined') { console.error('[NICE Setup] State not loaded'); return; }

  /* ═══════════════════════════════════════════════════════════════
     CREW DEFINITIONS
  ═══════════════════════════════════════════════════════════════ */

  const ENTERPRISE = {
    shipId: 'ship-47',
    name: 'NCC-1701-D',
    classId: 'class-4',
    crew: [
      { slot: 0,  id: 'bp-agent-250', name: 'Jean-Luc Picard',   role: 'CEO' },
      { slot: 1,  id: 'bp-agent-251', name: 'William Riker',     role: 'COO' },
      { slot: 2,  id: 'bp-agent-253', name: 'Worf',              role: 'Security' },
      { slot: 3,  id: 'bp-agent-252', name: 'Deanna Troi',       role: 'Insights' },
      { slot: 4,  id: 'bp-agent-254', name: 'Data',              role: 'Analytics' },
      { slot: 5,  id: 'bp-agent-255', name: 'Geordi La Forge',   role: 'CTO' },
      { slot: 6,  id: 'bp-agent-256', name: 'Beverly Crusher',   role: 'QA' },
      { slot: 7,  id: 'bp-agent-257', name: 'Wesley Crusher',    role: 'Automation' },
      { slot: 8,  id: 'bp-agent-259', name: "Miles O'Brien",     role: 'DevOps' },
      { slot: 9,  id: 'bp-agent-262', name: 'Tasha Yar',         role: 'Tactical' },
      { slot: 10, id: 'bp-agent-263', name: 'Reginald Barclay',  role: 'Systems' },
      { slot: 11, id: 'bp-agent-258', name: 'Guinan',            role: 'Advisory' },
    ],
  };

  const STAR_DESTROYER = {
    shipId: 'ship-46',
    name: 'Executor',
    classId: 'class-4',
    crew: [
      { slot: 0,  id: 'bp-agent-242',  name: 'Darth Vader',              role: 'CEO' },
      { slot: 1,  id: 'agent-palpatine', name: 'Emperor Palpatine',      role: 'Command' },
      { slot: 2,  id: 'bp-agent-244',  name: 'Admiral Thrawn',           role: 'Intelligence' },
      { slot: 3,  id: 'bp-agent-243',  name: 'Grand Moff Tarkin',        role: 'Communications' },
      { slot: 4,  id: 'bp-agent-245',  name: 'Director Krennic',         role: 'R&D' },
      { slot: 5,  id: 'bp-agent-246',  name: 'General Veers',            role: 'Operations' },
      { slot: 6,  id: 'bp-agent-248',  name: 'Admiral Piett',            role: 'Logistics' },
      { slot: 7,  id: 'bp-agent-247',  name: 'Agent Kallus',             role: 'Compliance' },
      { slot: 8,  id: 'agent-yularen', name: 'Grand Admiral Yularen',    role: 'Analytics' },
      { slot: 9,  id: 'agent-jerjerrod', name: 'Moff Jerjerrod',         role: 'Logistics' },
      { slot: 10, id: 'agent-needa',   name: 'Captain Needa',            role: 'Support' },
      { slot: 11, id: 'bp-agent-249',  name: 'Captain Pellaeon',         role: 'Success' },
    ],
  };

  /* ═══════════════════════════════════════════════════════════════
     MISSION DEFINITIONS
  ═══════════════════════════════════════════════════════════════ */

  const ENTERPRISE_MISSIONS = [
    { title: 'Analyze Q3 revenue trends and flag anomalies',              agentId: 'bp-agent-254', agentName: 'Data',              priority: 'high' },
    { title: 'Write API documentation for the /missions endpoint',        agentId: 'bp-agent-256', agentName: 'Beverly Crusher',    priority: 'medium' },
    { title: 'Design a database migration plan for user preferences v2',  agentId: 'bp-agent-255', agentName: 'Geordi La Forge',    priority: 'high' },
    { title: 'Draft a weekly stakeholder status report',                  agentId: 'bp-agent-251', agentName: 'William Riker',      priority: 'medium' },
    { title: 'Audit the authentication flow for security vulnerabilities', agentId: 'bp-agent-253', agentName: 'Worf',              priority: 'critical' },
  ];

  const DESTROYER_MISSIONS = [
    { title: 'Develop a competitive intelligence briefing on market entrants', agentId: 'bp-agent-244', agentName: 'Admiral Thrawn',      priority: 'high' },
    { title: 'Create a project roadmap for the Q2 product launch',            agentId: 'bp-agent-245', agentName: 'Director Krennic',     priority: 'high' },
    { title: 'Write a press release for the new enterprise tier',             agentId: 'bp-agent-243', agentName: 'Grand Moff Tarkin',    priority: 'medium' },
    { title: 'Build an operational dashboard showing fleet deployment metrics', agentId: 'bp-agent-246', agentName: 'General Veers',       priority: 'medium' },
    { title: 'Review vendor contracts for compliance with data protection regulations', agentId: 'bp-agent-247', agentName: 'Agent Kallus', priority: 'critical' },
  ];

  /* ═══════════════════════════════════════════════════════════════
     STEP 1: Activate Ships & Agents
  ═══════════════════════════════════════════════════════════════ */

  function activateFleet(ship) {
    log(`Activating ${ship.name}...`);
    Blueprints.activateShip(ship.shipId);

    const slotAssignments = {};
    const agentIds = [];

    ship.crew.forEach(member => {
      Blueprints.activateAgent(member.id);
      slotAssignments[String(member.slot)] = member.id;
      agentIds.push(member.id);
    });

    Blueprints.saveShipState(ship.shipId, {
      slot_assignments: slotAssignments,
      status: 'deployed',
      agent_ids: agentIds,
      class_id: ship.classId,
    });

    log(`  ✓ ${ship.name}: ${ship.crew.length} agents assigned, status=deployed`);
    return { slotAssignments, agentIds };
  }

  activateFleet(ENTERPRISE);
  activateFleet(STAR_DESTROYER);

  /* ═══════════════════════════════════════════════════════════════
     STEP 2: Create Missions
  ═══════════════════════════════════════════════════════════════ */

  async function createMissions(missions, shipName) {
    log(`Creating ${missions.length} missions for ${shipName}...`);
    const user = State.get('user');
    const userId = user?.id || null;
    const created = [];

    const spaceships = State.get('spaceships') || [];
    const spaceshipId = spaceships[0]?.id || null;

    for (const m of missions) {
      const row = {
        user_id: userId,
        spaceship_id: spaceshipId,
        title: m.title,
        agent_id: m.agentId,
        agent_name: m.agentName,
        status: 'queued',
        priority: m.priority,
        progress: 0,
        result: null,
      };

      // Try Supabase if authenticated + a ship exists
      let saved = null;
      if (userId && spaceshipId && typeof SB !== 'undefined' && SB.isReady()) {
        try {
          saved = await SB.db('mission_runs').create(row);
        } catch (e) {
          log(`  ⚠ DB create failed for "${m.title}": ${e.message}`);
        }
      } else if (!spaceshipId) {
        log(`  ⚠ Skipping DB insert for "${m.title}" — no active spaceship.`);
      }

      // Fallback to local-only mission
      const local = saved || {
        ...row,
        id: 'mission-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        created_at: new Date().toISOString(),
      };

      created.push(local);
      log(`  ✓ ${m.priority.toUpperCase()} — "${m.title}" → ${m.agentName}`);
    }

    return created;
  }

  const enterpriseMissions = await createMissions(ENTERPRISE_MISSIONS, 'Enterprise');
  const destroyerMissions = await createMissions(DESTROYER_MISSIONS, 'Star Destroyer');

  /* ═══════════════════════════════════════════════════════════════
     STEP 3: Update State for UI
  ═══════════════════════════════════════════════════════════════ */

  // Merge missions into State
  const existingMissions = State.get('missions') || [];
  const allMissions = [...existingMissions, ...enterpriseMissions, ...destroyerMissions];
  State.set('missions', allMissions);
  log(`State.missions updated: ${allMissions.length} total missions`);

  // Refresh agents and spaceships from Blueprints
  if (Blueprints.getActivatedAgents) {
    State.set('agents', Blueprints.getActivatedAgents());
  }
  if (Blueprints.getActivatedShips) {
    State.set('spaceships', Blueprints.getActivatedShips());
  }

  // Award XP
  if (typeof Gamification !== 'undefined') {
    Gamification.addXP('launch_spaceship');
    Gamification.addXP('launch_spaceship');
    for (let i = 0; i < 24; i++) Gamification.addXP('create_agent');
    log(`XP awarded: 2× launch_spaceship + 24× create_agent`);
  }

  log('═══════════════════════════════════════════════');
  log('✅ Setup complete!');
  log(`   Enterprise NCC-1701-D: 12 crew, 5 missions`);
  log(`   Star Destroyer Executor: 12 crew, 5 missions`);
  log(`   Total: 24 agents, 10 missions queued`);
  log('═══════════════════════════════════════════════');
  log('Navigate to #/dock to see your fleet.');
  log('Navigate to #/missions to see queued missions.');

  return { enterpriseMissions, destroyerMissions };
})();
