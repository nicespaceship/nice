import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Gmail MCP Server — speaks MCP JSON-RPC protocol over HTTP.
 *
 * Methods:
 *   tools/list  — returns available Gmail tools
 *   tools/call  — executes a Gmail tool (search, read, labels)
 *
 * Auth: Google Workspace service account (GOOGLE_SERVICE_ACCOUNT secret).
 *       Signs JWT per-user, exchanges for access token, impersonates the calling user.
 *       User email passed via params.context.user_email from mcp-gateway.
 *       Only allows @nicespaceship.com emails (domain-wide delegation scope).
 *       Scopes: Gmail (readonly), Calendar (readonly), Drive (readonly).
 * Called by: mcp-gateway edge function (proxied from NICE agents)
 */

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

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
  };
}

/* ── Tool Definitions ────────────────────────────────────────── */

const TOOLS = [
  {
    name: "gmail_search_messages",
    description:
      "Search Gmail messages using query syntax. Returns message IDs, subjects, senders, snippets, and dates. Use Gmail search operators like 'is:unread', 'from:user@example.com', 'subject:meeting', 'has:attachment', 'after:2024/1/1'.",
    inputSchema: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description: "Gmail search query (e.g., 'is:unread', 'from:boss@company.com'). If omitted, returns recent messages.",
        },
        maxResults: {
          type: "number",
          description: "Maximum messages to return (1-20). Default: 10.",
        },
      },
    },
  },
  {
    name: "gmail_read_message",
    description:
      "Read the full content of a specific Gmail message by its ID. Returns subject, from, to, date, body text, and attachment info.",
    inputSchema: {
      type: "object",
      properties: {
        messageId: {
          type: "string",
          description: "The message ID (obtained from gmail_search_messages).",
        },
      },
      required: ["messageId"],
    },
  },
  {
    name: "gmail_list_labels",
    description: "List all Gmail labels (inbox, sent, custom labels, etc.).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

/* ── Google Service Account Auth (JWT → Access Token) ────────── */

const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

// Per-user token cache (valid for 1 hour, keyed by email)
const _tokenCache = new Map<string, { token: string; expires: number }>();

// Only allow impersonation of users on this domain
const ALLOWED_DOMAIN = "nicespaceship.com";

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlStr(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function getAccessToken(userEmail: string): Promise<string> {
  // Validate domain — only allow nicespaceship.com users
  const domain = userEmail.split("@")[1];
  if (domain !== ALLOWED_DOMAIN) {
    throw new Error(`Domain "${domain}" not authorized. Only @${ALLOWED_DOMAIN} accounts are supported.`);
  }

  // Return cached token if still valid (with 5min buffer)
  const cached = _tokenCache.get(userEmail);
  if (cached && cached.expires > Date.now() + 300_000) {
    return cached.token;
  }

  const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT");
  if (!saJson) throw new Error("GOOGLE_SERVICE_ACCOUNT secret not configured");

  const sa = JSON.parse(saJson);
  const now = Math.floor(Date.now() / 1000);

  // Build JWT header + payload — impersonate the requesting user
  const header = base64urlStr(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64urlStr(
    JSON.stringify({
      iss: sa.client_email,
      sub: userEmail,
      scope: GOOGLE_SCOPES,
      aud: GOOGLE_TOKEN_URI,
      iat: now,
      exp: now + 3600,
    })
  );

  // Sign with RS256
  const key = await importPrivateKey(sa.private_key);
  const sigInput = new TextEncoder().encode(`${header}.${payload}`);
  const sigBuffer = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, sigInput);
  const signature = base64url(new Uint8Array(sigBuffer));

  const assertion = `${header}.${payload}.${signature}`;

  // Exchange JWT for access token
  const res = await fetch(GOOGLE_TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${assertion}`,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token exchange failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  _tokenCache.set(userEmail, { token: data.access_token, expires: Date.now() + data.expires_in * 1000 });

  // Evict stale cache entries (max 100 users)
  if (_tokenCache.size > 100) {
    const now = Date.now();
    for (const [email, entry] of _tokenCache) {
      if (entry.expires < now) _tokenCache.delete(email);
    }
  }

  return data.access_token;
}

/* ── Gmail API Helpers ───────────────────────────────────────── */

async function gmailFetch(path: string, accessToken: string): Promise<Response> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail API error (${res.status}): ${err}`);
  }
  return res;
}

function decodeBase64Url(data: string): string {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return atob(padded);
  } catch {
    return "(unable to decode)";
  }
}

function extractBody(payload: any): string {
  // Direct body
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  // Multipart — find text/plain or text/html
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        // Strip HTML tags for readability
        return decodeBase64Url(part.body.data).replace(/<[^>]+>/g, "");
      }
    }
    // Nested multipart
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }
  return "(no readable body)";
}

