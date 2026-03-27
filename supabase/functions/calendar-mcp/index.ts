import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Calendar MCP Server — speaks MCP JSON-RPC protocol over HTTP.
 *
 * Methods:
 *   tools/list  — returns available Calendar tools
 *   tools/call  — executes a Calendar tool
 *
 * Auth: OAuth access token passed via params.context.oauth_access_token from mcp-gateway,
 *       or service account fallback for @nicespaceship.com via GOOGLE_SERVICE_ACCOUNT.
 * Called by: mcp-gateway edge function (proxied from NICE agents)
 */

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

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
    name: "calendar_list_events",
    description:
      "List upcoming calendar events. Returns event titles, times, locations, and attendees. Defaults to the next 7 days on the primary calendar.",
    inputSchema: {
      type: "object",
      properties: {
        calendarId: { type: "string", description: "Calendar ID (default: 'primary')." },
        maxResults: { type: "number", description: "Maximum events to return (1-20). Default: 10." },
        timeMin: { type: "string", description: "Start time (ISO 8601). Default: now." },
        timeMax: { type: "string", description: "End time (ISO 8601). Default: 7 days from now." },
        q: { type: "string", description: "Free text search query to filter events." },
      },
    },
  },
  {
    name: "calendar_get_event",
    description: "Get details of a specific calendar event by ID.",
    inputSchema: {
      type: "object",
      properties: {
        calendarId: { type: "string", description: "Calendar ID (default: 'primary')." },
        eventId: { type: "string", description: "The event ID." },
      },
      required: ["eventId"],
    },
  },
  {
    name: "calendar_list_calendars",
    description: "List all calendars the user has access to.",
    inputSchema: { type: "object", properties: {} },
  },
];

/* ── Calendar API Helpers ─────────────────────────────────────── */

async function calFetch(path: string, token: string): Promise<Response> {
  const res = await fetch(`${CALENDAR_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Calendar API error (${res.status}): ${err}`);
  }
  return res;
}

function fmtTime(dt: { dateTime?: string; date?: string }): string {
  if (dt.dateTime) {
    const d = new Date(dt.dateTime);
    return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  if (dt.date) return `All day: ${dt.date}`;
  return "unknown";
}

/* ── Tool Executors ──────────────────────────────────────────── */

async function listEvents(args: any, token: string): Promise<string> {
  const calId = args?.calendarId || "primary";
  const max = Math.min(Math.max(args?.maxResults || 10, 1), 20);
  const now = new Date();
  const timeMin = args?.timeMin || now.toISOString();
  const timeMax = args?.timeMax || new Date(now.getTime() + 7 * 86400000).toISOString();

  const params = new URLSearchParams({
    maxResults: String(max),
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
  });
  if (args?.q) params.set("q", args.q);

  const res = await calFetch(`/calendars/${encodeURIComponent(calId)}/events?${params}`, token);
  const data = await res.json();

  if (!data.items || data.items.length === 0) {
    return "No upcoming events found.";
  }

  const events = data.items.map((e: any) => {
    const start = fmtTime(e.start || {});
    const end = fmtTime(e.end || {});
    const loc = e.location ? `\n  📍 ${e.location}` : "";
    const attendees = e.attendees?.length ? `\n  👥 ${e.attendees.length} attendees` : "";
    return `[${e.id}] ${e.summary || "(no title)"}\n  ⏰ ${start} → ${end}${loc}${attendees}`;
  });

  return `Found ${data.items.length} events:\n\n${events.join("\n\n")}`;
}

async function getEvent(args: any, token: string): Promise<string> {
  if (!args?.eventId) return "Error: eventId is required.";
  const calId = args?.calendarId || "primary";

  const res = await calFetch(`/calendars/${encodeURIComponent(calId)}/events/${args.eventId}`, token);
  const e = await res.json();

  const attendees = (e.attendees || [])
    .map((a: any) => `  ${a.responseStatus === "accepted" ? "✅" : a.responseStatus === "declined" ? "❌" : "❓"} ${a.email}${a.displayName ? ` (${a.displayName})` : ""}`)
    .join("\n");

  return [
    `Event: ${e.summary || "(no title)"}`,
    `Start: ${fmtTime(e.start || {})}`,
    `End: ${fmtTime(e.end || {})}`,
    e.location ? `Location: ${e.location}` : "",
    e.description ? `Description: ${e.description.slice(0, 500)}` : "",
    `Status: ${e.status}`,
    e.htmlLink ? `Link: ${e.htmlLink}` : "",
    attendees ? `Attendees:\n${attendees}` : "",
  ].filter(Boolean).join("\n");
}

async function listCalendars(token: string): Promise<string> {
  const res = await calFetch("/users/me/calendarList", token);
  const data = await res.json();

  if (!data.items || data.items.length === 0) return "No calendars found.";

  const cals = data.items.map((c: any) =>
    `  ${c.primary ? "⭐ " : "  "}${c.summary} (${c.id})`
  );

  return `Calendars:\n${cals.join("\n")}`;
}

/* ── MCP JSON-RPC Handler ────────────────────────────────────── */

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { jsonrpc, method, id, params } = body;

    if (jsonrpc !== "2.0") {
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid JSON-RPC version" } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (method === "tools/list") {
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id, result: { tools: TOOLS } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments || {};
      const token = params?.context?.oauth_access_token;

      if (!token) {
        return new Response(
          JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32602, message: "No Google auth. Connect Google Workspace from Settings → Integrations." } }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let resultText: string;
      switch (toolName) {
        case "calendar_list_events": resultText = await listEvents(args, token); break;
        case "calendar_get_event": resultText = await getEvent(args, token); break;
        case "calendar_list_calendars": resultText = await listCalendars(token); break;
        default:
          return new Response(
            JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown tool: ${toolName}` } }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
      }

      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: resultText }] } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not supported: ${method}` } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: err.message || "Internal error" } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
