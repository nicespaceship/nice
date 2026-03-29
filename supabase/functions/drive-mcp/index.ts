import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Drive MCP Server — speaks MCP JSON-RPC protocol over HTTP.
 *
 * Methods:
 *   tools/list  — returns available Drive tools
 *   tools/call  — executes a Drive tool
 *
 * Auth: OAuth access token passed via params.context.oauth_access_token from mcp-gateway.
 * Called by: mcp-gateway edge function (proxied from NICE agents)
 */

const DRIVE_API = "https://www.googleapis.com/drive/v3";

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
    name: "drive_search_files",
    description:
      "Search Google Drive files by name, type, or content. Returns file names, IDs, types, and modification dates.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Search query. Use Drive query syntax: name contains 'report', mimeType='application/pdf', etc. If omitted, returns recent files." },
        maxResults: { type: "number", description: "Maximum files to return (1-20). Default: 10." },
      },
    },
  },
  {
    name: "drive_get_file",
    description: "Get metadata for a specific file by ID. Returns name, type, size, owners, and sharing info.",
    inputSchema: {
      type: "object",
      properties: {
        fileId: { type: "string", description: "The file ID (obtained from drive_search_files)." },
      },
      required: ["fileId"],
    },
  },
  {
    name: "drive_read_file",
    description: "Read the text content of a Google Doc, Sheet, or text file. Returns the file content as plain text (max 10,000 chars).",
    inputSchema: {
      type: "object",
      properties: {
        fileId: { type: "string", description: "The file ID." },
      },
      required: ["fileId"],
    },
  },
  {
    name: "drive_upload_file",
    description: "Upload a file to Google Drive. Can upload text content, images (from URL), or create Google Docs. Returns the file ID and web link.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "File name (e.g., 'Social Media Plan.txt', 'menu-photo.jpg')." },
        content: { type: "string", description: "Text content for the file, OR a URL to an image/video to upload." },
        mimeType: { type: "string", description: "MIME type. Use 'application/vnd.google-apps.document' for Google Docs, 'text/plain' for text, or the actual type for media." },
        folderId: { type: "string", description: "Parent folder ID. If omitted, uploads to root Drive." },
      },
      required: ["name", "content"],
    },
  },
  {
    name: "drive_create_folder",
    description: "Create a folder in Google Drive. Returns the folder ID.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Folder name." },
        parentId: { type: "string", description: "Parent folder ID. If omitted, creates in root." },
      },
      required: ["name"],
    },
  },
];

/* ── Drive API Helpers ────────────────────────────────────────── */

async function driveFetch(path: string, token: string): Promise<Response> {
  const res = await fetch(`${DRIVE_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive API error (${res.status}): ${err}`);
  }
  return res;
}

