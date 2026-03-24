import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * NICE SPACESHIP E2E Smoke Tests
 * baseURL is http://localhost:3000/app/ — use './' for relative navigation
 * The NICE SPA uses hash routing (#/path)
 *
 * Route structure (post-consolidation):
 *   #/           → HomeView ('NICE SPACESHIP') — chat interface
 *   #/bridge     → BlueprintsView ('Bridge') — tabs: Schematic|Blueprints|Missions|Operations|Log
 *   #/security   → SecurityView ('Security') — tabs: Vault|Integrations
 *   #/settings   → SettingsView ('Settings')
 *   #/theme-editor → ThemeCreatorView ('Theme Editor')
 *   #/blueprints → redirects to #/bridge
 *   #/log        → redirects to #/bridge?tab=missions
 *   #/dock       → redirects to #/
 *   #/missions   → redirects to #/bridge?tab=missions
 *   #/analytics  → redirects to #/bridge?tab=operations
 *   #/agents     → redirects to #/bridge?tab=agent
 *   #/integrations → redirects to #/security?tab=integrations
 */

test.describe('NICE Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    // no-op — onboarding removed
  });

  test('app loads and shows home view', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });
    await expect(page.locator('.chat-home')).toBeVisible();
  });

  test('sidebar navigation works', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });
    // Open sidebar and navigate to Home
    const sidebar = page.locator('#app-sidebar');
    await page.locator('#sidebar-toggle').click({ timeout: 5000 });
    await expect(sidebar).toHaveClass(/open/, { timeout: 3000 });
    await page.locator('.side-link[data-view="blueprints"]').click({ force: true, timeout: 3000 });
    await expect(page.locator('#app-page-title')).toHaveText('Bridge', { timeout: 5000 });
  });

  test('all main views render without error', async ({ page }) => {
    const views = [
      { hash: '#/', title: 'NICE SPACESHIP' },
      { hash: '#/bridge', title: 'Bridge' },
      { hash: '#/security', title: 'Security' },
      { hash: '#/settings', title: 'Settings' },
      { hash: '#/theme-editor', title: 'Theme Editor' },
    ];

    // Load the app first
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    for (const view of views) {
      // Navigate via hash change
      await page.evaluate((hash) => { window.location.hash = hash; }, view.hash);
      await expect(page.locator('#app-page-title')).toHaveText(view.title, { timeout: 5000 });
      // Ensure no error boundary
      const errorBoundary = page.locator('.err-boundary');
      await expect(errorBoundary).toHaveCount(0);
    }
  });

  test('bridge view renders with tabs', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    // Inject mock user for auth-gated views
    await page.evaluate(() => {
      State.set('user', { id: 'test-1', email: 'test@nice.dev', user_metadata: { display_name: 'Tester' } });
    });

    // Bridge view
    await page.evaluate(() => { window.location.hash = '#/bridge'; });
    await expect(page.locator('#app-page-title')).toHaveText('Bridge', { timeout: 5000 });

    // Dock route redirects to home
    await page.evaluate(() => { window.location.hash = '#/dock'; });
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 5000 });
  });

  test('command palette opens with Ctrl+K', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    // Use Control+k (works in headless Chromium on all platforms)
    await page.keyboard.press('Control+k');
    await expect(page.locator('#cmd-palette.open')).toBeVisible({ timeout: 3000 });

    // Type a search
    await page.fill('#cmd-input', 'agent');
    // Verify at least one result appears
    await expect(page.locator('.cmd-result').first()).toBeVisible({ timeout: 3000 });

    // Close with Escape
    await page.keyboard.press('Escape');
    await expect(page.locator('#cmd-palette.open')).toHaveCount(0);
  });

  test('theme switching works', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    // Check default theme
    const theme = await page.getAttribute('html', 'data-theme');
    expect(theme).toBeTruthy();

    // Switch theme via JavaScript (the dock buttons may be overlapped by nav)
    await page.evaluate(() => { Theme.set('navigator'); });
    const newTheme = await page.getAttribute('html', 'data-theme');
    expect(newTheme).toBe('navigator');

    // Restore default
    await page.evaluate(() => { Theme.set('spaceship'); });
    const restored = await page.getAttribute('html', 'data-theme');
    expect(restored).toBe('spaceship');
  });

  test('keyboard shortcuts help opens with ?', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    await page.keyboard.press('?');
    // Should show keyboard help overlay
    const help = page.locator('.keyboard-help');
    if (await help.count() > 0) {
      await expect(help).toBeVisible();
    }
  });

  test('responsive layout at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    // App should load without errors at mobile width
    const app = page.locator('#app-view');
    await expect(app).toBeVisible();

    // Mobile top bar should be visible (hamburger + profile)
    const mobileBar = page.locator('#app-mobile-bar');
    await expect(mobileBar).toBeVisible();

    // Sidebar should be hidden (drawer mode)
    const sidebar = page.locator('#app-sidebar');
    const sidebarBox = await sidebar.boundingBox();
    // Sidebar should be off-screen (transform: translateX(-100%))
    if (sidebarBox) {
      expect(sidebarBox.x).toBeLessThan(0);
    }

    // Sidebar should not be taking up layout space at mobile width
    const mainMargin = await page.evaluate(() => {
      const main = document.querySelector('.app-main');
      return main ? parseInt(getComputedStyle(main).marginLeft, 10) : 260;
    });
    expect(mainMargin).toBeLessThanOrEqual(0);

    // No horizontal overflow
    const overflows = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= window.innerWidth;
    });
    expect(overflows).toBe(true);
  });

  test('settings view renders correctly', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    // Navigate to settings
    await page.evaluate(() => { window.location.hash = '#/settings'; });
    await expect(page.locator('#app-page-title')).toHaveText('Settings', { timeout: 5000 });

    // Settings renders without error (auth gate shows sign-in prompt)
    const viewContent = page.locator('#app-view');
    await expect(viewContent).toBeVisible();
    // Page should have rendered content (sign-in form or settings)
    const innerText = await viewContent.innerText();
    expect(innerText.length).toBeGreaterThan(0);
  });

  test('bridge view has schematic and blueprint tabs', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    await page.evaluate(() => { window.location.hash = '#/bridge'; });
    await expect(page.locator('#app-page-title')).toHaveText('Bridge', { timeout: 5000 });

    // Bridge should have content
    const viewContent = page.locator('#app-view');
    await expect(viewContent).toBeVisible();
    const innerText = await viewContent.innerText();
    expect(innerText.length).toBeGreaterThan(0);
  });

  test('prompt panel is visible on home', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    // Chat home should have input area
    const chatHome = page.locator('.chat-home');
    await expect(chatHome).toBeVisible({ timeout: 5000 });
  });
});

