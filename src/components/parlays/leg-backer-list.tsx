import React from "react";

import { LegStatusBadge, type LegStakeStatus } from "@/components/parlays/leg-status-badge";

export type LegBackerStake = {
  user: { id: string; username: string };
  amount: string;
  averageEntryPrice: string;
  shares: string;
  status: LegStakeStatus;
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
        <li key={stake.user.id} className="flex items-center justify-between gap-3">
          <span className="font-medium text-slate-900">{stake.user.username}</span>
          <span className="text-slate-500">
            {stake.amount} staked · {stake.shares} shares · avg {stake.averageEntryPrice}
          </span>
          <LegStatusBadge status={stake.status} />
        </li>
      ))}
    </ul>
  );
}
