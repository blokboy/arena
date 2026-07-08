import { describe, expect, test } from "vitest";

import { normalizeGammaEvent } from "@/domain/markets";
import { prisma } from "@/server/db";
import { marketCacheRepository } from "@/server/markets";
import { addFirstParlayLeg, createDraftParlay } from "@/server/parlays";
import { buyPositionLot, positionRepository } from "@/server/positions";
import { userRepository } from "@/server/users";
import { binaryGammaEvent } from "@test/helpers/gamma-fixtures";

async function seedCachedPoliticsEvent() {
  await marketCacheRepository.upsertCategoryEvents({
    category: "Politics",
    events: [
      normalizeGammaEvent(binaryGammaEvent(), {
        category: "Politics",
        lastSyncedAt: "2026-07-06T12:00:00.000Z"
      })
    ]
  });
}

async function seedUserAndPosition() {
  const user = await userRepository.createUser({ username: "mira", passwordHash: "hashed" });
  const result = await buyPositionLot({
    user,
    marketId: "market-democrat-win-2028",
    outcomeIndex: 0,
    stake: "250",
    now: new Date("2026-07-06T13:00:00.000Z")
  });
  return { user, lot: result.lot };
}

describe("atomic first-leg creation", () => {
  test("creates draft, then atomically creates leg with LegStakeSource, committedShares, and LegStake", async () => {
    await seedCachedPoliticsEvent();
    const { user, lot } = await seedUserAndPosition();

    const draft = await createDraftParlay({
      name: "July ladder",
      creatorId: user.id,
      inviteUserIds: []
    });

    const result = await addFirstParlayLeg({
      userId: user.id,
      parlayId: draft.id,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      commitments: [{ positionId: lot.id, shares: lot.shares }],
      now: new Date("2026-07-06T13:00:00.000Z")
    });

    expect(result.parlayStatus).toBe("ACTIVE");
    expect(result.legStatus).toBe("ACTIVE");

    const updatedPosition = await positionRepository.listLotsByUserId(user.id);
    expect(updatedPosition).toHaveLength(1);
    expect(updatedPosition[0]!.committedShares).toBe(lot.shares);
    expect(updatedPosition[0]!.shares).toBe(lot.shares);
  });

  test("rejected leg with no commitments persists no leg", async () => {
    await seedCachedPoliticsEvent();
    const { user } = await seedUserAndPosition();

    const draft = await createDraftParlay({
      name: "No-commit parlay",
      creatorId: user.id,
      inviteUserIds: []
    });

    await expect(
      addFirstParlayLeg({
        userId: user.id,
        parlayId: draft.id,
        marketId: "market-democrat-win-2028",
        outcomeIndex: 0,
        commitments: [],
        now: new Date("2026-07-06T13:00:00.000Z")
      })
    ).rejects.toThrow("NO_COMMITMENTS");

    const draftInDb = await prisma.parlay.findUnique({
      where: { id: draft.id },
      include: { legs: true }
    });
    expect(draftInDb).not.toBeNull();
    expect(draftInDb!.legs).toHaveLength(0);
    expect(draftInDb!.status).toBe("DRAFT");
  });

  test("rejected leg with insufficient shares persists no leg", async () => {
    await seedCachedPoliticsEvent();
    const { user, lot } = await seedUserAndPosition();

    const draft = await createDraftParlay({
      name: "Over-commit parlay",
      creatorId: user.id,
      inviteUserIds: []
    });

    const overCommit = String(Number(lot.shares) + 100);

    await expect(
      addFirstParlayLeg({
        userId: user.id,
        parlayId: draft.id,
        marketId: "market-democrat-win-2028",
        outcomeIndex: 0,
        commitments: [{ positionId: lot.id, shares: overCommit }],
        now: new Date("2026-07-06T13:00:00.000Z")
      })
    ).rejects.toThrow("COMMITMENT_EXCEEDS_AVAILABLE_SHARES");

    const draftInDb = await prisma.parlay.findUnique({
      where: { id: draft.id },
      include: { legs: true }
    });
    expect(draftInDb).not.toBeNull();
    expect(draftInDb!.legs).toHaveLength(0);
    expect(draftInDb!.status).toBe("DRAFT");
  });

  test("rejected leg with wrong outcome persists no stake changes", async () => {
    await seedCachedPoliticsEvent();
    const { user, lot } = await seedUserAndPosition();

    const draft = await createDraftParlay({
      name: "Wrong outcome parlay",
      creatorId: user.id,
      inviteUserIds: []
    });

    await expect(
      addFirstParlayLeg({
        userId: user.id,
        parlayId: draft.id,
        marketId: "market-democrat-win-2028",
        outcomeIndex: 1,
        commitments: [{ positionId: lot.id, shares: lot.shares }],
        now: new Date("2026-07-06T13:00:00.000Z")
      })
    ).rejects.toThrow("COMMITMENT_MARKET_MISMATCH");

    const unchangedPosition = await positionRepository.findById(lot.id);
    expect(unchangedPosition?.committedShares).toBe("0");
  });

  test("LegStakeSource and LegStake are created in the same transaction as the leg", async () => {
    await seedCachedPoliticsEvent();
    const { user, lot } = await seedUserAndPosition();

    const draft = await createDraftParlay({
      name: "Atomic parlay",
      creatorId: user.id,
      inviteUserIds: []
    });

    await addFirstParlayLeg({
      userId: user.id,
      parlayId: draft.id,
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      commitments: [{ positionId: lot.id, shares: lot.shares }],
      now: new Date("2026-07-06T13:00:00.000Z")
    });

    const leg = await prisma.parlayLeg.findFirst({
      where: { parlayId: draft.id },
      include: {
        stakes: {
          include: { sources: true }
        }
      }
    });

    expect(leg).not.toBeNull();
    expect(leg!.status).toBe("ACTIVE");
    expect(leg!.stakes).toHaveLength(1);
    expect(leg!.stakes[0]!.sources).toHaveLength(1);
    expect(leg!.stakes[0]!.sources[0]!.positionId).toBe(lot.id);
  });
});
