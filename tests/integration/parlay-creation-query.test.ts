import { describe, expect, test } from "vitest";

import { normalizeGammaEvent } from "@/domain/markets";
import { prisma } from "@/server/db";
import { marketCacheRepository } from "@/server/markets";
import { addFirstParlayLeg, createDraftParlay, listRandomParlays } from "@/server/parlays";
import { userRepository } from "@/server/users";
import { binaryGammaEvent, multiOutcomeGammaEvent } from "@test/helpers/gamma-fixtures";

// These exercise the new server-layer functions backing Issue #8
// (POST /api/parlays and POST /api/parlays/:id/legs) directly against real
// Postgres, complementing the HTTP-contract tests in
// tests/api/parlays-create-route.test.ts and
// tests/api/parlay-first-leg-route.test.ts.

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

async function seedPosition(input: {
  userId: string;
  marketId: string;
  outcomeIndex: number;
  shares: string;
  committedShares?: string;
}) {
  return prisma.position.create({
    data: {
      userId: input.userId,
      marketId: input.marketId,
      outcomeIndex: input.outcomeIndex,
      entryPrice: "0.5",
      stake: "50",
      shares: input.shares,
      committedShares: input.committedShares ?? "0"
    }
  });
}

describe("createDraftParlay", () => {
  test("persists a DRAFT parlay with the given name and a roster that always includes the creator", async () => {
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });
    const bob = await userRepository.createUser({ username: "bob", passwordHash: "hashed" });

    const created = await createDraftParlay({
      name: "July ladder",
      creatorId: alice.id,
      inviteUserIds: [bob.id]
    });

    expect(created.status).toBe("DRAFT");
    expect(created.name).toBe("July ladder");
    expect(created.memberIds.sort()).toEqual([alice.id, bob.id].sort());

    const stored = await prisma.parlay.findUnique({ where: { id: created.id } });
    expect(stored?.status).toBe("DRAFT");
    expect(stored?.kind).toBe("REGULAR");
    expect(stored?.creatorId).toBe(alice.id);

    const members = await prisma.parlayMember.findMany({ where: { parlayId: created.id } });
    expect(members.map((m) => m.userId).sort()).toEqual([alice.id, bob.id].sort());
  });

  test("includes the creator exactly once even if they're also in inviteUserIds", async () => {
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });

    const created = await createDraftParlay({
      name: "Solo start",
      creatorId: alice.id,
      inviteUserIds: [alice.id]
    });

    const members = await prisma.parlayMember.findMany({ where: { parlayId: created.id } });
    expect(members).toHaveLength(1);
  });

  test("rejects an invitee id that doesn't belong to a real user, persisting nothing", async () => {
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });

    await expect(
      createDraftParlay({
        name: "Bad invite",
        creatorId: alice.id,
        inviteUserIds: ["not-a-real-user-id"]
      })
    ).rejects.toThrow("INVITEE_NOT_FOUND");

    expect(await prisma.parlay.count()).toBe(0);
  });

  test("a DRAFT parlay never appears in random discovery", async () => {
    const marketId = await seedCachedMarket();
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });

    const created = await createDraftParlay({
      name: "Hidden draft",
      creatorId: alice.id,
      inviteUserIds: []
    });
    // Give it a leg directly (bypassing addFirstParlayLeg) just to prove
    // it's excluded on status alone, not merely for lacking a leg.
    await prisma.parlayLeg.create({
      data: {
        parlayId: created.id,
        marketId,
        outcomeIndex: 0,
        resolutionAt: new Date("2028-11-08T00:00:00.000Z"),
        sortKey: "1|leg",
        status: "PENDING"
      }
    });

    const random = await listRandomParlays(10);
    expect(random.map((p) => p.id)).not.toContain(created.id);
  });
});

