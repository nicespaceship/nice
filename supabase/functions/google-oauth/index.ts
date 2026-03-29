import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Google OAuth Handler — enables any Google account to connect to NICE.
 *
 * Routes:
 *   /authorize  — initiates OAuth flow (redirects to Google consent screen)
 *   /callback   — handles Google's redirect, exchanges code for tokens, stores in DB
 *
 * Supports: Gmail (read), Google Calendar (read), Google Drive (read/write app files)
 * Works with: Gmail accounts, Google Workspace (any domain), any Google account
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

const GMAIL_MCP_URL_SUFFIX = "/functions/v1/gmail-mcp";

/* ── Helpers ──────────────────────────────────────────────────── */

function getEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing env: ${key}`);
  return val;
}

function getCallbackUrl(): string {
  const supabaseUrl = getEnv("SUPABASE_URL");
  return `${supabaseUrl}/functions/v1/google-oauth/callback`;
}

/** Simple HMAC-SHA256 JWT for state parameter (no external deps) */
async function signState(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const data = new TextEncoder().encode(`${header}.${body}`);
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  const signature = btoa(String.fromCharCode(...sig))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${header}.${body}.${signature}`;
}

async function verifyState(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;
  const data = new TextEncoder().encode(`${header}.${body}`);
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
  );

  // Reconstruct signature bytes
  const sigStr = signature.replace(/-/g, "+").replace(/_/g, "/");
  const sigBytes = Uint8Array.from(atob(sigStr), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, data);
  if (!valid) return null;

  // Decode payload
  const payloadStr = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
  const payload = JSON.parse(payloadStr);

  // Check expiry
  if (payload.exp && Date.now() / 1000 > payload.exp) return null;

  return payload;
}

/** Decode JWT payload without verification (for id_token email extraction) */
function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const body = jwt.split(".")[1];
  return JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function errorPage(title: string, message: string): Response {
  return htmlResponse(`
    <!DOCTYPE html><html><head><title>${title}</title>
    <style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fff}
    .box{text-align:center;max-width:400px;padding:2rem}.err{color:#ff4444;font-size:1.2rem}</style></head>
    <body><div class="box"><h1>⚠️ ${title}</h1><p class="err">${message}</p>
    <p><a href="/" style="color:#4af">Return to NICE</a></p></div></body></html>
  `, 400);
}

/* ── Main Handler ─────────────────────────────────────────────── */

const ALLOWED_ORIGINS = [
  "https://nicespaceship.ai",
  "https://www.nicespaceship.ai",
  "http://localhost:3000",
  "http://localhost:5173",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  // Route: /google-oauth/authorize
  if (path.endsWith("/authorize") || path.endsWith("/authorize/")) {
    return handleAuthorize(url);
  }

  // Route: /google-oauth/callback
  if (path.endsWith("/callback") || path.endsWith("/callback/")) {
    return handleCallback(url);
  }

  // Route: /google-oauth/disconnect (POST)
  if (path.endsWith("/disconnect") && req.method === "POST") {
    return handleDisconnect(req);
  }

  return htmlResponse("Unknown route", 404);
});

/* ── Authorize: Redirect to Google consent ────────────────────── */

async function handleAuthorize(url: URL): Promise<Response> {
  const userId = url.searchParams.get("user_id");
  const redirectUrl = url.searchParams.get("redirect_url");

  if (!userId || !redirectUrl) {
    return errorPage("Missing Parameters", "user_id and redirect_url are required.");
  }

  const clientId = getEnv("GOOGLE_CLIENT_ID");
  const stateSecret = getEnv("GOOGLE_OAUTH_STATE_SECRET");

  // Sign state JWT with 10-minute expiry
  const state = await signState({
    user_id: userId,
    redirect_url: redirectUrl,
    exp: Math.floor(Date.now() / 1000) + 600,
  }, stateSecret);

  // Build Google OAuth URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getCallbackUrl(),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return Response.redirect(`${GOOGLE_AUTH_URL}?${params}`, 302);
}

/* ── Callback: Exchange code for tokens, store in DB ──────────── */

async function handleCallback(url: URL): Promise<Response> {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // User denied consent
  if (error) {
    return errorPage("Access Denied", `Google returned: ${error}. You can try connecting again from the NICE Integrations page.`);
  }

  if (!code || !state) {
    return errorPage("Missing Parameters", "Authorization code or state is missing.");
  }

  // Verify state JWT
  const stateSecret = getEnv("GOOGLE_OAUTH_STATE_SECRET");
  const statePayload = await verifyState(state, stateSecret);
  if (!statePayload) {
    return errorPage("Invalid State", "The authorization link has expired or is invalid. Please try connecting again.");
  }

  const userId = statePayload.user_id as string;
  const redirectUrl = statePayload.redirect_url as string;

  // Exchange authorization code for tokens
  const clientId = getEnv("GOOGLE_CLIENT_ID");
  const clientSecret = getEnv("GOOGLE_CLIENT_SECRET");

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getCallbackUrl(),
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("[google-oauth] Token exchange failed:", errText);
    return errorPage("Token Exchange Failed", "Could not exchange authorization code. Please try again.");
  }

  const tokens = await tokenRes.json();
  const { access_token, refresh_token, expires_in, id_token } = tokens;

  if (!access_token) {
    return errorPage("No Access Token", "Google did not return an access token.");
  }

  // Extract user's Google email from id_token
  let googleEmail = "unknown";
  if (id_token) {
    try {
      const idPayload = decodeJwtPayload(id_token);
      googleEmail = (idPayload.email as string) || "unknown";
    } catch { /* ignore decode errors */ }
  }

  // Store tokens in mcp_connections using service role (user session not available in redirect)
  const supabase = createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );

  const supabaseUrl = getEnv("SUPABASE_URL");
  const gmailMcpUrl = `${supabaseUrl}${GMAIL_MCP_URL_SUFFIX}`;

  // Upsert: if user already has a Google connection, update it
  const { data: existing } = await supabase
    .from("mcp_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("name", "Google Workspace")
    .maybeSingle();

  const connectionData = {
    user_id: userId,
    name: "Google Workspace",
    server_url: gmailMcpUrl,
    transport: "streamable-http",
    auth_type: "oauth",
    auth_config: {
      access_token,
      refresh_token: refresh_token || null,
      expires_at: Date.now() + (expires_in || 3600) * 1000,
      google_email: googleEmail,
      token_uri: GOOGLE_TOKEN_URL,
    },
    available_tools: [
      "gmail_search_messages",
      "gmail_read_message",
      "gmail_list_labels",
    ],
    status: "connected",
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    await supabase
      .from("mcp_connections")
      .update(connectionData)
      .eq("id", existing.id);
  } else {
    await supabase
      .from("mcp_connections")
      .insert(connectionData);
  }

  // Redirect back to NICE app
  const separator = redirectUrl.includes("?") ? "&" : "?";
  return Response.redirect(`${redirectUrl}${separator}google_connected=true`, 302);
}

/* ── Disconnect: Remove Google OAuth connection ───────────────── */

async function handleDisconnect(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      getEnv("SUPABASE_URL"),
      getEnv("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("mcp_connections")
      .delete()
      .eq("user_id", user.id)
      .eq("name", "Google Workspace");

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
