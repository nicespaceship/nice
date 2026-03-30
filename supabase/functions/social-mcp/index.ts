import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Social Media MCP Server — speaks MCP JSON-RPC protocol over HTTP.
 *
 * Tools:
 *   social_list_queued     — list approved content waiting to publish
 *   social_create_post     — draft a social post via ContentQueue
 *   social_publish_post    — publish to a connected platform (Buffer, X, LinkedIn, etc.)
 *   social_schedule_post   — schedule a post for future publishing
 *   social_get_analytics   — get engagement metrics for published posts
 *
 * Auth: Platform-specific API keys or OAuth tokens passed via MCP gateway context.
 * Called by: mcp-gateway edge function (proxied from NICE agents)
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

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
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}

/* ── Platform Config ──────────────────────────────────────────── */

interface PlatformConfig {
  name: string;
  postUrl: string;
  analyticsUrl?: string;
  contentTypes: string[];
  maxLength: number;
  keyEnv: string;
}

const PLATFORMS: Record<string, PlatformConfig> = {
  buffer: {
    name: "Buffer",
    postUrl: "https://api.bufferapp.com/1/updates/create.json",
    analyticsUrl: "https://api.bufferapp.com/1/updates",
    contentTypes: ["text", "image", "link", "video"],
    maxLength: 2200,
    keyEnv: "BUFFER_ACCESS_TOKEN",
  },
  x: {
    name: "X (Twitter)",
    postUrl: "https://api.x.com/2/tweets",
    analyticsUrl: "https://api.x.com/2/tweets",
    contentTypes: ["text", "image", "link"],
    maxLength: 280,
    keyEnv: "X_BEARER_TOKEN",
  },
  linkedin: {
    name: "LinkedIn",
    postUrl: "https://api.linkedin.com/v2/ugcPosts",
    contentTypes: ["text", "image", "link", "article"],
    maxLength: 3000,
    keyEnv: "LINKEDIN_ACCESS_TOKEN",
  },
  instagram: {
    name: "Instagram",
    postUrl: "https://graph.facebook.com/v19.0",
    contentTypes: ["image", "video", "reel", "story"],
    maxLength: 2200,
    keyEnv: "INSTAGRAM_ACCESS_TOKEN",
  },
  facebook: {
    name: "Facebook",
    postUrl: "https://graph.facebook.com/v19.0",
    contentTypes: ["text", "image", "link", "video"],
    maxLength: 63206,
    keyEnv: "FACEBOOK_ACCESS_TOKEN",
  },
};

/* ── Tool Definitions ────────────────────────────────────────── */

