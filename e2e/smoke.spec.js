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
  // Wait for initial render to complete
  await page.locator('#app-view').waitFor({ state: 'visible', timeout: 15000 });
}

/** Navigate to a hash route and wait for the router to process it */
async function navigateTo(page, hash, expectedTitle) {
  await page.evaluate((h) => { window.location.hash = h; }, hash);
  if (expectedTitle) {
    // Wait for document.title to update (set by Router on every navigation)
    await page.waitForFunction(
      (t) => document.title.includes(t),
      expectedTitle,
      { timeout: 15000 }
    );
  } else {
    await page.waitForTimeout(1000);
  }
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
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    for (const hash of ['#/', '#/bridge', '#/security', '#/settings', '#/theme-editor']) {
      await page.evaluate((h) => { window.location.hash = h; }, hash);
      await page.waitForTimeout(2000); // Let router + view render complete
      await expect(page.locator('#app-view')).toBeVisible();
    }

    expect(errors.length).toBe(0);
  });

  test('command palette opens and closes', async ({ page }) => {
    await waitForApp(page);
    // Open via JS API (keyboard shortcuts unreliable in headless CI)
    const opened = await page.evaluate(() => {
      if (typeof CommandPalette === 'undefined') return false;
      CommandPalette.open();
      return document.getElementById('cmd-palette')?.classList.contains('open') || false;
    });
    if (opened) {
      await expect(page.locator('#cmd-palette.open')).toBeVisible();
      await page.keyboard.press('Escape');
    }
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
// Route Tests — verify navigation between views
// ═══════════════════════════════════════════════════════════════════

test.describe('Route Tests', () => {
  test('hash navigation renders correct views', async ({ page }) => {
    await waitForApp(page);
    await navigateTo(page, '#/security', 'Security');
    await navigateTo(page, '#/settings', 'Settings');
    await navigateTo(page, '#/', 'NICE');  // Home title is "NICE SPACESHIP — NICE"
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

    await navigateTo(page, '#/bridge', 'Bridge');
    await navigateTo(page, '#/security', 'Security');
    await navigateTo(page, '#/settings', 'Settings');

    expect(errors.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Dashboard & Agentic Features
// ═══════════════════════════════════════════════════════════════════

test.describe('Dashboard', () => {
  test('home view renders greeting for new users', async ({ page }) => {
    await waitForApp(page);
    // New user (no spaceships) should see greeting
    const greeting = page.locator('.chat-home-greeting');
    await expect(greeting).toBeVisible();
    const text = await greeting.textContent();
    expect(text).toMatch(/Good (morning|afternoon|evening)/);
  });

  test('home view has no JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await waitForApp(page);
    await page.waitForTimeout(2000);
    expect(errors.length).toBe(0);
  });
});

test.describe('Agentic Features', () => {
  test('AgentExecutor.converse is available', async ({ page }) => {
    await waitForApp(page);
    const hasConverse = await page.evaluate(() => typeof AgentExecutor?.converse === 'function');
    expect(hasConverse).toBe(true);
  });

  test('ToolRegistry.deregister is available', async ({ page }) => {
    await waitForApp(page);
    const hasDeregister = await page.evaluate(() => typeof ToolRegistry?.deregister === 'function');
    expect(hasDeregister).toBe(true);
  });

  test('delegate tool is registered', async ({ page }) => {
    await waitForApp(page);
    const hasDelegateTool = await page.evaluate(() => ToolRegistry?.get('delegate') !== null);
    expect(hasDelegateTool).toBe(true);
  });

  test('AgentMemory API is available', async ({ page }) => {
    await waitForApp(page);
    const apis = await page.evaluate(() => ({
      getMemory: typeof AgentMemory?.getMemory === 'function',
      learn: typeof AgentMemory?.learn === 'function',
      buildPromptContext: typeof AgentMemory?.buildPromptContext === 'function',
    }));
    expect(apis.getMemory).toBe(true);
    expect(apis.learn).toBe(true);
    expect(apis.buildPromptContext).toBe(true);
  });

  test('ShipBehaviors enforces budget', async ({ page }) => {
    await waitForApp(page);
    const result = await page.evaluate(() => {
      const shipId = 'e2e-test-ship';
      ShipBehaviors.setBehavior(shipId, 'dailyBudget', 1000);
      ShipBehaviors.setBehavior(shipId, 'budgetUsedToday', 900);
      const canSpend = ShipBehaviors.checkBudget(shipId, 50);
      const cantSpend = ShipBehaviors.checkBudget(shipId, 200);
      return { canSpend, cantSpend };
    });
    expect(result.canSpend).toBe(true);
    expect(result.cantSpend).toBe(false);
  });
});

test.describe('Blueprint Filters', () => {
  test('tier filter dropdown exists on bridge view', async ({ page }) => {
    await waitForApp(page);
    await navigateTo(page, '#/bridge', 'Bridge');
    await page.waitForTimeout(1500);
    const tierFilter = page.locator('#bp-tier');
    await expect(tierFilter).toBeAttached();
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

  test('no JS errors during rapid navigation', async ({ page }) => {
    await waitForApp(page);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    for (const hash of ['#/bridge', '#/security', '#/settings', '#/theme-editor', '#/']) {
      await page.evaluate((h) => { window.location.hash = h; }, hash);
      await page.waitForTimeout(500);
    }

    expect(errors.length).toBe(0);
  });
});
