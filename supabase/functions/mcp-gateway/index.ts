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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing authorization" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    // ── Parse request ────────────────────────────────────────────
    const { action, connectionId, tool, input } = await req.json();

    if (!action || !connectionId) {
      return jsonResponse({ error: "action and connectionId are required" }, 400);
    }

    // ── Load MCP connection ──────────────────────────────────────
    const { data: conn, error: connErr } = await supabase
      .from("mcp_connections")
      .select("*")
      .eq("id", connectionId)
      .eq("user_id", user.id)
      .single();

    if (connErr || !conn) {
      return jsonResponse({ error: "MCP connection not found" }, 404);
    }

    if (!conn.server_url) {
      return jsonResponse({ error: "MCP server URL not configured" }, 400);
    }

    // ── Build auth headers for MCP server ────────────────────────
    const mcpHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };

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
      if (!tool) return jsonResponse({ error: "tool name is required for invoke" }, 400);
      return await handleInvoke(conn, mcpHeaders, tool, input || {});
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);

  } catch (err) {
    console.error("[mcp-gateway] Error:", err);
    return jsonResponse({ error: err.message || "Internal error" }, 500);
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
    const res = await fetch(conn.server_url as string, {
      method: "POST",
      headers,
      body: JSON.stringify(rpcBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      return jsonResponse({
        error: `MCP server returned ${res.status}`,
        detail: errText,
      }, 502);
    }

    const rpcResponse = await res.json();

    if (rpcResponse.error) {
      return jsonResponse({
        error: "MCP server error",
        detail: rpcResponse.error,
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

  } catch (err) {
    // Update status to error
    await supabase
      .from("mcp_connections")
      .update({ status: "error", updated_at: new Date().toISOString() })
      .eq("id", conn.id);

    return jsonResponse({
      error: "Failed to connect to MCP server",
      detail: err.message,
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
) {
  const rpcBody = {
    jsonrpc: "2.0",
    method: "tools/call",
    id: Date.now(),
    params: {
      name: toolName,
      arguments: toolInput,
    },
  };

  try {
    const res = await fetch(conn.server_url as string, {
      method: "POST",
      headers,
      body: JSON.stringify(rpcBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      return jsonResponse({
        error: `MCP server returned ${res.status}`,
        detail: errText,
      }, 502);
    }

    const rpcResponse = await res.json();

    if (rpcResponse.error) {
      return jsonResponse({
        error: "MCP tool error",
        detail: rpcResponse.error,
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

  } catch (err) {
    return jsonResponse({
      error: `Failed to invoke tool "${toolName}"`,
      detail: err.message,
    }, 502);
  }
}
