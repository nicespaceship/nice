/* ═══════════════════════════════════════════════════════════════════
   NICE — Mission Composer
   Prompt-driven Mission authoring. User describes intent in natural
   language; a triage LLM emits a structured plan; user confirms and we
   persist to the `missions` table (Sprint 1 schema). On save we enqueue
   a `tasks` run so the mission executes immediately.

   MVP scope — Sprint 2:
   - Shape is always 'simple' (single agent node). Scheduled / DAG come
     in later sprints when node types + cron enforcement land.
   - captain_id is left null — captain picking is a Sprint 3 concern.
   - `plan` has a single `agent` node with the LLM-phrased prompt.

   State machine (see _state variable):
     input   → user typing intent
     building → LLM composing plan
     preview → plan shown, awaiting user confirmation
     saving  → writing to missions + tasks
     error   → something went wrong, show message + retry

   This view owns the `/missions/new` route. Register BEFORE the
   `/missions/:id` route or `new` will be swallowed as an id.
═══════════════════════════════════════════════════════════════════ */
const MissionComposerView = (() => {
  const _N   = () => Terminology.label('mission');
  const _Nl  = () => Terminology.label('mission', { lowercase: true });
  const _esc = Utils.esc;

  // Component state — lives for the duration of one composer session.
  let _state = 'input';
  let _intent = '';
  let _plan = null;
  let _error = null;
  let _el = null;

  function render(el) {
    _el = el;
    _state = 'input';
    _intent = '';
    _plan = null;
    _error = null;
    _paint();
  }

  /* ─── Rendering ─── */
  function _paint() {
    if (!_el) return;
    _el.innerHTML = `
      <div class="mc-composer">
        <div class="mc-composer-back">
          <a href="#/missions" class="btn btn-sm">
            <svg class="icon icon-sm" fill="none" stroke="currentColor" stroke-width="1.5"><use href="#icon-arrow-left"/></svg>
            Back to ${Terminology.label('mission', { plural: true })}
          </a>
        </div>
        <div class="mc-composer-hero">
          <h1 class="mc-composer-title">New ${_N()}</h1>
          <p class="mc-composer-sub">Describe what you want in plain English. Your captain figures out the rest.</p>
        </div>
        <div class="mc-composer-body" id="mc-composer-body">${_bodyHTML()}</div>
      </div>
    `;
    _bindBodyEvents();
  }

  function _bodyHTML() {
    if (_state === 'input' || _state === 'building') {
      const disabled = _state === 'building' ? 'disabled' : '';
      const btnLabel = _state === 'building' ? 'Composing…' : 'Compose plan';
      const errorBanner = _error
        ? `<div class="mc-composer-error">${_esc(_error)}</div>`
        : '';
      return `
        <form id="mc-composer-form" class="mc-composer-form">
          <label for="mc-intent" class="mc-composer-label">What should this ${_Nl()} do?</label>
          <textarea id="mc-intent" class="mc-composer-intent"
            placeholder="e.g. Draft an email reply in my voice for every unread thread from a customer."
            rows="5" ${disabled} required>${_esc(_intent)}</textarea>
          ${errorBanner}
          <div class="mc-composer-actions">
            <button type="submit" class="btn btn-primary" ${disabled}>${btnLabel}</button>
          </div>
        </form>
      `;
    }

    if (_state === 'preview' && _plan) {
      const steps = (_plan.plan?.nodes || []).map((n, i) =>
        `<li class="mc-plan-step"><span class="mc-plan-step-num">${i + 1}</span><span class="mc-plan-step-label">${_esc(n.prompt || n.type)}</span></li>`
      ).join('');
      return `
        <div class="mc-plan-card">
          <div class="mc-plan-row">
            <span class="mc-plan-key">Title</span>
            <span class="mc-plan-val">${_esc(_plan.title || 'Untitled')}</span>
          </div>
          <div class="mc-plan-row">
            <span class="mc-plan-key">Description</span>
            <span class="mc-plan-val">${_esc(_plan.description || '—')}</span>
          </div>
          <div class="mc-plan-row">
            <span class="mc-plan-key">Shape</span>
            <span class="mc-plan-val">${_esc(_plan.shape || 'simple')}</span>
          </div>
          <div class="mc-plan-row mc-plan-row-steps">
            <span class="mc-plan-key">Steps</span>
            <ol class="mc-plan-steps">${steps || '<li class="mc-plan-step">—</li>'}</ol>
          </div>
        </div>
        <div class="mc-composer-actions">
          <button type="button" class="btn btn-sm" id="mc-composer-back-edit">← Edit intent</button>
          <button type="button" class="btn btn-primary" id="mc-composer-activate">Activate ${_N()}</button>
        </div>
      `;
    }

    if (_state === 'saving') {
      return `<div class="mc-composer-saving">Activating ${_Nl()}…</div>`;
    }

    return '';
  }

  function _bindBodyEvents() {
    if (_state === 'input' || _state === 'building') {
      const form = document.getElementById('mc-composer-form');
      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const val = (document.getElementById('mc-intent')?.value || '').trim();
        if (!val) return;
        _intent = val;
        _error = null;
        _state = 'building';
        _paint();
        try {
          _plan = await composePlan(val);
          _state = 'preview';
        } catch (err) {
          _error = err.message || 'Could not compose a plan.';
          _state = 'input';
        }
        _paint();
      });
      return;
    }

    if (_state === 'preview') {
      document.getElementById('mc-composer-back-edit')?.addEventListener('click', () => {
        _state = 'input';
        _paint();
      });
      document.getElementById('mc-composer-activate')?.addEventListener('click', async () => {
        _state = 'saving';
        _paint();
        try {
          const { missionId, runId } = await activateMission(_plan);
          if (typeof Notify !== 'undefined') {
            Notify.send({ title: `${_N()} Activated`, message: _plan.title, type: 'success' });
          }
          // Kick off the run (fire and forget — MissionRunner manages state).
          if (runId && typeof MissionRunner !== 'undefined') MissionRunner.run(runId);
          // Navigate to the run detail so the user can watch it.
          location.hash = runId ? `#/missions/${runId}` : '#/missions';
        } catch (err) {
          _error = err.message || 'Activation failed.';
          _state = 'preview';
          _paint();
        }
      });
    }
  }

  /* ─── LLM plan composition ─── */
  // Exposed for unit testing — the full composePlan wraps the LLM call but
  // the JSON parser + plan normalizer below run offline.
  function _systemPrompt() {
    return [
      'You are the Mission Composer for NICE, an agentic workflow platform.',
      'A user describes what they want a crew to do. You emit a JSON plan.',
      '',
      'Rules:',
      '- Respond with ONE valid JSON object. No code fences, no prose.',
      '- Shape MUST be "simple" (multi-node DAGs come later).',
      '- Produce ONE node of type "agent" whose `prompt` is a clear,',
      '  self-contained instruction the executing agent can follow without',
      '  further clarification.',
      '- Title is a short noun phrase (< 60 chars) capturing the outcome.',
      '- Description is one sentence explaining why.',
      '',
      'JSON schema:',
      '{',
      '  "title": string,',
      '  "description": string,',
      '  "shape": "simple",',
      '  "plan": { "nodes": [ { "id": "root", "type": "agent", "prompt": string } ], "edges": [] }',
      '}',
    ].join('\n');
  }

  async function composePlan(intent) {
    if (typeof SB === 'undefined' || !SB.functions) {
      throw new Error('Supabase client unavailable.');
    }
    const { data, error } = await SB.functions.invoke('nice-ai', {
      body: {
        model: 'gemini-2.5-flash',
        messages: [
          { role: 'system', content: _systemPrompt() },
          { role: 'user', content: intent },
        ],
        temperature: 0.2,
        max_tokens: 512,
      },
    });
    if (error) throw new Error(typeof error === 'string' ? error : error.message || 'Composer LLM error');
    const content = data?.content || '';
    const parsed = parsePlanResponse(content);
    return normalizePlan(parsed, intent);
  }

  /**
   * Parse the LLM's JSON response. Permissive — the model sometimes wraps
   * the JSON in markdown fences or adds prose. Returns the parsed object
   * or throws if nothing usable is found.
   */
  function parsePlanResponse(text) {
    if (!text) throw new Error('Empty composer response.');
    const raw = String(text).trim();
    // Direct parse first.
    try { return JSON.parse(raw); } catch { /* fall through */ }
    // Strip ```json fences.
    const fenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    if (fenced !== raw) {
      try { return JSON.parse(fenced); } catch { /* fall through */ }
    }
    // Grab the first {...} block.
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* fall through */ }
    }
    throw new Error('Composer returned unparseable JSON.');
  }

  /**
   * Coerce the parsed LLM object into a shape the missions table accepts.
   * Fills in safe defaults for missing fields — we'd rather activate a
   * plan with a synthesized title than reject the whole compose.
   */
  function normalizePlan(parsed, intent) {
    if (!parsed || typeof parsed !== 'object') throw new Error('Composer returned a non-object plan.');
    const nodes = Array.isArray(parsed?.plan?.nodes) ? parsed.plan.nodes : [];
    const rootNode = nodes.find(n => n && n.type === 'agent') || null;
    if (!rootNode || !rootNode.prompt) {
      throw new Error('Composer did not produce a usable agent step.');
    }
    const title = typeof parsed.title === 'string' && parsed.title.trim()
      ? parsed.title.trim().slice(0, 120)
      : (intent || 'Untitled').slice(0, 60);
    const description = typeof parsed.description === 'string'
      ? parsed.description.trim().slice(0, 500)
      : '';
    return {
      title,
      description,
      shape: 'simple',
      captain_id: null,
      plan: {
        nodes: [{ id: 'root', type: 'agent', prompt: String(rootNode.prompt).trim() }],
        edges: [],
      },
      schedule: null,
      outcome_spec: null,
      tools_required: [],
    };
  }

  /* ─── Persist the mission + enqueue a run ─── */
  async function activateMission(plan) {
    const user = State.get('user');
    if (!user?.id) throw new Error('Sign in to activate a mission.');

    // Write the template.
    const missionRow = await SB.db('missions').create({
      user_id: user.id,
      title: plan.title,
      description: plan.description || null,
      shape: plan.shape,
      captain_id: plan.captain_id || null,
      plan: plan.plan,
      schedule: plan.schedule || null,
      outcome_spec: plan.outcome_spec || null,
      tools_required: plan.tools_required || [],
      state: 'active',
    });
    if (!missionRow?.id) throw new Error('Failed to persist mission template.');

    // Enqueue an immediate run. `mission_id` threads the template through
    // so the run knows which plan it came from. `plan_snapshot` freezes
    // the plan so edits to the template don't mutate this run mid-flight.
    const taskRow = await SB.db('tasks').create({
      user_id: user.id,
      title: plan.title,
      status: 'queued',
      priority: 'medium',
      progress: 0,
      mission_id: missionRow.id,
      plan_snapshot: plan.plan,
    });

    // Mirror into State so Missions tab sees the new row without a refetch.
    const missions = State.get('missions') || [];
    missions.unshift(taskRow);
    State.set('missions', missions);

    return { missionId: missionRow.id, runId: taskRow?.id || null };
  }

  // Exported for tests. Keep in sync with the return-value shape the
  // render loop expects.
  return {
    get title() { return `New ${_N()}`; },
    render,
    // Test surface:
    _systemPrompt,
    parsePlanResponse,
    normalizePlan,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = MissionComposerView;
