/* ═══════════════════════════════════════════════════════════════════
   NICE — LLM Config
   Maps blueprint stats to functional LLM parameters.
═══════════════════════════════════════════════════════════════════ */

const LLMConfig = (() => {

  // Stale or naming-convention aliases that legacy seed data, hardcoded UI
  // defaults, and older blueprints still emit. Resolved to the canonical
  // model id from ModelCatalog so nice-ai sees a known model and the
  // fallback-chain filter (which compares against enabledModels keys —
  // also canonical) works correctly.
  //
  // Surfaced 2026-05-15: an Engineering Lead slot agent (auto-created with
  // llm_engine='claude-4' from ship-setup-wizard.js) reached nice-ai after
  // #514 fixed the streaming/routing path, then 404'd because 'claude-4'
  // is not a real model id. Add new aliases here when seed data drifts;
  // do not silently let unknown ids reach nice-ai.
  const MODEL_ALIASES = {
    // Hardcoded UI defaults / broken legacy aliases (404 from nice-ai)
    'claude-4':           'claude-4-6-sonnet',
    'claude-4-opus':      'claude-4-7-opus',
    'grok':               'grok-4-3',

    // Retired upstream 2026: xAI retires grok-4-1-fast 2026-08-15 (the slug
    // already serves 4.3); Groq deprecated llama-4-scout 2026-06-17. Old
    // enabled_models keys and stored agent configs resolve to the
    // replacements.
    'grok-4-1-fast':      'grok-4-3',
    'llama-4-scout':      'gpt-oss-120b',

    // Naming-convention drift — both forms accepted by nice-ai today, but
    // MODEL_CATALOG (the SSOT) uses the year-family-tier form.
    'claude-sonnet-4-6':  'claude-4-6-sonnet',
    'claude-opus-4-7':    'claude-4-7-opus',
    'gemini-2.5-flash':   'gemini-2-5-flash',
    'gemini-2.5-pro':     'gemini-2-5-pro',
  };

  function _canonicalize(id) {
    if (!id || typeof id !== 'string') return id;
    return MODEL_ALIASES[id] || id;
  }

  // Rewrites an enabled-models map's keys to canonical ids. Used by the
  // boot-time localStorage migration in nice.js so every consumer of
  // enabled_models sees current ids. When both a retired key and its
  // replacement are present, access wins (true beats false) on purpose:
  // the server still gates every pool, so the merge can only re-show a
  // toggle, never grant paid access.
  function canonicalizeEnabledMap(map) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return { changed: false, map };
    let changed = false;
    const out = {};
    for (const [id, on] of Object.entries(map)) {
      const canonical = _canonicalize(id);
      if (canonical !== id) changed = true;
      out[canonical] = out[canonical] || !!on;
    }
    return { changed, map: out };
  }

  // Ordered capability ladder — most to least capable.
  // IDs match MODEL_CATALOG so the buildFallbackChain filter matches the
  // user's enabledModels keys (which come from MODEL_CATALOG too).
  // Used to build per-call fallback chains: if the primary model is overloaded,
  // we walk down to the next model the user has enabled.
  // noTools: true — provider tool-use schema not compatible; strip tools on fallback.
  const CAPABILITY_CHAIN = [
    { id: 'openai-o3',         tier: 'premium',  noTools: false },
    { id: 'claude-4-7-opus',   tier: 'premium',  noTools: false },
    { id: 'gpt-5-4-pro',       tier: 'premium',  noTools: false },
    { id: 'gemini-2-5-pro',    tier: 'premium',  noTools: false },
    { id: 'claude-4-6-sonnet', tier: 'standard', noTools: false },
    { id: 'gpt-5-mini',        tier: 'standard', noTools: false },
    { id: 'grok-4-3',          tier: 'standard', noTools: true  },
    { id: 'gpt-oss-120b',      tier: 'standard', noTools: true  },
    // The three open providers passed a live TEXT smoke through nice-ai on
    // 2026-07-25; tool calling is still unverified through the translator,
    // so noTools stays true until a tool-call smoke passes.
    { id: 'kimi-k2-6',         tier: 'standard', noTools: true  },
    { id: 'deepseek-v4-flash', tier: 'standard', noTools: true  },
    { id: 'nemotron-3-super',  tier: 'standard', noTools: true  },
    { id: 'gemini-2-5-flash',  tier: 'free',     noTools: false },
  ];

  // Returns ordered fallback entries for a given primary model.
  // Only includes models the user has enabled; gemini-2-5-flash always included last.
  function buildFallbackChain(primaryModel, enabledModels) {
    const canonical = _canonicalize(primaryModel);
    const enabled = enabledModels && typeof enabledModels === 'object'
      ? Object.keys(enabledModels).filter(k => enabledModels[k]).map(_canonicalize)
      : [];
    const idx = CAPABILITY_CHAIN.findIndex(m => m.id === canonical);
    return CAPABILITY_CHAIN
      .slice(idx >= 0 ? idx + 1 : 0)
      .filter(m => m.id === 'gemini-2-5-flash' || enabled.includes(m.id));
  }

  /**
   * Convert numeric stats (0-100) to LLM request parameters.
   * @param {Object} stats  - { spd, acc, cap, pwr } each 0-100
   * @returns {Object} { stream, temperature, max_tokens, rate_limit }
   */
  function fromStats(stats) {
    const spd = _num(stats.spd);
    const acc = _num(stats.acc);
    const pwr = _num(stats.pwr);
    const cap = _num(stats.cap);

    return {
      stream:      spd >= 60,
      temperature: Math.max(0.1, Math.min(0.9, +(1 - acc / 100).toFixed(2))),
      max_tokens:  Math.round(512 + (pwr / 100) * 7680),
      rate_limit:  Math.round((cap / 100) * 60),
    };
  }

  /**
   * Full config from a blueprint object.
   *
   * Resolution order for model + params:
   *   1. blueprint.config.model_profile (preferred — explicit declaration)
   *   2. blueprint.config.llm_engine    (legacy — single field)
   *   3. blueprint.stats                (cosmetic — derived envelope)
   *
   * @param {Object} bp - Blueprint with stats & config
   * @returns {Object} { model, fallback?, temperature, max_tokens, stream, rate_limit, tier? }
   */
  function forBlueprint(bp) {
    const params = fromStats((bp && bp.stats) || {});
    const cfg = (bp && bp.config) || {};
    const profile = cfg.model_profile || null;

    // Model selection — model_profile.preferred wins, then llm_engine.
    // For nice-auto, ask ModelIntel; if it returns nothing, fall back to
    // model_profile.fallback (NOT a hardcoded premium default — that would
    // silently upgrade free-tier agents to premium models).
    // Default model is the always-free Gemini 2.5 Flash so an agent
    // without an explicit profile can never accidentally drain a paid
    // pool. Premium models must be set explicitly via model_profile.
    let model = (profile && profile.preferred) || cfg.llm_engine || 'gemini-2-5-flash';
    if (model === 'nice-auto') {
      let learned = null;
      if (typeof ModelIntel !== 'undefined') {
        const enabled = (typeof State !== 'undefined' && State.get('enabled_models')) || {};
        const connected = Object.keys(enabled).filter(k => enabled[k]);
        learned = ModelIntel.bestModel(bp && bp.id, connected);
      }
      model = learned || (profile && profile.fallback) || 'gemini-2-5-flash';
    }
    model = _canonicalize(model);

    // Capability fallback: if the resolved model isn't accessible to the
    // user (not in enabled_models and not the always-free Flash), walk
    // DOWN the capability chain to the first accessible model. Without
    // this, blueprints that hard-code a paid-tier model (e.g. all eleven
    // captain specialists ship with `claude-sonnet-4-6`) hit a 402
    // "subscription is inactive" when a free-tier user invokes them.
    // The fallbackChain below only fires on 503/429 overload — hard
    // subscription rejection has to be intercepted before the call.
    // Guard: skip the check when enabled_models is unset/empty (test
    // env, pre-bootstrap state) so the existing free-default behavior
    // is preserved when we can't determine access.
    // Canonicalize keys like routeAuto does: saved toggles may still carry
    // retired ids (grok-4-1-fast, llama-4-scout) that alias to the current
    // lineup, and a raw-key lookup would wrongly deny access.
    const rawEnabled = (typeof State !== 'undefined' && State.get('enabled_models')) || {};
    const enabledModels = {};
    for (const k of Object.keys(rawEnabled)) enabledModels[_canonicalize(k)] = rawEnabled[k];
    const knowsAccess = Object.keys(enabledModels).length > 0;
    const isAccessible = (id) => id === 'gemini-2-5-flash' || !!enabledModels[id];
    if (knowsAccess && !isAccessible(model)) {
      const idx = CAPABILITY_CHAIN.findIndex(m => m.id === model);
      const next = CAPABILITY_CHAIN
        .slice(idx >= 0 ? idx + 1 : 0)
        .find(m => isAccessible(m.id));
      model = next ? next.id : 'gemini-2-5-flash';
    }
    params.model = model;

    // model_profile overrides — explicit values trump stat-derived envelope
    if (profile) {
      if (profile.fallback) params.fallback = _canonicalize(profile.fallback);
      if (typeof profile.temperature === 'number') {
        params.temperature = Math.max(0, Math.min(2, profile.temperature));
      }
      if (typeof profile.max_output_tokens === 'number' && profile.max_output_tokens > 0) {
        params.max_tokens = Math.round(profile.max_output_tokens);
      }
      if (profile.tier) params.tier = profile.tier;
    }

    // Overload fallback chain — ordered list of models to retry if the primary
    // is unavailable (503/429). Filtered to the user's enabled models so we
    // never silently charge a pool the user hasn't subscribed to.
    params.fallbackChain = buildFallbackChain(model, enabledModels);

    return params;
  }

  /**
   * Parse stat strings (e.g. "4.2s", "94%", "2K", "82") to 0-100 numeric.
   * Blueprint stats come as display strings — normalize them.
   */
  function _num(val) {
    if (typeof val === 'number') return Math.max(0, Math.min(100, val));
    if (!val) return 50;
    const s = String(val).replace(/[%s]/g, '');
    if (s === '∞' || s === '&#8734;') return 100;
    // Handle K/M suffixes
    if (/\d+K$/i.test(s)) return Math.min(100, parseFloat(s) * 1000 / 100);
    if (/\d+M$/i.test(s)) return 100;
    // Handle "50/mo" style
    if (/\/mo/i.test(s)) return Math.min(100, parseFloat(s));
    const n = parseFloat(s);
    return isNaN(n) ? 50 : Math.max(0, Math.min(100, n));
  }

  /* ── NICE Auto: per-message prompt router ─────────────────────
     Routes each direct-chat message to a concrete model. Two-layer
     resolution: the ACTIVE STACK's niceAutoRouting is the SSOT and
     wins when the user runs a stack (that is the routing the Vault
     stack cards advertise); the AUTO_PREFS ladder covers users
     without a stack, or a stack pick that is disabled or cannot
     read a staged attachment. Client-side on purpose: the request
     reaches nice-ai with a concrete model id, so billing, pool
     gating, and capability checks stay per-real-model. The
     server-side `nice-auto` seam in nice-ai stays reserved for
     NICE-1.

     Cost posture, the load-bearing rule: the LADDERS never leave
     the free + standard pools, so a classifier misfire costs at
     most a weight-1-to-3 standard token from the 1000/mo Pro
     allowance, never a Claude or Premium token. Claude and Premium
     models are reachable through Auto ONLY via a stack-declared
     category route; the stack card advertises exactly those routes
     (note the Vault auto-applies the tier default stack on first
     render, so this is tier-scoped consent, not always a click).
     Casual chat always lands on free Flash.
     This is a different resolver from forBlueprint() above: that
     one answers "which model does this AGENT run on"
     (per-blueprint, ModelIntel-informed); this one answers "which
     model should THIS chat message use".

     Ladder order favors task fit, then lower token weight. Kimi
     ranks late everywhere: its thinking mode runs the better part
     of a minute, which is wrong for chat latency. */
  const AUTO_ID = 'nice-auto';
  const AUTO_PREFS = {
    // gpt-oss-120b is NOT in this ladder: its 128K window is below free
    // Flash's 1M, so it adds nothing for genuinely large pastes.
    longcontext: ['grok-4-3', 'gemini-2-5-flash'],
    code:        ['deepseek-v4-flash', 'gpt-5-mini', 'nemotron-3-super', 'gpt-oss-120b', 'gemini-2-5-flash'],
    reasoning:   ['nemotron-3-super', 'gpt-5-mini', 'deepseek-v4-flash', 'gpt-oss-120b', 'kimi-k2-6', 'gemini-2-5-flash'],
    writing:     ['gpt-5-mini', 'kimi-k2-6', 'deepseek-v4-flash', 'gemini-2-5-flash'],
    casual:      ['gemini-2-5-flash'],
  };

  // Classifier kind → the stack routing category it maps to.
  const AUTO_STACK_CATEGORY = {
    longcontext: 'longcontext',
    code:        'code',
    reasoning:   'reasoning',
    writing:     'draft',
    casual:      'cheap',
  };

  function _distinct(t, re) {
    const m = t.match(re) || [];
    return new Set(m.map(s => s.toLowerCase())).size;
  }

  function classifyPrompt(text) {
    const t = String(text || '');
    // Free Flash carries a 1M-token window; only genuinely large pastes
    // need the long-context specialists (and their standard-pool spend).
    if (t.length > 200000) return 'longcontext';
    // Code needs one strong signal, two distinct hard tokens, or a hard
    // token paired with a soft one. Soft tokens are polysemous English
    // words (class, script, query, bug), so alone they never trip the
    // arm: "a bug in my garden and a bug in my kitchen" stays casual.
    const strongCode = /```|\bstack trace\b|\btraceback\b|\bunit test\b|\bsyntax error\b|\brefactor\b/i.test(t);
    const hard = _distinct(t, /\b(debug|regex|typescript|javascript|python|sql|json|endpoint|compiler)\b/gi);
    const soft = _distinct(t, /\b(function|class|script|query|bug|exception|compiled?)\b/gi);
    if (strongCode || hard >= 2 || (hard >= 1 && soft >= 1)) return 'code';
    // Reasoning needs a reasoning phrase AND an analytical-domain word:
    // "the root cause of the squeak in my dryer" stays casual.
    if (/\b(prove|derive|theorem|step[- ]by[- ]step|trade-?offs?|root cause|pros and cons)\b/i.test(t)
        && /\b(design|architecture|system|algorithm|equation|dataset|model|analysis|proof|math|codebase|experiment|hypothesis)\b/i.test(t)) return 'reasoning';
    // Writing requires a creation verb aimed at a document-shaped object:
    // "write down the milk, eggs, bread" stays casual.
    if (/\b(write|draft|compose|rewrite|proofread)\b[^.!?\n]*\b(email|post|blog|letter|article|essay|copy|caption|newsletter|announcement|bio|description|proposal|report|memo|speech|script|presentation|press release)\b/i.test(t)) return 'writing';
    return 'casual';
  }

  function routeAuto(text, enabledModels) {
    const raw = enabledModels
      || (typeof State !== 'undefined' && State.get('enabled_models'))
      || {};
    // Canonicalize keys (legacy maps carry dotted ids) like
    // buildFallbackChain does, so ladder lookups never silently miss.
    const enabled = {};
    for (const k of Object.keys(raw)) enabled[_canonicalize(k)] = raw[k];
    const kind = classifyPrompt(text);

    // Layer 1: the active stack's routing, but only for a category the
    // stack EXPLICITLY declares. Stacks.routeFor() falls through to the
    // stack's first (priciest) model for undeclared categories, which
    // would burn premium tokens on casual prose; undeclared categories
    // belong to the ladder. Mirrors the free-first posture forBlueprint
    // enforces for agents.
    if (typeof Stacks !== 'undefined' && typeof Stacks.activeStackObject === 'function') {
      const stackObj = Stacks.activeStackObject();
      const stackPick = stackObj?.niceAutoRouting?.[AUTO_STACK_CATEGORY[kind] || 'cheap'];
      if (stackPick && enabled[stackPick]) return { id: stackPick, kind, via: 'stack' };
    }

    // Layer 2: the preference ladder.
    const prefs = AUTO_PREFS[kind] || AUTO_PREFS.casual;
    for (const id of prefs) {
      if (enabled[id]) return { id, kind, via: 'ladder' };
    }

    // Layer 3: the CHEAPEST enabled chain model (the chain is ordered
    // priciest-first; walking it forward would re-open the very trap the
    // stack layer closed), then the free default.
    const any = [...CAPABILITY_CHAIN].reverse().find(m => enabled[m.id]);
    return { id: any ? any.id : 'gemini-2-5-flash', kind, via: 'fallback' };
  }

  return { fromStats, forBlueprint, buildFallbackChain, canonicalize: _canonicalize, canonicalizeEnabledMap, CAPABILITY_CHAIN, MODEL_ALIASES, AUTO_ID, AUTO_PREFS, AUTO_STACK_CATEGORY, classifyPrompt, routeAuto };
})();