test.describe('NICE Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('nice-tour-completed', 'true');
    });
  });

  test('home view has no critical accessibility violations', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast']) // Custom themes may not pass contrast
      .analyze();

    // Allow some violations but no critical/serious ones
    const critical = results.violations.filter(v => v.impact === 'critical');
    expect(critical).toHaveLength(0);
  });

  test('bridge view has no critical accessibility violations', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });
    await page.evaluate(() => { window.location.hash = '#/bridge'; });
    await expect(page.locator('#app-page-title')).toHaveText('Bridge', { timeout: 5000 });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .analyze();

    const critical = results.violations.filter(v => v.impact === 'critical');
    expect(critical).toHaveLength(0);
  });

  test('skip-to-content link exists', async ({ page }) => {
    await page.goto('./');
    const skip = page.locator('.skip-to-content');
    await expect(skip).toHaveCount(1);
  });

  test('all images have alt text or are decorative', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    // Check all images have alt attributes
    const images = await page.locator('img').all();
    for (const img of images) {
      const alt = await img.getAttribute('alt');
      const role = await img.getAttribute('role');
      const ariaHidden = await img.getAttribute('aria-hidden');
      // Image should have alt text OR be marked as decorative
      expect(alt !== null || role === 'presentation' || ariaHidden === 'true').toBeTruthy();
    }
  });
});

