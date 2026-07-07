/**
 * ============================================================================
 * PROVISIONAL — DO NOT FLESH OUT YET (PRD revision in flight)
 * ============================================================================
 * The parlay staking model is being revised in an active design session:
 * moving FROM cash stakes (LegStake bought at the leg — what
 * src/domain/parlays.ts currently implements and tests/unit/parlays.test.ts
 * pins) TO a share-transfer model. Decisions provisionally locked so far:
 *
 *   1. Share-transfer staking: users buy shares as a normal Position first,
 *      then transfer those shares into a parlay leg; shares leave the user's
 *      possession until claimed at parlay end (if victorious).
 *   2. Share-transfer is the ONLY staking primitive — leg 1, open backing,
 *      appends, Day's Parlay claims. Winnings moving through the chain stay
 *      automatic: a won leg pays 1/share; the system buys the next leg at
 *      live bestAsk with the proceeds.
 *   3. STANDARD rollover vote weight = share count (>50% of member shares).
 *   4. STANDARD chains lock at first resolution/rollover: appends free before
 *      any leg transition, rejected after.
 *   5. Fluid out-of-order resolution: legs resolve whenever markets resolve;
 *      an early-won leg auto-rolls its pot into the next unresolved leg; any
 *      lost leg kills the parlay (value to HOUSE).
 *   6. Consolidation: when the final leg's start nears (endDate − ~60min
 *      buffer; gameStartTime where Gamma provides it), still-unresolved
 *      earlier legs are force-exited at bestBid and rolled into the final
 *      leg as a system-triggered rollover.
 *   7. HOUSE-bonus basis = shares × bestBid stamped at commit;
 *      system-rolled stakes excluded.
 *
 * Everything below stays it.todo until the revision lands in
 * docs/prds/points-prediction-market.md (+ new ADRs). Re-derive the specs
 * from the revised text at that point — do not implement against the current
 * LegStake amount/entryPrice wording.
 * ============================================================================
 */
import { describe, it } from "vitest";

describe("leg ordering (stable across the revision)", () => {
  it.todo("legs are always ordered by market.endDate ASC, gammaId ASC regardless of append order");
  it.todo("an appended leg resolving before the currently-live window is rejected (that leg only)");
});

describe("staking model [PROVISIONAL — share-transfer revision]", () => {
  it.todo("leg creation is atomic with its first share transfer (ADR-0001) — no stakeless legs");
  it.todo(
    "share-transfer entry: shares come from an existing Position, never a fresh cash buy at the leg"
  );
  it.todo("transferred shares leave the user's possession until claim at parlay end");
  it.todo("a won leg pays 1/share and the system forward-buys the next leg at live bestAsk");
  it.todo("appends are free before any leg resolution/rollover and rejected after (chain locked)");
});

describe("fluid out-of-order resolution [PROVISIONAL]", () => {
  it.todo("an early-resolved winning leg auto-rolls its pot into the next unresolved leg");
  it.todo("any lost leg kills the parlay regardless of resolution order");
  it.todo(
    "consolidation at final leg start − buffer: unresolved legs force-exit at bestBid into the final leg"
  );
  it.todo(
    "consolidation is recorded as a system-triggered rollover, excluded from the HOUSE-bonus basis"
  );
});

describe("rollover votes [tally rules stable, weighting basis PROVISIONAL]", () => {
  it.todo(
    "STANDARD: member-only, weighted by share count, executes the instant yes > 50% (ADR-0003)"
  );
  it.todo("STANDARD: non-member backers share economically but never vote");
  it.todo(
    "STANDARD: no majority ever reached → leg rides to resolution (valid default, not deadlock)"
  );
  it.todo(
    "Day's Parlay: headcount majority (> 50% of distinct backers), no member tier, no weighting"
  );
});

describe("losses and HOUSE (stable)", () => {
  it.todo(
    "a lost leg transfers 100% of at-risk value to HOUSE with a HouseTransaction(PARLAY_LEG_LOSS)"
  );
  it.todo("rollovers never credit HOUSE (salvage, not loss)");
  it.todo("HOUSE-bonus basis = shares × bestBid at transfer, stamped at commit");
});
