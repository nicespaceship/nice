import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * NICE Media — Image & video generation proxy.
 *
 * Routes to the appropriate provider based on request type:
 *   - "gemini"  → Google Imagen 3 (images, free tier)
 *   - "gemini-video" → Google Veo 2 (videos, free tier)
 *   - "dalle"   → OpenAI DALL-E 3
 *   - "flux"    → Replicate Flux (when configured)
 *
 * Request body:
 *   { provider?, type?, prompt, size?, quality?, style?, n? }
 *
 * Returns:
 *   { url, revised_prompt?, provider, model, cost_tokens, type }
 *
 * Generated media stored in Supabase Storage.
 */

/* ── Config ───────────────────────────────────────────────────── */

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";
const OPENAI_API_URL = "https://api.openai.com/v1/images/generations";
const REPLICATE_API_URL = "https://api.replicate.com/v1/predictions";

const ALLOWED_ORIGINS = [
  "https://nicespaceship.ai",
  "https://www.nicespaceship.ai",
  "http://localhost:3000",
  "http://localhost:5173",
];

// Token costs for media generation (approximate)
const COST_MAP: Record<string, number> = {
  "imagen-4-fast": 0,            // Free tier via Gemini API
  "veo-2": 0,                   // Free tier via Gemini API
  "dall-e-3-standard": 20000,   // ~$0.04 equivalent in tokens
  "dall-e-3-hd": 40000,         // ~$0.08
  "flux-schnell": 5000,         // ~$0.01
  "flux-pro": 15000,            // ~$0.03
};

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

/* ── Token deduction (same as nice-ai) ─────────────────────── */

async function deductTokens(userId: string, tokens: number, model: string) {
  try {
    if (tokens <= 0) return;
    const svc = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { data: bal } = await svc.from("token_balances").select("balance, free_tier_remaining").eq("user_id", userId).single();
    if (!bal) return;

    const freeUsed = Math.min(tokens, bal.free_tier_remaining);
    const paidUsed = tokens - freeUsed;
    if (paidUsed > bal.balance) return; // Insufficient balance — let it through for free models

    await svc.from("token_balances").update({
      balance: bal.balance - paidUsed,
      free_tier_remaining: bal.free_tier_remaining - freeUsed,
      lifetime_used: (bal as any).lifetime_used + tokens,
    }).eq("user_id", userId);
  } catch { /* fire and forget */ }
}

/* ── Google Imagen 4 Fast (images) ─────────────────────────── */

