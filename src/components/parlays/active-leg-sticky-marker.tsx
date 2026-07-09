import React from "react";

import type { LegTimelineLeg } from "@/components/parlays/leg-timeline";

type ActiveLegStickyMarkerProps = {
  legs: readonly LegTimelineLeg[];
};

export function ActiveLegStickyMarker({ legs }: ActiveLegStickyMarkerProps) {
  const activeLeg = legs.find((leg) => leg.status === "ACTIVE");

  if (!activeLeg) {
    return null;
  }

  return (
    <div
      data-testid="active-leg-sticky-marker"
      className="sticky top-0 z-10 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm"
    >
      <span className="font-medium text-blue-700">You are here:</span>{" "}
      <a href={`#leg-${activeLeg.id}`} className="underline">
        {activeLeg.marketQuestion}
      </a>
    </div>
  );
}
