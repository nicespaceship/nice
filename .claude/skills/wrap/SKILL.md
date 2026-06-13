---
name: wrap
description: End-of-session housekeeping. Merges passing PRs, prunes worktrees and branches, audits memory for bloat (MEMORY.md size, orphan snapshots, sections duplicating CLAUDE.md), trims as needed, and reports a one-screen summary. Trigger when the user types /wrap at the end of a session — explicit user-driven only, never proactive.
disable-model-invocation: true
---

# /wrap — End-of-session housekeeping

Run this playbook in order. Be terse — this is a checklist, not a project. Each step has a budget.

## 1. Git hygiene (max 4 tool calls)

- `git worktree list` — note any stale `.claude/worktrees/<name>` dirs whose branch only contains commits already on main. Remove them via `git worktree remove` + `git branch -D`.
- `git fetch origin main --prune` — surface any deleted remote branches.
- For the **current branch** (the one this session worked on): if it has unmerged commits and an open PR with passing CI, merge it (`gh pr merge --squash --delete-branch`). If CI is failing, surface the failure and stop — don't merge red.
- `git -C <main-worktree> pull --ff-only origin main` so the main worktree reflects the merge.

## 2. Memory audit (one shell call, no exploration)

```bash
cd ~/.claude/projects/-Users-nicespaceship-Documents-GitHub-nice/memory && \
  echo "MEMORY.md: $(wc -l < MEMORY.md) lines" && \
  echo "Total files: $(ls *.md | wc -l)" && \
  echo "Orphans: $(for f in snapshot_*.md project_*.md reference_*.md; do \
    [ -f "$f" ] && grep -qF "$f" MEMORY.md session_protocol.md next_session_prompt.md feedback_*.md 2>/dev/null || echo "$f"; \
  done | wc -l)"
```

**Thresholds:**
- MEMORY.md > 120 lines → trim (see step 3)
- Orphans > 5 → review and delete (see step 4)
- Both within budget → skip to step 5

## 3. Trim MEMORY.md (only if > 120 lines)

Open MEMORY.md and look for, in order:
1. **Sections that duplicate CLAUDE.md** (Branding, XP table, theme list, card system, Stripe products, SSOT lists, etc.). CLAUDE.md auto-loads as project instructions every turn — anything also there is dead weight. **Delete the section.**
2. **"Recently Shipped" entries older than ~10 days** with verbose prose bodies. Collapse to one-line pointers: date · what shipped · linked snapshot. Detail lives in `gh pr view` and snapshot files.
3. **Closed initiatives in "Upcoming / In-flight"** with all rows ✅. Move to a one-line entry in Recently Shipped instead.

Don't add new content during /wrap. Trim only.

## 4. Delete orphan files (only if > 5)

For each orphan reported in step 2:
- If it's a `snapshot_*.md` older than 14 days → delete (recoverable from `gh pr view` / `git log`).
- If it's a `project_*.md` for a closed initiative with no active references → delete.
- If it's a decision record / "don't re-propose" memory (e.g. `project_removed_endpoints.md`) → link it from MEMORY.md instead of deleting.

After deleting, re-run the audit one-liner from step 2 to confirm.

## 5. Update `next_session_prompt.md`

If this session closed an item that was in the prompt's "Open items" list, remove it. If new follow-ups surfaced, add them as one-liners with rough priority. If nothing changed, leave it alone.

## 6. Report

One short message — three lines max:
- ✅ Git: what merged, what got pruned (or "clean")
- ✅ Memory: `MEMORY.md: <N> lines · <N> files · <N> orphans` (post-trim)
- ✅ Next session: top opener from `next_session_prompt.md` (one phrase)

If something blocked the playbook (red CI, ambiguous orphan, etc.), state it inline. Don't ask for confirmation on each step — execute by default and surface only what stalled.

## Constraints

- **No new content.** /wrap is destructive cleanup, not write-up.
- **No exploration.** Don't read project files to "understand" what to keep — the audit script is the truth. Orphan + old = delete.
- **No `consolidate-memory` skill invocation.** /wrap is the lighter-weight, faster pass; reserve `/consolidate-memory` for big restructures.
- **Budget: 12 tool calls total.** If the playbook exceeds that, stop and report what's left.
