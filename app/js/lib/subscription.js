/* ═══════════════════════════════════════════════════════════════════
   NICE — Subscription Management
   Two-plan model: Free → Pro ($9.99/mo) with optional add-ons.
     - Pro = 12 slots, instant Legendary, 1,000 standard tokens/month
     - Claude add-on = +500 claude tokens/mo, unlocks Sonnet 4.6 / Opus 4.6
     - Premium add-on = +500 premium tokens/mo, unlocks GPT-5.4 Pro,
       GPT-5.3 Codex, OpenAI o3, Gemini 3.1 Pro
   Self-hosters can disable the paywall entirely by setting
     window.NICE_CONFIG = { paywallEnabled: false }
   in their HTML — every user is then treated as a full Pro subscriber
   with every add-on, no billing infrastructure required.
═══════════════════════════════════════════════════════════════════ */

const Subscription = (() => {

  /* ── Plan Definitions ── */
  const PLANS = {
    free: {
      id: 'free',
      price: 0,
      slots: 6,
      label: 'Free',
      icon: '🛸',
      color: '#94a3b8',
      desc: 'Gemini 2.5 Flash. 6 slots. XP progression to Legendary.',
    },
    pro: {
      id: 'pro',
      price: 9.99,
      slots: 12,
      label: 'Pro',
      icon: '⭐',
      color: '#f59e0b',
      desc: '12 slots. Legendary instantly. 1,000 standard tokens/month. All non-flagship models.',
    },
  };

  /* ── Add-on Definitions ── */
  const ADDONS = {
    claude: {
      id: 'claude',
      price: 9.99,
      label: 'Claude',
      icon: '🧠',
      color: '#cd7f32',
      desc: '500 Claude tokens/month. Unlocks Claude 4.6 Sonnet and Opus.',
    },
    premium: {
      id: 'premium',
      price: 9.99,
      label: 'Premium',
      icon: '🚀',
      color: '#10b981',
      desc: '500 Premium tokens/month. Unlocks GPT-5.4 Pro, Codex, OpenAI o3, Gemini 3.1 Pro.',
    },
  };

  /* ── Backward-compat plan aliases (legacy → new) ──
     Any historical plan name maps down to free | pro. */
  const PLAN_ALIASES = {
    scout: 'free', explorer: 'free', pilot: 'free',
    frigate: 'pro', cruiser: 'pro', captain: 'pro', dreadnought: 'pro', flagship: 'pro',
    starpass: 'pro',
  };
  // Legacy alias kept so external callers don't break
  const PLAN_TIERS = PLANS;

  /* ── State ── */
  let _subscription = null;

  /* ── Self-hoster bypass ──
     If window.NICE_CONFIG.paywallEnabled === false, every user is
     treated as a Pro subscriber with every add-on. No billing,
     no gates, no upgrade prompts. */
  function _paywallEnabled() {
    if (typeof window === 'undefined') return true;
    const cfg = window.NICE_CONFIG;
    if (!cfg) return true;
    return cfg.paywallEnabled !== false;
  }

  /* ── Subscription Queries ── */

  async function getSubscription() {
    if (!_paywallEnabled()) {
      _subscription = { plan: 'pro', status: 'active', addons: ['claude', 'premium'], current_period_end: null };
      return _subscription;
    }
    if (typeof SB === 'undefined' || !SB.isReady()) return _fallback();
    const user = typeof State !== 'undefined' ? State.get('user') : null;
    if (!user) return _fallback();

    try {
      const { data } = await SB.client.from('subscriptions').select('*').eq('user_id', user.id).single();
      _subscription = data;
      return data || _fallback();
    } catch {
      return _fallback();
    }
  }

  function _fallback() {
    return { plan: 'free', status: 'active', addons: [], current_period_end: null };
  }

  function getCurrentPlan() {
    if (!_paywallEnabled()) return 'pro';
    if (_subscription) {
      const plan = _subscription.plan || 'free';
      return PLAN_ALIASES[plan] || plan;
    }
    const legacy = typeof Utils !== 'undefined' && Utils.KEYS ? localStorage.getItem(Utils.KEYS.plan) : null;
    if (legacy) return PLAN_ALIASES[legacy] || legacy;
    return 'free';
  }

  function getPlanTier(planId) {
    const id = PLAN_ALIASES[planId] || planId || 'free';
    return PLANS[id] || PLANS.free;
  }

  /** Return the current user's add-ons array. Always includes both
      add-ons when the paywall is disabled. */
  function getAddons() {
    if (!_paywallEnabled()) return ['claude', 'premium'];
    if (_subscription && Array.isArray(_subscription.addons)) return _subscription.addons.slice();
    return [];
  }

  /** True when the user is on Pro (paid plan, active status). */
  function isPro() {
    if (!_paywallEnabled()) return true;
    return getCurrentPlan() === 'pro' && (_subscription?.status || 'active') === 'active';
  }

  /** Backward-compat alias used by gamification.js and several views. */
  function isActive() { return isPro(); }

  /** True when the user has a specific add-on enabled. */
  function hasAddon(addonId) {
    if (!_paywallEnabled()) return true;
    return getAddons().includes(addonId);
  }

  /** Returns the slot count this user can deploy.
      Pro = 12, Free = 6. No XP scaling — slot count is purely
      a subscription perk. Rank still gates rarity, not capacity. */
  function getSlotLimit() {
    return isPro() ? PLANS.pro.slots : PLANS.free.slots;
  }

  /** Backward-compat — slot count was previously an override, now
      it's the actual count. Returning it unchanged is equivalent. */
  function canUseShipClass() { return true; }


  /* ── Stripe Integration ── */

  /** Attach the user's id + email to a Stripe payment link so the
      webhook can map the resulting subscription back to the right
      Supabase user without an email-only lookup. Every call that opens
      a live Stripe URL must go through this. */
  function _withUserRef(url, user) {
    if (!url || !user) return url;
    try {
      const parsed = new URL(url);
      if (user.id)    parsed.searchParams.set('client_reference_id', user.id);
      if (user.email) parsed.searchParams.set('prefilled_email', user.email);
      return parsed.toString();
    } catch {
      return url;
    }
  }

  /** Open a Stripe payment link in a new tab. */
  function _openPaymentLink(url) {
    if (!url) return;
    try {
      const h = new URL(url).hostname;
      if (!(h.endsWith('.stripe.com') || h === 'buy.stripe.com' || h === 'checkout.stripe.com' || h === 'billing.stripe.com')) {
        throw new Error('Unexpected redirect domain: ' + h);
      }
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Invalid checkout URL', message: e.message || 'Could not open Stripe', type: 'error' });
      }
    }
  }

  /** Ensure the current user has a `subscriptions` row. New users
      hit this on first load; we insert a `plan=free, status=active`
      record so UI queries have something to read and the webhook has
      a target to update when they later subscribe.
      No-op if the row already exists. */
  async function _ensureRow(user) {
    if (!user || !user.id) return;
    if (typeof SB === 'undefined' || !SB.isReady()) return;
    try {
      const { data: existing } = await SB.client
        .from('subscriptions')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (existing) return;
      await SB.client.from('subscriptions').insert({
        user_id: user.id,
        plan:    'free',
        status:  'active',
        addons:  [],
      });
    } catch (err) {
      console.warn('[Subscription] _ensureRow:', err && err.message);
    }
  }

  /** Translate a 402 response from `nice-ai` into an actionable toast.
      Returns true if the body was a billing error and was handled. */
  function handleBillingError(body) {
    if (!body || !body.code) return false;
    if (typeof Notify === 'undefined') return true;

    let title   = 'Payment required';
    let message = body.error || 'Something went wrong.';
    switch (body.code) {
      case 'subscription_required':
        title   = 'NICE Pro required';
        message = body.error || 'Upgrade to NICE Pro to use this model.';
        break;
      case 'addon_required':
        title   = ((body.required_addon || 'Add-on') + ' add-on required')
                    .replace(/^\w/, (c) => c.toUpperCase());
        message = body.error || 'Enable the add-on to use this model.';
        break;
      case 'insufficient_tokens':
        title   = 'Out of ' + (body.pool || '') + ' tokens';
        message = body.error || 'Top up your balance or switch to the free Gemini model.';
        break;
      case 'past_due':
        title   = 'Payment failed';
        message = body.error || 'Update your card in Wallet to continue.';
        break;
    }
    Notify.send({ title, message, type: 'budget_alert' });
    return true;
  }

  async function subscribe(planId) {
    const user = typeof State !== 'undefined' ? State.get('user') : null;
    if (!user) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Sign In Required', message: 'Sign in to subscribe.', type: 'warning' });
      return;
    }

    // Prefer the edge function (single subscription with items). Fall
    // back to the payment link if it errors or isn't deployed.
    if (typeof SB !== 'undefined' && SB.isReady && SB.isReady()) {
      try {
        const result = await Promise.race([
          SB.client.functions.invoke('stripe-subscribe', {
            body: { planId, userId: user.id, email: user.email },
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
        ]);
        const { data, error } = result;
        if (error) throw error;
        if (data?.url) {
          _openPaymentLink(data.url);
          return;
        }
      } catch {
        // fall through to payment link
      }
    }

    // Fallback: open the StripeConfig payment link for the requested plan
    const cfg = typeof StripeConfig !== 'undefined' ? StripeConfig.getSubscription(planId) : null;
    if (cfg?.paymentLinkUrl) {
      _openPaymentLink(_withUserRef(cfg.paymentLinkUrl, user));
    } else if (typeof Notify !== 'undefined') {
      Notify.send({ title: 'Subscription Error', message: 'No Stripe product for ' + planId, type: 'error' });
    }
  }

  /** Add or remove an add-on. addonId is 'claude' or 'premium'. */
  async function setAddon(addonId, enabled) {
    const user = typeof State !== 'undefined' ? State.get('user') : null;
    if (!user) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Sign In Required', message: 'Sign in to manage add-ons.', type: 'warning' });
      return;
    }

    // Removal always goes through the billing portal (Stripe's cancel UI).
    if (!enabled) {
      return openBillingPortal();
    }

    // Add: try the edge function first, fall back to payment link
    if (typeof SB !== 'undefined' && SB.isReady && SB.isReady()) {
      try {
        const { data, error } = await SB.client.functions.invoke('stripe-subscribe', {
          body: { action: 'addon_add', addonId, userId: user.id, email: user.email },
        });
        if (error) throw error;
        if (data?.url) {
          _openPaymentLink(data.url);
          return;
        }
      } catch {
        // fall through to payment link
      }
    }

    const cfg = typeof StripeConfig !== 'undefined' ? StripeConfig.getSubscription(addonId) : null;
    if (cfg?.paymentLinkUrl) {
      _openPaymentLink(_withUserRef(cfg.paymentLinkUrl, user));
    } else if (typeof Notify !== 'undefined') {
      Notify.send({ title: 'Add-on Error', message: 'No Stripe product for ' + addonId, type: 'error' });
    }
  }

  /** Open a top-up pack checkout (one-time payment). Caller passes the
      StripeConfig.TOP_UPS id ('standard-boost' etc.). The webhook
      credits the right pool on completion. */
  function buyTopUp(topUpId) {
    const user = typeof State !== 'undefined' ? State.get('user') : null;
    if (!user) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Sign In Required', message: 'Sign in to buy tokens.', type: 'warning' });
      return;
    }
    const cfg = typeof StripeConfig !== 'undefined' ? StripeConfig.getTopUp(topUpId) : null;
    if (!cfg?.paymentLinkUrl) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Top-up Error', message: 'No Stripe product for ' + topUpId, type: 'error' });
      return;
    }
    _openPaymentLink(_withUserRef(cfg.paymentLinkUrl, user));
  }

  /** Legacy: kept for the upgrade modal in case it's still wired through
      a per-spaceship class upgrade path. New code should use subscribe(). */
  async function upgradeSpaceship(planId, spaceshipId, fromClass) {
    return subscribe(planId);
  }

  async function openBillingPortal() {
    if (typeof SB === 'undefined' || !SB.isReady()) return;
    const user = typeof State !== 'undefined' ? State.get('user') : null;
    if (!user) return;

    try {
      const { data, error } = await SB.client.functions.invoke('stripe-portal', {
        body: { userId: user.id },
      });
      if (error) throw error;
      if (data?.url) { try { const h = new URL(data.url).hostname; if (h.endsWith('.stripe.com') || h === 'checkout.stripe.com' || h === 'billing.stripe.com') { window.location.href = data.url; } else { throw new Error('Unexpected redirect domain: ' + h); } } catch (e) { throw new Error('Invalid checkout URL'); } }
    } catch (err) {
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Billing Error', message: err.message || 'Failed to open billing portal', type: 'error' });
      }
    }
  }

  /* ── Auto-enable models on entitlement change ──
     When a user's subscription or add-on unlocks new pools, flip the
     corresponding models on in `enabled_models` so they show up in
     the chat + prompt-panel dropdowns without a manual trip to
     Vault. Purely additive — we never toggle a model OFF here, so
     an explicit user disable is preserved.
     Tracked via a per-entitlement fingerprint in localStorage so
     subsequent reloads at the same entitlement state don't override
     later user toggles. */
  const _AUTO_ENABLE_KEY = 'nice-subscription-last-entitlement';

  function _autoEnableEntitled() {
    if (typeof TokenConfig === 'undefined' || !TokenConfig.MODELS) return;
    const pro = isPro();
    const addons = getAddons().slice().sort();
    const fingerprint = (pro ? 'pro' : 'free') + '|' + addons.join(',');

    let previous = null;
    try { previous = localStorage.getItem(_AUTO_ENABLE_KEY); } catch { /* ignore */ }
    if (previous === fingerprint) return;

    const current = (typeof State !== 'undefined' && State.get('enabled_models')) || {};
    const next = { ...current };
    for (const [modelId, meta] of Object.entries(TokenConfig.MODELS)) {
      // Free models are always enabled.
      if (!meta || meta.pool === null || meta.weight === 0) {
        next[modelId] = true;
        continue;
      }
      const requiredAddon = (TokenConfig.POOLS?.[meta.pool] || {}).requiresAddon || null;
      const entitled = pro && (!requiredAddon || addons.includes(requiredAddon));
      if (entitled) next[modelId] = true;
      // Not entitled → leave the existing value untouched. Flipping
      // off would erase a user's explicit preference and is beyond
      // this helper's scope.
    }

    if (typeof State !== 'undefined') State.set('enabled_models', next);
    try {
      const key = (typeof Utils !== 'undefined' && Utils.KEYS && Utils.KEYS.enabledModels) || 'nice-enabled-models';
      localStorage.setItem(key, JSON.stringify(next));
      localStorage.setItem(_AUTO_ENABLE_KEY, fingerprint);
    } catch { /* ignore */ }
  }

  /* ── Init ── */

  async function init() {
    const user = typeof State !== 'undefined' ? State.get('user') : null;
    if (user) await _ensureRow(user);
    await getSubscription();
    _autoEnableEntitled();
  }

  return {
    PLANS,
    PLAN_TIERS,
    PLAN_ALIASES,
    ADDONS,
    init,
    getSubscription,
    getCurrentPlan,
    getPlanTier,
    getAddons,
    getSlotLimit,
    isPro,
    isActive,
    hasAddon,
    canUseShipClass,
    subscribe,
    setAddon,
    buyTopUp,
    upgradeSpaceship,
    openBillingPortal,
    handleBillingError,
    paywallEnabled: _paywallEnabled,
  };
})();
