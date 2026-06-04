# `stripe-subscribe` edge function — spec + reference implementation

Status: **designed, not yet deployed.** The client (`subscription.js`) already calls this function and falls back to Stripe Payment Links until it ships. This doc is the deploy-ready spec; the function body lives in the proprietary functions repo (per CLAUDE.md, edge-function source is not tracked here). Add a row to [`edge-functions-ledger.md`](edge-functions-ledger.md) on first deploy.

## Why

NICE's Stripe catalog uses **one Payment Link per product** (Pro, Claude add-on, Premium add-on). Each Payment Link creates a **separate Stripe subscription**, so a Pro user who buys the Claude add-on ends up with two `sub_...` IDs and two `public.subscriptions` rows (see [`20260418060832_subscriptions_multi_row.sql`](../supabase/migrations/20260418060832_subscriptions_multi_row.sql)).

That multi-row model is the root cause of a whole class of bugs:

- **PR #715** — a past_due add-on row flipped the aggregate status to `past_due`, downgrading an active, fully-paid Pro to Free, because each product's subscription has its own independent `status`.
- `Subscription._aggregate` has to reconcile plan + addons + status across N rows, and every reconciliation rule is a place to get it wrong.
- Pool grants, proration, and cancellation are all per-product instead of per-customer.

The fix is the standard Stripe pattern: **one Customer, one Subscription, multiple subscription items.** Pro is the base item; each add-on is an additional item on the same subscription. One subscription means one `status`, one `current_period_end`, one row. `_aggregate` collapses to a trivial single-row read and the #715 bug class disappears.

## Target data model

One `public.subscriptions` row per user, written by `stripe-webhook` from the single Stripe subscription's items:

| Column | Source |
|--------|--------|
| `stripe_customer_id` | the user's one Stripe Customer |
| `stripe_subscription_id` | the user's one Stripe Subscription (`UNIQUE`, already indexed) |
| `plan` | `'pro'` if the subscription has the Pro price item, else `'free'` |
| `addons[]` | `['claude','premium']` filtered to the add-on price items present |
| `status` | the subscription's status (one value, no cross-product ambiguity) |
| `current_period_start/end`, `cancel_at_period_end` | straight from the subscription |

The multi-row schema stays valid (the `UNIQUE(stripe_subscription_id)` index already supports it), so this is forward-compatible: existing multi-row users are reconciled on their next Stripe event, or by a one-time backfill (below).

## Function contract

**Auth:** the project signs JWTs with ES256, so this function must declare `verify_jwt = false` in [`supabase/config.toml`](../supabase/config.toml) and deploy with `--no-verify-jwt`, then validate internally via `supabase.auth.getUser(jwt)` (GoTrue handles ES256). Same pattern as `nice-ai`, `stripe-portal`, etc. (see the "Edge Function JWT Verification" section of CLAUDE.md).

**Request body** (the shapes the client already sends — see `subscription.js`):

```jsonc
// New Pro subscription
{ "planId": "pro", "userId": "<uuid>", "email": "user@x.com" }

// Add an add-on to the existing subscription
{ "action": "addon_add", "addonId": "claude" | "premium", "userId": "<uuid>", "email": "user@x.com" }
```

`addon_remove` is intentionally NOT handled here — the client routes removals through the Stripe billing portal (`openBillingPortal()`), which is Stripe's supported cancel/downgrade UI.

**Response:** `{ "url": "<stripe checkout or portal url>" }`. The client opens it. On any error or unhandled case, the client falls back to the per-product Payment Link, so the function can fail safe.

**Price IDs** come from `StripeConfig.SUBSCRIPTIONS` (SSOT) — do not hard-code in the function; pass them in or mirror them server-side:

| Item | `priceId` |
|------|-----------|
| Pro (base) | `price_1TMN2UBTNqh90rCu5LzqTchL` |
| Claude add-on | `price_1TMN2xBTNqh90rCuEMKJhHgN` |
| Premium add-on | `price_1TMN33BTNqh90rCuMwFlG6y0` |

## Behavior

### `subscribe` (planId = `'pro'`)
1. Validate the caller (`auth.getUser(jwt)`), confirm `userId` matches.
2. Get-or-create the Stripe Customer for `email` (reuse `stripe_customer_id` from `public.subscriptions` if present; else `customers.create`).
3. If the customer has **no** active subscription: create a Checkout Session in `subscription` mode with the Pro price as the single line item. Return its `url`.
4. If the customer **already** has a subscription (re-subscribe / reactivation edge): return a billing-portal URL so they manage it in Stripe rather than creating a second subscription.

### `addon_add` (addonId = `'claude'` | `'premium'`)
1. Validate caller; require an existing active subscription with the Pro item (add-ons are Pro-gated — mirror `Subscription.isPro()`).
2. Add the add-on price as a **subscription item** on the existing subscription (`subscriptionItems.create({ subscription, price })`) with proration, OR create a Checkout Session that adds the item, depending on whether you want an in-app confirm vs a hosted page.
3. Return the confirmation/portal `url`.

