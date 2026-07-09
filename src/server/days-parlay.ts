import { Prisma } from "@prisma/client";

import {
  resolvesWithinUtcDay,
  tallyDaysParlayRolloverVotes,
  utcDayBounds,
  utcDayKey
} from "@/domain/days-parlay";
import { getAvailableShares } from "@/domain/positions";
import { assertLegResolvesAfterActiveLeg } from "@/domain/parlays";
import { prisma } from "@/server/db";
import { type MarketCacheRepository, marketCacheRepository } from "@/server/markets";
import { commitPositionLotsToLeg, type ParlayStakeResult } from "@/server/parlays";
import { positionRepository, type PositionRepository } from "@/server/positions";

export type DaysParlayDetail = {
  id: string;
  name: string;
  kind: "DAYS_PARLAY";
  dayKey: string;
  status: string;
  rolloverCount: number;
  legs: DaysParlayDetailLeg[];
  eligibleEvents: DaysParlayEligibleEvent[];
  myVote: { legId: string; marketQuestion: string } | null;
  houseBalance: string;
  myContributedPrincipal: string;
  totalContributedPrincipal: string;
};

export type DaysParlayDetailLeg = {
  id: string;
  outcomeIndex: number;
  status: string;
  claimedBy: { id: string; username: string } | null;
  market: {
    gammaId: string;
    question: string;
    outcomes: string[];
    outcomePrices: string[];
    endDate: string | null;
    lastSyncedAt: string;
    bestBid: string | null;
    bestAsk: string | null;
  };
  stakes: Array<{
    user: { id: string; username: string };
    amount: string;
    shares: string;
    averageEntryPrice: string;
    status: string;
  }>;
  tally: {
    yesCount: number;
    totalBackerCount: number;
  };
  isFinalLeg: boolean;
};

export type DaysParlayEligibleEvent = {
  eventId: string;
  title: string;
  category: string;
  markets: DaysParlayEligibleMarket[];
};

export type DaysParlayEligibleMarket = {
  marketId: string;
  gammaId: string;
  question: string;
  outcomes: string[];
  outcomePrices: string[];
  bestBid: string | null;
  bestAsk: string | null;
  endDate: string | null;
  lastSyncedAt: string;
  claimStatus: "available" | "claimed" | "closed" | "ineligible";
  claimedLegId?: string;
  claimedByUsername?: string | null;
  myAvailableLots: Array<{
    positionId: string;
    outcomeIndex: number;
    outcomeLabel: string;
    availableShares: string;
    entryPrice: string;
    createdAt: string;
  }>;
};

