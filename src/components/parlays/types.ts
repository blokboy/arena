export type ParlayWizardStep = "roster" | "first-leg";

export type ParlayRosterMember = {
  id: string;
  username: string;
};

export type ParlayUserSearchResult = {
  id: string;
  username: string;
  subtitle?: string;
};

export type EligiblePositionLot = {
  positionId: string;
  marketId: string;
  marketQuestion: string;
  outcomeIndex: number;
  outcomeLabel: string;
  entryPrice: string;
  availableShares: string;
  committedShares?: string;
  purchasedAt?: string;
};

export type SelectedCommitments = Record<string, string>;
