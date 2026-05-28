/* NICE SPACESHIP — Supabase Lite (read-only) */
const SBLite = (() => {
  const URL = 'https://zacllshbgmnwsmliteqx.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphY2xsc2hiZ21ud3NtbGl0ZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyOTAwOTcsImV4cCI6MjA4OTg2NjA5N30.JzkhFbUMUVByEz1m6j2R4D8bXWMhPO2F0YxIqxYGq28';

  async function query(table, { select = '*', filters = [], order, limit, offset } = {}) {
    let url = `${URL}/rest/v1/${table}?select=${encodeURIComponent(select)}`;
    filters.forEach(f => { url += `&${f}`; });
    if (order) url += `&order=${order}`;
    if (limit) url += `&limit=${limit}`;
    if (offset) url += `&offset=${offset}`;
    try {
      const res = await fetch(url, {
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
      });
      if (!res.ok) return [];
      return await res.json();
    } catch { return []; }
  }

  async function count(table, filter) {
    let url = `${URL}/rest/v1/${table}?select=id&head=true`;
    if (filter) url += `&${filter}`;
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'count=exact' },
      });
      return parseInt(res.headers.get('content-range')?.split('/')[1] || '0', 10);
    } catch { return 0; }
  }

  // Translate a row from the new normalized catalog schema into the legacy
  // shape the marketing-site renderer (and CardRenderer) expects: synthesize
  // `type`, lift `stats` out of `card`, fall back to card-side serial_key/tags.
  // Mirrors `_translate*BlueprintRow` in app/js/lib/blueprints.js.
  function _translateBlueprint(row, type) {
    const card = row.card || {};
    return {
      id: row.id,
      name: row.name,
      type,
      category: row.category,
      rarity: row.rarity,
      description: row.description,
      flavor: row.flavor,
      serial_key: row.serial_key || card.serial_key || null,
      stats: card.stats || {},
      config: row.config || {},
      tags: (Array.isArray(row.tags) && row.tags.length) ? row.tags : (card.tags || []),
      activation_count: row.activation_count || 0,
    };
  }

  // Read both blueprint tables in parallel and return one merged array of
  // legacy-shape rows. Pass { type: 'agent' | 'spaceship' } to skip the other.
  // The legacy `public.blueprints` table was dropped 2026-05-24 (Phase D.7
  // of the catalog rebuild); this helper is the marketing site's drop-in
  // replacement for the old `SBLite.query('blueprints', ...)` call site.
  async function queryBlueprints({ select, order, limit, type } = {}) {
    // Column list must reference the new schema — `card` replaces `stats`,
    // `rating_avg` is gone. Callers that hand in a legacy select string get
    // sane defaults.
    const cols = select || 'id,name,category,rarity,description,flavor,serial_key,card,config,tags,activation_count';
    const opts = {};
    if (order) opts.order = order;
    if (limit) opts.limit = limit;
    const wantAgents = !type || type === 'agent';
    const wantShips  = !type || type === 'spaceship';
    const [agents, ships] = await Promise.all([
      wantAgents ? query('agent_blueprints',     { ...opts, select: cols }) : Promise.resolve([]),
      wantShips  ? query('spaceship_blueprints', { ...opts, select: cols }) : Promise.resolve([]),
    ]);
    return [
      ...(agents || []).map(r => _translateBlueprint(r, 'agent')),
      ...(ships  || []).map(r => _translateBlueprint(r, 'spaceship')),
    ];
  }

  return { query, count, queryBlueprints, URL, KEY };
})();
