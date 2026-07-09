import { describe, expect, test } from "vitest";

import { normalizeGammaEvent } from "@/domain/markets";
import { prisma } from "@/server/db";
import { marketCacheRepository } from "@/server/markets";
import { listRandomParlays, setParlayRandomForTesting } from "@/server/parlays";
import { userRepository } from "@/server/users";
import { binaryGammaEvent, multiOutcomeGammaEvent } from "@test/helpers/gamma-fixtures";

// These exercise listRandomParlays()'s real Postgres filtering/ordering
// directly, complementing tests/api/random-parlays-route.test.ts which
// covers the HTTP contract.
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

// ParlayLeg has @@unique([parlayId, marketId]) — a parlay can only carry one
// leg per market, so multi-leg parlays in these tests need a second,
// distinct cached market.
async function seedSecondCachedMarket() {
  await marketCacheRepository.upsertCategoryEvents({
    category: "Sports",
    events: [
      normalizeGammaEvent(multiOutcomeGammaEvent(), {
        category: "Sports",
        lastSyncedAt: "2026-01-15T11:00:00.000Z"
      })
    ]
  });

  const market = await prisma.cachedMarket.findUnique({
    where: { gammaId: "market-world-cup-winner" },
    select: { id: true }
  });
  if (!market) {
    throw new Error("TEST_SECOND_MARKET_NOT_FOUND");
  }

  return market.id;
}

async function seedParlay(input: {
  name: string;
  kind?: "REGULAR" | "DAYS_PARLAY";
  status?: "ACTIVE" | "WON" | "LOST" | "VOIDED";
  memberIds?: string[];
  legs?: Array<{
    marketId: string;
    outcomeIndex: number;
    resolutionAt: Date;
    sortKey: string;
    status?: "PENDING" | "ACTIVE" | "WON" | "LOST" | "ROLLED_OVER" | "VOIDED";
  }>;
}) {
  const parlay = await prisma.parlay.create({
    data: {
      kind: input.kind ?? "REGULAR",
      name: input.name,
      status: input.status ?? "ACTIVE"
    }
  });

  for (const userId of input.memberIds ?? []) {
    await prisma.parlayMember.create({ data: { parlayId: parlay.id, userId } });
  }

  for (const leg of input.legs ?? []) {
    await prisma.parlayLeg.create({
      data: {
        parlayId: parlay.id,
        marketId: leg.marketId,
        outcomeIndex: leg.outcomeIndex,
        resolutionAt: leg.resolutionAt,
        sortKey: leg.sortKey,
        status: leg.status ?? "PENDING"
      }
    });
  }

  return parlay;
}

