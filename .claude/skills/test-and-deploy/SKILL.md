---
name: test-and-deploy
description: Run Vitest unit tests and Playwright E2E tests, then ship via push to main (Cloudflare Pages auto-deploys). Use when ready to ship changes.
disable-model-invocation: true
allowed-tools: Bash, Read, Grep, Glob
---

# Test & Deploy

Run all tests and ship if they pass. Deploy is automatic via Cloudflare Pages on push to `main`.

## Steps

1. **Unit tests**: Run `npm test` — expect all tests to pass (~670+ as of 2026-04-20; grep the latest count before citing).
2. **E2E tests**: Run `npm run test:e2e` — expect all Playwright tests to pass (~14 as of 2026-04-20).
3. **If any tests fail**: Report the failures and stop. Do NOT ship.
4. **If all pass**:
   - Show `git status` and `git diff --stat` so the user can review what will ship
   - Ask the user to confirm before committing
   - Commit with a short imperative message. **Never add `Co-Authored-By: Claude` or any AI attribution** — Benjamin is the author (see `feedback_no_coauthor.md`).
   - Push to the current branch
   - If on a feature branch, open or update a PR targeting `main` with `gh pr create`
   - If on `main`, verify the Cloudflare Pages deployment via `gh api repos/nicespaceship/nice/deployments --jq '.[0] | {state, environment, created_at}'` or the Cloudflare dashboard

## Notes
- Deploy target is **Cloudflare Pages** (auto-deploy from `main` branch).
- Repo is `nicespaceship/nice`.
- Never force-push, skip hooks, or deploy with failing tests.
