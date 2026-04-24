/* ═══════════════════════════════════════════════════════════════════
   NICE — Mission Scheduler
   Cron-based recurring missions. Parses simple cron expressions and
   fires missions through MissionRunner on schedule.
   Supports: daily at HH:MM, weekly on DAY at HH:MM, every N hours.
═══════════════════════════════════════════════════════════════════ */

const MissionScheduler = (() => {

  const STORAGE_KEY = Utils.KEYS.missionSchedules;
  let _intervalId = null;

  /* ── Cron expression parser ──
     Supported formats:
       "daily 09:30"          → every day at 09:30
       "weekly mon 14:00"     → every Monday at 14:00
       "every 4h"             → every 4 hours (aligned to midnight)
  */

  const DAY_MAP = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

  function _parseCron(expr) {
    if (!expr || typeof expr !== 'string') return null;
    const parts = expr.trim().toLowerCase().split(/\s+/);

    // "daily HH:MM"
    if (parts[0] === 'daily' && parts[1]) {
      const [h, m] = parts[1].split(':').map(Number);
      if (_validTime(h, m)) return { type: 'daily', hour: h, minute: m };
    }

    // "weekly DAY HH:MM"
    if (parts[0] === 'weekly' && parts[1] && parts[2]) {
      const day = DAY_MAP[parts[1]];
      const [h, m] = parts[2].split(':').map(Number);
      if (day !== undefined && _validTime(h, m)) return { type: 'weekly', day, hour: h, minute: m };
    }

    // "every Nh"
    if (parts[0] === 'every' && parts[1]) {
      const match = parts[1].match(/^(\d+)h$/);
      if (match) {
        const hours = parseInt(match[1], 10);
        if (hours > 0 && hours <= 168) return { type: 'interval', hours };
      }
    }

    return null;
  }

  function _validTime(h, m) {
    return Number.isFinite(h) && Number.isFinite(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59;
  }

  /* ── Should a schedule fire right now? ── */
  function _shouldFire(schedule, now) {
    const parsed = _parseCron(schedule.cron);
    if (!parsed) return false;

    const lastRun = schedule.lastRun ? new Date(schedule.lastRun) : null;

    if (parsed.type === 'daily') {
      if (now.getHours() !== parsed.hour || now.getMinutes() !== parsed.minute) return false;
      // Don't fire if already ran this minute
      if (lastRun && (now - lastRun) < 90000) return false;
      return true;
    }

    if (parsed.type === 'weekly') {
      if (now.getDay() !== parsed.day) return false;
      if (now.getHours() !== parsed.hour || now.getMinutes() !== parsed.minute) return false;
      if (lastRun && (now - lastRun) < 90000) return false;
      return true;
    }

    if (parsed.type === 'interval') {
      if (!lastRun) return true; // never ran — fire immediately
      const elapsed = (now - lastRun) / (1000 * 60 * 60);
      return elapsed >= parsed.hours;
    }

    return false;
  }

  /* ── localStorage helpers ── */
  function _load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
  }

  function _save(schedules) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules));
    } catch {}
  }

  /* ── Schedule a recurring mission ── */
  function schedule(missionTemplate, cronExpression) {
    if (!missionTemplate || !cronExpression) return null;

    const parsed = _parseCron(cronExpression);
    if (!parsed) {
      console.warn('[MissionScheduler] Invalid cron expression:', cronExpression);
      return null;
    }

    const entry = {
      id: 'sched-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      cron: cronExpression.trim().toLowerCase(),
      cronParsed: parsed,
      template: {
        title: missionTemplate.title || 'Scheduled Mission',
        agent_id: missionTemplate.agent_id || null,
        agent_name: missionTemplate.agent_name || null,
        priority: missionTemplate.priority || 'medium',
        metadata: missionTemplate.metadata || {},
      },
      enabled: true,
      lastRun: null,
      createdAt: new Date().toISOString(),
    };

    const schedules = _load();
    schedules.push(entry);
    _save(schedules);

    console.log('[MissionScheduler] Scheduled:', entry.id, cronExpression);

    if (typeof AuditLog !== 'undefined') {
      AuditLog.log('schedule_mission', { id: entry.id, cron: cronExpression, title: entry.template.title });
    }

    return entry.id;
  }

  /* ── Remove a schedule ── */
  function unschedule(scheduleId) {
    if (!scheduleId) return false;
    const schedules = _load();
    const idx = schedules.findIndex(s => s.id === scheduleId);
    if (idx === -1) return false;

    schedules.splice(idx, 1);
    _save(schedules);

    console.log('[MissionScheduler] Unscheduled:', scheduleId);

    if (typeof AuditLog !== 'undefined') {
      AuditLog.log('unschedule_mission', { id: scheduleId });
    }

    return true;
  }

  /* ── List all schedules ── */
  function list() {
    return _load();
  }

  /* ── Enable/disable a schedule without removing it ── */
  function setEnabled(scheduleId, enabled) {
    const schedules = _load();
    const entry = schedules.find(s => s.id === scheduleId);
    if (!entry) return false;
    entry.enabled = !!enabled;
    _save(schedules);
    return true;
  }

  /* ── Check and fire due missions ── */
  async function check() {
    const user = (typeof State !== 'undefined') ? State.get('user') : null;
    if (!user) return;

    const now = new Date();
    const schedules = _load();
    let changed = false;

    // Every Run needs a Spaceship. Resolve once per check pass — if the
    // user has no ship, no schedule can fire. The localStorage scheduler
    // is going away soon (server-side pg_cron on missions.schedule per
    // the ontology migration); until then, fail quietly when no ship.
    const spaceships = (typeof State !== 'undefined') ? (State.get('spaceships') || []) : [];
    const spaceshipId = spaceships[0]?.id;
    if (!spaceshipId) return;

    for (const entry of schedules) {
      if (!entry.enabled) continue;
      if (!_shouldFire(entry, now)) continue;

      // Mark as fired immediately to prevent double-fire
      entry.lastRun = now.toISOString();
      changed = true;

      // Create a new run in Supabase and State
      try {
        const task = {
          user_id: user.id,
          spaceship_id: spaceshipId,
          title: entry.template.title,
          status: 'queued',
          priority: entry.template.priority || 'medium',
          agent_id: entry.template.agent_id || null,
          agent_name: entry.template.agent_name || null,
          progress: 0,
          metadata: Object.assign({}, entry.template.metadata, {
            scheduled: true,
            schedule_id: entry.id,
            cron: entry.cron,
          }),
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        };

        let created = null;
        if (typeof SB !== 'undefined') {
          created = await SB.db('mission_runs').create(task);
        }

        const missionId = created?.id || ('local-' + Date.now());
        const mission = Object.assign({ id: missionId }, task);

        // Add to State.missions
        if (typeof State !== 'undefined') {
          const missions = State.get('missions') || [];
          missions.unshift(mission);
          State.set('missions', [...missions]);
        }

        console.log('[MissionScheduler] Fired scheduled mission:', entry.id, '->', missionId);

        if (typeof Notify !== 'undefined') {
          Notify.send({
            title: 'Scheduled Mission Started',
            message: entry.template.title,
            type: 'info',
          });
        }

        // Execute via MissionRunner
        if (typeof MissionRunner !== 'undefined' && created?.id) {
          MissionRunner.run(created.id).catch(err => {
            console.error('[MissionScheduler] MissionRunner.run failed:', err.message);
          });
        }

      } catch (err) {
        console.error('[MissionScheduler] Failed to fire schedule:', entry.id, err.message);
      }
    }

    if (changed) _save(schedules);
  }

  /* ── Start the periodic checker (every 60s) ── */
  function start() {
    if (_intervalId) return; // already running
    _intervalId = setInterval(check, 60000);
    console.log('[MissionScheduler] Started (checking every 60s)');
    // Run an immediate check on start
    check();
  }

  /* ── Stop the periodic checker ── */
  function stop() {
    if (_intervalId) {
      clearInterval(_intervalId);
      _intervalId = null;
      console.log('[MissionScheduler] Stopped');
    }
  }

  /* ── Describe a cron expression in human-readable form ── */
  function describe(cronExpression) {
    const parsed = _parseCron(cronExpression);
    if (!parsed) return 'Invalid schedule';

    const pad = n => String(n).padStart(2, '0');

    if (parsed.type === 'daily') {
      return 'Daily at ' + pad(parsed.hour) + ':' + pad(parsed.minute);
    }
    if (parsed.type === 'weekly') {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return 'Every ' + dayNames[parsed.day] + ' at ' + pad(parsed.hour) + ':' + pad(parsed.minute);
    }
    if (parsed.type === 'interval') {
      return 'Every ' + parsed.hours + ' hour' + (parsed.hours === 1 ? '' : 's');
    }
    return 'Unknown schedule';
  }

  // Legacy sync-to/from-mission_runs via status='scheduled' removed —
  // the new CHECK constraint on mission_runs.status doesn't allow
  // 'scheduled', and the real server-side scheduler is pg_cron on
  // missions.schedule (follow-up PR). No-op stubs keep existing callers
  // from ReferenceError'ing during the transition.
  const syncToServer = async () => {};
  const syncFromServer = async () => {};

  return { schedule, unschedule, list, setEnabled, check, start, stop, describe, syncToServer, syncFromServer };
})();
