import { describe, expect, test } from "vitest";

import { POST as createParlay } from "@/app/api/parlays/route";
import { POST as createLeg } from "@/app/api/parlays/[id]/legs/route";
import { normalizeGammaEvent } from "@/domain/markets";
import { prisma } from "@/server/db";
import { marketCacheRepository } from "@/server/markets";
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
}) {
  return prisma.position.create({
    data: {
      userId: input.userId,
      marketId: input.marketId,
      outcomeIndex: input.outcomeIndex,
      entryPrice: "0.5",
      stake: "50",
      shares: input.shares
    }
  });
}

async function seedDraftParlay(input: { creatorId: string; name?: string }) {
  const response = await createParlay(
    jsonRequest(
      "http://arena.test/api/parlays",
      { name: input.name ?? "Test parlay", inviteUserIds: [] },
      { "x-test-user-id": input.creatorId }
    )
  );
  const { parlay } = (await response.json()) as { parlay: { id: string } };
  return parlay.id;
}

function legsRequest(parlayId: string, body: unknown, userId?: string) {
  return {
    request: jsonRequest(
      `http://arena.test/api/parlays/${parlayId}/legs`,
      body,
      userId ? { "x-test-user-id": userId } : undefined
    ),
    context: { params: Promise.resolve({ id: parlayId }) }
  };
}

describe("POST /api/parlays/:id/legs (first leg)", () => {
  test("requires authentication", async () => {
    const { request, context } = legsRequest("whatever", {
      marketId: "market-democrat-win-2028",
      outcomeIndex: 0,
      commitments: []
    });

    const response = await createLeg(request, context);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: { code: "UNAUTHENTICATED" } });
  });

  test("atomically creates the leg, locks shares, and activates the parlay", async () => {
    const marketId = await seedCachedMarket();
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });
    const position = await seedPosition({
      userId: alice.id,
      marketId,
      outcomeIndex: 0,
      shares: "200"
    });
    const parlayId = await seedDraftParlay({ creatorId: alice.id });

    const { request, context } = legsRequest(
      parlayId,
      {
        marketId: "market-democrat-win-2028",
        outcomeIndex: 0,
        commitments: [{ positionId: position.id, shares: "120" }]
      },
      alice.id
    );

    const response = await createLeg(request, context);

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      leg: { id: string; status: string };
      parlay: { id: string; status: string };
    };
    expect(body.leg.status).toBe("ACTIVE");
    expect(body.parlay.status).toBe("ACTIVE");

    const updatedPosition = await prisma.position.findUnique({ where: { id: position.id } });
    expect(updatedPosition?.committedShares.toString()).toBe("120");
  });

  test("rejects an empty commitments array with NO_COMMITMENTS and persists no leg", async () => {
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });
    const parlayId = await seedDraftParlay({ creatorId: alice.id });

    const { request, context } = legsRequest(
      parlayId,
      { marketId: "market-democrat-win-2028", outcomeIndex: 0, commitments: [] },
      alice.id
    );

    const response = await createLeg(request, context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: { code: "NO_COMMITMENTS" } });
    expect(await prisma.parlayLeg.count({ where: { parlayId } })).toBe(0);
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
    const parlayId = await seedDraftParlay({ creatorId: alice.id });

    const { request, context } = legsRequest(
      parlayId,
      {
        marketId: "market-democrat-win-2028",
        outcomeIndex: 0,
        commitments: [{ positionId: malloryPosition.id, shares: "10" }]
      },
      alice.id
    );

    const response = await createLeg(request, context);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: "COMMITMENT_POSITION_NOT_FOUND" }
    });
  });

  test("rejects a commitment from the wrong market/outcome with a structured 422", async () => {
    const marketId = await seedCachedMarket();
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });
    const position = await seedPosition({
      userId: alice.id,
      marketId,
      outcomeIndex: 1, // caller is committing outcome 0 below — mismatch
      shares: "100"
    });
    const parlayId = await seedDraftParlay({ creatorId: alice.id });

    const { request, context } = legsRequest(
      parlayId,
      {
        marketId: "market-democrat-win-2028",
        outcomeIndex: 0,
        commitments: [{ positionId: position.id, shares: "10" }]
      },
      alice.id
    );

    const response = await createLeg(request, context);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: { code: "COMMITMENT_MARKET_MISMATCH" }
    });
  });

  test("rejects a commitment exceeding available shares with a structured 422", async () => {
    const marketId = await seedCachedMarket();
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });
    const position = await seedPosition({
      userId: alice.id,
      marketId,
      outcomeIndex: 0,
      shares: "50"
    });
    const parlayId = await seedDraftParlay({ creatorId: alice.id });

    const { request, context } = legsRequest(
      parlayId,
      {
        marketId: "market-democrat-win-2028",
        outcomeIndex: 0,
        commitments: [{ positionId: position.id, shares: "50.01" }]
      },
      alice.id
    );

    const response = await createLeg(request, context);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: { code: "COMMITMENT_EXCEEDS_AVAILABLE_SHARES" }
    });
  });

  test("rejects a caller who isn't a formal member of the parlay", async () => {
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
    const parlayId = await seedDraftParlay({ creatorId: alice.id });

    const { request, context } = legsRequest(
      parlayId,
      {
        marketId: "market-democrat-win-2028",
        outcomeIndex: 0,
        commitments: [{ positionId: outsiderPosition.id, shares: "10" }]
      },
      outsider.id
    );

    const response = await createLeg(request, context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: { code: "NOT_A_MEMBER" } });
  });

  test("rejects seeding a first leg twice once the parlay is already ACTIVE", async () => {
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
    const parlayId = await seedDraftParlay({ creatorId: alice.id });

    const first = legsRequest(
      parlayId,
      {
        marketId: "market-democrat-win-2028",
        outcomeIndex: 0,
        commitments: [{ positionId: positionA.id, shares: "10" }]
      },
      alice.id
    );
    const firstResponse = await createLeg(first.request, first.context);
    expect(firstResponse.status).toBe(201);

    const second = legsRequest(
      parlayId,
      {
        marketId: "market-democrat-win-2028",
        outcomeIndex: 0,
        commitments: [{ positionId: positionB.id, shares: "10" }]
      },
      alice.id
    );
    const secondResponse = await createLeg(second.request, second.context);

    expect(secondResponse.status).toBe(409);
    await expect(secondResponse.json()).resolves.toEqual({ error: { code: "PARLAY_NOT_DRAFT" } });
  });

  test("rejects an unknown parlay id with 404", async () => {
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });

    const { request, context } = legsRequest(
      "not-a-real-parlay",
      { marketId: "market-democrat-win-2028", outcomeIndex: 0, commitments: [] },
      alice.id
    );

    const response = await createLeg(request, context);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: { code: "PARLAY_NOT_FOUND" } });
  });
});
