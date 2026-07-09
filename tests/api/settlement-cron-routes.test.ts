import { describe, expect, test } from "vitest";

import { GET as runSettlement } from "@/app/api/cron/settlement/route";
import { GET as runStipend } from "@/app/api/cron/stipend/route";
import { normalizeGammaEvent, type GammaMarket } from "@/domain/markets";
import { prisma } from "@/server/db";
import { marketCacheRepository, setMarketGammaClientForTesting } from "@/server/markets";
import { buyPositionLot } from "@/server/positions";
import { userRepository } from "@/server/users";
import { binaryGammaEvent, resolvedBinaryGammaMarket } from "@test/helpers/gamma-fixtures";

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

describe("settlement and stipend cron APIs", () => {
  test("reject settlement and stipend requests without the cron bearer secret", async () => {
    process.env.CRON_SECRET = "cron-secret";

    const settlement = await runSettlement(
      new Request("http://arena.test/api/cron/settlement", { method: "GET" })
    );
    const stipend = await runStipend(
      new Request("http://arena.test/api/cron/stipend", { method: "GET" })
    );

    expect(settlement.status).toBe(401);
    await expect(settlement.json()).resolves.toEqual({ error: { code: "UNAUTHORIZED_CRON" } });
    expect(stipend.status).toBe(401);
    await expect(stipend.json()).resolves.toEqual({ error: { code: "UNAUTHORIZED_CRON" } });
  });

  test("runs settlement and returns the sweep summary", async () => {
    process.env.CRON_SECRET = "cron-secret";
    await seedCachedPoliticsEvent();
    const user = await userRepository.createUser({ username: "mira", passwordHash: "hashed" });
    await buyPositionLot({
      user,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      stake: "64",
      now: new Date("2026-01-15T12:00:00.000Z")
    });
    setMarketGammaClientForTesting({
      fetchEventsByTag: async () => [],
      fetchMarketById: async () => resolvedBinaryGammaMarket()
    });

    const response = await runSettlement(
      new Request("http://arena.test/api/cron/settlement", {
        method: "GET",
        headers: { authorization: "Bearer cron-secret" }
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      marketIds: ["market-democrat-win-2028"],
      skippedMarketIds: [],
      settledPositions: 1,
      settledParlayLegStakes: 0
    });
  });

  test("runs the stipend job and returns granted user ids", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const user = await userRepository.createUser({ username: "zero", passwordHash: "hashed" });
    await prisma.user.update({ where: { id: user.id }, data: { balance: 0 } });

    const response = await runStipend(
      new Request("http://arena.test/api/cron/stipend", {
        method: "GET",
        headers: { authorization: "Bearer cron-secret" }
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      dayKey: "2026-01-15",
      grantedUserIds: [user.id]
    });
  });
});
