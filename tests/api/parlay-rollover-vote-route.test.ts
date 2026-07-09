import { describe, expect, test } from "vitest";

import { POST as createParlay } from "@/app/api/parlays/route";
import { POST as createLeg } from "@/app/api/parlays/[id]/legs/route";
import { POST as stakeLeg } from "@/app/api/parlays/[id]/legs/[legId]/stake/route";
import { POST as rolloverVote } from "@/app/api/parlays/[id]/legs/[legId]/rollover-vote/route";
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
  const position = await seedPosition({
    userId: input.creatorId,
    marketId: input.marketId,
    shares: "100"
  });
  const createResponse = await createParlay(
    jsonRequest(
      "http://arena.test/api/parlays",
      { name: "Vote Test", inviteUserIds: [] },
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

function voteRequest(
  parlayId: string,
  legId: string,
  body: unknown,
  userId?: string
) {
  return {
    request: jsonRequest(
      `http://arena.test/api/parlays/${parlayId}/legs/${legId}/rollover-vote`,
      body,
      userId ? { "x-test-user-id": userId } : undefined
    ),
    context: { params: Promise.resolve({ id: parlayId, legId }) }
  };
}

describe("POST /api/parlays/:id/legs/:legId/rollover-vote", () => {
  test("requires authentication", async () => {
    const { request, context } = voteRequest("whatever", "whatever", { vote: true });

    const response = await rolloverVote(request, context);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: "UNAUTHENTICATED" }
    });
  });

  test("rejects an invalid body (non-boolean vote)", async () => {
    const user = await userRepository.createUser({
      username: "alice",
      passwordHash: "hashed"
    });

    const { request, context } = voteRequest("p1", "l1", { vote: "yes" }, user.id);

    const response = await rolloverVote(request, context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: "INVALID_BODY" }
    });
  });

  test("non-member trying to vote returns 403 NOT_A_VOTING_MEMBER", async () => {
    const marketId = await seedCachedMarket();
    const [alice, chris] = await Promise.all([
      userRepository.createUser({ username: "alice", passwordHash: "hashed" }),
      userRepository.createUser({ username: "chris", passwordHash: "hashed" })
    ]);
    const { parlayId, legId } = await seedActiveLeg({
      creatorId: alice.id,
      marketId
    });

    const { request, context } = voteRequest(
      parlayId,
      legId,
      { vote: true },
      chris.id
    );

    const response = await rolloverVote(request, context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: { code: "NOT_A_VOTING_MEMBER" }
    });
  });

  test("member without stake on the leg returns 403 NOT_A_VOTING_MEMBER", async () => {
    const marketId = await seedCachedMarket();
    const [alice, bob] = await Promise.all([
      userRepository.createUser({ username: "alice", passwordHash: "hashed" }),
      userRepository.createUser({ username: "bob", passwordHash: "hashed" })
    ]);

    const position = await seedPosition({
      userId: alice.id,
      marketId,
      shares: "100"
    });
    const createResponse = await createParlay(
      jsonRequest(
        "http://arena.test/api/parlays",
        { name: "Bob No Stake", inviteUserIds: [bob.id] },
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
      { params: Promise.resolve({ id: parlay.id }) }
    );

    const activeLeg = await prisma.parlayLeg.findFirstOrThrow({
      where: { parlayId: parlay.id, status: "ACTIVE" },
      select: { id: true }
    });

    const { request, context } = voteRequest(
      parlay.id,
      activeLeg.id,
      { vote: true },
      bob.id
    );

    const response = await rolloverVote(request, context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: { code: "NOT_A_VOTING_MEMBER" }
    });
  });

  test("leg not found returns 404", async () => {
    const alice = await userRepository.createUser({
      username: "alice",
      passwordHash: "hashed"
    });

    const { request, context } = voteRequest(
      "parlay-1",
      "nonexistent-leg",
      { vote: true },
      alice.id
    );

    const response = await rolloverVote(request, context);

    expect(response.status).toBe(404);
  });

  test("member with stake can toggle their vote and the tally updates", async () => {
    const marketId = await seedCachedMarket();
    const alice = await userRepository.createUser({
      username: "alice",
      passwordHash: "hashed"
    });
    const { parlayId, legId } = await seedActiveLeg({
      creatorId: alice.id,
      marketId
    });

    const { request, context } = voteRequest(
      parlayId,
      legId,
      { vote: true },
      alice.id
    );

    const response = await rolloverVote(request, context);
    const body = (await response.json()) as {
      data: {
        vote: { legId: string; userId: string; value: boolean };
        tally: { totalMemberStake: string; yesStake: string; passes: boolean };
        didExecuteRollover: boolean;
      };
    };

    expect(response.status).toBe(200);
    expect(body.data.vote).toEqual({
      legId,
      userId: alice.id,
      value: true
    });
    expect(body.data.tally.passes).toBe(true);
    expect(body.data.didExecuteRollover).toBe(true);
  });

  test("after rollover executes, the leg is ROLLED_OVER and further vote toggles are rejected", async () => {
    const marketId = await seedCachedMarket();
    const alice = await userRepository.createUser({
      username: "alice",
      passwordHash: "hashed"
    });
    const { parlayId, legId } = await seedActiveLeg({
      creatorId: alice.id,
      marketId
    });

    const { request: voteYes, context: ctx } = voteRequest(
      parlayId,
      legId,
      { vote: true },
      alice.id
    );
    const yesResponse = await rolloverVote(voteYes, ctx);
    const yesBody = (await yesResponse.json()) as {
      data: { vote: { value: boolean }; didExecuteRollover: boolean };
    };
    expect(yesBody.data.vote.value).toBe(true);
    expect(yesBody.data.didExecuteRollover).toBe(true);

    const legAfterRollover = await prisma.parlayLeg.findUnique({
      where: { id: legId },
      select: { status: true }
    });
    expect(legAfterRollover?.status).toBe("ROLLED_OVER");

    const { request: voteFalse, context: ctx2 } = voteRequest(
      parlayId,
      legId,
      { vote: false },
      alice.id
    );
    const noResponse = await rolloverVote(voteFalse, ctx2);

    expect(noResponse.status).toBe(409);
    await expect(noResponse.json()).resolves.toEqual({
      error: { code: "LEG_NOT_ACTIVE" }
    });
  });
});
