export type EligiblePosition = Readonly<{
  positionId: string;
  marketId: string;
  outcomeIndex: number;
  availableShares: string;
}>;

export type LegCommitment = Readonly<{
  positionId: string;
  shares: string;
}>;

export class ParlayCreationError extends Error {
  constructor(
    public readonly code:
      | "NO_COMMITMENTS"
      | "COMMITMENT_POSITION_NOT_FOUND"
      | "COMMITMENT_MARKET_MISMATCH"
      | "COMMITMENT_EXCEEDS_AVAILABLE_SHARES"
      | "PARLAY_NAME_REQUIRED"
  ) {
    super(code);
  }
}

export function validateParlayName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new ParlayCreationError("PARLAY_NAME_REQUIRED");
  }
}

export function buildInitialRoster(input: {
  creatorId: string;
  inviteUserIds: string[];
}): readonly string[] {
  const seen = new Set<string>();
  const roster: string[] = [];

  const add = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id);
      roster.push(id);
    }
  };

  add(input.creatorId);
  for (const id of input.inviteUserIds) add(id);

  return Object.freeze(roster);
}

export function validateFirstLegCommitments(input: {
  marketId: string;
  outcomeIndex: number;
  commitments: readonly LegCommitment[];
  eligiblePositions: readonly EligiblePosition[];
}): void {
  if (input.commitments.length === 0) {
    throw new ParlayCreationError("NO_COMMITMENTS");
  }

  const positionMap = new Map(input.eligiblePositions.map((p) => [p.positionId, p]));

  for (const commit of input.commitments) {
    const position = positionMap.get(commit.positionId);
    if (!position) {
      throw new ParlayCreationError("COMMITMENT_POSITION_NOT_FOUND");
    }

    if (position.marketId !== input.marketId || position.outcomeIndex !== input.outcomeIndex) {
      throw new ParlayCreationError("COMMITMENT_MARKET_MISMATCH");
    }

    const [requestedInt = "0", requestedFrac = ""] = commit.shares.split(".");
    const requestedValue = BigInt(`${requestedInt}${requestedFrac}`);
    const requestedScale = requestedFrac.length;

    const [availInt = "0", availFrac = ""] = position.availableShares.split(".");
    const availValue = BigInt(`${availInt}${availFrac}`);
    const availScale = availFrac.length;

    const maxScale = Math.max(requestedScale, availScale);
    const normalizedRequested = requestedValue * 10n ** BigInt(maxScale - requestedScale);
    const normalizedAvail = availValue * 10n ** BigInt(maxScale - availScale);

    if (normalizedRequested <= 0n || normalizedRequested > normalizedAvail) {
      throw new ParlayCreationError("COMMITMENT_EXCEEDS_AVAILABLE_SHARES");
    }
  }
}
