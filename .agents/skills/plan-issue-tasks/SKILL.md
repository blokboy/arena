---
name: plan-issue-tasks
description: Pull the PRD and a GitHub issue, verify their claims against the actual codebase, create the issue's three per-role branches, then present and persist a succinct Backend/Frontend/Design task list. Stops there — no implementation. Paired with review-issue-tasks, which reads the persisted list back.
disable-model-invocation: true
---

# Plan issue tasks

Takes an issue number as its argument (e.g. `/plan-issue-tasks 12`). Produces three per-role branches and a succinct, sectioned task list grounded in the actual state of the repo — never a paraphrase of the PRD alone.

## Process

### 1. Gather context

- Fetch the issue: `gh issue view <n> --comments` (see `docs/agents/issue-tracker.md` for conventions). Note its labels and any "Blocked by" line.
- Verify every blocker is closed (`gh issue view <blocker> --json state`). If any blocker is still open, stop here and report it — do not create branches or a task list for a blocked issue.
- Locate and read the PRD covering this issue (`docs/prds/*.md`), `CONTEXT.md` for domain vocabulary, and any `docs/adr/*.md` decisions the issue's area touches.

### 2. Verify against the current codebase

For every claim about to go in the task list — "X is missing," "Y already exists and is reusable," "Z needs to change" — confirm it by reading the actual file, route, schema, or test, not by inferring it from the PRD. The PRD describes the target, not the current state, and the two drift: prior issues in this repo have turned up dead in-memory scaffolding that looked live, endpoints the PRD assumes exist but don't, schema fields with no enforcing constraint, and functions that look reusable but enforce the wrong invariant for the new caller. Read whatever's relevant: `src/server/`, `src/app/api/`, `prisma/schema.prisma`, `src/components/`, and existing tests under `tests/`. Note what's already built and genuinely reusable, not only what's missing — a task list that only lists gaps is as misleading as one that only paraphrases the PRD.

### 3. Create the three branches

Format: `I<n>-Backend-Agent`, `I<n>-Frontend-Agent`, `I<n>-Design-Agent`, where `<n>` is the issue number — matches this repo's existing precedent (`I10-Frontend-Agent`, merged via PR #38; `I12-Backend-Agent`, `I12-Frontend-Agent`).

- `git fetch origin` first, then branch each off `origin/main` (or the repo's actual default branch, if different) — never off local `main`, which may be stale.
- Create with `git branch <name> origin/main` — not `checkout -b`. This must never switch the current working tree off whatever branch the user is already on.
- If a branch already exists, skip it and say so — never force-recreate or delete an existing branch.
- Local only. Do not push these branches to origin unless the user explicitly asks.

### 4. Present and persist the task list

Sectioned `### Backend`, `### Frontend`, `### Design` — omit a section entirely if the issue has no work there, rather than padding it. Succinct: one line per task, imperative mood, no multi-paragraph justification. A short parenthetical only when a step-2 finding needs flagging (a missing constraint, a wrong assumption in the PRD, a genuine reuse opportunity, an explicit out-of-scope call).

Show the list in chat, then post the identical list as a GitHub issue comment so `review-issue-tasks` — very likely a different, freshly-spawned agent with no memory of this conversation — can read it back later:

```
gh issue comment <n> --body "## Task list — Issue #<n>

### Backend
- ...

### Frontend
- ...

### Design
- ..."
```

The `## Task list — Issue #<n>` heading is a fixed marker `review-issue-tasks` greps for — always start the comment body with it verbatim, on its own line.

### 5. Stop

The task list is the deliverable. Do not implement anything on it, open PRs, check out one of the new branches, or start editing files — that's a separate, later step the user asks for explicitly.