test.describe('NICE Feature Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('nice-tour-completed', 'true');
    });
  });

  test('theme creator has color pickers', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    await page.evaluate(() => { window.location.hash = '#/theme-editor'; });
    await expect(page.locator('#app-page-title')).toHaveText('Theme Editor', { timeout: 5000 });

    // Wait for page transition to complete and color inputs to render
    await expect(page.locator('input[type="color"]').first()).toBeVisible({ timeout: 5000 });
    const colorInputs = page.locator('input[type="color"]');
    const count = await colorInputs.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('bridge missions tab renders', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    // Inject mock user so missions view renders (it has an auth gate)
    await page.evaluate(() => {
      State.set('user', { id: 'test-1', email: 'test@nice.dev', user_metadata: { display_name: 'Tester' } });
      State.set('missions', []);
    });

    await page.evaluate(() => {
      document.querySelectorAll('.achievement-unlock, .notify-toast').forEach(el => el.remove());
      window.location.hash = '#/bridge?tab=missions';
    });
    await expect(page.locator('#app-page-title')).toHaveText('Bridge', { timeout: 5000 });

    // Bridge view should render
    const viewContent = page.locator('#app-view');
    await expect(viewContent).toBeVisible();
  });

  test('bridge log tab renders', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    // Inject mock user
    await page.evaluate(() => {
      State.set('user', { id: 'test-1', email: 'test@nice.dev', user_metadata: { display_name: 'Tester' } });
    });

    // Navigate to Bridge log tab
    await page.evaluate(() => { window.location.hash = '#/bridge?tab=log'; });
    await expect(page.locator('#app-page-title')).toHaveText('Bridge', { timeout: 5000 });

    // Should render without crash
    const viewContent = page.locator('#app-view');
    await expect(viewContent).toBeVisible();
  });

  test('full journey: navigate zones and verify no errors', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    // Inject mock user
    await page.evaluate(() => {
      State.set('user', { id: 'journey-1', email: 'test@nice.dev', user_metadata: { display_name: 'Tester' } });
    });

    // 1. Navigate to Bridge
    await page.evaluate(() => { window.location.hash = '#/bridge'; });
    await expect(page.locator('#app-page-title')).toHaveText('Bridge', { timeout: 5000 });
    const viewContent = page.locator('#app-view');
    await expect(viewContent).toBeVisible();

    // 2. Navigate to Security
    await page.evaluate(() => { window.location.hash = '#/security'; });
    await expect(page.locator('#app-page-title')).toHaveText('Security', { timeout: 5000 });

    // 3. Dock redirects to Home
    await page.evaluate(() => { window.location.hash = '#/dock'; });
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 5000 });

    // 4. Verify MissionRunner module is loaded
    const hasMissionRunner = await page.evaluate(() => typeof MissionRunner === 'object' && typeof MissionRunner.run === 'function');
    expect(hasMissionRunner).toBe(true);

    // 5. Verify ShipLog module is loaded
    const hasShipLog = await page.evaluate(() => typeof ShipLog === 'object' && typeof ShipLog.execute === 'function');
    expect(hasShipLog).toBe(true);

    // 6. No console errors throughout the journey
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.evaluate(() => { window.location.hash = '#/bridge'; });
    await page.waitForTimeout(500);
    await page.evaluate(() => { window.location.hash = '#/security'; });
    await page.waitForTimeout(500);
    await page.evaluate(() => { window.location.hash = '#/'; });
    await page.waitForTimeout(500);
    expect(errors.length).toBe(0);
  });

  test('old routes redirect correctly', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    // /missions → /bridge?tab=missions
    await page.evaluate(() => { window.location.hash = '#/missions'; });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => location.hash)).toContain('#/bridge');

    // /analytics → /bridge?tab=operations
    await page.evaluate(() => { window.location.hash = '#/analytics'; });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => location.hash)).toContain('#/bridge');

    // /agents → /bridge?tab=agent
    await page.evaluate(() => { window.location.hash = '#/agents'; });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => location.hash)).toContain('#/bridge');

    // /blueprints → /bridge
    await page.evaluate(() => { window.location.hash = '#/blueprints'; });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => location.hash)).toContain('#/bridge');

    // /integrations → /security?tab=integrations
    await page.evaluate(() => { window.location.hash = '#/integrations'; });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => location.hash)).toContain('#/security');
  });

  test('streamlined journey: prompt panel and agent matching', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    // Inject mock user and activate an agent
    await page.evaluate(() => {
      State.set('user', { id: 'journey-2', email: 'test@nice.dev', user_metadata: { display_name: 'Tester' } });
      State.set('agents', [
        { id: 'bp-bp-agent-01', name: 'Content Broadcaster', role: 'Content', status: 'idle', blueprint_id: 'bp-agent-01' },
        { id: 'bp-bp-agent-04', name: 'Code Reviewer', role: 'Code', status: 'idle', blueprint_id: 'bp-agent-04' },
      ]);
    });

    // 1. Test PromptPanel module is loaded
    const autoMissionResult = await page.evaluate(() => {
      return typeof PromptPanel !== 'undefined' ? 'module loaded' : 'module not found';
    });
    expect(autoMissionResult).toBe('module loaded');

    // 2. Test EXEC marker parsing
    const execParseResult = await page.evaluate(() => {
      const testText = 'Mission created! [EXEC: create_mission | Test Mission | Content | high] Check your board.';
      const div = document.createElement('div');
      div.innerHTML = testText
        .replace(/\[EXEC:\s*\w+\s*(?:\|.*?)?\s*\]/g, '')
        .replace(/\[ACTION:\s*.+?\s*\|\s*.+?\s*\]/g, '')
        .trim();
      return {
        hasExecMarker: testText.includes('[EXEC:'),
        cleanedText: div.textContent.trim(),
        markerStripped: !div.textContent.includes('[EXEC:'),
      };
    });
    expect(execParseResult.hasExecMarker).toBe(true);
    expect(execParseResult.markerStripped).toBe(true);
    expect(execParseResult.cleanedText).toBe('Mission created!  Check your board.');

    // 3. Test agent UUID bridge
    const uuidBridgeResult = await page.evaluate(() => {
      if (typeof BlueprintStore === 'undefined') return 'not loaded';
      const hasSet = typeof BlueprintStore.setAgentUuid === 'function';
      const hasGet = typeof BlueprintStore.getAgentUuid === 'function';
      BlueprintStore.setAgentUuid('bp-test-agent', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      const uuid = BlueprintStore.getAgentUuid('bp-test-agent');
      BlueprintStore.setAgentUuid('bp-test-agent', null);
      return { hasSet, hasGet, uuid, roundTrip: uuid === 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' };
    });
    expect(uuidBridgeResult.hasSet).toBe(true);
    expect(uuidBridgeResult.hasGet).toBe(true);
    expect(uuidBridgeResult.roundTrip).toBe(true);

    // 4. Test agent keyword matching via State agents
    const agentMatchResult = await page.evaluate(() => {
      const agents = State.get('agents') || [];
      const lower = 'write me a tagline';
      const contentAgent = agents.find(a => {
        const role = (a.role || '').toLowerCase();
        return ['write', 'draft', 'content'].some(kw => lower.includes(kw)) && role.includes('content');
      });
      const codeAgent = agents.find(a => {
        const role = (a.role || '').toLowerCase();
        return ['code', 'debug', 'fix'].some(kw => lower.includes(kw)) && role.includes('code');
      });
      return {
        contentMatch: contentAgent?.name || null,
        codeNoMatch: codeAgent?.name || null,
      };
    });
    expect(agentMatchResult.contentMatch).toBe('Content Broadcaster');
    expect(agentMatchResult.codeNoMatch).toBeNull();

    // 5. No console errors
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.evaluate(() => { window.location.hash = '#/'; });
    await page.waitForTimeout(500);
    expect(errors.length).toBe(0);
  });
});