describe("listRandomParlays", () => {
  test("excludes Day's Parlay, non-ACTIVE, and legless parlays", async () => {
    const marketId = await seedCachedMarket();
    const viewer = await userRepository.createUser({ username: "viewer", passwordHash: "hashed" });
    const leg = {
      marketId,
      outcomeIndex: 0,
      resolutionAt: new Date("2028-11-08T00:00:00.000Z"),
      sortKey: "1|leg",
      status: "ACTIVE" as const
    };

    const eligible = await seedParlay({
      name: "Eligible",
      memberIds: [viewer.id],
      legs: [leg]
    });
    await seedParlay({ name: "Finished", status: "WON", memberIds: [viewer.id], legs: [leg] });
    await seedParlay({ name: "No legs yet", memberIds: [viewer.id] });
    await seedParlay({
      name: "Daily Crowd",
      kind: "DAYS_PARLAY",
      memberIds: [viewer.id],
      legs: [leg]
    });

    const results = await listRandomParlays(10);

    expect(results.map((row) => row.id)).toEqual([eligible.id]);
  });

  test("truncates to the requested limit after shuffling", async () => {
    const marketId = await seedCachedMarket();
    const viewer = await userRepository.createUser({ username: "viewer", passwordHash: "hashed" });
    const leg = {
      marketId,
      outcomeIndex: 0,
      resolutionAt: new Date("2028-11-08T00:00:00.000Z"),
      sortKey: "1|leg",
      status: "ACTIVE" as const
    };

    for (let index = 0; index < 5; index += 1) {
      await seedParlay({ name: `Parlay ${index}`, memberIds: [viewer.id], legs: [leg] });
    }

    setParlayRandomForTesting(() => 0);

    const results = await listRandomParlays(2);

    expect(results).toHaveLength(2);
  });

  test("falls back to the earliest-resolving leg when none is currently ACTIVE", async () => {
    const marketId = await seedCachedMarket();
    const secondMarketId = await seedSecondCachedMarket();
    const viewer = await userRepository.createUser({ username: "viewer", passwordHash: "hashed" });

    const parlay = await seedParlay({
      name: "All pending",
      memberIds: [viewer.id],
      legs: [
        {
          marketId,
          outcomeIndex: 0,
          resolutionAt: new Date("2028-11-08T00:00:00.000Z"),
          sortKey: "1|leg-a",
          status: "PENDING"
        },
        {
          marketId: secondMarketId,
          outcomeIndex: 1,
          resolutionAt: new Date("2028-11-09T00:00:00.000Z"),
          sortKey: "2|leg-b",
          status: "PENDING"
        }
      ]
    });
    const earliestLeg = await prisma.parlayLeg.findFirstOrThrow({
      where: { parlayId: parlay.id },
      orderBy: [{ resolutionAt: "asc" }, { sortKey: "asc" }]
    });

    const [result] = await listRandomParlays(10);

    expect(result?.currentActiveLeg?.legId).toBe(earliestLeg.id);
  });

  test("prefers the ACTIVE leg over ordering when one exists", async () => {
    const marketId = await seedCachedMarket();
    const secondMarketId = await seedSecondCachedMarket();
    const viewer = await userRepository.createUser({ username: "viewer", passwordHash: "hashed" });

    const parlay = await seedParlay({
      name: "One active",
      memberIds: [viewer.id],
      legs: [
        {
          marketId,
          outcomeIndex: 0,
          resolutionAt: new Date("2028-11-08T00:00:00.000Z"),
          sortKey: "1|leg-a",
          status: "PENDING"
        },
        {
          marketId: secondMarketId,
          outcomeIndex: 1,
          resolutionAt: new Date("2028-11-09T00:00:00.000Z"),
          sortKey: "2|leg-b",
          status: "ACTIVE"
        }
      ]
    });
    const activeLeg = await prisma.parlayLeg.findFirstOrThrow({
      where: { parlayId: parlay.id, status: "ACTIVE" }
    });

    const [result] = await listRandomParlays(10);

    expect(result?.currentActiveLeg?.legId).toBe(activeLeg.id);
    expect(result?.currentActiveLeg?.status).toBe("ACTIVE");
  });

  test("reports roster size and chain length from real member/leg counts", async () => {
    const marketId = await seedCachedMarket();
    const secondMarketId = await seedSecondCachedMarket();
    const [alice, bo] = await Promise.all([
      userRepository.createUser({ username: "alice", passwordHash: "hashed" }),
      userRepository.createUser({ username: "bo", passwordHash: "hashed" })
    ]);

    await seedParlay({
      name: "Trio of legs",
      memberIds: [alice.id, bo.id],
      legs: [
        {
          marketId,
          outcomeIndex: 0,
          resolutionAt: new Date("2028-11-08T00:00:00.000Z"),
          sortKey: "1|leg-a",
          status: "ACTIVE"
        },
        {
          marketId: secondMarketId,
          outcomeIndex: 1,
          resolutionAt: new Date("2028-11-09T00:00:00.000Z"),
          sortKey: "2|leg-b",
          status: "PENDING"
        }
      ]
    });

    const [result] = await listRandomParlays(10);

    expect(result?.rosterSize).toBe(2);
    expect(result?.chainLength).toBe(2);
  });
});
