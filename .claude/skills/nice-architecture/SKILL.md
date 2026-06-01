---
name: nice-architecture
description: NICE SPA architecture reference — IIFE modules, State pub/sub, routing, Blueprints, Gamification. Auto-triggers when working on NICE features or understanding codebase structure.
user-invocable: true
---

# NICE Architecture

> Module APIs and the file map are indexed in **CLAUDE.md** (the SSOT loaded every turn). This skill is the quick-reference for the patterns; when counts, routes, or view lists matter, trust CLAUDE.md over any number written here.

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
Modules load via `<script defer>` tags in `app/index.html` in dependency order. Invariant: **`state.js → supabase.js → router.js → [view scripts] → [lib scripts] → nice.js`**, with `nice.js` always last.

## Core Modules

### State (pub/sub store)
```javascript
State.set('key', value);          // Set + notify
State.get('key');                 // Read
State.on('key', callback);        // Subscribe (fires immediately if value exists)
State.off('key', callback);       // Unsubscribe
State.setBatched({ k1: v1 });     // Coalesced update via rAF
```

### Router (hash-based SPA)
```javascript
Router.on('/path', ViewModule);         // Register route
Router.on('/path/:id', DetailView);     // Parameterized route
Router.navigate('#/path');              // Navigate
Router.current();                       // Get current route info
```

### Blueprints (data layer)
```javascript
Blueprints.getAgent(id);            // Get one agent blueprint
Blueprints.listAgents(filter);      // List agent blueprints
Blueprints.getSpaceship(id);        // Get one spaceship blueprint
Blueprints.listSpaceships();        // List spaceship blueprints
Blueprints.getActivatedAgents();    // User's activated agents
Blueprints.getActivatedShips();     // User's activated ships
Blueprints.activateAgent(bpId);     // Activate a blueprint
Blueprints.deactivateAgent(bpId);   // Deactivate
Blueprints.saveShipState(id, state); // Persist a ship's slot state
```
Catalog data lives in the normalized Supabase tables (`spaceship_blueprints` / `agent_blueprints` / `ship_slots` / `roles` / `capabilities`). Schema SSOT: `docs/three-layer-schema.md`.

### Gamification
```javascript
Gamification.addXP('action_name');      // Award XP (streak multiplied)
Gamification.addMissionXP(mission);     // XP with priority scaling
Gamification.getRank();                 // Current rank object
Gamification.getXP();                   // Total XP
Gamification.checkAchievements();       // Evaluate unlock criteria
```

## Routes & structure

**Bridge (`#/bridge`) is the hub.** Its tabs: Schematic, Blueprints, Missions, Outbox, Operations, Log, Documentation, TRON. The Blueprints tab has Spaceships / Agents / Active / Workshop sub-tabs. Home is `#/`.

Detail and builder routes hang off Bridge: `#/bridge/agents/:id`, `#/bridge/spaceships/:id`, `#/bridge/agents/new`, `#/bridge/spaceships/new`. Standalone routes: `#/missions/new`, `#/security`, `#/settings`, `#/profile`, `#/theme-editor`, `#/moderation`, `#/tron`.

> The authoritative view → route table is in CLAUDE.md. Don't hardcode view counts or blueprint counts here — they drift.

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

## localStorage
All keys live in **`Utils.KEYS`** (the SSOT — never use raw string keys). Prefixes are `ns-` and `nice-`.