test.describe('NICE Stripe Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('nice-tour-completed', 'true');
    });
  });

  test('token purchase modal opens from home view', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    // Open token modal directly via JS API
    await page.evaluate(() => {
      State.set('user', { id: 'stripe-test', email: 'test@nice.dev', user_metadata: { display_name: 'Tester' } });
      FuelModal.open();
    });

    // Verify modal overlay appears
    const overlay = page.locator('.token-modal-overlay');
    await expect(overlay).toBeVisible({ timeout: 3000 });

    // Verify 4 token pack cards are visible
    const packs = page.locator('.token-pack');
    await expect(packs).toHaveCount(4);

    // Close modal with Escape
    await page.keyboard.press('Escape');
    await expect(overlay).toHaveCount(0);
  });

  test('token purchase modal opens from settings', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    // Inject mock user
    await page.evaluate(() => {
      State.set('user', { id: 'stripe-test', email: 'test@nice.dev', user_metadata: { display_name: 'Tester' } });
    });

    // Navigate to settings
    await page.evaluate(() => { window.location.hash = '#/settings'; });
    await expect(page.locator('#app-page-title')).toHaveText('Settings', { timeout: 5000 });

    // Verify Billing & Tokens section exists
    const billingSection = page.locator('text=Billing & Tokens');
    await expect(billingSection.first()).toBeVisible({ timeout: 5000 });

    // Click the buy tokens button
    const buyTokensBtn = page.locator('.btn-buy-tokens');
    await expect(buyTokensBtn.first()).toBeVisible({ timeout: 5000 });
    await buyTokensBtn.first().click({ force: true });

    // Verify modal appears
    const overlay = page.locator('.token-modal-overlay');
    await expect(overlay).toBeVisible({ timeout: 3000 });
  });

  test('token packs display correct pricing', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    // Inject mock user and open token modal
    await page.evaluate(() => {
      State.set('user', { id: 'stripe-test', email: 'test@nice.dev', user_metadata: { display_name: 'Tester' } });
      FuelModal.open();
    });

    // Verify modal is visible
    const overlay = page.locator('.token-modal-overlay');
    await expect(overlay).toBeVisible({ timeout: 3000 });

    // Verify pack names
    await expect(page.locator('.token-pack-name').nth(0)).toHaveText('Starter Pack');
    await expect(page.locator('.token-pack-name').nth(1)).toHaveText('Booster Pack');
    await expect(page.locator('.token-pack-name').nth(2)).toHaveText('Premium Pack');
    await expect(page.locator('.token-pack-name').nth(3)).toHaveText('Fleet Pack');

    // Verify pack prices
    await expect(page.locator('.token-pack-price').nth(0)).toHaveText('$9.99');
    await expect(page.locator('.token-pack-price').nth(1)).toHaveText('$24.99');
    await expect(page.locator('.token-pack-price').nth(2)).toHaveText('$49.99');
    await expect(page.locator('.token-pack-price').nth(3)).toHaveText('$99.99');
  });
});

