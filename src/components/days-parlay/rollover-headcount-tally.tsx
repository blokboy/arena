import React from "react";

export type DaysParlayVoteTally = {
  yesCount: number;
  totalBackerCount: number;
};

type RolloverHeadcountTallyProps = {
  tally: DaysParlayVoteTally;
};

// Read-only headcount tally for a Day's Parlay leg (PRD Part I §8, Part II
// §2.3/§2.4, Part IV §4.3's `votingMode === 'headcount'` branch). This is a
// deliberately separate, small component rather than an extension of
// `RolloverControl` (see rollover-control.tsx) — see the report for why.
//
// It never has its own toggle: casting the actual vote is always via
// `VoteSpendButton`, since a headcount backer's vote is a one-shot resource
// spent across the whole day, not a freely-reversible per-leg toggle.
export function RolloverHeadcountTally({ tally }: RolloverHeadcountTallyProps) {
  const { yesCount, totalBackerCount } = tally;
  // Strict majority: `yesCount > totalBackerCount / 2` (matches
  // src/domain/days-parlay.ts::castDaysParlayRolloverVote's own threshold),
  // so the smallest passing headcount is `floor(totalBackerCount / 2) + 1`.
  const neededToPass = Math.floor(totalBackerCount / 2) + 1;

  return (
    <p aria-live="polite" className="font-medium text-slate-900">
      {yesCount} of {totalBackerCount} backer{totalBackerCount === 1 ? "" : "s"} voted to roll over
      (needs {neededToPass} to pass)
    </p>
  );
}
