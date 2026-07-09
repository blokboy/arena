import {
  addDecimalStrings,
  divideDecimalStrings,
  multiplyDecimalStrings,
  subtractDecimalStrings
} from "@/domain/positions";
import {
  calculateParlayLegStakeSettlement,
  calculatePositionSettlement,
  detectMarketResolution,
  getUtcGrantDay,
  type MarketResolution
} from "@/domain/settlement";
import { BANKRUPTCY_STIPEND } from "@/lib/money";
import { prisma } from "@/server/db";
import { GammaRateLimitError, type GammaClient } from "@/server/gamma-client";
import { marketCacheRepository, refreshMarketIfStale } from "@/server/markets";

type OpenPositionRow = {
  id: string;
  userId: string;
  marketId: string;
  outcomeIndex: number;
  entryPrice: { toString(): string };
  stake: { toString(): string };
  shares: { toString(): string };
  committedShares: { toString(): string };
  createdAt: Date;
  updatedAt: Date;
};

function calculatePrincipalForShares(input: {
  stake: string;
  shares: string;
  settledShares: string;
}): string {
  const principalPerShare = divideDecimalStrings(input.stake, input.shares);
  return multiplyDecimalStrings(input.settledShares, principalPerShare);
}

function calculateRealizedPoints(payout: string, principal: string): string {
  try {
    return subtractDecimalStrings(payout, principal);
  } catch {
    return `-${subtractDecimalStrings(principal, payout)}`;
  }
}

async function applyPositionSettlement(input: {
  row: OpenPositionRow;
  marketResolution: ReturnType<typeof detectMarketResolution>;
  now: Date;
}): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.position.findUnique({
      where: { id: input.row.id },
      select: {
        id: true,
        userId: true,
        marketId: true,
        outcomeIndex: true,
        entryPrice: true,
        stake: true,
        shares: true,
        committedShares: true,
        status: true,
        createdAt: true
      }
    });

    if (!current || current.status !== "OPEN") {
      return false;
    }

    const stake = current.stake.toString();
    const shares = current.shares.toString();
    const committedShares = current.committedShares.toString();
    const settlement = calculatePositionSettlement({
      outcomeIndex: current.outcomeIndex,
      stake,
      shares,
      committedShares,
      resolution: input.marketResolution
    });

    if (settlement.status === "OPEN" || settlement.settledShares === "0") {
      return false;
    }

    const settledPrincipal = calculatePrincipalForShares({
      stake,
      shares,
      settledShares: settlement.settledShares
    });
    const realizedPoints = calculateRealizedPoints(settlement.payout, settledPrincipal);
    const remainingShares = committedShares;
    const partialSettlement = remainingShares !== "0";
    const remainingStake = partialSettlement
      ? subtractDecimalStrings(stake, settledPrincipal)
      : "0";
    const terminalStatus = settlement.status;
    const terminalExitPrice =
      terminalStatus === "WON" ? "1" : terminalStatus === "LOST" ? "0" : undefined;

    const guardedWhere = {
      id: current.id,
      status: "OPEN" as const,
      shares,
      committedShares,
      stake
    };

    if (partialSettlement) {
      const updated = await tx.position.updateMany({
        where: guardedWhere,
        data: {
          shares: remainingShares,
          committedShares: remainingShares,
          stake: remainingStake
        }
      });
      if (updated.count === 0) {
        return false;
      }

      await tx.position.create({
        data: {
          userId: current.userId,
          marketId: current.marketId,
          outcomeIndex: current.outcomeIndex,
          entryPrice: current.entryPrice,
          stake: settledPrincipal,
          shares: settlement.settledShares,
          committedShares: "0",
          status: terminalStatus,
          realizedPoints,
          ...(terminalExitPrice ? { exitPrice: terminalExitPrice } : {}),
          exitedAt: input.now,
          createdAt: current.createdAt
        }
      });
    } else {
      const updated = await tx.position.updateMany({
        where: guardedWhere,
        data: {
          status: terminalStatus,
          realizedPoints,
          ...(terminalExitPrice ? { exitPrice: terminalExitPrice } : {}),
          exitedAt: input.now
        }
      });
      if (updated.count === 0) {
        return false;
      }
    }

    if (settlement.payout !== "0") {
      await tx.user.update({
        where: { id: current.userId },
        data: { balance: { increment: settlement.payout } }
      });
    }

    return true;
  });
}

