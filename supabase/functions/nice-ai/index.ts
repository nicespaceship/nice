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
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";
const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const XAI_API_URL = "https://api.x.ai/v1/chat/completions";

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

/** Deduct tokens from user balance after a successful LLM call (fire-and-forget) */
async function deductTokens(userId: string, inputTokens: number, outputTokens: number, model: string) {
  try {
    const total = inputTokens + outputTokens;
    if (total <= 0) return;

    const svc = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: bal } = await svc
      .from("token_balances")
      .select("balance, free_tier_remaining, lifetime_used")
      .eq("user_id", userId)
      .single();

    if (!bal) return;

    // Deduct from free tier first, then purchased balance
    let freeUsed = 0;
    let paidUsed = 0;
    let remaining = total;

    if (bal.free_tier_remaining > 0) {
      freeUsed = Math.min(remaining, bal.free_tier_remaining);
      remaining -= freeUsed;
    }
    if (remaining > 0) {
      paidUsed = Math.min(remaining, bal.balance);
    }

    await svc.from("token_balances").update({
      balance: Math.max(0, bal.balance - paidUsed),
      free_tier_remaining: Math.max(0, bal.free_tier_remaining - freeUsed),
      lifetime_used: (bal.lifetime_used || 0) + total,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);

    // Log transaction
    await svc.from("token_transactions").insert({
      user_id: userId,
      type: "usage",
      amount: -total,
      balance_after: Math.max(0, bal.balance - paidUsed),
      model,
      metadata: { input_tokens: inputTokens, output_tokens: outputTokens },
    });
  } catch (err) {
    console.error("[nice-ai] Token deduction error:", err);
    // Don't fail the request if token tracking fails
  }
}

function jsonError(msg: string, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Provider config: API URL, env key name, and model prefix matching */
type Provider = "gemini" | "anthropic" | "openai" | "mistral" | "deepseek" | "xai";

const PROVIDER_CONFIG: Record<Exclude<Provider, "gemini" | "anthropic">, { url: string; keyEnv: string; name: string }> = {
  openai:   { url: OPENAI_API_URL,   keyEnv: "OPENAI_API_KEY",   name: "OpenAI" },
  mistral:  { url: MISTRAL_API_URL,  keyEnv: "MISTRAL_API_KEY",  name: "Mistral" },
  deepseek: { url: DEEPSEEK_API_URL, keyEnv: "DEEPSEEK_API_KEY", name: "DeepSeek" },
  xai:      { url: XAI_API_URL,      keyEnv: "XAI_API_KEY",      name: "xAI" },
};

/** Determine which provider to use based on model name */
function getProvider(model: string): Provider {
  if (model.startsWith("claude")) return "anthropic";
  if (model.startsWith("gpt") || model.startsWith("o3") || model.startsWith("o4")) return "openai";
  if (model.startsWith("mistral") || model.startsWith("pixtral") || model.startsWith("codestral")) return "mistral";
  if (model.startsWith("deepseek")) return "deepseek";
  if (model.startsWith("grok")) return "xai";
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
    const isFreeModel = provider === "gemini";

    // ── Token balance check (skip for free models) ─────────────
    if (!isFreeModel) {
      const svcSupabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );
      const { data: bal } = await svcSupabase
        .from("token_balances")
        .select("balance, free_tier_remaining")
        .eq("user_id", user.id)
        .single();

      const available = (bal?.balance || 0) + (bal?.free_tier_remaining || 0);
      // Estimate: max_tokens is the upper bound for this request
      if (available < 1000) {
        return jsonError(
          "Insufficient tokens. Buy more tokens from Settings → Wallet, or use the free Gemini model.",
          402, corsHeaders
        );
      }
    }

    // ── Route to provider ──────────────────────────────────────
    const uid = user.id;
    let response: Response;
    if (provider === "anthropic") {
      response = await handleAnthropic(uid, model, messages, system, max_tokens, temperature, stream, corsHeaders);
    } else if (provider === "gemini") {
      response = await handleGemini(uid, model, messages, system, max_tokens, temperature, stream, corsHeaders);
    } else {
      response = await handleOpenAICompatible(uid, provider, model, messages, system, max_tokens, temperature, stream, corsHeaders);
    }

    // ── Token deduction (fire-and-forget, skip for free models) ──
    if (!isFreeModel && response.ok && !stream) {
      // Clone response to read usage without consuming
      try {
        const clone = response.clone();
        const data = await clone.json();
        const tokensUsed = data?.usage?.input_tokens && data?.usage?.output_tokens
          ? data.usage.input_tokens + data.usage.output_tokens
          : Math.max(Math.floor((data?.content?.length || 500) / 4), 100);

        // Deduct tokens (fire-and-forget — don't block the response)
        const svcSupabase2 = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );
        svcSupabase2.rpc("deduct_tokens", { p_user_id: uid, p_amount: tokensUsed }).then(() => {
          console.log(`[nice-ai] Deducted ${tokensUsed} tokens from ${uid} (${model})`);
        }).catch((err: Error) => {
          console.warn("[nice-ai] Token deduction failed:", err.message);
        });
      } catch { /* don't block response for deduction errors */ }
    }

    return response;

  } catch (err) {
    return jsonError(err.message || "Internal error", 500, corsHeaders);
  }
});

