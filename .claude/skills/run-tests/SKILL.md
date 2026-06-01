---
name: run-tests
description: Run unit tests (Vitest) and E2E tests (Playwright) for the NICE app. Quick access to test commands and debugging.
user-invocable: true
---

# Run Tests

## Unit Tests (Vitest)
```bash
npm test                    # Run all
npm run test:watch          # Watch mode
npx vitest run path/to/file # Single file
```

Test files: `app/js/__tests__/**/*.test.js` (+ `tools/**/*.test.js`). Coverage spans core infra (state, router, supabase, keyboard, notify, command-palette), blueprints + community, agents + missions (agent-executor, mission-runner, workflow-engine), models + billing, views, and gamification + onboarding. File/test counts drift with every feature — see the Testing section in CLAUDE.md, or just run the suite.

## E2E Tests (Playwright)
```bash
npm run test:e2e            # Run all (headless)
npx playwright test --ui    # Debug with UI
```

Test file: `e2e/smoke.spec.js` — app load, sidebar nav, view rendering, command palette, theme switching, responsive layout, hash routing, accessibility (axe-core / WCAG AA), unauthenticated auth flow, performance.

## Test Pattern (IIFE modules in jsdom)
```javascript
function loadScriptGlobal(path) {
  let code = readFileSync(resolve(__dirname, '..', path), 'utf-8');
  code = code.replace(/^const (\w+)\s*=/gm, 'globalThis.$1 =');
  eval(code);
}
// Module now available as globalThis.ModuleName
```

## After Making Changes
1. Run `npm test` — all unit tests must pass.
2. Run `npm run test:e2e` — all Playwright tests must pass.
3. Check the preview for console errors.
4. Verify visually with a preview screenshot.

CI (`.github/workflows/ci.yml`) runs both and blocks merges on failure.