export async function settleActiveParlayLeg(input: {
  legId: string;
  resolution: MarketResolution;
}): Promise<{ settledStakes: number }> {
  return prisma.$transaction(async (tx) => {
    const leg = await tx.parlayLeg.findUnique({
      where: { id: input.legId },
      select: {
        id: true,
        parlayId: true,
        outcomeIndex: true,
        status: true,
        sortKey: true,
        stakes: {
          where: { status: "ACTIVE" },
          select: { id: true, userId: true, amount: true, shares: true }
        }
      }
    });

    if (!leg || leg.status !== "ACTIVE") {
      return { settledStakes: 0 };
    }

    const nextLeg = await tx.parlayLeg.findFirst({
      where: { parlayId: leg.parlayId, sortKey: { gt: leg.sortKey } },
      orderBy: { sortKey: "asc" },
      select: {
        id: true,
        market: { select: { bestAsk: true } },
        stakes: { select: { id: true, userId: true, amount: true, shares: true } }
      }
    });
    const isFinalLeg = !nextLeg;

    let settledStakes = 0;
    let forwardedToNextLeg = false;
    let legLost = false;
    let legVoided = false;

    const forwardStakeIntoNextLeg = async (input: { userId: string; forwardPrincipal: string }) => {
      const nextBestAsk = nextLeg!.market.bestAsk?.toString();
      if (!nextBestAsk) {
        throw new Error("NEXT_LEG_MARKET_MISSING_BEST_ASK");
      }
      const forwardShares = divideDecimalStrings(input.forwardPrincipal, nextBestAsk);
      const existingNextStake = nextLeg!.stakes.find((s) => s.userId === input.userId);
      const newAmount = addDecimalStrings(
        existingNextStake?.amount.toString() ?? "0",
        input.forwardPrincipal
      );
      const newShares = addDecimalStrings(existingNextStake?.shares.toString() ?? "0", forwardShares);
      const newAveragePrice = divideDecimalStrings(newAmount, newShares);

      if (existingNextStake) {
        await tx.legStake.update({
          where: { id: existingNextStake.id },
          data: {
            amount: newAmount,
            shares: newShares,
            averageEntryPrice: newAveragePrice,
            status: "ACTIVE",
            rolledForwardFromLegId: leg.id
          }
        });
      } else {
        await tx.legStake.create({
          data: {
            legId: nextLeg!.id,
            userId: input.userId,
            shares: newShares,
            committedPrincipal: "0",
            amount: newAmount,
            averageEntryPrice: newAveragePrice,
            status: "ACTIVE",
            rolledForwardFromLegId: leg.id
          }
        });
      }

      forwardedToNextLeg = true;
    };

    // A stake's shares always trace back to one or more Position rows via
    // LegStakeSource (issue #9). Once a stake reaches a terminal status,
    // those source positions are done contributing to the parlay — but a
    // position can source more than one stake (partial commits across legs
    // or parlays), so it's only "settled" once every stake it ever fed is
    // itself terminal.
    const markSourcePositionsSettledIfTerminal = async (stakeId: string) => {
      const sources = await tx.legStakeSource.findMany({
        where: { stakeId },
        select: { positionId: true }
      });

      for (const positionId of new Set(sources.map((s) => s.positionId))) {
        const allSourcedStakes = await tx.legStakeSource.findMany({
          where: { positionId },
          select: { stake: { select: { status: true } } }
        });
        const allTerminal = allSourcedStakes.every(
          (source) => source.stake.status !== "PENDING" && source.stake.status !== "ACTIVE"
        );

        if (allTerminal) {
          await tx.position.updateMany({
            where: { id: positionId, committedSettled: false },
            data: { committedSettled: true }
          });
        }
      }
    };

    for (const stake of leg.stakes) {
      const settlement = calculateParlayLegStakeSettlement({
        outcomeIndex: leg.outcomeIndex,
        isFinalLeg,
        stakeAmount: stake.amount.toString(),
        stakeShares: stake.shares.toString(),
        resolution: input.resolution
      });

      if (settlement.status === "WON" && isFinalLeg) {
        const updated = await tx.legStake.updateMany({
          where: { id: stake.id, status: "ACTIVE" },
          data: { status: "WON", payout: settlement.payout }
        });
        if (updated.count === 0) {
          continue;
        }

        await tx.user.update({
          where: { id: stake.userId },
          data: { balance: { increment: settlement.payout } }
        });
        await markSourcePositionsSettledIfTerminal(stake.id);
        settledStakes += 1;
        continue;
      }

      if (settlement.status === "WON" && !isFinalLeg) {
        const updated = await tx.legStake.updateMany({
          where: { id: stake.id, status: "ACTIVE" },
          data: { status: "WON", payout: "0" }
        });
        if (updated.count === 0) {
          continue;
        }

        await forwardStakeIntoNextLeg({ userId: stake.userId, forwardPrincipal: settlement.forwardPrincipal! });
        await markSourcePositionsSettledIfTerminal(stake.id);
        settledStakes += 1;
        continue;
      }

      if (settlement.status === "VOIDED" && isFinalLeg) {
        const updated = await tx.legStake.updateMany({
          where: { id: stake.id, status: "ACTIVE" },
          data: { status: "VOIDED_REFUNDED", payout: settlement.payout }
        });
        if (updated.count === 0) {
          continue;
        }

        await tx.user.update({
          where: { id: stake.userId },
          data: { balance: { increment: settlement.payout } }
        });
        await markSourcePositionsSettledIfTerminal(stake.id);
        legVoided = true;
        settledStakes += 1;
        continue;
      }

      if (settlement.status === "VOIDED" && !isFinalLeg) {
        const updated = await tx.legStake.updateMany({
          where: { id: stake.id, status: "ACTIVE" },
          data: { status: "VOIDED_REFUNDED", payout: "0" }
        });
        if (updated.count === 0) {
          continue;
        }

        await forwardStakeIntoNextLeg({ userId: stake.userId, forwardPrincipal: settlement.forwardPrincipal! });
        await markSourcePositionsSettledIfTerminal(stake.id);
        legVoided = true;
        settledStakes += 1;
        continue;
      }

      if (settlement.status === "LOST") {
        const updated = await tx.legStake.updateMany({
          where: { id: stake.id, status: "ACTIVE" },
          data: { status: "LOST", payout: "0" }
        });
        if (updated.count === 0) {
          continue;
        }

        await tx.houseTransaction.create({
          data: {
            amount: settlement.houseAmount,
            reason: "PARLAY_LEG_LOSS",
            parlayId: leg.parlayId,
            legId: leg.id
          }
        });
        await markSourcePositionsSettledIfTerminal(stake.id);
        legLost = true;
        settledStakes += 1;
      }
    }

    if (leg.stakes.length > 0 && settledStakes === leg.stakes.length) {
      if (legLost) {
        await tx.parlayLeg.updateMany({
          where: { id: leg.id, status: "ACTIVE" },
          data: { status: "LOST" }
        });
        await tx.parlay.updateMany({
          where: { id: leg.parlayId, status: "ACTIVE" },
          data: { status: "LOST" }
        });

        const trailingPendingLegs = await tx.parlayLeg.findMany({
          where: { parlayId: leg.parlayId, status: "PENDING", sortKey: { gt: leg.sortKey } },
          select: {
            id: true,
            stakes: { where: { status: "PENDING" }, select: { id: true, amount: true } }
          }
        });

        for (const trailingLeg of trailingPendingLegs) {
          for (const trailingStake of trailingLeg.stakes) {
            const trailingUpdated = await tx.legStake.updateMany({
              where: { id: trailingStake.id, status: "PENDING" },
              data: { status: "LOST", payout: "0" }
            });
            if (trailingUpdated.count === 0) {
              continue;
            }

            await tx.houseTransaction.create({
              data: {
                amount: trailingStake.amount,
                reason: "PARLAY_LEG_LOSS",
                parlayId: leg.parlayId,
                legId: trailingLeg.id
              }
            });
            await markSourcePositionsSettledIfTerminal(trailingStake.id);
          }

          await tx.parlayLeg.updateMany({
            where: { id: trailingLeg.id, status: "PENDING" },
            data: { status: "LOST" }
          });
        }
      } else if (legVoided) {
        await tx.parlayLeg.updateMany({
          where: { id: leg.id, status: "ACTIVE" },
          data: { status: "VOIDED" }
        });

        if (isFinalLeg) {
          await tx.parlay.updateMany({
            where: { id: leg.parlayId, status: "ACTIVE" },
            data: { status: "VOIDED" }
          });
        } else if (forwardedToNextLeg) {
          await tx.parlayLeg.updateMany({
            where: { id: nextLeg!.id, status: "PENDING" },
            data: { status: "ACTIVE" }
          });
        }
      } else {
        await tx.parlayLeg.updateMany({
          where: { id: leg.id, status: "ACTIVE" },
          data: { status: "WON" }
        });

        if (isFinalLeg) {
          await tx.parlay.updateMany({
            where: { id: leg.parlayId, status: "ACTIVE" },
            data: { status: "WON" }
          });
        } else if (forwardedToNextLeg) {
          await tx.parlayLeg.updateMany({
            where: { id: nextLeg!.id, status: "PENDING" },
            data: { status: "ACTIVE" }
          });
        }
      }
    }

    return { settledStakes };
  });
}

