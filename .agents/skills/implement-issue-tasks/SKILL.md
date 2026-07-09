---
name: implement-issue-tasks
description: Implement the persisted task list for the current I<n>-<Role>-Agent branch's role, test-first via this repo's tdd skill, verify everything is actually done, then commit and open a PR against review. Stops there.
disable-model-invocation: true
---

# Implement issue tasks

Assumes it's running on a branch `review-issue-tasks` (or an equivalent human review) already switched to and cleared: `I<n>-<Role>-Agent`. Takes no argument — everything is derived from the current branch and the issue tracker. Does not re-litigate scope: if the persisted list still has open concerns, that's `review-issue-tasks`'s job, not this one's.

## Process

### 1. Resolve context from the current branch

`git branch --show-current` must match `I<n>-<Role>-Agent`. If it doesn't, stop and report — this skill only knows how to work from that branch shape, it doesn't infer or ask which issue/role otherwise.

### 2. Read the task list

Same lookup `review-issue-tasks` uses: `gh issue view <n> --comments`, find the most recent comment starting with `## Task list — Issue #<n>`, pull out the `<Role>` section. If none exists, stop — there's nothing to implement.

Track each bullet as a task (`TaskCreate`), so progress is visible and nothing gets silently skipped.

### 3. Implement each task via this repo's `tdd` skill

Load the `tdd` skill (invoke it if it isn't already active) before starting the first task, and follow it for every one: agree the seam before writing a test, red before green, one seam/test/minimal-implementation per cycle, vertical slices — not writing every test up front and filling in implementations after. Mark each task `in_progress` when starting it, `completed` when its tests are green.

Follow the PRD literally for how each task should behave — deviate from it only when the current codebase contradicts what the list assumed, and say so when you do, the same way `plan-issue-tasks`/`review-issue-tasks` already surfaced drift between the PRD and reality.

If a task turns out to already be satisfied by the current code (found during investigation, not assumed), mark it done with a one-line note of what already covers it — don't force redundant work just to make the list feel busy.

### 4. Final check

Once every task is marked complete, don't just trust the tracker:

- Re-read the persisted `<Role>` section one more time and confirm each bullet against the actual code/tests now on the branch — re-derive, don't recall.
- Run this repo's full automated-check suite for whatever tiers the changes touch: `pnpm typecheck`, `pnpm lint`, and the relevant `pnpm test:*` tiers (unit/integration/api/components) — all green, no exceptions carried forward.
- For product-facing changes, consider this repo's `verify` skill before committing — tests passing isn't the same as the feature working.

### 5. Commit, push, and open the PR

- Review `git status`/`git diff` first — stage the files this task list actually touched, not a blanket add.
- Commit with a message describing what this role delivered for the issue.
- Push the branch: `git push -u origin I<n>-<Role>-Agent`.
- Open the PR against `review`, never `main`: `gh pr create --base review --title "..." --body "..."` (head is inferred from the current branch), referencing the issue.

### 6. Stop

Do not merge the PR, do not push further commits, do not switch branches. Report the PR back and stop — anything past this is a separate, later step the user asks for explicitly.
