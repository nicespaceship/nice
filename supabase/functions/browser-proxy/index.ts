import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Browser Proxy — Fetches web pages and returns clean text content.
 *
 * Used by NICE agent browser tools to read web pages.
 * Strips HTML, extracts text, title, links, and meta tags.
 *
 * POST /functions/v1/browser-proxy
 * Body: { url: string, selector?: string }
 * Returns: { title, text, links[], meta, status, url }
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const MAX_TEXT_LENGTH = 8000;
const MAX_LINKS = 30;
const REQUEST_TIMEOUT = 10000; // 10s

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { url, selector } = body;

    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'url' parameter" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Only HTTP/HTTPS URLs are allowed");
      }
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid URL format" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Fetch the page with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "NICE-Agent/1.0 (https://nicespaceship.ai)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeout);

    const html = await res.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim().replace(/\s+/g, " ") : "";

    // Extract meta description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i)
      || html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["']/i);
    const description = descMatch ? descMatch[1].trim() : "";

    // Extract OG image
    const ogImgMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([\s\S]*?)["']/i);
    const ogImage = ogImgMatch ? ogImgMatch[1].trim() : "";

    // Clean HTML → text
    let text = html
      // Remove script and style blocks
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
      // Remove HTML comments
      .replace(/<!--[\s\S]*?-->/g, "")
      // Replace common block elements with newlines
      .replace(/<\/(p|div|h[1-6]|li|tr|br|hr)[^>]*>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      // Remove remaining tags
      .replace(/<[^>]+>/g, " ")
      // Decode common entities
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      // Collapse whitespace
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();

    // Optional selector-based extraction
    if (selector) {
      // Basic selector extraction using regex (not full CSS selector support)
      // Supports: tag, .class, #id
      const selectorRegex = _buildSelectorRegex(selector);
      if (selectorRegex) {
        const matches = html.match(selectorRegex);
        if (matches) {
          text = matches
            .map((m: string) => m.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
            .filter(Boolean)
            .join("\n");
        }
      }
    }

    // Truncate text
    if (text.length > MAX_TEXT_LENGTH) {
      text = text.slice(0, MAX_TEXT_LENGTH) + "\n\n[Content truncated at 8000 characters]";
    }

    // Extract links
    const linkMatches = [...html.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)];
    const links = [...new Set(linkMatches.map((m: RegExpMatchArray) => m[1]))]
      .slice(0, MAX_LINKS);

    // Extract headings for structure
    const headings = [...html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)]
      .map((m: RegExpMatchArray) => ({
        level: parseInt(m[1]),
        text: m[2].replace(/<[^>]+>/g, "").trim(),
      }))
      .filter((h: { text: string }) => h.text.length > 0)
      .slice(0, 20);

    return new Response(
      JSON.stringify({
        url: res.url, // Final URL after redirects
        status: res.status,
        title,
        text,
        links,
        headings,
        meta: { description, ogImage },
      }),
      {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const isTimeout = message.includes("abort");

    return new Response(
      JSON.stringify({
        error: isTimeout ? "Request timed out (10s limit)" : message,
      }),
      {
        status: isTimeout ? 504 : 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }
});

/** Build a basic regex for CSS selector extraction */
function _buildSelectorRegex(selector: string): RegExp | null {
  // .class → elements with that class
  if (selector.startsWith(".")) {
    const cls = selector.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`<[^>]+class=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>[\\s\\S]*?<\\/[^>]+>`, "gi");
  }
  // #id → element with that id
  if (selector.startsWith("#")) {
    const id = selector.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`<[^>]+id=["']${id}["'][^>]*>[\\s\\S]*?<\\/[^>]+>`, "gi");
  }
  // tag → all matching tags
  const tag = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
}
