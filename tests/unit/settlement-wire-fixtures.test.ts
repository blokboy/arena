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
import { calculatePositionSettlement, detectMarketResolution } from "../../src/domain/settlement";
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

describe("voided-market fallback rules on raw fixtures", () => {
  it("single-market Position: refunds original stake exactly, marks VOIDED", () => {
    expect(
      calculatePositionSettlement({
        outcomeIndex: 0,
        stake: "100",
        shares: "200",
        committedShares: "0",
        resolution: detectMarketResolution(marketVoided as GammaMarket)
      })
    ).toEqual({
      status: "VOIDED",
      settledShares: "200",
      payout: "100"
    });
  });

  it('refund is flat principal — never "last known price"', () => {
    expect(
      calculatePositionSettlement({
        outcomeIndex: 0,
        stake: "90",
        shares: "180",
        committedShares: "30",
        resolution: detectMarketResolution(marketVoided as GammaMarket)
      })
    ).toEqual({
      status: "VOIDED",
      settledShares: "150",
      payout: "75"
    });
  });
});
