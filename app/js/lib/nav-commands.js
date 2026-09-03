/* ═══════════════════════════════════════════════════════════════════
   NICE — Navigation & UI Commands (command bus, Phase 2)

   SSOT for every human-surface navigation + UI-action verb in NICE.
   Each verb is registered ONCE as a ToolRegistry command here, so the
   command palette (Cmd+K), the chat NL resolver (Phase 3), and UI buttons
   (Phase 4) all dispatch the same command instead of each re-implementing
   "navigate to X" / "open Y". See docs/command-bus.md.

   - init(): self-registers each verb on the bus. surfaces:['human'] — the
     LLM must not drive the user's navigation by default (doc Open
     Decisions). sideEffect:false — navigation never mutates remote state,
     so it must never hit the approval gate even though some ids carry a
     mutation substring ("create-agent", "new-spaceship") that the registry
     would otherwise infer as a write.
   - list(): projects the verbs into display descriptors for a front-end,
     resolving theme-aware labels (Terminology noun overrides + Skin text)
     on every call — never frozen at module load.

   tool-registry.js loads AFTER this module, so registration runs at
   runtime from init() (called once at bootstrap), not at IIFE eval. The
   command `name`/`keywords` are canonical English; the themed display
   label comes from list(), so the bus stays theme-agnostic.
═══════════════════════════════════════════════════════════════════ */

