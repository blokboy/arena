import { describe, expect, test } from "vitest";

import { GET as getDaysParlay } from "@/app/api/days-parlay/route";
import { POST as claimLeg } from "@/app/api/days-parlay/legs/route";
import { POST as stakeLeg } from "@/app/api/days-parlay/legs/[legId]/stake/route";
import { normalizeGammaEvent, type GammaEvent } from "@/domain/markets";
import { claimDaysParlayMarket } from "@/server/days-parlay";
import { prisma } from "@/server/db";
import { marketCacheRepository } from "@/server/markets";
import { userRepository } from "@/server/users";
import { jsonRequest } from "@test/helpers/api";

async function seedTodayEvents() {
  const events: GammaEvent[] = [
    {
      id: "event-claimable",
      title: "Claimable Event",
      slug: "claimable-event",
      volume: "1000",
      markets: [
        {
          id: "market-claimed",
          question: "Will claimed market resolve today?",
          slug: "claimed-market",
          outcomes: ["Yes", "No"],
          outcomePrices: ["0.64", "0.36"],
          bestBid: "0.62",
          bestAsk: "0.64",
          lastTradePrice: "0.63",
          active: true,
          closed: false,
          endDateIso: "2026-01-15T15:00:00.000Z",
          volume: "500"
        },
        {
          id: "market-open",
          question: "Will open market resolve today?",
          slug: "open-market",
          outcomes: ["Yes", "No"],
          outcomePrices: ["0.52", "0.48"],
          bestBid: "0.51",
          bestAsk: "0.52",
          lastTradePrice: "0.51",
          active: true,
          closed: false,
          endDateIso: "2026-01-15T18:00:00.000Z",
          volume: "400"
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

describe("Day's Parlay routes", () => {
  test("GET /api/days-parlay returns 401 without a session", async () => {
    const response = await getDaysParlay(new Request("http://arena.test/api/days-parlay"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: { code: "UNAUTHENTICATED" } });
  });

  test("GET /api/days-parlay returns the daily payload shape", async () => {
    await seedTodayEvents();

    const [alice, bob] = await Promise.all([
      userRepository.createUser({ username: "alice", passwordHash: "hashed" }),
      userRepository.createUser({ username: "bob", passwordHash: "hashed" })
    ]);

    const [claimedLot, openLot] = await Promise.all([
      seedPosition({
        userId: alice.id,
        marketGammaId: "market-claimed",
        outcomeIndex: 0,
        shares: "10",
        stake: "6.4",
        entryPrice: "0.64"
      }),
      seedPosition({
        userId: alice.id,
        marketGammaId: "market-open",
        outcomeIndex: 1,
        shares: "9",
        stake: "4.68",
        entryPrice: "0.52"
      })
    ]);

    const claim = await claimDaysParlayMarket({
      userId: alice.id,
      marketId: "market-claimed",
      outcomeIndex: 0,
      commitments: [{ positionId: claimedLot.id, shares: "10" }],
      now: new Date("2026-01-15T12:00:00.000Z")
    });

    await prisma.rolloverVote.create({
      data: {
        legId: claim.leg.id,
        userId: alice.id,
        dayKey: "2026-01-15",
        value: true
      }
    });
    await prisma.houseTransaction.createMany({
      data: [
        { amount: "100", reason: "PARLAY_LEG_LOSS" },
        { amount: "-40", reason: "DAYS_PARLAY_BONUS_PAYOUT" }
      ]
    });

    const response = await getDaysParlay(
      new Request("http://arena.test/api/days-parlay", {
        headers: { "x-test-user-id": alice.id }
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        id: expect.any(String),
        name: "Day's Parlay 2026-01-15",
        kind: "DAYS_PARLAY",
        dayKey: "2026-01-15",
        status: "ACTIVE",
        rolloverCount: 0,
        legs: [
          {
            id: claim.leg.id,
            outcomeIndex: 0,
            status: "ACTIVE",
            claimedBy: { id: alice.id, username: "alice" },
            market: {
              gammaId: "market-claimed",
              question: "Will claimed market resolve today?",
              outcomes: ["Yes", "No"],
              outcomePrices: ["0.64", "0.36"],
              endDate: "2026-01-15T15:00:00.000Z",
              lastSyncedAt: "2026-01-15T12:00:00.000Z",
              bestBid: "0.62",
              bestAsk: "0.64"
            },
            stakes: [
              {
                user: { id: alice.id, username: "alice" },
                amount: "6.4",
                shares: "10",
                averageEntryPrice: "0.64",
                status: "ACTIVE"
              }
            ],
            tally: { yesCount: 1, totalBackerCount: 1 },
            isFinalLeg: true
          }
        ],
        eligibleEvents: [
          {
            eventId: "event-claimable",
            title: "Claimable Event",
            category: "Politics",
            markets: [
              {
                marketId: "market-claimed",
                gammaId: "market-claimed",
                question: "Will claimed market resolve today?",
                outcomes: ["Yes", "No"],
                outcomePrices: ["0.64", "0.36"],
                bestBid: "0.62",
                bestAsk: "0.64",
                endDate: "2026-01-15T15:00:00.000Z",
                lastSyncedAt: "2026-01-15T12:00:00.000Z",
                claimStatus: "claimed",
                claimedLegId: claim.leg.id,
                claimedByUsername: "alice",
                myAvailableLots: []
              },
              {
                marketId: "market-open",
                gammaId: "market-open",
                question: "Will open market resolve today?",
                outcomes: ["Yes", "No"],
                outcomePrices: ["0.52", "0.48"],
                bestBid: "0.51",
                bestAsk: "0.52",
                endDate: "2026-01-15T18:00:00.000Z",
                lastSyncedAt: "2026-01-15T12:00:00.000Z",
                claimStatus: "available",
                myAvailableLots: [
                  {
                    positionId: openLot.id,
                    outcomeIndex: 1,
                    outcomeLabel: "No",
                    availableShares: "9",
                    entryPrice: "0.52",
                    createdAt: expect.any(String)
                  }
                ]
              }
            ]
          }
        ],
        myVote: {
          legId: claim.leg.id,
          marketQuestion: "Will claimed market resolve today?"
        },
        houseBalance: "60",
        myContributedPrincipal: "6.4",
        totalContributedPrincipal: "6.4"
      }
    });

    void bob;
  });

  test("POST /api/days-parlay/legs returns 409 for a second claim of the same market", async () => {
    await seedTodayEvents();

    const [alice, bob] = await Promise.all([
      userRepository.createUser({ username: "alice", passwordHash: "hashed" }),
      userRepository.createUser({ username: "bob", passwordHash: "hashed" })
    ]);
    const [aliceLot, bobLot] = await Promise.all([
      seedPosition({
        userId: alice.id,
        marketGammaId: "market-claimed",
        outcomeIndex: 0,
        shares: "10",
        stake: "6.4",
        entryPrice: "0.64"
      }),
      seedPosition({
        userId: bob.id,
        marketGammaId: "market-claimed",
        outcomeIndex: 0,
        shares: "10",
        stake: "6.4",
        entryPrice: "0.64"
      })
    ]);

    const first = await claimLeg(
      jsonRequest(
        "http://arena.test/api/days-parlay/legs",
        {
          marketId: "market-claimed",
          outcomeIndex: 0,
          commitments: [{ positionId: aliceLot.id, shares: "10" }]
        },
        { "x-test-user-id": alice.id }
      )
    );
    expect(first.status).toBe(201);

    const second = await claimLeg(
      jsonRequest(
        "http://arena.test/api/days-parlay/legs",
        {
          marketId: "market-claimed",
          outcomeIndex: 0,
          commitments: [{ positionId: bobLot.id, shares: "10" }]
        },
        { "x-test-user-id": bob.id }
      )
    );

    expect(second.status).toBe(409);
    await expect(second.json()).resolves.toEqual({
      error: { code: "MARKET_ALREADY_CLAIMED" }
    });
  });

  test("POST /api/days-parlay/legs returns LEG_APPEND_TOO_EARLY for a market resolving before the active leg", async () => {
    await seedTodayEvents();

    const earlyEvent: GammaEvent = {
      id: "event-early",
      title: "Early Event",
      slug: "early-event",
      volume: "300",
      markets: [
        {
          id: "market-too-early",
          question: "Will the early market resolve today?",
          slug: "too-early-market",
          outcomes: ["Yes", "No"],
          outcomePrices: ["0.5", "0.5"],
          bestBid: "0.49",
          bestAsk: "0.5",
          lastTradePrice: "0.5",
          active: true,
          closed: false,
          endDateIso: "2026-01-15T10:00:00.000Z",
          volume: "100"
        }
      ]
    };
    await marketCacheRepository.upsertCategoryEvents({
      category: "Politics",
      events: [
        normalizeGammaEvent(earlyEvent, {
          category: "Politics",
          lastSyncedAt: "2026-01-15T12:00:00.000Z"
        })
      ]
    });

    const alice = await userRepository.createUser({ username: "alice", passwordHash: "hashed" });

    const [activeLot, earlyLot] = await Promise.all([
      seedPosition({
        userId: alice.id,
        marketGammaId: "market-claimed",
        outcomeIndex: 0,
        shares: "10",
        stake: "6.4",
        entryPrice: "0.64"
      }),
      seedPosition({
        userId: alice.id,
        marketGammaId: "market-too-early",
        outcomeIndex: 0,
        shares: "10",
        stake: "5",
        entryPrice: "0.5"
      })
    ]);

    await claimDaysParlayMarket({
      userId: alice.id,
      marketId: "market-claimed",
      outcomeIndex: 0,
      commitments: [{ positionId: activeLot.id, shares: "10" }],
      now: new Date("2026-01-15T12:00:00.000Z")
    });

    const response = await claimLeg(
      jsonRequest(
        "http://arena.test/api/days-parlay/legs",
        {
          marketId: "market-too-early",
          outcomeIndex: 0,
          commitments: [{ positionId: earlyLot.id, shares: "10" }]
        },
        { "x-test-user-id": alice.id }
      )
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "LEG_APPEND_TOO_EARLY",
        details: {
          activeLegEndDate: "2026-01-15T15:00:00.000Z",
          attemptedMarketEndDate: "2026-01-15T10:00:00.000Z"
        }
      }
    });
  });

  test("POST /api/days-parlay/legs/:legId/stake lets a user back a pending Day's Parlay leg", async () => {
    await seedTodayEvents();

    const [alice, bob, chris] = await Promise.all([
      userRepository.createUser({ username: "alice", passwordHash: "hashed" }),
      userRepository.createUser({ username: "bob", passwordHash: "hashed" }),
      userRepository.createUser({ username: "chris", passwordHash: "hashed" })
    ]);

    const [firstLot, pendingLot, backerLot] = await Promise.all([
      seedPosition({
        userId: alice.id,
        marketGammaId: "market-claimed",
        outcomeIndex: 0,
        shares: "10",
        stake: "6.4",
        entryPrice: "0.64"
      }),
      seedPosition({
        userId: bob.id,
        marketGammaId: "market-open",
        outcomeIndex: 0,
        shares: "10",
        stake: "5.2",
        entryPrice: "0.52"
      }),
      seedPosition({
        userId: chris.id,
        marketGammaId: "market-open",
        outcomeIndex: 0,
        shares: "8",
        stake: "4.16",
        entryPrice: "0.52"
      })
    ]);

    await claimDaysParlayMarket({
      userId: alice.id,
      marketId: "market-claimed",
      outcomeIndex: 0,
      commitments: [{ positionId: firstLot.id, shares: "10" }],
      now: new Date("2026-01-15T12:00:00.000Z")
    });

    const pendingClaim = await claimDaysParlayMarket({
      userId: bob.id,
      marketId: "market-open",
      outcomeIndex: 0,
      commitments: [{ positionId: pendingLot.id, shares: "10" }],
      now: new Date("2026-01-15T12:01:00.000Z")
    });

    const response = await stakeLeg(
      jsonRequest(
        `http://arena.test/api/days-parlay/legs/${pendingClaim.leg.id}/stake`,
        {
          commitments: [{ positionId: backerLot.id, shares: "5" }]
        },
        { "x-test-user-id": chris.id }
      ),
      { params: Promise.resolve({ legId: pendingClaim.leg.id }) }
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      data: {
        stake: {
          stakeId: expect.any(String),
          legId: pendingClaim.leg.id,
          amount: "2.6",
          shares: "5",
          averageEntryPrice: "0.52"
        }
      }
    });
  });
});
