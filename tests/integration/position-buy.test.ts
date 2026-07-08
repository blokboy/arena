import { describe, expect, test } from "vitest";

import { normalizeGammaEvent } from "@/domain/markets";
import { marketCacheRepository } from "@/server/markets";
import { buyPositionLot, positionRepository } from "@/server/positions";
import { userRepository } from "@/server/users";
import { binaryGammaEvent } from "@test/helpers/gamma-fixtures";

async function seedCachedPoliticsEvent(marketOverrides: { bestAsk?: string | null } = {}) {
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

// Cleanup is handled by test/setup/integration.ts's global afterEach, which
// clears positions before markets (required FK order against real
// Postgres) — a local afterEach here that only cleared markets would run
// before that global hook (Vitest runs the more specific/inner hook first)
// and violate the Position -> CachedMarket foreign key.
describe("position buy transaction", () => {

  test("a successful buy debits the balance and creates the lot in one operation", async () => {
    await seedCachedPoliticsEvent();
    const user = await userRepository.createUser({ username: "mira", passwordHash: "hashed" });

    const result = await buyPositionLot({
      user,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      stake: "250",
      now: new Date("2026-07-06T13:00:00.000Z")
    });

    expect((await userRepository.findById(user.id))?.balance).toBe(750);
    expect(result.balance).toBe(750);
    expect(await positionRepository.listLotsByUserId(user.id)).toEqual([
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

  test("a rejected buy applies neither the debit nor the lot", async () => {
    await seedCachedPoliticsEvent();
    const user = await userRepository.createUser({ username: "jules", passwordHash: "hashed" });

    await expect(
      buyPositionLot({
        user,
        marketId: "market-democrat-win-2028",
        outcomeIndex: 0,
        stake: "1200",
        now: new Date("2026-07-06T13:00:00.000Z")
      })
    ).rejects.toThrow("INSUFFICIENT_BALANCE");

    expect((await userRepository.findById(user.id))?.balance).toBe(1000);
    expect(await positionRepository.listLotsByUserId(user.id)).toEqual([]);
  });

  test("a buy with no usable price applies neither the debit nor the lot", async () => {
    await seedCachedPoliticsEvent({ bestAsk: null });
    const user = await userRepository.createUser({ username: "priya", passwordHash: "hashed" });

    await expect(
      buyPositionLot({
        user,
        marketId: "market-democrat-win-2028",
        outcomeIndex: 0,
        stake: "250",
        now: new Date("2026-07-06T13:00:00.000Z")
      })
    ).rejects.toThrow("PRICE_UNAVAILABLE");

    expect((await userRepository.findById(user.id))?.balance).toBe(1000);
    expect(await positionRepository.listLotsByUserId(user.id)).toEqual([]);
  });

  test("a failed buy after a successful one leaves the earlier debit and lot intact", async () => {
    await seedCachedPoliticsEvent();
    const user = await userRepository.createUser({ username: "casey", passwordHash: "hashed" });

    await buyPositionLot({
      user,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      stake: "400",
      now: new Date("2026-07-06T13:00:00.000Z")
    });

    await expect(
      buyPositionLot({
        user,
        marketId: "market-democrat-win-2028",
        outcomeIndex: 0,
        stake: "700",
        now: new Date("2026-07-06T13:05:00.000Z")
      })
    ).rejects.toThrow("INSUFFICIENT_BALANCE");

    expect((await userRepository.findById(user.id))?.balance).toBe(600);
    expect(await positionRepository.listLotsByUserId(user.id)).toHaveLength(1);
  });

  test("sequential buys accumulate debits as independent lots", async () => {
    await seedCachedPoliticsEvent();
    const user = await userRepository.createUser({ username: "remy", passwordHash: "hashed" });

    const first = await buyPositionLot({
      user,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      stake: "250",
      now: new Date("2026-07-06T13:00:00.000Z")
    });
    const second = await buyPositionLot({
      user,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      stake: "250",
      now: new Date("2026-07-06T13:05:00.000Z")
    });

    expect(first.lot.id).not.toBe(second.lot.id);
    expect((await userRepository.findById(user.id))?.balance).toBe(500);
    const lots = await positionRepository.listLotsByUserId(user.id);
    expect(lots.map((lot) => lot.id)).toEqual([first.lot.id, second.lot.id]);
  });
});