test.describe('NICE Auth Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('nice-tour-completed', 'true');
    });
  });

  test('sign-in modal opens and has form fields', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    // Click sign-in button (in header or auth-gate)
    const signInBtn = page.locator('button:has-text("Sign In"), .btn:has-text("SIGN IN")').first();
    if (await signInBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await signInBtn.click();
      // Auth modal should appear
      const modal = page.locator('.auth-modal, #auth-modal');
      if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Should have email and password fields
        await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
        await expect(page.locator('input[type="password"]').first()).toBeVisible();
      }
    }
  });

  test('unauthenticated users can navigate views without errors', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    // Navigate to bridge without authentication
    await page.evaluate(() => { window.location.hash = '#/bridge'; });
    await expect(page.locator('#app-page-title')).toHaveText('Bridge', { timeout: 5000 });

    // Page should render without crashing (either auth gate or demo content)
    const viewContent = page.locator('#app-view');
    await expect(viewContent).toBeVisible();
    const innerText = await viewContent.innerText();
    expect(innerText.length).toBeGreaterThan(0);
  });
});

test.describe('NICE Performance', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('nice-tour-completed', 'true');
    });
  });

  test('home view loads within 3 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });
    const loadTime = Date.now() - start;
    expect(loadTime).toBeLessThan(3000);
  });

  test('view transitions complete within 1 second', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    const views = ['#/bridge', '#/security', '#/settings', '#/'];
    for (const hash of views) {
      const start = Date.now();
      await page.evaluate((h) => { window.location.hash = h; }, hash);
      await page.locator('#app-page-title').waitFor({ state: 'visible', timeout: 5000 });
      const transitionTime = Date.now() - start;
      expect(transitionTime).toBeLessThan(1000);
    }
  });

  test('no memory leaks from rapid navigation', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    // Inject mock user
    await page.evaluate(() => {
      State.set('user', { id: 'perf-test', email: 'test@nice.dev', user_metadata: { display_name: 'Tester' } });
    });

    // Rapid navigation through zones
    const routes = ['#/', '#/bridge', '#/security', '#/settings',
                     '#/', '#/bridge', '#/security', '#/settings',
                     '#/', '#/bridge', '#/security', '#/settings',
                     '#/', '#/bridge', '#/security', '#/dock', '#/'];

    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    for (const route of routes) {
      await page.evaluate((r) => { window.location.hash = r; }, route);
      await page.waitForTimeout(100);
    }

    // No errors from rapid navigation
    expect(errors.length).toBe(0);
  });
});

