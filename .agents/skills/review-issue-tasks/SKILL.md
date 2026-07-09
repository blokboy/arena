---
name: review-issue-tasks
description: Read back the task list plan-issue-tasks posted to an issue, re-verify it against the current codebase, surface any blockers before proceeding, then switch to the flagged role's branch. Stops there — no implementation.
disable-model-invocation: true
---

# Review issue tasks

Takes a role as its argument (e.g. `/review-issue-tasks Backend`). Assume no memory of whatever conversation ran `plan-issue-tasks` — this skill is very likely being run by a different, freshly-spawned agent. Everything it needs, it re-derives from the repo and the issue tracker.

## Process

### 1. Resolve the issue number from the role

`plan-issue-tasks` branches are named `I<n>-<Role>-Agent`. List local branches matching `I*-<Role>-Agent` (normalize the given role to that capitalization — "backend" and "Backend" both mean `Backend`).

- Exactly one match → that branch's `<n>` is the issue.
- Zero matches → stop and report it: either `plan-issue-tasks` hasn't been run for this role yet, or the role name doesn't match any existing branch.
- More than one match → stop and ask which issue number, rather than guessing — this happens once two issues are in flight for the same role at once.

### 2. Read the persisted task list

`gh issue view <n> --comments`, and find the comment whose body starts with `## Task list — Issue #<n>` (the fixed marker `plan-issue-tasks` writes). If there are several such comments, the most recent one is current — earlier ones are superseded, not additive. If none exist, stop: `plan-issue-tasks` was never run for this issue, or its comment step failed — do not fabricate a task list from the PRD as a substitute, that's `plan-issue-tasks`'s job, not this one's.

Pull out just the `<Role>` section — that's the scope for the rest of this review.

### 3. Re-verify before clearing it

Treat the persisted list as a strong prior, not gospel — time has passed since it was written, and the repo may have moved (another agent may have already landed part of it, a dependency may have merged, a blocker may have closed or reopened). Before clearing the list:

- Re-check the issue's "Blocked by" line, if any — confirm every blocker is still closed.
- Spot-check the list's specific, falsifiable claims against the current codebase (a file it says is missing, a function it says is reusable, a constraint it says doesn't exist) — not a full from-scratch re-investigation, but enough to catch drift since the list was written.
- Check the section for internal problems a reviewing engineer would flag before an agent starts building from it: ambiguous tasks, tasks that contradict each other, an unstated assumption, a missing piece of the contract (e.g. a task that references a field or endpoint shape without pinning it down).

If anything turns up, stop and report it as a concrete, numbered list of concerns — do not switch branches yet, and do not silently patch the task list yourself. Wait for the conversation to resolve them.

### 4. Once cleared, switch to the branch

Only after the section has no open concerns (none were found, or every one raised in step 3 has been resolved in conversation):

- `git status` first — if there are uncommitted changes, stop and ask rather than switching over them.
- `git checkout I<n>-<Role>-Agent`.
- If concerns were raised and resolved along the way, post a follow-up `gh issue comment` noting the resolution before switching, so the paper trail lives on the issue next to the original list.

### 5. Stop

No work starts here. Confirm the branch switch and stop — implementation is a separate, later step the user asks for explicitly.
