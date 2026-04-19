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
          <strong>Sign in</strong> — Create an account or sign in with Google. You get 100K free tokens and access to Gemini 2.5 Flash immediately.
        </li>
        <li>
          <strong>Browse the Bridge</strong> — Explore 900+ agent and spaceship blueprints in the catalog. Filter by category, rarity, or search by name.
        </li>
        <li>
          <strong>Activate your first agent</strong> — Click any agent card and hit <kbd>Activate</kbd>. The agent appears in your fleet.
        </li>
        <li>
          <strong>Run a mission</strong> — Open the prompt panel (bottom of screen) or go to an agent's detail page and send it a task. Results appear in real-time.
        </li>
        <li>
          <strong>Build a spaceship</strong> — Activate a spaceship blueprint to create a multi-agent team. Assign agents to crew slots and let them collaborate.
        </li>
      </ol>

      <h2 class="docs-h2">Core Concepts</h2>
      <div class="docs-grid">
        <div class="docs-card">
          <h3>Agents</h3>
          <p>Individual AI workers with specific skills — writing, coding, research, design, and more. Each has a system prompt, tools, and model assignment.</p>
        </div>
        <div class="docs-card">
          <h3>Spaceships</h3>
          <p>Orchestrators that coordinate multiple agents. Think of them as project managers — they route tasks to the right crew member.</p>
        </div>
        <div class="docs-card">
          <h3>Missions</h3>
          <p>Tasks you assign to agents. A mission can be a simple prompt or a complex multi-step workflow. Results are saved and searchable.</p>
        </div>
        <div class="docs-card">
          <h3>Blueprints</h3>
          <p>Templates for agents and spaceships. The catalog has 900+ pre-built blueprints. You can also build custom ones from scratch.</p>
        </div>
      </div>

      <h2 class="docs-h2">Interface Overview</h2>
      <dl class="docs-dl">
        <dt>Sidebar</dt>
        <dd>Navigation between Bridge, Code, Chats, and Tasks. The footer has Settings, Integrations, and Wallet.</dd>
        <dt>Bridge</dt>
        <dd>Your main hub — browse blueprints, view your fleet, manage missions, and check analytics.</dd>
        <dt>Prompt Panel</dt>
        <dd>The chat input at the bottom of every screen. Talk to your agents from anywhere. Press <kbd>Cmd+K</kbd> for the command palette.</dd>
        <dt>Optics</dt>
        <dd>The top bar shows your rank, theme switcher, and notification alerts.</dd>
      </dl>
    `,

    'agents': () => `
      <h1 class="docs-h1">Agents</h1>
      <p class="docs-intro">Agents are AI workers with specialized skills. Each agent has a system prompt that defines its personality, knowledge, and capabilities.</p>

      <h2 class="docs-h2">Activating Agents</h2>
      <p>Browse the catalog on the Bridge (tab: Agents) and click <kbd>Activate</kbd> on any card. Activated agents appear in your fleet and can receive missions.</p>
      <p>The number of agents you can activate depends on your rank:</p>
      <table class="docs-table">
        <thead><tr><th>Rank</th><th>Slots</th><th>Max Rarity</th><th>XP Required</th></tr></thead>
        <tbody>
          <tr><td>Ensign</td><td>6</td><td>Common</td><td>0</td></tr>
          <tr><td>Lieutenant</td><td>8</td><td>Rare</td><td>25,000</td></tr>
          <tr><td>Commander</td><td>10</td><td>Epic</td><td>100,000</td></tr>
          <tr><td>Captain</td><td>12</td><td>Legendary</td><td>200,000</td></tr>
          <tr><td>Fleet Admiral</td><td>12</td><td>Mythic</td><td>2,500,000</td></tr>
        </tbody>
      </table>

      <h2 class="docs-h2">Building Custom Agents</h2>
      <p>Click <strong>+ New Agent</strong> on the Bridge to open the Agent Builder. Configure:</p>
      <ul class="docs-ul">
        <li><strong>Name &amp; description</strong> — how the agent appears in the catalog</li>
        <li><strong>System prompt</strong> — instructions that shape the agent's behavior</li>
        <li><strong>Model</strong> — which AI model powers this agent (Gemini, Claude, GPT, etc.)</li>
        <li><strong>Tools</strong> — capabilities like web browsing, file operations, or MCP connections</li>
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
      <p class="docs-intro">Spaceships are orchestrators — multi-agent teams that collaborate on complex tasks. Each spaceship has crew slots where you assign agents.</p>

      <h2 class="docs-h2">How Spaceships Work</h2>
      <ol class="docs-steps">
        <li><strong>Activate a spaceship</strong> from the catalog or build one from scratch</li>
        <li><strong>Assign crew</strong> — drag agents into the spaceship's crew slots</li>
        <li><strong>Send a mission</strong> — the spaceship's Mission Router decides which agent handles each part</li>
        <li><strong>Agents collaborate</strong> via the Ship's Log — a shared context that all crew can read</li>
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

      <h2 class="docs-h2">Crew Designer</h2>
      <p>Use the Crew Designer (<strong>Build an AI Team</strong> on the home screen) to describe your business in plain English. NICE will suggest an optimal spaceship configuration with the right agents for your needs.</p>
    `,

    'missions': () => `
      <h1 class="docs-h1">Missions</h1>
      <p class="docs-intro">Missions are tasks assigned to agents. They range from simple prompts to complex multi-step operations.</p>

      <h2 class="docs-h2">Running Missions</h2>
      <ul class="docs-ul">
        <li><strong>Prompt Panel</strong> — type at the bottom of any screen to send a mission to the active agent or spaceship</li>
        <li><strong>Agent Detail</strong> — visit an agent's page and use the dedicated chat</li>
        <li><strong>Bulk Run</strong> — queue multiple missions and run them in sequence</li>
      </ul>

      <h2 class="docs-h2">Mission States</h2>
      <dl class="docs-dl">
        <dt>Queued</dt><dd>Waiting to be executed</dd>
        <dt>Running</dt><dd>Agent is actively working on the task</dd>
        <dt>Review</dt><dd>Content awaiting your approval (for content queue items)</dd>
        <dt>Completed</dt><dd>Mission finished successfully — results available</dd>
        <dt>Failed</dt><dd>Something went wrong — check the error details</dd>
      </dl>

      <h2 class="docs-h2">Streaming</h2>
      <p>Mission results stream in real-time via SSE (Server-Sent Events). You see tokens appear as the AI generates them — no waiting for the full response.</p>

      <h2 class="docs-h2">Orchestration Modes</h2>
      <p>When you have a <strong>spaceship</strong> selected (multiple crew agents), the dropdown next to the model picker in the prompt panel lets you choose how the crew handles your task. Single-agent or NICE chats always use Auto.</p>
      <table class="docs-table">
        <thead><tr><th>Mode</th><th>What it does</th><th>When to use</th></tr></thead>
        <tbody>
          <tr>
            <td><strong>Auto</strong></td>
            <td>Default. An LLM router reads your prompt + the crew manifest and picks the <strong>single best agent</strong> for the task.</td>
            <td>Most chats. Let NICE decide who's most qualified.</td>
          </tr>
          <tr>
            <td><strong>Pipeline</strong></td>
            <td>Sequential assembly line. Agent 1's output feeds Agent 2 as context, then 2 → 3, etc. Each agent refines the prior agent's work.</td>
            <td>Multi-step workflows where each stage builds on the last (research → draft → polish).</td>
          </tr>
          <tr>
            <td><strong>Parallel</strong></td>
            <td>All crew agents run the <strong>same prompt simultaneously</strong>; their outputs are merged into one combined result.</td>
            <td>Brainstorming, multi-perspective analysis, generating variations to compare.</td>
          </tr>
          <tr>
            <td><strong>Hierarchical</strong></td>
            <td>A captain agent decomposes the task into subtasks, assigns each to the right crew member by role, collects results, and synthesizes a final answer.</td>
            <td>Complex tasks that need planning + delegation + synthesis. Manager-and-team pattern.</td>
          </tr>
          <tr>
            <td><strong>Quality Loop</strong></td>
            <td>One agent runs the task → a reviewer scores 1–10 with feedback → if the score is below threshold (default 7), the agent retries with the feedback. Up to 3 iterations.</td>
            <td>High-stakes outputs where you want self-correcting refinement before you read it.</td>
          </tr>
        </tbody>
      </table>
    `,

    'workflows': () => `
      <h1 class="docs-h1">Workflows</h1>
      <p class="docs-intro">Workflows are visual pipelines that chain multiple agents together. Build complex automations with a drag-and-drop editor.</p>

      <h2 class="docs-h2">Node Types</h2>
      <table class="docs-table">
        <thead><tr><th>Node</th><th>Purpose</th></tr></thead>
        <tbody>
          <tr><td>Agent</td><td>Runs a prompt through a specific agent</td></tr>
          <tr><td>Condition</td><td>Passes or blocks data based on an expression</td></tr>
          <tr><td>Branch</td><td>Routes to different paths based on conditions</td></tr>
          <tr><td>Delay</td><td>Pauses execution for a set time</td></tr>
          <tr><td>Loop</td><td>Iterates over lines or JSON arrays</td></tr>
          <tr><td>Webhook</td><td>Sends data to an external URL</td></tr>
          <tr><td>Output</td><td>Formats and captures the final result</td></tr>
        </tbody>
      </table>

      <h2 class="docs-h2">Building a Workflow</h2>
      <ol class="docs-steps">
        <li>Navigate to <strong>Workflows</strong> from the sidebar and click <strong>+ New Workflow</strong></li>
        <li>Add nodes from the palette on the left</li>
        <li>Connect them by clicking an output port, then clicking an input port</li>
        <li>Configure each node in the properties panel on the right</li>
        <li>Click <strong>Run</strong> to execute the pipeline</li>
      </ol>

      <h2 class="docs-h2">Triggers</h2>
      <dl class="docs-dl">
        <dt>Manual</dt><dd>Run on demand by clicking the Run button</dd>
        <dt>Scheduled</dt><dd>Runs on a cron schedule (e.g., every hour)</dd>
        <dt>On Mission Complete</dt><dd>Fires after any mission finishes</dd>
        <dt>On Agent Idle</dt><dd>Fires when an assigned agent becomes available</dd>
      </dl>
    `,

    'integrations': () => `
      <h1 class="docs-h1">Integrations</h1>
      <p class="docs-intro">Connect external services so your agents can read emails, check calendars, search documents, and more.</p>

      <h2 class="docs-h2">Google Workspace</h2>
      <p>Sign in with Google to connect Gmail, Calendar, and Drive. Your agents can then:</p>
      <ul class="docs-ul">
        <li><strong>Gmail</strong> — search and read emails, list labels</li>
        <li><strong>Calendar</strong> — view events and check availability</li>
        <li><strong>Drive</strong> — search and read documents</li>
      </ul>
      <p>OAuth tokens are stored securely in Supabase and auto-refreshed when they expire.</p>

      <h2 class="docs-h2">MCP Connections</h2>
      <p>MCP (Model Context Protocol) lets agents connect to any compatible server. Built-in connectors include:</p>
      <ul class="docs-ul">
        <li>Slack — read channels and messages</li>
        <li>GitHub — repos, issues, PRs</li>
        <li>Notion — pages and databases</li>
        <li>Confluence — wiki and documentation</li>
        <li>Jira — issues and boards</li>
      </ul>
      <p>Configure integrations in <strong>Settings → Integrations</strong>.</p>

      <h2 class="docs-h2">Adding Custom MCPs</h2>
      <p>Any MCP-compatible server can be connected. Provide the server URL, select the transport (Streamable HTTP or SSE), and configure authentication. All agents on the spaceship inherit the connection.</p>
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
          <tr><td>Gemini 2.5 Flash</td><td>Google</td><td><span class="docs-badge docs-badge-free">Free</span></td><td>Default model for all users</td></tr>
          <tr><td>Claude Sonnet 4</td><td>Anthropic</td><td><span class="docs-badge docs-badge-pro">Premium</span></td><td>Best reasoning</td></tr>
          <tr><td>GPT-5.2</td><td>OpenAI</td><td><span class="docs-badge docs-badge-pro">Premium</span></td><td>Flagship model</td></tr>
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
          <tr><td>Pro</td><td>$9.99/mo</td><td>12 slots, Legendary instantly, 1,000 Standard tokens/month, all non-flagship models</td></tr>
          <tr><td>Pro + Claude</td><td>+$9.99/mo</td><td>Claude Sonnet 4.6 &amp; Opus 4.6, 500 Claude tokens/month</td></tr>
          <tr><td>Pro + Premium</td><td>+$9.99/mo</td><td>GPT-5.4 Pro, OpenAI o3, Gemini 2.5 Pro, 500 Premium tokens/month</td></tr>
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
      <p>Higher ranks unlock more agent slots and rarer blueprints. There are 12 ranks from Ensign to Fleet Admiral. Mythic-rarity blueprints can only be unlocked at Fleet Admiral — they cannot be purchased.</p>
    `,

    'keyboard': () => {
      const shortcuts = [
        ['Cmd/Ctrl + K', 'Command Palette'],
        ['Cmd/Ctrl + /', 'Toggle Prompt Panel'],
        ['Cmd/Ctrl + \\\\', 'Toggle Sidebar'],
        ['Cmd/Ctrl + B', 'Navigate to Bridge'],
        ['Cmd/Ctrl + Shift + N', 'New Chat'],
        ['Escape', 'Close modal / panel'],
        ['1–9', 'Switch chat tabs'],
      ];

      return `
        <h1 class="docs-h1">Keyboard Shortcuts</h1>
        <p class="docs-intro">Power-user shortcuts for faster navigation.</p>

        <table class="docs-table">
          <thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
          <tbody>
            ${shortcuts.map(([key, action]) => `<tr><td><kbd>${key}</kbd></td><td>${action}</td></tr>`).join('')}
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
