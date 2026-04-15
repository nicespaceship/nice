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

  async function subscribe(planId) {
    if (typeof SB === 'undefined' || !SB.isReady()) return;
    const user = typeof State !== 'undefined' ? State.get('user') : null;
    if (!user) return;

    try {
      const result = await Promise.race([
        SB.client.functions.invoke('stripe-subscribe', {
          body: { planId, userId: user.id, email: user.email },
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
      ]);
      const { data, error } = result;
      if (error) throw error;
      if (data?.url) { try { const h = new URL(data.url).hostname; if (h.endsWith('.stripe.com') || h === 'checkout.stripe.com' || h === 'billing.stripe.com') { window.location.href = data.url; } else { throw new Error('Unexpected redirect domain: ' + h); } } catch (e) { throw new Error('Invalid checkout URL'); } }
    } catch (err) {
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Subscription Error', message: err.message || 'Failed to start checkout', type: 'error' });
      }
    }
  }

  /** Add or remove an add-on. addonId is 'claude' or 'premium'. */
  async function setAddon(addonId, enabled) {
    if (typeof SB === 'undefined' || !SB.isReady()) return;
    const user = typeof State !== 'undefined' ? State.get('user') : null;
    if (!user) return;

    try {
      const { data, error } = await SB.client.functions.invoke('stripe-subscribe', {
        body: { action: enabled ? 'addon_add' : 'addon_remove', addonId, userId: user.id, email: user.email },
      });
      if (error) throw error;
      if (data?.url) { try { const h = new URL(data.url).hostname; if (h.endsWith('.stripe.com') || h === 'checkout.stripe.com' || h === 'billing.stripe.com') { window.location.href = data.url; } else { throw new Error('Unexpected redirect domain: ' + h); } } catch (e) { throw new Error('Invalid checkout URL'); } }
    } catch (err) {
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Add-on Error', message: err.message || 'Failed to update add-on', type: 'error' });
      }
    }
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

  /* ── Init ── */

  async function init() {
    await getSubscription();
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
    upgradeSpaceship,
    openBillingPortal,
    paywallEnabled: _paywallEnabled,
  };
})();
