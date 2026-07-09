# Arena

**Stack**: Next.js 15 (App Router), Auth.js v5 (Credentials/JWT), Prisma (Postgres 16), Tailwind CSS, Vitest, Playwright, pnpm 9, Node 22.

**Domain**: Points prediction market — no real money. See `CONTEXT.md` for glossary and `docs/adr/` for architectural decisions.

## Commands

| Command | Notes |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm build` | `prisma migrate deploy && next build` — **runs migrations first** |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm format:check` | Prettier (100 width, no trailing commas) |
| `pnpm prisma <cmd>` | Prisma CLI (generate, validate, migrate, etc.) |
| `pnpm test:unit` | Vitest — no DB, fast |
| `pnpm test:integration` | Vitest — needs Postgres on :5433 |
| `pnpm test:api` | Vitest — needs Postgres on :5433, sets `AUTH_SECRET` |
| `pnpm test:components` | Vitest — jsdom, no DB |
| `pnpm test:e2e` | Playwright — starts Next.js dev server |
| `pnpm db:up` / `pnpm db:down` | Dev Postgres (:5432, persistent) |
| `pnpm db:test:up` / `pnpm db:test:down` | Test Postgres (:5433, ephemeral tmpfs) |
| `pnpm test` | Runs unit → integration → api → components sequentially |

CI order: format:check → lint → typecheck → prisma validate → test suites → build → e2e.

## Path aliases

`@/*` → `./src/*`, `@test/*` → `./test/*`

## Tests & database

Vitest projects in `vitest.workspace.mts`:

| Project | Location | Env | Requires Postgres |
|---|---|---|---|
| unit | `tests/unit/` | node | No |
| integration | `tests/integration/` | node (`USE_TEST_DATABASE=true`) | Yes — port 5433 |
| api | `tests/api/` | node (`USE_TEST_DATABASE=true`) | Yes — port 5433 |
| components | `tests/components/` | jsdom | No |

Integration + API run serially (`singleFork`/`singleThread`) — real Postgres can't parallelize clear-between-tests.

`pnpm install` runs `prisma generate` via postinstall. If pnpm blocks it, check `allowBuilds` in `pnpm-workspace.yaml` (must allow `@prisma/client`, `@prisma/engines`, `prisma`).

All test setups freeze time to `2026-01-15T12:00:00.000Z`. Gamma API client is mocked (fail-closed) by default in every setup — see `test/setup/`.

## Architecture

- `src/domain/` — pure business logic (auth, parlays, positions, settlement, leaderboard)
- `src/server/` — Prisma repos, Gamma API client with token-bucket rate limiter, route helpers
- `src/server/testing/` — test seed helpers
- `src/lib/` — utilities (`cn.ts`, `money.ts`)
- `src/app/` — App Router with route groups `(app)/`, `(auth)/`, `api/`
- `test/` — setup, fixtures (`test/fixtures/gamma/`), helpers
- `tests/` — test files per project

## Vercel

3 cron jobs (markets refresh 06:00, stipend 00:05, settlement 00:10 UTC). Protected by `CRON_SECRET`.

## Skills & issue tracker

Skills from mattpocock/skills live in `.claude/skills/` (tracked via `skills-lock.json`). Load with the `skill` tool.

Issues on GitHub (blokboy/arena), `gh` CLI. Triage labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md`.
