#!/usr/bin/env node
/**
 * seed-crew-roles.mjs
 *
 * Generates `config.crew_roles` for every catalog spaceship blueprint that
 * doesn't already have one. CrewMatcher (app/js/lib/crew-matcher.js) reads
 * this spec at activation time so each new ship gets a categorically
 * appropriate crew instead of the same alphabetical-A agents every time.
 *
 * Pipeline:
 *   1. Pull ships from Supabase (anon key, RLS allows reading catalog).
 *   2. Skip ships that already have crew_overrides (the 8 flagships from
 *      PR #309 — overrides win, roles are unnecessary).
 *   3. For each ship, ask Claude for an N-token role list drawn from a
 *      fixed vocabulary that maps cleanly to the catalog's agent
 *      role/category values (so scoreMatch hits 90-100, not 0).
 *   4. Validate every output; on failure use a deterministic per-category
 *      fallback so we always have something usable.
 *   5. Emit one SQL migration: UPDATE blueprints SET config = jsonb_set(...)
 *
 * Why a bounded vocabulary instead of "Head Chef" / "Sommelier":
 *   The matcher only scores 90+ on exact role/category matches. Specific
 *   tokens like "Head Chef" hit score=0 → pickBestUnused → every ship pulls
 *   the same highest-rarity unused agent. Bounded vocabulary that mirrors
 *   the catalog's own role/category strings keeps the matcher in the
 *   high-score path.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/seed-crew-roles.mjs           # API mode
 *   node scripts/seed-crew-roles.mjs --from-file roles.json                  # offline mode
 *   node scripts/seed-crew-roles.mjs --dry-run                               # no file write
 *   node scripts/seed-crew-roles.mjs --limit 8                               # sample
 *   node scripts/seed-crew-roles.mjs --concurrency 4                         # parallelism
 *   node scripts/seed-crew-roles.mjs --out /tmp/preview.sql                  # custom path
 *
 * --from-file expects JSON shape: [{ "id": "ship-X", "roles": ["ops",...] }]
 * Useful when generating roles outside this script (e.g. inline in a
 * Claude Code session) but you still want the SQL emission + validation.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ─── Config ──────────────────────────────────────────────────────── */

const SUPABASE_URL = 'https://zacllshbgmnwsmliteqx.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphY2xsc2hiZ21ud3NtbGl0ZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyOTAwOTcsImV4cCI6MjA4OTg2NjA5N30.JzkhFbUMUVByEz1m6j2R4D8bXWMhPO2F0YxIqxYGq28';

const ANTHROPIC_MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// Role tokens that hit scoreMatch=90+ in CrewMatcher. Pulled from agent
// catalog vocabulary on 2026-04-27 (every token here maps to agents with
// matching config.role or category; counts vary 5-266).
const VOCAB = [
  'ops', 'engineering', 'analytics', 'research',
  'marketing', 'content', 'support', 'sales',
  'legal', 'operations', 'finance', 'security',
  'automation', 'hr', 'design',
];
const VOCAB_SET = new Set(VOCAB);

// Deterministic fallback when the API fails or returns invalid JSON.
// Keyed by ship.category. Each value is a 6-token base; we pad/truncate
// to the ship's slot count by repeating the first tokens.
const CATEGORY_FALLBACK = {
  Ops:          ['ops', 'ops', 'engineering', 'support', 'marketing', 'operations'],
  Engineering:  ['engineering', 'engineering', 'engineering', 'ops', 'design', 'support'],
  Hospitality:  ['ops', 'support', 'marketing', 'content', 'sales', 'operations'],
  Content:      ['content', 'content', 'marketing', 'design', 'ops', 'support'],
  Retail:       ['sales', 'marketing', 'support', 'ops', 'content', 'operations'],
  Professional: ['ops', 'legal', 'finance', 'operations', 'support', 'marketing'],
  Analytics:    ['analytics', 'analytics', 'engineering', 'research', 'ops', 'support'],
  Marketing:    ['marketing', 'marketing', 'content', 'design', 'ops', 'sales'],
  Automation:   ['automation', 'engineering', 'ops', 'operations', 'support', 'analytics'],
  Sales:        ['sales', 'sales', 'marketing', 'support', 'ops', 'operations'],
  Research:     ['research', 'research', 'analytics', 'engineering', 'ops', 'content'],
  Legal:        ['legal', 'legal', 'ops', 'research', 'operations', 'support'],
  Support:      ['support', 'support', 'ops', 'content', 'operations', 'marketing'],
  'Sci-Fi':     ['ops', 'engineering', 'security', 'operations', 'support', 'analytics'],
};
const FALLBACK_DEFAULT = ['ops', 'engineering', 'support', 'operations', 'marketing', 'content'];

