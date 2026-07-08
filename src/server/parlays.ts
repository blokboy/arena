import {
  type Commitment,
  computeCommittedPrincipal,
  sumCommitDecimals
} from "@/domain/parlays";
import { prisma, shouldUseRealDatabase } from "@/server/db";
import { marketCacheRepository, type MarketCacheRepository } from "@/server/markets";
import { positionRepository, type PositionRepository } from "@/server/positions";
import { userRepository } from "@/server/users";

export type ParlayDraftResult = {
  id: string;
  name: string;
  kind: "REGULAR";
  status: "DRAFT";
  memberIds: string[];
};

export type ParlayLegResult = {
  legId: string;
  parlayStatus: string;
  legStatus: string;
};

export type RandomParlaySummary = {
  id: string;
  name: string;
  kind: "REGULAR";
  rosterSize: number;
  chainLength: number;
  currentActiveLeg: {
    legId: string;
    marketQuestion: string;
    endDate: string;
    status: string;
  } | null;
};

let configuredRandom = () => Math.random();

export async function listRandomParlays(limit: number): Promise<RandomParlaySummary[]> {
  const rows = await prisma.parlay.findMany({
    where: {
      kind: "REGULAR",
      status: "ACTIVE",
      legs: { some: {} }
    },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          members: true,
          legs: true
        }
      },
      legs: {
        select: {
          id: true,
          status: true,
          resolutionAt: true,
          market: {
            select: {
              question: true,
              endDate: true,
              gammaId: true
            }
          }
        },
        orderBy: [{ resolutionAt: "asc" }, { sortKey: "asc" }]
      }
    }
  });

  return shuffle(rows)
    .slice(0, limit)
    .map((row) => {
      const activeLeg = row.legs.find((leg) => leg.status === "ACTIVE") ?? row.legs[0] ?? null;

      return {
        id: row.id,
        name: row.name,
        kind: "REGULAR",
        rosterSize: row._count.members,
        chainLength: row._count.legs,
        currentActiveLeg: activeLeg
          ? {
              legId: activeLeg.id,
              marketQuestion: activeLeg.market.question,
              endDate: (activeLeg.market.endDate ?? activeLeg.resolutionAt).toISOString(),
              status: activeLeg.status
            }
          : null
      };
    });
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(configuredRandom() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex] as T, copy[index] as T];
  }

  return copy;
}

export function setParlayRandomForTesting(random: () => number): void {
  configuredRandom = random;
}

export function resetParlayRandomForTesting(): void {
  configuredRandom = () => Math.random();
}

export type UserParlaySummary = {
  id: string;
  name: string;
  kind: "REGULAR";
  status: string;
  rosterSize: number;
  chainLength: number;
  currentActiveLeg: {
    legId: string;
    marketQuestion: string;
    endDate: string;
    status: string;
  } | null;
};