const TOOLS = [
  {
    name: "social_list_queued",
    description:
      "List approved content from the outbox queue that is ready to publish. Returns drafts, approved items, and their target platforms.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description:
            'Filter by status: "draft", "approved", "published", "scheduled". Default: "approved".',
          enum: ["draft", "approved", "published", "scheduled"],
        },
        limit: {
          type: "number",
          description: "Max items to return (1-50). Default: 20.",
        },
      },
    },
  },
  {
    name: "social_create_post",
    description:
      "Draft a social media post and add it to the content queue for review. Supports multi-platform targeting with per-platform content adaptation.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The post content/text.",
        },
        platforms: {
          type: "array",
          items: { type: "string" },
          description:
            'Target platforms: "buffer", "x", "linkedin", "instagram", "facebook". Default: ["buffer"].',
        },
        title: {
          type: "string",
          description: "Internal title for the queue item.",
        },
        media_url: {
          type: "string",
          description: "Optional URL to an image or video to attach.",
        },
        link_url: {
          type: "string",
          description: "Optional link to include in the post.",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "social_publish_post",
    description:
      "Publish an approved post from the content queue to a specific platform. Requires the post to be in 'approved' status.",
    inputSchema: {
      type: "object",
      properties: {
        post_id: {
          type: "string",
          description: "The content queue item ID to publish.",
        },
        platform: {
          type: "string",
          description:
            'Target platform: "buffer", "x", "linkedin", "instagram", "facebook".',
          enum: ["buffer", "x", "linkedin", "instagram", "facebook"],
        },
      },
      required: ["post_id", "platform"],
    },
  },
  {
    name: "social_schedule_post",
    description:
      "Schedule an approved post for future publishing. Time should be ISO 8601 format.",
    inputSchema: {
      type: "object",
      properties: {
        post_id: {
          type: "string",
          description: "The content queue item ID to schedule.",
        },
        platform: {
          type: "string",
          description: "Target platform.",
          enum: ["buffer", "x", "linkedin", "instagram", "facebook"],
        },
        scheduled_at: {
          type: "string",
          description:
            "ISO 8601 datetime for when to publish (e.g., 2026-04-01T09:00:00Z).",
        },
      },
      required: ["post_id", "platform", "scheduled_at"],
    },
  },
  {
    name: "social_get_analytics",
    description:
      "Get engagement metrics (impressions, likes, shares, clicks) for published posts.",
    inputSchema: {
      type: "object",
      properties: {
        platform: {
          type: "string",
          description: "Platform to query.",
          enum: ["buffer", "x", "linkedin", "instagram", "facebook"],
        },
        post_id: {
          type: "string",
          description:
            "Optional: specific post ID. Omit for recent post metrics.",
        },
        days: {
          type: "number",
          description: "Number of days back to query. Default: 7.",
        },
      },
      required: ["platform"],
    },
  },
  {
    name: "social_list_platforms",
    description:
      "List available social media platforms, their connection status, and supported content types.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

/* ── Supabase Helpers ────────────────────────────────────────── */

function getSupabase(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );
}

/* ── Platform API Helpers ────────────────────────────────────── */

function getPlatformToken(
  platform: string,
  oauthToken?: string | null
): string | null {
  // OAuth token from user takes precedence
  if (oauthToken) return oauthToken;
  // Fall back to env var
  const config = PLATFORMS[platform];
  if (!config) return null;
  return Deno.env.get(config.keyEnv) || null;
}

async function publishToBuffer(
  content: string,
  token: string,
  opts: { media_url?: string; link_url?: string; scheduled_at?: string }
): Promise<{ success: boolean; id?: string; error?: string }> {
  const body: Record<string, unknown> = {
    text: content,
    access_token: token,
  };
  if (opts.media_url) body.media = { photo: opts.media_url };
  if (opts.link_url) body.text = `${content}\n\n${opts.link_url}`;
  if (opts.scheduled_at) {
    body.scheduled_at = opts.scheduled_at;
    body.now = false;
  } else {
    body.now = true;
  }

  // Get first profile
  const profileRes = await fetch(
    `https://api.bufferapp.com/1/profiles.json?access_token=${token}`
  );
  if (!profileRes.ok)
    return { success: false, error: `Buffer profiles error: ${profileRes.status}` };
  const profiles = await profileRes.json();
  if (!profiles.length)
    return { success: false, error: "No Buffer profiles found" };

  body.profile_ids = [profiles[0].id];

  const res = await fetch("https://api.bufferapp.com/1/updates/create.json", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(
      Object.entries(body).reduce(
        (acc, [k, v]) => {
          acc[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
          return acc;
        },
        {} as Record<string, string>
      )
    ),
  });

  if (!res.ok) {
    const err = await res.text();
    return { success: false, error: `Buffer API error (${res.status}): ${err}` };
  }
  const data = await res.json();
  return { success: data.success ?? true, id: data.updates?.[0]?.id };
}

async function publishToX(
  content: string,
  token: string,
  opts: { media_url?: string; link_url?: string }
): Promise<{ success: boolean; id?: string; error?: string }> {
  let text = content;
  if (opts.link_url) text = `${content}\n\n${opts.link_url}`;
  if (text.length > 280) text = text.slice(0, 277) + "...";

  const res = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { success: false, error: `X API error (${res.status}): ${err}` };
  }
  const data = await res.json();
  return { success: true, id: data.data?.id };
}

