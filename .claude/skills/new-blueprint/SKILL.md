---
name: new-blueprint
description: Add a new agent or spaceship blueprint to SEED data. Use when the user wants to create a new pre-built blueprint card for the catalog.
user-invocable: true
---

# Add a New Blueprint

## Agent Blueprint

Add to `SEED` array in `app/js/views/blueprints.js` (starts at line ~192):

```javascript
{ id:'bp-agent-XXX', name:'Agent Name', category:'Engineering', rarity:'Rare',
  rating:4.5, downloads:500,
  agentType:'Specialist',
  stats:{ spd:'3.0s', acc:'92%', cap:'500', pwr:'78' },
  config:{ role:'Engineering', type:'Code Agent', llm_engine:'claude-4',
    tools:['Code Exec','GitHub','Database','Shell'] },
  caps:['Capability 1','Capability 2','Capability 3'],
  tags:['tag1','tag2','tag3'],
  card_num:'NS-XXX',
  flavor:'Tagline goes here.',
  desc:'Detailed description of what this agent does.' },
```

### Agent Fields
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | Yes | `bp-agent-XXX` (unique) |
| name | string | Yes | Display name |
| category | string | Yes | Research/Analytics/Content/Engineering/Ops/Sales/Support/Legal/Marketing/Automation |
| rarity | string | Yes | Common/Rare/Epic/Legendary |
| rating | number | No | 1.0–5.0 |
| downloads | number | No | Popularity count |
| stats | object | Yes | `{ spd, acc, cap, pwr }` |
| config | object | Yes | `{ role, type, llm_engine, tools[] }` |
| caps | array | Yes | 3 capability strings |
| tags | array | Yes | Search tags |
| card_num | string | Yes | `NS-XXX` serial |
| flavor | string | Yes | Card tagline |
| desc | string | Yes | Full description |

### Rarity Guidelines
- **Common**: Basic single-purpose, 1-2 tools, general model
- **Rare**: Multi-tool specialist, 3-4 tools, good accuracy
- **Epic**: Advanced multi-domain, 5+ tools, high accuracy
- **Legendary**: Enterprise-grade, C-suite level, 6+ tools, exceptional stats

## Spaceship Blueprint

Add to `SPACESHIP_SEED` array in `app/js/views/blueprints.js` (starts at line ~1696):

```javascript
{ id:'fleet-XX', name:'Ship Name', category:'Engineering',
  class_id:'class-2', tier:'pro',
  flavor:'Tagline.', card_num:'NS-FXX',
  caps:['Cap 1','Cap 2','Cap 3'],
  stats:{ crew:'4', slots:'3', tier:'PRO', cost:'$49' },
  tags:['tag1','tag2'],
  desc:'Agent 1, Agent 2, Agent 3.' },
```

### Ship Classes
| Class | Name | Slots | Cost |
|-------|------|-------|------|
| class-1 | Scout | 2 | FREE |
| class-2 | Frigate | 3 | $49 |
| class-3 | Cruiser | 5 | $149 |
| class-4 | Dreadnought | 8 | $349 |
| class-5 | Flagship | 12 | $799 |

## After Adding
1. Verify syntax: `node -c app/js/views/blueprints.js`
2. Check card renders in Blueprints Terminal
3. Verify filters work (category, rarity)
4. Update blueprint counts in CLAUDE.md if significant
