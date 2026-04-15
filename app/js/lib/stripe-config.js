/* ═══════════════════════════════════════════════════════════════════
   NICE — Stripe Product / Price / Payment Link Catalog
   Single source of truth for every Stripe identifier the frontend
   references. The proprietary stripe-webhook edge function mirrors
   this same mapping server-side to translate incoming events into
   pool credits and subscription state.

   Adding a new product means: create it via Stripe MCP or Dashboard,
   then add a new entry here with id, priceId, paymentLinkUrl, pool,
   amount, and price. Nothing else in the app needs to change.

   Live mode IDs — these are the real products in the NICE SPACESHIP
   Stripe account (acct_1RzKXIBTNqh90rCu).
═══════════════════════════════════════════════════════════════════ */

const StripeConfig = (() => {
  /* ── Subscription catalog ─────────────────────────────────── */
  /* Each entry is either the base plan (pro) or an add-on on top
     of it (claude, premium). `paymentLinkUrl` points at a Stripe
     Checkout flow that opens a recurring subscription for just
     this price. The webhook is responsible for attaching the
     resulting subscription to the user's profile. */
  const SUBSCRIPTIONS = {
    pro: {
      id: 'pro',
      label: 'NICE Pro',
      price: 9.99,
      productId: 'prod_UL38gdmKTQT2h6',
      priceId:   'price_1TMN2UBTNqh90rCu5LzqTchL',
      paymentLinkUrl: 'https://buy.stripe.com/fZu14mcxq8ZOeYJdM433W06',
    },
    claude: {
      id: 'claude',
      label: 'NICE — Claude Add-on',
      price: 9.99,
      productId: 'prod_UL38WEXvAbyGn9',
      priceId:   'price_1TMN2xBTNqh90rCuEMKJhHgN',
      paymentLinkUrl: 'https://buy.stripe.com/14AfZgbtm5NC7wh8rK33W07',
    },
    premium: {
      id: 'premium',
      label: 'NICE — Premium Add-on',
      price: 9.99,
      productId: 'prod_UL395Qim6neXkJ',
      priceId:   'price_1TMN33BTNqh90rCuMwFlG6y0',
      paymentLinkUrl: 'https://buy.stripe.com/3cIdR86925NC3g1gYg33W08',
    },
  };

  /* ── Top-up catalog ─────────────────────────────────────────
     One-time purchases that credit a specific pool. Requires the
     user to already have the corresponding subscription/add-on
     (enforced both in the UI and by the webhook). */
  const TOP_UPS = {
    'standard-boost': {
      id: 'standard-boost',
      pool: 'standard',
      name: 'Standard Boost',
      tokens: 1000,
      price: 29.99,
      productId: 'prod_UL39IrrpX7QM0C',
      priceId:   'price_1TMN3wBTNqh90rCutHsxzpym',
      paymentLinkUrl: 'https://buy.stripe.com/9B66oGfJCfoc7wh9vO33W09',
      badge: '',
      desc: '+1,000 standard tokens. Never expires.',
    },
    'standard-max': {
      id: 'standard-max',
      pool: 'standard',
      name: 'Standard Max',
      tokens: 2500,
      price: 49.99,
      productId: 'prod_UL39AkhhfK9Bh2',
      priceId:   'price_1TMN43BTNqh90rCu7dpKyXBI',
      paymentLinkUrl: 'https://buy.stripe.com/6oUcN48ha4Jy6sdbDW33W0a',
      badge: 'Best Value',
      desc: '+2,500 standard tokens. Best value (17% off).',
    },
    'claude-boost': {
      id: 'claude-boost',
      pool: 'claude',
      name: 'Claude Boost',
      tokens: 500,
      price: 29.99,
      productId: 'prod_UL395hHGUW5bCm',
      priceId:   'price_1TMN49BTNqh90rCuMw9w2mvW',
      paymentLinkUrl: 'https://buy.stripe.com/5kQdR8btm6RGg2N4bu33W0b',
      badge: '',
      desc: '+500 Claude tokens. Never expires.',
    },
    'claude-max': {
      id: 'claude-max',
      pool: 'claude',
      name: 'Claude Max',
      tokens: 1250,
      price: 49.99,
      productId: 'prod_UL39ADQoFaQgBI',
      priceId:   'price_1TMN4HBTNqh90rCu7L5ZxXaf',
      paymentLinkUrl: 'https://buy.stripe.com/5kQ5kCcxq8ZOaIt7nG33W0c',
      badge: 'Best Value',
      desc: '+1,250 Claude tokens. Best value (17% off).',
    },
    'premium-boost': {
      id: 'premium-boost',
      pool: 'premium',
      name: 'Premium Boost',
      tokens: 500,
      price: 29.99,
      productId: 'prod_UL3AvcUGJJ7nbS',
      priceId:   'price_1TMN4OBTNqh90rCuEOmju1SF',
      paymentLinkUrl: 'https://buy.stripe.com/28EdR854Y1xmeYJ8rK33W0d',
      badge: '',
      desc: '+500 Premium tokens. Never expires.',
    },
    'premium-max': {
      id: 'premium-max',
      pool: 'premium',
      name: 'Premium Max',
      tokens: 1250,
      price: 49.99,
      productId: 'prod_UL3AkJY9rtbxsj',
      priceId:   'price_1TMN4WBTNqh90rCuikUw2KLN',
      paymentLinkUrl: 'https://buy.stripe.com/7sY6oG40Ua3SaIteQ833W0e',
      badge: 'Best Value',
      desc: '+1,250 Premium tokens. Best value (17% off).',
    },
  };

  /* ── Lookups ──────────────────────────────────────────────── */

  function listTopUps() {
    return Object.values(TOP_UPS);
  }

  function getTopUp(id) {
    return TOP_UPS[id] || null;
  }

  /** Return top-ups for a single pool (standard | claude | premium). */
  function topUpsForPool(poolId) {
    return listTopUps().filter(t => t.pool === poolId);
  }

  function getSubscription(id) {
    return SUBSCRIPTIONS[id] || null;
  }

  /** Reverse lookup: given a Stripe price ID, return the product
      config it belongs to (either a subscription or a top-up).
      The proprietary webhook uses this to translate events into
      pool credits and plan updates. */
  function findByPriceId(priceId) {
    for (const key of Object.keys(SUBSCRIPTIONS)) {
      if (SUBSCRIPTIONS[key].priceId === priceId) {
        return { kind: 'subscription', ...SUBSCRIPTIONS[key] };
      }
    }
    for (const key of Object.keys(TOP_UPS)) {
      if (TOP_UPS[key].priceId === priceId) {
        return { kind: 'topup', ...TOP_UPS[key] };
      }
    }
    return null;
  }

  return {
    SUBSCRIPTIONS,
    TOP_UPS,
    listTopUps,
    getTopUp,
    topUpsForPool,
    getSubscription,
    findByPriceId,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = StripeConfig;
