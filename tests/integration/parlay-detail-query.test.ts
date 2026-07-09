import { describe, expect, test } from "vitest";

import { normalizeGammaEvent } from "@/domain/markets";
import { prisma } from "@/server/db";
import { marketCacheRepository } from "@/server/markets";
import {
  addFirstParlayLeg,
  createDraftParlay,
  getRegularParlayDetail,
  stakeParlayLeg
} from "@/server/parlays";
import { userRepository } from "@/server/users";
import { binaryGammaEvent, multiOutcomeGammaEvent } from "@test/helpers/gamma-fixtures";

// Exercises the server-layer function backing Issue #9's
// GET /api/parlays/:id directly against real Postgres.

async function seedMarkets() {
  const activeEvent = binaryGammaEvent();
  const laterEvent = multiOutcomeGammaEvent();
  laterEvent.markets = laterEvent.markets?.map((market) => ({
    ...market,
    endDate: "2028-11-09T00:00:00.000Z"
  }));

  await Promise.all([
    marketCacheRepository.upsertCategoryEvents({
      category: "Politics",
      events: [
        normalizeGammaEvent(activeEvent, {
          category: "Politics",
          lastSyncedAt: "2026-01-15T11:00:00.000Z"
        })
      ]
    }),
    marketCacheRepository.upsertCategoryEvents({
      category: "Sports",
      events: [
        normalizeGammaEvent(laterEvent, {
          category: "Sports",
          lastSyncedAt: "2026-01-15T11:00:00.000Z"
        })
      ]
    })
  ]);

  return { activeGammaId: "market-democrat-win-2028", laterGammaId: "market-world-cup-winner" };
}

async function seedPosition(input: {
  userId: string;
  marketGammaId: string;
  outcomeIndex: number;
  shares: string;
  stake?: string;
  entryPrice?: string;
}) {
  const market = await prisma.cachedMarket.findUniqueOrThrow({
    where: { gammaId: input.marketGammaId },
    select: { id: true }
  });
  return prisma.position.create({
    data: {
      userId: input.userId,
      marketId: market.id,
      outcomeIndex: input.outcomeIndex,
      entryPrice: input.entryPrice ?? "0.64",
      stake: input.stake ?? "64",
      shares: input.shares
    }
  });
}

describe("getRegularParlayDetail", () => {
  test("returns legs pre-sorted by endDate ASC, gammaId ASC with nested market, aggregate stakes, and memberVoteTally", async () => {
    const markets = await seedMarkets();
    const [alice, bob, chris] = await Promise.all([
      userRepository.createUser({ username: "alice", passwordHash: "hashed" }),
      userRepository.createUser({ username: "bob", passwordHash: "hashed" }),
      userRepository.createUser({ username: "chris", passwordHash: "hashed" })
    ]);

    const alicePosition = await seedPosition({
      userId: alice.id,
      marketGammaId: markets.activeGammaId,
      outcomeIndex: 0,
      shares: "100"
    });
    const draft = await createDraftParlay({
      name: "Late Slate",
      creatorId: alice.id,
      inviteUserIds: [bob.id]
    });
    const activeLeg = await addFirstParlayLeg({
      parlayId: draft.id,
      userId: alice.id,
      marketId: markets.activeGammaId,
      outcomeIndex: 0,
      commitments: [{ positionId: alicePosition.id, shares: "50" }],
      now: new Date("2026-07-06T13:00:00.000Z")
    });

    const bobPosition = await seedPosition({
      userId: bob.id,
      marketGammaId: markets.laterGammaId,
      outcomeIndex: 1,
      shares: "50"
    });
    const pendingLeg = await addFirstParlayLeg({
      parlayId: draft.id,
      userId: bob.id,
      marketId: markets.laterGammaId,
      outcomeIndex: 1,
      commitments: [{ positionId: bobPosition.id, shares: "20" }],
      now: new Date("2026-07-06T13:05:00.000Z")
    });

    const chrisPosition = await seedPosition({
      userId: chris.id,
      marketGammaId: markets.activeGammaId,
      outcomeIndex: 0,
      shares: "10",
      stake: "6.4",
      entryPrice: "0.64"
    });
    await stakeParlayLeg({
      parlayId: draft.id,
      legId: activeLeg.legId,
      userId: chris.id,
      commitments: [{ positionId: chrisPosition.id, shares: "5" }]
    });

    const detail = await getRegularParlayDetail(draft.id);

    expect(detail).toMatchObject({
      id: draft.id,
      name: "Late Slate",
      kind: "REGULAR",
      status: "ACTIVE",
      members: expect.arrayContaining([
        { userId: alice.id, username: "alice" },
        { userId: bob.id, username: "bob" }
      ])
    });
    expect(detail.legs.map((leg) => leg.id)).toEqual([activeLeg.legId, pendingLeg.legId]);

    expect(detail.legs[0]).toMatchObject({
      status: "ACTIVE",
      market: { gammaId: markets.activeGammaId, endDate: "2028-11-08T00:00:00.000Z" },
      stakes: [
        { user: { username: "alice" }, amount: "32", shares: "50", status: "ACTIVE" },
        { user: { username: "chris" }, amount: "3.2", shares: "5", status: "ACTIVE" }
      ],
      memberVoteTally: {
        totalMemberStake: "32",
        yesStake: "0",
        members: [{ userId: alice.id, username: "alice", amount: "32", votingYes: false }]
      }
    });

    expect(detail.legs[1]).toMatchObject({
      status: "PENDING",
      market: { gammaId: markets.laterGammaId, endDate: "2028-11-09T00:00:00.000Z" }
    });
  });

  test("throws PARLAY_NOT_FOUND for an unknown id", async () => {
    await expect(getRegularParlayDetail("not-a-real-parlay")).rejects.toThrow("PARLAY_NOT_FOUND");
  });
});
