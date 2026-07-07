/**
 * API error-envelope contract, transcribed from the PRD (Part III §2):
 * every failure response is `{ error: { code, message, details? } }` where
 * `code` is a stable, machine-readable string the frontend branches on.
 *
 * This file is the test-side source of truth until the app defines its own
 * (planned home: a shared src/server or src/domain errors module). When that
 * module lands, import the codes from it here (or replace this file with a
 * re-export) so the contract tests pin the real implementation, not a copy.
 *
 * PROVISIONAL: the parlay staking revision in flight (share-transfer model,
 * lock-at-first-resolution) may retire LEG_APPEND_TOO_EARLY and add codes
 * such as PARLAY_APPENDS_LOCKED. Update alongside the PRD revision.
 */
export const API_ERROR_CODES = [
  // Regular-parlay append validation (422): appended leg must resolve later
  // than the currently-active leg. details: { activeLegEndDate, attemptedMarketEndDate }
  "LEG_APPEND_TOO_EARLY",
  // Day's Parlay claim conflict (409): one leg per market per day, FCFS.
  "MARKET_ALREADY_CLAIMED",
  // Day's Parlay one-vote-per-day cross-leg invariant.
  // details: { spentOnLegId, spentOnMarketQuestion }
  "VOTE_ALREADY_SPENT",
  // Day's Parlay: at most 3 rollovers per day; further votes are inert.
  "ROLLOVER_CAP_REACHED",
  // Any stake/buy exceeding the caller's current balance.
  "INSUFFICIENT_BALANCE",
  // STANDARD parlay rollover vote from a caller who isn't both a ParlayMember
  // and an active backer of the leg (403).
  "NOT_A_VOTING_MEMBER"
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export type ApiErrorEnvelope = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
};
