# Testing Strategy

This repo is currently greenfield, with the product and implementation plan captured in `docs/prds/points-prediction-market.md`. When the Next.js app is scaffolded, testing should be installed as a first-class part of the app rather than bolted on after domain logic exists.

## Goals

- Catch regressions in the points ledger, settlement engine, Auth.js credentials flow, Prisma data model, and parlay lifecycle before they reach `main`.
- Make domain-heavy behavior executable: atomic leg creation, locked committed shares, member-only stake-weighted rollover votes, Day's Parlay one-shot votes, HOUSE transfers, bankruptcy stipends, and UTC day boundaries.
- Keep external dependencies controlled. Tests should not call the live Polymarket Gamma API, Vercel, Neon, or email/OAuth providers.
- Keep the loop fast enough that unit and most integration tests can run locally before every PR.

## Recommended Tooling

| Layer | Tool | Purpose |
|---|---|---|
| Unit and integration tests | Vitest | TypeScript-first runner for server utilities, domain services, route helpers, React hooks, and pure components. |
| React component tests | React Testing Library + `@testing-library/user-event` | User-facing component behavior, accessibility affordances, forms, dialogs, and optimistic UI states. |
| API route tests | Vitest + Next route-handler invocation helpers | Exercise `app/api/**/route.ts` handlers without a browser. |
| Database tests | Prisma + disposable Postgres | Validate transactions, constraints, Decimal arithmetic, and query behavior against the same database family used in production. |
| Browser smoke/E2E | Playwright | Minimal authenticated happy paths and high-risk interaction flows after the app shell exists. |
| Network mocking | MSW for browser/component tests; injectable Gamma client fakes for server tests | Keep tests deterministic and prevent live Gamma calls. |
| Static gates | `tsc --noEmit`, ESLint, Prettier/check, Prisma format/validate | Catch type, style, and schema problems before runtime tests. |

Use `Decimal` values in tests the same way production code does. Do not loosen tests to JavaScript `number` math around balances, prices, shares, or HOUSE transactions.

## Test Commands

Once the app is scaffolded, standardize on these scripts:

```json
{
  "scripts": {
    "format:check": "prettier --check .",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test:unit": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "test:api": "vitest run --project api",
    "test:components": "vitest run --project components",
    "test:e2e": "playwright test",
    "test": "pnpm test:unit && pnpm test:integration && pnpm test:api && pnpm test:components"
  }
}
```

The exact Vitest project names can change, but keep separate CI-visible commands so failures identify the broken layer.

## Test Data Rules

- Use builders/factories for `User`, `GammaMarket`, `Position`, `Parlay`, `ParlayLeg`, `LegStake`, `LegStakeSource`, `RolloverVote`, `HouseAccount`, and `BankruptcyStipendGrant`.
- Seed markets from local fixtures that mimic Gamma responses. Include binary markets, multi-outcome markets, resolved markets with `outcomePrices` collapsed to one winner, and void/cancelled-like markets where closed prices do not collapse cleanly.
- Freeze time in tests that touch Day's Parlay, UTC day rollover, cron windows, or `lastSyncedAt` staleness.
- Give every integration test its own database transaction or schema cleanup. Tests must be repeatable and order-independent.

## What To Mock

Mock these by default:

- Polymarket Gamma API: use fixtures or an injected `GammaClient` fake. Only a dedicated contract/smoke test should validate current Gamma response shape, and that should not be required in normal PR CI.
- Auth.js session lookup in unit/component tests: provide authenticated/unauthenticated test helpers. API integration tests should still exercise credential registration/sign-in routes where practical.
- Vercel Cron and deployment environment: call job handlers directly with fixed timestamps.
- Rate limiter/backoff timers: inject a fake clock and deterministic limiter state.
- Browser time zone display in frontend tests: set `Intl`/timezone expectations explicitly around the UTC Day's Parlay boundary.

Back with a real test Postgres database:

- Prisma model constraints and relations.
- Balance debits/credits and `Decimal` math.
- Commit/sell locking behavior, including `committedShares`.
- Transactional vote/settlement behavior.
- HOUSE ledger mutations and Day's Parlay bonus distribution.
- Leaderboard MEAN query, especially active-user eligibility.

## Unit Tests

Unit tests should target pure logic and small service functions with no real database.

Required coverage:

- Price/share math: buy at `bestAsk`, sell at `bestBid`, shares from stake, payout from collapsed `outcomePrices`, and rounded display values.
- Gamma resolution parsing: winner detection for binary and multi-outcome markets; void detection when closed prices do not collapse cleanly.
- Leg ordering: `endDate ASC, gammaId ASC` sorting and rejection of appends before the active leg.
- Rollover tally math:
  - Standard parlays use only formal-member backers.
  - Weights recompute from current member stake.
  - A strict `> 50%` yes stake passes; exactly 50% does not.
  - Non-member stake never enters the denominator.
- Day's Parlay vote math:
  - One vote per backer per day.
  - Strict headcount majority.
  - Rollover cap of 3 per day.
- UTC day boundary helpers.
- Error mapping for stable API `error.code` values such as `LEG_APPEND_TOO_EARLY`, `MARKET_ALREADY_CLAIMED`, `ROLLOVER_CAP_REACHED`, `VOTE_ALREADY_SPENT`, and `INSUFFICIENT_BALANCE`.