function fmtSize(bytes: string | number | undefined): string {
  if (!bytes) return "unknown";
  const b = Number(bytes);
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(1)} GB`;
}

const MIME_ICONS: Record<string, string> = {
  "application/vnd.google-apps.document": "📄",
  "application/vnd.google-apps.spreadsheet": "📊",
  "application/vnd.google-apps.presentation": "📽️",
  "application/vnd.google-apps.folder": "📁",
  "application/pdf": "📕",
  "image/": "🖼️",
  "video/": "🎬",
  "audio/": "🎵",
};

function mimeIcon(mime: string): string {
  for (const [prefix, icon] of Object.entries(MIME_ICONS)) {
    if (mime.startsWith(prefix)) return icon;
  }
  return "📎";
}

/* ── Tool Executors ──────────────────────────────────────────── */

async function searchFiles(args: any, token: string): Promise<string> {
  const max = Math.min(Math.max(args?.maxResults || 10, 1), 20);
  const params = new URLSearchParams({
    pageSize: String(max),
    fields: "files(id,name,mimeType,modifiedTime,size,owners)",
    orderBy: "modifiedTime desc",
  });
  if (args?.q) params.set("q", args.q);

  const res = await driveFetch(`/files?${params}`, token);
  const data = await res.json();

  if (!data.files || data.files.length === 0) {
    return `No files found${args?.q ? ` matching "${args.q}"` : ""}.`;
  }

  const files = data.files.map((f: any) => {
    const icon = mimeIcon(f.mimeType || "");
    const modified = f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : "";
    const size = f.size ? ` (${fmtSize(f.size)})` : "";
    return `${icon} [${f.id}] ${f.name}${size}\n  Modified: ${modified} | Type: ${f.mimeType}`;
  });

  return `Found ${data.files.length} files:\n\n${files.join("\n\n")}`;
}

async function getFile(args: any, token: string): Promise<string> {
  if (!args?.fileId) return "Error: fileId is required.";

  const res = await driveFetch(`/files/${args.fileId}?fields=id,name,mimeType,size,modifiedTime,createdTime,owners,shared,webViewLink,description`, token);
  const f = await res.json();

  const owners = (f.owners || []).map((o: any) => o.emailAddress || o.displayName).join(", ");

  return [
    `File: ${f.name}`,
    `Type: ${f.mimeType}`,
    f.size ? `Size: ${fmtSize(f.size)}` : "",
    `Created: ${f.createdTime ? new Date(f.createdTime).toLocaleString() : "unknown"}`,
    `Modified: ${f.modifiedTime ? new Date(f.modifiedTime).toLocaleString() : "unknown"}`,
    `Owners: ${owners || "unknown"}`,
    `Shared: ${f.shared ? "Yes" : "No"}`,
    f.webViewLink ? `Link: ${f.webViewLink}` : "",
    f.description ? `Description: ${f.description.slice(0, 300)}` : "",
  ].filter(Boolean).join("\n");
}

async function readFile(args: any, token: string): Promise<string> {
  if (!args?.fileId) return "Error: fileId is required.";

  // First get the mime type
  const metaRes = await driveFetch(`/files/${args.fileId}?fields=mimeType,name`, token);
  const meta = await metaRes.json();
  const mime = meta.mimeType || "";

  let content: string;

  // Google Docs/Sheets/Slides — export as text
  if (mime.startsWith("application/vnd.google-apps.")) {
    let exportMime = "text/plain";
    if (mime.includes("spreadsheet")) exportMime = "text/csv";
    if (mime.includes("presentation")) exportMime = "text/plain";

    const exportRes = await fetch(
      `${DRIVE_API}/files/${args.fileId}/export?mimeType=${encodeURIComponent(exportMime)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!exportRes.ok) {
      const err = await exportRes.text();
      throw new Error(`Export failed (${exportRes.status}): ${err}`);
    }
    content = await exportRes.text();
  } else {
    // Regular files — download content
    const dlRes = await fetch(
      `${DRIVE_API}/files/${args.fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!dlRes.ok) {
      const err = await dlRes.text();
      throw new Error(`Download failed (${dlRes.status}): ${err}`);
    }
    content = await dlRes.text();
  }

  // Truncate to 10K chars
  if (content.length > 10000) {
    content = content.slice(0, 10000) + "\n\n... (truncated, file is longer)";
  }

  return `File: ${meta.name}\n\n${content}`;
}

async function uploadFile(args: any, token: string): Promise<string> {
  if (!args?.name) return "Error: name is required.";
  if (!args?.content) return "Error: content is required.";

  const mimeType = args.mimeType || "text/plain";
  const isUrl = args.content.startsWith("http://") || args.content.startsWith("https://");

  // Build multipart upload
  const metadata: any = { name: args.name };
  if (args.folderId) metadata.parents = [args.folderId];

  // If converting to Google Doc
  if (mimeType === "application/vnd.google-apps.document") {
    metadata.mimeType = mimeType;
  }

  let fileBody: Uint8Array | string;
  let uploadMime = mimeType;

  if (isUrl) {
    // Download from URL and upload
    const dlRes = await fetch(args.content);
    if (!dlRes.ok) throw new Error(`Failed to download: ${dlRes.status}`);
    fileBody = new Uint8Array(await dlRes.arrayBuffer());
    uploadMime = dlRes.headers.get("content-type") || mimeType;
  } else {
    fileBody = args.content;
    if (mimeType === "application/vnd.google-apps.document") {
      uploadMime = "text/plain"; // Upload as text, Google converts to Doc
    }
  }

  const boundary = "nice_boundary_" + Date.now();
  const metaPart = JSON.stringify(metadata);

  const encoder = new TextEncoder();
  const bodyParts = [
    encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n`),
    encoder.encode(`--${boundary}\r\nContent-Type: ${uploadMime}\r\n\r\n`),
    typeof fileBody === "string" ? encoder.encode(fileBody) : fileBody,
    encoder.encode(`\r\n--${boundary}--`),
  ];

  const totalLen = bodyParts.reduce((sum, p) => sum + p.length, 0);
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of bodyParts) {
    combined.set(part, offset);
    offset += part.length;
  }

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,mimeType",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: combined,
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Upload failed (${res.status}): ${err}`);
  }

  const f = await res.json();
  return `Uploaded: ${f.name}\nID: ${f.id}\nType: ${f.mimeType}\nLink: ${f.webViewLink || "N/A"}`;
}

async function createFolder(args: any, token: string): Promise<string> {
  if (!args?.name) return "Error: name is required.";

  const metadata: any = {
    name: args.name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (args.parentId) metadata.parents = [args.parentId];

  const res = await fetch(`${DRIVE_API}/files?fields=id,name,webViewLink`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Folder creation failed (${res.status}): ${err}`);
  }

  const f = await res.json();
  return `Created folder: ${f.name}\nID: ${f.id}\nLink: ${f.webViewLink || "N/A"}`;
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
        case "drive_search_files": resultText = await searchFiles(args, token); break;
        case "drive_get_file": resultText = await getFile(args, token); break;
        case "drive_read_file": resultText = await readFile(args, token); break;
        case "drive_upload_file": resultText = await uploadFile(args, token); break;
        case "drive_create_folder": resultText = await createFolder(args, token); break;
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
