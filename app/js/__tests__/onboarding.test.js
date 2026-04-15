import { describe, it, expect, beforeEach } from 'vitest';

// Onboarding, AuditLog, and State are loaded globally by setup.js.

const FRESH_USER = {
  id: 'user-fresh-1',
  email: 'fresh@example.com',
  created_at: new Date().toISOString(),
};

const OLD_USER = {
  id: 'user-old-1',
  email: 'old@example.com',
  created_at: new Date(Date.now() - 30 * 86400e3).toISOString(), // 30 days old
};

function onboardingEvents() {
  return AuditLog.getEntries({ limit: 50 })
    .filter(e => String(e.action || '').startsWith('onboarding.'));
}

describe('Onboarding', () => {
  beforeEach(() => {
    // setup.js already resets localStorage and State before each test,
    // but re-init so fresh listeners are attached for every case.
    Onboarding.init();
  });

  it('exposes canonical event names and an ordered funnel', () => {
    expect(Onboarding.EVENTS.SIGNUP_COMPLETE).toBe('onboarding.signup_complete');
    expect(Onboarding.EVENTS.FIRST_MISSION_COMPLETE).toBe('onboarding.first_mission_complete');
    // Funnel steps should be in order and all prefixed with onboarding.
    const names = Onboarding.FUNNEL_STEPS.map(s => s.event);
    expect(names[0]).toBe(Onboarding.EVENTS.SIGNUP_COMPLETE);
    expect(names[names.length - 1]).toBe(Onboarding.EVENTS.FIRST_MISSION_COMPLETE);
    names.forEach(n => expect(n.startsWith('onboarding.')).toBe(true));
  });

  it('track() is a no-op when no user is signed in', () => {
    Onboarding.track(Onboarding.EVENTS.WIZARD_START);
    expect(onboardingEvents()).toHaveLength(0);
  });

  it('emits signup_complete exactly once for a fresh user', () => {
    State.set('user', FRESH_USER);
    State.set('user', FRESH_USER); // duplicate state write should not re-fire
    const events = onboardingEvents();
    const signups = events.filter(e => e.action === Onboarding.EVENTS.SIGNUP_COMPLETE);
    expect(signups).toHaveLength(1);
    expect(signups[0].details.email).toBe(FRESH_USER.email);
    expect(signups[0].details.userId).toBe(FRESH_USER.id);
  });

  it('does not backfill signup_complete for accounts older than the backfill window', () => {
    State.set('user', OLD_USER);
    const signups = onboardingEvents().filter(e => e.action === Onboarding.EVENTS.SIGNUP_COMPLETE);
    expect(signups).toHaveLength(0);
  });

  it('emits first_spaceship the first time user_spaceships goes non-empty', () => {
    State.set('user', FRESH_USER);
    State.set('user_spaceships', []);             // still zero
    State.set('user_spaceships', [{ id: 'ship-1' }]); // first ship!
    State.set('user_spaceships', [{ id: 'ship-1' }, { id: 'ship-2' }]); // second ship — no new event

    const ships = onboardingEvents().filter(e => e.action === Onboarding.EVENTS.FIRST_SPACESHIP);
    expect(ships).toHaveLength(1);
    expect(ships[0].details.ship_count).toBe(1);
  });

  it('emits first_mission_start then first_mission_complete based on mission status', () => {
    State.set('user', FRESH_USER);

    // Queued missions — nothing should fire yet
    State.set('missions', [{ id: 'm1', status: 'queued' }]);
    expect(onboardingEvents().some(e => e.action === Onboarding.EVENTS.FIRST_MISSION_START)).toBe(false);

    // Running — start fires, complete doesn't
    State.set('missions', [{ id: 'm1', status: 'running' }]);
    const afterStart = onboardingEvents();
    expect(afterStart.some(e => e.action === Onboarding.EVENTS.FIRST_MISSION_START)).toBe(true);
    expect(afterStart.some(e => e.action === Onboarding.EVENTS.FIRST_MISSION_COMPLETE)).toBe(false);

    // Review/completed — complete fires exactly once
    State.set('missions', [{ id: 'm1', status: 'review' }]);
    State.set('missions', [{ id: 'm1', status: 'completed' }]);
    const completes = onboardingEvents().filter(e => e.action === Onboarding.EVENTS.FIRST_MISSION_COMPLETE);
    expect(completes).toHaveLength(1);
  });

  it('track() manual calls are deduped per user, per event', () => {
    State.set('user', FRESH_USER);
    Onboarding.track(Onboarding.EVENTS.WIZARD_START);
    Onboarding.track(Onboarding.EVENTS.WIZARD_START);
    Onboarding.track(Onboarding.EVENTS.WIZARD_COMPLETE, { ship_id: 'abc', agent_count: 3 });

    const wizardStarts = onboardingEvents().filter(e => e.action === Onboarding.EVENTS.WIZARD_START);
    const wizardCompletes = onboardingEvents().filter(e => e.action === Onboarding.EVENTS.WIZARD_COMPLETE);
    expect(wizardStarts).toHaveLength(1);
    expect(wizardCompletes).toHaveLength(1);
    expect(wizardCompletes[0].details.ship_id).toBe('abc');
    expect(wizardCompletes[0].details.agent_count).toBe(3);
  });

  it('switching users re-evaluates signup_complete for the new user', () => {
    State.set('user', FRESH_USER);
    // A second fresh user arrives in the same browser session
    const secondUser = { id: 'user-fresh-2', email: 'second@example.com', created_at: new Date().toISOString() };
    State.set('user', secondUser);

    const signups = onboardingEvents().filter(e => e.action === Onboarding.EVENTS.SIGNUP_COMPLETE);
    expect(signups).toHaveLength(2);
    expect(signups.map(s => s.details.userId).sort()).toEqual([FRESH_USER.id, secondUser.id].sort());
  });

  it('loadFunnel() returns unavailable when SB is not ready', async () => {
    const result = await Onboarding.loadFunnel('7d');
    // setup.js stubs SB with no isReady() — should be treated as unavailable
    expect(result.available).toBe(false);
    expect(result.steps).toHaveLength(Onboarding.FUNNEL_STEPS.length);
    result.steps.forEach(s => expect(s.count).toBe(0));
  });
});