## Integration and Prisma Tests

Integration tests should use Prisma against disposable Postgres because the risky behavior is transactional.

Required coverage:

- Registration creates a user with 1,000 points and a password hash, never a plaintext password.
- Buying a position debits balance and creates an independent lot.
- Selling a lot credits only uncommitted shares.
- Group sell-all excludes committed shares locked into parlay stakes.
- Appending or claiming a leg is atomic with its first stake. A leg with no accompanying commitment must not persist.
- Committing shares creates `LegStakeSource`, increments `Position.committedShares`, and upserts aggregate `LegStake` in one transaction.
- Future-leg commitments are immediately locked and forfeited if an earlier active leg fails.
- Standard rollover votes reject non-members and members without active stake.
- Standard rollover executes once when member yes stake crosses the threshold, including under racing vote attempts.
- Day's Parlay rejects a second vote by the same user on another leg in the same day.
- Settlement credits won single-market positions only for uncommitted shares.
- Single-market losses do not credit HOUSE.
- Parlay losses transfer current at-risk stake to HOUSE with append-only `HouseTransaction` rows.
- Day's Parlay success pays normal final-leg winnings plus 50% of HOUSE, distributed by fresh committed principal from `LegStakeSource.committedPrincipal`.
- Bankruptcy stipend grants +200 only once per user per UTC day when balance is at or below zero.
- Leaderboard rows include every user, while MEAN includes only active users with at least one `Position` or `LegStake`.

## API Route Tests

Route tests should invoke Next.js route handlers with request objects and an authenticated test context.

Required coverage:

- `POST /api/auth/register`: success, duplicate username, weak/missing password, generic login failure behavior.
- `GET /api/me`: 401 unauthenticated; authenticated shape includes current balance.
- Market reads serve cached data and expose `lastSyncedAt`; list routes do not call Gamma directly.
- `POST /api/positions`, `POST /api/positions/:id/sell`, and `POST /api/positions/sell-all`: ownership, balance, market lifecycle, and committed-share validation.
- `POST /api/parlays` and `POST /api/parlays/:id/legs`: fixed roster creation, draft visibility, atomic leg/stake creation, sorted leg response, structured append errors.
- `GET /api/parlays/:id` and `GET /api/days-parlay`: sorted legs, `memberVoteTally`, Day's Parlay `myVote`, `houseBalance`, and `myContributedPrincipal`.
- Rollover vote endpoints: eligibility, threshold execution, cap enforcement, and structured error responses.
- Cron route handlers, if exposed under `app/api/cron/**`: require a cron secret or equivalent authorization guard.

## Scheduled Job and Settlement Tests

Scheduled jobs should be tested by calling internal job functions directly. Keep the Vercel Cron HTTP wrapper thin.

Required coverage:

- Settlement refreshes only markets referenced by open positions, active legs, and overdue pending legs.
- Won non-final parlay legs roll value forward into the next sorted pending leg at the next leg's fresh `bestAsk`.
- Early rollover uses current `bestBid`, stamps `exitPrice`/`exitedAt`, and redeploys into the next leg.
- Lost active legs fail the chain and forfeit trailing pending commitments to HOUSE.
- Voided non-final legs pass principal forward neutrally; voided final legs refund and mark the parlay `VOIDED`.
- Settlement is idempotent if the job runs twice.
- Rate-limit/backoff behavior skips or retries one market without aborting the whole job.

## Frontend Component and Interaction Tests

Use React Testing Library for component behavior and Playwright for a small number of end-to-end flows after the app has a runnable UI.

Required component coverage:

- Auth forms show generic login errors and field-specific signup validation.
- Buy panel disables stake above balance and previews shares from `bestAsk`.
- Sell panel groups lots, distinguishes per-lot sell from sell-all, and confirms sell-all scope.
- Portfolio groups open and settled positions by `(marketId, outcomeIndex)`.
- `LegTimeline` renders server-provided order and each leg state with text plus a non-color signal.
- Append/claim forms require eligible position commitments and show locked-share/HOUSE-loss warnings.
- Standard `RolloverControl` shows stake-weighted member tally, read-only state for non-member backers, and decisive-vote confirmation copy.
- Day's Parlay vote-spend flow confirms one-shot voting, disables other voted-eligible legs with a visible reason, and updates the sticky vote header.
- Price staleness captions appear only after the configured threshold.
- UTC reset caption renders in the viewer's local time without changing the server day key.

Recommended Playwright smoke flows:

- Register, log in, buy a position, and see the balance change.
- Create a standard parlay draft, seed leg 1 with a purchased position, and verify it appears active.
- Back a Day's Parlay leg and spend the one rollover vote.
- Run an admin/test-only settlement helper in a seeded environment and verify visible portfolio/leaderboard updates.

## Minimum Coverage Policy

Do not start with an arbitrary global percentage gate while the app is being scaffolded. Instead:

- CI must require all tests in the changed layer to pass.
- New domain services, route handlers, Prisma transactions, and scheduled-job branches must include focused tests in the same PR.
- Once core modules stabilize, add thresholds by project: high for pure domain logic and lower for UI shells.

The first hard coverage thresholds should apply to the settlement/parlay engine, Gamma parsing, auth registration, and ledger mutations because those are the highest-risk areas.
