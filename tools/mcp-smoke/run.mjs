#!/usr/bin/env node
/**
 * Layer 2 MCP smoke runner.
 *
 * Tier 2 (always): for one umbrella, calls mcp-gateway's `discover`
 * action via the authenticated user's JWT, hashes the resulting tool
 * list + input schemas, compares to .cache/<provider>.json from the
 * last run, reports drift.
 *
 * Tier 3 (when tools/mcp-smoke/providers/<slug>.json exists): also
 * calls one introspective tool from the config with empty/known-safe
 * input and asserts non-error response. Covers the "agent's tool
 * call actually returns valid data" failure mode.
 *
 * Auth — set ONE of:
 *   SUPABASE_USER_JWT                            direct (paste access_token from nice-auth localStorage)
 *   SUPABASE_USER_EMAIL + SUPABASE_USER_PASSWORD password sign-in each run (preferred for CI)
 *   SUPABASE_REFRESH_TOKEN                       exchanged for a fresh JWT (warning: Supabase rotates RTs, the second run with the same stored token fails)
 *
 * Usage:
 *   node tools/mcp-smoke/run.mjs hubspot
 *   node tools/mcp-smoke/run.mjs --all      # all connected providers (for CI)
 *
 * Exit codes: 0 pass, 1 functional failure, 2 misuse / missing args.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const SUPABASE_URL = 'https://zacllshbgmnwsmliteqx.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphY2xsc2hiZ21ud3NtbGl0ZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyOTAwOTcsImV4cCI6MjA4OTg2NjA5N30.JzkhFbUMUVByEz1m6j2R4D8bXWMhPO2F0YxIqxYGq28';

const __dir = dirname(fileURLToPath(import.meta.url));
const cacheDir = resolve(__dir, '.cache');
const providersDir = resolve(__dir, 'providers');

// ── Auth ───────────────────────────────────────────────────────────
async function getJwt() {
  if (process.env.SUPABASE_USER_JWT) return process.env.SUPABASE_USER_JWT;

  // Preferred for CI: email + password. Fresh sign-in each run, no
  // token rotation gotcha. Same security profile as a stored refresh
  // token (both are full-account credentials).
  if (process.env.SUPABASE_USER_EMAIL && process.env.SUPABASE_USER_PASSWORD) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.SUPABASE_USER_EMAIL,
        password: process.env.SUPABASE_USER_PASSWORD,
      }),
    });
    if (!res.ok) {
      console.error(`password sign-in ${res.status}:`, await res.text());
      process.exit(1);
    }
    return (await res.json()).access_token;
  }

  // Refresh-token path: convenient for local dev but Supabase rotates
  // tokens on each exchange (10s reuse window) — the second run with
  // the same stored token will fail with refresh_token_not_found.
  if (process.env.SUPABASE_REFRESH_TOKEN) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: process.env.SUPABASE_REFRESH_TOKEN }),
    });
    if (!res.ok) {
      console.error(`refresh-token exchange ${res.status}:`, await res.text());
      process.exit(1);
    }
    return (await res.json()).access_token;
  }

  console.error('error: set SUPABASE_USER_JWT, SUPABASE_USER_EMAIL + SUPABASE_USER_PASSWORD, or SUPABASE_REFRESH_TOKEN (see README)');
  process.exit(2);
}

const arg = process.argv[2];
if (!arg) {
  console.error('usage: node tools/mcp-smoke/run.mjs <provider> | --all');
  process.exit(2);
}

const jwt = await getJwt();
const headers = {
  Authorization: `Bearer ${jwt}`,
  apikey: ANON_KEY,
  'Content-Type': 'application/json',
};

// ── Gateway calls ──────────────────────────────────────────────────
async function listConnections() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/mcp_connections?status=eq.connected&catalog_id=not.is.null&select=id,catalog_id,status`,
    { headers }
  );
  if (!res.ok) throw new Error(`mcp_connections query ${res.status}: ${await res.text()}`);
  return res.json();
}

async function discover(connectionId) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/mcp-gateway`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'discover', connectionId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) {
    throw new Error(`discover ${res.status}: ${body?.error || JSON.stringify(body)}`);
  }
  return Array.isArray(body?.tools) ? body.tools : [];
}

async function invoke(connectionId, tool, input) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/mcp-gateway`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'invoke', connectionId, tool, input }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) {
    throw new Error(`invoke ${tool} ${res.status}: ${body?.error || JSON.stringify(body)}`);
  }
  return body?.result ?? body;
}

// ── Drift + tier 3 ─────────────────────────────────────────────────
function hashSigs(tools) {
  const sigs = tools
    .map(t => ({
      name: t.name,
      schemaHash: createHash('sha256').update(JSON.stringify(t.inputSchema || {})).digest('hex').slice(0, 12),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const hash = createHash('sha256').update(JSON.stringify(sigs)).digest('hex').slice(0, 12);
  return { sigs, hash };
}

function diffDrift(provider, sigs, hash) {
  mkdirSync(cacheDir, { recursive: true });
  const cachePath = resolve(cacheDir, `${provider}.json`);
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
      drift = `DRIFT — added: [${added.join(', ') || 'none'}], removed: [${removed.join(', ') || 'none'}], schema changed: [${schemaChanged.join(', ') || 'none'}]`;
    }
  }
  writeFileSync(cachePath, JSON.stringify({ hash, tools: sigs, lastRun: new Date().toISOString() }, null, 2));
  return drift;
}

function loadTier3Config(provider) {
  const path = resolve(providersDir, `${provider}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

// ── Per-umbrella smoke ─────────────────────────────────────────────
async function smokeOne(connection) {
  const { catalog_id, id } = connection;
  const notes = [];
  let failed = false;

  const tools = await discover(id);
  if (tools.length === 0) {
    return { catalog_id, ok: false, notes: ['zero tools returned'] };
  }
  const { sigs, hash } = hashSigs(tools);
  const drift = diffDrift(catalog_id, sigs, hash);
  notes.push(`${tools.length} tools, hash ${hash}, drift: ${drift}`);

  const cfg = loadTier3Config(catalog_id);
  if (!cfg) {
    notes.push(`tier 3: skipped (no providers/${catalog_id}.json)`);
  } else {
    try {
      await invoke(id, cfg.tool, cfg.input || {});
      notes.push(`tier 3: ${cfg.tool} ok`);
    } catch (e) {
      failed = true;
      notes.push(`tier 3: ${cfg.tool} FAILED — ${e.message}`);
    }
  }
  return { catalog_id, ok: !failed, notes };
}

// ── Main ───────────────────────────────────────────────────────────
const conns = await listConnections();
if (conns.length === 0) {
  console.error('no connected mcp_connections found for this user');
  process.exit(1);
}

let targets;
if (arg === '--all') {
  targets = conns;
} else {
  const match = conns.find(c => c.catalog_id === arg);
  if (!match) {
    console.error(`catalog_id="${arg}" not in connected mcp_connections`);
    console.error(`available: ${conns.map(c => c.catalog_id).join(', ')}`);
    process.exit(1);
  }
  targets = [match];
}

let anyFailed = false;
for (const conn of targets) {
  process.stdout.write(`${conn.catalog_id.padEnd(20)} ... `);
  try {
    const r = await smokeOne(conn);
    if (!r.ok) anyFailed = true;
    console.log(r.ok ? 'PASS' : 'FAIL');
    for (const n of r.notes) console.log(`  ${n}`);
  } catch (e) {
    anyFailed = true;
    console.log('FAIL');
    console.log(`  ${e.message}`);
  }
}

console.log('');
console.log(anyFailed ? 'OVERALL: FAIL' : 'OVERALL: PASS');
process.exit(anyFailed ? 1 : 0);
