import { describe, expect, test } from "vitest";

import { POST as rolloverVote } from "@/app/api/days-parlay/legs/[legId]/rollover-vote/route";
import { normalizeGammaEvent, type GammaEvent } from "@/domain/markets";
import { claimDaysParlayMarket, stakeDaysParlayLeg } from "@/server/days-parlay";
import { prisma } from "@/server/db";
import { marketCacheRepository } from "@/server/markets";
import { userRepository } from "@/server/users";
import { jsonRequest } from "@test/helpers/api";

async function seedTodayEvents() {
  const events: GammaEvent[] = [
    {
      id: "event-day-vote",
      title: "Day Vote Event",
      slug: "day-vote-event",
      volume: "1000",
      markets: [
        {
          id: "market-leg-a",
          question: "Will leg A resolve today?",
          slug: "leg-a",
          outcomes: ["Yes", "No"],
          outcomePrices: ["0.64", "0.36"],
          bestBid: "0.60",
          bestAsk: "0.64",
          lastTradePrice: "0.63",
          active: true,
          closed: false,
          endDateIso: "2026-01-15T13:00:00.000Z",
          volume: "500"
        },
        {
          id: "market-leg-b",
          question: "Will leg B resolve today?",
          slug: "leg-b",
          outcomes: ["Yes", "No"],
          outcomePrices: ["0.52", "0.48"],
          bestBid: "0.50",
          bestAsk: "0.55",
          lastTradePrice: "0.51",
          active: true,
          closed: false,
          endDateIso: "2026-01-15T14:00:00.000Z",
          volume: "400"
        },
        {
          id: "market-leg-c",
          question: "Will leg C resolve today?",
          slug: "leg-c",
          outcomes: ["Yes", "No"],
          outcomePrices: ["0.45", "0.55"],
          bestBid: "0.40",
          bestAsk: "0.46",
          lastTradePrice: "0.44",
          active: true,
          closed: false,
          endDateIso: "2026-01-15T15:00:00.000Z",
          volume: "300"
        }
      ]
    }
  ];

  await marketCacheRepository.upsertCategoryEvents({
    category: "Politics",
    events: events.map((event) =>
      normalizeGammaEvent(event, {
        category: "Politics",
        lastSyncedAt: "2026-01-15T12:00:00.000Z"
      })
    )
  });
}

async function seedPosition(input: {
  userId: string;
  marketGammaId: string;
  outcomeIndex: number;
  shares: string;
  stake: string;
  entryPrice: string;
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
      entryPrice: input.entryPrice,
      stake: input.stake,
      shares: input.shares
    }
  });
}

async function createUser(username: string) {
  return userRepository.createUser({ username, passwordHash: "hashed" });
}

function voteRequest(legId: string, body: unknown, userId?: string) {
  return {
    request: jsonRequest(
      `http://arena.test/api/days-parlay/legs/${legId}/rollover-vote`,
      body,
      userId ? { "x-test-user-id": userId } : undefined
    ),
    context: { params: Promise.resolve({ legId }) }
  };
}