const SYSTEM_PROMPT = `You are designing crew rosters for spaceship blueprints in a workplace simulation game. Each "ship" represents a business or team archetype. You receive a ship's name, category, slot count, and description, and you output a JSON array of role tokens — exactly one per crew slot — that produces a coherent, purpose-fit crew.

ALLOWED ROLES (you must use only these tokens, lowercase, exactly as written):
${VOCAB.join(', ')}

Rules:
- Output ONLY a JSON array of N strings. No prose, no markdown fence, no commentary.
- N MUST equal the requested slot count.
- Every string MUST be from ALLOWED ROLES exactly. No inventing tokens.
- Repeat tokens as needed — a six-slot engineering shop is fine as ["engineering","engineering","engineering","ops","design","support"].
- Distribute roles to fit the ship's actual purpose, not just its category. A law firm leans legal+ops+research. A retail store leans sales+marketing+support+ops. A research lab leans research+analytics+engineering. A creative studio leans content+design+marketing.
- Don't blindly fill all slots with the ship's category. A 12-slot ship with all "engineering" is worse than a balanced mix.
- Aim for variety across slots when slot count >= 6. Single-token rosters are fine for slot counts < 4.`;

/* ─── CLI args ────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT = (() => {
  const i = args.indexOf('--limit');
  return i >= 0 ? parseInt(args[i + 1], 10) : null;
})();
const CONCURRENCY = (() => {
  const i = args.indexOf('--concurrency');
  return i >= 0 ? parseInt(args[i + 1], 10) : 5;
})();
const OUT_PATH = (() => {
  const i = args.indexOf('--out');
  return i >= 0 ? args[i + 1] : null;
})();
const FROM_FILE = (() => {
  const i = args.indexOf('--from-file');
  return i >= 0 ? args[i + 1] : null;
})();

/* ─── Supabase fetch ──────────────────────────────────────────────── */

async function fetchShips() {
  const url = new URL(`${SUPABASE_URL}/rest/v1/blueprints`);
  url.searchParams.set('select', 'id,name,category,rarity,stats,description,config');
  url.searchParams.set('type', 'eq.spaceship');
  url.searchParams.set('scope', 'eq.catalog');
  url.searchParams.set('order', 'name.asc');

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Supabase fetch ${res.status}: ${await res.text()}`);
  const all = await res.json();

  // Skip ships with existing crew_overrides (PR #309 flagships)
  const filtered = all.filter((s) => !(s.config && s.config.crew_overrides));
  return filtered.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category || 'Ops',
    rarity: s.rarity || 'Common',
    slots: (s.stats && Number(s.stats.slots)) || 6,
    description: (s.description || '').trim(),
  }));
}

/* ─── Anthropic call ──────────────────────────────────────────────── */

async function callClaude(ship, attempt = 1) {
  const userMessage = [
    `Ship: ${ship.name}`,
    `Category: ${ship.category}`,
    `Slots: ${ship.slots}`,
    `Description: ${ship.description || '(none)'}`,
    '',
    `Output the JSON array of ${ship.slots} role tokens.`,
  ].join('\n');

  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: 256,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userMessage }],
  };

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429 || res.status === 529) {
    if (attempt > 4) throw new Error(`rate limited (${res.status}) after ${attempt} attempts`);
    const wait = 1000 * 2 ** attempt;
    await new Promise((r) => setTimeout(r, wait));
    return callClaude(ship, attempt + 1);
  }
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);

  const json = await res.json();
  const text = json?.content?.[0]?.text || '';
  return text.trim();
}

/* ─── Validation + fallback ───────────────────────────────────────── */

function parseRoles(text, slots) {
  // Strip optional ```json fences just in case
  const cleaned = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
  let arr;
  try {
    arr = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!Array.isArray(arr)) return null;
  if (arr.length !== slots) return null;
  const lowered = arr.map((x) => (typeof x === 'string' ? x.toLowerCase().trim() : ''));
  if (lowered.some((x) => !VOCAB_SET.has(x))) return null;
  return lowered;
}

function fallbackRoles(ship) {
  const base = CATEGORY_FALLBACK[ship.category] || FALLBACK_DEFAULT;
  const out = [];
  for (let i = 0; i < ship.slots; i++) out.push(base[i % base.length]);
  return out;
}

/* ─── SQL emit ────────────────────────────────────────────────────── */

