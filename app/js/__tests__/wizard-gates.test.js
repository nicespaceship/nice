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

describe('ShipSetupWizard.open — no rank gate', () => {
  let notices;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    notices = [];
    globalThis.Blueprints = {
      isShipActivated: () => false,
      canActivateNewShip: () => true,
    };
    globalThis.Notify = { send: (n) => notices.push(n) };
    globalThis.UpgradeModal = { open: () => {} };
    document.querySelectorAll('.wizard-overlay').forEach(el => el.remove());
  });

  // open() is once-per-module while its private _overlay is set, so each
  // case closes AND flushes the 200ms teardown timer before the next runs.
  for (const rarity of ['Rare', 'Legendary', 'Mythic']) {
    it(`opens the wizard for a ${rarity} catalog ship`, async () => {
      ShipSetupWizard.open({ id: 'bp-' + rarity, rarity, name: rarity + ' Ship' });
      expect(notices.length).toBe(0);
      expect(document.querySelector('.wizard-overlay')).toBeTruthy();
      ShipSetupWizard.close();
      await new Promise(r => setTimeout(r, 250));
      expect(document.querySelector('.wizard-overlay')).toBeNull();
    });
  }
});
