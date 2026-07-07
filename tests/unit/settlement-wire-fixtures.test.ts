/**
 * Voided-market detection (PRD Part III §6.1) against RAW wire-shaped
 * fixtures: a market is VOIDED (not resolved) when Gamma reports closed=true
 * but outcomePrices do NOT cleanly collapse to exactly one "1" and the rest
 * "0". tests/unit/settlement.test.ts covers the same rule with hand-built
 * typed fixtures; this suite pins that the real detector also accepts the
 * raw wire shape (stringified outcomePrices) unmodified.
 */
import { describe, expect, it } from "vitest";

import type { GammaMarket } from "../../src/domain/markets";
import { detectMarketResolution } from "../../src/domain/settlement";
import marketOpen from "../../test/fixtures/gamma/market-open-binary.json";
import marketResolvedMulti from "../../test/fixtures/gamma/market-resolved-multi-outcome.json";
import marketResolved from "../../test/fixtures/gamma/market-resolved-binary.json";
import marketVoided from "../../test/fixtures/gamma/market-voided.json";

describe("resolution vs void detection on raw fixtures", () => {
  it("leaves open markets unclassified (detection only applies to closed=true)", () => {
    expect(detectMarketResolution(marketOpen as GammaMarket)).toEqual({ status: "OPEN" });
  });

  it("treats a cleanly collapsed binary market as resolved", () => {
    expect(detectMarketResolution(marketResolved as GammaMarket)).toEqual({
      status: "RESOLVED",
      winningOutcomeIndex: 0,
      winningOutcomeLabel: "Yes"
    });
  });

  it("treats closed-but-uncollapsed prices as VOIDED, not resolved", () => {
    expect(detectMarketResolution(marketVoided as GammaMarket)).toEqual({ status: "VOIDED" });
  });

  it("multi-outcome collapse — PROVISIONAL fixture, see PRD Part III §6.1", () => {
    // The PRD flags this as a pre-implementation verification task: the
    // fixture assumes multi-outcome markets collapse like binary ones. If a
    // real recorded response contradicts this, the detection rule (and this
    // fixture) must change BEFORE the settlement job is built — otherwise
    // legitimately-resolved multi-outcome markets would be refunded as voided.
    expect(detectMarketResolution(marketResolvedMulti as GammaMarket)).toEqual({
      status: "RESOLVED",
      winningOutcomeIndex: 1,
      winningOutcomeLabel: "Candidate B"
    });
  });
});

describe("voided-market fallback rules (need repository + settlement job)", () => {
  it.todo("single-market Position: refunds original stake exactly, marks VOIDED");
  it.todo('refund is flat principal — never "last known price"');
  it.todo(
    "non-final parlay leg: neutral pass-through, forward-buys next leg with untouched amount"
  );
  it.todo("final parlay leg: refunds each stake to balance, Parlay.status = VOIDED");
  it.todo(
    "prefers an explicit Gamma void/cancel flag over the price heuristic if one exists (verify live API)"
  );
});