async function generateImagen(prompt: string, opts: any) {
  const apiKey = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not configured");

  const res = await fetch(
    `${GEMINI_API_URL}/models/imagen-4.0-fast-generate-001:predict?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: opts.aspect_ratio || "1:1",
          personGeneration: "dont_allow",
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Imagen error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const prediction = data.predictions?.[0];
  if (!prediction?.bytesBase64Encoded) {
    throw new Error("No image generated");
  }

  // Convert base64 to data URL (will be stored to Supabase Storage)
  const dataUrl = `data:image/png;base64,${prediction.bytesBase64Encoded}`;

  return {
    url: dataUrl,
    _base64: prediction.bytesBase64Encoded,
    revised_prompt: prompt,
    provider: "google",
    model: "imagen-4-fast",
    type: "image",
    size: opts.aspect_ratio || "1:1",
    cost_tokens: COST_MAP["imagen-3"],
  };
}

/* ── Google Veo 2 (videos) ─────────────────────────────────── */

async function generateVeo(prompt: string, opts: any) {
  const apiKey = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not configured");

  // Start video generation (async — returns operation name)
  const res = await fetch(
    `${GEMINI_API_URL}/models/veo-2.0-generate-001:predictLongRunning?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          aspectRatio: opts.aspect_ratio || "16:9",
          durationSeconds: opts.duration || 5,
          personGeneration: "dont_allow",
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Veo error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const operationName = data.name;
  if (!operationName) throw new Error("No operation returned from Veo");

  // Poll for completion (max 120s)
  let videoUrl: string | null = null;
  let videoBase64: string | null = null;
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 5000));

    const pollRes = await fetch(
      `${GEMINI_API_URL}/${operationName}?key=${apiKey}`
    );
    if (!pollRes.ok) continue;

    const pollData = await pollRes.json();
    if (pollData.done) {
      const video = pollData.response?.generateVideoResponse?.generatedSamples?.[0];
      if (video?.video?.uri) {
        // Download the video from Google's API (requires key) and upload to Supabase Storage
        const videoDownloadUrl = video.video.uri + (video.video.uri.includes('?') ? '&' : '?') + `key=${apiKey}`;
        const videoRes = await fetch(videoDownloadUrl);
        if (videoRes.ok) {
          const videoBlob = await videoRes.blob();
          // Store directly to Supabase Storage
          const svc = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
          );
          const filename = `videos/${Date.now()}.mp4`;
          const { error: uploadErr } = await svc.storage
            .from("generated-media")
            .upload(filename, videoBlob, { contentType: "video/mp4", upsert: false });
          if (!uploadErr) {
            const { data: urlData } = svc.storage.from("generated-media").getPublicUrl(filename);
            videoUrl = urlData?.publicUrl || null;
          }
        }
        // Fallback if storage failed
        if (!videoUrl) videoUrl = videoDownloadUrl;
      } else if (video?.video?.bytesBase64Encoded) {
        videoBase64 = video.video.bytesBase64Encoded;
      }
      break;
    }
  }

  if (!videoUrl && !videoBase64) throw new Error("Video generation timed out or failed");

  return {
    url: videoUrl || `data:video/mp4;base64,${videoBase64}`,
    _base64: videoBase64 || undefined,
    revised_prompt: prompt,
    provider: "google",
    model: "veo-2",
    type: "video",
    size: opts.aspect_ratio || "16:9",
    duration: opts.duration || 5,
    cost_tokens: COST_MAP["veo-2"],
  };
}

/* ── DALL-E 3 ──────────────────────────────────────────────── */

async function generateDalle(prompt: string, opts: any) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const body = {
    model: "dall-e-3",
    prompt,
    n: 1,
    size: opts.size || "1024x1024",
    quality: opts.quality || "standard",
    style: opts.style || "vivid",
    response_format: "url",
  };

  const res = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DALL-E error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const image = data.data?.[0];

  return {
    url: image?.url,
    revised_prompt: image?.revised_prompt,
    provider: "openai",
    model: "dall-e-3",
    quality: body.quality,
    size: body.size,
    cost_tokens: COST_MAP[`dall-e-3-${body.quality}`] || 20000,
  };
}

/* ── Replicate Flux ────────────────────────────────────────── */

