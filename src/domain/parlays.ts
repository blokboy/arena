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
  members: readonly Readonly<{
    userId: UserId;
    amount: number;
    sharePct: number;
    votingYes: boolean;
  }>[];
}>;

export type RegularParlayRollover = Readonly<{
  currentLegId: string;
  nextLegId: string | null;
  rollForwardByUser: Readonly<Record<UserId, Readonly<{ shares: number; amount: number }>>>;
}>;

export type HouseTransaction = Readonly<{
  type: "PARLAY_LEG_LOSS";
  amount: number;
  parlayId: string;
  legId: string;
}>;

export type Commitment = Readonly<{
  positionId: string;
  shares: string;
}>;

export type CommitmentValidationPosition = Readonly<{
  id: string;
  userId: string;
  marketId: string;
  outcomeIndex: number;
  shares: string;
  committedShares: string;
  stake: string;
  status: string;
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
      | "NO_COMMITMENTS"
      | "POSITION_NOT_FOUND"
      | "POSITION_NOT_OWNED"
      | "POSITION_NOT_OPEN"
      | "POSITION_WRONG_MARKET"
      | "POSITION_WRONG_OUTCOME"
      | "INSUFFICIENT_AVAILABLE_SHARES",
    public readonly details?: Readonly<{
      activeLegEndDate?: string;
      attemptedMarketEndDate?: string;
    }>
  ) {
    super(code);
  }
}

export function assertLegResolvesAfterActiveLeg(
  activeLegEndDate: Date,
  attemptedMarketEndDate: Date
): void {
  if (attemptedMarketEndDate.getTime() <= activeLegEndDate.getTime()) {
    throw new RegularParlayDomainError("LEG_APPEND_TOO_EARLY", {
      activeLegEndDate: activeLegEndDate.toISOString(),
      attemptedMarketEndDate: attemptedMarketEndDate.toISOString()
    });
  }
}

export function validateCommitments(input: {
  commitments: readonly Commitment[];
  positions: readonly CommitmentValidationPosition[];
  userId: string;
  marketId: string;
  outcomeIndex: number;
}): void {
  if (input.commitments.length === 0) {
    throw new RegularParlayDomainError("NO_COMMITMENTS");
  }

  const positionMap = new Map(input.positions.map((p) => [p.id, p]));

  for (const commit of input.commitments) {
    const position = positionMap.get(commit.positionId);
    if (!position) {
      throw new RegularParlayDomainError("POSITION_NOT_FOUND");
    }
    if (position.userId !== input.userId) {
      throw new RegularParlayDomainError("POSITION_NOT_OWNED");
    }
    if (position.status !== "OPEN") {
      throw new RegularParlayDomainError("POSITION_NOT_OPEN");
    }

    const requested = parseCommitDecimal(commit.shares);
    const shares = parseCommitDecimal(position.shares);
    const committed = parseCommitDecimal(position.committedShares);
    const available = {
      value: shares.value - committed.value,
      scale: shares.scale
    };

    if (requested.value <= 0n) {
      throw new RegularParlayDomainError("INSUFFICIENT_AVAILABLE_SHARES");
    }
    if (requested.value > available.value) {
      throw new RegularParlayDomainError("INSUFFICIENT_AVAILABLE_SHARES");
    }

    if (position.marketId !== input.marketId) {
      throw new RegularParlayDomainError("POSITION_WRONG_MARKET");
    }
    if (position.outcomeIndex !== input.outcomeIndex) {
      throw new RegularParlayDomainError("POSITION_WRONG_OUTCOME");
    }
  }
}

export function computeCommittedPrincipal(input: {
  commitment: Commitment;
  position: CommitmentValidationPosition;
}): string {
  const commitShares = parseCommitDecimal(input.commitment.shares);
  const totalShares = parseCommitDecimal(input.position.shares);
  const totalStake = parseCommitDecimal(input.position.stake);
  const numerator = commitShares.value * totalStake.value;
  const denominator = totalShares.value;
  if (denominator === 0n) {
    throw new RegularParlayDomainError("POSITION_NOT_FOUND");
  }
  const precision = 6;
  const result = {
    value: (numerator * 10n ** BigInt(precision)) / denominator,
    scale: totalStake.scale + precision
  };
  return formatCommitDecimal(result);
}

