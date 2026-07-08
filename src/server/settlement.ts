import {
  addDecimalStrings,
  divideDecimalStrings,
  multiplyDecimalStrings,
  subtractDecimalStrings
} from "@/domain/positions";
import {
  calculatePositionSettlement,
  detectMarketResolution,
  getUtcGrantDay
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

export async function collectOpenPositionMarketIds(): Promise<string[]> {
  const rows = await prisma.position.findMany({
    where: { status: "OPEN" },
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
  const refreshedMarkets: Awaited<ReturnType<typeof marketCacheRepository.findMarketByGammaId>>[] = [];
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

export async function runSettlementSweep(input: {
  now: Date;
  gammaClient?: GammaClient;
}): Promise<{
  marketIds: string[];
  skippedMarketIds: string[];
  settledPositions: number;
}> {
  const marketIds = await collectOpenPositionMarketIds();
  const { refreshedMarkets, skippedMarketIds } = await refreshOpenPositionMarkets({
    marketIds,
    now: input.now,
    gammaClient: input.gammaClient
  });

  let settledPositions = 0;

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
  }

  return { marketIds, skippedMarketIds, settledPositions };
}

export async function grantDailyBankruptcyStipends(input: {
  now: Date;
}): Promise<{
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
