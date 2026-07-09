import { describe, expect, test } from "vitest";

import { normalizeGammaEvent } from "@/domain/markets";
import { prisma } from "@/server/db";
import { marketCacheRepository } from "@/server/markets";
import { addFirstParlayLeg, createDraftParlay, stakeParlayLeg } from "@/server/parlays";
import { userRepository } from "@/server/users";
import { binaryGammaEvent } from "@test/helpers/gamma-fixtures";

// Exercises the server-layer function backing Issue #9's
// POST /api/parlays/:id/legs/:legId/stake directly against real Postgres.

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

async function seedPosition(input: {
  userId: string;
  marketId: string;
  outcomeIndex: number;
  shares: string;
  stake?: string;
  entryPrice?: string;
}) {
  return prisma.position.create({
    data: {
      userId: input.userId,
      marketId: input.marketId,
      outcomeIndex: input.outcomeIndex,
      entryPrice: input.entryPrice ?? "0.64",
      stake: input.stake ?? "64",
      shares: input.shares
    }
  });
}

async function seedActiveLeg(input: { creatorId: string; marketId: string; sourcePositionId: string }) {
  const draft = await createDraftParlay({
    name: "Late Slate",
    creatorId: input.creatorId,
    inviteUserIds: []
  });
  const result = await addFirstParlayLeg({
    parlayId: draft.id,
    userId: input.creatorId,
    marketId: "market-democrat-win-2028",
    outcomeIndex: 0,
    commitments: [{ positionId: input.sourcePositionId, shares: "50" }],
    now: new Date("2026-07-06T13:00:00.000Z")
  });

  return { parlayId: draft.id, legId: result.legId };
}

describe("stakeParlayLeg", () => {
  test("any authenticated user can back the ACTIVE leg without becoming a parlay member", async () => {
    const marketId = await seedCachedMarket();
    const [alice, chris] = await Promise.all([
      userRepository.createUser({ username: "alice", passwordHash: "hashed" }),
      userRepository.createUser({ username: "chris", passwordHash: "hashed" })
    ]);
    const creatorPosition = await seedPosition({ userId: alice.id, marketId, outcomeIndex: 0, shares: "100" });
    const { parlayId, legId } = await seedActiveLeg({
      creatorId: alice.id,
      marketId,
      sourcePositionId: creatorPosition.id
    });
    const backerPosition = await seedPosition({
      userId: chris.id,
      marketId,
      outcomeIndex: 0,
      shares: "20",
      stake: "12.8",
      entryPrice: "0.64"
    });

    const result = await stakeParlayLeg({
      parlayId,
      legId,
      userId: chris.id,
      commitments: [{ positionId: backerPosition.id, shares: "10" }]
    });

    expect(result.shares).toBe("10");
    expect(result.amount).toBe("6.4");

    const stake = await prisma.legStake.findUniqueOrThrow({
      where: { legId_userId: { legId, userId: chris.id } }
    });
    expect(stake.shares.toString()).toBe("10");
    expect(stake.amount.toString()).toBe("6.4");
    expect(stake.averageEntryPrice.toString()).toBe("0.64");
    expect(stake.status).toBe("ACTIVE");

    const membership = await prisma.parlayMember.findUnique({
      where: { parlayId_userId: { parlayId, userId: chris.id } }
    });
    expect(membership).toBeNull();

    const lockedPosition = await prisma.position.findUniqueOrThrow({ where: { id: backerPosition.id } });
    expect(lockedPosition.committedShares.toString()).toBe("10");
  });

  test("merges a second stake from the same backer into one aggregate LegStake row", async () => {
    const marketId = await seedCachedMarket();
    const [alice, chris] = await Promise.all([
      userRepository.createUser({ username: "alice", passwordHash: "hashed" }),
      userRepository.createUser({ username: "chris", passwordHash: "hashed" })
    ]);
    const creatorPosition = await seedPosition({ userId: alice.id, marketId, outcomeIndex: 0, shares: "100" });
    const { parlayId, legId } = await seedActiveLeg({
      creatorId: alice.id,
      marketId,
      sourcePositionId: creatorPosition.id
    });
    const lotA = await seedPosition({
      userId: chris.id,
      marketId,
      outcomeIndex: 0,
      shares: "10",
      stake: "6.4",
      entryPrice: "0.64"
    });
    const lotB = await seedPosition({
      userId: chris.id,
      marketId,
      outcomeIndex: 0,
      shares: "15",
      stake: "9.6",
      entryPrice: "0.64"
    });

    await stakeParlayLeg({
      parlayId,
      legId,
      userId: chris.id,
      commitments: [{ positionId: lotA.id, shares: "5" }]
    });
    const merged = await stakeParlayLeg({
      parlayId,
      legId,
      userId: chris.id,
      commitments: [{ positionId: lotB.id, shares: "10" }]
    });

    expect(merged.shares).toBe("15");
    expect(merged.amount).toBe("9.6");

    const stakes = await prisma.legStake.findMany({
      where: { legId, userId: chris.id },
      include: { sources: true }
    });
    expect(stakes).toHaveLength(1);
    expect(stakes[0]?.sources).toHaveLength(2);
  });

  test("rejects staking a leg that isn't currently ACTIVE", async () => {
    const marketId = await seedCachedMarket();
    const [alice, chris] = await Promise.all([
      userRepository.createUser({ username: "alice", passwordHash: "hashed" }),
      userRepository.createUser({ username: "chris", passwordHash: "hashed" })
    ]);
    const creatorPosition = await seedPosition({ userId: alice.id, marketId, outcomeIndex: 0, shares: "100" });
    const parlay = await prisma.parlay.create({
      data: { kind: "REGULAR", name: "Pending only", creatorId: alice.id, status: "ACTIVE" }
    });
    await prisma.parlayMember.create({ data: { parlayId: parlay.id, userId: alice.id } });
    const pendingLeg = await prisma.parlayLeg.create({
      data: {
        parlayId: parlay.id,
        marketId,
        outcomeIndex: 0,
        resolutionAt: new Date("2028-11-08T00:00:00.000Z"),
        sortKey: "1|leg",
        status: "PENDING"
      }
    });
    const backerPosition = await seedPosition({ userId: chris.id, marketId, outcomeIndex: 0, shares: "10" });

    await expect(
      stakeParlayLeg({
        parlayId: parlay.id,
        legId: pendingLeg.id,
        userId: chris.id,
        commitments: [{ positionId: backerPosition.id, shares: "5" }]
      })
    ).rejects.toThrow("LEG_NOT_ACTIVE");

    void creatorPosition;
  });

  test("rejects an unknown leg id with LEG_NOT_FOUND", async () => {
    const chris = await userRepository.createUser({ username: "chris", passwordHash: "hashed" });

    await expect(
      stakeParlayLeg({
        parlayId: "not-a-real-parlay",
        legId: "not-a-real-leg",
        userId: chris.id,
        commitments: [{ positionId: "whatever", shares: "5" }]
      })
    ).rejects.toThrow("LEG_NOT_FOUND");
  });
});
