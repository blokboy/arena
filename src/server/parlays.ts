import {
  assertLegResolvesAfterActiveLeg,
  type Commitment,
  computeCommittedPrincipal,
  divideCommitDecimals,
  executeRegularParlayRollover,
  sumCommitDecimals,
  tallyMemberRolloverVote
} from "@/domain/parlays";
import { prisma, shouldUseRealDatabase } from "@/server/db";
import {
  marketCacheRepository,
  refreshMarketIfStale,
  type MarketCacheRepository
} from "@/server/markets";
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

export type RegularParlayDetail = {
  id: string;
  name: string;
  kind: "REGULAR";
  status: string;
  members: Array<{ userId: string; username: string }>;
  legs: RegularParlayDetailLeg[];
  caller: {
    id: string;
    username: string;
    isMember: boolean;
  };
};

export type RegularParlayDetailLeg = {
  id: string;
  outcomeIndex: number;
  status: string;
  market: {
    gammaId: string;
    question: string;
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
    payout: string;
    rolledForwardFromLegId: string | null;
    rolledForwardToLegId: string | null;
  }>;
  memberVoteTally: {
    totalMemberStake: string;
    yesStake: string;
    members: Array<{
      userId: string;
      username: string;
      amount: string;
      sharePct: number;
      votingYes: boolean;
    }>;
  } | null;
  callerStake: {
    amount: string;
    shares: string;
    status: string;
  } | null;
  isFinalLeg: boolean;
  nextLegBestAsk: string | null;
};

