import { describe, expect, test } from "vitest";

import { GET as getParlayDetail } from "@/app/api/parlays/[id]/route";
import { POST as createParlay } from "@/app/api/parlays/route";
import { POST as createLeg } from "@/app/api/parlays/[id]/legs/route";
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

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/parlays/:id", () => {
  test("requires authentication", async () => {
    const response = await getParlayDetail(
      new Request("http://arena.test/api/parlays/whatever"),
      routeParams("whatever")
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: { code: "UNAUTHENTICATED" } });
  });

  test("returns the sorted detail response with members, legs, market, stakes, and memberVoteTally", async () => {
    const marketId = await seedCachedMarket();
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });
    const position = await seedPosition({ userId: alice.id, marketId, shares: "100" });

    const createResponse = await createParlay(
      jsonRequest(
        "http://arena.test/api/parlays",
        { name: "Late Slate", inviteUserIds: [] },
        { "x-test-user-id": alice.id }
      )
    );
    const { parlay } = (await createResponse.json()) as { parlay: { id: string } };

    await createLeg(
      jsonRequest(
        `http://arena.test/api/parlays/${parlay.id}/legs`,
        {
          marketId: "market-democrat-win-2028",
          outcomeIndex: 0,
          commitments: [{ positionId: position.id, shares: "50" }]
        },
        { "x-test-user-id": alice.id }
      ),
      routeParams(parlay.id)
    );

    const response = await getParlayDetail(
      new Request(`http://arena.test/api/parlays/${parlay.id}`, {
        headers: { "x-test-user-id": alice.id }
      }),
      routeParams(parlay.id)
    );
    const body = (await response.json()) as {
      data: {
        id: string;
        name: string;
        status: string;
        members: Array<{ userId: string; username: string }>;
        legs: Array<{
          status: string;
          market: { gammaId: string };
          stakes: Array<{ user: { username: string }; amount: string }>;
          memberVoteTally: { totalMemberStake: string } | null;
        }>;
      };
    };

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      id: parlay.id,
      name: "Late Slate",
      status: "ACTIVE",
      members: [{ userId: alice.id, username: "alice" }]
    });
    expect(body.data.legs).toHaveLength(1);
    expect(body.data.legs[0]).toMatchObject({
      status: "ACTIVE",
      market: { gammaId: "market-democrat-win-2028" },
      stakes: [{ user: { username: "alice" }, amount: "32" }],
      memberVoteTally: { totalMemberStake: "32" }
    });
  });

  test("returns 404 for an unknown parlay id", async () => {
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });

    const response = await getParlayDetail(
      new Request("http://arena.test/api/parlays/not-a-real-parlay", {
        headers: { "x-test-user-id": alice.id }
      }),
      routeParams("not-a-real-parlay")
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: { code: "PARLAY_NOT_FOUND" } });
  });
});
