/* ═══════════════════════════════════════════════════════════════════
   NICE — Token Configuration (SSOT)
   Defines the billing-visible token pools, which pool each model
   consumes from, and how many tokens a single message on that model
   costs. The proprietary `nice-ai` edge function mirrors this exact
   structure server-side when computing debits; any change here must
   be mirrored there.

   DESIGN: "1 token" is defined as roughly "one message on a 1× model".
   Real LLM token counts are ~3× higher per message, but the user sees
   a single round-number credit unit ("1,000 tokens remaining") that
   maps cleanly to mission count. See fuelToMessages() below.

   POOLS:
     standard  — included in Pro. Covers GPT-5 Mini, Llama 4 Scout,
                 Grok 4.1 Fast.
     claude    — Claude add-on. Covers Claude Haiku / Sonnet / Opus.
                 Expensive models have higher weights so Opus can't
                 drain a month's allowance in a dozen messages.

   Adding a new flagship family later is a config change: add a pool,
   add the models with weights, and ship an add-on in subscription.js.
═══════════════════════════════════════════════════════════════════ */

const TokenConfig = (() => {
  /* ── Pool definitions ─────────────────────────────────────── */
  /* Each pool has its own monthly allowance and is unlocked by the
     base Pro plan or by an add-on. Adding a new flagship family is
     a config change here plus a new entry in the MODELS map below. */
  const POOLS = {
    standard: {
      id: 'standard',
      label: 'Standard',
      description: 'Pro plan models — GPT-5 mini, Llama 4 Scout, Grok 4.1 Fast.',
      monthlyAllowance: 1000,       // Pro plan grants this every billing cycle
      requiresAddon: null,          // no add-on needed; included in Pro
    },
    claude: {
      id: 'claude',
      label: 'Claude',
      description: 'Claude add-on — Sonnet 4.6, Opus 4.6.',
      monthlyAllowance: 500,        // Claude add-on grants this every billing cycle
      requiresAddon: 'claude',
    },
    premium: {
      id: 'premium',
      label: 'Premium',
      description: 'Premium add-on — GPT-5.4 Pro, GPT-5.3 Codex, OpenAI o3, Gemini 2.5 Pro.',
      monthlyAllowance: 500,        // Premium add-on grants this every billing cycle
      requiresAddon: 'premium',
    },
  };

  /* ── Model → pool + weight map ────────────────────────────── */
  /* Weight is how many pool tokens a SINGLE message on that model
     consumes. Weights roughly mirror the provider's real cost ratio
     so every SKU stays profitable regardless of which model a user
     prefers. Models with weight 0 never debit (e.g. Gemini Flash).

     The 10 entries below correspond to the current LLM lineup; any
     model not listed is treated as `free` by isFreeModel(). */
  const MODELS = {
    // ── Free tier (no pool, always free)
    'gemini-2-5-flash':   { pool: null,       weight: 0,  tier: 'free'     },

    // ── Standard pool (Pro plan, no add-on)
    'gpt-5-mini':         { pool: 'standard', weight: 1,  tier: 'standard' },
    'llama-4-scout':      { pool: 'standard', weight: 1,  tier: 'standard' },
    'grok-4-1-fast':      { pool: 'standard', weight: 2,  tier: 'standard' },

    // ── Claude pool (Claude add-on)
    'claude-4-6-sonnet':  { pool: 'claude',   weight: 3,  tier: 'claude'   },
    'claude-4-7-opus':    { pool: 'claude',   weight: 10, tier: 'claude'   },

    // ── Premium pool (Premium add-on)
    'gpt-5-4-pro':        { pool: 'premium',  weight: 5,  tier: 'premium'  },
    'gpt-5-3-codex':      { pool: 'premium',  weight: 5,  tier: 'premium'  },
    'openai-o3':          { pool: 'premium',  weight: 15, tier: 'premium'  },
    'gemini-2-5-pro':     { pool: 'premium',  weight: 3,  tier: 'premium'  },
  };

  /* ── Lookups ──────────────────────────────────────────────── */

  /** Returns { pool, weight, tier } for a model, or null if unknown. */
  function getModel(modelId) {
    return MODELS[modelId] || null;
  }

  /** Returns the pool id a model belongs to, or null (free model). */
  function poolFor(modelId) {
    return MODELS[modelId]?.pool || null;
  }

  /** Returns the message weight for a model, or 0 if free/unknown. */
  function weightFor(modelId) {
    return MODELS[modelId]?.weight || 0;
  }

  /** Returns true if this model never debits any pool. */
  function isFreeModel(modelId) {
    const m = MODELS[modelId];
    return !m || m.pool === null || m.weight === 0;
  }

  /** Returns the list of model ids that consume from a given pool. */
  function modelsInPool(poolId) {
    return Object.keys(MODELS).filter(k => MODELS[k].pool === poolId);
  }

  /** Returns the monthly allowance Pro (or an addon) grants for a pool. */
  function monthlyAllowance(poolId) {
    return POOLS[poolId]?.monthlyAllowance || 0;
  }

  /** Returns the addon id required to unlock a pool, or null if included in Pro. */
  function requiredAddon(poolId) {
    return POOLS[poolId]?.requiresAddon || null;
  }

  /* ── Balance helpers ──────────────────────────────────────── */
  /* The `pools` column on token_balances is shaped:
       { [poolId]: { allowance, used, purchased } }
     `allowance` is the current period grant; `used` burns down as
     the user runs messages; `purchased` is the top-up balance that
     layers underneath (spent after allowance is exhausted, never
     resets). */

  /** Total remaining tokens in a pool: allowance left + purchased. */
  function remainingInPool(pools, poolId) {
    const p = pools?.[poolId];
    if (!p) return 0;
    const allowanceLeft = Math.max(0, (p.allowance || 0) - (p.used || 0));
    return allowanceLeft + (p.purchased || 0);
  }

  /** Estimate how many messages of a model a user can still run. */
  function messagesRemainingFor(pools, modelId) {
    if (isFreeModel(modelId)) return Infinity;
    const pool = poolFor(modelId);
    const weight = weightFor(modelId);
    if (!pool || weight <= 0) return Infinity;
    return Math.floor(remainingInPool(pools, pool) / weight);
  }

  /** Can a user send at least one message on a model right now? */
  function canRunModel(pools, modelId, addons = []) {
    if (isFreeModel(modelId)) return true;
    const pool = poolFor(modelId);
    const addon = requiredAddon(pool);
    if (addon && !addons.includes(addon)) return false;
    return messagesRemainingFor(pools, modelId) >= 1;
  }

  /** Compute the debit that results from sending one message on a model.
      Returns { pool, amount } or null for free models. The actual
      debit against DB state happens in the proprietary nice-ai edge
      function; this helper lets the UI preview costs consistently. */
  function previewDebit(modelId) {
    if (isFreeModel(modelId)) return null;
    return { pool: poolFor(modelId), amount: weightFor(modelId) };
  }

  /** Return a fresh empty pools object with allowances filled in
      for whichever pools the user currently has access to. Called
      on signup and on billing-cycle rollover. */
  function initialPools({ pro = false, addons = [] } = {}) {
    const out = {};
    for (const poolId of Object.keys(POOLS)) {
      const addon = POOLS[poolId].requiresAddon;
      const entitled = pro && (addon === null || addons.includes(addon));
      out[poolId] = {
        allowance: entitled ? POOLS[poolId].monthlyAllowance : 0,
        used: 0,
        purchased: 0,
      };
    }
    return out;
  }

  return {
    POOLS, MODELS,
    getModel, poolFor, weightFor, isFreeModel, modelsInPool,
    monthlyAllowance, requiredAddon,
    remainingInPool, messagesRemainingFor, canRunModel, previewDebit,
    initialPools,
  };
})();

// Expose for tests / edge function mirroring
if (typeof module !== 'undefined' && module.exports) module.exports = TokenConfig;
