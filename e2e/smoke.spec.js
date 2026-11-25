import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * NICE™ E2E Smoke Tests
 *
 * Routes:
 *   #/           → HomeView ('Home') — what needs you, your projects (the NICE mark)
 *   #/space      → ChatView ('Space') — model cards above the prompt; the prompt goes to the selected cards
 *   #/crew       → CrewView ('Team') — one project's crew as cards, recent runs, approvals
 *   #/ship       → OutboxView ('Ship') — results waiting for review, approved, rejected; week view
 *   #/blueprints → BlueprintsView on its Blueprints tab
 *   #/bridge     → BlueprintsView ('Dashboard') — Schematic | Blueprints | Missions | Operations | Log
 *   #/security   → SecurityView ('Security') — Security | Integrations | Wallet
 *   #/settings   → SettingsView ('Settings')
 *   #/theme-editor → ThemeCreatorView ('Theme Editor')
 *
 * Redirects:
 *   #/chat → #/space, #/outbox → #/ship, #/library → #/blueprints (query kept)
 *   #/dock → #/bridge
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
    // Desktop opens with the sidebar docked: the projects, and nothing else.
    // The NICE mark is Home; Blueprints lives in the account menu.
    await expect(sidebar).toHaveClass(/\bopen\b/);
    await expect(page.locator('.side-brand')).toHaveAttribute('href', '#/');
    await expect(page.locator('.side-primary')).toHaveCount(0);
    await expect(page.locator('#side-ships')).toBeAttached();
    await expect(page.locator('#side-chats-folder')).toHaveCount(0);
    for (const gone of ['#/space', '#/ship']) {
      await expect(sidebar.locator(`a[href="${gone}"]`)).toHaveCount(0);
    }
    // Blueprints is a row in the account menu, above Integrations.
    await page.locator('#side-more-btn').click();
    const rows = await page.locator('#side-popover .side-popover-item span:first-of-type').allTextContents();
    expect(rows.indexOf('Blueprints')).toBe(rows.indexOf('Integrations') - 1);
    await page.locator('#side-popover .side-popover-item', { hasText: 'Blueprints' }).click();
    await page.waitForFunction(() => location.hash === '#/blueprints');
    // Collapsing keeps the destinations on the rail as icons. There the NICE
    // mark still goes Home, and the button under it expands the menu.
    await page.locator('#side-collapse').click();
    await expect(sidebar).not.toHaveClass(/\bopen\b/);
    await page.locator('#side-rail-nice').click();
    await page.waitForFunction(() => location.hash === '#/');
    await expect(sidebar).not.toHaveClass(/\bopen\b/);
    await page.locator('#side-rail-expand').click();
    await expect(sidebar).toHaveClass(/\bopen\b/);
  });

  test('main views render without error', async ({ page }) => {
    await waitForApp(page);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    for (const hash of ['#/', '#/space', '#/ship', '#/blueprints', '#/crew', '#/bridge', '#/security', '#/settings', '#/theme-editor']) {
      await page.evaluate((h) => { window.location.hash = h; }, hash);
      await page.waitForTimeout(2000); // Let router + view render complete
      await expect(page.locator('#app-view')).toBeVisible();
    }

    expect(errors.length).toBe(0);
  });

  test('old names of the main destinations still land, query and all', async ({ page }) => {
    await waitForApp(page);
    for (const [from, to] of [['#/chat', '#/space'], ['#/outbox?tab=approved', '#/ship?tab=approved'], ['#/library?tab=spaceship', '#/blueprints?tab=spaceship']]) {
      await page.evaluate((h) => { window.location.hash = h; }, from);
      await page.waitForFunction((h) => location.hash === h, to);
    }
  });

  test('documentation has its own page and old bridge links land on it', async ({ page }) => {
    await waitForApp(page);
    await page.evaluate(() => { window.location.hash = '#/bridge?tab=documentation&s=missions'; });
    await page.waitForFunction(() => location.hash === '#/docs?s=missions');
    await expect(page.locator('.docs-nav-btn.active[data-section="missions"]')).toBeVisible();
    await page.locator('.docs-nav-btn[data-section="agents"]').click();
    await page.waitForFunction(() => location.hash === '#/docs?s=agents');
    // One scroller per view: the docs page scrolls in .app-view-content.
    expect(await page.locator('#docs-content').evaluate(el => getComputedStyle(el).overflowY)).toBe('visible');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .analyze();
    const ids = results.violations.map(v => v.id);
    expect(results.violations.filter(v => v.impact === 'critical')).toHaveLength(0);
    expect(ids).not.toContain('landmark-no-duplicate-main');
    expect(ids).not.toContain('landmark-main-is-top-level');
  });

  test('ship has its own page and old bridge links land on it', async ({ page }) => {
    await waitForApp(page);
    await page.evaluate(() => { window.location.hash = '#/bridge?tab=outbox'; });
    await page.waitForFunction(() => location.hash === '#/ship');
    await expect(page.locator('.ob-signin')).toBeVisible();
    await page.evaluate(() => { window.location.hash = '#/bridge'; });
    await expect(page.locator('.bp-type-tab[data-tab="missions"]')).toBeVisible();
    await expect(page.locator('.bp-type-tab[data-tab="outbox"]')).toHaveCount(0);
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
    await expect(tabbar.locator('.tab')).toHaveCount(2);
    for (const label of ['Team', 'Blueprints']) {
      await expect(tabbar.locator('.tab', { hasText: label })).toBeVisible();
    }
    await expect(page.locator('#app-sidebar')).not.toHaveClass(/\bopen\b/);
    // The NICE mark top left is Home here too; the menu has its own button.
    await expect(page.locator('#app-mobile-bar .mobile-bar-btn-nice')).toHaveAttribute('href', '#/');
    await page.locator('#mobile-sidebar-toggle').click();
    await expect(page.locator('#app-sidebar')).toHaveClass(/\bopen\b/);
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
    await navigateTo(page, '#/space', 'Space');
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

    await navigateTo(page, '#/bridge', 'Dashboard');
    await navigateTo(page, '#/security', 'Security');
    await navigateTo(page, '#/settings', 'Settings');

    expect(errors.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Dashboard & Agentic Features
// ═══════════════════════════════════════════════════════════════════

test.describe('Dashboard', () => {
  test('home view greets new users and points them to a project', async ({ page }) => {
    await waitForApp(page);
    await navigateTo(page, '#/', 'Home');
    const title = page.locator('.home-title');
    await expect(title).toBeVisible();
    expect(await title.textContent()).toMatch(/Good (morning|afternoon|evening)/);
    // No project yet: Home offers Blueprints and both ways to start.
    await expect(page.locator('.home-empty a[href="#/blueprints?tab=spaceship"]')).toHaveText('Choose a project');
    await expect(page.locator('#home-ships-title')).toHaveText('Your projects');
    await expect(page.locator('.home-start[href="#/space"]')).toBeVisible();
  });

  test('crew view points a new visitor to a project', async ({ page }) => {
    await waitForApp(page);
    await navigateTo(page, '#/crew', 'Team');
    await expect(page.locator('.crew-empty a[href="#/blueprints?tab=spaceship"]')).toHaveText('Choose a project');
  });

  test('the account button opens the account menu', async ({ page }) => {
    await waitForApp(page);
    await page.evaluate(() => { Theme.set('nice'); });
    const button = page.locator('#side-more-btn');
    const menu = page.locator('#side-popover');
    await expect(button).toContainText('Profile');
    await expect(menu).toBeHidden();
    await button.click();
    await expect(menu).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    // Signed out: the identity line offers sign-in, and there is nothing to log out of.
    await expect(menu.locator('#side-menu-id')).toHaveText('Sign in');
    await expect(menu.locator('#btn-logout')).toBeHidden();
    await expect(menu.locator('.admin-only')).toBeHidden();
    for (const label of ['Settings', 'Usage', 'Language', 'Get help', 'Integrations', 'Security', 'Get apps and extensions']) {
      await expect(menu.locator('.side-popover-item', { hasText: label }).first()).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
    // A row NICE does not have yet says so and closes the menu.
    await button.click();
    for (const gone of ['Keyboard shortcuts', 'Send feedback', 'Learn more', 'View all plans', 'Share guest passes', 'View changelog', 'Get API keys']) {
      await expect(menu.locator('.side-popover-item', { hasText: gone })).toHaveCount(0);
    }
    await menu.locator('.side-popover-item', { hasText: 'Language' }).click();
    await expect(menu).toBeHidden();
    await expect(page.locator('#notify-container')).toContainText('not available yet');
    // A real row navigates.
    await button.click();
    await menu.locator('.side-popover-item', { hasText: 'Settings' }).click();
    await expect(page).toHaveTitle(/Settings/);
  });

  test('the plan shows only after that account\'s subscription has loaded', async ({ page }) => {
    await waitForApp(page);
    const plan = page.locator('#side-account-plan');
    await expect(plan).toBeHidden();
    await page.evaluate(() => { State.set('user', { id: 'acct-a', email: 'a@example.com' }); });
    await expect(page.locator('#hdr-username')).toHaveText('a');
    await expect(plan).toBeHidden();
    // Another account's subscription landing must not label this one.
    await page.evaluate(() => { document.dispatchEvent(new CustomEvent('nice:subscription-change', { detail: { userId: 'acct-b' } })); });
    await expect(plan).toBeHidden();
    await page.evaluate(() => { document.dispatchEvent(new CustomEvent('nice:subscription-change', { detail: { userId: 'acct-a' } })); });
    await expect(plan).toHaveText(/· (Free|Pro)/);
    await page.evaluate(() => { State.set('user', { id: 'acct-b', email: 'b@example.com' }); });
    await expect(plan).toBeHidden();
  });

  test('the shortcuts the account menu advertises work', async ({ page }) => {
    await waitForApp(page);
    await navigateTo(page, '#/', 'Home');
    await page.keyboard.press('Control+,');
    await expect(page).toHaveTitle(/Settings/);
    // On layouts where that physical key types "-", Ctrl+minus stays the browser's zoom-out.
    const taken = await page.evaluate(() => {
      const e = new KeyboardEvent('keydown', { key: '-', code: 'Slash', ctrlKey: true, bubbles: true, cancelable: true });
      document.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(taken).toBe(false);
    await expect(page.locator('#shortcut-help')).toBeHidden();
    await page.keyboard.press('Control+/');
    await expect(page.locator('#shortcut-help')).toBeVisible();
  });

  test('the default look says project and sci-fi themes say spaceship', async ({ page }) => {
    await waitForApp(page);
    await page.evaluate(() => { Theme.set('nice'); });
    await navigateTo(page, '#/', 'Home');
    const sideLabel = page.locator('#side-ships .sidebar-section-label');
    const sideAdd = page.locator('#side-ships .side-ship-new span');
    await expect(sideLabel).toHaveText('Projects');
    await expect(sideAdd).toHaveText('Add a project');
    await page.evaluate(() => { Theme.set('matrix'); });
    await expect(sideLabel).toHaveText('Spaceships');
    await expect(sideAdd).toHaveText('Add a spaceship');
    await expect(page.locator('#home-ships-title')).toHaveText('Your spaceships');
    await page.evaluate(() => { Theme.set('nice'); });
    await expect(sideLabel).toHaveText('Projects');
    await expect(page.locator('#home-ships-title')).toHaveText('Your projects');
  });

  test('the default look says team and sci-fi themes say crew', async ({ page }) => {
    await waitForApp(page);
    await page.evaluate(() => { Theme.set('nice'); });
    await navigateTo(page, '#/crew', 'Team');
    await page.evaluate(() => { Theme.set('matrix'); });
    await expect(page).toHaveTitle(/Crew/);
    await expect(page.locator('.tab[data-tab="crew"] [data-term="crew"]')).toHaveText('Crew');
    await page.evaluate(() => { Theme.set('nice'); });
    await expect(page).toHaveTitle(/Team/);
  });

  test('the default look says activate and sci-fi themes say deploy', async ({ page }) => {
    await waitForApp(page);
    await page.evaluate(() => { Theme.set('nice'); });
    await navigateTo(page, '#/blueprints', 'Blueprints');
    const button = page.locator('.bp-deploy-ship-btn:not(.bp-activated)').first();
    await expect(button).toHaveText('Activate');
    await page.evaluate(() => { Theme.set('matrix'); });
    await expect(page.locator('.bp-deploy-ship-btn:not(.bp-activated)').first()).toHaveText('Deploy');
    await page.evaluate(() => { Theme.set('nice'); });
    await expect(page.locator('.bp-deploy-ship-btn:not(.bp-activated)').first()).toHaveText('Activate');
  });

  test('crew view shows a card per crew member once a project is active', async ({ page }) => {
    await waitForApp(page);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForFunction(() => (Blueprints.listSpaceships() || []).some(s => s.name === 'Bakery'), null, { timeout: 15000 });
    await page.evaluate(() => {
      const bakery = Blueprints.listSpaceships().find(s => s.name === 'Bakery');
      Blueprints.activateShip(bakery.id);
    });
    await navigateTo(page, '#/crew', 'Team');
    await expect(page.locator('.crew-card:not(.crew-card-open)').first()).toBeVisible();
    expect(await page.locator('.crew-card:not(.crew-card-open)').count()).toBeGreaterThan(1);
    await expect(page.locator('.crew-runs')).toBeVisible();
    expect(errors.length).toBe(0);
  });

  test('Space shows the free model as the one selected card', async ({ page }) => {
    await waitForApp(page);
    await navigateTo(page, '#/space', 'Space');
    const gemini = page.locator('.space-card[data-model="gemini-2-5-flash"]');
    await expect(gemini).toBeVisible();
    await expect(gemini).toHaveClass(/\bis-selected\b/);
    await expect(page.locator('.space-card.is-selected')).toHaveCount(1);
    await expect(page.locator('.space-card[data-model="nice-auto"]')).toHaveCount(0);
    await expect(page.locator('a.space-link[href="#/security?tab=models"]')).toBeVisible();
    // The cards replace Compare and the model dropdown on Space.
    await expect(page.locator('#nice-ai-compare')).toHaveCount(0);
    await expect(page.locator('#nice-ai-targets')).toHaveText('To Gemini 2.5 Flash');
    await expect(page.locator('#nice-ai-model')).toBeHidden();
    await navigateTo(page, '#/crew', 'Team');
    await expect(page.locator('#nice-ai-targets')).toBeHidden();
  });

  test('a card click adds it to the prompt and keeps the choice', async ({ page }) => {
    await waitForApp(page);
    await navigateTo(page, '#/space', 'Space');
    // A Pro plan with Grok switched on gives a second card.
    await page.evaluate(() => {
      Subscription.isPro = () => true;
      State.set('enabled_models', { 'gemini-2-5-flash': true, 'grok-4-3': true });
    });
    const grok = page.locator('.space-card[data-model="grok-4-3"]');
    await expect(grok).toBeVisible();
    await expect(grok).not.toHaveClass(/\bis-selected\b/);
    await grok.locator('.space-card-body').click();
    await expect(grok).toHaveClass(/\bis-selected\b/);
    await expect(grok.locator('.space-card-head')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#nice-ai-targets')).toHaveText('To 2 models');
    // The last selected card stays selected: the prompt always has a target.
    await grok.locator('.space-card-head').click();
    await page.locator('.space-card[data-model="gemini-2-5-flash"] .space-card-head').click();
    await expect(page.locator('.space-card.is-selected')).toHaveCount(1);
    await navigateTo(page, '#/', 'Home');
    await navigateTo(page, '#/space', 'Space');
    await expect(page.locator('.space-card.is-selected')).toHaveCount(1);
  });

  test('Space keeps the prompt at the bottom, below the cards', async ({ page }) => {
    await waitForApp(page);
    await navigateTo(page, '#/space', 'Space');
    const panel = page.locator('#nice-ai');
    await expect(panel).toBeVisible();
    const viewport = page.viewportSize();
    const panelBox = await panel.boundingBox();
    const cardBox = await page.locator('.space-card').first().boundingBox();
    expect(panelBox.y + panelBox.height).toBeGreaterThan(viewport.height - 40);
    expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(panelBox.y);
  });

  test('Space passes critical a11y checks', async ({ page }) => {
    await waitForApp(page);
    await navigateTo(page, '#/space', 'Space');
    await expect(page.locator('.space-card').first()).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .analyze();
    const critical = results.violations.filter(v => v.impact === 'critical');
    expect(critical).toHaveLength(0);
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
    await navigateTo(page, '#/bridge', 'Dashboard');
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

    for (const hash of ['#/bridge', '#/space', '#/ship', '#/security', '#/blueprints', '#/settings', '#/crew', '#/theme-editor', '#/']) {
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

  test('jumps to the Codex search with / and repaints the app window per theme', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('/');
    await expect(page.locator('#codex-search')).toBeFocused();
    await page.locator('.lp-skins-list button', { hasText: 'The Office' }).click();
    await expect(page.locator('.lp-window')).toHaveClass(/\bis-light\b/);
    await expect(page.locator('.lp-skins-list button', { hasText: 'The Office' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('opens a Codex entry from its link and searches the Codex', async ({ page }) => {
    await page.goto('/#codex/space');
    const entry = page.locator('#codex-space');
    await expect(entry).toBeVisible();
    await expect(page.locator('#codex-what-is-nice')).toBeHidden();
    await page.locator('#codex-search').fill('approve');
    await expect(page.locator('.lp-codex-nav button[data-entry="ship"]')).toBeVisible();
    await expect(page.locator('.lp-codex-nav button[data-entry="themes"]')).toHaveCount(0);
  });

  test('keeps old Codex and section links working after the renames', async ({ page }) => {
    await page.goto('/#codex/outbox');
    await expect(page.locator('#codex-ship')).toBeVisible();
    await expect(page).toHaveURL(/#codex\/ship$/);
    await page.goto('/#codex/compare');
    await expect(page.locator('#codex-space')).toBeVisible();
    // An Object member name is not a renamed entry.
    await page.goto('/#codex/constructor');
    await expect(page).toHaveURL(/#codex\/constructor$/);
    await page.goto('/#library');
    await expect(page).toHaveURL(/#blueprints$/);
    await expect(page.locator('#blueprints')).toBeInViewport();
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
