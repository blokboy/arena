# CI/CD Gates

This repo should treat `main` as protected once the Next.js app is scaffolded. No direct push or PR merge should land unless the required checks pass.

## Required Checks

Recommended required GitHub Actions checks:

- `repo-hygiene`: runs `python3 scripts/validate_repo.py`.
- `install-and-static`: installs with `pnpm`, then runs format check, lint, typecheck, and Prisma schema validation.
- `unit`: Vitest unit project.
- `integration`: Vitest integration project against Postgres.
- `api`: API route tests against Postgres and mocked external services.
- `components`: React Testing Library component tests.
- `e2e-smoke`: Playwright smoke tests once a runnable app shell exists.
- `build`: `next build`.

For the current greenfield repo, `repo-hygiene` is the only runnable check. Add the remaining jobs in the first scaffold PR that introduces `package.json`, Prisma, and the Next.js app.

## GitHub Actions Shape

Create `.github/workflows/ci.yml` when the app scaffold exists:

```yaml
name: ci

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  repo-hygiene:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: python3 scripts/validate_repo.py

  install-and-static:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm format:check
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm prisma validate

  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:unit

  integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: arena
          POSTGRES_PASSWORD: arena
          POSTGRES_DB: arena_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U arena -d arena_test"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://arena:arena@localhost:5432/arena_test
      AUTH_SECRET: test-auth-secret
      NEXTAUTH_URL: http://localhost:3000
      GAMMA_API_BASE_URL: http://127.0.0.1:9
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma migrate deploy
      - run: pnpm test:integration
      - run: pnpm test:api

  components:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:components

  e2e-smoke:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: arena
          POSTGRES_PASSWORD: arena
          POSTGRES_DB: arena_e2e
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U arena -d arena_e2e"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://arena:arena@localhost:5432/arena_e2e
      AUTH_SECRET: test-auth-secret
      NEXTAUTH_URL: http://localhost:3000
      GAMMA_API_BASE_URL: http://127.0.0.1:9
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm prisma migrate deploy
      - run: pnpm build
      - run: pnpm test:e2e

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
```

Keep live Polymarket calls out of CI. The `GAMMA_API_BASE_URL` test value should fail loudly if production code accidentally reaches the network instead of using mocked/injected Gamma clients.

## Branch Protection

Configure the `main` branch with these rules in GitHub:

- Require a pull request before merging.
- Require status checks to pass before merging.
- Require branches to be up to date before merging.
- Require the checks listed above.
- Block force pushes.
- Block deletions.
- Require conversation resolution.
- Dismiss stale approvals when new commits are pushed.
- Restrict who can push directly to `main`; ideally nobody except automation with a narrow deploy token.

If using GitHub's newer rulesets, create one ruleset targeting `main` and apply the same required checks to both pull requests and direct pushes. The important policy is that a change cannot be made to `main` from either a PR merge or a direct push unless CI has passed.

## Deployment Gates

Use Vercel preview deployments for PRs, but do not make deployment success a substitute for tests. Recommended deployment flow:

- PR opened: run CI, create Vercel preview, and optionally run Playwright smoke tests against the preview URL.
- PR merged to `main`: run CI again on `main`.
- Production deploy: allow only from `main` after required CI passes.
- Scheduled jobs: keep cron routes protected by a secret and test job internals independently from Vercel.

## First Scaffold PR Checklist

The first app scaffold PR should add:

- `.github/workflows/ci.yml`.
- `package.json` scripts matching `docs/testing/strategy.md`.
- Vitest config with separate projects for unit, integration, API, and components.
- Playwright config with a seeded test database.
- Prisma migration/test database setup.
- Test helpers for authenticated requests, Prisma cleanup, Gamma fixtures, and fixed clocks.

Until then, keep this document as the CI contract and run `python3 scripts/validate_repo.py` for doc-only changes.
