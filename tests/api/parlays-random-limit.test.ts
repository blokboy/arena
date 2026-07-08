import { describe, expect, test } from "vitest";

import { GET as getRandomParlays } from "@/app/api/parlays/random/route";
import { normalizeGammaEvent } from "@/domain/markets";
import { prisma } from "@/server/db";
import { marketCacheRepository } from "@/server/markets";
import { setParlayRandomForTesting } from "@/server/parlays";
import { userRepository } from "@/server/users";
import { binaryGammaEvent } from "@test/helpers/gamma-fixtures";

// Fills a gap in tests/api/random-parlays-route.test.ts: the `limit` query
// param's default and validation behavior.
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

async function seedEligibleParlays(count: number, marketId: string, memberId: string) {
  for (let index = 0; index < count; index += 1) {
    const parlay = await prisma.parlay.create({
      data: { kind: "REGULAR", name: `Parlay ${index}`, status: "ACTIVE" }
    });
    await prisma.parlayMember.create({ data: { parlayId: parlay.id, userId: memberId } });
    await prisma.parlayLeg.create({
      data: {
        parlayId: parlay.id,
        marketId,
        outcomeIndex: 0,
        resolutionAt: new Date("2028-11-08T00:00:00.000Z"),
        sortKey: `${index}|leg`,
        status: "ACTIVE"
      }
    });
  }
}

function requestWithLimit(userId: string, limit?: string) {
  const url = new URL("http://arena.test/api/parlays/random");
  if (limit !== undefined) {
    url.searchParams.set("limit", limit);
  }
  return new Request(url, { headers: { "x-test-user-id": userId } });
}

describe("GET /api/parlays/random — limit handling", () => {
  test("defaults to 3 when no limit is given", async () => {
    const marketId = await seedCachedMarket();
    const viewer = await userRepository.createUser({ username: "viewer", passwordHash: "hashed" });
    await seedEligibleParlays(4, marketId, viewer.id);
    setParlayRandomForTesting(() => 0);

    const response = await getRandomParlays(requestWithLimit(viewer.id));
    const body = (await response.json()) as { parlays: unknown[] };

    expect(response.status).toBe(200);
    expect(body.parlays).toHaveLength(3);
  });

  test("honors a valid custom limit", async () => {
    const marketId = await seedCachedMarket();
    const viewer = await userRepository.createUser({ username: "viewer", passwordHash: "hashed" });
    await seedEligibleParlays(4, marketId, viewer.id);
    setParlayRandomForTesting(() => 0);

    const response = await getRandomParlays(requestWithLimit(viewer.id, "2"));
    const body = (await response.json()) as { parlays: unknown[] };

    expect(response.status).toBe(200);
    expect(body.parlays).toHaveLength(2);
  });

  test.each(["abc", "0", "-1", "2.5", ""])(
    "rejects an invalid limit (%s) with INVALID_LIMIT",
    async (limit) => {
      const viewer = await userRepository.createUser({ username: "viewer", passwordHash: "hashed" });

      const response = await getRandomParlays(requestWithLimit(viewer.id, limit));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: { code: "INVALID_LIMIT" } });
    }
  );
});