const NavCommands = (() => {

  // Cycle to the next built-in theme. Owned here because "Toggle Theme" is a
  // bus command now, not a palette-private thunk.
  function _cycleTheme() {
    const themes = ['nice', 'hal-9000', 'grid', 'solar', 'matrix', 'retro', 'lcars', 'pixel'];
    const current = document.documentElement.getAttribute('data-theme');
    const idx = themes.indexOf(current);
    if (typeof Theme !== 'undefined') Theme.set(themes[(idx + 1) % themes.length]);
  }

  function _navigate(hash) {
    if (typeof Router !== 'undefined') Router.navigate(hash);
  }

  // The dispatch behavior for a nav command: navigate to its route hash.
  function _navExecute(route) {
    return async () => {
      _navigate(route.charAt(0) === '#' ? route : '#' + route);
      return { ok: true, navigated: route };
    };
  }

  /* Canonical command set. `route` (nav) navigates; `run` (action) fires a
     side-effect-free UI action. Routes mirror the command palette's existing
     paths byte-for-byte so palette behavior is unchanged. */
  const COMMANDS = [
    // ── Navigation ──
    { id: 'open-bridge',            name: 'Bridge',            kind: 'nav', route: '/',                      icon: '#icon-home',      skinKey: 'titles.home',       keywords: 'home dashboard bridge',                                  desc: 'Open the Bridge dashboard.' },
    { id: 'open-agents',            name: 'Agents',            kind: 'nav', route: '/blueprints/agents',     icon: '#icon-agent',     skinKey: 'nav.agents',        keywords: 'agents list manage',                                     desc: 'Open the Agents roster.' },
    { id: 'open-agent-builder',     name: 'New Agent',         kind: 'nav', route: '/blueprints/agents/new', icon: '#icon-plus',      skinKey: 'newAgent',          keywords: 'create new agent builder',                               desc: 'Open the Agent Builder.' },
    { id: 'open-shipyard',          name: 'Shipyard',          kind: 'nav', route: '/blueprints/spaceships', icon: '#icon-spaceship', skinKey: 'nav.spaceships',    keywords: 'spaceships shipyard fleet ships',                        desc: 'Open the Shipyard.' },
    { id: 'open-missions',          name: 'Missions',          kind: 'nav', route: '/missions',              icon: '#icon-task',      skinKey: 'nav.missions',      keywords: 'missions tasks assignments queue jobs',                  desc: 'Open the mission board.' },
    { id: 'open-blueprint-catalog', name: 'Blueprint Catalog', kind: 'nav', route: '/blueprints',            icon: '#icon-blueprint', skinKey: 'nav.blueprints',    keywords: 'blueprints catalog agents orchestrator templates',       desc: 'Open the Blueprint catalog.' },
    { id: 'open-operations',        name: 'Operations',        kind: 'nav', route: '/analytics',             icon: '#icon-analytics', skinKey: 'nav.analytics',     keywords: 'operations analytics charts stats performance',          desc: 'Open Operations analytics.' },
    { id: 'open-cost',              name: 'Cost Tracker',      kind: 'nav', route: '/cost',                  icon: '#icon-dollar',    skinKey: 'nav.cost',          keywords: 'cost budget spending money',                             desc: 'Open the Cost Tracker.' },
    { id: 'open-wallet',            name: 'Wallet',            kind: 'nav', route: '/wallet',                icon: '#icon-dollar',    skinKey: null,                keywords: 'wallet balance credits payment billing purchase',        desc: 'Open your Wallet.' },
    { id: 'open-vault',             name: 'Vault',             kind: 'nav', route: '/vault',                 icon: '#icon-key',       skinKey: 'nav.vault',         keywords: 'vault secrets keys api tokens',                          desc: 'Open the Vault.' },
    { id: 'open-security',          name: 'Security',          kind: 'nav', route: '/security',              icon: '#icon-lock',      skinKey: null,                keywords: 'security agent permissions threat audit compliance access policies', desc: 'Open Security.' },
    { id: 'open-log',               name: 'Log',               kind: 'nav', route: '/log',                   icon: '#icon-monitor',   skinKey: 'nav.log',           keywords: 'log audit captain history events operations',            desc: "Open the Captain's Log." },
    { id: 'open-profile',           name: 'Profile',           kind: 'nav', route: '/profile',               icon: '#icon-profile',   skinKey: 'nav.profile',       keywords: 'profile account user avatar',                            desc: 'Open your Profile.' },
    { id: 'open-settings',          name: 'Settings',          kind: 'nav', route: '/settings',              icon: '#icon-settings',  skinKey: 'nav.settings',      keywords: 'settings preferences config',                            desc: 'Open Settings.' },
    { id: 'open-theme-editor',      name: 'Theme Editor',      kind: 'nav', route: '/theme-editor',          icon: '#icon-settings',  skinKey: 'nav.theme-creator', keywords: 'theme editor creator custom colors builder',             desc: 'Open the Theme Editor.' },
    { id: 'open-workflows',         name: 'Workflows',         kind: 'nav', route: '/workflows',             icon: '#icon-build',     skinKey: 'nav.workflows',     keywords: 'workflows pipelines automation nodes',                   desc: 'Open Workflows.' },
    // ── UI actions ──
    { id: 'create-agent',      name: 'Create Agent',       kind: 'action', icon: '#icon-plus',      keywords: 'new create agent build',                          desc: 'Open the Agent Builder.',           run: () => _navigate('#/bridge/agents/new') },
    { id: 'new-spaceship',     name: 'New Spaceship',      kind: 'action', icon: '#icon-spaceship', keywords: 'new create spaceship fleet',                      desc: 'Open the Shipyard to add a spaceship.', run: () => _navigate('#/bridge/spaceships') },
    { id: 'cycle-theme',       name: 'Toggle Theme',       kind: 'action', icon: '#icon-settings',  keywords: 'theme dark light switch hud',                     desc: 'Cycle to the next theme.',          run: _cycleTheme },
    { id: 'show-shortcuts',    name: 'Keyboard Shortcuts', kind: 'action', icon: '#icon-build',     keywords: 'keyboard shortcuts help keys',                    desc: 'Show keyboard shortcuts.',          run: () => { if (typeof Keyboard !== 'undefined') Keyboard.showHelp(); } },
    { id: 'open-setup-wizard', name: 'Setup Wizard',       kind: 'action', icon: '#icon-zap',       keywords: 'setup wizard guided questionnaire new spaceship', desc: 'Launch the guided Setup Wizard.',   run: () => { if (typeof SetupWizard !== 'undefined') SetupWizard.open(); } },
    { id: 'open-crew-designer', name: 'Crew Designer',     kind: 'action', icon: '#icon-spaceship', keywords: 'crew designer build team spaceship describe deploy',
      desc: 'Open the Crew Designer to design a crew from a business description.',
      schema: { type: 'object', properties: { prompt: { type: 'string', description: 'Business description to seed the design (optional)' } } },
      run: (p) => {
        if (typeof CrewDesigner !== 'undefined') CrewDesigner.open({ prompt: (p && p.prompt) || '' });
        else if (typeof SetupWizard !== 'undefined') SetupWizard.open();
      } },
    { id: 'export-data',       name: 'Export Data',        kind: 'action', icon: '#icon-build',     keywords: 'export download backup data json',                desc: 'Export all your NICE data as JSON.', run: () => { if (typeof DataIO !== 'undefined') DataIO.exportData(); } },
  ];

  let _registered = false;
  function init() {
    if (_registered || typeof ToolRegistry === 'undefined') return;
    _registered = true;
    COMMANDS.forEach(c => {
      ToolRegistry.register({
        id:          c.id,
        name:        c.name,
        description: c.desc || '',
        schema:      c.schema || { type: 'object', properties: {} },
        surfaces:    ['human'],
        sideEffect:  false,
        execute:     c.kind === 'nav' ? _navExecute(c.route) : async (input) => { c.run(input); return { ok: true }; },
      });
    });
  }

  // Active mission noun (themed) for the two mission-dependent labels/keywords.
  function _missionNoun() {
    const has = typeof Terminology !== 'undefined';
    return {
      plural:      has ? Terminology.label('mission', { plural: true }) : 'Missions',
      pluralLower: has ? Terminology.label('mission', { plural: true, lowercase: true }) : 'missions',
    };
  }

  /* Project commands into display descriptors for a front-end. Resolves
     Terminology + Skin per call so theme-aware labels are never frozen.
     Returns { id, label, keywords, icon, kind } — execute via
     ToolRegistry.execute(id). */
  function list() {
    const m = _missionNoun();
    const skinOn = typeof Skin !== 'undefined' && Skin.isActive();
    return COMMANDS.map(c => {
      let label = c.name;
      let keywords = c.keywords;
      if (c.id === 'open-missions') { label = m.plural; keywords = `missions tasks assignments queue jobs ${m.pluralLower}`; }
      else if (c.id === 'open-log') { keywords = `log audit captain history events ${m.pluralLower} operations`; }
      if (skinOn && c.skinKey) label = Skin.text(c.skinKey, label);
      return { id: c.id, label, keywords, icon: c.icon, kind: c.kind };
    });
  }

  // Function words that carry no destination — stripped before scoring so a
  // stray "the" / "a" doesn't fuzzy-match half the catalog. The nav verbs
  // ("open", "show", "view") live here too: they signal a nav request but are
  // never keywords, so they must not contribute to the match score.
  const _STOP = new Set([
    'the', 'a', 'an', 'to', 'my', 'our', 'me', 'us', 'i', 'of', 'for', 'and', 'on', 'in',
    'go', 'open', 'show', 'view', 'navigate', 'take', 'switch', 'jump', 'bring', 'up', 'please',
  ]);

  /* Resolve free text to the best-matching navigation command, by keyword
     token overlap. ONLY kind:'nav' commands are considered — UI actions
     (cycle-theme, export-data, open-crew-designer, …) have their own dedicated
     triggers and must not be reachable by fuzzy "show me …" phrasing (e.g.
     "switch to cyberpunk" is a theme verb, not a request to toggle the theme).

     Scoring: a command earns a point per keyword that a content token matches.
     Tokens ≥ 4 chars match by substring (so "agents" ↔ "agent",
     "spaceships" ↔ "spaceship"); shorter tokens require exact equality to
     avoid noise. Ties resolve to declaration order (COMMANDS is ordered
     specific-before-generic where it matters).

     Returns { id, label } of the top command, or null when nothing matches.
     The CALLER decides whether the surrounding phrasing actually warrants a
     navigation (a nav verb, or a one-word command) — resolve() is pure. */
  function resolve(text) {
    const lower = String(text || '').toLowerCase().trim();
    if (!lower) return null;
    const tokens = lower.split(/\s+/).filter(t => t && !_STOP.has(t));
    if (!tokens.length) return null;
    let best = null, bestScore = 0;
    list().forEach(c => {
      if (c.kind !== 'nav') return;
      let score = 0;
      String(c.keywords || '').split(/\s+/).filter(Boolean).forEach(kw => {
        const hit = tokens.some(t =>
          t === kw || (t.length >= 4 && kw.length >= 4 && (t.includes(kw) || kw.includes(t)))
        );
        if (hit) score++;
      });
      if (score > bestScore) { bestScore = score; best = c; }
    });
    return best ? { id: best.id, label: best.label } : null;
  }

  return { init, list, resolve, COMMANDS };
})();
