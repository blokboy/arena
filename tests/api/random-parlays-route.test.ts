import { describe, expect, test } from "vitest";

import { GET as getRandomParlays } from "@/app/api/parlays/random/route";
import { normalizeGammaEvent } from "@/domain/markets";
import { prisma } from "@/server/db";
import { marketCacheRepository } from "@/server/markets";
import { setParlayRandomForTesting } from "@/server/parlays";
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

async function seedParlay(input: {
  name: string;
  kind?: "REGULAR" | "DAYS_PARLAY";
  status?: "ACTIVE" | "WON" | "LOST" | "VOIDED";
  includeLeg?: boolean;
  marketId: string;
  memberId: string;
}) {
  const parlay = await prisma.parlay.create({
    data: {
      kind: input.kind ?? "REGULAR",
      name: input.name,
      status: input.status ?? "ACTIVE"
    }
  });

  await prisma.parlayMember.create({
    data: {
      parlayId: parlay.id,
      userId: input.memberId
    }
  });

  if (input.includeLeg !== false) {
    await prisma.parlayLeg.create({
      data: {
        parlayId: parlay.id,
        marketId: input.marketId,
        outcomeIndex: 0,
        resolutionAt: new Date("2028-11-08T00:00:00.000Z"),
        sortKey: `2028-11-08T00:00:00.000Z|${input.name}`,
        status: "ACTIVE"
      }
    });
  }

  return parlay;
}

describe("GET /api/parlays/random", () => {
  test("requires authentication", async () => {
    const response = await getRandomParlays(new Request("http://arena.test/api/parlays/random"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: { code: "UNAUTHENTICATED" } });
  });

  test("returns only active regular parlays with at least one leg", async () => {
    const marketId = await seedCachedMarket();
    const viewer = await userRepository.createUser({ username: "viewer", passwordHash: "hashed" });

    const includedA = await seedParlay({
      name: "Climbers",
      marketId,
      memberId: viewer.id
    });
    const includedB = await seedParlay({
      name: "Late Slate",
      marketId,
      memberId: viewer.id
    });
    await seedParlay({
      name: "Finished",
      status: "WON",
      marketId,
      memberId: viewer.id
    });
    await seedParlay({
      name: "No legs yet",
      includeLeg: false,
      marketId,
      memberId: viewer.id
    });
    await seedParlay({
      name: "Daily Crowd",
      kind: "DAYS_PARLAY",
      marketId,
      memberId: viewer.id
    });

    setParlayRandomForTesting(() => 0);

    const response = await getRandomParlays(
      new Request("http://arena.test/api/parlays/random?limit=10", {
        headers: { "x-test-user-id": viewer.id }
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      parlays: Array<{
        id: string;
        name: string;
        kind: string;
        rosterSize: number;
        chainLength: number;
        currentActiveLeg: { marketQuestion: string; status: string } | null;
      }>;
    };

    expect(body.parlays).toHaveLength(2);
    expect(body.parlays.map((parlay) => parlay.id).sort()).toEqual(
      [includedA.id, includedB.id].sort()
    );
    expect(body.parlays).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "REGULAR",
          rosterSize: 1,
          chainLength: 1,
          currentActiveLeg: expect.objectContaining({
            marketQuestion: "Will a Democrat win the 2028 US presidential election?",
            status: "ACTIVE"
          })
        })
      ])
    );
  });
});
