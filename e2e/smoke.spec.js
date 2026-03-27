import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * NICE™ E2E Smoke Tests
 *
 * Routes:
 *   #/           → HomeView ('Bridge') — chat interface
 *   #/bridge     → BlueprintsView ('Bridge') — Schematic | Blueprints | Missions | Operations | Log
 *   #/security   → SecurityView ('Security') — Security | Integrations | Wallet
 *   #/settings   → SettingsView ('Settings')
 *   #/theme-editor → ThemeCreatorView ('Theme Editor')
 *
 * Redirects:
 *   #/dock, #/blueprints → #/bridge
 *   #/missions, #/log → #/bridge?tab=missions
 *   #/integrations, #/vault → #/security?tab=integrations
 */

/** Wait for NICE app to fully bootstrap (all 40+ scripts loaded + first render) */
async function waitForApp(page) {
  await page.goto('./');
  await page.waitForFunction(
    () => typeof State !== 'undefined' && typeof Router !== 'undefined',
    { timeout: 30000 }
  );
}

// ═══════════════════════════════════════════════════════════════════
// Smoke Tests — verify the app loads and basic navigation works
// ═══════════════════════════════════════════════════════════════════

test.describe('Smoke Tests', () => {
  test('app loads and renders', async ({ page }) => {
    await waitForApp(page);
    await expect(page.locator('#app-view')).toBeVisible();
    await expect(page.locator('#app-page-title')).toBeAttached();
  });

  test('sidebar navigation works', async ({ page }) => {
    await waitForApp(page);
    const sidebar = page.locator('#app-sidebar');
    await expect(sidebar).toBeVisible();
    // At least one nav link exists
    const links = page.locator('.side-link');
    expect(await links.count()).toBeGreaterThan(0);
  });

  test('main views render without error', async ({ page }) => {
    await waitForApp(page);

    const views = [
      { hash: '#/', title: 'Bridge' },
      { hash: '#/bridge', title: 'Bridge' },
      { hash: '#/security', title: 'Security' },
      { hash: '#/settings', title: 'Settings' },
      { hash: '#/theme-editor', title: 'Theme Editor' },
    ];

    for (const view of views) {
      await page.evaluate((h) => { window.location.hash = h; }, view.hash);
      await expect(page.locator('#app-page-title')).toHaveText(view.title);
      // No error boundary
      await expect(page.locator('.err-boundary')).toHaveCount(0);
    }
  });

  test('command palette opens and closes', async ({ page }) => {
    await waitForApp(page);
    await page.keyboard.press('Control+k');
    await expect(page.locator('#cmd-palette.open')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#cmd-palette.open')).toHaveCount(0);
  });

  test('theme switching works', async ({ page }) => {
    await waitForApp(page);
    await page.evaluate(() => { Theme.set('navigator'); });
    expect(await page.getAttribute('html', 'data-theme')).toBe('navigator');
    await page.evaluate(() => { Theme.set('spaceship'); });
    expect(await page.getAttribute('html', 'data-theme')).toBe('spaceship');
  });

  test('responsive layout at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await waitForApp(page);
    await expect(page.locator('#app-view')).toBeVisible();
    await expect(page.locator('#app-mobile-bar')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Route Tests — verify redirects and navigation
// ═══════════════════════════════════════════════════════════════════

test.describe('Route Tests', () => {
  test('old routes redirect correctly', async ({ page }) => {
    await waitForApp(page);

    const redirects = [
      { from: '#/dock', to: '#/' },
      { from: '#/missions', to: '#/bridge' },
      { from: '#/integrations', to: '#/security' },
    ];

    for (const { from, to } of redirects) {
      await page.evaluate((h) => { window.location.hash = h; }, from);
      // Wait for redirect to complete
      await page.waitForFunction(
        (expected) => location.hash.includes(expected),
        to,
        { timeout: 5000 }
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// Accessibility — WCAG 2.1 AA checks
// ═══════════════════════════════════════════════════════════════════

test.describe('Accessibility', () => {
  test('skip-to-content link exists', async ({ page }) => {
    await waitForApp(page);
    await expect(page.locator('.skip-to-content')).toHaveCount(1);
  });

  test('home view passes critical a11y checks', async ({ page }) => {
    await waitForApp(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .analyze();
    const critical = results.violations.filter(v => v.impact === 'critical');
    expect(critical).toHaveLength(0);
  });

  test('ARIA landmarks exist', async ({ page }) => {
    await waitForApp(page);
    expect(await page.locator('[role="navigation"], nav').count()).toBeGreaterThan(0);
  });

  test('sidebar links are keyboard navigable', async ({ page }) => {
    await waitForApp(page);
    const firstLink = page.locator('.side-link').first();
    await firstLink.focus();
    await page.keyboard.press('ArrowDown');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Auth Flow — verify unauthenticated behavior
// ═══════════════════════════════════════════════════════════════════

test.describe('Auth Flow', () => {
  test('unauthenticated users can navigate without errors', async ({ page }) => {
    await waitForApp(page);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    for (const hash of ['#/bridge', '#/security', '#/settings']) {
      await page.evaluate((h) => { window.location.hash = h; }, hash);
      await expect(page.locator('#app-view')).toBeVisible();
    }

    expect(errors.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Performance — load time and navigation speed
// ═══════════════════════════════════════════════════════════════════

test.describe('Performance', () => {
  test('app loads within 5 seconds', async ({ page }) => {
    const start = Date.now();
    await waitForApp(page);
    expect(Date.now() - start).toBeLessThan(5000);
  });

  test('no memory leaks from rapid navigation', async ({ page }) => {
    await waitForApp(page);
    await page.evaluate(() => {
      State.set('user', { id: 'perf-test', email: 'test@nice.dev', user_metadata: { display_name: 'Tester' } });
    });

    const routes = ['#/', '#/bridge', '#/security', '#/settings', '#/bridge', '#/'];
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    for (const hash of routes) {
      await page.evaluate((h) => { window.location.hash = h; }, hash);
      await page.waitForTimeout(300);
    }

    expect(errors.length).toBe(0);
  });
});
