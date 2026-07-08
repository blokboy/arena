import { describe, expect, test } from "vitest";

import { normalizeGammaEvent, type GammaMarket } from "@/domain/markets";
import { prisma } from "@/server/db";
import { marketCacheRepository } from "@/server/markets";
import { buyPositionLot, positionRepository, sellAllPositions } from "@/server/positions";
import { userRepository } from "@/server/users";
import { binaryGammaEvent } from "@test/helpers/gamma-fixtures";

async function seedCachedPoliticsEvent(marketOverrides: Partial<GammaMarket> = {}) {
  const event = binaryGammaEvent();
  event.markets = [{ ...event.markets?.[0], ...marketOverrides }];
  await marketCacheRepository.upsertCategoryEvents({
    category: "Politics",
    events: [
      normalizeGammaEvent(event, {
        category: "Politics",
        lastSyncedAt: "2026-07-06T12:00:00.000Z"
      })
    ]
  });
}

describe("position sell-all transaction", () => {
  test("sells every uncommitted share in the group and excludes committed shares", async () => {
    await seedCachedPoliticsEvent();
    const user = await userRepository.createUser({ username: "casey", passwordHash: "hashed" });

    const first = await buyPositionLot({
      user,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      stake: "64",
      now: new Date("2026-07-06T13:00:00.000Z")
    });
    const second = await buyPositionLot({
      user,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      stake: "128",
      now: new Date("2026-07-06T13:05:00.000Z")
    });

    await prisma.position.update({
      where: { id: second.lot.id },
      data: { committedShares: "50" }
    });

    const result = await sellAllPositions({
      user,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      now: new Date("2026-07-06T13:10:00.000Z")
    });

    expect(result.proceeds).toBe("155");
    expect(result.balance).toBe(963);
    expect((await userRepository.findById(user.id))?.balance).toBe(963);
    expect(await positionRepository.findById(first.lot.id)).toEqual(
      expect.objectContaining({
        id: first.lot.id,
        status: "SOLD",
        shares: "0",
        stake: "0"
      })
    );
    expect(await positionRepository.findById(second.lot.id)).toEqual(
      expect.objectContaining({
        id: second.lot.id,
        status: "OPEN",
        shares: "50",
        committedShares: "50",
        stake: "32"
      })
    );
  });

  test("a rejected sell-all leaves both the balance and lots unchanged", async () => {
    await seedCachedPoliticsEvent({ bestBid: null });
    const user = await userRepository.createUser({ username: "remy", passwordHash: "hashed" });

    const first = await buyPositionLot({
      user,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      stake: "64",
      now: new Date("2026-07-06T13:00:00.000Z")
    });
    const second = await buyPositionLot({
      user,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      stake: "128",
      now: new Date("2026-07-06T13:05:00.000Z")
    });

    await expect(
      sellAllPositions({
        user,
        marketId: "market-democrat-win-2028",
        outcomeIndex: 0,
        now: new Date("2026-07-06T13:10:00.000Z")
      })
    ).rejects.toThrow("PRICE_UNAVAILABLE");

    expect((await userRepository.findById(user.id))?.balance).toBe(808);
    expect(await positionRepository.findById(first.lot.id)).toEqual(
      expect.objectContaining({
        id: first.lot.id,
        status: "OPEN",
        shares: "100",
        stake: "64"
      })
    );
    expect(await positionRepository.findById(second.lot.id)).toEqual(
      expect.objectContaining({
        id: second.lot.id,
        status: "OPEN",
        shares: "200",
        stake: "128"
      })
    );
  });
});
