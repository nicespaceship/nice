#!/usr/bin/env node
/**
 * Layer 2 tier-2 smoke runner.
 *
 * For one MCP umbrella, calls mcp-gateway's `discover` action via the
 * authenticated user's JWT, hashes the resulting tool list + input
 * schemas, compares to the previous run's hash, and reports drift.
 *
 *   Usage:  SUPABASE_USER_JWT=<token> node tools/mcp-smoke/run.mjs <provider>
 *   e.g.:   SUPABASE_USER_JWT=eyJ... node tools/mcp-smoke/run.mjs hubspot
 *
 * Get the JWT by signing in at https://nicespaceship.ai, then in
 * DevTools → Application → Local Storage, copy the `access_token`
 * value from `nice-auth`. JWTs expire after one hour by default —
 * refresh the browser session and re-copy if you see 401s.
 *
 * Exit codes: 0 pass, 1 functional failure, 2 misuse / missing args.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const SUPABASE_URL = 'https://zacllshbgmnwsmliteqx.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphY2xsc2hiZ21ud3NtbGl0ZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyOTAwOTcsImV4cCI6MjA4OTg2NjA5N30.JzkhFbUMUVByEz1m6j2R4D8bXWMhPO2F0YxIqxYGq28';

const jwt = process.env.SUPABASE_USER_JWT;
const provider = process.argv[2];

if (!jwt) {
  console.error('error: set SUPABASE_USER_JWT (see header comment for how to get it)');
  process.exit(2);
}
if (!provider) {
  console.error('usage: SUPABASE_USER_JWT=<token> node tools/mcp-smoke/run.mjs <provider>');
  process.exit(2);
}

const headers = {
  Authorization: `Bearer ${jwt}`,
  apikey: ANON_KEY,
  'Content-Type': 'application/json',
};

async function failWith(msg, detail) {
  console.error(`FAIL: ${msg}`);
  if (detail) console.error(detail);
  process.exit(1);
}

// 1. Look up the user's mcp_connections row for this provider (RLS scopes to caller).
const connRes = await fetch(
  `${SUPABASE_URL}/rest/v1/mcp_connections?provider=eq.${encodeURIComponent(provider)}&select=id,provider,status`,
  { headers }
);
if (!connRes.ok) await failWith(`mcp_connections query ${connRes.status}`, await connRes.text());
const conns = await connRes.json();
if (conns.length === 0) await failWith(`no mcp_connections row for provider="${provider}" on this user — connect it first`);
const conn = conns[0];

// 2. Discover tools through the gateway.
const discRes = await fetch(`${SUPABASE_URL}/functions/v1/mcp-gateway`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ action: 'discover', connectionId: conn.id }),
});
const discBody = await discRes.json().catch(() => ({}));
if (!discRes.ok || discBody?.error) {
  await failWith(`discover ${discRes.status}`, JSON.stringify(discBody, null, 2));
}
const tools = Array.isArray(discBody?.tools) ? discBody.tools : [];
if (tools.length === 0) await failWith(`provider returned zero tools — MCP misconfigured?`);

// 3. Hash signatures and diff against last run.
const __dir = dirname(fileURLToPath(import.meta.url));
const cacheDir = resolve(__dir, '.cache');
mkdirSync(cacheDir, { recursive: true });
const cachePath = resolve(cacheDir, `${provider}.json`);

const sigs = tools
  .map(t => ({
    name: t.name,
    schemaHash: createHash('sha256').update(JSON.stringify(t.inputSchema || {})).digest('hex').slice(0, 12),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
const hash = createHash('sha256').update(JSON.stringify(sigs)).digest('hex').slice(0, 12);

let drift = '(first run — caching)';
if (existsSync(cachePath)) {
  const prev = JSON.parse(readFileSync(cachePath, 'utf-8'));
  if (prev.hash === hash) {
    drift = 'no drift';
  } else {
    const prevNames = new Set(prev.tools.map(t => t.name));
    const curNames = new Set(sigs.map(t => t.name));
    const added = [...curNames].filter(n => !prevNames.has(n));
    const removed = [...prevNames].filter(n => !curNames.has(n));
    const schemaChanged = sigs
      .filter(t => {
        const p = prev.tools.find(x => x.name === t.name);
        return p && p.schemaHash !== t.schemaHash;
      })
      .map(t => t.name);
    drift = `DRIFT detected — added: [${added.join(', ') || 'none'}], removed: [${removed.join(', ') || 'none'}], schema changed: [${schemaChanged.join(', ') || 'none'}]`;
  }
}
writeFileSync(
  cachePath,
  JSON.stringify({ hash, tools: sigs, lastRun: new Date().toISOString() }, null, 2)
);

// 4. Report.
console.log(`provider:       ${provider}`);
console.log(`connection:     ${conn.id} (${conn.status})`);
console.log(`tools:          ${tools.length}`);
console.log(`signature hash: ${hash}`);
console.log(`drift:          ${drift}`);
console.log(`PASS`);
