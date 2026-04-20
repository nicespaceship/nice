---
name: run-tests
description: Run unit tests (Vitest) and E2E tests (Playwright) for the NICE app. Quick access to test commands and debugging.
user-invocable: true
---

# Run Tests

## Unit Tests (Vitest — 254 tests)
```bash
npm test                    # Run all
npm run test:watch          # Watch mode
npx vitest run path/to/file # Single file
```

Test files: `app/js/__tests__/*.test.js`
- state.test.js (9) — State pub/sub
- gamification.test.js (21) — XP, ranks, achievements, streaks
- audit-log.test.js (11) — CRUD, filtering, FIFO
- data-io.test.js (5) — Export/import
- command-palette.test.js (10) — Fuzzy search
- router.test.js (8) — Route matching, params
- blueprints.test.js — Activation, lookups
- ship-log.test.js — Agent execution
- home-view.test.js — Tab rendering

## E2E Tests (Playwright — 32 tests)
```bash
npm run test:e2e            # Run all (headless)
npx playwright test --ui    # Debug with UI
```

Test file: `e2e/smoke.spec.js`
- App loads, sidebar nav, all views render
- Blueprints Terminal, card drawer
- Theme switching, keyboard shortcuts
- Responsive layout, accessibility
- Token purchase modal, auth flow

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
1. Run `npx vitest run` — all 254 must pass
2. Run `npx playwright test` — all 32 must pass
3. Check preview for console errors
4. Verify visually with preview screenshot
