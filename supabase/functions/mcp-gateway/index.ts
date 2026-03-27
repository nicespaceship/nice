import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * MCP Gateway — proxies tool calls from NICE agents to external MCP servers.
 *
 * Actions:
 *   discover  — list available tools from an MCP server
 *   invoke    — call a specific tool on an MCP server
 *
 * Request body:
 *   { action: 'discover' | 'invoke', connectionId: string, tool?: string, input?: object }
 */

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

/** Block requests to private/reserved IPs (SSRF protection) */
function isPrivateUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const host = u.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
    if (host.startsWith("10.") || host.startsWith("192.168.")) return true;
    if (host.startsWith("172.")) {
      const second = parseInt(host.split(".")[1], 10);
      if (second >= 16 && second <= 31) return true;
    }
    if (host === "169.254.169.254") return true; // cloud metadata
    if (host.endsWith(".internal") || host.endsWith(".local")) return true;
    return false;
  } catch {
    return true; // invalid URL = blocked
  }
}

function jsonResponse(body: unknown, status = 200, req?: Request) {
  const cors = req ? getCorsHeaders(req) : { "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0], "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing authorization" }, 401, req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401, req);

    // ── Parse request ────────────────────────────────────────────
    const { action, connectionId, tool, input } = await req.json();

    if (!action || !connectionId) {
      return jsonResponse({ error: "action and connectionId are required" }, 400, req);
    }

    // ── Load MCP connection ──────────────────────────────────────
    const { data: conn, error: connErr } = await supabase
      .from("mcp_connections")
      .select("*")
      .eq("id", connectionId)
      .eq("user_id", user.id)
      .single();

    if (connErr || !conn) {
      return jsonResponse({ error: "MCP connection not found" }, 404, req);
    }

    if (!conn.server_url) {
      return jsonResponse({ error: "MCP server URL not configured" }, 400, req);;
    }

    if (isPrivateUrl(conn.server_url as string)) {
      return jsonResponse({ error: "MCP server URL points to a private address" }, 400, req);
    }

    // ── Build auth headers for MCP server ────────────────────────
    const mcpHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Refresh expired OAuth tokens before using them
    if (conn.auth_type === "oauth" && conn.auth_config?.refresh_token) {
      const expiresAt = conn.auth_config.expires_at || 0;
      if (Date.now() > expiresAt - 300_000) { // 5-min buffer
        try {
          const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
          const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
          const tokenUri = conn.auth_config.token_uri || "https://oauth2.googleapis.com/token";
          if (clientId && clientSecret) {
            const refreshRes = await fetch(tokenUri, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: conn.auth_config.refresh_token,
                grant_type: "refresh_token",
              }),
            });
            if (refreshRes.ok) {
              const tokens = await refreshRes.json();
              conn.auth_config = {
                ...conn.auth_config,
                access_token: tokens.access_token,
                expires_at: Date.now() + (tokens.expires_in || 3600) * 1000,
              };
              // Persist refreshed token to DB
              await supabase.from("mcp_connections")
                .update({ auth_config: conn.auth_config, updated_at: new Date().toISOString() })
                .eq("id", conn.id);
            } else {
              console.error("[mcp-gateway] Token refresh failed:", await refreshRes.text());
            }
          }
        } catch (err) {
          console.error("[mcp-gateway] Token refresh error:", err);
        }
      }
    }

    if (conn.auth_type === "api_key" && conn.auth_config?.api_key) {
      mcpHeaders["Authorization"] = `Bearer ${conn.auth_config.api_key}`;
    } else if (conn.auth_type === "bearer" && conn.auth_config?.token) {
      mcpHeaders["Authorization"] = `Bearer ${conn.auth_config.token}`;
    } else if (conn.auth_type === "oauth" && conn.auth_config?.access_token) {
      mcpHeaders["Authorization"] = `Bearer ${conn.auth_config.access_token}`;
    }

    // ── Route action ─────────────────────────────────────────────
    if (action === "discover") {
      return await handleDiscover(supabase, conn, mcpHeaders);
    }

    if (action === "invoke") {
      if (!tool) return jsonResponse({ error: "tool name is required for invoke" }, 400, req);
      // Pass OAuth access token in context so MCP servers can use it directly
      const oauthToken = conn.auth_type === "oauth" ? conn.auth_config?.access_token : null;
      return await handleInvoke(conn, mcpHeaders, tool, input || {}, user.email, oauthToken);
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400, req);

  } catch (err: unknown) {
    console.error("[mcp-gateway] Error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return jsonResponse({ error: message }, 500, req);
  }
});

// ═══════════════════════════════════════════════════════════════════
// Discover — list available tools from an MCP server
// ═══════════════════════════════════════════════════════════════════
async function handleDiscover(
  supabase: ReturnType<typeof createClient>,
  conn: Record<string, unknown>,
  headers: Record<string, string>,
) {
  const rpcBody = {
    jsonrpc: "2.0",
    method: "tools/list",
    id: 1,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const res = await fetch(conn.server_url as string, {
      method: "POST",
      headers,
      body: JSON.stringify(rpcBody),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return jsonResponse({
        error: `MCP server returned ${res.status}`,
      }, 502);
    }

    const rpcResponse = await res.json();

    if (rpcResponse.error) {
      return jsonResponse({
        error: "MCP server error",
      }, 502);
    }

    const tools = rpcResponse.result?.tools || [];

    // Update the connection's available_tools in DB
    const toolNames = tools.map((t: { name: string }) => t.name);
    await supabase
      .from("mcp_connections")
      .update({
        available_tools: toolNames,
        status: "connected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", conn.id);

    return jsonResponse({
      tools: tools.map((t: { name: string; description?: string; inputSchema?: unknown }) => ({
        name: t.name,
        description: t.description || "",
        inputSchema: t.inputSchema || {},
      })),
      count: tools.length,
    });

  } catch (err: unknown) {
    // Update status to error
    await supabase
      .from("mcp_connections")
      .update({ status: "error", updated_at: new Date().toISOString() })
      .eq("id", conn.id);

    return jsonResponse({
      error: "Failed to connect to MCP server",
    }, 502);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Invoke — call a specific tool on an MCP server
// ═══════════════════════════════════════════════════════════════════
async function handleInvoke(
  conn: Record<string, unknown>,
  headers: Record<string, string>,
  toolName: string,
  toolInput: Record<string, unknown>,
  userEmail?: string,
  oauthAccessToken?: string | null,
) {
  const rpcBody = {
    jsonrpc: "2.0",
    method: "tools/call",
    id: Date.now(),
    params: {
      name: toolName,
      arguments: toolInput,
      // Pass user context so MCP servers can use the correct auth
      context: {
        user_email: userEmail,
        oauth_access_token: oauthAccessToken || null,
      },
    },
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const res = await fetch(conn.server_url as string, {
      method: "POST",
      headers,
      body: JSON.stringify(rpcBody),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return jsonResponse({
        error: `MCP server returned ${res.status}`,
      }, 502);
    }

    const rpcResponse = await res.json();

    if (rpcResponse.error) {
      return jsonResponse({
        error: "MCP tool error",
      }, 502);
    }

    // MCP tools return content as array of {type, text} blocks
    const content = rpcResponse.result?.content || [];
    const textParts = content
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { text: string }) => c.text);

    return jsonResponse({
      tool: toolName,
      result: textParts.join("\n") || JSON.stringify(rpcResponse.result),
      raw: rpcResponse.result,
    });

  } catch (err: unknown) {
    return jsonResponse({
      error: `Failed to invoke tool "${toolName}"`,
    }, 502);
  }
}
