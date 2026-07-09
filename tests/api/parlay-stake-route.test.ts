import { describe, expect, test } from "vitest";

import { POST as createParlay } from "@/app/api/parlays/route";
import { POST as createLeg } from "@/app/api/parlays/[id]/legs/route";
import { POST as stakeLeg } from "@/app/api/parlays/[id]/legs/[legId]/stake/route";
import { normalizeGammaEvent } from "@/domain/markets";
import { marketCacheRepository } from "@/server/markets";
import { prisma } from "@/server/db";
import { userRepository } from "@/server/users";
import { jsonRequest } from "@test/helpers/api";
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

  const market = await prisma.cachedMarket.findUniqueOrThrow({
    where: { gammaId: "market-democrat-win-2028" },
    select: { id: true }
  });
  return market.id;
}

async function seedPosition(input: { userId: string; marketId: string; shares: string }) {
  return prisma.position.create({
    data: {
      userId: input.userId,
      marketId: input.marketId,
      outcomeIndex: 0,
      entryPrice: "0.64",
      stake: "64",
      shares: input.shares
    }
  });
}

async function seedActiveLeg(input: { creatorId: string; marketId: string }) {
  const position = await seedPosition({ userId: input.creatorId, marketId: input.marketId, shares: "100" });
  const createResponse = await createParlay(
    jsonRequest(
      "http://arena.test/api/parlays",
      { name: "Late Slate", inviteUserIds: [] },
      { "x-test-user-id": input.creatorId }
    )
  );
  const { parlay } = (await createResponse.json()) as { parlay: { id: string } };

  const legResponse = await createLeg(
    jsonRequest(
      `http://arena.test/api/parlays/${parlay.id}/legs`,
      {
        marketId: "market-democrat-win-2028",
        outcomeIndex: 0,
        commitments: [{ positionId: position.id, shares: "50" }]
      },
      { "x-test-user-id": input.creatorId }
    ),
    { params: Promise.resolve({ id: parlay.id }) }
  );
  const { leg } = (await legResponse.json()) as { leg: { id: string } };

  return { parlayId: parlay.id, legId: leg.id };
}

function stakeRequest(parlayId: string, legId: string, body: unknown, userId?: string) {
  return {
    request: jsonRequest(
      `http://arena.test/api/parlays/${parlayId}/legs/${legId}/stake`,
      body,
      userId ? { "x-test-user-id": userId } : undefined
    ),
    context: { params: Promise.resolve({ id: parlayId, legId }) }
  };
}

describe("POST /api/parlays/:id/legs/:legId/stake", () => {
  test("requires authentication", async () => {
    const { request, context } = stakeRequest("whatever", "whatever", { commitments: [] });

    const response = await stakeLeg(request, context);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: { code: "UNAUTHENTICATED" } });
  });

  test("any authenticated user, member or not, can back the active leg", async () => {
    const marketId = await seedCachedMarket();
    const [alice, chris] = await Promise.all([
      userRepository.createUser({ username: "alice", passwordHash: "hashed" }),
      userRepository.createUser({ username: "chris", passwordHash: "hashed" })
    ]);
    const { parlayId, legId } = await seedActiveLeg({ creatorId: alice.id, marketId });
    const chrisPosition = await seedPosition({ userId: chris.id, marketId, shares: "20" });

    const { request, context } = stakeRequest(
      parlayId,
      legId,
      { commitments: [{ positionId: chrisPosition.id, shares: "10" }] },
      chris.id
    );

    const response = await stakeLeg(request, context);
    const body = (await response.json()) as {
      data: { stake: { shares: string; amount: string } };
    };

    expect(response.status).toBe(201);
    expect(body.data.stake).toMatchObject({ shares: "10", amount: "32" });

    const membership = await prisma.parlayMember.findUnique({
      where: { parlayId_userId: { parlayId, userId: chris.id } }
    });
    expect(membership).toBeNull();
  });

  test("rejects backing a leg that is not currently active", async () => {
    const marketId = await seedCachedMarket();
    const [alice, chris] = await Promise.all([
      userRepository.createUser({ username: "alice", passwordHash: "hashed" }),
      userRepository.createUser({ username: "chris", passwordHash: "hashed" })
    ]);
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
    const chrisPosition = await seedPosition({ userId: chris.id, marketId, shares: "20" });

    const { request, context } = stakeRequest(
      parlay.id,
      pendingLeg.id,
      { commitments: [{ positionId: chrisPosition.id, shares: "10" }] },
      chris.id
    );

    const response = await stakeLeg(request, context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: { code: "LEG_NOT_ACTIVE" } });
  });
});
