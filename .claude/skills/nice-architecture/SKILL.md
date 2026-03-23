---
name: nice-architecture
description: NICE SPA architecture reference — IIFE modules, State pub/sub, routing, BlueprintStore, Gamification. Auto-triggers when working on NICE features or understanding codebase structure.
user-invocable: true
---

# NICE Architecture

## Module Pattern
All JS uses IIFE (Immediately-Invoked Function Expression) — no build step, no bundler:
```javascript
const ModuleName = (() => {
  // Private state
  let _cache = {};
  // Private functions
  function _helper() {}
  // Public API
  return { init, getData, setData };
})();
```

## Script Load Order (app/index.html)
```
state.js → supabase.js → router.js → [19 view scripts] →
audit-log.js → data-io.js → activity-feed.js → notify.js → gamification.js →
command-palette.js → keyboard.js → onboarding.js → nice.js
```

## Core Modules

### State (pub/sub store)
```javascript
State.set('key', value);          // Set + notify
State.get('key');                 // Read
State.on('key', callback);       // Subscribe (fires immediately if value exists)
State.off('key', callback);      // Unsubscribe
State.setBatched({ k1: v1 });    // Coalesced update via rAF
```

### Router (hash-based SPA)
```javascript
Router.on('/path', ViewModule);         // Register route
Router.on('/path/:id', DetailView);     // Parameterized route
Router.navigate('#/path');              // Navigate
Router.current();                       // Get current route info
```

### BlueprintStore (data layer)
```javascript
BlueprintStore.getAgent(id);            // Get agent blueprint
BlueprintStore.getSpaceship(id);        // Get spaceship blueprint
BlueprintStore.getActivatedAgents();    // All activated agents
BlueprintStore.getActivatedShips();     // All activated ships
BlueprintStore.activateAgent(bpId);     // Activate a blueprint
BlueprintStore.deactivateAgent(bpId);   // Deactivate
BlueprintStore.saveShipState(id, state); // Save slot assignments
```

### Gamification
```javascript
Gamification.addXP('action_name');      // Award XP (streak multiplied)
Gamification.addMissionXP(mission);     // XP with priority scaling
Gamification.getRank();                 // Current rank object
Gamification.getXP();                   // Total XP
Gamification.checkAchievements();       // Evaluate unlock criteria
Gamification.getStreakMultiplier();     // 1.0x–2.0x
Gamification.recordAgentMission(id, opts); // Track agent stats
```

## App Structure
```
Mission Control (#/) — 6 tabs:
  Schematic + Available Agents
  Missions (→ MissionsView)
  Analytics (→ AnalyticsView)
  Workflows (→ WorkflowsView)
  Cost Tracker (→ CostView)
  Ship's Log (→ AuditLogView)

Blueprints Terminal (#/blueprints) — 3 tabs:
  Agents (274 blueprints + YOUR AGENTS activated section)
  Spaceships (587 blueprints + YOUR SPACESHIPS)
  Themes (19 blueprints + YOUR THEMES)
```

## Sidebar
- Mission Control — main dashboard
- Blueprints — terminal for all blueprints
- Popover menu: Settings, Integrations, Wallet, Security, Log Out

## Key localStorage Keys
| Key | Purpose |
|-----|---------|
| `ns-theme` | Active theme name |
| `nice-xp` | Gamification XP |
| `nice-achievements` | Unlocked achievement IDs |
| `nice-tokens` | Token balance |
| `nice-audit-log` | Audit log (max 500 FIFO) |
| `nice-workflows` | Workflow definitions |
| `nice-bp-activated-agents` | Activated agent IDs |
| `nice-bp-activated-ships` | Activated ship IDs |
| `nice-ship-state` | Spaceship slot assignments |
| `nice-agent-stats` | Per-agent progression stats |

## View Lifecycle
```javascript
const MyView = (() => {
  const title = 'View Title';
  function render(el) {
    const user = State.get('user');
    if (!user) return _authPrompt(el, 'this view');
    el.innerHTML = `...`;
    // Bind events, load data
  }
  function destroy() {
    // Clean up State listeners, channels
  }
  return { title, render, destroy };
})();
```

## Supabase Integration
```javascript
SB.db('table').list({ userId, orderBy, limit });  // Query
SB.db('table').create(row);                        // Insert
SB.db('table').update(id, row);                    // Update
SB.db('table').get(id);                            // Single row
SB.auth().user;                                    // Current user
```