export async function getRegularParlayDetail(
  parlayId: string,
  callerUserId?: string
): Promise<RegularParlayDetail> {
  const parlay = await prisma.parlay.findFirst({
    where: { id: parlayId, kind: "REGULAR" },
    select: {
      id: true,
      name: true,
      status: true,
      members: { select: { userId: true, user: { select: { username: true } } } },
      legs: {
        orderBy: [{ resolutionAt: "asc" }, { sortKey: "asc" }],
        select: {
          id: true,
          outcomeIndex: true,
          status: true,
          market: {
            select: {
              gammaId: true,
              question: true,
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
              payout: true,
              rolledForwardFromLegId: true,
              user: { select: { id: true, username: true } }
            }
          },
          votes: { select: { userId: true, value: true } }
        }
      }
    }
  });
  if (!parlay) {
    throw new Error("PARLAY_NOT_FOUND");
  }

  const memberIds = parlay.members.map((member) => member.userId);
  const memberUsernameById = new Map(
    parlay.members.map((member) => [member.userId, member.user.username] as const)
  );

  const callerUserRecord = parlay.members.find((m) => m.userId === callerUserId);
  const callerUsername = callerUserRecord?.user.username ?? callerUserId ?? "";

  return {
    id: parlay.id,
    name: parlay.name,
    kind: "REGULAR",
    status: parlay.status,
    members: parlay.members.map((member) => ({
      userId: member.userId,
      username: member.user.username
    })),
    caller: {
      id: callerUserId ?? "",
      username: callerUsername,
      isMember: callerUserRecord !== undefined
    },
    legs: parlay.legs.map((leg, legIndex) => {
      const tally = tallyMemberRolloverVote({
        memberIds,
        stakes: leg.stakes.map((stake) => ({
          userId: stake.user.id,
          amount: Number(stake.amount.toString())
        })),
        votes: Object.fromEntries(leg.votes.map((vote) => [vote.userId, vote.value]))
      });
      const nextLeg = parlay.legs[legIndex + 1];

      const isFinalLeg = legIndex >= parlay.legs.length - 1;
      const nextLegBestAsk = !isFinalLeg
        ? (parlay.legs[legIndex + 1]?.market.bestAsk?.toString() ?? null)
        : null;

      const callerStakeRow = leg.stakes.find((s) => s.user.id === callerUserId);
      const callerStake = callerStakeRow
        ? {
            amount: callerStakeRow.amount.toString(),
            shares: callerStakeRow.shares.toString(),
            status: callerStakeRow.status
          }
        : null;

      return {
        id: leg.id,
        outcomeIndex: leg.outcomeIndex,
        status: leg.status,
        market: {
          gammaId: leg.market.gammaId,
          question: leg.market.question,
          endDate: leg.market.endDate?.toISOString() ?? null,
          lastSyncedAt: leg.market.lastSyncedAt.toISOString(),
          bestBid: leg.market.bestBid?.toString() ?? null,
          bestAsk: leg.market.bestAsk?.toString() ?? null
        },
        stakes: leg.stakes.map((stake) => ({
          user: { id: stake.user.id, username: stake.user.username },
          amount: stake.amount.toString(),
          shares: stake.shares.toString(),
          averageEntryPrice: stake.averageEntryPrice.toString(),
          status: stake.status,
          payout: stake.payout.toString(),
          rolledForwardFromLegId: stake.rolledForwardFromLegId,
          rolledForwardToLegId:
            nextLeg?.stakes.find(
              (nextStake) =>
                nextStake.rolledForwardFromLegId === leg.id && nextStake.user.id === stake.user.id
            ) !== undefined
              ? nextLeg!.id
              : null
        })),
        memberVoteTally:
          tally.totalMemberStake === 0
            ? null
            : {
                totalMemberStake: String(tally.totalMemberStake),
                yesStake: String(tally.yesMemberStake),
                members: tally.members.map((member) => ({
                  userId: member.userId,
                  username: memberUsernameById.get(member.userId) ?? member.userId,
                  amount: String(member.amount),
                  sharePct: member.sharePct,
                  votingYes: member.votingYes
                }))
              },
        callerStake,
        isFinalLeg,
        nextLegBestAsk
      };
    })
  };
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
      select: {
        id: true,
        status: true,
        kind: true,
        members: { select: { userId: true } },
        legs: {
          where: { status: "ACTIVE" },
          select: { resolutionAt: true, market: { select: { endDate: true } } }
        }
      }
    });
    if (!parlay) {
      throw new Error("PARLAY_NOT_FOUND");
    }
    if (parlay.status !== "DRAFT" && parlay.status !== "ACTIVE") {
      throw new Error("PARLAY_NOT_ACTIVE");
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

    // DRAFT parlays have no active leg yet — this call seeds leg 1, which
    // always becomes ACTIVE immediately. Once ACTIVE, this is an append:
    // the new leg must resolve strictly later than the current active leg
    // and starts PENDING.
    const isFirstLeg = parlay.status === "DRAFT";
    const legStatus = isFirstLeg ? "ACTIVE" : "PENDING";

    if (!isFirstLeg) {
      const activeLeg = parlay.legs[0];
      if (!activeLeg) {
        throw new Error("ACTIVE_LEG_REQUIRED");
      }

      assertLegResolvesAfterActiveLeg(
        activeLeg.market.endDate ?? activeLeg.resolutionAt,
        marketEndDate
      );
    }

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
        status: legStatus
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
        committedPrincipal: totalPrincipal,
        amount: totalPrincipal,
        averageEntryPrice: divideCommitDecimals(totalPrincipal, totalShares),
        status: legStatus
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

    if (isFirstLeg) {
      await tx.parlay.update({
        where: { id: input.parlayId },
        data: { status: "ACTIVE" }
      });
    }

    return {
      legId: newLeg.id,
      parlayStatus: "ACTIVE",
      legStatus
    };
  });
}

export type CastRolloverVoteResult = {
  vote: { legId: string; userId: string; value: boolean };
  tally: {
    totalMemberStake: string;
    yesStake: string;
    passes: boolean;
    members: Array<{
      userId: string;
      username: string;
      amount: string;
      sharePct: number;
      votingYes: boolean;
    }>;
  };
  didExecuteRollover: boolean;
  rollover: {
    currentLegId: string;
    nextLegId: string | null;
    exitPrice: string;
    rollForwardByUser: Record<string, { shares: string; amount: string }>;
  } | null;
};

export type ParlayStakeResult = {
  stakeId: string;
  legId: string;
  amount: string;
  shares: string;
  averageEntryPrice: string;
};

