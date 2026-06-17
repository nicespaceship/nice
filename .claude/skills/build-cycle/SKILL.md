---
name: build-cycle
description: Run one autonomous build cycle — pick the top actionable item from the loop backlog, implement it on a branch, have an independent checker review it, run tests, and open a draft-and-queue PR. Use when running the every-3h build loop, or manually to advance the backlog one item.
user-invocable: true
---

# Build Cycle — one PR-sized unit of work

You are the lead engineer advancing the NICE app autonomously. Each invocation ships **exactly one** backlog item as a PR for Ben to merge. Never merge, never deploy, never touch consoles or secrets. Read [CLAUDE.md](../../../CLAUDE.md) conventions before writing code.

## 1. Sync + guard
- `git worktree prune`; `git fetch origin --prune`; `git checkout main`; `git pull --ff-only`. Confirm a clean tree.
- If `.claude/loop/BACKLOG.md` is **absent on main**, the infra PR isn't merged yet → append nothing, report "waiting for build-loop infra merge," and stop.
- `gh pr list --state open` — if there are already **≥5 open `claude/*` PRs awaiting review**, stop and report "review queue full ({n} open); pausing new work so Ben can catch up." (Don't bury the human gate.)

## 2. Pick the item
- Read `.claude/loop/BACKLOG.md`. Choose the **highest-priority** item flagged `[READY]`. Skip `[BEN]`, `[BLOCKED:…]`, and anything already in the "In review" section.
- Prefer `[READY]` over `[QUEUE]`. Only take a `[QUEUE]`/migration item if the Supabase MCP is available this run (headless cloud runs usually lack it) AND you can complete the read-only dry-run + `DO $smoke$` gate per CLAUDE.md. Otherwise leave migrations for an app-open session.
- If nothing is actionable: do a **P3 hygiene** item. If those are drained too, append a "backlog drained — need priorities" note to `QUESTIONS.md` and stop.

## 3. Make
- `git checkout -b claude/<kebab-slug>`.
- Implement the item. **Read before write**; match surrounding patterns; respect the typography/CSS/SSOT/theme rules in CLAUDE.md; escape user content; mobile + tablet + desktop. Keep the diff scoped to this one item — no drive-by refactors (log those to the backlog instead).
- If the change is browser-observable and a preview is available, verify it per the preview workflow (snapshot/console/screenshot). Skip if not previewable.

## 4. Check (maker ≠ checker)
- Spawn the **`build-checker`** agent (`Agent` tool, `subagent_type: "build-checker"`) with the branch name + the backlog item description. It returns `PASS` or `BLOCK` with reasons.
- On `BLOCK`: do one corrective pass. If still blocked or the finding reveals the item is ill-scoped, **abandon the branch** (`git checkout main`; delete the branch), log a short note to `QUESTIONS.md`, and stop — don't ship past a real objection.

## 5. Gate
- `npm test`. Red → fix; if not quickly fixable, abandon as in step 4. Never open a PR on a red suite.

## 6. Ship (draft + queue)
- Commit in founder voice (imperative, <72-char subject, **no AI co-authorship trailer** — and don't put the literal trailer text in the commit/PR-body command, the hook blocks it). One concern per commit.
- In the same branch, update `.claude/loop/BACKLOG.md`: move the item to the **In review** section with the (soon) PR link, or to **Done log** if it fully closes it. Append any decisions to `QUESTIONS.md`.
- `git push -u origin …`; `gh pr create` with a body that states what + why + how it was verified + the checker verdict, and ends with the Claude Code footer. **Do not merge.**
- Report a one-paragraph status: item shipped, PR link, checker verdict, test result, what's next.

## Hard rules
- One item per cycle. No merging. No `gh pr merge`. No edge-fn deploys. No Supabase console / vault / secret writes. No `git push` to `main`.
- Carve-out (`supabase/migrations/**`, billing, auth/security, `*-oauth*`) may only be **drafted**; the hook enforces the rest.
- When in doubt on a product/irreversible fork, write to `QUESTIONS.md` and move on — never guess.
