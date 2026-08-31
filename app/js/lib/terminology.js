/* ═══════════════════════════════════════════════════════════════════
   MODULE: Terminology — SSOT for theme-aware noun labels
   Internal schema keeps canonical `mission` / `agent` / `spaceship` /
   `crew` / `captain` keys; the DEFAULT labels are plain business nouns
   (Process / Agent / Workspace / Team / Owner) so the product reads the
   same to an SMB owner and an enterprise evaluator. Sci-fi themes opt
   back into the spaceship vocabulary; Office keeps "Assignment".
   The Theme module owns sentence-level personality (copy.labels); this
   module owns the noun SSOT, called at render time by views and once
   per theme change by applyDOM() against static `data-term` elements.
═══════════════════════════════════════════════════════════════════ */
const Terminology = (() => {
  /*
   * Per-theme noun dictionary. Every noun defines `{ singular, plural }`.
   * `default` is plain business vocabulary and applies to every theme that
   * declares no override — including custom user themes. The sci-fi themes
   * share SCIFI, so the spaceship metaphor is opt-in personality rather
   * than the vocabulary every buyer has to decode.
   */
  const SCIFI = {
    mission:   { singular: 'Mission',   plural: 'Missions' },
    spaceship: { singular: 'Spaceship', plural: 'Spaceships' },
    crew:      { singular: 'Crew',      plural: 'Crew' },
    captain:   { singular: 'Captain',   plural: 'Captains' },
  };

  const NOUNS = {
    default: {
      mission:   { singular: 'Process',   plural: 'Processes' },
      agent:     { singular: 'Agent',     plural: 'Agents' },
      spaceship: { singular: 'Workspace', plural: 'Workspaces' },
      crew:      { singular: 'Team',      plural: 'Team' },
      captain:   { singular: 'Owner',     plural: 'Owners' },
    },
    'hal-9000': SCIFI,
    matrix:     SCIFI,
    lcars:      SCIFI,
    jarvis:     SCIFI,
    cyberpunk:  SCIFI,
    grid:       SCIFI,
    'rx-78-2':  SCIFI,
    '16bit':    SCIFI,
    office:      { mission: { singular: 'Assignment', plural: 'Assignments' } },
    'office-dark': { mission: { singular: 'Assignment', plural: 'Assignments' } },
  };

  function _activeTheme() {
    return (typeof Theme !== 'undefined' && typeof Theme.current === 'function')
      ? Theme.current()
      : (typeof localStorage !== 'undefined' ? localStorage.getItem((typeof Utils !== 'undefined' && Utils.KEYS && Utils.KEYS.theme) || 'ns-theme') : null) || 'nice';
  }

  function _resolve(noun, themeId) {
    const themeDict = NOUNS[themeId];
    const defaults  = NOUNS.default;
    if (themeDict && themeDict[noun]) return themeDict[noun];
    return defaults[noun] || null;
  }

  /**
   * Return the user-visible label for a canonical noun under the active
   * theme. Unknown nouns return the noun verbatim (capitalized) so callers
   * don't break when the dictionary is incomplete.
   *
   *   Terminology.label('mission')                       → "Mission"
   *   Terminology.label('mission', { plural: true })     → "Missions"
   *   Terminology.label('mission', { lowercase: true })  → "mission"
   *   Terminology.label('mission', { theme: 'office' })  → "Assignment"
   */
  function label(noun, opts = {}) {
    const theme  = opts.theme || _activeTheme();
    const entry  = _resolve(noun, theme);
    const word   = entry
      ? (opts.plural ? entry.plural : entry.singular)
      : String(noun).charAt(0).toUpperCase() + String(noun).slice(1);
    return opts.lowercase ? word.toLowerCase() : word;
  }

  /**
   * Return the appropriate indefinite article (`a`/`an`) for the resolved
   * noun — spoken rule of thumb, vowel-initial → `an`. Good enough for the
   * words in the dictionary; falls back to `a` if the noun is unknown.
   *
   *   Terminology.article('mission')                   → "a"
   *   Terminology.article('mission', { theme:'office'}) → "an"  // assignment
   */
  function article(noun, opts = {}) {
    const word = label(noun, opts);
    return /^[aeiou]/i.test(word) ? 'an' : 'a';
  }

  /**
   * Walk a DOM subtree and populate every `[data-term]` element with its
   * resolved label. `data-term` values are of the form `noun` or
   * `noun.plural` (e.g. `mission`, `mission.plural`). Called once on
   * Theme.init() and again on every Theme.set() so static HTML chrome
   * (sidebar labels, etc.) tracks the active theme.
   */
  function applyDOM(root) {
    const scope = root || document;
    if (!scope.querySelectorAll) return;
    scope.querySelectorAll('[data-term]').forEach(el => {
      const spec = el.getAttribute('data-term') || '';
      const [noun, form] = spec.split('.');
      if (!noun) return;
      const plural = form === 'plural';
      el.textContent = label(noun, { plural });
    });
  }

  return { label, article, applyDOM, NOUNS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Terminology;
