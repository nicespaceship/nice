/**
 * CSelect (lib/cselect.js): the styleable dropdown. Pinned here: the menu
 * opens below its trigger, and above it when there is no room below (a
 * prompt bar at the foot of the screen).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { installViewMocks, loadModule } from './helpers/view-harness.js';

installViewMocks();
if (!window.matchMedia) window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
loadModule('lib/cselect.js');

function mountAt(top) {
  document.body.innerHTML = CSelect.html('cs', 'Model', [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], 'a');
  const root = document.getElementById('cs');
  const trigger = root.querySelector('.bp-cselect-trigger');
  const menu = root.querySelector('.bp-cselect-menu');
  trigger.getBoundingClientRect = () => ({ top, bottom: top + 30, left: 100, right: 200, width: 100, height: 30 });
  Object.defineProperty(menu, 'offsetHeight', { configurable: true, get: () => (menu.hidden ? 0 : 120) });
  Object.defineProperty(menu, 'offsetWidth', { configurable: true, get: () => 160 });
  CSelect.mount('cs', () => {});
  trigger.click();
  return menu;
}

beforeEach(() => {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
});

describe('CSelect', () => {
  it('opens below a trigger with room under it', () => {
    const menu = mountAt(100);
    expect(menu.hidden).toBe(false);
    expect(menu.style.top).toBe('134px');
  });

  it('opens above a trigger at the foot of the screen', () => {
    const menu = mountAt(740);
    expect(menu.style.top).toBe(740 - 4 - 120 + 'px');
  });
});
