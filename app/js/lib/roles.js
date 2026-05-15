/* ═══════════════════════════════════════════════════════════════════
   NICE — Roles (SSOT for role vocabulary)
   Loads the `public.roles` table at boot. Mission dispatch resolves a
   role slug (e.g. 'sales', 'engineering') to the required capability
   tags by reading from this module instead of a hardcoded JS map.

   The table is the canonical source. A code-side SEED constant
   mirrors the migration seed for two reasons:
     1. Offline / test environments never reach Supabase.
     2. Boot-time `init()` is async; getters that fire before it
        resolves still return a sensible answer.
   Keep SEED in sync with the latest seed migration on schema changes.

   Public API:
     - Roles.init()                — async, idempotent. Loads from DB.
     - Roles.getRequiredTags(slug) — string[] of required capability tags.
     - Roles.get(slug)             — full role row or null.
     - Roles.list()                — array of role rows (sorted).
     - Roles.isReady()             — true once init() completed (or seed-fallback).
═══════════════════════════════════════════════════════════════════ */

const Roles = (() => {

  /* ── SEED (mirror of supabase/migrations/20260515034139_*) ── */
  const _SEED = [
    { slug: 'captain',          label: 'Captain',          tier: 'leadership', authority: 'decides',     required_capability_tags: [],                                                  sort_order: 0  },
    { slug: 'communications',   label: 'Communications',   tier: 'functional', authority: 'executes',    required_capability_tags: ['email','messaging','calendar','communications'],   sort_order: 1  },
    { slug: 'sales',            label: 'Sales',            tier: 'functional', authority: 'executes',    required_capability_tags: ['sales','crm'],                                     sort_order: 2  },
    { slug: 'marketing',        label: 'Marketing',        tier: 'functional', authority: 'executes',    required_capability_tags: ['marketing','messaging','media-gen','email'],       sort_order: 3  },
    { slug: 'engineering',      label: 'Engineering',      tier: 'functional', authority: 'executes',    required_capability_tags: ['code','issues','engineering'],                     sort_order: 4  },
    { slug: 'product',          label: 'Product',          tier: 'functional', authority: 'executes',    required_capability_tags: ['pm','issues','product','docs'],                    sort_order: 5  },
    { slug: 'operations',       label: 'Operations',       tier: 'functional', authority: 'coordinates', required_capability_tags: ['pm','automation','database','ops'],                sort_order: 6  },
    { slug: 'customer_success', label: 'Customer Success', tier: 'functional', authority: 'executes',    required_capability_tags: [],                                                  sort_order: 7  },
    { slug: 'finance',          label: 'Finance',          tier: 'functional', authority: 'executes',    required_capability_tags: ['finance','payments'],                              sort_order: 8  },
    { slug: 'analytics',        label: 'Analytics',        tier: 'functional', authority: 'advises',     required_capability_tags: ['analytics'],                                       sort_order: 9  },
    { slug: 'design',           label: 'Design',           tier: 'functional', authority: 'executes',    required_capability_tags: ['design','media-gen'],                              sort_order: 10 },
    { slug: 'legal',            label: 'Legal',            tier: 'functional', authority: 'advises',     required_capability_tags: ['docs'],                                            sort_order: 11 },
    { slug: 'security',         label: 'Security',         tier: 'functional', authority: 'advises',     required_capability_tags: ['observability','infrastructure'],                  sort_order: 12 },
    { slug: 'people',           label: 'People',           tier: 'functional', authority: 'coordinates', required_capability_tags: ['messaging'],                                       sort_order: 13 },
    { slug: 'research',         label: 'Research',         tier: 'functional', authority: 'advises',     required_capability_tags: ['research','web','docs'],                           sort_order: 14 },
    { slug: 'documentation',    label: 'Documentation',    tier: 'functional', authority: 'executes',    required_capability_tags: ['docs'],                                            sort_order: 15 },
    { slug: 'support',          label: 'Support',          tier: 'functional', authority: 'executes',    required_capability_tags: ['messaging','crm'],                                 sort_order: 16 },
  ];

  let _byKey = Object.create(null);
  let _ready = false;
  let _loadPromise = null;

  // Hydrate _byKey from SEED immediately so synchronous getters work
  // even if the consumer fires before init() resolves.
  _SEED.forEach(r => { _byKey[r.slug] = r; });

  async function init() {
    if (_loadPromise) return _loadPromise;
    _loadPromise = (async () => {
      try {
        if (typeof SB === 'undefined' || !SB.isReady?.() || !SB.isOnline?.()) {
          _ready = true; // seed-only mode
          return;
        }
        const c = SB.client;
        if (!c || typeof c.from !== 'function') { _ready = true; return; }
        const { data, error } = await c.from('roles').select('*').order('sort_order', { ascending: true });
        if (!error && Array.isArray(data) && data.length) {
          const next = Object.create(null);
          data.forEach(r => { next[r.slug] = r; });
          _byKey = next;
        }
      } catch (e) {
        // SEED already populated _byKey — silently fall back.
        console.warn('[Roles] DB load failed, using seed:', e?.message);
      } finally {
        _ready = true;
      }
    })();
    return _loadPromise;
  }

  function isReady() { return _ready; }

  function get(slug) {
    if (!slug) return null;
    return _byKey[slug] || null;
  }

  function getRequiredTags(slug) {
    const r = get(slug);
    return (r && Array.isArray(r.required_capability_tags)) ? r.required_capability_tags : [];
  }

  function list() {
    return Object.values(_byKey).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }

  return { init, isReady, get, getRequiredTags, list };

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Roles;
}