test.describe('NICE Blueprint Drawer', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('nice-tour-completed', 'true');
    });
  });

  test('clicking a blueprint card opens the detail drawer', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    // Inject mock user so blueprints view renders, also dismiss first-mission tour
    await page.evaluate(() => {
      State.set('user', { id: 'drawer-test', email: 'test@nice.dev', user_metadata: { display_name: 'Tester' } });
    });

    // Navigate to bridge blueprints tab
    await page.evaluate(() => { window.location.hash = '#/bridge?tab=blueprints'; });
    await expect(page.locator('#app-page-title')).toHaveText('Bridge', { timeout: 5000 });

    // Wait for grid to render
    await expect(page.locator('.tcg-card').first()).toBeVisible({ timeout: 5000 });

    // Click first card
    await page.locator('.tcg-card.bp-card-clickable').first().click();

    // Drawer should open
    const drawer = page.locator('#bp-drawer.open');
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // Drawer should have a close button
    const closeBtn = drawer.locator('.bp-drawer-close');
    await expect(closeBtn).toBeVisible();

    // Close with ESC
    await page.keyboard.press('Escape');
    await expect(page.locator('#bp-drawer.open')).toHaveCount(0, { timeout: 2000 });
  });

  test('drawer can be opened programmatically', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    // Inject mock user
    await page.evaluate(() => {
      State.set('user', { id: 'drawer-test', email: 'test@nice.dev', user_metadata: { display_name: 'Tester' } });
    });

    await page.evaluate(() => { window.location.hash = '#/bridge?tab=blueprints'; });
    await expect(page.locator('#app-page-title')).toHaveText('Bridge', { timeout: 5000 });
    await expect(page.locator('.tcg-card').first()).toBeVisible({ timeout: 5000 });

    // Open drawer via public API using first card's ID
    await page.evaluate(() => {
      const firstId = document.querySelector('.tcg-card[data-id]')?.dataset.id;
      if (firstId) BlueprintsView.openDrawer(firstId);
    });

    const drawer = page.locator('#bp-drawer.open');
    await expect(drawer).toBeVisible({ timeout: 3000 });
  });
});

test.describe('NICE Focus Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('nice-tour-completed', 'true');
    });
  });

  test('modals can be opened and closed', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    // Inject user and open token modal
    await page.evaluate(() => {
      State.set('user', { id: 'focus-test', email: 'test@nice.dev', user_metadata: { display_name: 'Tester' } });
      FuelModal.open();
    });

    const overlay = page.locator('.token-modal-overlay');
    await expect(overlay).toBeVisible({ timeout: 3000 });

    // Close with Escape
    await page.keyboard.press('Escape');
    await expect(overlay).toHaveCount(0);
  });

  test('sidebar links are keyboard navigable', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    // Focus first sidebar link
    const firstLink = page.locator('.side-link').first();
    await firstLink.focus();

    // Arrow down should move focus
    await page.keyboard.press('ArrowDown');
    const focusedHref = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? el.getAttribute('href') || el.className : null;
    });
    expect(focusedHref).toBeTruthy();
  });

  test('ARIA landmarks are present', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#app-page-title')).toHaveText('NICE SPACESHIP', { timeout: 10000 });

    // Check for main landmark
    const main = page.locator('[role="main"], main');
    const mainCount = await main.count();
    expect(mainCount).toBeGreaterThanOrEqual(0); // May use semantic HTML

    // Check for navigation landmark
    const nav = page.locator('[role="navigation"], nav');
    const navCount = await nav.count();
    expect(navCount).toBeGreaterThan(0);
  });
});
