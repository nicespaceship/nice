---
name: test-and-deploy
description: Run Vitest unit tests and Playwright E2E tests, then deploy to Vercel if all pass. Use when ready to ship changes.
disable-model-invocation: true
allowed-tools: Bash, Read, Grep, Glob
---

# Test & Deploy

Run all tests and deploy to Vercel if they pass.

## Steps

1. **Unit tests**: Run `npm test` (Vitest, expects 236+ tests to pass)
2. **E2E tests**: Run `npm run test:e2e` (Playwright, 30+ tests)
3. **If any tests fail**: Report the failures and stop. Do NOT deploy.
4. **If all pass**:
   - Show `git status` and `git diff --stat` so the user can review what will ship
   - Ask the user to confirm before proceeding
   - Commit with a descriptive message ending with `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
   - Push to the current branch
   - If on a feature branch, create or update the PR targeting `main`
   - If on `main`, verify the Vercel deployment started via `gh api repos/NiceSpaceship/nicespaceship.com/deployments --jq '.[0] | {state, environment, created_at}'`

## Notes
- Never force-push or skip hooks
- Never deploy with failing tests
- The Vercel deployment is automatic on push to `main` — no manual deploy step needed
