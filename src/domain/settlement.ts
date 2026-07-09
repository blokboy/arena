import type { GammaMarket } from "./markets";
import { parseStringArray } from "./markets";
import { divideDecimalStrings, getAvailableShares, multiplyDecimalStrings } from "./positions";

type MarketResolutionInput = Pick<GammaMarket, "closed" | "outcomes" | "outcomePrices">;

export type MarketResolution =
  | {
      status: "RESOLVED";
      winningOutcomeIndex: number;
      winningOutcomeLabel: string;
    }
  | {
      status: "VOIDED";
    }
  | {
      status: "OPEN";
    };

export type PositionSettlementInput = {
  outcomeIndex: number;
  stake: string;
  shares: string;
  committedShares: string;
  resolution: MarketResolution;
};

export type PositionSettlement = {
  status: "WON" | "LOST" | "VOIDED" | "OPEN";
  settledShares: string;
  payout: string;
};

export function detectMarketResolution(market: MarketResolutionInput): MarketResolution {
  if (market.closed !== true) {
    return { status: "OPEN" };
  }

  const outcomes = parseStringArray(market.outcomes, "INVALID_OUTCOMES");
  const prices = parseStringArray(market.outcomePrices, "INVALID_OUTCOME_PRICES");
  const winningIndexes = prices
    .map((price, index) => ({ price, index }))
    .filter(({ price }) => price === "1" || price === "1.0" || price === "1.00")
    .map(({ index }) => index);
  const losingPricesAreCollapsed = prices.every(
    (price, index) =>
      winningIndexes.includes(index) || price === "0" || price === "0.0" || price === "0.00"
  );

  if (winningIndexes.length !== 1 || !losingPricesAreCollapsed) {
    return { status: "VOIDED" };
  }

  const winningOutcomeIndex = winningIndexes[0]!;
  return {
    status: "RESOLVED",
    winningOutcomeIndex,
    winningOutcomeLabel: outcomes[winningOutcomeIndex] ?? String(winningOutcomeIndex)
  };
}

export function calculatePositionSettlement(input: PositionSettlementInput): PositionSettlement {
  const settledShares = getAvailableShares(input);

  if (input.resolution.status === "OPEN") {
    return {
      status: "OPEN",
      settledShares,
      payout: "0"
    };
  }

  if (input.resolution.status === "VOIDED") {
    return {
      status: "VOIDED",
      settledShares,
      payout: calculatePrincipalForShares({
        stake: input.stake,
        shares: input.shares,
        settledShares
      })
    };
  }

  const won = input.outcomeIndex === input.resolution.winningOutcomeIndex;
  return {
    status: won ? "WON" : "LOST",
    settledShares,
    payout: won ? settledShares : "0"
  };
}

export type ParlayLegStakeSettlementInput = {
  outcomeIndex: number;
  isFinalLeg: boolean;
  stakeAmount: string;
  stakeShares: string;
  resolution: MarketResolution;
};

export type ParlayLegStakeSettlement = {
  status: "WON" | "LOST" | "VOIDED";
  payout: string;
  houseAmount: string;
  forwardPrincipal: string | null;
};

export function calculateParlayLegStakeSettlement(
  input: ParlayLegStakeSettlementInput
): ParlayLegStakeSettlement {
  if (input.resolution.status === "RESOLVED") {
    const won = input.outcomeIndex === input.resolution.winningOutcomeIndex;

    if (won) {
      return input.isFinalLeg
        ? { status: "WON", payout: input.stakeShares, houseAmount: "0", forwardPrincipal: null }
        : { status: "WON", payout: "0", houseAmount: "0", forwardPrincipal: input.stakeShares };
    }

    return { status: "LOST", payout: "0", houseAmount: input.stakeAmount, forwardPrincipal: null };
  }

  if (input.resolution.status === "VOIDED") {
    return input.isFinalLeg
      ? { status: "VOIDED", payout: input.stakeAmount, houseAmount: "0", forwardPrincipal: null }
      : { status: "VOIDED", payout: "0", houseAmount: "0", forwardPrincipal: input.stakeAmount };
  }

  throw new Error("NOT_IMPLEMENTED");
}

export function getUtcGrantDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function calculatePrincipalForShares(input: {
  stake: string;
  shares: string;
  settledShares: string;
}): string {
  const principalPerShare = divideDecimalStrings(input.stake, input.shares);
  return multiplyDecimalStrings(input.settledShares, principalPerShare);
}
