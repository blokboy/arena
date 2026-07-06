export type UserId = string;

export type RegularParlayStatus = "ACTIVE" | "LOST";

export type ParlayLegStatus = "ACTIVE" | "PENDING" | "LOST";

export type LegStake = Readonly<{
  userId: UserId;
  amount: number;
}>;

export type RegularParlayLeg = Readonly<{
  id: string;
  marketId: string;
  outcomeId: string;
  endDate: Date;
  gammaId: string;
  status: ParlayLegStatus;
  stakes: readonly LegStake[];
}>;

export type RegularParlay = Readonly<{
  id: string;
  name: string;
  creatorId: UserId;
  status: RegularParlayStatus;
  memberIds: readonly UserId[];
  legs: readonly RegularParlayLeg[];
}>;

export type RegularParlayLegInput = Readonly<{
  id: string;
  marketId: string;
  outcomeId: string;
  endDate: Date;
  gammaId: string;
  firstStake: LegStake;
}>;

export type CreateRegularParlayInput = Readonly<{
  id: string;
  name: string;
  creatorId: UserId;
  memberIds: readonly UserId[];
  firstLeg: RegularParlayLegInput;
}>;

export type RolloverVoteTally = Readonly<{
  totalMemberStake: number;
  yesMemberStake: number;
  passes: boolean;
}>;

export type HouseTransaction = Readonly<{
  type: "PARLAY_LEG_LOSS";
  amount: number;
  parlayId: string;
  legId: string;
}>;

export class RegularParlayDomainError extends Error {
  constructor(
    public readonly code:
      | "CREATOR_MUST_BE_MEMBER"
      | "FIRST_LEG_REQUIRES_STAKE"
      | "APPEND_REQUIRES_MEMBER"
      | "APPEND_REQUIRES_STAKE"
      | "ACTIVE_LEG_REQUIRED"
      | "LEG_APPEND_TOO_EARLY"
      | "LEG_NOT_FOUND"
  ) {
    super(code);
  }
}

export function createRegularParlay(input: CreateRegularParlayInput): RegularParlay {
  const memberIds = uniqueUserIds(input.memberIds);

  if (!memberIds.includes(input.creatorId)) {
    throw new RegularParlayDomainError("CREATOR_MUST_BE_MEMBER");
  }

  assertPositiveStake(input.firstLeg.firstStake, "FIRST_LEG_REQUIRES_STAKE");

  if (!memberIds.includes(input.firstLeg.firstStake.userId)) {
    throw new RegularParlayDomainError("APPEND_REQUIRES_MEMBER");
  }

  return freezeParlay({
    id: input.id,
    name: input.name,
    creatorId: input.creatorId,
    status: "ACTIVE",
    memberIds,
    legs: [
      buildLeg(input.firstLeg, {
        status: "ACTIVE"
      })
    ]
  });
}

export function appendRegularParlayLeg(
  parlay: RegularParlay,
  input: RegularParlayLegInput
): RegularParlay {
  if (!parlay.memberIds.includes(input.firstStake.userId)) {
    throw new RegularParlayDomainError("APPEND_REQUIRES_MEMBER");
  }

  assertPositiveStake(input.firstStake, "APPEND_REQUIRES_STAKE");

  const activeLeg = parlay.legs.find((leg) => leg.status === "ACTIVE");

  if (!activeLeg) {
    throw new RegularParlayDomainError("ACTIVE_LEG_REQUIRED");
  }

  if (input.endDate.getTime() <= activeLeg.endDate.getTime()) {
    throw new RegularParlayDomainError("LEG_APPEND_TOO_EARLY");
  }

  return freezeParlay({
    ...parlay,
    legs: getChronologicalLegs([
      ...parlay.legs,
      buildLeg(input, {
        status: "PENDING"
      })
    ])
  });
}

export function getChronologicalLegs(
  legs: readonly RegularParlayLeg[]
): readonly RegularParlayLeg[] {
  return Object.freeze(
    [...legs].sort((left, right) => {
      const endDateDelta = left.endDate.getTime() - right.endDate.getTime();

      if (endDateDelta !== 0) {
        return endDateDelta;
      }

      return left.gammaId.localeCompare(right.gammaId);
    })
  );
}

export function tallyMemberRolloverVote(input: {
  memberIds: readonly UserId[];
  stakes: readonly LegStake[];
  votes: Readonly<Record<UserId, boolean>>;
}): RolloverVoteTally {
  const memberIdSet = new Set(input.memberIds);
  const memberStakeByUser = new Map<UserId, number>();

  for (const stake of input.stakes) {
    if (!memberIdSet.has(stake.userId)) {
      continue;
    }

    memberStakeByUser.set(stake.userId, (memberStakeByUser.get(stake.userId) ?? 0) + stake.amount);
  }

  let totalMemberStake = 0;
  let yesMemberStake = 0;

  for (const [userId, amount] of memberStakeByUser) {
    totalMemberStake += amount;

    if (input.votes[userId] === true) {
      yesMemberStake += amount;
    }
  }

  return {
    totalMemberStake,
    yesMemberStake,
    passes: yesMemberStake > totalMemberStake / 2
  };
}

export function settleRegularParlayLoss(
  parlay: RegularParlay,
  lostLegId: string
): Readonly<{
  parlay: RegularParlay;
  houseTransaction: HouseTransaction;
}> {
  if (!parlay.legs.some((leg) => leg.id === lostLegId)) {
    throw new RegularParlayDomainError("LEG_NOT_FOUND");
  }

  const amount = parlay.legs
    .filter((leg) => leg.status === "ACTIVE" || leg.status === "PENDING")
    .reduce((total, leg) => total + sumStakes(leg.stakes), 0);

  return {
    parlay: freezeParlay({
      ...parlay,
      status: "LOST",
      legs: parlay.legs.map((leg) =>
        leg.id === lostLegId ? freezeLeg({ ...leg, status: "LOST" }) : leg
      )
    }),
    houseTransaction: Object.freeze({
      type: "PARLAY_LEG_LOSS",
      amount,
      parlayId: parlay.id,
      legId: lostLegId
    })
  };
}

function buildLeg(
  input: RegularParlayLegInput,
  options: { status: ParlayLegStatus }
): RegularParlayLeg {
  return freezeLeg({
    id: input.id,
    marketId: input.marketId,
    outcomeId: input.outcomeId,
    endDate: new Date(input.endDate),
    gammaId: input.gammaId,
    status: options.status,
    stakes: [freezeStake(input.firstStake)]
  });
}

function assertPositiveStake(
  stake: LegStake,
  code: "FIRST_LEG_REQUIRES_STAKE" | "APPEND_REQUIRES_STAKE"
): void {
  if (stake.amount <= 0) {
    throw new RegularParlayDomainError(code);
  }
}

function sumStakes(stakes: readonly LegStake[]): number {
  return stakes.reduce((total, stake) => total + stake.amount, 0);
}

function uniqueUserIds(userIds: readonly UserId[]): readonly UserId[] {
  return Object.freeze([...new Set(userIds)]);
}

function freezeStake(stake: LegStake): LegStake {
  return Object.freeze({ ...stake });
}

function freezeLeg(leg: RegularParlayLeg): RegularParlayLeg {
  return Object.freeze({
    ...leg,
    stakes: Object.freeze(leg.stakes.map(freezeStake))
  });
}

function freezeParlay(parlay: RegularParlay): RegularParlay {
  return Object.freeze({
    ...parlay,
    memberIds: Object.freeze([...parlay.memberIds]),
    legs: Object.freeze(parlay.legs.map(freezeLeg))
  });
}
