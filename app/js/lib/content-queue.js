/* ═══════════════════════════════════════════════════════════════════
   NICE — Content Queue (Outbox)
   Draft & Approve system for agent-generated content.
   Agents create drafts → user reviews → approve/edit/reject → copy/export.
   Items are mission_runs rows with an approval_status (plus local-only
   drafts). A run waiting in review is approved through MissionRunner, so
   the Outbox, the Missions page and the crew view share one approval path.
═══════════════════════════════════════════════════════════════════ */

const ContentQueue = (() => {
  const _esc = Utils.esc;

  const TYPE_META = {
    social:  { icon: '📱', label: 'Social post', color: '#c084fc' },
    email:   { icon: '📧', label: 'Email',       color: '#60a5fa' },
    report:  { icon: '📊', label: 'Report',      color: '#34d399' },
    general: { icon: '📝', label: 'Content',     color: '#94a3b8' },
  };

  /* ══════════════════════════════════════════════════════════════
     Supported social platforms for the publish / schedule flow.
     The actual publishing happens server-side via social-mcp — this
     list just drives the client-side picker UI. Keep it in sync with
     the platforms the edge function recognizes (buffer routes to any
     destination channel on its account, the others go direct).
  ══════════════════════════════════════════════════════════════ */
  const PLATFORMS = [
    { id: 'buffer',    label: 'Buffer',           icon: '🟣', desc: 'Cross-post to all channels connected in Buffer' },
    { id: 'x',         label: 'X (Twitter)',      icon: '🐦', desc: 'Post directly to your X timeline' },
    { id: 'linkedin',  label: 'LinkedIn',         icon: '💼', desc: 'Post to your LinkedIn feed' },
    { id: 'instagram', label: 'Instagram',        icon: '📸', desc: 'Publish to your Instagram account' },
    { id: 'facebook',  label: 'Facebook',         icon: '📘', desc: 'Post to your Facebook page' },
  ];

  function getPlatforms() { return PLATFORMS.slice(); }
  function getPlatform(id) { return PLATFORMS.find(p => p.id === id) || null; }

  // Direct publish/schedule runs server-side via the social-mcp edge function,
  // which is not deployed yet. Until it ships (with the per-platform OAuth),
  // gate these paths so users get a clear "coming soon" instead of a live 404.
  // Flip to true when social-mcp lands. Approve / Edit / Copy / Export still work.
  const PUBLISHING_ENABLED = false;

  function _publishingComingSoon() {
    if (typeof Notify !== 'undefined') {
      Notify.send({
        title: 'Coming soon',
        message: 'Direct publishing and scheduling arrive with the social integrations. For now, use Export to download your approved content.',
        type: 'system',
      });
    }
    return { success: false, error: 'Publishing coming soon', comingSoon: true };
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  CRUD Operations                                               */
  /* ══════════════════════════════════════════════════════════════ */

  async function load(filter = {}) {
    const items = [];

    // Try Supabase first — direct query to get approval_status column
    if (typeof SB !== 'undefined' && SB.isReady() && SB.client) {
      try {
        const user = typeof State !== 'undefined' ? State.get('user') : null;
        if (user?.id) {
          const { data } = await SB.client
            .from('mission_runs')
            .select('id, title, agent_id, agent_name, result, content_type, approval_status, edited_content, reviewed_at, created_at, metadata, status, spaceship_id, mission_id, plan_snapshot')
            .eq('user_id', user.id)
            .not('approval_status', 'is', null);
          if (data) items.push(...data);
        }
      } catch (e) { console.warn('[ContentQueue] Supabase load error:', e); }
    }

    // Merge with localStorage fallback
    try {
      const local = JSON.parse(localStorage.getItem(Utils.KEYS.contentQueue) || '[]');
      local.forEach(item => {
        if (!items.find(i => i.id === item.id)) items.push(item);
      });
    } catch {}

    // A run the crew is still working on (resumed after a gate, or re-run)
    // keeps its old approval_status until it lands in review again.
    let filtered = items.filter(i => i.status !== 'running' && i.status !== 'queued');
    if (filter.type && filter.type !== 'all') {
      filtered = filtered.filter(i => i.content_type === filter.type);
    }
    if (filter.status && filter.status !== 'all') {
      filtered = filtered.filter(i => i.approval_status === filter.status);
    }

    // Sort: pending first, then by date desc
    filtered.sort((a, b) => {
      const order = { draft: 0, approved: 1, rejected: 2 };
      const ao = order[a.approval_status] ?? 0;
      const bo = order[b.approval_status] ?? 0;
      if (ao !== bo) return ao - bo;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    if (typeof State !== 'undefined') State.set('content-queue', filtered);
    return filtered;
  }

  async function createDraft(opts) {
    const draft = {
      id: opts.id || `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: opts.title || 'Untitled Draft',
      result: opts.content || '',
      content_type: opts.content_type || 'general',
      approval_status: 'draft',
      agent_name: opts.agent_name || 'Agent',
      created_at: new Date().toISOString(),
      metadata: opts.metadata || {},
    };

    // Save to Supabase — mission_runs requires spaceship_id under the new
    // ontology. Resolve from user's first active ship; skip the DB write
    // when no ship exists (localStorage fallback still persists the draft).
    if (typeof SB !== 'undefined' && SB.isReady()) {
      try {
        const user = typeof State !== 'undefined' ? State.get('user') : null;
        const spaceships = typeof State !== 'undefined' ? (State.get('spaceships') || []) : [];
        const spaceshipId = spaceships[0]?.id;
        if (user?.id && spaceshipId) {
          const { data } = await SB.db('mission_runs').create({
            user_id: user.id,
            spaceship_id: spaceshipId,
            title: draft.title,
            agent_name: draft.agent_name,
            result: draft.result,
            content_type: draft.content_type,
            approval_status: 'draft',
            status: 'completed',
            metadata: draft.metadata,
          });
          if (data?.id) draft.id = data.id;
        }
      } catch (e) { console.warn('[ContentQueue] Supabase create error:', e); }
    }

    // Save to localStorage
    _persistLocal(draft);

    // Update State
    if (typeof State !== 'undefined') {
      const existing = State.get('content-queue') || [];
      State.set('content-queue', [draft, ...existing]);
    }

    return draft;
  }

  // The queue item for a run paused in review, which MissionRunner owns.
  function _reviewRun(id) {
    if (typeof MissionRunner === 'undefined' || typeof State === 'undefined') return null;
    const item = (State.get('content-queue') || []).find(i => i.id === id);
    return item && item.status === 'review' ? item : null;
  }

  /** Approve an item. A run in review is approved through MissionRunner:
      a paused gate resumes the crew (the item leaves the queue until the run
      lands in review again) and anything else completes. Resolves
      { resumed }; throws if the approval could not be saved. */
  async function approve(id) {
    const run = _reviewRun(id);
    if (!run) {
      await _updateStatus(id, 'approved');
      return { resumed: false };
    }
    const out = await MissionRunner.approveRun(run);
    if (out.resumed) {
      _removeFromState(id);
    } else {
      if (!out.persisted) throw new Error('Could not save the approval. Try again.');
      _applyToState(id, { status: 'completed', approval_status: 'approved', reviewed_at: new Date().toISOString() });
    }
    return { resumed: !!out.resumed };
  }

  /** Reject an item. A run in review is rejected through MissionRunner so
      the agent learns from it. Throws if the rejection could not be saved. */
  async function reject(id) {
    const run = _reviewRun(id);
    if (!run) return _updateStatus(id, 'rejected');
    const out = await MissionRunner.rejectRun(run);
    if (!out.persisted) throw new Error('Could not save the rejection. Try again.');
    _applyToState(id, { status: 'failed', approval_status: 'rejected', reviewed_at: new Date().toISOString() });
  }

  /** Move an item to another day on the Outbox week view. */
  async function reschedule(id, scheduledFor) {
    const items = (typeof State !== 'undefined' ? State.get('content-queue') : null) || [];
    const item = items.find(i => i.id === id);
    if (!item) return;
    const metadata = Object.assign({}, item.metadata || {}, { scheduled_for: scheduledFor });
    if (typeof SB !== 'undefined' && SB.isReady()) {
      try { await SB.db('mission_runs').update(id, { metadata }); } catch {}
    }
    _updateLocal(id, { metadata });
    _applyToState(id, { metadata });
  }

  async function edit(id, newContent) {
    // Update Supabase
    if (typeof SB !== 'undefined' && SB.isReady()) {
      try {
        await SB.db('mission_runs').update(id, { edited_content: newContent });
      } catch {}
    }

    // Update local
    _updateLocal(id, { edited_content: newContent });

    // Update State
    if (typeof State !== 'undefined') {
      const items = State.get('content-queue') || [];
      const item = items.find(i => i.id === id);
      if (item) {
        item.edited_content = newContent;
        State.set('content-queue', [...items]);
      }
    }
  }

  async function copy(id) {
    const items = (typeof State !== 'undefined' ? State.get('content-queue') : null) || [];
    const item = items.find(i => i.id === id);
    if (!item) return;

    const content = item.edited_content || item.result || '';
    try {
      await navigator.clipboard.writeText(content);
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Copied', message: 'Content copied to clipboard', type: 'success' });
      }
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      if (typeof Notify !== 'undefined') {
        Notify.send({ title: 'Copied', message: 'Content copied to clipboard', type: 'success' });
      }
    }
  }

  async function publish(id, platform = 'buffer') {
    if (!PUBLISHING_ENABLED) return _publishingComingSoon();
    // Publish an approved item via social-mcp
    const items = (typeof State !== 'undefined' ? State.get('content-queue') : null) || [];
    const item = items.find(i => i.id === id);
    if (!item) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Not found', message: 'Content item not found', type: 'error' });
      return { success: false, error: 'Item not found' };
    }
    if (item.approval_status !== 'approved') {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Not approved', message: 'Approve this content before publishing', type: 'warning' });
      return { success: false, error: 'Item must be approved first' };
    }

    // Call social MCP via mcp-gateway
    if (typeof SB !== 'undefined' && SB.isReady()) {
      try {
        const sbUrl = SB._url || 'https://zacllshbgmnwsmliteqx.supabase.co';
        const session = await SB.auth().getSession();
        const token = session?.data?.session?.access_token;
        if (!token) {
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Auth required', message: 'Sign in to publish', type: 'error' });
          return { success: false, error: 'Not authenticated' };
        }

        const res = await fetch(sbUrl + '/functions/v1/social-mcp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/call',
            id: Date.now(),
            params: {
              name: 'social_publish_post',
              arguments: { post_id: id, platform },
            },
          }),
        });
        const data = await res.json();
        if (data.result) {
          const text = data.result.content?.[0]?.text || 'Published';
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Published', message: text.slice(0, 100), type: 'success' });
          // Update local state
          _updateStatus(id, 'published');
          return { success: true, result: text };
        }
        const errMsg = data.error?.message || 'Publish failed';
        if (typeof Notify !== 'undefined') Notify.send({ title: 'Publish failed', message: errMsg, type: 'error' });
        return { success: false, error: errMsg };
      } catch (e) {
        if (typeof Notify !== 'undefined') Notify.send({ title: 'Publish error', message: e.message, type: 'error' });
        return { success: false, error: e.message };
      }
    }
    return { success: false, error: 'Supabase not available' };
  }

  async function schedule(id, platform, scheduledAt) {
    if (!PUBLISHING_ENABLED) return _publishingComingSoon();
    // Schedule an approved item for future publishing
    const items = (typeof State !== 'undefined' ? State.get('content-queue') : null) || [];
    const item = items.find(i => i.id === id);
    if (!item) return { success: false, error: 'Item not found' };
    if (item.approval_status !== 'approved') {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Not approved', message: 'Approve content before scheduling', type: 'warning' });
      return { success: false, error: 'Must be approved first' };
    }

    if (typeof SB !== 'undefined' && SB.isReady()) {
      try {
        const sbUrl = SB._url || 'https://zacllshbgmnwsmliteqx.supabase.co';
        const session = await SB.auth().getSession();
        const token = session?.data?.session?.access_token;
        if (!token) return { success: false, error: 'Not authenticated' };

        const res = await fetch(sbUrl + '/functions/v1/social-mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            jsonrpc: '2.0', method: 'tools/call', id: Date.now(),
            params: { name: 'social_schedule_post', arguments: { post_id: id, platform, scheduled_at: scheduledAt } },
          }),
        });
        const data = await res.json();
        if (data.result) {
          _updateStatus(id, 'scheduled');
          _updateLocal(id, { metadata: { ...(item.metadata || {}), scheduled_at: scheduledAt, platform } });
          if (typeof Notify !== 'undefined') Notify.send({ title: 'Scheduled', message: `Post scheduled for ${new Date(scheduledAt).toLocaleString()}`, type: 'success' });
          return { success: true };
        }
        return { success: false, error: data.error?.message || 'Schedule failed' };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
    return { success: false, error: 'Supabase not available' };
  }

  function exportApproved() {
    const items = (typeof State !== 'undefined' ? State.get('content-queue') : null) || [];
    const approved = items.filter(i => i.approval_status === 'approved');
    if (!approved.length) {
      if (typeof Notify !== 'undefined') Notify.send({ title: 'Nothing to export', message: 'No approved content yet', type: 'warning' });
      return;
    }

    const text = approved.map((item, i) => {
      const type = TYPE_META[item.content_type] || TYPE_META.general;
      const content = item.edited_content || item.result || '';
      return `─── ${type.label} ${i + 1} ───\nAgent: ${item.agent_name}\n\n${content}\n`;
    }).join('\n\n');

    // Download as text file
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nice-approved-content-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    if (typeof Notify !== 'undefined') {
      Notify.send({ title: 'Exported', message: `${approved.length} items downloaded`, type: 'success' });
    }
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  Helpers                                                       */
  /* ══════════════════════════════════════════════════════════════ */

  async function _updateStatus(id, status) {
    const now = new Date().toISOString();

    // Update Supabase
    if (typeof SB !== 'undefined' && SB.isReady()) {
      try {
        await SB.db('mission_runs').update(id, { approval_status: status, reviewed_at: now });
      } catch {}
    }

    // Update local
    _updateLocal(id, { approval_status: status, reviewed_at: now });

    // Update State
    if (typeof State !== 'undefined') {
      const items = State.get('content-queue') || [];
      const item = items.find(i => i.id === id);
      if (item) {
        item.approval_status = status;
        item.reviewed_at = now;
        State.set('content-queue', [...items]);
      }
    }
  }

  function _applyToState(id, updates) {
    if (typeof State === 'undefined') return;
    const items = State.get('content-queue') || [];
    if (!items.some(i => i.id === id)) return;
    State.set('content-queue', items.map(i => (i.id === id ? Object.assign({}, i, updates) : i)));
  }

  function _removeFromState(id) {
    if (typeof State === 'undefined') return;
    State.set('content-queue', (State.get('content-queue') || []).filter(i => i.id !== id));
  }

  function _persistLocal(draft) {
    try {
      const items = JSON.parse(localStorage.getItem(Utils.KEYS.contentQueue) || '[]');
      items.unshift(draft);
      // Keep max 100 items
      if (items.length > 100) items.length = 100;
      localStorage.setItem(Utils.KEYS.contentQueue, JSON.stringify(items));
    } catch {}
  }

  function _updateLocal(id, updates) {
    try {
      const items = JSON.parse(localStorage.getItem(Utils.KEYS.contentQueue) || '[]');
      const item = items.find(i => i.id === id);
      if (item) {
        Object.assign(item, updates);
        localStorage.setItem(Utils.KEYS.contentQueue, JSON.stringify(items));
      }
    } catch {}
  }

  function getTypeMeta(type) {
    return TYPE_META[type] || TYPE_META.general;
  }

  function getContent(item) {
    return item.edited_content || item.result || '';
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    if (typeof Utils !== 'undefined' && Utils.timeAgo) return Utils.timeAgo(dateStr);
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  Markdown renderer                                             */
  /*  Line by line: headings, lists and code fences are their own   */
  /*  blocks, so list items sit together and nothing nests in a <p>. */
  /* ══════════════════════════════════════════════════════════════ */

  function _inline(s) {
    return s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(?<![\w*])\*([^*]+?)\*(?![\w*])/g, '<em>$1</em>')
      // The text is already esc()'d, so the url only needs its quotes
      // escaped; safeUrl() gates the scheme (blocks javascript: etc.).
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) =>
        `<a href="${Utils.safeUrl(url).replace(/"/g, '&quot;')}" target="_blank" rel="noopener">${label}</a>`);
  }

  function renderMarkdown(text) {
    if (!text) return '';
    const lines = _esc(text).split('\n');
    const out = [];
    let para = [];
    let list = null;
    const endPara = () => {
      if (para.length) out.push('<p>' + para.map(_inline).join('<br>') + '</p>');
      para = [];
    };
    const endList = () => {
      if (list) out.push(`<${list.tag}>` + list.items.map(i => '<li>' + _inline(i) + '</li>').join('') + `</${list.tag}>`);
      list = null;
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^```/.test(line)) {
        endPara(); endList();
        const code = [];
        for (i++; i < lines.length && !/^```/.test(lines[i]); i++) code.push(lines[i]);
        out.push('<pre><code>' + code.join('\n') + '</code></pre>');
        continue;
      }
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        endPara(); endList();
        const tag = ['h2', 'h3', 'h4'][heading[1].length - 1];
        out.push(`<${tag}>${_inline(heading[2])}</${tag}>`);
        continue;
      }
      const bullet = line.match(/^\s*[-•*]\s+(.+)$/);
      const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
      if (bullet || numbered) {
        endPara();
        const tag = bullet ? 'ul' : 'ol';
        if (list && list.tag !== tag) endList();
        if (!list) list = { tag, items: [] };
        list.items.push((bullet || numbered)[1]);
        continue;
      }
      endList();
      if (line.trim()) para.push(line);
      else endPara();
    }
    endPara(); endList();
    return out.join('');
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  PUBLIC API                                                    */
  /* ══════════════════════════════════════════════════════════════ */

  /* ── Check for scheduled posts that are due for publishing ── */
  let _scheduleCheckId = null;

  async function checkScheduledPosts() {
    const items = (typeof State !== 'undefined' ? State.get('content-queue') : null) || [];
    const now = new Date();

    for (const item of items) {
      if (item.approval_status !== 'scheduled') continue;
      const scheduledAt = item.metadata?.scheduled_at;
      if (!scheduledAt) continue;
      if (new Date(scheduledAt) > now) continue;

      // Due for publish
      const platform = item.metadata?.platform || 'buffer';
      const result = await publish(item.id, platform);
      if (result.success) {
        if (typeof Notify !== 'undefined') {
          Notify.send({ title: 'Scheduled Post Published', message: item.content?.substring(0, 50) + '…', type: 'success' });
        }
      } else {
        console.warn('[ContentQueue] Scheduled publish failed:', item.id, result.error);
      }
    }
  }

  function startScheduleChecker() {
    if (_scheduleCheckId) return;
    _scheduleCheckId = setInterval(checkScheduledPosts, 60000);
    checkScheduledPosts(); // immediate check
  }

  function stopScheduleChecker() {
    if (_scheduleCheckId) { clearInterval(_scheduleCheckId); _scheduleCheckId = null; }
  }

  /* ══════════════════════════════════════════════════════════════
     Counts helper — used by the Outbox tab badge so the user can see
     at a glance how many drafts are waiting without switching tabs.
     Reads from State so the number updates reactively as agents
     produce new drafts.
  ══════════════════════════════════════════════════════════════ */
  function getCounts() {
    const items = (typeof State !== 'undefined' ? State.get('content-queue') : null) || [];
    return {
      total:    items.length,
      draft:    items.filter(i => (i.approval_status || 'draft') === 'draft').length,
      approved: items.filter(i => i.approval_status === 'approved').length,
      rejected: items.filter(i => i.approval_status === 'rejected').length,
      scheduled: items.filter(i => i.approval_status === 'scheduled').length,
      published: items.filter(i => i.approval_status === 'published').length,
    };
  }

  /* ══════════════════════════════════════════════════════════════
     Live updates — reload when a run with an approval state changes, so
     the Outbox badge follows runs that land in review (or get approved
     elsewhere). Progress ticks on ordinary runs are ignored.
  ══════════════════════════════════════════════════════════════ */
  let _channel = null;
  let _reloadTimer = null;

  function _touchesQueue(payload) {
    if (!payload || payload.eventType === 'DELETE') return true;
    const row = payload.new || {};
    if (row.approval_status) return true;
    const items = (typeof State !== 'undefined' ? State.get('content-queue') : null) || [];
    return items.some(i => i.id === row.id);
  }

  function watch() {
    unwatch();
    if (typeof SB === 'undefined' || !SB.realtime) return;
    _channel = SB.realtime.subscribe('mission_runs', (payload) => {
      if (!_touchesQueue(payload)) return;
      clearTimeout(_reloadTimer);
      _reloadTimer = setTimeout(() => { load(); }, 800);
    });
  }

  function unwatch() {
    clearTimeout(_reloadTimer);
    _reloadTimer = null;
    if (_channel && typeof SB !== 'undefined' && SB.realtime) SB.realtime.unsubscribe(_channel);
    _channel = null;
  }

  function canPublish() { return PUBLISHING_ENABLED; }

  /* ══════════════════════════════════════════════════════════════
     Batch publish — fan out one item to multiple platforms.
     Returns an array of per-platform results so the caller can show
     a mixed success/failure summary.
  ══════════════════════════════════════════════════════════════ */
  async function publishTo(id, platforms) {
    if (!PUBLISHING_ENABLED) return [_publishingComingSoon()];
    const list = Array.isArray(platforms) && platforms.length ? platforms : [];
    if (!list.length) return [];
    const results = [];
    for (const platform of list) {
      /* eslint-disable no-await-in-loop */
      const r = await publish(id, platform);
      results.push({ platform, ...r });
      /* eslint-enable no-await-in-loop */
    }
    return results;
  }

  async function scheduleTo(id, platforms, scheduledAt) {
    if (!PUBLISHING_ENABLED) return [_publishingComingSoon()];
    const list = Array.isArray(platforms) && platforms.length ? platforms : [];
    if (!list.length) return [];
    if (!scheduledAt) return [{ success: false, error: 'Missing scheduled time' }];
    const results = [];
    for (const platform of list) {
      /* eslint-disable no-await-in-loop */
      const r = await schedule(id, platform, scheduledAt);
      results.push({ platform, ...r });
      /* eslint-enable no-await-in-loop */
    }
    return results;
  }

  return {
    load, createDraft, approve, reject, reschedule, edit, copy, publish, schedule, exportApproved,
    publishTo, scheduleTo, canPublish, getPlatforms, getPlatform, getCounts, watch, unwatch,
    getTypeMeta, getContent, timeAgo, renderMarkdown,
    checkScheduledPosts, startScheduleChecker, stopScheduleChecker,
  };
})();
