import { describe, expect, test } from "vitest";

import { normalizeGammaEvent } from "@/domain/markets";
import { prisma } from "@/server/db";
import { listLeaderboard } from "@/server/leaderboard";
import { marketCacheRepository } from "@/server/markets";
import { userRepository } from "@/server/users";
import { binaryGammaEvent, multiOutcomeGammaEvent } from "@test/helpers/gamma-fixtures";

// These exercise listLeaderboard()'s real Postgres aggregation directly
// (distinct-userId queries against Position/LegStake), complementing
// tests/api/leaderboard-route.test.ts which covers the HTTP contract.
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
// leg per market, so a parlay with two legs needs a second, distinct market.
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

describe("listLeaderboard", () => {
  test("counts a user with several positions as active exactly once", async () => {
    const marketId = await seedCachedMarket();
    const mira = await userRepository.createUser({ username: "mira", passwordHash: "hashed" });
    const dormant = await userRepository.createUser({
      username: "dormant",
      passwordHash: "hashed"
    });
    await prisma.user.update({ where: { id: mira.id }, data: { balance: 700 } });

    for (const outcomeIndex of [0, 1]) {
      await prisma.position.create({
        data: {
          userId: mira.id,
          marketId,
          outcomeIndex,
          entryPrice: "0.5",
          stake: "50",
          shares: "100"
        }
      });
    }

    const leaderboard = await listLeaderboard();

    expect(leaderboard.rows).toEqual([
      { rank: 1, userId: dormant.id, username: "dormant", balance: 1_000 },
      { rank: 2, userId: mira.id, username: "mira", balance: 700 }
    ]);
    expect(leaderboard.mean).toBe(700);
  });

  test("counts a user active from a LegStake alone, deduped across multiple stakes", async () => {
    const marketId = await seedCachedMarket();
    const secondMarketId = await seedSecondCachedMarket();
    const priya = await userRepository.createUser({ username: "priya", passwordHash: "hashed" });

    const parlay = await prisma.parlay.create({
      data: { kind: "REGULAR", name: "Late Slate", status: "ACTIVE" }
    });
    const legA = await prisma.parlayLeg.create({
      data: {
        parlayId: parlay.id,
        marketId,
        outcomeIndex: 0,
        resolutionAt: new Date("2028-11-08T00:00:00.000Z"),
        sortKey: "1|leg-a",
        status: "ACTIVE"
      }
    });
    const legB = await prisma.parlayLeg.create({
      data: {
        parlayId: parlay.id,
        marketId: secondMarketId,
        outcomeIndex: 1,
        resolutionAt: new Date("2028-11-09T00:00:00.000Z"),
        sortKey: "2|leg-b",
        status: "PENDING"
      }
    });
    await prisma.legStake.create({
      data: { legId: legA.id, userId: priya.id, shares: "10", committedPrincipal: "10" }
    });
    await prisma.legStake.create({
      data: { legId: legB.id, userId: priya.id, shares: "5", committedPrincipal: "5" }
    });

    const leaderboard = await listLeaderboard();

    // priya never bought a Position and never had her balance touched, so
    // she still sits at the starting balance — activity, not balance, is
    // what makes MEAN include her (PRD §5).
    expect(leaderboard.rows).toEqual([
      { rank: 1, userId: priya.id, username: "priya", balance: 1_000 }
    ]);
    expect(leaderboard.mean).toBe(1_000);
  });

  test("returns a null mean when no user has ever traded", async () => {
    await userRepository.createUser({ username: "aiden", passwordHash: "hashed" });
    await userRepository.createUser({ username: "beth", passwordHash: "hashed" });

    const leaderboard = await listLeaderboard();

    expect(leaderboard.rows).toHaveLength(2);
    expect(leaderboard.mean).toBeNull();
  });

  test("breaks balance ties by username ascending regardless of insertion or DB return order", async () => {
    await userRepository.createUser({ username: "zeta", passwordHash: "hashed" });
    await userRepository.createUser({ username: "alpha", passwordHash: "hashed" });

    const leaderboard = await listLeaderboard();

    expect(leaderboard.rows.map((row) => row.username)).toEqual(["alpha", "zeta"]);
    expect(leaderboard.rows.map((row) => row.rank)).toEqual([1, 2]);
  });
});