function getHeader(headers: any[], name: string): string {
  return headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

/* ── Tool Executors ──────────────────────────────────────────── */

async function searchMessages(args: any, accessToken: string): Promise<string> {
  const q = args?.q || "";
  const maxResults = Math.min(Math.max(args?.maxResults || 10, 1), 20);

  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (q) params.set("q", q);

  const res = await gmailFetch(`/messages?${params}`, accessToken);
  const data = await res.json();

  if (!data.messages || data.messages.length === 0) {
    return `No messages found${q ? ` matching "${q}"` : ""}.`;
  }

  // Fetch metadata for each message
  const details = await Promise.all(
    data.messages.slice(0, maxResults).map(async (msg: any) => {
      try {
        const r = await gmailFetch(`/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, accessToken);
        const m = await r.json();
        const subject = getHeader(m.payload?.headers, "Subject") || "(no subject)";
        const from = getHeader(m.payload?.headers, "From") || "unknown";
        const date = getHeader(m.payload?.headers, "Date") || "";
        const unread = m.labelIds?.includes("UNREAD") ? "⬤ " : "  ";
        return `${unread}[${msg.id}] ${subject}\n  From: ${from}\n  Date: ${date}\n  ${m.snippet || ""}`;
      } catch {
        return `  [${msg.id}] (failed to load)`;
      }
    })
  );

  return `Found ${data.resultSizeEstimate || data.messages.length} messages${q ? ` matching "${q}"` : ""}:\n\n${details.join("\n\n")}`;
}

async function readMessage(args: any, accessToken: string): Promise<string> {
  if (!args?.messageId) return "Error: messageId is required.";

  const res = await gmailFetch(`/messages/${args.messageId}?format=full`, accessToken);
  const msg = await res.json();

  const subject = getHeader(msg.payload?.headers, "Subject") || "(no subject)";
  const from = getHeader(msg.payload?.headers, "From") || "unknown";
  const to = getHeader(msg.payload?.headers, "To") || "";
  const date = getHeader(msg.payload?.headers, "Date") || "";
  const body = extractBody(msg.payload).slice(0, 3000); // Limit body length

  const attachments = (msg.payload?.parts || [])
    .filter((p: any) => p.filename)
    .map((p: any) => `  📎 ${p.filename} (${p.mimeType})`)
    .join("\n");

  return [
    `Subject: ${subject}`,
    `From: ${from}`,
    `To: ${to}`,
    `Date: ${date}`,
    `Labels: ${(msg.labelIds || []).join(", ")}`,
    attachments ? `Attachments:\n${attachments}` : "",
    `\n--- Body ---\n${body}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function listLabels(accessToken: string): Promise<string> {
  const res = await gmailFetch("/labels", accessToken);
  const data = await res.json();

  if (!data.labels) return "No labels found.";

  const system = data.labels
    .filter((l: any) => l.type === "system")
    .map((l: any) => `  ${l.name} (${l.id})`)
    .join("\n");
  const user = data.labels
    .filter((l: any) => l.type === "user")
    .map((l: any) => `  ${l.name} (${l.id})`)
    .join("\n");

  return `System Labels:\n${system}\n\nUser Labels:\n${user || "  (none)"}`;
}

/* ── MCP JSON-RPC Handler ────────────────────────────────────── */

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { jsonrpc, method, id, params } = body;

    if (jsonrpc !== "2.0") {
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid JSON-RPC version" } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // tools/list — return available tools
    if (method === "tools/list") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: { tools: TOOLS },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // tools/call — execute a tool
    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments || {};
      const userEmail = params?.context?.user_email;
      const oauthToken = params?.context?.oauth_access_token;

      // Determine which token to use:
      // 1. OAuth token from user's own Google consent (any Google account)
      // 2. Service account impersonation (only @nicespaceship.com)
      // 3. Error if neither available
      let resolvedToken: string;
      if (oauthToken) {
        // User connected via OAuth — use their token directly
        resolvedToken = oauthToken;
      } else if (userEmail) {
        // Fall back to service account for internal domain users
        try {
          resolvedToken = await getAccessToken(userEmail);
        } catch (saErr) {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id,
              error: { code: -32602, message: `Google not connected. ${saErr.message} Please connect Google Workspace from Settings → Integrations.` },
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "No Google auth available. Please connect Google Workspace from Settings → Integrations." },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let resultText: string;

      switch (toolName) {
        case "gmail_search_messages":
          resultText = await searchMessages(args, resolvedToken);
          break;
        case "gmail_read_message":
          resultText = await readMessage(args, resolvedToken);
          break;
        case "gmail_list_labels":
          resultText = await listLabels(resolvedToken);
          break;
        default:
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id,
              error: { code: -32601, message: `Unknown tool: ${toolName}` },
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
      }

      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: resultText }],
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Unknown method
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not supported: ${method}` },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: err.message || "Internal error" },
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
