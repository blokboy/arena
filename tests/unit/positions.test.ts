import { describe, expect, it } from "vitest";

import { normalizeGammaEvent, type GammaMarket } from "../../src/domain/markets";
import {
  calculateBuyQuote,
  calculateSellValue,
  getAvailableShares,
  groupPositions
} from "../../src/domain/positions";
import { createMemoryMarketCacheRepository } from "../../src/server/markets";
import { buyPositionLot, createMemoryPositionRepository } from "../../src/server/positions";
import { createMemoryUserRepository } from "../../src/server/users";
import { binaryGammaEvent } from "../../test/helpers/gamma-fixtures";

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

describe("buy operation", () => {
  function createBuyHarness(marketOverrides: Partial<GammaMarket> = {}) {
    const users = createMemoryUserRepository();
    const positions = createMemoryPositionRepository();
    const marketCache = createMemoryMarketCacheRepository();

    const event = binaryGammaEvent();
    event.markets = [{ ...event.markets?.[0], ...marketOverrides }];
    marketCache.upsertCategoryEvents({
      category: "Politics",
      events: [
        normalizeGammaEvent(event, {
          category: "Politics",
          lastSyncedAt: "2026-07-06T12:00:00.000Z"
        })
      ]
    });

    const user = users.createUser({ username: "trader", passwordHash: "hashed" });
    const buy = (input: { marketId?: string; outcomeIndex?: number; stake?: string } = {}) =>
      buyPositionLot({
        user,
        marketId: input.marketId ?? "market-democrat-win-2028",
        outcomeIndex: input.outcomeIndex ?? 0,
        stake: input.stake ?? "250",
        now: new Date("2026-07-06T12:34:56.000Z"),
        marketCache,
        users,
        positions
      });

    return { user, users, positions, buy };
  }

  it("buys at bestAsk, debits the balance, and records an OPEN lot", () => {
    const { user, buy, positions } = createBuyHarness();

    const result = buy({ stake: "250" });

    expect(result.balance).toBe(750);
    expect(user.balance).toBe(750);
    expect(result.lot).toEqual({
      id: "lot_1",
      userId: user.id,
      marketId: "market-democrat-win-2028",
      marketQuestion: "Will a Democrat win the 2028 US presidential election?",
      outcomeIndex: 0,
      outcomeLabel: "Yes",
      status: "OPEN",
      stake: "250",
      shares: "390.625",
      committedShares: "0",
      entryPrice: "0.64",
      purchasedAt: "2026-07-06T12:34:56.000Z"
    });
    expect(positions.listLotsByUserId(user.id)).toEqual([result.lot]);
  });

  it("creates an independent lot per buy — repeat buys are never merged", () => {
    const { user, buy, positions } = createBuyHarness();

    const first = buy({ stake: "100" });
    const second = buy({ stake: "100" });
    const opposite = buy({ stake: "100", outcomeIndex: 1 });

    const lots = positions.listLotsByUserId(user.id);
    expect(lots).toHaveLength(3);
    expect(new Set(lots.map((lot) => lot.id)).size).toBe(3);
    expect(first.lot.id).not.toBe(second.lot.id);
    expect(lots.map((lot) => lot.outcomeLabel)).toEqual(["Yes", "Yes", "No"]);
    expect(user.balance).toBe(700);
  });

  it("rejects unknown markets", () => {
    const { buy } = createBuyHarness();
    expect(() => buy({ marketId: "market-unknown" })).toThrow("MARKET_NOT_FOUND");
  });

  it("rejects closed and inactive markets", () => {
    const closed = createBuyHarness({ closed: true });
    expect(() => closed.buy()).toThrow("MARKET_CLOSED");

    const inactive = createBuyHarness({ active: false });
    expect(() => inactive.buy()).toThrow("MARKET_INACTIVE");
  });

  it("rejects outcome indexes outside the market's outcomes", () => {
    const { buy } = createBuyHarness();
    expect(() => buy({ outcomeIndex: -1 })).toThrow("INVALID_OUTCOME");
    expect(() => buy({ outcomeIndex: 2 })).toThrow("INVALID_OUTCOME");
    expect(() => buy({ outcomeIndex: 0.5 })).toThrow("INVALID_OUTCOME");
  });

  it("rejects malformed, non-positive, and sub-cent stakes", () => {
    const { buy } = createBuyHarness();
    expect(() => buy({ stake: "abc" })).toThrow("INVALID_STAKE");
    expect(() => buy({ stake: "-5" })).toThrow("INVALID_STAKE");
    expect(() => buy({ stake: "0" })).toThrow("INVALID_STAKE");
    expect(() => buy({ stake: "1.234" })).toThrow("INVALID_STAKE");
  });

  it("rejects markets without a usable bestAsk", () => {
    const missing = createBuyHarness({ bestAsk: null });
    expect(() => missing.buy()).toThrow("PRICE_UNAVAILABLE");

    const zero = createBuyHarness({ bestAsk: "0" });
    expect(() => zero.buy()).toThrow("PRICE_UNAVAILABLE");
  });

  it("rejects stakes over the balance without touching balance or lots", () => {
    const { user, buy, positions } = createBuyHarness();

    expect(() => buy({ stake: "1000.01" })).toThrow("INSUFFICIENT_BALANCE");

    expect(user.balance).toBe(1000);
    expect(positions.listLotsByUserId(user.id)).toEqual([]);
  });
});
