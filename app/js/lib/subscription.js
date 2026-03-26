/* ═══════════════════════════════════════════════════════════════════
   NICE — Subscription Management
   Two-tier model: Free (XP-gated slots) → Star Pass ($19/mo, 60 slots).
═══════════════════════════════════════════════════════════════════ */

const Subscription = (() => {

  /* ── Plan Definitions ── */
  const PLANS = {
    free:       { price: 0,   slots: 0,  label: 'Free',       icon: '🛸', color: '#94a3b8', desc: 'Connect your own LLMs. Slots earned via XP.' },
    starpass:   { price: 19,  slots: 60, label: 'Star Pass',  icon: '⭐', color: '#f59e0b', desc: '60 slots, 5 spaceships, unlimited custom blueprints, auto-unlock Legendary.' },
  };

  // Backward compat: map old tier names to new plans
  const PLAN_ALIASES = { scout: 'free', explorer: 'free', pilot: 'free', frigate: 'free', cruiser: 'starpass', captain: 'starpass', dreadnought: 'starpass', flagship: 'starpass', pro: 'starpass' };
  // Legacy alias
  const PLAN_TIERS = PLANS;

  /* ── State ── */
  let _subscription = null;

  /* ── Subscription Queries ── */

  async function getSubscription() {
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
    return { plan: 'free', status: 'active', current_period_end: null };
  }

  function getCurrentPlan() {
    if (_subscription) {
      const plan = _subscription.plan || 'free';
      return PLAN_ALIASES[plan] || plan;
    }
    const legacy = localStorage.getItem('nice-plan');
    if (legacy) return PLAN_ALIASES[legacy] || legacy;
    return 'free';
  }

  function getPlanTier(planId) {
    const id = PLAN_ALIASES[planId] || planId || 'free';
    return PLANS[id] || PLANS.free;
  }

  /** Returns slot override for paid plans, or 0 for free (use XP-based slots). */
  function getSlotLimit() {
    const plan = getCurrentPlan();
    const tier = PLANS[plan] || PLANS.free;
    return tier.slots || 0; // 0 = use XP-based slots from Gamification
  }

  // Backward compat
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
      if (data?.url) window.location.href = data.url;
    } catch (err) {
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Subscription Error', message: err.message || 'Failed to start checkout', type: 'error' });
      }
    }
  }

  async function upgradeSpaceship(planId, spaceshipId, fromClass) {
    if (typeof SB === 'undefined' || !SB.isReady()) {
      // Local-only demo: just update class in State
      const spaceships = typeof State !== 'undefined' ? State.get('spaceships') || [] : [];
      const ship = spaceships.find(s => s.id === spaceshipId);
      const classMap = { scout: 'class-1', frigate: 'class-2', cruiser: 'class-3', dreadnought: 'class-4', flagship: 'class-5' };
      if (ship) {
        const newClass = classMap[planId] || 'class-1';
        ship.blueprint_id = newClass;
        ship.class_id = newClass;
        if (typeof State !== 'undefined') State.set('spaceships', spaceships);
      }
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Spaceship Upgraded!', message: `Upgraded to ${(planId || '').charAt(0).toUpperCase() + (planId || '').slice(1)} class.`, type: 'success' });
      if (typeof Gamification !== 'undefined') Gamification.addXP('upgrade_spaceship');
      if (typeof Router !== 'undefined') Router.navigate('#/bridge/spaceships/' + spaceshipId);
      return;
    }

    const user = typeof State !== 'undefined' ? State.get('user') : null;
    if (!user) return;

    try {
      // Race edge function against a 6s timeout — fall back to local upgrade if it hangs
      const result = await Promise.race([
        SB.client.functions.invoke('stripe-subscribe', {
          body: { planId, userId: user.id, email: user.email, spaceshipId, fromClass },
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
      ]);
      const { data, error } = result;
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (err) {
      // Edge function unavailable — fall back to local demo upgrade
      const spaceships = typeof State !== 'undefined' ? State.get('spaceships') || [] : [];
      const ship = spaceships.find(s => s.id === spaceshipId);
      const classMap = { scout: 'class-1', frigate: 'class-2', cruiser: 'class-3', dreadnought: 'class-4', flagship: 'class-5' };
      if (ship) {
        const newClass = classMap[planId] || 'class-1';
        ship.blueprint_id = newClass;
        ship.class_id = newClass;
        if (typeof State !== 'undefined') State.set('spaceships', spaceships);
      }
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Spaceship Upgraded!', message: `Upgraded to ${(planId || '').charAt(0).toUpperCase() + (planId || '').slice(1)} class (demo mode).`, type: 'success' });
      if (typeof Gamification !== 'undefined') Gamification.addXP('upgrade_spaceship');
      if (typeof UpgradeModal !== 'undefined') UpgradeModal.close();
      if (typeof Router !== 'undefined') Router.navigate('#/bridge/spaceships/' + spaceshipId);
    }
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
      if (data?.url) window.location.href = data.url;
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
    init,
    getSubscription,
    getCurrentPlan,
    getPlanTier,
    getSlotLimit,
    canUseShipClass,
    subscribe,
    upgradeSpaceship,
    openBillingPortal,
  };
})();