export async function getOrCreateTodayDaysParlay(input: { now: Date }) {
  const dayKey = utcDayKey(input.now);

  try {
    return await prisma.parlay.create({
      data: {
        kind: "DAYS_PARLAY",
        dayKey,
        name: `Day's Parlay ${dayKey}`,
        status: "ACTIVE"
      }
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }

    const existing = await prisma.parlay.findFirst({
      where: { kind: "DAYS_PARLAY", dayKey }
    });
    if (!existing) {
      throw error;
    }
    return existing;
  }
}

export async function getDaysParlayDetail(input: {
  userId: string;
  now: Date;
  marketCache?: MarketCacheRepository;
  positions?: PositionRepository;
}): Promise<DaysParlayDetail> {
  const marketCache = input.marketCache ?? marketCacheRepository;
  const positions = input.positions ?? positionRepository;
  const parlay = await getOrCreateTodayDaysParlay({ now: input.now });

  const detail = await prisma.parlay.findUniqueOrThrow({
    where: { id: parlay.id },
    select: {
      id: true,
      name: true,
      dayKey: true,
      status: true,
      rolloverUsed: true,
      legs: {
        orderBy: [{ resolutionAt: "asc" }, { sortKey: "asc" }],
        select: {
          id: true,
          outcomeIndex: true,
          status: true,
          claimedByUser: { select: { id: true, username: true } },
          market: {
            select: {
              gammaId: true,
              question: true,
              outcomes: true,
              outcomePrices: true,
              endDate: true,
              lastSyncedAt: true,
              bestBid: true,
              bestAsk: true
            }
          },
          stakes: {
            select: {
              amount: true,
              shares: true,
              averageEntryPrice: true,
              status: true,
              user: { select: { id: true, username: true } }
            }
          },
          votes: {
            where: { value: true },
            select: { legId: true, userId: true }
          }
        }
      }
    }
  });

  const [cachedEvents, lots, houseBalance, myContributedPrincipal, totalContributedPrincipal] =
    await Promise.all([
      marketCache.listEventsResolvingOnUtcDay(input.now),
      positions.listLotsByUserId(input.userId),
      prisma.houseTransaction.aggregate({ _sum: { amount: true } }),
      prisma.legStakeSource.aggregate({
        where: {
          stake: {
            userId: input.userId,
            leg: { parlayId: parlay.id }
          }
        },
        _sum: { principal: true }
      }),
      prisma.legStakeSource.aggregate({
        where: {
          stake: {
            leg: { parlayId: parlay.id }
          }
        },
        _sum: { principal: true }
      })
    ]);

  const myVoteSource = detail.legs.find((leg) =>
    leg.votes.some((vote) => vote.userId === input.userId)
  );
  const myVote = myVoteSource
    ? { legId: myVoteSource.id, marketQuestion: myVoteSource.market.question }
    : null;

  const lotsByMarketId = groupAvailableLotsByMarket(lots);
  const claimedMarkets = new Map(
    detail.legs.map((leg) => [
      leg.market.gammaId,
      {
        legId: leg.id,
        claimedByUsername: leg.claimedByUser?.username ?? null
      }
    ])
  );

  return {
    id: detail.id,
    name: detail.name,
    kind: "DAYS_PARLAY",
    dayKey: detail.dayKey ?? utcDayKey(input.now),
    status: detail.status,
    rolloverCount: detail.rolloverUsed,
    legs: detail.legs.map((leg, index) => ({
      id: leg.id,
      outcomeIndex: leg.outcomeIndex,
      status: leg.status,
      claimedBy: leg.claimedByUser,
      market: {
        gammaId: leg.market.gammaId,
        question: leg.market.question,
        outcomes: leg.market.outcomes as string[],
        outcomePrices: leg.market.outcomePrices as string[],
        endDate: leg.market.endDate?.toISOString() ?? null,
        lastSyncedAt: leg.market.lastSyncedAt.toISOString(),
        bestBid: leg.market.bestBid?.toString() ?? null,
        bestAsk: leg.market.bestAsk?.toString() ?? null
      },
      stakes: leg.stakes.map((stake) => ({
        user: stake.user,
        amount: stake.amount.toString(),
        shares: stake.shares.toString(),
        averageEntryPrice: stake.averageEntryPrice.toString(),
        status: stake.status
      })),
      tally: tallyDaysParlayRolloverVotes({
        id: leg.id,
        marketId: leg.market.gammaId,
        gammaId: leg.market.gammaId,
        resolvesAt: leg.market.endDate ?? new Date(0),
        stakes: leg.stakes.map((stake) => ({
          userId: stake.user.id,
          amount: Number(stake.amount.toString()),
          freshPrincipal: 0
        })),
        votes: leg.votes
      }),
      isFinalLeg: index === detail.legs.length - 1
    })),
    eligibleEvents: cachedEvents.map((event) => ({
      eventId: event.gammaId,
      title: event.title,
      category: event.category,
      markets: event.markets.map((market) => {
        const claimed = claimedMarkets.get(market.gammaId);
        const claimStatus = claimed
          ? "claimed"
          : market.closed
            ? "closed"
            : !market.active
              ? "ineligible"
              : "available";

        return {
          marketId: market.gammaId,
          gammaId: market.gammaId,
          question: market.question,
          outcomes: market.outcomes,
          outcomePrices: market.outcomePrices,
          bestBid: market.bestBid,
          bestAsk: market.bestAsk,
          endDate: market.endDate,
          lastSyncedAt: market.lastSyncedAt,
          claimStatus,
          ...(claimed
            ? {
                claimedLegId: claimed.legId,
                claimedByUsername: claimed.claimedByUsername
              }
            : {}),
          myAvailableLots: lotsByMarketId.get(market.gammaId) ?? []
        };
      })
    })),
    myVote,
    houseBalance: houseBalance._sum.amount?.toString() ?? "0",
    myContributedPrincipal: myContributedPrincipal._sum.principal?.toString() ?? "0",
    totalContributedPrincipal: totalContributedPrincipal._sum.principal?.toString() ?? "0"
  };
}

export async function claimDaysParlayMarket(input: {
  userId: string;
  marketId: string;
  outcomeIndex: number;
  commitments: Array<{ positionId: string; shares: string }>;
  now: Date;
  positions?: PositionRepository;
}): Promise<{ leg: { id: string; status: string }; parlay: { id: string; status: string } }> {
  const positions = input.positions ?? positionRepository;

  if (input.commitments.length === 0) {
    throw new Error("NO_COMMITMENTS");
  }

  const parlay = await getOrCreateTodayDaysParlay({ now: input.now });

  try {
    return await prisma.$transaction(async (tx) => {
      const currentParlay = await tx.parlay.findUniqueOrThrow({
        where: { id: parlay.id },
        select: {
          id: true,
          status: true,
          legs: {
            where: { status: "ACTIVE" },
            select: {
              resolutionAt: true,
              market: { select: { endDate: true } }
            }
          }
        }
      });

      if (currentParlay.status !== "ACTIVE") {
        throw new Error("PARLAY_NOT_ACTIVE");
      }

      const market = await tx.cachedMarket.findUnique({
        where: { gammaId: input.marketId },
        select: { id: true, gammaId: true, endDate: true, active: true, closed: true }
      });
      if (!market) {
        throw new Error("MARKET_NOT_FOUND");
      }
      if (market.closed) {
        throw new Error("MARKET_CLOSED");
      }
      if (!market.active) {
        throw new Error("MARKET_INACTIVE");
      }
      if (!market.endDate || !resolvesWithinUtcDay(market.endDate, input.now)) {
        throw new Error("MARKET_OUTSIDE_DAY");
      }

      const existingLeg = await tx.parlayLeg.findFirst({
        where: {
          parlayId: currentParlay.id,
          marketId: market.id
        },
        select: { id: true }
      });
      if (existingLeg) {
        throw new Error("MARKET_ALREADY_CLAIMED");
      }

      const isFirstClaim = currentParlay.legs.length === 0;
      const legStatus = isFirstClaim ? "ACTIVE" : "PENDING";

      if (!isFirstClaim) {
        const activeLeg = currentParlay.legs[0];
        if (!activeLeg) {
          throw new Error("ACTIVE_LEG_REQUIRED");
        }

        assertLegResolvesAfterActiveLeg(
          activeLeg.market.endDate ?? activeLeg.resolutionAt,
          market.endDate
        );
      }

      const leg = await tx.parlayLeg.create({
        data: {
          parlayId: currentParlay.id,
          marketId: market.id,
          claimedByUserId: input.userId,
          outcomeIndex: input.outcomeIndex,
          resolutionAt: market.endDate,
          sortKey: `${market.endDate.toISOString()}|${market.gammaId}`,
          status: legStatus
        }
      });

      await commitPositionLotsToLeg(tx, {
        legId: leg.id,
        userId: input.userId,
        marketId: input.marketId,
        outcomeIndex: input.outcomeIndex,
        commitments: input.commitments,
        stakeStatus: legStatus,
        positions
      });

      return {
        leg: { id: leg.id, status: legStatus },
        parlay: { id: currentParlay.id, status: currentParlay.status }
      };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("MARKET_ALREADY_CLAIMED");
    }

    throw error;
  }
}

export async function stakeDaysParlayLeg(input: {
  legId: string;
  userId: string;
  commitments: Array<{ positionId: string; shares: string }>;
  positions?: PositionRepository;
}): Promise<ParlayStakeResult> {
  const positions = input.positions ?? positionRepository;

  if (input.commitments.length === 0) {
    throw new Error("NO_COMMITMENTS");
  }

  return prisma.$transaction(async (tx) => {
    const leg = await tx.parlayLeg.findFirst({
      where: {
        id: input.legId,
        parlay: { kind: "DAYS_PARLAY" }
      },
      select: {
        id: true,
        status: true,
        outcomeIndex: true,
        market: { select: { gammaId: true } }
      }
    });

    if (!leg) {
      throw new Error("LEG_NOT_FOUND");
    }
    if (leg.status !== "ACTIVE" && leg.status !== "PENDING") {
      throw new Error("LEG_NOT_STAKEABLE");
    }

    return commitPositionLotsToLeg(tx, {
      legId: leg.id,
      userId: input.userId,
      marketId: leg.market.gammaId,
      outcomeIndex: leg.outcomeIndex,
      commitments: input.commitments,
      stakeStatus: leg.status,
      positions
    });
  });
}

function groupAvailableLotsByMarket(
  lots: Awaited<ReturnType<PositionRepository["listLotsByUserId"]>>
) {
  const lotsByMarket = new Map<string, DaysParlayEligibleMarket["myAvailableLots"]>();

  for (const lot of lots) {
    if (lot.status !== "OPEN") {
      continue;
    }

    const availableShares = getAvailableShares({
      shares: lot.shares,
      committedShares: lot.committedShares
    });
    if (availableShares === "0") {
      continue;
    }

    const marketLots = lotsByMarket.get(lot.marketId) ?? [];
    marketLots.push({
      positionId: lot.id,
      outcomeIndex: lot.outcomeIndex,
      outcomeLabel: lot.outcomeLabel,
      availableShares,
      entryPrice: lot.entryPrice,
      createdAt: lot.purchasedAt
    });
    lotsByMarket.set(lot.marketId, marketLots);
  }

  return lotsByMarket;
}

export function filterEligibleEventsForUtcDay(
  events: Array<{
    gammaId: string;
    title: string;
    category: string;
    markets: Array<{
      gammaId: string;
      endDate: string | null;
    }>;
  }>,
  day: Date
) {
  const { start, end } = utcDayBounds(day);

  return events
    .map((event) => ({
      ...event,
      markets: event.markets.filter((market) => {
        if (!market.endDate) {
          return false;
        }

        const endDate = new Date(market.endDate).getTime();
        return endDate >= start.getTime() && endDate < end.getTime();
      })
    }))
    .filter((event) => event.markets.length > 0);
}
