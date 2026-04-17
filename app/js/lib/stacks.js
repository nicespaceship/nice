/* ═══════════════════════════════════════════════════════════════════
   NICE — Stacks (curated LLM bundles)
   A Stack is a pre-configured set of 4-6 models tuned for a specific
   scenario (Builder, Researcher, Writer, Operator, etc.). Activating
   a stack toggles those models on in `enabled_models` state, so
   agents using NICE Auto can route to the right model for each task
   without the user manually picking from 15 individual toggles.

   Stacks are gated by plan + add-ons. A user activates the highest
   stack they're entitled to; the picker grids out the rest as locked
   with an "Unlock with..." CTA.

   Adding a new stack later is a one-line addition to STACKS — no UI
   work needed, the picker reads everything from this map.
═══════════════════════════════════════════════════════════════════ */

const Stacks = (() => {

  /* ── Stack definitions (SSOT) ─────────────────────────────── */
  const STACKS = {
    free: {
      id: 'free',
      name: 'Free Tier',
      tagline: 'Gemini 2.5 Flash. Always free.',
      icon: '🆓',
      description: 'Gemini 2.5 Flash on every task. Zero cost. Always available, even without a subscription.',
      models: ['gemini-2-5-flash'],
      requires: { pro: false, addons: [] },
      niceAutoRouting: {
        default: 'gemini-2-5-flash',
      },
    },
    pro: {
      id: 'pro',
      name: 'Pro Stack',
      tagline: 'Best of Pro alone. No add-ons.',
      icon: '💰',
      description: 'Three standard models covering reasoning, long context, and budget compute. Perfect for users who don\'t need flagship Claude or GPT.',
      models: ['gpt-5-mini', 'llama-4-scout', 'gemini-2-5-flash'],
      requires: { pro: true, addons: [] },
      niceAutoRouting: {
        reasoning:    'gpt-5-mini',
        quick:        'gpt-5-mini',
        cheap:        'gemini-2-5-flash',
        code:         'gpt-5-mini',
        multilingual: 'gemini-2-5-flash',
        longcontext:  'llama-4-scout',
      },
    },
    builder: {
      id: 'builder',
      name: 'Builder',
      tagline: 'Code, debug, deploy.',
      icon: '🔨',
      description: 'Solo developers shipping code. GPT-5.3 Codex for agentic coding tasks, fast iteration on cheap budget models, free chitchat.',
      models: ['gpt-5-3-codex', 'gpt-5-mini', 'gemini-2-5-flash'],
      requires: { pro: true, addons: ['premium'] },
      niceAutoRouting: {
        code:      'gpt-5-3-codex',
        reasoning: 'gpt-5-mini',
        quick:     'gpt-5-mini',
        cheap:     'gemini-2-5-flash',
      },
    },
    researcher: {
      id: 'researcher',
      name: 'Researcher',
      tagline: 'Long context. Multimodal synthesis.',
      icon: '🔭',
      description: 'Long documents, citation-heavy work, multi-source synthesis. 2M-token Grok for raw reach, Gemini 3.1 Pro for multimodal reasoning, Flash for cheap parallel runs.',
      models: ['grok-4-1-fast', 'gemini-3-1-pro', 'gemini-2-5-flash'],
      requires: { pro: true, addons: ['premium'] },
      niceAutoRouting: {
        longcontext: 'grok-4-1-fast',
        multimodal:  'gemini-3-1-pro',
        reasoning:   'gemini-3-1-pro',
        cheap:       'gemini-2-5-flash',
      },
    },
    writer: {
      id: 'writer',
      name: 'Writer',
      tagline: 'Long-form content. Brand voice.',
      icon: '✍️',
      description: 'Marketing, blog posts, press releases, brand work. Claude Opus for final polish, Sonnet for first drafts, GPT-5 mini for quick edits.',
      models: ['claude-4-6-opus', 'claude-4-6-sonnet', 'gpt-5-mini', 'gemini-2-5-flash'],
      requires: { pro: true, addons: ['claude'] },
      niceAutoRouting: {
        polish: 'claude-4-6-opus',
        draft:  'claude-4-6-sonnet',
        quick:  'gpt-5-mini',
        cheap:  'gemini-2-5-flash',
      },
    },
    operator: {
      id: 'operator',
      name: 'Operator',
      tagline: 'Multi-step automation. Tool use.',
      icon: '🤖',
      description: 'Agentic workflows, tool calls, RAG retrieval. Claude Sonnet drives plans and tool calls, Llama 4 Scout handles long-context agentic work, Flash handles cheap bulk.',
      models: ['claude-4-6-sonnet', 'llama-4-scout', 'gemini-2-5-flash'],
      requires: { pro: true, addons: ['claude'] },
      niceAutoRouting: {
        agent:       'claude-4-6-sonnet',
        toolcall:    'claude-4-6-sonnet',
        retrieval:   'claude-4-6-sonnet',
        longcontext: 'llama-4-scout',
        cheap:       'gemini-2-5-flash',
      },
    },
    analyst: {
      id: 'analyst',
      name: 'Analyst',
      tagline: 'Hard reasoning. STEM. Math.',
      icon: '📊',
      description: 'Frontier reasoning for the hardest problems. OpenAI o3 for primary reasoning, Claude Opus as a cross-check path, Flash for cheap parallel runs.',
      models: ['openai-o3', 'claude-4-6-opus', 'gemini-2-5-flash'],
      requires: { pro: true, addons: ['claude', 'premium'] },
      niceAutoRouting: {
        reasoning: 'openai-o3',
        synthesis: 'claude-4-6-opus',
        parallel:  'gemini-2-5-flash',
        cheap:     'gemini-2-5-flash',
      },
    },
  };

  /* ── Lookups ─────────────────────────────────────────────── */

  /** Returns the full stack object for an id, or null. */
  function getStack(id) {
    return STACKS[id] || null;
  }

  /** Returns every stack as an array, in display order. */
  function listStacks() {
    return ['free', 'pro', 'builder', 'researcher', 'writer', 'operator', 'analyst']
      .map(id => STACKS[id])
      .filter(Boolean);
  }

  /** Stable list of model ids referenced by every stack. */
  function allStackModels() {
    const set = new Set();
    for (const s of listStacks()) for (const m of s.models) set.add(m);
    return Array.from(set);
  }

  /* ── Entitlement ─────────────────────────────────────────── */

  /** True when the user can activate this stack right now. */
  function isStackUnlocked(stackId, { pro = false, addons = [] } = {}) {
    const s = STACKS[stackId];
    if (!s) return false;
    if (s.requires.pro && !pro) return false;
    for (const required of s.requires.addons || []) {
      if (!addons.includes(required)) return false;
    }
    return true;
  }

  /** Why the stack is locked. Returns a short upsell string, or null
      if the stack is unlocked. */
  function lockReason(stackId, { pro = false, addons = [] } = {}) {
    const s = STACKS[stackId];
    if (!s) return null;
    if (s.requires.pro && !pro) return 'Requires Pro';
    const missing = (s.requires.addons || []).filter(a => !addons.includes(a));
    if (missing.length === 0) return null;
    if (missing.length === 1) return 'Requires ' + missing[0] + ' add-on';
    return 'Requires ' + missing.join(' + ') + ' add-ons';
  }

  /** Pick the best stack the user is currently entitled to.
      Order of preference roughly mirrors specialization depth: a
      Pro+Claude+Premium user defaults to Analyst, a Pro+Claude user
      defaults to Writer, a Pro+Premium user defaults to Builder, a
      Pro-only user defaults to Pro Stack, a free user defaults to
      Free Tier. */
  function defaultStackForUser({ pro = false, addons = [] } = {}) {
    const ctx = { pro, addons };
    const order = ['analyst', 'writer', 'builder', 'researcher', 'operator', 'pro', 'free'];
    for (const id of order) {
      if (isStackUnlocked(id, ctx)) return id;
    }
    return 'free';
  }

  /* ── Active stack persistence ────────────────────────────── */

  function _activeKey() {
    return (typeof Utils !== 'undefined' && Utils.KEYS && Utils.KEYS.activeStack) || 'nice-active-stack';
  }

  /** Returns the active stack id from localStorage, or null. */
  function activeStack() {
    try { return localStorage.getItem(_activeKey()) || null; } catch { return null; }
  }

  /** Returns the active stack object, or null. */
  function activeStackObject() {
    return getStack(activeStack());
  }

  /** Set the active stack. Returns true on success, false if the
      stack id is unknown. Does NOT enforce entitlement — the caller
      is expected to have checked isStackUnlocked first. */
  function setActiveStack(stackId) {
    const stack = getStack(stackId);
    if (!stack) return false;
    try { localStorage.setItem(_activeKey(), stackId); } catch {}
    if (typeof State !== 'undefined') State.set('active_stack', stackId);
    return true;
  }

  /** Activate a stack: persist the id, then mirror the stack's
      models into `enabled_models` state. Returns true on success. */
  function applyStack(stackId) {
    const stack = getStack(stackId);
    if (!stack) return false;
    setActiveStack(stackId);

    // Build a fresh enabled_models map. Free models stay on by default,
    // and every model in the stack flips on. Anything not in the stack
    // is OFF — switching stacks is a clean swap, not an additive merge.
    const enabled = {};
    if (typeof TokenConfig !== 'undefined') {
      for (const id of Object.keys(TokenConfig.MODELS || {})) {
        enabled[id] = TokenConfig.isFreeModel(id);
      }
    }
    for (const id of stack.models) {
      enabled[id] = true;
    }

    if (typeof State !== 'undefined') State.set('enabled_models', enabled);
    try {
      const key = (typeof Utils !== 'undefined' && Utils.KEYS && Utils.KEYS.enabledModels) || 'nice-enabled-models';
      localStorage.setItem(key, JSON.stringify(enabled));
    } catch {}

    return true;
  }

  /* ── NICE Auto routing ───────────────────────────────────── */

  /** Resolve the model NICE Auto should use for a given task category
      under the currently-active stack. If the task isn't routed, falls
      back to the active stack's first model, or to gemini-2-5-flash. */
  function routeFor(category) {
    const stack = activeStackObject();
    if (!stack) return 'gemini-2-5-flash';
    const routed = stack.niceAutoRouting && stack.niceAutoRouting[category];
    if (routed) return routed;
    if (stack.niceAutoRouting && stack.niceAutoRouting.default) return stack.niceAutoRouting.default;
    return stack.models[0] || 'gemini-2-5-flash';
  }

  return {
    STACKS,
    getStack,
    listStacks,
    allStackModels,
    isStackUnlocked,
    lockReason,
    defaultStackForUser,
    activeStack,
    activeStackObject,
    setActiveStack,
    applyStack,
    routeFor,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Stacks;
