import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Stripe Webhook — credits tokens to user balance on successful purchase.
 *
 * Listens for: checkout.session.completed
 * Maps Stripe price IDs to token amounts, credits the user's balance,
 * and logs the transaction.
 *
 * Stripe webhook endpoint: {supabase_url}/functions/v1/stripe-webhook
 * Configure in Stripe Dashboard → Webhooks → Add endpoint
 */

// Map Stripe price IDs to token amounts
const PRICE_TO_TOKENS: Record<string, { tokens: number; name: string }> = {
  "price_1TFRmPBTNqh90rCuzo1sFvj1": { tokens: 500_000, name: "Starter" },
  "price_1TFRmdBTNqh90rCuOWNDXIoe": { tokens: 5_000_000, name: "Pro" },
  "price_1TFRmuBTNqh90rCuSNEVyUJN": { tokens: 25_000_000, name: "Enterprise" },
};

/* ── HMAC-SHA256 Signature Verification ─────────────────────── */

async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  const parts = sigHeader.split(",").reduce((acc, part) => {
    const [k, v] = part.split("=");
    acc[k] = v;
    return acc;
  }, {} as Record<string, string>);

  const timestamp = parts["t"];
  const sig = parts["v1"];
  if (!timestamp || !sig) return false;

  // Reject if timestamp is more than 5 minutes old
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (age > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expectedHex = Array.from(new Uint8Array(expected)).map(b => b.toString(16).padStart(2, "0")).join("");

  return expectedHex === sig;
}

/* ── Handler ────────────────────────────────────────────────── */

Deno.serve(async (req: Request) => {
  // Stripe sends POST — no CORS needed (server-to-server)
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.text();

    // Verify Stripe signature
    const sigHeader = req.headers.get("stripe-signature");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!sigHeader || !webhookSecret) {
      console.error("[stripe-webhook] Missing signature or webhook secret");
      return new Response(JSON.stringify({ error: "Missing signature" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const valid = await verifyStripeSignature(body, sigHeader, webhookSecret);
    if (!valid) {
      console.error("[stripe-webhook] Invalid signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(body);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    // Only handle checkout.session.completed
    if (event.type !== "checkout.session.completed") {
      return new Response(JSON.stringify({ received: true, skipped: event.type }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const session = event.data as Record<string, unknown>;
    const sessionObj = session.object as Record<string, unknown>;

    if (!sessionObj) {
      return new Response(JSON.stringify({ error: "Missing session object" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const customerEmail = sessionObj.customer_email as string ||
      (sessionObj.customer_details as Record<string, unknown>)?.email as string;
    const sessionId = sessionObj.id as string;
    const amountTotal = sessionObj.amount_total as number;

    // Get price ID from metadata or line items
    const metadata = sessionObj.metadata as Record<string, string> | undefined;
    let priceId: string | null = metadata?.price_id || null;

    // Determine tokens from price or amount
    let tokenAmount = 0;
    let packageName = "Unknown";

    if (priceId && PRICE_TO_TOKENS[priceId]) {
      tokenAmount = PRICE_TO_TOKENS[priceId].tokens;
      packageName = PRICE_TO_TOKENS[priceId].name;
    } else {
      // Fallback: determine by amount (cents)
      if (amountTotal === 499) { tokenAmount = 500_000; packageName = "Starter"; }
      else if (amountTotal === 1999) { tokenAmount = 5_000_000; packageName = "Pro"; }
      else if (amountTotal === 6999) { tokenAmount = 25_000_000; packageName = "Enterprise"; }
      else {
        console.error(`[stripe-webhook] Unknown amount: ${amountTotal}`);
        return new Response(JSON.stringify({ error: `Unknown amount: ${amountTotal}` }), {
          status: 400, headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (!customerEmail) {
      console.error("[stripe-webhook] No customer email in session");
      return new Response(JSON.stringify({ error: "No customer email" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    // Use service role to update database
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Find user by email (direct lookup, not listUsers)
    const { data: userData, error: userErr } = await supabase.auth.admin.getUserByEmail(customerEmail);
    if (userErr || !userData?.user) {
      console.error(`[stripe-webhook] No user found for email: ${customerEmail}`);
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404, headers: { "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    // Credit tokens to balance (atomic upsert)
    const { data: balance } = await supabase
      .from("token_balances")
      .select("balance, lifetime_purchased")
      .eq("user_id", user.id)
      .single();

    const currentBalance = balance?.balance || 0;
    const currentPurchased = balance?.lifetime_purchased || 0;
    const newBalance = currentBalance + tokenAmount;

    await supabase
      .from("token_balances")
      .upsert({
        user_id: user.id,
        balance: newBalance,
        lifetime_purchased: currentPurchased + tokenAmount,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    // Log transaction
    await supabase
      .from("token_transactions")
      .insert({
        user_id: user.id,
        type: "purchase",
        amount: tokenAmount,
        balance_after: newBalance,
        stripe_session_id: sessionId,
        metadata: {
          package: packageName,
          amount_cents: amountTotal,
          email: customerEmail,
        },
      });

    console.log(`[stripe-webhook] Credited ${tokenAmount.toLocaleString()} tokens (${packageName}) to ${customerEmail}. New balance: ${newBalance.toLocaleString()}`);

    return new Response(JSON.stringify({
      received: true,
      credited: tokenAmount,
      package: packageName,
      new_balance: newBalance,
    }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[stripe-webhook] Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