export async function collectOpenPositionMarketIds(): Promise<string[]> {
  const rows = await prisma.position.findMany({
    where: { status: "OPEN" },
    select: { market: { select: { gammaId: true } } }
  });

  return [...new Set(rows.map((row) => row.market.gammaId))].sort();
}

export async function collectActiveParlayLegMarketIds(): Promise<string[]> {
  const rows = await prisma.parlayLeg.findMany({
    where: { status: "ACTIVE", parlay: { kind: "REGULAR" } },
    select: { market: { select: { gammaId: true } } }
  });

  return [...new Set(rows.map((row) => row.market.gammaId))].sort();
}

export async function refreshOpenPositionMarkets(input: {
  marketIds: readonly string[];
  now: Date;
  gammaClient?: GammaClient;
}): Promise<{
  refreshedMarkets: Awaited<ReturnType<typeof marketCacheRepository.findMarketByGammaId>>[];
  skippedMarketIds: string[];
}> {
  const refreshedMarkets: Awaited<ReturnType<typeof marketCacheRepository.findMarketByGammaId>>[] =
    [];
  const skippedMarketIds: string[] = [];

  for (const marketId of input.marketIds) {
    const cached = await marketCacheRepository.findMarketByGammaId(marketId);
    if (!cached) {
      continue;
    }

    try {
      refreshedMarkets.push(
        await refreshMarketIfStale({
          market: cached,
          now: input.now,
          gammaClient: input.gammaClient,
          repository: marketCacheRepository,
          force: true,
          throwOnError: true,
          purpose: "settlement"
        })
      );
    } catch (error) {
      if (error instanceof GammaRateLimitError) {
        skippedMarketIds.push(marketId);
        continue;
      }

      throw error;
    }
  }

  return { refreshedMarkets, skippedMarketIds };
}

