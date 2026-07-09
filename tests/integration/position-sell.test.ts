import { describe, expect, test } from "vitest";

import { normalizeGammaEvent, type GammaMarket } from "@/domain/markets";
import { prisma } from "@/server/db";
import { marketCacheRepository } from "@/server/markets";
import { buyPositionLot, listPositionLots, positionRepository, sellPositionLot } from "@/server/positions";
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

describe("position sell transaction", () => {
  test("credits only the available shares and leaves committed shares locked", async () => {
    await seedCachedPoliticsEvent();
    const user = await userRepository.createUser({ username: "mira", passwordHash: "hashed" });

    const buy = await buyPositionLot({
      user,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      stake: "250",
      now: new Date("2026-07-06T13:00:00.000Z")
    });
    await prisma.position.update({
      where: { id: buy.lot.id },
      data: { committedShares: "140.625" }
    });

    const result = await sellPositionLot({
      user,
      positionId: buy.lot.id,
      now: new Date("2026-07-06T13:05:00.000Z")
    });

    expect(result.proceeds).toBe("155");
    expect(result.balance).toBe(905);
    expect((await userRepository.findById(user.id))?.balance).toBe(905);
    expect(await positionRepository.findById(buy.lot.id)).toEqual(
      expect.objectContaining({
        id: buy.lot.id,
        status: "OPEN",
        shares: "140.625",
        committedShares: "140.625",
        stake: "90"
      })
    );
  });

  test("a rejected sell applies neither the credit nor the lot update", async () => {
    await seedCachedPoliticsEvent({ bestBid: null });
    const user = await userRepository.createUser({ username: "jules", passwordHash: "hashed" });

    const buy = await buyPositionLot({
      user,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      stake: "100",
      now: new Date("2026-07-06T13:00:00.000Z")
    });

    await expect(
      sellPositionLot({
        user,
        positionId: buy.lot.id,
        now: new Date("2026-07-06T13:05:00.000Z")
      })
    ).rejects.toThrow("PRICE_UNAVAILABLE");

    expect((await userRepository.findById(user.id))?.balance).toBe(900);
    expect(await positionRepository.findById(buy.lot.id)).toEqual(
      expect.objectContaining({
        id: buy.lot.id,
        status: "OPEN",
        shares: "156.25",
        committedShares: "0",
        stake: "100"
      })
    );
  });

  // Position.committedSettled (flip-not-decrement, issue #11) — defaults
  // false on creation and must round-trip through the repository once
  // Settlement flips it true, so Portfolio can distinguish "locked, still
  // at risk" from "locked, already resolved via parlay."
  test("surfaces committedSettled, defaulting false and round-tripping once flipped", async () => {
    await seedCachedPoliticsEvent();
    const user = await userRepository.createUser({ username: "priya", passwordHash: "hashed" });

    const buy = await buyPositionLot({
      user,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      stake: "100",
      now: new Date("2026-07-06T13:00:00.000Z")
    });

    expect(await positionRepository.findById(buy.lot.id)).toEqual(
      expect.objectContaining({ id: buy.lot.id, committedSettled: false })
    );

    await prisma.position.update({
      where: { id: buy.lot.id },
      data: { committedShares: "50", committedSettled: true }
    });

    expect(await positionRepository.findById(buy.lot.id)).toEqual(
      expect.objectContaining({ id: buy.lot.id, committedShares: "50", committedSettled: true })
    );

    const listed = await listPositionLots({ userId: user.id, now: new Date("2026-07-06T13:10:00.000Z") });
    expect(listed.find((lot) => lot.id === buy.lot.id)).toEqual(
      expect.objectContaining({ committedSettled: true })
    );
  });
});
