/* ═══════════════════════════════════════════════════════════════════
   NICE — Content Queue (Outbox)
   Draft & Approve system for agent-generated content.
   Agents create drafts → user reviews → approve/edit/reject → copy/export.
═══════════════════════════════════════════════════════════════════ */

const ContentQueue = (() => {
  const _esc = typeof Utils !== 'undefined' ? Utils.esc : (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const TYPE_META = {
    social:  { icon: '📱', label: 'Social Post', color: '#c084fc' },
    email:   { icon: '📧', label: 'Email',       color: '#60a5fa' },
    report:  { icon: '📊', label: 'Report',      color: '#34d399' },
    general: { icon: '📝', label: 'Content',     color: '#94a3b8' },
  };

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
            .from('tasks')
            .select('id, title, agent_name, result, content_type, approval_status, edited_content, reviewed_at, created_at, metadata, status')
            .eq('user_id', user.id)
            .not('approval_status', 'is', null);
          if (data) items.push(...data);
        }
      } catch (e) { console.warn('[ContentQueue] Supabase load error:', e); }
    }

    // Merge with localStorage fallback
    try {
      const local = JSON.parse(localStorage.getItem('nice-content-queue') || '[]');
      local.forEach(item => {
        if (!items.find(i => i.id === item.id)) items.push(item);
      });
    } catch {}

    // Apply filters
    let filtered = items;
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

    // Save to Supabase
    if (typeof SB !== 'undefined' && SB.isReady()) {
      try {
        const user = typeof State !== 'undefined' ? State.get('user') : null;
        if (user?.id) {
          const { data } = await SB.db('tasks').create({
            user_id: user.id,
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

  async function approve(id) {
    return _updateStatus(id, 'approved');
  }

  async function reject(id) {
    return _updateStatus(id, 'rejected');
  }

  async function edit(id, newContent) {
    // Update Supabase
    if (typeof SB !== 'undefined' && SB.isReady() && SB.client) {
      try {
        await SB.client.from('tasks').update({ edited_content: newContent }).eq('id', id);
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
    if (typeof SB !== 'undefined' && SB.isReady() && SB.client) {
      try {
        await SB.client.from('tasks').update({ approval_status: status, reviewed_at: now }).eq('id', id);
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

    if (typeof Gamification !== 'undefined' && status === 'approved') {
      Gamification.addXP('approve_content');
    }
  }

  function _persistLocal(draft) {
    try {
      const items = JSON.parse(localStorage.getItem('nice-content-queue') || '[]');
      items.unshift(draft);
      // Keep max 100 items
      if (items.length > 100) items.length = 100;
      localStorage.setItem('nice-content-queue', JSON.stringify(items));
    } catch {}
  }

  function _updateLocal(id, updates) {
    try {
      const items = JSON.parse(localStorage.getItem('nice-content-queue') || '[]');
      const item = items.find(i => i.id === id);
      if (item) {
        Object.assign(item, updates);
        localStorage.setItem('nice-content-queue', JSON.stringify(items));
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
  /*  Markdown renderer (simplified from PromptPanel)               */
  /* ══════════════════════════════════════════════════════════════ */

  function renderMarkdown(text) {
    if (!text) return '';
    let html = _esc(text);
    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Headers
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
    // Lists
    html = html.replace(/^[-•] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // Paragraphs
    html = html.replace(/\n{2,}/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    return `<p>${html}</p>`;
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  PUBLIC API                                                    */
  /* ══════════════════════════════════════════════════════════════ */

  return {
    load, createDraft, approve, reject, edit, copy, exportApproved,
    getTypeMeta, getContent, timeAgo, renderMarkdown,
  };
})();
