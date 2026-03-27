import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * NICE AI Proxy — Multi-provider LLM gateway.
 *
 * Routes requests to the appropriate LLM provider based on model name.
 * Default: Gemini 2.0 Flash (free tier, no cost to user or NICE).
 * Premium: Anthropic Claude (requires ANTHROPIC_API_KEY).
 *
 * Providers:
 *   - Google Gemini (default free tier via GOOGLE_AI_API_KEY)
 *   - Anthropic Claude (premium via ANTHROPIC_API_KEY)
 *
 * Request body:
 *   { model?, messages[], system?, max_tokens?, temperature?, stream? }
 *
 * Model routing:
 *   "gemini-*" or "nice-auto" or default → Google Gemini
 *   "claude-*"                           → Anthropic Claude
 */

/* ── Config ───────────────────────────────────────────────────── */

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const DEFAULT_MODEL = "gemini-2.5-flash";

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

function jsonError(msg: string, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Determine which provider to use based on model name */
function getProvider(model: string): "gemini" | "anthropic" {
  if (model.startsWith("claude")) return "anthropic";
  return "gemini"; // Default everything else to free Gemini
}

/* ── Main Handler ─────────────────────────────────────────────── */

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth ────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonError("Missing authorization", 401, corsHeaders);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jsonError("Unauthorized", 401, corsHeaders);

    // ── Parse request ──────────────────────────────────────────
    const body = await req.json();
    const {
      messages,
      system,
      max_tokens = 4096,
      temperature = 0.4,
      stream = false,
    } = body;

    // Resolve model: "nice-auto" or empty → free default
    let model = body.model || DEFAULT_MODEL;
    if (model === "nice-auto" || model === "auto") model = DEFAULT_MODEL;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return jsonError("messages array is required", 400, corsHeaders);
    }

    const provider = getProvider(model);

    // ── Route to provider ──────────────────────────────────────
    if (provider === "anthropic") {
      return await handleAnthropic(model, messages, system, max_tokens, temperature, stream, corsHeaders);
    }

    return await handleGemini(model, messages, system, max_tokens, temperature, stream, corsHeaders);

  } catch (err) {
    return jsonError(err.message || "Internal error", 500, corsHeaders);
  }
});

/* ── Gemini Provider (Free Default) ───────────────────────────── */

async function handleGemini(
  model: string,
  messages: Array<{ role: string; content: string }>,
  system: string | undefined,
  maxTokens: number,
  temperature: number,
  stream: boolean,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const apiKey = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!apiKey) return jsonError("GOOGLE_AI_API_KEY not configured", 500, corsHeaders);

  // Convert from Anthropic/OpenAI message format to Gemini format
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  for (const msg of messages) {
    const role = msg.role === "assistant" ? "model" : "user";
    contents.push({ role, parts: [{ text: msg.content }] });
  }

  const geminiBody: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
    },
  };

  // Add system instruction if provided
  if (system) {
    geminiBody.systemInstruction = { parts: [{ text: system }] };
  }

  const endpoint = stream ? "streamGenerateContent" : "generateContent";
  const streamParam = stream ? "?alt=sse" : "";
  const url = `${GEMINI_API_URL}/models/${model}:${endpoint}${streamParam}&key=${apiKey}`;

  const geminiRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(geminiBody),
  });

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    console.error("[nice-ai] Gemini error:", errText);
    return jsonError(`Gemini API error (${geminiRes.status}): ${errText}`, geminiRes.status, corsHeaders);
  }

  if (stream && geminiRes.body) {
    // Transform Gemini SSE format to Anthropic-compatible format for the client
    const transformer = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        // Gemini SSE sends: data: {"candidates":[{"content":{"parts":[{"text":"..."}]}}]}
        for (const line of text.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (content) {
              // Emit in Anthropic SSE format so the client doesn't need to change
              controller.enqueue(new TextEncoder().encode(
                `event: content_block_delta\ndata: ${JSON.stringify({
                  type: "content_block_delta",
                  delta: { type: "text_delta", text: content },
                })}\n\n`
              ));
            }
            // Check for finish
            if (data.candidates?.[0]?.finishReason) {
              controller.enqueue(new TextEncoder().encode(
                `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`
              ));
            }
          } catch { /* skip unparseable lines */ }
        }
      },
    });

    const stream = geminiRes.body.pipeThrough(transformer);
    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // Non-streaming: transform Gemini response to Anthropic-compatible format
  const data = await geminiRes.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const usage = data.usageMetadata || {};

  const response = {
    id: `msg_gemini_${Date.now()}`,
    type: "message",
    role: "assistant",
    content: [{ type: "text", text }],
    model,
    stop_reason: "end_turn",
    usage: {
      input_tokens: usage.promptTokenCount || 0,
      output_tokens: usage.candidatesTokenCount || 0,
    },
  };

  return new Response(JSON.stringify(response), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* ── Anthropic Provider (Premium) ─────────────────────────────── */

async function handleAnthropic(
  model: string,
  messages: Array<{ role: string; content: string }>,
  system: string | undefined,
  maxTokens: number,
  temperature: number,
  stream: boolean,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return jsonError("ANTHROPIC_API_KEY not configured. Premium models require a subscription.", 500, corsHeaders);

  const anthropicBody: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    temperature,
    stream,
    messages,
  };
  if (system) anthropicBody.system = system;

  const anthropicRes = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(anthropicBody),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    return new Response(errText, {
      status: anthropicRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Stream: pipe directly (already in Anthropic SSE format)
  if (stream && anthropicRes.body) {
    return new Response(anthropicRes.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // Non-streaming: pass through
  const data = await anthropicRes.json();
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
