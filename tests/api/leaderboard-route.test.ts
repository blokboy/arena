import { describe, expect, test } from "vitest";

import { GET as getLeaderboard } from "@/app/api/leaderboard/route";
import { normalizeGammaEvent } from "@/domain/markets";
import { prisma } from "@/server/db";
import { marketCacheRepository } from "@/server/markets";
import { userRepository } from "@/server/users";
import { binaryGammaEvent } from "@test/helpers/gamma-fixtures";

async function seedCachedMarket() {
  await marketCacheRepository.upsertCategoryEvents({
    category: "Politics",
    events: [
      normalizeGammaEvent(binaryGammaEvent(), {
        category: "Politics",
        lastSyncedAt: "2026-01-15T11:00:00.000Z"
      })
    ]
  });

  const market = await prisma.cachedMarket.findUnique({
    where: { gammaId: "market-democrat-win-2028" },
    select: { id: true }
  });
  if (!market) {
    throw new Error("TEST_MARKET_NOT_FOUND");
  }

  return market.id;
}

describe("GET /api/leaderboard", () => {
  test("requires authentication", async () => {
    const response = await getLeaderboard(new Request("http://arena.test/api/leaderboard"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: { code: "UNAUTHENTICATED" } });
  });

  test("returns every ranked user while MEAN only includes active traders", async () => {
    const marketId = await seedCachedMarket();
    const ada = await userRepository.createUser({ username: "ada", passwordHash: "hashed" });
    const grace = await userRepository.createUser({ username: "grace", passwordHash: "hashed" });
    const dormant = await userRepository.createUser({
      username: "dormant",
      passwordHash: "hashed"
    });

    await prisma.user.update({ where: { id: ada.id }, data: { balance: 1500 } });
    await prisma.user.update({ where: { id: grace.id }, data: { balance: 500 } });

    await prisma.position.create({
      data: {
        userId: ada.id,
        marketId,
        outcomeIndex: 0,
        entryPrice: "0.64",
        stake: "64",
        shares: "100"
      }
    });

    const parlay = await prisma.parlay.create({
      data: {
        kind: "REGULAR",
        name: "Sharps only",
        status: "ACTIVE"
      }
    });
    const leg = await prisma.parlayLeg.create({
      data: {
        parlayId: parlay.id,
        marketId,
        outcomeIndex: 1,
        resolutionAt: new Date("2028-11-08T00:00:00.000Z"),
        sortKey: "2028-11-08T00:00:00.000Z|market-democrat-win-2028",
        status: "ACTIVE"
      }
    });
    await prisma.legStake.create({
      data: {
        legId: leg.id,
        userId: grace.id,
        shares: "25",
        committedPrincipal: "20"
      }
    });

    const response = await getLeaderboard(
      new Request("http://arena.test/api/leaderboard", {
        headers: { "x-test-user-id": ada.id }
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      rows: [
        { rank: 1, userId: ada.id, username: "ada", balance: 1500 },
        { rank: 2, userId: dormant.id, username: "dormant", balance: 1000 },
        { rank: 3, userId: grace.id, username: "grace", balance: 500 }
      ],
      mean: 1000
    });
  });

  test("returns mean separately instead of premerging a synthetic MEAN row", async () => {
    const marketId = await seedCachedMarket();
    const ada = await userRepository.createUser({ username: "ada", passwordHash: "hashed" });
    const grace = await userRepository.createUser({ username: "grace", passwordHash: "hashed" });

    await prisma.user.update({ where: { id: ada.id }, data: { balance: 1200 } });
    await prisma.user.update({ where: { id: grace.id }, data: { balance: 800 } });

    await prisma.position.create({
      data: {
        userId: ada.id,
        marketId,
        outcomeIndex: 0,
        entryPrice: "0.64",
        stake: "64",
        shares: "100"
      }
    });
    await prisma.position.create({
      data: {
        userId: grace.id,
        marketId,
        outcomeIndex: 1,
        entryPrice: "0.64",
        stake: "64",
        shares: "100"
      }
    });

    const response = await getLeaderboard(
      new Request("http://arena.test/api/leaderboard", {
        headers: { "x-test-user-id": ada.id }
      })
    );
    const body = (await response.json()) as {
      rows: Array<{ username: string }>;
      mean: number | null;
    };

    expect(body.rows).toHaveLength(2);
    expect(body.rows.map((row) => row.username)).not.toContain("MEAN");
    expect(body.mean).toBe(1000);
  });
});
