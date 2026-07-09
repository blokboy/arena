import React from "react";

import type { DaysParlayDetailLeg } from "@/server/days-parlay";

type DaysParlayDashboardCardProps = {
  legs: DaysParlayDetailLeg[];
};

export function DaysParlayDashboardCard({ legs }: DaysParlayDashboardCardProps) {
  const activeLeg = legs.find((leg) => leg.status === "ACTIVE") ?? null;

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-600">
        Leg {legs.length} of 7
        {activeLeg ? (
          <>
            {" · "}
            <span className="font-medium text-slate-900">live now:</span>{" "}
            {activeLeg.market.question}
          </>
        ) : (
          " · no active leg"
        )}
      </p>
    </div>
  );
}