describe("addFirstParlayLeg", () => {
  test("atomically locks shares, creates the stake chain, and activates the parlay", async () => {
    const marketId = await seedCachedMarket();
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });
    const position = await seedPosition({
      userId: alice.id,
      marketId,
      outcomeIndex: 0,
      shares: "200"
    });

    const draft = await createDraftParlay({
      name: "July ladder",
      creatorId: alice.id,
      inviteUserIds: []
    });

    const result = await addFirstParlayLeg({
      parlayId: draft.id,
      userId: alice.id,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      commitments: [{ positionId: position.id, shares: "120" }],
      now: new Date("2026-07-06T13:00:00.000Z")
    });

    expect(result.parlayStatus).toBe("ACTIVE");
    expect(result.legStatus).toBe("ACTIVE");

    const parlay = await prisma.parlay.findUnique({ where: { id: draft.id } });
    expect(parlay?.status).toBe("ACTIVE");

    const leg = await prisma.parlayLeg.findUnique({ where: { id: result.legId } });
    expect(leg?.status).toBe("ACTIVE");
    expect(leg?.marketId).toBe(marketId);
    expect(leg?.outcomeIndex).toBe(0);

    const updatedPosition = await prisma.position.findUnique({ where: { id: position.id } });
    expect(updatedPosition?.committedShares.toString()).toBe("120");

    const stake = await prisma.legStake.findUnique({
      where: { legId_userId: { legId: result.legId, userId: alice.id } }
    });
    expect(stake?.shares.toString()).toBe("120");

    const sources = await prisma.legStakeSource.findMany({ where: { stakeId: stake?.id } });
    expect(sources).toHaveLength(1);
    expect(sources[0]?.positionId).toBe(position.id);
    expect(sources[0]?.shares.toString()).toBe("120");
  });

  test("sums multiple commitments from different positions into one aggregate stake", async () => {
    const marketId = await seedCachedMarket();
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });
    const positionA = await seedPosition({
      userId: alice.id,
      marketId,
      outcomeIndex: 0,
      shares: "100"
    });
    const positionB = await seedPosition({
      userId: alice.id,
      marketId,
      outcomeIndex: 0,
      shares: "80"
    });
    const draft = await createDraftParlay({
      name: "Two lots",
      creatorId: alice.id,
      inviteUserIds: []
    });

    const result = await addFirstParlayLeg({
      parlayId: draft.id,
      userId: alice.id,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      commitments: [
        { positionId: positionA.id, shares: "60" },
        { positionId: positionB.id, shares: "80" }
      ],
      now: new Date("2026-07-06T13:00:00.000Z")
    });

    const stake = await prisma.legStake.findUnique({
      where: { legId_userId: { legId: result.legId, userId: alice.id } }
    });
    expect(stake?.shares.toString()).toBe("140");

    const sources = await prisma.legStakeSource.findMany({ where: { stakeId: stake?.id } });
    expect(sources).toHaveLength(2);

    const updatedA = await prisma.position.findUnique({ where: { id: positionA.id } });
    const updatedB = await prisma.position.findUnique({ where: { id: positionB.id } });
    expect(updatedA?.committedShares.toString()).toBe("60");
    expect(updatedB?.committedShares.toString()).toBe("80");
  });

  test("rejects with no commitments and persists no leg", async () => {
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });
    const draft = await createDraftParlay({
      name: "No stake",
      creatorId: alice.id,
      inviteUserIds: []
    });

    await expect(
      addFirstParlayLeg({
        parlayId: draft.id,
        userId: alice.id,
        marketId: "market-democrat-win-2028",
        outcomeIndex: 0,
        commitments: [],
        now: new Date("2026-07-06T13:00:00.000Z")
      })
    ).rejects.toThrow("NO_COMMITMENTS");

    expect(await prisma.parlayLeg.count({ where: { parlayId: draft.id } })).toBe(0);
    const parlay = await prisma.parlay.findUnique({ where: { id: draft.id } });
    expect(parlay?.status).toBe("DRAFT");
  });

  test("rejects a commitment from the wrong market/outcome, rolling back the whole request", async () => {
    const marketId = await seedCachedMarket();
    const secondMarketId = await seedSecondCachedMarket();
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });
    const validPosition = await seedPosition({
      userId: alice.id,
      marketId,
      outcomeIndex: 0,
      shares: "100"
    });
    const wrongMarketPosition = await seedPosition({
      userId: alice.id,
      marketId: secondMarketId,
      outcomeIndex: 0,
      shares: "100"
    });
    const draft = await createDraftParlay({
      name: "Mismatched batch",
      creatorId: alice.id,
      inviteUserIds: []
    });

    await expect(
      addFirstParlayLeg({
        parlayId: draft.id,
        userId: alice.id,
        marketId: "market-democrat-win-2028",
        outcomeIndex: 0,
        commitments: [
          { positionId: validPosition.id, shares: "50" },
          { positionId: wrongMarketPosition.id, shares: "50" }
        ],
        now: new Date("2026-07-06T13:00:00.000Z")
      })
    ).rejects.toThrow("COMMITMENT_MARKET_MISMATCH");

    // Rollback must be total: even the otherwise-valid first commitment must
    // not have been applied.
    expect(await prisma.parlayLeg.count({ where: { parlayId: draft.id } })).toBe(0);
    const untouchedValidPosition = await prisma.position.findUnique({
      where: { id: validPosition.id }
    });
    expect(untouchedValidPosition?.committedShares.toString()).toBe("0");
    const parlay = await prisma.parlay.findUnique({ where: { id: draft.id } });
    expect(parlay?.status).toBe("DRAFT");
  });

  test("rejects a commitment exceeding the position's available shares, persisting nothing", async () => {
    const marketId = await seedCachedMarket();
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });
    const position = await seedPosition({
      userId: alice.id,
      marketId,
      outcomeIndex: 0,
      shares: "100",
      committedShares: "60"
    });
    const draft = await createDraftParlay({
      name: "Overcommit",
      creatorId: alice.id,
      inviteUserIds: []
    });

    await expect(
      addFirstParlayLeg({
        parlayId: draft.id,
        userId: alice.id,
        marketId: "market-democrat-win-2028",
        outcomeIndex: 0,
        commitments: [{ positionId: position.id, shares: "41" }],
        now: new Date("2026-07-06T13:00:00.000Z")
      })
    ).rejects.toThrow("COMMITMENT_EXCEEDS_AVAILABLE_SHARES");

    const untouched = await prisma.position.findUnique({ where: { id: position.id } });
    expect(untouched?.committedShares.toString()).toBe("60");
  });

  test("rejects a commitment referencing a position the caller doesn't own", async () => {
    const marketId = await seedCachedMarket();
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });
    const mallory = await userRepository.createUser({
      username: "mallory",
      passwordHash: "hashed"
    });
    const malloryPosition = await seedPosition({
      userId: mallory.id,
      marketId,
      outcomeIndex: 0,
      shares: "100"
    });
    const draft = await createDraftParlay({
      name: "Not your lot",
      creatorId: alice.id,
      inviteUserIds: []
    });

    await expect(
      addFirstParlayLeg({
        parlayId: draft.id,
        userId: alice.id,
        marketId: "market-democrat-win-2028",
        outcomeIndex: 0,
        commitments: [{ positionId: malloryPosition.id, shares: "10" }],
        now: new Date("2026-07-06T13:00:00.000Z")
      })
    ).rejects.toThrow("COMMITMENT_POSITION_NOT_FOUND");
  });

  test("rejects a caller who is not a formal member of the parlay", async () => {
    const marketId = await seedCachedMarket();
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });
    const outsider = await userRepository.createUser({
      username: "outsider",
      passwordHash: "hashed"
    });
    const outsiderPosition = await seedPosition({
      userId: outsider.id,
      marketId,
      outcomeIndex: 0,
      shares: "100"
    });
    const draft = await createDraftParlay({
      name: "Members only",
      creatorId: alice.id,
      inviteUserIds: []
    });

    await expect(
      addFirstParlayLeg({
        parlayId: draft.id,
        userId: outsider.id,
        marketId: "market-democrat-win-2028",
        outcomeIndex: 0,
        commitments: [{ positionId: outsiderPosition.id, shares: "10" }],
        now: new Date("2026-07-06T13:00:00.000Z")
      })
    ).rejects.toThrow("NOT_A_MEMBER");
  });

  test("rejects re-adding the same market as leg 2 once ACTIVE — it can't resolve later than itself (issue #9)", async () => {
    const marketId = await seedCachedMarket();
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });
    const positionA = await seedPosition({
      userId: alice.id,
      marketId,
      outcomeIndex: 0,
      shares: "100"
    });
    const positionB = await seedPosition({
      userId: alice.id,
      marketId,
      outcomeIndex: 0,
      shares: "100"
    });
    const draft = await createDraftParlay({
      name: "Already active",
      creatorId: alice.id,
      inviteUserIds: []
    });

    await addFirstParlayLeg({
      parlayId: draft.id,
      userId: alice.id,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      commitments: [{ positionId: positionA.id, shares: "10" }],
      now: new Date("2026-07-06T13:00:00.000Z")
    });

    await expect(
      addFirstParlayLeg({
        parlayId: draft.id,
        userId: alice.id,
        marketId: "market-democrat-win-2028",
        outcomeIndex: 0,
        commitments: [{ positionId: positionB.id, shares: "10" }],
        now: new Date("2026-07-06T13:05:00.000Z")
      })
    ).rejects.toThrow("LEG_APPEND_TOO_EARLY");
  });

  test("rejects an unknown parlay id", async () => {
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });

    await expect(
      addFirstParlayLeg({
        parlayId: "not-a-real-parlay",
        userId: alice.id,
        marketId: "market-democrat-win-2028",
        outcomeIndex: 0,
        commitments: [{ positionId: "whatever", shares: "10" }],
        now: new Date("2026-07-06T13:00:00.000Z")
      })
    ).rejects.toThrow("PARLAY_NOT_FOUND");
  });
});
