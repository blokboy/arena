import { describe, expect, it } from "vitest";

import {
  calculateBuyQuote,
  calculateSellValue,
  getAvailableShares,
  groupPositions
} from "../../src/domain/positions";

describe("buy stake-to-shares math", () => {
  it("buys shares at the current bestAsk", () => {
    expect(calculateBuyQuote({ stake: "250", bestAsk: "0.64" })).toEqual({
      stake: "250",
      price: "0.64",
      shares: "390.625"
    });
  });

  it("rejects stakes and prices that cannot create shares", () => {
    expect(() => calculateBuyQuote({ stake: "0", bestAsk: "0.64" })).toThrow("INVALID_STAKE");
    expect(() => calculateBuyQuote({ stake: "100", bestAsk: "0" })).toThrow("INVALID_PRICE");
  });
});

describe("portfolio position grouping", () => {
  it("groups lots by market and outcome with blended entry and available shares", () => {
    const groups = groupPositions([
      {
        id: "lot-1",
        marketId: "market-1",
        marketQuestion: "Will it rain?",
        outcomeIndex: 0,
        outcomeLabel: "Yes",
        status: "OPEN",
        stake: "100",
        shares: "200",
        committedShares: "25",
        entryPrice: "0.5",
        purchasedAt: "2026-07-06T10:00:00.000Z"
      },
      {
        id: "lot-2",
        marketId: "market-1",
        marketQuestion: "Will it rain?",
        outcomeIndex: 0,
        outcomeLabel: "Yes",
        status: "OPEN",
        stake: "60",
        shares: "100",
        committedShares: "0",
        entryPrice: "0.6",
        purchasedAt: "2026-07-06T11:00:00.000Z"
      },
      {
        id: "lot-3",
        marketId: "market-1",
        marketQuestion: "Will it rain?",
        outcomeIndex: 1,
        outcomeLabel: "No",
        status: "OPEN",
        stake: "80",
        shares: "200",
        committedShares: "0",
        entryPrice: "0.4",
        purchasedAt: "2026-07-06T12:00:00.000Z"
      }
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      marketId: "market-1",
      outcomeIndex: 0,
      outcomeLabel: "Yes",
      totalStake: "160",
      totalShares: "300",
      committedShares: "25",
      availableShares: "275",
      averageEntryPrice: "0.5333333333333333"
    });
    expect(groups[0]?.lots.map((lot) => lot.id)).toEqual(["lot-1", "lot-2"]);
  });

  it("computes lot-level available shares and sell-all value at bestBid", () => {
    expect(getAvailableShares({ shares: "200", committedShares: "25" })).toBe("175");
    expect(calculateSellValue({ shares: "275", bestBid: "0.61" })).toBe("167.75");
  });
});
