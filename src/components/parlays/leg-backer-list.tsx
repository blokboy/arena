import React from "react";

import { LegStatusBadge, type LegStakeStatus } from "@/components/parlays/leg-status-badge";

export type LegBackerStake = {
  user: { id: string; username: string };
  amount: string;
  averageEntryPrice: string;
  shares: string;
  status: LegStakeStatus;
  // Settlement-driven fields (additive, optional — populated once a stake
  // reaches a terminal state). See docs/prds/points-prediction-market.md
  // Part III §5.
  payout?: string;
  exitPrice?: string | null;
  exitedAt?: string | null;
  rolledForwardFromLegId?: string | null;
  rolledForwardToLegId?: string | null;
};

type LegBackerListProps = {
  stakes: readonly LegBackerStake[];
};

export function LegBackerList({ stakes }: LegBackerListProps) {
  if (stakes.length === 0) {
    return <p className="text-sm text-slate-500">No backers yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-1 text-sm">
      {stakes.map((stake) => (
        <li key={stake.user.id} className="flex flex-col gap-0.5">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-slate-900">{stake.user.username}</span>
            <span className="text-slate-500">
              {stake.amount} staked · {stake.shares} shares · avg {stake.averageEntryPrice}
            </span>
            <LegStatusBadge status={stake.status} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {stake.payout && stake.payout !== "0" ? <span>Paid out {stake.payout}</span> : null}
            {stake.exitPrice ? <span>Exited at {stake.exitPrice}</span> : null}
            {stake.rolledForwardToLegId ? (
              <a href={`#leg-${stake.rolledForwardToLegId}`} className="underline">
                Carried forward →
              </a>
            ) : null}
            {stake.rolledForwardFromLegId ? (
              <a href={`#leg-${stake.rolledForwardFromLegId}`} className="underline">
                ↑ Includes proceeds from an earlier leg
              </a>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
