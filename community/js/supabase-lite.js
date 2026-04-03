/* NICE SPACESHIP — Supabase Lite (read-only) */
const SBLite = (() => {
  const URL = 'https://zacllshbgmnwsmliteqx.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphY2xsc2hiZ21ud3NtbGl0ZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMxMTg2ODQsImV4cCI6MjA1ODY5NDY4NH0.JARB32YmVPeHxNYorJKHXGAXlMNb5vciNJFWHyP3pBA';

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

  return { query, count, URL, KEY };
})();
