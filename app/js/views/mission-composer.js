/* ═══════════════════════════════════════════════════════════════════
   NICE — Mission Composer
   Prompt-driven Mission authoring. User describes intent in natural
   language; a triage LLM emits a structured plan; user confirms and we
   persist to the `missions` table (Sprint 1 schema). On save we enqueue
   a `tasks` run so the mission executes immediately.

   Sprint 2 shipped the single-agent ('simple') shape.
   Sprint 3 adds one seeded DAG template — Inbox Captain — via an
   "Install from template" chip surfaced when the intent mentions inbox
   / email / gmail / reply. The chip skips the LLM compose step and
   drops in the frozen template plan from
   blueprints.metadata.workflow (seeded via migration 20260423000002).

   State machine (see _state variable):
     input     → user typing intent (Inbox Captain chip surfaces here)
     building  → LLM composing plan (simple shape)
     preview   → plan shown, awaiting user confirmation
     saving    → writing to missions + tasks
     error     → something went wrong, show message + retry

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
      const chipHTML = _inboxCaptainChipHTML();
      return `
        <form id="mc-composer-form" class="mc-composer-form">
          <label for="mc-intent" class="mc-composer-label">What should this ${_Nl()} do?</label>
          <textarea id="mc-intent" class="mc-composer-intent"
            placeholder="e.g. Draft an email reply in my voice for every unread thread from a customer."
            rows="5" ${disabled} required>${_esc(_intent)}</textarea>
          ${chipHTML}
          ${errorBanner}
          <div class="mc-composer-actions">
            <button type="submit" class="btn btn-primary" ${disabled}>${btnLabel}</button>
          </div>
        </form>
      `;
    }

    if (_state === 'preview' && _plan) {
      const steps = (_plan.plan?.nodes || []).map((n, i) => {
        const label = n.label || n.config?.prompt || n.prompt || n.type;
        const badge = n.type && n.type !== 'agent'
          ? `<span class="mc-plan-step-badge" data-node-type="${_esc(n.type)}">${_esc(n.type.replace(/_/g, ' '))}</span>`
          : '';
        return `<li class="mc-plan-step"><span class="mc-plan-step-num">${i + 1}</span><span class="mc-plan-step-label">${_esc(label)}</span>${badge}</li>`;
      }).join('');
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

    if (_state === 'template-gate') {
      return _templateGateHTML();
    }

    return '';
  }

  function _templateGateHTML() {
    const gates = _checkInboxCaptainGates();
    const steps = [];
    if (!gates.gmailConnected) {
      steps.push(`
        <li class="mc-gate-step">
          <span class="mc-gate-step-icon" aria-hidden="true">✉</span>
          <div class="mc-gate-step-body">
            <div class="mc-gate-step-title">Connect Gmail</div>
            <div class="mc-gate-step-sub">Inbox Captain needs Gmail access to read threads and draft replies.</div>
          </div>
          <a class="btn btn-sm" href="#/security?tab=integrations">Connect</a>
        </li>
      `);
    }
    const errBanner = _error ? `<div class="mc-composer-error">${_esc(_error)}</div>` : '';
    return `
      <div class="mc-template-gate">
        <div class="mc-template-gate-title">One step before this ${_Nl()} can fly</div>
        <ol class="mc-gate-steps">${steps.join('')}</ol>
        ${errBanner}
        <div class="mc-composer-actions">
          <button type="button" class="btn btn-sm" id="mc-gate-back">← Back</button>
          <button type="button" class="btn btn-primary" id="mc-gate-retry">I'm ready — recheck</button>
        </div>
      </div>
    `;
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

      // Intent textarea live-updates the chip detection. Cheap re-paint.
      const intentEl = document.getElementById('mc-intent');
      intentEl?.addEventListener('input', (e) => {
        const next = e.target.value || '';
        const detectionChanged = detectInboxCaptainIntent(next) !== detectInboxCaptainIntent(_intent);
        _intent = next;
        // Editing the intent clears any prior template-load error — that
        // error was tied to the previous chip click, not the current draft.
        if (_error) { _error = null; _paint(); return; }
        if (detectionChanged) _paint();
      });

      // Inbox Captain chip → skip LLM, drop in the seeded DAG template.
      document.getElementById('mc-inbox-captain-chip')?.addEventListener('click', () => {
        const currentIntent = (document.getElementById('mc-intent')?.value || '').trim();
        if (currentIntent) _intent = currentIntent;
        _installInboxCaptainTemplate();
      });
      return;
    }

    if (_state === 'template-gate') {
      document.getElementById('mc-gate-back')?.addEventListener('click', () => {
        _state = 'input';
        _paint();
      });
      document.getElementById('mc-gate-retry')?.addEventListener('click', () => {
        _installInboxCaptainTemplate();
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

  /* ─── Inbox Captain template (seeded single agent) ─── */
  // Inbox Captain was originally a Spaceship + 2-agent crew + DAG.
  // Refactored 2026-04-23 to a single agent (bp-agent-inbox-captain)
  // that triages + drafts in one ReAct loop — a Spaceship was too
  // heavy for a narrow inbox helper. See migration
  // 20260423000005_inbox_captain_agent_refactor.sql.
  //
  // The composer still produces a DAG-shape plan because it uses ONE
  // persona_dispatch node (so WorkflowEngine injects the user's voice
  // reference from localStorage at runtime). MissionRunner's existing
  // status='review' flow covers "approve before send" without a
  // dedicated approval_gate node — drafts already live in Gmail's
  // Drafts folder until the user approves the mission.
  const INBOX_CAPTAIN_ID = 'bp-agent-inbox-captain';
  // Matches the canonical hello-world utterances. Deliberately loose —
  // false positives are cheap (the user can ignore the chip); false
  // negatives mean the user types a correct intent and sees no chip,
  // which is the worse outcome for demoability.
  const _INBOX_PATTERN = /\b(inbox|gmail|email|e-?mail|reply|replies|draft|drafts|unread|thread|messages?)\b/i;

  function detectInboxCaptainIntent(text) {
    if (typeof text !== 'string') return false;
    return _INBOX_PATTERN.test(text);
  }

  // Gate checks read State directly. If State isn't populated yet (first
  // paint during bootstrap) Gmail gate comes back false, which is the
  // right default — show the Connect Gmail explainer.
  //
  // voiceSampleLength is NOT a hard gate — Inbox Captain runs fine
  // without a voice sample; the chip just surfaces it so the user
  // can opt in to the "in my voice" behavior before activating.
  //
  // Post-refactor there's ONE hard gate: Gmail connection. No ship
  // install step because Inbox Captain is an agent and
  // WorkflowEngine._executeAgent resolves the blueprint directly
  // via Blueprints.getAgent() — no user_agents row required.
  function _checkInboxCaptainGates() {
    const mcps = (typeof State !== 'undefined' ? State.get('mcp_connections') : null) || [];
    const gmailConnected = mcps.some(c => c && c.catalog_id === 'google-gmail' && c.status === 'connected');

    return { gmailConnected, voiceSampleLength: _readVoiceSampleLength() };
  }

  function _readVoiceSampleLength() {
    try {
      const key = (typeof Utils !== 'undefined' && Utils.KEYS?.voiceSample) || 'nice-voice-sample';
      const sample = (typeof localStorage !== 'undefined') ? (localStorage.getItem(key) || '') : '';
      return sample.trim().length;
    } catch { return 0; }
  }

  function _inboxCaptainBlueprint() {
    if (typeof Blueprints === 'undefined' || typeof Blueprints.getAgent !== 'function') return null;
    return Blueprints.getAgent(INBOX_CAPTAIN_ID) || null;
  }

  function _inboxCaptainChipHTML() {
    if (!detectInboxCaptainIntent(_intent)) return '';
    const bp = _inboxCaptainBlueprint();
    // Even without the blueprint loaded, surface the chip — clicking
    // shows a readable error instead of silently swallowing the intent.
    const name = bp?.name || 'Inbox Captain';
    const flavor = bp?.flavor || bp?.metadata?.flavor || 'Your inbox at 9 AM. Drafted by 9:02.';
    const gates = _checkInboxCaptainGates();
    const statusLine = gates.gmailConnected
      ? 'Ready — Gmail connected.'
      : _gateStatusLine(gates);
    const voiceLine = _voiceSignalLine(gates.voiceSampleLength);

    return `
      <div class="mc-template-chip" role="note">
        <button type="button" class="mc-template-chip-btn" id="mc-inbox-captain-chip" title="Use this template">
          <span class="mc-template-chip-title">Use template: ${_esc(name)}</span>
          <span class="mc-template-chip-sub">${_esc(flavor)}</span>
          <span class="mc-template-chip-status">${_esc(statusLine)}</span>
        </button>
        ${voiceLine}
      </div>
    `;
  }

  // Voice signal — not a gate, just a hint. When the user has a sample
  // set, Drafter writes in their voice; when they don't, the Drafter
  // falls back to a generic tone. Rendered as a sibling of the chip
  // button (not nested) so the "set one" link is valid HTML.
  function _voiceSignalLine(length) {
    if (length > 0) {
      return `<div class="mc-template-chip-voice mc-template-chip-voice-on">✓ Voice sample ready (${length} char${length === 1 ? '' : 's'}) — Drafter writes in your voice</div>`;
    }
    return `<div class="mc-template-chip-voice mc-template-chip-voice-off">No voice sample — Drafter will use a generic tone · <a href="#/profile">set one</a></div>`;
  }

  function _gateStatusLine(gates) {
    const missing = [];
    if (!gates.gmailConnected) missing.push('connect Gmail');
    return 'Needs: ' + missing.join(' · ');
  }

  // Triggered by the chip click. Validates the Gmail gate before
  // handing off to the normal preview flow. If Gmail isn't connected
  // we show the one-step explainer; clicking the chip again after
  // connecting Gmail re-checks.
  function _installInboxCaptainTemplate() {
    const bp = _inboxCaptainBlueprint();
    if (!bp) {
      _error = 'Inbox Captain blueprint not loaded. Try again in a moment.';
      _paint();
      return;
    }
    const gates = _checkInboxCaptainGates();
    if (!gates.gmailConnected) {
      _state = 'template-gate';
      _error = null;
      _paint();
      return;
    }

    const plan = buildInboxCaptainPlan(bp, _intent);
    if (!plan) {
      _error = 'Inbox Captain template could not be built.';
      _paint();
      return;
    }
    _plan = plan;
    _state = 'preview';
    _error = null;
    _paint();
  }

  /**
   * Build a Mission plan that runs the Inbox Captain agent with the
   * user's voice reference injected. Single-node DAG — one
   * persona_dispatch node — so WorkflowEngine handles the voice
   * injection + agent execution. MissionRunner's existing
   * status='review' flow covers the "approve before send" contract
   * without needing a separate approval_gate node (drafts live in
   * Gmail's Drafts folder regardless until the user approves).
   *
   * Exposed for unit tests so we can assert the wire shape without
   * needing the full State stack.
   */
  function buildInboxCaptainPlan(blueprint, intent) {
    if (!blueprint || !blueprint.id) return null;

    const title = 'Inbox Captain — draft replies for review';
    const description = (intent && intent.trim())
      ? intent.trim().slice(0, 500)
      : 'Triage recent Gmail threads and draft replies in my voice. Review before send.';

    const toolsRequired = blueprint.metadata?.tools_required
      || blueprint.config?.tools_required
      || ['google-gmail'];

    return {
      title,
      description,
      shape: 'dag',
      captain_id: null,  // no spaceship — agent runs standalone
      plan: {
        shape: 'dag',
        nodes: [
          {
            id: 'captain',
            type: 'persona_dispatch',
            label: 'Triage inbox and draft replies',
            config: {
              blueprintId: blueprint.id,
              prompt: 'Triage the last 24 hours of unread Gmail threads and draft replies for the ones that need one. Land every reply as a Gmail draft. Output the JSON summary defined in your system prompt.',
              personaHint: 'user_voice',
            },
          },
        ],
        edges: [],
      },
      schedule: null,
      outcome_spec: { kind: 'drafts_reviewed' },
      tools_required: toolsRequired,
      template_id: blueprint.id,
    };
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
    // Embed `shape` inside plan_snapshot too so MissionRunner._isDagMission
    // can route via WorkflowEngine without re-reading the `missions` row.
    const snapshot = Object.assign({ shape: plan.shape || 'simple' }, plan.plan || {});

    const taskRow = await SB.db('tasks').create({
      user_id: user.id,
      title: plan.title,
      status: 'queued',
      priority: 'medium',
      progress: 0,
      mission_id: missionRow.id,
      plan_snapshot: snapshot,
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
    detectInboxCaptainIntent,
    buildInboxCaptainPlan,
    INBOX_CAPTAIN_ID,
    _voiceSignalLine,
    _readVoiceSampleLength,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = MissionComposerView;
