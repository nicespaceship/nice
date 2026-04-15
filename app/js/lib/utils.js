/* ═══════════════════════════════════════════════════════════════════
   NICE — Utils
   Shared utility functions: HTML escaping, time formatting.
═══════════════════════════════════════════════════════════════════ */

const Utils = (() => {
  function esc(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function timeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }

  /** Render an SVG icon from the sprite. Usage: Utils.icon('lock') or Utils.icon('lock', 'icon-lg') */
  function icon(name, cls) {
    return `<svg class="icon ${cls || 'icon-sm'}" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-${name}"/></svg>`;
  }

  /** Format a date for display — consistent across all views */
  function formatDate(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatDateTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  /** Central localStorage key registry — prevents typos and enables grep */
  const KEYS = {
    theme: 'ns-theme',
    darkTheme: 'ns-dark-theme',
    font: 'ns-font',
    enabledModels: 'nice-enabled-models',
    activeStack: 'nice-active-stack',
    xp: 'nice-xp',
    achievements: 'nice-achievements',
    auditLog: 'nice-audit-log',
    workflows: 'nice-workflows',
    mcpConnections: 'nice-mcp-connections',
    budget: 'nice-budget',
    bpActivated: 'nice-bp-activated',
    bpActivatedShips: 'nice-bp-activated-ships',
    shipState: 'nice-ship-state',
    agentStats: 'nice-agent-stats',
    favorites: 'nice-favorites',
    aiMessages: 'nice-ai-messages',
    customAgents: 'nice-custom-agents',
    customShips: 'nice-custom-ships',
    contentQueue: 'nice-content-queue',
    onboarded: 'nice-onboarded',
    plan: 'nice-plan',
    settings: 'nice-settings',
    streak: 'nice-streak',
    lastActive: 'nice-last-active',
    hudDockThemes: 'nice-hud-dock-themes',
    guiSettings: 'nice-gui-settings',
    customThemes: 'nice-custom-themes',
    missionsFolder: 'nice-missions-folder',
    modelIntel: 'nice-model-intel',
    skinInventory: 'nice-skin-inventory',
    shipBehaviors: 'nice-ship-behaviors',
    ideProjects: 'nice-ide-projects',
    ideLastProject: 'nice-ide-last-project',
    ideLayout: 'nice-ide-layout',
    missionSchedules: 'nice-mission-schedules',
    agentMemories: 'nice-agent-memories',
    quickNotes: 'nice-quick-notes',
    bpCustomLabels: 'nice-bp-custom-labels',
    bpView: 'nice-bp-view',
    bpRatings: 'nice-bp-ratings',
    agentTemplates: 'nice-agent-templates',
    agentsView: 'nice-agents-view',
    shipsView: 'nice-ships-view',
    tokens: 'nice-tokens',
    avatarUrl: 'nice-avatar-url',
    bpFavorites: 'nice-bp-favorites',
    callsign: 'nice-callsign',
    highContrast: 'nice-high-contrast',
    sidebarOrder: 'nice-sidebar-order',
    mcShip: 'nice-mc-ship',
    mcSlots: 'nice-mc-slots',
    conversations: 'nice-conversations',
    activeConv: 'nice-active-conv',
    ephemeralSession: 'nice-ephemeral-session',
    utmFirst: 'nice-utm-first',
    utmLast: 'nice-utm-last',
    importBp: 'nice-import-bp',
    generatedImages: 'nice-generated-images',
    securityChecklist: 'nice-security-checklist',
    shipProfiles: 'nice-ship-profiles',
    tronHighScore: 'nice-tron-hi',
    voiceOff: 'nice-voice-off',
    checklistDismissed: 'nice-checklist-dismissed',
  };

  return { esc, timeAgo, formatDate, formatDateTime, icon, KEYS };
})();
