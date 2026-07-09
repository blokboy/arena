import { describe, expect, test } from "vitest";

import { POST as createParlay } from "@/app/api/parlays/route";
import { POST as createLeg } from "@/app/api/parlays/[id]/legs/route";
import { normalizeGammaEvent, type GammaEvent } from "@/domain/markets";
import { prisma } from "@/server/db";
import { marketCacheRepository } from "@/server/markets";
import { userRepository } from "@/server/users";
import { jsonRequest } from "@test/helpers/api";
import { binaryGammaEvent, multiOutcomeGammaEvent } from "@test/helpers/gamma-fixtures";

async function seedMarkets() {
  const activeEvent = binaryGammaEvent();
  const laterEvent = multiOutcomeGammaEvent();
  laterEvent.markets = laterEvent.markets?.map((market) => ({
    ...market,
    endDate: "2028-11-09T00:00:00.000Z"
  }));
  const tooEarlyEvent: GammaEvent = {
    id: "event-senate-control-2028",
    title: "2028 Senate Control",
    slug: "2028-senate-control",
    volume: "750000",
    markets: [
      {
        id: "market-senate-control-2028",
        question: "Will Democrats control the Senate after the 2028 election?",
        slug: "senate-control-2028",
        outcomes: ["Yes", "No"],
        outcomePrices: ["0.52", "0.48"],
        bestBid: "0.51",
        bestAsk: "0.53",
        lastTradePrice: "0.52",
        active: true,
        closed: false,
        endDateIso: "2028-11-07T00:00:00.000Z",
        volume: "750000"
      }
    ]
  };

  await Promise.all([
    marketCacheRepository.upsertCategoryEvents({
      category: "Politics",
      events: [
        normalizeGammaEvent(activeEvent, {
          category: "Politics",
          lastSyncedAt: "2026-01-15T11:00:00.000Z"
        }),
        normalizeGammaEvent(tooEarlyEvent, {
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

  return {
    activeGammaId: "market-democrat-win-2028",
    laterGammaId: "market-world-cup-winner",
    tooEarlyGammaId: "market-senate-control-2028"
  };
}

async function seedPosition(input: {
  userId: string;
  marketGammaId: string;
  outcomeIndex: number;
  shares: string;
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
      entryPrice: "0.5",
      stake: "50",
      shares: input.shares
    }
  });
}

async function seedActiveParlay(input: { creatorId: string; memberIds: string[]; marketGammaId: string }) {
  const createResponse = await createParlay(
    jsonRequest(
      "http://arena.test/api/parlays",
      { name: "Late Slate", inviteUserIds: input.memberIds.filter((id) => id !== input.creatorId) },
      { "x-test-user-id": input.creatorId }
    )
  );
  const { parlay } = (await createResponse.json()) as { parlay: { id: string } };

  const seedPositionForFirstLeg = await seedPosition({
    userId: input.creatorId,
    marketGammaId: input.marketGammaId,
    outcomeIndex: 0,
    shares: "100"
  });

  const firstLegResponse = await createLeg(
    jsonRequest(
      `http://arena.test/api/parlays/${parlay.id}/legs`,
      {
        marketId: input.marketGammaId,
        outcomeIndex: 0,
        commitments: [{ positionId: seedPositionForFirstLeg.id, shares: "10" }]
      },
      { "x-test-user-id": input.creatorId }
    ),
    { params: Promise.resolve({ id: parlay.id }) }
  );
  if (firstLegResponse.status !== 201) {
    throw new Error(`SEED_FIRST_LEG_FAILED: ${firstLegResponse.status}`);
  }

  return parlay.id;
}

function legsRequest(parlayId: string, body: unknown, userId: string) {
  return {
    request: jsonRequest(`http://arena.test/api/parlays/${parlayId}/legs`, body, {
      "x-test-user-id": userId
    }),
    context: { params: Promise.resolve({ id: parlayId }) }
  };
}

describe("POST /api/parlays/:id/legs (append, once ACTIVE)", () => {
  test("a member appends a later-resolving leg as PENDING without disturbing the active leg", async () => {
    const markets = await seedMarkets();
    const [alice, bob] = await Promise.all([
      userRepository.createUser({ username: "alice", passwordHash: "hashed" }),
      userRepository.createUser({ username: "bob", passwordHash: "hashed" })
    ]);
    const parlayId = await seedActiveParlay({
      creatorId: alice.id,
      memberIds: [alice.id, bob.id],
      marketGammaId: markets.activeGammaId
    });
    const bobPosition = await seedPosition({
      userId: bob.id,
      marketGammaId: markets.laterGammaId,
      outcomeIndex: 1,
      shares: "50"
    });

    const { request, context } = legsRequest(
      parlayId,
      {
        marketId: markets.laterGammaId,
        outcomeIndex: 1,
        commitments: [{ positionId: bobPosition.id, shares: "10" }]
      },
      bob.id
    );

    const response = await createLeg(request, context);
    const body = (await response.json()) as {
      leg: { id: string; status: string };
      parlay: { id: string; status: string };
    };

    expect(response.status).toBe(201);
    expect(body.leg.status).toBe("PENDING");
    expect(body.parlay.status).toBe("ACTIVE");

    const legs = await prisma.parlayLeg.findMany({ where: { parlayId } });
    expect(legs.map((leg) => leg.status).sort()).toEqual(["ACTIVE", "PENDING"]);

    const lockedPosition = await prisma.position.findUnique({ where: { id: bobPosition.id } });
    expect(lockedPosition?.committedShares.toString()).toBe("10");
  });

  test("rejects an append that resolves before the active leg with structured LEG_APPEND_TOO_EARLY details", async () => {
    const markets = await seedMarkets();
    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });
    const parlayId = await seedActiveParlay({
      creatorId: alice.id,
      memberIds: [alice.id],
      marketGammaId: markets.activeGammaId
    });
    const tooEarlyPosition = await seedPosition({
      userId: alice.id,
      marketGammaId: markets.tooEarlyGammaId,
      outcomeIndex: 0,
      shares: "50"
    });

    const { request, context } = legsRequest(
      parlayId,
      {
        marketId: markets.tooEarlyGammaId,
        outcomeIndex: 0,
        commitments: [{ positionId: tooEarlyPosition.id, shares: "10" }]
      },
      alice.id
    );

    const response = await createLeg(request, context);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "LEG_APPEND_TOO_EARLY",
        details: {
          activeLegEndDate: "2028-11-08T00:00:00.000Z",
          attemptedMarketEndDate: "2028-11-07T00:00:00.000Z"
        }
      }
    });

    expect(await prisma.parlayLeg.count({ where: { parlayId } })).toBe(1);
  });

  test("rejects an append from a non-member with NOT_A_MEMBER", async () => {
    const markets = await seedMarkets();
    const [alice, outsider] = await Promise.all([
      userRepository.createUser({ username: "alice", passwordHash: "hashed" }),
      userRepository.createUser({ username: "outsider", passwordHash: "hashed" })
    ]);
    const parlayId = await seedActiveParlay({
      creatorId: alice.id,
      memberIds: [alice.id],
      marketGammaId: markets.activeGammaId
    });
    const outsiderPosition = await seedPosition({
      userId: outsider.id,
      marketGammaId: markets.laterGammaId,
      outcomeIndex: 1,
      shares: "50"
    });

    const { request, context } = legsRequest(
      parlayId,
      {
        marketId: markets.laterGammaId,
        outcomeIndex: 1,
        commitments: [{ positionId: outsiderPosition.id, shares: "10" }]
      },
      outsider.id
    );

    const response = await createLeg(request, context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: { code: "NOT_A_MEMBER" } });
  });
});