/* ── Gemini Provider (Free Default) ───────────────────────────── */

async function handleGemini(
  userId: string,
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
  const streamParam = stream ? "?alt=sse&" : "?";
  const url = `${GEMINI_API_URL}/models/${model}:${endpoint}${streamParam}key=${apiKey}`;

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
  const inTok = usage.promptTokenCount || 0;
  const outTok = usage.candidatesTokenCount || 0;

  // Track usage (fire-and-forget, even for free models)
  deductTokens(userId, inTok, outTok, model);

  const response = {
    id: `msg_gemini_${Date.now()}`,
    type: "message",
    role: "assistant",
    content: [{ type: "text", text }],
    model,
    stop_reason: "end_turn",
    usage: { input_tokens: inTok, output_tokens: outTok },
  };

  return new Response(JSON.stringify(response), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* ── Anthropic Provider (Premium) ─────────────────────────────── */

async function handleAnthropic(
  userId: string,
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

  // Non-streaming: pass through + track usage
  const data = await anthropicRes.json();
  const aUsage = data.usage || {};
  deductTokens(userId, aUsage.input_tokens || 0, aUsage.output_tokens || 0, model);

  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* ── OpenAI-Compatible Providers (OpenAI, Mistral, DeepSeek, xAI) ─ */

async function handleOpenAICompatible(
  userId: string,
  provider: Exclude<Provider, "gemini" | "anthropic">,
  model: string,
  messages: Array<{ role: string; content: string }>,
  system: string | undefined,
  maxTokens: number,
  temperature: number,
  stream: boolean,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const config = PROVIDER_CONFIG[provider];
  const apiKey = Deno.env.get(config.keyEnv);
  if (!apiKey) {
    return jsonError(`${config.name} is not available yet. Try "nice-auto" for free Gemini or "claude-sonnet-4-20250514" for premium.`, 503, corsHeaders);
  }

  // Build OpenAI-format messages (prepend system as a system message)
  const oaiMessages: Array<{ role: string; content: string }> = [];
  if (system) oaiMessages.push({ role: "system", content: system });
  oaiMessages.push(...messages);

  const oaiBody: Record<string, unknown> = {
    model,
    messages: oaiMessages,
    max_tokens: maxTokens,
    temperature,
    stream,
  };

  const res = await fetch(config.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(oaiBody),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[nice-ai] ${config.name} error:`, errText);
    return jsonError(`${config.name} API error (${res.status})`, res.status, corsHeaders);
  }

  // Streaming: transform OpenAI SSE to Anthropic-compatible format
  if (stream && res.body) {
    const transformer = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        for (const line of text.split("\n")) {
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
          try {
            const data = JSON.parse(line.slice(6));
            const content = data.choices?.[0]?.delta?.content || "";
            if (content) {
              controller.enqueue(new TextEncoder().encode(
                `event: content_block_delta\ndata: ${JSON.stringify({
                  type: "content_block_delta",
                  delta: { type: "text_delta", text: content },
                })}\n\n`
              ));
            }
            if (data.choices?.[0]?.finish_reason) {
              controller.enqueue(new TextEncoder().encode(
                `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`
              ));
            }
          } catch { /* skip */ }
        }
      },
    });

    return new Response(res.body.pipeThrough(transformer), {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // Non-streaming: transform OpenAI response to Anthropic-compatible format
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  const usage = data.usage || {};
  const inTok = usage.prompt_tokens || 0;
  const outTok = usage.completion_tokens || 0;

  // Track usage
  deductTokens(userId, inTok, outTok, model);

  const response = {
    id: data.id || `msg_${provider}_${Date.now()}`,
    type: "message",
    role: "assistant",
    content: [{ type: "text", text }],
    model,
    stop_reason: "end_turn",
    usage: { input_tokens: inTok, output_tokens: outTok },
  };

  return new Response(JSON.stringify(response), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
