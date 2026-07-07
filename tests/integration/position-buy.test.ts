import { afterEach, describe, expect, test } from "vitest";

import { normalizeGammaEvent } from "@/domain/markets";
import { marketCacheRepository } from "@/server/markets";
import { buyPositionLot, positionRepository } from "@/server/positions";
import { userRepository } from "@/server/users";
import { binaryGammaEvent } from "@test/helpers/gamma-fixtures";

function seedCachedPoliticsEvent(marketOverrides: { bestAsk?: string | null } = {}) {
  const event = binaryGammaEvent();
  event.markets = [{ ...event.markets?.[0], ...marketOverrides }];
  marketCacheRepository.upsertCategoryEvents({
    category: "Politics",
    events: [
      normalizeGammaEvent(event, {
        category: "Politics",
        lastSyncedAt: "2026-07-06T12:00:00.000Z"
      })
    ]
  });
}

describe("position buy transaction", () => {
  afterEach(() => {
    marketCacheRepository.clear();
  });

  test("a successful buy debits the balance and creates the lot in one operation", () => {
    seedCachedPoliticsEvent();
    const user = userRepository.createUser({ username: "mira", passwordHash: "hashed" });

    const result = buyPositionLot({
      user,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      stake: "250",
      now: new Date("2026-07-06T13:00:00.000Z")
    });

    expect(userRepository.findById(user.id)?.balance).toBe(750);
    expect(result.balance).toBe(750);
    expect(positionRepository.listLotsByUserId(user.id)).toEqual([
      expect.objectContaining({
        id: result.lot.id,
        userId: user.id,
        marketId: "market-democrat-win-2028",
        status: "OPEN",
        stake: "250",
        shares: "390.625",
        entryPrice: "0.64",
        committedShares: "0"
      })
    ]);
  });

  test("a rejected buy applies neither the debit nor the lot", () => {
    seedCachedPoliticsEvent();
    const user = userRepository.createUser({ username: "jules", passwordHash: "hashed" });

    expect(() =>
      buyPositionLot({
        user,
        marketId: "market-democrat-win-2028",
        outcomeIndex: 0,
        stake: "1200",
        now: new Date("2026-07-06T13:00:00.000Z")
      })
    ).toThrow("INSUFFICIENT_BALANCE");

    expect(userRepository.findById(user.id)?.balance).toBe(1000);
    expect(positionRepository.listLotsByUserId(user.id)).toEqual([]);
  });

  test("a buy with no usable price applies neither the debit nor the lot", () => {
    seedCachedPoliticsEvent({ bestAsk: null });
    const user = userRepository.createUser({ username: "priya", passwordHash: "hashed" });

    expect(() =>
      buyPositionLot({
        user,
        marketId: "market-democrat-win-2028",
        outcomeIndex: 0,
        stake: "250",
        now: new Date("2026-07-06T13:00:00.000Z")
      })
    ).toThrow("PRICE_UNAVAILABLE");

    expect(userRepository.findById(user.id)?.balance).toBe(1000);
    expect(positionRepository.listLotsByUserId(user.id)).toEqual([]);
  });

  test("a failed buy after a successful one leaves the earlier debit and lot intact", () => {
    seedCachedPoliticsEvent();
    const user = userRepository.createUser({ username: "casey", passwordHash: "hashed" });

    buyPositionLot({
      user,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      stake: "400",
      now: new Date("2026-07-06T13:00:00.000Z")
    });

    expect(() =>
      buyPositionLot({
        user,
        marketId: "market-democrat-win-2028",
        outcomeIndex: 0,
        stake: "700",
        now: new Date("2026-07-06T13:05:00.000Z")
      })
    ).toThrow("INSUFFICIENT_BALANCE");

    expect(userRepository.findById(user.id)?.balance).toBe(600);
    expect(positionRepository.listLotsByUserId(user.id)).toHaveLength(1);
  });

  test("sequential buys accumulate debits as independent lots", () => {
    seedCachedPoliticsEvent();
    const user = userRepository.createUser({ username: "remy", passwordHash: "hashed" });

    const first = buyPositionLot({
      user,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      stake: "250",
      now: new Date("2026-07-06T13:00:00.000Z")
    });
    const second = buyPositionLot({
      user,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      stake: "250",
      now: new Date("2026-07-06T13:05:00.000Z")
    });

    expect(first.lot.id).not.toBe(second.lot.id);
    expect(userRepository.findById(user.id)?.balance).toBe(500);
    expect(positionRepository.listLotsByUserId(user.id).map((lot) => lot.id)).toEqual([
      first.lot.id,
      second.lot.id
    ]);
  });
});
