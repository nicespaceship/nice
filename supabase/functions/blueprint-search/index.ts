import "jsr:@supabase/functions-js/edge-runtime.d.ts";
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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

interface SearchRequest {
  q?: string;
  type?: "agent" | "spaceship";
  category?: string;
  rarity?: string;
  tags?: string[];
  serial_key?: string;
  page?: number;
  per_page?: number;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Use anon key — RLS enforces is_public=true for public access
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const body: SearchRequest = await req.json();
    const {
      q,
      type,
      category,
      rarity,
      tags,
      serial_key,
      page = 1,
      per_page = 20,
    } = body;

    // ── Serial key exact lookup ─────────────────────────────────
    if (serial_key) {
      const { data, error } = await supabase
        .from("blueprints")
        .select("*")
        .eq("serial_key", serial_key)
        .single();

      if (error || !data) {
        return new Response(
          JSON.stringify({ results: [], total: 0, page: 1, per_page: 1 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ results: [data], total: 1, page: 1, per_page: 1 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Search via query builder ────────────────────────────────
    const offset = (page - 1) * per_page;

    let query = supabase
      .from("blueprints")
      .select("*", { count: "exact" });

    // Facet filters
    if (type) query = query.eq("type", type);
    if (category) query = query.eq("category", category);
    if (rarity) query = query.eq("rarity", rarity);
    if (tags && tags.length > 0) query = query.contains("tags", tags);

    // Text search — use textSearch for full-text, fall back to ilike for fuzzy
    if (q && q.trim()) {
      const term = q.trim();
      query = query.or(
        `name.ilike.%${term}%,description.ilike.%${term}%`
      );
    }

    // Ordering and pagination
    query = query
      .order("activation_count", { ascending: false })
      .order("name", { ascending: true })
      .range(offset, offset + per_page - 1);

    const { data, count, error } = await query;

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        results: data || [],
        total: count || 0,
        page,
        per_page,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
