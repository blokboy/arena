export type DaysParlayStake = {
  userId: string;
  amount: number;
  freshPrincipal: number;
};

export type DaysParlayVote = {
  legId: string;
  userId: string;
};

export type DaysParlayLeg = {
  id: string;
  marketId: string;
  gammaId: string;
  resolvesAt: Date;
  stakes: DaysParlayStake[];
  votes: DaysParlayVote[];
};

export type DaysParlay = {
  dayKey: string;
  rolloverCount: number;
  legs: DaysParlayLeg[];
};

export type DaysParlayErrorCode =
  | "BACKER_REQUIRED"
  | "INITIAL_STAKE_REQUIRED"
  | "LEG_NOT_FOUND"
  | "MARKET_ALREADY_CLAIMED"
  | "MARKET_OUTSIDE_DAY"
  | "ROLLOVER_CAP_REACHED"
  | "VOTE_ALREADY_SPENT";

export type DaysParlayError = {
  code: DaysParlayErrorCode;
  details?: Record<string, unknown>;
};

export type DaysParlayResult<T> = ({ ok: true } & T) | { ok: false; error: DaysParlayError };

export type CreateDaysParlayOptions = {
  rolloverCount?: number;
  legs?: DaysParlayLeg[];
};

export type ClaimDaysParlayLegInput = {
  backerId: string;
  committedPrincipal: number;
  gammaId: string;
  marketId: string;
  resolvesAt: Date;
};

export type CastDaysParlayRolloverVoteInput = {
  legId: string;
  userId: string;
};

export type DaysParlayVoteTally = {
  yesCount: number;
  totalBackerCount: number;
};

export type DaysParlaySuccessSettlementInput = {
  finalLegId: string;
  houseBalance: number;
  winningStakeByUser: Record<string, number>;
};

export type DaysParlaySuccessSettlement = {
  bonusPool: number;
  houseDebit: number;
  payoutsByUser: Record<string, number>;
};

export type DaysParlayFailureSettlement = {
  houseCredit: number;
  lostStakeByUser: Record<string, number>;
};

const MAX_DAILY_ROLLOVERS = 3;

export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function createDaysParlay(
  dayKey: string,
  options: CreateDaysParlayOptions = {}
): DaysParlay {
  return {
    dayKey,
    rolloverCount: options.rolloverCount ?? 0,
    legs: [...(options.legs ?? [])].sort(compareLegs)
  };
}

export function claimDaysParlayLeg(
  parlay: DaysParlay,
  input: ClaimDaysParlayLegInput
): DaysParlayResult<{ parlay: DaysParlay; leg: DaysParlayLeg }> {
  if (input.committedPrincipal <= 0) {
    return { ok: false, error: { code: "INITIAL_STAKE_REQUIRED" } };
  }

  if (utcDayKey(input.resolvesAt) !== parlay.dayKey) {
    return { ok: false, error: { code: "MARKET_OUTSIDE_DAY" } };
  }

  if (parlay.legs.some((leg) => leg.marketId === input.marketId)) {
    return { ok: false, error: { code: "MARKET_ALREADY_CLAIMED" } };
  }

  const leg: DaysParlayLeg = {
    id: `${parlay.dayKey}:${input.marketId}`,
    marketId: input.marketId,
    gammaId: input.gammaId,
    resolvesAt: input.resolvesAt,
    stakes: [
      {
        userId: input.backerId,
        amount: input.committedPrincipal,
        freshPrincipal: input.committedPrincipal
      }
    ],
    votes: []
  };

  return {
    ok: true,
    leg,
    parlay: {
      ...parlay,
      legs: [...parlay.legs, leg].sort(compareLegs)
    }
  };
}

