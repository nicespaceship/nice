/* ═══════════════════════════════════════════════════════════════════
   NICE — Onboarding Funnel Tracker
   Emits once-per-user lifecycle events into audit_log so we can
   measure signup → first spaceship → first mission conversion.

   Events (all prefixed `onboarding.` so the funnel view can filter
   them out of the general captain's log):
     • signup_complete       — first time we see an authenticated user
     • wizard_start          — setup wizard opens (only fires once)
     • wizard_complete       — setup wizard deploys a crew successfully
     • first_spaceship       — user_spaceships count goes from 0 → 1
     • first_mission_start   — any mission enters running state
     • first_mission_complete — any mission reaches review/completed

   Per-user localStorage flags guarantee each event fires exactly once
   per user on this device. The audit_log Supabase table is the SSOT
   for analysis — localStorage is just a dedupe guard. If a user
   signs in on a second device, their funnel events will be re-emitted
   from that device, but downstream queries use DISTINCT user_id so
   the funnel counts stay accurate.
═══════════════════════════════════════════════════════════════════ */

const Onboarding = (() => {

  /* ── Canonical event names ────────────────────────────────── */
  const EVENTS = {
    SIGNUP_COMPLETE:        'onboarding.signup_complete',
    WIZARD_START:           'onboarding.wizard_start',
    WIZARD_COMPLETE:        'onboarding.wizard_complete',
    FIRST_SPACESHIP:        'onboarding.first_spaceship',
    FIRST_MISSION_START:    'onboarding.first_mission_start',
    FIRST_MISSION_COMPLETE: 'onboarding.first_mission_complete',
  };

  /* Ordered list of funnel steps, top of funnel first. The Code mode's
     Funnel tab uses this order when rendering drop-off percentages. */
  const FUNNEL_STEPS = [
    { event: EVENTS.SIGNUP_COMPLETE,        label: 'Signed up' },
    { event: EVENTS.WIZARD_START,           label: 'Opened wizard' },
    { event: EVENTS.WIZARD_COMPLETE,        label: 'Completed wizard' },
    { event: EVENTS.FIRST_SPACESHIP,        label: 'First spaceship' },
    { event: EVENTS.FIRST_MISSION_START,    label: 'Ran first mission' },
    { event: EVENTS.FIRST_MISSION_COMPLETE, label: 'Finished first mission' },
  ];

  /* Dedupe window for signup_complete. If a user's account is older
     than this, we won't backfill a signup event for them — they're
     a returning user, not a new signup. */
  const SIGNUP_BACKFILL_DAYS = 7;

  let _initialized = false;
  let _currentUserId = null;
  // Stored references so we can unsubscribe and re-subscribe cleanly
  // (important for tests, harmless in production).
  let _userHandler = null;
  let _shipsHandler = null;
  let _missionsHandler = null;

  /* ── Per-user dedupe flag ─────────────────────────────────── */

  function _flagKey(userId, event) {
    return 'nice-onboarding-' + userId + '-' + event;
  }

  function _alreadyFired(userId, event) {
    if (!userId) return true;
    try {
      return !!localStorage.getItem(_flagKey(userId, event));
    } catch { return false; }
  }

  function _markFired(userId, event) {
    if (!userId) return;
    try {
      localStorage.setItem(_flagKey(userId, event), new Date().toISOString());
    } catch { /* storage full — skip */ }
  }

  /* ── Public: manual track (for explicit instrumentation points) ── */

  /**
   * Fire an onboarding event for a user. Deduped per-user via
   * localStorage so calling it multiple times is safe.
   */
  function track(event, details) {
    const user = typeof State !== 'undefined' ? State.get('user') : null;
    const userId = user ? user.id : null;
    if (!userId || !event) return;
    if (_alreadyFired(userId, event)) return;
    _markFired(userId, event);
    if (typeof AuditLog !== 'undefined') {
      AuditLog.log(event, Object.assign({ userId: userId }, details || {}));
    }
  }

  /* ── State-driven auto tracking ───────────────────────────── */

  function _handleUserChange(user) {
    // Logged out — reset so next sign-in re-evaluates
    if (!user || !user.id) { _currentUserId = null; return; }
    if (_currentUserId === user.id) return;
    _currentUserId = user.id;

    // Only emit signup_complete if the account is fresh. Older accounts
    // were created before instrumentation existed; we don't want the
    // Funnel tab's first week of data to be polluted with backfills.
    if (!_alreadyFired(user.id, EVENTS.SIGNUP_COMPLETE) && _isFreshAccount(user)) {
      track(EVENTS.SIGNUP_COMPLETE, { email: user.email });
    }
  }

  function _isFreshAccount(user) {
    if (!user || !user.created_at) return true; // no timestamp — assume new
    const createdMs = new Date(user.created_at).getTime();
    if (isNaN(createdMs)) return true;
    const ageDays = (Date.now() - createdMs) / (1000 * 60 * 60 * 24);
    return ageDays <= SIGNUP_BACKFILL_DAYS;
  }

  function _handleSpaceshipsChange(ships) {
    if (!_currentUserId) return;
    const count = Array.isArray(ships) ? ships.length : 0;
    if (count > 0) {
      track(EVENTS.FIRST_SPACESHIP, { ship_count: count });
    }
  }

  function _handleMissionsChange(missions) {
    if (!_currentUserId || !Array.isArray(missions)) return;
    // First mission that has ever started (any running/review/completed
    // mission counts — we only care about the transition from "zero
    // missions run" to "at least one mission run").
    const hasStarted = missions.some(m =>
      m && (m.status === 'running' || m.status === 'review' || m.status === 'completed')
    );
    if (hasStarted) {
      track(EVENTS.FIRST_MISSION_START);
    }
    // First mission that has ever finished.
    const hasCompleted = missions.some(m =>
      m && (m.status === 'review' || m.status === 'completed')
    );
    if (hasCompleted) {
      track(EVENTS.FIRST_MISSION_COMPLETE);
    }
  }

  /* ── Init ─────────────────────────────────────────────────── */

  /**
   * Wire up auto-tracking listeners against the State store. Called
   * once from nice.js at boot. Safe to call multiple times — any
   * existing listeners are removed before new ones are attached so
   * callers can safely re-init (e.g. after tests reset State).
   */
  function init() {
    if (typeof State === 'undefined') return;
    // Remove previous subscriptions if they exist
    if (_initialized && State.off) {
      if (_userHandler)     State.off('user',             _userHandler);
      if (_shipsHandler)    State.off('user_spaceships',  _shipsHandler);
      if (_missionsHandler) State.off('missions',         _missionsHandler);
    }
    _userHandler     = _handleUserChange;
    _shipsHandler    = _handleSpaceshipsChange;
    _missionsHandler = _handleMissionsChange;
    _currentUserId   = null;
    State.on('user',             _userHandler);
    State.on('user_spaceships',  _shipsHandler);
    State.on('missions',         _missionsHandler);
    _initialized = true;
  }

  /* ── Funnel query (used by the Code mode's "Funnel" tab) ──────── */

  /**
   * Load funnel stats over the given time window. Returns an object
   * keyed by event name with { users: Set<userId>, count: number }
   * plus a `steps` array mirroring FUNNEL_STEPS with counts and
   * conversion percentages relative to the previous step.
   *
   * @param {string} range — '24h' | '7d' | '30d' | 'all'
   */
  async function loadFunnel(range) {
    if (typeof SB === 'undefined' || typeof SB.isReady !== 'function' || !SB.isReady()) {
      return { available: false, steps: _emptySteps(), total: 0, range: range };
    }

    const sinceIso = _rangeToIso(range);
    try {
      let query = SB.client
        .from('audit_log')
        .select('type, user_id, created_at')
        .like('type', 'onboarding.%')
        .order('created_at', { ascending: true })
        .limit(5000);

      if (sinceIso) query = query.gte('created_at', sinceIso);

      const { data, error } = await query;
      if (error) throw error;

      // Tally unique users per event
      const bucket = {};
      for (const step of FUNNEL_STEPS) bucket[step.event] = new Set();
      for (const row of (data || [])) {
        if (row && row.user_id && bucket[row.type]) {
          bucket[row.type].add(row.user_id);
        }
      }

      const steps = FUNNEL_STEPS.map((step, i) => {
        const count = bucket[step.event].size;
        const prev  = i === 0 ? count : bucket[FUNNEL_STEPS[0].event].size;
        const prevStep = i === 0 ? count : bucket[FUNNEL_STEPS[i - 1].event].size;
        return {
          event:        step.event,
          label:        step.label,
          count:        count,
          conversion:   prev > 0 ? count / prev : 0,          // vs top of funnel
          step_rate:    prevStep > 0 ? count / prevStep : 0,  // vs previous step
        };
      });

      return {
        available: true,
        range: range,
        total: steps[0] ? steps[0].count : 0,
        steps: steps,
      };
    } catch (err) {
      console.warn('[Onboarding] Failed to load funnel stats:', err && err.message);
      return { available: false, steps: _emptySteps(), total: 0, range: range };
    }
  }

  function _emptySteps() {
    return FUNNEL_STEPS.map(s => ({
      event: s.event,
      label: s.label,
      count: 0,
      conversion: 0,
      step_rate: 0,
    }));
  }

  function _rangeToIso(range) {
    const offsets = {
      '24h': 86400e3,
      '7d':  7 * 86400e3,
      '30d': 30 * 86400e3,
    };
    const ms = offsets[range];
    if (!ms) return null; // 'all' or unknown
    return new Date(Date.now() - ms).toISOString();
  }

  return {
    EVENTS:       EVENTS,
    FUNNEL_STEPS: FUNNEL_STEPS,
    init:         init,
    track:        track,
    loadFunnel:   loadFunnel,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Onboarding;