async function publishToLinkedIn(
  content: string,
  token: string,
  opts: { link_url?: string }
): Promise<{ success: boolean; id?: string; error?: string }> {
  // Get user profile URN
  const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!profileRes.ok)
    return { success: false, error: `LinkedIn profile error: ${profileRes.status}` };
  const profile = await profileRes.json();
  const authorUrn = `urn:li:person:${profile.sub}`;

  const shareContent: Record<string, unknown> = {
    shareCommentary: { text: content },
    shareMediaCategory: "NONE",
  };
  if (opts.link_url) {
    shareContent.shareMediaCategory = "ARTICLE";
    shareContent.media = [
      { status: "READY", originalUrl: opts.link_url },
    ];
  }

  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: { "com.linkedin.ugc.ShareContent": shareContent },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { success: false, error: `LinkedIn API error (${res.status}): ${err}` };
  }
  const data = await res.json();
  return { success: true, id: data.id };
}

async function publishToPlatform(
  platform: string,
  content: string,
  token: string,
  opts: { media_url?: string; link_url?: string; scheduled_at?: string }
): Promise<{ success: boolean; id?: string; error?: string }> {
  switch (platform) {
    case "buffer":
      return publishToBuffer(content, token, opts);
    case "x":
      return publishToX(content, token, opts);
    case "linkedin":
      return publishToLinkedIn(content, token, opts);
    case "instagram":
    case "facebook":
      return {
        success: false,
        error: `${PLATFORMS[platform]?.name} publishing requires a Page access token. Connect via Integrations → Social Media.`,
      };
    default:
      return { success: false, error: `Unknown platform: ${platform}` };
  }
}

/* ── Tool Executors ──────────────────────────────────────────── */

async function listQueued(
  args: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string> {
  const status = (args?.status as string) || "approved";
  const limit = Math.min(Math.max((args?.limit as number) || 20, 1), 50);

  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id, title, agent_name, result, content_type, approval_status, edited_content, metadata, created_at"
    )
    .eq("user_id", userId)
    .eq("content_type", "social")
    .eq("approval_status", status)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return `Error loading queue: ${error.message}`;
  if (!data?.length) return `No ${status} social posts in queue.`;

  const items = data.map((item, i) => {
    const content = (item.edited_content || item.result || "").slice(0, 200);
    const platforms = item.metadata?.platforms?.join(", ") || "not specified";
    return `${i + 1}. [${item.id}] "${item.title || "Untitled"}"\n   Agent: ${item.agent_name || "—"}\n   Platforms: ${platforms}\n   Status: ${item.approval_status}\n   Content: ${content}${content.length >= 200 ? "..." : ""}`;
  });

  return `${status.charAt(0).toUpperCase() + status.slice(1)} social posts (${data.length}):\n\n${items.join("\n\n")}`;
}

