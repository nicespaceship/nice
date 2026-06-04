/* ═══════════════════════════════════════════════════════════════════
   NICE — Subscription Management
   Two-plan model: Free → Pro ($9.99/mo) with optional add-ons.
     - Pro = run a fleet (Free is one active spaceship), instant
       Legendary + every crew slot, 1,000 standard tokens/month
     - Claude add-on = +500 claude tokens/mo, unlocks Sonnet 4.6 / Opus 4.7
     - Premium add-on = +500 premium tokens/mo, unlocks GPT-5.4 Pro,
       GPT-5.3 Codex, OpenAI o3, Gemini 2.5 Pro
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
      ships: '1 spaceship',
      label: 'Free',
      icon: '',
      color: '#94a3b8',
      desc: 'Gemini 2.5 Flash. One active spaceship. Crew slots and rarities unlock as you rank up to Legendary.',
    },
    pro: {
      id: 'pro',
      price: 9.99,
      ships: 'Unlimited spaceships',
      label: 'Pro',
      icon: '',
      color: '#f59e0b',
      desc: 'Run a fleet of spaceships. Every crew slot and Legendary unlocked instantly. 1,000 standard tokens a month. All non-flagship models.',
    },
  };

  /* ── Add-on Definitions ── */
  const ADDONS = {
    claude: {
      id: 'claude',
      price: 9.99,
      label: 'Claude',
      icon: '',
      color: '#cd7f32',
      desc: '500 Claude tokens/month. Unlocks Claude 4.6 Sonnet and 4.7 Opus.',
    },
    premium: {
      id: 'premium',
      price: 9.99,
      label: 'Premium',
      icon: '',
      color: '#10b981',
      desc: '500 Premium tokens/month. Unlocks GPT-5.4 Pro, Codex, OpenAI o3, Gemini 2.5 Pro.',
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

  /* ── Subscription Queries ──
     A user can have multiple subscription rows — one per Stripe
     subscription. Pro is one row, each add-on is its own row (each
     Payment Link creates a separate Stripe subscription). This
     function fetches all rows and aggregates them into one synthetic
     subscription shape: plan=pro if any row is pro+active; addons is
     the union of active addons; status reflects the most-permissive
     active state. */

  /** Raw rows, keyed by subscription id. Useful for views that need to
      enumerate every subscription (e.g. settings, admin). */
  let _subscriptionRows = [];

  async function getSubscription() {
    if (!_paywallEnabled()) {
      _subscription = { plan: 'pro', status: 'active', addons: ['claude', 'premium'], current_period_end: null };
      _subscriptionRows = [_subscription];
      return _subscription;
    }
    if (typeof SB === 'undefined' || !SB.isReady()) return _fallback();

    // Read the user directly from the Supabase session rather than
    // State.user. On page reload the auth session restore is async:
    // calling views may run before State.user is populated, which
    // would otherwise poison the subscription cache with a `free`
    // fallback. getSession() awaits the restore, so this call reflects
    // reality.
    let user = null;
    try {
      const { data } = await SB.client.auth.getSession();
      user = data?.session?.user ?? null;
    } catch { /* ignore */ }
    if (!user) {
      user = typeof State !== 'undefined' ? State.get('user') : null;
    }
    if (!user) return _fallback();

    try {
      const { data } = await SB.client
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id);
      const rows = Array.isArray(data) ? data : (data ? [data] : []);
      _subscriptionRows = rows;
      _subscription = _aggregate(rows);
      return _subscription;
    } catch {
      return _fallback();
    }
  }

  /** Aggregate multiple subscription rows into one synthetic view.
      Callers that need per-row detail should read getSubscriptionRows. */
  function _aggregate(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return _fallback();
    // Only active-ish rows contribute to plan + addons.
    const liveRows = rows.filter((r) => {
      const s = r.status || 'active';
      return s === 'active' || s === 'trialing';
    });
    let plan = 'free';
    const addonsSet = new Set();
    for (const r of liveRows) {
      if ((r.plan || 'free') === 'pro') plan = 'pro';
      if (Array.isArray(r.addons)) for (const a of r.addons) addonsSet.add(a);
    }
    // Status priority: a live (active/trialing) row means the user is active,
    // even if a SEPARATE row is in dunning — a past_due add-on must not
    // downgrade a paid, active Pro user. Surface past_due only when no row is
    // live; else fall back to the first row's status.
    let status = 'active';
    if (liveRows.length === 0) {
      status = rows.some((r) => r.status === 'past_due') ? 'past_due' : (rows[0].status || 'canceled');
    }
    // Earliest current_period_end across live rows — conservative.
    let currentPeriodEnd = null;
    for (const r of liveRows) {
      if (!r.current_period_end) continue;
      if (!currentPeriodEnd || r.current_period_end < currentPeriodEnd) {
        currentPeriodEnd = r.current_period_end;
      }
    }
    return {
      plan,
      status,
      addons: Array.from(addonsSet),
      current_period_end: currentPeriodEnd,
    };
  }

  function getSubscriptionRows() {
    return _subscriptionRows.slice();
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

  /** Number of spaceships a user can run active at once. Free = 1,
      Pro = unlimited. This is Pro's tangible capacity perk. Owned ships
      hydrated from user_spaceships always load (Blueprints._loadUserCreations
      bypasses activateShip) — this only caps NEW activations. */
  function getActiveShipLimit() {
    return isPro() ? Infinity : 1;
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

  /** Track which from-models we've already warned about so the
      auto_downgrade toast doesn't fire on every step of a long mission. */
  const _downgradeNotified = new Set();

  /** Surface a single toast per (from) model when nice-ai's auto_downgrade
      kicked in. Body shape from nice-ai v85:
        { from, to, reason, message }
      Reason mirrors BillingErrorCode (subscription_required | addon_required |
      insufficient_tokens | past_due). */
  function handleDowngrade(downgraded) {
    if (!downgraded || typeof downgraded.from !== 'string') return false;
    if (typeof Notify === 'undefined') return false;
    if (_downgradeNotified.has(downgraded.from)) return false;
    _downgradeNotified.add(downgraded.from);

    let title = 'Switched to Gemini Flash';
    switch (downgraded.reason) {
      case 'subscription_required':
        title = downgraded.from.startsWith('claude')
          ? 'Claude add-on required'
          : 'NICE Pro required';
        break;
      case 'addon_required':
        title = 'Add-on required';
        break;
      case 'insufficient_tokens':
        title = 'Out of tokens';
        break;
      case 'past_due':
        title = 'Payment failed';
        break;
    }
    const fromShort = downgraded.from.replace(/-/g, ' ');
    const message = (downgraded.message || 'Running on free Gemini Flash for this session.')
      + ' Subscribe to use ' + fromShort + '.';
    Notify.send({ title, message, type: 'budget_alert' });
    return true;
  }

  /** Try the consolidated `stripe-subscribe` edge function. Resolves to a
      Stripe Checkout/Portal URL on success, or null to signal "fall back to
      the per-product Payment Link". Times out after 6s and swallows every
      error so a missing, slow, or failing function never blocks the user —
      the Payment-Link fallback always works. One subscription with items
      (vs one Stripe sub per Payment Link) is the root-cause fix for the
      multi-row past_due bug class. See docs/stripe-subscribe-spec.md. */
  async function _tryStripeSubscribe(body) {
    if (typeof SB === 'undefined' || !SB.isReady || !SB.isReady()) return null;
    try {
      const { data, error } = await Promise.race([
        SB.client.functions.invoke('stripe-subscribe', { body }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
      ]);
      if (error) throw error;
      return (data && data.url) || null;
    } catch {
      return null;
    }
  }

  async function subscribe(planId) {
    const user = typeof State !== 'undefined' ? State.get('user') : null;
    if (!user) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Sign In Required', message: 'Sign in to subscribe.', type: 'warning' });
      return;
    }

    // Prefer the edge function (one subscription with items); fall back to the
    // per-product Payment Link if it errors or isn't deployed yet.
    const url = await _tryStripeSubscribe({ planId, userId: user.id, email: user.email });
    if (url) { _openPaymentLink(url); return; }

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

    // Add: prefer the edge function (adds an item to the existing
    // subscription), same 6s-timeout-then-Payment-Link fallback as subscribe().
    const url = await _tryStripeSubscribe({ action: 'addon_add', addonId, userId: user.id, email: user.email });
    if (url) { _openPaymentLink(url); return; }

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

  async function openBillingPortal(prefer) {
    if (typeof SB === 'undefined' || !SB.isReady()) return;
    const session = await SB.client.auth.getSession();
    const accessToken = session?.data?.session?.access_token;
    if (!accessToken) {
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Billing Error', message: 'Sign in first.', type: 'error' });
      }
      return;
    }

    // Raw fetch instead of supabase-js `functions.invoke` so we can
    // surface the real error body on non-2xx. The wrapper otherwise
    // collapses everything to "Edge Function returned a non-2xx
    // status code", which hides the Stripe error text.
    const body = {};
    if (prefer === 'pro' || prefer === 'claude' || prefer === 'premium') {
      body.prefer = prefer;
    }
    try {
      const res = await fetch('https://zacllshbgmnwsmliteqx.supabase.co/functions/v1/stripe-portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }
      const url = payload?.url;
      if (!url) throw new Error('No portal URL returned.');
      const h = new URL(url).hostname;
      if (!h.endsWith('.stripe.com')) throw new Error('Unexpected redirect domain: ' + h);
      window.location.href = url;
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

    // Always hydrate the starting set from State or localStorage.
    // State is in-memory and empty on a fresh page load; localStorage
    // survives reloads. Without this, a returning user whose fingerprint
    // already matches ends up with State.enabled_models undefined
    // because we'd short-circuit before writing State, even though
    // localStorage had the entitlement map intact.
    let current = null;
    if (typeof State !== 'undefined') current = State.get('enabled_models');
    if (!current) {
      try {
        const key = (typeof Utils !== 'undefined' && Utils.KEYS && Utils.KEYS.enabledModels) || 'nice-enabled-models';
        const saved = localStorage.getItem(key);
        if (saved) current = JSON.parse(saved);
      } catch { /* ignore */ }
    }
    current = current || {};

    // Entitlement unchanged → sync State from whatever we hydrated and
    // exit without stomping the user's explicit toggles.
    if (previous === fingerprint) {
      if (typeof State !== 'undefined') State.set('enabled_models', current);
      return;
    }

    // Entitlement widened (or first run) — expand with newly-entitled models.
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
    getSubscriptionRows,
    getCurrentPlan,
    getPlanTier,
    getAddons,
    getActiveShipLimit,
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
    handleDowngrade,
    paywallEnabled: _paywallEnabled,
    _aggregate,
    _tryStripeSubscribe,
  };
})();