The webhook (below) is the source of truth for entitlement; the function only mutates Stripe.

## `stripe-webhook` changes

On `customer.subscription.created` / `customer.subscription.updated` / `customer.subscription.deleted`:

1. Read `subscription.items.data[].price.id`.
2. Derive `plan` = `'pro'` if the Pro price is present, else `'free'`.
3. Derive `addons[]` from the add-on prices present.
4. Upsert **one** `public.subscriptions` row keyed by `stripe_subscription_id` with `plan`, `addons`, `status`, period fields.

On `invoice.paid`: credit each pool (Standard / Claude / Premium) according to the items on the paid invoice. This replaces the per-Payment-Link grant logic; the allowances are the same numbers (`TokenConfig` SSOT: Pro → 1000 Standard, Claude → 500 Claude, Premium → 500 Premium).

## One-time migration for existing multi-row users

Most users are single-product today. For any user with multiple `sub_...` rows (Ben is the known case — see the backfill in the multi_row migration), either:

- **Lazy:** let the webhook reconcile on their next subscription event (cleanest, no migration), or
- **Eager:** a one-time job that, per user, creates a consolidated subscription with the union of their items and cancels the redundant ones (requires Stripe-side subscription surgery; do this only if lazy reconciliation is too slow).

Until a user is consolidated, `_aggregate` still handles their multiple rows correctly (post-#715), so there is no rush.

## Deploy steps

1. Implement the function in the proprietary functions repo (skeleton below).
2. Add `[functions.stripe-subscribe] verify_jwt = false` to `supabase/config.toml`.
3. `npx supabase functions deploy stripe-subscribe --no-verify-jwt`.
4. Confirm the response body does NOT carry `UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM` (check the body, not just the status).
5. Update `stripe-webhook` to write one row from subscription items; redeploy.
6. Add rows for both functions to [`edge-functions-ledger.md`](edge-functions-ledger.md).
7. The client needs no change — `subscription.js` already prefers this function and falls back to Payment Links.

## Reference implementation (skeleton)

```ts
// supabase/functions/stripe-subscribe/index.ts  (proprietary repo)
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });
const PRICES = {
  pro:     Deno.env.get('STRIPE_PRICE_PRO')!,      // price_1TMN2U…
  claude:  Deno.env.get('STRIPE_PRICE_CLAUDE')!,   // price_1TMN2x…
  premium: Deno.env.get('STRIPE_PRICE_PREMIUM')!,  // price_1TMN33…
};
const APP_URL = Deno.env.get('APP_URL') ?? 'https://nicespaceship.ai';

Deno.serve(async (req) => {
  // ES256: validate the user token internally (verify_jwt=false at gateway).
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
  const { data: { user } } = await sb.auth.getUser(jwt);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const body = await req.json();
  if (body.userId && body.userId !== user.id) return json({ error: 'user_mismatch' }, 403);

  const customer = await getOrCreateCustomer(user.email!); // reuse stripe_customer_id when known
  const existing = (await stripe.subscriptions.list({ customer: customer.id, status: 'active', limit: 1 })).data[0];

  // Add an add-on item to the existing subscription
  if (body.action === 'addon_add') {
    if (!existing) return json({ error: 'pro_required' }, 402);
    const price = PRICES[body.addonId];
    if (!price) return json({ error: 'unknown_addon' }, 400);
    await stripe.subscriptionItems.create({ subscription: existing.id, price, proration_behavior: 'create_prorations' });
    const portal = await stripe.billingPortal.sessions.create({ customer: customer.id, return_url: `${APP_URL}/app/#/security` });
    return json({ url: portal.url });
  }

  // New Pro subscription
  if (existing) {
    const portal = await stripe.billingPortal.sessions.create({ customer: customer.id, return_url: `${APP_URL}/app/#/security` });
    return json({ url: portal.url });
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customer.id,
    line_items: [{ price: PRICES.pro, quantity: 1 }],
    success_url: `${APP_URL}/app/#/security?sub=ok`,
    cancel_url: `${APP_URL}/app/#/security?sub=cancel`,
  });
  return json({ url: session.url });
});

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
```

## How this maps to the client (`subscription.js`)

The client already speaks this contract via `_tryStripeSubscribe(body)`:
- `subscribe('pro')` → `_tryStripeSubscribe({ planId, userId, email })` → opens `url`, else Pro Payment Link.
- `setAddon('claude', true)` → `_tryStripeSubscribe({ action:'addon_add', addonId, userId, email })` → opens `url`, else add-on Payment Link.
- `setAddon(_, false)` → `openBillingPortal()` (unchanged).

When this function deploys, the client lights up automatically with no further change.
