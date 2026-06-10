# Stripe test-mode — spec + division of labor

Status: **client half shipped; server half pending Ben's secrets + a proprietary deploy.** This unblocks billing QA (renewal, dunning, refunds, grants) without spending real money. It is the prerequisite for safely building + verifying [`stripe-subscribe`](stripe-subscribe-spec.md): a customer-model change must be exercised across several purchases, which on live keys means real charges every iteration.

Progress:
- ✅ 9 test products + prices + Payment Links created in Stripe test mode (via the Stripe CLI, account `acct_1RzKXIBTNqh90rCu`).
- ✅ `StripeConfig` dual-catalog + gated mode resolver + `_openPaymentLink` allowlist + tests. Test IDs live in `StripeConfig.MODE_IDS.test` (the SSOT — do not re-hardcode them elsewhere; the webhook env reads them from there).
- ⏳ Supabase test secrets, the Stripe test webhook endpoint, and the proprietary `stripe-webhook` / `stripe-portal` edits (below).

The edge-function source is proprietary (per CLAUDE.md it is not tracked here), so the server section below is the deploy-ready spec.

## Design decision: dual-key, `livemode`-routed, coexists with live

Stripe test mode and live mode are parallel universes distinguished only by which API key (`sk_test_…` vs `sk_live_…`) and which webhook signing secret you use. Every Stripe object and event carries `livemode: true | false`.

We exploit that to run **test and live side by side on the same deployment** — we never flip production to test (which would break live purchases). Concretely:

- **Checkout** rides on **test-mode Payment Links** (hosted Stripe URLs, no edge function). `subscribe()` / `setAddon()` already fall back to `StripeConfig` Payment Links when `stripe-subscribe` is absent, and `buyTopUp()` uses them directly. So in test mode the client just hands out test links — zero server work for checkout.
- **Webhook** runs **two endpoints** in Stripe (one live, one test), both pointing at the same `stripe-webhook` URL, each with its own signing secret. The function verifies an incoming event against whichever secret matches, then uses `event.livemode` to pick the matching Stripe API key for any callback.
- **Portal** (`stripe-portal`) and the future **`stripe-subscribe`** pick the key by a mode the client passes in the request body.

### Safety invariant — test events can only grant to QA users

Because a test Payment Link is a normal hosted URL, a curious real user who discovered the test-mode flag could open one and pay with a Stripe test card. To make that a no-op rather than a free-tokens exploit:

> `stripe-webhook` MUST refuse to grant pools / write subscription state for any event with `livemode === false` whose resolved `user_id` is **not** in the QA allowlist (`STRIPE_TEST_USER_IDS` — test@ and ben@'s UUIDs).

Live events (`livemode === true`) are unaffected. This closes the exploit at the source of truth, independent of how obscure the client flag is.

## Client mode flag — how the app selects test vs live

`StripeConfig` resolves the active mode from, in priority order:

1. `window.NICE_CONFIG.stripeMode === 'test'` — baked into a team-only QA build / origin.
2. `localStorage['nice-stripe-mode'] === 'test'` — set only when `State.user.is_admin` (ignored otherwise), so a normal user setting it by hand does nothing.

Default is `'live'`. There is intentionally **no URL-param trigger** — a `?stripe=test` switch would be trivially abusable. The localStorage path is gated on `is_admin`; ben@ is admin, so Ben can flip a real browser session into test mode. To QA the **free**-tier purchase paths (which need a non-Pro account), run the team QA build (`window.NICE_CONFIG.stripeMode='test'`) while signed in as test@, or temporarily grant test@ `is_admin` for the QA window.

## In-repo: `StripeConfig` dual-catalog

`StripeConfig` becomes the sole owner of the mode switch; nothing else in `subscription.js` / `wallet.js` changes (they call `getSubscription` / `getTopUp` / `listTopUps` / `findByPriceId`, which transparently resolve against the active catalog).

Shape:

```js
const LIVE = {
  SUBSCRIPTIONS: { pro: {…}, claude: {…}, premium: {…} },   // current IDs
  TOP_UPS:       { 'standard-boost': {…}, … },               // current IDs
};
const TEST = {
  SUBSCRIPTIONS: { pro: {…}, … },   // sk_test product/price IDs + test buy.stripe.com links
  TOP_UPS:       { … },
};
function activeMode() { /* window.NICE_CONFIG.stripeMode → admin localStorage → 'live' */ }
function catalog() { return activeMode() === 'test' ? TEST : LIVE; }
// getSubscription/getTopUp/listTopUps/topUpsForPool/findByPriceId read catalog()
```

`_openPaymentLink`'s host allowlist needs **no** change — test Payment Links are still on `buy.stripe.com`.

This PR ships only when the `TEST` catalog holds real IDs, so test mode is never a hollow half-feature.

## Test products — ✅ created

All 9 (3 subscriptions + 6 top-ups) were recreated in **test mode** mirroring live price + (for top-ups) token count, each carrying a `metadata[nice_key]` for debuggability. The resulting test `product` / `price` / Payment Link ids are wired into `StripeConfig.MODE_IDS.test` — **that map is the SSOT.** Test Payment Links resolve on `billing.nicespaceship.ai` (the account's custom billing domain, same as the portal), which is why `_openPaymentLink`'s host allowlist now trusts it.

The three test subscription price ids (`pro` / `claude` / `premium`) feed the webhook env `STRIPE_TEST_PRICE_*` below; read them from `StripeConfig.MODE_IDS.test`, do not re-transcribe.

## New Supabase secrets

| Secret | Value | Used by |
|--------|-------|---------|
| `STRIPE_TEST_SECRET_KEY` | `sk_test_…` | webhook (callbacks), portal, subscribe |
| `STRIPE_TEST_WEBHOOK_SECRET` | `whsec_…` (test endpoint) | webhook signature verify |
| `STRIPE_TEST_USER_IDS` | comma-sep UUIDs (test@, ben@) | webhook grant allowlist |
| `STRIPE_TEST_PRICE_PRO` / `_CLAUDE` / `_PREMIUM` | test price IDs | subscribe (when it ships) |

Live secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`) are unchanged.

## Proprietary edge-function changes

### `stripe-webhook`
1. **Dual signature verify.** Try `constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)`; on `SignatureVerificationError`, retry with `STRIPE_TEST_WEBHOOK_SECRET`. (Or run the two endpoints and branch on which secret verified.) Reject if neither matches.
2. **Key routing.** After verify, pick `stripe = event.livemode ? liveStripe : testStripe` for any `customers.retrieve` / lookups (the basil-version `invoiceSubId()` customer fallback added this session needs the right key).
3. **Grant allowlist.** Before any pool credit / subscription upsert, if `!event.livemode && !STRIPE_TEST_USER_IDS.includes(user_id)` → ack 200 and skip (no grant). Prevents the test-link exploit.
4. Pool-credit + subscription-state logic is otherwise identical; it writes to the same DB keyed by `user_id` (test@ legitimately sees its pools fill).

### `stripe-portal`
- Accept an optional `mode: 'test' | 'live'` in the body (default live). Pick the Stripe key accordingly so an admin in test mode can open a test billing portal. Keep the existing `prefer` routing.

### `stripe-subscribe` (when it ships, per its own spec)
- Same `mode` body param → choose key + `STRIPE_TEST_PRICE_*`.

## New Stripe test webhook endpoint

In Stripe **test mode**, add a webhook endpoint → same URL as live (`…/functions/v1/stripe-webhook`) → subscribe to the same events the live endpoint uses (`checkout.session.completed`, `invoice.paid`, `customer.subscription.*`, `charge.refunded`, `charge.dispute.created`, …). Copy its signing secret into `STRIPE_TEST_WEBHOOK_SECRET`.

## Division of labor

| Step | Owner | Status |
|------|-------|--------|
| Create 9 test products + prices + Payment Links | me, via `stripe` CLI (CLI already auth'd to the test account) | ✅ |
| `StripeConfig` dual-catalog + mode resolver + `_openPaymentLink` allowlist + tests | in-repo (me) | ✅ |
| Set Supabase test secrets | **Ben** (`npx supabase secrets set` — CLI, see [[feedback_gh_secret_cli_over_web]]) | ⏳ |
| Add Stripe test webhook endpoint | **Ben** (Stripe dashboard test mode) | ⏳ |
| `stripe-webhook` dual-verify + key-routing + grant allowlist | proprietary edit (me) — `npx supabase functions download stripe-webhook`, edit, `deploy --no-verify-jwt` | ⏳ |
| `stripe-portal` mode param | proprietary edit (me) | ⏳ (optional, later) |
| Live end-to-end QA on test@ | both | ⏳ |

## Test plan (once wired)

On test@ in test mode, using Stripe test cards + **test clocks** (the only way to exercise renewal + dunning):
1. **Purchase → grant.** Buy Pro (`4242…`) → webhook → Standard pool = 1,000.
2. **Add-on → grant.** Buy Claude add-on → Claude pool = 500.
3. **Top-up → grant.** Buy Standard Boost → +1,000 Standard.
4. **Renewal.** Advance a test clock one month → `invoice.paid` → pools re-granted.
5. **Dunning.** Test clock with a failing card (`4000 0000 0000 0341`) → `invoice.payment_failed` → status `past_due` → Wallet shows "Payment failed."
6. **Refund.** Refund a top-up in the test dashboard → `charge.refunded` → `reverseTopup()` reverses the pool (subscription refunds correctly skipped).
7. **Exploit guard.** As a non-allowlisted user, open a test Payment Link, pay with a test card → confirm **no** pool grant (allowlist rejects).

## Build order

1. ✅ Test products created → ids captured in `StripeConfig.MODE_IDS.test`.
2. ✅ In-repo `StripeConfig` dual-catalog PR (real test IDs + tests + allowlist).
3. ⏳ Ben sets test secrets + adds the test webhook endpoint.
4. ⏳ Proprietary `stripe-webhook` dual-verify + allowlist; redeploy. Run test plan steps 1–7.
5. ⏳ (Optional, later) `stripe-portal` mode param.
6. ⏳ Add a note to [`edge-functions-ledger.md`](edge-functions-ledger.md).

With this in place, [`stripe-subscribe`](stripe-subscribe-spec.md) is built and verified entirely against test charges, then flipped live once.
