/* ═══════════════════════════════════════════════════════════════════
   NICE — Documentation Hub
   Route: #/bridge?tab=documentation  (also rendered as a Bridge tab)
   In-app reference for getting started, agent building, workflows,
   MCP integrations, and the token/XP system.
═══════════════════════════════════════════════════════════════════ */

const DocsView = (() => {
  const title = 'Docs';
  const _esc = Utils.esc;

  let _el = null;
  let _activeSection = 'getting-started';
  let _searchQuery = '';

  /* ── Section definitions ── */
  const SECTIONS = [
    { id: 'getting-started', label: 'Getting Started', icon: '🚀' },
    { id: 'agents',          label: 'Agents',          icon: '🤖' },
    { id: 'spaceships',      label: 'Spaceships',      icon: '🚀' },
    { id: 'missions',        label: 'Missions',        icon: '📋' },
    { id: 'workflows',       label: 'Workflows',       icon: '🔀' },
    { id: 'integrations',    label: 'Integrations',    icon: '🔌' },
    { id: 'models',          label: 'AI Models',       icon: '🧠' },
    { id: 'tokens',          label: 'Tokens & XP',     icon: '⚡' },
    { id: 'keyboard',        label: 'Keyboard',        icon: '⌨️' },
  ];

  /* ══════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════ */
  function render(el) {
    _el = el;

    // Read section from URL (?s=agents)
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const urlSection = params.get('s');
    if (urlSection && SECTIONS.find(s => s.id === urlSection)) {
      _activeSection = urlSection;
    }

    el.innerHTML = `
      <div class="docs-wrap">
        <nav class="docs-sidebar">
          <div class="docs-search-wrap">
            <input type="text" class="docs-search" id="docs-search" placeholder="Search docs…" />
          </div>
          <ul class="docs-nav" id="docs-nav">
            ${SECTIONS.map(s => `
              <li>
                <button class="docs-nav-btn${s.id === _activeSection ? ' active' : ''}" data-section="${s.id}">
                  <span class="docs-nav-icon">${s.icon}</span>
                  <span>${s.label}</span>
                </button>
              </li>
            `).join('')}
          </ul>
        </nav>
        <main class="docs-content" id="docs-content">
          ${_renderSection(_activeSection)}
        </main>
      </div>
    `;

    _bindEvents();
  }

  function _bindEvents() {
    // Section nav
    document.getElementById('docs-nav')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-section]');
      if (!btn) return;
      _activeSection = btn.dataset.section;
      history.replaceState(null, '', `#/bridge?tab=documentation&s=${_activeSection}`);
      document.querySelectorAll('.docs-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.section === _activeSection));
      const content = document.getElementById('docs-content');
      if (content) {
        content.innerHTML = _renderSection(_activeSection);
        content.scrollTop = 0;
      }
    });

    // Search result clicks → navigate to section
    document.getElementById('docs-content')?.addEventListener('click', e => {
      const hit = e.target.closest('.docs-search-hit[data-section]');
      if (!hit) return;
      _activeSection = hit.dataset.section;
      _searchQuery = '';
      const searchInput = document.getElementById('docs-search');
      if (searchInput) searchInput.value = '';
      history.replaceState(null, '', `#/bridge?tab=documentation&s=${_activeSection}`);
      document.querySelectorAll('.docs-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.section === _activeSection));
      const content = document.getElementById('docs-content');
      if (content) {
        content.innerHTML = _renderSection(_activeSection);
        content.scrollTop = 0;
      }
    });

    // Search
    document.getElementById('docs-search')?.addEventListener('input', e => {
      _searchQuery = e.target.value.toLowerCase().trim();
      if (_searchQuery.length >= 2) {
        const content = document.getElementById('docs-content');
        if (content) content.innerHTML = _renderSearchResults();
      } else if (_searchQuery.length === 0) {
        const content = document.getElementById('docs-content');
        if (content) content.innerHTML = _renderSection(_activeSection);
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     SEARCH
  ══════════════════════════════════════════════════════════════════ */
  function _renderSearchResults() {
    const matches = [];
    for (const s of SECTIONS) {
      const content = _getSectionText(s.id);
      if (content.toLowerCase().includes(_searchQuery)) {
        // Extract snippet around match
        const idx = content.toLowerCase().indexOf(_searchQuery);
        const start = Math.max(0, idx - 60);
        const end = Math.min(content.length, idx + _searchQuery.length + 60);
        const snippet = (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
        matches.push({ section: s, snippet });
      }
    }

    if (!matches.length) {
      return `
        <div class="docs-empty">
          <h2>No results</h2>
          <p>No documentation matched "${_esc(_searchQuery)}".</p>
        </div>
      `;
    }

    return `
      <div class="docs-search-results">
        <h2 class="docs-h2">Search Results</h2>
        <p class="docs-muted">${matches.length} section${matches.length !== 1 ? 's' : ''} matched</p>
        ${matches.map(m => `
          <button class="docs-search-hit" data-section="${m.section.id}">
            <span class="docs-search-hit-title">${m.section.icon} ${m.section.label}</span>
            <span class="docs-search-hit-snippet">${_esc(m.snippet)}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  /* ══════════════════════════════════════════════════════════════════
     SECTION CONTENT
  ══════════════════════════════════════════════════════════════════ */
  function _renderSection(id) {
    const fn = _sectionRenderers[id];
    return fn ? fn() : '<p>Section not found.</p>';
  }

  function _getSectionText(id) {
    const el = document.createElement('div');
    el.innerHTML = _renderSection(id);
    return el.textContent || '';
  }

  const _sectionRenderers = {

    'getting-started': () => `
      <h1 class="docs-h1">Getting Started</h1>
      <p class="docs-intro">Welcome to NICE — the Neural Intelligence Command Engine. Build, deploy, and manage AI agent fleets from a single dashboard.</p>

      <h2 class="docs-h2">Quick Start</h2>
      <ol class="docs-steps">
        <li>
          <strong>Sign in</strong> — Create an account or sign in with Google. Gemini 2.5 Flash is unlimited and always free — no API keys, no token meter.
        </li>
        <li>
          <strong>Browse the Bridge</strong> — Explore 900+ pre-built blueprints in the catalog (~690 agents and ~235 spaceships). Filter by category, rarity, or search by name.
        </li>
        <li>
          <strong>Activate your first agent</strong> — Click any agent card and hit <kbd>Activate</kbd>. The agent appears in your fleet.
        </li>
        <li>
          <strong>Run a mission</strong> — Type into the prompt panel ("Ask NICE…") at the bottom of the screen, or open an agent's detail page for a dedicated chat. Responses stream in real-time.
        </li>
        <li>
          <strong>Build a spaceship</strong> — Activate a spaceship blueprint to create a multi-agent team. Assign agents to crew slots and let them collaborate via the Ship's Log.
        </li>
      </ol>

      <h2 class="docs-h2">Core Concepts</h2>
      <div class="docs-grid">
        <div class="docs-card">
          <h3>Agents</h3>
          <p>Individual AI workers with specific skills — writing, coding, research, design, and more. Each has a system prompt, tools, and a preferred model.</p>
        </div>
        <div class="docs-card">
          <h3>Spaceships</h3>
          <p>Orchestrators with a crew of agents. A spaceship is the unit that runs a mission — it routes the prompt to the right crew member via the WorkflowEngine.</p>
        </div>
        <div class="docs-card">
          <h3>Missions</h3>
          <p>Reusable templates: which Spaceship runs what plan, on what schedule, toward what outcome. Each execution is a Run with its own state.</p>
        </div>
        <div class="docs-card">
          <h3>Blueprints</h3>
          <p>Templates for agents and spaceships. The catalog has 900+ pre-built blueprints. You can also build custom ones in the Workshop.</p>
        </div>
      </div>

      <h2 class="docs-h2">Interface Overview</h2>
      <dl class="docs-dl">
        <dt>Sidebar</dt>
        <dd>Bridge, Code, and Chats. The Profile card at the bottom opens a popover with Settings, Integrations, Wallet, and Security.</dd>
        <dt>Bridge</dt>
        <dd>Your main hub — Schematic (active spaceship), Blueprints (catalog and Workshop), Missions, Outbox, Operations, Captain's Log, and Documentation.</dd>
        <dt>Prompt Panel</dt>
        <dd>The "Ask NICE…" input pinned at the bottom of every screen. Talk to your agents from anywhere. Press <kbd>Cmd+K</kbd> for the command palette.</dd>
        <dt>Theme</dt>
        <dd>The Theme button at the top of the sidebar opens the switcher for your visual skin, rank badge, and notification alerts.</dd>
      </dl>
    `,

    'agents': () => `
      <h1 class="docs-h1">Agents</h1>
      <p class="docs-intro">Agents are AI workers with specialized skills. Each agent has a system prompt that defines its personality, knowledge, and capabilities.</p>

      <h2 class="docs-h2">Activating Agents</h2>
      <p>Browse the catalog on the Bridge (Blueprints → Agents) and click <kbd>Activate</kbd> on any card. Activated agents appear in your fleet and can receive missions.</p>
      <p>Free pilots get <strong>6 crew slots</strong> at every rank. Rank progression unlocks higher-rarity blueprints, not more slots:</p>
      <table class="docs-table">
        <thead><tr><th>Rank</th><th>XP Required</th><th>Max Rarity Unlocked</th></tr></thead>
        <tbody>
          <tr><td>Ensign</td><td>0</td><td>Common</td></tr>
          <tr><td>Lieutenant JG</td><td>10,000</td><td>Common</td></tr>
          <tr><td>Lieutenant</td><td>25,000</td><td>Rare</td></tr>
          <tr><td>Lt Commander</td><td>50,000</td><td>Rare</td></tr>
          <tr><td>Commander</td><td>100,000</td><td>Epic</td></tr>
          <tr><td>Captain</td><td>200,000</td><td>Legendary</td></tr>
          <tr><td>Fleet Captain → Fleet Admiral</td><td>350K – 2.5M</td><td>Legendary</td></tr>
        </tbody>
      </table>
      <p><strong>Pro subscribers</strong> get 12 Legendary slots immediately — no XP grind. <strong>Mythic</strong> rarity is milestone-only: even Pro subscribers earn it through achievements (e.g. dock a Legendary agent, ship 3+ spaceships), never via rank or subscription.</p>

      <h2 class="docs-h2">Building Custom Agents</h2>
      <p>Open the Bridge → Blueprints → Workshop and click <strong>+ Create</strong> to launch the Agent Builder. Configure:</p>
      <ul class="docs-ul">
        <li><strong>Name &amp; description</strong> — how the agent appears in the catalog</li>
        <li><strong>System prompt</strong> — instructions that shape the agent's behavior</li>
        <li><strong>Model</strong> — preferred LLM (Gemini, Claude, GPT, Grok, Llama). NICE Auto picks the best available if unset.</li>
        <li><strong>Tools</strong> — capabilities like web browsing, image/video generation, file operations, or MCP connections</li>
        <li><strong>Category &amp; tags</strong> — for organization and search</li>
      </ul>

      <h2 class="docs-h2">Agent Categories</h2>
      <div class="docs-grid">
        <div class="docs-card"><h3>Writing</h3><p>Content creation, editing, copywriting, technical writing</p></div>
        <div class="docs-card"><h3>Coding</h3><p>Software development, debugging, code review, DevOps</p></div>
        <div class="docs-card"><h3>Research</h3><p>Web research, data analysis, competitive intelligence</p></div>
        <div class="docs-card"><h3>Design</h3><p>UI/UX, image generation, brand design</p></div>
        <div class="docs-card"><h3>Business</h3><p>Strategy, finance, marketing, operations</p></div>
        <div class="docs-card"><h3>Productivity</h3><p>Email, calendar, task management, automation</p></div>
      </div>
    `,

    'spaceships': () => `
      <h1 class="docs-h1">Spaceships</h1>
      <p class="docs-intro">A spaceship is an orchestrator with a crew of agents. It's the unit that runs a Mission — every Run lives on a Ship, even if the crew is just one agent.</p>

      <h2 class="docs-h2">How Spaceships Work</h2>
      <ol class="docs-steps">
        <li><strong>Activate a spaceship</strong> from the catalog or build one in the Workshop</li>
        <li><strong>Assign crew</strong> — drop agents into the spaceship's crew slots in the Schematic view</li>
        <li><strong>Send a mission</strong> — by default the Ship runs a <em>triage</em> step: an LLM router reads your prompt + the crew manifest and dispatches to the best-fit agent</li>
        <li><strong>Agents collaborate</strong> via the Ship's Log — a shared conversation context every crew member can read and append to</li>
      </ol>

      <h2 class="docs-h2">Ship Classes</h2>
      <table class="docs-table">
        <thead><tr><th>Class</th><th>Crew Size</th><th>Best For</th></tr></thead>
        <tbody>
          <tr><td>Scout</td><td>1–2 agents</td><td>Simple focused tasks</td></tr>
          <tr><td>Cruiser</td><td>3–5 agents</td><td>Multi-domain projects</td></tr>
          <tr><td>Dreadnought</td><td>6–10 agents</td><td>Complex operations</td></tr>
          <tr><td>Flagship</td><td>11+ agents</td><td>Enterprise-scale orchestration</td></tr>
        </tbody>
      </table>

      <h2 class="docs-h2">MCPs Mount at the Ship Level</h2>
      <p>External integrations (Google Workspace, Microsoft 365, custom MCP servers) are connected to the spaceship, not to individual agents. Every crew member on the ship inherits the connections, so a single OAuth grant covers the whole crew.</p>

      <h2 class="docs-h2">Crew Designer</h2>
      <p>Use the Crew Designer (<strong>Build an AI Team</strong> on the home screen) to describe your business in plain English. NICE proposes a spaceship configuration — picks a hull, fills the slots with agents whose roles match what you described, and lets you adjust before you deploy.</p>
    `,

    'missions': () => `
      <h1 class="docs-h1">Missions</h1>
      <p class="docs-intro">A Mission is a reusable template: which Spaceship runs what plan, on what schedule, toward what outcome. Each execution is a <strong>Run</strong> with its own state.</p>

      <h2 class="docs-h2">Running Missions</h2>
      <ul class="docs-ul">
        <li><strong>Ship-level chat</strong> — open a spaceship's Schematic view and chat. The Ship runs your prompt as a Run with full audit, cancel, and analytics.</li>
        <li><strong>Agent chat</strong> — visit an agent's detail page for a request-response conversation (no Run lifecycle, lighter for casual use).</li>
        <li><strong>Top-level NICE chat</strong> — the "Ask NICE…" prompt at <kbd>#/</kbd>. Ephemeral, no persistence beyond your local message history.</li>
        <li><strong>Scheduled Mission</strong> — save a Mission with a cron schedule and the Ship will fire Runs automatically.</li>
      </ul>

      <h2 class="docs-h2">Run States</h2>
      <dl class="docs-dl">
        <dt>Queued</dt><dd>Waiting to be picked up by the executor</dd>
        <dt>Running</dt><dd>The Ship is actively executing the plan</dd>
        <dt>Review</dt><dd>An <code>approval_gate</code> node is waiting for your decision (used in approval-mode workflows)</dd>
        <dt>Completed</dt><dd>Run finished successfully — results stored in <code>node_results</code></dd>
        <dt>Failed</dt><dd>Something went wrong — check the error details and retry</dd>
        <dt>Cancelled</dt><dd>You stopped the Run mid-flight via the cancel button</dd>
      </dl>

      <h2 class="docs-h2">Streaming</h2>
      <p>Run results stream in real-time via Server-Sent Events. Tokens appear as the model generates them — no waiting for the full response. Tool calls and observations from a ReAct agent stream in the same channel.</p>

      <h2 class="docs-h2">Plans &amp; Workflows</h2>
      <p>Every Run executes a <em>plan</em> — a JSONB graph of nodes stored on the Mission as <code>missions.plan</code>. A single-agent ship runs a 1-node plan; a complex orchestration uses multiple nodes connected as a DAG. See the <strong>Workflows</strong> section for the full node-type catalog (triage, pipeline, parallel, quality_loop, approval_gate, condition, branch, loop, delay, webhook, notify, output).</p>

      <h2 class="docs-h2">Default: Triage</h2>
      <p>When you chat with a multi-agent spaceship, the default plan is a single <strong>triage</strong> node: an LLM router reads your prompt + the crew manifest and picks the single best-fit agent to handle the task. To use a different orchestration pattern (pipeline, parallel, quality-loop, etc.), build a Mission with that plan in the Workshop.</p>
    `,

    'workflows': () => `
      <h1 class="docs-h1">Workflows</h1>
      <p class="docs-intro">A workflow is the DAG of steps a Mission executes. Workflows are not standalone primitives — they live inside a Mission as <code>missions.plan</code> JSONB. Single-agent missions are 1-node workflows; complex orchestrations chain many nodes.</p>

      <h2 class="docs-h2">Node Types</h2>
      <table class="docs-table">
        <thead><tr><th>Node</th><th>Purpose</th></tr></thead>
        <tbody>
          <tr><td>agent</td><td>Run a prompt through a specific agent (full ReAct loop with tools)</td></tr>
          <tr><td>triage</td><td>LLM router picks the single best-fit crew member from the manifest</td></tr>
          <tr><td>pipeline</td><td>Sequential assembly line: agent 1 → 2 → 3, each refining the prior output</td></tr>
          <tr><td>parallel</td><td>Run the same prompt across multiple agents simultaneously, then merge</td></tr>
          <tr><td>quality_loop</td><td>Agent runs → reviewer scores 1–10 → if below threshold, retry with feedback (up to 3 iterations)</td></tr>
          <tr><td>approval_gate</td><td>Pause the Run in <em>review</em> state until you approve or reject</td></tr>
          <tr><td>condition</td><td>Pass or block downstream nodes based on an expression</td></tr>
          <tr><td>branch</td><td>Route to different paths based on conditions</td></tr>
          <tr><td>loop</td><td>Iterate over lines or JSON arrays, fanning out to a sub-plan per item</td></tr>
          <tr><td>delay</td><td>Pause execution for a set time</td></tr>
          <tr><td>webhook</td><td>POST data to an external URL</td></tr>
          <tr><td>notify</td><td>Send a notification (toast, email, etc.)</td></tr>
          <tr><td>output</td><td>Format and capture the final result</td></tr>
        </tbody>
      </table>

      <h2 class="docs-h2">The WorkflowEngine</h2>
      <p>The WorkflowEngine is the sole executor for plans. It walks the DAG, dispatches each node to its handler (agents go through <code>AgentExecutor</code>, the rest are inline), persists results to <code>mission_runs.node_results</code>, and emits stream events. There is no parallel router or competing dispatcher.</p>

      <h2 class="docs-h2">Triggers</h2>
      <dl class="docs-dl">
        <dt>Manual</dt><dd>Run on demand from the prompt panel, ship chat, or Mission detail page</dd>
        <dt>Scheduled</dt><dd>Stored as <code>missions.schedule</code> JSONB (<code>{ cron, tz, enabled }</code>) — fired by the <code>tick_mission_schedules</code> pg_cron job every minute</dd>
      </dl>
    `,

    'integrations': () => `
      <h1 class="docs-h1">Integrations</h1>
      <p class="docs-intro">Connect external services so your agents can read and write emails, manage calendars, work with documents, and more. Integrations attach to a spaceship — every crew member inherits the connection.</p>

      <h2 class="docs-h2">Google Workspace</h2>
      <p>Sign in with Google (any account — Gmail, Workspace, any domain) to connect Gmail, Calendar, and Drive. Agents get:</p>
      <ul class="docs-ul">
        <li><strong>Gmail</strong> — search and read emails, send / draft / reply, manage labels (<code>gmail.modify</code> scope)</li>
        <li><strong>Calendar</strong> — read events, check availability, create / update / delete events (<code>calendar</code> scope)</li>
        <li><strong>Drive</strong> — search and read files, create / update / upload files (<code>drive.file</code> scope — limited to files the app creates or opens)</li>
      </ul>
      <p>OAuth tokens are stored in Supabase and auto-refreshed by <code>mcp-gateway</code> before each tool call. Write tools are gated by the ship's approval mode — in <em>review</em> mode, side-effect tools (send, create, delete) trigger an inline approval prompt before execution.</p>

      <h2 class="docs-h2">Microsoft 365</h2>
      <p>Sign in with Microsoft to connect Outlook Mail, Outlook Calendar, OneDrive, and SharePoint. Same model as Google — OAuth at the spaceship level, all agents inherit the connection. Live as of 2026-04-24.</p>

      <h2 class="docs-h2">Adding Custom MCPs</h2>
      <p>Any MCP-compatible server can be connected. Open <strong>Profile → Integrations</strong>, click <strong>Add Custom MCP</strong>, provide the server URL, select the transport (Streamable HTTP or SSE), and configure authentication.</p>
    `,

    'models': () => {
      let modelRows = '';
      if (typeof VaultView !== 'undefined' && VaultView.MODEL_CATALOG) {
        modelRows = VaultView.MODEL_CATALOG.map(m => `
          <tr>
            <td>${_esc(m.name)}</td>
            <td>${_esc(m.provider)}</td>
            <td><span class="docs-badge docs-badge-${m.tier === 'free' ? 'free' : 'pro'}">${m.tier === 'free' ? 'Free' : 'Premium'}</span></td>
            <td>${_esc(m.description || '')}</td>
          </tr>
        `).join('');
      } else {
        modelRows = `
          <tr><td>Gemini 2.5 Flash</td><td>Google</td><td><span class="docs-badge docs-badge-free">Free</span></td><td>Unlimited default model for all users</td></tr>
          <tr><td>Claude 4.6 Sonnet</td><td>Anthropic</td><td><span class="docs-badge docs-badge-pro">Premium</span></td><td>Best balance of speed, cost, and reasoning</td></tr>
          <tr><td>GPT-5.4 Pro</td><td>OpenAI</td><td><span class="docs-badge docs-badge-pro">Premium</span></td><td>1M context flagship</td></tr>
        `;
      }

      return `
        <h1 class="docs-h1">AI Models</h1>
        <p class="docs-intro">NICE is your AI provider — you never need API keys. Toggle models on/off in Integrations and agents use whichever you enable.</p>

        <h2 class="docs-h2">Available Models</h2>
        <table class="docs-table">
          <thead><tr><th>Model</th><th>Provider</th><th>Tier</th><th>Notes</th></tr></thead>
          <tbody>${modelRows}</tbody>
        </table>

        <h2 class="docs-h2">How Model Selection Works</h2>
        <ul class="docs-ul">
          <li><strong>Default:</strong> Gemini 2.5 Flash (free for everyone)</li>
          <li><strong>Per-agent:</strong> Set a preferred model in the Agent Builder</li>
          <li><strong>NICE Auto:</strong> Automatically picks the best available model based on task complexity</li>
          <li><strong>Model Intel:</strong> Over time, NICE learns which models perform best for each agent and optimizes automatically</li>
        </ul>

        <h2 class="docs-h2">Premium Models</h2>
        <p>Premium models (Claude, GPT, Gemini Pro) consume tokens from your balance. Free models (Gemini Flash, Gemini Lite) are unlimited. Manage your token balance in <strong>Wallet</strong>.</p>
      `;
    },

    'tokens': () => `
      <h1 class="docs-h1">Tokens &amp; XP</h1>
      <p class="docs-intro">NICE uses two systems: tokens for AI model usage and XP for progression.</p>

      <h2 class="docs-h2">Subscriptions</h2>
      <p>Gemini 2.5 Flash is free for everyone, always. Paid plans unlock larger model pools and more slots.</p>
      <table class="docs-table">
        <thead><tr><th>Plan</th><th>Price</th><th>What you get</th></tr></thead>
        <tbody>
          <tr><td>Free</td><td>$0</td><td>6 slots, Common blueprints, Gemini 2.5 Flash unlimited</td></tr>
          <tr><td>Pro</td><td>$9.99/mo</td><td>12 slots, Legendary instantly, 1,000 Standard tokens/month — covers GPT-5 mini, Llama 4 Scout, Grok 4.1 Fast</td></tr>
          <tr><td>Pro + Claude</td><td>+$9.99/mo</td><td>Claude 4.6 Sonnet &amp; 4.7 Opus, 500 Claude tokens/month</td></tr>
          <tr><td>Pro + Premium</td><td>+$9.99/mo</td><td>GPT-5.4 Pro, GPT-5.3 Codex, OpenAI o3, Gemini 2.5 Pro, 500 Premium tokens/month</td></tr>
        </tbody>
      </table>

      <h2 class="docs-h2">Token Top-ups</h2>
      <p>Need more headroom? Pro subscribers can buy top-ups that never expire. Each top-up credits the matching pool.</p>
      <table class="docs-table">
        <thead><tr><th>Pack</th><th>Pool</th><th>Tokens</th><th>Price</th></tr></thead>
        <tbody>
          <tr><td>Standard Boost</td><td>Standard</td><td>+1,000</td><td>$29.99</td></tr>
          <tr><td>Standard Max</td><td>Standard</td><td>+2,500</td><td>$49.99</td></tr>
          <tr><td>Claude Boost</td><td>Claude</td><td>+500</td><td>$29.99</td></tr>
          <tr><td>Claude Max</td><td>Claude</td><td>+1,250</td><td>$49.99</td></tr>
          <tr><td>Premium Boost</td><td>Premium</td><td>+500</td><td>$29.99</td></tr>
          <tr><td>Premium Max</td><td>Premium</td><td>+1,250</td><td>$49.99</td></tr>
        </tbody>
      </table>
      <p>Each pool is independent — Claude tokens cost more per message because Claude models are more expensive. Max packs are the best value (17% discount).</p>

      <h2 class="docs-h2">XP &amp; Ranks</h2>
      <p>Earn XP by using NICE. Every action contributes to your rank progression:</p>
      <ul class="docs-ul">
        <li><strong>Create an agent:</strong> 20 XP</li>
        <li><strong>Complete a mission:</strong> 15 XP</li>
        <li><strong>Chat with an agent:</strong> 5 XP</li>
        <li><strong>Create a workflow:</strong> 20 XP</li>
        <li><strong>Daily streaks</strong> multiply your XP earnings</li>
      </ul>

      <h2 class="docs-h2">Rank Progression</h2>
      <p>Higher ranks unlock rarer blueprints (Common → Rare → Epic → Legendary). There are 12 ranks from Ensign to Fleet Admiral. <strong>Mythic</strong> rarity is milestone-only — earned through achievements (e.g. dock a Legendary agent, ship 3+ spaceships), never via rank or subscription. Even Pro subscribers earn Mythic the same way.</p>
    `,

    'keyboard': () => {
      const modifierShortcuts = [
        ['Cmd/Ctrl + K', 'Command Palette'],
        ['Cmd/Ctrl + Shift + O', 'New Chat'],
        ['Cmd/Ctrl + Shift + P', 'Toggle Preview Panel'],
        ['?', 'Show Shortcuts overlay'],
      ];
      const navChords = [
        ['G  H', 'Go Bridge'],
        ['G  A', 'Go Agents'],
        ['G  S', 'Go Shipyard'],
        ['G  M', 'Go Missions'],
        ['G  B', 'Go Blueprints'],
        ['G  N', 'Go Operations'],
        ['G  C', 'Go Comms'],
        ['G  V', 'Go Vault'],
        ['G  P', 'Go Profile'],
        ['G  T', 'Go Settings'],
        ['G  L', "Go Captain's Log"],
        ['N  A', 'New Agent'],
      ];

      return `
        <h1 class="docs-h1">Keyboard Shortcuts</h1>
        <p class="docs-intro">Power-user shortcuts for faster navigation. Press <kbd>?</kbd> any time to bring up the live overlay.</p>

        <h2 class="docs-h2">Modifier Shortcuts</h2>
        <table class="docs-table">
          <thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
          <tbody>
            ${modifierShortcuts.map(([key, action]) => `<tr><td><kbd>${key}</kbd></td><td>${action}</td></tr>`).join('')}
          </tbody>
        </table>

        <h2 class="docs-h2">Navigation Chords</h2>
        <p>Two-key sequences with a 500ms window between presses. Tap <kbd>G</kbd> then a letter (release between presses) to navigate, <kbd>N</kbd> + letter to create.</p>
        <table class="docs-table">
          <thead><tr><th>Chord</th><th>Action</th></tr></thead>
          <tbody>
            ${navChords.map(([key, action]) => `<tr><td><kbd>${key}</kbd></td><td>${action}</td></tr>`).join('')}
          </tbody>
        </table>

        <h2 class="docs-h2">Command Palette</h2>
        <p>Press <kbd>Cmd+K</kbd> to open the command palette. Type to fuzzy-search across agents, views, actions, and settings. Hit Enter to execute.</p>
      `;
    },
  };

  /* ══════════════════════════════════════════════════════════════════
     CLEANUP
  ══════════════════════════════════════════════════════════════════ */
  function destroy() {
    _el = null;
    _searchQuery = '';
  }

  return { render, destroy, title };
})();
