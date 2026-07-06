import { describe, expect, it } from "vitest";

import {
  calculatePositionSettlement,
  detectMarketResolution,
  getUtcGrantDay
} from "../../src/domain/settlement";
import {
  resolvedBinaryGammaMarket,
  resolvedMultiOutcomeGammaMarket,
  voidedGammaMarket
} from "../../test/helpers/gamma-fixtures";

describe("market resolution detection", () => {
  it("detects the winning outcome for binary markets", () => {
    expect(detectMarketResolution(resolvedBinaryGammaMarket())).toEqual({
      status: "RESOLVED",
      winningOutcomeIndex: 0,
      winningOutcomeLabel: "Yes"
    });
  });

  it("detects the winning outcome for multi-outcome markets", () => {
    expect(detectMarketResolution(resolvedMultiOutcomeGammaMarket())).toEqual({
      status: "RESOLVED",
      winningOutcomeIndex: 1,
      winningOutcomeLabel: "Brazil"
    });
  });

  it("treats closed markets without a single collapsed winner as voided", () => {
    expect(detectMarketResolution(voidedGammaMarket())).toEqual({
      status: "VOIDED"
    });
  });
});

describe("single-market settlement math", () => {
  it("pays uncommitted winning shares at collapsed outcome price", () => {
    expect(
      calculatePositionSettlement({
        outcomeIndex: 0,
        stake: "100",
        shares: "200",
        committedShares: "25",
        resolution: detectMarketResolution(resolvedBinaryGammaMarket())
      })
    ).toEqual({
      status: "WON",
      settledShares: "175",
      payout: "175"
    });
  });

  it("does not pay losing uncommitted shares", () => {
    expect(
      calculatePositionSettlement({
        outcomeIndex: 1,
        stake: "80",
        shares: "200",
        committedShares: "0",
        resolution: detectMarketResolution(resolvedBinaryGammaMarket())
      })
    ).toEqual({
      status: "LOST",
      settledShares: "200",
      payout: "0"
    });
  });

  it("refunds original uncommitted principal for voided markets", () => {
    expect(
      calculatePositionSettlement({
        outcomeIndex: 0,
        stake: "100",
        shares: "200",
        committedShares: "50",
        resolution: detectMarketResolution(voidedGammaMarket())
      })
    ).toEqual({
      status: "VOIDED",
      settledShares: "150",
      payout: "75"
    });
  });
});

describe("bankruptcy stipend UTC grant day", () => {
  it("keys stipend idempotency to the UTC calendar day", () => {
    expect(getUtcGrantDay(new Date("2026-07-06T23:59:59.999Z"))).toBe("2026-07-06");
    expect(getUtcGrantDay(new Date("2026-07-07T00:00:00.000Z"))).toBe("2026-07-07");
  });
});
