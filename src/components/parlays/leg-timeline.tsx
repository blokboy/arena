import React from "react";

import { LegStatusBadge, type LegStatus } from "@/components/parlays/leg-status-badge";

export type LegTimelineLeg = {
  id: string;
  status: LegStatus;
  endDate: string;
  marketQuestion: string;
  outcomeLabel: string;
  aggregateStakeAmount: string;
  backerCount: number;
  bestBid?: string | null;
  bestAsk?: string | null;
  warning?: string | null;
};

type LegTimelineProps = {
  legs: readonly LegTimelineLeg[];
  reducedMotion?: boolean;
};

export function LegTimeline({ legs, reducedMotion }: LegTimelineProps) {
  return (
    <ol className="flex flex-col gap-3">
      {legs.map((leg) => (
        <li
          key={leg.id}
          id={`leg-${leg.id}`}
          className="grid grid-cols-[auto_1fr] gap-3 rounded-md border border-slate-200 p-3"
        >
          <div className="w-28 shrink-0 text-xs text-slate-500">
            <div>{formatDate(leg.endDate)}</div>
            <LegStatusBadge status={leg.status} reducedMotion={reducedMotion} />
          </div>
          <div className="text-sm">
            <div className="font-medium text-slate-900">
              {leg.marketQuestion} <span className="text-slate-500">— {leg.outcomeLabel}</span>
            </div>
            <div className="text-slate-500">
              {leg.backerCount} backers · {leg.aggregateStakeAmount} staked
              {leg.bestBid != null || leg.bestAsk != null ? (
                <>
                  {" "}
                  · bid {leg.bestBid ?? "—"} / ask {leg.bestAsk ?? "—"}
                </>
              ) : null}
            </div>
            {leg.warning ? <p className="mt-1 text-xs text-slate-500">{leg.warning}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC"
  }).format(new Date(iso));
}
