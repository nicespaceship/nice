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

  /** Sentence-case a status / id-like string. "active" → "Active", "google-drive" → "Google Drive".
      Use this instead of `text-transform: capitalize` (banned per CLAUDE.md typography rules) so
      that hyphens and underscores in source ids become real word breaks in the display label. */
  function titleCase(s) {
    if (s == null) return '';
    return String(s).split(/[\s_-]+/).filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
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

  /**
   * Sanitize a user-provided callsign before it's interpolated into the
   * system prompt. The callsign is user-controlled (stored in localStorage,
   * set via `/callsign`) and rendered verbatim inside the persona template,
   * which makes it a prompt-injection surface — e.g. a newline + "SYSTEM:"
   * payload would otherwise land mid-prompt. Return the cleaned value or
   * `null` to tell the caller to fall back to the persona's `defaultCallsign`.
   *
   * Allow: Unicode letters + digits, space, period, apostrophe, hyphen.
   * Max 32 chars. Trim surrounding whitespace. Reject everything else.
   */
  function sanitizeCallsign(raw) {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s || s.length > 32) return null;
    return /^[\p{L}\p{N} .'\-]+$/u.test(s) ? s : null;
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
    voiceSample: 'nice-voice-sample',
    checklistDismissed: 'nice-checklist-dismissed',
    vaultAdvanced: 'nice-vault-advanced',

    /* ── Per-resource key factories ──
       Some keys carry an id suffix (per nav button, per user). Expose them
       as functions so callers don't reach for raw `'nice-foo-' + id` strings
       and bypass this SSOT. */
    mcMigrated:      (userId) => 'nice-mc-migrated-' + userId,
    onboardedLegacy: (userId) => 'nice-onboarded-' + userId,
  };

  return { esc, timeAgo, formatDate, formatDateTime, icon, titleCase, sanitizeCallsign, KEYS };
})();