export async function runSettlementSweep(input: { now: Date; gammaClient?: GammaClient }): Promise<{
  marketIds: string[];
  skippedMarketIds: string[];
  settledPositions: number;
  settledParlayLegStakes: number;
}> {
  const positionMarketIds = await collectOpenPositionMarketIds();
  const parlayLegMarketIds = await collectActiveParlayLegMarketIds();
  const marketIds = [...new Set([...positionMarketIds, ...parlayLegMarketIds])].sort();

  const { refreshedMarkets, skippedMarketIds } = await refreshOpenPositionMarkets({
    marketIds,
    now: input.now,
    gammaClient: input.gammaClient
  });

  let settledPositions = 0;
  let settledParlayLegStakes = 0;

  for (const market of refreshedMarkets) {
    if (!market) {
      continue;
    }

    const resolution = detectMarketResolution(market);
    if (resolution.status === "OPEN") {
      continue;
    }

    const rows = await prisma.position.findMany({
      where: { status: "OPEN", market: { gammaId: market.gammaId } },
      select: {
        id: true,
        userId: true,
        marketId: true,
        outcomeIndex: true,
        entryPrice: true,
        stake: true,
        shares: true,
        committedShares: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: "asc" }
    });

    for (const row of rows) {
      if (
        await applyPositionSettlement({
          row,
          marketResolution: resolution,
          now: input.now
        })
      ) {
        settledPositions += 1;
      }
    }

    const activeLegs = await prisma.parlayLeg.findMany({
      where: { status: "ACTIVE", parlay: { kind: "REGULAR" }, market: { gammaId: market.gammaId } },
      select: { id: true }
    });

    for (const leg of activeLegs) {
      const result = await settleActiveParlayLeg({ legId: leg.id, resolution });
      settledParlayLegStakes += result.settledStakes;
    }
  }

  return { marketIds, skippedMarketIds, settledPositions, settledParlayLegStakes };
}

export async function grantDailyBankruptcyStipends(input: { now: Date }): Promise<{
  dayKey: string;
  grantedUserIds: string[];
}> {
  const dayKey = getUtcGrantDay(input.now);
  const candidates = await prisma.user.findMany({
    where: { balance: { lte: 0 } },
    select: { id: true }
  });
  const grantedUserIds: string[] = [];

  for (const user of candidates) {
    try {
      const granted = await prisma.$transaction(async (tx) => {
        await tx.bankruptcyStipendGrant.create({
          data: {
            userId: user.id,
            dayKey,
            amount: String(BANKRUPTCY_STIPEND)
          }
        });

        const update = await tx.user.updateMany({
          where: { id: user.id, balance: { lte: 0 } },
          data: { balance: { increment: BANKRUPTCY_STIPEND } }
        });

        if (update.count === 0) {
          throw new Error("USER_NOT_ELIGIBLE_FOR_STIPEND");
        }

        return true;
      });

      if (granted) {
        grantedUserIds.push(user.id);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        ((error as { code?: string }).code === "P2002" ||
          error.message === "USER_NOT_ELIGIBLE_FOR_STIPEND")
      ) {
        continue;
      }

      throw error;
    }
  }

  return { dayKey, grantedUserIds };
}
