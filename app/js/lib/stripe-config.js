/* ═══════════════════════════════════════════════════════════════════
   NICE — Stripe Product / Price / Payment Link Catalog
   Single source of truth for every Stripe identifier the frontend
   references. The proprietary stripe-webhook edge function mirrors
   this same mapping server-side to translate incoming events into
   pool credits and subscription state.

   Mode-independent product attributes (copy, price, pool) live in
   SUB_BASE / TOPUP_BASE. The Stripe identifiers that differ between
   live and test mode live in MODE_IDS; the two are merged at lookup
   time by the active mode, so live and test can never drift on copy.

   Adding a new product means: create it in BOTH modes (live + test),
   add its copy to the *_BASE map and its ids to both MODE_IDS halves.
   Nothing else in the app needs to change.

   Live IDs are the real products in the NICE SPACESHIP Stripe account
   (acct_1RzKXIBTNqh90rCu). Test IDs mirror them in Stripe test mode for
   billing QA without real money — see docs/stripe-test-mode-spec.md.
═══════════════════════════════════════════════════════════════════ */

const StripeConfig = (() => {
  /* ── Mode-independent product attributes ──────────────────────
     Each subscription is either the base plan (pro) or an add-on on
     top of it (claude, premium). The Stripe ids are layered on per
     mode from MODE_IDS below. */
  const SUB_BASE = {
    pro:     { id: 'pro',     pool: 'standard', label: 'NICE Pro',              price: 9.99 },
    claude:  { id: 'claude',  pool: 'claude',   label: 'NICE — Claude Add-on',  price: 9.99 },
    premium: { id: 'premium', pool: 'premium',  label: 'NICE — Premium Add-on', price: 9.99 },
  };

  /* One-time purchases that credit a specific pool. Requires the user
     to already hold the corresponding subscription/add-on (enforced
     both in the UI and by the webhook). */
  const TOPUP_BASE = {
    'standard-boost': { id: 'standard-boost', pool: 'standard', name: 'Standard Boost', tokens: 1000, price: 29.99, badge: '',           desc: '+1,000 standard tokens. Never expires.' },
    'standard-max':   { id: 'standard-max',   pool: 'standard', name: 'Standard Max',   tokens: 2500, price: 49.99, badge: 'Best Value', desc: '+2,500 standard tokens. Best value.' },
    'claude-boost':   { id: 'claude-boost',   pool: 'claude',   name: 'Claude Boost',   tokens: 500,  price: 29.99, badge: '',           desc: '+500 Claude tokens. Never expires.' },
    'claude-max':     { id: 'claude-max',     pool: 'claude',   name: 'Claude Max',     tokens: 1250, price: 49.99, badge: 'Best Value', desc: '+1,250 Claude tokens. Best value.' },
    'premium-boost':  { id: 'premium-boost',  pool: 'premium',  name: 'Premium Boost',  tokens: 500,  price: 29.99, badge: '',           desc: '+500 Premium tokens. Never expires.' },
    'premium-max':    { id: 'premium-max',    pool: 'premium',  name: 'Premium Max',    tokens: 1250, price: 49.99, badge: 'Best Value', desc: '+1,250 Premium tokens. Best value.' },
  };

  /* ── Per-mode Stripe identifiers ──────────────────────────────
     Keyed by the same product ids as the *_BASE maps. Test-mode
     Payment Links resolve on the account's custom billing domain,
     billing.nicespaceship.ai. */
  const MODE_IDS = {
    live: {
      pro:              { productId: 'prod_UL38gdmKTQT2h6', priceId: 'price_1TMN2UBTNqh90rCu5LzqTchL', paymentLinkUrl: 'https://buy.stripe.com/fZu14mcxq8ZOeYJdM433W06' },
      claude:           { productId: 'prod_UL38WEXvAbyGn9', priceId: 'price_1TMN2xBTNqh90rCuEMKJhHgN', paymentLinkUrl: 'https://buy.stripe.com/14AfZgbtm5NC7wh8rK33W07' },
      premium:          { productId: 'prod_UL395Qim6neXkJ', priceId: 'price_1TMN33BTNqh90rCuMwFlG6y0', paymentLinkUrl: 'https://buy.stripe.com/3cIdR86925NC3g1gYg33W08' },
      'standard-boost': { productId: 'prod_UL39IrrpX7QM0C', priceId: 'price_1TMN3wBTNqh90rCutHsxzpym', paymentLinkUrl: 'https://buy.stripe.com/9B66oGfJCfoc7wh9vO33W09' },
      'standard-max':   { productId: 'prod_UL39AkhhfK9Bh2', priceId: 'price_1TMN43BTNqh90rCu7dpKyXBI', paymentLinkUrl: 'https://buy.stripe.com/6oUcN48ha4Jy6sdbDW33W0a' },
      'claude-boost':   { productId: 'prod_UL395hHGUW5bCm', priceId: 'price_1TMN49BTNqh90rCuMw9w2mvW', paymentLinkUrl: 'https://buy.stripe.com/5kQdR8btm6RGg2N4bu33W0b' },
      'claude-max':     { productId: 'prod_UL39ADQoFaQgBI', priceId: 'price_1TMN4HBTNqh90rCu7L5ZxXaf', paymentLinkUrl: 'https://buy.stripe.com/5kQ5kCcxq8ZOaIt7nG33W0c' },
      'premium-boost':  { productId: 'prod_UL3AvcUGJJ7nbS', priceId: 'price_1TMN4OBTNqh90rCuEOmju1SF', paymentLinkUrl: 'https://buy.stripe.com/28EdR854Y1xmeYJ8rK33W0d' },
      'premium-max':    { productId: 'prod_UL3AkJY9rtbxsj', priceId: 'price_1TMN4WBTNqh90rCuikUw2KLN', paymentLinkUrl: 'https://buy.stripe.com/7sY6oG40Ua3SaIteQ833W0e' },
    },
    test: {
      pro:              { productId: 'prod_Ufw2miJJTd6ohi', priceId: 'price_1TgaAmBTNqh90rCubWKRiQAA', paymentLinkUrl: 'https://billing.nicespaceship.ai/b/test_bJe5kCbtm3Fu4k5fUc33W00' },
      claude:           { productId: 'prod_Ufw2muxdHaUMNr', priceId: 'price_1TgaAoBTNqh90rCumYnH5Qiv', paymentLinkUrl: 'https://billing.nicespaceship.ai/b/test_7sY7sK54YgsgeYJ6jC33W01' },
      premium:          { productId: 'prod_Ufw20iALTumL4m', priceId: 'price_1TgaAqBTNqh90rCuiEUTH3o2', paymentLinkUrl: 'https://billing.nicespaceship.ai/b/test_6oU14meFy4Jy5o937q33W02' },
      'standard-boost': { productId: 'prod_Ufw27jnrAXyBGy', priceId: 'price_1TgaAsBTNqh90rCuYshXD5bz', paymentLinkUrl: 'https://billing.nicespaceship.ai/b/test_aFa5kC7d63FudUF37q33W03' },
      'standard-max':   { productId: 'prod_Ufw219VrY450yE', priceId: 'price_1TgaAuBTNqh90rCuNg8uXbK3', paymentLinkUrl: 'https://billing.nicespaceship.ai/b/test_9B628qbtmek8aIt37q33W04' },
      'claude-boost':   { productId: 'prod_Ufw3Xey6O28r5I', priceId: 'price_1TgaAvBTNqh90rCukHfmo5El', paymentLinkUrl: 'https://billing.nicespaceship.ai/b/test_14AaEW40Uek84k57nG33W05' },
      'claude-max':     { productId: 'prod_Ufw3K1VTXRx0E6', priceId: 'price_1TgaAxBTNqh90rCucLFOGgTx', paymentLinkUrl: 'https://billing.nicespaceship.ai/b/test_fZu14mcxq8ZOeYJdM433W06' },
      'premium-boost':  { productId: 'prod_Ufw3B9VYXDEr3G', priceId: 'price_1TgaAzBTNqh90rCucBlKvd9I', paymentLinkUrl: 'https://billing.nicespaceship.ai/b/test_14AfZgbtm5NC7wh8rK33W07' },
      'premium-max':    { productId: 'prod_Ufw33zRR2wgQUh', priceId: 'price_1TgaB0BTNqh90rCucT9zZiiI', paymentLinkUrl: 'https://billing.nicespaceship.ai/b/test_3cIdR86925NC3g1gYg33W08' },
    },
  };

  /* ── Mode resolution ──────────────────────────────────────────
     Defaults to 'live'. Test mode is opt-in and gated so a normal
     user cannot self-serve test Payment Links:
       1. window.NICE_CONFIG.stripeMode === 'test'  (team QA build/origin)
       2. localStorage 'nice-stripe-mode' === 'test', admins only
     The webhook independently refuses to grant on test (livemode:false)
     events for non-QA users, so neither path is a tokens exploit.
     See docs/stripe-test-mode-spec.md. */
  function activeMode() {
    try {
      if (typeof window !== 'undefined' && window.NICE_CONFIG && window.NICE_CONFIG.stripeMode === 'test') {
        return 'test';
      }
      const user = (typeof State !== 'undefined' && State.get) ? State.get('user') : null;
      if (user && user.is_admin && typeof localStorage !== 'undefined') {
        const key = (typeof Utils !== 'undefined' && Utils.KEYS && Utils.KEYS.stripeMode) || 'nice-stripe-mode';
        if (localStorage.getItem(key) === 'test') return 'test';
      }
    } catch (_) { /* fall through to live */ }
    return 'live';
  }

  /** Merge a *_BASE map with the active mode's Stripe ids. */
  function _merge(base, mode) {
    const ids = MODE_IDS[mode] || MODE_IDS.live;
    const out = {};
    for (const key of Object.keys(base)) out[key] = { ...base[key], ...ids[key] };
    return out;
  }

  function subscriptions() { return _merge(SUB_BASE, activeMode()); }
  function topUps()        { return _merge(TOPUP_BASE, activeMode()); }

  /* ── Lookups ──────────────────────────────────────────────── */

  function listTopUps() {
    return Object.values(topUps());
  }

  function getTopUp(id) {
    return topUps()[id] || null;
  }

  /** Return top-ups for a single pool (standard | claude | premium). */
  function topUpsForPool(poolId) {
    return listTopUps().filter(t => t.pool === poolId);
  }

  function getSubscription(id) {
    return subscriptions()[id] || null;
  }

  /** Reverse lookup: given a Stripe price ID, return the product
      config it belongs to (either a subscription or a top-up).
      Searches both modes — price ids are globally unique across
      test/live, so the lookup is unambiguous regardless of the
      active mode. The proprietary webhook uses this to translate
      events into pool credits and plan updates. */
  function findByPriceId(priceId) {
    for (const mode of ['live', 'test']) {
      const subs = _merge(SUB_BASE, mode);
      for (const key of Object.keys(subs)) {
        if (subs[key].priceId === priceId) return { kind: 'subscription', ...subs[key] };
      }
      const tops = _merge(TOPUP_BASE, mode);
      for (const key of Object.keys(tops)) {
        if (tops[key].priceId === priceId) return { kind: 'topup', ...tops[key] };
      }
    }
    return null;
  }

  return {
    /* SUBSCRIPTIONS / TOP_UPS resolve against the active mode on each
       access, so consumers stay mode-agnostic. */
    get SUBSCRIPTIONS() { return subscriptions(); },
    get TOP_UPS()       { return topUps(); },
    activeMode,
    listTopUps,
    getTopUp,
    topUpsForPool,
    getSubscription,
    findByPriceId,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = StripeConfig;