async function generateFlux(prompt: string, opts: any) {
  const apiKey = Deno.env.get("REPLICATE_API_TOKEN");
  if (!apiKey) throw new Error("REPLICATE_API_TOKEN not configured");

  const model = opts.flux_model || "schnell"; // "schnell" (fast) or "pro"
  const version = model === "pro"
    ? "black-forest-labs/flux-pro"
    : "black-forest-labs/flux-schnell";

  // Create prediction
  const res = await fetch(REPLICATE_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Prefer": "wait", // Synchronous mode — waits for result
    },
    body: JSON.stringify({
      model: version,
      input: {
        prompt,
        num_outputs: 1,
        aspect_ratio: opts.aspect_ratio || "1:1",
        output_format: "webp",
        output_quality: 90,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Flux error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const outputUrl = Array.isArray(data.output) ? data.output[0] : data.output;

  return {
    url: outputUrl,
    revised_prompt: prompt,
    provider: "replicate",
    model: `flux-${model}`,
    size: opts.aspect_ratio || "1:1",
    cost_tokens: COST_MAP[`flux-${model}`] || 5000,
  };
}

/* ── Optional: Store to Supabase Storage ───────────────────── */

async function storeImage(imageUrl: string, userId: string): Promise<string | null> {
  try {
    const svc = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Download image
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return null;
    const blob = await imgRes.blob();

    const ext = imageUrl.includes(".webp") ? "webp" : "png";
    const filename = `${userId}/${Date.now()}.${ext}`;

    const { data, error } = await svc.storage
      .from("generated-media")
      .upload(filename, blob, { contentType: `image/${ext}`, upsert: false });

    if (error) {
      console.warn("Storage upload error:", error.message);
      return null;
    }

    // Get public URL
    const { data: urlData } = svc.storage.from("generated-media").getPublicUrl(filename);
    return urlData?.publicUrl || null;
  } catch (e) {
    console.warn("Storage error:", e);
    return null;
  }
}

/* ── Store base64 to Supabase Storage (for Imagen/Veo) ───── */

async function storeBase64(base64: string, userId: string, ext = "png"): Promise<string | null> {
  try {
    const svc = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const contentType = ext === "mp4" ? "video/mp4" : `image/${ext}`;
    const filename = `${userId}/${Date.now()}.${ext}`;

    const { error } = await svc.storage
      .from("generated-media")
      .upload(filename, bytes, { contentType, upsert: false });

    if (error) {
      console.warn("Storage upload error:", error.message);
      return null;
    }

    const { data: urlData } = svc.storage.from("generated-media").getPublicUrl(filename);
    return urlData?.publicUrl || null;
  } catch (e) {
    console.warn("Base64 storage error:", e);
    return null;
  }
}

/* ── Main handler ──────────────────────────────────────────── */

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...cors, "Access-Control-Allow-Methods": "POST, OPTIONS" } });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { prompt, provider, size, quality, style, aspect_ratio, flux_model, store } = body;

    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "prompt is required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Extract user ID from auth header
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      try {
        const svc = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );
        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await svc.auth.getUser(token);
        userId = user?.id ?? null;
      } catch { /* anonymous request */ }
    }

    // Route to provider
    let result: any;
    const mediaType = body.type || "image";
    const selectedProvider = provider || _detectProvider(mediaType);

    if (mediaType === "video") {
      result = await generateVeo(prompt, { aspect_ratio: aspect_ratio || "16:9", duration: body.duration });
    } else if (selectedProvider === "gemini") {
      result = await generateImagen(prompt, { aspect_ratio });
    } else if (selectedProvider === "flux") {
      result = await generateFlux(prompt, { aspect_ratio, flux_model });
    } else {
      result = await generateDalle(prompt, { size, quality, style });
    }

    // Store in Supabase Storage (handles both URLs and base64)
    if (store !== false && userId && (result.url || result._base64)) {
      const storedUrl = result._base64
        ? await storeBase64(result._base64, userId, result.type === "video" ? "mp4" : "png")
        : await storeImage(result.url, userId);
      if (storedUrl) {
        result.stored_url = storedUrl;
        result.url = storedUrl; // Replace temp URL with permanent one
      }
      delete result._base64; // Don't send base64 to client
    }

    // Deduct tokens
    if (userId && result.cost_tokens) {
      deductTokens(userId, result.cost_tokens, result.model);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[nice-media]", err);
    return new Response(JSON.stringify({ error: err.message || "Generation failed" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

/** Auto-detect best available provider — Google first (free), then others */
function _detectProvider(type = "image"): string {
  if (type === "video") return "gemini"; // Veo is the only video provider
  // Prefer Google (free) → Flux (cheap) → DALL-E (premium)
  if (Deno.env.get("GOOGLE_AI_API_KEY")) return "gemini";
  if (Deno.env.get("REPLICATE_API_TOKEN")) return "flux";
  if (Deno.env.get("OPENAI_API_KEY")) return "dalle";
  return "gemini"; // fallback
}
