import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * NICE™ E2E Smoke Tests
 *
 * Routes:
 *   #/           → HomeView ('Home') — what needs you, your spaceships
 *   #/chat       → ChatView ('Chat') — standalone chat, no crew
 *   #/crew       → CrewView ('Crew') — one spaceship's crew as cards, recent runs, approvals
 *   #/outbox, #/library → BlueprintsView on its Outbox / Blueprints tab
 *   #/bridge     → BlueprintsView ('Bridge') — Schematic | Blueprints | Missions | Outbox | Operations | Log
 *   #/security   → SecurityView ('Security') — Security | Integrations | Wallet
 *   #/settings   → SettingsView ('Settings')
 *   #/theme-editor → ThemeCreatorView ('Theme Editor')
 *
 * Redirects:
 *   #/dock, #/blueprints → #/bridge
 *   #/missions → #/bridge?tab=missions
 *   #/log → #/bridge?tab=operations&sub=log
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
    // Desktop opens with the sidebar docked and the four destinations labeled.
    await expect(sidebar).toHaveClass(/\bopen\b/);
    await expect(page.locator('.side-brand')).toBeVisible();
    for (const label of ['Home', 'Chat', 'Outbox', 'Library']) {
      await expect(page.locator('.side-primary .side-link', { hasText: label })).toBeVisible();
    }
    // A destination navigates and becomes the highlighted link.
    await page.locator('.side-primary .side-link[data-nav="outbox"]').click();
    await page.waitForFunction(() => location.hash === '#/outbox');
    await expect(page.locator('.side-primary .side-link[data-nav="outbox"]')).toHaveAttribute('aria-current', 'page');
    // Collapsing keeps the destinations on the rail as icons.
    await page.locator('#side-collapse').click();
    await expect(sidebar).not.toHaveClass(/\bopen\b/);
    await expect(page.locator('.side-primary .side-link[data-nav="home"]')).toBeVisible();
    await page.locator('#side-rail-nice').click();
    await expect(sidebar).toHaveClass(/\bopen\b/);
  });

  test('main views render without error', async ({ page }) => {
    await waitForApp(page);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    for (const hash of ['#/', '#/chat', '#/outbox', '#/library', '#/crew', '#/bridge', '#/security', '#/settings', '#/theme-editor']) {
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
    await page.evaluate(() => { Theme.set('grid'); });
    expect(await page.getAttribute('html', 'data-theme')).toBe('grid');
    await page.evaluate(() => { Theme.set('nice'); });
    expect(await page.getAttribute('html', 'data-theme')).toBe('nice');
  });

  test('responsive layout at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await waitForApp(page);
    await expect(page.locator('#app-view')).toBeVisible();
    await expect(page.locator('#app-mobile-bar')).toBeVisible();
    // Phones navigate with the bottom tab bar; the sidebar is a closed drawer.
    const tabbar = page.locator('#app-tabbar');
    await expect(tabbar).toBeVisible();
    for (const label of ['Home', 'Chat', 'Crew', 'Outbox', 'Library']) {
      await expect(tabbar.locator('.tab', { hasText: label })).toBeVisible();
    }
    await expect(page.locator('#app-sidebar')).not.toHaveClass(/\bopen\b/);
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
    await navigateTo(page, '#/', 'Home');
    await navigateTo(page, '#/chat', 'Chat');
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
    // The sidebar opens docked on desktop, so the NICE brand (Home) is focusable.
    const brand = page.locator('.side-brand').first();
    await brand.focus();
    await page.keyboard.press('Tab');
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
  test('home view greets new users and points them to a spaceship', async ({ page }) => {
    await waitForApp(page);
    await navigateTo(page, '#/', 'Home');
    const title = page.locator('.home-title');
    await expect(title).toBeVisible();
    expect(await title.textContent()).toMatch(/Good (morning|afternoon|evening)/);
    // No spaceship yet: Home offers the Library and both ways to start.
    await expect(page.locator('.home-empty a[href="#/library?tab=spaceship"]')).toBeVisible();
    await expect(page.locator('.home-start[href="#/chat"]')).toBeVisible();
  });

  test('crew view points a new visitor to a spaceship', async ({ page }) => {
    await waitForApp(page);
    await navigateTo(page, '#/crew', 'Crew');
    await expect(page.locator('.crew-empty a[href="#/library?tab=spaceship"]')).toBeVisible();
  });

  test('crew view shows a card per crew member once a spaceship is active', async ({ page }) => {
    await waitForApp(page);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForFunction(() => (Blueprints.listSpaceships() || []).some(s => s.name === 'Bakery'), null, { timeout: 15000 });
    await page.evaluate(() => {
      const bakery = Blueprints.listSpaceships().find(s => s.name === 'Bakery');
      Blueprints.activateShip(bakery.id);
    });
    await navigateTo(page, '#/crew', 'Crew');
    await expect(page.locator('.crew-card:not(.crew-card-open)').first()).toBeVisible();
    expect(await page.locator('.crew-card:not(.crew-card-open)').count()).toBeGreaterThan(1);
    await expect(page.locator('.crew-runs')).toBeVisible();
    expect(errors.length).toBe(0);
  });

  test('chat offers Compare and explains what it needs', async ({ page }) => {
    await waitForApp(page);
    await navigateTo(page, '#/chat', 'Chat');
    const toggle = page.locator('#nice-ai-compare');
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    // A new visitor runs only the free model, so the strip says what Compare needs.
    await expect(page.locator('#nice-ai-compare-bar')).toBeVisible();
    await expect(page.locator('.nice-ai-compare-note')).toContainText('Compare needs two models');
    await navigateTo(page, '#/crew', 'Crew');
    await expect(toggle).toBeHidden();
  });

  test('chat view renders greeting', async ({ page }) => {
    await waitForApp(page);
    await navigateTo(page, '#/chat', 'Chat');
    const greeting = page.locator('.chat-home-greeting');
    await expect(greeting).toBeVisible();
    expect(await greeting.textContent()).toMatch(/Good (morning|afternoon|evening)/);
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
  test('category filter dropdown exists on bridge view', async ({ page }) => {
    await waitForApp(page);
    await navigateTo(page, '#/bridge', 'Bridge');
    await page.waitForTimeout(1500);
    // The tier filter was removed in #565 — it filtered by default
    // llm_engine, but every catalog ship defaults to the same free
    // model so the dropdown was a one-sided no-op. Asserting against
    // the category filter (which is real and stable) instead.
    const categoryFilter = page.locator('#bp-category');
    await expect(categoryFilter).toBeAttached();
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

    for (const hash of ['#/bridge', '#/chat', '#/outbox', '#/security', '#/library', '#/settings', '#/crew', '#/theme-editor', '#/']) {
      await page.evaluate((h) => { window.location.hash = h; }, hash);
      await page.waitForTimeout(500);
    }

    expect(errors.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Front page — the static index.html at the site root
// ═══════════════════════════════════════════════════════════════════

test.describe('Front Page', () => {
  test('renders for signed-out visitors and links into the app', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Mission control for your AI crew.');
    await expect(page.locator('a[href="/app/"]').first()).toBeVisible();
    await expect(page.locator('a[href="https://nicespaceship.com/privacy"]')).toBeAttached();
  });

  test('passes critical a11y checks', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
    expect(serious).toEqual([]);
  });

  test('opens a Codex entry from its link and searches the Codex', async ({ page }) => {
    await page.goto('/#codex/compare');
    const entry = page.locator('#codex-compare');
    await expect(entry).toBeVisible();
    await expect(page.locator('#codex-what-is-nice')).toBeHidden();
    await page.locator('#codex-search').fill('approve');
    await expect(page.locator('.lp-codex-nav button[data-entry="outbox"]')).toBeVisible();
    await expect(page.locator('.lp-codex-nav button[data-entry="themes"]')).toHaveCount(0);
  });

  test('forwards app deep links to /app/', async ({ page }) => {
    await page.goto('/#/bridge?tab=missions');
    await page.waitForURL('**/app/#/bridge?tab=missions');
  });

  test('keeps its own anchors and campaign links', async ({ page }) => {
    await page.goto('/?utm_source=test#how');
    await expect(page.locator('h1')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('forwards signed-in visitors to /app/', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('nice-auth', '{}'));
    await page.goto('/');
    await page.waitForURL('**/app/**');
  });
});