function escapeSqlIdent(s) {
  return s.replace(/'/g, "''");
}

function emitSql(rows) {
  const header = `-- Seed config.crew_roles for ${rows.length} catalog spaceships missing one.
-- Generated by scripts/seed-crew-roles.mjs on ${new Date().toISOString()}.
--
-- The CrewMatcher (app/js/lib/crew-matcher.js, shipped #308) reads
-- config.crew_roles at ship activation. Tokens come from a bounded
-- vocabulary chosen so scoreMatch hits 90-100 against the catalog's
-- agent role/category values. Ships with crew_overrides (the 8
-- flagships from PR #309) are skipped — overrides take precedence.
--
-- jsonb_set with COALESCE preserves any other config keys that may be
-- present (none today, but defensively).

`;

  const body = rows
    .map((r) => {
      const json = JSON.stringify(r.roles);
      const note = r.source === 'fallback' ? ' -- fallback' : '';
      return `UPDATE blueprints
SET config = jsonb_set(COALESCE(config, '{}'::jsonb), '{crew_roles}', $$${json}$$::jsonb)
WHERE id = '${escapeSqlIdent(r.id)}' AND type = 'spaceship' AND scope = 'catalog';${note}`;
    })
    .join('\n\n');

  return header + body + '\n';
}

/* ─── Concurrency helper ──────────────────────────────────────────── */

async function processInBatches(items, fn, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  let done = 0;
  const total = items.length;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
      done++;
      if (done % 10 === 0 || done === total) {
        process.stderr.write(`  [${done}/${total}]\n`);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

/* ─── Main ────────────────────────────────────────────────────────── */

async function loadFromFile(path, ships) {
  const raw = await readFile(path, 'utf8');
  const entries = JSON.parse(raw);
  if (!Array.isArray(entries)) throw new Error(`--from-file expected JSON array, got ${typeof entries}`);
  const byId = new Map(ships.map((s) => [s.id, s]));
  const results = [];
  let invalid = 0;
  for (const entry of entries) {
    const ship = byId.get(entry.id);
    if (!ship) {
      process.stderr.write(`  WARN unknown ship id ${entry.id} in input file, skipping\n`);
      continue;
    }
    const roles = (entry.roles || []).map((x) => String(x).toLowerCase().trim());
    const valid = roles.length === ship.slots && roles.every((r) => VOCAB_SET.has(r));
    if (!valid) {
      invalid++;
      process.stderr.write(`  WARN ${ship.id} (${ship.name}): input invalid (slots=${ship.slots} got=${roles.length}), using fallback. roles=${JSON.stringify(roles)}\n`);
      results.push({ id: ship.id, name: ship.name, category: ship.category, slots: ship.slots, roles: fallbackRoles(ship), source: 'fallback' });
    } else {
      results.push({ id: ship.id, name: ship.name, category: ship.category, slots: ship.slots, roles, source: 'file' });
    }
  }
  // Fill ships missing from input with fallback
  const seen = new Set(results.map((r) => r.id));
  for (const ship of ships) {
    if (!seen.has(ship.id)) {
      process.stderr.write(`  WARN ${ship.id} (${ship.name}): not in input file, using fallback\n`);
      results.push({ id: ship.id, name: ship.name, category: ship.category, slots: ship.slots, roles: fallbackRoles(ship), source: 'fallback' });
    }
  }
  if (invalid > 0) console.error(`  ${invalid} entries failed validation and used fallback.`);
  return results;
}

async function main() {
  console.error('→ Fetching ships from Supabase...');
  let ships = await fetchShips();
  console.error(`  Found ${ships.length} catalog ships needing crew_roles.`);
  if (LIMIT) {
    ships = ships.slice(0, LIMIT);
    console.error(`  --limit ${LIMIT} → processing ${ships.length}.`);
  }

  let results;
  if (FROM_FILE) {
    console.error(`→ Loading roles from ${FROM_FILE}...`);
    results = await loadFromFile(FROM_FILE, ships);
  } else {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ERROR: ANTHROPIC_API_KEY env var is required (or pass --from-file).');
      process.exit(1);
    }
    console.error(`→ Generating roles (concurrency=${CONCURRENCY}, model=${ANTHROPIC_MODEL})...`);
    const t0 = Date.now();
    results = await processInBatches(
      ships,
      async (ship) => {
        try {
          const text = await callClaude(ship);
          const roles = parseRoles(text, ship.slots);
          if (roles) return { id: ship.id, name: ship.name, category: ship.category, slots: ship.slots, roles, source: 'llm' };
          process.stderr.write(`  WARN ${ship.id} (${ship.name}): invalid output, using fallback. raw=${text.slice(0, 80)}\n`);
          return { id: ship.id, name: ship.name, category: ship.category, slots: ship.slots, roles: fallbackRoles(ship), source: 'fallback' };
        } catch (err) {
          process.stderr.write(`  WARN ${ship.id} (${ship.name}): ${err.message}, using fallback.\n`);
          return { id: ship.id, name: ship.name, category: ship.category, slots: ship.slots, roles: fallbackRoles(ship), source: 'fallback' };
        }
      },
      CONCURRENCY,
    );
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.error(`  Done in ${elapsed}s.`);
  }

  const llmCount = results.filter((r) => r.source === 'llm').length;
  const fileCount = results.filter((r) => r.source === 'file').length;
  const fallbackCount = results.filter((r) => r.source === 'fallback').length;
  console.error(`  Sources: ${llmCount} api / ${fileCount} file / ${fallbackCount} fallback.`);

  const sql = emitSql(results);

  if (DRY_RUN) {
    console.log('--- DRY RUN: SQL preview (first 30 ships) ---');
    console.log(sql.split('\n\n').slice(0, 31).join('\n\n'));
    console.log('\n--- Sample outputs ---');
    for (const r of results.slice(0, 12)) {
      console.log(`  ${r.id.padEnd(12)} ${r.name.slice(0, 40).padEnd(42)} [${r.source}] ${JSON.stringify(r.roles)}`);
    }
    return;
  }

  const ts = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(__dirname, '..');
  const outPath = OUT_PATH || resolve(repoRoot, 'supabase', 'migrations', `${ts}_seed_crew_roles.sql`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, sql, 'utf8');
  console.error(`✓ Wrote ${outPath}`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