// Backs the currently ACTIVE leg only. Open to any authenticated user — this
// never creates a ParlayMember row, so a non-member backer stays
// economic-only and gains no regular-parlay rollover-vote rights (issue #9).
export async function stakeParlayLeg(input: {
  parlayId: string;
  legId: string;
  userId: string;
  commitments: Commitment[];
  positions?: PositionRepository;
}): Promise<ParlayStakeResult> {
  const positions = input.positions ?? positionRepository;

  return prisma.$transaction(async (tx) => {
    const leg = await tx.parlayLeg.findFirst({
      where: { id: input.legId, parlayId: input.parlayId },
      select: { id: true, status: true, outcomeIndex: true, market: { select: { gammaId: true } } }
    });
    if (!leg) {
      throw new Error("LEG_NOT_FOUND");
    }
    if (leg.status !== "ACTIVE") {
      throw new Error("LEG_NOT_ACTIVE");
    }

    if (input.commitments.length === 0) {
      throw new Error("NO_COMMITMENTS");
    }

    const allLots = await positions.listLotsByUserId(input.userId);
    const openLots = allLots.filter((lot) => lot.status === "OPEN");
    const lotMap = new Map(openLots.map((l) => [l.id, l]));

    for (const commit of input.commitments) {
      const lot = lotMap.get(commit.positionId);
      if (!lot) {
        throw new Error("COMMITMENT_POSITION_NOT_FOUND");
      }
      if (lot.marketId !== leg.market.gammaId || lot.outcomeIndex !== leg.outcomeIndex) {
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

    const newShares = sumCommitDecimals(input.commitments.map((c) => c.shares));
    const principals: string[] = [];
    for (const commit of input.commitments) {
      const lot = lotMap.get(commit.positionId)!;
      principals.push(
        computeCommittedPrincipal({
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
        })
      );
    }
    const newPrincipal = sumCommitDecimals(principals);

    const existing = await tx.legStake.findUnique({
      where: { legId_userId: { legId: input.legId, userId: input.userId } }
    });

    const totalShares = sumCommitDecimals([existing?.shares.toString() ?? "0", newShares]);
    const totalAmount = sumCommitDecimals([existing?.amount.toString() ?? "0", newPrincipal]);
    const totalCommittedPrincipal = sumCommitDecimals([
      existing?.committedPrincipal.toString() ?? "0",
      newPrincipal
    ]);
    const averageEntryPrice = divideCommitDecimals(totalAmount, totalShares);

    const stake = existing
      ? await tx.legStake.update({
          where: { id: existing.id },
          data: {
            shares: totalShares,
            committedPrincipal: totalCommittedPrincipal,
            amount: totalAmount,
            averageEntryPrice,
            status: "ACTIVE"
          }
        })
      : await tx.legStake.create({
          data: {
            legId: input.legId,
            userId: input.userId,
            shares: totalShares,
            committedPrincipal: newPrincipal,
            amount: newPrincipal,
            averageEntryPrice,
            status: "ACTIVE"
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

    return {
      stakeId: stake.id,
      legId: input.legId,
      amount: stake.amount.toString(),
      shares: stake.shares.toString(),
      averageEntryPrice: stake.averageEntryPrice.toString()
    };
  });
}

export async function castRegularParlayRolloverVote(input: {
  parlayId: string;
  legId: string;
  userId: string;
  vote: boolean;
  now: Date;
}): Promise<CastRolloverVoteResult> {
  return prisma.$transaction(async (tx) => {
    const parlay = await tx.parlay.findFirst({
      where: { id: input.parlayId, kind: "REGULAR" },
      select: {
        id: true,
        status: true,
        members: { select: { userId: true, user: { select: { username: true } } } },
        legs: {
          orderBy: [{ resolutionAt: "asc" }, { sortKey: "asc" }],
          select: {
            id: true,
            status: true,
            resolutionAt: true,
            sortKey: true,
            market: {
              select: {
                gammaId: true,
                endDate: true,
                bestBid: true,
                bestAsk: true
              }
            },
            stakes: {
              select: {
                userId: true,
                shares: true,
                amount: true,
                status: true,
                user: { select: { username: true } }
              }
            },
            votes: { select: { userId: true, value: true } }
          }
        }
      }
    });
    if (!parlay) {
      throw new Error("PARLAY_NOT_FOUND");
    }
    if (parlay.status !== "ACTIVE") {
      throw new Error("PARLAY_NOT_ACTIVE");
    }

    const memberUserIds = new Set(parlay.members.map((m) => m.userId));
    if (!memberUserIds.has(input.userId)) {
      throw new Error("NOT_A_VOTING_MEMBER");
    }

    const memberUsernameMap = new Map<string, string>();
    for (const m of parlay.members) {
      memberUsernameMap.set(m.userId, m.user.username);
    }

    const targetLeg = parlay.legs.find((leg) => leg.id === input.legId);
    if (!targetLeg) {
      throw new Error("LEG_NOT_FOUND");
    }
    if (targetLeg.status !== "ACTIVE") {
      throw new Error("LEG_NOT_ACTIVE");
    }

    const callerStake = targetLeg.stakes.find(
      (stake) => stake.userId === input.userId && stake.status === "ACTIVE"
    );
    if (!callerStake) {
      throw new Error("NOT_A_VOTING_MEMBER");
    }

    // Acquire an exclusive row lock on this leg before recording the vote or
    // re-tallying. Without this, two concurrent decisive votes each compute
    // their tally from a pre-commit snapshot of the other, which can either
    // lose a jointly-decisive combination (neither transaction sees both
    // votes) or double-execute the rollover (both see the leg as ACTIVE and
    // both perform the roll-forward). Serializing here means the second
    // transaction only proceeds after the first fully commits, at which
    // point its fresh re-read below reflects the true, current state.
    await tx.$queryRaw`SELECT id FROM "ParlayLeg" WHERE id = ${input.legId} FOR UPDATE`;

    const lockedLeg = await tx.parlayLeg.findUniqueOrThrow({
      where: { id: input.legId },
      select: { status: true }
    });
    if (lockedLeg.status !== "ACTIVE") {
      throw new Error("LEG_NOT_ACTIVE");
    }

    await tx.rolloverVote.upsert({
      where: { legId_userId: { legId: input.legId, userId: input.userId } },
      create: { legId: input.legId, userId: input.userId, value: input.vote },
      update: { value: input.vote }
    });

    const freshVotes = await tx.rolloverVote.findMany({
      where: { legId: input.legId },
      select: { userId: true, value: true }
    });

    const freshStakes = await tx.legStake.findMany({
      where: { legId: input.legId, status: "ACTIVE" },
      select: {
        userId: true,
        shares: true,
        amount: true,
        status: true,
        user: { select: { username: true } }
      }
    });

    const votesMap: Record<string, boolean> = {};
    for (const vote of freshVotes) {
      votesMap[vote.userId] = vote.value;
    }

    const tallyInputStakes = freshStakes.map((stake) => ({
      userId: stake.userId,
      amount: Number(stake.amount.toString())
    }));

    const tally = tallyMemberRolloverVote({
      memberIds: [...memberUserIds],
      stakes: tallyInputStakes,
      votes: votesMap
    });

    if (!tally.passes) {
      const memberList = tally.members.map((member) => ({
        userId: member.userId,
        username: memberUsernameMap.get(member.userId) ?? member.userId,
        amount: String(member.amount),
        sharePct: member.sharePct,
        votingYes: member.votingYes
      }));

      return {
        vote: { legId: input.legId, userId: input.userId, value: input.vote },
        tally: {
          totalMemberStake: String(tally.totalMemberStake),
          yesStake: String(tally.yesMemberStake),
          passes: false,
          members: memberList
        },
        didExecuteRollover: false,
        rollover: null
      };
    }

    const bestBid = targetLeg.market.bestBid;
    if (!bestBid) {
      throw new Error("PRICE_UNAVAILABLE");
    }
    const bestBidNum = Number(bestBid.toString());

    const nextLeg = parlay.legs.find(
      (leg, idx) => idx > parlay.legs.indexOf(targetLeg) && leg.status === "PENDING"
    );
    const nextLegBestAsk = nextLeg?.market.bestAsk
      ? Number(nextLeg.market.bestAsk.toString())
      : null;

    const stakesWithShares = freshStakes.map((stake) => ({
      userId: stake.userId,
      shares: Number(stake.shares.toString()),
      amount: Number(stake.amount.toString())
    }));

    const rolloverPlan = executeRegularParlayRollover({
      legs: parlay.legs.map((leg) => ({
        id: leg.id,
        marketId: leg.market.gammaId,
        outcomeId: "",
        endDate: leg.market.endDate ?? leg.resolutionAt,
        gammaId: leg.market.gammaId,
        status: leg.status as "ACTIVE" | "PENDING" | "LOST",
        stakes: leg.stakes.map((stake) => ({
          userId: stake.userId,
          amount: Number(stake.amount.toString())
        }))
      })),
      legId: input.legId,
      stakesWithShares,
      bestBid: bestBidNum,
      nextLegBestAsk,
      exitedAt: input.now
    });

    await tx.parlayLeg.update({
      where: { id: input.legId },
      data: { status: "ROLLED_OVER" }
    });

    for (const stake of freshStakes) {
      await tx.legStake.update({
        where: { legId_userId: { legId: input.legId, userId: stake.userId } },
        data: {
          status: "ROLLED_OVER",
          exitPrice: bestBidNum,
          exitedAt: input.now
        }
      });
    }

    if (nextLeg) {
      await tx.parlayLeg.update({
        where: { id: nextLeg.id },
        data: { status: "ACTIVE" }
      });

      for (const [userId, forward] of Object.entries(rolloverPlan.rollForwardByUser)) {
        const existingNextStake = await tx.legStake.findUnique({
          where: { legId_userId: { legId: nextLeg.id, userId } }
        });

        const newShares = sumCommitDecimals([
          existingNextStake?.shares.toString() ?? "0",
          String(forward.shares)
        ]);
        const newAmount = sumCommitDecimals([
          existingNextStake?.amount.toString() ?? "0",
          String(forward.amount)
        ]);
        const newPrincipal = sumCommitDecimals([
          existingNextStake?.committedPrincipal.toString() ?? "0",
          "0"
        ]);
        const avgPrice = divideCommitDecimals(newAmount, newShares);

        await tx.legStake.upsert({
          where: { legId_userId: { legId: nextLeg.id, userId } },
          create: {
            legId: nextLeg.id,
            userId,
            shares: String(forward.shares),
            committedPrincipal: "0",
            amount: String(forward.amount),
            averageEntryPrice: avgPrice,
            status: "ACTIVE"
          },
          update: {
            shares: newShares,
            amount: newAmount,
            committedPrincipal: newPrincipal,
            averageEntryPrice: avgPrice,
            status: "ACTIVE"
          }
        });
      }
    }

    const memberList = tally.members.map((member) => ({
      userId: member.userId,
      username: memberUsernameMap.get(member.userId) ?? member.userId,
      amount: String(member.amount),
      sharePct: member.sharePct,
      votingYes: member.votingYes
    }));

    const rollForwardByUser: Record<string, { shares: string; amount: string }> = {};
    for (const [userId, forward] of Object.entries(rolloverPlan.rollForwardByUser)) {
      rollForwardByUser[userId] = {
        shares: String(forward.shares),
        amount: String(forward.amount)
      };
    }

    return {
      vote: { legId: input.legId, userId: input.userId, value: input.vote },
      tally: {
        totalMemberStake: String(tally.totalMemberStake),
        yesStake: String(tally.yesMemberStake),
        passes: true,
        members: memberList
      },
      didExecuteRollover: true,
      rollover: {
        currentLegId: input.legId,
        nextLegId: nextLeg?.id ?? null,
        exitPrice: String(bestBidNum),
        rollForwardByUser
      }
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
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "HouseTransaction" CASCADE`);
}
