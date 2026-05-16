/**
 * Layer 1 — schema validation for ship-seed migrations.
 *
 * Catches the class of failure where a new ship blueprint references
 * an agent_blueprint slug that doesn't exist, or assigns a role_type
 * that isn't a real `roles.slug`. Both fail at `npx supabase db push`
 * time via the existing RAISE EXCEPTION / FK constraints, but only
 * AFTER the PR has been merged — this check pulls the failure
 * forward into CI so a typo'd slug blocks the PR instead of breaking
 * a future deploy.
 *
 * Sources of truth (derived, not hardcoded):
 *   - Valid agent slugs: every entry in seed/catalog/capability-agents.json
 *     (with the bp-agent- prefix stripped, matching the Phase D5
 *     `REPLACE(b.id, 'bp-agent-', '')` rule).
 *   - Valid role slugs: every row inserted into public.roles across
 *     all migration files.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dir, '../../supabase/migrations');
const CATALOG_JSON = resolve(__dir, '../../seed/catalog/capability-agents.json');

function listMigrations() {
  return readdirSync(MIGRATIONS_DIR).filter(n => n.endsWith('.sql')).sort();
}

function readMigration(name) {
  return readFileSync(resolve(MIGRATIONS_DIR, name), 'utf-8');
}

function deriveValidAgentSlugs() {
  const json = JSON.parse(readFileSync(CATALOG_JSON, 'utf-8'));
  return new Set(json.map(b => b.id.replace(/^bp-agent-/, '')));
}

function deriveValidRoleSlugs() {
  const slugs = new Set();
  for (const name of listMigrations()) {
    const sql = readMigration(name);
    const blocks = sql.match(/INSERT\s+INTO\s+public\.roles\s*\([^)]+\)\s*VALUES([\s\S]+?);/gi) || [];
    for (const block of blocks) {
      const tuples = block.match(/\(\s*'[a-z_]+'/g) || [];
      for (const t of tuples) {
        const m = t.match(/'([a-z_]+)'/);
        if (m) slugs.add(m[1]);
      }
    }
  }
  return slugs;
}

function parseAgentSlugLookups(sql) {
  const re = /SELECT\s+id\s+INTO\s+\w+\s+FROM\s+public\.agent_blueprints\s+WHERE\s+slug\s*=\s*'([^']+)'/gi;
  const out = [];
  let m;
  while ((m = re.exec(sql)) !== null) out.push(m[1]);
  return out;
}

function parseSlotRoleTypes(sql) {
  const insertRe = /INSERT\s+INTO\s+public\.ship_slots\s*\(([^)]+)\)\s*VALUES([\s\S]*?);/gi;
  const out = [];
  let m;
  while ((m = insertRe.exec(sql)) !== null) {
    const cols = m[1].split(',').map(c => c.trim());
    const roleIdx = cols.indexOf('role_type');
    if (roleIdx < 0) continue;
    const tuples = m[2].match(/\([^)]*\)/g) || [];
    for (const t of tuples) {
      const cells = t.slice(1, -1).split(',').map(c => c.trim());
      const val = cells[roleIdx];
      if (val) out.push(val.replace(/^'|'$/g, ''));
    }
  }
  return out;
}

describe('Seed migration validation', () => {
  const validAgentSlugs = deriveValidAgentSlugs();
  const validRoleSlugs = deriveValidRoleSlugs();
  const targets = listMigrations().filter(n => readMigration(n).includes('INSERT INTO public.ship_slots'));

  it('derives a non-empty list of valid agent_blueprint slugs', () => {
    expect(validAgentSlugs.size).toBeGreaterThanOrEqual(20);
  });

  it('derives a non-empty list of valid role slugs', () => {
    expect(validRoleSlugs.size).toBeGreaterThanOrEqual(15);
  });

  it('finds at least one ship-slot-writing migration to validate', () => {
    expect(targets.length).toBeGreaterThan(0);
  });

  for (const file of targets) {
    describe(file, () => {
      const sql = readMigration(file);
      const slugs = parseAgentSlugLookups(sql);
      const roles = parseSlotRoleTypes(sql);

      it(`every agent_blueprint slug it looks up is in the catalog (${slugs.length} lookups)`, () => {
        const unknown = [...new Set(slugs)].filter(s => !validAgentSlugs.has(s));
        expect(unknown, `Unknown agent_blueprint slugs in ${file}: ${unknown.join(', ')}`).toEqual([]);
      });

      it(`every role_type in ship_slots inserts is a real role slug (${roles.length} slot rows)`, () => {
        const unknown = [...new Set(roles)].filter(r => !validRoleSlugs.has(r));
        expect(unknown, `Unknown role slugs in ${file}: ${unknown.join(', ')}`).toEqual([]);
      });
    });
  }
});