export function sumCommitDecimals(values: readonly string[]): string {
  if (values.length === 0) return "0";
  const decimals = values.map(parseCommitDecimal);
  const maxScale = Math.max(...decimals.map((d) => d.scale));
  let total = 0n;
  for (const d of decimals) {
    total += d.value * 10n ** BigInt(maxScale - d.scale);
  }
  while (total % 10n === 0n && maxScale > 0) {
    const reduced = { value: total / 10n, scale: maxScale - 1 };
    if (reduced.value * 10n === total) {
      total = reduced.value;
    }
    break;
  }
  return formatCommitDecimal({ value: total, scale: maxScale });
}

export function divideCommitDecimals(numerator: string, denominator: string): string {
  const num = parseCommitDecimal(numerator);
  const den = parseCommitDecimal(denominator);

  if (den.value === 0n) {
    return "0";
  }

  // Align both operands to the same scale before dividing as integers —
  // dividing the raw BigInt values directly would skew the ratio whenever
  // the two inputs have different decimal-fraction lengths.
  const alignedScale = Math.max(num.scale, den.scale);
  const numAligned = num.value * 10n ** BigInt(alignedScale - num.scale);
  const denAligned = den.value * 10n ** BigInt(alignedScale - den.scale);

  const precision = 6;
  return formatCommitDecimal({
    value: (numAligned * 10n ** BigInt(precision)) / denAligned,
    scale: precision
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

function formatCommitDecimal(decimal: { value: bigint; scale: number }): string {
  const absolute = decimal.value < 0n ? -decimal.value : decimal.value;
  const digits = absolute.toString().padStart(decimal.scale + 1, "0");
  const integer = decimal.scale === 0 ? digits : digits.slice(0, digits.length - decimal.scale);
  const fraction = decimal.scale === 0 ? "" : digits.slice(digits.length - decimal.scale);
  const trimmedFraction = fraction.replace(/0+$/, "");
  return trimmedFraction.length > 0 ? `${integer}.${trimmedFraction}` : integer;
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

  assertLegResolvesAfterActiveLeg(activeLeg.endDate, input.endDate);

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

  for (const [, amount] of memberStakeByUser) {
    totalMemberStake += amount;
  }

  const members = [...memberStakeByUser.entries()].map(([userId, amount]) => {
    const votingYes = input.votes[userId] === true;

    if (votingYes) {
      yesMemberStake += amount;
    }

    return {
      userId,
      amount,
      sharePct: totalMemberStake === 0 ? 0 : amount / totalMemberStake,
      votingYes
    };
  });

  return {
    totalMemberStake,
    yesMemberStake,
    passes: yesMemberStake > totalMemberStake / 2,
    members: Object.freeze(members.map((member) => Object.freeze(member)))
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

export function executeRegularParlayRollover(input: {
  legs: readonly RegularParlayLeg[];
  legId: string;
  stakesWithShares: readonly Readonly<{
    userId: UserId;
    shares: number;
    amount: number;
  }>[];
  bestBid: number;
  nextLegBestAsk: number | null;
  exitedAt: Date;
}): RegularParlayRollover {
  const legIndex = input.legs.findIndex((leg) => leg.id === input.legId);
  if (legIndex === -1) {
    throw new RegularParlayDomainError("LEG_NOT_FOUND");
  }

  const targetLeg = input.legs[legIndex]!;
  if (targetLeg.status !== "ACTIVE") {
    throw new RegularParlayDomainError("LEG_NOT_FOUND");
  }

  const nextLegIndex = input.legs.findIndex(
    (leg, idx) => idx > legIndex && leg.status === "PENDING"
  );
  const nextLegId = nextLegIndex !== -1 ? input.legs[nextLegIndex]!.id : null;

  const rollForwardByUser: Record<UserId, { shares: number; amount: number }> = {};

  for (const stake of input.stakesWithShares) {
    const payout = stake.shares * input.bestBid;

    if (nextLegId && input.nextLegBestAsk && input.nextLegBestAsk > 0) {
      const rolledShares = payout / input.nextLegBestAsk;
      const existing = rollForwardByUser[stake.userId];
      rollForwardByUser[stake.userId] = {
        shares: (existing?.shares ?? 0) + rolledShares,
        amount: (existing?.amount ?? 0) + payout
      };
    }
  }

  return Object.freeze({
    currentLegId: input.legId,
    nextLegId,
    rollForwardByUser: Object.freeze(rollForwardByUser)
  });
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
