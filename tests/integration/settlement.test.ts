import { describe, expect, test } from "vitest";

import { normalizeGammaEvent, type GammaMarket } from "@/domain/markets";
import { prisma } from "@/server/db";
import { marketCacheRepository } from "@/server/markets";
import { buyPositionLot, positionRepository } from "@/server/positions";
import { runSettlementSweep } from "@/server/settlement";
import { userRepository } from "@/server/users";
import {
  binaryGammaEvent,
  resolvedBinaryGammaMarket,
  voidedGammaMarket
} from "@test/helpers/gamma-fixtures";

async function seedCachedPoliticsEvent(marketOverrides: Partial<GammaMarket> = {}) {
  const event = binaryGammaEvent();
  event.markets = [{ ...event.markets?.[0], ...marketOverrides }];
  await marketCacheRepository.upsertCategoryEvents({
    category: "Politics",
    events: [
      normalizeGammaEvent(event, {
        category: "Politics",
        lastSyncedAt: "2026-01-15T11:00:00.000Z"
      })
    ]
  });
}

describe("settlement sweep", () => {
  test("credits only uncommitted winning shares and leaves committed shares open as a split lot", async () => {
    await seedCachedPoliticsEvent();
    const user = await userRepository.createUser({ username: "mira", passwordHash: "hashed" });

    const buy = await buyPositionLot({
      user,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      stake: "64",
      now: new Date("2026-01-15T12:00:00.000Z")
    });
    await prisma.position.update({
      where: { id: buy.lot.id },
      data: { committedShares: "25" }
    });

    const result = await runSettlementSweep({
      now: new Date("2026-01-15T12:05:00.000Z"),
      gammaClient: {
        fetchEventsByTag: async () => [],
        fetchMarketById: async () => resolvedBinaryGammaMarket()
      }
    });

    expect(result.marketIds).toEqual(["market-democrat-win-2028"]);
    expect(result.skippedMarketIds).toEqual([]);
    expect(result.settledPositions).toBe(1);
    expect((await userRepository.findById(user.id))?.balance).toBe(1011);

    const lots = await positionRepository.listLotsByUserId(user.id);
    expect(lots).toHaveLength(2);
    expect(lots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: buy.lot.id,
          status: "OPEN",
          shares: "25",
          committedShares: "25",
          stake: "16"
        }),
        expect.objectContaining({
          status: "WON",
          shares: "75",
          committedShares: "0",
          stake: "48",
          exitPrice: "1"
        })
      ])
    );
  });

  test("single-market losses do not create HOUSE transactions", async () => {
    await seedCachedPoliticsEvent();
    const user = await userRepository.createUser({ username: "jules", passwordHash: "hashed" });

    await buyPositionLot({
      user,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 1,
      stake: "64",
      now: new Date("2026-01-15T12:00:00.000Z")
    });

    const result = await runSettlementSweep({
      now: new Date("2026-01-15T12:05:00.000Z"),
      gammaClient: {
        fetchEventsByTag: async () => [],
        fetchMarketById: async () => resolvedBinaryGammaMarket()
      }
    });

    expect(result.settledPositions).toBe(1);
    expect((await userRepository.findById(user.id))?.balance).toBe(936);
    expect(await prisma.houseTransaction.count()).toBe(0);
    expect(await positionRepository.listLotsByUserId(user.id)).toEqual([
      expect.objectContaining({
        status: "LOST",
        shares: "100",
        stake: "64",
        exitPrice: "0"
      })
    ]);
  });

  test("voided markets refund the original stake", async () => {
    await seedCachedPoliticsEvent();
    const user = await userRepository.createUser({ username: "priya", passwordHash: "hashed" });

    const buy = await buyPositionLot({
      user,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      stake: "64",
      now: new Date("2026-01-15T12:00:00.000Z")
    });

    const result = await runSettlementSweep({
      now: new Date("2026-01-15T12:05:00.000Z"),
      gammaClient: {
        fetchEventsByTag: async () => [],
        fetchMarketById: async () => voidedGammaMarket()
      }
    });

    expect(result.settledPositions).toBe(1);
    expect((await userRepository.findById(user.id))?.balance).toBe(1000);
    expect(await positionRepository.listLotsByUserId(user.id)).toEqual([
      expect.objectContaining({
        id: buy.lot.id,
        status: "VOIDED",
        shares: "100",
        stake: "64"
      })
    ]);
  });
});