async function createPost(
  args: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string> {
  const content = args?.content as string;
  if (!content) return "Error: content is required.";

  const platforms = (args?.platforms as string[]) || ["buffer"];
  const title = (args?.title as string) || `Social post — ${new Date().toLocaleDateString()}`;

  const { data, error } = await supabase.from("tasks").insert({
    user_id: userId,
    title,
    agent_name: args?.agent_name || "Social Agent",
    result: content,
    content_type: "social",
    approval_status: "draft",
    status: "completed",
    metadata: {
      platforms,
      media_url: args?.media_url || null,
      link_url: args?.link_url || null,
    },
  }).select("id").single();

  if (error) return `Error creating draft: ${error.message}`;

  const platformList = platforms.map((p) => PLATFORMS[p]?.name || p).join(", ");
  return `Draft created [${data?.id}]:\n  Title: ${title}\n  Platforms: ${platformList}\n  Content: ${content.slice(0, 200)}${content.length > 200 ? "..." : ""}\n\nStatus: DRAFT — approve in Content Queue before publishing.`;
}

async function publishPost(
  args: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  userId: string,
  oauthToken?: string | null
): Promise<string> {
  const postId = args?.post_id as string;
  const platform = args?.platform as string;
  if (!postId || !platform) return "Error: post_id and platform are required.";

  // Load the post
  const { data: post, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", postId)
    .eq("user_id", userId)
    .single();

  if (error || !post) return `Error: post ${postId} not found.`;
  if (post.approval_status !== "approved")
    return `Error: post must be approved before publishing. Current status: ${post.approval_status}`;

  const token = getPlatformToken(platform, oauthToken);
  if (!token)
    return `Error: No API token for ${PLATFORMS[platform]?.name || platform}. Connect via Integrations → Social Media.`;

  const content = post.edited_content || post.result || "";
  const result = await publishToPlatform(platform, content, token, {
    media_url: post.metadata?.media_url,
    link_url: post.metadata?.link_url,
  });

  if (!result.success)
    return `Publish failed: ${result.error}`;

  // Update post status
  await supabase
    .from("tasks")
    .update({
      approval_status: "published",
      metadata: {
        ...post.metadata,
        published_to: [
          ...(post.metadata?.published_to || []),
          { platform, id: result.id, at: new Date().toISOString() },
        ],
      },
    })
    .eq("id", postId);

  return `Published to ${PLATFORMS[platform]?.name}!\n  Post ID: ${result.id}\n  Platform: ${platform}\n  Content: ${content.slice(0, 100)}...`;
}

async function schedulePost(
  args: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  userId: string,
  oauthToken?: string | null
): Promise<string> {
  const postId = args?.post_id as string;
  const platform = args?.platform as string;
  const scheduledAt = args?.scheduled_at as string;
  if (!postId || !platform || !scheduledAt)
    return "Error: post_id, platform, and scheduled_at are required.";

  const schedDate = new Date(scheduledAt);
  if (isNaN(schedDate.getTime())) return "Error: invalid scheduled_at datetime.";
  if (schedDate.getTime() < Date.now())
    return "Error: scheduled_at must be in the future.";

  // Load the post
  const { data: post, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", postId)
    .eq("user_id", userId)
    .single();

  if (error || !post) return `Error: post ${postId} not found.`;
  if (post.approval_status !== "approved")
    return `Error: post must be approved before scheduling. Current status: ${post.approval_status}`;

  // For Buffer, use their scheduling API directly
  if (platform === "buffer") {
    const token = getPlatformToken("buffer", oauthToken);
    if (!token)
      return "Error: No Buffer API token. Connect via Integrations → Social Media.";

    const content = post.edited_content || post.result || "";
    const result = await publishToBuffer(content, token, {
      media_url: post.metadata?.media_url,
      link_url: post.metadata?.link_url,
      scheduled_at: scheduledAt,
    });

    if (!result.success) return `Schedule failed: ${result.error}`;

    await supabase
      .from("tasks")
      .update({
        approval_status: "scheduled",
        metadata: {
          ...post.metadata,
          scheduled: { platform, at: scheduledAt, buffer_id: result.id },
        },
      })
      .eq("id", postId);

    return `Scheduled on Buffer for ${schedDate.toLocaleString()}.\n  Buffer Update ID: ${result.id}`;
  }

  // Other platforms: store schedule in metadata for future cron job
  await supabase
    .from("tasks")
    .update({
      approval_status: "scheduled",
      metadata: {
        ...post.metadata,
        scheduled: { platform, at: scheduledAt },
      },
    })
    .eq("id", postId);

  return `Scheduled for ${PLATFORMS[platform]?.name} at ${schedDate.toLocaleString()}.\n  Note: ${platform} scheduling uses NICE's job queue (publish will execute at the scheduled time).`;
}

async function getAnalytics(
  args: Record<string, unknown>,
  oauthToken?: string | null
): Promise<string> {
  const platform = args?.platform as string;
  if (!platform) return "Error: platform is required.";

  const token = getPlatformToken(platform, oauthToken);
  if (!token)
    return `Error: No API token for ${PLATFORMS[platform]?.name || platform}. Connect via Integrations → Social Media.`;

  // Buffer analytics
  if (platform === "buffer") {
    try {
      const profileRes = await fetch(
        `https://api.bufferapp.com/1/profiles.json?access_token=${token}`
      );
      if (!profileRes.ok)
        return `Buffer API error: ${profileRes.status}`;
      const profiles = await profileRes.json();
      if (!profiles.length) return "No Buffer profiles found.";

      const updatesRes = await fetch(
        `https://api.bufferapp.com/1/profiles/${profiles[0].id}/updates/sent.json?access_token=${token}&count=10`
      );
      if (!updatesRes.ok)
        return `Buffer updates error: ${updatesRes.status}`;
      const updates = await updatesRes.json();

      if (!updates.updates?.length)
        return "No published posts found in Buffer.";

      const items = updates.updates.map(
        (u: Record<string, unknown>, i: number) => {
          const stats = u.statistics as Record<string, number> | undefined;
          return `${i + 1}. "${(u.text as string)?.slice(0, 80)}..."\n   Clicks: ${stats?.clicks ?? 0} | Likes: ${stats?.favorites ?? 0} | Shares: ${stats?.shares ?? 0} | Reach: ${stats?.reach ?? 0}`;
        }
      );

      return `Buffer Analytics (last 10 posts):\n\n${items.join("\n\n")}`;
    } catch (e) {
      return `Buffer analytics error: ${(e as Error).message}`;
    }
  }

  // X analytics
  if (platform === "x") {
    return "X/Twitter analytics require OAuth 2.0 user context. Connect via Integrations → Social Media to access engagement metrics.";
  }

  return `Analytics for ${PLATFORMS[platform]?.name || platform}: Connect the platform in Integrations to access metrics.`;
}

function listPlatforms(oauthToken?: string | null): string {
  const lines = Object.entries(PLATFORMS).map(([id, config]) => {
    const token = getPlatformToken(id, oauthToken);
    const status = token ? "Connected" : "Not connected";
    const dot = token ? "🟢" : "⚪";
    return `${dot} ${config.name} (${id})\n   Types: ${config.contentTypes.join(", ")}\n   Max length: ${config.maxLength.toLocaleString()} chars\n   Status: ${status}`;
  });

  return `Social Media Platforms:\n\n${lines.join("\n\n")}`;
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
        JSON.stringify({
          jsonrpc: "2.0",
          id,
          error: { code: -32600, message: "Invalid JSON-RPC version" },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // tools/list
    if (method === "tools/list") {
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id, result: { tools: TOOLS } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // tools/call
    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments || {};
      const userEmail = params?.context?.user_email;
      const oauthToken = params?.context?.oauth_access_token;

      // Auth — get user from Supabase
      const authHeader =
        req.headers.get("Authorization") || `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`;
      const supabase = getSupabase(authHeader);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "Authentication required." },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let resultText: string;

      switch (toolName) {
        case "social_list_queued":
          resultText = await listQueued(args, supabase, user.id);
          break;
        case "social_create_post":
          resultText = await createPost(
            { ...args, agent_name: args.agent_name || "Social Agent" },
            supabase,
            user.id
          );
          break;
        case "social_publish_post":
          resultText = await publishPost(args, supabase, user.id, oauthToken);
          break;
        case "social_schedule_post":
          resultText = await schedulePost(args, supabase, user.id, oauthToken);
          break;
        case "social_get_analytics":
          resultText = await getAnalytics(args, oauthToken);
          break;
        case "social_list_platforms":
          resultText = listPlatforms(oauthToken);
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
          result: { content: [{ type: "text", text: resultText }] },
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
        error: {
          code: -32603,
          message: (err as Error).message || "Internal error",
        },
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
