# MCP & API Config View

## Context
Users need to connect external services (Google Workspace, Slack, Stripe, etc.) to their spaceships so all agents on that ship can use them. Currently there's no UI for managing these connections. The Security page already has a Vault tab — add two sibling tabs: **APIs** and **MCPs**.

## Architecture Decision
- **MCPs connect at the spaceship level**, not per-agent
- All agents on a spaceship inherit the ship's MCP connections
- Example: Connect Google Workspace to "Desert Dirt HQ" → all 6 agents can use Gmail, Drive, Calendar
- APIs are direct key-based integrations (Stripe, OpenAI, etc.)

## UI Location
Security view (`#/security`) — currently has Vault tab. Add:
- **Vault** (existing) — encrypted secrets
- **APIs** (new) — API key management
- **MCPs** (new) — MCP server connections

## APIs Tab Design
```
┌─────────────────────────────────────────┐
│ API Connections                          │
│ Connect API keys for direct integrations│
├─────────────────────────────────────────┤
│ ┌───────┐ ┌───────┐ ┌───────┐          │
│ │Stripe │ │OpenAI │ │Twilio │  ...      │
│ │  ✓    │ │  +    │ │  +    │          │
│ └───────┘ └───────┘ └───────┘          │
│                                         │
│ Connected (2):                          │
│ • Stripe — sk-live-****4242 — Active    │
│ • SendGrid — SG.****abcd — Active      │
└─────────────────────────────────────────┘
```

Fields per API:
- Service name (select from catalog or custom)
- API key (encrypted, stored in vault_secrets)
- Status (active/expired/error)
- Connected spaceship(s)
- Last used timestamp

## MCPs Tab Design
```
┌─────────────────────────────────────────┐
│ MCP Connections                         │
│ Connect MCP servers to your spaceships  │
├─────────────────────────────────────────┤
│ Spaceship: [Desert Dirt HQ ▾]           │
│                                         │
│ Available MCPs:                         │
│ ┌──────────────────┐ ┌────────────────┐│
│ │ Google Workspace  │ │ Slack          ││
│ │ Gmail, Drive, Cal │ │ Channels, DMs  ││
│ │ [Connect]         │ │ [Connect]      ││
│ └──────────────────┘ └────────────────┘│
│ ┌──────────────────┐ ┌────────────────┐│
│ │ GitHub            │ │ Notion         ││
│ │ Repos, PRs, Issues│ │ Pages, DBs     ││
│ │ [Connect]         │ │ [Connected ✓]  ││
│ └──────────────────┘ └────────────────┘│
│                                         │
│ + Add Custom MCP Server                 │
└─────────────────────────────────────────┘
```

Fields per MCP:
- Server name
- Server URL / transport (stdio, SSE, streamable HTTP)
- Auth method (OAuth, API key, none)
- Connected spaceship(s)
- Available tools (auto-discovered from MCP)
- Status (connected/disconnected/error)

## Data Model

### New table: `mcp_connections`
```sql
CREATE TABLE mcp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  spaceship_id TEXT NOT NULL,
  name TEXT NOT NULL,
  server_url TEXT,
  transport TEXT DEFAULT 'streamable-http',
  auth_type TEXT DEFAULT 'none',
  auth_config JSONB DEFAULT '{}',
  available_tools JSONB DEFAULT '[]',
  status TEXT DEFAULT 'disconnected',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### New table: `api_connections`
```sql
CREATE TABLE api_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  api_key_ref UUID REFERENCES vault_secrets(id),
  spaceship_ids TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'active',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

## MCP Catalog (Built-in)
Pre-configured MCP servers users can connect with one click:
- Google Workspace (Gmail, Drive, Calendar, Docs)
- Slack
- GitHub
- Notion
- Stripe
- Supabase
- Figma
- Linear
- Jira
- Custom (user-provided URL)

## Files to Create/Modify
1. **New:** `app/js/views/mcp-config.js` — MCP tab view
2. **New:** `app/js/views/api-config.js` — API tab view
3. **Modify:** `app/js/views/security.js` — add tabs for APIs and MCPs
4. **Modify:** `app/css/app.css` — styles for connection cards
5. **Modify:** `app/index.html` — add script tags
6. **Migration:** `004_mcp_api_connections.sql` — new tables

## Implementation Order
1. Create DB tables (migration)
2. Add tabs to Security view
3. Build API config tab (simpler — just key management)
4. Build MCP config tab (connection flow, tool discovery)
5. Wire spaceship → MCP relationship in BlueprintStore
6. Update agent executor to pass MCP tools to agents

## Verification
- Security page shows 3 tabs: Vault / APIs / MCPs
- Can add/remove API keys
- Can connect MCP to a spaceship
- Agents on that spaceship can see the MCP's tools
- Connection status updates in real-time