describe("POST /api/days-parlay/legs/:legId/rollover-vote", () => {
  test("requires authentication", async () => {
    const { request, context } = voteRequest("whatever", { vote: true });

    const response = await rolloverVote(request, context);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: { code: "UNAUTHENTICATED" } });
  });

  test("rejects a body that isn't the literal {vote: true} contract", async () => {
    const alice = await createUser("alice");

    const falseVote = voteRequest("leg-1", { vote: false }, alice.id);
    const falseResponse = await rolloverVote(falseVote.request, falseVote.context);
    expect(falseResponse.status).toBe(400);
    await expect(falseResponse.json()).resolves.toEqual({ error: { code: "INVALID_BODY" } });

    const stringVote = voteRequest("leg-1", { vote: "yes" }, alice.id);
    const stringResponse = await rolloverVote(stringVote.request, stringVote.context);
    expect(stringResponse.status).toBe(400);
    await expect(stringResponse.json()).resolves.toEqual({ error: { code: "INVALID_BODY" } });
  });

  test("leg not found returns 404", async () => {
    const alice = await createUser("alice");

    const { request, context } = voteRequest("nonexistent-leg", { vote: true }, alice.id);

    const response = await rolloverVote(request, context);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: { code: "LEG_NOT_FOUND" } });
  });

  test("a non-backer of the leg is rejected with 403 BACKER_REQUIRED", async () => {
    await seedTodayEvents();
    const [alice, bob] = await Promise.all([createUser("alice"), createUser("bob")]);

    const aliceLot = await seedPosition({
      userId: alice.id,
      marketGammaId: "market-leg-a",
      outcomeIndex: 0,
      shares: "10",
      stake: "6.4",
      entryPrice: "0.64"
    });

    const claim = await claimDaysParlayMarket({
      userId: alice.id,
      marketId: "market-leg-a",
      outcomeIndex: 0,
      commitments: [{ positionId: aliceLot.id, shares: "10" }],
      now: new Date("2026-01-15T12:00:00.000Z")
    });

    // Seed a pending second leg so leg A isn't the final leg.
    const bobLot = await seedPosition({
      userId: bob.id,
      marketGammaId: "market-leg-b",
      outcomeIndex: 0,
      shares: "10",
      stake: "5.5",
      entryPrice: "0.55"
    });
    await claimDaysParlayMarket({
      userId: bob.id,
      marketId: "market-leg-b",
      outcomeIndex: 0,
      commitments: [{ positionId: bobLot.id, shares: "10" }],
      now: new Date("2026-01-15T12:01:00.000Z")
    });

    const { request, context } = voteRequest(claim.leg.id, { vote: true }, bob.id);

    const response = await rolloverVote(request, context);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: { code: "BACKER_REQUIRED" } });
  });

  test("voting on a non-ACTIVE (pending) leg is rejected with 409 LEG_NOT_ACTIVE", async () => {
    await seedTodayEvents();
    const [alice, bob] = await Promise.all([createUser("alice"), createUser("bob")]);

    const aliceLot = await seedPosition({
      userId: alice.id,
      marketGammaId: "market-leg-a",
      outcomeIndex: 0,
      shares: "10",
      stake: "6.4",
      entryPrice: "0.64"
    });
    await claimDaysParlayMarket({
      userId: alice.id,
      marketId: "market-leg-a",
      outcomeIndex: 0,
      commitments: [{ positionId: aliceLot.id, shares: "10" }],
      now: new Date("2026-01-15T12:00:00.000Z")
    });

    const bobLot = await seedPosition({
      userId: bob.id,
      marketGammaId: "market-leg-b",
      outcomeIndex: 0,
      shares: "10",
      stake: "5.5",
      entryPrice: "0.55"
    });
    const pendingClaim = await claimDaysParlayMarket({
      userId: bob.id,
      marketId: "market-leg-b",
      outcomeIndex: 0,
      commitments: [{ positionId: bobLot.id, shares: "10" }],
      now: new Date("2026-01-15T12:01:00.000Z")
    });

    const { request, context } = voteRequest(pendingClaim.leg.id, { vote: true }, bob.id);

    const response = await rolloverVote(request, context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: { code: "LEG_NOT_ACTIVE" } });
  });

  test("voting on the final leg is rejected defensively and does not spend the vote", async () => {
    await seedTodayEvents();
    const alice = await createUser("alice");

    const aliceLot = await seedPosition({
      userId: alice.id,
      marketGammaId: "market-leg-a",
      outcomeIndex: 0,
      shares: "10",
      stake: "6.4",
      entryPrice: "0.64"
    });
    const claim = await claimDaysParlayMarket({
      userId: alice.id,
      marketId: "market-leg-a",
      outcomeIndex: 0,
      commitments: [{ positionId: aliceLot.id, shares: "10" }],
      now: new Date("2026-01-15T12:00:00.000Z")
    });

    const { request, context } = voteRequest(claim.leg.id, { vote: true }, alice.id);

    const response = await rolloverVote(request, context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: { code: "FINAL_LEG_NOT_ROLLOVERABLE" }
    });

    const votes = await prisma.rolloverVote.findMany({ where: { legId: claim.leg.id } });
    expect(votes).toHaveLength(0);
  });

  test("a sole backer's yes vote is an instant headcount majority and executes the rollover", async () => {
    await seedTodayEvents();
    const alice = await createUser("alice");

    const aliceLotA = await seedPosition({
      userId: alice.id,
      marketGammaId: "market-leg-a",
      outcomeIndex: 0,
      shares: "10",
      stake: "6.4",
      entryPrice: "0.64"
    });
    const legA = await claimDaysParlayMarket({
      userId: alice.id,
      marketId: "market-leg-a",
      outcomeIndex: 0,
      commitments: [{ positionId: aliceLotA.id, shares: "10" }],
      now: new Date("2026-01-15T12:00:00.000Z")
    });

    const aliceLotB = await seedPosition({
      userId: alice.id,
      marketGammaId: "market-leg-b",
      outcomeIndex: 0,
      shares: "5",
      stake: "2.75",
      entryPrice: "0.55"
    });
    const legB = await claimDaysParlayMarket({
      userId: alice.id,
      marketId: "market-leg-b",
      outcomeIndex: 0,
      commitments: [{ positionId: aliceLotB.id, shares: "5" }],
      now: new Date("2026-01-15T12:01:00.000Z")
    });

    const { request, context } = voteRequest(legA.leg.id, { vote: true }, alice.id);
    const response = await rolloverVote(request, context);
    const body = (await response.json()) as {
      data: {
        vote: { legId: string; userId: string; value: boolean };
        tally: { yesCount: number; totalBackerCount: number; passes: boolean };
        didExecuteRollover: boolean;
        rollover: {
          currentLegId: string;
          nextLegId: string | null;
          exitPrice: string;
          rollForwardByUser: Record<string, { shares: string; amount: string }>;
        } | null;
      };
    };

    expect(response.status).toBe(200);
    expect(body.data.vote).toEqual({ legId: legA.leg.id, userId: alice.id, value: true });
    expect(body.data.tally).toEqual({ yesCount: 1, totalBackerCount: 1, passes: true });
    expect(body.data.didExecuteRollover).toBe(true);
    expect(body.data.rollover?.currentLegId).toBe(legA.leg.id);
    expect(body.data.rollover?.nextLegId).toBe(legB.leg.id);
    // 10 shares exiting at legA's bestBid (0.60) = 6 payout points, redeployed
    // into legB's bestAsk (0.55) => 6 / 0.55 ≈ 10.909090 additional shares on
    // top of the 5 shares already committed to legB directly.
    expect(body.data.rollover?.rollForwardByUser[alice.id]?.amount).toBe("6");

    const legARow = await prisma.parlayLeg.findUniqueOrThrow({
      where: { id: legA.leg.id },
      select: { status: true }
    });
    expect(legARow.status).toBe("ROLLED_OVER");

    const legAStake = await prisma.legStake.findUniqueOrThrow({
      where: { legId_userId: { legId: legA.leg.id, userId: alice.id } },
      select: { status: true, exitPrice: true, exitedAt: true }
    });
    expect(legAStake.status).toBe("ROLLED_OVER");
    expect(legAStake.exitPrice?.toString()).toBe("0.6");
    expect(legAStake.exitedAt).not.toBeNull();

    const legBRow = await prisma.parlayLeg.findUniqueOrThrow({
      where: { id: legB.leg.id },
      select: { status: true }
    });
    expect(legBRow.status).toBe("ACTIVE");

    const legBStake = await prisma.legStake.findUniqueOrThrow({
      where: { legId_userId: { legId: legB.leg.id, userId: alice.id } },
      select: { amount: true, shares: true, status: true }
    });
    // 2.75 fresh principal (already-committed shares) + 6 rolled-forward.
    expect(legBStake.amount.toString()).toBe("8.75");
    expect(legBStake.status).toBe("ACTIVE");

    const parlayRow = await prisma.parlay.findFirstOrThrow({
      where: { kind: "DAYS_PARLAY" },
      select: { rolloverUsed: true }
    });
    expect(parlayRow.rolloverUsed).toBe(1);
  });

  test("a user's rollover vote is one-shot across the whole day: a second, cross-leg vote is rejected with VOTE_ALREADY_SPENT", async () => {
    await seedTodayEvents();
    const alice = await createUser("alice");

    const aliceLotA = await seedPosition({
      userId: alice.id,
      marketGammaId: "market-leg-a",
      outcomeIndex: 0,
      shares: "10",
      stake: "6.4",
      entryPrice: "0.64"
    });
    const legA = await claimDaysParlayMarket({
      userId: alice.id,
      marketId: "market-leg-a",
      outcomeIndex: 0,
      commitments: [{ positionId: aliceLotA.id, shares: "10" }],
      now: new Date("2026-01-15T12:00:00.000Z")
    });

    const aliceLotB = await seedPosition({
      userId: alice.id,
      marketGammaId: "market-leg-b",
      outcomeIndex: 0,
      shares: "5",
      stake: "2.75",
      entryPrice: "0.55"
    });
    const legB = await claimDaysParlayMarket({
      userId: alice.id,
      marketId: "market-leg-b",
      outcomeIndex: 0,
      commitments: [{ positionId: aliceLotB.id, shares: "5" }],
      now: new Date("2026-01-15T12:01:00.000Z")
    });

    // Also seed a pending third leg so, once alice's vote on leg A rolls leg
    // B into ACTIVE, leg B itself still has somewhere to roll into (not
    // strictly required for this test, but keeps the fixture realistic).
    const aliceLotC = await seedPosition({
      userId: alice.id,
      marketGammaId: "market-leg-c",
      outcomeIndex: 0,
      shares: "5",
      stake: "2.3",
      entryPrice: "0.46"
    });
    await claimDaysParlayMarket({
      userId: alice.id,
      marketId: "market-leg-c",
      outcomeIndex: 0,
      commitments: [{ positionId: aliceLotC.id, shares: "5" }],
      now: new Date("2026-01-15T12:02:00.000Z")
    });

    const firstVote = voteRequest(legA.leg.id, { vote: true }, alice.id);
    const firstResponse = await rolloverVote(firstVote.request, firstVote.context);
    expect(firstResponse.status).toBe(200);

    // Leg B is now ACTIVE (rolled into from leg A) and alice is a backer of
    // it, but she already spent her one vote for the day on leg A.
    const secondVote = voteRequest(legB.leg.id, { vote: true }, alice.id);
    const secondResponse = await rolloverVote(secondVote.request, secondVote.context);

    expect(secondResponse.status).toBe(409);
    await expect(secondResponse.json()).resolves.toEqual({
      error: {
        code: "VOTE_ALREADY_SPENT",
        details: {
          spentOnLegId: legA.leg.id,
          spentOnMarketQuestion: "Will leg A resolve today?"
        }
      }
    });
  });

  test("the rollover cap (3/day) is enforced and rejects a vote before spending it", async () => {
    await seedTodayEvents();
    const alice = await createUser("alice");

    const aliceLotA = await seedPosition({
      userId: alice.id,
      marketGammaId: "market-leg-a",
      outcomeIndex: 0,
      shares: "10",
      stake: "6.4",
      entryPrice: "0.64"
    });
    const legA = await claimDaysParlayMarket({
      userId: alice.id,
      marketId: "market-leg-a",
      outcomeIndex: 0,
      commitments: [{ positionId: aliceLotA.id, shares: "10" }],
      now: new Date("2026-01-15T12:00:00.000Z")
    });

    const aliceLotB = await seedPosition({
      userId: alice.id,
      marketGammaId: "market-leg-b",
      outcomeIndex: 0,
      shares: "5",
      stake: "2.75",
      entryPrice: "0.55"
    });
    await claimDaysParlayMarket({
      userId: alice.id,
      marketId: "market-leg-b",
      outcomeIndex: 0,
      commitments: [{ positionId: aliceLotB.id, shares: "5" }],
      now: new Date("2026-01-15T12:01:00.000Z")
    });

    await prisma.parlay.updateMany({
      where: { kind: "DAYS_PARLAY" },
      data: { rolloverUsed: 3 }
    });

    const { request, context } = voteRequest(legA.leg.id, { vote: true }, alice.id);
    const response = await rolloverVote(request, context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: { code: "ROLLOVER_CAP_REACHED" } });

    const votes = await prisma.rolloverVote.findMany({ where: { legId: legA.leg.id } });
    expect(votes).toHaveLength(0);
  });

  test("majority requires strictly more than half of backers: a single yes among two backers doesn't execute, the second does", async () => {
    await seedTodayEvents();
    const [alice, bob] = await Promise.all([createUser("alice"), createUser("bob")]);

    const aliceLotA = await seedPosition({
      userId: alice.id,
      marketGammaId: "market-leg-a",
      outcomeIndex: 0,
      shares: "10",
      stake: "6.4",
      entryPrice: "0.64"
    });
    const legA = await claimDaysParlayMarket({
      userId: alice.id,
      marketId: "market-leg-a",
      outcomeIndex: 0,
      commitments: [{ positionId: aliceLotA.id, shares: "10" }],
      now: new Date("2026-01-15T12:00:00.000Z")
    });

    const bobLotA = await seedPosition({
      userId: bob.id,
      marketGammaId: "market-leg-a",
      outcomeIndex: 0,
      shares: "8",
      stake: "5.12",
      entryPrice: "0.64"
    });
    await stakeDaysParlayLeg({
      legId: legA.leg.id,
      userId: bob.id,
      commitments: [{ positionId: bobLotA.id, shares: "8" }]
    });

    const bobLotB = await seedPosition({
      userId: bob.id,
      marketGammaId: "market-leg-b",
      outcomeIndex: 0,
      shares: "5",
      stake: "2.75",
      entryPrice: "0.55"
    });
    await claimDaysParlayMarket({
      userId: bob.id,
      marketId: "market-leg-b",
      outcomeIndex: 0,
      commitments: [{ positionId: bobLotB.id, shares: "5" }],
      now: new Date("2026-01-15T12:01:00.000Z")
    });

    const aliceVote = voteRequest(legA.leg.id, { vote: true }, alice.id);
    const aliceResponse = await rolloverVote(aliceVote.request, aliceVote.context);
    const aliceBody = (await aliceResponse.json()) as {
      data: { tally: { passes: boolean }; didExecuteRollover: boolean };
    };

    expect(aliceResponse.status).toBe(200);
    expect(aliceBody.data.tally.passes).toBe(false);
    expect(aliceBody.data.didExecuteRollover).toBe(false);

    const legAfterFirstVote = await prisma.parlayLeg.findUniqueOrThrow({
      where: { id: legA.leg.id },
      select: { status: true }
    });
    expect(legAfterFirstVote.status).toBe("ACTIVE");

    const bobVote = voteRequest(legA.leg.id, { vote: true }, bob.id);
    const bobResponse = await rolloverVote(bobVote.request, bobVote.context);
    const bobBody = (await bobResponse.json()) as {
      data: { tally: { yesCount: number; totalBackerCount: number; passes: boolean } };
    };

    expect(bobResponse.status).toBe(200);
    expect(bobBody.data.tally).toEqual({ yesCount: 2, totalBackerCount: 2, passes: true });

    const legAfterSecondVote = await prisma.parlayLeg.findUniqueOrThrow({
      where: { id: legA.leg.id },
      select: { status: true }
    });
    expect(legAfterSecondVote.status).toBe("ROLLED_OVER");
  });

  test("two backers' decisive combination cast concurrently still executes the rollover exactly once", async () => {
    await seedTodayEvents();
    const [alice, bob, chris] = await Promise.all([
      createUser("alice"),
      createUser("bob"),
      createUser("chris")
    ]);

    const aliceLotA = await seedPosition({
      userId: alice.id,
      marketGammaId: "market-leg-a",
      outcomeIndex: 0,
      shares: "10",
      stake: "6.4",
      entryPrice: "0.64"
    });
    const legA = await claimDaysParlayMarket({
      userId: alice.id,
      marketId: "market-leg-a",
      outcomeIndex: 0,
      commitments: [{ positionId: aliceLotA.id, shares: "10" }],
      now: new Date("2026-01-15T12:00:00.000Z")
    });

    const [bobLotA, chrisLotA] = await Promise.all([
      seedPosition({
        userId: bob.id,
        marketGammaId: "market-leg-a",
        outcomeIndex: 0,
        shares: "8",
        stake: "5.12",
        entryPrice: "0.64"
      }),
      seedPosition({
        userId: chris.id,
        marketGammaId: "market-leg-a",
        outcomeIndex: 0,
        shares: "6",
        stake: "3.84",
        entryPrice: "0.64"
      })
    ]);
    await Promise.all([
      stakeDaysParlayLeg({
        legId: legA.leg.id,
        userId: bob.id,
        commitments: [{ positionId: bobLotA.id, shares: "8" }]
      }),
      stakeDaysParlayLeg({
        legId: legA.leg.id,
        userId: chris.id,
        commitments: [{ positionId: chrisLotA.id, shares: "6" }]
      })
    ]);

    const aliceLotB = await seedPosition({
      userId: alice.id,
      marketGammaId: "market-leg-b",
      outcomeIndex: 0,
      shares: "5",
      stake: "2.75",
      entryPrice: "0.55"
    });
    await claimDaysParlayMarket({
      userId: alice.id,
      marketId: "market-leg-b",
      outcomeIndex: 0,
      commitments: [{ positionId: aliceLotB.id, shares: "5" }],
      now: new Date("2026-01-15T12:01:00.000Z")
    });

    // 3 backers on leg A: bob and chris fire their "yes" votes concurrently.
    // Neither is individually decisive (1 of 3 doesn't cross the >50%
    // headcount majority) but their combination (2 of 3) is. This exercises
    // the Parlay-level lock's serialization: the second transaction to
    // acquire the lock must re-tally against the first's already-committed
    // vote so the rollover executes exactly once, not zero or twice.
    const bobVote = voteRequest(legA.leg.id, { vote: true }, bob.id);
    const chrisVote = voteRequest(legA.leg.id, { vote: true }, chris.id);

    const [bobResponse, chrisResponse] = await Promise.all([
      rolloverVote(bobVote.request, bobVote.context),
      rolloverVote(chrisVote.request, chrisVote.context)
    ]);
    const [bobBody, chrisBody] = (await Promise.all([
      bobResponse.json(),
      chrisResponse.json()
    ])) as Array<{ data?: { didExecuteRollover: boolean }; error?: { code: string } }>;

    for (const response of [bobResponse, chrisResponse]) {
      expect(response.status).toBe(200);
    }

    const executions = [bobBody, chrisBody].filter(
      (body) => body.data?.didExecuteRollover === true
    ).length;
    expect(executions).toBe(1);

    const legRow = await prisma.parlayLeg.findUniqueOrThrow({
      where: { id: legA.leg.id },
      select: { status: true }
    });
    expect(legRow.status).toBe("ROLLED_OVER");

    const parlayRow = await prisma.parlay.findFirstOrThrow({
      where: { kind: "DAYS_PARLAY" },
      select: { rolloverUsed: true }
    });
    expect(parlayRow.rolloverUsed).toBe(1);

    const [bobVoteRow, chrisVoteRow] = await Promise.all([
      prisma.rolloverVote.findUnique({
        where: { legId_userId: { legId: legA.leg.id, userId: bob.id } }
      }),
      prisma.rolloverVote.findUnique({
        where: { legId_userId: { legId: legA.leg.id, userId: chris.id } }
      })
    ]);
    expect(bobVoteRow?.value).toBe(true);
    expect(chrisVoteRow?.value).toBe(true);
  });

  test("the same user double-submitting a vote on the same leg concurrently is rejected cleanly on the second attempt", async () => {
    await seedTodayEvents();
    const [alice, bob] = await Promise.all([createUser("alice"), createUser("bob")]);

    const aliceLotA = await seedPosition({
      userId: alice.id,
      marketGammaId: "market-leg-a",
      outcomeIndex: 0,
      shares: "10",
      stake: "6.4",
      entryPrice: "0.64"
    });
    const legA = await claimDaysParlayMarket({
      userId: alice.id,
      marketId: "market-leg-a",
      outcomeIndex: 0,
      commitments: [{ positionId: aliceLotA.id, shares: "10" }],
      now: new Date("2026-01-15T12:00:00.000Z")
    });

    // A second backer on leg A so alice's own "yes" alone (1 of 2) isn't an
    // instant majority — otherwise the first of the two concurrent requests
    // below would roll the leg over immediately, and the race loser would
    // observe LEG_NOT_ACTIVE instead of exercising the cross-leg/same-leg
    // VOTE_ALREADY_SPENT path this test is about.
    const bobLotA = await seedPosition({
      userId: bob.id,
      marketGammaId: "market-leg-a",
      outcomeIndex: 0,
      shares: "8",
      stake: "5.12",
      entryPrice: "0.64"
    });
    await stakeDaysParlayLeg({
      legId: legA.leg.id,
      userId: bob.id,
      commitments: [{ positionId: bobLotA.id, shares: "8" }]
    });

    const aliceLotB = await seedPosition({
      userId: alice.id,
      marketGammaId: "market-leg-b",
      outcomeIndex: 0,
      shares: "5",
      stake: "2.75",
      entryPrice: "0.55"
    });
    await claimDaysParlayMarket({
      userId: alice.id,
      marketId: "market-leg-b",
      outcomeIndex: 0,
      commitments: [{ positionId: aliceLotB.id, shares: "5" }],
      now: new Date("2026-01-15T12:01:00.000Z")
    });

    const firstAttempt = voteRequest(legA.leg.id, { vote: true }, alice.id);
    const secondAttempt = voteRequest(legA.leg.id, { vote: true }, alice.id);

    const [firstResponse, secondResponse] = await Promise.all([
      rolloverVote(firstAttempt.request, firstAttempt.context),
      rolloverVote(secondAttempt.request, secondAttempt.context)
    ]);

    const statuses = [firstResponse.status, secondResponse.status].sort();
    // Exactly one of the two concurrent, identical requests succeeds; the
    // other observes the just-created vote as already spent (on this same
    // leg) rather than throwing a raw unique-constraint error.
    expect(statuses).toEqual([200, 409]);

    const failed = firstResponse.status === 409 ? firstResponse : secondResponse;
    await expect(failed.json()).resolves.toEqual({
      error: {
        code: "VOTE_ALREADY_SPENT",
        details: {
          spentOnLegId: legA.leg.id,
          spentOnMarketQuestion: "Will leg A resolve today?"
        }
      }
    });

    const votes = await prisma.rolloverVote.findMany({
      where: { legId: legA.leg.id, userId: alice.id }
    });
    expect(votes).toHaveLength(1);
  });
});
