import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Self-load the two wizard modules with the same const→global trick the
// shared harness uses (they are not in setup.js's global load list).
const __dir = dirname(fileURLToPath(import.meta.url));
function loadScriptGlobal(relativePath) {
  let code = readFileSync(resolve(__dir, '..', relativePath), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  // Indirect eval so the rewritten globals land on globalThis.
  (0, eval)(code);
}

loadScriptGlobal('lib/setup-wizard.js');
loadScriptGlobal('lib/ship-setup-wizard.js');

describe('SetupWizard.shouldShow — session-scoped skip', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('shows for a fresh user', () => {
    expect(SetupWizard.shouldShow()).toBe(true);
  });

  it('a skip silences the wizard for this session only', () => {
    SetupWizard.skip();
    expect(SetupWizard.shouldShow()).toBe(false);
    // Skip must never set the permanent completion flag.
    expect(localStorage.getItem(Utils.KEYS.onboarded)).toBeNull();
    // A new session (sessionStorage gone) re-offers the wizard.
    sessionStorage.clear();
    expect(SetupWizard.shouldShow()).toBe(true);
  });

  it('completion is permanent', () => {
    localStorage.setItem(Utils.KEYS.onboarded, '1');
    expect(SetupWizard.shouldShow()).toBe(false);
    sessionStorage.clear();
    expect(SetupWizard.shouldShow()).toBe(false);
  });
});

describe('ShipSetupWizard.open — rarity gate', () => {
  let notices;
  let upgradeOpened;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    notices = [];
    upgradeOpened = false;
    globalThis.Blueprints = {
      isShipActivated: () => false,
      canActivateNewShip: () => true,
    };
    globalThis.Gamification = {
      isRarityUnlocked: (r) => r === 'Common' || r === 'Rare',
    };
    globalThis.Notify = { send: (n) => notices.push(n) };
    globalThis.UpgradeModal = { open: () => { upgradeOpened = true; } };
    document.querySelectorAll('.wizard-overlay').forEach(el => el.remove());
  });

  it('blocks a locked-rarity catalog ship and offers the upgrade path', () => {
    ShipSetupWizard.open({ id: 'bp-x', rarity: 'Legendary', name: 'Test Ship' });
    expect(document.querySelector('.wizard-overlay')).toBeNull();
    expect(notices.length).toBe(1);
    expect(notices[0].title).toBe('Rank required');
    expect(upgradeOpened).toBe(true);
  });

  it('blocks Mythic with rank-only copy and no upgrade modal', () => {
    ShipSetupWizard.open({ id: 'bp-y', rarity: 'Mythic', name: 'Apex Ship' });
    expect(document.querySelector('.wizard-overlay')).toBeNull();
    expect(notices[0].message).toContain('Admiral');
    expect(upgradeOpened).toBe(false);
  });

  it('lets an unlocked rarity through the gate', async () => {
    // Rare passes the stubbed gate; the wizard proceeds to build its overlay.
    // NOTE: open() is once-per-module while its private _overlay is set, so
    // this test closes AND flushes the 200ms teardown timer; any test added
    // after this one depends on that flush having run.
    ShipSetupWizard.open({ id: 'bp-z', rarity: 'Rare', name: 'Starter Ship' });
    expect(notices.length).toBe(0);
    const overlay = document.querySelector('.wizard-overlay');
    expect(overlay).toBeTruthy();
    ShipSetupWizard.close();
    await new Promise(r => setTimeout(r, 250));
    expect(document.querySelector('.wizard-overlay')).toBeNull();
  });
});