export function castDaysParlayRolloverVote(
  parlay: DaysParlay,
  input: CastDaysParlayRolloverVoteInput
): DaysParlayResult<{
  didExecuteRollover: boolean;
  parlay: DaysParlay;
  tally: DaysParlayVoteTally;
}> {
  if (parlay.rolloverCount >= MAX_DAILY_ROLLOVERS) {
    return { ok: false, error: { code: "ROLLOVER_CAP_REACHED" } };
  }

  const targetLeg = parlay.legs.find((leg) => leg.id === input.legId);
  if (!targetLeg) {
    return { ok: false, error: { code: "LEG_NOT_FOUND" } };
  }

  if (!distinctBackerIds(targetLeg).has(input.userId)) {
    return { ok: false, error: { code: "BACKER_REQUIRED" } };
  }

  const spentVote = parlay.legs
    .flatMap((leg) => leg.votes)
    .find((vote) => vote.userId === input.userId);

  if (spentVote) {
    return {
      ok: false,
      error: {
        code: "VOTE_ALREADY_SPENT",
        details: { spentOnLegId: spentVote.legId }
      }
    };
  }

  const updatedLeg: DaysParlayLeg = {
    ...targetLeg,
    votes: [...targetLeg.votes, { legId: input.legId, userId: input.userId }]
  };

  const tally = tallyDaysParlayRolloverVotes(updatedLeg);
  const didExecuteRollover = tally.yesCount > tally.totalBackerCount / 2;

  return {
    ok: true,
    didExecuteRollover,
    tally,
    parlay: {
      ...parlay,
      rolloverCount: didExecuteRollover ? parlay.rolloverCount + 1 : parlay.rolloverCount,
      legs: parlay.legs.map((leg) => (leg.id === input.legId ? updatedLeg : leg))
    }
  };
}

export function tallyDaysParlayRolloverVotes(leg: DaysParlayLeg): DaysParlayVoteTally {
  return {
    yesCount: new Set(leg.votes.map((vote) => vote.userId)).size,
    totalBackerCount: distinctBackerIds(leg).size
  };
}

export function settleDaysParlaySuccess(
  parlay: DaysParlay,
  input: DaysParlaySuccessSettlementInput
): DaysParlaySuccessSettlement {
  const bonusPool = input.houseBalance / 2;
  const principalByUser = freshPrincipalByUser(parlay);
  const totalFreshPrincipal = sum(Object.values(principalByUser));

  const payoutsByUser = { ...input.winningStakeByUser };

  if (totalFreshPrincipal > 0) {
    for (const [userId, principal] of Object.entries(principalByUser)) {
      payoutsByUser[userId] =
        (payoutsByUser[userId] ?? 0) + bonusPool * (principal / totalFreshPrincipal);
    }
  }

  return {
    bonusPool,
    houseDebit: bonusPool,
    payoutsByUser
  };
}

export function settleDaysParlayFailure(parlay: DaysParlay): DaysParlayFailureSettlement {
  const lostStakeByUser: Record<string, number> = {};

  for (const stake of parlay.legs.flatMap((leg) => leg.stakes)) {
    lostStakeByUser[stake.userId] = (lostStakeByUser[stake.userId] ?? 0) + stake.amount;
  }

  return {
    houseCredit: sum(Object.values(lostStakeByUser)),
    lostStakeByUser
  };
}

function compareLegs(left: DaysParlayLeg, right: DaysParlayLeg): number {
  const dateOrder = left.resolvesAt.getTime() - right.resolvesAt.getTime();
  return dateOrder === 0 ? left.gammaId.localeCompare(right.gammaId) : dateOrder;
}

function distinctBackerIds(leg: DaysParlayLeg): Set<string> {
  return new Set(leg.stakes.map((stake) => stake.userId));
}

function freshPrincipalByUser(parlay: DaysParlay): Record<string, number> {
  const principalByUser: Record<string, number> = {};

  for (const stake of parlay.legs.flatMap((leg) => leg.stakes)) {
    principalByUser[stake.userId] = (principalByUser[stake.userId] ?? 0) + stake.freshPrincipal;
  }

  return principalByUser;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
