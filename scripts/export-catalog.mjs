#!/usr/bin/env node
/**
 * export-catalog.mjs
 *
 * Exports the Supabase blueprint catalog to committed JSON seed files —
 * the insurance copy + the editable template library (see seed/README.md).
 *
 * Reads `scope='catalog'` blueprints and writes them to seed/catalog/,
 * split by `kind` so the wipe boundary is visible in the repo tree:
 *   capability-agents.json  — MCP-wired umbrella agents (load-bearing — KEEP)
 *   character-agents.json   — fictional persona agents (disposable layer)
 *   spaceships.json         — fictional ships (disposable layer)
 *
 * Only content columns are exported. Runtime/derived columns (creator_id,
 * rating_avg, activation_count, search_vector, created_at, updated_at) are
 * dropped so the JSON round-trips cleanly as a re-seedable template.
 *
 * Usage:
 *   node scripts/export-catalog.mjs                 # export scope=catalog
 *   node scripts/export-catalog.mjs --scope all     # also community + system
 *   node scripts/export-catalog.mjs --out /tmp/x    # custom output dir
 *
 * Read-only — this script never writes to Supabase. Uses the anon key;
 * RLS allows reading catalog blueprints (same access as blueprint-search).
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ─── Config ──────────────────────────────────────────────────────── */

const SUPABASE_URL = 'https://zacllshbgmnwsmliteqx.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphY2xsc2hiZ21ud3NtbGl0ZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyOTAwOTcsImV4cCI6MjA4OTg2NjA5N30.JzkhFbUMUVByEz1m6j2R4D8bXWMhPO2F0YxIqxYGq28';

// Content columns only — see header note on dropped runtime/derived columns.
const COLUMNS =
  'id,serial_key,type,kind,name,description,flavor,category,rarity,tags,config,stats,metadata,is_public';
const PAGE = 1000;

/* ─── CLI args ────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
const SCOPE = (() => {
  const i = args.indexOf('--scope');
  return i >= 0 ? args[i + 1] : 'catalog';
})();
const OUT = (() => {
  const i = args.indexOf('--out');
  return i >= 0 ? args[i + 1] : null;
})();

/* ─── Supabase fetch (paginated) ──────────────────────────────────── */

async function fetchAll() {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/blueprints`);
    url.searchParams.set('select', COLUMNS);
    if (SCOPE !== 'all') url.searchParams.set('scope', `eq.${SCOPE}`);
    url.searchParams.set('order', 'id.asc');
    url.searchParams.set('limit', String(PAGE));
    url.searchParams.set('offset', String(offset));

    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) throw new Error(`Supabase fetch ${res.status}: ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

/* ─── Bucket by kind ──────────────────────────────────────────────── */

function bucket(rows) {
  const out = { 'capability-agents': [], 'character-agents': [], spaceships: [] };
  for (const r of rows) {
    if (r.kind === 'capability') out['capability-agents'].push(r);
    else if (r.kind === 'spaceship') out.spaceships.push(r);
    else out['character-agents'].push(r); // kind='character' or legacy null
  }
  return out;
}

/* ─── Main ────────────────────────────────────────────────────────── */

async function main() {
  console.error(`→ Fetching scope=${SCOPE} blueprints from Supabase...`);
  const rows = await fetchAll();
  console.error(`  ${rows.length} rows.`);

  const buckets = bucket(rows);
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const outDir = OUT || resolve(__dirname, '..', 'seed', 'catalog');
  await mkdir(outDir, { recursive: true });

  for (const [name, list] of Object.entries(buckets)) {
    list.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const path = resolve(outDir, `${name}.json`);
    await writeFile(path, JSON.stringify(list, null, 2) + '\n', 'utf8');
    console.error(`✓ ${path} — ${list.length}`);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
