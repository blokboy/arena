import { describe, expect, test } from "vitest";

import { normalizeGammaEvent, type GammaEvent } from "@/domain/markets";
import {
  claimDaysParlayMarket,
  getOrCreateTodayDaysParlay,
  stakeDaysParlayLeg
} from "@/server/days-parlay";
import { prisma } from "@/server/db";
import { marketCacheRepository } from "@/server/markets";
import { userRepository } from "@/server/users";

async function seedTodayEvents() {
  const events: GammaEvent[] = [
    {
      id: "event-day-politics",
      title: "Day Politics",
      slug: "day-politics",
      volume: "1000",
      markets: [
        {
          id: "market-day-1",
          question: "Will policy A happen today?",
          slug: "policy-a-today",
          outcomes: ["Yes", "No"],
          outcomePrices: ["0.64", "0.36"],
          bestBid: "0.62",
          bestAsk: "0.64",
          lastTradePrice: "0.63",
          active: true,
          closed: false,
          endDateIso: "2026-01-15T16:00:00.000Z",
          volume: "500"
        },
        {
          id: "market-day-2",
          question: "Will policy B happen today?",
          slug: "policy-b-today",
          outcomes: ["Yes", "No"],
          outcomePrices: ["0.51", "0.49"],
          bestBid: "0.5",
          bestAsk: "0.51",
          lastTradePrice: "0.5",
          active: true,
          closed: false,
          endDateIso: "2026-01-15T20:00:00.000Z",
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

describe("Day's Parlay server flows", () => {
  test("creates exactly one Day's Parlay row per UTC day under concurrent lazy creation", async () => {
    const now = new Date("2026-01-15T12:00:00.000Z");

    const results = await Promise.all(
      Array.from({ length: 8 }, () => getOrCreateTodayDaysParlay({ now }))
    );

    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect(
      await prisma.parlay.count({
        where: { kind: "DAYS_PARLAY", dayKey: "2026-01-15" }
      })
    ).toBe(1);
  });

  test("claims a market atomically with the first stake and rejects a second claim of the same market", async () => {
    await seedTodayEvents();

    const [alice, bob] = await Promise.all([
      userRepository.createUser({ username: "alice", passwordHash: "hashed" }),
      userRepository.createUser({ username: "bob", passwordHash: "hashed" })
    ]);

    const [aliceLot, bobLot] = await Promise.all([
      seedPosition({
        userId: alice.id,
        marketGammaId: "market-day-1",
        outcomeIndex: 0,
        shares: "10",
        stake: "6.4",
        entryPrice: "0.64"
      }),
      seedPosition({
        userId: bob.id,
        marketGammaId: "market-day-1",
        outcomeIndex: 0,
        shares: "8",
        stake: "5.12",
        entryPrice: "0.64"
      })
    ]);

    const claim = await claimDaysParlayMarket({
      userId: alice.id,
      marketId: "market-day-1",
      outcomeIndex: 0,
      commitments: [{ positionId: aliceLot.id, shares: "10" }],
      now: new Date("2026-01-15T12:00:00.000Z")
    });

    expect(claim.leg.status).toBe("ACTIVE");

    const leg = await prisma.parlayLeg.findUniqueOrThrow({
      where: { id: claim.leg.id },
      include: { stakes: { include: { sources: true } } }
    });
    expect(leg.claimedByUserId).toBe(alice.id);
    expect(leg.stakes).toHaveLength(1);
    expect(leg.stakes[0]?.sources).toHaveLength(1);

    const lockedPosition = await prisma.position.findUniqueOrThrow({
      where: { id: aliceLot.id }
    });
    expect(lockedPosition.committedShares.toString()).toBe("10");

    await expect(
      claimDaysParlayMarket({
        userId: bob.id,
        marketId: "market-day-1",
        outcomeIndex: 0,
        commitments: [{ positionId: bobLot.id, shares: "5" }],
        now: new Date("2026-01-15T12:05:00.000Z")
      })
    ).rejects.toThrow("MARKET_ALREADY_CLAIMED");
  });

  test("allows backing a pending leg and rejects backing a terminal leg", async () => {
    await seedTodayEvents();

    const [alice, bob, chris] = await Promise.all([
      userRepository.createUser({ username: "alice", passwordHash: "hashed" }),
      userRepository.createUser({ username: "bob", passwordHash: "hashed" }),
      userRepository.createUser({ username: "chris", passwordHash: "hashed" })
    ]);

    const [firstLot, secondLot, backerLot] = await Promise.all([
      seedPosition({
        userId: alice.id,
        marketGammaId: "market-day-1",
        outcomeIndex: 0,
        shares: "10",
        stake: "6.4",
        entryPrice: "0.64"
      }),
      seedPosition({
        userId: bob.id,
        marketGammaId: "market-day-2",
        outcomeIndex: 0,
        shares: "10",
        stake: "5.1",
        entryPrice: "0.51"
      }),
      seedPosition({
        userId: chris.id,
        marketGammaId: "market-day-2",
        outcomeIndex: 0,
        shares: "8",
        stake: "4.08",
        entryPrice: "0.51"
      })
    ]);

    await claimDaysParlayMarket({
      userId: alice.id,
      marketId: "market-day-1",
      outcomeIndex: 0,
      commitments: [{ positionId: firstLot.id, shares: "10" }],
      now: new Date("2026-01-15T12:00:00.000Z")
    });

    const pendingClaim = await claimDaysParlayMarket({
      userId: bob.id,
      marketId: "market-day-2",
      outcomeIndex: 0,
      commitments: [{ positionId: secondLot.id, shares: "10" }],
      now: new Date("2026-01-15T12:01:00.000Z")
    });

    const stake = await stakeDaysParlayLeg({
      legId: pendingClaim.leg.id,
      userId: chris.id,
      commitments: [{ positionId: backerLot.id, shares: "5" }]
    });

    expect(stake.shares).toBe("5");

    const pendingStake = await prisma.legStake.findUniqueOrThrow({
      where: { legId_userId: { legId: pendingClaim.leg.id, userId: chris.id } },
      include: { sources: true }
    });
    expect(pendingStake.status).toBe("PENDING");
    expect(pendingStake.sources).toHaveLength(1);

    const committedBackerLot = await prisma.position.findUniqueOrThrow({
      where: { id: backerLot.id }
    });
    expect(committedBackerLot.committedShares.toString()).toBe("5");

    await prisma.parlayLeg.update({
      where: { id: pendingClaim.leg.id },
      data: { status: "WON" }
    });

    await expect(
      stakeDaysParlayLeg({
        legId: pendingClaim.leg.id,
        userId: chris.id,
        commitments: [{ positionId: backerLot.id, shares: "1" }]
      })
    ).rejects.toThrow("LEG_NOT_STAKEABLE");
  });
});