export async function listParlaysForUser(userId: string): Promise<UserParlaySummary[]> {
  if (!shouldUseRealDatabase()) {
    return [];
  }

  const rows = await prisma.parlay.findMany({
    where: {
      kind: "REGULAR",
      status: { not: "DRAFT" },
      OR: [
        { creatorId: userId },
        { members: { some: { userId } } },
        { legs: { some: { stakes: { some: { userId } } } } }
      ]
    },
    select: {
      id: true,
      name: true,
      status: true,
      _count: {
        select: {
          members: true,
          legs: true
        }
      },
      legs: {
        select: {
          id: true,
          status: true,
          resolutionAt: true,
          market: {
            select: {
              question: true,
              endDate: true,
              gammaId: true
            }
          }
        },
        orderBy: [{ resolutionAt: "asc" }, { sortKey: "asc" }]
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return rows.map((row) => {
    const activeLeg = row.legs.find((leg) => leg.status === "ACTIVE") ?? row.legs[0] ?? null;

    return {
      id: row.id,
      name: row.name,
      kind: "REGULAR",
      status: row.status,
      rosterSize: row._count.members,
      chainLength: row._count.legs,
      currentActiveLeg: activeLeg
        ? {
            legId: activeLeg.id,
            marketQuestion: activeLeg.market.question,
            endDate: (activeLeg.market.endDate ?? activeLeg.resolutionAt).toISOString(),
            status: activeLeg.status
          }
        : null
    };
  });
}

export async function createDraftParlay(input: {
  name: string;
  creatorId: string;
  inviteUserIds: string[];
}): Promise<ParlayDraftResult> {
  const memberIds = [...new Set([input.creatorId, ...input.inviteUserIds])];

  if (!shouldUseRealDatabase()) {
    return {
      id: `parlay_${Date.now()}`,
      name: input.name,
      kind: "REGULAR",
      status: "DRAFT",
      memberIds
    };
  }

  for (const userId of input.inviteUserIds) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("INVITEE_NOT_FOUND");
    }
  }

  return prisma.$transaction(async (tx) => {
    const parlay = await tx.parlay.create({
      data: { kind: "REGULAR", name: input.name, creatorId: input.creatorId, status: "DRAFT" }
    });

    await tx.parlayMember.createMany({
      data: memberIds.map((userId) => ({ parlayId: parlay.id, userId }))
    });

    return {
      id: parlay.id,
      name: parlay.name,
      kind: "REGULAR",
      status: "DRAFT",
      memberIds
    };
  });
}

export async function addFirstParlayLeg(input: {
  parlayId: string;
  userId: string;
  marketId: string;
  outcomeIndex: number;
  commitments: Commitment[];
  now: Date;
  positions?: PositionRepository;
  marketCache?: MarketCacheRepository;
}): Promise<ParlayLegResult> {
  const positions = input.positions ?? positionRepository;
  const marketCache = input.marketCache ?? marketCacheRepository;

  if (!shouldUseRealDatabase()) {
    return {
      legId: `leg_${Date.now()}`,
      parlayStatus: "ACTIVE",
      legStatus: "ACTIVE"
    };
  }

  return prisma.$transaction(async (tx) => {
    const parlay = await tx.parlay.findUnique({
      where: { id: input.parlayId },
      select: { id: true, status: true, kind: true, members: { select: { userId: true } } }
    });
    if (!parlay) {
      throw new Error("PARLAY_NOT_FOUND");
    }
    if (parlay.status !== "DRAFT") {
      throw new Error("PARLAY_NOT_DRAFT");
    }
    const memberUserIds = new Set(parlay.members.map((m) => m.userId));
    if (!memberUserIds.has(input.userId)) {
      throw new Error("NOT_A_MEMBER");
    }

    if (input.commitments.length === 0) {
      throw new Error("NO_COMMITMENTS");
    }

    const marketRow = await tx.cachedMarket.findUnique({
      where: { gammaId: input.marketId },
      select: { id: true, endDate: true, gammaId: true }
    });
    if (!marketRow) {
      throw new Error("MARKET_NOT_FOUND");
    }
    if (!marketRow.endDate) {
      throw new Error("MARKET_END_DATE_MISSING");
    }
    const marketEndDate = new Date(marketRow.endDate);
    const marketGammaId = marketRow.gammaId;

    const allLots = await positions.listLotsByUserId(input.userId);
    const openLots = allLots.filter((lot) => lot.status === "OPEN");

    const lotMap = new Map(openLots.map((l) => [l.id, l]));
    for (const commit of input.commitments) {
      const lot = lotMap.get(commit.positionId);
      if (!lot) {
        throw new Error("COMMITMENT_POSITION_NOT_FOUND");
      }

      if (lot.marketId !== input.marketId || lot.outcomeIndex !== input.outcomeIndex) {
        throw new Error("COMMITMENT_MARKET_MISMATCH");
      }

      const requested = parseCommitDecimal(commit.shares);
      const positionShares = parseCommitDecimal(lot.shares);
      const committed = parseCommitDecimal(lot.committedShares);
      const availableShares = {
        value: positionShares.value - committed.value,
        scale: positionShares.scale
      };
      if (requested.value <= 0n || requested.value > availableShares.value) {
        throw new Error("COMMITMENT_EXCEEDS_AVAILABLE_SHARES");
      }
    }

    for (const commit of input.commitments) {
      const lot = lotMap.get(commit.positionId)!;

      const updated = await tx.position.updateMany({
        where: {
          id: commit.positionId,
          userId: input.userId,
          status: "OPEN",
          shares: lot.shares,
          committedShares: lot.committedShares
        },
        data: {
          committedShares: {
            increment: commit.shares
          }
        }
      });
      if (updated.count === 0) {
        throw new Error("POSITION_CONFLICT");
      }
    }

    const newLeg = await tx.parlayLeg.create({
      data: {
        parlayId: input.parlayId,
        marketId: marketRow.id,
        outcomeIndex: input.outcomeIndex,
        resolutionAt: marketEndDate,
        sortKey: `${marketEndDate.toISOString()}|${marketGammaId}`,
        status: "ACTIVE"
      }
    });

    const totalShares = sumCommitDecimals(input.commitments.map((c) => c.shares));
    const principals: string[] = [];
    for (const commit of input.commitments) {
      const lot = lotMap.get(commit.positionId)!;
      const principal = computeCommittedPrincipal({
        commitment: commit,
        position: {
          id: lot.id,
          userId: lot.userId,
          marketId: lot.marketId,
          outcomeIndex: lot.outcomeIndex,
          shares: lot.shares,
          committedShares: lot.committedShares,
          stake: lot.stake,
          status: lot.status
        }
      });
      principals.push(principal);
    }

    const totalPrincipal = sumCommitDecimals(principals);

    const stake = await tx.legStake.create({
      data: {
        legId: newLeg.id,
        userId: input.userId,
        shares: totalShares,
        committedPrincipal: totalPrincipal
      }
    });

    for (const commit of input.commitments) {
      const lot = lotMap.get(commit.positionId)!;
      const principal = computeCommittedPrincipal({
        commitment: commit,
        position: {
          id: lot.id,
          userId: lot.userId,
          marketId: lot.marketId,
          outcomeIndex: lot.outcomeIndex,
          shares: lot.shares,
          committedShares: lot.committedShares,
          stake: lot.stake,
          status: lot.status
        }
      });

      await tx.legStakeSource.create({
        data: {
          stakeId: stake.id,
          positionId: lot.id,
          shares: commit.shares,
          principal
        }
      });
    }

    await tx.parlay.update({
      where: { id: input.parlayId },
      data: { status: "ACTIVE" }
    });

    return {
      legId: newLeg.id,
      parlayStatus: "ACTIVE",
      legStatus: "ACTIVE"
    };
  });
}

function parseCommitDecimal(input: string): { value: bigint; scale: number } {
  const normalized = input.trim();
  const [integerPart = "0", fractionPart = ""] = normalized.split(".");
  const digits = `${integerPart}${fractionPart}`.replace(/^0+(?=\d)/, "");
  return {
    value: BigInt(digits || "0"),
    scale: fractionPart.length
  };
}

export async function clearParlayData(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "RolloverVote" CASCADE`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "LegStakeSource" CASCADE`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "LegStake" CASCADE`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "ParlayMember" CASCADE`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "ParlayLeg" CASCADE`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "Parlay" CASCADE`);
}
