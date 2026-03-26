/* ═══════════════════════════════════════════════════════════════════
   NICE — Supabase Client Wrapper
   Auth, database CRUD, realtime subscriptions.
   Includes retry logic, offline detection, and null-safe client access.
═══════════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} SBModule
 * @property {function(): object|null} client — Get or lazily create the Supabase client instance
 * @property {function(): boolean} isReady — Returns true if Supabase client is available
 * @property {function(): boolean} isOnline — Returns true if browser reports online status
 * @property {Object} auth — Auth helpers: signUp, signIn, signOut, getUser, getSession, onAuthChange
 * @property {function(string): {list, get, create, update, remove}} db — Returns CRUD helpers for a table
 * @property {Object} realtime — Realtime helpers: subscribe(table, callback), unsubscribe(channel)
 * @property {Object} functions — Edge Function helpers: invoke(name, body), invokeStream(name, body)
 */

const SB = (() => {
  const URL  = 'https://zacllshbgmnwsmliteqx.supabase.co';
  const KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphY2xsc2hiZ21ud3NtbGl0ZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyOTAwOTcsImV4cCI6MjA4OTg2NjA5N30.JzkhFbUMUVByEz1m6j2R4D8bXWMhPO2F0YxIqxYGq28';

  let _client = null;
  let _online = navigator.onLine ?? true;

  // Track online/offline state
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { _online = true; });
    window.addEventListener('offline', () => { _online = false; });
  }

  function client() {
    if (!_client && typeof supabase !== 'undefined') {
      _client = supabase.createClient(URL, KEY);
    }
    return _client;
  }

  /** Retry a function up to `n` times with exponential backoff */
  async function _retry(fn, retries = 2, delay = 500) {
    for (let i = 0; i <= retries; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i === retries) throw err;
        // Don't retry if offline
        if (!_online) throw err;
        await new Promise(r => setTimeout(r, delay * Math.pow(2, i)));
      }
    }
  }

  /** Check if client is available */
  function isReady() {
    return !!client();
  }

  /** Check if browser is online */
  function isOnline() {
    return _online;
  }

  /* ── Auth ── */
  const auth = {
    async signUp(email, password, displayName) {
      const c = client();
      if (!c) throw new Error('Supabase not available');
      const { data, error } = await c.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName || email.split('@')[0] } }
      });
      if (error) throw error;
      return data;
    },

    async signIn(email, password) {
      const c = client();
      if (!c) throw new Error('Supabase not available');
      const { data, error } = await c.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },

    async signOut() {
      const c = client();
      if (!c) throw new Error('Supabase not available');
      const { error } = await c.auth.signOut();
      if (error) throw error;
    },

    async getUser() {
      const c = client();
      if (!c) return null;
      try {
        const { data: { user } } = await c.auth.getUser();
        return user;
      } catch {
        return null;
      }
    },

    async getSession() {
      const c = client();
      if (!c) return null;
      try {
        const { data: { session } } = await c.auth.getSession();
        return session;
      } catch {
        return null;
      }
    },

    onAuthChange(callback) {
      const c = client();
      if (!c) return { data: { subscription: { unsubscribe: () => {} } } };
      return c.auth.onAuthStateChange((event, session) => {
        callback(session?.user || null, session, event);
      });
    }
  };

  /* ── Database helpers (with retry + null-safety) ── */
  function db(table) {
    return {
      async list(filters = {}) {
        const c = client();
        if (!c) return [];
        return _retry(async () => {
          let q = c.from(table).select('*');
          // Reserved filter keys
          const reserved = new Set(['orderBy', 'asc', 'limit']);
          // Map userId → user_id for convenience, then apply all other filters as eq()
          const mapped = { ...filters };
          if (mapped.userId) { mapped.user_id = mapped.userId; delete mapped.userId; }
          for (const [key, val] of Object.entries(mapped)) {
            if (reserved.has(key) || val === undefined || val === null) continue;
            q = q.eq(key, val);
          }
          if (filters.orderBy) q = q.order(filters.orderBy, { ascending: filters.asc ?? false });
          if (filters.limit) q = q.limit(filters.limit);
          const { data, error } = await q;
          if (error) throw error;
          return data || [];
        });
      },

      async get(id) {
        const c = client();
        if (!c) return null;
        return _retry(async () => {
          const { data, error } = await c.from(table).select('*').eq('id', id).single();
          if (error) throw error;
          return data;
        });
      },

      async create(row) {
        const c = client();
        if (!c) return null;
        return _retry(async () => {
          const { data, error } = await c.from(table).insert(row).select().single();
          if (error) throw error;
          return data;
        });
      },

      async update(id, changes) {
        const c = client();
        if (!c) return null;
        return _retry(async () => {
          const { data, error } = await c.from(table).update(changes).eq('id', id).select().single();
          if (error) throw error;
          return data;
        });
      },

      async remove(id) {
        const c = client();
        if (!c) return;
        return _retry(async () => {
          const { error } = await c.from(table).delete().eq('id', id);
          if (error) throw error;
        });
      }
    };
  }

  /* ── Realtime ── */
  const realtime = {
    subscribe(table, callback) {
      const c = client();
      if (!c) return null;
      return c
        .channel(`${table}-changes`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, payload => {
          callback(payload);
        })
        .subscribe();
    },

    unsubscribe(channel) {
      const c = client();
      if (c && channel) c.removeChannel(channel);
    }
  };

  /* ── Edge Functions ── */
  const functions = {
    async invoke(name, opts) {
      const c = client();
      if (!c) return { data: null, error: 'Supabase client not available' };
      try {
        const { data, error } = await c.functions.invoke(name, opts);
        if (error) return { data: null, error };
        return { data, error: null };
      } catch (err) {
        return { data: null, error: err.message || 'Edge function call failed' };
      }
    },

    /** Stream an Edge Function response. Returns a ReadableStream of SSE text chunks. */
    async invokeStream(name, body) {
      const c = client();
      if (!c) throw new Error('Supabase client not available');
      const session = (await c.auth.getSession())?.data?.session;
      const headers = {
        'Content-Type': 'application/json',
        'apikey': KEY,
      };
      if (session?.access_token) headers['Authorization'] = 'Bearer ' + session.access_token;
      const res = await fetch(URL + '/functions/v1/' + name, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Edge function error: ' + res.status);
      return res.body;
    }
  };

  return { get client() { return client(); }, auth, db, realtime, functions, isReady, isOnline };
})();
